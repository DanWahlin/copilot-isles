import { float, smoothstep, vec2 } from 'three/tsl';
import { COVE } from '../../layout';
import { VILLAGE_GROUND } from '../../terrain/cove-height';
import { segmentMaskNode, type TerrainRegions } from '../../terrain/terrain-regions';

/** Anchorage Cay's ground: its village lawns and paths, the east headland, the sea cave and the bard's camp. */
export const anchorageTerrainRegions: TerrainRegions = ({ P, y, grassMask }) => {
  // The village's lived-in ground (cove-height `villageGroundWeight`): its sand is worn earth.
  const g = VILLAGE_GROUND;
  const villageGround = float(1)
    .sub(smoothstep(g.edge, 1, vec2(P.x.sub(g.x).div(g.rx), P.z.sub(g.z).div(g.rz)).length()))
    .mul(smoothstep(g.y0, g.y1, y));
  const paths = segmentMaskNode(COVE.village.center.x, COVE.village.center.z, -18, -10, 2.4, 7.2, P)
    .add(segmentMaskNode(-18, -10, -28, 103, 2.8, 8.6, P))
    .add(segmentMaskNode(-112, -64, COVE.village.center.x, COVE.village.center.z, 2.2, 6.5, P))
    .saturate()
    .mul(smoothstep(1.0, 6.5, y));
  // The east headland and its inland slope: one smooth grassy hill, without the island's height bands
  // and strata (on a big even slope they read as farm terraces).
  const grassHill = smoothstep(COVE.headland.x0 - 50, COVE.headland.x0 - 15, P.x)
    .mul(smoothstep(COVE.headland.z0 - 40, COVE.headland.z0 - 10, P.z))
    .mul(float(1).sub(smoothstep(COVE.headland.z1 + 10, COVE.headland.z1 + 40, P.z)));
  // The inland hills the masks call grass (kept west of Port Meridian's waters).
  const grassySlopes = smoothstep(0.2, 0.6, grassMask).mul(float(1).sub(smoothstep(380, 460, P.x)));
  // The sea cave in the headland cliff.
  const cave = float(1)
    .sub(smoothstep(0.0, 1.0, vec2(P.x.sub(198).div(11), P.z.add(5).div(7)).length()))
    .mul(smoothstep(-1.2, 5.0, y))
    .mul(float(1).sub(smoothstep(8, 15, y)));
  // The bard's camp behind the lagoon beach.
  const campSand = float(1)
    .sub(smoothstep(4.2, 9.0, vec2(P.x.add(18).mul(1.05), P.z.sub(86.2).mul(0.82)).length()))
    .mul(smoothstep(0.05, 2.8, y));
  return { villageGround, paths, grassHill, grassySlopes, cave, campSand };
};
