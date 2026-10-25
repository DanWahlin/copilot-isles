import { ISLAND_LIST, type IslandId } from '../../islands/registry';

/** The islands that hide starfish: every island in the registry (src/islands/registry.ts). */
export type StarfishIsland = IslandId;

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

/** Every starfish: each island keeps its own list (its registry entry's `starfish`), in voyage order. */
export const STARFISH: readonly StarfishSpot[] = ISLAND_LIST.flatMap((e) => e.starfish);

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
