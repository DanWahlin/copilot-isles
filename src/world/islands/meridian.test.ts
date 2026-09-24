import { describe, expect, it } from 'vitest';
import { MERIDIAN, meridianHeight, meridianMasks } from './meridian';

describe('Port Meridian terrain', () => {
  it('keeps named district pads flat enough for future town placement', () => {
    for (const pad of Object.values(MERIDIAN.pads)) {
      expect(meridianHeight(pad.x, pad.z)).toBeCloseTo(pad.height, 0);
      expect(Math.abs(meridianHeight(pad.x + 4, pad.z) - meridianHeight(pad.x - 4, pad.z))).toBeLessThan(1.8);
    }
  });

  it('has a dredged southwest harbor and a high northeastern ridge', () => {
    expect(meridianHeight(MERIDIAN.harbor.center.x, MERIDIAN.harbor.center.z)).toBeLessThan(-5);
    expect(meridianHeight(MERIDIAN.ridge.center.x, MERIDIAN.ridge.center.z)).toBeGreaterThan(120);
    expect(meridianHeight(MERIDIAN.pads.citadel.x, MERIDIAN.pads.citadel.z)).toBeGreaterThan(55);
  });

  it('returns normalized material masks', () => {
    for (const [x, z] of [
      [MERIDIAN.pads.harborPlaza.x, MERIDIAN.pads.harborPlaza.z],
      [MERIDIAN.ridge.center.x, MERIDIAN.ridge.center.z],
      [MERIDIAN.harbor.center.x, MERIDIAN.harbor.center.z],
    ]) {
      const masks = meridianMasks(x, z);
      const sum = masks.sand + masks.grass + masks.rock + masks.cliff;
      expect(sum).toBeGreaterThan(0.99);
      expect(sum).toBeLessThan(1.01);
    }
  });
});
