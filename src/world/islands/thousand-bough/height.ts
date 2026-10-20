import { fbm2, ridged2 } from '../../terrain/cove-height';
import { clamp01, segmentDistance, smoothstep } from '../../../util/math';
import { THOUSAND_BOUGH as TB, type Xyz } from './layout';
import { createThousandBoughWater, type ThousandBoughWater } from './water';

/**
 * Thousand-Bough's ground (spec §3.2), built like Meridian's: a noisy island with the cove bitten out
 * of its south-west, a horseshoe ridge (Mistcrown) round a jungle valley, the west spur down to West
 * Point, pads for the knoll, the flume shelf and the Spire's foot, the fresh water carved in, the Fern
 * Walk graded, and the sea floor falling to the deep floor at every edge of the baked data.
 *
 * The ridge's inner (valley) face is a shelf from the crest down to a lip, then a fluted cliff to the
 * valley floor; its outer face falls to sea cliffs on the north and east coasts.
 */

const SEED = 0x2_0b0_9b;

function mix(a: number, b: number, t: number): number {
  return a + (b - a) * clamp01(t);
}

/** A smooth maximum (k metres of blend), so a cliff's foot meets the valley in a fillet. */
function smax(a: number, b: number, k: number): number {
  const h = clamp01(0.5 + (0.5 * (b - a)) / k);
  return a * (1 - h) + b * h + k * h * (1 - h);
}

/** A ridge line: its crest points, and on each, the shelf (crest → lip) on the valley side. */
interface RidgeLine {
  points: readonly Xyz[];
  /** Per point: shelf length (m) and the lip's height. */
  shelf: readonly number[];
  lip: readonly number[];
  /** Per point: how far its outer face reaches before the sea cliff (m). */
  outer: readonly number[];
  /** +1 when the valley lies on the right of the line's direction, −1 on its left. */
  inner: 1 | -1;
}

/** The west spur (south to north) and the horseshoe (west to east), as one line: the valley on its right. */
const SPUR = [...TB.westSpur].reverse();
const RIDGES: readonly RidgeLine[] = [
  {
    points: [...SPUR, ...TB.ridge.slice(1)],
    shelf: [10, 16, 24, 46, 34, 52, 28, 24, 14],
    lip: [14, 27, 44, 62, 52, 70, 56, 40, 22],
    outer: [42, 64, 78, 92, 62, 96, 84, 80, 52],
    inner: 1,
  },
];

/** The nearest point on a ridge line: distance, signed side, crest height and the shelf there. */
interface RidgeHit {
  d: number;
  side: number;
  crest: number;
  shelf: number;
  lip: number;
  outer: number;
  /** Metres along the line (for the cliff's flutes). */
  along: number;
  /** 0 at the line's ends, 1 inside it (the ends round off). */
  inside: number;
}

const hit: RidgeHit = { d: 0, side: 0, crest: 0, shelf: 0, lip: 0, outer: 0, along: 0, inside: 1 };

function nearestRidge(line: RidgeLine, x: number, z: number, out: RidgeHit): RidgeHit {
  out.d = Infinity;
  let along = 0;
  const pts = line.points;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]!;
    const b = pts[i + 1]!;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len2 = dx * dx + dz * dz;
    const len = Math.sqrt(len2);
    const raw = ((x - a.x) * dx + (z - a.z) * dz) / len2;
    const t = clamp01(raw);
    const px = a.x + dx * t;
    const pz = a.z + dz * t;
    const d = Math.hypot(x - px, z - pz);
    if (d < out.d) {
      out.d = d;
      // Valley side: right of travel is (−dz, dx).
      const cross = ((x - px) * -dz + (z - pz) * dx) / len;
      out.side = Math.sign(cross) * line.inner;
      const k = t * t * (3 - 2 * t);
      out.crest = a.y + (b.y - a.y) * k;
      out.shelf = line.shelf[i]! + (line.shelf[i + 1]! - line.shelf[i]!) * t;
      out.lip = line.lip[i]! + (line.lip[i + 1]! - line.lip[i]!) * t;
      out.outer = line.outer[i]! + (line.outer[i + 1]! - line.outer[i]!) * t;
      out.along = along + len * t;
      // Past the line's ends the ridge rounds off over its outer reach.
      out.inside =
        (i === 0 && raw < 0) || (i === pts.length - 2 && raw > 1) ? 1 - smoothstep(0, out.outer, d) : 1;
    }
    along += len;
  }
  return out;
}

