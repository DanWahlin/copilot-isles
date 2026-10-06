import type { CircleObstacle, Tier } from '../contracts';
import { MERIDIAN, meridianHeight, meridianWater } from '../islands/meridian';
import type { PlantInstance, PlantSpecies } from '../vegetation/types';
import {
  HARBOUR_FRONT_ROW,
  TERRACE_ROWS,
  terraceHasBackRow,
  terraceRun,
  type TerraceRowSpec,
} from './terraces';
import { segmentDistance, sinHash } from '../../util/math';

/**
 * Port Meridian's town planted like a Mediterranean harbour town: a row of palms along the quay,
 * flowering bushes, bananas and ferns in the beds in front of the houses, and gardens of shade
 * trees, palms, cypress and brush on the open terrace ends and in the lots round the plaza. Seeded
 * and pure (built from the town's own layout data), so the island and the chart's miniature plant
 * the same spots; `meridian-town/plantings.test.ts` builds the real town and checks that nothing
 * stands in a wall, a lane, a stair or an NPC's spot. Plants render in the vegetation's batches.
 */

/** Where people stand and talk (the town's anchors); plants keep this far away. */
const SPOTS: readonly (readonly [number, number])[] = [
  [761.4, -699.2],
  [594.2, -759.2],
  [768.4, -760.5],
  [668, -797.2],
  [690, -762.6],
  [716, -762.6],
  [684.2, -764.2],
  [666.8, -762.5],
  [672.4, -794.1],
  [651, -788.2],
  [653.5, -798.7],
  [657.6, -807.8],
  [668.2, -813.7],
  [684.8, -797.6],
  [618.5, -787.1],
  [584.8, -766],
  [766.7, -765.6],
  [802, -778.5],
  [821.4, -800.2],
  [809.4, -785.3],
  [786.3, -803.3],
  [793.4, -812.4],
];

/** Paved or built areas kept clear: plaza, tavern, shipyard, stair street, lift and the rest. */
const CLEAR_BOXES: readonly { x0: number; x1: number; z0: number; z1: number }[] = [
  { x0: 634, x1: 702, z0: -823, z1: -776 }, // plaza
  { x0: 603, x1: 641, z0: -817, z1: -775 }, // tavern pad
  { x0: 566, x1: 616, z0: -779, z1: -731 }, // shipyard apron
  { x0: 568, x1: 596, z0: -739, z1: -702 }, // mole connector
  { x0: 662, x1: 674, z0: -800, z1: -770 }, // stair street
  { x0: 617, x1: 627, z0: -800, z1: -770 }, // tavern lane
];

const STAIR_XS = [610, 668, 732, 786];

/**
 * The town's other buildings and walled plots (centre, half-sizes): the edge infill and filler
 * houses, the walled gardens and old olive groves, and the clock tower (meridian-town/index.ts).
 */
const BUILT: readonly (readonly [number, number, number, number])[] = [
  [566, -842, 3.6, 3.6],
  [572, -868, 3.6, 4.6],
  [583, -895, 2.6, 3.6],
  [824, -855, 3.6, 3.6],
  [836, -884, 3.6, 4.6],
  [830, -918, 2.6, 3.6],
  [565, -816, 9, 7.4],
  [812, -832, 10, 6.8],
  [840, -802, 9.4, 10.4],
  [588, -824, 3.4, 3.6],
  [614, -824, 3.6, 3.4],
  [724, -824, 3.5, 3.5],
  [750, -824, 3.2, 3.6],
  [558, -824, 3.1, 3.3],
  [548, -860, 3.4, 3.5],
  [562, -924, 3.2, 3.4],
  [828, -826, 3.4, 3.4],
  [842, -886, 3.5, 3.5],
  [832, -920, 3.3, 3.4],
  [564, -804, 7.5, 4.5],
  [555, -892, 4.5, 7.5],
  [832, -846, 4.5, 7.5],
  [807, -940, 2, 2],
  [668, -824.8, 5, 5],
];

const ROWS: readonly TerraceRowSpec[] = [HARBOUR_FRONT_ROW, ...TERRACE_ROWS];

