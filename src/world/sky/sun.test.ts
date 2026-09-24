import { describe, expect, it } from 'vitest';
import { sunState } from './sun';

describe('sunState', () => {
  it('is high at noon, below the horizon at midnight', () => {
    expect(sunState(12).sun[1]).toBeGreaterThan(0.9);
    expect(sunState(0).sun[1]).toBeLessThan(-0.5);
  });

  it('rises in the east and sets in the west (azimuth 0)', () => {
    expect(sunState(7).sun[0]).toBeGreaterThan(0.5);
    expect(sunState(17).sun[0]).toBeLessThan(-0.5);
  });

  it('azimuth rotates the path around +y without changing elevation', () => {
    const a = sunState(16, 0).sun,
      b = sunState(16, 90).sun;
    expect(b[1]).toBeCloseTo(a[1], 10);
    expect(Math.hypot(b[0], b[2])).toBeCloseTo(Math.hypot(a[0], a[2]), 10);
    expect(b[0]).not.toBeCloseTo(a[0], 2);
  });

  it('night factor and key light hand off smoothly', () => {
    expect(sunState(13).night).toBe(0);
    expect(sunState(1).night).toBe(1);
    expect(sunState(1).key).toBe('moon');
    expect(sunState(13).key).toBe('sun');
    const dusk = sunState(18.6).night;
    expect(dusk).toBeGreaterThanOrEqual(0);
    expect(dusk).toBeLessThanOrEqual(1);
  });

  it('returns unit vectors', () => {
    for (const h of [0, 5.5, 9, 12, 18.2, 23]) {
      const { sun, moon } = sunState(h, 37);
      expect(Math.hypot(...sun)).toBeCloseTo(1, 10);
      expect(Math.hypot(...moon)).toBeCloseTo(1, 10);
    }
  });
});
