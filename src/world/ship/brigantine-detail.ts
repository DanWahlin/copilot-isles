import type { Tier } from '../contracts';
import { lerp } from '../../util/math';
import type { P3 } from './mesh-builder';

/** Shared brigantine geometry detail levels and point interpolation helpers. */
export interface Detail {
  hullZ: number;
  hullY: number;
  sail: number;
  cyl: number;
  rig: number;
  railStep: number;
}

export function detailForTier(tier: Tier): Detail {
  if (tier === 'lite') return { hullZ: 44, hullY: 12, sail: 7, cyl: 8, rig: 5, railStep: 1.15 };
  if (tier === 'low') return { hullZ: 56, hullY: 14, sail: 9, cyl: 10, rig: 5, railStep: 0.9 };
  if (tier === 'medium') return { hullZ: 88, hullY: 18, sail: 15, cyl: 12, rig: 6, railStep: 0.62 };
  return { hullZ: 128, hullY: 22, sail: 22, cyl: 14, rig: 7, railStep: 0.45 };
}

export function lerpPoint(a: P3, b: P3, t: number): P3 {
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), z: lerp(a.z, b.z, t) };
}
