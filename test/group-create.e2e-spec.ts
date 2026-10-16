import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { Logger } from 'nestjs-pino';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import {
  InvalidTokenError,
  type JwtVerifier,
  type VerifiedPrincipal,
} from '../src/shared/infrastructure/auth/jwt-verifier.js';
import {
  createFakeTraccar,
  type FakeTraccarServer,
} from './support/fake-traccar.js';
import { checkHttpContract, recordResponses } from './support/http-contract.js';
import { testConfig } from './support/test-env.js';

const VALID_TOKEN = 'test-token-valid';
const FORBIDDEN_TOKEN = 'test-token-forbidden';

const fakeVerifier: Pick<JwtVerifier, 'verify'> = {
  verify: (token: string): Promise<VerifiedPrincipal> => {
    if (token === VALID_TOKEN) {
      return Promise.resolve({
        actor: 'core-service',
        roles: ['groups:write'],
      });
    }
    if (token === FORBIDDEN_TOKEN) {
      return Promise.resolve({ actor: 'unprivileged-service', roles: [] });
    }
    return Promise.reject(new InvalidTokenError('SIGNATURE'));
  },
};

async function resetLoggerState(): Promise<void> {
  const url = new URL('./rootLogger.js', import.meta.resolve('nestjs-pino'));
  const { resetRootLogger } = (await import(url.href)) as {
    resetRootLogger: () => void;
  };
  resetRootLogger();
}

