import { describe, expect, it } from 'vitest';
import { smoothSteepLight } from '../../../tools/bake/steep-light';
import type { TerrainBakeData } from './bake';

/** A 2 m grid: a steep face rising along +z (normal y 0.3), or flat ground, with sunlit columns flickering along x. */
function grid(steep: boolean): TerrainBakeData {
  const nx = 24;
  const nz = 24;
  const count = nx * nz;
  const heights = new Float32Array(count);
  const normals = new Float32Array(count * 3);
  const flicker = () => {
    const out = new Uint8Array(count);
    for (let i = 0; i < count; i++) out[i] = (i % nx) % 2 === 0 ? 255 : 60;
    return out;
  };
  for (let iz = 0; iz < nz; iz++)
    for (let ix = 0; ix < nx; ix++) {
      const i = iz * nx + ix;
      heights[i] = steep ? iz * 6 : 0;
      normals[i * 3 + 1] = steep ? 0.3 : 1;
      normals[i * 3 + 2] = steep ? -0.95 : 0;
    }
  return {
    heights,
    nx,
    nz,
    minX: 0,
    minZ: 0,
    cell: 2,
    maxX: (nx - 1) * 2,
    maxZ: (nz - 1) * 2,
    normals,
    ao: flicker(),
    sunMorning: flicker(),
    sunGolden: flicker(),
    rim: flicker(),
    masks: new Uint8Array(count * 4),
    shoreline: [],
    hash: '',
  };
}

describe('smoothSteepLight', () => {
  it('evens out light that flickers column to column along a steep face', () => {
    const data = grid(true);
    smoothSteepLight(data);
    const row = 12 * data.nx;
    for (let ix = 8; ix < 16; ix++)
      expect(Math.abs(data.sunMorning[row + ix]! - data.sunMorning[row + ix + 1]!)).toBeLessThan(20);
  });

  it('keeps the light up and down the face (it only blends points at nearly the same height)', () => {
    const data = grid(true);
    for (let iz = 0; iz < data.nz; iz++)
      for (let ix = 0; ix < data.nx; ix++) data.sunGolden[iz * data.nx + ix] = iz < 12 ? 0 : 255;
    smoothSteepLight(data);
    expect(data.sunGolden[11 * data.nx + 12]).toBeLessThan(10);
    expect(data.sunGolden[12 * data.nx + 12]).toBeGreaterThan(245);
  });

  it('leaves gentle ground alone', () => {
    const data = grid(false);
    const before = data.ao.slice();
    smoothSteepLight(data);
    expect(Array.from(data.ao)).toEqual(Array.from(before));
  });
});
