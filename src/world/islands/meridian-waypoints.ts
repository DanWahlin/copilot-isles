import type { IslandWays } from './waypoints';

/**
 * Port Meridian's routes for the compass (src/game/wayfinding/): the east arm from the berth, the
 * quay round the harbour to the shipyard, the stair street up to the plaza and the tavern, and the
 * cliff lift (a ride) up to the citadel bluff. At sea: the coast round the island with the harbour
 * left open, the mole and the east arm walling it, and a lane in through the mouth to the berth.
 */
export const MERIDIAN_WAYS: IslandWays = {
  walk: {
    nodes: [
      { id: 'arm.s', x: 761, y: 2.4, z: -668 },
      { id: 'arm.gangway', x: 757, y: 2.4, z: -702 },
      { id: 'quay.corner', x: 760, y: 2.4, z: -760 },
      { id: 'lift.bottom', x: 766, y: 2.4, z: -764 },
      { id: 'quay.stair', x: 667, y: 2.4, z: -762 },
      { id: 'shipyard', x: 592, y: 2.4, z: -762 },
      { id: 'plaza', x: 667, y: 7, z: -790 },
      { id: 'plaza.w', x: 643, y: 7, z: -782 },
      { id: 'tavern.steps', x: 631, y: 7, z: -780.5 },
      { id: 'tavern', x: 624, y: 7, z: -784 },
      { id: 'lift.top', x: 801, y: 40.4, z: -781 },
      { id: 'bluff.w', x: 795, y: 40, z: -808 },
      { id: 'bluff.e', x: 816, y: 40, z: -799 },
    ],
    legs: [
      ['arm.s', 'arm.gangway'],
      ['arm.gangway', 'quay.corner'],
      ['quay.corner', 'lift.bottom'],
      ['quay.corner', 'quay.stair'],
      ['quay.stair', 'shipyard'],
      ['quay.stair', 'plaza'],
      ['plaza', 'plaza.w'],
      ['plaza.w', 'tavern.steps'],
      ['tavern.steps', 'tavern'],
      ['lift.bottom', 'lift.top', 'ride'],
      ['lift.top', 'bluff.w'],
      ['bluff.w', 'bluff.e'],
      ['bluff.e', 'lift.top'],
    ],
  },
  sea: {
    coasts: [
      [
        // The east arm's inner face, then out round its tip and east along the south shore.
        { x: 751, z: -756 },
        { x: 751, z: -652 },
        { x: 742, z: -640 },
        { x: 760, z: -628 },
        { x: 850, z: -578 },
        { x: 960, z: -572 },
        { x: 1080, z: -600 },
        { x: 1180, z: -680 },
        { x: 1232, z: -800 },
        { x: 1240, z: -950 },
        { x: 1312, z: -1045 },
        { x: 1300, z: -1160 },
        { x: 1180, z: -1225 },
        { x: 900, z: -1215 },
        { x: 780, z: -1190 },
        { x: 640, z: -1135 },
        { x: 520, z: -1052 },
        { x: 455, z: -905 },
        { x: 462, z: -800 },
        { x: 520, z: -748 },
        // Down the mole's outer face, round its tip, and back up its inner face into the harbour.
        { x: 575, z: -697 },
        { x: 690, z: -580 },
        { x: 715, z: -596 },
        { x: 698, z: -618 },
        { x: 608, z: -735 },
        { x: 604, z: -756 },
      ],
    ],
    lanes: [
      { x: 738, z: -684 },
      { x: 728, z: -628 },
      { x: 730, z: -575 },
    ],
  },
};
