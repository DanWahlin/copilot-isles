import { abs, cameraPosition, float, max, smoothstep } from 'three/tsl';
import type { TerrainRegions } from '../../terrain/terrain-regions';
import { FRAME, KEELHAVEN as K } from './layout';
import { PADS } from './works';

/**
 * Keelhaven's ground: the whole island is fluted green wall and forest (`paliWall`), from a few metres
 * under the sea (the sea cliff's foot) to the crests, except the beach and a strip of open ground
 * behind it, which keep the plain ground (sand and lawn). Under the trees the gentle ground is a forest
 * floor (`forestFloor`), and the shipyard's yard and the town's streets are trodden earth (`town`). Written as numbers from the
 * layout.
 */
export const keelhavenTerrainRegions: TerrainRegions = (ctx) => {
  const { P, y } = ctx;
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
    .mul(float(1).sub(smoothstep(shelf.u1 + 4, shelf.u1 + 20, u)))
    .mul(float(1).sub(smoothstep(84, 98, abs(v))))
    .mul(float(1).sub(smoothstep(shelf.maxY + 1, shelf.maxY + 5, y)));
  const paliWall = island.mul(smoothstep(-8, -2, y)).mul(float(1).sub(lowland));
  // The forest's floor (a dark moss carpet under the trees, not open meadow): the gentle ground the
  // trees grow on (slopes under about 34°), from just over the beach to the tree line, except the town
  // shelf (it's built on) and the beach. Past the trees' far cards (about 600 m) the wall's painted
  // canopy carries the forest on.
  const shelfOut = max(
    max(smoothstep(shelf.u0 - 14, shelf.u0 - 6, u).oneMinus(), smoothstep(shelf.u1 + 6, shelf.u1 + 14, u)),
    smoothstep(shelf.halfWidth + 6, shelf.halfWidth + 14, abs(v)),
  );
  const forestFloor = paliWall
    .mul(smoothstep(0.8, 0.88, ctx.up))
    .mul(smoothstep(4, 8, y))
    .mul(float(1).sub(smoothstep(96, 110, y)))
    .mul(shelfOut)
    .mul(float(1).sub(smoothstep(440, 600, P.sub(cameraPosition).length())));
  // The shipyard's yard and the lock terrace: trodden earth (the bake's sand there), not lawn.
  const pad = (p: { u0: number; u1: number; v0: number; v1: number }) =>
    smoothstep(p.u0 - 4, p.u0 + 2, u)
      .mul(float(1).sub(smoothstep(p.u1 - 2, p.u1 + 4, u)))
      .mul(smoothstep(p.v0 - 4, p.v0 + 2, v))
      .mul(float(1).sub(smoothstep(p.v1 - 2, p.v1 + 4, v)));
  // The town's flat (its street, square and paths are the bake's sand there).
  const townFlat = pad({ u0: 4, u1: 136, v0: 6, v1: 72 }).mul(smoothstep(1.2, 2.2, y));
  const town = max(max(max(pad(PADS.yard), pad(PADS.locks)), pad(PADS.cut)), max(pad(PADS.light), townFlat));
  return { paliWall, forestFloor, town };
};
