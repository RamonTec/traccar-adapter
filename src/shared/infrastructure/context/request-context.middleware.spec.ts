import { Controller, Get, type INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import type { Request, Response } from 'express';
import { Logger } from 'nestjs-pino';
import request from 'supertest';
import { testConfig } from '../../../../test/support/test-env.js';
import { AppModule } from '../../../app.module.js';
import { Public } from '../auth/auth.decorators.js';
import { CORRELATION_ID_HEADER } from '../logging/correlation-id.js';
import { currentCorrelationId } from './request-context.js';
import { RequestContextMiddleware } from './request-context.middleware.js';

@Controller('test-context')
@Public()
class TestContextController {
  @Get()
  async get(): Promise<{ correlationId: string | undefined }> {
    await new Promise((resolve) => setTimeout(resolve, 5));
    return { correlationId: currentCorrelationId() };
  }
}

describe('RequestContextMiddleware', () => {
  describe('unit', () => {
    let middleware: RequestContextMiddleware;

    beforeEach(() => {
      middleware = new RequestContextMiddleware();
    });

    it('runs next within context using res.getHeader(CORRELATION_ID_HEADER)', () => {
      const req = { headers: {} } as unknown as Request;
      const res = {
        getHeader: (name: string) =>
          name === CORRELATION_ID_HEADER ? 'header-res-id' : undefined,
      } as unknown as Response;

      let capturedId: string | undefined;
      middleware.use(req, res, () => {
        capturedId = currentCorrelationId();
      });

      expect(capturedId).toBe('header-res-id');
      expect(currentCorrelationId()).toBeUndefined();
    });

    it('falls back to resolveCorrelationId from req.headers if res header is not present', () => {
      const req = {
        headers: { [CORRELATION_ID_HEADER]: 'from-req-header' },
      } as unknown as Request;
      const res = {
        getHeader: () => undefined,
      } as unknown as Response;

      let capturedId: string | undefined;
      middleware.use(req, res, () => {
        capturedId = currentCorrelationId();
      });

      expect(capturedId).toBe('from-req-header');
      expect(currentCorrelationId()).toBeUndefined();
    });

    it('generates a new correlationId if neither res nor req header is present', () => {
      const req = { headers: {} } as unknown as Request;
      const res = {
        getHeader: () => undefined,
      } as unknown as Response;

      let capturedId: string | undefined;
      middleware.use(req, res, () => {
        capturedId = currentCorrelationId();
      });

      expect(capturedId).toBeDefined();
      expect(typeof capturedId).toBe('string');
      expect(capturedId!.length).toBeGreaterThan(0);
      expect(currentCorrelationId()).toBeUndefined();
    });
  });

  describe('AC-6c: integration with AppModule and HTTP request', () => {
    let app: INestApplication;

    beforeEach(async () => {
      const moduleFixture: TestingModule = await Test.createTestingModule({
        imports: [
          AppModule.register(testConfig({ port: 0, logLevel: 'error' })),
        ],
        controllers: [TestContextController],
      }).compile();

      app = moduleFixture.createNestApplication({ bufferLogs: true });
      app.useLogger(app.get(Logger));
      await app.init();
    });

    afterEach(async () => {
      if (app) {
        await app.close();
      }
    });

    it('AC-6c: with x-correlation-id header, body.correlationId is "e2e-ctx"', async () => {
      const res = await request(app.getHttpServer())
        .get('/test-context')
        .set(CORRELATION_ID_HEADER, 'e2e-ctx')
        .expect(200);

      expect(res.body).toEqual({ correlationId: 'e2e-ctx' });
      expect(res.headers[CORRELATION_ID_HEADER]).toBe('e2e-ctx');
    });

    it('AC-6c: without x-correlation-id header, body.correlationId matches generated response header', async () => {
      const res = await request(app.getHttpServer())
        .get('/test-context')
        .expect(200);

      const generatedHeader = res.headers[CORRELATION_ID_HEADER];
      expect(generatedHeader).toBeDefined();
      expect(res.body).toEqual({ correlationId: generatedHeader });
    });
  });
});