/** Every terrace house's footprint (front and back runs) on the fullest tier. */
const HOUSES = ROWS.flatMap((row) =>
  (terraceHasBackRow(row, 'high') ? [false, true] : [false]).flatMap((back) => terraceRun(row, back).houses),
);

function inHouse(x: number, z: number, pad: number): boolean {
  for (const h of HOUSES) {
    if (Math.abs(x - h.x) < h.w / 2 + pad && Math.abs(z - h.z) < h.d / 2 + pad) return true;
  }
  return false;
}

/** True where a plant would block a way, a building or a spot (radius `r` round its trunk). */
export function meridianTownPlantBlocked(x: number, z: number, r = 0.8): boolean {
  for (const b of CLEAR_BOXES) if (x > b.x0 - r && x < b.x1 + r && z > b.z0 - r && z < b.z1 + r) return true;
  for (const [sx, sz] of SPOTS) if (Math.hypot(x - sx, z - sz) < 4 + r) return true;
  for (const row of ROWS) {
    if (x < row.x0 - 6 || x > row.x1 + 6) continue;
    if (Math.abs(z - row.laneZ) < row.laneWidth / 2 + 0.5 + r) return true;
  }
  for (const sx of STAIR_XS) if (Math.abs(x - sx) < 3.4 + r && z < -836 && z > -962) return true;
  if (inHouse(x, z, 0.5 + r)) return true;
  for (const [bx, bz, hx, hz] of BUILT)
    if (Math.abs(x - bx) < hx + 0.6 + r && Math.abs(z - bz) < hz + 0.6 + r) return true;
  const c = MERIDIAN.pads.citadel;
  if (Math.hypot(x - c.x, z - c.z) < 46) return true;
  // The lift's track up the bluff.
  if (segmentDistance(x, z, 770.3, -766.8, 798.2, -779.2) < 6) return true;
  if (meridianWater().shoreDistance(x, z, 4) < 2) return true;
  return false;
}

/** The share of each zone a tier keeps (PLAN §12.1). */
const KEEP: Record<Tier, number> = { lite: 0.3, low: 0.5, medium: 0.78, high: 1, ultra: 1 };

function plant(
  species: PlantSpecies,
  x: number,
  y: number,
  z: number,
  seed: number,
  scale: number,
): PlantInstance {
  const palm = species.startsWith('palm');
  return {
    species,
    x,
    y,
    z,
    scale,
    rotation: sinHash(seed, 1, 1) * Math.PI * 2,
    leanX: palm ? (sinHash(seed, 2, 2) - 0.5) * 0.1 : 0,
    leanZ: palm ? (sinHash(seed, 3, 3) - 0.5) * 0.1 : 0,
    colorSeed: sinHash(seed, 4, 4),
    lodSeed: sinHash(seed, 5, 5),
    slopeDeg: 0,
  };
}

