import { segmentDistance, smoothstep } from '../../../util/math';
import { toFrame } from './layout';

/**
 * Keelhaven's harbour works, as plain data in the cove frame (u inland, v across; v < 0 the north
 * side), and the ground they cut: the shipyard's yard on the north half of the town shelf, the
 * Fitting Basin, three drydocks off its inland side, the Lock Flight (two locks) down to the cove, and
 * the Old Town quay (a stone mole) on the south side of the beach, where the ship berths.
 *
 * Every chamber is a trench cut into a flat pad (`worksCarve`), lined with thick stone walls (their
 * coping a little over the pad), so the ground never shows through a wall. No three.js here.
 */

/** A rectangle in the cove frame. */
export interface UvRect {
  readonly u0: number;
  readonly u1: number;
  readonly v0: number;
  readonly v1: number;
}

/** A flat pad the ground is levelled to (y), easing back to the natural ground over `blend` m. */
export interface Pad extends UvRect {
  readonly y: number;
  readonly blend: number;
}

/**
 * A chamber cut into a pad: its floor (`floor`), its walls' coping (`top`), its water (`water`, null
 * when it's dry), and how thick its walls are (m).
 */
export interface Chamber extends UvRect {
  readonly name: string;
  readonly floor: number;
  readonly top: number;
  readonly water: number | null;
}

/** How thick the chambers' stone walls are (m): the cut's slope hides inside them. */
export const WALL = 2.4;

/** The level ground the works stand on. */
export const PADS = {
  /** The lock terrace: the lower lock, the pound and the towpath down to the beach. */
  locks: { u0: 10, u1: 52, v0: -78, v1: -42, y: 3.4, blend: 6 },
  /**
   * The cut's banks, level with the terrace, out over the beach to the sea (past them its walls stand
   * in the sea up to the Sea Gate).
   */
  cut: { u0: -14, u1: 10, v0: -74, v1: -46, y: 3.4, blend: 6 },
  /** The yard: the basin, the docks, the sheerlegs and the workshops (levelled after the terrace). */
  yard: { u0: 52, u1: 176, v0: -93, v1: -20, y: 5, blend: 7 },
  /** The Gate Light's bench on the North Head's ridge (town.ts `GATE_LIGHT`). */
  light: { u0: -240, u1: -218, v0: -166, v1: -140, y: 44, blend: 7 },
} as const satisfies Record<string, Pad>;

/** The canal's middle line and its chambers' half-width. */
const CANAL = { v: -60, half: 5 } as const;

/** The three drydocks' middle lines (v), their half-width and their length (u). */
export const DOCKS = {
  v: [-79, -61, -43] as const,
  half: 6,
  u0: 124,
  u1: 166,
  floor: 1.4,
  /** The keel blocks' height on the floor. */
  blocks: 1.1,
} as const;

function canal(
  name: string,
  u0: number,
  u1: number,
  floor: number,
  top: number,
  water: number | null,
): Chamber {
  return { name, u0, u1, v0: CANAL.v - CANAL.half, v1: CANAL.v + CANAL.half, floor, top, water };
}

/** The basin, the canal's chambers (upstream first) and the docks. */
export const CHAMBERS: readonly Chamber[] = [
  { name: 'basin', u0: 72, u1: 124, v0: -86, v1: -36, floor: 1.6, top: 5.2, water: 4 },
  canal('lock1', 52, 72, 1.4, 5.2, 3.3),
  canal('pound', 36, 52, 0.9, 3.6, 2.6),
  // The lower lock stands emptied to the cove's level: the flight's two waters show either side of its gate.
  canal('lock2', 16, 36, -0.4, 3.6, 0.7),
  // The cut from the lower gates to the cove: at sea level (the sea's own water), its walls as high as
  // Lock 2's, so the terrace runs level along both to the beach.
  canal('cut', -26, 16, -2.2, 3.6, null),
  ...DOCKS.v.map((v, i) => ({
    name: `dock${i + 1}`,
    u0: DOCKS.u0,
    u1: DOCKS.u1,
    v0: v - DOCKS.half,
    v1: v + DOCKS.half,
    floor: DOCKS.floor,
    top: 5.2,
    // Dock 1 is flooded (its caisson open to the basin); docks 2 and 3 are pumped dry.
    water: i === 0 ? 4 : null,
  })),
];

/** Where the canal's gates stand (u), each pair of mitre leaves across the canal, upstream first. */
export const GATES = [72, 52, 36, 16] as const;
/** The Sea Gate: shut mitre leaves across the cut's mouth (practice hulls aren't merged). */
export const SEA_GATE_U = -24;
export { CANAL };

/**
 * The Old Town quay: a stone mole from the south end of the beach out into the cove, its deck at 2.2;
 * the ship lies along its north face, bow to the cove's mouth.
 */
