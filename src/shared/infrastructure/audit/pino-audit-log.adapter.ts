import { Logger } from '@nestjs/common';
import type {
  AuditEvent,
  AuditLogPort,
} from '../../application/ports/audit-log.port.js';

/** Emits the audit line (coding.md › Auditoría de operaciones). Never throws. */
export class PinoAuditLogAdapter implements AuditLogPort {
  private readonly logger = new Logger('Audit');

  record(event: AuditEvent): void {
    try {
      // Fixed fields go last so a business id can never overwrite them.
      const line = {
        ...event.fields,
        msg: event.op,
        op: event.op,
        actor: event.actor,
        result: event.result,
        durationMs: event.durationMs,
      };
      if (event.succeeded) this.logger.log(line);
      else this.logger.warn(line);
    } catch {
      // A failure to audit must not break the operation.
    }
  }
}