/** The town's plants for a tier. */
export function meridianTownPlants(tier: Tier): PlantInstance[] {
  const keep = KEEP[tier];
  const out: PlantInstance[] = [];
  const add = (species: PlantSpecies, x: number, y: number, z: number, seed: number, scale: number) => {
    if (meridianTownPlantBlocked(x, z, species === 'flowerBush' || species === 'fern' ? 0.2 : 0.6)) return;
    out.push(plant(species, x, y, z, seed, scale));
  };

  // The quay: a palm row along the back of the promenade, the town's face from the sea.
  const quay = MERIDIAN.harbor.quay;
  for (let x = quay.x0 + 8, i = 0; x < quay.x1 - 4; x += 11, i++) {
    if (sinHash(i, 7, 11) > Math.max(keep, 0.6)) continue;
    add(
      i % 3 === 1 ? 'palmCluster' : 'palmTall',
      x,
      quay.height,
      quay.z0 + 1.6,
      900 + i,
      0.88 + sinHash(i, 1, 12) * 0.2,
    );
  }

  // The beds in front of the houses: flowers by the doors' sides, a banana or fern at the corners.
  for (const row of ROWS) {
    if (row === HARBOUR_FRONT_ROW) continue;
    const front = terraceRun(row, false).houses;
    for (const h of front) {
      if (sinHash(h.seed, 3, 21) > keep) continue;
      const bedZ = h.z + h.d / 2 + 0.85;
      if (bedZ > row.laneZ - row.laneWidth / 2 - 0.4) continue;
      const pick = sinHash(h.seed, 4, 22);
      const side = pick < 0.5 ? -1 : 1;
      const cx = h.x + side * (h.w / 2 - 0.7);
      const species: PlantSpecies =
        pick < 0.3 ? 'banana' : pick < 0.62 ? 'flowerBush' : pick < 0.82 ? 'shrub' : 'fern';
      add(
        species,
        cx,
        row.height,
        bedZ,
        h.seed,
        species === 'banana'
          ? 0.7
          : species === 'flowerBush'
            ? 1.5 + sinHash(h.seed, 5, 23) * 0.5
            : 0.9 + sinHash(h.seed, 5, 23) * 0.3,
      );
      if (h.w >= 6 && sinHash(h.seed, 6, 24) < keep * 0.7)
        add('flowerBush', h.x - side * (h.w / 2 - 0.6), row.height, bedZ, h.seed + 50, 1.6);
    }
  }

  // Gardens on the open ground: the terrace ends, the lots round the plaza, behind the harbour front.
  const CELL = 7;
  // (Above the harbour front: the quay has its own palm row.)
  for (let cz = Math.ceil(-990 / CELL); cz * CELL < -792; cz++) {
    for (let cx = Math.ceil(552 / CELL); cx * CELL < 852; cx++) {
      if (sinHash(cx, cz, 31) > keep * 0.85) continue;
      const x = (cx + 0.15 + sinHash(cx, cz, 32) * 0.7) * CELL;
      const z = (cz + 0.15 + sinHash(cx, cz, 33) * 0.7) * CELL;
      // Only near the town: it's planted, not wild (the hills have their own planting).
      if (!nearTown(x, z)) continue;
      const y = groundAt(x, z);
      if (y < 3) continue;
      const pick = sinHash(cx, cz, 34);
      const species: PlantSpecies =
        pick < 0.2
          ? 'cypress'
          : pick < 0.42
            ? 'broadleafTree'
            : pick < 0.56
              ? 'palmTall'
              : pick < 0.64
                ? 'palmYoung'
                : pick < 0.78
                  ? 'flowerBush'
                  : pick < 0.88
                    ? 'banana'
                    : 'brush';
      const scale =
        species === 'broadleafTree'
          ? 0.62 + sinHash(cx, cz, 35) * 0.3
          : species === 'cypress'
            ? 0.8 + sinHash(cx, cz, 35) * 0.4
            : species === 'flowerBush'
              ? 1.6 + sinHash(cx, cz, 35) * 0.7
              : 0.85 + sinHash(cx, cz, 35) * 0.3;
      add(species, x, y - 0.1, z, cx * 1000 + cz, scale);
    }
  }
  return out;
}

/** Inside the town's footprint, or a short way out from its row ends. */
function nearTown(x: number, z: number): boolean {
  if (x < 556 || x > 848 || z > -746 || z < -986) return false;
  for (const row of ROWS) {
    if (z > row.laneZ + 6 || z < row.houseZ - 16) continue;
    if (x > row.x0 - 34 && x < row.x1 + 30) return true;
  }
  return z > -830;
}

/** Ground height: a terrace's level on its pad, else the island. */
function groundAt(x: number, z: number): number {
  return meridianHeight(x, z);
}

/** Trunks you bump into (palms, trees, cypress); bushes and flowers you walk through. */
export function meridianTownPlantColliders(tier: Tier): CircleObstacle[] {
  return meridianTownPlants(tier)
    .filter((p) => TRUNKS.has(p.species))
    .map((p) => ({ x: p.x, z: p.z, r: p.species === 'broadleafTree' ? 0.5 : 0.35 }));
}

const TRUNKS = new Set<PlantSpecies>(['palmTall', 'palmCluster', 'palmYoung', 'broadleafTree', 'cypress']);
