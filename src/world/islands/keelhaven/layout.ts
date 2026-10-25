/**
 * Keelhaven (island 03, course Chapter 03): every number of the island's layout, as plain data. No
 * three.js here: tests, tools and the bake may import it.
 *
 * The island has the look of the Na Pali coast. A long west coast (the side a ship from
 * Thousand-Bough sees) is a row of steep spurs: each spur's prow climbs from a dark sea cliff to a
 * front crest of 120-180 m, then runs back as a knife ridge to the spine (250-285 m). Hanging V
 * valleys lie between the spurs. The cove is one notch in the north half of the west coast: a valley
 * with a beach, a flat town shelf and an amphitheatre head at the spine. A reef lies off each of the
 * cove's headlands, and a sea stack off the south-west headland.
 *
 * Conventions: metres; x east, z south, y up; sea level y 0. Two frames:
 * - the coast: `s` the distance along the coast (round the whole island), `d` the distance inland;
 * - the cove (`FRAME`): `u` inland along the cove's axis (bearing 125°, east-south-east), `v` across it
 *   (bearing 215°, so v > 0 is the south side). Its origin is the middle of the beach.
 */

/** A point in the cove frame (see the file comment). */
export interface Uv {
  readonly u: number;
  readonly v: number;
}

const DEG = Math.PI / 180;
const AXIS_BEARING = 125;

/** The island's middle. */
const CENTER = { x: 4000, z: -1650 } as const;
/** The cove's mouth on the west coast (world), and the beach's middle 230 m inland along the axis. */
const MOUTH = { x: 3618, z: -1965 } as const;
const BEACH_IN = 230;

/** The cove frame's origin (the middle of the beach) and its two axes (unit vectors in x, z). */
export const FRAME = {
  origin: {
    x: MOUTH.x + BEACH_IN * Math.sin(AXIS_BEARING * DEG),
    z: MOUTH.z - BEACH_IN * Math.cos(AXIS_BEARING * DEG),
  },
  axis: { x: Math.sin(AXIS_BEARING * DEG), z: -Math.cos(AXIS_BEARING * DEG) },
  across: { x: Math.sin((AXIS_BEARING + 90) * DEG), z: -Math.cos((AXIS_BEARING + 90) * DEG) },
} as const;

/** World (x, z) to the cove frame (u, v), written into `out`. */
export function toFrame(x: number, z: number, out: { u: number; v: number }): { u: number; v: number } {
  const dx = x - FRAME.origin.x;
  const dz = z - FRAME.origin.z;
  out.u = dx * FRAME.axis.x + dz * FRAME.axis.z;
  out.v = dx * FRAME.across.x + dz * FRAME.across.z;
  return out;
}

/** The cove frame (u, v) to world (x, z). */
export function toWorld(u: number, v: number): { x: number; z: number } {
  return {
    x: FRAME.origin.x + u * FRAME.axis.x + v * FRAME.across.x,
    z: FRAME.origin.z + u * FRAME.axis.z + v * FRAME.across.z,
  };
}

/** One part of the cove valley's floor: from `u` inland, the floor's height and the valley's half-width. */
export interface ValleyStation {
  readonly u: number;
  readonly floor: number;
  readonly halfWidth: number;
}

