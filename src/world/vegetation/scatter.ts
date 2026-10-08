// Adapted from Tidewater © 2026 DRG Software Solutions LLC, MIT, src/world/vegetation/Scatter.js@d32799f
import { tierSettings, type TierSettings } from '../../engine/quality';
import type { Tier } from '../contracts';
import type { PlantInstance, PlantSpecies, ScatterOptions, ScatterSummary } from './types';
import { SeededRandom } from './random';
import { excludedByMargin } from './exclusions';

const DEFAULT_SEED = 0xc0c011e5;

function dist2(x: number, z: number, cx: number, cz: number): number {
  const dx = x - cx;
  const dz = z - cz;
  return dx * dx + dz * dz;
}

export function slopeDegFromNormal(normalY: number): number {
  return (Math.acos(Math.min(1, Math.max(0, normalY))) * 180) / Math.PI;
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
    case 'cactus':
      return 0.6 * scale;
    case 'brush':
      return 0.7 * scale;
    case 'cypress':
      return 0.6 * scale;
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
  const curated = options.island.curatedPlants;
  if (!curated || curated.length === 0) return;
  const normal = new Float32Array(3);
  for (const palm of curated) {
    const rule = options.island.rules[palm.species];
    const y = options.heightField.heightAt(palm.x, palm.z);
    options.heightField.normalAt(palm.x, palm.z, normal);
    const masks = options.heightField.masksAt(palm.x, palm.z);
    const slope = slopeDegFromNormal(normal[1]);
    if (
      options.island.excluded(palm.x, palm.z, y, normal[1], masks) ||
      excludedByMargin(options.exclude, palm.x, palm.z, 2.2) ||
      slope > rule.maxSlopeDeg
    ) {
      continue;
    }
    const nearbyPalms = [...plants.palmTall, ...plants.palmCluster, ...plants.palmYoung];
    if (!farEnough(nearbyPalms, palm.x, palm.z, rule.minDistance * 0.72)) continue;
    const lean = options.island.curatedLean?.(palm, rng) ?? rule.lean(palm.x, palm.z, rng);
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
    cactus: [],
    brush: [],
    cypress: [],
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

  const rules = options.island.rules;
  const bounds = options.island.bounds;

  for (const species of Object.keys(rules) as PlantSpecies[]) {
    const rule = rules[species];
    if (rule.countHigh <= 0) continue;
    const target = Math.max(1, Math.round(rule.countHigh * (0.42 + density * 0.58)));
    const speciesRng = rng.fork(species.length * 997 + rule.countHigh);
    const maxAttempts = target * 55;

    for (let i = 0; plants[species].length < target && i < maxAttempts; i += 1) {
      attempts += 1;
      if ((attempts & 255) === 0) yield;
      const x = speciesRng.range(bounds.minX, bounds.maxX);
      const z = speciesRng.range(bounds.minZ, bounds.maxZ);
      const y = options.heightField.heightAt(x, z);
      options.heightField.normalAt(x, z, normal);
      const masks = options.heightField.masksAt(x, z);
      const slope = slopeDegFromNormal(normal[1]);

      if (
        options.island.excluded(x, z, y, normal[1], masks) ||
        excludedByMargin(options.exclude, x, z) ||
        slope > rule.maxSlopeDeg
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
