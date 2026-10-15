import { SystemClock } from './system-clock.js';

describe('SystemClock', () => {
  it('returns non-decreasing monotonic milliseconds', () => {
    const clock = new SystemClock();

    const first = clock.now();
    const second = clock.now();

    expect(second).toBeGreaterThanOrEqual(first);
  });
});
