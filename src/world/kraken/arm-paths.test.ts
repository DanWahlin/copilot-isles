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
  freeStance,
  pullArc,
  railGrip,
  standPath,
  type FreeStance,
} from './arm-paths';
import { CurvePath, followPath } from './tentacle-pose';

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
  it('shows about len metres of arm over the sea and tucks the rest of it under', () => {
    for (const len of [0, 6, 14]) {
      const p = new Points();
      standPath(p, 20, -12, 0, -1, 0, 5, 0, 0, len, 40, 0.4, 0.8, -1, 0, 0.3);
      expect(Number.isFinite(p.length())).toBe(true);
      let over = 0;
      for (let i = 1; i < p.n; i++)
        if (p.xyz[i * 3 + 1]! > 0.01)
          over += Math.hypot(
            p.xyz[i * 3]! - p.xyz[i * 3 - 3]!,
            p.xyz[i * 3 + 1]! - Math.max(0, p.xyz[i * 3 - 2]!),
            p.xyz[i * 3 + 2]! - p.xyz[i * 3 - 1]!,
          );
      expect(over).toBeCloseTo(len, 0);
      // The route is about the arm's length (the curve-follow lays the arm on it end to end).
      expect(p.length()).toBeGreaterThan(40 * 0.85);
      expect(p.length()).toBeLessThan(40 * 1.15);
    }
  });
});

/** The tentacle's bone lengths (m, unscaled): Tentacle1 … Tentacle15 to its end. */
const BONES = [3.4, 1.4, 1.4, 1.3, 1.3, 1.5, 1.5, 1.0, 1.0, 1.1, 1.1, 1.0, 1.0, 0.9, 0.9];

/**
 * Lays a chain of `scale`-sized bones along a free arm's route (as the encounter does) and measures
 * its part over the water: the most any joint stands off the line from where it leaves the water to
 * its tip, as a share of that part's length (0 for a straight spike). NaN if a joint is NaN.
 */
function bentness(
  stance: FreeStance,
  scale: number,
  phase: number,
  back: number,
): { bend: number; shown: number } {
  const lengths = BONES.map((l) => l * scale);
  const armLength = lengths.reduce((a, b) => a + b, 0);
  const path = new CurvePath(24, 5);
  const j = new Float32Array((lengths.length + 1) * 3);
  // As the game does: posed again with a longer route if the bones ran off its end.
  let slack = 0;
  for (let tries = 0; tries < 3; tries++) {
    path.clear();
    standPath(
      path,
      12,
      -18,
      0,
      -1,
      0,
      0,
      0,
      0,
      stance.len,
      armLength,
      phase,
      0.9,
      -1,
      0,
      stance.curl,
      stance.bow,
      back,
      slack,
    );
    path.build();
    const fit = followPath(path, lengths, j);
    if (fit > -0.4 && fit < 0.05) break;
    slack += fit > 0 ? fit + 0.1 : fit + 0.15;
  }
  for (const v of j) if (!Number.isFinite(v)) return { bend: NaN, shown: 0 };
  // From where the chain leaves the water (the bone crossing the surface, cut at it) to its tip.
  const n = lengths.length;
  let first = -1;
  for (let i = 1; i <= n; i++)
    if (j[i * 3 + 1]! > 0 && j[(i - 1) * 3 + 1]! <= 0) {
      first = i;
      break;
    }
  if (first < 0) return { bend: 1, shown: 0 };
  const y0 = j[(first - 1) * 3 + 1]!;
  const y1 = j[first * 3 + 1]!;
  const c = -y0 / (y1 - y0);
  const ax = j[(first - 1) * 3]! + (j[first * 3]! - j[(first - 1) * 3]!) * c,
    ay = 0,
    az = j[(first - 1) * 3 + 2]! + (j[first * 3 + 2]! - j[(first - 1) * 3 + 2]!) * c;
  const dx = j[n * 3]! - ax,
    dy = j[n * 3 + 1]! - ay,
    dz = j[n * 3 + 2]! - az;
  const ll = dx * dx + dy * dy + dz * dz;
  let worst = 0;
  let len = lengths[first - 1]! * (1 - c);
  for (let i = first; i <= n; i++) {
    if (i > first) len += lengths[i - 1]!;
    const px = j[i * 3]! - ax,
      py = j[i * 3 + 1]! - ay,
      pz = j[i * 3 + 2]! - az;
    const s = ll > 0 ? Math.min(1, Math.max(0, (px * dx + py * dy + pz * dz) / ll)) : 0;
    worst = Math.max(worst, Math.hypot(px - dx * s, py - dy * s, pz - dz * s));
  }
  return { bend: worst / len, shown: len };
}

