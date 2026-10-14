import {
  Controller,
  Get,
  INestApplication,
  InternalServerErrorException,
  Logger as NestLogger,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Logger } from 'nestjs-pino';
import request from 'supertest';
import type { AppConfig } from '../config/app-config.js';
import { LoggingModule } from './logging.module.js';
import {
  createLogCapture,
  type LogCapture,
} from '../../../../test/support/log-capture.js';
import { testConfig } from '../../../../test/support/test-env.js';

const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO_8601_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

@Controller()
class DummyController {
  private readonly logger = new NestLogger('Dummy');

  @Get('ok')
  ok() {
    this.logger.log('hello');
    return { ok: true };
  }

  @Get('boom')
  boom() {
    throw new InternalServerErrorException('boom failure');
  }

  @Get('health')
  health() {
    return { status: 'pass' };
  }
}

async function createTestApp(
  config: AppConfig,
  capture: LogCapture,
): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [LoggingModule.forRoot(config, capture.stream)],
    controllers: [DummyController],
  }).compile();

  const app = moduleRef.createNestApplication({ bufferLogs: true });
  app.useLogger(app.get(Logger));
  await app.init();
  return app;
}

async function resetLoggerState(): Promise<void> {
  const url = new URL('./rootLogger.js', import.meta.resolve('nestjs-pino'));
  const { resetRootLogger } = (await import(url.href)) as {
    resetRootLogger: () => void;
  };
  resetRootLogger();
}

