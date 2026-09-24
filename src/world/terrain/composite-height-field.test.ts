import { describe, expect, it } from 'vitest';
import type { HeightField } from '../contracts';
import { CompositeHeightField } from './composite-height-field';

function field(height: number, sand = 0): HeightField {
  return {
    heightAt: () => height,
    normalAt: (_x, _z, out) => {
      out[0] = 0;
      out[1] = 1;
      out[2] = 0;
      return out;
    },
    masksAt: () => ({ sand, grass: 1 - sand, rock: 0, cliff: 0 }),
  };
}

describe('CompositeHeightField', () => {
  it('routes samples to the matching island bounds', () => {
    const composite = new CompositeHeightField(-58);
    composite.add({ minX: -10, maxX: 10, minZ: -10, maxZ: 10 }, field(3, 0.5));
    composite.add({ minX: 800, maxX: 900, minZ: -900, maxZ: -800 }, field(63, 0.1));

    expect(composite.heightAt(0, 0)).toBe(3);
    expect(composite.heightAt(850, -850)).toBe(63);
    expect(composite.heightAt(400, -400)).toBe(-58);
  });

  it('uses the most recently-added overlapping layer', () => {
    const composite = new CompositeHeightField(-58);
    composite.add({ minX: 0, maxX: 20, minZ: 0, maxZ: 20 }, field(1));
    composite.add({ minX: 5, maxX: 15, minZ: 5, maxZ: 15 }, field(9));

    expect(composite.heightAt(4, 4)).toBe(1);
    expect(composite.heightAt(8, 8)).toBe(9);
  });
});
