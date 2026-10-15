import { ReadinessRegistry } from './readiness.registry.js';

describe('ReadinessRegistry', () => {
  it('AC-7a: reports ok: false when a check throws, ok: true when check passes, and throws on duplicate registration', async () => {
    const registry = new ReadinessRegistry();

    registry.register('a', async () => true);
    registry.register('b', async () => {
      throw new Error('boom');
    });

    const result = await registry.run();
    expect(result).toEqual({
      ok: false,
      checks: {
        a: 'ok',
        b: 'error',
      },
    });

    expect(() => registry.register('a', async () => true)).toThrow(
      /already registered/i,
    );
  });

  it('AC-7a: reports ok: true when all checks pass', async () => {
    const registry = new ReadinessRegistry();

    registry.register('check1', async () => true);
    registry.register('check2', async () => true);

    const result = await registry.run();
    expect(result).toEqual({
      ok: true,
      checks: {
        check1: 'ok',
        check2: 'ok',
      },
    });
  });

  it('AC-7a: reports ok: false when a check returns false', async () => {
    const registry = new ReadinessRegistry();

    registry.register('check1', async () => false);

    const result = await registry.run();
    expect(result).toEqual({
      ok: false,
      checks: {
        check1: 'error',
      },
    });
  });
});
