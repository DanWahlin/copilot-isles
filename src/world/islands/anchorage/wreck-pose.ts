import type { CircleObstacle } from '../../contracts';
import { COVE } from '../../layout';
import { BRIGANTINE_HALF_LENGTH, keelHeightAt } from '../../ship/lines';
import { WreckFrame } from '../../wreck/frame';

/**
 * Where the wreck lies (COVE.wreck), as plain numbers: the terrain's sand bar, the wreck's mesh, its
 * ship obstacles and the tests all place things from these, so the hull and the bar agree.
 */
const W = COVE.wreck;
const ch = Math.cos(W.heading),
  sh = Math.sin(W.heading);
const cp = Math.cos(W.pitch),
  sp = Math.sin(W.pitch);
const cr = Math.cos(W.heel),
  sr = Math.sin(W.heel);

interface Vec3Out {
  x: number;
  y: number;
  z: number;
}

const frame = new WreckFrame(W);

/**
 * A wreck-local point (ship-local: +x port, +y up, +z bow, waterline at 0) in world space. It is
 * the ship's own rotation order (yaw, then pitch, then roll: three's 'YXZ').
 */
export function wreckToWorld(x: number, y: number, z: number, out: Vec3Out): Vec3Out {
  return frame.toWorld(x, y, z, out);
}

/** Along (+ toward the bow) and across (+ toward her port side) the wreck's centre line, in plan. */
export function wreckPlan(x: number, z: number, out: { a: number; c: number }): { a: number; c: number } {
  const dx = x - W.x,
    dz = z - W.z;
  out.a = dx * sh + dz * ch;
  out.c = dx * ch - dz * sh;
  return out;
}

/**
 * The keel under plan distance `a` along her: its ship-local z, its world height, and how far it
 * sits across the centre line (heeled, the keel swings out to port).
 */
export function wreckKeelAt(a: number, out: { zl: number; y: number; c: number }): typeof out {
  let zl = a / cp;
  for (let i = 0; i < 3; i++) {
    const k = keelHeightAt(Math.max(-BRIGANTINE_HALF_LENGTH, Math.min(BRIGANTINE_HALF_LENGTH, zl)));
    zl = (a - k * cr * sp) / cp;
  }
  const k = keelHeightAt(Math.max(-BRIGANTINE_HALF_LENGTH, Math.min(BRIGANTINE_HALF_LENGTH, zl)));
  out.zl = zl;
  out.y = W.y + k * cr * cp - zl * sp;
  out.c = -k * sr;
  return out;
}

/** How deep (m) the keel is bedded in the bar, so she sits in the sand, not on it. */
export const WRECK_BURY = 0.5;
/** The bar's crest, a few metres off her bow, under knee-deep water. */
export const WRECK_BAR_CREST = -0.62;
/**
 * The bar never breaks the surface (a sand islet read as a raft under her bow), and it stays deep
 * enough that the sea's shallow-water foam laces it rather than painting it white. Only round her
 * forefoot does it come up to meet her, a spit of sand just awash (WRECK_FOREFOOT_TOP).
 */
export const WRECK_BAR_TOP = -0.62;
export const WRECK_FOREFOOT_TOP = -0.04;

const tmp = { x: 0, y: 0, z: 0 };

/**
 * The player's ship keeps clear of her hull, the masts leaning out over her starboard side, her
 * and her broken bowsprit.
 */
export function wreckShipObstacles(): CircleObstacle[] {
  const out: CircleObstacle[] = [];
  const at = (x: number, y: number, z: number, r: number) => {
    wreckToWorld(x, y, z, tmp);
    out.push({ x: tmp.x, z: tmp.z, r, height: 8 });
  };
  for (const z of [-10, -5.2, -0.4, 4.4, 9]) at(-0.4, 1.2, z, 4.6);
  at(0, 2.8, 15.2, 2.6);
  // The masts lean out over her starboard side: the overhang, about half-way up.
  at(0, 12, 5.25, 3.6);
  at(0, 12, -1.65, 3.6);
  return out;
}
