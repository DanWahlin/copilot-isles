import type { HeightField, Tier } from '../contracts';
import type { PlantInstance, PlantSpecies } from '../vegetation/types';
import { fbm2 } from '../terrain/cove-height';
import { MERIDIAN, meridianHeight, meridianMasks, meridianQuayHeight, meridianWater } from './meridian';

/**
 * Port Meridian's hills planted (PLAN §4: "lush Mediterranean-Caribbean hills"): palms along the
 * low shore, olive-like broadleaf trees in groves on the slopes, brush (maquis) and flowering bushes
 * between them, and prickly-pear cactus on the dry, rocky ground up high. Seeded and pure, so the
 * island's vegetation and the opening chart's miniature plant the same spots. The town, the citadel,
 * the harbour, the mole and the sea caves stay clear.
 */

/** Candidate spacing (m), and the share of the full planting each tier keeps (PLAN §12.1). */
const CELL = 10;
const SPOTS = 2;
const KEEP: Record<Tier, number> = { lite: 0.22, low: 0.42, medium: 0.68, high: 1, ultra: 1 };

/** The town's footprint (houses, plaza, terraces, shipyard, lift), with a margin. */
const TOWN = { x0: 552, x1: 852, z0: -992, z1: -738 } as const;

function smooth(a: number, b: number, v: number): number {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function hash(x: number, z: number, salt: number): number {
  const v = Math.sin(x * 127.1 + z * 311.7 + salt * 74.7) * 43758.5453;
  return v - Math.floor(v);
}

function segmentDistance(x: number, z: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax;
  const dz = bz - az;
  const t = Math.min(1, Math.max(0, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(x - (ax + dx * t), z - (az + dz * t));
}

/** True where nothing should grow: the town, the citadel, the harbour works and the sea caves. */
export function meridianPlantExcluded(x: number, z: number): boolean {
  if (x > TOWN.x0 && x < TOWN.x1 && z > TOWN.z0 && z < TOWN.z1) return true;
  const c = MERIDIAN.pads.citadel;
  if (Math.hypot(x - c.x, (z - c.z) / 0.85) < 52) return true;
  if (meridianQuayHeight(x, z) !== null) return true;
  const { start, end, width, lighthouse } = MERIDIAN.mole;
  if (segmentDistance(x, z, start.x, start.z, end.x, end.z) < width + 8) return true;
  if (Math.hypot(x - lighthouse.x, z - lighthouse.z) < lighthouse.radius + 10) return true;
  const h = MERIDIAN.harbor;
  if (Math.hypot((x - h.center.x) / h.radiusX, (z - h.center.z) / h.radiusZ) < 1.18) return true;
  for (const cave of MERIDIAN.seaCaves)
    if (Math.hypot(x - cave.x, z - cave.z) < cave.radius * 1.8) return true;
  if (meridianWater().shoreDistance(x, z, 3) < 2.2) return true;
  return false;
}

/** The island's own functions as a height field (for the game; the chart passes its baked grid). */
export const MERIDIAN_HEIGHT_FIELD: HeightField = {
  heightAt: meridianHeight,
  normalAt(x, z, out) {
    const e = 1.5;
    const nx = -(meridianHeight(x + e, z) - meridianHeight(x - e, z)) / (2 * e);
    const nz = -(meridianHeight(x, z + e) - meridianHeight(x, z - e)) / (2 * e);
    const len = Math.hypot(nx, 1, nz) || 1;
    out[0] = nx / len;
    out[1] = 1 / len;
    out[2] = nz / len;
    return out;
  },
  masksAt: meridianMasks,
};

const NORMAL = [0, 0, 0];

/**
 * The plants, a row of candidates per step (so the caller can spread the work over frames). Each
 * cell offers two spots anywhere inside it (no grid shows), and a broad noise sets how many of them
 * grow: dense groves and thickets, with open grass and scattered brush between them.
 */
export function* meridianPlantsSliced(
  tier: Tier,
  field: HeightField = MERIDIAN_HEIGHT_FIELD,
): Generator<void, PlantInstance[], void> {
  const out: PlantInstance[] = [];
  const keep = KEEP[tier];
  const { minX, maxX, minZ, maxZ } = MERIDIAN.bounds;
  for (let cz = Math.ceil(minZ / CELL); cz * CELL < maxZ; cz++) {
    for (let cx = Math.ceil(minX / CELL); cx * CELL < maxX; cx++) {
      for (let k = 0; k < SPOTS; k++) {
        const s = k * 16;
        const x = (cx + hash(cx, cz, s + 2)) * CELL;
        const z = (cz + hash(cx, cz, s + 3)) * CELL;
        const grove = fbm2(x * 0.011, z * 0.011, 3, 0x6e41) * 0.5 + 0.5;
        const thicket = fbm2(x * 0.03 + 7.3, z * 0.03 - 2.1, 2, 0x51c7) * 0.5 + 0.5;
        // Groves and thickets fill in; the ground between them stays mostly open.
        // The banks of the lake and streams grow thick and green.
        const bank = 1 - smooth(3, 18, meridianWater().shoreDistance(x, z, 18));
        const density = Math.min(
          1,
          0.2 + smooth(0.5, 0.66, grove) * 0.75 + smooth(0.48, 0.7, thicket) * 0.45 + bank * 0.7,
        );
        if (hash(cx, cz, s + 1) > keep * density) continue;
        if (meridianPlantExcluded(x, z)) continue;
        const h = field.heightAt(x, z);
        if (h < 2.4) continue;
        field.normalAt(x, z, NORMAL);
        const slopeDeg = (Math.acos(Math.min(1, NORMAL[1]!)) * 180) / Math.PI;
        if (slopeDeg > 34) continue;
        const m = field.masksAt(x, z);
        if (m.cliff > 0.4 || m.sand > 0.6) continue;
        const species =
          bank > 0.35 && slopeDeg < 26
            ? bankSpecies(hash(cx, cz, s + 4))
            : speciesFor(h, slopeDeg, m.rock, grove, thicket, hash(cx, cz, s + 4));
        if (!species) continue;
        // Sit the base on the lowest ground under it, a little sunk, as the island's scatter does.
        let y = h;
        for (let i = 0; i < 4; i++) {
          const a = (i / 4) * Math.PI * 2;
          y = Math.min(y, field.heightAt(x + Math.cos(a) * 0.7, z + Math.sin(a) * 0.7));
        }
        const palm = species.startsWith('palm');
        out.push({
          species,
          x,
          y: y - 0.12,
          z,
          scale: scaleFor(species, hash(cx, cz, s + 5)),
          rotation: hash(cx, cz, s + 6) * Math.PI * 2,
          leanX: palm ? (hash(cx, cz, s + 7) - 0.5) * 0.12 : 0,
          leanZ: palm ? (hash(cx, cz, s + 8) - 0.5) * 0.12 : 0,
          colorSeed: hash(cx, cz, s + 9),
          lodSeed: hash(cx, cz, s + 10),
          slopeDeg,
        });
      }
    }
    yield;
  }
  return out;
}

export function meridianPlants(tier: Tier, field: HeightField = MERIDIAN_HEIGHT_FIELD): PlantInstance[] {
  const steps = meridianPlantsSliced(tier, field);
  for (;;) {
    const r = steps.next();
    if (r.done) return r.value;
  }
}

/**
 * What grows here: palms by the shore, groves of olive-like trees with maquis brush under them on
 * the slopes, and prickly pear among the brush on the dry, rocky ground higher up. Red-leaved
 * shrubs and flowering bushes are rare accents in low, sheltered thickets. Some spots stay open
 * (grass shows there).
 */
function speciesFor(
  h: number,
  slope: number,
  rock: number,
  grove: number,
  thicket: number,
  pick: number,
): PlantSpecies | null {
  const accent = thicket > 0.6;
  if (h < 13) {
    if (pick < 0.46) return 'palmTall';
    if (pick < 0.62) return 'palmCluster';
    if (pick < 0.78) return 'brush';
    if (pick < 0.84) return 'banana';
    if (pick < 0.88 && accent) return 'shrub';
    if (pick < 0.91 && accent) return 'flowerBush';
    return null;
  }
  const dry = Math.max(rock, Math.min(1, (h - 45) / 50), Math.min(1, (slope - 18) / 14));
  if (dry > 0.55) {
    if (pick < 0.4) return 'cactus';
    if (pick < 0.82) return 'brush';
    return null;
  }
  if (grove > 0.56) {
    if (pick < 0.6) return 'broadleafTree';
    if (pick < 0.88) return 'brush';
    if (pick < 0.94) return 'palmYoung';
    return null;
  }
  if (pick < 0.56) return 'brush';
  if (pick < 0.72) return 'cactus';
  if (pick < 0.78) return 'broadleafTree';
  if (pick < 0.8 && accent) return 'shrub';
  return null;
}

/** By fresh water: palms, bananas and ferns, a few shade trees, and brush. */
function bankSpecies(pick: number): PlantSpecies {
  if (pick < 0.26) return 'palmTall';
  if (pick < 0.4) return 'palmYoung';
  if (pick < 0.56) return 'banana';
  if (pick < 0.72) return 'fern';
  if (pick < 0.84) return 'broadleafTree';
  return 'brush';
}

function scaleFor(species: PlantSpecies, r: number): number {
  switch (species) {
    case 'palmTall':
      return 0.85 + r * 0.4;
    case 'broadleafTree':
      return 0.7 + r * 0.45;
    case 'shrub':
      return 0.9 + r * 0.8;
    case 'brush':
      return 0.8 + r * 0.9;
    case 'cactus':
      return 1 + r * 0.7;
    default:
      return 0.85 + r * 0.35;
  }
}
