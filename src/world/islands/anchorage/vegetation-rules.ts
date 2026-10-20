// Adapted from Tidewater © 2026 DRG Software Solutions LLC, MIT, src/world/vegetation/Scatter.js@d32799f
import { COVE } from '../../layout';
import type { HeightField, Tier } from '../../contracts';
import { clamp01, segmentDistance, smoothstep } from '../../../util/math';
import { headlandCliffPlantSpots, type HeadlandPlantSpot } from '../../terrain/headland-cliff-shape';
import { seaStackPlantSpots, type SeaStackPlantSpot } from '../../terrain/sea-stack-shape';
import { slopeDegFromNormal } from '../../vegetation/scatter';
import { SeededRandom, hash2, valueNoise } from '../../vegetation/random';
import type {
  IslandVegetationRules,
  PlantInstance,
  PlantSpecies,
  SpeciesRuleMap,
  VegetationMasks,
} from '../../vegetation/types';

const WET_LINE = 0.12;
const MAX_SLOPE_DEG = 35;
const PATH_A = { x: COVE.quay.x0 + 32, z: COVE.quay.z + 2 };
const PATH_B = { x: -34, z: COVE.beach.z0 + 10 };

const BUILDING_FOOTPRINTS = [
  { x: COVE.village.center.x - 12, z: COVE.village.center.z - 8, r: 8 },
  { x: COVE.village.center.x + 5, z: COVE.village.center.z - 12, r: 9 },
  { x: COVE.village.center.x + 15, z: COVE.village.center.z + 6, r: 7 },
  { x: COVE.village.center.x - 7, z: COVE.village.center.z + 12, r: 8 },
  { x: COVE.village.center.x - 22, z: COVE.village.center.z + 2, r: 6 },
] as const;

function dist2(x: number, z: number, cx: number, cz: number): number {
  const dx = x - cx;
  const dz = z - cz;
  return dx * dx + dz * dz;
}

function nearRect(
  x: number,
  z: number,
  x0: number,
  x1: number,
  z0: number,
  z1: number,
  pad: number,
): boolean {
  return x >= x0 - pad && x <= x1 + pad && z >= z0 - pad && z <= z1 + pad;
}

export function isVegetationExcluded(
  x: number,
  z: number,
  y: number,
  normalY: number,
  masks: VegetationMasks,
): boolean {
  if (y <= WET_LINE) return true;
  if (masks.cliff > 0.28) return true;
  if (slopeDegFromNormal(normalY) > MAX_SLOPE_DEG) return true;

  if (dist2(x, z, COVE.village.center.x, COVE.village.center.z) < (COVE.village.radius + 5) ** 2) {
    return true;
  }
  for (const b of BUILDING_FOOTPRINTS) {
    if (dist2(x, z, b.x, b.z) < (b.r + 4) ** 2) return true;
  }

  if (nearRect(x, z, COVE.quay.x0, COVE.quay.x1, COVE.quay.z - 10, COVE.quay.z + 12, 3)) return true;
  if (
    nearRect(
      x,
      z,
      COVE.pier.x - COVE.pier.width / 2,
      COVE.pier.x + COVE.pier.width / 2,
      COVE.pier.z1,
      COVE.pier.z0,
      5,
    )
  ) {
    return true;
  }
  if (segmentDistance(x, z, PATH_A.x, PATH_A.z, PATH_B.x, PATH_B.z) < 4.8) return true;
  if (
    dist2(x, z, COVE.harbor.center.x, COVE.harbor.center.z) < (COVE.harbor.radius + 8) ** 2 &&
    z < COVE.quay.z + 18
  ) {
    return true;
  }
  return false;
}

function beachCrest(x: number, z: number, y: number, masks: VegetationMasks): number {
  const southBeach = 1 - smoothstep(0, 52, Math.abs(z - (COVE.beach.z0 + 8)));
  const lagoonArc = 1 - smoothstep(95, 178, Math.hypot(x - COVE.lagoon.center.x, z - COVE.lagoon.center.z));
  const along = 1 - smoothstep(120, 180, Math.abs(x - COVE.lagoon.center.x));
  const harborRim =
    (1 -
      smoothstep(
        COVE.harbor.radius - 4,
        COVE.harbor.radius + 34,
        Math.hypot(x - COVE.harbor.center.x, z - COVE.harbor.center.z),
      )) *
    smoothstep(COVE.quay.z - 30, COVE.quay.z + 36, z);
  const headlandPocket = smoothstep(82, 126, x) * (1 - smoothstep(36, 88, Math.abs(z - 48)));
  const height = smoothstep(0.08, 0.9, y) * (1 - smoothstep(9, 15, y));
  return clamp01(
    Math.max(southBeach, lagoonArc * 0.8, harborRim * 0.72, headlandPocket * 0.45) *
      (0.32 + along * 0.68) *
      Math.max(masks.sand, masks.grass * 0.42, 0.55) *
      height,
  );
}

