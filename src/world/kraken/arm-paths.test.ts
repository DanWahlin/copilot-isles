import { describe, expect, it } from 'vitest';
import { BRIGANTINE_MASTS } from '../ship/brigantine-rig';
import { deckHeightAt, halfBeamAt } from '../ship/lines';
import {
  FORE_LOWEST_YARD,
  Points,
  RIG_CLEARANCE,
  SEIZE_LAYOUT,
  WRAP_SPOTS,
  clearOfMasts,
  heavy,
  hullCoil,
  mastCoil,
  freeStance,
  pullArc,
  railGrip,
  seizeShape,
  standPath,
  type FreeStance,
} from './arm-paths';
import { SAIL_CLEARANCE, mastDistance, pathSailDistance, sailDistance, yardDistance } from './rig-clearance';
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

  it('the arc over the deck (a tall free J across her bow) and the grips over the rail miss the masts', () => {
    // From where the highest arm rises (her kraken side, by the forecastle), across her, as it comes
    // over (bow) and hangs (a sway). Its route under the water is left out.
    for (const bow of [0.15, 0.45, 0.7])
      for (const phase of [0, 1.6, 3.2, 4.8]) {
        const p = new Points(64);
        standPath(
          p,
          15,
          -10,
          WRAP_SPOTS.arc,
          -1,
          0,
          6.5,
          7.5,
          0,
          20,
          40,
          phase,
          0.45,
          -1,
          0,
          0.6,
          bow,
          0,
          0,
          7,
          0,
        );
        const over = new Points(64);
        for (let i = 4; i < p.n; i++) over.push(p.xyz[i * 3]!, p.xyz[i * 3 + 1]!, p.xyz[i * 3 + 2]!);
        expect(clearOfMasts(over)).toBe(true);
      }
    for (const z of [WRAP_SPOTS.gripFore, WRAP_SPOTS.gripAft]) {
      const p = new Points();
      railGrip(p, z, 1);
      expect(clearOfMasts(p)).toBe(true);
    }
    expect(Math.abs(WRAP_SPOTS.arc - BRIGANTINE_MASTS.fore.z)).toBeGreaterThan(2);
  });
});

