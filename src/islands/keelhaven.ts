import { keelhavenTerrainRegions } from '../world/islands/keelhaven/terrain-regions';
import type { IslandInBuild } from './types';

/**
 * Keelhaven (Chapter 03), in build (docs/specs/ISLAND-03-keelhaven.md §12): its terrain regions join
 * the shared terrain material now (the dev terrain page draws its bake with them). It isn't in the
 * game yet; its full `IslandEntry` replaces this when its package is done.
 */
export const KEELHAVEN_IN_BUILD: IslandInBuild = {
  id: 'keelhaven',
  terrainRegions: keelhavenTerrainRegions,
};