/** The ridge's height at (x, z): the crest, its shelf and fluted cliff inside, its slope to the sea cliffs outside. */
function ridgeProfile(line: RidgeLine, x: number, z: number): number {
  const r = nearestRidge(line, x, z, hit);
  const crest = r.crest + (ridged2(x * 0.02, z * 0.02, 3, SEED + 2) - 0.45) * 10;
  if (r.side > 0 && r.inside >= 1) {
    // Valley side: a rounded shelf from the crest to the lip, then the cliff.
    // Rounded basalt columns (no sharp creases between them), each its own width.
    const ph = r.along * 0.5 + fbm2(x * 0.03, z * 0.03, 2, SEED + 3) * 3;
    const flute =
      1.1 * (0.5 - 0.5 * Math.cos(ph * 2)) +
      0.35 * (0.5 - 0.5 * Math.cos(ph * 5.3)) +
      fbm2(x * 0.08, z * 0.08, 2, SEED + 4) * 1.2;
    const shelf = Math.max(6, r.shelf + fbm2(x * 0.015, z * 0.015, 2, SEED + 5) * 6);
    if (r.d < shelf) {
      const k = r.d / shelf;
      return crest - (crest - r.lip) * Math.pow(k, 1.5);
    }
    // Down the face in steps: every 11 m of drop a narrow ledge (moss and ferns hold there).
    const drop = Math.max(0, r.d - shelf + flute) * 3.4;
    const band = drop / 11;
    const f = Math.floor(band);
    return r.lip - (f + smoothstep(0.2, 1, band - f)) * 11;
  }
  // Seaward (and round the line's ends): down to the sea-cliff top, then the cliff.
  const reach = r.outer + fbm2(x * 0.01, z * 0.01, 3, SEED + 6) * 14;
  const top = Math.min(crest * 0.55, 20 + 14 * (fbm2(x * 0.012, z * 0.012, 2, SEED + 7) * 0.5 + 0.5));
  const d = r.d / Math.max(0.05, r.inside);
  if (d < reach) return top + (crest - top) * Math.pow(1 - d / reach, 1.25);
  return top - (d - reach) * 3.2;
}

/** How far inside the island's southern core (a noisy ellipse) a point is (m; negative offshore). */
function coreDistance(x: number, z: number): number {
  const dx = x - TB.center.x;
  const dz = z - TB.center.z;
  const theta = Math.atan2(dz, dx);
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  const { halfX, halfZ } = TB.island;
  const radius = 1 / Math.sqrt((c * c) / (halfX * halfX) + (s * s) / (halfZ * halfZ));
  const noise = fbm2(c * 2.6 + 4.1, s * 2.6 - 1.3, 4, SEED + 8) * TB.island.coastNoise;
  return radius + noise - Math.hypot(dx, dz);
}

/** The cove: < 1 inside its (wobbled) ellipse; it opens south through the mouth. */
function coveRadius(x: number, z: number): number {
  const c = TB.cove;
  const lx = (x - c.x) / c.rx;
  // The south half stretches out through the mouth to the open sea.
  const lz = (z - c.z) / (z > c.z ? c.rz * 1.6 : c.rz);
  const a = Math.atan2(lz, lx);
  const wobble = 1 + 0.05 * Math.sin(3 * a + 1.2) + 0.03 * Math.sin(7 * a + 0.4);
  return Math.hypot(lx, lz) / wobble;
}

/**
 * The valley floor (the ground between the cliffs): rising from the cove and the south coast toward
 * the cliffs' feet, lower toward the west and east pools, with a few control points to shape it.
 */
