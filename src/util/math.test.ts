import { describe, expect, it } from 'vitest';
import { clamp, lerp, mulberry32, segmentDistance, sinHash, smoothstep, wrapAngle } from './math';

describe('math helpers', () => {
  it('clamps, lerps, and eases', () => {
    expect(clamp(5, 0, 1)).toBe(1);
    expect(clamp(-5, 0, 1)).toBe(0);
    expect(clamp(0.4, 0, 1)).toBe(0.4);
    expect(lerp(2, 4, 0.25)).toBe(2.5);
    expect(smoothstep(0, 1, -1)).toBe(0);
    expect(smoothstep(0, 1, 2)).toBe(1);
    expect(smoothstep(0, 1, 0.5)).toBe(0.5);
    expect(smoothstep(0, 2, 0.5)).toBeCloseTo(0.15625, 10);
  });

  it('wraps angles into [−π, π)', () => {
    expect(wrapAngle(0)).toBe(0);
    expect(wrapAngle(Math.PI * 3)).toBeCloseTo(-Math.PI, 10);
    expect(wrapAngle(-Math.PI * 1.5)).toBeCloseTo(Math.PI * 0.5, 10);
    expect(wrapAngle(7)).toBeCloseTo(7 - Math.PI * 2, 10);
  });

  it('measures distance to a segment, including past its ends and for a zero-length one', () => {
    expect(segmentDistance(5, 3, 0, 0, 10, 0)).toBe(3);
    expect(segmentDistance(-3, 4, 0, 0, 10, 0)).toBe(5);
    expect(segmentDistance(3, 4, 0, 0, 0, 0)).toBe(5);
  });

  it('gives a repeatable seeded sequence in [0, 1)', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const values = Array.from({ length: 50 }, () => a());
    expect(values).toEqual(Array.from({ length: 50 }, () => b()));
    expect(values.every((v) => v >= 0 && v < 1)).toBe(true);
    expect(mulberry32(1)()).not.toBe(mulberry32(2)());
  });

  it('hashes a point into [0, 1)', () => {
    const h = sinHash(12.5, -7, 3);
    expect(h).toBe(sinHash(12.5, -7, 3));
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThan(1);
  });
});
