import { abs, float, smoothstep } from 'three/tsl';
import type { TerrainRegions } from '../../terrain/terrain-regions';
import { FRAME, KEELHAVEN as K } from './layout';

/**
 * Keelhaven's ground: the whole island is fluted green wall and forest (`paliWall`), from a few metres
 * under the sea (the sea cliff's foot) to the crests, except the beach and a strip of open ground
 * behind it, which keep the plain ground (sand and lawn). Written as numbers from the layout.
 */
export const keelhavenTerrainRegions: TerrainRegions = ({ P, y }) => {
  const b = K.bounds;
  const island = smoothstep(b.minX, b.minX + 30, P.x)
    .mul(float(1).sub(smoothstep(b.maxX - 30, b.maxX, P.x)))
    .mul(smoothstep(b.minZ, b.minZ + 30, P.z))
    .mul(float(1).sub(smoothstep(b.maxZ - 30, b.maxZ, P.z)));
  // The island frame: u inland along the cove's axis, v across it (layout.ts).
  const dx = P.x.sub(FRAME.origin.x);
  const dz = P.z.sub(FRAME.origin.z);
  const u = dx.mul(FRAME.axis.x).add(dz.mul(FRAME.axis.z));
  const v = dx.mul(FRAME.across.x).add(dz.mul(FRAME.across.z));
  const shelf = K.townShelf;
  // The beach, its berm and a strip of open ground behind it (the town shelf's front). Inland of it the
  // floor is forest (until the town is built there).
  const lowland = smoothstep(-90, -70, u)
    .mul(float(1).sub(smoothstep(shelf.u0 + 10, shelf.u0 + 30, u)))
    .mul(float(1).sub(smoothstep(84, 98, abs(v))))
    .mul(float(1).sub(smoothstep(shelf.maxY + 1, shelf.maxY + 5, y)));
  const paliWall = island.mul(smoothstep(-8, -2, y)).mul(float(1).sub(lowland));
  return { paliWall };
};
