import { describe, expect, it, vi } from 'vitest';
import { PerspectiveCamera, type BufferGeometry, type Mesh } from 'three/webgpu';
import type { Tier } from '../contracts';
import { normalFromGrid, type TerrainBakeData } from './bake';
import {
  buildTerrainLodGeometries,
  chunkBoxDistance,
  createTerrain,
  createTerrainHeightField,
  pickTerrainLod,
  TERRAIN_CHUNK_SIZE,
  TERRAIN_LOD_HYSTERESIS,
  terrainLodThresholds,
} from './terrain-mesh';
import { WALK_RIG } from '../../game/follow-camera';
import { Index16Attribute } from '../../engine/index-format';

// The terrain's own look loads textures (a browser's job); these tests only need its meshes.
vi.mock('./terrain-material', async () => {
  const { MeshStandardNodeMaterial } = await import('three/webgpu');
  return { createTerrainMaterial: () => new MeshStandardNodeMaterial() };
});
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
      [data.minX + TERRAIN_CHUNK_SIZE, data.minZ + t * d],
      [data.minX + 2 * TERRAIN_CHUNK_SIZE, data.minZ + t * d],
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
      // 322 m wide (three chunks, the last narrow) and 43 m deep (one short chunk).
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

  for (const tier of ['lite', 'low', 'medium', 'high'] as const) {
    it(`matches the finest level in the recess area, recessing only unwalkable ground: ${tier}`, () => {
      const data = roughData({ minX: -20, maxX: 302, minZ: 10, maxZ: 53, cell: 1 }, 5);
      const box = { minX: 60, maxX: 200, minZ: 14, maxZ: 50 };
      const field = createTerrainHeightField(data, tier, box);
      const shape = field.shapeField!;
      const fine = buildTerrainLodGeometries(data, tier, 0, box);
      const plain = buildTerrainLodGeometries(data, tier, 0);
      const rand = mulberry32(17);
      const normal: [number, number, number] = [0, 0, 0];
      let maxError = 0;
      let maxShapeError = 0;
      let recessed = 0;
      for (let i = 0; i < 1500; i++) {
        // The box and a few metres around it (the cells that share its edge vertices).
        const x = box.minX - 4 + rand() * (box.maxX - box.minX + 8);
        const z = data.minZ + rand() * (data.maxZ - data.minZ);
        const hit = castDown(fine, x, z);
        expect(hit, `no triangle under (${x}, ${z})`).not.toBeNull();
        const h = field.heightAt(x, z);
        maxError = Math.max(maxError, Math.abs(h - hit!.y));
        // The shape field is the finest level without the recess.
        const plainY = castDown(plain, x, z)!.y;
        maxShapeError = Math.max(maxShapeError, Math.abs(shape.heightAt(x, z) - plainY));
        if (h < plainY - 1e-4) {
          recessed++;
          // Only ground too steep to walk on goes down.
          expect(field.normalAt(x, z, normal)[1], `walkable ground recessed at (${x}, ${z})`).toBeLessThan(
            0.74,
          );
        }
      }
      expect(maxError).toBeLessThan(1e-4);
      expect(maxShapeError).toBeLessThan(1e-4);
      expect(recessed).toBeGreaterThan(10);

      // Some of the finest level's vertices are really lower, and the next level recesses too.
      const lowered = (level: number): number => {
        const a = level === 0 ? fine : buildTerrainLodGeometries(data, tier, level, box);
        const b = level === 0 ? plain : buildTerrainLodGeometries(data, tier, level);
        let n = 0;
        for (let k = 0; k < a.length; k++) {
          const pa = a[k]!.getAttribute('position').array;
          const pb = b[k]!.getAttribute('position').array;
          for (let i = 1; i < pa.length; i += 3) if (pa[i]! < pb[i]! - 0.5) n++;
        }
        if (level !== 0) for (const g of [...a, ...b]) g.dispose();
        return n;
      };
      expect(lowered(0)).toBeGreaterThan(5);
      expect(lowered(1)).toBeGreaterThan(20);
      for (const g of [...fine, ...plain]) g.dispose();
    });
  }

  it('keeps the outside fallback', () => {
    const data = roughData({ minX: 0, maxX: 8, minZ: 0, maxZ: 8, cell: 1 });
    const field = createTerrainHeightField(data, 'high');
    expect(field.heightAt(-1, 4)).toBe(-52);
    expect(field.normalAt(4, 9, [0, 0, 0])).toEqual([0, 1, 0]);
  });
});

