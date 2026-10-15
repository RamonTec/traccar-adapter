import type { JetStreamManager } from '@nats-io/jetstream';
import type { NatsConnection } from '@nats-io/transport-node';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Logger } from 'nestjs-pino';
import { AppModule } from '../src/app.module.js';
import { UpstreamUnavailableError } from '../src/shared/domain/upstream-unavailable.error.js';
import { JetStreamPublisher } from '../src/shared/infrastructure/nats/jetstream.publisher.js';
import { NatsConnectionManager } from '../src/shared/infrastructure/nats/nats-connection.manager.js';
import {
  EVENTS_STREAM,
  SUBJECTS,
} from '../src/shared/infrastructure/nats/stream-definitions.js';
import { createLogCapture, type LogCapture } from './support/log-capture.js';
import {
  connectTestNats,
  deleteStreamIfExists,
  NATS_TEST_URL,
} from './support/nats.js';
import { testConfig } from './support/test-env.js';

async function resetLoggerState(): Promise<void> {
  const url = new URL('./rootLogger.js', import.meta.resolve('nestjs-pino'));
  const { resetRootLogger } = (await import(url.href)) as {
    resetRootLogger: () => void;
  };
  resetRootLogger();
}

describe('JetStreamPublisher (e2e)', () => {
  let nc: NatsConnection;
  let jsm: JetStreamManager;
  let app: INestApplication | undefined;
  let logs: LogCapture;

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

  async function start(
    servers = [NATS_TEST_URL],
    publishTimeoutMs = 2000,
    waitReady = true,
  ): Promise<JetStreamPublisher> {
    await resetLoggerState();
    // Deleting (not purging) resets the dedup window; the app recreates the stream.
    await deleteStreamIfExists(jsm, EVENTS_STREAM);
    logs = createLogCapture();
    const moduleRef = await Test.createTestingModule({
      imports: [
        AppModule.register(
          testConfig({
            logLevel: 'debug',
            nats: { servers, publishTimeoutMs },
          }),
          logs.stream,
        ),
      ],
    }).compile();
    app = moduleRef.createNestApplication({ bufferLogs: true });
    app.useLogger(app.get(Logger));
    await app.init();
    if (waitReady) {
      const manager = app.get(NatsConnectionManager);
      await vi.waitFor(() => expect(manager.isReady()).toBe(true), {
        timeout: 5000,
      });
    }
    return app.get(JetStreamPublisher);
  }

  function publishLines(): Record<string, unknown>[] {
    return logs.lines().filter((l) => l.context === 'JetStreamPublisher');
  }

  it('AC-2: publishes the JSON payload with Nats-Msg-Id and x-correlation-id', async () => {
    const publisher = await start();
    const payload = { hello: 'world', n: 1 };

    const result = await publisher.publish(SUBJECTS.position, payload, {
      msgId: 'msg-1',
      correlationId: 'cid-9',
    });

    expect(result).toMatchObject({ stream: EVENTS_STREAM, duplicate: false });
    const msg = await jsm.streams.getMessage(EVENTS_STREAM, {
      last_by_subj: SUBJECTS.position,
    });
    expect(msg?.json()).toEqual(payload);
    expect(msg?.header?.get('Nats-Msg-Id')).toBe('msg-1');
    expect(msg?.header?.get('x-correlation-id')).toBe('cid-9');
  });

  it('AC-3: same msgId twice → duplicate, one message, debug log', async () => {
    const publisher = await start();

    await publisher.publish(SUBJECTS.position, { a: 1 }, { msgId: 'dup-1' });
    const second = await publisher.publish(
      SUBJECTS.position,
      { a: 1 },
      { msgId: 'dup-1' },
    );

    expect(second.duplicate).toBe(true);
    expect((await jsm.streams.info(EVENTS_STREAM)).state.messages).toBe(1);
    expect(publishLines()).toContainEqual(
      expect.objectContaining({
        level: 'debug',
        msgId: 'dup-1',
        duplicate: true,
      }),
    );
  });

  it('AC-4: not connected → UpstreamUnavailableError and error log', async () => {
    const publisher = await start(['nats://127.0.0.1:1'], 2000, false);

    await expect(
      publisher.publish(SUBJECTS.position, {}, { msgId: 'x' }),
    ).rejects.toBeInstanceOf(UpstreamUnavailableError);
    expect(publishLines()).toContainEqual(
      expect.objectContaining({
        level: 'error',
        subject: SUBJECTS.position,
        msgId: 'x',
        msg: 'JetStream publish failed',
      }),
    );
  });

  it('AC-4: subject without a stream and a 200 ms timeout → error in < 1 s', async () => {
    const publisher = await start([NATS_TEST_URL], 200);
    const startedAt = Date.now();

    await expect(
      publisher.publish('nada.que.ver', {}, { msgId: 'y' }),
    ).rejects.toBeInstanceOf(UpstreamUnavailableError);
    expect(Date.now() - startedAt).toBeLessThan(1000);
  });

  it('AC-8: success log has subject, msgId, duplicate, durationMs and no payload', async () => {
    const publisher = await start();

    await publisher.publish(
      SUBJECTS.position,
      { secret: 'payload-value' },
      { msgId: 'log-1' },
    );

    const line = publishLines().find((l) => l.msgId === 'log-1');
    expect(line).toMatchObject({
      level: 'info',
      subject: SUBJECTS.position,
      duplicate: false,
      durationMs: expect.any(Number),
    });
    expect(JSON.stringify(logs.lines())).not.toContain('payload-value');
  });
});
