import { Global, Module } from '@nestjs/common';
import { AUDIT_LOG_PORT } from '../../application/ports/audit-log.port.js';
import { CLOCK_PORT } from '../../application/ports/clock.port.js';
import { PinoAuditLogAdapter } from './pino-audit-log.adapter.js';
import { SystemClock } from './system-clock.js';

@Global()
@Module({
  providers: [
    { provide: AUDIT_LOG_PORT, useClass: PinoAuditLogAdapter },
    { provide: CLOCK_PORT, useClass: SystemClock },
  ],
  exports: [AUDIT_LOG_PORT, CLOCK_PORT],
})
export class AuditModule {}