/** A chunk edge as drawn: the ground line along it and the bottom of each skirt segment hanging from it. */
function seamProfile(g: BufferGeometry, axis: 'x' | 'z', at: number) {
  const p = g.getAttribute('position').array as Float32Array;
  const across = axis === 'x' ? 0 : 2;
  const along = axis === 'x' ? 2 : 0;
  const tops = new Map<number, number>();
  const on: number[] = [];
  for (let i = 0; i < p.length / 3; i++) {
    if (Math.abs(p[i * 3 + across]! - at) > 1e-6) continue;
    on.push(i);
    const t = p[i * 3 + along]!;
    tops.set(t, Math.max(tops.get(t) ?? -Infinity, p[i * 3 + 1]!));
  }
  const ts = [...tops.keys()].sort((a, b) => a - b);
  const lerpAt = (t: number, xs: number[], ys: (x: number) => number) => {
    let k = 0;
    while (k < xs.length - 2 && xs[k + 1]! < t) k++;
    const f = (t - xs[k]!) / (xs[k + 1]! - xs[k]!);
    return ys(xs[k]!) + (ys(xs[k + 1]!) - ys(xs[k]!)) * f;
  };
  const top = (t: number) => lerpAt(t, ts, (x) => tops.get(x)!);
  // Skirt vertices come in pairs (one segment each), below the ground line.
  const below = new Set(on.filter((i) => p[i * 3 + 1]! < tops.get(p[i * 3 + along]!)! - 1e-6));
  const segments: [number, number, number, number][] = [];
  for (const i of below)
    if (below.has(i + 1)) {
      const t0 = p[i * 3 + along]!;
      const t1 = p[(i + 1) * 3 + along]!;
      if (Math.abs(t1 - t0) < 1e-9) continue; // the end of one segment and the start of the next
      const [a, b] = t0 < t1 ? [i, i + 1] : [i + 1, i];
      segments.push([p[a * 3 + along]!, p[a * 3 + 1]!, p[b * 3 + along]!, p[b * 3 + 1]!]);
    }
  const bottom = (t: number) => {
    let lo = Infinity;
    for (const [t0, y0, t1, y1] of segments)
      if (t >= t0 - 1e-9 && t <= t1 + 1e-9) lo = Math.min(lo, y0 + ((y1 - y0) * (t - t0)) / (t1 - t0));
    return lo;
  };
  return { top, bottom, from: ts[0]!, to: ts[ts.length - 1]! };
}

describe('terrain level of detail', () => {
  it('measures to the nearest point of the chunk, not its centre', () => {
    expect(chunkBoxDistance(10, 10, 0, 256, 0, 256)).toBe(0);
    expect(chunkBoxDistance(-30, 100, 0, 256, 0, 256)).toBe(30);
    expect(chunkBoxDistance(300, 100, 0, 256, 0, 256)).toBe(44);
    expect(chunkBoxDistance(-3, 260, 0, 256, 0, 256)).toBeCloseTo(5, 9);
  });

  const tiers: Tier[] = ['lite', 'low', 'medium', 'high', 'ultra'];
  for (const tier of tiers) {
    it(`draws the finest level under and round the player: ${tier}`, () => {
      const thresholds = terrainLodThresholds(tier);
      const rand = mulberry32(5);
      const reach = 24; // metres round the player that must be finest, whatever the camera does
      const C = TERRAIN_CHUNK_SIZE;
      const span = 4 * C;
      for (let n = 0; n < 4000; n++) {
        const px = rand() * span;
        const pz = rand() * span;
        const a = rand() * Math.PI * 2;
        const r = rand() * WALK_RIG.maxDist;
        const cx = px + Math.cos(a) * r;
        const cz = pz + Math.sin(a) * r;
        for (let z0 = 0; z0 < span; z0 += C)
          for (let x0 = 0; x0 < span; x0 += C) {
            if (chunkBoxDistance(px, pz, x0, x0 + C, z0, z0 + C) > reach) continue;
            const camera = chunkBoxDistance(cx, cz, x0, x0 + C, z0, z0 + C);
            expect(pickTerrainLod(camera, 2, thresholds)).toBe(0);
          }
      }
    });
  }

  it('goes finer at once but coarser only past the hysteresis margin', () => {
    const t = [40, 200];
    const h = TERRAIN_LOD_HYSTERESIS;
    expect(pickTerrainLod(39.9, 2, t)).toBe(0);
    expect(pickTerrainLod(120, 2, t)).toBe(1);
    expect(pickTerrainLod(40 + h - 0.1, 0, t)).toBe(0);
    expect(pickTerrainLod(40 + h + 0.1, 0, t)).toBe(1);
    expect(pickTerrainLod(200 + h + 0.1, 0, t)).toBe(2);
    expect(pickTerrainLod(200 + h - 0.1, 1, t)).toBe(1);
    expect(pickTerrainLod(199, 2, t)).toBe(1);
    // A camera that wobbles on the line keeps one level.
    let lod = pickTerrainLod(39, 1, t);
    for (let i = 0; i < 50; i++) {
      lod = pickTerrainLod(40 + Math.sin(i) * (h * 0.45), lod, t);
      expect(lod).toBe(0);
    }
  });

  for (const tier of ['lite', 'medium', 'high'] as Tier[]) {
    it(`closes the seams between chunks at different levels: ${tier}`, () => {
      // Four chunks (one seam across x and one across z) on rough ground.
      const C = TERRAIN_CHUNK_SIZE;
      const data = roughData({ minX: 0, maxX: C + 44, minZ: 0, maxZ: C + 44, cell: 2 }, 3);
      const lods = [0, 1, 2].map((lod) => buildTerrainLodGeometries(data, tier, lod));
      const seams: { a: number; b: number; axis: 'x' | 'z' }[] = [
        { a: 0, b: 1, axis: 'x' },
        { a: 2, b: 3, axis: 'x' },
        { a: 0, b: 2, axis: 'z' },
        { a: 1, b: 3, axis: 'z' },
      ];
      let worstGap = 0;
      let worstStep = 0;
      for (const seam of seams)
        for (let i = 0; i < 3; i++)
          for (let j = 0; j < 3; j++) {
            if (i === j) continue;
            const A = seamProfile(lods[i]![seam.a]!, seam.axis, C);
            const B = seamProfile(lods[j]![seam.b]!, seam.axis, C);
            for (let t = Math.max(A.from, B.from); t <= Math.min(A.to, B.to); t += 0.37) {
              const [hi, lo] = A.top(t) >= B.top(t) ? [A, B] : [B, A];
              worstStep = Math.max(worstStep, hi.top(t) - lo.top(t));
              worstGap = Math.max(worstGap, hi.bottom(t) - lo.top(t));
            }
          }
      for (const set of lods) for (const g of set) g.dispose();
      expect(worstStep).toBeGreaterThan(0.5); // the levels really do differ here
      expect(worstGap).toBeLessThanOrEqual(0);
    });
  }
});