describe('Group Create (e2e)', () => {
  let app: INestApplication;
  let contract: ReturnType<typeof recordResponses>;
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
          undefined,
          { jwtVerifier: fakeVerifier },
        ),
      ],
    }).compile();

    app = moduleFixture.createNestApplication({ bufferLogs: true });
    app.useLogger(app.get(Logger));
    contract = recordResponses(app);
    await app.init();
  });

  afterEach(async () => {
    if (contract) expect(checkHttpContract(contract.take())).toEqual([]);
    if (app) {
      await app.close();
    }
    if (traccar) {
      await traccar.close();
    }
    await resetLoggerState();
  });

  it('AC-1: empty Traccar returns 201 with groupId and name, and fake receives POST with body', async () => {
    const res = await request(app.getHttpServer())
      .post('/groups')
      .set('authorization', `Bearer ${VALID_TOKEN}`)
      .send({ name: 'acme' })
      .expect(201);

    expect(res.body).toEqual({
      groupId: expect.any(Number),
      name: 'acme',
    });

    const postRequests = traccar.requests.filter(
      (r) => r.method === 'POST' && r.url?.startsWith('/api/groups'),
    );
    expect(postRequests).toHaveLength(1);
    expect(JSON.parse(postRequests[0].body)).toEqual({ name: 'acme' });
  });

  it('AC-2: repeat request returns 200 with same groupId and fake has only one group', async () => {
    const res1 = await request(app.getHttpServer())
      .post('/groups')
      .set('authorization', `Bearer ${VALID_TOKEN}`)
      .send({ name: 'acme' })
      .expect(201);

    const res2 = await request(app.getHttpServer())
      .post('/groups')
      .set('authorization', `Bearer ${VALID_TOKEN}`)
      .send({ name: 'acme' })
      .expect(200);

    expect(res2.body).toEqual({
      groupId: res1.body.groupId,
      name: 'acme',
    });
    expect(traccar.groups).toHaveLength(1);
  });

  it('AC-3: fake with two duplicate group names returns 409 GROUP_NAME_AMBIGUOUS and does not POST', async () => {
    traccar.groups = [
      { id: 10, name: 'dup', groupId: 0, attributes: {} },
      { id: 20, name: 'dup', groupId: 0, attributes: {} },
    ];

    const res = await request(app.getHttpServer())
      .post('/groups')
      .set('authorization', `Bearer ${VALID_TOKEN}`)
      .send({ name: 'dup' })
      .expect(409);

    expect(res.body).toEqual(
      expect.objectContaining({
        code: 'GROUP_NAME_AMBIGUOUS',
        correlationId: expect.any(String),
      }),
    );

    const postRequests = traccar.requests.filter(
      (r) => r.method === 'POST' && r.url?.startsWith('/api/groups'),
    );
    expect(postRequests).toHaveLength(0);
  });

  it('AC-4: invalid bodies return 400 VALIDATION_ERROR with details', async () => {
    const resEmpty = await request(app.getHttpServer())
      .post('/groups')
      .set('authorization', `Bearer ${VALID_TOKEN}`)
      .send({ name: '' })
      .expect(400);

    expect(resEmpty.body).toEqual(
      expect.objectContaining({
        code: 'VALIDATION_ERROR',
        details: expect.any(Array),
        correlationId: expect.any(String),
      }),
    );
    expect(
      (resEmpty.body as { details: unknown[] }).details.length,
    ).toBeGreaterThan(0);

    const resExtra = await request(app.getHttpServer())
      .post('/groups')
      .set('authorization', `Bearer ${VALID_TOKEN}`)
      .send({ name: 'a', x: 1 })
      .expect(400);

    expect(resExtra.body).toEqual(
      expect.objectContaining({
        code: 'VALIDATION_ERROR',
        details: expect.any(Array),
        correlationId: expect.any(String),
      }),
    );
    expect(
      (resExtra.body as { details: unknown[] }).details.length,
    ).toBeGreaterThan(0);
  });

  it('AC-5: down=true returns 503 UPSTREAM_UNAVAILABLE, then down=false returns 201 and repeat returns 200', async () => {
    traccar.down = true;

    const resDown = await request(app.getHttpServer())
      .post('/groups')
      .set('authorization', `Bearer ${VALID_TOKEN}`)
      .send({ name: 'resilient' })
      .expect(503);

    expect(resDown.body).toEqual(
      expect.objectContaining({
        code: 'UPSTREAM_UNAVAILABLE',
        correlationId: expect.any(String),
      }),
    );

    traccar.down = false;

    const resCreated = await request(app.getHttpServer())
      .post('/groups')
      .set('authorization', `Bearer ${VALID_TOKEN}`)
      .send({ name: 'resilient' })
      .expect(201);

    expect(resCreated.body).toEqual({
      groupId: expect.any(Number),
      name: 'resilient',
    });

    const resIdempotent = await request(app.getHttpServer())
      .post('/groups')
      .set('authorization', `Bearer ${VALID_TOKEN}`)
      .send({ name: 'resilient' })
      .expect(200);

    expect(resIdempotent.body).toEqual({
      groupId: resCreated.body.groupId,
      name: 'resilient',
    });
  });

  it('AC-6: missing token returns 401 and token without groups:write returns 403', async () => {
    const resNoAuth = await request(app.getHttpServer())
      .post('/groups')
      .send({ name: 'acme' })
      .expect(401);

    expect(resNoAuth.body).toEqual(
      expect.objectContaining({
        code: 'UNAUTHORIZED',
        correlationId: expect.any(String),
      }),
    );

    const resForbidden = await request(app.getHttpServer())
      .post('/groups')
      .set('authorization', `Bearer ${FORBIDDEN_TOKEN}`)
      .send({ name: 'acme' })
      .expect(403);

    expect(resForbidden.body).toEqual(
      expect.objectContaining({
        code: 'FORBIDDEN',
        correlationId: expect.any(String),
      }),
    );
  });

  it('AC-8: GET, PUT, PATCH and DELETE on /groups and /groups/1 return 404', async () => {
    const routes = ['/groups', '/groups/1'];
    for (const route of routes) {
      await request(app.getHttpServer())
        .get(route)
        .set('authorization', `Bearer ${VALID_TOKEN}`)
        .expect(404);

      await request(app.getHttpServer())
        .put(route)
        .set('authorization', `Bearer ${VALID_TOKEN}`)
        .send({ name: 'acme' })
        .expect(404);

      await request(app.getHttpServer())
        .patch(route)
        .set('authorization', `Bearer ${VALID_TOKEN}`)
        .send({ name: 'acme' })
        .expect(404);

      await request(app.getHttpServer())
        .delete(route)
        .set('authorization', `Bearer ${VALID_TOKEN}`)
        .expect(404);
    }
  });
});
