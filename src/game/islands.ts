import type { IslandMusic } from '../audio/music/tracks';
import { MERIDIAN } from '../world/islands/meridian';
import { THOUSAND_BOUGH, insideThousandBough } from '../world/islands/thousand-bough/layout';
import { COVE } from '../world/layout';
import { ARRIVALS, type IslandArrival, type IslandId } from './arrivals';
import { meridianOpen } from './meridian-open';
import { thousandBoughOpen } from './thousand-bough-open';

export type { IslandId };

interface Pose {
  x: number;
  z: number;
  heading: number;
}

/** An island's air: haze density × `fogScale`, haze colour × `hazeTint` (spec ISLAND-02 §2.4). */
export interface IslandMood {
  fogScale: number;
  hazeTint: readonly [number, number, number];
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
  /** The island's air (fog and haze), blended in on the passage like the sky; identity without one. */
  mood?: IslandMood;
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
  'thousand-bough': {
    id: 'thousand-bough',
    name: 'Thousand-Bough Isle',
    berthLabel: 'Thousand-Bough Isle',
    dockLabel: 'Dock at the Root Wharf',
    mooring: THOUSAND_BOUGH.harbor.berth,
    // Up the Fern Walk to the great banyan: the wharf, the little sister tree and the trunk in one frame.
    landingHeading: THOUSAND_BOUGH.harbor.landing.heading,
    quay: THOUSAND_BOUGH.harbor.landing,
    music: 'thousand-bough',
    // Late golden hour going to dusk: the sun 6° up in the WNW (bearing 290°), side-lighting the decks
    // from the wharf while the valley sits in blue-green shade.
    sky: { hours: 17.77, azimuth: 13.5 },
    // The valley's mist: a thicker, cooler haze over the island.
    mood: THOUSAND_BOUGH.mood,
    arrival: ARRIVALS['thousand-bough'],
    contains: insideThousandBough,
  },
};

/** How each island's light reaches out over the sea: full within `full` m of its centre, none past `reach`. */
const SKY_REACH: readonly {
  id: Exclude<IslandId, 'anchorage'>;
  x: number;
  z: number;
  reach: number;
  full: number;
}[] = [
  { id: 'meridian', x: MERIDIAN.center.x, z: MERIDIAN.center.z, reach: 900, full: 400 },
  // Wider than Meridian's: on the passage from Meridian the light turns toward dusk half way across.
  {
    id: 'thousand-bough',
    x: THOUSAND_BOUGH.center.x,
    z: THOUSAND_BOUGH.center.z,
    ...THOUSAND_BOUGH.skyReach,
  },
];

/**
 * The sky at sea: Anchorage's afternoon until you're well out, easing into each island's own light
 * as its waters come up (Meridian's golden hour, Thousand-Bough's dusk). Between two islands it blends
 * by how close each is (hours and azimuth written to `out`).
 */
export function passageSky(x: number, z: number, out: { hours: number; azimuth: number }): void {
  const a = ISLANDS.anchorage.sky;
  let sum = 0,
    most = 0,
    hours = 0,
    azimuth = 0;
  for (const r of SKY_REACH) {
    const t = Math.min(1, Math.max(0, (r.reach - Math.hypot(x - r.x, z - r.z)) / (r.reach - r.full)));
    const k = t * t * (3 - 2 * t);
    if (k <= 0) continue;
    const s = ISLANDS[r.id].sky;
    sum += k;
    most = Math.max(most, k);
    hours += s.hours * k;
    azimuth += s.azimuth * k;
  }
  if (sum <= 0) {
    out.hours = a.hours;
    out.azimuth = a.azimuth;
    return;
  }
  out.hours = a.hours + (hours / sum - a.hours) * most;
  out.azimuth = a.azimuth + (azimuth / sum - a.azimuth) * most;
}

/**
 * The air at sea: each island's mood eases in with its light (the same reach as `passageSky`), from
 * the identity mood (Anchorage, Meridian) at sea. Writes into `out` (no allocation).
 */
export function passageMood(
  x: number,
  z: number,
  out: { fogScale: number; hazeTint: [number, number, number] },
): void {
  let sum = 0,
    most = 0,
    fog = 0,
    r = 0,
    g = 0,
    b = 0;
  for (const reach of SKY_REACH) {
    const t = Math.min(
      1,
      Math.max(0, (reach.reach - Math.hypot(x - reach.x, z - reach.z)) / (reach.reach - reach.full)),
    );
    const k = t * t * (3 - 2 * t);
    if (k <= 0) continue;
    const m = ISLANDS[reach.id].mood;
    sum += k;
    most = Math.max(most, k);
    fog += (m?.fogScale ?? 1) * k;
    r += (m?.hazeTint[0] ?? 1) * k;
    g += (m?.hazeTint[1] ?? 1) * k;
    b += (m?.hazeTint[2] ?? 1) * k;
  }
  const mix = (v: number) => (sum > 0 ? 1 + (v / sum - 1) * most : 1);
  out.fogScale = mix(fog);
  out.hazeTint[0] = mix(r);
  out.hazeTint[1] = mix(g);
  out.hazeTint[2] = mix(b);
}

/** The island whose waters (x, z) are in, falling back to Anchorage for the open sea. */
export function islandAt(x: number, z: number): IslandId {
  if (ISLANDS.meridian.contains(x, z)) return 'meridian';
  return ISLANDS['thousand-bough'].contains(x, z) ? 'thousand-bough' : 'anchorage';
}

/** The islands you can dock at right now. */
export function openIslands(): IslandBerth[] {
  const open = [ISLANDS.anchorage];
  if (meridianOpen()) open.push(ISLANDS.meridian);
  if (thousandBoughOpen()) open.push(ISLANDS['thousand-bough']);
  return open;
}
