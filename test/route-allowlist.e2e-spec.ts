import { type INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { Logger } from 'nestjs-pino';
import { AppModule } from '../src/app.module.js';
import { testConfig } from './support/test-env.js';

async function resetLoggerState(): Promise<void> {
  const url = new URL('./rootLogger.js', import.meta.resolve('nestjs-pino'));
  const { resetRootLogger } = (await import(url.href)) as {
    resetRootLogger: () => void;
  };
  resetRootLogger();
}

const ALLOWED_ROUTES = [
  'GET /health',
  'GET /health/ready',
  'POST /groups',
  'POST /devices',
].sort();

describe('Route allowlist (e2e)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    await resetLoggerState();
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule.register(testConfig({ port: 0, logLevel: 'error' }))],
    }).compile();

    app = moduleFixture.createNestApplication({ bufferLogs: true });
    app.useLogger(app.get(Logger));
    await app.init();
  });

  afterEach(async () => {
    if (app) await app.close();
    await resetLoggerState();
  });

  it('AC-11: only allowed routes are registered', () => {
    const server = app.getHttpAdapter().getInstance();
    const router = server.router ?? server._router;
    const stack = router?.stack ?? [];

    const routes: string[] = [];

    for (const layer of stack) {
      if (layer.route) {
        const path = layer.route.path;
        // Ignore middleware registered via forRoutes('*') or router wildcards
        if (path === '{/*splat}' || path === '*') continue;

        const methods = Object.keys(layer.route.methods || {})
          .filter((m) => m !== '_all' && m !== 'head')
          .map((m) => m.toUpperCase());

        for (const method of methods) {
          routes.push(`${method} ${path}`);
        }
      }
    }

    routes.sort();
    expect(routes).toEqual(ALLOWED_ROUTES);
  });

  it('AC-11: no route under /devices accepts groupId as path parameter', () => {
    const server = app.getHttpAdapter().getInstance();
    const router = server.router ?? server._router;
    const stack = router?.stack ?? [];

    const deviceRoutes: string[] = [];
    for (const layer of stack) {
      if (layer.route && typeof layer.route.path === 'string') {
        if (layer.route.path.startsWith('/devices')) {
          deviceRoutes.push(layer.route.path);
        }
      }
    }

    for (const path of deviceRoutes) {
      expect(path).not.toMatch(/:groupId\b/);
    }
  });
});
