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
  if (tier === 'lite') return { hullZ: 48, hullY: 13, sail: 8, cyl: 9, rig: 5, railStep: 1.05 };
  if (tier === 'low') return { hullZ: 72, hullY: 16, sail: 13, cyl: 12, rig: 6, railStep: 0.78 };
  if (tier === 'medium') return { hullZ: 112, hullY: 22, sail: 20, cyl: 14, rig: 7, railStep: 0.54 };
  return { hullZ: 168, hullY: 30, sail: 32, cyl: 18, rig: 8, railStep: 0.36 };
}

export function lerpPoint(a: P3, b: P3, t: number): P3 {
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), z: lerp(a.z, b.z, t) };
}
