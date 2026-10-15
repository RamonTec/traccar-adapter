import { spawn, type ChildProcess } from 'node:child_process';
import net from 'node:net';
import {
  createFakeTraccar,
  type FakeTraccarServer,
} from './support/fake-traccar.js';
import { Controller, Get } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from 'nestjs-pino';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';
import {
  Actor,
  RequireRole,
} from './../src/shared/infrastructure/auth/auth.decorators.js';
import {
  InvalidTokenError,
  type JwtVerifier,
  type VerifiedPrincipal,
} from './../src/shared/infrastructure/auth/jwt-verifier.js';
import {
  APP_CONFIG,
  type AppConfig,
} from './../src/shared/infrastructure/config/app-config.js';
import { configureHttp } from './../src/shared/infrastructure/http/configure-http.js';
import { NatsConnectionManager } from './../src/shared/infrastructure/nats/nats-connection.manager.js';
import { createLogCapture, type LogCapture } from './support/log-capture.js';
import { TEST_ENV, testConfig } from './support/test-env.js';

async function resetLoggerState(): Promise<void> {
  const url = new URL('./rootLogger.js', import.meta.resolve('nestjs-pino'));
  const { resetRootLogger } = (await import(url.href)) as {
    resetRootLogger: () => void;
  };
  resetRootLogger();
}

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') {
        server.close(() => reject(new Error('Invalid address')));
        return;
      }
      const port = addr.port;
      server.close((err) => {
        if (err) reject(err);
        else resolve(port);
      });
    });
    server.on('error', reject);
  });
}

