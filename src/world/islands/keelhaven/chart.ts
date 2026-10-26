import type { IslandChartTerrain } from '../../../islands/types';
import { keelhavenHeight, keelhavenMasks } from './height';

/**
 * Keelhaven's terrain for its 3D chart miniature (loaded on demand by its registry entry). The chart
 * reads its coarse chart pack (`keelhaven/chart`); these only fill in past that pack's edge.
 */
export const KEELHAVEN_CHART_TERRAIN: IslandChartTerrain = { height: keelhavenHeight, masks: keelhavenMasks };
