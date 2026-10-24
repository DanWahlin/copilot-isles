import type { IslandChartTerrain } from '../../../islands/types';
import { coveHeight, coveMasks } from '../../terrain/cove-height';

/** Anchorage's terrain for its 3D chart miniature (loaded on demand by its registry entry). */
export const ANCHORAGE_CHART_TERRAIN: IslandChartTerrain = { height: coveHeight, masks: coveMasks };
