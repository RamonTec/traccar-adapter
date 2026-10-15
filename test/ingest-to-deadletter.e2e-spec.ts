import { readFileSync } from 'node:fs';
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
  SUBJECTS,
} from '../src/shared/infrastructure/nats/stream-definitions.js';
import {
  connectTestNats,
  deleteStreamIfExists,
  NATS_TEST_URL,
} from './support/nats.js';
import { TEST_ENV, testConfig } from './support/test-env.js';

const TOKEN = TEST_ENV.WEBHOOK_TOKEN!;
const INVALID = '{"position":';

async function resetLoggerState(): Promise<void> {
  const url = new URL('./rootLogger.js', import.meta.resolve('nestjs-pino'));
  const { resetRootLogger } = (await import(url.href)) as {
    resetRootLogger: () => void;
  };
  resetRootLogger();
}

describe('Traccar webhook → dead-letter (e2e)', () => {
  let nc: NatsConnection;
  let jsm: JetStreamManager;
  let app: NestExpressApplication | undefined;

  beforeAll(async () => {
    ({ nc, jsm } = await connectTestNats());
  });

  afterAll(async () => {
    await nc?.close();
  });

  afterEach(async () => {
    await app?.close();
    app = undefined;
    await resetLoggerState();
  });

  async function start(servers: string[], waitReady: boolean): Promise<void> {
    await resetLoggerState();
    // Deleting (not purging) resets the dedup window; the app recreates the stream.
    await deleteStreamIfExists(jsm, DEADLETTER_STREAM);
    const config: AppConfig = testConfig({
      logLevel: 'error',
      nats: { servers },
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
    if (waitReady) {
      const manager = app.get(NatsConnectionManager);
      await vi.waitFor(() => expect(manager.isReady()).toBe(true), {
        timeout: 5000,
      });
    }
  }

  function post(body: string) {
    return request(app!.getHttpServer())
      .post('/webhooks/traccar/positions')
      .set('authorization', `Bearer ${TOKEN}`)
      .set('content-type', 'application/json')
      .set('x-correlation-id', 'cid-dl-1')
      .send(body);
  }

  async function lastDeadLetter() {
    return jsm.streams.getMessage(DEADLETTER_STREAM, {
      last_by_subj: SUBJECTS.deadLetter,
    });
  }

  it('AC-1 + AC-3: invalid JSON is persisted with its exact bytes', async () => {
    await start([NATS_TEST_URL], true);

    await post(INVALID).expect(200, { outcome: 'deadlettered' });

    const msg = await lastDeadLetter();
    const body = msg?.json<Record<string, unknown>>();
    expect(body).toMatchObject({
      source: 'traccar',
      kind: 'position',
      reason: 'INVALID_JSON',
      correlationId: 'cid-dl-1',
      rawPayload: INVALID,
      rawEncoding: 'utf8',
      truncated: false,
    });
    expect(msg?.header?.get('Nats-Msg-Id')).toBe(body?.id);
  });

  it('AC-2: the same invalid body twice → one message', async () => {
    await start([NATS_TEST_URL], true);

    await post(INVALID).expect(200);
    await post(INVALID).expect(200);

    expect((await jsm.streams.info(DEADLETTER_STREAM)).state.messages).toBe(1);
  });

  it('MISSING_GROUP end to end: position-no-group fixture → dead-letter', async () => {
    await start([NATS_TEST_URL], true);
    const fixture = readFileSync(
      new URL('./fixtures/traccar/position-no-group.json', import.meta.url),
      'utf8',
    );

    await post(fixture).expect(200, { outcome: 'deadlettered' });

    expect((await lastDeadLetter())?.json()).toMatchObject({
      reason: 'MISSING_GROUP',
      detail: 'device.groupId: missing',
      rawPayload: fixture,
    });
  });

  it('AC-5: NATS down → invalid body answers 503 (nothing lost silently)', async () => {
    await start(['nats://127.0.0.1:1'], false);

    await post(INVALID).expect(503);
  });
});
