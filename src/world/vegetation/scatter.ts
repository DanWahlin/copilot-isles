// Adapted from Tidewater © 2026 DRG Software Solutions LLC, MIT, src/world/vegetation/Scatter.js@d32799f
import { COVE } from '../layout';
import { tierSettings, type TierSettings } from '../../engine/quality';
import type { Tier } from '../contracts';
import type { PlantInstance, PlantSpecies, ScatterOptions, ScatterSummary } from './types';
import { SeededRandom, clamp01, hash2, smoothstep } from './random';

const DEFAULT_SEED = 0xc0c011e5;
const WET_LINE = 0.35;
const PATH_A = { x: COVE.quay.x0 + 32, z: COVE.quay.z + 2 };
const PATH_B = { x: -34, z: COVE.beach.z0 + 10 };

export const BUILDING_FOOTPRINTS = [
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
  if (slopeDegFromNormal(normalY) > 42) return true;

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
  const crest = 1 - smoothstep(0, 20, Math.abs(z - (COVE.beach.z0 + 8)));
  const along = 1 - smoothstep(90, 155, Math.abs(x - COVE.lagoon.center.x));
  const height = smoothstep(0.5, 2.2, y) * (1 - smoothstep(5.5, 8, y));
  return clamp01(crest * (0.35 + along * 0.65) * masks.sand * height);
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
  return clamp01(hill * smoothstep(5, 17, y) * (masks.grass * 0.8 + masks.rock * 0.25));
}

function seawardLean(_x: number, _z: number, rng: SeededRandom, strength: number): { x: number; z: number } {
  return { x: rng.signed(0.035), z: strength + rng.signed(0.04) };
}

const RULES: RuleMap = {
  palmTall: {
    countHigh: 44,
    minDistance: 8,
    maxSlopeDeg: 23,
    score: beachCrest,
    scale: (rng) => rng.range(0.9, 1.28),
    lean: (x, z, rng) => seawardLean(x, z, rng, 0.16),
  },
  palmCluster: {
    countHigh: 58,
    minDistance: 5.5,
    maxSlopeDeg: 25,
    score: (x, z, y, masks) => beachCrest(x, z, y, masks) * (0.75 + 0.25 * hash2(x * 0.2, z * 0.2, 44)),
    scale: (rng) => rng.range(0.72, 1.02),
    lean: (x, z, rng) => seawardLean(x, z, rng, 0.1),
  },
  palmYoung: {
    countHigh: 40,
    minDistance: 4.5,
    maxSlopeDeg: 24,
    score: (x, z, y, masks) => beachCrest(x, z, y, masks) * 0.82 + gullyScore(x, z, y, masks) * 0.18,
    scale: (rng) => rng.range(0.48, 0.72),
    lean: (x, z, rng) => seawardLean(x, z, rng, 0.045),
  },
  banana: {
    countHigh: 64,
    minDistance: 4.5,
    maxSlopeDeg: 31,
    score: gullyScore,
    scale: (rng) => rng.range(0.82, 1.22),
    lean: (_x, _z, rng) => ({ x: rng.signed(0.025), z: rng.signed(0.025) }),
  },
  fern: {
    countHigh: 96,
    minDistance: 2.8,
    maxSlopeDeg: 34,
    score: (x, z, y, masks) => gullyScore(x, z, y, masks) * 0.8 + hillScore(x, z, y, masks) * 0.25,
    scale: (rng) => rng.range(0.55, 1.15),
    lean: (_x, _z, rng) => ({ x: rng.signed(0.02), z: rng.signed(0.02) }),
  },
  shrub: {
    countHigh: 92,
    minDistance: 4.2,
    maxSlopeDeg: 34,
    score: (x, z, y, masks) => hillScore(x, z, y, masks) * (0.65 + masks.grass * 0.35),
    scale: (rng) => rng.range(0.72, 1.35),
    lean: (_x, _z, rng) => ({ x: rng.signed(0.03), z: rng.signed(0.03) }),
  },
  broadleafTree: {
    countHigh: 26,
    minDistance: 12,
    maxSlopeDeg: 32,
    score: (x, z, y, masks) => hillScore(x, z, y, masks) * smoothstep(10, 18, y),
    scale: (rng) => rng.range(0.85, 1.35),
    lean: (_x, _z, rng) => ({ x: rng.signed(0.035), z: rng.signed(0.035) }),
  },
};

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

function emptyPlants(): Record<PlantSpecies, PlantInstance[]> {
  return {
    palmTall: [],
    palmCluster: [],
    palmYoung: [],
    banana: [],
    fern: [],
    shrub: [],
    broadleafTree: [],
  };
}

export function scatterVegetation(options: ScatterOptions): ScatterSummary {
  const tier = resolveTier(options.tier);
  const rng = new SeededRandom(options.seed ?? DEFAULT_SEED);
  const plants = emptyPlants();
  let attempts = 0;
  let rejected = 0;
  const density = Math.max(0.18, tier.grassDensity);
  const normal = new Float32Array(3);

  for (const species of Object.keys(RULES) as PlantSpecies[]) {
    const rule = RULES[species];
    const target = Math.max(1, Math.round(rule.countHigh * (0.42 + density * 0.58)));
    const speciesRng = rng.fork(species.length * 997 + rule.countHigh);
    const maxAttempts = target * 55;

    for (let i = 0; plants[species].length < target && i < maxAttempts; i += 1) {
      attempts += 1;
      const x = speciesRng.range(-COVE.island.halfX + 4, COVE.island.halfX - 4);
      const z = speciesRng.range(-COVE.island.halfZ + 2, COVE.island.halfZ + 18);
      const y = options.heightField.heightAt(x, z);
      options.heightField.normalAt(x, z, normal);
      const masks = options.heightField.masksAt(x, z);
      const slope = slopeDegFromNormal(normal[1]);

      if (isVegetationExcluded(x, z, y, normal[1], masks) || slope > rule.maxSlopeDeg) {
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

      const lean = rule.lean(x, z, speciesRng);
      plants[species].push({
        species,
        x,
        y,
        z,
        scale: rule.scale(speciesRng),
        rotation: speciesRng.range(-Math.PI, Math.PI),
        leanX: lean.x,
        leanZ: lean.z,
        colorSeed: speciesRng.next(),
        lodSeed: speciesRng.next(),
        slopeDeg: slope,
      });
    }
  }

  return { plants, seed: options.seed ?? DEFAULT_SEED, attempts, rejected };
}
