import { describe, expect, it } from 'vitest';
import { bearingOf, formatDistance, relativeBearing } from './compass';

describe('compass', () => {
  it('reads bearings clockwise from north (-z), with east at +x', () => {
    expect(bearingOf(0, -1)).toBeCloseTo(0, 6);
    expect(bearingOf(1, 0)).toBeCloseTo(Math.PI / 2, 6);
    expect(bearingOf(0, 1)).toBeCloseTo(Math.PI, 6);
    expect(bearingOf(-1, 0)).toBeCloseTo(Math.PI * 1.5, 6);
  });

  it('turns the short way to a target', () => {
    expect(relativeBearing(0.1, Math.PI * 2 - 0.1)).toBeCloseTo(0.2, 6);
    expect(relativeBearing(Math.PI * 2 - 0.1, 0.1)).toBeCloseTo(-0.2, 6);
    expect(relativeBearing(Math.PI * 1.5, Math.PI / 2)).toBeCloseTo(Math.PI, 6);
  });

  it('keeps distances short', () => {
    expect(formatDistance(0.2)).toBe('1 m');
    expect(formatDistance(23.6)).toBe('24 m');
    expect(formatDistance(1234)).toBe('1.2 km');
  });
});
