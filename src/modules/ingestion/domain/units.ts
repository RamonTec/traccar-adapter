export const KNOTS_TO_KMH = 1.852;

/** Traccar reports speed in knots; the event contract uses km/h with 2 decimals. */
export function knotsToKmh(knots: number): number {
  return Math.round(knots * KNOTS_TO_KMH * 100) / 100;
}
