import type { CircleObstacle } from '../contracts';
import type { PlantInstance, PlantSpecies } from './types';

/**
 * Each species' data that more than its look reads: its height at scale 1 (m, the models are scaled to
 * it), and `base`, the radius at scale 1 (m) of the trunk or the dense base that a walker can't go
 * into. A species with base 0 never blocks (flowering bushes, driftwood): you walk through it.
 * `trunk`: a woody trunk (palms and trees), which a town that wants it can also keep the camera out of.
 */
export interface PlantSpeciesData {
  height: number;
  base: number;
  trunk: boolean;
}

export const PLANT_SPECIES: Record<PlantSpecies, PlantSpeciesData> = {
  palmTall: { height: 12.4, base: 0.4, trunk: true },
  palmCluster: { height: 7.8, base: 0.55, trunk: true },
  palmYoung: { height: 4.8, base: 0.28, trunk: true },
  banana: { height: 3.4, base: 0.85, trunk: false },
  fern: { height: 1.25, base: 0.5, trunk: false },
  shrub: { height: 1.65, base: 0.7, trunk: false },
  broadleafTree: { height: 9.4, base: 0.5, trunk: true },
  flowerBush: { height: 0.85, base: 0, trunk: false },
  log: { height: 0.9, base: 0, trunk: false },
  cactus: { height: 2.1, base: 0.55, trunk: false },
  brush: { height: 1.45, base: 0.6, trunk: false },
  cypress: { height: 8.5, base: 0.4, trunk: true },
};

/** A plant this tall (m) or more blocks a walker, if its species has a base; smaller ones bend aside. */
export const BLOCK_HEIGHT = 1.2;

/** The walker's collider round a plant's base, or null where it doesn't block (too small, or no base). */
export function plantCollider(plant: PlantInstance): CircleObstacle | null {
  const spec = PLANT_SPECIES[plant.species];
  const height = spec.height * plant.scale;
  if (spec.base <= 0 || height < BLOCK_HEIGHT) return null;
  return {
    x: plant.x,
    z: plant.z,
    r: spec.base * plant.scale,
    height,
    // Only from its foot to its top: a walker on a deck or a bridge over it passes.
    y0: plant.y - 1,
    y1: plant.y + height,
    // Leaves and trunks don't push the follow camera: it passes through foliage as before.
    camera: false,
  };
}

/** The colliders of every plant that blocks (`plantCollider`), in the list's order. */
export function plantColliders(plants: Iterable<PlantInstance>): CircleObstacle[] {
  const out: CircleObstacle[] = [];
  for (const p of plants) {
    const c = plantCollider(p);
    if (c) out.push(c);
  }
  return out;
}