export const QUAY = { u0: -98, u1: 8, v: 60, half: 4.5, top: 2.2 } as const;
/**
 * The ship's berth (cove frame): her middle 4.65 m off the quay's face, as at Thousand-Bough (the
 * gangway's foot then lands on the deck), port side to the quay.
 */
export const BERTH = { u: -66, v: QUAY.v - QUAY.half - 4.65 } as const;
/** The berth's dredged pocket: the cove's floor taken down to `depth` alongside the quay. */
export const BERTH_POCKET = {
  u0: -104,
  u1: -26,
  v0: QUAY.v - QUAY.half - 17.95,
  v1: QUAY.v,
  depth: -5.6,
  blend: 12,
} as const;

/** The main slipway: from the yard's beach edge down into the cove (u falls toward the sea). */
export const SLIPWAY = { u0: -16, u1: 46, v: -28, half: 5, topY: 3.4 } as const;

/**
 * The path up the North Head to the Gate Light: from the lock terrace's corner along the beach, then
 * slanting up the head's cove face along its contours (about 1 in 5) to the light's bench, as a timber
 * stair on posts over the slope. Points are (u, v, y), y the ground's on its line. The ground isn't cut
 * for it: a 3 m bench on a 40° face aliases into a saw-tooth on the terrain's far levels.
 */
export const GATE_PATH: readonly (readonly [number, number, number])[] = [
  [8, -80, 3.4],
  [-14, -96.5, 2.6],
  [-30, -103.5, 6.3],
  [-46, -107, 10.1],
  [-62, -110, 13.6],
  [-78, -110.5, 17.1],
  [-94, -112, 20.4],
  [-110, -120, 23.7],
  [-126, -125.5, 26.9],
  [-142, -127, 30.1],
  [-158, -130.5, 33.2],
  [-174, -135.5, 36.4],
  [-190, -133, 39.4],
  [-206, -139, 42.5],
  [-221, -146, 44],
];
export const GATE_PATH_HALF = 1.5;

/** The nearest point of the Gate Light's path to (u, v): its distance (m) and the path's height there. */
export function gatePathAt(u: number, v: number, out: { d: number; y: number }): { d: number; y: number } {
  out.d = Infinity;
  out.y = 0;
  if (u > 14 || u < -228 || v > -74 || v < -152) return out;
  for (let i = 0; i + 1 < GATE_PATH.length; i++) {
    const a = GATE_PATH[i]!;
    const b = GATE_PATH[i + 1]!;
    const d = segmentDistance(u, v, a[0], a[1], b[0], b[1]);
    if (d >= out.d) continue;
    const du = b[0] - a[0];
    const dv = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((u - a[0]) * du + (v - a[1]) * dv) / (du * du + dv * dv)));
    out.d = d;
    out.y = a[2] + (b[2] - a[2]) * t;
  }
  return out;
}

const PATH_HIT = { d: 0, y: 0 };

/** Rectangles the plants and the flowers keep out of (the works and a margin round them). */
export const WORKS_CLEAR: readonly UvRect[] = [
  { u0: 4, u1: 180, v0: -96, v1: -16 },
  { u0: -30, u1: 16, v0: -76, v1: -44 },
  { u0: QUAY.u0, u1: QUAY.u1 + 12, v0: QUAY.v - QUAY.half - 2, v1: QUAY.v + QUAY.half + 4 },
  { u0: SLIPWAY.u0, u1: SLIPWAY.u1 + 4, v0: SLIPWAY.v - SLIPWAY.half - 3, v1: SLIPWAY.v + SLIPWAY.half + 3 },
  { u0: PADS.light.u0 - 2, u1: PADS.light.u1 + 2, v0: PADS.light.v0 - 2, v1: PADS.light.v1 + 2 },
  // The Old Hulk on her blocks between the yard and the river (wrecks.ts).
  { u0: 58, u1: 102, v0: -19, v1: -4 },
];

function inside(r: UvRect, u: number, v: number, margin = 0): boolean {
  return u > r.u0 - margin && u < r.u1 + margin && v > r.v0 - margin && v < r.v1 + margin;
}

/** Whether cove frame (u, v) lies in the works (or within `margin` m of them). */
export function inWorks(u: number, v: number, margin = 0): boolean {
  for (const r of WORKS_CLEAR) if (inside(r, u, v, margin)) return true;
  return gatePathAt(u, v, PATH_HIT).d < GATE_PATH_HALF + 1.5 + margin;
}

/** How far (m) (u, v) lies outside a rectangle (0 inside). */
function outside(r: UvRect, u: number, v: number): number {
  const du = Math.max(r.u0 - u, 0, u - r.u1);
  const dv = Math.max(r.v0 - v, 0, v - r.v1);
  return Math.hypot(du, dv);
}

const F = { u: 0, v: 0 };

