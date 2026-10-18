import type { WaterStrips } from '../sites/water';
import type { FreshWater, WaterBasin, WaterStream } from './meridian-water';
import { smoothstep } from '../../util/math';

/**
 * An island's fresh water drawn as natural water (the shared water material's stream and pool looks):
 * every vertex carries the water's depth over the drawn ground, so it's clear and light where it's
 * shallow, jade and deep in the middle, and fades into its banks wherever the ground meets it (no
 * ruled edge). Streams run in five lanes across (metres across in `u`, metres along in `v`, so the
 * ripples flow down the course); pools are rings round their middle, `v` the distance from where
 * their water comes in, so ripples spread from a fall's foot. Falls keep the falling-water look.
 */
export interface NaturalWaterOptions {
  /** The drawn ground's height (the island's baked pack), so the depth matches what you see. */
  ground: (x: number, z: number) => number;
  /** Where falls land in pools: white water and ripples spread `r` m from here. */
  plunges?: readonly { readonly x: number; readonly z: number; readonly r: number }[];
  /** Stones standing in the streams: white water round each and trailing downstream. */
  stones?: readonly { readonly x: number; readonly z: number; readonly r: number }[];
}

/** Look ids in the shared material (`StripFlow.kind`). */
export const NATURAL_STREAM = 2;
export const NATURAL_POOL = 3;

/** Lanes across a stream, as shares of its half-width (past 1 the strip lies over its banks, depth < 0 there). */
const LANES = [-1.35, -0.62, 0, 0.62, 1.35] as const;
/** Rings out from a pool's middle, as shares of its shoreline (past 1 over its banks). */
const RINGS = [0, 0.32, 0.58, 0.78, 0.9, 1, 1.12] as const;
/** Where a stream starts drawing out of a pool (the pool's outer ring covers it up to here). */
const POOL_EDGE = RINGS[RINGS.length - 1]!;

const corner = (): [number, number, number] => [0, 0, 0];

export function addNaturalFreshWater(strips: WaterStrips, water: FreshWater, o: NaturalWaterOptions): void {
  for (const b of Object.values(water.basins)) pool(strips, water, b, o);
  for (const s of water.streams) stream(strips, water, s, o);
}

function pool(strips: WaterStrips, water: FreshWater, b: WaterBasin, o: NaturalWaterOptions): void {
  const big = Math.max(b.rx, b.rz);
  const segs = big < 6 ? 20 : big < 14 ? 36 : 48;
  const y = b.level + 0.02;
  // Its water comes in from a fall's foot, if one lands here; else it stirs from the middle.
  let src = { x: b.x, z: b.z, r: 0 };
  for (const p of o.plunges ?? [])
    if (water.basinAt(p.x, p.z, 1.15) === b && (src.r === 0 || p.r > src.r)) src = { ...p };
  const ring: [number, number][][] = RINGS.map((k) => {
    const pts: [number, number][] = [];
    for (let i = 0; i <= segs; i++) {
      if (k === 0) {
        pts.push([b.x, b.z]);
        continue;
      }
      const a = (i / segs) * Math.PI * 2;
      let [x, z] = water.rimPoint(b, a, k);
      // Past its shore, never over a neighbouring pool (the Booth Pools step down into each other).
      if (k > 1) {
        const other = water.basinAt(x, z, 1);
        if (other && other !== b) [x, z] = water.rimPoint(b, a, 1);
      }
      pts.push([x, z]);
    }
    return pts;
  });
  const A = corner();
  const B = corner();
  const C = corner();
  const D = corner();
  const depth = [0, 0, 0, 0];
  const foam = [0, 0, 0, 0];
  const along = [0, 0, 0, 0];
  const set = (p: [number, number, number], q: [number, number], k: number) => {
    p[0] = q[0];
    p[1] = y;
    p[2] = q[1];
    depth[k] = b.level - o.ground(q[0], q[1]);
    const d = Math.hypot(q[0] - src.x, q[1] - src.z);
    along[k] = d;
    foam[k] = src.r > 0 ? 1 - smoothstep(src.r * 0.3, src.r, d) : 0;
  };
  for (let j = 0; j < RINGS.length - 1; j++)
    for (let i = 0; i < segs; i++) {
      set(A, ring[j]![i]!, 0);
      set(B, ring[j]![i + 1]!, 1);
      set(C, ring[j + 1]![i]!, 2);
      set(D, ring[j + 1]![i + 1]!, 3);
      strips.quad(A, B, C, D, 0, 0, { fill: 1, speed: 0.2, kind: NATURAL_POOL }, 0, 0, {
        depth,
        foam,
        along,
      });
    }
}

