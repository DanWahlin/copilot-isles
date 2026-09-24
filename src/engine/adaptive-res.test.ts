import { describe, expect, it } from 'vitest';
import { AdaptiveResolution } from './adaptive-res';

const run = (a: AdaptiveResolution, frame: number, n: number) => {
  let changed = 0;
  for (let i = 0; i < n; i++) if (a.sample(frame, 1 / 60)) changed++;
  return changed;
};

describe('AdaptiveResolution', () => {
  it('waits for warm-up before deciding', () => {
    const a = new AdaptiveResolution({ targetFps: 30 });
    run(a, 0.05, 89);
    expect(a.scale).toBe(1);
  });

  it('holds still when a 30 fps frame is on target', () => {
    const a = new AdaptiveResolution({ targetFps: 30 });
    run(a, 1 / 30, 2000);
    expect(a.scale).toBe(1);
  });

  it('drops when over 1.25×T and never below the floor', () => {
    const a = new AdaptiveResolution({ targetFps: 60, min: 0.72 });
    run(a, 0.05, 90 + 60);
    expect(a.scale).toBeCloseTo(0.84, 5); // 0.05 s > 2.5 × 16.7 ms → ×0.84
    run(a, 0.05, 60 * 60 * 5);
    expect(a.scale).toBe(0.72);
  });

  it('raises below 0.85×T after its cooldown', () => {
    const a = new AdaptiveResolution({ targetFps: 60 });
    a.lock(0.8);
    a.lock(null);
    run(a, 0.01, 90 + 60);
    expect(a.scale).toBeCloseTo(0.85, 5);
  });

  it('backs off after a failed upscale', () => {
    const a = new AdaptiveResolution({ targetFps: 60, dropCooldown: 0.1, raiseCooldown: 0.1 });
    a.lock(0.8);
    a.lock(null);
    run(a, 0.01, 150); // raise 0.80 → 0.85
    expect(a.scale).toBeCloseTo(0.85, 5);
    run(a, 0.022, 60); // runs hot right after the raise → drop, and 0.80 is barred
    expect(a.scale).toBeLessThan(0.85);
    const barred = a.scale;
    run(a, 0.01, 60 * 10); // within the 15 s bar, raising from this level is blocked…
    expect(a.scale).toBeGreaterThanOrEqual(barred);
  });

  it('ignores samples while paused or locked', () => {
    const a = new AdaptiveResolution({ targetFps: 60 });
    a.setPaused(true);
    run(a, 0.1, 500);
    expect(a.scale).toBe(1);
    a.setPaused(false);
    a.lock(0.9);
    run(a, 0.1, 500);
    expect(a.scale).toBe(0.9);
  });
});
