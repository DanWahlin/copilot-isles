import { ANCHORAGE_FLORA_PALETTE } from '../world/islands/anchorage/flora-palette';
import { ANCHORAGE_STARFISH } from '../world/islands/anchorage/starfish';
import { anchorageTerrainRegions } from '../world/islands/anchorage/terrain-regions';
import { COVE } from '../world/layout';
import { arrivalCard, type IslandArrival } from './arrival';
import type { IslandEntry } from './types';

/**
 * Anchorage Cay: in from the north over open water and past the brigantine, then a slow circle round
 * the harbour (the lighthouse, the quay and the village with the palm hills behind), and down to the
 * captain on the quay.
 */
export const ANCHORAGE_ARRIVAL: IslandArrival = {
  id: 'anchorage',
  card: arrivalCard('anchorage', 'Anchorage Cay'),
  label: 'arrival:anchorage',
  keys: [
    { x: -15, y: 8, z: -400, tx: -95, ty: 10, tz: -105, pace: 1.3 },
    { x: -70, y: 17, z: -250, tx: -103, ty: 8, tz: -100, pace: 1.1 },
    { x: -90, y: 36, z: -155, tx: -106, ty: 5, tz: -85, pace: 0.7 },
    { x: -46, y: 30, z: -118, tx: -104, ty: 7, tz: -58, pace: 0.85 },
    { x: -34, y: 34, z: -52, tx: -118, ty: 6, tz: -62, pace: 0.9 },
    { x: -150, y: 34, z: -128, tx: -100, ty: 6, tz: -62, pace: 1 },
    { x: -138, y: 40, z: -24, tx: COVE.mooring.x, ty: 4, tz: COVE.mooring.z + 10, pace: 0.85 },
  ],
  seconds: 19,
  cardAt: 2.2,
  // The chart label has more to read than a title (docs/specs/LOWER-THIRDS.md).
  cardFor: 6.4,
  fromChart: {
    keys: [
      // Out of the chart's sea: low over the water north of the harbour, the ship ahead.
      { x: -48, y: 9, z: -330, tx: COVE.mooring.x, ty: 7, tz: COVE.mooring.z, pace: 1.2 },
      { x: -78, y: 18, z: -215, tx: COVE.mooring.x, ty: 6, tz: COVE.mooring.z, pace: 1 },
      // Over the ship's masts…
      { x: -112, y: 26, z: -150, tx: COVE.mooring.x, ty: 4, tz: COVE.mooring.z + 12, pace: 0.7 },
      // …and swinging out west of the quay, so the camera arcs round behind the captain (not over).
      { x: -152, y: 19, z: -96, tx: COVE.spawn.x, ty: 3, tz: COVE.spawn.z, pace: 0.8 },
    ],
    seconds: 12,
    cardAt: 1.2,
    cardFor: 6.4,
  },
};

/**
 * Anchorage Cay (Chapter 00), the home island: built with the world, so it doesn't stream. Once
 * you've left it, it goes dormant (world/islands/anchorage/stream.ts): its silhouette stands in and
 * its parts' GPU copies are freed. It wakes within `load` and may go dormant past `unload`, measured
 * from its centre (`byCentre`); it draws as its silhouette past `show` (`footprintDistance`, from the
 * camera), dormant or not. From Port Meridian's quay it's 1 030 m off its centre: a silhouette there.
 */
export const ANCHORAGE: IslandEntry = {
  id: 'anchorage',
  name: 'Anchorage Cay',
  flag: 'anchorage',
  berthLabel: 'Anchorage pier',
  dockLabel: 'Dock at the pier',
  mooring: COVE.mooring,
  landingHeading: 0,
  quay: { ...COVE.spawn },
  music: 'anchorage',
  sky: { hours: 16.2, azimuth: 0 },
  arrival: ANCHORAGE_ARRIVAL,
  contains: (x, z) => Math.hypot(x, z) < 330,
  center: COVE.island.center,
  open: null,
  ranges: { load: 850, show: 760, unload: 1000, detail: 560, byCentre: true },
  // `measureFootprint(coveHeight, …)`, 32 bearings; a test keeps it in step.
  footprint: {
    x: 0,
    z: 0,
    radii: [
      212, 204, 180, 128, 148, 104, 92, 88, 84, 88, 92, 108, 132, 108, 112, 128, 144, 164, 164, 128, 100, 100,
      100, 100, 100, 100, 104, 112, 120, 144, 200, 216,
    ],
  },
  starfish: ANCHORAGE_STARFISH,
  courseBoard: {
    where:
      "East side of the street from the quay up to the village square, turned toward the pier foot, so it's in view as you come ashore.",
    x: -99.8,
    y: 2.48,
    z: -59.2,
    rot: -2.16,
  },
  chartLabelDy: 92,
  chart: {
    cx: 58,
    cz: 54,
    scale: 1 / 2200,
    minX: -190,
    maxX: 300,
    minZ: -135,
    maxZ: 240,
    cell: 5,
    pack: 'testcove/terrain',
    terrain: () => import('../world/islands/anchorage/chart').then((m) => m.ANCHORAGE_CHART_TERRAIN),
  },
  // "Medieval: The Bard's Tale" by RandomMind (OpenGameArt, CC0).
  theme: { file: 'music_bards_tale', lufs: -17.6 },
  terrainRegions: anchorageTerrainRegions,
  floraPalette: ANCHORAGE_FLORA_PALETTE,
  puzzles: {
    'gear-rack': 'checklist',
    palette: 'ceremony',
    bard: 'ceremony',
    christening: 'ceremony',
    sluice: 'route',
    crane: 'procedure',
    'first-words': 'choose-tool',
  },
  market: { keeper: { npc: 'desmond', name: 'Desmond' }, lines: 'keepers' },
  stream: null,
  code: () => import('../game/anchorage-island').then((m) => m.ANCHORAGE_CODE),
};
