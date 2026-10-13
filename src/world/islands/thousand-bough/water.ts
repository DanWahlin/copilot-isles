import { createFreshWater, type FreshWater, type FreshWaterSpec } from '../meridian-water';
import { THOUSAND_BOUGH } from './layout';

/**
 * Thousand-Bough's fresh water (spec §3.3): three falls off the horseshoe's cliffs into their pools,
 * the Booth Pools stepping down Fernrun to the cove, Silver Run into the lowest booth, and Thunder
 * Run from the Mirror Pool to East Beach. Pure data and maths (no three.js), carved into the island's
 * uncarved height like Meridian's.
 *
 * Each fall's water starts in a small spring pool on the shelf above its lip. The Veil and Silver
 * Thread run down their cliffs as carved streams (white water down the face); Great Falls leaps
 * clear of its cliff as a hanging curtain (`GREAT_FALLS_CURTAIN`), so its stream ends at the lip.
 */

const P = THOUSAND_BOUGH.pools;
const [boothA, boothB, boothC] = P.booths;

export type TbBasin =
  | 'upper'
  | 'mirror'
  | 'silver'
  | 'boothA'
  | 'boothB'
  | 'boothC'
  | 'fernSpring'
  | 'veilSpring'
  | 'silverSpring'
  | 'fallsSpring';

const pool = (
  b: { x: number; z: number; r: number; level: number },
  o: { rot?: number; depth: number; phase: number; rz?: number; cut?: number; levee?: number },
) => ({
  x: b.x,
  z: b.z,
  rx: b.r,
  rz: o.rz ?? b.r,
  rot: o.rot ?? 0,
  depth: o.depth,
  level: b.level,
  phase: o.phase,
  cut: o.cut ?? 0.9,
  levee: o.levee ?? 0.5,
});

