/**
 * Thousand-Bough Isle (Chapter 02 · Sessions, Worktrees & Context): every number of the island's
 * layout (docs/specs/ISLAND-02-thousand-bough.md §3), as plain data. No three.js here: the Logbook,
 * the quests and the tests may import it.
 *
 * Conventions: metres; x east, z south, y up; sea level y 0. A heading `h` faces (sin h, cos h).
 * A bearing `b` (degrees) is clockwise from north (−z): the point at bearing b and radius r from P is
 * (P.x + r·sin b, P.z − r·cos b). Tree-relative values use T = (2010, −1560).
 */

export interface Xz {
  readonly x: number;
  readonly z: number;
}

export interface Xyz extends Xz {
  readonly y: number;
}

/** An NPC stand, an interaction spot, or a camera spot. */
export interface TbAnchorSpec extends Xyz {
  readonly heading: number;
  /** Where the NPC looks (and the camera frames), when there's one. */
  readonly look?: Xyz;
}

const DEG = Math.PI / 180;

/** The great banyan's centre. */
export const TREE: Xz = { x: 2010, z: -1560 };

/** The point at bearing `b` (degrees) and radius `r` from `from` (the tree by default). */
export function atBearing(b: number, r: number, from: Xz = TREE): { x: number; z: number } {
  return { x: from.x + r * Math.sin(b * DEG), z: from.z - r * Math.cos(b * DEG) };
}

/** The bearing (degrees, [0, 360)) of (x, z) from `from` (the tree by default). */
export function bearingOf(x: number, z: number, from: Xz = TREE): number {
  const b = Math.atan2(x - from.x, -(z - from.z)) / DEG;
  return b < 0 ? b + 360 : b;
}

/** The heading (radians) that faces from (x0, z0) toward (x1, z1). */
export function headingTo(x0: number, z0: number, x1: number, z1: number): number {
  return Math.atan2(x1 - x0, z1 - z0);
}

/**
 * The Great Stair: one clockwise helix round the trunk, starting on the Root Hall deck at bearing 200
 * (y 18.5) and topping out at bearing 80 (y 50.5) after 960°. 12 m of rise per turn.
 */
export const HELIX = {
  rInner: 15.5,
  rOuter: 19.5,
  /** The walkway's centre line (the rails stand at the edges). */
  rMid: 17.5,
  startBearing: 200,
  startY: 18.5,
  risePerTurn: 12,
  /** The total turn angle (degrees) from the start to the top. */
  sweep: 960,
  topY: 50.5,
  /** Lanterns on the outer rail, one every this many metres of walk. */
  lanternEvery: 8,
} as const;

/** The stair's walk height at total turn angle θ (degrees from its start). */
export function helixY(theta: number): number {
  return HELIX.startY + (HELIX.risePerTurn * theta) / 360;
}

/** The stair's bearing (degrees, [0, 360)) at total turn angle θ. */
export function helixBearing(theta: number): number {
  const b = (HELIX.startBearing + theta) % 360;
  return b < 0 ? b + 360 : b;
}

/**
 * The stair's walk heights at bearing `b` (every pass of the helix there, lowest first), written to
 * `out` (refilled). Used by the clearance rules.
 */
export function helixPassesAt(b: number, out: number[] = []): number[] {
  out.length = 0;
  for (let theta = (((b - HELIX.startBearing) % 360) + 360) % 360; theta <= HELIX.sweep + 1e-6; theta += 360)
    out.push(helixY(theta));
  return out;
}

/** A deck on the tree (a stop's platform), in the tree's polar frame. */
export interface TreeDeckSpec {
  readonly id: 'L1E' | 'L2SW' | 'L2S' | 'L3SE';
  readonly name: string;
  readonly bearing: number;
  readonly r: number;
  readonly y: number;
  /** Radial depth and width across (m). */
  readonly radial: number;
  readonly across: number;
  /** The stair's turn angle where it meets the deck (null for a deck reached by bridge). */
  readonly theta: number | null;
}

const DECKS: readonly TreeDeckSpec[] = [
  {
    id: 'L1E',
    name: 'Three Landings',
    bearing: 90,
    r: 27,
    y: helixY(250),
    radial: 16,
    across: 14,
    theta: 250,
  },
  {
    id: 'L2SW',
    name: 'Signal Deck',
    bearing: 225,
    r: 26,
    y: helixY(385),
    radial: 12,
    across: 16,
    theta: 385,
  },
  { id: 'L2S', name: 'Practice Bough', bearing: 160, r: 32, y: 32.5, radial: 10, across: 12, theta: null },
  {
    id: 'L3SE',
    name: 'Chronicle Loft',
    bearing: 130,
    r: 26,
    y: helixY(650),
    radial: 12,
    across: 14,
    theta: 650,
  },
];

