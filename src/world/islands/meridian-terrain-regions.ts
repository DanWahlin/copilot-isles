import { float, smoothstep } from 'three/tsl';
import type { TerrainRegions } from '../terrain/terrain-regions';

/**
 * Port Meridian's ground: its summer-gold hills, the town (whose gardens stay green), the sunlit east
 * bluffs and the limestone ridge. Written as numbers: the island's layout module pulls in its rocks.
 */
export const meridianTerrainRegions: TerrainRegions = ({ P, y, miniature }) => {
  const town = smoothstep(548, 566, P.x)
    .mul(float(1).sub(smoothstep(840, 858, P.x)))
    .mul(smoothstep(-1000, -984, P.z))
    .mul(float(1).sub(smoothstep(-748, -738, P.z)));
  // The chart's miniature shows the mountain past the terrain's box, so it keeps the dry ground out to
  // the island's far shore.
  const dryEast = miniature ? 1400 : 1240;
  const drySouth = miniature ? -1260 : -1080;
  const dryGrass = smoothstep(470, 620, P.x)
    .mul(float(1).sub(smoothstep(dryEast - 30, dryEast, P.x)))
    .mul(smoothstep(drySouth - 50, drySouth, P.z))
    .mul(float(1).sub(smoothstep(-620, -570, P.z)))
    .mul(float(1).sub(town.mul(0.85)));
  const bluff = smoothstep(722, 752, P.x)
    .mul(float(1).sub(smoothstep(884, 914, P.x)))
    .mul(smoothstep(-864, -846, P.z))
    .mul(float(1).sub(smoothstep(-704, -686, P.z)))
    .mul(smoothstep(4, 16, y));
  const limestoneRidge = smoothstep(880, 960, P.x)
    .mul(float(1).sub(smoothstep(1290, 1330, P.x)))
    .mul(float(1).sub(smoothstep(-990, -930, P.z)))
    .mul(smoothstep(30, 60, y));
  return { town, dryGrass, bluff, limestoneRidge };
};
