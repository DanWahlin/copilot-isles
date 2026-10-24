import type { SeaChartSpec } from '../../game/wayfinding/sea-chart';
import type { WalkGraphSpec } from '../../game/wayfinding/walk-graph';
import { ANCHORAGE_WAYS } from './anchorage/waypoints';
import { MERIDIAN_WAYS } from './meridian-waypoints';
import { THOUSAND_BOUGH_WAYS } from './thousand-bough/waypoints';

/** An island's routes for the compass and the crew: its walking graph ashore and its waters. */
export interface IslandWays {
  readonly walk: WalkGraphSpec;
  readonly sea: SeaChartSpec;
}

/** Every island's routes, by island id (one line per island). */
export const ISLAND_WAYS: Readonly<Record<string, IslandWays>> = {
  anchorage: ANCHORAGE_WAYS,
  meridian: MERIDIAN_WAYS,
  'thousand-bough': THOUSAND_BOUGH_WAYS,
};
