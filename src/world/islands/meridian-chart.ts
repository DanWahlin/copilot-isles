import type { IslandChartTerrain } from '../../islands/types';
import { meridianHeight, meridianMasks } from './meridian';

/** Port Meridian's terrain for its 3D chart miniature (loaded on demand by its registry entry). */
export const MERIDIAN_CHART_TERRAIN: IslandChartTerrain = { height: meridianHeight, masks: meridianMasks };
