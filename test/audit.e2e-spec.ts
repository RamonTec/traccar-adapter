import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
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
import { createLogCapture, type LogCapture } from './support/log-capture.js';
import { testConfig } from './support/test-env.js';

const TOKEN = 'audit-e2e-token-value';
const CONTROLLERS = [
  'GroupController',
  'DeviceController',
  'DeviceStatusController',
];

const fakeVerifier: Pick<JwtVerifier, 'verify'> = {
  verify: (token: string): Promise<VerifiedPrincipal> =>
    token === TOKEN
      ? Promise.resolve({
          actor: 'core-service',
          roles: ['groups:write', 'devices:write'],
        })
      : Promise.reject(new InvalidTokenError('SIGNATURE')),
};

async function resetLoggerState(): Promise<void> {
  const url = new URL('./rootLogger.js', import.meta.resolve('nestjs-pino'));
  const { resetRootLogger } = (await import(url.href)) as {
    resetRootLogger: () => void;
  };
  resetRootLogger();
}

describe('Operation audit (e2e)', () => {
  let app: INestApplication;
  let traccar: FakeTraccarServer;
  let logs: LogCapture;

  beforeEach(async () => {
    await resetLoggerState();
    logs = createLogCapture();
    traccar = await createFakeTraccar();
    const moduleRef = await Test.createTestingModule({
      imports: [
        AppModule.register(
          testConfig({ logLevel: 'info', traccar: { baseUrl: traccar.url } }),
          logs.stream,
          { jwtVerifier: fakeVerifier },
        ),
      ],
    }).compile();
    app = moduleRef.createNestApplication({ bufferLogs: true });
    app.useLogger(app.get(Logger));
    await app.init();
  });

  afterEach(async () => {
    await app?.close();
    await traccar?.close();
    await resetLoggerState();
  });

  function post(path: string, body?: object) {
    const req = request(app.getHttpServer())
      .post(path)
      .set('authorization', `Bearer ${TOKEN}`);
    return body ? req.send(body) : req;
  }

  function auditLines(): Record<string, unknown>[] {
    return logs.lines().filter((l) => l.context === 'Audit');
  }

  it('AC-1/AC-5/AC-9/AC-10: each operation leaves exactly one Audit line', async () => {
    const group = await post('/groups', { name: 'fleet-audit' }).expect(201);
    const groupId = (group.body as { groupId: number }).groupId;
    const device = await post('/devices', {
      uniqueId: '123456789012345',
      name: 'Truck 1',
      groupId,
    }).expect(201);
    const deviceId = (device.body as { deviceId: number }).deviceId;
    await post(`/devices/${deviceId}/disable`).expect(200);
    await post(`/devices/${deviceId}/enable`).expect(200);

    const lines = auditLines();
    expect(lines.map((l) => [l.op, l.result])).toEqual([
      ['group.create', 'created'],
      ['device.register', 'created'],
      ['device.disable', 'changed'],
      ['device.enable', 'changed'],
    ]);
    for (const line of lines) {
      expect(line).toMatchObject({
        msg: line.op,
        actor: 'core-service',
        level: 'info',
      });
      expect(Number.isInteger(line.durationMs)).toBe(true);
      expect(line.durationMs as number).toBeGreaterThanOrEqual(0);
    }
    expect(lines[0]).toMatchObject({ name: 'fleet-audit', groupId });
    expect(lines[1]).toMatchObject({
      uniqueId: '123456789012345',
      groupId,
      deviceId,
    });
    expect(lines[2]).toMatchObject({ deviceId });

    // No controller audits anymore (ADR-0006).
    expect(
      logs
        .lines()
        .filter((l) => CONTROLLERS.includes(String(l.context)) && l.op),
    ).toEqual([]);

    const auditJson = JSON.stringify(lines);
    expect(auditJson).not.toContain(TOKEN);
    expect(auditJson.toLowerCase()).not.toContain('authorization');
    expect(auditJson).not.toContain('Truck 1');
  });

  it('AC-1: a rejected operation still leaves one warn Audit line', async () => {
    await post('/devices/999/enable').expect(404);

    expect(auditLines()).toEqual([
      expect.objectContaining({
        op: 'device.enable',
        result: 'not-found',
        level: 'warn',
        deviceId: 999,
        actor: 'core-service',
      }),
    ]);
  });
});
