import type { SkySystem } from './sky-system';

type Mood = SkySystem['mood'];

/** An island's air (its registry mood): haze, its tint, and the light's fill and exposure. */
export interface IslandMood {
  readonly fogScale: number;
  readonly hazeTint: readonly [number, number, number];
  readonly fill?: number;
  readonly exposure?: number;
}

/** The open sea's air (the identity mood). The cove sets it each frame before the islands apply theirs. */
export function resetMood(mood: Mood): void {
  mood.fogScale = 1;
  for (let i = 0; i < 3; i++) mood.hazeTint[i] = 1;
  mood.fill = 1;
  mood.exposure = 1;
}

/**
 * Applies an island's air `k` (0-1, its light's reach) of the way over the air that's there: at `k`
 * 0 nothing changes, so an island far off leaves the island you're at its own air. Islands whose
 * reaches meet multiply. Issue 322: each stream set the whole mood, so Keelhaven's (identity, far
 * off) overwrote Thousand-Bough's every frame. No allocation.
 */
export function applyIslandMood(mood: Mood, m: IslandMood, k: number): void {
  if (!(k > 0)) return;
  mood.fogScale *= 1 + (m.fogScale - 1) * k;
  for (let i = 0; i < 3; i++) mood.hazeTint[i] = mood.hazeTint[i]! * (1 + (m.hazeTint[i]! - 1) * k);
  mood.fill *= 1 + ((m.fill ?? 1) - 1) * k;
  mood.exposure *= 1 + ((m.exposure ?? 1) - 1) * k;
}
