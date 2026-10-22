import { describe, expect, test } from 'vitest';
import { CLOUD_DRIFT_EASE_S, easeCloudDrift } from './cloud-drift';

describe('live cloud drift under reduced motion (issue 2)', () => {
  test('ramps to a stop and back without overshooting', () => {
    let s = 1;
    const dt = 1 / 60;
    const frames = Math.ceil(CLOUD_DRIFT_EASE_S / dt) + 2;
    for (let i = 0; i < frames; i += 1) {
      const next = easeCloudDrift(s, true, dt);
      expect(next).toBeLessThanOrEqual(s);
      expect(s - next).toBeLessThanOrEqual(dt / CLOUD_DRIFT_EASE_S + 1e-9);
      s = next;
    }
    expect(s).toBe(0);
    expect(easeCloudDrift(0, true, 10)).toBe(0);
    for (let i = 0; i < frames; i += 1) s = easeCloudDrift(s, false, dt);
    expect(s).toBe(1);
    expect(easeCloudDrift(1, false, 10)).toBe(1);
    expect(easeCloudDrift(0.5, false, -1)).toBe(0.5);
  });

  test('the clouds hold still while it is on, and never jump when it changes', () => {
    // The clouds' wind offset, advanced like Clouds.update (offset += wind × dt × driftScale).
    const wind = 2.5;
    const dt = 1 / 60;
    let scale = 1;
    let offset = 0;
    let stillFrom = -1;
    const track: number[] = [];
    for (let frame = 0; frame < 60 * 20; frame += 1) {
      const t = frame * dt;
      const reduced = t >= 5 && t < 12;
      scale = easeCloudDrift(scale, reduced, dt);
      const step = wind * dt * scale;
      // No pop: each frame moves at most one frame of the full drift.
      expect(step).toBeLessThanOrEqual(wind * dt + 1e-9);
      offset += step;
      track.push(offset);
      if (reduced && scale === 0 && stillFrom < 0) stillFrom = frame;
    }
    // Still within the ease of the toggle, then not a millimetre until the setting is off again.
    expect(stillFrom * dt).toBeLessThan(5 + CLOUD_DRIFT_EASE_S + 0.05);
    const stopEnd = Math.round(12 / dt) - 1;
    expect(track[stopEnd]).toBe(track[stillFrom]);
    // Drifting again, back at full speed once eased in.
    const last = track.length - 1;
    expect(track[last]! - track[last - 1]!).toBeCloseTo(wind * dt, 9);
    expect(track[last]!).toBeGreaterThan(track[stopEnd]!);
  });
});
