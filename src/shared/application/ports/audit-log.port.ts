export const AUDIT_LOG_PORT = Symbol('AuditLogPort');

/** One audited operation execution (ADR-0006, coding.md › Auditoría de operaciones). */
export interface AuditEvent {
  /** '<recurso>.<acción>', e.g. 'group.create'. */
  readonly op: string;
  readonly actor: string | undefined;
  readonly result: string;
  /** Selects the level (info/warn); not logged as a field. */
  readonly succeeded: boolean;
  /** Integer ≥ 0. */
  readonly durationMs: number;
  readonly fields: Readonly<Record<string, string | number>>;
}

export interface AuditLogPort {
  record(event: AuditEvent): void;
}
