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
  /** Over the rail by the forecastle, and over the quarterdeck; over her far rail aft of the main. */
  gripFore: 2.0,
  gripAft: -11.0,
  gripFar: -5.0,
  /** Where the two arms that stood high behind her come over her rails for the final pull. */
  pullAft: -12.5,
  pullFore: 9.0,
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
 * An arm standing up out of the sea, from its base `b` (under the water) along the bottom to beneath
 * where it breaks the surface (`ex`, `ez`), then `len` metres of it over the water as a free arm
 * (`freeArm`: always bent, never straight). An arm longer than that route tucks the rest into a
 * deeper loop under the surface, so `len` sets how much of it shows. `lean` (unit xz) is the way it
 * bends (toward its prey, or out from its body); `phase` moves a slow wave along it, `wave` sizes
 * it; `curl` (−0.3…1) curls its tip (loosely), `bow` (−0.3…1) bends the whole arm over, and `back` (0…1) makes
 * it an S: out away from `lean` low down, its tip hooked back over toward it. `slack` lengthens the
 * route by what the bones cut off its bends (a pose that ran off the end is posed again with it), so
 * the arm never runs off its end in a straight stub. `lead` is the arm's first bone's length (its
 * route's first leg).
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
  len: number,
  armLength: number,
  phase: number,
  wave: number,
  leanX: number,
  leanZ: number,
  curl: number,
  bow = 0,
  back = 0,
  slack = 0,
  lead = 3,
): void {
  out.push(bx, by, bz);
  // Out and down from its socket (as far as its first bone, which lies along this leg rather than
  // cutting the corner after it), then along under the water to below where it rises.
  const p1x = bx + ox * lead;
  const p1z = bz + oz * lead;
  const p1y = by - 0.4 * lead;
  out.push(p1x, p1y, p1z);
  const reach = Math.hypot(ex - p1x, ez - p1z);
  // The loop under the surface is a wide U (`loopOffset`), along the way it came: a hairpin would
  // have its bones cut across it.
  let dx = ox;
  let dz = oz;
  if (reach > 0.1) {
    dx = (ex - p1x) / reach;
    dz = (ez - p1z) / reach;
  }
  const dl = Math.hypot(dx, dz) || 1;
  dx /= dl;
  dz /= dl;
  const first = Math.hypot(p1x - bx, by - p1y, p1z - bz);
  // How much of the arm can show: what's left after the shortest way up (a shallow loop). An arm
  // that can't reach its whole curve shows less of it, still curled at its tip, never a straight stub.
  // `slack`: what the bones use up cutting across the route's bends.
  const want = armLength + slack;
  const above = Math.max(0, Math.min(len, want - loopRoute(first, reach, sea - p1y, 2.5, lead)));
  // How deep the loop goes to take up the arm's spare length (the route grows with its depth).
  let lo = 2.5;
  let hi = 2.5;
  if (loopRoute(first, reach, sea - p1y, lo, lead) + above < want) {
    hi = 8;
    while (loopRoute(first, reach, sea - p1y, hi, lead) + above < want && hi < 200) hi *= 2;
    for (let k = 0; k < 24; k++) {
      const mid = (lo + hi) / 2;
      if (loopRoute(first, reach, sea - p1y, mid, lead) + above < want) lo = mid;
      else hi = mid;
    }
  }
  const depth = (lo + hi) / 2;
  const off = loopOffset(sea - p1y, depth, lead);
  out.push(ex + dx * off, sea - depth, ez + dz * off);
  out.push(ex, sea - 1.5, ez);
  if (above <= 0.05) return;
  // A short arm is all tip: a hook, not an S.
  const s = back * Math.min(1, above / 14);
  freeArm(out, ex, ez, sea, above, armLength, phase, wave, leanX, leanZ, curl, bow, s);
}

/**
 * The route under the water (m) with its loop `depth` deep; `drop` is the sea over its first bend,
 * `lead` the arm's first bone (the loop is as wide as that, so its bones can't jump across it).
 */
function loopRoute(first: number, reach: number, drop: number, depth: number, lead: number): number {
  const off = loopOffset(drop, depth, lead);
  return first + Math.hypot(reach + off, drop - depth) + Math.hypot(off, depth - 1.5) + 1.5;
}

/**
 * How far past where it rises (m) the loop's bottom lies: a U past it, as wide as the arm's first
 * bone, when the loop dips below the arm's first bend (narrower, its bones would jump across it and
 * never take up its length); short of it when the loop is shallow (else it's a hairpin just under
 * the surface, which the bones cut across).
 */
function loopOffset(drop: number, depth: number, lead: number): number {
  const below = Math.min(1, Math.max(0, (depth - drop) / 5));
  return Math.max(2.5, lead) * (2 * below - 1);
}

/**
 * How much of an arm (m) can stand over the water at (`ex`, `ez`) from its base: what the shortest
 * route under the water leaves (`standPath`'s own sum).
 */
export function reachOver(
  bx: number,
  by: number,
  bz: number,
  ox: number,
  oz: number,
  ex: number,
  ez: number,
  sea: number,
  armLength: number,
  lead = 3,
): number {
  const p1x = bx + ox * lead;
  const p1z = bz + oz * lead;
  const first = Math.hypot(p1x - bx, 0.4 * lead, p1z - bz);
  return armLength - loopRoute(first, Math.hypot(ex - p1x, ez - p1z), sea - (by - 0.4 * lead), 2.5, lead);
}

/** How many points a free arm's part over the water takes. */
export const FREE_ARM_STEPS = 12;

