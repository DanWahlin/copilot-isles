import { mulberry32, smoothstep } from '../../util/math';
import { ROCK_ASSETS } from '../terrain/rock-assets';
import type { FreshWater } from './meridian-water';

/** A stone in or beside one of an island's natural streams. */
export interface StreamStone {
  x: number;
  z: number;
  /** Radius (m). */
  r: number;
  /** Where its top stands (a stone in the bed just breaks the surface; the water foams round it). */
  top: number;
  /** In the water (white water round it) rather than on the bank. */
  inBed: boolean;
}

/** Each rock asset's height at scale 1 (its base is at y 0). */
export const ROCK_HEIGHTS: readonly number[] = ROCK_ASSETS.map((a) => {
  let top = -Infinity;
  for (let i = 1; i < a.positions.length; i += 3) top = Math.max(top, a.positions[i]!);
  return top;
});

/** The share of an island's small stones each tier keeps (the streams' stones thin the same way). */
export const SMALL_ROCKS = { lite: 0.1, low: 0.4, medium: 1, high: 1, ultra: 1 } as const;

/**
 * Whether the `i`th stream stone stays on a tier that keeps `share` of the island's small stones
 * (an even, seeded thinning, so the rocks and the water's white water agree on which are there).
 */
export function streamStoneKept(i: number, share: number): boolean {
  return (i * 0.6180339887498949 + 0.31) % 1 < share;
}

/**
 * The stones of an island's natural streams (those with a `course`; seeded, pure): stones breaking
 * the surface in the bed, most in the narrow riffles, and a few along the banks. None in a pool, or
 * where `clear` says no (a bridge, a walk, a cast member's spot); `ground` is the island's carved
 * height (a bank stone stands on it).
 */
export function placeStreamStones(
  water: FreshWater,
  seed: number,
  ground: (x: number, z: number) => number,
  clear: (x: number, z: number, r: number) => boolean = () => true,
): StreamStone[] {
  const rand = mulberry32(seed);
  const out: StreamStone[] = [];
  const place = (x: number, z: number, r: number, top: number, inBed: boolean) => {
    if (water.basinAt(x, z, 1.25)) return;
    if (!clear(x, z, r)) return;
    if (out.some((o) => Math.hypot(o.x - x, o.z - z) < o.r + r + 0.5)) return;
    out.push({ x, z, r, top, inBed });
  };
  for (const s of water.streams) {
    if (!s.spec.course) continue;
    let meanHalf = 0;
    for (let i = 0; i < s.count; i++) meanHalf += s.half[i]! / s.count;
    for (let i = 3; i < s.count - 3; i++) {
      const tx = s.x[i + 1]! - s.x[i - 1]!;
      const tz = s.z[i + 1]! - s.z[i - 1]!;
      const tl = Math.hypot(tx, tz) || 1;
      const half = s.half[i]!;
      // Riffles (narrow, fast) are stony; slow, wide reaches have the odd one.
      const narrow = smoothstep(1.02, 0.78, half / meanHalf);
      const at = (d: number): [number, number] => [s.x[i]! - (tz / tl) * d, s.z[i]! + (tx / tl) * d];
      if (rand() < 0.14 + narrow * 0.4) {
        const d = (rand() * 2 - 1) * 0.6 * half;
        const [x, z] = at(d);
        const r = 0.3 + rand() * 0.3 + narrow * 0.15;
        place(x, z, r, s.surface[i]! + 0.1 + rand() * 0.22, true);
      }
      if (rand() < 0.16) {
        const side = rand() < 0.5 ? -1 : 1;
        const d = side * (half * 1.04 + 0.15 + rand() * 0.6);
        const [x, z] = at(d);
        const r = 0.28 + rand() * 0.34;
        place(x, z, r, Math.max(s.surface[i]! + 0.1, ground(x, z) + r * 0.7), false);
      }
    }
  }
  return out;
}
