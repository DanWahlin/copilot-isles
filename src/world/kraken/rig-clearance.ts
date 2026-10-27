import { segmentDistance3 } from '../../util/math';
import { BRIGANTINE_MASTS, BRIGANTINE_YARDS, createSailGeometry } from '../ship/brigantine-rig';
import { deckHeightAt } from '../ship/lines';

/**
 * How near a kraken's arm comes to a ship's sails (tests and probes): an arm must never pass through
 * canvas (a sail drawn through an arm flickers as the two cross each frame). The sails are the ship's
 * own geometry (`createSailGeometry`), set and filled as hard as the canvas shader ever fills them
 * (`SAIL_FILL`), and checked flat, half filled and full, so every state in between is covered.
 */

/**
 * The most a sail bellies out (m) at its middle, set and full: the canvas shader's
 * `belly × trim × (min(wind, 10) × 0.08 + 0.72) × (gust × 0.28 + 0.86) × windFacing × 2.05`, in a
 * gale, at its largest gust and facing (3.9), and a little more for its flutter.
 */
export const SAIL_FILL = 4;

interface Surface {
  /** Triangles: 9 floats each (three ship-local corners). */
  tris: Float32Array;
}

let surfaces: Surface[] | null = null;

/** The sails as triangles at three fills: flat (0), half and full (`SAIL_FILL`). */
function sailSurfaces(): Surface[] {
  if (surfaces) return surfaces;
  const g = createSailGeometry('low');
  const pos = g.getAttribute('position');
  const nor = g.getAttribute('sailNormal');
  const uv = g.getAttribute('sailUv');
  const index = g.index!;
  surfaces = [0, 0.5, 1].map((fill) => {
    const tris = new Float32Array(index.count * 3);
    for (let i = 0; i < index.count; i++) {
      const v = index.getX(i);
      const belly = Math.max(0, Math.sin(uv.getX(v) * Math.PI) * Math.sin(uv.getY(v) * Math.PI));
      const b = belly * SAIL_FILL * fill;
      tris[i * 3] = pos.getX(v) + nor.getX(v) * b;
      tris[i * 3 + 1] = pos.getY(v) + nor.getY(v) * b;
      tris[i * 3 + 2] = pos.getZ(v) + nor.getZ(v) * b;
    }
    return { tris };
  });
  g.dispose();
  return surfaces;
}

/** The distance (m) from (px, py, pz) to triangle `t` (at float offset `o`). */
function triDistance(t: Float32Array, o: number, px: number, py: number, pz: number): number {
  // Ericson, "Real-Time Collision Detection" §5.1.5: the closest point on a triangle.
  const ax = t[o]!,
    ay = t[o + 1]!,
    az = t[o + 2]!;
  const abx = t[o + 3]! - ax,
    aby = t[o + 4]! - ay,
    abz = t[o + 5]! - az;
  const acx = t[o + 6]! - ax,
    acy = t[o + 7]! - ay,
    acz = t[o + 8]! - az;
  const apx = px - ax,
    apy = py - ay,
    apz = pz - az;
  const d1 = abx * apx + aby * apy + abz * apz;
  const d2 = acx * apx + acy * apy + acz * apz;
  let qx: number, qy: number, qz: number;
  if (d1 <= 0 && d2 <= 0) {
    qx = ax;
    qy = ay;
    qz = az;
  } else {
    const bpx = px - (ax + abx),
      bpy = py - (ay + aby),
      bpz = pz - (az + abz);
    const d3 = abx * bpx + aby * bpy + abz * bpz;
    const d4 = acx * bpx + acy * bpy + acz * bpz;
    const cpx = px - (ax + acx),
      cpy = py - (ay + acy),
      cpz = pz - (az + acz);
    const d5 = abx * cpx + aby * cpy + abz * cpz;
    const d6 = acx * cpx + acy * cpy + acz * cpz;
    const vc = d1 * d4 - d3 * d2;
    const vb = d5 * d2 - d1 * d6;
    const va = d3 * d6 - d5 * d4;
    if (d3 >= 0 && d4 <= d3) {
      qx = ax + abx;
      qy = ay + aby;
      qz = az + abz;
    } else if (d6 >= 0 && d5 <= d6) {
      qx = ax + acx;
      qy = ay + acy;
      qz = az + acz;
    } else if (vc <= 0 && d1 >= 0 && d3 <= 0) {
      const v = d1 / (d1 - d3);
      qx = ax + abx * v;
      qy = ay + aby * v;
      qz = az + abz * v;
    } else if (vb <= 0 && d2 >= 0 && d6 <= 0) {
      const w = d2 / (d2 - d6);
      qx = ax + acx * w;
      qy = ay + acy * w;
      qz = az + acz * w;
    } else if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
      const w = (d4 - d3) / (d4 - d3 + (d5 - d6));
      qx = ax + abx + (acx - abx) * w;
      qy = ay + aby + (acy - aby) * w;
      qz = az + abz + (acz - abz) * w;
    } else {
      const den = 1 / (va + vb + vc);
      const v = vb * den;
      const w = vc * den;
      qx = ax + abx * v + acx * w;
      qy = ay + aby * v + acy * w;
      qz = az + abz * v + acz * w;
    }
  }
  return Math.hypot(px - qx, py - qy, pz - qz);
}

