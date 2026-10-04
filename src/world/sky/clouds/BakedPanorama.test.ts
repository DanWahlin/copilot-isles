import { describe, expect, it } from 'vitest';
import { ISLANDS } from '../../../game/islands';
import { sunState } from '../sun';
import { SKY_KEYS, bakeAzimuthDeg, keyBlend } from './BakedPanorama';

const elevation = (hours: number, az = 0) => sunState(hours, az).sun[1];

describe('baked sky keys', () => {
  it('are in order of sun height', () => {
    for (let i = 1; i < SKY_KEYS.length; i++)
      expect(elevation(SKY_KEYS[i]!.hours)).toBeGreaterThan(elevation(SKY_KEYS[i - 1]!.hours));
  });

  it('show each island at one key, with nothing to blend', () => {
    for (const island of [ISLANDS.anchorage, ISLANDS.meridian]) {
      const k = keyBlend(elevation(island.sky.hours));
      expect(Math.min(k.t, 1 - k.t)).toBeLessThan(1e-9);
    }
  });

  it('blend the two keys either side of the sun', () => {
    const lo = elevation(SKY_KEYS[1]!.hours);
    const hi = elevation(SKY_KEYS[2]!.hours);
    expect(keyBlend((lo + hi) / 2)).toEqual({ lo: 1, hi: 2, t: 0.5 });
    expect(keyBlend(-1)).toEqual({ lo: 0, hi: 0, t: 0 });
    expect(keyBlend(1)).toEqual({ lo: SKY_KEYS.length - 1, hi: SKY_KEYS.length - 1, t: 0 });
  });

  it('are baked with the sun at one azimuth, so their clouds line up', () => {
    const azimuths = SKY_KEYS.map((k) => {
      const s = sunState(k.hours, bakeAzimuthDeg(k.hours)).sun;
      return Math.atan2(s[2], s[0]);
    });
    for (const a of azimuths) expect(Math.cos(a - azimuths[0]!)).toBeCloseTo(1, 9);
  });
});
