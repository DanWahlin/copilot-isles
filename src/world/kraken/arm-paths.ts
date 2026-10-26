import { BRIGANTINE_MASTS } from '../ship/brigantine-rig';
import { deckHeightAt, halfBeamAt, sheerHeightAt } from '../ship/lines';

/**
 * Where the kraken's arms go, as pure point lists (no scene): the path an arm stands up along out of
 * the water, and the shapes it takes on a ship (a coil round her waist or bow, a climbing coil round
 * her foremast, a grip over her rail, and a high arc over her deck). Ship shapes are in her own frame
 * (x to the side the kraken is on, z to her bow); they keep clear of her masts, yards and sails.
 * The encounter turns them into world paths and poses the arms along them (`ChainPoser`).
 */

/** Anything points can be pushed to (a `Points`, a `CurvePath`). */
export interface PointSink {
  push(x: number, y: number, z: number): void;
}

/** Points (xyz) filled in place: no allocation per frame. */
export class Points {
  readonly xyz: Float32Array;
  n = 0;
  constructor(max = 48) {
    this.xyz = new Float32Array(max * 3);
  }
  clear(): this {
    this.n = 0;
    return this;
  }
  push(x: number, y: number, z: number): void {
    if (this.n * 3 >= this.xyz.length) return;
    const i = this.n++ * 3;
    this.xyz[i] = x;
    this.xyz[i + 1] = y;
    this.xyz[i + 2] = z;
  }
  /** The polyline's length (m). */
  length(): number {
    let len = 0;
    const p = this.xyz;
    for (let i = 1; i < this.n; i++) {
      const j = i * 3;
      len += Math.hypot(p[j]! - p[j - 3]!, p[j + 1]! - p[j - 2]!, p[j + 2]! - p[j - 1]!);
    }
    return len;
  }
}

