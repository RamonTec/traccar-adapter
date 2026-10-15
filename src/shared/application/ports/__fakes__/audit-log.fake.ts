import type { AuditEvent, AuditLogPort } from '../audit-log.port.js';

export class FakeAuditLog implements AuditLogPort {
  readonly events: AuditEvent[] = [];

  record(event: AuditEvent): void {
    this.events.push(event);
  }
}
