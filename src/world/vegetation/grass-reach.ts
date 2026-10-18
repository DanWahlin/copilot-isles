import type { TierSettings } from '../../engine/quality';

/** Grass reach (high tier, m): full density to `full`, thinned to `keep` by `far`, gone past `far`. */
export const GRASS_REACH = { full: 20, far: 40, keep: 0.35 } as const;

/** How a tier scales the grass's reach (High's is 1). */
export function grassReachScale(tier: Pick<TierSettings, 'grassDistance'>): number {
  return Math.max(0.34, tier.grassDistance / 88);
}
