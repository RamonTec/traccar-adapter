import { Controller, Get, type INestApplication } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { Logger } from 'nestjs-pino';
import request from 'supertest';
import { HttpExceptionFilter } from '../http/http-exception.filter.js';
import { LoggingModule } from '../logging/logging.module.js';
import {
  createLogCapture,
  type LogCapture,
} from '../../../../test/support/log-capture.js';
import { testConfig } from '../../../../test/support/test-env.js';
import { Actor, Public, RequireRole } from './auth.decorators.js';
import {
  InvalidTokenError,
  JwtVerifier,
  type VerifiedPrincipal,
} from './jwt-verifier.js';
import { ServiceAuthGuard } from './service-auth.guard.js';

@Controller()
class DummyController {
  @Public()
  @Get('open')
  open() {
    return { ok: true };
  }

  @RequireRole('devices:write')
  @Get('secured')
  secured(@Actor() actor: string) {
    return actor;
  }

  @Get('unannotated')
  unannotated() {
    return { ok: true };
  }
}

type VerifyImpl = (token: string) => Promise<VerifiedPrincipal>;

class FakeJwtVerifier implements Pick<JwtVerifier, 'verify'> {
  impl: VerifyImpl = () => Promise.reject(new InvalidTokenError('SIGNATURE'));
  readonly received: string[] = [];

  verify(token: string): Promise<VerifiedPrincipal> {
    this.received.push(token);
    return this.impl(token);
  }

  acceptAs(principal: VerifiedPrincipal): void {
    this.impl = () => Promise.resolve(principal);
  }

  rejectWith(err: Error): void {
    this.impl = () => Promise.reject(err);
  }
}

async function resetLoggerState(): Promise<void> {
  const url = new URL('./rootLogger.js', import.meta.resolve('nestjs-pino'));
  const { resetRootLogger } = (await import(url.href)) as {
    resetRootLogger: () => void;
  };
  resetRootLogger();
}

const TOKEN = 'header.payload.signature';

describe('ServiceAuthGuard (integration)', () => {
  let app: INestApplication;
  let logs: LogCapture;
  let verifier: FakeJwtVerifier;

  beforeEach(async () => {
    await resetLoggerState();
    logs = createLogCapture();
    verifier = new FakeJwtVerifier();

    const moduleRef = await Test.createTestingModule({
      imports: [
        LoggingModule.forRoot(testConfig({ logLevel: 'debug' }), logs.stream),
      ],
      controllers: [DummyController],
      providers: [
        { provide: JwtVerifier, useValue: verifier },
        { provide: APP_GUARD, useClass: ServiceAuthGuard },
        { provide: APP_FILTER, useClass: HttpExceptionFilter },
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

  describe('AC-1: missing or non-Bearer credentials', () => {
    it('AC-1: GET /secured without Authorization header → 401 UNAUTHORIZED', async () => {
      const res = await request(app.getHttpServer())
        .get('/secured')
        .expect(401);
      expect(res.body).toMatchObject({ code: 'UNAUTHORIZED' });
      expect(verifier.received).toHaveLength(0);
    });

    it('AC-1: GET /secured with Authorization: Basic x → 401 UNAUTHORIZED', async () => {
      const res = await request(app.getHttpServer())
        .get('/secured')
        .set('Authorization', 'Basic x')
        .expect(401);
      expect(res.body).toMatchObject({ code: 'UNAUTHORIZED' });
      expect(verifier.received).toHaveLength(0);
    });
  });

  it('AC-9: verifier throws JWKS_UNAVAILABLE → 401 and warn log with reason, without the token', async () => {
    verifier.rejectWith(new InvalidTokenError('JWKS_UNAVAILABLE'));

    const res = await request(app.getHttpServer())
      .get('/secured')
      .set('Authorization', `Bearer ${TOKEN}`)
      .expect(401);

    expect(res.body).toMatchObject({ code: 'UNAUTHORIZED' });
    expect(verifier.received).toEqual([TOKEN]);

    await vi.waitFor(() => {
      const warns = logs
        .lines()
        .filter((l) => l.level === 'warn' && l.reason === 'JWKS_UNAVAILABLE');
      expect(warns).toHaveLength(1);
    });
    const allLogs = JSON.stringify(logs.lines());
    expect(allLogs).not.toContain(TOKEN);
  });

  it('AC-5: valid token without the required role → 403 FORBIDDEN', async () => {
    verifier.acceptAs({ actor: 'core-service', roles: ['groups:write'] });

    const res = await request(app.getHttpServer())
      .get('/secured')
      .set('Authorization', `Bearer ${TOKEN}`)
      .expect(403);

    expect(res.body).toMatchObject({ code: 'FORBIDDEN' });
  });

  it('AC-6: valid token with devices:write → 200 and body is the actor', async () => {
    verifier.acceptAs({ actor: 'core-service', roles: ['devices:write'] });

    const res = await request(app.getHttpServer())
      .get('/secured')
      .set('Authorization', `Bearer ${TOKEN}`)
      .expect(200);

    expect(res.text).toBe('core-service');
  });

  describe('AC-7: deny by default, explicit public', () => {
    it('AC-7: GET /unannotated with a valid token → 403', async () => {
      verifier.acceptAs({
        actor: 'core-service',
        roles: ['groups:write', 'devices:write'],
      });

      const res = await request(app.getHttpServer())
        .get('/unannotated')
        .set('Authorization', `Bearer ${TOKEN}`)
        .expect(403);

      expect(res.body).toMatchObject({ code: 'FORBIDDEN' });
    });

    it('AC-7: GET /open without token → 200', async () => {
      await request(app.getHttpServer()).get('/open').expect(200);
      expect(verifier.received).toHaveLength(0);
    });
  });
});
