import {
  currentCorrelationId,
  runWithRequestContext,
} from './request-context.js';

describe('RequestContext', () => {
  it('AC-6a: outside any context, currentCorrelationId() returns undefined', () => {
    expect(currentCorrelationId()).toBeUndefined();
  });

  it('AC-6b: inside runWithRequestContext, reads correlationId across async operations', async () => {
    const result = await runWithRequestContext(
      { correlationId: 'corr-123' },
      async () => {
        expect(currentCorrelationId()).toBe('corr-123');
        await new Promise((resolve) => setTimeout(resolve, 10));
        expect(currentCorrelationId()).toBe('corr-123');
        return currentCorrelationId();
      },
    );

    expect(result).toBe('corr-123');
    expect(currentCorrelationId()).toBeUndefined();
  });

  it('AC-6b: concurrent contexts do not leak or mix', async () => {
    const runBranch = async (
      id: string,
      delayMs: number,
    ): Promise<string[]> => {
      return runWithRequestContext({ correlationId: id }, async () => {
        const step1 = currentCorrelationId()!;
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        const step2 = currentCorrelationId()!;
        return [step1, step2];
      });
    };

    const [branchA, branchB] = await Promise.all([
      runBranch('ctx-a', 20),
      runBranch('ctx-b', 10),
    ]);

    expect(branchA).toEqual(['ctx-a', 'ctx-a']);
    expect(branchB).toEqual(['ctx-b', 'ctx-b']);
    expect(currentCorrelationId()).toBeUndefined();
  });
});