/**
 * The ground with the works cut in, at world (x, z) over ground `h`: levelled to each pad (easing back
 * over its blend), then each chamber cut down to its floor out to its walls' outer face, the slipway's
 * ramp, and the quay's mole raised to its deck where it runs over the beach.
 */
export function worksCarve(x: number, z: number, h: number): number {
  toFrame(x, z, F);
  const { u, v } = F;
  if (u < -250 || u > 190 || v < -180 || v > 80) return h;
  for (const p of Object.values(PADS) as Pad[]) {
    const d = outside(p, u, v);
    if (d < p.blend) h += (p.y - h) * (1 - smoothstep(0, p.blend, d));
  }
  // The slipway: a ramp of 1 in 12 from the yard's edge into the cove.
  const s = SLIPWAY;
  const ds = outside({ u0: s.u0, u1: s.u1, v0: s.v - s.half, v1: s.v + s.half }, u, v);
  if (ds < 4) {
    const ramp = s.topY - (s.u1 - Math.min(s.u1, Math.max(s.u0, u))) / 12;
    h += (ramp - h) * (1 - smoothstep(0, 4, ds));
  }
  const bp = BERTH_POCKET;
  const dp = outside(bp, u, v);
  if (dp < bp.blend && h > bp.depth) h += (bp.depth - h) * (1 - smoothstep(0, bp.blend, dp));
  for (const c of CHAMBERS) {
    const d = outside(c, u, v);
    // The floor runs out under the wall (to 1 m short of its outer face), then rises to the pad.
    if (d < WALL - 1) h = Math.min(h, c.floor);
    else if (d < WALL) h = Math.min(h, c.floor + (h - c.floor) * (d - (WALL - 1)));
  }
  return h;
}

/** The works' still water (the basin, the flooded dock and the canal's chambers) at world (x, z), or null. */
export function worksWaterAt(x: number, z: number): number | null {
  toFrame(x, z, F);
  for (const c of CHAMBERS) if (c.water !== null && inside(c, F.u, F.v)) return c.water;
  return null;
}

/** How much (u, v) of world (x, z) is on a works pad (1 inside, easing out over 3 m). */
export function worksPadAt(x: number, z: number): number {
  toFrame(x, z, F);
  let w = 0;
  for (const p of Object.values(PADS) as Pad[]) w = Math.max(w, 1 - smoothstep(0, 3, outside(p, F.u, F.v)));
  return w;
}

/**
 * The pad (u, v) lies flat on, if any: inside one pad and clear of every other pad's blend (unless it's
 * at the same level), the slipway's ramp and the berth's pocket. Its y, or null.
 */
export function padFlatAt(u: number, v: number): number | null {
  // In the carve's order: a pad (u, v) is inside sets the level; another's blend after it bends it.
  let y = NaN;
  for (const p of Object.values(PADS) as Pad[]) {
    const d = outside(p, u, v);
    if (d === 0) y = p.y;
    else if (d < p.blend && y !== p.y) y = NaN;
  }
  if (Number.isNaN(y)) return null;
  const s = SLIPWAY;
  if (outside({ u0: s.u0, u1: s.u1, v0: s.v - s.half, v1: s.v + s.half }, u, v) < 4) return null;
  if (outside(BERTH_POCKET, u, v) < BERTH_POCKET.blend) return null;
  return y;
}

/** The chamber nearest (u, v) (0 inside it) and how far (m) it is. */
function nearestChamber(u: number, v: number): { c: Chamber; d: number } {
  let best = CHAMBERS[0]!;
  let bd = Infinity;
  for (const c of CHAMBERS) {
    const d = outside(c, u, v);
    if (d < bd) {
      bd = d;
      best = c;
    }
  }
  NEAREST.c = best;
  NEAREST.d = bd;
  return NEAREST;
}
const NEAREST: { c: Chamber; d: number } = { c: CHAMBERS[0]!, d: 0 };

/** How far under the sea (m) the ground under the cut's arms is pinned (`worksPin`). */
const SEA_SKIRT = -0.3;

/**
 * How far past a wall's outer face a terrain level with vertices `step` m apart keeps the chamber's
 * floor: so far that no triangle reaches from a vertex in the chamber to one at the pad's level, which
 * would stand out of the chamber's floor or water as a bank. The ramp up to the pad then lies past the
 * wall, under the works' apron (`worksApron`). Capped for the coarsest far levels.
 */
export function floorMargin(step: number): number {
  return Math.min(10, Math.max(0, step * Math.SQRT2 - WALL + 0.05));
}

/**
 * The height every terrain level's vertex takes in the works, or null to keep the baked ground
 * (`TerrainMeshOptions.pin`): a chamber's floor inside it, under its walls and, on the apron, out to
 * `floorMargin(step)` past them; the pad's own level on the rest of a flat pad. So no level of detail
 * puts a bank in a chamber, a saw-tooth along a wall's foot or a prefiltered trench round it; the
 * ramp from floor to pad is under the walls and the apron, which hides it.
 */
