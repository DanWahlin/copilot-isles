/**
 * Port Meridian's fresh water: a small tarn on the ridge top spills down the north face in a
 * cascade to a plunge pool, a brook runs on across the east slopes into a lake, and the lake's
 * outflow tumbles over its lip and down to the sea on the north-east shore.
 *
 * Pure data and maths (no three.js), shared by the terrain (which carves the basins and channels),
 * the water mesh, the walker (wading) and the plant layout. It knows nothing about the island's
 * own height function: `createMeridianWater(dry)` is handed the uncarved height, so this module
 * doesn't import `meridian.ts`.
 */

import { mulberry32, smoothstep } from '../../util/math';

export interface WaterBasinSpec {
  readonly x: number;
  readonly z: number;
  /** Half-axes (m) of the shoreline before its wobble, and its yaw (rad). */
  readonly rx: number;
  readonly rz: number;
  readonly rot: number;
  /** Extra depth below the wading shelf (m). */
  readonly depth: number;
  /** Fixed water level (m); without it, just under the lowest point of the natural rim. */
  readonly level?: number;
  readonly phase: number;
  /** Bank slopes outside the shore: how steeply a cut rises, and a berm falls away (per metre). */
  readonly cut: number;
  readonly levee: number;
}

export interface StreamSpec {
  /** Centre line, upstream first (it may start inside a basin and end inside one, or in the sea). */
  readonly points: readonly (readonly [number, number])[];
  /** Half the water's width (m). */
  readonly halfWidth: number;
  /** How deep the bed lies below the water in the middle (m). */
  readonly depth: number;
  /** The least fall per metre, so a stream through a rise still runs (never a level canal). */
  readonly minFall: number;
  /** The basin it starts from (its level is the stream's start). */
  readonly from: string;
  /** The basin it ends in (the water never drops below its level), or the sea. */
  readonly to: string;
  /** Holds the start basin's level out over its lip until the ground is this far below (a fall). */
  readonly lip?: number;
  /** How fast its berm falls away (per metre); steep down a cliff, so it never builds a wall. */
  readonly levee?: number;
  /** How far its banks stand over the water at its edge (m; 0.1 by default, a stream in a real bed higher). */
  readonly bank?: number;
  /**
   * A natural course (opt-in): seeded meanders swinging off the centre line between its ends, a width
   * that narrows into riffles and widens into slow reaches (deeper there), a bed rounded across, and
   * banks that wander. Without it the stream keeps its centre line and `halfWidth` exactly.
   */
  readonly course?: StreamCourse;
}

export interface StreamCourse {
  readonly seed: number;
  /** How far the meanders swing either side of the centre line (m), and their wavelength (m). */
  readonly meander: number;
  readonly wavelength: number;
  /** The narrowest and widest half-width (m). */
  readonly minHalf: number;
  readonly maxHalf: number;
  /**
   * Places the course passes unchanged (a bridge, a crossing): no swing within `r` m along it, and
   * the half-width there `half` (default the stream's `halfWidth`).
   */
  readonly pins?: readonly {
    readonly x: number;
    readonly z: number;
    readonly r: number;
    readonly half?: number;
  }[];
}