/** A crew's treehouse (seen, not entered). */
export interface CrewHouseSpec {
  readonly crew: 'feature' | 'bugfix' | 'docs';
  readonly sign: 'feature' | 'bug-fix' | 'docs';
  readonly bearing: number;
  readonly r: number;
  readonly floor: number;
  readonly color: string;
}

/** A rope or plank bridge between two walk surfaces. */
export interface BridgeSpec {
  readonly id: 'R1' | 'R2' | 'R3' | 'B0';
  readonly name: string;
  readonly from: Xyz;
  readonly to: Xyz;
  /** How far the walkway sags at mid-span (m). */
  readonly sag: number;
  /** Clear walkway width (m). */
  readonly width: number;
}

export interface PoolSpec extends Xz {
  readonly r: number;
  readonly level: number;
}

export interface FallSpec {
  readonly name: string;
  /** The lip (top) and the foot (where it lands). */
  readonly lip: Xyz;
  readonly foot: Xz;
  readonly width: number;
  readonly drop: number;
}

/** The island: every number of spec §3. */
export const THOUSAND_BOUGH = {
  center: { x: 2050, z: -1500 },
  /** Baked height data; the ground falls to the deep floor (−58) at every edge. */
  bounds: { minX: 1640, maxX: 2460, minZ: -1900, maxZ: -1100, cell: 2 },
  /** The coastline: an ellipse with noise, and the cove's bite to the south-west. */
  island: { halfX: 300, halfZ: 270, coastNoise: 12 },
  deepDepth: 58,
  seabedRadius: 1000,
  /** The island's air (spec §2.4): thicker, cooler haze, and the valley mist's top and colours. */
  mood: {
    fogScale: 1.8,
    hazeTint: [0.93, 0.97, 1.0] as const,
    /** The sky light's strength in the valley (shade under the canopy still reads) and the exposure. */
    fill: 3.2,
    exposure: 1.6,
    mistTop: 34,
    mistSun: 0xf2d9a6,
    mistShade: 0x9fb3c8,
  },
  /** How far its light and air reach over the sea: full within `full` m of its centre, none past `reach`. */
  skyReach: { reach: 1150, full: 700 },

  /** The horseshoe ridge (Mistcrown): control points with their crest heights. */
  ridge: [
    { x: 1835, z: -1705, y: 95 },
    { x: 2010, z: -1748, y: 58 },
    { x: 2200, z: -1695, y: 125 },
    { x: 2290, z: -1560, y: 80 },
    { x: 2280, z: -1400, y: 55 },
    { x: 2240, z: -1285, y: 28 },
  ] as readonly Xyz[],
  westSpur: [
    { x: 1835, z: -1705, y: 95 },
    { x: 1800, z: -1560, y: 60 },
    { x: 1790, z: -1420, y: 35 },
    { x: 1840, z: -1300, y: 18 },
  ] as readonly Xyz[],
  /** The valley floor: 6 at the cove shore, 14 at its high point; ≤ 12° where the player walks. */
  valley: { shore: 6, high: { x: 1990, z: -1500, y: 14 }, maxSlopeDeg: 12 },
  knoll: { x: TREE.x, z: TREE.z, height: 18.5, radius: 34, edge: 26 },
  flumeShelf: { x: 2008, z: -1622, radius: 18, edge: 12, height: 22, north: 23, south: 20 },
  pools: {
    upper: { x: 2010, z: -1665, r: 16, level: 23.5 },
    mirror: { x: 2135, z: -1612, r: 22, level: 15 },
    silver: { x: 1880, z: -1610, r: 12, level: 12 },
    /** The Booth Pools on Fernrun, downstream first. */
    booths: [
      { x: 1916, z: -1484, r: 4.5, level: 6.0 },
      { x: 1920, z: -1494, r: 4.5, level: 6.5 },
      { x: 1924, z: -1504, r: 4.0, level: 7.0 },
    ],
  },
  spire: { x: 2066, z: -1594, radius: 7, ground: 13, top: 27, ledge: { x: 2066, z: -1587, y: 24.5 } },
  cove: { x: 1905, z: -1360, rx: 75, rz: 90, floor: -6.5, mouthFloor: -8 },
  /** The cove's mouth, open to the south between West Point and its east horn. */
  coveMouth: { west: { x: 1840, z: -1300 }, east: { x: 1985, z: -1285 }, minWidth: 90, minDepth: 8 },
  eastBeach: { x: 2150, z: -1290 },
  cave: {
    mouth: { x: 2148, z: -1642 },
    width: 9,
    height: 7,
    depth: 10,
    floor: 19,
    ledgeWidth: 3,
    ledgeY: 17,
  },

  water: {
    falls: [
      {
        name: 'The Veil',
        lip: { x: 2010, y: 52, z: -1712 },
        foot: { x: 2010, z: -1672 },
        width: 14,
        drop: 28,
      },
      {
        name: 'Silver Thread',
        lip: { x: 1878, y: 60, z: -1650 },
        foot: { x: 1880, z: -1618 },
        width: 3,
        drop: 48,
      },
      {
        name: 'Great Falls',
        lip: { x: 2150, y: 70, z: -1652 },
        foot: { x: 2140, z: -1628 },
        width: 22,
        drop: 55,
      },
    ] as readonly FallSpec[],
    headerRace: { from: { x: 2010, z: -1650 }, to: { x: 2008, z: -1632 }, width: 2 },
    /** The flume outflows' wheels: bearings 330, 0, 30 at r 26 from the tree. */
    wheels: [
      { crew: 'feature', bearing: 330, r: 26 },
      { crew: 'bugfix', bearing: 0, r: 26 },
      { crew: 'docs', bearing: 30, r: 26 },
    ],
    wheelRace: { y: 17.5, to: { x: 1978, z: -1572 }, width: 1.5 },
    fernrun: [
      { x: 1978, z: -1572 },
      { x: 1958, z: -1540 },
      { x: 1948, z: -1515 },
      { x: 1924, z: -1504 },
      { x: 1920, z: -1494 },
      { x: 1916, z: -1484 },
      { x: 1895, z: -1460 },
      { x: 1872, z: -1420 },
    ] as readonly Xz[],
    fernrunHalfWidth: [1.6, 2.5],
    silverRun: { from: { x: 1880, z: -1610 }, to: { x: 1898, z: -1468 } },
    thunderRun: [
      { x: 2135, z: -1612 },
      { x: 2170, z: -1500 },
      { x: 2150, z: -1290 },
    ] as readonly Xz[],
    minFall: 0.02,
    wadingShelf: 2,
  },

  /** The ship's approach, berth and the wharf (§3.4). */
  harbor: {
    lane: [
      { x: 1500, z: -800 },
      { x: 1860, z: -1120 },
      { x: 1905, z: -1265 },
      { x: 1931.35, z: -1372 },
    ] as readonly Xz[],
    laneHalfWidth: 30,
    /** No rock or terrain above this inside the lane (m). */
    laneFloor: -6,
    turning: { x: 1905, z: -1360, r: 45, depth: 6 },
    /** The Root Wharf: timber on piles; its face (the water's edge) runs along x0. */
    jetty: { x0: 1936, x1: 1942, z0: -1428, z1: -1350, height: 2.2, fenderEvery: 6 },
    /** Your ship alongside: port side to the wharf, bow south toward the mouth. */
    berth: { x: 1931.35, z: -1372, heading: 0 },
    /** Where you step ashore, facing the tree. */
    landing: { x: 1939.2, z: -1376, heading: 2.77 },
    /**
     * The first look ashore: over the captain's shoulder up the cove to the great tree (the arrival
     * holds here before the follow camera; Juno's "no ordinary tree" plays on it).
     */
    landingShot: { x: 1937.6, y: 8.6, z: -1367.5, tx: 1990, ty: 37, tz: -1536 },
    /** The timber deck at the wharf's land end, with the boathouse. */
    boughLanding: { x: 1947, z: -1434, sx: 22, sz: 14, y: 2.6 },
  },
  /** The little sister tree at Bough Landing (the same generator, scale 0.18). */
  sister: { x: 1957, z: -1446.5, scale: 0.18, propRoots: 6, lanterns: 12 },

  /** The great banyan (§3.5). */
  tree: {
    x: TREE.x,
    z: TREE.z,
    deckY: 18.5,
    crownTop: 100,
    /** Trunk radius by height; the buttress flare reaches `buttressR` at the knoll rim. */
    trunk: [
      { y: 18.5, r: 9 },
      { y: 30, r: 8 },
      { y: 40, r: 7 },
      { y: 50, r: 6 },
      { y: 52, r: 5.6 },
    ] as readonly { y: number; r: number }[],
    buttressR: 14,
    fusedTrunks: 7,
    /**
     * The major limbs: bearing, the height where each crosses the stair band (so the stair clearance
     * rule holds), and reach. 135 and 340 differ from the spec's proposal (31 and 34): at those
     * heights they'd cross a stair pass below with under 4.5 m of headroom, or rise into the pass above.
     */
    limbs: [
      { bearing: 20, bandY: 32.5, reach: 52 },
      { bearing: 95, bandY: 35, reach: 50 },
      { bearing: 135, bandY: 34.5, reach: 48 },
      { bearing: 165, bandY: 37, reach: 56 },
      { bearing: 235, bandY: 27.5, reach: 50 },
      { bearing: 300, bandY: 30, reach: 54 },
      { bearing: 340, bandY: 31, reach: 46 },
    ] as readonly { bearing: number; bandY: number; reach: number }[],
    limbDiameter: { root: 3.5, tip: 1.5 },
    propRoots: { count: 36, rMin: 26, rMax: 55, dMin: 0.6, dMax: 1.5, pathClearance: 2.5 },
    canopy: {
      /** No leaves inside this radius below `openBelow` (the cathedral). */
      openR: 26,
      openBelow: 56,
      ring: { pads: 9, rMin: 30, rMax: 60, bottom: 36, topSeaWindow: 48, top: 56 },
      /** The Sea Window: bearings of the low south side. */
      seaWindow: [120, 260] as const,
      crown: { bearings: [20, 80] as const, rMin: 19, rMax: 45, bottom: 58, top: 100 },
      /** No leaf within this above / beside any walk surface. */
      clearAbove: 6,
      clearBeside: 4,
    },
    lanterns: 120,
    perches: 6,
  },

  helix: HELIX,
  /** The Root Hall: a ring deck round the trunk, with gaps for the buttress roots. */
  rootHall: { rInner: 9, rOuter: 24, y: 18.5, gateBearing: 220, hallArchBearing: 180, skyBasketBearing: 270 },
  decks: DECKS,
  /** The Crown Deck: a disc above the trunk's top; the stair tops out at bearing 80 via a 4 m landing. */
  crown: { x: 2010, z: -1556, r: 15, y: 50.5, beaconTop: 64, landing: 4 },
  /** The Flume Gallery: Fen's deck over the terrace, reached by the boardwalk from L1E. */
  gallery: { x: 2024, z: -1618, sx: 8, sz: 10, y: 26 },
  boardwalk: {
    points: [
      { x: 2037, z: -1567, y: helixY(250) },
      { x: 2040, z: -1595, y: 26.4 },
      { x: 2026, z: -1618, y: 26 },
    ] as readonly Xyz[],
    width: 3,
  },
  houses: [
    { crew: 'feature', sign: 'feature', bearing: 315, r: 31, floor: 31, color: '#3B82F6' },
    { crew: 'bugfix', sign: 'bug-fix', bearing: 350, r: 31, floor: 33, color: '#3FA34D' },
    { crew: 'docs', sign: 'docs', bearing: 30, r: 32, floor: 31, color: '#1EA7A7' },
  ] as readonly CrewHouseSpec[],
  /** The L1E scaffold on a fresh bough (the Lantern House after the Seal), signed "Base branch: main". */
  scaffold: { bearing: 110, r: 30, y: 30 },
  bridges: [
    {
      id: 'R1',
      name: 'Signal Bridge',
      from: { x: 1987, y: helixY(385), z: -1537 },
      to: { x: 2015, y: 32.5, z: -1527 },
      sag: 1.2,
      width: 2.4,
    },
    {
      id: 'R2',
      name: 'Spire Bridge (5173)',
      from: { x: 2045, y: helixY(250), z: -1563 },
      to: { x: 2064, y: 27, z: -1597 },
      sag: 1.8,
      width: 2.4,
    },
    {
      id: 'R3',
      name: 'Second Bridge (5174)',
      from: { x: 2045, y: helixY(250), z: -1556 },
      to: { x: 2066, y: 24.5, z: -1587 },
      sag: 1.5,
      width: 2.4,
    },
    {
      id: 'B0',
      name: 'Plank bridge',
      from: { x: 1954, y: 11.3, z: -1515.5 },
      to: { x: 1960, y: 11.7, z: -1520.5 },
      sag: 0.08,
      width: 3,
    },
  ] as readonly BridgeSpec[],
  /** The Sky Basket: L0 ↔ L4 at bearing 270, r 23. */
  skyBasket: { bearing: 270, r: 23, bottomY: 18.5, topY: 50.5 },
  /** The Cloud gondola: L1E's south-east corner to the Cloud Loft on Thunder Crown's shoulder. */
  gondola: {
    station: { x: 2043, y: 28, z: -1552 },
    loft: { x: 2165, y: 92, z: -1668 },
    period: 90,
  },
  /** The Fern Walk: wharf to the Root Hall, 3.5 m wide. */
  fernWalk: {
    width: 3.5,
    points: [
      { x: 1945, z: -1432, y: 2.6 },
      { x: 1948, z: -1458, y: 4.5 },
      { x: 1934, z: -1488, y: 7.5 },
      { x: 1950, z: -1510, y: 10.5 },
      { x: 1957, z: -1518, y: 11.5 },
      { x: 1980, z: -1532, y: 15 },
      { x: 1992, z: -1538, y: 17.6 },
      { x: 1994.3, z: -1541.3, y: 18.42 },
      { x: 1996, z: -1544, y: 18.5 },
    ] as readonly Xyz[],
    lanternEvery: 12,
  },
  /** Side paths (ground). */
  sidePaths: {
    mirror: [
      { x: 2032, z: -1566 },
      { x: 2060, z: -1572 },
      { x: 2090, z: -1590 },
      { x: 2116, z: -1600 },
    ] as readonly Xz[],
    /** The stone ledge behind Great Falls from the Mirror path's end to the cave (village FALLS_LEDGE). */
    caveLedge: [
      { x: 2114, z: -1606 },
      { x: 2121, z: -1621 },
      { x: 2128, z: -1634.5 },
      { x: 2138, z: -1640 },
      { x: 2145, z: -1641.4 },
    ] as readonly Xz[],
    westBeach: [
      { x: 1934, z: -1488 },
      { x: 1904, z: -1456 },
      { x: 1868, z: -1432 },
      { x: 1847, z: -1404 },
      { x: 1839.5, z: -1372 },
      { x: 1840, z: -1336 },
    ] as readonly Xz[],
  },
  rootGate: { x: 1992, z: -1538, y: 17.6 },

  /** NPC stands, interaction spots and cameras (§3.7). */
  anchors: {
    tamsin: { x: 1949.5, y: 2.6, z: -1436, heading: -0.17, look: { x: 1940, y: 3.5, z: -1376 } },
    lyra: { x: 1928.5, y: 7.3, z: -1493.5, heading: 0.79, look: { x: 1934, y: 8.6, z: -1488 } },
    saffi: { x: 2010, y: 18.5, z: -1545, heading: -1.36, look: { x: 1996, y: 19.7, z: -1544 } },
    oak: { x: 2040, y: helixY(250), z: -1556, heading: -2.29, look: { x: 2023, y: 28, z: -1571 } },
    fen: { x: 2024, y: 26, z: -1618, heading: -1.57, look: { x: 2008, y: 22, z: -1622 } },
    ines: { x: 1991.6, y: helixY(385), z: -1541.6, heading: 2.36, look: { x: 2001, y: 32.5, z: -1551 } },
    rook: { x: 2020.9, y: 32.5, z: -1529.9, heading: -1.57, look: { x: 2000, y: 33.5, z: -1533 } },
    pip: { x: 2029.9, y: helixY(650), z: -1543.3, heading: -2.27, look: { x: 2016, y: 41.4, z: -1555 } },
    elder: { x: 2010, y: 50.5, z: -1549.5, heading: 0, look: { x: 1931, y: 6, z: -1372 } },
    gateBoard: { x: 2022.5, y: 26, z: -1620, heading: -1.57, look: { x: 2008, y: 22.25, z: -1622 } },
    puzzleCam: { x: 2010, y: 36, z: -1596, heading: Math.PI, look: { x: 2008, y: 21, z: -1626 } },
    // Square on to the 5173 bridge, close enough that the two lanterns jamming at mid-span read,
    // with the whole span and both lookouts left of the puzzle panel.
    twistCam: {
      x: 2040,
      y: 31,
      z: -1598,
      heading: headingTo(2040, -1598, 2054, -1576),
      look: { x: 2054, y: 25.5, z: -1576 },
    },
    flagMast: { x: 1986, y: helixY(385), z: -1540, heading: 0 },
    skyBasketBottom: { x: 1987, y: 18.5, z: -1560, heading: Math.PI / 2 },
    skyBasketTop: { x: 1987, y: 50.5, z: -1560, heading: Math.PI / 2 },
    /** The lever by the L1E scaffold: on the deck's south edge, facing the scaffold. */
    lanternHouse: { x: 2037.5, y: helixY(250), z: -1554.5, heading: 0.5 },
    /** The gondola's bell rope by the station at L1E's south-east corner. */
    gondolaBell: { x: 2042.5, y: helixY(250), z: -1555, heading: 0.6 },
    /** Inside each reed booth at the Booth Pools (on its log floor over the pool's east edge). */
    boothA: { x: 1919.6, y: 6.3, z: -1485.4, heading: -2.0 },
    boothB: { x: 1923.6, y: 6.8, z: -1495.2, heading: -2.0 },
    boothC: { x: 1927.2, y: 7.3, z: -1505.0, heading: -2.0 },
    extraSwing: { x: 1940, y: 9.9, z: -1505, heading: 0 },
    // On the Root Hall's open south-east side (the west strip by the stair's wall is too narrow).
    extraWeaver: { x: 2023.8, y: 18.5, z: -1543.5, heading: -2.4 },
    // By the Sky Basket, out at the hall's rim (3 m clear of the stair's wall).
    extraLift: { x: 1987.7, y: 18.5, z: -1564.7, heading: 1.2 },
    extraFisher: { x: 1839.6, y: 1.2, z: -1344, heading: 1.6 },
    extraLook: { x: 2066.5, y: 27, z: -1597, heading: -0.5 },
  } satisfies Record<string, TbAnchorSpec>,

  /** Collectibles (§3.8). */
  starfish: [
    { id: 'sf.t.landing', name: 'On the Root Wharf', x: 1947, z: -1428, y: 2.6 },
    { id: 'sf.t.booths', name: 'By the Booth Pools', x: 1918, z: -1499, y: 7.3 },
    { id: 'sf.t.roothall', name: 'Among the roots', x: 1990.6, z: -1571.2, y: 18.5 },
    { id: 'sf.t.signal', name: 'Up on the Signal Deck', x: 1988.4, z: -1538.4, y: helixY(385) },
    { id: 'sf.t.crown', name: 'At the top of the tree', x: 2010, z: -1567, y: 50.5 },
  ],
  chests: [
    { id: 'C2.1', page: 'pg2.booths', doubloons: 10, x: 1928.6, z: -1501, y: 7.3 },
    { id: 'C2.2', page: 'pg2.more-commands', doubloons: 15, x: 2150, z: -1646, y: 19 },
  ],
  bottles: [
    { id: 'B2.1', x: 1840.6, z: -1352 },
    { id: 'B2.2', x: 1907, z: -1462 },
    { id: 'B2.3', x: 2111, z: -1597 },
  ],

  /** The Channel Routing board (§5.2): 5 columns × 4 rows of 3.2 m tiles, stepping down 0.5 m a row. */
  flume: {
    center: { x: 2008, z: -1622 },
    tile: 3.2,
    cols: [2001.6, 2004.8, 2008, 2011.2, 2014.4],
    rows: [-1626.8, -1623.6, -1620.4, -1617.2],
    rowY: [23, 22.5, 22, 21.5],
    /** Gates over columns (north edge). */
    gates: { feature: 1, bugfix: 2, docs: 3 },
    /** Outlets (south edge): column → whose wheel; the rest spill into the Great Hall sluice. */
    outlets: { feature: 0, bugfix: 2, docs: 4 },
  },
} as const;

export type ThousandBoughLayout = typeof THOUSAND_BOUGH;

/** A deck by id. */
export function treeDeck(id: TreeDeckSpec['id']): TreeDeckSpec {
  return DECKS.find((d) => d.id === id)!;
}

/** Whether (x, z) is inside the island's baked bounds (its waters). */
export function insideThousandBough(x: number, z: number): boolean {
  const b = THOUSAND_BOUGH.bounds;
  return x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ;
}