const VALLEY_POINTS: readonly (readonly [number, number, number, number])[] = [
  // x, z, height, influence radius
  [1950, -1440, 2.0, 18],
  [1948, -1458, 4.2, 16],
  [1934, -1488, 7.2, 18],
  [1950, -1510, 10.2, 14],
  [1990, -1500, 14, 26],
  [1980, -1532, 14.8, 14],
  [1880, -1610, 13.6, 30],
  [1870, -1530, 10, 40],
  [2066, -1594, 13.5, 20],
  [2135, -1612, 16.8, 34],
  [2110, -1560, 15, 34],
  [2170, -1500, 12, 40],
  [2200, -1420, 9, 40],
  [2150, -1350, 4.5, 40],
  [2080, -1430, 10, 40],
  [2030, -1470, 12, 30],
  [1995, -1400, 5.5, 30],
  [2010, -1665, 25.2, 26],
  [2060, -1650, 24, 30],
  [1955, -1650, 22, 30],
  [1930, -1570, 15, 30],
];

function valleyFloor(x: number, z: number, coast: number): number {
  const trend = 1.6 + 21 * (1 - Math.exp(-Math.max(0, coast) / 105));
  let sum = 0;
  let wsum = 0;
  for (const [px, pz, py, r] of VALLEY_POINTS) {
    const d2 = (x - px) ** 2 + (z - pz) ** 2;
    const w = Math.exp(-d2 / (r * r));
    sum += w * py;
    wsum += w;
  }
  const blend = wsum / (wsum + 0.15);
  const base = wsum > 1e-6 ? mix(trend, sum / wsum, blend) : trend;
  return base + fbm2(x * 0.03, z * 0.03, 4, SEED + 9) * 0.9 + fbm2(x * 0.11, z * 0.11, 2, SEED + 10) * 0.25;
}

function padHeight(
  x: number,
  z: number,
  current: number,
  pad: { x: number; z: number; height: number; radius: number },
  edge: number,
): number {
  const d = Math.hypot(x - pad.x, z - pad.z);
  return mix(current, pad.height, 1 - smoothstep(pad.radius, pad.radius + edge, d));
}

/** The Booth Pools' glade (Lyra stands on it). */
export const BOOTH_GLADE = 7.3;

/** The ground under the Root Hall's deck, the stair's foot and the trunk: just under the deck. */
export const KNOLL_GROUND = TB.knoll.height - 0.45;

/** The flume shelf's tilted face: it steps down 0.5 m a row from north to south under the tiles. */
export function flumeShelfY(z: number): number {
  return 22.25 - (z - TB.flume.center.z) * 0.156;
}

/** The Fern Walk's graded tread at (x, z): its height and how far off its centre line, or null far off it. */
const walk = { y: 0, d: 0 };

export function fernWalkAt(x: number, z: number): typeof walk | null {
  const pts = TB.fernWalk.points;
  let best = Infinity;
  let y = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]!;
    const b = pts[i + 1]!;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const t = clamp01(((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz));
    const d = Math.hypot(x - a.x - dx * t, z - a.z - dz * t);
    if (d < best) {
      best = d;
      y = a.y + (b.y - a.y) * t;
    }
  }
  if (best > 14) return null;
  walk.y = y;
  walk.d = best;
  return walk;
}

