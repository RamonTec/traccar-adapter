export const CLOCK_PORT = Symbol('ClockPort');

export interface ClockPort {
  /** Monotonic milliseconds, only for measuring durations. */
  now(): number;
}
