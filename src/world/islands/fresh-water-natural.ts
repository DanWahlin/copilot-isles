import type { InlandWater } from '../../game/collision';
import type { WaterStrips } from '../sites/water';
import {
  basinBed,
  basinRadius,
  type FreshWater,
  type StreamPoint,
  type WaterBasin,
  type WaterStream,
} from './meridian-water';
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
/** A pool's outer ring (a share of its shore). */
const POOL_EDGE = RINGS[RINGS.length - 1]!;
/**
 * Where a stream running into or out of a pool overlaps it: from the pool's shore (`SHORE`) to its
 * outer ring the pool fades out and the stream fades in, on the same surface in the pool's look, so
 * neither water's edge shows; then the stream eases to its own look over `JOIN` m (`joinPool`).
 */
const SHORE = 1;
const JOIN = 5;

const corner = (): [number, number, number] => [0, 0, 0];

/** How steep a stream's reach is (0 level → 1 at 0.9 fall per metre); past `FALLS` it's a fall. */
export function steepness(slope: number): number {
  return Math.min(1, slope / 0.9);
}
export const FALLS = 0.6;

/** How much higher than its surface a stream's water is drawn on its steeper runs (m), where the 2 m pack can't follow the bed. */
function lift(steep: number): number {
  return steep * 0.3;
}

/** How deep a natural stream reads `lane` across (0 middle, 1 its edge), where the bed under the middle lies `depth` down. */
function streamBed(depth: number, lane: number): number {
  return depth * (1 - smoothstep(0.3, 1, Math.abs(lane))) * 0.8;
}

/** How deep a pool reads at basin radius `d` (< 1 inside its shore; its carved bed, `basinBed`). */
function poolBed(b: WaterBasin, d: number): number {
  return (b.level - basinBed(b, d)) * 0.8;
}

/** Natural water over the drawn ground (`rideOver`). */
interface Riding {
  /** Its surface (m). */
  y: number;
  /** How deep it reads (m; its colour, its shore, and how deep you wade). */
  depth: number;
}

/**
 * Natural water at a level `level` over the drawn ground `ground` (the tier's mesh), `bed` deep in its
 * own bed (`streamBed`, `poolBed`). Within its edge (`inside`), where the drawn ground is coarser than
 * the bed (Lite's 4 m mesh fills a 4 m channel, or a spring pool's rim), the water rides just over that
 * ground and keeps the bed's depth, so it's unbroken and reads (and wades) as deep as on High; past its
 * edge it lies at its level and fades where the ground stands over it. The water mesh and the walker
 * both use this, so what you wade is what's drawn.
 */
function rideOver(level: number, ground: number, bed: number, inside: boolean, out: Riding): Riding {
  out.y = inside ? Math.max(level, ground + 0.02) : level;
  out.depth = inside ? Math.max(level - ground, bed) : level - ground;
  return out;
}

const POINT: StreamPoint = { surface: 0, depth: 0, lane: 0, slope: 0 };
const RIDE: Riding = { y: 0, depth: 0 };

/**
 * An island's natural fresh water at (x, z) over the drawn ground `ground` there (what the walker
 * stands on), into `out`, as the water mesh draws it (`rideOver`): its surface, and the bed you wade
 * on (under the drawn ground where a coarse ground fills it), so a pool or a stream you walk into is as
 * deep on every tier. False where there's none.
 */
export function naturalWaterAt(
  water: FreshWater,
  x: number,
  z: number,
  ground: number,
  out: InlandWater,
): boolean {
  let found = false;
  const b = water.basinAt(x, z);
  if (b) {
    rideOver(b.level, ground, poolBed(b, basinRadius(b, x, z)), true, RIDE);
    out.level = RIDE.y;
    out.floor = Math.min(ground, RIDE.y - RIDE.depth);
    found = true;
  }
  if (!water.streamAt(x, z, POINT) || (found && POINT.surface <= out.level)) return found;
  if (steepness(POINT.slope) > FALLS) {
    out.level = POINT.surface;
    out.floor = ground;
    return true;
  }
  streamRide(POINT, ground, RIDE);
  out.level = RIDE.y;
  out.floor = Math.min(ground, RIDE.y - RIDE.depth);
  return true;
}

/** A stream's water at `point` (`FreshWater.streamAt`) over the drawn ground `ground`, as it's drawn. */
function streamRide(point: StreamPoint, ground: number, out: Riding): Riding {
  const steep = steepness(point.slope);
  return rideOver(point.surface + lift(steep), ground, streamBed(point.depth, point.lane), true, out);
}

export function addNaturalFreshWater(strips: WaterStrips, water: FreshWater, o: NaturalWaterOptions): void {
  for (const b of Object.values(water.basins)) pool(strips, water, b, o);
  for (const s of water.streams) stream(strips, water, s, o);
}

