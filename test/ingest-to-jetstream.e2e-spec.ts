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
  EVENTS_STREAM,
  SUBJECTS,
} from '../src/shared/infrastructure/nats/stream-definitions.js';
import {
  connectTestNats,
  deleteStreamIfExists,
  NATS_TEST_URL,
} from './support/nats.js';
import { checkStreamsContract } from './support/event-contract.js';
import { TEST_ENV, testConfig } from './support/test-env.js';

const TOKEN = TEST_ENV.WEBHOOK_TOKEN!;
const positionText = readFileSync(
  new URL('./fixtures/traccar/position.json', import.meta.url),
  'utf8',
);
const position = JSON.parse(positionText) as {
  device: { id: number };
  position: { fixTime: string };
};
const eventText = readFileSync(
  new URL('./fixtures/traccar/event-alarm.json', import.meta.url),
  'utf8',
);
const expectedId = `traccar-position-${position.device.id}-${Date.parse(position.position.fixTime)}`;

async function resetLoggerState(): Promise<void> {
  const url = new URL('./rootLogger.js', import.meta.resolve('nestjs-pino'));
  const { resetRootLogger } = (await import(url.href)) as {
    resetRootLogger: () => void;
  };
  resetRootLogger();
}

describe('Traccar webhook → JetStream (e2e)', () => {
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
    expect(await checkStreamsContract(jsm)).toEqual([]);
    await app?.close();
    app = undefined;
    await resetLoggerState();
  });

  async function start(servers: string[], waitReady: boolean): Promise<void> {
    await resetLoggerState();
    // Deleting (not purging) resets the dedup window; the app recreates the stream.
    await deleteStreamIfExists(jsm, EVENTS_STREAM);
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

  function postPosition(body = positionText) {
    return request(app!.getHttpServer())
      .post('/webhooks/traccar/positions')
      .set('authorization', `Bearer ${TOKEN}`)
      .set('content-type', 'application/json')
      .send(body);
  }

  it('AC-2b: a forwarded position lands in TELEMETRY_EVENTS as an ADR-0004 envelope', async () => {
    await start([NATS_TEST_URL], true);

    await postPosition().expect(200, { outcome: 'published' });

    const msg = await jsm.streams.getMessage(EVENTS_STREAM, {
      last_by_subj: SUBJECTS.position,
    });
    expect(msg?.header?.get('Nats-Msg-Id')).toBe(expectedId);
    expect(msg?.json()).toMatchObject({
      id: expectedId,
      type: 'position.reported',
      version: 1,
      data: { speedKmh: expect.any(Number) },
    });
  });

  it('016 AC-7: a forwarded device event lands in TELEMETRY_EVENTS and matches the AsyncAPI', async () => {
    await start([NATS_TEST_URL], true);

    await request(app!.getHttpServer())
      .post('/webhooks/traccar/events')
      .set('authorization', `Bearer ${TOKEN}`)
      .set('content-type', 'application/json')
      .send(eventText)
      .expect(200, { outcome: 'published' });

    const msg = await jsm.streams.getMessage(EVENTS_STREAM, {
      last_by_subj: SUBJECTS.deviceEvent,
    });
    expect(msg?.json()).toMatchObject({ type: 'device.event', version: 1 });
    // The AsyncAPI check itself runs on every stored message in afterEach.
  });

  it('AC-3: the same POST twice (Traccar retry) → both 200, one message', async () => {
    await start([NATS_TEST_URL], true);
    const retried = JSON.parse(positionText) as {
      position: { fixTime: string };
    };
    retried.position.fixTime = new Date().toISOString();
    const body = JSON.stringify(retried);

    await postPosition(body).expect(200);
    await postPosition(body).expect(200);

    expect((await jsm.streams.info(EVENTS_STREAM)).state.messages).toBe(1);
  });

  it('NATS down → 200 buffered: kept in the outbox until JetStream is back (013)', async () => {
    await start(['nats://127.0.0.1:1'], false);

    await postPosition().expect(200, { outcome: 'buffered' });
  });
});