export const MERIDIAN_WATER_SPEC = {
  basins: {
    tarn: { x: 1090, z: -1076, rx: 13, rz: 9, rot: 0.25, depth: 0.5, phase: 1.3, cut: 0.9, levee: 0.6 },
    pool: { x: 1081, z: -982, rx: 8, rz: 6.5, rot: -0.2, depth: 0.7, phase: 4.1, cut: 1.6, levee: 0.6 },
    lake: {
      x: 1008,
      z: -848,
      rx: 44,
      rz: 27,
      rot: -0.28,
      depth: 1.25,
      level: 21,
      phase: 0.4,
      cut: 0.32,
      levee: 0.22,
    },
  },
  streams: [
    {
      // The cascade: out over the tarn's north lip and down the ridge face.
      points: [
        [1088, -1072],
        [1085, -1060],
        [1089, -1046],
        [1084, -1032],
        [1078, -1018],
        [1083, -1004],
        [1081, -992],
        [1081, -984],
      ],
      halfWidth: 3.2,
      depth: 0.9,
      minFall: 0.05,
      levee: 1.4,
      from: 'tarn',
      to: 'pool',
    },
    {
      // The brook: north from the plunge pool, through a little ravine, and into the lake.
      points: [
        [1080, -980],
        [1076, -962],
        [1068, -942],
        [1056, -922],
        [1046, -904],
        [1034, -886],
        [1022, -872],
        [1014, -860],
      ],
      halfWidth: 1.7,
      depth: 0.4,
      minFall: 0.025,
      from: 'pool',
      to: 'lake',
    },
    {
      // The outflow: over the lake's north lip and down to the sea.
      points: [
        [1020, -836],
        [1030, -818],
        [1044, -800],
        [1062, -782],
        [1082, -766],
        [1102, -750],
        [1120, -736],
        [1136, -724],
      ],
      halfWidth: 1.8,
      depth: 0.4,
      minFall: 0.02,
      from: 'lake',
      to: 'sea',
    },
  ] satisfies StreamSpec[],
} as const;

export type BasinName = keyof typeof MERIDIAN_WATER_SPEC.basins;

/** An island's fresh water: named basins, and streams between them (or out to the sea). */
export interface FreshWaterSpec<N extends string = string> {
  readonly basins: Readonly<Record<N, WaterBasinSpec>>;
  readonly streams: readonly StreamSpec[];
}

export interface WaterBasin extends WaterBasinSpec {
  readonly name: string;
  readonly level: number;
  /** Bounding radius of the shoreline (m). */
  readonly reach: number;
}

/** A stream resampled every `STEP` metres, with its water surface at each sample. */
export interface WaterStream {
  readonly spec: StreamSpec;
  readonly x: Float64Array;
  readonly z: Float64Array;
  readonly surface: Float64Array;
  /** Metres along the stream. */
  readonly along: Float64Array;
  /** Half the water's width at each sample (m; `halfWidth` everywhere without a natural course). */
  readonly half: Float64Array;
  /** How deep its bed lies under the water at each sample, in the middle (m). */
  readonly depth: Float64Array;
  readonly count: number;
  readonly box: { minX: number; maxX: number; minZ: number; maxZ: number };
}

export interface FreshWater<N extends string = string> {
  readonly basins: Record<N, WaterBasin>;
  readonly streams: readonly WaterStream[];
  /** Box (with margin) outside which nothing here has any effect. */
  readonly box: { minX: number; maxX: number; minZ: number; maxZ: number };
  /** The terrain with the basins and channels carved into the dry height `h`. */
  carve(x: number, z: number, h: number): number;
  /** The water surface at (x, z), or null where there's no fresh water. */
  levelAt(x: number, z: number): number | null;
  /** How far (m) outside the nearest water's edge, 0 inside it (capped at `cap`). */
  shoreDistance(x: number, z: number, cap?: number): number;
  /** A point on a basin's shoreline (its wobbled outline scaled by `k`) at angle `a`. */
  rimPoint(basin: WaterBasin, a: number, k?: number): [number, number];
  /** The basin whose (wobbled) shoreline scaled by `k` holds (x, z), or null. */
  basinAt(x: number, z: number, k?: number): WaterBasin | null;
}

const STEP = 2;
/** Bank slopes (rise or fall per metre outside the water's edge). */
const CUT = 0.6;
const LEVEE = 0.3;
const LEVEE_CREST = 2.5;
const BED_MARGIN = 1;
/** How far a natural stream's bank rises past its water's edge (m). */
const NATURAL_BANK = 1.8;
/** How much nearer (m) the nearest reach of a natural stream must be to carry it alone. */
const NEAREST_BLEND = 2.5;
/** The steepest a natural stream runs (fall per metre). */
const NATURAL_GRADE = 0.1;
/** How fast a natural stream's bank falls away outside it where the ground is lower (per metre). */
const NATURAL_LEVEE = 0.9;
/** How far past its end a natural stream's banks ease back into the ground (m). */
const END_EASE = 8;
/** How far out the banks can reach before the natural ground takes over everywhere. */
const REACH = 22;

