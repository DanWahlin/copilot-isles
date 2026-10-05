import { BRIGANTINE_HALF_LENGTH, deckHeightAt, halfBeamAt, keelHeightAt, sheerHeightAt } from '../ship/lines';

/** Sea battles (docs/specs/BATTLES.md §4.2): real ballistic arcs, so a hit is a ball that met a hull. */
export const GRAVITY = 9.81;
export const MUZZLE_SPEED = 55;
/** Bulwark and rail above the sheer line that still stop a ball. */
const BULWARK = 0.85;

/**
 * Low-arc elevation (radians) that carries a ball `range` metres away and `dy` metres up (down if
 * negative) at muzzle speed `v`. NaN when the target is out of reach.
 */
export function elevationFor(range: number, dy: number, v = MUZZLE_SPEED, g = GRAVITY): number {
  if (!(range > 0)) return Number.NaN;
  const v2 = v * v;
  const disc = v2 * v2 - g * (g * range * range + 2 * dy * v2);
  if (disc < 0) return Number.NaN;
  return Math.atan2(v2 - Math.sqrt(disc), g * range);
}

/** Seconds in flight to cover `range` metres horizontally at `elevation`. */
export function flightTime(range: number, elevation: number, v = MUZZLE_SPEED): number {
  return range / Math.max(1e-3, v * Math.cos(elevation));
}

/**
 * Where to aim so a ball fired from (sx, sz) meets a target at (tx, tz) moving at (vx, vz): a
 * first-order lead, refined by the flight time. Writes the aim point into `out` and returns the
 * flight time (NaN if out of reach).
 */
export function leadPoint(
  sx: number,
  sy: number,
  sz: number,
  tx: number,
  ty: number,
  tz: number,
  vx: number,
  vz: number,
  out: Float32Array | number[],
  v = MUZZLE_SPEED,
): number {
  let ax = tx;
  let az = tz;
  let time = Number.NaN;
  for (let i = 0; i < 3; i++) {
    const range = Math.hypot(ax - sx, az - sz);
    const elevation = elevationFor(range, ty - sy, v);
    if (!Number.isFinite(elevation)) return Number.NaN;
    time = flightTime(range, elevation, v);
    ax = tx + vx * time;
    az = tz + vz * time;
  }
  out[0] = ax;
  out[1] = az;
  return time;
}

/**
 * True when a point in a brigantine's local frame (x port, y up from the waterline, z toward the bow)
 * is inside the hull or its bulwarks, from the keel to just above the rail.
 */
export function insideHull(x: number, y: number, z: number, scale = 1): boolean {
  const lx = x / scale;
  const ly = y / scale;
  const lz = z / scale;
  if (Math.abs(lz) > BRIGANTINE_HALF_LENGTH) return false;
  const sheer = sheerHeightAt(lz);
  if (ly < keelHeightAt(lz) || ly > sheer + BULWARK) return false;
  return Math.abs(lx) <= halfBeamAt(lz, Math.min(ly, sheer));
}

/** Local muzzle point of the deck gun at `z` on `side` (+1 port, −1 starboard). */
export function muzzleLocal(side: 1 | -1, z: number, out: { x: number; y: number; z: number }): void {
  const deck = deckHeightAt(z);
  out.x = side * (halfBeamAt(z, deck) * 0.56 + 0.85);
  out.y = deck + 0.4;
  out.z = z;
}