describe('merged far blocks', () => {
  const C = TERRAIN_CHUNK_SIZE;
  /** The meshes drawn now, and how many of them cover each chunk's middle (it must be exactly one). */
  const drawn = (group: { children: unknown[] }) => {
    const meshes = (group.children as Mesh[]).filter(
      (m) => m.isMesh && m.visible && /terrain-chunk/.test(m.name),
    );
    const cover: number[] = [];
    for (let iz = 0; iz < 4; iz++)
      for (let ix = 0; ix < 4; ix++) {
        const x = (ix + 0.5) * C;
        const z = (iz + 0.5) * C;
        cover.push(
          meshes.filter((m) => {
            const b = m.geometry.boundingBox ?? (m.geometry.computeBoundingBox(), m.geometry.boundingBox!);
            return x > b.min.x && x < b.max.x && z > b.min.z && z < b.max.z;
          }).length,
        );
      }
    return { meshes, cover };
  };
  for (const tier of ['lite', 'high'] as const) {
    it(`draws every chunk once, in as few draws as the levels allow (${tier})`, () => {
      const data = roughData({ minX: 0, maxX: C * 4, minZ: 0, maxZ: C * 4, cell: 4 }, 5);
      const terrain = createTerrain({ tier, data, createRocks: () => null });
      const camera = new PerspectiveCamera();
      // Far out at sea: the whole island is one draw on Lite; High doesn't merge (it has the draws).
      camera.position.set(5000, 10, 5000);
      terrain.update(camera);
      let d = drawn(terrain.group);
      if (tier === 'lite') expect(d.meshes.map((m) => m.name)).toEqual(['terrain-chunks-all-lod2']);
      else expect(d.meshes.length).toBe(16);
      expect(d.cover.every((n) => n === 1)).toBe(true);
      // On the island: the chunk underfoot draws its own finest level, the far side merges.
      camera.position.set(C * 0.5, 10, C * 0.5);
      terrain.update(camera);
      d = drawn(terrain.group);
      expect(d.cover.every((n) => n === 1)).toBe(true);
      expect(d.meshes.some((m) => m.name === 'terrain-chunk-0-0')).toBe(true);
      if (tier === 'lite') expect(d.meshes.length).toBeLessThan(16);
      // A warm-up's merged level shows every merged block (and no chunk); null goes back.
      expect(terrain.lodCount).toBe(tier === 'lite' ? 4 : 3);
      terrain.setLod(terrain.lodCount - 1);
      d = drawn(terrain.group);
      if (tier === 'lite') expect(d.meshes.every((m) => m.name.startsWith('terrain-chunks-'))).toBe(true);
      terrain.setLod(null);
      terrain.update(camera);
      expect(drawn(terrain.group).cover.every((n) => n === 1)).toBe(true);
      terrain.dispose();
    });
  }
});

