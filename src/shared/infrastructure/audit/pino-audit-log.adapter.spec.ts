import { type INestApplication, Logger as NestLogger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Logger } from 'nestjs-pino';
import {
  createLogCapture,
  type LogCapture,
} from '../../../../test/support/log-capture.js';
import { testConfig } from '../../../../test/support/test-env.js';
import type { AuditEvent } from '../../application/ports/audit-log.port.js';
import { LoggingModule } from '../logging/logging.module.js';
import { PinoAuditLogAdapter } from './pino-audit-log.adapter.js';

async function resetLoggerState(): Promise<void> {
  const url = new URL('./rootLogger.js', import.meta.resolve('nestjs-pino'));
  const { resetRootLogger } = (await import(url.href)) as {
    resetRootLogger: () => void;
  };
  resetRootLogger();
}

const event: AuditEvent = {
  op: 'group.create',
  actor: 'svc-test',
  result: 'created',
  succeeded: true,
  durationMs: 7,
  fields: { name: 'fleet-a', groupId: 3 },
};

describe('PinoAuditLogAdapter (integration)', () => {
  let app: INestApplication;
  let logs: LogCapture;
  const adapter = new PinoAuditLogAdapter();

  beforeEach(async () => {
    await resetLoggerState();
    logs = createLogCapture();
    const moduleRef = await Test.createTestingModule({
      imports: [
        LoggingModule.forRoot(testConfig({ logLevel: 'debug' }), logs.stream),
      ],
    }).compile();
    app = moduleRef.createNestApplication({ bufferLogs: true });
    app.useLogger(app.get(Logger));
    await app.init();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await app.close();
    await resetLoggerState();
  });

  function auditLines(): Record<string, unknown>[] {
    return logs.lines().filter((l) => l.context === 'Audit');
  }

  it('AC-1: success → one info line with the fixed fields and the business ids', () => {
    adapter.record(event);

    expect(auditLines()).toEqual([
      expect.objectContaining({
        level: 'info',
        context: 'Audit',
        msg: 'group.create',
        op: 'group.create',
        actor: 'svc-test',
        result: 'created',
        durationMs: 7,
        name: 'fleet-a',
        groupId: 3,
      }),
    ]);
    expect(auditLines()[0]).not.toHaveProperty('succeeded');
  });

  it('AC-1: failure → warn line', () => {
    adapter.record({ ...event, result: 'failed', succeeded: false });

    expect(auditLines()).toEqual([
      expect.objectContaining({ level: 'warn', result: 'failed' }),
    ]);
  });

  it('AC-9: business ids cannot overwrite the fixed fields', () => {
    adapter.record({
      ...event,
      fields: {
        op: 'x',
        result: 'y',
        msg: 'z',
        durationMs: 999,
        actor: 'evil',
      },
    });

    expect(auditLines()[0]).toMatchObject({
      msg: 'group.create',
      op: 'group.create',
      result: 'created',
      durationMs: 7,
      actor: 'svc-test',
    });
  });

  it('AC-6: no actor → the line has no actor key', () => {
    adapter.record({ ...event, actor: undefined });

    expect(auditLines()[0]).not.toHaveProperty('actor');
  });

  it('AC-7: never throws even if the logger fails', () => {
    vi.spyOn(NestLogger.prototype, 'log').mockImplementation(() => {
      throw new Error('logger down');
    });

    expect(() => adapter.record(event)).not.toThrow();
  });
});
