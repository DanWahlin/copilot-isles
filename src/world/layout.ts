/**
 * Test Cove layout (Phase 0 spike island). Units are metres; +x east, +z south, +y up; sea level is y = 0.
 * Every system (terrain, ocean, ship, vegetation, village, life) places things from these constants,
 * so the zones described in docs/specs/PHASE-0-spike.md §2 line up.
 */
export const COVE = {
  /** Rough island extents (the terrain function shapes the actual coast). */
  island: { center: { x: 0, z: 0 }, halfX: 170, halfZ: 115 },

  /** South: shallow turquoise lagoon inside a reef arc, with a sand beach on the island side. */
  lagoon: { center: { x: 10, z: 150 }, radius: 95, depth: 2.2 },
  reef: { center: { x: 10, z: 150 }, radius: 125, width: 12, crest: -0.4 },
  beach: { z0: 85, z1: 110 },

  /** East: fluted limestone headland (~35 m cliffs) rising to a ridge, with a sea cave at its base. */
  headland: { x0: 110, x1: 205, z0: -70, z1: 55, cliffTop: 35, ridge: 46 },
  seaCave: { x: 198, z: -5, width: 7, height: 5 },

  /** North-west: calm, dredged harbor basin with a stone quay (south edge) and a wooden pier. */
  harbor: { center: { x: -110, z: -115 }, radius: 55, depth: 6 },
  quay: { x0: -150, x1: -70, z: -72, height: 2.4 },
  pier: { x: -108, z0: -72, z1: -122, width: 4, deck: 1.8 },
  village: { center: { x: -115, z: -45 }, radius: 32, height: 3.2 },
  /**
   * Where the brigantine moors: alongside the pier's east face, bow north toward the harbor mouth,
   * clear of the boathouse (z −93…−100). At heading π the port rail (ship-local +x) faces the pier.
   * x keeps the widest hull ~0.15 m clear of the east fender piles and cross braces.
   */
  mooring: { x: -101.35, z: -112.5, heading: Math.PI },
  /** Juno (Q0.8) waits on the pier just north of the ship's Prompt Box and Terminal fittings. */
  firstMate: { x: -107.3, y: 1.8, z: -101.6, heading: 2.4 },
  /**
   * Nell waits at the pier head for the christening (Q0.11), facing back down the pier so you can
   * walk up to her. The bow stem is about 8 m off her port side, clear of the crane.
   */
  christening: { x: -107.0, y: 1.8, z: -116.6, heading: 0 },
  /**
   * Ezra's chart table (Q0.3) and Bo's gear rack (Q0.4) sit on the quay just west of the pier foot,
   * so Anchorage's setup runs Nell → Ezra → Bo → down the pier without doubling back.
   */
  chartTable: { x: -115.4, z: -67.6 },
  gearRack: { x: -119.6, z: -63.2, rot: -0.95 },
  /** Two small moored boats in the basin. */
  boats: [
    { x: -135, z: -118, heading: 0.4 },
    { x: -80, z: -132, heading: -0.9 },
  ],

  /**
   * Puzzle sites. P0.1's mill race sits on the low slope east of the lighthouse: the Actions spring
   * spouts from the foot of the hill to the south, a 3 × 4 grid of channel tiles (row 0 at the
   * spring) runs north, and the waterwheel turns in its tail pool by the shore. `x`, `z` is the grid
   * centre; keep x −71…−53, z −75…−51 clear of other props.
   */
  mill: { x: -61, z: -63, tile: 2.4, rows: 4, cols: 3 },
  /**
   * P0.2's dry-run crane slews on the pier head (`x`, `z` is its pivot). Berth 1 is your
   * brigantine at the mooring, Berth 2 another captain's sloop off the pier's west face, and
   * Berth 3 a guild sloop lying across the pier head (bow east). Its bow stops short of
   * x ≈ −106 so the brigantine sails straight out of her berth without scraping it.
   */
  crane: {
    x: -108,
    z: -120,
    sloops: [
      { berth: 2, x: -112.9, z: -118.8, heading: Math.PI },
      { berth: 3, x: -111.2, z: -126.0, heading: Math.PI / 2 },
    ],
  },

  /** Central hill. */
  hill: { center: { x: -10, z: -20 }, radius: 110, height: 24 },

  /** Player spawn on the quay, facing the basin. */
  spawn: { x: -110, z: -66, heading: Math.PI },

  /** Open-water sailing loop and landmarks. */
  sailLoop: { center: { x: 0, z: 0 }, radius: 430 },
  seaStack: { x: 270, z: 210, radius: 14, height: 32 },
  buoys: [
    { x: -60, z: -190 },
    { x: 120, z: -260 },
    { x: 330, z: -40 },
    { x: 300, z: 300 },
    { x: -250, z: 260 },
  ],

  /** Far-field seabed extent (beyond it the ocean is "deep"). */
  seabedRadius: 700,
  deepDepth: 40,
} as const;
