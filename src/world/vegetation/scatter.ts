// Adapted from Tidewater © 2026 DRG Software Solutions LLC, MIT, src/world/vegetation/Scatter.js@d32799f
import { COVE } from '../layout';
import { tierSettings, type TierSettings } from '../../engine/quality';
import type { Tier } from '../contracts';
import type { PlantInstance, PlantSpecies, ScatterOptions, ScatterSummary } from './types';
import { clamp01, smoothstep } from '../../util/math';
import { SeededRandom, hash2 } from './random';
import { excludedByMargin } from './exclusions';

const DEFAULT_SEED = 0xc0c011e5;
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

interface Masks {
  sand: number;
  grass: number;
  rock: number;
  cliff: number;
}

interface SpeciesRule {
  countHigh: number;
  minDistance: number;
  maxSlopeDeg: number;
  score(x: number, z: number, y: number, masks: Masks): number;
  scale(rng: SeededRandom): number;
  lean(x: number, z: number, rng: SeededRandom): { x: number; z: number };
}

type RuleMap = Record<PlantSpecies, SpeciesRule>;

function dist2(x: number, z: number, cx: number, cz: number): number {
  const dx = x - cx;
  const dz = z - cz;
  return dx * dx + dz * dz;
}

function pointSegmentDistance(x: number, z: number, ax: number, az: number, bx: number, bz: number): number {
  const vx = bx - ax;
  const vz = bz - az;
  const wx = x - ax;
  const wz = z - az;
  const c = Math.max(0, Math.min(1, (wx * vx + wz * vz) / Math.max(0.0001, vx * vx + vz * vz)));
  const px = ax + vx * c;
  const pz = az + vz * c;
  return Math.hypot(x - px, z - pz);
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

export function slopeDegFromNormal(normalY: number): number {
  return (Math.acos(Math.min(1, Math.max(0, normalY))) * 180) / Math.PI;
}

export function isVegetationExcluded(
  x: number,
  z: number,
  y: number,
  normalY: number,
  masks: Masks,
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
  if (pointSegmentDistance(x, z, PATH_A.x, PATH_A.z, PATH_B.x, PATH_B.z) < 4.8) return true;
  if (
    dist2(x, z, COVE.harbor.center.x, COVE.harbor.center.z) < (COVE.harbor.radius + 8) ** 2 &&
    z < COVE.quay.z + 18
  ) {
    return true;
  }
  return false;
}

function beachCrest(x: number, z: number, y: number, masks: Masks): number {
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

function ridgePalmScore(x: number, z: number, y: number, masks: Masks): number {
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

function gullyScore(x: number, z: number, y: number, masks: Masks): number {
  const toVillage = 1 - smoothstep(35, 95, Math.hypot(x - COVE.village.center.x, z - COVE.village.center.z));
  const ravine = 1 - smoothstep(0, 16, Math.abs(Math.sin((x + 50) * 0.045) * 18 + z * 0.08 + 2));
  const moist = smoothstep(1.5, 5, y) * (1 - smoothstep(16, 24, y));
  return clamp01((toVillage * 0.7 + ravine * 0.45) * moist * masks.grass * (1 - masks.rock * 0.5));
}

function hillScore(x: number, z: number, y: number, masks: Masks): number {
  const hill =
    1 -
    smoothstep(
      COVE.hill.radius * 0.25,
      COVE.hill.radius * 0.95,
      Math.hypot(x - COVE.hill.center.x, z - COVE.hill.center.z),
    );
  return clamp01(hill * smoothstep(3.5, 15, y) * (masks.grass * 0.9 + masks.rock * 0.18));
}

function logScore(_x: number, z: number, y: number, masks: Masks): number {
  const beach = masks.sand * smoothstep(0.55, 1.4, y) * (1 - smoothstep(3.2, 5.5, y));
  const lagoonSide = smoothstep(COVE.beach.z0 - 18, COVE.beach.z0 + 12, z);
  return clamp01(beach * lagoonSide * 0.55);
}

function seawardLean(x: number, z: number, rng: SeededRandom, strength: number): { x: number; z: number } {
  const d = Math.max(1, Math.hypot(x, z));
  return { x: (x / d) * strength + rng.signed(0.04), z: (z / d) * strength + rng.signed(0.04) };
}

function baseRadius(species: PlantSpecies, scale: number): number {
  switch (species) {
    case 'palmTall':
      return 0.75 * scale;
    case 'palmCluster':
      return 1.5 * scale;
    case 'palmYoung':
      return 0.45 * scale;
    case 'broadleafTree':
      return 1.0 * scale;
    case 'flowerBush':
      return 0.55 * scale;
    case 'log':
      return 1.4 * scale;
    case 'banana':
      return 0.75 * scale;
    case 'shrub':
      return 0.65 * scale;
    case 'fern':
      return 0.35 * scale;
  }
}

function groundedHeight(
  species: PlantSpecies,
  scale: number,
  x: number,
  z: number,
  heightAt: (x: number, z: number) => number,
): number {
  const r = baseRadius(species, scale);
  let y = heightAt(x, z);
  for (let i = 0; i < 6; i += 1) {
    const a = (i / 6) * Math.PI * 2;
    y = Math.min(y, heightAt(x + Math.cos(a) * r, z + Math.sin(a) * r));
  }
  return y - Math.min(0.18, 0.05 + r * 0.06);
}

const RULES: RuleMap = {
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
    score: (x, z, y, masks) => hillScore(x, z, y, masks) * (0.65 + masks.grass * 0.35),
    scale: (rng) => rng.range(0.72, 1.35),
    lean: (_x, _z, rng) => ({ x: rng.signed(0.03), z: rng.signed(0.03) }),
  },
  broadleafTree: {
    countHigh: 22,
    minDistance: 13,
    maxSlopeDeg: 32,
    score: (x, z, y, masks) =>
      hillScore(x, z, y, masks) * smoothstep(7, 17, y) * (1 - ridgePalmScore(x, z, y, masks) * 0.55),
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

function resolveTier(tier: Tier | TierSettings): TierSettings {
  return typeof tier === 'string' ? tierSettings(tier) : tier;
}

function farEnough(instances: PlantInstance[], x: number, z: number, minDistance: number): boolean {
  const min2 = minDistance * minDistance;
  for (const p of instances) {
    if (dist2(x, z, p.x, p.z) < min2) return false;
  }
  return true;
}

function addCuratedPalms(
  plants: Record<PlantSpecies, PlantInstance[]>,
  options: ScatterOptions,
  rng: SeededRandom,
): void {
  const normal = new Float32Array(3);
  for (const palm of CURATED_PALMS) {
    const rule = RULES[palm.species];
    const y = options.heightField.heightAt(palm.x, palm.z);
    options.heightField.normalAt(palm.x, palm.z, normal);
    const masks = options.heightField.masksAt(palm.x, palm.z);
    const slope = slopeDegFromNormal(normal[1]);
    if (
      isVegetationExcluded(palm.x, palm.z, y, normal[1], masks) ||
      excludedByMargin(options.exclude, palm.x, palm.z, 2.2) ||
      slope > rule.maxSlopeDeg
    ) {
      continue;
    }
    const nearbyPalms = [...plants.palmTall, ...plants.palmCluster, ...plants.palmYoung];
    if (!farEnough(nearbyPalms, palm.x, palm.z, rule.minDistance * 0.72)) continue;
    const lean = seawardLean(palm.x, palm.z, rng, palm.species === 'palmTall' ? 0.2 : 0.11);
    plants[palm.species].push({
      species: palm.species,
      x: palm.x,
      y: groundedHeight(
        palm.species,
        palm.scale,
        palm.x,
        palm.z,
        options.heightField.heightAt.bind(options.heightField),
      ),
      z: palm.z,
      scale: palm.scale,
      rotation: palm.rotation,
      leanX: lean.x,
      leanZ: lean.z,
      colorSeed: rng.next(),
      lodSeed: rng.next(),
      slopeDeg: slope,
    });
  }
}

function emptyPlants(): Record<PlantSpecies, PlantInstance[]> {
  return {
    palmTall: [],
    palmCluster: [],
    palmYoung: [],
    banana: [],
    fern: [],
    shrub: [],
    broadleafTree: [],
    flowerBush: [],
    log: [],
  };
}

export function scatterVegetation(options: ScatterOptions): ScatterSummary {
  const steps = buildScatter(options);
  for (;;) {
    const r = steps.next();
    if (r.done) return r.value;
  }
}

/** The same scatter, yielding every few hundred attempts: `breathe` runs between them. */
export async function scatterVegetationAsync(
  options: ScatterOptions,
  breathe: () => Promise<void>,
): Promise<ScatterSummary> {
  const steps = buildScatter(options);
  for (;;) {
    const r = steps.next();
    if (r.done) return r.value;
    await breathe();
  }
}

function* buildScatter(options: ScatterOptions): Generator<void, ScatterSummary, void> {
  const tier = resolveTier(options.tier);
  const rng = new SeededRandom(options.seed ?? DEFAULT_SEED);
  const plants = emptyPlants();
  let attempts = 0;
  let rejected = 0;
  const density = Math.max(0.18, tier.grassDensity);
  const normal = new Float32Array(3);

  for (const species of Object.keys(RULES) as PlantSpecies[]) {
    const rule = RULES[species];
    if (rule.countHigh <= 0) continue;
    const target = Math.max(1, Math.round(rule.countHigh * (0.42 + density * 0.58)));
    const speciesRng = rng.fork(species.length * 997 + rule.countHigh);
    const maxAttempts = target * 55;

    for (let i = 0; plants[species].length < target && i < maxAttempts; i += 1) {
      attempts += 1;
      if ((attempts & 255) === 0) yield;
      const x = speciesRng.range(-COVE.island.halfX + 4, COVE.island.halfX - 4);
      const z = speciesRng.range(-COVE.island.halfZ + 2, COVE.island.halfZ + 18);
      const y = options.heightField.heightAt(x, z);
      options.heightField.normalAt(x, z, normal);
      const masks = options.heightField.masksAt(x, z);
      const slope = slopeDegFromNormal(normal[1]);

      if (
        isVegetationExcluded(x, z, y, normal[1], masks) ||
        excludedByMargin(options.exclude, x, z) ||
        slope > rule.maxSlopeDeg ||
        slope > MAX_SLOPE_DEG
      ) {
        rejected += 1;
        continue;
      }

      const score = rule.score(x, z, y, masks);
      if (score <= 0 || speciesRng.next() > score) {
        rejected += 1;
        continue;
      }
      if (!farEnough(plants[species], x, z, rule.minDistance)) {
        rejected += 1;
        continue;
      }

      const scale = rule.scale(speciesRng);
      const lean = rule.lean(x, z, speciesRng);
      plants[species].push({
        species,
        x,
        y: groundedHeight(species, scale, x, z, options.heightField.heightAt.bind(options.heightField)),
        z,
        scale,
        rotation: speciesRng.range(-Math.PI, Math.PI),
        leanX: lean.x,
        leanZ: lean.z,
        colorSeed: speciesRng.next(),
        lodSeed: speciesRng.next(),
        slopeDeg: slope,
      });
    }
  }

  addCuratedPalms(plants, options, rng.fork(0x51a9c0));

  return { plants, seed: options.seed ?? DEFAULT_SEED, attempts, rejected };
}
