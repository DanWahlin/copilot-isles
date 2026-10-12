import { float, smoothstep } from 'three/tsl';
import type { TerrainRegions } from '../terrain/terrain-regions';

/**
 * Port Meridian's ground: its summer-gold hills, the town (whose gardens stay green), the sunlit east
 * bluffs and the limestone ridge. Written as numbers: the island's layout module pulls in its rocks.
 */
export const meridianTerrainRegions: TerrainRegions = ({ P, y, up, noise }) => {
  const town = smoothstep(548, 566, P.x)
    .mul(float(1).sub(smoothstep(840, 858, P.x)))
    .mul(smoothstep(-1000, -984, P.z))
    .mul(float(1).sub(smoothstep(-748, -738, P.z)));
  // Out to the island's far shore, the ridge's seaward feet included (the chart's miniature too).
  const dryGrass = smoothstep(470, 620, P.x)
    .mul(float(1).sub(smoothstep(1370, 1400, P.x)))
    .mul(smoothstep(-1310, -1260, P.z))
    .mul(float(1).sub(smoothstep(-620, -570, P.z)))
    .mul(float(1).sub(town.mul(0.85)));
  const bluff = smoothstep(722, 752, P.x)
    .mul(float(1).sub(smoothstep(884, 914, P.x)))
    .mul(smoothstep(-864, -846, P.z))
    .mul(float(1).sub(smoothstep(-704, -686, P.z)))
    .mul(smoothstep(4, 16, y));
  // The ridge's limestone: its high ground, and every steep face of it right down to the sea (its sea
  // cliffs). Where the high ground starts wanders with the noise, so no level line shows.
  const steep = smoothstep(0.8, 0.55, up).mul(smoothstep(0.4, 2.5, y));
  const high = smoothstep(26, 52, y.add(noise.sub(0.5).mul(36)));
  const limestoneRidge = smoothstep(880, 960, P.x)
    .mul(float(1).sub(smoothstep(1370, 1400, P.x)))
    .mul(float(1).sub(smoothstep(-990, -930, P.z)))
    .mul(high.max(steep));
  return { town, dryGrass, bluff, limestoneRidge };
};