/**
 * A free arm's part over the water, from where it breaks the surface (`ex`, `sea`, `ez`), `len`
 * metres along it. It's drawn by its bend, not its points: a tall, gently curving column that leans
 * toward `lean` (more with `bow`), a long slow S travelling up it (`phase`, `wave`) with a smaller
 * sway across, and a loose, open curl only in its last fifth (`curl`), outward along its lean, never
 * a tight hook back over itself. A short arm (just breaking the water, or going under) is mostly its
 * tip: it droops forward, open. `back` bends it away first (an S toward a ship). Its curvature is
 * capped by the arm's bone length near its tip (`armLength`), so the curve-follow can lay the bones
 * along it. It is never straight.
 */
export function freeArm(
  out: PointSink,
  ex: number,
  ez: number,
  sea: number,
  len: number,
  armLength: number,
  phase: number,
  wave: number,
  leanX: number,
  leanZ: number,
  curl: number,
  bow: number,
  back = 0,
): void {
  const steps = FREE_ARM_STEPS;
  const ds = len / steps;
  // The tentacle's tip bones are about 4.6 % of its length: no bend tighter than a radius a bone
  // can still lie along (the curve-follow needs a bone shorter than the bend's diameter).
  const turnMax = ds / (armLength * 0.055);
  // How tall it stands: a short arm is all tip.
  const k = Math.min(1, len / 14);
  const bend = (0.9 + 0.85 * bow) * k + 2.15 * (1 - k);
  // A long S: low down it leans away, higher up toward `lean` (an arm toward a ship more so).
  const sBy = (0.55 + 0.25 * back) * Math.sqrt(k);
  const curlAt = 1 - (0.2 * k + 0.5 * (1 - k));
  const curlBy = 0.35 + 0.75 * curl;
  const sway = 0.12 + 0.07 * wave;
  const sx = -leanZ;
  const sz = leanX;
  let x = ex;
  let y = sea;
  let z = ez;
  let th = 0;
  for (let s = 1; s <= steps; s++) {
    const u = (s - 0.5) / steps;
    const tip = u > curlAt ? (u - curlAt) / (1 - curlAt) : 0;
    const want =
      bend * u +
      curlBy * tip * tip * (3 - 2 * tip) -
      sBy * Math.sin(Math.PI * 2 * u) +
      sway * Math.sqrt(u) * Math.sin(Math.PI * 1.4 * u - phase);
    th += Math.min(turnMax, Math.max(-turnMax, want - th));
    const across = 0.5 * sway * u * Math.sin(Math.PI * 1.1 * u - phase * 0.8 + 1.3);
    const c = Math.cos(across);
    const h = Math.sin(th) * c;
    x += (leanX * h + sx * Math.sin(across)) * ds;
    y += Math.cos(th) * c * ds;
    z += (leanZ * h + sz * Math.sin(across)) * ds;
    out.push(x, y, z);
  }
}

/** A free arm's stance: how much of it shows (m), its tip's curl and its bow (`freeStance`). */
export interface FreeStance {
  len: number;
  curl: number;
  bow: number;
}

/**
 * How a free arm stands at `height` (its full length over the water): `rise` 0 → 1 as it comes up
 * (its tip leads, loose and drooping, and the arm lifts in a soft curve; the curl grows a little as
 * it reaches), `withdraw` 0 → 1 as it goes (it bows over and slides back under in an arc).
 */
export function freeStance(out: FreeStance, height: number, rise: number, withdraw: number): FreeStance {
  const r = Math.min(1, Math.max(0, rise));
  const w = Math.min(1, Math.max(0, withdraw));
  // The tip breaks the water at once (a stub would read as a spike), and is the last to go.
  out.len = height * Math.max(0, rise) ** 0.7 * (1 - w) ** 0.7;
  out.curl = 0.15 + 0.25 * r + 0.35 * w;
  out.bow = 0.2 * (1 - r) + 0.9 * ease(w);
  return out;
}

/** Ship-local x mirrored for the far side (an arm that comes up on her other beam). */
export function mirrorX(out: Points): void {
  for (let i = 0; i < out.n; i++) out.xyz[i * 3] = -out.xyz[i * 3]!;
}

/**
 * The final pull: an arm that has stood high behind her arcs in over her rail at `z` (on its own
 * side, never over her centre line or her rig) and grips her deck. `rise` 0…1 how far over it has
 * come, `press` 0…1 how hard it pulls down.
 */
export function pullArc(out: Points, z: number, rise: number, press: number): void {
  const beam = halfBeamAt(z, 1.5);
  const sheer = sheerHeightAt(z);
  const deck = deckHeightAt(z);
  // From well out over the water to just inside her rail (her stern is narrow: never her centre line).
  const inner = Math.max(1.2, beam - 1.8);
  const cx = (beam + 5.4 + inner) / 2;
  const r = (beam + 5.4 - inner) / 2;
  const steps = 8;
  for (let s = 0; s <= steps; s++) {
    const a = (Math.PI * s * rise) / steps;
    out.push(cx + r * Math.cos(a), sheer + 1 + 7 * Math.sin(a) * (0.7 + 0.3 * rise) - press * (s / steps), z);
  }
  if (rise < 0.98) return;
  // On the deck inside the rail, never toward her centre line (her stern is narrow).
  out.push(Math.max(1.2, beam - 1.7), deck + 0.6 - 0.2 * press, z - 0.7);
  out.push(Math.max(1.0, beam - 1.9), deck + 0.35, z - 1.5);
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
