import {
  addWaterDepthTile,
  removeWaterDepthTile,
  waterDepthTileFromTerrain,
  type WaterDepthTile,
} from '../ocean/water-depth-texture';
import type { TerrainBakeData } from '../terrain/bake';

/**
 * A streamed island's floor for the ocean's depth colour (its turquoise shallows), for an island
 * outside the home tile (`WATER_DEPTH_BOUNDS`; its registry entry's `stream.depthTile`). It's built
 * from the island's baked terrain and lent to the ocean while the island is in memory. The ocean's
 * first draw with it uploads it, so the stream lends it when its warm-up holds the island (an upload
 * the hitch guard excuses), or when the island first shows without a warm-up.
 */
export interface IslandDepthTile {
  /** Builds the tile from the island's bake, a few rows a breath. */
  build(data: TerrainBakeData, breathe: () => Promise<void>): Promise<void>;
  /** Lends the built tile to the ocean (again is a no-op); `ready`: the island's ground is in. */
  lend(ready: boolean): void;
  /** Takes the tile back (the island is freed). */
  drop(): void;
}

export function createIslandDepthTile(id: string): IslandDepthTile {
  let tile: WaterDepthTile | null = null;
  return {
    async build(data, breathe) {
      const steps = waterDepthTileFromTerrain(data, id);
      for (let r = steps.next(); ; r = steps.next()) {
        if (r.done) {
          tile = r.value;
          return;
        }
        await breathe();
      }
    },
    lend(ready) {
      if (tile && ready) addWaterDepthTile(tile);
    },
    drop() {
      if (tile) removeWaterDepthTile(tile);
      tile = null;
    },
  };
}
