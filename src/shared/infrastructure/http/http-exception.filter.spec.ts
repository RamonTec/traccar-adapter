import {
  ConflictException,
  Controller,
  Get,
  type INestApplication,
  MethodNotAllowedException,
} from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { Logger } from 'nestjs-pino';
import request from 'supertest';
import { DomainError } from '../../domain/domain-error.js';
import { LoggingModule } from '../logging/logging.module.js';
import {
  createLogCapture,
  type LogCapture,
} from '../../../../test/support/log-capture.js';
import { HttpExceptionFilter } from './http-exception.filter.js';

class TestDomainError extends DomainError {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

@Controller()
class TestController {
  @Get('domain-conflict')
  domainConflict() {
    throw new TestDomainError('CONFLICT', 'Group exists');
  }

  @Get('unhandled-error')
  unhandledError() {
    throw new Error('db password=x');
  }

  @Get('unmapped-domain-error')
  unmappedDomainError() {
    throw new TestDomainError(
      'NOT_REGISTERED_CODE',
      'Some unmapped domain error',
    );
  }

  @Get('nest-conflict')
  nestConflict() {
    throw new ConflictException('Nest conflict detail');
  }

  @Get('method-not-allowed')
  methodNotAllowed() {
    throw new MethodNotAllowedException();
  }
}

async function resetLoggerState(): Promise<void> {
  const url = new URL('./rootLogger.js', import.meta.resolve('nestjs-pino'));
  const { resetRootLogger } = (await import(url.href)) as {
    resetRootLogger: () => void;
  };
  resetRootLogger();
}

describe('HttpExceptionFilter (integration)', () => {
  let app: INestApplication;
  let logs: LogCapture;

  beforeEach(async () => {
    await resetLoggerState();
    logs = createLogCapture();

    const moduleRef = await Test.createTestingModule({
      imports: [
        LoggingModule.forRoot({ port: 3000, logLevel: 'debug' }, logs.stream),
      ],
      controllers: [TestController],
      providers: [
        {
          provide: APP_FILTER,
          useClass: HttpExceptionFilter,
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication({ bufferLogs: true });
    app.useLogger(app.get(Logger));
    await app.init();
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
    await resetLoggerState();
  });

  it('AC-9: maps DomainError with CONFLICT code to 409 and preserves original message', async () => {
    const res = await request(app.getHttpServer())
      .get('/domain-conflict')
      .set('x-correlation-id', 'cid-1')
      .expect(409);

    expect(res.body).toEqual({
      code: 'CONFLICT',
      message: 'Group exists',
      correlationId: 'cid-1',
    });
  });

  it('AC-10a: maps unhandled generic Error to 500 INTERNAL_ERROR without leaking secrets or stack', async () => {
    const res = await request(app.getHttpServer())
      .get('/unhandled-error')
      .set('x-correlation-id', 'cid-1')
      .expect(500);

    expect(res.body).toEqual({
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
      correlationId: 'cid-1',
    });

    const bodyStr = JSON.stringify(res.body);
    expect(bodyStr).not.toContain('password');
    expect(bodyStr).not.toContain('stack');
  });

  it('AC-10b: unhandled generic Error logs an error line with correlationId and err containing original message', async () => {
    await request(app.getHttpServer())
      .get('/unhandled-error')
      .set('x-correlation-id', 'cid-1')
      .expect(500);

    await vi.waitFor(() => {
      const errorLines = logs
        .lines()
        .filter((l) => l.level === 'error' && l.correlationId === 'cid-1');
      expect(errorLines.length).toBeGreaterThan(0);
      const hasOriginalMessage = errorLines.some(
        (l) =>
          JSON.stringify(l.err).includes('db password=x') ||
          String(l.msg).includes('db password=x'),
      );
      expect(hasOriginalMessage).toBe(true);
    });
  });

  it('AC-10c: maps unmapped DomainError to 500 INTERNAL_ERROR and logs error with msg Unmapped domain error code', async () => {
    const res = await request(app.getHttpServer())
      .get('/unmapped-domain-error')
      .set('x-correlation-id', 'cid-1')
      .expect(500);

    expect(res.body).toEqual({
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
      correlationId: 'cid-1',
    });

    await vi.waitFor(() => {
      const errorLines = logs
        .lines()
        .filter(
          (l) =>
            l.level === 'error' &&
            l.correlationId === 'cid-1' &&
            l.msg === 'Unmapped domain error code',
        );
      expect(errorLines.length).toBeGreaterThan(0);
      expect(errorLines[0]?.code).toBe('NOT_REGISTERED_CODE');
    });
  });

  it('AC-11: maps unknown route to 404 NOT_FOUND, ConflictException to 409 CONFLICT, and 405 to BAD_REQUEST', async () => {
    const res404 = await request(app.getHttpServer())
      .get('/no-existe')
      .set('x-correlation-id', 'cid-1')
      .expect(404);

    expect(res404.body).toEqual({
      code: 'NOT_FOUND',
      message: 'Resource not found',
      correlationId: 'cid-1',
    });

    const resConflict = await request(app.getHttpServer())
      .get('/nest-conflict')
      .set('x-correlation-id', 'cid-1')
      .expect(409);

    expect(resConflict.body).toEqual({
      code: 'CONFLICT',
      message: 'Conflict',
      correlationId: 'cid-1',
    });

    const res405 = await request(app.getHttpServer())
      .get('/method-not-allowed')
      .set('x-correlation-id', 'cid-1')
      .expect(405);

    expect(res405.body).toEqual({
      code: 'BAD_REQUEST',
      message: 'Bad request',
      correlationId: 'cid-1',
    });
  });
});
