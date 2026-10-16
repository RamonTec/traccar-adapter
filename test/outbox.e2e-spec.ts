import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { JetStreamManager } from '@nats-io/jetstream';
import type { NatsConnection } from '@nats-io/transport-node';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { Logger } from 'nestjs-pino';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import type { AppConfig } from '../src/shared/infrastructure/config/app-config.js';
import { configureHttp } from '../src/shared/infrastructure/http/configure-http.js';
import { NatsConnectionManager } from '../src/shared/infrastructure/nats/nats-connection.manager.js';
import {
  DEADLETTER_STREAM,
  EVENTS_STREAM,
  SUBJECTS,
} from '../src/shared/infrastructure/nats/stream-definitions.js';
import { OutboxDrainer } from '../src/shared/infrastructure/outbox/outbox.drainer.js';
import { SqliteOutboxStore } from '../src/shared/infrastructure/outbox/sqlite-outbox.store.js';
import {
  createFakeTraccar,
  type FakeTraccarServer,
} from './support/fake-traccar.js';
import {
  connectTestNats,
  deleteStreamIfExists,
  NATS_TEST_URL,
} from './support/nats.js';
import { checkStreamsContract } from './support/event-contract.js';
import { TEST_ENV, testConfig } from './support/test-env.js';

const TOKEN = TEST_ENV.WEBHOOK_TOKEN!;
const NATS_DOWN = 'nats://127.0.0.1:1';
const positionText = readFileSync(
  new URL('./fixtures/traccar/position.json', import.meta.url),
  'utf8',
);

function positionAt(fixTime: string): { body: string; id: string } {
  const payload = JSON.parse(positionText) as {
    device: { id: number };
    position: { fixTime: string };
  };
  payload.position.fixTime = fixTime;
  return {
    body: JSON.stringify(payload),
    id: `traccar-position-${payload.device.id}-${Date.parse(fixTime)}`,
  };
}

async function resetLoggerState(): Promise<void> {
  const url = new URL('./rootLogger.js', import.meta.resolve('nestjs-pino'));
  const { resetRootLogger } = (await import(url.href)) as {
    resetRootLogger: () => void;
  };
  resetRootLogger();
}

