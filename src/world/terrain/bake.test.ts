import { describe, expect, it } from 'vitest';
import { bakeTerrain, hashTerrainPack, packTerrain } from './bake';

describe('terrain bake', () => {
  const smallBounds = { minX: -320, maxX: 320, minZ: -260, maxZ: 320, cell: 8 };

  it('is deterministic for the same bounds', () => {
    const a = bakeTerrain(smallBounds);
    const b = bakeTerrain(smallBounds);
    const packA = packTerrain(a, '');
    const packB = packTerrain(b, '');
    expect(hashTerrainPack(packA.binary, packA.json)).toBe(hashTerrainPack(packB.binary, packB.json));
  });

  it('extracts ordered shoreline chains including closed island loops', () => {
    const baked = bakeTerrain(smallBounds);
    expect(baked.shoreline.length).toBeGreaterThan(0);
    expect(baked.shoreline.some((chain) => chain.closed)).toBe(true);
    expect(baked.shoreline[0].points.length).toBeGreaterThan(8);
  });

  it('bakes unit normals and sensible mask bytes', () => {
    const baked = bakeTerrain(smallBounds);
    const vertexStride = Math.max(1, Math.floor(baked.normals.length / 3 / 30));
    for (let v = 0; v < baked.normals.length / 3; v += vertexStride) {
      const i = v * 3;
      const len = Math.hypot(baked.normals[i], baked.normals[i + 1], baked.normals[i + 2]);
      expect(len).toBeCloseTo(1, 4);
    }
    for (let i = 0; i < baked.masks.length; i += 4 * Math.max(1, Math.floor(baked.masks.length / 160))) {
      const sum = baked.masks[i] + baked.masks[i + 1] + baked.masks[i + 2] + baked.masks[i + 3];
      expect(sum).toBeGreaterThanOrEqual(250);
      expect(sum).toBeLessThanOrEqual(258);
    }
  });
});
