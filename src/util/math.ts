/** Small scalar helpers shared across the game, world, and audio code. */

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

export function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Hermite ease from 0 at `edge0` to 1 at `edge1` (GLSL `smoothstep`). */
export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

/** Wraps an angle into [−π, π). */
export function wrapAngle(a: number): number {
  a = (a + Math.PI) % (Math.PI * 2);
  if (a < 0) a += Math.PI * 2;
  return a - Math.PI;
}

/** Distance in the XZ plane from (x, z) to the segment a → b. */
export function segmentDistance(
  x: number,
  z: number,
  ax: number,
  az: number,
  bx: number,
  bz: number,
): number {
  const dx = bx - ax;
  const dz = bz - az;
  const t = clamp01(((x - ax) * dx + (z - az) * dz) / Math.max(1e-6, dx * dx + dz * dz));
  return Math.hypot(x - (ax + dx * t), z - (az + dz * t));
}

/** Distance from (x, y, z) to the segment a → b. */
export function segmentDistance3(
  x: number,
  y: number,
  z: number,
  a: { readonly x: number; readonly y: number; readonly z: number },
  b: { readonly x: number; readonly y: number; readonly z: number },
): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dz = b.z - a.z;
  const t = clamp01(
    ((x - a.x) * dx + (y - a.y) * dy + (z - a.z) * dz) / Math.max(1e-6, dx * dx + dy * dy + dz * dz),
  );
  return Math.hypot(x - a.x - dx * t, y - a.y - dy * t, z - a.z - dz * t);
}

/** A small, fast seeded PRNG (Mulberry32): returns a function giving uniform values in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A small, fast seeded PRNG (Mulberry32's mix fed back on itself, without its counter): returns a
 * function giving uniform values in [0, 1). A zero seed takes a fixed non-zero one.
 */
export function seededRandom(seed: number): () => number {
  let s = seed >>> 0 || 0x9e3779b9;
  return () => {
    s = Math.imul(s ^ (s >>> 15), 1 | s);
    s ^= s + Math.imul(s ^ (s >>> 7), 61 | s);
    return ((s ^ (s >>> 14)) >>> 0) / 4294967296;
  };
}

/** The classic `fract(sin(…) · 43758.5453)` hash of a 2D point and a salt, in [0, 1). */
export function sinHash(x: number, z: number, salt: number): number {
  const v = Math.sin(x * 127.1 + z * 311.7 + salt * 74.7) * 43758.5453;
  return v - Math.floor(v);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