describe('terrain skins', () => {
  it('builds a flat skin facing up whichever way round its corners go', async () => {
    const { buildTerrainSkin } = await import('./terrain-mesh');
    const data = {
      minX: 0,
      maxX: 8,
      minZ: 0,
      maxZ: 8,
      cell: 2,
      nx: 5,
      nz: 5,
      heights: new Float32Array(25),
      normals: new Float32Array(75).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)),
      ao: new Uint8Array(25),
      sunMorning: new Uint8Array(25),
      sunGolden: new Uint8Array(25),
      rim: new Uint8Array(25),
      masks: new Uint8Array(100),
      shoreline: [],
      hash: 'test',
    } as unknown as Parameters<typeof buildTerrainSkin>[0];
    for (const corners of [
      [
        [1, 1],
        [5, 1],
        [5, 5],
        [1, 5],
      ],
      [
        [1, 1],
        [1, 5],
        [5, 5],
        [5, 1],
      ],
    ] as const) {
      const steps = buildTerrainSkin(data, { cell: 2, quads: [{ corners, y: 3 }] });
      let r = steps.next();
      while (!r.done) r = steps.next();
      const g = r.value!;
      const p = g.getAttribute('position');
      const idx = g.getIndex()!;
      for (let t = 0; t < idx.count; t += 3) {
        const [a, b, c] = [idx.getX(t), idx.getX(t + 1), idx.getX(t + 2)];
        const ux = p.getX(b) - p.getX(a);
        const uz = p.getZ(b) - p.getZ(a);
        const vx = p.getX(c) - p.getX(a);
        const vz = p.getZ(c) - p.getZ(a);
        // The face normal's y: (b - a) × (c - a).
        expect(uz * vx - ux * vz).toBeGreaterThan(0);
        expect(p.getY(a)).toBe(3);
      }
      g.dispose();
    }
  });
});

describe('terrain memory (issue 316)', () => {
  const C = TERRAIN_CHUNK_SIZE;
  it('keeps masks and light as 16-bit fractions and the index 16-bit on WebGPU', () => {
    const data = roughData({ minX: 0, maxX: C * 2, minZ: 0, maxZ: C, cell: 4 }, 3);
    data.masks.fill(255);
    data.ao.fill(128);
    const terrain = createTerrain({ tier: 'lite', data, createRocks: () => null });
    for (const g of terrain.geometries()) {
      const mask = g.getAttribute('terrainMask');
      const light = g.getAttribute('terrainLight');
      expect(mask.array).toBeInstanceOf(Uint16Array);
      expect(mask.normalized).toBe(true);
      // getX reads the fraction (three scales a normalized attribute's accessors).
      expect(mask.getX(0)).toBe(1);
      expect(light.getX(0)).toBeCloseTo(128 / 255, 4);
      const index = g.getIndex()!;
      expect(index.array).toBeInstanceOf(Uint16Array);
      expect(index).toBeInstanceOf(Index16Attribute);
    }
    terrain.dispose();
  });

  it('draws a deep sea floor chunk at its seabed level at every distance (one geometry)', () => {
    const data = roughData({ minX: 0, maxX: C * 2, minZ: 0, maxZ: C, cell: 4 }, 3);
    // The second chunk is all deep sea floor; the first keeps land.
    for (let iz = 0; iz < data.nz; iz++)
      for (let ix = 0; ix < data.nx; ix++)
        if (data.minX + ix * data.cell >= C) data.heights[iz * data.nx + ix] = -30 - (ix % 3);
    const plain = createTerrain({ tier: 'high', data, createRocks: () => null });
    const deep = createTerrain({
      tier: 'high',
      data,
      createRocks: () => null,
      seabed: { below: -15, level: 2 },
    });
    // Three levels for the land chunk; the deep chunk's three are one.
    expect(plain.geometries().length).toBe(6);
    expect(deep.geometries().length).toBe(4);
    const camera = new PerspectiveCamera();
    const chunk = (t: typeof deep, name: string) =>
      (t.group.children as Mesh[]).find((m) => m.name === name)!;
    for (const x of [C * 1.5, C * 0.5, 5000]) {
      camera.position.set(x, 10, C * 0.5);
      plain.update(camera);
      deep.update(camera);
      // The land chunk is the same in both.
      expect(chunk(deep, 'terrain-chunk-0-0').geometry.getAttribute('position').count).toBe(
        chunk(plain, 'terrain-chunk-0-0').geometry.getAttribute('position').count,
      );
      // The seabed chunk always draws the plain terrain's coarsest level's shape.
      const coarse = chunk(deep, `terrain-chunk-${C}-0`).geometry.getAttribute('position');
      plain.setLod(2);
      const want = chunk(plain, `terrain-chunk-${C}-0`).geometry.getAttribute('position');
      expect(Array.from(coarse.array)).toEqual(Array.from(want.array));
      plain.setLod(null);
    }
    plain.dispose();
    deep.dispose();
  });
});
