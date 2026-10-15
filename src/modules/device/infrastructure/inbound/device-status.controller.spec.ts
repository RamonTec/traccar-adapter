import { type INestApplication } from '@nestjs/common';
import { APP_FILTER, Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import type { NextFunction, Response } from 'express';
import { Logger } from 'nestjs-pino';
import request from 'supertest';
import { UpstreamUnavailableError } from '../../../../shared/domain/upstream-unavailable.error.js';
import {
  type AuthenticatedRequest,
  REQUIRED_ROLE_KEY,
} from '../../../../shared/infrastructure/auth/auth.decorators.js';
import { HttpExceptionFilter } from '../../../../shared/infrastructure/http/http-exception.filter.js';
import { LoggingModule } from '../../../../shared/infrastructure/logging/logging.module.js';
import {
  createLogCapture,
  type LogCapture,
} from '../../../../../test/support/log-capture.js';
import { testConfig } from '../../../../../test/support/test-env.js';
import {
  type SetDeviceStatusInput,
  type SetDeviceStatusOutput,
  SetDeviceStatusUseCase,
} from '../../application/use-cases/set-device-status.use-case.js';
import {
  DeviceNotFoundError,
  DeviceRetiredError,
} from '../../domain/errors.js';
import { DeviceStatusController } from './device-status.controller.js';

class FakeSetDeviceStatusUseCase {
  readonly calls: SetDeviceStatusInput[] = [];
  changed = true;
  error?: Error;

  execute(input: SetDeviceStatusInput): Promise<SetDeviceStatusOutput> {
    this.calls.push(input);
    if (this.error) return Promise.reject(this.error);
    return Promise.resolve({
      device: {
        id: input.deviceId,
        uniqueId: '123456789012345',
        name: 'Truck 1',
        groupId: 3,
        disabled: input.disabled,
      },
      changed: this.changed,
    });
  }
}

async function resetLoggerState(): Promise<void> {
  const url = new URL('./rootLogger.js', import.meta.resolve('nestjs-pino'));
  const { resetRootLogger } = (await import(url.href)) as {
    resetRootLogger: () => void;
  };
  resetRootLogger();
}

describe('DeviceStatusController (integration)', () => {
  let app: INestApplication;
  let logs: LogCapture;
  let useCase: FakeSetDeviceStatusUseCase;

  beforeEach(async () => {
    await resetLoggerState();
    logs = createLogCapture();
    useCase = new FakeSetDeviceStatusUseCase();

    const moduleRef = await Test.createTestingModule({
      imports: [
        LoggingModule.forRoot(testConfig({ logLevel: 'debug' }), logs.stream),
      ],
      controllers: [DeviceStatusController],
      providers: [
        { provide: SetDeviceStatusUseCase, useValue: useCase },
        { provide: APP_FILTER, useClass: HttpExceptionFilter },
      ],
    }).compile();

    app = moduleRef.createNestApplication({ bufferLogs: true });
    app.useLogger(app.get(Logger));
    app.use((req: AuthenticatedRequest, _res: Response, next: NextFunction) => {
      req.actor = 'svc-test';
      next();
    });
    await app.init();
  });

  afterEach(async () => {
    if (app) await app.close();
    await resetLoggerState();
  });

  function post(path: string, body?: unknown) {
    const req = request(app.getHttpServer())
      .post(path)
      .set('x-correlation-id', 'cid-1');
    return body === undefined ? req : req.send(body as object);
  }

  function auditLines(): Record<string, unknown>[] {
    return logs
      .lines()
      .filter((l) => l.op === 'device.disable' || l.op === 'device.enable');
  }

  it.each(['0', '-1', 'abc', '1.5', '99999999999999999999'])(
    'AC-6: deviceId %s → 400 VALIDATION_ERROR with details, use case not called',
    async (id) => {
      const res = await post(`/devices/${id}/disable`).expect(400);

      expect(res.body).toMatchObject({
        code: 'VALIDATION_ERROR',
        correlationId: 'cid-1',
      });
      expect(
        (res.body as { details: unknown[] }).details.length,
      ).toBeGreaterThan(0);
      expect(useCase.calls).toEqual([]);
      expect(auditLines()).toEqual([]);
    },
  );

  it('AC-9a: body with properties → 400 VALIDATION_ERROR', async () => {
    const res = await post('/devices/18/disable', { x: 1 }).expect(400);

    expect(res.body).toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(useCase.calls).toEqual([]);
  });

  it.each([undefined, {}])('AC-9a: body %j is accepted', async (body) => {
    await post('/devices/18/enable', body).expect(200);
  });

  it.each(['disable', 'enable'])(
    'AC-9b: %s route requires devices:write',
    (method) => {
      const handler = Object.getOwnPropertyDescriptor(
        DeviceStatusController.prototype,
        method,
      )?.value as () => unknown;

      expect(new Reflector().get<string>(REQUIRED_ROLE_KEY, handler)).toBe(
        'devices:write',
      );
    },
  );

  it.each([
    ['disable', true],
    ['enable', false],
  ] as const)(
    '%s delegates with disabled=%s and answers 200 {deviceId, disabled}',
    async (route, disabled) => {
      for (const changed of [true, false]) {
        useCase.changed = changed;
        const res = await post(`/devices/18/${route}`).expect(200);
        expect(res.body).toEqual({ deviceId: 18, disabled });
      }
      expect(useCase.calls).toEqual([
        { deviceId: 18, disabled },
        { deviceId: 18, disabled },
      ]);
    },
  );

  it('AC-6: DeviceNotFoundError → 404 DEVICE_NOT_FOUND', async () => {
    useCase.error = new DeviceNotFoundError(999);

    const res = await post('/devices/999/disable').expect(404);

    expect(res.body).toMatchObject({ code: 'DEVICE_NOT_FOUND' });
  });

  it('DeviceRetiredError → 409 DEVICE_RETIRED', async () => {
    useCase.error = new DeviceRetiredError(18);

    const res = await post('/devices/18/enable').expect(409);

    expect(res.body).toMatchObject({ code: 'DEVICE_RETIRED' });
  });

  describe('AC-10: audit log', () => {
    it.each([
      ['disable', 'device.disable', 'changed', true],
      ['enable', 'device.enable', 'unchanged', false],
    ] as const)(
      '%s → one info %s line with result %s',
      async (route, op, result, changed) => {
        useCase.changed = changed;

        await post(`/devices/18/${route}`).expect(200);

        const lines = auditLines();
        expect(lines).toHaveLength(1);
        expect(lines[0]).toMatchObject({
          op,
          actor: 'svc-test',
          deviceId: 18,
          result,
          level: 'info',
        });
        expect(typeof lines[0]!.durationMs).toBe('number');
      },
    );

    it.each([
      ['retired', new DeviceRetiredError(18), 409],
      ['not-found', new DeviceNotFoundError(18), 404],
      ['failed', new UpstreamUnavailableError('traccar'), 503],
    ] as const)(
      'one warn line with result %s',
      async (result, error, status) => {
        useCase.error = error;

        await post('/devices/18/enable').expect(status);

        const lines = auditLines();
        expect(lines).toHaveLength(1);
        expect(lines[0]).toMatchObject({
          op: 'device.enable',
          actor: 'svc-test',
          deviceId: 18,
          result,
          level: 'warn',
        });
      },
    );
  });
});
