import type { StarfishSpot } from '../starfish/spots';

/**
 * Port Meridian's starfish, written as numbers (its layout module pulls in the rock meshes, which the
 * Logbook mustn't load): the plaza, the shipyard slip, the mole by the harbour light, the top of the
 * east stair street, and the citadel (MERIDIAN.pads.citadel, 40 m up, by the lift).
 */
export const MERIDIAN_STARFISH: readonly StarfishSpot[] = [
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