/** The island before its fresh water is carved in (the water's levels are taken from it). */
export function thousandBoughHeightDry(x: number, z: number): number {
  const core = coreDistance(x, z);
  // The ridge's land: wherever its slopes stand above the sea.
  let ridge = -Infinity;
  for (const line of RIDGES) ridge = Math.max(ridge, ridgeProfile(line, x, z));
  const offshore = Math.max(0, -core);
  const seaT = smoothstep(16, 150, offshore);
  const sea = -mix(0.6, TB.deepDepth, seaT) + fbm2(x * 0.012, z * 0.012, 4, SEED + 11) * 0.4 * (1 - seaT);
  const valley = valleyFloor(x, z, core);
  let h = core >= 0 ? mix(-0.4 + core * 0.12, valley, smoothstep(4, 40, core)) : sea;
  // The horseshoe stands over the valley; its foot meets the floor in a fillet.
  h = smax(h, ridge, 5);
  // Pads: the knoll under the tree, the flume shelf and the Spire's foot.
  const k = TB.knoll;
  h = padHeight(x, z, h, { x: k.x, z: k.z, height: KNOLL_GROUND, radius: 27 }, 30);
  const f = TB.flumeShelf;
  const shelf = 1 - smoothstep(f.radius, f.radius + f.edge, Math.hypot(x - f.x, z - f.z));
  h = mix(h, flumeShelfY(z) - 0.9, shelf);
  h = padHeight(x, z, h, { x: TB.spire.x, z: TB.spire.z, height: TB.spire.ground, radius: 9 }, 14);
  // The Booth Pools' glade: a level clearing just over the pools, where Lyra plays.
  h = padHeight(x, z, h, { x: 1925, z: -1493, height: BOOTH_GLADE, radius: 11 }, 12);
  h = coveHeight(x, z, h);
  h = fernWalkHeight(x, z, h);
  h = landingGround(x, z, h);
  h = westBeachHeight(x, z, h);
  h = fallsCliffHeight(x, z, h);
  h = caveHeight(x, z, h);
  // The approach lane, dredged to the mouth (its last leg is the cove's own basin).
  const lane = TB.harbor.lane;
  let ld = Infinity;
  for (let i = 0; i < lane.length - 2; i++)
    ld = Math.min(ld, segmentDistance(x, z, lane[i]!.x, lane[i]!.z, lane[i + 1]!.x, lane[i + 1]!.z));
  if (ld < 44) h = mix(h, Math.min(h, -7.2), 1 - smoothstep(34, 44, ld));
  // Past the seabed's radius everything is the deep floor.
  if (Math.hypot(x - TB.center.x, z - TB.center.z) > TB.seabedRadius) h = Math.min(h, -TB.deepDepth);
  return edgeApron(x, z, h);
}

/** The cove: a dredged basin (floor −6.5, the mouth −8) with a sandy shore round its north. */
function coveHeight(x: number, z: number, h: number): number {
  const c = TB.cove;
  const r = coveRadius(x, z);
  // A wide, gentle shelf up to the shore (a steep bank showed the terrain's 2 m cells as stripes).
  const basin = 1 - smoothstep(0.62, 1.14, r);
  if (basin <= 0) return h;
  const mouth = smoothstep(c.z + 20, c.z + 100, z);
  const floor = -mix(-c.floor, -c.mouthFloor, mouth) + fbm2(x * 0.05, z * 0.05, 3, SEED + 12) * 0.15;
  return mix(h, Math.min(h, floor), basin);
}

/** The Fern Walk is graded: a sunken lane or a low causeway, never steeper than its waypoints. */
function fernWalkHeight(x: number, z: number, h: number): number {
  const w = fernWalkAt(x, z);
  if (!w) return h;
  const half = TB.fernWalk.width / 2;
  const tread = w.y - 0.12;
  const core = 1 - smoothstep(half + 0.5, half + 2.2, w.d);
  const bank = 1 - smoothstep(half + 3, half + 14, w.d);
  // The banks either side ease from the tread into the ground (a gentle cutting through the knoll's rim).
  const banked = Math.min(Math.max(h, tread - (w.d - half) * 0.35), tread + (w.d - half) * 0.42);
  return mix(mix(h, banked, bank), tread, core);
}

/**
 * Great Falls' cliff: a near-sheer face leaning back from its foot (z −1641, y 19) to the lip (z
 * −1651, y 70), so the curtain (`GREAT_FALLS_CURTAIN`) hangs clear of it, and the ledge path runs
 * behind the water. South of the foot the ground stays under the ledge, down to the Mirror Pool.
 */
export const FALLS_CLIFF = { x0: 2128, x1: 2172, footZ: -1641, footY: 19, lean: 0.2 } as const;

