import { readFileSync } from 'node:fs';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { Logger } from 'nestjs-pino';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { FakeDeadLetterPublisher } from '../src/modules/ingestion/application/ports/__fakes__/dead-letter-publisher.fake.js';
import { FakeEventPublisher } from '../src/modules/ingestion/application/ports/__fakes__/event-publisher.fake.js';
import { UpstreamUnavailableError } from '../src/shared/domain/upstream-unavailable.error.js';
import type { AppConfig } from '../src/shared/infrastructure/config/app-config.js';
import { configureHttp } from '../src/shared/infrastructure/http/configure-http.js';
import { createLogCapture, type LogCapture } from './support/log-capture.js';
import { TEST_ENV, testConfig } from './support/test-env.js';

const TOKEN = TEST_ENV.WEBHOOK_TOKEN!;
const positionFixture = readFileSync(
  new URL('./fixtures/traccar/position.json', import.meta.url),
  'utf8',
);
const eventFixture = readFileSync(
  new URL('./fixtures/traccar/event-alarm.json', import.meta.url),
  'utf8',
);

async function resetLoggerState(): Promise<void> {
  const url = new URL('./rootLogger.js', import.meta.resolve('nestjs-pino'));
  const { resetRootLogger } = (await import(url.href)) as {
    resetRootLogger: () => void;
  };
  resetRootLogger();
}

describe('Traccar webhook (e2e)', () => {
  let app: NestExpressApplication;
  let logs: LogCapture;
  let events: FakeEventPublisher;
  let deadLetters: FakeDeadLetterPublisher;

  async function start(
    config: AppConfig = testConfig({ logLevel: 'info' }),
    withFakes = true,
  ): Promise<void> {
    await resetLoggerState();
    logs = createLogCapture();
    events = new FakeEventPublisher();
    deadLetters = new FakeDeadLetterPublisher();
    const moduleRef = await Test.createTestingModule({
      imports: [
        AppModule.register(
          config,
          logs.stream,
          withFakes
            ? { eventPublisher: events, deadLetterPublisher: deadLetters }
            : undefined,
        ),
      ],
    }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({
      bufferLogs: true,
      bodyParser: false,
    });
    app.useLogger(app.get(Logger));
    configureHttp(app, config);
    await app.init();
  }

  afterEach(async () => {
    if (app) await app.close();
    await resetLoggerState();
  });

  function post(path: string, body: string, token: string | null = TOKEN) {
    const req = request(app.getHttpServer())
      .post(`/webhooks/traccar/${path}`)
      .set('content-type', 'application/json');
    return (token ? req.set('authorization', `Bearer ${token}`) : req).send(
      body,
    );
  }

  it('AC-1: missing or wrong token → 401 and nothing published', async () => {
    await start();

    await post('positions', positionFixture, null).expect(401);
    await post('positions', positionFixture, 'wrong-token-0123456789').expect(
      401,
    );

    expect(events.published).toEqual([]);
    expect(deadLetters.published).toEqual([]);
  });

  it('AC-2 + AC-9: valid position without JWT → 200 and one event published', async () => {
    await start();

    const res = await post('positions', positionFixture).expect(200);

    expect(res.body).toEqual({ outcome: 'published' });
    expect(events.published).toHaveLength(1);
    expect(events.published[0]!.type).toBe('position.reported');
  });

  it('AC-9: /events uses kind event', async () => {
    await start();

    await post('events', eventFixture).expect(200);

    expect(events.published[0]!.type).toBe('device.event');
  });

  it('AC-3: invalid JSON → 200 and dead-letter with the exact bytes', async () => {
    await start();
    const raw = '{"position":';

    const res = await post('positions', raw).expect(200);

    expect(res.body).toEqual({ outcome: 'deadlettered' });
    expect(deadLetters.published).toHaveLength(1);
    expect(deadLetters.published[0]).toMatchObject({
      kind: 'position',
      reason: 'INVALID_JSON',
    });
    expect(
      Buffer.compare(
        Buffer.from(deadLetters.published[0]!.rawBody),
        Buffer.from(raw),
      ),
    ).toBe(0);
  });

  it('AC-5: body over WEBHOOK_MAX_BODY_BYTES → 200 PAYLOAD_TOO_LARGE', async () => {
    await start(testConfig({ webhook: { maxBodyBytes: 1024 } }));

    await post('positions', 'a'.repeat(5000)).expect(200);

    expect(deadLetters.published[0]?.reason).toBe('PAYLOAD_TOO_LARGE');
  });

  it('AC-6: event publisher failure → 503 UPSTREAM_UNAVAILABLE', async () => {
    await start();
    events.failWith = new UpstreamUnavailableError('nats');

    const res = await post('positions', positionFixture).expect(503);

    expect(res.body).toMatchObject({ code: 'UPSTREAM_UNAVAILABLE' });
    expect(deadLetters.published).toEqual([]);
  });

  it('AC-7: dead-letter failure on invalid JSON → 503', async () => {
    await start();
    deadLetters.failWith = new UpstreamUnavailableError('nats');

    await post('positions', '{"position":').expect(503);
  });

  it('without publisher overrides a valid payload → 503 (placeholders)', async () => {
    await start(testConfig({ logLevel: 'info' }), false);

    await post('positions', positionFixture).expect(503);
  });

  it('AC-10: logs kind, outcome and durationMs; never the token or the body', async () => {
    await start();

    await post('positions', positionFixture).expect(200);
    await post('positions', '{"position":').expect(200);
    await post('positions', positionFixture, 'wrong-token-0123456789').expect(
      401,
    );

    const ingestLines = logs.lines().filter((l) => l.msg === 'webhook.ingest');
    expect(ingestLines).toEqual([
      expect.objectContaining({
        kind: 'position',
        outcome: 'published',
        eventId: events.published[0]!.id,
        durationMs: expect.any(Number),
      }),
      expect.objectContaining({
        kind: 'position',
        outcome: 'deadlettered',
        reason: 'INVALID_JSON',
        durationMs: expect.any(Number),
      }),
    ]);

    const all = JSON.stringify(logs.lines());
    expect(all).not.toContain(TOKEN);
    expect(all).not.toContain('wrong-token-0123456789');
    expect(all).not.toContain('"latitude"');
    expect(all).not.toContain('{\\"position\\":');
  });
});
