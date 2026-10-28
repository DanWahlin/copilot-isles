import type { TierSettings } from '../../engine/quality';

/**
 * Grass reach (high tier, m), from the field's centre: full density to `full`, thinned to `keep` by
 * `far`, gone past `far`.
 */
export const GRASS_REACH = { full: 20, far: 40, keep: 0.35 } as const;

/**
 * Where the blades start to shrink toward the reach's edge (a share of the reach). A long fade: with
 * a short one (0.84) a blade grew from nothing to full in half a second as you ran, which read as
 * grass drawing in ahead of you, most on a hill, where the edge stands up in the view.
 */
export const REACH_FADE = 0.6;

/**
 * How much of the keep (1 → `GRASS_REACH.keep` from `full` to `far`) a thinned tussock takes to shrink
 * away: about a fifth of the reach, so tussocks thin out gradually as you go, not a metre or two apart
 * (0.12 was 4 m on High and 2 m on Low).
 */
export const THIN_RAMP = 0.25;

/**
 * How far ahead of the camera, along its view, the field's centre is (a share of the reach). The follow
 * camera is behind the captain, so a field round the camera reached less than two thirds of its
 * reach ahead of the captain, and half of it lay behind the camera, out of view.
 */
export const GRASS_LEAD = 0.35;

/** How a tier scales the grass's reach (High's is 1). */
export function grassReachScale(tier: Pick<TierSettings, 'grassDistance'>): number {
  return Math.max(0.34, tier.grassDistance / 88);
}

/**
 * The field's centre for a camera at (x, z) looking along (lookX, lookZ) (its view's horizontal part:
 * shorter when it looks down), for a reach of `far` m: `GRASS_LEAD` of the reach ahead. Into `out`.
 */
export function grassFieldCentre(
  x: number,
  z: number,
  lookX: number,
  lookZ: number,
  far: number,
  out: { x: number; y: number },
): void {
  out.x = x + lookX * far * GRASS_LEAD;
  out.y = z + lookZ * far * GRASS_LEAD;
}