export const KEELHAVEN = {
  /** The island's middle (for distances and the chart). */
  center: CENTER,
  /** Baked height data; the ground falls to the deep floor (−58) at every edge. */
  bounds: { minX: 3300, maxX: 4640, minZ: -2540, maxZ: -760, cell: 2 },
  deepDepth: 58,
  seabedRadius: 1100,

  /**
   * The coast: an oval (half-width `halfX` east-west, half-length `halfZ` north-south; `power` > 2
   * makes the sides longer and straighter) whose edge wanders `noise` m over about `noiseScale` m
   * (two scales: points and bays, and a ragged edge), pushed out at the headlands and in at the bays
   * (each a bump of `radius` m round its point, world x, z). A bay's valley reaches the sea low
   * (`lip`): a small cove under the cliffs.
   */
  coast: {
    halfX: 385,
    halfZ: 650,
    power: 2.6,
    points: 128,
    noise: 34,
    noiseScale: 150,
    ragged: 9,
    headlands: [
      { x: 3640, z: -1150, radius: 150, out: 70 },
      { x: 3600, z: -1480, radius: 70, out: 40 },
      { x: 3900, z: -2300, radius: 110, out: 55 },
      { x: 4330, z: -2060, radius: 90, out: 60 },
      { x: 4430, z: -1580, radius: 80, out: 50 },
      { x: 4310, z: -1110, radius: 110, out: 75 },
      { x: 4010, z: -990, radius: 70, out: 40 },
    ],
    bays: [
      { x: 3610, z: -1330, radius: 60, in: 55, lip: 5 },
      { x: 4170, z: -2250, radius: 70, in: 60, lip: 4 },
      { x: 4400, z: -1830, radius: 85, in: 80, lip: 3 },
      { x: 4410, z: -1340, radius: 65, in: 55, lip: 6 },
      { x: 3820, z: -1010, radius: 75, in: 60, lip: 4 },
    ],
  },
  /** How far the coast line wanders from the outline at its finest (m), and over what length (m). */
  coastNoise: { amplitude: 6, scale: 45 },

  /**
   * The sea cliff: how steep its face is (rise/run), up to the spur's prow or the valley's lip, but no
   * higher than `top` (± `topVary`) m: above that a high prow climbs at `above` (rise/run).
   */
  seaCliff: { steepness: 3.4, top: 40, topVary: 24, above: 1.6 },

  /**
   * The spurs: one every 150-240 m along the coast. A spur's prow climbs from the sea cliff (its top at
   * `prowFoot` m) at `prowSlope` (rise/run) to its front crest (`front`), then its crest runs back to
   * the spine (`spine`, `spineAt` m inland). Its flanks fall at `flankSlope` (rise/run) to the valleys between the spurs,
   * whose floors climb from a hanging lip (`lip`) to `headBelow` m under the spine.
   */
  spurs: {
    spacing: [130, 210] as const,
    lean: 0.18,
    prowFoot: [16, 34] as const,
    prowSlope: [1.5, 1.9] as const,
    front: [120, 180] as const,
    frontAt: [70, 110] as const,
    spine: { base: 268, vary: 30, scale: 300 },
    /** Peaks and saddles on the spine: a raise (or a drop) of `rise` m within `radius` m of a point. */
    peaks: [
      { x: 4030, z: -1760, radius: 120, rise: 26 },
      { x: 3990, z: -1330, radius: 110, rise: 20 },
      { x: 4060, z: -2080, radius: 100, rise: 10 },
      { x: 4000, z: -1540, radius: 90, rise: -34 },
      { x: 4020, z: -1150, radius: 110, rise: -46 },
    ],
    /** How far inland (m) a spur's crest reaches the spine. */
    spineAt: 330,
    flankSlope: [1.0, 1.4] as const,
    lip: [14, 34] as const,
    headBelow: 70,
    /** Saw-tooth crests: teeth `teeth` m apart along a crest, up to `toothHeight` m tall. */
    teeth: 46,
    toothHeight: 18,
  },
  /**
   * Big flutes (geometry): ribs `spacing` m apart, `depth` m tall at the most, down every face along
   * its fall line, and a second set at half the spacing (`fine`, as a share of the depth).
   */
  flutes: { spacing: 52, depth: 15, fine: 0.35, warp: 0.35, valleySpacing: 50 },

  /**
   * The cove valley along u (v = 0 is its middle line): the cove's floor under the sea, the beach with
   * its berm, the town shelf, and the floor rising to the amphitheatre head at the spine. The walls
   * climb from the edge of the floor (`wallSlope`: rise/run far from the floor, with a fillet).
   */
  valley: {
    stations: [
      { u: -420, floor: -15, halfWidth: 120 },
      { u: -250, floor: -9, halfWidth: 112 },
      { u: -150, floor: -5.6, halfWidth: 106 },
      { u: -90, floor: -4.9, halfWidth: 100 },
      { u: -40, floor: -2.2, halfWidth: 96 },
      { u: 0, floor: 0.1, halfWidth: 94 },
      { u: 18, floor: 1.7, halfWidth: 94 },
      { u: 28, floor: 2.8, halfWidth: 95 },
      { u: 40, floor: 2.5, halfWidth: 95 },
      { u: 60, floor: 3.3, halfWidth: 94 },
      { u: 120, floor: 4.6, halfWidth: 88 },
      { u: 185, floor: 7.5, halfWidth: 92 },
      { u: 220, floor: 16, halfWidth: 108 },
      { u: 250, floor: 30, halfWidth: 116 },
      { u: 270, floor: 44, halfWidth: 112 },
    ] as readonly ValleyStation[],
    /** The beach curves back between the headlands: its ends lie this far seaward of its middle (m). */
    beachBend: 25,
    /** The valley's middle line wanders this far (m) from v = 0 inland of the town shelf. */
    meander: 14,
    /**
     * Inland of the town shelf the walls send side spurs into the valley (up to `spurReach` m from the
     * wall, `spurSpacing` m apart round the rim) and the floor rolls (`roll` m).
     */
    spurReach: 42,
    spurSpacing: 120,
    roll: 12,
    wallSlope: 2.0,
    /**
     * The fillet at the walls' foot (m): a short one at the beach (cliffs), toe slopes (talus aprons)
     * behind it, and at the head. A bench breaks each wall `bench.at` m out from the floor's edge.
     */
    wallFillet: 12,
    toeFillet: 36,
    headFillet: 30,
    bench: { at: 58, width: 16 },
  },

  /**
   * The town shelf: flat ground behind the beach's berm for the town and the shipyard (drydock, canal
   * locks). Cove frame u from the back of the berm to the shelf's end; half-width across the valley.
   */
  townShelf: { u0: 45, u1: 180, halfWidth: 62, minY: 2.3, maxY: 7.8 },

  /** The hanging valley just south of the cove: its lip stands this high over the sea (a fall later). */
  hanging: { u: -60, v: 300, lip: 62 },

  /** Reef flats off the cove's headlands (cove frame): their middle, radii (along, across) and the crest's depth. */
  reefs: [
    { u: -330, v: 175, along: 90, across: 50, crest: -0.6 },
    { u: -320, v: -170, along: 85, across: 48, crest: -0.7 },
  ],
  /** Sea stacks and rocks off the points: each one's foot's middle, radius and height (m). */
  seaStacks: [
    { x: 3540, z: -1120, radius: 16, height: 62 },
    { x: 4420, z: -1010, radius: 12, height: 38 },
    { x: 3880, z: -2410, radius: 9, height: 26 },
    { x: 4515, z: -1600, radius: 7, height: 12 },
    { x: 4505, z: -1625, radius: 5, height: 7 },
    { x: 3525, z: -1490, radius: 6, height: 9 },
    { x: 4400, z: -2130, radius: 8, height: 16 },
  ],

  /** Where the ship lies in the cove (cove frame), and the line it sails in on (from the open sea). */
  anchorage: { u: -110, v: -25 },
  entry: [
    { u: -560, v: 0 },
    { u: -300, v: 0 },
    { u: -110, v: -25 },
  ] as readonly Uv[],

  /**
   * Bright late morning: a high sun (52°) from the south-south-east, across the main (west) wall, so
   * its flutes show light and shade. Of 9:30, 9:45 and 10:00, 9:30 gave the most flute contrast
   * (measured: 17.9 %, 17.3 %, 16.7 % at 300 m; 9.2 %, 9.1 %, 9.0 % at 700 m).
   */
  sky: { hours: 9.5, azimuth: 60 },
  /**
   * The island's air: a little thicker than the open sea's (midday's haze is thin, 2.6e-5 per m). The
   * ranges behind ranges get their haze from the `paliWall` look (aerial perspective).
   */
  mood: { fogScale: 3, hazeTint: [0.9, 0.97, 1.0] as const, fill: 1, exposure: 1 },
  /**
   * The terrain's levels of detail: Lite and Low draw the whole island as one merged block from the sea
   * (up to this many triangles); coarse levels are prefiltered; a chunk that changes level eases to its
   * new shape over `morphFrames` frames.
   */
  terrain: { maxMergedTriangles: 34_000, prefilter: true, morphFrames: 24 },
} as const;
