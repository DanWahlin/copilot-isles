import type { TerrainRegions } from '../terrain/terrain-regions';
import { anchorageTerrainRegions } from './anchorage/terrain-regions';
import { meridianTerrainRegions } from './meridian-terrain-regions';

/** Every island's terrain regions; a new island adds its own here (the terrain material stays as is). */
export const ISLAND_TERRAIN_REGIONS: readonly TerrainRegions[] = [
  anchorageTerrainRegions,
  meridianTerrainRegions,
];