function startApp(env: Record<string, string>): ChildProcess {
  return spawn('node', ['dist/main.js'], {
    env: {
      ...process.env,
      ...TEST_ENV,
      ...env,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

async function waitForHealth(
  port: number,
  timeoutMs = 5000,
): Promise<Response> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`http://localhost:${port}/health`);
      if (res.ok) {
        return res;
      }
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  throw new Error(`Timed out waiting for health check on port ${port}`);
}

describe('Foundation (e2e)', () => {
  describe('In-process', () => {
    let app: NestExpressApplication;

    beforeEach(async () => {
      await resetLoggerState();
      const moduleFixture: TestingModule = await Test.createTestingModule({
        imports: [
          AppModule.register(testConfig({ port: 0, logLevel: 'error' })),
        ],
      }).compile();

      app = moduleFixture.createNestApplication<NestExpressApplication>({
        bufferLogs: true,
        bodyParser: false,
      });
      app.useLogger(app.get(Logger));
      configureHttp(app, app.get<AppConfig>(APP_CONFIG));
      await app.init();
    });

    afterEach(async () => {
      if (app) {
        await app.close();
      }
      await resetLoggerState();
    });

    it('AC-12: GET /health returns 200 { status: "ok" }', async () => {
      const res = await request(app.getHttpServer()).get('/health').expect(200);

      expect(res.body).toEqual({ status: 'ok' });
    });

    it('AC-14/11: GET / returns 404 with standard ErrorBody', async () => {
      const res = await request(app.getHttpServer()).get('/').expect(404);

      expect(res.body).toEqual({
        code: 'NOT_FOUND',
        message: 'Resource not found',
        correlationId: expect.any(String),
      });
    });

    it('AC-5: echoes x-correlation-id header and reflects in error body', async () => {
      const res = await request(app.getHttpServer())
        .get('/')
        .set('x-correlation-id', 'e2e-1')
        .expect(404);

      expect(res.headers['x-correlation-id']).toBe('e2e-1');
      expect(res.body).toEqual({
        code: 'NOT_FOUND',
        message: 'Resource not found',
        correlationId: 'e2e-1',
      });
    });
  });

  describe('Service auth (in-process)', () => {
    const TOKEN = 'e2e-secret-token-value';
    let app: NestExpressApplication;
    let capture: LogCapture;

    @Controller('protected-test')
    class ProtectedTestController {
      @Get()
      @RequireRole('groups:write')
      get(@Actor() actor: string | undefined): { actor: string | undefined } {
        return { actor };
      }
    }

    const fakeVerifier: Pick<JwtVerifier, 'verify'> = {
      verify: (token: string): Promise<VerifiedPrincipal> =>
        token === TOKEN
          ? Promise.resolve({ actor: 'core-service', roles: ['groups:write'] })
          : Promise.reject(new InvalidTokenError('SIGNATURE')),
    };

    beforeEach(async () => {
      await resetLoggerState();
      capture = createLogCapture();
      const moduleFixture: TestingModule = await Test.createTestingModule({
        imports: [
          AppModule.register(
            testConfig({ port: 0, logLevel: 'debug' }),
            capture.stream,
            { jwtVerifier: fakeVerifier },
          ),
        ],
        controllers: [ProtectedTestController],
      }).compile();

      app = moduleFixture.createNestApplication<NestExpressApplication>({
        bufferLogs: true,
        bodyParser: false,
      });
      app.useLogger(app.get(Logger));
      configureHttp(app, app.get<AppConfig>(APP_CONFIG));
      await app.init();
    });

    afterEach(async () => {
      if (app) {
        await app.close();
      }
      await resetLoggerState();
    });

    const requestLog = (url: string): Record<string, unknown> | undefined =>
      capture
        .lines()
        .find(
          (l) =>
            l.context === 'HTTP' &&
            (l.req as { url?: string } | undefined)?.url === url,
        );

    it('AC-7: GET /health without token returns 200 and logs no actor', async () => {
      const res = await request(app.getHttpServer()).get('/health').expect(200);

      expect(res.body).toEqual({ status: 'ok' });
      await vi.waitFor(() => expect(requestLog('/health')).toBeDefined());
      expect(requestLog('/health')).not.toHaveProperty('actor');
    });

    it('AC-1: protected route without token returns 401 UNAUTHORIZED', async () => {
      const res = await request(app.getHttpServer())
        .get('/protected-test')
        .expect(401);

      expect(res.body).toEqual(
        expect.objectContaining({
          code: 'UNAUTHORIZED',
          correlationId: expect.any(String),
        }),
      );
      await vi.waitFor(() =>
        expect(requestLog('/protected-test')).toBeDefined(),
      );
      expect(requestLog('/protected-test')).not.toHaveProperty('actor');
    });

    it('AC-6: authenticated request logs actor on request completion', async () => {
      const res = await request(app.getHttpServer())
        .get('/protected-test')
        .set('authorization', `Bearer ${TOKEN}`)
        .expect(200);

      expect(res.body).toEqual({ actor: 'core-service' });
      await vi.waitFor(() =>
        expect(requestLog('/protected-test')).toEqual(
          expect.objectContaining({ actor: 'core-service' }),
        ),
      );
    });

    it('AC-11: no captured log line contains the token value', async () => {
      await request(app.getHttpServer())
        .get('/protected-test')
        .set('authorization', `Bearer ${TOKEN}`)
        .expect(200);
      await request(app.getHttpServer())
        .get('/protected-test')
        .set('authorization', `Bearer ${TOKEN}-tampered`)
        .expect(401);

      await vi.waitFor(() =>
        expect(
          capture.lines().filter((l) => l.context === 'HTTP').length,
        ).toBeGreaterThanOrEqual(2),
      );
      const lines = capture.lines();
      expect(lines.length).toBeGreaterThan(0);
      for (const line of lines) {
        expect(JSON.stringify(line)).not.toContain(TOKEN);
      }
    });
  });

  describe('Readiness and Traccar (in-process)', () => {
    let app: NestExpressApplication;
    let traccar: FakeTraccarServer;

    beforeEach(async () => {
      await resetLoggerState();
      traccar = await createFakeTraccar();
      const moduleFixture: TestingModule = await Test.createTestingModule({
        imports: [
          AppModule.register(
            testConfig({
              port: 0,
              logLevel: 'error',
              traccar: { baseUrl: traccar.url },
            }),
          ),
        ],
      }).compile();

      app = moduleFixture.createNestApplication<NestExpressApplication>({
        bufferLogs: true,
        bodyParser: false,
      });
      app.useLogger(app.get(Logger));
      configureHttp(app, app.get<AppConfig>(APP_CONFIG));
      await app.init();
      // Readiness also includes NATS since 009: wait for it so only Traccar varies here.
      const nats = app.get(NatsConnectionManager);
      await vi.waitFor(() => expect(nats.isReady()).toBe(true), {
        timeout: 5000,
      });
    });

    afterEach(async () => {
      if (app) {
        await app.close();
      }
      if (traccar) {
        await traccar.close();
      }
      await resetLoggerState();
    });

    it('AC-7b: GET /health/ready returns 200 { status: "ok", checks: { traccar: "ok" } } without token when Traccar responds 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/health/ready')
        .expect(200);

      expect(res.body).toEqual({
        status: 'ok',
        checks: { traccar: 'ok', nats: 'ok' },
      });
    });

    it('AC-7c: GET /health/ready returns 503 { status: "error", checks: { traccar: "error" } } when Traccar returns 500', async () => {
      traccar.setHandler(() => ({
        status: 500,
        json: { message: 'Internal Server Error' },
      }));

      const res = await request(app.getHttpServer())
        .get('/health/ready')
        .expect(503);

      expect(res.body).toEqual({
        status: 'error',
        checks: { traccar: 'error', nats: 'ok' },
      });
    });

    it('AC-7c: GET /health/ready returns 503 { status: "error", checks: { traccar: "error" } } when Traccar is down', async () => {
      await traccar.close();

      const res = await request(app.getHttpServer())
        .get('/health/ready')
        .expect(503);

      expect(res.body).toEqual({
        status: 'error',
        checks: { traccar: 'error', nats: 'ok' },
      });
    });

    it('AC-6: GET /health/ready propagates x-correlation-id to Traccar upstream request', async () => {
      const res = await request(app.getHttpServer())
        .get('/health/ready')
        .set('x-correlation-id', 'ready-1')
        .expect(200);

      expect(res.headers['x-correlation-id']).toBe('ready-1');
      const traccarReq = traccar.requests.find((r) => r.url === '/api/server');
      expect(traccarReq).toBeDefined();
      expect(traccarReq?.headers['x-correlation-id']).toBe('ready-1');
    });

    it('GET /health returns 200 without querying Traccar', async () => {
      await traccar.close();

      const res = await request(app.getHttpServer()).get('/health').expect(200);

      expect(res.body).toEqual({ status: 'ok' });
      expect(traccar.requests).toHaveLength(0);
    });
  });

  describe('Real process (dist/main.js)', () => {
    const spawnedProcesses: ChildProcess[] = [];

    afterEach(() => {
      for (const child of spawnedProcesses) {
        if (child.exitCode === null && child.signalCode === null) {
          child.kill('SIGKILL');
        }
      }
      spawnedProcesses.length = 0;
    });

    it('AC-1: with PORT=<libre>, responds 200 on /health in < 5s', async () => {
      const port = await freePort();
      const child = startApp({ PORT: String(port), LOG_LEVEL: 'error' });
      spawnedProcesses.push(child);

      const res = await waitForHealth(port, 5000);
      expect(res.status).toBe(200);
      const json = (await res.json()) as { status: string };
      expect(json).toEqual({ status: 'ok' });
      expect(res.headers.get('x-correlation-id')).toBeTruthy();
    });

    it('AC-2: with invalid env variables, exits with code 1 in < 5s and logs stderr JSON with invalidVariables', async () => {
      const child = startApp({ PORT: 'abc', LOG_LEVEL: 'verbose' });
      spawnedProcesses.push(child);

      let stderr = '';
      child.stderr?.on('data', (chunk) => {
        stderr += chunk.toString();
      });

      const exitCode = await new Promise<number | null>((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error('Process did not exit within 5s')),
          5000,
        );
        child.on('exit', (code) => {
          clearTimeout(timer);
          resolve(code);
        });
      });

      expect(exitCode).toBe(1);
      const parsed = JSON.parse(stderr.trim()) as {
        level: string;
        msg: string;
        invalidVariables: string[];
      };
      expect(parsed.level).toBe('error');
      expect(parsed.invalidVariables).toContain('PORT');
      expect(parsed.invalidVariables).toContain('LOG_LEVEL');
      expect(stderr).not.toContain('abc');
      expect(stderr).not.toContain('verbose');
    });

    it('AC-13: after /health OK, child.kill("SIGTERM") exits with code 0 in < 5s', async () => {
      const port = await freePort();
      const child = startApp({ PORT: String(port), LOG_LEVEL: 'error' });
      spawnedProcesses.push(child);

      await waitForHealth(port, 5000);

      const exitPromise = new Promise<number | null>((resolve, reject) => {
        const timer = setTimeout(
          () =>
            reject(new Error('Process did not exit within 5s after SIGTERM')),
          5000,
        );
        child.on('exit', (code) => {
          clearTimeout(timer);
          resolve(code);
        });
      });

      child.kill('SIGTERM');
      const exitCode = await exitPromise;
      expect(exitCode).toBe(0);
    });
  });
});
