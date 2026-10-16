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
  type FakeTraccarDevice,
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

function seedDevice(
  overrides: Partial<FakeTraccarDevice> & { id: number },
): FakeTraccarDevice {
  return {
    name: 'truck-1',
    uniqueId: '123456789012345',
    groupId: 3,
    disabled: false,
    attributes: { a: 1 },
    calendarId: 7,
    status: 'offline',
    lastUpdate: null,
    positionId: 0,
    phone: null,
    model: null,
    contact: null,
    category: null,
    expirationTime: null,
    ...overrides,
  };
}

describe('Device Status (e2e)', () => {
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
    if (app) await app.close();
    if (traccar) await traccar.close();
    await resetLoggerState();
  });

  function post(path: string, token: string | null = VALID_TOKEN) {
    const req = request(app.getHttpServer()).post(path);
    return token ? req.set('authorization', `Bearer ${token}`) : req;
  }

  function putCount(): number {
    return traccar.requests.filter((r) => r.method === 'PUT').length;
  }

  it('AC-1 + AC-7: disable sets disabled and preserves name, uniqueId, groupId and attributes', async () => {
    traccar.devices = [seedDevice({ id: 18 })];

    const res = await post('/devices/18/disable').expect(200);

    expect(res.body).toEqual({ deviceId: 18, disabled: true });
    expect(traccar.devices[0]).toEqual(seedDevice({ id: 18, disabled: true }));
  });

  it('AC-2: repeating disable answers the same body without a new PUT', async () => {
    traccar.devices = [seedDevice({ id: 18 })];
    await post('/devices/18/disable').expect(200);
    const putsBefore = putCount();

    const res = await post('/devices/18/disable').expect(200);

    expect(res.body).toEqual({ deviceId: 18, disabled: true });
    expect(putCount()).toBe(putsBefore);
  });

  it('AC-3 + AC-4: enable re-enables keeping groupId; repeating it does not PUT', async () => {
    traccar.devices = [seedDevice({ id: 18, disabled: true })];

    const res = await post('/devices/18/enable').expect(200);

    expect(res.body).toEqual({ deviceId: 18, disabled: false });
    expect(traccar.devices[0]!.groupId).toBe(3);
    expect(traccar.devices[0]!.disabled).toBe(false);

    const putsBefore = putCount();
    await post('/devices/18/enable').expect(200);
    expect(putCount()).toBe(putsBefore);
  });

  it('AC-5: retired device cannot be enabled; disabling it is a no-op', async () => {
    traccar.devices = [
      seedDevice({
        id: 18,
        uniqueId: '123456789012345:retired:18',
        disabled: true,
      }),
    ];

    const enable = await post('/devices/18/enable').expect(409);
    expect(enable.body).toMatchObject({ code: 'DEVICE_RETIRED' });

    const disable = await post('/devices/18/disable').expect(200);
    expect(disable.body).toEqual({ deviceId: 18, disabled: true });
    expect(putCount()).toBe(0);
  });

  it('AC-6: unknown device → 404, non-numeric id → 400', async () => {
    const missing = await post('/devices/999/disable').expect(404);
    expect(missing.body).toMatchObject({ code: 'DEVICE_NOT_FOUND' });

    const invalid = await post('/devices/abc/disable').expect(400);
    expect(invalid.body).toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('AC-8: Traccar down → 503, retry after recovery converges', async () => {
    traccar.devices = [seedDevice({ id: 18 })];
    traccar.down = true;

    const down = await post('/devices/18/disable').expect(503);
    expect(down.body).toMatchObject({ code: 'UPSTREAM_UNAVAILABLE' });

    traccar.down = false;
    const res = await post('/devices/18/disable').expect(200);
    expect(res.body).toEqual({ deviceId: 18, disabled: true });
  });

  it('AC-9: missing token → 401, missing role → 403, non-empty body → 400', async () => {
    traccar.devices = [seedDevice({ id: 18 })];

    await post('/devices/18/disable', null).expect(401);
    await post('/devices/18/disable', FORBIDDEN_TOKEN).expect(403);
    const res = await post('/devices/18/disable').send({ x: 1 }).expect(400);
    expect(res.body).toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(putCount()).toBe(0);
  });
});
