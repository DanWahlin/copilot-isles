import type { StarfishSpot } from '../../starfish/spots';
import { COVE } from '../../layout';
import { LIGHTHOUSE, WATCH_DOOR_HEADING, lighthouseLevels } from './lighthouse-stair';

const lh = COVE.lighthouse;
// On the gallery, half way round from the watch-room door, so you walk round the top to find it.
const galleryA = WATCH_DOOR_HEADING + Math.PI;
const galleryR = (LIGHTHOUSE.watchR + LIGHTHOUSE.railR) * 0.5;

/** Anchorage Cay's starfish. */
export const ANCHORAGE_STARFISH: readonly StarfishSpot[] = [
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
];
