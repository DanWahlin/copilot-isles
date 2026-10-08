import { ANCHORAGE_STARFISH } from '../islands/anchorage/starfish';
import { MERIDIAN_STARFISH } from '../islands/meridian-starfish';

/** The islands that hide starfish (the same ids as src/game/islands.ts). */
export type StarfishIsland = 'anchorage' | 'meridian';

/**
 * A starfish to find (Dan: "like Mario's stars"): where it lies and a short, friendly name the
 * Logbook lists (a hint until you've found it). `y` picks the level where walk surfaces stack (the
 * lighthouse gallery over its knoll); it rests on whatever is walkable there.
 */
export interface StarfishSpot {
  id: string;
  island: StarfishIsland;
  name: string;
  x: number;
  z: number;
  y?: number;
}

/** Every starfish: each island keeps its own list; a new island adds its list here. */
export const STARFISH: readonly StarfishSpot[] = [...ANCHORAGE_STARFISH, ...MERIDIAN_STARFISH];

/** The starfish on an island. */
export function starfishOn(island: StarfishIsland): StarfishSpot[] {
  return STARFISH.filter((s) => s.island === island);
}

/** How many of an island's starfish are in `found`. */
export function starfishCount(
  island: StarfishIsland,
  found: readonly string[],
): { found: number; total: number } {
  const all = starfishOn(island);
  return { found: all.filter((s) => found.includes(s.id)).length, total: all.length };
}

/** Doubloons for each starfish, and for finding every one on an island. */
export const STARFISH_REWARD = 5;
export const STARFISH_SET_REWARD = 20;
