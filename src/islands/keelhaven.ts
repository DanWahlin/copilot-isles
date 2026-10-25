import { KEELHAVEN_FLORA_PALETTE } from '../world/islands/keelhaven/flora-palette';
import { keelhavenTerrainRegions } from '../world/islands/keelhaven/terrain-regions';
import type { IslandInBuild } from './types';

/**
 * Keelhaven (Chapter 03), in build (docs/specs/ISLAND-03-keelhaven.md §12): its terrain regions and
 * its flora palette join the shared terrain and grass materials now (the dev terrain page draws its
 * bake, its world art and its flora with them). It isn't in the game yet; its full `IslandEntry`
 * replaces this when its package is done. Its world (the falls, the mist, the plants, the shipyard and
 * the town) is `createKeelhavenWorldAsync` (src/world/islands/keelhaven/index.ts), the world its
 * stream will build.
 */
export const KEELHAVEN_IN_BUILD: IslandInBuild = {
  id: 'keelhaven',
  terrainRegions: keelhavenTerrainRegions,
  floraPalette: KEELHAVEN_FLORA_PALETTE,
};
