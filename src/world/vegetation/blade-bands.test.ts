import { describe, expect, it } from 'vitest';
import type { BufferGeometry } from 'three/webgpu';
import { tierSettings } from '../../engine/quality';
import {
  BLADE_COUNTS,
  BLADE_RANK_STEP,
  BLADE_WIDEN,
  NUMBER_MATH,
  bladeBandShape,
  bladeBands,
  type BladeBands,
} from './blade-bands';
import { createGrassGeometry } from './grass';
import { grassReachScale } from './grass-reach';

type V3 = [number, number, number];

const REPICK = 1;
const HIGH = bladeBands(1, REPICK);

/** The shape `bladeBandShape` gives blade `rank` at ground distance `d`. */
function shapeAt(bands: BladeBands, d: number, rank: number) {
  return bladeBandShape(NUMBER_MATH, d, rank, bands);
}

/**
 * Vertex `v` of a grass geometry where the shader puts it (in the clump's unit space, unturned and
 * unscaled) for a clump at ground distance `d`: the CPU twin of the grass material's blade moves.
 */
function shaded(g: BufferGeometry, v: number, bands: BladeBands, d: number): V3 {
  const pos = g.getAttribute('position');
  const normal = g.getAttribute('normal');
  const morph = g.getAttribute('bladeMorph');
  const rank = Math.round((g.getAttribute('vegPart').getX(v) - 1) / BLADE_RANK_STEP);
  const s = shapeAt(bands, d, rank);
  const ax = -normal.getZ(v);
  const az = normal.getX(v);
  const len = Math.hypot(ax, az);
  const spread = s.collapse * s.widen - 1;
  return [
    pos.getX(v) + morph.getX(v) * s.morph + (ax / len) * morph.getW(v) * spread,
    (pos.getY(v) + morph.getY(v) * s.morph) * s.collapse,
    pos.getZ(v) + morph.getZ(v) * s.morph + (az / len) * morph.getW(v) * spread,
  ];
}

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const area = (a: V3, b: V3, c: V3): number => Math.hypot(...cross(sub(b, a), sub(c, a))) / 2;
const lerp3 = (a: V3, b: V3, t: number): V3 => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

function expectClose(a: V3, b: V3, what: string): void {
  for (let k = 0; k < 3; k++) expect(Math.abs(a[k]! - b[k]!), `${what} [${k}]`).toBeLessThan(1e-6);
}

/** A near blade's six vertices: its second triangle runs (left, middle, tip) or (right, tip, middle). */
const tipOf = (i: number): number => (i % 2 === 0 ? 5 : 4);
const midOf = (i: number): number => (i % 2 === 0 ? 4 : 5);

/** A triangle's face normal (unnormalised): its winding. */
const faceNormal = (a: V3, b: V3, c: V3): V3 => cross(sub(b, a), sub(c, a));
const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

