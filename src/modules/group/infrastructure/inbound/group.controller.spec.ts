import { type INestApplication, RequestMethod } from '@nestjs/common';
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
  CreateGroupInput,
  CreateGroupOutput,
} from '../../application/use-cases/create-group.use-case.js';
import { CreateGroupUseCase } from '../../application/use-cases/create-group.use-case.js';
import { GroupNameAmbiguousError } from '../../domain/errors.js';
import { GroupController } from './group.controller.js';

class FakeCreateGroupUseCase {
  readonly calls: CreateGroupInput[] = [];
  result: CreateGroupOutput | Error = {
    group: { id: 7, name: 'acme' },
    created: true,
  };

  execute(input: CreateGroupInput): Promise<CreateGroupOutput> {
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

describe('GroupController (integration)', () => {
  let app: INestApplication;
  let logs: LogCapture;
  let useCase: FakeCreateGroupUseCase;

  beforeEach(async () => {
    await resetLoggerState();
    logs = createLogCapture();
    useCase = new FakeCreateGroupUseCase();

    const moduleRef = await Test.createTestingModule({
      imports: [
        LoggingModule.forRoot(testConfig({ logLevel: 'debug' }), logs.stream),
      ],
      controllers: [GroupController],
      providers: [
        { provide: CreateGroupUseCase, useValue: useCase },
        { provide: APP_FILTER, useClass: HttpExceptionFilter },
      ],
    }).compile();

    app = moduleRef.createNestApplication({ bufferLogs: true });
    app.useLogger(app.get(Logger));
    // Stands in for the global JWT guard, which sets the actor.
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

  function postGroup(body: unknown) {
    return request(app.getHttpServer())
      .post('/groups')
      .set('x-correlation-id', 'cid-1')
      .send(body as object);
  }

  function auditLines(): Record<string, unknown>[] {
    return logs.lines().filter((l) => l.op === 'group.create');
  }

  it('AC-4: invalid body → 400 VALIDATION_ERROR with details, use case not called', async () => {
    const res = await postGroup({ name: '   ' }).expect(400);

    expect(res.body).toMatchObject({
      code: 'VALIDATION_ERROR',
      correlationId: 'cid-1',
    });
    expect((res.body as { details: unknown[] }).details.length).toBeGreaterThan(
      0,
    );
    expect(useCase.calls).toEqual([]);
  });

  it('AC-1: created → 201 with groupId and name', async () => {
    useCase.result = { group: { id: 7, name: ' acme ' }, created: true };

    const res = await postGroup({ name: ' acme ' }).expect(201);

    expect(res.body).toEqual({ groupId: 7, name: ' acme ' });
    expect(useCase.calls).toEqual([{ name: ' acme ' }]);
  });

  it('AC-2: existing → 200 with groupId and name', async () => {
    useCase.result = { group: { id: 7, name: 'acme' }, created: false };

    const res = await postGroup({ name: 'acme' }).expect(200);

    expect(res.body).toEqual({ groupId: 7, name: 'acme' });
  });

  it.each([
    {
      result: 'created',
      outcome: { group: { id: 7, name: 'acme' }, created: true },
      status: 201,
      level: 'info',
      groupId: 7,
    },
    {
      result: 'existing',
      outcome: { group: { id: 7, name: 'acme' }, created: false },
      status: 200,
      level: 'info',
      groupId: 7,
    },
    {
      result: 'ambiguous',
      outcome: new GroupNameAmbiguousError('acme', 2),
      status: 409,
      level: 'warn',
      groupId: undefined,
    },
    {
      result: 'failed',
      outcome: new UpstreamUnavailableError('traccar'),
      status: 503,
      level: 'warn',
      groupId: undefined,
    },
  ])(
    'AC-7: logs exactly one audit line with result $result',
    async ({ result, outcome, status, level, groupId }) => {
      useCase.result = outcome;

      await postGroup({ name: 'acme' }).expect(status);

      await vi.waitFor(() => expect(auditLines()).toHaveLength(1));
      const [line] = auditLines();
      expect(line).toMatchObject({
        op: 'group.create',
        actor: 'svc-test',
        name: 'acme',
        result,
        level,
      });
      expect(typeof line?.durationMs).toBe('number');
      if (groupId === undefined) {
        expect(line).not.toHaveProperty('groupId');
      } else {
        expect(line?.groupId).toBe(groupId);
      }
    },
  );

  it('AC-6: create requires the groups:write role', () => {
    const handler = Object.getOwnPropertyDescriptor(
      GroupController.prototype,
      'create',
    )?.value as () => unknown;
    const role = new Reflector().get<string>(REQUIRED_ROLE_KEY, handler);

    expect(role).toBe('groups:write');
  });

  it('AC-8: the only routed handler is create (POST)', () => {
    const proto = GroupController.prototype as unknown as Record<
      string,
      unknown
    >;
    const routed = Object.getOwnPropertyNames(proto)
      .filter((key) => key !== 'constructor')
      .map((key) => ({
        key,
        method: Reflect.getMetadata('method', proto[key] as object) as
          RequestMethod | undefined,
      }))
      .filter((r) => r.method !== undefined);

    expect(routed).toEqual([{ key: 'create', method: RequestMethod.POST }]);
  });
});
