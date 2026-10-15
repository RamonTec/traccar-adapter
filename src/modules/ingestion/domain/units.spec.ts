import { KNOTS_TO_KMH, knotsToKmh } from './units.js';

describe('knotsToKmh', () => {
  it('uses the international knot factor', () => {
    expect(KNOTS_TO_KMH).toBe(1.852);
  });

  it.each([
    [0, 0],
    [10, 18.52],
    [1, 1.85],
    [5.4, 10],
  ])('AC-2a: %d knots → %d km/h', (knots, kmh) => {
    expect(knotsToKmh(knots)).toBe(kmh);
  });

  it.each([0.1, 0.333, 2.7, 7.77, 13.4567, 99.999, 161.98, 300])(
    'AC-2b: %d knots → at most 2 decimals',
    (knots) => {
      const kmh = knotsToKmh(knots);
      expect(Math.round(kmh * 100) / 100).toBe(kmh);
      expect(kmh).toBeCloseTo(knots * KNOTS_TO_KMH, 2);
    },
  );
});