function wobble(b: WaterBasinSpec, a: number): number {
  return 1 + 0.09 * Math.sin(3 * a + b.phase) + 0.05 * Math.sin(5 * a + b.phase * 2.3);
}

/** The basin-relative radius: < 1 inside the (wobbled) shoreline. Writes the angle to `out[0]`. */
function basinRadius(b: WaterBasinSpec, x: number, z: number): number {
  const dx = x - b.x;
  const dz = z - b.z;
  const c = Math.cos(b.rot);
  const s = Math.sin(b.rot);
  const lx = (dx * c + dz * s) / b.rx;
  const lz = (-dx * s + dz * c) / b.rz;
  const a = Math.atan2(lz, lx);
  return Math.hypot(lx, lz) / wobble(b, a);
}

function rimPointOf(b: WaterBasinSpec, a: number, k = 1): [number, number] {
  const w = wobble(b, a) * k;
  const lx = Math.cos(a) * b.rx * w;
  const lz = Math.sin(a) * b.rz * w;
  const c = Math.cos(b.rot);
  const s = Math.sin(b.rot);
  return [b.x + lx * c - lz * s, b.z + lx * s + lz * c];
}

function mix(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Catmull-Rom through the control points, resampled every STEP metres. */
function resample(points: readonly (readonly [number, number])[]): [number, number][] {
  const dense: [number, number][] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)]!;
    const p1 = points[i]!;
    const p2 = points[i + 1]!;
    const p3 = points[Math.min(points.length - 1, i + 2)]!;
    for (let k = 0; k < 16; k++) {
      const t = k / 16;
      const t2 = t * t;
      const t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number) =>
        0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      dense.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  dense.push([points[points.length - 1]![0], points[points.length - 1]![1]]);
  const out: [number, number][] = [dense[0]!];
  let carry = 0;
  for (let i = 1; i < dense.length; i++) {
    const [ax, az] = dense[i - 1]!;
    const [bx, bz] = dense[i]!;
    const len = Math.hypot(bx - ax, bz - az);
    let d = STEP - carry;
    while (d <= len) {
      out.push([ax + ((bx - ax) * d) / len, az + ((bz - az) * d) / len]);
      d += STEP;
    }
    carry = len - (d - STEP);
  }
  const last = dense[dense.length - 1]!;
  const tail = out[out.length - 1]!;
  if (Math.hypot(last[0] - tail[0], last[1] - tail[1]) > STEP * 0.3) out.push(last);
  return out;
}

/**
 * A natural course from a resampled centre line: each sample swung sideways by seeded meanders (none
 * at the ends or the pins, so it still leaves and enters its basins where the line does), with its
 * half-width breathing between the course's bounds (narrow riffles, wide slow reaches) and a bed
 * deepest where it's widest.
 */