/** 0 → 1, eased in and out: the weight of a slow, heavy move. */
export function ease(u: number): number {
  const t = Math.min(1, Math.max(0, u));
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

/**
 * 0 → 1 for a big move by a huge creature: a small anticipation (a dip back) first, a slow ease in
 * and out, and an overshoot that settles at the end. `a` and `o` size the dip and the overshoot
 * (both 0 with reduced motion).
 */
export function heavy(u: number, a = 0.05, o = 0.07): number {
  if (u <= 0) return 0;
  if (u >= 1) return 1;
  const dip = u < 0.2 ? -a * Math.sin((Math.PI * u) / 0.2) : 0;
  const over = u > 0.65 ? o * Math.sin((Math.PI * (u - 0.65)) / 0.35) : 0;
  return ease(u) + dip + over;
}

const FORE = BRIGANTINE_MASTS.fore;
const MASTS = [BRIGANTINE_MASTS.fore, BRIGANTINE_MASTS.main, BRIGANTINE_MASTS.mizzen] as const;
/** The lowest yard on the foremast (ship-local y): a coil round the mast keeps under it. */
export const FORE_LOWEST_YARD = 7.15;
/** How far a coil keeps from a mast or yard (m): an arm's girth there and a little air. */
export const RIG_CLEARANCE = 1.25;

/** Where each coil or grip sits along the ship (ship-local z). */
export const WRAP_SPOTS = {
  /** Round the stern half's waist, between the main and mizzen masts. */
  stern: { z0: BRIGANTINE_MASTS.mizzen.z + 1.75, z1: BRIGANTINE_MASTS.main.z - 1.75 },
  /** Round the bow, forward of the foremast. */
  bow: { z0: FORE.z + 1.6, z1: FORE.z + 3.7 },
  /** Over the rail by the forecastle, and over the quarterdeck. */
  gripFore: 2.0,
  gripAft: -11.0,
  /** The arc's plane over the forecastle (forward of the fore yards and sails). */
  arc: FORE.z + 2.7,
} as const;

/**
 * A coil round the hull between z0 and z1: up out of the water on the kraken's side, over the rail
 * and deck, down the far side, under the keel and round again. `loose` (0 tight … 1) widens it as it
 * closes; `squeeze` (0…1) pulls it tighter than the hull's own lines.
 */
export function hullCoil(
  out: Points,
  z0: number,
  z1: number,
  loose: number,
  squeeze: number,
  wobble = 0,
): void {
  const turns = 2.4;
  const steps = 24;
  const zc = (z0 + z1) / 2;
  const beam = halfBeamAt(zc, 1.2);
  const widen = 1 + 0.9 * loose;
  const tight = 1 - 0.08 * squeeze;
  const rx = (beam + 0.75) * widen * tight;
  const top = Math.max(sheerHeightAt(z0), sheerHeightAt(z1)) + 0.35;
  const ry = (top + 0.7) * widen * tight;
  const cy = 0.15 + 4 * loose;
  for (let s = 0; s <= steps; s++) {
    const f = s / steps;
    const th = f * turns * Math.PI * 2 * (1 + wobble);
    out.push(Math.cos(th) * rx, cy + Math.sin(th) * ry, z0 + (z1 - z0) * f);
  }
}

/**
 * A coil climbing the foremast, from just over the deck to under its lowest yard, `loose` (0…1)
 * wide at first (a lasso) and cinching in; it never climbs into the yards.
 */
export function mastCoil(out: Points, loose: number, squeeze: number): void {
  const deck = deckHeightAt(FORE.z);
  // Wide enough for the arm's bones (about 1.7 m near its tip) to wind round without kinking.
  const r = (1.6 + 4 * loose * loose) * (1 - 0.08 * squeeze);
  const y0 = deck + 1.0 + 2.5 * loose;
  const cap = FORE_LOWEST_YARD - RIG_CLEARANCE;
  const steps = 32;
  for (let s = 0; s <= steps; s++) {
    const ph = (s / 8) * Math.PI * 2;
    const y = Math.min(cap, y0 + (1.45 * s) / 8);
    out.push(Math.cos(ph) * r, y, FORE.z + Math.sin(ph) * r);
  }
}

/** Over the rail at `z` and down onto the deck, curling along it: an arm that grips. */
export function railGrip(out: Points, z: number, press: number): void {
  const beam = halfBeamAt(z, 1.5);
  const sheer = sheerHeightAt(z);
  const deck = deckHeightAt(z);
  out.push(beam + 0.9, sheer + 2.2 - 0.6 * press, z + 0.2);
  out.push(beam - 0.8, sheer + 1.4 - 0.5 * press, z + 0.4);
  out.push(beam - 2.3, deck + 0.7 - 0.3 * press, z + 0.7);
  out.push(beam - 2.7, deck + 0.3, z + 1.1);
  out.push(beam - 2.6, deck + 0.25, z + 1.8);
}

/**
 * A high, slow arc over the forecastle from the kraken's side (`rise` 0…1 how far over it has come;
 * `breathe` a slow rise and fall while it hangs at the top). Forward of the fore yards and sails.
 */
export function deckArc(out: Points, rise: number, breathe: number): void {
  const z = WRAP_SPOTS.arc;
  const beam = halfBeamAt(z, 2);
  const deck = deckHeightAt(z);
  const top = deck + 11 + breathe;
  const steps = 10;
  for (let s = 1; s <= steps; s++) {
    const f = (s / steps) * rise;
    const a = Math.PI * f;
    // Up from the kraken's side (x = beam + 2) and over toward the far side.
    const x = (beam + 2) * Math.cos(a);
    const y = deck + 2 + (top - deck - 2) * Math.sin(a) * (0.75 + 0.25 * rise);
    out.push(x, y, z - 0.6 * Math.sin(a));
  }
}

/**
 * An arm standing up out of the sea, from its base `b` (under the water) along the bottom to beneath
 * where it breaks the surface (`ex`, `ez`), then up `h` metres in a slow undulation (`sway` the
 * phase in radians, `amp` its size). An arm longer than that route tucks the rest into a deeper loop
 * under the surface, so `h` sets how much of it shows. `lean` (unit xz) is the way its top bends
 * (toward its prey), `curl` (0…1) how far its tip hooks over.
 */
export function standPath(
  out: PointSink,
  bx: number,
  by: number,
  bz: number,
  ox: number,
  oz: number,
  ex: number,
  ez: number,
  sea: number,
  h: number,
  armLength: number,
  sway: number,
  amp: number,
  leanX: number,
  leanZ: number,
  curl: number,
): void {
  out.push(bx, by, bz);
  // Out and down from its socket, then along under the water to below where it rises.
  const p1x = bx + ox * 3;
  const p1z = bz + oz * 3;
  const p1y = by - 1.2;
  out.push(p1x, p1y, p1z);
  const reach = Math.hypot(ex - p1x, ez - p1z);
  const above = Math.max(0, h);
  // How deep the loop under the surface goes to take up the arm's spare length.
  const first = Math.hypot(3, 1.2);
  let depth = Math.max(2.5, sea - p1y);
  for (let k = 0; k < 6; k++) {
    const used = first + Math.hypot(reach, sea - depth - p1y) + depth + above;
    depth = Math.max(2.5, depth + (armLength - used) * 0.5);
  }
  out.push(ex, sea - depth, ez);
  out.push(ex, sea - Math.min(depth, 1.5), ez);
  if (above <= 0.05) return;
  const steps = 7;
  // Across the arm's way: the sway's sideways direction.
  const sx = -leanZ;
  const sz = leanX;
  for (let s = 1; s <= steps; s++) {
    const f = s / steps;
    const wave = amp * f * Math.sin(Math.PI * 1.1 * f - sway);
    const bow = amp * 0.6 * f * Math.cos(Math.PI * 0.9 * f - sway * 0.8);
    const lean = 0.18 * above * f * f;
    const hook = curl * f ** 4 * above * 0.35;
    out.push(
      ex + sx * wave + leanX * (lean + bow + hook),
      sea + above * f - hook * 0.6,
      ez + sz * wave + leanZ * (lean + bow + hook),
    );
  }
}

/** True when `out`'s points over the deck keep clear of every mast (tests). */
export function clearOfMasts(out: Points, clearance = RIG_CLEARANCE): boolean {
  for (let i = 0; i < out.n; i++) {
    const x = out.xyz[i * 3]!;
    const y = out.xyz[i * 3 + 1]!;
    const z = out.xyz[i * 3 + 2]!;
    for (const m of MASTS) {
      if (y < deckHeightAt(m.z) - 0.2 || y > m.truck) continue;
      if (Math.hypot(x, z - m.z) < clearance) return false;
    }
  }
  return true;
}
