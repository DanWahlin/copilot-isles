import type { SeaChartSpec } from '../../game/wayfinding/sea-chart';
import type { WalkGraphSpec } from '../../game/wayfinding/walk-graph';
import { ISLAND_LIST } from '../../islands/registry';

/** An island's routes for the compass and the crew: its walking graph ashore and its waters. */
export interface IslandWays {
  readonly walk: WalkGraphSpec;
  readonly sea: SeaChartSpec;
}

/**
 * Every island's routes, by island id, in voyage order: each island's code has its own
 * (`IslandCode.ways`, loaded with the island's chunk).
 */
export async function loadIslandWays(): Promise<Readonly<Record<string, IslandWays>>> {
  const codes = await Promise.all(ISLAND_LIST.map((e) => e.code()));
  return Object.fromEntries(ISLAND_LIST.map((e, i) => [e.id, codes[i]!.ways]));
}
