import { ISLAND_LIST, ISLANDS_IN_BUILD } from '../../islands/registry';
import type { TerrainRegions } from '../terrain/terrain-regions';

/**
 * Every island's terrain regions, in voyage order (each registry entry's `terrainRegions`, then the
 * islands still in build): the terrain material combines them, and stays as it is when an island is
 * added.
 */
export const ISLAND_TERRAIN_REGIONS: readonly TerrainRegions[] = [...ISLAND_LIST, ...ISLANDS_IN_BUILD].map(
  (e) => e.terrainRegions,
);
