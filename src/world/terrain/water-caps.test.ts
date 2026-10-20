import { describe, expect, it, vi } from 'vitest';
import type { BufferGeometry } from 'three/webgpu';
import { bakeTerrainFrom } from './bake';
import { buildTerrainLodGeometries } from './terrain-mesh';
import type { TerrainFreshWater } from './water-caps';

vi.mock('./terrain-material', async () => {
  const { MeshStandardNodeMaterial } = await import('three/webgpu');
  return { createTerrainMaterial: () => new MeshStandardNodeMaterial() };
});

// Banks 1.6 m high, a stream 3.6 m wide down x = 68 (its water at 1.0 over a bed at 0.4), between
// Lite's 8 m vertex columns at 64 and 72; and a pool at the foot of a 25 m plateau (x > 100).
const stream = (x: number) => Math.abs(x - 68) < 1.8;
const pool = (x: number) => x > 95 && x < 99;
const data = bakeTerrainFrom({
  bounds: { minX: 0, maxX: 128, minZ: 0, maxZ: 128, cell: 2 },
  heightAt: (x) => (x > 100 ? 25 : stream(x) || pool(x) ? 0.4 : 1.6),
  masksAt: () => ({ sand: 0, grass: 1, rock: 0, cliff: 0 }),
});
const water: TerrainFreshWater = {
  box: { minX: 0, maxX: 128, minZ: 0, maxZ: 128 },
  levelAt: (x) => (stream(x) || pool(x) ? 1 : null),
};

/** The highest vertex in column x (skirts hang below, so the top is the ground's). */
function columnTop(geometries: BufferGeometry[], x: number, minZ = 16, maxZ = 112): number {
  let top = -Infinity;
  for (const g of geometries) {
    const p = g.getAttribute('position').array;
    for (let i = 0; i < p.length; i += 3)
      if (Math.abs(p[i]! - x) < 1e-3 && p[i + 2]! >= minZ && p[i + 2]! <= maxZ)
        top = Math.max(top, p[i + 1]!);
  }
  return top;
}

describe('a coarse terrain level keeps under the fresh water (TerrainWaterCaps)', () => {
  const plain = buildTerrainLodGeometries(data, 'lite', 1);
  const kept = buildTerrainLodGeometries(data, 'lite', 1, null, water);

  it('lowers the vertices either side of a stream narrower than its grid under the water', () => {
    // Without it the 8 m triangles span the bed from bank to bank, 0.6 m over the water.
    expect(columnTop(plain, 64)).toBeCloseTo(1.6, 3);
    expect(columnTop(plain, 72)).toBeCloseTo(1.6, 3);
    expect(columnTop(kept, 64)).toBeLessThan(1);
    expect(columnTop(kept, 72)).toBeLessThan(1);
  });

  it("leaves the ground a grid step away, and doesn't drag a cliff top down to a pool at its foot", () => {
    expect(columnTop(kept, 48)).toBeCloseTo(1.6, 3);
    expect(columnTop(kept, 80)).toBeCloseTo(1.6, 3);
    expect(columnTop(kept, 104)).toBeCloseTo(25, 3);
  });

  it('never changes the finest level (the one you walk on)', () => {
    const fine = buildTerrainLodGeometries(data, 'lite', 0, null, water);
    const base = buildTerrainLodGeometries(data, 'lite', 0);
    for (let i = 0; i < base.length; i++)
      expect(Array.from(fine[i]!.getAttribute('position').array)).toEqual(
        Array.from(base[i]!.getAttribute('position').array),
      );
  });
});