function ridgePalmScore(x: number, z: number, y: number, masks: VegetationMasks): number {
  const hillRing =
    smoothstep(8, 18, y) *
    (1 - smoothstep(33, 45, y)) *
    smoothstep(28, 82, Math.hypot(x - COVE.hill.center.x, z - COVE.hill.center.z));
  const headlandRidge =
    smoothstep(COVE.headland.x0 - 12, COVE.headland.x1 - 38, x) *
    smoothstep(COVE.headland.z0 + 8, COVE.headland.z1 + 12, z) *
    smoothstep(14, 35, y) *
    (1 - smoothstep(43, 54, y));
  const brokenCanopy = 0.55 + hash2(Math.floor(x * 0.07), Math.floor(z * 0.07), 0x71d6e) * 0.45;
  return clamp01(
    Math.max(hillRing * 0.42, headlandRidge * 0.68) * masks.grass * (1 - masks.cliff) * brokenCanopy,
  );
}

function gullyScore(x: number, z: number, y: number, masks: VegetationMasks): number {
  const toVillage = 1 - smoothstep(35, 95, Math.hypot(x - COVE.village.center.x, z - COVE.village.center.z));
  const ravine = 1 - smoothstep(0, 16, Math.abs(Math.sin((x + 50) * 0.045) * 18 + z * 0.08 + 2));
  const moist = smoothstep(1.5, 5, y) * (1 - smoothstep(16, 24, y));
  return clamp01((toVillage * 0.7 + ravine * 0.45) * moist * masks.grass * (1 - masks.rock * 0.5));
}

function hillScore(x: number, z: number, y: number, masks: VegetationMasks): number {
  const hill =
    1 -
    smoothstep(
      COVE.hill.radius * 0.25,
      COVE.hill.radius * 0.95,
      Math.hypot(x - COVE.hill.center.x, z - COVE.hill.center.z),
    );
  return clamp01(hill * smoothstep(3.5, 15, y) * (masks.grass * 0.9 + masks.rock * 0.18));
}

/** Where the hill's trees gather into groves, with open meadow between them (0 meadow → 1 grove). */
function groveScore(x: number, z: number): number {
  return smoothstep(0.4, 0.72, valueNoise(x, z, 36, 0x6a0e5) * 0.7 + valueNoise(x, z, 14, 0x2b7f1) * 0.3);
}

function logScore(_x: number, z: number, y: number, masks: VegetationMasks): number {
  const beach = masks.sand * smoothstep(0.55, 1.4, y) * (1 - smoothstep(3.2, 5.5, y));
  const lagoonSide = smoothstep(COVE.beach.z0 - 18, COVE.beach.z0 + 12, z);
  return clamp01(beach * lagoonSide * 0.55);
}

function seawardLean(x: number, z: number, rng: SeededRandom, strength: number): { x: number; z: number } {
  const d = Math.max(1, Math.hypot(x, z));
  return { x: (x / d) * strength + rng.signed(0.04), z: (z / d) * strength + rng.signed(0.04) };
}