describe('grass blade bands', () => {
  const near = createGrassGeometry(BLADE_COUNTS[0], 'near');
  const mid = createGrassGeometry(BLADE_COUNTS[1], 'far');
  const far = createGrassGeometry(BLADE_COUNTS[2], 'far');

  it('lays each coarser band out as a prefix of the denser one', () => {
    expect(near.getAttribute('position').count).toBe(BLADE_COUNTS[0] * 6);
    expect(mid.getAttribute('position').count).toBe(BLADE_COUNTS[1] * 3);
    for (const name of ['position', 'normal', 'uv', 'vegPart', 'shade', 'bladeMorph']) {
      const a = Array.from(mid.getAttribute(name).array as Float32Array);
      const b = Array.from(far.getAttribute(name).array as Float32Array);
      expect(b, name).toEqual(a.slice(0, b.length));
    }
    // A near blade's base corners and tip are its far triangle's.
    const np = near.getAttribute('position');
    const mp = mid.getAttribute('position');
    for (let i = 0; i < BLADE_COUNTS[1]; i++)
      for (const [n, m] of [
        [0, 0],
        [1, 1],
        [tipOf(i), 2],
      ] as const)
        for (let k = 0; k < 3; k++) expect(np.getComponent(i * 6 + n, k)).toBe(mp.getComponent(i * 3 + m, k));
  });

  it('changes every blade continuously with distance', () => {
    // The biggest change over 5 mm of distance, any blade, anywhere in reach.
    const step = 0.005;
    let jump = 0;
    for (let rank = 0; rank < BLADE_COUNTS[0]; rank++) {
      let last = shapeAt(HIGH, 0, rank);
      expect(last).toEqual({ morph: 0, widen: 1, collapse: 1 });
      for (let d = step; d < 45; d += step) {
        const s = shapeAt(HIGH, d, rank);
        jump = Math.max(
          jump,
          Math.abs(s.morph - last.morph),
          Math.abs(s.widen - last.widen),
          Math.abs(s.collapse - last.collapse),
        );
        last = s;
      }
    }
    expect(jump).toBeLessThan(0.01);
  });

  it('has the next band’s look by the end of each transition', () => {
    for (let rank = 0; rank < BLADE_COUNTS[0]; rank++) {
      const end1 = shapeAt(HIGH, HIGH.c1, rank);
      expect(end1.morph).toBe(1);
      expect(end1.widen).toBeCloseTo(BLADE_WIDEN[1], 9);
      expect(end1.collapse).toBe(rank < BLADE_COUNTS[1] ? 1 : 0);
      const end2 = shapeAt(HIGH, HIGH.c2, rank);
      expect(end2.widen).toBeCloseTo(BLADE_WIDEN[2], 9);
      expect(end2.collapse).toBe(rank < BLADE_COUNTS[2] ? 1 : 0);
    }
  });

  it('draws the same pixels with the dense or the coarse geometry past each transition', () => {
    const swaps: [BufferGeometry, BufferGeometry, number, number][] = [
      [near, mid, HIGH.c1, 6],
      [mid, far, HIGH.c2, 3],
    ];
    for (const [dense, coarse, end, per] of swaps)
      for (const d of [end, end + 0.4, end + REPICK]) {
        const kept = coarse.getAttribute('position').count / 3;
        const blades = dense.getAttribute('position').count / per;
        for (let i = 0; i < blades; i++) {
          const v = (k: number) => shaded(dense, i * per + k, HIGH, d);
          if (i >= kept) {
            // Shrunk away: no area left to draw (float32 noise aside).
            for (let t = 0; t < per; t += 3) expect(area(v(t), v(t + 1), v(t + 2))).toBeLessThan(1e-8);
            continue;
          }
          const c = (k: number) => shaded(coarse, i * 3 + k, HIGH, d);
          const [L, R, tip] = [c(0), c(1), c(2)];
          if (per === 3) {
            for (let k = 0; k < 3; k++) expectClose(v(k), c(k), `blade ${i} vertex ${k} at ${d} m`);
            continue;
          }
          expectClose(v(0), L, `blade ${i} left`);
          expectClose(v(1), R, `blade ${i} right`);
          expectClose(v(tipOf(i)), tip, `blade ${i} tip`);
          // The middle vertex is on the far triangle's other edge, so the two triangles tile it.
          const fromLeft = i % 2 === 0;
          expectClose(v(3), fromLeft ? L : R, `blade ${i} second triangle's base`);
          expectClose(v(2), lerp3(fromLeft ? R : L, tip, 0.55), `blade ${i} middle`);
          expectClose(v(midOf(i)), v(2), `blade ${i} middle (second triangle)`);
          // Both wound like the far triangle (a double-sided face wound the other way is lit from behind).
          const facing = faceNormal(L, R, tip);
          expect(dot(faceNormal(v(0), v(1), v(2)), facing)).toBeGreaterThan(0);
          expect(dot(faceNormal(v(3), v(4), v(5)), facing)).toBeGreaterThan(0);
          const whole = area(L, R, tip);
          expect(Math.abs(area(v(0), v(1), v(2)) + area(v(3), v(4), v(5)) - whole)).toBeLessThan(
            whole * 1e-5,
          );
          // Its uv and shade are the far triangle's there too.
          const uv = dense.getAttribute('uv');
          expect(uv.getX(i * 6 + 2)).toBeCloseTo((fromLeft ? 1 : 0) * 0.45 + 0.5 * 0.55, 6);
          expect(uv.getY(i * 6 + 2)).toBeCloseTo(0.55, 6);
          expect(dense.getAttribute('shade').getX(i * 6 + 2)).toBeCloseTo(0.55, 6);
        }
      }
  });

  it('ends each transition a re-pick short of its swap, on every tier and backend', () => {
    for (const tier of ['low', 'medium', 'high', 'ultra'] as const)
      for (const webgl of [false, true]) {
        const b = bladeBands(grassReachScale(tierSettings(tier)) * (webgl ? 0.72 : 1), REPICK);
        expect(b.a1).toBeGreaterThan(0);
        expect(b.c1).toBeGreaterThan(b.a1);
        expect(b.a2).toBeGreaterThan(b.c1);
        expect(b.c2).toBeGreaterThan(b.a2);
        expect(b.swap1 - b.c1).toBeCloseTo(REPICK, 9);
        expect(b.swap2 - b.c2).toBeCloseTo(REPICK, 9);
      }
  });
});
