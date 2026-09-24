import { describe, expect, it } from 'vitest';
import type { HeightField } from '../contracts';
import { COVE } from '../layout';
import { exclusionWeight } from './exclusions';
import { isVegetationExcluded, scatterVegetation, slopeDegFromNormal } from './scatter';
import type { PlantInstance } from './types';

class TestHeightField implements HeightField {
  constructor(private readonly steepEast = false) {}

  heightAt(x: number, z: number): number {
    if (z > COVE.beach.z0 && z < COVE.beach.z1) return 1.8;
    const hill = 9 + 10 * Math.exp(-((x + 8) ** 2 + (z + 16) ** 2) / 8500);
    return Math.max(1.2, hill);
  }

  normalAt(x: number, _z: number, out: Float32Array | number[]): Float32Array | number[] {
    if (this.steepEast && x > 0) {
      out[0] = 0.95;
      out[1] = 0.22;
      out[2] = 0;
      return out;
    }
    out[0] = 0.04;
    out[1] = 0.98;
    out[2] = 0.02;
    return out;
  }

  masksAt(x: number, z: number): { sand: number; grass: number; rock: number; cliff: number } {
    const sand = z > COVE.beach.z0 - 8 && z < COVE.beach.z1 + 8 ? 1 : 0;
    const cliff = this.steepEast && x > 0 ? 1 : 0;
    return { sand, grass: sand ? 0.2 : 0.9, rock: x > 80 ? 0.35 : 0, cliff };
  }
}

function flatten(plants: Record<string, PlantInstance[]>): PlantInstance[] {
  return Object.values(plants).flat();
}

describe('vegetation scatter', () => {
  it('is deterministic for the same seed and tier', () => {
    const a = scatterVegetation({ heightField: new TestHeightField(), tier: 'high', seed: 1234 });
    const b = scatterVegetation({ heightField: new TestHeightField(), tier: 'high', seed: 1234 });
    expect(a.plants).toEqual(b.plants);
    expect(a.attempts).toBe(b.attempts);
  });

  it('keeps instances off pads, quay, pier, wet line, cliffs, and harbor basin', () => {
    const hf = new TestHeightField();
    expect(isVegetationExcluded(COVE.village.center.x, COVE.village.center.z, 3, 1, hf.masksAt(0, 0))).toBe(
      true,
    );
    expect(isVegetationExcluded((COVE.quay.x0 + COVE.quay.x1) / 2, COVE.quay.z, 3, 1, hf.masksAt(0, 0))).toBe(
      true,
    );
    expect(isVegetationExcluded(COVE.pier.x, (COVE.pier.z0 + COVE.pier.z1) / 2, 3, 1, hf.masksAt(0, 0))).toBe(
      true,
    );
    expect(isVegetationExcluded(15, 96, 0.05, 1, { sand: 1, grass: 0, rock: 0, cliff: 0 })).toBe(true);
    expect(isVegetationExcluded(10, 10, 6, 0.4, { sand: 0, grass: 1, rock: 0, cliff: 1 })).toBe(true);
    expect(isVegetationExcluded(COVE.harbor.center.x, COVE.harbor.center.z, 2, 1, hf.masksAt(0, 0))).toBe(
      true,
    );

    const scatter = scatterVegetation({ heightField: hf, tier: 'high', seed: 99 });
    for (const instance of flatten(scatter.plants)) {
      const normal = new Float32Array(3);
      hf.normalAt(instance.x, instance.z, normal);
      expect(
        isVegetationExcluded(
          instance.x,
          instance.z,
          instance.y,
          normal[1],
          hf.masksAt(instance.x, instance.z),
        ),
      ).toBe(false);
    }
  });

  it('honours dynamic exclusion hooks with a soft margin', () => {
    const exclude = (x: number, z: number) => x > -20 && x < 35 && z > -20 && z < 50;
    expect(exclusionWeight(exclude, 0, 0)).toBe(0);
    expect(exclusionWeight(exclude, -20.3, 0)).toBeGreaterThan(0);
    expect(exclusionWeight(exclude, -20.3, 0)).toBeLessThan(1);
    expect(exclusionWeight(exclude, -25, 0)).toBe(1);

    const scatter = scatterVegetation({
      heightField: new TestHeightField(),
      tier: 'high',
      seed: 123,
      exclude,
    });
    for (const instance of flatten(scatter.plants)) {
      expect(exclude(instance.x, instance.z)).toBe(false);
      expect(exclusionWeight(exclude, instance.x, instance.z)).toBe(1);
    }
  });

  it('rejects steep slopes', () => {
    expect(slopeDegFromNormal(1)).toBeCloseTo(0);
    expect(slopeDegFromNormal(0.5)).toBeGreaterThan(50);
    const scatter = scatterVegetation({ heightField: new TestHeightField(true), tier: 'high', seed: 5678 });
    for (const instance of flatten(scatter.plants)) {
      expect(instance.x).toBeLessThanOrEqual(0);
      expect(instance.slopeDeg).toBeLessThanOrEqual(35);
    }
  });
});
