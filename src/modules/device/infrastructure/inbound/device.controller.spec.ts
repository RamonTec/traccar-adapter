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
import type {
  RegisterDeviceInput,
  RegisterDeviceOutput,
} from '../../application/use-cases/register-device.use-case.js';
import { RegisterDeviceUseCase } from '../../application/use-cases/register-device.use-case.js';
import {
  DeviceAlreadyRegisteredError,
  GroupNotFoundError,
} from '../../domain/errors.js';
import { DeviceController } from './device.controller.js';

class FakeRegisterDeviceUseCase {
  readonly calls: RegisterDeviceInput[] = [];
  result: RegisterDeviceOutput | Error = {
    device: {
      id: 10,
      uniqueId: '123456789012345',
      name: 'Truck 1',
      groupId: 5,
      disabled: false,
    },
    result: 'created',
  };

  execute(input: RegisterDeviceInput): Promise<RegisterDeviceOutput> {
    this.calls.push(input);
    return this.result instanceof Error
      ? Promise.reject(this.result)
      : Promise.resolve(this.result);
  }
}

async function resetLoggerState(): Promise<void> {
  const url = new URL('./rootLogger.js', import.meta.resolve('nestjs-pino'));
  const { resetRootLogger } = (await import(url.href)) as {
    resetRootLogger: () => void;
  };
  resetRootLogger();
}

describe('DeviceController (integration)', () => {
  let app: INestApplication;
  let logs: LogCapture;
  let useCase: FakeRegisterDeviceUseCase;

  beforeEach(async () => {
    await resetLoggerState();
    logs = createLogCapture();
    useCase = new FakeRegisterDeviceUseCase();

    const moduleRef = await Test.createTestingModule({
      imports: [
        LoggingModule.forRoot(testConfig({ logLevel: 'debug' }), logs.stream),
      ],
      controllers: [DeviceController],
      providers: [
        { provide: RegisterDeviceUseCase, useValue: useCase },
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

  function postDevice(body: unknown) {
    return request(app.getHttpServer())
      .post('/devices')
      .set('x-correlation-id', 'cid-1')
      .send(body as object);
  }

  function auditLines(): Record<string, unknown>[] {
    return logs.lines().filter((l) => l.op === 'device.register');
  }

  it('AC-7: invalid body → 400 VALIDATION_ERROR with details, use case not called', async () => {
    const res = await postDevice({
      uniqueId: '123',
      name: '',
      groupId: 0,
    }).expect(400);

    expect(res.body).toMatchObject({
      code: 'VALIDATION_ERROR',
      correlationId: 'cid-1',
    });
    expect((res.body as { details: unknown[] }).details.length).toBeGreaterThan(
      0,
    );
    expect(useCase.calls).toEqual([]);
    expect(auditLines()).toEqual([]);
  });

  it('AC-1 (HTTP): created → 201 with deviceId, uniqueId, groupId', async () => {
    useCase.result = {
      device: {
        id: 10,
        uniqueId: '123456789012345',
        name: 'Truck 1',
        groupId: 5,
        disabled: false,
      },
      result: 'created',
    };

    const res = await postDevice({
      uniqueId: '123456789012345',
      name: 'Truck 1',
      groupId: 5,
    }).expect(201);

    expect(res.body).toEqual({
      deviceId: 10,
      uniqueId: '123456789012345',
      groupId: 5,
    });
    expect(useCase.calls).toEqual([
      {
        uniqueId: '123456789012345',
        name: 'Truck 1',
        groupId: 5,
        actor: 'svc-test',
      },
    ]);
  });

  it('AC-2 (HTTP): existing → 200 with deviceId, uniqueId, groupId', async () => {
    useCase.result = {
      device: {
        id: 10,
        uniqueId: '123456789012345',
        name: 'Truck 1',
        groupId: 5,
        disabled: false,
      },
      result: 'existing',
    };

    const res = await postDevice({
      uniqueId: '123456789012345',
      name: 'Truck 1',
      groupId: 5,
    }).expect(200);

    expect(res.body).toEqual({
      deviceId: 10,
      uniqueId: '123456789012345',
      groupId: 5,
    });
  });

  it('AC-4 (HTTP): retired-and-created → 201 with deviceId, uniqueId, groupId', async () => {
    useCase.result = {
      device: {
        id: 20,
        uniqueId: '123456789012345',
        name: 'Truck 1',
        groupId: 5,
        disabled: false,
      },
      result: 'retired-and-created',
      retiredDeviceId: 18,
    };

    const res = await postDevice({
      uniqueId: '123456789012345',
      name: 'Truck 1',
      groupId: 5,
    }).expect(201);

    expect(res.body).toEqual({
      deviceId: 20,
      uniqueId: '123456789012345',
      groupId: 5,
    });
  });

  it('AC-9: register route requires devices:write role via Reflector', () => {
    const handler = Object.getOwnPropertyDescriptor(
      DeviceController.prototype,
      'register',
    )?.value as () => unknown;
    const role = new Reflector().get<string>(REQUIRED_ROLE_KEY, handler);
    expect(role).toBe('devices:write');
  });

  describe('error mapping and audit ownership', () => {
    const validBody = {
      uniqueId: '123456789012345',
      name: 'Truck 1',
      groupId: 5,
    };

    it.each([
      ['conflict', new DeviceAlreadyRegisteredError('123456789012345', 9), 409],
      ['group not found', new GroupNotFoundError(5), 404],
      ['upstream', new UpstreamUnavailableError('traccar'), 503],
    ] as const)(
      'AC-8: %s keeps its HTTP status (%s)',
      async (_, error, status) => {
        useCase.result = error;

        await postDevice(validBody).expect(status);
      },
    );

    it('ADR-0006: the controller emits no audit line (the use case does)', async () => {
      await postDevice(validBody).expect(201);
      useCase.result = new UpstreamUnavailableError('traccar');
      await postDevice(validBody).expect(503);

      expect(auditLines()).toEqual([]);
    });
  });
});
