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
  /** The yard: the basin, the docks, the sheerlegs and the workshops (levelled after the terrace). */
  yard: { u0: 52, u1: 176, v0: -90, v1: -20, y: 5, blend: 7 },
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
  // The cut from the lower gates to the cove: at sea level (the sea's own water).
  canal('cut', -26, 16, -2.2, 2.2, null),
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