export function fallsCliffY(z: number): number {
  return FALLS_CLIFF.footY + (FALLS_CLIFF.footZ - z) / FALLS_CLIFF.lean;
}

function fallsCliffHeight(x: number, z: number, h: number): number {
  const f = FALLS_CLIFF;
  const across = 1 - smoothstep(0, 10, Math.max(f.x0 - x, x - f.x1, 0));
  if (across <= 0 || z < -1664 || z > -1626) return h;
  const cap = z > f.footZ ? f.footY - 2.2 - (z - f.footZ) * 0.25 : fallsCliffY(z) - 0.8;
  return mix(h, Math.min(h, cap), across);
}

/**
 * The cove's west beach: a strip of sand at the spur's foot, from the Fernrun's mouth down to the
 * cove's south-west corner (the path's last three legs), where Old Kettle fishes.
 */
function westBeachHeight(x: number, z: number, h: number): number {
  const p = TB.sidePaths.westBeach;
  let d = Infinity;
  for (let i = 2; i < p.length - 1; i++)
    d = Math.min(d, segmentDistance(x, z, p[i]!.x, p[i]!.z, p[i + 1]!.x, p[i + 1]!.z));
  if (d > 12) return h;
  const beach = 1.15 + Math.max(0, d - 2) * 0.12;
  const core = 1 - smoothstep(2.5, 4, d);
  const bank = 1 - smoothstep(4, 12, d);
  const shaped = mix(h, Math.min(Math.max(h, beach - (d - 3) * 0.9), beach + Math.max(0, d - 3) * 1.4), bank);
  return mix(shaped, beach, core);
}

/** Under Bough Landing's deck and the wharf's land end the ground stays under the boards. */
function landingGround(x: number, z: number, h: number): number {
  const b = TB.harbor.boughLanding;
  const dx = Math.max(Math.abs(x - b.x) - b.sx / 2, 0);
  const dz = Math.max(Math.abs(z - b.z) - b.sz / 2, 0);
  const d = Math.hypot(dx, dz);
  if (d > 10) return h;
  const cap = b.y - 0.55 + d * 0.35;
  return Math.min(h, cap);
}

/** The cave behind Great Falls: a notch cut into the cliff, its floor at 19 (a rock roof is built over it). */
function caveHeight(x: number, z: number, h: number): number {
  const c = TB.cave;
  const lx = Math.abs(x - c.mouth.x);
  const lz = c.mouth.z - z;
  if (lz < -6 || lz > c.depth + 2) return h;
  const inside = (1 - smoothstep(c.width / 2 - 0.5, c.width / 2 + 1.5, lx)) * smoothstep(-6, -1, lz);
  return mix(h, Math.min(h, c.floor - 0.35), inside);
}

/**
 * Near the data's edges the sea floor slopes down to the deep floor, which it reaches at the edge
 * itself (as Meridian's).
 */
function edgeApron(x: number, z: number, h: number): number {
  const b = TB.bounds;
  const d = Math.min(x - b.minX, b.maxX - x, z - b.minZ, b.maxZ - z);
  const cap = -TB.deepDepth + Math.max(0, d) * 1.8;
  const k = 8;
  const t = Math.max(0, k - Math.abs(h - cap)) / k;
  return Math.max(Math.min(h, cap) - t * t * k * 0.25, Math.min(h, -TB.deepDepth));
}

let water: ThousandBoughWater | null = null;

/** The pools, falls and streams (built on first use from the dry island). */
export function thousandBoughWater(): ThousandBoughWater {
  return (water ??= createThousandBoughWater(thousandBoughHeightDry));
}

export function thousandBoughHeight(x: number, z: number): number {
  return thousandBoughWater().carve(x, z, thousandBoughHeightDry(x, z));
}

