import { describe, expect, it } from 'vitest';
import type { BufferGeometry } from 'three/webgpu';
import type { Tier } from '../contracts';
import { normalFromGrid, type TerrainBakeData } from './bake';
import { buildTerrainLodGeometries, createTerrainHeightField } from './terrain-mesh';
import { mulberry32 } from '../../util/math';

/** A rough, made-up baked grid (steep random relief, so the bilinear patch and the triangles differ). */
function roughData(
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number; cell: number },
  seed = 7,
) {
  const nx = Math.round((bounds.maxX - bounds.minX) / bounds.cell) + 1;
  const nz = Math.round((bounds.maxZ - bounds.minZ) / bounds.cell) + 1;
  const rand = mulberry32(seed);
  const heights = new Float32Array(nx * nz);
  for (let iz = 0; iz < nz; iz++)
    for (let ix = 0; ix < nx; ix++)
      heights[iz * nx + ix] = 12 * Math.sin(ix * 0.21) * Math.cos(iz * 0.17) + (rand() - 0.5) * 6;
  const normals = new Float32Array(nx * nz * 3);
  for (let iz = 0; iz < nz; iz++)
    for (let ix = 0; ix < nx; ix++)
      normalFromGrid(
        heights,
        nx,
        nz,
        bounds.minX,
        bounds.minZ,
        bounds.cell,
        ix,
        iz,
        normals,
        (iz * nx + ix) * 3,
      );
  const count = nx * nz;
  const data: TerrainBakeData = {
    heights,
    nx,
    nz,
    minX: bounds.minX,
    minZ: bounds.minZ,
    cell: bounds.cell,
    maxX: bounds.maxX,
    maxZ: bounds.maxZ,
    normals,
    ao: new Uint8Array(count),
    sunMorning: new Uint8Array(count),
    sunGolden: new Uint8Array(count),
    rim: new Uint8Array(count),
    masks: new Uint8Array(count * 4),
    shoreline: [],
    hash: '',
  };
  return data;
}

interface Hit {
  y: number;
  normal: [number, number, number];
}

/**
 * A vertical ray down through (x, z) against the drawn triangles (Möller–Trumbore on the real
 * position and index buffers). Returns the highest hit, with the triangle's blended vertex normal.
 */
function castDown(geometries: BufferGeometry[], x: number, z: number): Hit | null {
  let best: Hit | null = null;
  const top = 1000;
  for (const g of geometries) {
    const box = g.boundingBox!;
    if (x < box.min.x - 1e-6 || x > box.max.x + 1e-6 || z < box.min.z - 1e-6 || z > box.max.z + 1e-6)
      continue;
    const p = g.getAttribute('position').array as Float32Array;
    const n = g.getAttribute('normal').array as Float32Array;
    const idx = g.getIndex()!.array;
    for (let t = 0; t < idx.length; t += 3) {
      const a = idx[t]! * 3;
      const b = idx[t + 1]! * 3;
      const c = idx[t + 2]! * 3;
      if (Math.min(p[a]!, p[b]!, p[c]!) > x + 1e-6 || Math.max(p[a]!, p[b]!, p[c]!) < x - 1e-6) continue;
      if (
        Math.min(p[a + 2]!, p[b + 2]!, p[c + 2]!) > z + 1e-6 ||
        Math.max(p[a + 2]!, p[b + 2]!, p[c + 2]!) < z - 1e-6
      )
        continue;
      const e1x = p[b]! - p[a]!;
      const e1y = p[b + 1]! - p[a + 1]!;
      const e1z = p[b + 2]! - p[a + 2]!;
      const e2x = p[c]! - p[a]!;
      const e2y = p[c + 1]! - p[a + 1]!;
      const e2z = p[c + 2]! - p[a + 2]!;
      // Ray direction d = (0, -1, 0); pvec = d × e2.
      const px = -e2z;
      const pz = e2x;
      const det = e1x * px + e1z * pz;
      if (Math.abs(det) < 1e-12) continue; // vertical (skirt) triangles
      const inv = 1 / det;
      const sx = x - p[a]!;
      const sy = top - p[a + 1]!;
      const sz = z - p[a + 2]!;
      const u = (sx * px + sz * pz) * inv;
      if (u < -1e-9 || u > 1 + 1e-9) continue;
      // qvec = s × e1
      const qx = sy * e1z - sz * e1y;
      const qy = sz * e1x - sx * e1z;
      const qz = sx * e1y - sy * e1x;
      const v = -qy * inv;
      if (v < -1e-9 || u + v > 1 + 1e-9) continue;
      const dist = (e2x * qx + e2y * qy + e2z * qz) * inv;
      const y = top - dist;
      if (best && y <= best.y) continue;
      const w = 1 - u - v;
      const nx = n[a]! * w + n[b]! * u + n[c]! * v;
      const ny = n[a + 1]! * w + n[b + 1]! * u + n[c + 1]! * v;
      const nz = n[a + 2]! * w + n[b + 2]! * u + n[c + 2]! * v;
      const len = Math.hypot(nx, ny, nz);
      best = { y, normal: [nx / len, ny / len, nz / len] };
    }
  }
  return best;
}

