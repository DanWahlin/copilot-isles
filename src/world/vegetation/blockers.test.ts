import { describe, expect, it } from 'vitest';
import { CollisionWorld } from '../../game/collision';
import type { HeightField } from '../contracts';
import { BLOCK_HEIGHT, PLANT_SPECIES, plantCollider, plantColliders } from './blockers';
import type { PlantInstance, PlantSpecies } from './types';

const plant = (species: PlantSpecies, scale: number, x = 0, z = 0, y = 2): PlantInstance => ({
  species,
  x,
  y,
  z,
  scale,
  rotation: 0,
  leanX: 0,
  leanZ: 0,
  colorSeed: 0,
  lodSeed: 0,
  slopeDeg: 0,
});

const flat: HeightField = {
  heightAt: () => 2,
  normalAt: (_x, _z, out) => {
    out[0] = 0;
    out[1] = 1;
    out[2] = 0;
    return out;
  },
  masksAt: () => ({ sand: 0, grass: 1, rock: 0, cliff: 0 }),
};

describe('plant colliders', () => {
  it('give every species with a base and a tall enough plant a circle of base × scale', () => {
    for (const species of Object.keys(PLANT_SPECIES) as PlantSpecies[]) {
      const spec = PLANT_SPECIES[species];
      for (const scale of [0.6, 1, 1.3]) {
        const c = plantCollider(plant(species, scale, 4, -3, 1.5));
        if (spec.base <= 0 || spec.height * scale < BLOCK_HEIGHT) {
          expect(c, `${species} × ${scale}`).toBeNull();
          continue;
        }
        expect(c, `${species} × ${scale}`).not.toBeNull();
        expect(c!.r).toBeCloseTo(spec.base * scale, 6);
        expect([c!.x, c!.z]).toEqual([4, -3]);
        expect(c!.y0).toBeLessThan(1.5);
        expect(c!.y1).toBeCloseTo(1.5 + spec.height * scale, 6);
        expect(c!.camera).toBe(false);
      }
    }
  });

  it('block trunks and big plants, and leave small plants to bend aside', () => {
    expect(plantCollider(plant('palmTall', 1))).not.toBeNull();
    expect(plantCollider(plant('broadleafTree', 0.8))).not.toBeNull();
    expect(plantCollider(plant('banana', 0.6))).not.toBeNull();
    expect(plantCollider(plant('shrub', 1))).not.toBeNull();
    expect(plantCollider(plant('fern', 1))).not.toBeNull();
    expect(plantCollider(plant('fern', 0.8))).toBeNull();
    expect(plantCollider(plant('flowerBush', 1.4))).toBeNull();
    expect(plantCollider(plant('log', 1.2))).toBeNull();
    expect(plantColliders([plant('palmTall', 1), plant('fern', 0.5), plant('banana', 1)])).toHaveLength(2);
  });

  it('stop a walker at the base and let it slide round, while the camera passes', () => {
    const world = new CollisionWorld({ ground: flat, circles: plantColliders([plant('banana', 1)]) });
    const r = PLANT_SPECIES.banana.base;
    // Straight in: stopped at the base plus the walker's radius.
    const p = { x: 0.1, z: 0 };
    expect(world.pushOut(p, 0.36, 2)).toBe(true);
    expect(Math.hypot(p.x, p.z)).toBeCloseTo(r + 0.36, 5);
    // A glancing step keeps its sideways part: it slides round, it doesn't stick.
    const q = { x: 0.3, z: 0.6 };
    world.pushOut(q, 0.36, 2);
    expect(Math.hypot(q.x, q.z)).toBeCloseTo(r + 0.36, 5);
    expect(q.z).toBeGreaterThan(0.6 * 0.9);
    // On a deck over its top, a walker passes.
    const deck = { x: 0.1, z: 0 };
    expect(world.pushOut(deck, 0.36, 2 + PLANT_SPECIES.banana.height + 0.5)).toBe(false);
    // The follow camera and sight lines go through foliage.
    expect(world.cameraBlockedAt(0, 2.5, 0, 0.3)).toBe(false);
    expect(world.sightBlockedAt(0, 2.5, 0)).toBe(false);
  });
});
