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
        roles: ['devices:write'],
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

describe('Device Register (e2e)', () => {
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

  it('AC-1: group 2 without devices returns 201 with deviceId, uniqueId, and groupId 2', async () => {
    traccar.groups = [{ id: 2, name: 'fleet-a', groupId: 0, attributes: {} }];

    const res = await request(app.getHttpServer())
      .post('/devices')
      .set('authorization', `Bearer ${VALID_TOKEN}`)
      .send({
        uniqueId: '123456789012345',
        name: 'truck-1',
        groupId: 2,
      })
      .expect(201);

    expect(res.body).toEqual({
      deviceId: expect.any(Number),
      uniqueId: '123456789012345',
      groupId: 2,
    });

    expect(traccar.devices).toHaveLength(1);
    expect(traccar.devices[0].uniqueId).toBe('123456789012345');
    expect(traccar.devices[0].groupId).toBe(2);
    expect(traccar.devices[0].disabled).toBe(false);
  });

  it('AC-2: repeat registration returns 200 with same deviceId and no additional POST or PUT in fake', async () => {
    traccar.groups = [{ id: 2, name: 'fleet-a', groupId: 0, attributes: {} }];

    const res1 = await request(app.getHttpServer())
      .post('/devices')
      .set('authorization', `Bearer ${VALID_TOKEN}`)
      .send({
        uniqueId: '123456789012345',
        name: 'truck-1',
        groupId: 2,
      })
      .expect(201);

    const mutatingRequestsBefore = traccar.requests.filter(
      (r) =>
        (r.method === 'POST' || r.method === 'PUT') &&
        r.url?.startsWith('/api/devices'),
    ).length;

    const res2 = await request(app.getHttpServer())
      .post('/devices')
      .set('authorization', `Bearer ${VALID_TOKEN}`)
      .send({
        uniqueId: '123456789012345',
        name: 'truck-1',
        groupId: 2,
      })
      .expect(200);

    expect(res2.body).toEqual({
      deviceId: res1.body.deviceId,
      uniqueId: '123456789012345',
      groupId: 2,
    });

    const mutatingRequestsAfter = traccar.requests.filter(
      (r) =>
        (r.method === 'POST' || r.method === 'PUT') &&
        r.url?.startsWith('/api/devices'),
    ).length;

    expect(mutatingRequestsAfter).toBe(mutatingRequestsBefore);
    expect(traccar.devices).toHaveLength(1);
  });

  it('AC-3: enabled device in group 3 returns 409 DEVICE_ALREADY_REGISTERED and fake device is untouched', async () => {
    traccar.groups = [
      { id: 2, name: 'fleet-a', groupId: 0, attributes: {} },
      { id: 3, name: 'fleet-b', groupId: 0, attributes: {} },
    ];
    traccar.devices = [
      {
        id: 10,
        name: 'existing-dev',
        uniqueId: '123456789012345',
        groupId: 3,
        disabled: false,
        attributes: {},
      },
    ];

    const res = await request(app.getHttpServer())
      .post('/devices')
      .set('authorization', `Bearer ${VALID_TOKEN}`)
      .send({
        uniqueId: '123456789012345',
        name: 'truck-1',
        groupId: 2,
      })
      .expect(409);

    expect(res.body).toEqual(
      expect.objectContaining({
        code: 'DEVICE_ALREADY_REGISTERED',
        correlationId: expect.any(String),
      }),
    );

    expect(traccar.devices).toHaveLength(1);
    expect(traccar.devices[0]).toEqual(
      expect.objectContaining({
        id: 10,
        uniqueId: '123456789012345',
        groupId: 3,
        disabled: false,
      }),
    );
  });

  it('AC-4: disabled device (id N, group 3) registering in group 2 returns 201 with deviceId != N, retiring N in fake', async () => {
    const N = 42;
    traccar.groups = [
      { id: 2, name: 'fleet-a', groupId: 0, attributes: {} },
      { id: 3, name: 'fleet-b', groupId: 0, attributes: {} },
    ];
    traccar.devices = [
      {
        id: N,
        name: 'old-dev',
        uniqueId: '123456789012345',
        groupId: 3,
        disabled: true,
        attributes: {},
      },
    ];

    const res = await request(app.getHttpServer())
      .post('/devices')
      .set('authorization', `Bearer ${VALID_TOKEN}`)
      .send({
        uniqueId: '123456789012345',
        name: 'new-dev',
        groupId: 2,
      })
      .expect(201);

    expect(res.body).toEqual({
      deviceId: expect.any(Number),
      uniqueId: '123456789012345',
      groupId: 2,
    });
    expect(res.body.deviceId).not.toBe(N);

    const retired = traccar.devices.find((d) => d.id === N);
    expect(retired).toBeDefined();
    expect(retired?.uniqueId).toBe(`123456789012345:retired:${N}`);
    expect(retired?.groupId).toBe(3);
    expect(retired?.disabled).toBe(true);

    const created = traccar.devices.find((d) => d.id === res.body.deviceId);
    expect(created).toBeDefined();
    expect(created?.uniqueId).toBe('123456789012345');
    expect(created?.groupId).toBe(2);
    expect(created?.disabled).toBe(false);
  });

  it('AC-5: retry after failNextPost returns 201 via AC-1 path, leaving exactly one retired device', async () => {
    const N = 55;
    traccar.groups = [
      { id: 2, name: 'fleet-a', groupId: 0, attributes: {} },
      { id: 3, name: 'fleet-b', groupId: 0, attributes: {} },
    ];
    traccar.devices = [
      {
        id: N,
        name: 'disabled-dev',
        uniqueId: '123456789012345',
        groupId: 3,
        disabled: true,
        attributes: {},
      },
    ];
    traccar.failNextPost = 1;

    const res1 = await request(app.getHttpServer())
      .post('/devices')
      .set('authorization', `Bearer ${VALID_TOKEN}`)
      .send({
        uniqueId: '123456789012345',
        name: 'new-dev',
        groupId: 2,
      })
      .expect(503);

    expect(res1.body).toEqual(
      expect.objectContaining({
        code: 'UPSTREAM_UNAVAILABLE',
        correlationId: expect.any(String),
      }),
    );

    const oldDevAfterFail = traccar.devices.find((d) => d.id === N);
    expect(oldDevAfterFail?.uniqueId).toBe(`123456789012345:retired:${N}`);

    const res2 = await request(app.getHttpServer())
      .post('/devices')
      .set('authorization', `Bearer ${VALID_TOKEN}`)
      .send({
        uniqueId: '123456789012345',
        name: 'new-dev',
        groupId: 2,
      })
      .expect(201);

    expect(res2.body).toEqual({
      deviceId: expect.any(Number),
      uniqueId: '123456789012345',
      groupId: 2,
    });
    expect(res2.body.deviceId).not.toBe(N);

    const retiredDevices = traccar.devices.filter((d) =>
      d.uniqueId.includes(':retired:'),
    );
    expect(retiredDevices).toHaveLength(1);
    expect(retiredDevices[0].id).toBe(N);
  });

  it('AC-6: groupId 999 returns 404 GROUP_NOT_FOUND', async () => {
    traccar.groups = [{ id: 2, name: 'fleet-a', groupId: 0, attributes: {} }];

    const res = await request(app.getHttpServer())
      .post('/devices')
      .set('authorization', `Bearer ${VALID_TOKEN}`)
      .send({
        uniqueId: '123456789012345',
        name: 'truck-1',
        groupId: 999,
      })
      .expect(404);

    expect(res.body).toEqual(
      expect.objectContaining({
        code: 'GROUP_NOT_FOUND',
        correlationId: expect.any(String),
      }),
    );
  });

  it('AC-7: invalid uniqueId returns 400 VALIDATION_ERROR with details', async () => {
    const res = await request(app.getHttpServer())
      .post('/devices')
      .set('authorization', `Bearer ${VALID_TOKEN}`)
      .send({
        uniqueId: '123',
        name: 'truck-1',
        groupId: 2,
      })
      .expect(400);

    expect(res.body).toEqual(
      expect.objectContaining({
        code: 'VALIDATION_ERROR',
        details: expect.any(Array),
        correlationId: expect.any(String),
      }),
    );
    expect((res.body as { details: unknown[] }).details.length).toBeGreaterThan(
      0,
    );
  });

  it('AC-8: upstream Traccar down returns 503 UPSTREAM_UNAVAILABLE', async () => {
    traccar.down = true;

    const res = await request(app.getHttpServer())
      .post('/devices')
      .set('authorization', `Bearer ${VALID_TOKEN}`)
      .send({
        uniqueId: '123456789012345',
        name: 'truck-1',
        groupId: 2,
      })
      .expect(503);

    expect(res.body).toEqual(
      expect.objectContaining({
        code: 'UPSTREAM_UNAVAILABLE',
        correlationId: expect.any(String),
      }),
    );
  });

  it('AC-9: missing token returns 401 and token without devices:write returns 403', async () => {
    const resNoAuth = await request(app.getHttpServer())
      .post('/devices')
      .send({
        uniqueId: '123456789012345',
        name: 'truck-1',
        groupId: 2,
      })
      .expect(401);

    expect(resNoAuth.body).toEqual(
      expect.objectContaining({
        code: 'UNAUTHORIZED',
        correlationId: expect.any(String),
      }),
    );

    const resForbidden = await request(app.getHttpServer())
      .post('/devices')
      .set('authorization', `Bearer ${FORBIDDEN_TOKEN}`)
      .send({
        uniqueId: '123456789012345',
        name: 'truck-1',
        groupId: 2,
      })
      .expect(403);

    expect(resForbidden.body).toEqual(
      expect.objectContaining({
        code: 'FORBIDDEN',
        correlationId: expect.any(String),
      }),
    );
  });
});