describe('LoggingModule (integration)', () => {
  let app: INestApplication;
  let logs: LogCapture;

  beforeEach(async () => {
    await resetLoggerState();
    logs = createLogCapture();
    app = await createTestApp(testConfig({ logLevel: 'debug' }), logs);
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
    await resetLoggerState();
  });

  it('AC-4: log hello has ISO-8601 time, info level, service traccar-adapter, context Dummy, msg hello and correlationId', async () => {
    await request(app.getHttpServer()).get('/ok').expect(200);

    await vi.waitFor(() => {
      const helloLine = logs.lines().find((l) => l.msg === 'hello');
      expect(helloLine).toBeDefined();
      expect(helloLine?.time).toMatch(ISO_8601_REGEX);
      expect(helloLine?.level).toBe('info');
      expect(helloLine?.service).toBe('traccar-adapter');
      expect(helloLine?.context).toBe('Dummy');
      expect(helloLine?.correlationId).toMatch(UUID_V4_REGEX);
    });
  });

  it('AC-5: echoes valid correlation id header and all lines of that request share it', async () => {
    const res = await request(app.getHttpServer())
      .get('/ok')
      .set('x-correlation-id', 'abc-1')
      .expect(200);

    expect(res.headers['x-correlation-id']).toBe('abc-1');

    await vi.waitFor(() => {
      const matchingLines = logs
        .lines()
        .filter((l) => l.correlationId === 'abc-1');
      // At least the manual logger.log('hello') and the pino-http request completion log
      expect(matchingLines.length).toBeGreaterThanOrEqual(2);
      expect(matchingLines.some((l) => l.msg === 'hello')).toBe(true);
      expect(
        matchingLines.some((l) => (l.req as { url?: string })?.url === '/ok'),
      ).toBe(true);
    });
  });

  it('AC-6: generates UUID v4 when header is missing or invalid, matching correlationId in logs', async () => {
    const resMissing = await request(app.getHttpServer())
      .get('/ok')
      .expect(200);
    const missingId = resMissing.headers['x-correlation-id'];
    expect(missingId).toMatch(UUID_V4_REGEX);

    await vi.waitFor(() => {
      const lines = logs.lines().filter((l) => l.correlationId === missingId);
      expect(lines.length).toBeGreaterThanOrEqual(2);
    });

    const resInvalid = await request(app.getHttpServer())
      .get('/ok')
      .set('x-correlation-id', 'bad value')
      .expect(200);
    const invalidFallbackId = resInvalid.headers['x-correlation-id'];
    expect(invalidFallbackId).toMatch(UUID_V4_REGEX);
    expect(invalidFallbackId).not.toBe('bad value');

    await vi.waitFor(() => {
      const lines = logs
        .lines()
        .filter((l) => l.correlationId === invalidFallbackId);
      expect(lines.length).toBeGreaterThanOrEqual(2);
    });
  });

  it('AC-7: request completion log contains req.method, req.url, res.statusCode, numeric responseTime, context HTTP, and appropriate level', async () => {
    await request(app.getHttpServer()).get('/ok').expect(200);
    await request(app.getHttpServer()).get('/health').expect(200);
    await request(app.getHttpServer()).get('/non-existent').expect(404);
    await request(app.getHttpServer()).get('/boom').expect(500);

    await vi.waitFor(() => {
      const httpLines = logs.lines().filter((l) => l.context === 'HTTP');

      const okLine = httpLines.find(
        (l) => (l.req as { url?: string })?.url === '/ok',
      );
      expect(okLine).toBeDefined();
      expect(okLine?.level).toBe('info');
      expect((okLine?.req as { method?: string })?.method).toBe('GET');
      expect((okLine?.res as { statusCode?: number })?.statusCode).toBe(200);
      expect(typeof okLine?.responseTime).toBe('number');

      const healthLine = httpLines.find(
        (l) => (l.req as { url?: string })?.url === '/health',
      );
      expect(healthLine).toBeDefined();
      expect(healthLine?.level).toBe('debug');
      expect((healthLine?.req as { method?: string })?.method).toBe('GET');
      expect((healthLine?.res as { statusCode?: number })?.statusCode).toBe(
        200,
      );
      expect(typeof healthLine?.responseTime).toBe('number');

      const notFoundLine = httpLines.find(
        (l) => (l.req as { url?: string })?.url === '/non-existent',
      );
      expect(notFoundLine).toBeDefined();
      expect(notFoundLine?.level).toBe('warn');
      expect((notFoundLine?.req as { method?: string })?.method).toBe('GET');
      expect((notFoundLine?.res as { statusCode?: number })?.statusCode).toBe(
        404,
      );
      expect(typeof notFoundLine?.responseTime).toBe('number');

      const boomLine = httpLines.find(
        (l) => (l.req as { url?: string })?.url === '/boom',
      );
      expect(boomLine).toBeDefined();
      expect(boomLine?.level).toBe('error');
      expect((boomLine?.req as { method?: string })?.method).toBe('GET');
      expect((boomLine?.res as { statusCode?: number })?.statusCode).toBe(500);
      expect(typeof boomLine?.responseTime).toBe('number');
    });
  });

  it('AC-8: with logLevel warn, /ok produces no info lines while /boom produces error line', async () => {
    await app.close();
    await resetLoggerState();

    const warnLogs = createLogCapture();
    const warnApp = await createTestApp(
      testConfig({ logLevel: 'warn' }),
      warnLogs,
    );

    try {
      await request(warnApp.getHttpServer()).get('/ok').expect(200);
      expect(warnLogs.lines().filter((l) => l.level === 'info')).toHaveLength(
        0,
      );

      await request(warnApp.getHttpServer()).get('/boom').expect(500);

      await vi.waitFor(() => {
        const errorLines = warnLogs.lines().filter((l) => l.level === 'error');
        expect(errorLines.length).toBeGreaterThanOrEqual(1);
      });
    } finally {
      await warnApp.close();
    }
  });

  it('AC-15: redacts or excludes sensitive authorization and cookie headers', async () => {
    await request(app.getHttpServer())
      .get('/ok')
      .set('Authorization', 'Bearer s3cr3t')
      .set('Cookie', 'sid=s3cr3t')
      .expect(200);

    await vi.waitFor(() => {
      expect(logs.lines().length).toBeGreaterThan(0);
      const rawCaptured = JSON.stringify(logs.lines());
      expect(rawCaptured).not.toContain('s3cr3t');
    });
  });
});
