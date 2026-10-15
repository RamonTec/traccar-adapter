import { Inject, Injectable, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  AUDIT_LOG_PORT,
  type AuditLogPort,
} from '../../application/ports/audit-log.port.js';
import {
  CLOCK_PORT,
  type ClockPort,
} from '../../application/ports/clock.port.js';
import { AuditModule } from './audit.module.js';
import { PinoAuditLogAdapter } from './pino-audit-log.adapter.js';
import { SystemClock } from './system-clock.js';

@Injectable()
class Consumer {
  constructor(
    @Inject(AUDIT_LOG_PORT) readonly audit: AuditLogPort,
    @Inject(CLOCK_PORT) readonly clock: ClockPort,
  ) {}
}

// A feature module that does not import AuditModule itself.
@Module({ providers: [Consumer] })
class FeatureModule {}

describe('AuditModule', () => {
  it('provides the audit log and clock globally', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AuditModule, FeatureModule],
    }).compile();

    const consumer = moduleRef.get(Consumer);
    expect(consumer.audit).toBeInstanceOf(PinoAuditLogAdapter);
    expect(consumer.clock).toBeInstanceOf(SystemClock);
  });
});
