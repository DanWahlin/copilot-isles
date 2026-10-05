import { describe, expect, it } from 'vitest';
import { COVE } from '../layout';
import {
  SEA_STACK_PLINTH_TOP,
  seaStackDomeHeight,
  seaStackPlantSpots,
  seaStackRadius,
  seaStackSeabed,
  seaStackShipObstacle,
  seaStackWaterlineRadius,
} from './sea-stack-shape';
import { buildSeaStackGeometry } from './sea-stack';

const S = COVE.seaStack;
const ANGLES = Array.from({ length: 48 }, (_, i) => (i / 48) * Math.PI * 2);

describe('sea stack shape', () => {
  it('is notched at the waterline and widens upward (a karst pillar, not a cylinder)', () => {
    const mean = (y: number) => ANGLES.reduce((s, a) => s + seaStackRadius(y, a), 0) / ANGLES.length;
    expect(mean(1)).toBeLessThan(mean(12) * 0.72);
    expect(mean(12)).toBeLessThan(mean(28));
    const radii = ANGLES.map((a) => seaStackRadius(20, a));
    expect(Math.max(...radii) / Math.min(...radii)).toBeGreaterThan(1.3);
  });

  it('caches the waterline radius from the same shape function', () => {
    for (const a of [0.1, 1.7, 3.3, 5.9]) {
      expect(seaStackWaterlineRadius(a)).toBeCloseTo(seaStackRadius(0, a), 0);
    }
  });

  it('hides its plinth inside the notch and drops to deep water just outside', () => {
    const centre = seaStackSeabed(S.x, S.z, -30);
    expect(centre).toBeCloseTo(SEA_STACK_PLINTH_TOP, 1);
    for (const a of ANGLES) {
      const wl = seaStackWaterlineRadius(a);
      const inside = seaStackSeabed(S.x + Math.cos(a) * (wl - 1.2), S.z + Math.sin(a) * (wl - 1.2), -30);
      expect(inside).toBeLessThan(SEA_STACK_PLINTH_TOP + 1e-6);
      const out = seaStackSeabed(S.x + Math.cos(a) * (wl + 1), S.z + Math.sin(a) * (wl + 1), -30);
      expect(out).toBeLessThan(0);
    }
  });

  it('keeps the ship clear of the overhang', () => {
    const o = seaStackShipObstacle();
    for (const a of ANGLES) expect(seaStackRadius(14, a)).toBeLessThan(o.r);
  });

  it('places its plants on the dome and ledges, deterministically', () => {
    const a = seaStackPlantSpots();
    expect(a).toEqual(seaStackPlantSpots());
    expect(a.length).toBeGreaterThan(30);
    for (const p of a) {
      const dome = seaStackDomeHeight(p.x, p.z);
      if (dome !== null && p.y > S.height - 4) expect(Math.abs(p.y - (dome - 0.3))).toBeLessThan(0.01);
      expect(p.y).toBeGreaterThan(8);
    }
  });

  it('builds a clean mesh with baked karst masks in range', () => {
    const geometry = buildSeaStackGeometry({ columns: 48, rows: 30, rings: 3, blocks: 3 });
    const pos = geometry.getAttribute('position').array;
    const karst = geometry.getAttribute('karst').array;
    for (let i = 0; i < pos.length; i++) expect(Number.isFinite(pos[i])).toBe(true);
    for (let i = 0; i < karst.length; i++) {
      expect(karst[i]).toBeGreaterThanOrEqual(0);
      expect(karst[i]).toBeLessThanOrEqual(1);
    }
    geometry.computeBoundingBox();
    expect(geometry.boundingBox!.max.y).toBeGreaterThan(S.height);
    expect(geometry.getIndex()!.count / 3).toBeLessThan(5000);
  });
});