describe("a battle's seize keeps clear of her sails, yards and masts", () => {
  it("the sails are the ship's own canvas, flat to full (a check of the check)", () => {
    // On the fore course's middle (flat); and over her rail between the fore and main, clear.
    expect(sailDistance(0, 5.3, BRIGANTINE_MASTS.fore.z)).toBeLessThan(0.3);
    expect(sailDistance(5, 3, 2)).toBeGreaterThan(2);
    // On the fore course's yard, and well under it.
    expect(yardDistance(0, 7.15, BRIGANTINE_MASTS.fore.z)).toBeLessThan(0.1);
    expect(yardDistance(0, 4, BRIGANTINE_MASTS.fore.z)).toBeGreaterThan(2.5);
  });

  for (const side of [1, -1] as const)
    for (const key of ['fore', 'aft', 'far', 'mast'] as const)
      it(`from her ${side > 0 ? '+x' : '−x'} side, ${key}: never through canvas, flat or full, loose or clamped`, () => {
        const spot = SEIZE_LAYOUT[side]![key];
        const mast = key === 'mast';
        for (const press of [0, 0.5, 1]) {
          const p = new Points();
          seizeShape(p, spot, mast, press);
          expect(p.n).toBeGreaterThan(6);
          expect(pathSailDistance(p.xyz, p.n)).toBeGreaterThanOrEqual(SAIL_CLEARANCE);
          for (let i = 0; i < p.n; i++) {
            const x = p.xyz[i * 3]!;
            const y = p.xyz[i * 3 + 1]!;
            const z = p.xyz[i * 3 + 2]!;
            // Round the mast, never into it; clear of the others and their yards.
            expect(mastDistance(x, y, z)).toBeGreaterThan(mast ? 0.5 : RIG_CLEARANCE);
            expect(yardDistance(x, y, z)).toBeGreaterThan(RIG_CLEARANCE);
            const beam = halfBeamAt(z, 1.5);
            if (Math.abs(x) < beam) {
              // Over her deck: under the lowest yard, on the half it holds (she tears at z 1.8), and low
              // across her middle (under the staysails' feet).
              expect(y).toBeLessThan(FORE_LOWEST_YARD - RIG_CLEARANCE);
              if (spot.half === 1) expect(z).toBeGreaterThan(1.9);
              else expect(z).toBeLessThan(1.7);
              if (Math.abs(x) < beam - 1.5) expect(y).toBeLessThan(deckHeightAt(z) + 1.4);
            }
          }
          // It starts in the sea on its own side, and clamps her: across her deck to her centre line,
          // or round the mast.
          expect(p.xyz[1]!).toBeLessThan(0.5);
          expect(p.xyz[0]! * spot.side).toBeGreaterThan(halfBeamAt(0, 1.5));
          const e = (p.n - 1) * 3;
          if (mast) expect(mastDistance(p.xyz[e]!, p.xyz[e + 1]!, p.xyz[e + 2]!)).toBeLessThan(1.2);
          else expect(Math.abs(p.xyz[e]!)).toBeLessThan(0.5);
        }
      });

  it('holds two arms on each half of her, from either side', () => {
    for (const side of [1, -1]) {
      const l = SEIZE_LAYOUT[side]!;
      expect([l.fore, l.aft, l.far, l.mast].filter((s) => s.half === 1)).toHaveLength(2);
      // Near arms on the kraken's side, the far one on the other.
      expect(l.fore.side).toBe(side);
      expect(l.aft.side).toBe(side);
      expect(l.far.side).toBe(-side);
    }
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
  baseY = -18,
): { bend: number; shown: number } {
  const lengths = BONES.map((l) => l * scale);
  const armLength = lengths.reduce((a, b) => a + b, 0);
  const path = new CurvePath(24, 5);
  const j = new Float32Array((lengths.length + 1) * 3);
  // As the game does (`poseFreeArm`): the route's length refit to the chain, the best try kept.
  let slack = 0;
  let best = 0;
  let bestErr = Infinity;
  const build = (sl: number) => {
    path.clear();
    standPath(
      path,
      12,
      baseY,
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
      sl,
      lengths[0],
    );
    path.build();
    return followPath(path, lengths, j);
  };
  for (let tries = 0; tries < 6; tries++) {
    const fit = build(slack);
    const err = fit > 0 ? fit * 3 : -fit;
    if (err < bestErr) {
      bestErr = err;
      best = slack;
    }
    if (fit > -0.3 && fit < 0.05) break;
    slack += fit > 0 ? fit + 0.1 : fit * 0.9;
    if (tries === 5) build(best);
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
    // The moments it breaks the surface and slips under, sampled closely.
    ['surfacing', (u) => freeStance(stance, 13, heavy(u * 0.45), 0)],
    ['going under', (u) => freeStance(stance, 14, 1, 0.7 + 0.3 * u)],
    // A distant sighting's tall arm (its gentler J and curl).
    [
      'sighting',
      (u) => {
        const st = freeStance(stance, 34, Math.min(1, u * 3), Math.max(0, u * 3 - 2));
        st.curl -= 0.1;
        st.bow -= 0.3;
        return st;
      },
    ],
  ];
  for (const [name, at] of states)
    it(`stays curved through its ${name}: at least 15 % off its root-to-tip line, no NaN`, () => {
      let seen = 0;
      for (const scale of [1.75, 2.2])
        for (const back of [0, 0.8])
          for (let f = 0; f <= 480; f++) {
            const u = Math.floor(f / 16) / 30;
            // A slow wave travels along it (its sway's phase): every moment of it, at each step.
            const phase = (f % 16) * (Math.PI / 8);
            const st = at(u);
            if (st.len < 0.05) continue;
            // From a deep body (beside a ship) and a surfaced one (its sockets just under the water).
            const { bend, shown } = bentness(st, scale, phase, back, f % 2 ? -4 : -18);
            expect(Number.isNaN(bend)).toBe(false);
            // Over the water by the two tip bones or more: a curve, never a straight cone (one
            // bone can't bend; it's the tip just breaking the water, or slipping under).
            if (shown < (BONES[13]! + BONES[14]!) * scale) continue;
            seen++;
            expect(
              bend,
              `${name} u=${u.toFixed(2)} scale=${scale} back=${back} phase=${phase.toFixed(2)} len=${st.len.toFixed(1)} shown=${shown.toFixed(1)}`,
            ).toBeGreaterThanOrEqual(0.15);
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