describe('Delivery outbox (e2e)', () => {
  let nc: NatsConnection;
  let jsm: JetStreamManager;
  let dir: string;
  let app: NestExpressApplication | undefined;
  let traccar: FakeTraccarServer;

  beforeAll(async () => {
    ({ nc, jsm } = await connectTestNats());
  });

  afterAll(async () => {
    await nc?.close();
  });

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'outbox-e2e-'));
    // Readiness also checks Traccar: a reachable fake isolates the NATS/outbox checks.
    traccar = await createFakeTraccar();
    await deleteStreamIfExists(jsm, EVENTS_STREAM);
    await deleteStreamIfExists(jsm, DEADLETTER_STREAM);
  });

  afterEach(async () => {
    expect(await checkStreamsContract(jsm)).toEqual([]);
    await app?.close();
    app = undefined;
    await traccar.close();
    rmSync(dir, { recursive: true, force: true });
    await resetLoggerState();
  });

  async function start(
    servers: string[],
    outbox: Partial<AppConfig['outbox']> = {},
  ): Promise<NestExpressApplication> {
    await resetLoggerState();
    const config = testConfig({
      logLevel: 'error',
      traccar: { baseUrl: traccar.url },
      nats: { servers },
      outbox: { path: join(dir, 'outbox.db'), ...outbox },
    });
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule.register(config)],
    }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({
      bufferLogs: true,
      bodyParser: false,
    });
    app.useLogger(app.get(Logger));
    configureHttp(app, config);
    await app.init();
    return app;
  }

  async function waitReady(): Promise<void> {
    const manager = app!.get(NatsConnectionManager);
    await vi.waitFor(() => expect(manager.isReady()).toBe(true), {
      timeout: 5000,
    });
  }

  function post(kind: 'positions' | 'events', body: string) {
    return request(app!.getHttpServer())
      .post(`/webhooks/traccar/${kind}`)
      .set('authorization', `Bearer ${TOKEN}`)
      .set('content-type', 'application/json')
      .send(body);
  }

  async function messageIds(stream: string, count: number): Promise<string[]> {
    const ids: string[] = [];
    for (let seq = 1; seq <= count; seq += 1) {
      const msg = await jsm.streams.getMessage(stream, { seq });
      ids.push(msg!.header!.get('Nats-Msg-Id'));
    }
    return ids;
  }

  it('AC-1/AC-2/AC-12: NATS down → 200 buffered and still ready with the pending count', async () => {
    await start([NATS_DOWN]);

    await post('positions', positionAt('2026-10-15T10:00:00.000Z').body).expect(
      200,
      { outcome: 'buffered' },
    );
    await post('positions', '{"position":').expect(200, {
      outcome: 'buffered',
    });

    const ready = await request(app!.getHttpServer())
      .get('/health/ready')
      .expect(200);
    expect(ready.body).toMatchObject({
      status: 'ok',
      checks: { traccar: 'ok', nats: 'down', outbox: 'ok' },
      outbox: { pending: 2 },
    });
  });

  it('AC-5/AC-8: after a restart with NATS back, everything is delivered once and in order', async () => {
    const first = positionAt('2026-10-15T10:00:00.000Z');
    const second = positionAt('2026-10-15T10:00:05.000Z');
    await start([NATS_DOWN]);
    await post('positions', first.body).expect(200, { outcome: 'buffered' });
    await post('positions', '{"position":').expect(200, {
      outcome: 'buffered',
    });
    await post('positions', second.body).expect(200, { outcome: 'buffered' });
    await app!.close();
    app = undefined;

    await start([NATS_TEST_URL]);
    await waitReady();

    const store = app!.get(SqliteOutboxStore, { strict: false });
    await vi.waitFor(() => expect(store.stats().pending).toBe(0), {
      timeout: 10_000,
    });
    expect(await messageIds(EVENTS_STREAM, 2)).toEqual([first.id, second.id]);
    expect((await jsm.streams.info(EVENTS_STREAM)).state.messages).toBe(2);
    const deadLetter = await jsm.streams.getMessage(DEADLETTER_STREAM, {
      last_by_subj: SUBJECTS.deadLetter,
    });
    expect(deadLetter?.json()).toMatchObject({
      reason: 'INVALID_JSON',
      rawPayload: '{"position":',
    });

    const ready = await request(app!.getHttpServer()).get('/health/ready');
    expect(ready.body.outbox).toEqual({ pending: 0, oldestAgeMs: null });
  });

  it('AC-9: re-sending a pending message JetStream already has creates no duplicate', async () => {
    const position = positionAt('2026-10-15T11:00:00.000Z');
    await start([NATS_TEST_URL]);
    await waitReady();
    await post('positions', position.body).expect(200, {
      outcome: 'published',
    });
    const published = await jsm.streams.getMessage(EVENTS_STREAM, {
      last_by_subj: SUBJECTS.position,
    });

    const store = app!.get(SqliteOutboxStore, { strict: false });
    store.append({
      subject: SUBJECTS.position,
      msgId: position.id,
      correlationId: undefined,
      body: published!.string(),
    });
    app!.get(OutboxDrainer, { strict: false }).kick();

    await vi.waitFor(() => expect(store.stats().pending).toBe(0));
    expect((await jsm.streams.info(EVENTS_STREAM)).state.messages).toBe(1);
  });

  it('AC-3/AC-4: outbox full with NATS down → 503', async () => {
    await start([NATS_DOWN], { maxBytes: 1_048_576 });
    app!.get(SqliteOutboxStore, { strict: false }).append({
      subject: SUBJECTS.position,
      msgId: 'filler',
      correlationId: undefined,
      // Leaves 10 bytes: any real message overflows the outbox.
      body: 'x'.repeat(1_048_576 - 10),
    });

    const res = await post(
      'positions',
      positionAt('2026-10-15T12:00:00.000Z').body,
    ).expect(503);

    expect(res.body).toMatchObject({ code: 'UPSTREAM_UNAVAILABLE' });
  });
});
