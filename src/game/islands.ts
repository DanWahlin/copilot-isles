import type { IslandMusic } from '../audio/music/tracks';
import { MERIDIAN } from '../world/islands/meridian';
import { COVE } from '../world/layout';
import { ARRIVALS, type IslandArrival, type IslandId } from './arrivals';
import { meridianOpen } from './meridian-open';

export type { IslandId };

interface Pose {
  x: number;
  z: number;
  heading: number;
}

/**
 * An island you can moor at: where the ship lies alongside, where you step ashore, what plays, and
 * what the compass calls it while you're sailing there.
 */
export interface IslandBerth {
  id: IslandId;
  name: string;
  /** The compass label for sailing home to it. */
  berthLabel: string;
  /** The dock prompt near the berth. */
  dockLabel: string;
  /** Where the ship moors (the dock assist target); its port side lies against the quay. */
  mooring: Pose;
  /** Which way you face after stepping ashore beside the gangway (toward the town). */
  landingHeading: number;
  /** A fast-travel spot on the quay by the berth. */
  quay: Pose;
  music: IslandMusic;
  /** The island's time of day: solar hours and the sun path's rotation (degrees). */
  sky: { hours: number; azimuth: number };
  arrival: IslandArrival;
  /** Whether it's inside the island's waters (for saves, travel, and which island you're on). */
  contains(x: number, z: number): boolean;
}

export const ISLANDS: Readonly<Record<IslandId, IslandBerth>> = {
  anchorage: {
    id: 'anchorage',
    name: 'Anchorage Cay',
    berthLabel: 'Anchorage pier',
    dockLabel: 'Dock at the pier',
    mooring: COVE.mooring,
    landingHeading: 0,
    quay: { ...COVE.spawn },
    music: 'anchorage',
    sky: { hours: 16.2, azimuth: 0 },
    arrival: ARRIVALS.anchorage,
    contains: (x, z) => Math.hypot(x, z) < 330,
  },
  meridian: {
    id: 'meridian',
    name: 'Port Meridian',
    berthLabel: 'Port Meridian',
    dockLabel: 'Dock at Port Meridian',
    mooring: MERIDIAN.harbor.berth,
    // Up the harbour toward the plaza: the terraces, the clock tower and the citadel in one frame.
    landingHeading: -2.81,
    quay: MERIDIAN.harbor.landing,
    music: 'meridian',
    // Golden hour, the sun low in the south-west: it lights the town's face across the harbour.
    sky: { hours: 17.35, azimuth: -45 },
    arrival: ARRIVALS.meridian,
    contains: (x, z) =>
      x >= MERIDIAN.bounds.minX &&
      x <= MERIDIAN.bounds.maxX &&
      z >= MERIDIAN.bounds.minZ &&
      z <= MERIDIAN.bounds.maxZ,
  },
};

/**
 * The sky while sailing between Anchorage and Meridian: Anchorage's afternoon until you're well out,
 * easing into Meridian's golden hour as her harbour comes up (hours and azimuth written to `out`).
 */
export function passageSky(x: number, z: number, out: { hours: number; azimuth: number }): void {
  const a = ISLANDS.anchorage.sky,
    m = ISLANDS.meridian.sky;
  const d = Math.hypot(x - MERIDIAN.center.x, z - MERIDIAN.center.z);
  const t = Math.min(1, Math.max(0, (900 - d) / 500));
  const k = t * t * (3 - 2 * t);
  out.hours = a.hours + (m.hours - a.hours) * k;
  out.azimuth = a.azimuth + (m.azimuth - a.azimuth) * k;
}

/** The island whose waters (x, z) are in, falling back to Anchorage for the open sea. */
export function islandAt(x: number, z: number): IslandId {
  return ISLANDS.meridian.contains(x, z) ? 'meridian' : 'anchorage';
}

/** The islands you can dock at right now. */
export function openIslands(): IslandBerth[] {
  return meridianOpen() ? [ISLANDS.anchorage, ISLANDS.meridian] : [ISLANDS.anchorage];
}