/** How near (m) a ship-local point comes to any sail, flat, half filled or full. */
export function sailDistance(x: number, y: number, z: number): number {
  let best = Infinity;
  for (const s of sailSurfaces()) {
    const t = s.tris;
    for (let o = 0; o < t.length; o += 9) {
      // A cheap reject: the triangle's first corner is far beyond what can matter.
      if (Math.abs(t[o]! - x) > 12 || Math.abs(t[o + 2]! - z) > 12) continue;
      const d = triDistance(t, o, x, y, z);
      if (d < best) best = d;
    }
  }
  return best;
}

/**
 * How near (m) a ship-local polyline (xyz triples, `n` points) comes to any sail, checked every
 * `step` m along it (the canvas can pass between two points).
 */
export function pathSailDistance(xyz: ArrayLike<number>, n: number, step = 0.25): number {
  let best = Infinity;
  for (let i = 0; i < n; i++) {
    const x = xyz[i * 3]!,
      y = xyz[i * 3 + 1]!,
      z = xyz[i * 3 + 2]!;
    if (i === 0) {
      best = Math.min(best, sailDistance(x, y, z));
      continue;
    }
    const px = xyz[i * 3 - 3]!,
      py = xyz[i * 3 - 2]!,
      pz = xyz[i * 3 - 1]!;
    const k = Math.max(1, Math.ceil(Math.hypot(x - px, y - py, z - pz) / step));
    for (let j = 1; j <= k; j++) {
      const f = j / k;
      best = Math.min(best, sailDistance(px + (x - px) * f, py + (y - py) * f, pz + (z - pz) * f));
    }
  }
  return best;
}

/** How near (m) a ship-local point comes to any mast (between her deck and its truck). */
export function mastDistance(x: number, y: number, z: number): number {
  let best = Infinity;
  for (const m of Object.values(BRIGANTINE_MASTS)) {
    if (y < deckHeightAt(m.z) - 0.2 || y > m.truck) continue;
    best = Math.min(best, Math.hypot(x, z - m.z) - m.radius);
  }
  return best;
}

const _a = { x: 0, y: 0, z: 0 };
const _b = { x: 0, y: 0, z: 0 };

/** How near (m) a ship-local point comes to any yard's surface (furled canvas on it included). */
export function yardDistance(x: number, y: number, z: number): number {
  let best = Infinity;
  for (const yd of BRIGANTINE_YARDS) {
    _a.x = -yd.span;
    _a.y = yd.y;
    _a.z = yd.z - yd.span * yd.brace;
    _b.x = yd.span;
    _b.y = yd.y;
    _b.z = yd.z + yd.span * yd.brace;
    const d = segmentDistance3(x, y, z, _a, _b);
    best = Math.min(best, d - yd.radius);
  }
  return best;
}

/** How far (m) an arm's line keeps from the canvas: its girth near its tip and a little air. */
export const SAIL_CLEARANCE = 0.7;
