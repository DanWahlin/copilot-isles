import { describe, expect, it } from 'vitest';
import { clamp, lerp, smoothstep, wrapAngle } from './math';

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
});
