import { KEELHAVEN_FLORA_PALETTE } from '../world/islands/keelhaven/flora-palette';
import { KEELHAVEN_HARBOR as H } from '../world/islands/keelhaven/harbor';
import { KEELHAVEN, toWorld } from '../world/islands/keelhaven/layout';
import { KEELHAVEN_STARFISH } from '../world/islands/keelhaven/starfish';
import { keelhavenTerrainRegions } from '../world/islands/keelhaven/terrain-regions';
import { arrivalCard, type IslandArrival } from './arrival';
import type { IslandEntry } from './types';

const K = KEELHAVEN;

/** A flyover key in the cove frame: the camera at (u, y, v), looking at (tu, ty, tv). */
function key(u: number, y: number, v: number, tu: number, ty: number, tv: number, pace: number) {
  const p = toWorld(u, v);
  const t = toWorld(tu, tv);
  return { x: p.x, y, z: p.z, tx: t.x, ty, tz: t.z, pace };
}

/** The heading of the cove frame's direction (du, dv) (a heading h faces (sin h, cos h)). */
function headingOf(du: number, dv: number): number {
  const o = toWorld(0, 0);
  const p = toWorld(du, dv);
  return Math.atan2(p.x - o.x, p.z - o.z);
}

/**
 * Keelhaven (spec §10.6, in the as-built cove frame): in low from the open sea toward the cove's
 * mouth with the fluted walls either side, over the ship at the Old Town quay, up the town's street to
 * the Evidence Board's square, across the river to the shipyard's basin and docks, up the valley to
 * Ribbon Falls under the head wall, round to the Gate Light on the North Head, and down to the captain
 * on the quay.
 */
export const KEELHAVEN_ARRIVAL: IslandArrival = {
  id: 'keelhaven',
  card: arrivalCard('keelhaven', 'Keelhaven'),
  label: 'arrival:keelhaven',
  keys: [
    // A slow glide in toward the mouth while the card's up: the walls, the Gate Light and the cove.
    key(-900, 14, 30, 120, 60, 0, 0.45),
    key(-430, 18, 40, -66, 6, 51, 1.1),
    key(-150, 22, 60, 60, 8, 50, 0.8),
    key(-20, 26, 72, 112, 6, 25, 0.75),
    key(80, 34, 40, 120, 6, -60, 0.8),
    key(150, 60, -10, 380, 90, 15, 0.85),
    // Round over the shipyard to the North Head (a look across the yard, so the turn stays level).
    key(150, 62, -40, 40, 4, -70, 0.8),
    key(120, 64, -70, -231, 48, -157, 0.85),
    key(-30, 34, 20, -62, 3, 59, 0.75),
  ],
  landingShot: H.landingShot,
  seconds: 32,
  cardAt: 0.6,
  // The chart label unrolls (1.1 s) and has more to read than a title: long enough to read it twice.
  cardFor: 6.4,
};

/**
 * Keelhaven (Chapter 03), streamed in like Thousand-Bough when something needs it
 * (world/islands/keelhaven/stream.ts). It opens once the captain holds Thousand-Bough's Seal.
 */
export const KEELHAVEN_ISLAND: IslandEntry = {
  id: 'keelhaven',
  name: 'Keelhaven',
  flag: 'keelhaven',
  berthLabel: 'Keelhaven',
  dockLabel: 'Dock at the Old Town quay',
  mooring: H.berth,
  // Up the quay to the tavern and the town's street.
  landingHeading: H.landing.heading,
  quay: H.landing,
  music: 'keelhaven',
  // Bright late morning (spec §2.4, O4): the sun 52° up, across the fluted west walls.
  sky: K.sky,
  mood: { fogScale: K.mood.fogScale, hazeTint: K.mood.hazeTint },
  // Thousand-Bough's dusk holds on the passage, then a "next morning" cut (spec O3).
  nextMorningAfter: 'thousand-bough',
  arrival: KEELHAVEN_ARRIVAL,
  contains: (x, z) => x >= K.bounds.minX && x <= K.bounds.maxX && z >= K.bounds.minZ && z <= K.bounds.maxZ,
  center: K.center,
  skyReach: { reach: 1300, full: 800 },
  // Open in a course that teaches a chapter there: in the dev build, with `?keelhaven`, or once the
  // captain holds the Seal of Thousand-Bough (Chapter 02 done).
  open: { after: { island: 'thousand-bough', condition: 'sealed' } },
  // Its mean radius is ~520 m (Thousand-Bough's ~320): the same distances off its shore. `unload`
  // stays under the ~2 200 m to Thousand-Bough's berth, so it's freed while you're there.
  ranges: { load: 1300, show: 1100, unload: 1550, detail: 760 },
  // `measureFootprint(keelhavenHeightDry, …, 32, 900)`; a test keeps it in step.
  footprint: {
    x: K.center.x,
    z: K.center.z,
    radii: [
      404, 428, 416, 420, 488, 776, 660, 644, 688, 596, 620, 608, 484, 436, 452, 420, 400, 416, 404, 264, 260,
      552, 624, 712, 676, 628, 620, 592, 544, 416, 336, 376,
    ],
  },
  starfish: KEELHAVEN_STARFISH,
  courseBoard: {
    where:
      "On the sand at the Old Town quay's root, facing back along the quay: you walk toward it as you come ashore.",
    ...toWorld(9, 52),
    // The sand there (keelhavenHeight), not a deck: the quay's mole stands over the water.
    y: 1.56,
    rot: headingOf(-1, 0),
  },
  chartLabelDy: 96,
  chart: {
    cx: K.center.x,
    cz: K.center.z,
    // Smaller than true to its neighbours (it's the biggest island yet), with a chart cell as fine as theirs.
    ...K.chart,
    // A coarse pack for the chart only: the full pack (1.6 MiB) loads when the island streams in.
    pack: 'keelhaven/chart',
    terrain: () => import('../world/islands/keelhaven/chart').then((m) => m.KEELHAVEN_CHART_TERRAIN),
  },
  // "Salty Sway", made for the game by Dan with Suno: maritime folk.
  theme: { file: 'music_salty_sway', lufs: -15.3 },
  terrainRegions: keelhavenTerrainRegions,
  floraPalette: KEELHAVEN_FLORA_PALETTE,
  puzzles: { 'drydock-ring': 'circuit', 'lock-flight': 'circuit', retake: 'ceremony' },
  market: { keeper: { npc: 'bram', name: 'Bram' }, lines: 'keepers' },
  stream: {
    nearLoads: 'always',
    courseData: 'chapter-part',
    // Its own ocean floor tile: its reefs and the cove's shallows are outside the home tile.
    depthTile: true,
    // The harbour mirror only draws round Anchorage's harbour.
    reflected: false,
  },
  code: () => import('../game/keelhaven-island').then((m) => m.KEELHAVEN_CODE),
};
