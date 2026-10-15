import type { ClockPort } from '../../application/ports/clock.port.js';

export class SystemClock implements ClockPort {
  now(): number {
    return performance.now();
  }
}
