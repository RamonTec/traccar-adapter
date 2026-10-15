import type { JetStreamManager } from '@nats-io/jetstream';
import type { NatsConnection } from '@nats-io/transport-node';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Logger } from 'nestjs-pino';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import type { AppConfig } from '../src/shared/infrastructure/config/app-config.js';
import { NatsConnectionManager } from '../src/shared/infrastructure/nats/nats-connection.manager.js';
import {
  DEADLETTER_STREAM,
  EVENTS_STREAM,
  SUBJECTS,
} from '../src/shared/infrastructure/nats/stream-definitions.js';
import {
  createFakeTraccar,
  type FakeTraccarServer,
} from './support/fake-traccar.js';
import { createLogCapture, type LogCapture } from './support/log-capture.js';
import {
  connectTestNats,
  deleteStreamIfExists,
  NATS_TEST_URL,
} from './support/nats.js';
import { testConfig } from './support/test-env.js';

const DAY_NANOS = 86_400 * 1e9;
const CLOSED_PORT = 'nats://127.0.0.1:1';

async function resetLoggerState(): Promise<void> {
  const url = new URL('./rootLogger.js', import.meta.resolve('nestjs-pino'));
  const { resetRootLogger } = (await import(url.href)) as {
    resetRootLogger: () => void;
  };
  resetRootLogger();
}

describe('NatsConnectionManager (e2e)', () => {
  let nc: NatsConnection;
  let jsm: JetStreamManager;
  let app: INestApplication | undefined;
  let logs: LogCapture;
  let traccar: FakeTraccarServer;

  beforeAll(async () => {
    ({ nc, jsm } = await connectTestNats());
  });

  afterAll(async () => {
    await nc?.close();
  });

  beforeEach(async () => {
    await deleteStreamIfExists(jsm, EVENTS_STREAM);
    await deleteStreamIfExists(jsm, DEADLETTER_STREAM);
    traccar = await createFakeTraccar();
  });

  afterEach(async () => {
    await app?.close();
    app = undefined;
    await traccar.close();
    await resetLoggerState();
  });

  async function start(servers: string[]): Promise<INestApplication> {
    await resetLoggerState();
    logs = createLogCapture();
    const config: AppConfig = testConfig({
      logLevel: 'debug',
      traccar: { baseUrl: traccar.url },
      nats: { servers },
    });
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule.register(config, logs.stream)],
    }).compile();
    app = moduleRef.createNestApplication({ bufferLogs: true });
    app.useLogger(app.get(Logger));
    await app.init();
    return app;
  }

  function manager(): NatsConnectionManager {
    return app!.get(NatsConnectionManager);
  }

  it('AC-1a: creates both streams with the configured settings', async () => {
    await start([NATS_TEST_URL]);
    await vi.waitFor(() => expect(manager().isReady()).toBe(true), {
      timeout: 5000,
    });

    const events = (await jsm.streams.info(EVENTS_STREAM)).config;
    const deadLetter = (await jsm.streams.info(DEADLETTER_STREAM)).config;

    expect(events).toMatchObject({
      subjects: [SUBJECTS.position, SUBJECTS.deviceEvent],
      storage: 'file',
      retention: 'limits',
      max_age: 7 * DAY_NANOS,
      duplicate_window: 600 * 1e9,
    });
    expect(deadLetter).toMatchObject({
      subjects: [SUBJECTS.deadLetter],
      storage: 'file',
      max_age: 30 * DAY_NANOS,
      duplicate_window: 600 * 1e9,
    });
  });

  it('AC-1b: updates an existing stream with a different max_age', async () => {
    await jsm.streams.add({
      name: EVENTS_STREAM,
      subjects: [SUBJECTS.position, SUBJECTS.deviceEvent],
      max_age: DAY_NANOS,
    });

    await start([NATS_TEST_URL]);
    await vi.waitFor(() => expect(manager().isReady()).toBe(true), {
      timeout: 5000,
    });

    expect((await jsm.streams.info(EVENTS_STREAM)).config.max_age).toBe(
      7 * DAY_NANOS,
    );
    expect(logs.lines()).toContainEqual(
      expect.objectContaining({ name: EVENTS_STREAM, action: 'updated' }),
    );
  });

  it('AC-5 (+013 AC-12): NATS unreachable → app starts and stays ready with nats down while the outbox accepts writes', async () => {
    await start([CLOSED_PORT]);

    await request(app!.getHttpServer()).get('/health').expect(200);
    const res = await request(app!.getHttpServer())
      .get('/health/ready')
      .expect(200);

    expect(res.body).toEqual({
      status: 'ok',
      checks: { nats: 'down', traccar: 'ok', outbox: 'ok' },
      outbox: { pending: 0, oldestAgeMs: null },
    });
  });

  it('AC-6: NATS available → /health/ready reports nats ok', async () => {
    await start([NATS_TEST_URL]);

    await vi.waitFor(
      async () => {
        const res = await request(app!.getHttpServer()).get('/health/ready');
        expect(res.status).toBe(200);
        expect(res.body.checks).toEqual({
          traccar: 'ok',
          nats: 'ok',
          outbox: 'ok',
        });
      },
      { timeout: 5000, interval: 100 },
    );
  });

  it('AC-7b: unreachable NATS → close() is fast and stops retrying', async () => {
    await start([CLOSED_PORT]);
    const attempts = () =>
      logs.lines().filter((l) => l.msg === 'NATS not reachable, retrying')
        .length;
    await vi.waitFor(() => expect(attempts()).toBeGreaterThan(0));

    const startedAt = Date.now();
    await app!.close();
    const closeMs = Date.now() - startedAt;
    app = undefined;
    const before = attempts();
    await new Promise((r) => setTimeout(r, 1500));

    expect(closeMs).toBeLessThan(1000);
    expect(attempts()).toBe(before);
  });

  it('AC-7: close() drains the NATS connection', async () => {
    await start([NATS_TEST_URL]);
    await vi.waitFor(() => expect(manager().isReady()).toBe(true), {
      timeout: 5000,
    });
    const conn = manager() as unknown as { nc: NatsConnection };

    await app!.close();
    app = undefined;

    expect(conn.nc.isClosed()).toBe(true);
  });
});