/** Where a pool's water comes in: a fall's foot, if one lands in it (r its reach); else its middle (r 0). */
function poolSource(
  water: FreshWater,
  b: WaterBasin,
  o: NaturalWaterOptions,
): { x: number; z: number; r: number } {
  let src = { x: b.x, z: b.z, r: 0 };
  for (const p of o.plunges ?? [])
    if (water.basinAt(p.x, p.z, 1.15) === b && (src.r === 0 || p.r > src.r)) src = { ...p };
  return src;
}

/** A pool's white water `d` m from where its water comes in. */
function poolFoam(src: { r: number }, d: number): number {
  return src.r > 0 ? 1 - smoothstep(src.r * 0.3, src.r, d) : 0;
}

function pool(strips: WaterStrips, water: FreshWater, b: WaterBasin, o: NaturalWaterOptions): void {
  const big = Math.max(b.rx, b.rz);
  const segs = big < 6 ? 20 : big < 14 ? 36 : 48;
  const src = poolSource(water, b, o);
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
  const fill = [1, 1, 1, 1];
  const ride: Riding = { y: 0, depth: 0 };
  // Ring `r`'s vertex `q` as corner `k` of the quad.
  const set = (p: [number, number, number], q: [number, number], k: number, r: number) => {
    const k0 = RINGS[r]!;
    const g = o.ground(q[0], q[1]);
    rideOver(b.level, g, poolBed(b, k0), k0 < 1, ride);
    p[0] = q[0];
    // Drawn 2 cm over its level.
    p[1] = ride.y + 0.02;
    p[2] = q[1];
    depth[k] = ride.depth;
    fill[k] = 1;
    // Past its shore the water fades out by its outer ring, soft, not at the mesh's edge (where the
    // ground falls away outside). Where a stream runs in or out, the ring takes the stream's surface
    // and depth, as the stream draws them there, and fades out as the stream fades in (`joinPool`).
    if (k0 > SHORE && water.streamAt(q[0], q[1], POINT) && steepness(POINT.slope) <= FALLS) {
      streamRide(POINT, g, ride);
      p[1] = ride.y + 0.03;
      depth[k] = ride.depth;
      fill[k] = 0;
    } else if (k0 > SHORE) depth[k] = Math.min(ride.depth, -0.02);
    const d = Math.hypot(q[0] - src.x, q[1] - src.z);
    along[k] = d;
    foam[k] = poolFoam(src, d);
  };
  for (let j = 0; j < RINGS.length - 1; j++)
    for (let i = 0; i < segs; i++) {
      set(A, ring[j]![i]!, 0, j);
      set(B, ring[j]![i + 1]!, 1, j);
      set(C, ring[j + 1]![i]!, 2, j + 1);
      set(D, ring[j + 1]![i + 1]!, 3, j + 1);
      strips.quad(A, B, C, D, 0, 0, { fill: 1, speed: 0.2, kind: NATURAL_POOL }, 0, 0, {
        depth,
        fill,
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

/** Where along a stream's segment i → i + 1 it crosses a pool's shore (0..1), from the inside end. */
function poolCrossing(water: FreshWater, s: WaterStream, i: number, insideAtStart: boolean): number {
  let lo = 0;
  let hi = 1;
  for (let k = 0; k < 14; k++) {
    const t = (lo + hi) / 2;
    const x = s.x[i]! + (s.x[i + 1]! - s.x[i]!) * t;
    const z = s.z[i]! + (s.z[i + 1]! - s.z[i]!) * t;
    const inside = water.basinAt(x, z, SHORE) !== null;
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
  const kind = [0, 0, 0, 0];
  const fill = [1, 1, 1, 1];
  const ride: Riding = { y: 0, depth: 0 };
  // Each end of the segment: its point, width, height, flow and tangent (the start, then the end).
  const end = [
    { x: 0, z: 0, half: 0, depth: 0, y: 0, v: 0, tx: 0, tz: 0, foam: 0 },
    { x: 0, z: 0, half: 0, depth: 0, y: 0, v: 0, tx: 0, tz: 0, foam: 0 },
  ];
  // Each reach's slope, and at each sample the mean of the reaches either side, so its lift, white
  // water and pace change smoothly from one reach to the next (no step or seam where they meet).
  const reach = new Float64Array(Math.max(1, n - 1));
  for (let i = 0; i < n - 1; i++) {
    const run = Math.hypot(s.x[i + 1]! - s.x[i]!, s.z[i + 1]! - s.z[i]!) || 1;
    reach[i] = Math.max(0, (s.surface[i]! - s.surface[i + 1]!) / run);
  }
  const slopeAt = new Float64Array(n);
  for (let i = 0; i < n; i++) slopeAt[i] = (reach[Math.max(0, i - 1)]! + reach[Math.min(n - 2, i)]!) / 2;
  // Narrow reaches run faster (the same water through less width), steep ones faster still.
  const pace = new Float64Array(n);
  let meanPace = 0;
  for (let i = 0; i < n; i++) {
    pace[i] = Math.min(3, (0.55 + steepness(slopeAt[i]!) * 2.4) * Math.sqrt(meanHalf / s.half[i]!));
    meanPace += pace[i]! / n;
  }
  // The ripples ride on the time the water takes to get here (at the stream's mean pace), so each
  // reach flows at its own pace and the pattern never tears where the pace changes.
  const travel = new Float64Array(n);
  for (let i = 0; i < n - 1; i++) {
    const len = Math.hypot(s.x[i + 1]! - s.x[i]!, s.z[i + 1]! - s.z[i]!, s.surface[i]! - s.surface[i + 1]!);
    travel[i + 1] = travel[i]! + (len * meanPace * 2) / (pace[i]! + pace[i + 1]!);
  }
  for (let i = 0; i < n - 1; i++) {
    // Falls down a cliff keep the falling-water look (the caller draws them).
    if (steepness(reach[i]!) > FALLS) continue;
    const inA = water.basinAt(s.x[i]!, s.z[i]!, SHORE) !== null;
    const inB = water.basinAt(s.x[i + 1]!, s.z[i + 1]!, SHORE) !== null;
    // In a pool the pool's own water is drawn (no strip across it).
    if (inA && inB) continue;
    let t0 = 0;
    let t1 = 1;
    if (inA) t0 = poolCrossing(water, s, i, true);
    if (inB) t1 = poolCrossing(water, s, i, false);
    for (let e = 0; e < 2; e++) {
      const t = e === 0 ? t0 : t1;
      const p = end[e]!;
      p.x = s.x[i]! + (s.x[i + 1]! - s.x[i]!) * t;
      p.z = s.z[i]! + (s.z[i + 1]! - s.z[i]!) * t;
      p.half = s.half[i]! + (s.half[i + 1]! - s.half[i]!) * t;
      p.depth = s.depth[i]! + (s.depth[i + 1]! - s.depth[i]!) * t;
      const slope = slopeAt[i]! + (slopeAt[i + 1]! - slopeAt[i]!) * t;
      // Lifted a little more on steeper runs, where the 2 m terrain pack can't follow the bed.
      p.y = s.surface[i]! + (s.surface[i + 1]! - s.surface[i]!) * t + lift(steepness(slope));
      p.v = travel[i]! + (travel[i + 1]! - travel[i]!) * t;
      const ta = tangentAt(s, i);
      const tax = ta[0];
      const taz = ta[1];
      const tb = tangentAt(s, i + 1);
      const tx = tax + (tb[0] - tax) * t;
      const tz = taz + (tb[1] - taz) * t;
      const tl = Math.hypot(tx, tz) || 1;
      p.tx = tx / tl;
      p.tz = tz / tl;
      // Steep and narrow riffles run whiter.
      p.foam = smoothstep(0.12, 0.8, slope) * 0.7 + smoothstep(1.05, 0.7, p.half / meanHalf) * 0.22;
    }
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
        rideOver(p.y, g, streamBed(p.depth, lane), Math.abs(lane) < 1, ride);
        // Drawn 3 cm over its surface (clear of a ground just under it).
        q[1] = ride.y + 0.03;
        depth[k] = ride.depth;
        foam[k] = Math.min(1, p.foam + stoneFoam(q[0], q[2], p.tx, p.tz, o.stones));
        along[k] = p.v;
        kind[k] = NATURAL_STREAM;
        fill[k] = joinPool(water, o, q, k, foam, along, kind);
      }
      strips.quad(
        A,
        B,
        C,
        D,
        end[0]!.v,
        end[1]!.v,
        { fill: 1, speed: meanPace, kind: NATURAL_STREAM },
        lanes[0]! * meanHalf,
        lanes[1]! * meanHalf,
        {
          depth,
          foam,
          along,
          kind,
          fill,
        },
      );
    }
  }
}

/**
 * A stream's corner `q` (`k`) by a pool it runs into or out of: from the pool's shore to its outer
 * ring it's drawn in the pool's look (white water, ripple distance) and fades in as the pool's ring
 * fades out over it (on the same surface: the ring takes the stream's there); over `JOIN` m past the
 * ring it eases to its own look. Returns how full it's drawn.
 */
function joinPool(
  water: FreshWater,
  o: NaturalWaterOptions,
  q: number[],
  k: number,
  foam: number[],
  along: number[],
  kind: number[],
): number {
  let near: WaterBasin | null = null;
  let r = Infinity;
  for (const b of Object.values(water.basins)) {
    const d = basinRadius(b, q[0]!, q[2]!);
    if (d >= r) continue;
    near = b;
    r = d;
  }
  if (!near) return 1;
  const past = (r - POOL_EDGE) * ((near.rx + near.rz) / 2);
  if (past >= JOIN) return 1;
  const w = 1 - smoothstep(0, JOIN, Math.max(0, past));
  const src = poolSource(water, near, o);
  const d = Math.hypot(q[0]! - src.x, q[2]! - src.z);
  foam[k] = foam[k]! + (poolFoam(src, d) - foam[k]!) * w;
  along[k] = along[k]! + (d - along[k]!) * w;
  kind[k] = NATURAL_STREAM + (NATURAL_POOL - NATURAL_STREAM) * w;
  return Math.min(1, Math.max(0, (r - SHORE) / (POOL_EDGE - SHORE)));
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
