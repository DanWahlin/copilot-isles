import { THOUSAND_BOUGH, insideThousandBough } from '../world/islands/thousand-bough/layout';
import { THOUSAND_BOUGH_STARFISH } from '../world/islands/thousand-bough/starfish';
import { arrivalCard, type IslandArrival } from './arrival';
import type { IslandEntry } from './types';

const TB = THOUSAND_BOUGH;

/**
 * Thousand-Bough Isle (spec §9.5): the whole island from the south-west with the banyan in the
 * ridge's saddle, into the cove mouth over the ship, up the Fern Walk, under the canopy, straight up
 * through the Sky Window above the mist, out over the east canopy toward Great Falls, and down to the
 * captain on the wharf.
 */
export const THOUSAND_BOUGH_ARRIVAL: IslandArrival = {
  id: 'thousand-bough',
  card: arrivalCard('thousand-bough', 'Thousand-Bough Isle'),
  label: 'arrival:thousand-bough',
  keys: [
    { x: 1700, y: 12, z: -1020, tx: TB.tree.x, ty: 48, tz: TB.tree.z, pace: 0.45 },
    { x: 1890, y: 16, z: -1215, tx: TB.harbor.berth.x, ty: 6, tz: TB.harbor.berth.z, pace: 1.1 },
    { x: 1925, y: 26, z: -1345, tx: TB.rootGate.x, ty: 18, tz: TB.rootGate.z, pace: 0.75 },
    { x: 2010, y: 24, z: -1536, tx: TB.tree.x, ty: 45, tz: TB.tree.z, pace: 0.7 },
    { x: 2010, y: 64, z: -1534, tx: TB.harbor.berth.x, ty: 6, tz: TB.harbor.berth.z, pace: 0.6 },
    { x: 2070, y: 58, z: -1500, tx: 2140, ty: 40, tz: -1640, pace: 0.8 },
    { x: 1975, y: 22, z: -1330, tx: TB.harbor.landing.x, ty: 4, tz: TB.harbor.landing.z, pace: 0.75 },
  ],
  landingShot: TB.harbor.landingShot,
  seconds: 28,
  cardAt: 0.6,
  // The chart label unrolls (1.1 s) and has more to read than a title: long enough to read it twice.
  cardFor: 6.4,
};

/**
 * Thousand-Bough Isle (Chapter 02), streamed in like Port Meridian when something needs it
 * (world/islands/thousand-bough/stream.ts).
 */
export const THOUSAND_BOUGH_ISLAND: IslandEntry = {
  id: 'thousand-bough',
  name: 'Thousand-Bough Isle',
  flag: 'thousandbough',
  berthLabel: 'Thousand-Bough Isle',
  dockLabel: 'Dock at the Root Wharf',
  mooring: TB.harbor.berth,
  // Up the Fern Walk to the great banyan: the wharf, the little sister tree and the trunk in one frame.
  landingHeading: TB.harbor.landing.heading,
  quay: TB.harbor.landing,
  music: 'thousand-bough',
  // Late golden hour going to dusk: the sun 6° up in the WNW (bearing 290°), side-lighting the decks
  // from the wharf while the valley sits in blue-green shade.
  sky: { hours: 17.77, azimuth: 13.5 },
  // The valley's mist: a thicker, cooler haze over the island.
  mood: TB.mood,
  arrival: THOUSAND_BOUGH_ARRIVAL,
  contains: insideThousandBough,
  center: TB.center,
  // Wider than Meridian's: on the passage from Meridian the light turns toward dusk half way across.
  skyReach: TB.skyReach,
  // Open in a course that teaches a chapter there: in the dev build, with `?thousandbough`, or once
  // the captain holds the Seal of Meridian (Chapter 01 done).
  open: { after: { island: 'meridian', condition: 'sealed' } },
  ranges: { load: 1100, show: 900, unload: 1350, detail: 640 },
  // Its outline (as Meridian's): its ranges go by `footprintDistance`.
  footprint: {
    x: TB.center.x,
    z: TB.center.z,
    radii: [
      320, 324, 336, 324, 320, 268, 260, 260, 256, 256, 252, 148, 308, 328, 332, 328, 336, 348, 352, 384, 400,
      368, 340, 324, 316, 312, 324, 348, 344, 332, 336, 344,
    ],
  },
  starfish: THOUSAND_BOUGH_STARFISH,
  courseBoard: {
    where:
      "Bough Landing's east side, north of Lani's market booth, facing back up the wharf: you see it as you walk ashore, before the Fern Walk.",
    x: 1955.6,
    y: 2.6,
    z: -1436.2,
    rot: -1.0,
  },
  chartLabelDy: -82,
  stream: {
    nearLoads: 'always',
    // The harbour mirror only draws round Anchorage's harbour, a long way from Thousand-Bough.
    reflected: false,
  },
  code: () => import('../game/thousand-bough-island').then((m) => m.THOUSAND_BOUGH_CODE),
};
