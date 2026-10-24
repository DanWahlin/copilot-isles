import { describe, expect, it } from 'vitest';
import type { TerrainBakeData } from '../terrain/bake';
import {
  addWaterDepthTile,
  nearestWaterDepthTile,
  removeWaterDepthTile,
  tileUvBounds,
  waterDepthPlaceholder,
  waterDepthTileFromTerrain,
} from './water-depth-texture';

function flatTerrain(minX: number, minZ: number, size: number, height: (x: number, z: number) => number) {
  const cell = 2;
  const nx = size / cell + 1;
  const heights = new Float32Array(nx * nx);
  for (let iz = 0; iz < nx; iz++)
    for (let ix = 0; ix < nx; ix++) heights[iz * nx + ix] = height(minX + ix * cell, minZ + iz * cell);
  return { heights, nx, nz: nx, cell, minX, minZ, maxX: minX + size, maxZ: minZ + size } as TerrainBakeData;
}

function build(data: TerrainBakeData, name: string) {
  const steps = waterDepthTileFromTerrain(data, name);
  for (;;) {
    const r = steps.next();
    if (r.done) return r.value;
  }
}

describe('water depth tiles', () => {
  it('builds a tile over the baked bounds from the bake (bilinear), in the shared format', () => {
    const data = flatTerrain(100, 200, 64, (x, z) => (x - 100) * 0.1 - (z - 200) * 0.05);
    const tile = build(data, 'test');
    expect([tile.minX, tile.maxX, tile.minZ, tile.maxZ]).toEqual([100, 164, 200, 264]);
    const img = tile.texture.image as { data: Float32Array; width: number };
    const size = img.width;
    // Corners land on the bake's corners.
    expect(img.data[0]).toBeCloseTo(0, 4);
    expect(img.data[size - 1]).toBeCloseTo(6.4, 3);
    expect(img.data[(size - 1) * size]).toBeCloseTo(-3.2, 3);
    const stand = waterDepthPlaceholder();
    expect(tile.texture.format).toBe(stand.format);
    expect(tile.texture.type).toBe(stand.type);
    expect(tile.texture.minFilter).toBe(stand.minFilter);
    expect(tile.texture.magFilter).toBe(stand.magFilter);
    tile.texture.dispose();
  });

  it('lends the nearest tile, and none once it is taken back', () => {
    const a = build(
      flatTerrain(0, 0, 32, () => -5),
      'a',
    );
    const b = build(
      flatTerrain(1000, 0, 32, () => -5),
      'b',
    );
    expect(nearestWaterDepthTile(10, 10)).toBe(null);
    addWaterDepthTile(a);
    addWaterDepthTile(b);
    expect(nearestWaterDepthTile(10, 10)).toBe(a);
    expect(nearestWaterDepthTile(900, 10)).toBe(b);
    removeWaterDepthTile(a);
    expect(nearestWaterDepthTile(10, 10)).toBe(b);
    removeWaterDepthTile(b);
    expect(nearestWaterDepthTile(10, 10)).toBe(null);
  });

  it("puts no point inside an empty slot (the home tile's shallows stay)", () => {
    const b = {
      v: [0, 0, 0, 0],
      set(x: number, y: number, z: number, w: number) {
        this.v = [x, y, z, w];
      },
    };
    const inside = (px: number, pz: number) => {
      const u = (px - b.v[0]!) * b.v[2]!;
      const v = (pz - b.v[1]!) * b.v[3]!;
      return u >= 0 && u <= 1 && v >= 0 && v <= 1;
    };
    tileUvBounds(null, b);
    for (const [px, pz] of [
      [0, 0],
      [-120, 300],
      [850, -850],
      [2050, -1500],
    ] as const)
      expect(inside(px, pz)).toBe(false);
    const tile = build(
      flatTerrain(100, 200, 64, () => -5),
      'c',
    );
    tileUvBounds(tile, b);
    expect(inside(130, 230)).toBe(true);
    expect(inside(90, 230)).toBe(false);
    tile.texture.dispose();
  });
});
