import { MERIDIAN } from '../world/islands/meridian';
import { MERIDIAN_STARFISH } from '../world/islands/meridian-starfish';
import { arrivalCard, type IslandArrival } from './arrival';
import type { IslandEntry } from './types';

const M = MERIDIAN;

/**
 * Port Meridian: in from the south-west over open water, past the lighthouse and into the walled
 * basin, over your ship on the east arm, up across the town to the citadel for the view over the
 * bay, and round and down to the captain on the arm.
 */
export const MERIDIAN_ARRIVAL: IslandArrival = {
  id: 'meridian',
  card: arrivalCard('meridian', 'Port Meridian'),
  label: 'arrival:meridian',
  keys: [
    // A slow glide in over the wide view while the title card's up, then on past the lighthouse.
    { x: 550, y: 8, z: -500, tx: M.mole.lighthouse.x, ty: 9, tz: M.mole.lighthouse.z, pace: 0.45 },
    { x: 674, y: 14, z: -590, tx: M.harbor.berth.x, ty: 5, tz: M.harbor.berth.z, pace: 1.15 },
    { x: 746, y: 24, z: -668, tx: M.harbor.berth.x, ty: 4, tz: M.harbor.berth.z, pace: 0.7 },
    { x: 704, y: 34, z: -724, tx: 668, ty: 9, tz: -796, pace: 0.8 },
    { x: 615, y: 58, z: -680, tx: 720, ty: 22, tz: -842, pace: 0.85 },
    {
      x: 848,
      y: 70,
      z: -720,
      tx: M.pads.citadel.x,
      ty: M.pads.citadel.height + 2,
      tz: M.pads.citadel.z,
      pace: 1,
    },
    { x: 835, y: 52, z: -742, tx: 690, ty: 8, tz: -700, pace: 0.9 },
    { x: 790, y: 34, z: -718, tx: M.harbor.landing.x, ty: 4, tz: M.harbor.landing.z, pace: 0.75 },
  ],
  seconds: 19,
  // The chart label comes up over the wide opening (the whole harbour, the town and the citadel
  // behind) and, in its corner, stays to be read while the camera drops past the lighthouse.
  cardAt: 0.6,
  cardFor: 6.4,
};

/**
 * Port Meridian (Chapter 01), streamed in when something needs it and freed once you've left
 * (world/islands/meridian-stream.ts). Its north-east cliffs are ~700 m off Thousand-Bough's mooring
 * (1 005 by `footprintDistance`): `unload` stays under that, so it's freed while you're there.
 */
export const MERIDIAN_ISLAND: IslandEntry = {
  id: 'meridian',
  name: 'Port Meridian',
  flag: 'meridian',
  berthLabel: 'Port Meridian',
  dockLabel: 'Dock at Port Meridian',
  mooring: MERIDIAN.harbor.berth,
  // Up the harbour toward the plaza: the terraces, the clock tower and the citadel in one frame.
  landingHeading: -2.81,
  quay: MERIDIAN.harbor.landing,
  music: 'meridian',
  // Golden hour, the sun low in the south-west: it lights the town's face across the harbour.
  sky: { hours: 17.35, azimuth: -45 },
  arrival: MERIDIAN_ARRIVAL,
  contains: (x, z) =>
    x >= MERIDIAN.bounds.minX &&
    x <= MERIDIAN.bounds.maxX &&
    z >= MERIDIAN.bounds.minZ &&
    z <= MERIDIAN.bounds.maxZ,
  center: MERIDIAN.center,
  skyReach: { reach: 900, full: 400 },
  // Open in a course that teaches a chapter there: in the dev build and with `?meridian` while
  // it's being built.
  open: {},
  ranges: { load: 880, show: 760, unload: 950, detail: 620 },
  // `measureFootprint(meridianHeight, …)`, 32 bearings; a test keeps it in step. The swap is as far
  // off its north-east cliffs as off its town.
  footprint: {
    x: MERIDIAN.center.x,
    z: MERIDIAN.center.z,
    radii: [
      340, 328, 300, 280, 248, 236, 224, 212, 200, 192, 212, 288, 292, 304, 292, 320, 336, 332, 316, 280, 252,
      232, 236, 232, 268, 312, 328, 380, 440, 496, 496, 352,
    ],
  },
  starfish: MERIDIAN_STARFISH,
  courseBoard: {
    where:
      'Against the harbour wall at the back of the quay, between two palms, facing the water. You pass it walking from the east arm to the stair street, well clear of the plaza.',
    x: 723,
    y: 2.4,
    z: -768.6,
    rot: 0,
  },
  chartLabelDy: 98,
  stream: {
    // A course that doesn't use it leaves its silhouette: coming near doesn't stream it in.
    nearLoads: 'in-course',
    reflected: true,
    courseData: 'chapter-part',
  },
  code: () => import('../game/meridian-island').then((m) => m.MERIDIAN_CODE),
};