/** Random points, plus points on cell edges, diagonals, chunk seams and the far edges. */
function samplePoints(data: TerrainBakeData, count: number, seed: number): [number, number][] {
  const rand = mulberry32(seed);
  const points: [number, number][] = [];
  const w = data.maxX - data.minX;
  const d = data.maxZ - data.minZ;
  for (let i = 0; i < count; i++) points.push([data.minX + rand() * w, data.minZ + rand() * d]);
  for (let i = 0; i < 40; i++) {
    const x = data.minX + Math.floor(rand() * w);
    const z = data.minZ + Math.floor(rand() * d);
    points.push([x, z], [x + 0.5, z + 0.5], [x + 0.25, z + 0.75], [x + rand(), z]);
  }
  for (let i = 0; i < 20; i++) {
    const t = rand();
    points.push(
      [data.minX + 256, data.minZ + t * d],
      [data.minX + t * w, data.maxZ - rand() * 6],
      [data.maxX - rand() * 6, data.minZ + t * d],
      [data.maxX, data.maxZ - t * 3],
    );
  }
  return points;
}

describe('terrain height field matches the drawn triangles', () => {
  it('uses the (x1, z0)–(x0, z1) diagonal, not the bilinear patch', () => {
    const data = roughData({ minX: 0, maxX: 4, minZ: 0, maxZ: 4, cell: 1 });
    data.heights.fill(0);
    data.heights[1 * data.nx + 1] = 4; // the (1, 1) corner of cell (0, 0)
    const field = createTerrainHeightField(data, 'high');
    // Bilinear would give 1 at the centre and 2.25 at (0.75, 0.75).
    expect(field.heightAt(0.5, 0.5)).toBeCloseTo(0, 6);
    expect(field.heightAt(0.75, 0.75)).toBeCloseTo(2, 6);
    expect(field.heightAt(0.25, 0.25)).toBeCloseTo(0, 6);
  });

  const cases: { name: string; tier: Tier; cell: number }[] = [
    { name: 'high, 1 m grid (Anchorage)', tier: 'high', cell: 1 },
    { name: 'ultra, 2 m grid (Meridian)', tier: 'ultra', cell: 2 },
    { name: 'medium (2 m step)', tier: 'medium', cell: 1 },
    { name: 'low (3 m step, uneven last column)', tier: 'low', cell: 1 },
    { name: 'lite (4 m step) on a 2 m grid', tier: 'lite', cell: 2 },
  ];
  for (const c of cases) {
    it(`heightAt and normalAt agree with a ray cast on the finest mesh: ${c.name}`, () => {
      // 322 m wide (two chunks, the second narrow) and 43 m deep (one short chunk).
      const data = roughData({ minX: -20, maxX: 302, minZ: 10, maxZ: 53, cell: c.cell }, 11);
      const geometries = buildTerrainLodGeometries(data, c.tier);
      const field = createTerrainHeightField(data, c.tier);
      const normal = [0, 0, 0];
      let maxError = 0;
      let maxNormalError = 0;
      for (const [x, z] of samplePoints(data, 400, 3)) {
        const hit = castDown(geometries, x, z);
        expect(hit, `no triangle under (${x}, ${z})`).not.toBeNull();
        maxError = Math.max(maxError, Math.abs(field.heightAt(x, z) - hit!.y));
        field.normalAt(x, z, normal);
        for (let k = 0; k < 3; k++)
          maxNormalError = Math.max(maxNormalError, Math.abs(normal[k]! - hit!.normal[k]));
      }
      for (const g of geometries) g.dispose();
      expect(maxError).toBeLessThan(1e-4);
      expect(maxNormalError).toBeLessThan(1e-4);
    });
  }

  it('keeps the outside fallback', () => {
    const data = roughData({ minX: 0, maxX: 8, minZ: 0, maxZ: 8, cell: 1 });
    const field = createTerrainHeightField(data, 'high');
    expect(field.heightAt(-1, 4)).toBe(-52);
    expect(field.normalAt(4, 9, [0, 0, 0])).toEqual([0, 1, 0]);
  });
});