export const THOUSAND_BOUGH_WATER_SPEC: FreshWaterSpec<TbBasin> = {
  basins: {
    upper: pool(P.upper, { depth: 1.2, phase: 0.7, rz: 13, cut: 0.7 }),
    mirror: pool(P.mirror, { depth: 1.6, phase: 2.2, rz: 24, rot: 0.15, cut: 0.6 }),
    silver: pool(P.silver, { depth: 0.9, phase: 4.4, cut: 0.9 }),
    boothA: pool(boothA, { depth: 0.6, phase: 1.1, rz: 3.6, rot: -0.6, cut: 1.2, levee: 0.6 }),
    boothB: pool(boothB, { depth: 0.6, phase: 3.3, rz: 3.6, rot: -0.5, cut: 1.2, levee: 0.6 }),
    boothC: pool(boothC, { depth: 0.6, phase: 5.2, rz: 3.2, rot: -0.4, cut: 1.2, levee: 0.6 }),
    // Fernrun's head: the wheel race (a timber channel round the knoll) comes up here from its culvert
    // under the Root Gate.
    fernSpring: {
      x: 1984,
      z: -1505,
      rx: 3.6,
      rz: 3,
      rot: 0.5,
      depth: 0.5,
      level: 13.2,
      phase: 0.2,
      cut: 1,
      levee: 0.6,
    },
    veilSpring: {
      x: 2010,
      z: -1728,
      rx: 9,
      rz: 5,
      rot: 0,
      depth: 0.5,
      level: 53.4,
      phase: 1.9,
      cut: 1.2,
      levee: 4,
    },
    silverSpring: {
      x: 1868,
      z: -1668,
      rx: 4,
      rz: 3.5,
      rot: 0.4,
      depth: 0.4,
      level: 61.2,
      phase: 3.1,
      cut: 1.2,
      levee: 4,
    },
    fallsSpring: {
      x: 2156,
      z: -1672,
      rx: 9,
      rz: 6,
      rot: 0.3,
      depth: 0.5,
      level: 71.4,
      phase: 0.9,
      cut: 1.2,
      levee: 4,
    },
  },
  streams: [
    {
      // The Veil: off the saddle's shelf in a wide sheet down the cliff into the Upper Pool.
      points: [
        [2010, -1724],
        [2010, -1716],
        [2010, -1710],
        [2010, -1700],
        [2010, -1690],
        [2010, -1680],
        [2010, -1672],
      ],
      halfWidth: 7,
      depth: 0.4,
      minFall: 0.03,
      from: 'veilSpring',
      to: 'upper',
      lip: 2,
      levee: 2,
    },
    {
      // Silver Thread: a tall, thin fall off the west cliff into the Silver Pool.
      points: [
        [1868, -1665],
        [1874, -1656],
        [1878, -1650],
        [1879, -1640],
        [1880, -1630],
        [1880, -1620],
        [1880, -1612],
      ],
      halfWidth: 1.6,
      depth: 0.35,
      minFall: 0.03,
      from: 'silverSpring',
      to: 'silver',
      lip: 2,
      levee: 2,
    },
    {
      // Silver Run: down the west valley to the lowest booth pool.
      points: [
        [1880, -1606],
        [1884, -1588],
        [1889, -1566],
        [1894, -1544],
        [1897, -1522],
        [1900, -1502],
        [1906, -1490],
        [1913, -1485],
      ],
      halfWidth: 1.3,
      depth: 0.35,
      minFall: 0.02,
      // Banks standing half a metre over the water (it runs in its own bed, not on the ground).
      bank: 0.45,
      from: 'silver',
      to: 'boothA',
    },
    {
      // Great Falls' head: from its spring to the lip (the curtain takes it from there).
      points: [
        [2156, -1668],
        [2153, -1660],
        [2150, -1654],
      ],
      halfWidth: 4,
      depth: 0.4,
      minFall: 0.03,
      from: 'fallsSpring',
      to: 'sea',
      levee: 4,
    },
    {
      // Fernrun, from its spring below the knoll, under plank bridge B0 on the Fern Walk, round to the
      // top booth pool.
      points: [
        [1984, -1505],
        [1978, -1506],
        [1971, -1509],
        [1963, -1514],
        [1957, -1518],
        [1950, -1524],
        [1941, -1526],
        [1933, -1519],
        [1927, -1510],
        [1925, -1506],
      ],
      halfWidth: 1.7,
      depth: 0.4,
      minFall: 0.02,
      // Banks standing half a metre over the water (it runs in its own bed, not on the ground).
      bank: 0.45,
      from: 'fernSpring',
      to: 'boothC',
    },
    {
      points: [
        [1923, -1501],
        [1921, -1497],
      ],
      halfWidth: 1.2,
      depth: 0.3,
      minFall: 0.05,
      from: 'boothC',
      to: 'boothB',
    },
    {
      points: [
        [1919, -1491],
        [1917, -1487],
      ],
      halfWidth: 1.2,
      depth: 0.3,
      minFall: 0.05,
      from: 'boothB',
      to: 'boothA',
    },
    {
      // Fernrun's last reach: from the lowest booth to the cove.
      points: [
        [1913, -1481],
        [1904, -1472],
        [1895, -1460],
        [1886, -1446],
        [1878, -1432],
        [1872, -1420],
      ],
      halfWidth: 2.4,
      depth: 0.45,
      minFall: 0.02,
      // Banks standing half a metre over the water (it runs in its own bed, not on the ground).
      bank: 0.45,
      from: 'boothA',
      to: 'sea',
    },
    {
      // Thunder Run: from the Mirror Pool's south lip across the east valley to East Beach.
      points: [
        [2138, -1590],
        [2148, -1566],
        [2160, -1536],
        [2170, -1500],
        [2172, -1460],
        [2168, -1420],
        [2162, -1380],
        [2156, -1340],
        [2152, -1300],
        [2150, -1275],
      ],
      halfWidth: 2.2,
      depth: 0.45,
      minFall: 0.02,
      // Banks standing half a metre over the water (it runs in its own bed, not on the ground).
      bank: 0.45,
      from: 'mirror',
      to: 'sea',
    },
  ],
};

/** The Great Falls curtain: hangs clear of the cliff from the lip into the Mirror Pool. */
export const GREAT_FALLS_CURTAIN = {
  lip: THOUSAND_BOUGH.water.falls[2]!.lip,
  /** Where it lands (just inside the Mirror Pool's north shore). */
  footZ: -1634,
  width: THOUSAND_BOUGH.water.falls[2]!.width,
} as const;

export type ThousandBoughWater = FreshWater<TbBasin>;

export function createThousandBoughWater(dry: (x: number, z: number) => number): ThousandBoughWater {
  return createFreshWater(THOUSAND_BOUGH_WATER_SPEC, dry);
}
