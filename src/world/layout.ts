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
   */
  mooring: { x: -102.2, z: -112.5, heading: Math.PI },
  /** Two small moored boats in the basin. */
  boats: [
    { x: -135, z: -118, heading: 0.4 },
    { x: -80, z: -132, heading: -0.9 },
  ],

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
