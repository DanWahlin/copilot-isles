import { describe, expect, it } from 'vitest';
import { applyIslandMood, resetMood } from './mood';

const fresh = () => ({ fogScale: 7, hazeTint: [7, 7, 7] as [number, number, number], fill: 7, exposure: 7 });
const DUSK = { fogScale: 1.8, hazeTint: [0.93, 0.97, 1.0] as const, fill: 3.2, exposure: 1.6 };
const HAZE = { fogScale: 3, hazeTint: [0.9, 0.97, 1.0] as const };

describe('island moods', () => {
  it("leaves the air as it is for an island out of reach (one far off doesn't undo the one you're at)", () => {
    const mood = fresh();
    resetMood(mood);
    applyIslandMood(mood, DUSK, 1);
    applyIslandMood(mood, HAZE, 0);
    expect(mood).toEqual({ fogScale: 1.8, hazeTint: [0.93, 0.97, 1.0], fill: 3.2, exposure: 1.6 });
  });

  it('eases one island in with its reach, as each stream did alone', () => {
    const mood = fresh();
    resetMood(mood);
    expect(mood).toEqual({ fogScale: 1, hazeTint: [1, 1, 1], fill: 1, exposure: 1 });
    applyIslandMood(mood, HAZE, 0.5);
    expect(mood.fogScale).toBeCloseTo(2);
    expect(mood.hazeTint[0]).toBeCloseTo(0.95);
    expect(mood.fill).toBe(1);
    expect(mood.exposure).toBe(1);
  });

  it('multiplies where two reaches meet', () => {
    const mood = fresh();
    resetMood(mood);
    applyIslandMood(mood, DUSK, 0.5);
    applyIslandMood(mood, HAZE, 0.5);
    expect(mood.fogScale).toBeCloseTo(1.4 * 2);
  });
});