export function naturalCourse(
  pts: readonly (readonly [number, number])[],
  spec: Pick<StreamSpec, 'halfWidth' | 'depth'>,
  c: StreamCourse,
): { pts: [number, number][]; half: number[]; depth: number[] } {
  const n = pts.length;
  const s = [0];
  for (let i = 1; i < n; i++)
    s.push(s[i - 1]! + Math.hypot(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1]));
  const total = s[n - 1]!;
  const rand = mulberry32(c.seed);
  const ph = [rand(), rand(), rand(), rand()].map((r) => r * Math.PI * 2);
  const taper = Math.min(c.wavelength * 0.5, total / 3);
  // Where along the line each pin lies.
  const pins = (c.pins ?? []).map((p) => {
    let best = 0;
    for (let i = 1; i < n; i++)
      if (
        Math.hypot(pts[i]![0] - p.x, pts[i]![1] - p.z) < Math.hypot(pts[best]![0] - p.x, pts[best]![1] - p.z)
      )
        best = i;
    return { at: s[best]!, r: p.r, half: p.half ?? spec.halfWidth };
  });
  const out: [number, number][] = [];
  const half: number[] = [];
  const depth: number[] = [];
  const k = (Math.PI * 2) / c.wavelength;
  for (let i = 0; i < n; i++) {
    const a = s[i]!;
    let hold = smoothstep(0, taper, a) * smoothstep(0, taper, total - a);
    let pinHalf = 0;
    let pinned = 0;
    for (const p of pins) {
      const free = smoothstep(0, p.r, Math.abs(a - p.at));
      if (1 - free > pinned) {
        pinned = 1 - free;
        pinHalf = p.half;
      }
      hold *= free;
    }
    const swing =
      c.meander * hold * (0.62 * Math.sin(a * k + ph[0]!) + 0.38 * Math.sin(a * k * 2.13 + ph[1]!));
    const prev = pts[Math.max(0, i - 1)]!;
    const next = pts[Math.min(n - 1, i + 1)]!;
    const dx = next[0] - prev[0];
    const dz = next[1] - prev[1];
    const len = Math.hypot(dx, dz) || 1;
    out.push([pts[i]![0] - (dz / len) * swing, pts[i]![1] + (dx / len) * swing]);
    const kw = k * 0.8;
    const breathe = 0.5 + 0.5 * (0.65 * Math.sin(a * kw + ph[2]!) + 0.35 * Math.sin(a * kw * 2.31 + ph[3]!));
    const h = mix(c.minHalf, c.maxHalf, Math.min(1, Math.max(0, breathe)));
    half.push(mix(h, pinHalf, pinned));
    const wide = (half[i]! - c.minHalf) / Math.max(0.01, c.maxHalf - c.minHalf);
    depth.push(spec.depth * (0.75 + 0.55 * Math.min(1, Math.max(0, wide))));
  }
  return { pts: out, half, depth };
}

/** How far a natural stream's edge wanders off its half-width (a share of it), by place: banks aren't ruled lines. */
function bankWander(x: number, z: number): number {
  return 0.11 * Math.sin(x * 0.83 + z * 0.37) * Math.sin(z * 0.71 - x * 0.29 + 1.3);
}

/** Where the water's edge lies from the centre line at (x, z): its half-width, wandering on a natural course. */
function edgeOf(s: WaterStream, near: Nearest, x: number, z: number): number {
  return s.spec.course ? near.half * (1 + bankWander(x, z)) : near.half;
}

/** Nearest point on a stream: distance from the centre line and the water surface there. */
interface Nearest {
  dist: number;
  surface: number;
  /** Half-width and bed depth there. */
  half: number;
  depth: number;
  /** True when the nearest point is a stream end and (x, z) lies beyond it. */
  beyondEnd: boolean;
  /** How far (m) beyond that end, along the stream's line. */
  past: number;
}