const TANGENT: [number, number] = [0, 0];

function tangentAt(s: WaterStream, i: number): [number, number] {
  const a = Math.max(0, i - 1);
  const b = Math.min(s.count - 1, i + 1);
  const dx = s.x[b]! - s.x[a]!;
  const dz = s.z[b]! - s.z[a]!;
  const len = Math.hypot(dx, dz) || 1;
  TANGENT[0] = dx / len;
  TANGENT[1] = dz / len;
  return TANGENT;
}

/** Where along a stream's segment i → i + 1 it crosses a pool's outer ring (0..1), from the inside end. */
function poolCrossing(water: FreshWater, s: WaterStream, i: number, insideAtStart: boolean): number {
  let lo = 0;
  let hi = 1;
  for (let k = 0; k < 14; k++) {
    const t = (lo + hi) / 2;
    const x = s.x[i]! + (s.x[i + 1]! - s.x[i]!) * t;
    const z = s.z[i]! + (s.z[i + 1]! - s.z[i]!) * t;
    const inside = water.basinAt(x, z, POOL_EDGE) !== null;
    if (inside === insideAtStart) lo = t;
    else hi = t;
  }
  return (lo + hi) / 2;
}

function stream(strips: WaterStrips, water: FreshWater, s: WaterStream, o: NaturalWaterOptions): void {
  const n = s.count;
  let meanHalf = 0;
  for (let i = 0; i < n; i++) meanHalf += s.half[i]! / n;
  const A = corner();
  const B = corner();
  const C = corner();
  const D = corner();
  const depth = [0, 0, 0, 0];
  const foam = [0, 0, 0, 0];
  const along = [0, 0, 0, 0];
  // Each end of the segment: its point, width, height, flow and tangent (the start, then the end).
  const end = [
    { x: 0, z: 0, half: 0, depth: 0, y: 0, v: 0, tx: 0, tz: 0, foam: 0 },
    { x: 0, z: 0, half: 0, depth: 0, y: 0, v: 0, tx: 0, tz: 0, foam: 0 },
  ];
  for (let i = 0; i < n - 1; i++) {
    const run = Math.hypot(s.x[i + 1]! - s.x[i]!, s.z[i + 1]! - s.z[i]!) || 1;
    const drop = s.surface[i]! - s.surface[i + 1]!;
    const slope = Math.max(0, drop / run);
    const steep = Math.min(1, slope / 0.9);
    // Falls down a cliff keep the falling-water look (the caller draws them).
    if (steep > 0.6) continue;
    const inA = water.basinAt(s.x[i]!, s.z[i]!, POOL_EDGE) !== null;
    const inB = water.basinAt(s.x[i + 1]!, s.z[i + 1]!, POOL_EDGE) !== null;
    // In a pool the pool's own water is drawn (no strip across it).
    if (inA && inB) continue;
    let t0 = 0;
    let t1 = 1;
    if (inA) t0 = poolCrossing(water, s, i, true);
    if (inB) t1 = poolCrossing(water, s, i, false);
    const riffle = smoothstep(0.12, 0.8, slope) * 0.7;
    for (let e = 0; e < 2; e++) {
      const t = e === 0 ? t0 : t1;
      const p = end[e]!;
      p.x = s.x[i]! + (s.x[i + 1]! - s.x[i]!) * t;
      p.z = s.z[i]! + (s.z[i + 1]! - s.z[i]!) * t;
      p.half = s.half[i]! + (s.half[i + 1]! - s.half[i]!) * t;
      p.depth = s.depth[i]! + (s.depth[i + 1]! - s.depth[i]!) * t;
      // Lifted a little more on steeper runs, where the 2 m terrain pack can't follow the bed.
      p.y = s.surface[i]! + (s.surface[i + 1]! - s.surface[i]!) * t + 0.03 + steep * 0.3;
      p.v = s.along[i]! + Math.hypot(run, drop) * t;
      const ta = tangentAt(s, i);
      const tax = ta[0];
      const taz = ta[1];
      const tb = tangentAt(s, i + 1);
      const tx = tax + (tb[0] - tax) * t;
      const tz = taz + (tb[1] - taz) * t;
      const tl = Math.hypot(tx, tz) || 1;
      p.tx = tx / tl;
      p.tz = tz / tl;
      // Narrow riffles run whiter.
      p.foam = riffle + smoothstep(1.05, 0.7, p.half / meanHalf) * 0.22;
    }
    // Narrow reaches run faster (the same water through less width), steep ones faster still.
    const speed = Math.min(
      3,
      (0.55 + steep * 2.4) * Math.sqrt(meanHalf / ((end[0]!.half + end[1]!.half) / 2)),
    );
    for (let l = 0; l < LANES.length - 1; l++) {
      const lanes = [LANES[l]!, LANES[l + 1]!];
      const P = [A, B, C, D];
      for (let k = 0; k < 4; k++) {
        const p = end[k < 2 ? 0 : 1]!;
        const lane = lanes[k % 2]!;
        const off = lane * p.half;
        const q = P[k]!;
        // Left of the flow is −lane (the normal of (tx, tz) is (tz, −tx)).
        q[0] = p.x - p.tz * off;
        q[2] = p.z + p.tx * off;
        const g = o.ground(q[0], q[2]);
        const inside = Math.abs(lane) < 1;
        // Where the drawn ground is coarser than the bed (Lite's 8 m mesh fills a 4 m channel), the
        // water's middle rides just over it and keeps the bed's depth for its look, so the stream
        // runs on unbroken instead of vanishing under the ground in patches.
        q[1] = inside ? Math.max(p.y, g + 0.05) : p.y;
        const bed = p.depth * (1 - smoothstep(0.3, 1, Math.abs(lane)));
        depth[k] = inside ? Math.max(p.y - 0.03 - g, bed * 0.8) : p.y - 0.03 - g;
        along[k] = p.v;
        foam[k] = Math.min(1, p.foam + stoneFoam(q[0], q[2], p.tx, p.tz, o.stones));
      }
      strips.quad(
        A,
        B,
        C,
        D,
        end[0]!.v,
        end[1]!.v,
        { fill: 1, speed, kind: NATURAL_STREAM },
        lanes[0]! * meanHalf,
        lanes[1]! * meanHalf,
        {
          depth,
          foam,
          along,
        },
      );
    }
  }
}

/** White water round a stone and trailing downstream of it (the flow runs along (tx, tz)). */
function stoneFoam(
  x: number,
  z: number,
  tx: number,
  tz: number,
  stones: NaturalWaterOptions['stones'],
): number {
  let f = 0;
  for (const st of stones ?? []) {
    const dx = x - st.x;
    const dz = z - st.z;
    if (Math.abs(dx) > 8 || Math.abs(dz) > 8) continue;
    const down = dx * tx + dz * tz;
    const side = -dx * tz + dz * tx;
    // A wake: stretched three times as far downstream as up.
    const d = Math.hypot(side, down > 0 ? down / 3 : down);
    f = Math.max(f, 1 - smoothstep(st.r * 0.7, st.r + 1.1, d));
  }
  return f * 0.85;
}
