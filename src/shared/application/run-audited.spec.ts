import type { AuditEvent, AuditLogPort } from './ports/audit-log.port.js';
import type { ClockPort } from './ports/clock.port.js';
import { type AuditedOperation, runAudited } from './run-audited.js';

class FakeAuditLog implements AuditLogPort {
  readonly events: AuditEvent[] = [];
  failWith?: Error;

  record(event: AuditEvent): void {
    if (this.failWith) throw this.failWith;
    this.events.push(event);
  }
}

class FakeClock implements ClockPort {
  constructor(private readonly values: number[]) {}
  now(): number {
    return this.values.shift() ?? 0;
  }
}

class RejectedError extends Error {}

function operation(
  overrides: Partial<AuditedOperation<string>> = {},
): AuditedOperation<string> {
  return {
    op: 'thing.do',
    actor: 'svc',
    fields: { name: 'n' },
    success: (out) => ({ result: 'done', fields: { id: out.length } }),
    failure: (err) => ({
      result: err instanceof RejectedError ? 'rejected' : 'failed',
    }),
    ...overrides,
  };
}

describe('runAudited', () => {
  let audit: FakeAuditLog;

  beforeEach(() => {
    audit = new FakeAuditLog();
  });

  it('AC-9: success records exactly one event merging base and outcome fields', async () => {
    const out = await runAudited(
      { audit, clock: new FakeClock([100, 110]) },
      operation(),
      () => Promise.resolve('abc'),
    );

    expect(out).toBe('abc');
    expect(audit.events).toEqual([
      {
        op: 'thing.do',
        actor: 'svc',
        result: 'done',
        succeeded: true,
        durationMs: 10,
        fields: { name: 'n', id: 3 },
      },
    ]);
  });

  it('AC-5: durationMs is a rounded, non-negative integer', async () => {
    await runAudited(
      { audit, clock: new FakeClock([100, 112.6]) },
      operation(),
      () => Promise.resolve('x'),
    );
    await runAudited(
      { audit, clock: new FakeClock([100, 90]) },
      operation(),
      () => Promise.resolve('x'),
    );

    expect(audit.events.map((e) => e.durationMs)).toEqual([13, 0]);
  });

  it('AC-8: rethrows the same error and records a failed event', async () => {
    const error = new RejectedError('nope');

    await expect(
      runAudited({ audit, clock: new FakeClock([0, 5]) }, operation(), () =>
        Promise.reject(error),
      ),
    ).rejects.toBe(error);
    expect(audit.events).toEqual([
      expect.objectContaining({
        result: 'rejected',
        succeeded: false,
        fields: { name: 'n' },
      }),
    ]);
  });

  it('AC-9: undefined fields are omitted', async () => {
    await runAudited(
      { audit, clock: new FakeClock([0, 0]) },
      operation({
        fields: { name: 'n', missing: undefined },
        success: () => ({ result: 'done', fields: { other: undefined } }),
      }),
      () => Promise.resolve('x'),
    );

    expect(audit.events[0]!.fields).toEqual({ name: 'n' });
  });

  it('AC-6: a missing actor is recorded as undefined', async () => {
    await runAudited(
      { audit, clock: new FakeClock([0, 0]) },
      operation({ actor: undefined }),
      () => Promise.resolve('x'),
    );

    expect(audit.events[0]!.actor).toBeUndefined();
  });

  it('AC-7: a failing audit log never changes the outcome', async () => {
    audit.failWith = new Error('log down');
    const error = new Error('op failed');

    await expect(
      runAudited({ audit, clock: new FakeClock([0, 0]) }, operation(), () =>
        Promise.resolve('ok'),
      ),
    ).resolves.toBe('ok');
    await expect(
      runAudited({ audit, clock: new FakeClock([0, 0]) }, operation(), () =>
        Promise.reject(error),
      ),
    ).rejects.toBe(error);
  });
});
