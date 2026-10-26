import { describe, expect, it } from 'vitest';
import { BRIGANTINE_MASTS } from '../ship/brigantine-rig';
import {
  FORE_LOWEST_YARD,
  Points,
  RIG_CLEARANCE,
  WRAP_SPOTS,
  clearOfMasts,
  deckArc,
  heavy,
  hullCoil,
  mastCoil,
  railGrip,
  standPath,
} from './arm-paths';

describe('heavy', () => {
  it('starts at 0, ends at 1, dips back first and overshoots before it settles', () => {
    expect(heavy(0)).toBe(0);
    expect(heavy(1)).toBe(1);
    expect(heavy(0.1)).toBeLessThan(0.01);
    expect(Math.max(...[0.8, 0.85, 0.9].map((u) => heavy(u)))).toBeGreaterThan(1);
    expect(heavy(0.5, 0, 0)).toBeCloseTo(0.5, 5);
  });
});

describe('wrap shapes keep clear of the rig', () => {
  it('coils round the hull miss every mast, tight or loose, squeezed or not', () => {
    for (const spot of [WRAP_SPOTS.stern, WRAP_SPOTS.bow])
      for (const loose of [0, 0.5, 1])
        for (const squeeze of [0, 1]) {
          const p = new Points();
          hullCoil(p, spot.z0, spot.z1, loose, squeeze);
          expect(clearOfMasts(p)).toBe(true);
        }
  });

  it('the mast coil stays under the lowest fore yard', () => {
    for (const loose of [0, 0.3, 1]) {
      const p = new Points();
      mastCoil(p, loose, 1);
      for (let i = 0; i < p.n; i++)
        expect(p.xyz[i * 3 + 1]!).toBeLessThanOrEqual(FORE_LOWEST_YARD - RIG_CLEARANCE + 1e-6);
    }
  });

  it('the arc over the deck and the grips over the rail miss the masts', () => {
    for (const rise of [0.2, 0.6, 1]) {
      const p = new Points();
      deckArc(p, rise, 1);
      expect(clearOfMasts(p)).toBe(true);
    }
    for (const z of [WRAP_SPOTS.gripFore, WRAP_SPOTS.gripAft]) {
      const p = new Points();
      railGrip(p, z, 1);
      expect(clearOfMasts(p)).toBe(true);
    }
    expect(Math.abs(WRAP_SPOTS.arc - BRIGANTINE_MASTS.fore.z)).toBeGreaterThan(2);
  });
});

describe('standPath', () => {
  it('shows h metres over the sea and tucks the rest of the arm under it', () => {
    for (const h of [0, 6, 14]) {
      const p = new Points();
      standPath(p, 20, -12, 0, -1, 0, 5, 0, 0, h, 40, 0.4, 0.8, -1, 0, 0);
      expect(Number.isFinite(p.length())).toBe(true);
      const top = p.xyz[(p.n - 1) * 3 + 1]!;
      if (h > 0) expect(top).toBeCloseTo(h, 0);
      // The route is about the arm's length (the curve-follow lays the arm on it end to end).
      expect(p.length()).toBeGreaterThan(40 * 0.85);
      expect(p.length()).toBeLessThan(40 * 1.15);
    }
  });
});