/** The ground's normal at (x, z), from the height's central differences 1.5 m either side. */
export function thousandBoughNormal(
  x: number,
  z: number,
  out: Float32Array | number[],
): Float32Array | number[] {
  const e = 1.5;
  const nx = -(thousandBoughHeight(x + e, z) - thousandBoughHeight(x - e, z)) / (2 * e);
  const nz = -(thousandBoughHeight(x, z + e) - thousandBoughHeight(x, z - e)) / (2 * e);
  const len = Math.hypot(nx, 1, nz) || 1;
  out[0] = nx / len;
  out[1] = 1 / len;
  out[2] = nz / len;
  return out;
}

const normal = [0, 1, 0];

/**
 * Ground masks: gold sand on the beaches, wet basalt on the cliffs and the Spire, mossy rock on the
 * steep ground, and jungle grass everywhere else (the paths are painted by the terrain regions).
 */
export function thousandBoughMasks(
  x: number,
  z: number,
): { sand: number; grass: number; rock: number; cliff: number } {
  const h = thousandBoughHeight(x, z);
  const n = thousandBoughNormal(x, z, normal);
  const slope = Math.hypot(n[0]!, n[2]!) / Math.max(0.05, n[1]!);
  const shore = smoothstep(-6, -0.8, h) * (1 - smoothstep(1.6, 3.6, h));
  let sand = shore * (1 - smoothstep(0.35, 0.7, slope));
  let cliff = smoothstep(0.75, 1.3, slope);
  let rock = Math.max(smoothstep(0.42, 0.85, slope), shore * (1 - sand) * 0.6, h < -8 ? 0.2 : 0);
  let grass = smoothstep(0.8, 4, h) * (1 - smoothstep(0.45, 0.85, slope));
  // Fresh water: wet stone in the channels, lush banks round them.
  const shoreDist = thousandBoughWater().shoreDistance(x, z, 12);
  if (shoreDist < 12) {
    const wet = 1 - smoothstep(0, 1.2, shoreDist);
    const bank = (1 - smoothstep(1, 8, shoreDist)) * (1 - wet) * (1 - smoothstep(0.5, 1.1, slope));
    rock = Math.max(rock, wet * 0.75);
    grass = Math.max(grass, bank);
    sand *= 1 - wet;
  }
  // The paths' tread: the bake calls it sand, and the terrain regions paint that sand as trodden earth.
  const tread = pathTread(x, z);
  if (tread > 0) {
    sand = Math.max(sand, tread * 0.9);
    grass *= 1 - tread * 0.85;
    rock *= 1 - tread * 0.6;
  }
  cliff = clamp01(cliff);
  rock = clamp01(rock * (1 - cliff * 0.3));
  sand = clamp01(sand * (1 - cliff));
  grass = clamp01(grass * (1 - cliff) * (1 - sand * 0.6));
  const total = sand + grass + rock + cliff;
  if (total < 0.001) return { sand: 0.2, grass: 0, rock: 0.8, cliff: 0 };
  return { sand: sand / total, grass: grass / total, rock: rock / total, cliff: cliff / total };
}

/** 1 on a path's tread (the Fern Walk and the side paths), easing out over a metre or two. */
function pathTread(x: number, z: number): number {
  let t = 0;
  const w = fernWalkAt(x, z);
  if (w) t = 1 - smoothstep(TB.fernWalk.width / 2 - 0.3, TB.fernWalk.width / 2 + 1.2, w.d);
  for (const path of [TB.sidePaths.mirror, TB.sidePaths.westBeach])
    for (let i = 0; i < path.length - 1; i++) {
      const d = segmentDistance(x, z, path[i]!.x, path[i]!.z, path[i + 1]!.x, path[i + 1]!.z);
      t = Math.max(t, 1 - smoothstep(1.0, 2.4, d));
    }
  return t;
}

/** Distance (m) from (x, z) to the ship's approach lane's centre line (the mouth and on to the berth). */
export function laneDistance(x: number, z: number): number {
  const lane = TB.harbor.lane;
  let best = Infinity;
  for (let i = 0; i < lane.length - 1; i++)
    best = Math.min(best, segmentDistance(x, z, lane[i]!.x, lane[i]!.z, lane[i + 1]!.x, lane[i + 1]!.z));
  return best;
}