const RULES: SpeciesRuleMap = {
  palmTall: {
    countHigh: 68,
    minDistance: 12,
    maxSlopeDeg: 23,
    score: (x, z, y, masks) => Math.max(beachCrest(x, z, y, masks), ridgePalmScore(x, z, y, masks)),
    scale: (rng) => rng.range(0.9, 1.28),
    lean: (x, z, rng) => seawardLean(x, z, rng, 0.18),
  },
  palmCluster: {
    countHigh: 56,
    minDistance: 9.5,
    maxSlopeDeg: 25,
    score: (x, z, y, masks) =>
      Math.max(beachCrest(x, z, y, masks), ridgePalmScore(x, z, y, masks) * 0.46) *
      (0.75 + 0.25 * hash2(x * 0.2, z * 0.2, 44)),
    scale: (rng) => rng.range(0.72, 1.02),
    lean: (x, z, rng) => seawardLean(x, z, rng, 0.12),
  },
  palmYoung: {
    countHigh: 48,
    minDistance: 6.2,
    maxSlopeDeg: 24,
    score: (x, z, y, masks) =>
      beachCrest(x, z, y, masks) * 0.78 +
      gullyScore(x, z, y, masks) * 0.12 +
      ridgePalmScore(x, z, y, masks) * 0.22,
    scale: (rng) => rng.range(0.48, 0.72),
    lean: (x, z, rng) => seawardLean(x, z, rng, 0.06),
  },
  banana: {
    countHigh: 96,
    minDistance: 4.5,
    maxSlopeDeg: 31,
    score: gullyScore,
    scale: (rng) => rng.range(0.82, 1.22),
    lean: (_x, _z, rng) => ({ x: rng.signed(0.025), z: rng.signed(0.025) }),
  },
  fern: {
    countHigh: 150,
    minDistance: 2.8,
    maxSlopeDeg: 34,
    score: (x, z, y, masks) => gullyScore(x, z, y, masks) * 0.8 + hillScore(x, z, y, masks) * 0.25,
    scale: (rng) => rng.range(0.55, 1.15),
    lean: (_x, _z, rng) => ({ x: rng.signed(0.02), z: rng.signed(0.02) }),
  },
  shrub: {
    countHigh: 118,
    minDistance: 4.2,
    maxSlopeDeg: 34,
    score: (x, z, y, masks) =>
      hillScore(x, z, y, masks) * (0.65 + masks.grass * 0.35) * (0.45 + groveScore(x, z) * 0.55),
    scale: (rng) => rng.range(0.72, 1.35),
    lean: (_x, _z, rng) => ({ x: rng.signed(0.03), z: rng.signed(0.03) }),
  },
  broadleafTree: {
    // Groves of round broadleaf trees over the grassy hill, with meadow between (Dan: Disney hills).
    countHigh: 64,
    minDistance: 8.5,
    maxSlopeDeg: 35,
    score: (x, z, y, masks) =>
      hillScore(x, z, y, masks) *
      smoothstep(5, 14, y) *
      (0.2 + groveScore(x, z) * 0.8) *
      (1 - ridgePalmScore(x, z, y, masks) * 0.55),
    scale: (rng) => rng.range(0.74, 1.12),
    lean: (_x, _z, rng) => ({ x: rng.signed(0.02), z: rng.signed(0.02) }),
  },
  flowerBush: {
    countHigh: 64,
    minDistance: 3.4,
    maxSlopeDeg: 30,
    score: (x, z, y, masks) =>
      clamp01(
        gullyScore(x, z, y, masks) * 0.36 +
          hillScore(x, z, y, masks) * 0.18 +
          beachCrest(x, z, y, masks) * 0.2,
      ) *
      (1 - smoothstep(10, 18, y)),
    scale: (rng) => rng.range(0.48, 0.82),
    lean: (_x, _z, rng) => ({ x: rng.signed(0.015), z: rng.signed(0.015) }),
  },
  log: {
    countHigh: 14,
    minDistance: 11,
    maxSlopeDeg: 18,
    score: logScore,
    scale: (rng) => rng.range(1.1, 2.3),
    lean: (_x, _z, rng) => ({ x: rng.signed(0.01), z: rng.signed(0.01) }),
  },
  // Port Meridian's prickly pears and brush are planted by its own layout (islands/meridian-plants.ts).
  cactus: {
    countHigh: 0,
    minDistance: 4,
    maxSlopeDeg: 30,
    score: () => 0,
    scale: () => 1,
    lean: () => ({ x: 0, z: 0 }),
  },
  cypress: {
    countHigh: 0,
    minDistance: 3,
    maxSlopeDeg: 30,
    score: () => 0,
    scale: () => 1,
    lean: () => ({ x: 0, z: 0 }),
  },
  brush: {
    countHigh: 0,
    minDistance: 3,
    maxSlopeDeg: 34,
    score: () => 0,
    scale: () => 1,
    lean: () => ({ x: 0, z: 0 }),
  },
};

