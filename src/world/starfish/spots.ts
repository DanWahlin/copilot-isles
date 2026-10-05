import { COVE } from '../layout';
import { LIGHTHOUSE, WATCH_DOOR_HEADING, lighthouseLevels } from '../village/lighthouse-stair';

/** The islands that hide starfish (the same ids as src/game/islands.ts). */
export type StarfishIsland = 'anchorage' | 'meridian';

/**
 * A starfish to find (Dan: "like Mario's stars"): where it lies and a short, friendly name the
 * Logbook lists (a hint until you've found it). `y` picks the level where walk surfaces stack (the
 * lighthouse gallery over its knoll); it rests on whatever is walkable there.
 */
export interface StarfishSpot {
  id: string;
  island: StarfishIsland;
  name: string;
  x: number;
  z: number;
  y?: number;
}

const lh = COVE.lighthouse;
// On the gallery, half way round from the watch-room door, so you walk round the top to find it.
const galleryA = WATCH_DOOR_HEADING + Math.PI;
const galleryR = (LIGHTHOUSE.watchR + LIGHTHOUSE.railR) * 0.5;

/**
 * Every starfish. Port Meridian's are written as numbers (its layout module pulls in the rock meshes,
 * which the Logbook mustn't load): the plaza, the shipyard slip, the mole by the harbour light, the
 * top of the east stair street, and the citadel (MERIDIAN.pads.citadel, 40 m up, by the lift).
 */
export const STARFISH: readonly StarfishSpot[] = [
  {
    id: 'sf.a.lighthouse',
    island: 'anchorage',
    name: 'Atop the point lighthouse',
    x: lh.x + Math.sin(galleryA) * galleryR,
    z: lh.z + Math.cos(galleryA) * galleryR,
    y: lighthouseLevels().deck,
  },
  { id: 'sf.a.pier', island: 'anchorage', name: 'At the end of the pier', x: -107.2, z: -121.4 },
  { id: 'sf.a.boathouse', island: 'anchorage', name: 'Inside the boathouse', x: -105.1, z: -97.4 },
  { id: 'sf.a.garden', island: 'anchorage', name: 'Behind the lime cottage', x: -140, z: -27 },
  { id: 'sf.a.hill', island: 'anchorage', name: 'On the hilltop', x: -10, z: -20 },
  { id: 'sf.a.camp', island: 'anchorage', name: "By the bard's camp", x: -24, z: 88 },
  { id: 'sf.a.headland', island: 'anchorage', name: 'Up on the east headland', x: 150, z: 0 },
  { id: 'sf.m.plaza', island: 'meridian', name: 'In the town plaza', x: 650, z: -805 },
  { id: 'sf.m.shipyard', island: 'meridian', name: 'In the shipyard', x: 589, z: -755 },
  { id: 'sf.m.mole', island: 'meridian', name: 'By the harbour light', x: 684, z: -626 },
  {
    id: 'sf.m.stairs',
    island: 'meridian',
    name: "At the top of the town's stairs",
    x: 739,
    z: -947.6,
    y: 28.6,
  },
  { id: 'sf.m.citadel', island: 'meridian', name: 'Up on the citadel', x: 816, z: -786, y: 40 },
];

/** The starfish on an island. */
export function starfishOn(island: StarfishIsland): StarfishSpot[] {
  return STARFISH.filter((s) => s.island === island);
}

/** How many of an island's starfish are in `found`. */
export function starfishCount(
  island: StarfishIsland,
  found: readonly string[],
): { found: number; total: number } {
  const all = starfishOn(island);
  return { found: all.filter((s) => found.includes(s.id)).length, total: all.length };
}

/** Doubloons for each starfish, and for finding every one on an island. */
export const STARFISH_REWARD = 5;
export const STARFISH_SET_REWARD = 20;