export function worksPin(x: number, z: number, step: number): number | null {
  toFrame(x, z, F);
  const { u, v } = F;
  if (u < -50 || u > 200 || v < -110 || v > -10) return null;
  const { c, d } = nearestChamber(u, v);
  const pad = padFlatAt(u, v);
  if (d < WALL) {
    // Under a sea-level chamber's walls where no pad is (the cut's arms past its banks): just under
    // the sea, so the ground neither stands out of the water inside nor drops into a trench outside.
    if (d > 0 && pad === null && c.water === null && c.floor < 0) return SEA_SKIRT;
    return c.floor;
  }
  if (pad === null) return null;
  return d < WALL + floorMargin(step) ? c.floor : pad;
}

/** A flat rectangle of the works' apron (cove frame) at `y`. */
export interface ApronRect extends UvRect {
  readonly y: number;
}

/** The apron's cells (m): its rectangles' edges fall on this grid. */
const APRON_CELL = 0.5;

/**
 * The works' apron: every flat pad's ground outside the chambers' walls, as rectangles in the cove
 * frame, each a little over its pad (a flat skin of ground in the terrain's own look). It covers the
 * ramp the terrain makes from a chamber's floor up to the pad past its walls (`worksPin`), whatever
 * the level of detail.
 */
export function worksApron(): readonly ApronRect[] {
  const steps = worksApronSteps();
  let r = steps.next();
  while (!r.done) r = steps.next();
  return r.value;
}

let apron: readonly ApronRect[] | null = null;

/** `worksApron` a few rows a step (it takes ~0.1 s whole), made once and kept. */
export function* worksApronSteps(): Generator<void, readonly ApronRect[], void> {
  if (apron) return apron;
  const u0 = -50;
  const u1 = 190;
  const v0 = -110;
  const v1 = -10;
  const nu = Math.round((u1 - u0) / APRON_CELL);
  const nv = Math.round((v1 - v0) / APRON_CELL);
  // Each row's runs of cells at one level, then rows with the same runs merged into rectangles.
  const open = new Map<string, ApronRect & { rows: number }>();
  const done: ApronRect[] = [];
  for (let j = 0; j < nv; j++) {
    const va = v0 + j * APRON_CELL;
    const runs: { a: number; b: number; y: number }[] = [];
    let run: { a: number; b: number; y: number } | null = null;
    for (let i = 0; i < nu; i++) {
      const ua = u0 + i * APRON_CELL;
      const uc = ua + APRON_CELL / 2;
      const vc = va + APRON_CELL / 2;
      // A cell is apron if its middle and corners are flat at one level and clear of every wall.
      let y: number | null = null;
      let ok = true;
      for (const [du, dv] of CELL_TAPS) {
        const pu = uc + du * APRON_CELL;
        const pv = vc + dv * APRON_CELL;
        const h = padFlatAt(pu, pv);
        if (h === null || (y !== null && h !== y) || nearestChamber(pu, pv).d < WALL - 1e-6) {
          ok = false;
          break;
        }
        y = h;
      }
      if (ok && run && run.y === y && run.b === i) run.b = i + 1;
      else {
        if (run) runs.push(run);
        run = ok ? { a: i, b: i + 1, y: y! } : null;
      }
    }
    if (run) runs.push(run);
    const keys = new Set<string>();
    for (const r of runs) {
      const key = `${r.a}:${r.b}:${r.y}`;
      keys.add(key);
      const o = open.get(key);
      if (o) {
        (o as { v1: number }).v1 = va + APRON_CELL;
        o.rows++;
      } else
        open.set(key, {
          u0: u0 + r.a * APRON_CELL,
          u1: u0 + r.b * APRON_CELL,
          v0: va,
          v1: va + APRON_CELL,
          y: r.y,
          rows: 1,
        });
    }
    for (const [key, o] of open)
      if (!keys.has(key)) {
        done.push({ u0: o.u0, u1: o.u1, v0: o.v0, v1: o.v1, y: o.y });
        open.delete(key);
      }
    if ((j & 15) === 15) yield;
  }
  for (const o of open.values()) done.push({ u0: o.u0, u1: o.u1, v0: o.v0, v1: o.v1, y: o.y });
  apron = done;
  return done;
}
const CELL_TAPS = [
  [0, 0],
  [-0.5, -0.5],
  [0.5, -0.5],
  [-0.5, 0.5],
  [0.5, 0.5],
] as const;

/** How far (m) cove frame (u, v) lies from the nearest chamber's outer wall face (negative inside). */
export function wallFaceDistance(u: number, v: number): number {
  return nearestChamber(u, v).d - WALL;
}
