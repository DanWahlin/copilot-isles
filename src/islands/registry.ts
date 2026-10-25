import { ANCHORAGE } from './anchorage';
import { KEELHAVEN_ISLAND } from './keelhaven';
import { MERIDIAN_ISLAND } from './meridian';
import { THOUSAND_BOUGH_ISLAND } from './thousand-bough';
import type { IslandEntry, IslandInBuild } from './types';

/**
 * Every island the game has built, in voyage order (docs/adding-an-island.md). A new island is its
 * package (world, game and course pack) and one line here. The shared systems (the berths and the
 * sky, the chart, the world's streams, residency, the session's content, the compass, the tools)
 * read this list; none of them names an island. The islands still to build stay on the chart as
 * "coming soon" data (src/ui/chart/archipelago.ts), not here.
 */
export const ISLAND_REGISTRY = {
  anchorage: ANCHORAGE,
  meridian: MERIDIAN_ISLAND,
  'thousand-bough': THOUSAND_BOUGH_ISLAND,
  keelhaven: KEELHAVEN_ISLAND,
} as const satisfies Readonly<Record<string, IslandEntry>>;

export type IslandId = keyof typeof ISLAND_REGISTRY;

/**
 * Islands whose world is still being built, after the registry's in voyage order: only their
 * terrain regions are in the shared world (src/world/islands/terrain-regions.ts). An island moves
 * from here to `ISLAND_REGISTRY` when its package is done.
 */
export const ISLANDS_IN_BUILD: readonly IslandInBuild[] = [];

/** The islands in voyage order. */
export const ISLAND_LIST: readonly IslandEntry[] = Object.values(ISLAND_REGISTRY);

/** Every island id, in voyage order. */
export const ISLAND_IDS = Object.keys(ISLAND_REGISTRY) as readonly IslandId[];

/** The home island: built with the world (no stream), where a new voyage starts. */
export const HOME_ISLAND: IslandId = ISLAND_LIST.find((e) => !e.stream)!.id;

/** The islands that stream in and out (every island but the home island), in voyage order. */
export const STREAMED_ISLANDS: readonly IslandEntry[] = ISLAND_LIST.filter((e) => e.stream);

/** Whether `id` is an island in the registry (a string from the chart, a URL or a save). */
export function isIslandId(id: string): id is IslandId {
  return Object.hasOwn(ISLAND_REGISTRY, id);
}

/** An island's registry entry. */
export function islandEntry(id: IslandId): IslandEntry {
  return ISLAND_REGISTRY[id];
}
