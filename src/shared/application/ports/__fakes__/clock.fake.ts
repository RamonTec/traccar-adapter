import type { ClockPort } from '../clock.port.js';

/** Advances `stepMs` on every call, so each audited run measures exactly `stepMs`. */
export class FakeClock implements ClockPort {
  private current = 0;

  constructor(private readonly stepMs = 5) {}

  now(): number {
    const value = this.current;
    this.current += this.stepMs;
    return value;
  }
}
