import type { AuditLogPort } from './ports/audit-log.port.js';
import type { ClockPort } from './ports/clock.port.js';

/** undefined values are omitted from the audit line. */
export type AuditFields = Readonly<Record<string, string | number | undefined>>;

export interface AuditOutcome {
  readonly result: string;
  readonly fields?: AuditFields;
}

export interface AuditedOperation<T> {
  readonly op: string;
  readonly actor: string | undefined;
  /** Business ids known before running. */
  readonly fields: AuditFields;
  success(output: T): AuditOutcome;
  failure(error: unknown): AuditOutcome;
}

export interface AuditDeps {
  readonly audit: AuditLogPort;
  readonly clock: ClockPort;
}

/** Measures, runs, classifies and records exactly one audit event; rethrows the original error. */
export async function runAudited<T>(
  deps: AuditDeps,
  operation: AuditedOperation<T>,
  run: () => Promise<T>,
): Promise<T> {
  const start = deps.clock.now();
  let output: T;
  try {
    output = await run();
  } catch (error) {
    record(deps, operation, start, operation.failure(error), false);
    throw error;
  }
  record(deps, operation, start, operation.success(output), true);
  return output;
}

function record<T>(
  { audit, clock }: AuditDeps,
  operation: AuditedOperation<T>,
  start: number,
  outcome: AuditOutcome,
  succeeded: boolean,
): void {
  try {
    audit.record({
      op: operation.op,
      actor: operation.actor,
      result: outcome.result,
      succeeded,
      durationMs: Math.max(0, Math.round(clock.now() - start)),
      fields: definedOnly({ ...operation.fields, ...outcome.fields }),
    });
  } catch {
    // Auditing must never change the operation's outcome (AC-7).
  }
}

function definedOnly(fields: AuditFields): Record<string, string | number> {
  return Object.fromEntries(
    Object.entries(fields).filter(
      (entry): entry is [string, string | number] => entry[1] !== undefined,
    ),
  );
}
