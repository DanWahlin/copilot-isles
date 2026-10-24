import type { IslandChartTerrain } from '../../../islands/types';
import { thousandBoughHeight, thousandBoughMasks } from './height';
import { THOUSAND_BOUGH } from './layout';

/** Thousand-Bough's terrain for its 3D chart miniature (loaded on demand by its registry entry). */
export const THOUSAND_BOUGH_CHART_TERRAIN: IslandChartTerrain = {
  height: thousandBoughHeight,
  masks: thousandBoughMasks,
  // The great banyan's crown, one raised dome over the valley (spec §2.6).
  relief: (x, z) => {
    const t = THOUSAND_BOUGH.tree;
    const d = Math.hypot(x - t.x, z - t.z) / 58;
    return d < 1 ? 46 * Math.sqrt(1 - d * d) : 0;
  },
};