const CURATED_PALMS: ReadonlyArray<{
  species: 'palmTall' | 'palmCluster' | 'palmYoung';
  x: number;
  z: number;
  scale: number;
  rotation: number;
}> = [
  { species: 'palmTall', x: -62, z: 97, scale: 1.18, rotation: 0.28 },
  { species: 'palmCluster', x: -42, z: 101, scale: 0.96, rotation: -0.42 },
  { species: 'palmTall', x: -24, z: 95, scale: 1.08, rotation: 0.08 },
  { species: 'palmCluster', x: 10, z: 98, scale: 0.92, rotation: 0.5 },
  { species: 'palmTall', x: 34, z: 94, scale: 1.2, rotation: -0.2 },
  { species: 'palmYoung', x: 56, z: 101, scale: 0.68, rotation: 0.8 },
  { species: 'palmTall', x: 84, z: 92, scale: 1.12, rotation: -0.78 },
  { species: 'palmCluster', x: 118, z: 86, scale: 0.9, rotation: 0.22 },
  { species: 'palmTall', x: -165, z: -82, scale: 1.0, rotation: 1.4 },
  { species: 'palmTall', x: -151, z: -104, scale: 0.96, rotation: 1.16 },
  { species: 'palmCluster', x: -86, z: -83, scale: 0.82, rotation: -0.9 },
  { species: 'palmTall', x: -69, z: -96, scale: 0.92, rotation: -1.25 },
  { species: 'palmYoung', x: -156, z: -58, scale: 0.66, rotation: 1.05 },
  { species: 'palmTall', x: -43, z: -6, scale: 0.93, rotation: 2.2 },
  { species: 'palmTall', x: -12, z: -22, scale: 1.03, rotation: -2.4 },
  { species: 'palmCluster', x: 18, z: -8, scale: 0.82, rotation: 1.9 },
  { species: 'palmTall', x: 54, z: 9, scale: 0.97, rotation: -1.6 },
  { species: 'palmTall', x: 101, z: 18, scale: 0.88, rotation: 2.7 },
  { species: 'palmCluster', x: 132, z: -14, scale: 0.78, rotation: -2.9 },
];

/** A plant on a landform's own shape (the sea stack, the headland): no slope, colour and LOD seeded by its spot. */
function plantOnShape(spot: SeaStackPlantSpot | HeadlandPlantSpot): PlantInstance {
  return {
    species: spot.species,
    x: spot.x,
    y: spot.y,
    z: spot.z,
    scale: spot.scale,
    rotation: spot.rotation,
    leanX: spot.leanX,
    leanZ: spot.leanZ,
    colorSeed: spot.seed,
    lodSeed: spot.seed,
    slopeDeg: 0,
  };
}

/** The jungle on the sea stack's dome and ledges (placed on its shape, not on the height field). */
function appendSeaStackPlants(plants: Record<PlantSpecies, PlantInstance[]>): void {
  for (const spot of seaStackPlantSpots()) {
    plants[spot.species].push(plantOnShape(spot));
  }
}

/** Scrub, palms and trees on the headland's clifftop, shoulders and edge (thinned per tier). */
const HEADLAND_PLANT_DENSITY: Record<Tier, number> = {
  lite: 0.2,
  low: 0.45,
  medium: 0.75,
  high: 1,
  ultra: 1,
};

function appendHeadlandPlants(
  plants: Record<PlantSpecies, PlantInstance[]>,
  heightField: HeightField,
  tier: Tier,
): void {
  for (const spot of headlandCliffPlantSpots(heightField, HEADLAND_PLANT_DENSITY[tier])) {
    plants[spot.species].push(plantOnShape(spot));
  }
}

export const ANCHORAGE_VEGETATION: IslandVegetationRules = {
  bounds: {
    minX: -COVE.island.halfX + 4,
    maxX: COVE.island.halfX - 4,
    minZ: -COVE.island.halfZ + 2,
    maxZ: COVE.island.halfZ + 18,
  },
  grassBounds: {
    minX: -COVE.island.halfX,
    maxX: Math.max(COVE.island.halfX, COVE.headland.x1),
    minZ: -COVE.island.halfZ,
    maxZ: COVE.island.halfZ + 18,
  },
  rules: RULES,
  excluded: isVegetationExcluded,
  curatedPlants: CURATED_PALMS,
  curatedLean: (plant, rng) => seawardLean(plant.x, plant.z, rng, plant.species === 'palmTall' ? 0.2 : 0.11),
  heroPalmZones: [{ x: -110, z: -66, r: 54 }],
  appendExtraPlants(plants, heightField, tier, phase) {
    if (phase === 'beforeExternal') appendSeaStackPlants(plants);
    else appendHeadlandPlants(plants, heightField, tier);
  },
};
