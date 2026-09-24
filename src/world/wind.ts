import type { WindState } from './contracts';

/**
 * The shared wind field (PLAN §6): one set of constants drives grass, palms, flags, sails, and
 * the ship. The GPU side (wind-nodes.ts) builds TSL nodes from the same constants and the
 * `uWindTime` uniform, so CPU (ship thrust, sail luffing) and GPU (sway) agree.
 */
export const WIND: WindState = { dirX: 0.8, dirZ: -0.6, speed: 6.5 };

/** Gust front scale along the wind direction (m) and travel speed (m/s). */
export const GUST = { wavelength: 140, speed: 9, strength: 0.45 };

/** Gust factor (≈0.55-1.45) at a world point and time; mirrors `gustNode` on the GPU. */
export function gustAt(x: number, z: number, t: number): number {
  const along = x * WIND.dirX + z * WIND.dirZ;
  const phase = ((along - t * GUST.speed) / GUST.wavelength) * Math.PI * 2;
  const cross = (x * -WIND.dirZ + z * WIND.dirX) * 0.013;
  return 1 + GUST.strength * Math.sin(phase) * (0.7 + 0.3 * Math.sin(t * 0.21 + cross));
}

/** Wind velocity (m/s) at a point: mean wind × gust factor. */
export function windAt(
  x: number,
  z: number,
  t: number,
  out: Float32Array | number[],
): Float32Array | number[] {
  const g = gustAt(x, z, t) * WIND.speed;
  out[0] = WIND.dirX * g;
  out[1] = WIND.dirZ * g;
  return out;
}