function nearestOnStream(s: WaterStream, x: number, z: number, out: Nearest): Nearest {
  out.dist = Infinity;
  out.surface = 0;
  out.half = 0;
  out.depth = 0;
  out.beyondEnd = false;
  out.past = 0;
  const last = s.count - 2;
  for (let i = 0; i <= last; i++) {
    const ax = s.x[i]!;
    const az = s.z[i]!;
    const dx = s.x[i + 1]! - ax;
    const dz = s.z[i + 1]! - az;
    const raw = ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz);
    const t = Math.min(1, Math.max(0, raw));
    const d = Math.hypot(x - ax - dx * t, z - az - dz * t);
    if (d < out.dist) {
      out.dist = d;
      out.surface = s.surface[i]! + (s.surface[i + 1]! - s.surface[i]!) * t;
      out.half = s.half[i]! + (s.half[i + 1]! - s.half[i]!) * t;
      out.depth = s.depth[i]! + (s.depth[i + 1]! - s.depth[i]!) * t;
      out.beyondEnd = (i === 0 && raw < 0) || (i === last && raw > 1);
      out.past = out.beyondEnd ? (raw < 0 ? -raw : raw - 1) * Math.sqrt(dx * dx + dz * dz) : 0;
    }
  }
  // A natural course blends what it carries over the reaches nearly as close as the nearest, so the
  // ground doesn't step where the nearest jumps from one arm of a bend to the other.
  if (s.spec.course) {
    let wSum = 0;
    let surface = 0;
    let half = 0;
    let depth = 0;
    for (let i = 0; i <= last; i++) {
      const ax = s.x[i]!;
      const az = s.z[i]!;
      const dx = s.x[i + 1]! - ax;
      const dz = s.z[i + 1]! - az;
      const t = Math.min(1, Math.max(0, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
      const d = Math.hypot(x - ax - dx * t, z - az - dz * t);
      const k = 1 - (d - out.dist) / NEAREST_BLEND;
      if (k <= 0) continue;
      const w = k * k;
      wSum += w;
      surface += w * (s.surface[i]! + (s.surface[i + 1]! - s.surface[i]!) * t);
      half += w * (s.half[i]! + (s.half[i + 1]! - s.half[i]!) * t);
      depth += w * (s.depth[i]! + (s.depth[i + 1]! - s.depth[i]!) * t);
    }
    out.surface = surface / wSum;
    out.half = half / wSum;
    out.depth = depth / wSum;
  }
  return out;
}

export type MeridianWater = FreshWater<BasinName>;

export function createMeridianWater(dry: (x: number, z: number) => number): MeridianWater {
  return createFreshWater(MERIDIAN_WATER_SPEC, dry);
}

/**
 * An island's fresh water from its spec, carved into its uncarved height `dry` (Meridian's, or any
 * other island's: the spec names its own basins).
 */
export function createFreshWater<N extends string>(
  spec: FreshWaterSpec<N>,
  dry: (x: number, z: number) => number,
): FreshWater<N> {
  const specs = spec.basins;
  const basins = {} as Record<N, WaterBasin>;
  for (const name of Object.keys(specs) as N[]) {
    const b: WaterBasinSpec = specs[name];
    let level = b.level;
    if (level === undefined) {
      // Just under the lowest point of the natural rim, so no basin needs a dam.
      let low = Infinity;
      for (let i = 0; i < 48; i++) {
        const [rx, rz] = rimPointOf(b, (i / 48) * Math.PI * 2, 1.12);
        low = Math.min(low, dry(rx, rz));
      }
      level = low - 0.3;
    }
    basins[name] = { ...b, name, level, reach: Math.max(b.rx, b.rz) * 1.15 };
  }

  const meanRadius = (b: WaterBasin) => (b.rx + b.rz) * 0.5;
  const basinList: WaterBasin[] = Object.values(basins);

  function basinAt(x: number, z: number): WaterBasin | null {
    for (const b of basinList) if (basinRadius(b, x, z) < 1) return b;
    return null;
  }

  /** The basins alone: a wading shelf and a deeper middle inside, cut or bermed banks outside. */
  function carveBasins(x: number, z: number, h: number): number {
    for (const b of basinList) {
      const d = basinRadius(b, x, z);
      const out = (d - 1) * meanRadius(b);
      if (out > REACH * 1.5) continue;
      // The shore sits just under the water (the water's fan reaches a little past it), so no
      // terrain shows through at the edge.
      const shore = b.level - 0.15;
      if (d < 1) return shore - 0.45 * smoothstep(1, 0.86, d) - b.depth * smoothstep(0.86, 0.3, d);
      const banked = Math.min(Math.max(h, shore - out * b.levee), shore + 0.25 + out * b.cut);
      h = mix(banked, h, smoothstep(REACH * 0.8, REACH * 1.5, out));
    }
    return h;
  }

  const basin = (name: string): WaterBasin => basins[name as N];
  const streams: WaterStream[] = spec.streams.map((spec: StreamSpec) => {
    let pts = resample(spec.points);
    let halves: number[] | null = null;
    let depths: number[] | null = null;
    if (spec.course) ({ pts, half: halves, depth: depths } = naturalCourse(pts, spec, spec.course));
    const n = pts.length;
    const x = new Float64Array(n);
    const z = new Float64Array(n);
    const surface = new Float64Array(n);
    const along = new Float64Array(n);
    const half = new Float64Array(n).fill(spec.halfWidth);
    const depth = new Float64Array(n).fill(spec.depth);
    if (halves) half.set(halves);
    if (depths) depth.set(depths);
    const from = basin(spec.from);
    const to = spec.to === 'sea' ? null : basin(spec.to);
    const floor = to ? to.level : 0.15;
    let s = from.level;
    let held = spec.lip !== undefined;
    for (let i = 0; i < n; i++) {
      x[i] = pts[i]![0];
      z[i] = pts[i]![1];
      if (i > 0) along[i] = along[i - 1]! + Math.hypot(x[i]! - x[i - 1]!, z[i]! - z[i - 1]!);
      // In its start basin the water is the basin's; past it, it follows the (basin-shaped) ground
      // down, never rising and always falling a little. A lip holds the level until the drop.
      if (i > 0 && basinRadius(from, x[i]!, z[i]!) >= 1) {
        const ground = carveBasins(x[i]!, z[i]!, dry(x[i]!, z[i]!)) - 0.55;
        if (held && s - ground < spec.lip!) s -= spec.minFall * STEP;
        else {
          held = false;
          s = Math.min(s - spec.minFall * STEP, ground);
        }
      }
      if (to && basinRadius(to, x[i]!, z[i]!) < 1) s = to.level;
      surface[i] = Math.max(s, floor);
    }
    // A natural stream comes down to its end gradually (riffles, cutting its own gully), never held
    // up on a rise and dropped off its end in one fall.
    if (spec.course)
      for (let i = n - 2; i >= 0; i--)
        surface[i] = Math.min(surface[i]!, surface[i + 1]! + NATURAL_GRADE * (along[i + 1]! - along[i]!));
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (let i = 0; i < n; i++) {
      minX = Math.min(minX, x[i]!);
      maxX = Math.max(maxX, x[i]!);
      minZ = Math.min(minZ, z[i]!);
      maxZ = Math.max(maxZ, z[i]!);
    }
    const m = spec.course ? Math.max(...half) * 1.15 + NATURAL_BANK + REACH : spec.halfWidth + REACH;
    return {
      spec,
      x,
      z,
      surface,
      along,
      half,
      depth,
      count: n,
      box: { minX: minX - m, maxX: maxX + m, minZ: minZ - m, maxZ: maxZ + m },
    };
  });

  const box = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
  const grow = (b: { minX: number; maxX: number; minZ: number; maxZ: number }) => {
    box.minX = Math.min(box.minX, b.minX);
    box.maxX = Math.max(box.maxX, b.maxX);
    box.minZ = Math.min(box.minZ, b.minZ);
    box.maxZ = Math.max(box.maxZ, b.maxZ);
  };
  for (const b of basinList) {
    const r = b.reach + REACH * 1.5;
    grow({ minX: b.x - r, maxX: b.x + r, minZ: b.z - r, maxZ: b.z + r });
  }
  for (const s of streams) grow(s.box);

  const near: Nearest = { dist: 0, surface: 0, half: 0, depth: 0, beyondEnd: false, past: 0 };
  const inBox = (b: { minX: number; maxX: number; minZ: number; maxZ: number }, x: number, z: number) =>
    x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ;

  function carve(x: number, z: number, h: number): number {
    if (!inBox(box, x, z)) return h;
    h = carveBasins(x, z, h);
    const insideBasin = basinAt(x, z) !== null;
    for (const s of streams) {
      if (!inBox(s.box, x, z)) continue;
      nearestOnStream(s, x, z, near);
      const natural = s.spec.course !== undefined;
      const w = edgeOf(s, near, x, z);
      // The bed runs a metre past the water's edge, so the 2 m terrain pack always holds it (a
      // natural stream's bank rises over a little more).
      const bed = w + (natural ? NATURAL_BANK : BED_MARGIN);
      // Past its end a stream's banks stop; a natural stream's ease out over a few metres (no seam).
      if (near.beyondEnd && (natural ? near.past > END_EASE : near.dist > bed)) continue;
      let c: number;
      const bank = s.spec.bank ?? 0.1;
      if (near.dist < bed && natural) {
        // Rounded across, deepest in the middle, meeting the water at its edge; then a bank easing up.
        if (near.dist < w) c = near.surface - near.depth * (1 - smoothstep(w * 0.3, w, near.dist));
        else {
          const u = 1 - (near.dist - w) / (bed - w);
          c = near.surface + bank * (1 - u * u);
        }
      } else if (near.dist < bed) {
        c = near.surface + bank - (near.depth + bank) * (1 - smoothstep(w - 0.6, bed, near.dist));
      } else {
        const out = near.dist - bed;
        if (out > REACH) continue;
        const valley = near.surface + bank + out * CUT;
        // A berm keeps a flat crest before it falls away (also wide enough for the pack).
        // (A natural stream's bank falls straight away: no built-up berm across the valley.)
        const levee = natural
          ? near.surface + bank - out * NATURAL_LEVEE
          : near.surface + bank - Math.max(0, out - LEVEE_CREST) * (s.spec.levee ?? LEVEE);
        // The banks blend back into the natural ground before the reach ends (no seam there).
        c = mix(Math.min(Math.max(h, levee), valley), h, smoothstep(REACH * 0.55, REACH, out));
      }
      if (natural && near.beyondEnd) c = mix(c, h, smoothstep(0, END_EASE, near.past));
      // A channel only ever deepens a basin; elsewhere it shapes its own banks.
      h = insideBasin ? Math.min(h, c) : c;
    }
    return h;
  }

  function levelAt(x: number, z: number): number | null {
    if (!inBox(box, x, z)) return null;
    let best: number | null = null;
    for (const b of basinList) {
      if (basinRadius(b, x, z) < 1) best = Math.max(best ?? -Infinity, b.level);
    }
    for (const s of streams) {
      if (!inBox(s.box, x, z)) continue;
      nearestOnStream(s, x, z, near);
      if (near.dist < edgeOf(s, near, x, z) && !near.beyondEnd)
        best = Math.max(best ?? -Infinity, near.surface);
    }
    return best;
  }

  function shoreDistance(x: number, z: number, cap = 40): number {
    if (!inBox(box, x, z)) return cap;
    let best = cap;
    for (const b of basinList) {
      const d = basinRadius(b, x, z);
      best = Math.min(best, Math.max(0, (d - 1) * meanRadius(b)));
    }
    for (const s of streams) {
      if (!inBox(s.box, x, z)) continue;
      nearestOnStream(s, x, z, near);
      if (near.beyondEnd) continue;
      best = Math.min(best, Math.max(0, near.dist - edgeOf(s, near, x, z)));
    }
    return best;
  }

  const basinAtScaled = (x: number, z: number, k = 1): WaterBasin | null => {
    for (const b of basinList) if (basinRadius(b, x, z) < k) return b;
    return null;
  };

  return {
    basins,
    streams,
    box,
    carve,
    levelAt,
    shoreDistance,
    rimPoint: rimPointOf,
    basinAt: basinAtScaled,
  };
}