describe('a free arm is never a spike', () => {
  const stance: FreeStance = { len: 0, curl: 0, bow: 0 };
  // Rising (its tip first), standing and swaying, withdrawing, and the finale's arms round the body.
  const states: [string, (u: number) => FreeStance][] = [
    ['rise', (u) => freeStance(stance, 13, heavy(u), 0)],
    ['stand', () => freeStance(stance, 14, 1, 0)],
    ['tall', () => freeStance(stance, 19, 1, 0)],
    ['withdraw', (u) => freeStance(stance, 14, 1, u)],
    ['finale', (u) => freeStance(stance, 10, heavy(Math.min(1, u * 2)), Math.max(0, u * 2 - 1))],
  ];
  for (const [name, at] of states)
    it(`stays curved through its ${name}: at least 15 % off its root-to-tip line, no NaN`, () => {
      let seen = 0;
      for (const scale of [1.75, 2.2])
        for (const back of [0, 0.8])
          for (let f = 0; f <= 240; f++) {
            const u = Math.floor(f / 8) / 30;
            // A slow wave travels along it (its sway's phase): every moment of it, at each step.
            const phase = (f % 8) * (Math.PI / 4);
            const st = at(u);
            if (st.len < 0.05) continue;
            const { bend, shown } = bentness(st, scale, phase, back);
            expect(Number.isNaN(bend)).toBe(false);
            // Over the water by the two tip bones or more: a curve, never a straight cone (one
            // bone can't bend; it's the tip just breaking the water, or slipping under).
            if (shown < (BONES[13]! + BONES[14]!) * scale) continue;
            seen++;
            expect(bend, `${name} u=${u.toFixed(2)} scale=${scale} back=${back}`).toBeGreaterThanOrEqual(
              0.15,
            );
          }
      expect(seen).toBeGreaterThan(20);
    });

  it('stays stable over 1,000 frames of sway (no NaN, no jumps)', () => {
    const path = new CurvePath(24, 5);
    const lengths = BONES.map((l) => l * 2);
    const armLength = lengths.reduce((a, b) => a + b, 0);
    const j = new Float32Array(48);
    const last = new Float32Array(48);
    for (let f = 0; f < 1000; f++) {
      const st = freeStance(stance, 14, 1, 0);
      path.clear();
      standPath(
        path,
        12,
        -6,
        0,
        -1,
        0,
        0,
        0,
        0,
        st.len,
        armLength,
        (f / 60 / 7) * Math.PI * 2,
        0.9,
        -1,
        0,
        st.curl,
        st.bow,
        0.8,
      );
      path.build();
      followPath(path, lengths, j);
      for (let i = 0; i < 48; i++) {
        expect(Number.isFinite(j[i]!)).toBe(true);
        if (f > 0) expect(Math.abs(j[i]! - last[i]!)).toBeLessThan(0.25);
      }
      last.set(j);
    }
  });
});

describe('the final pull', () => {
  it('comes over her rail on its own side, clear of the rig', () => {
    for (const z of [WRAP_SPOTS.pullAft, WRAP_SPOTS.pullFore])
      for (const rise of [0.3, 0.7, 1])
        for (const press of [0, 1]) {
          const p = new Points();
          pullArc(p, z, rise, press);
          expect(clearOfMasts(p)).toBe(true);
          for (let i = 0; i < p.n; i++) expect(p.xyz[i * 3]!).toBeGreaterThan(0.8);
        }
    const p = new Points();
    railGrip(p, WRAP_SPOTS.gripFar, 1);
    expect(clearOfMasts(p)).toBe(true);
  });
});
