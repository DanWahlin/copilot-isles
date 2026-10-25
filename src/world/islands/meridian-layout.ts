// Port Meridian's layout as plain data (no three.js and no terrain code), so the island registry
// (src/islands/meridian.ts) and the tools can read it without the island's world code.

/**
 * Port Meridian (Chapter 01), layout v2: a compact harbour town that faces south-west into the
 * evening sun. A walled basin opens south-east past the lighthouse. The quay promenade runs along its
 * north side with the plaza a step up behind it, the tavern and shipyard lie to the west, and your
 * ship berths on the east arm, bow out toward the mouth. A cliff lift climbs from the arm to the
 * citadel bluff, with the ridge rising behind. The walking loop runs berth → stair street → plaza
 * → tavern → shipyard → promenade → berth → lift, with no doubling back.
 */
export const MERIDIAN = {
  center: { x: 850, z: -850 },
  /**
   * The baked height data. It holds the whole island, the ridge's seaward feet too: the ground is
   * the deep sea floor at every edge (`EDGE_APRON`), so no open terrain edge shows from the sea.
   */
  bounds: { minX: 440, maxX: 1370, minZ: -1230, maxZ: -540, cell: 2 },
  island: { halfX: 350, halfZ: 225 },
  harbor: {
    center: { x: 668, z: -692 },
    radiusX: 96,
    radiusZ: 66,
    depth: 6.5,
    /** The north quay promenade; its face (the water's edge) runs along z1. */
    quay: { x0: 586, x1: 772, z0: -772, z1: -752, height: 2.4 },
    /** The east arm; its face (the water's edge) runs along x0. */
    eastArm: { x0: 752, x1: 774, z0: -772, z1: -650, height: 2.4 },
    /** Your ship alongside the east arm: port side to the quay, bow south toward the mouth. */
    berth: { x: 747.35, z: -700, heading: 0 },
    /** Where you step ashore beside the gangway, facing up the arm toward the town. */
    landing: { x: 755.2, z: -704, heading: Math.PI },
  },
  mole: {
    start: { x: 578, z: -708 },
    end: { x: 690, z: -620 },
    width: 9,
    height: 2.5,
    lighthouse: { x: 697, z: -614, height: 5.5, radius: 10 },
  },
  pads: {
    plaza: { x: 668, z: -796, height: 7, radius: 30 },
    tavern: { x: 622, z: -796, height: 7, radius: 11 },
    shipyard: { x: 586, z: -752, height: 2.4, radius: 11 },
    citadel: { x: 816, z: -786, height: 40, radius: 30 },
  },
  ridge: { center: { x: 1090, z: -1075 }, halfX: 185, halfZ: 82, height: 148 },
  /** House rows stepping up the hill behind the plaza. */
  terraces: [
    { ax: 586, az: -840, bx: 758, bz: -840, height: 10.8, width: 8 },
    { ax: 592, az: -862, bx: 780, bz: -862, height: 14.2, width: 8 },
    { ax: 604, az: -884, bx: 792, bz: -884, height: 17.8, width: 8 },
    { ax: 620, az: -906, bx: 804, bz: -906, height: 21.4, width: 8 },
    { ax: 650, az: -928, bx: 812, bz: -928, height: 25.0, width: 8 },
    { ax: 700, az: -948, bx: 812, bz: -948, height: 28.6, width: 7 },
  ],
  seaCaves: [
    { x: 1130, z: -930, radius: 18 },
    { x: 1186, z: -1010, radius: 22 },
  ],
  seabedRadius: 1050,
  deepDepth: 58,
} as const;
