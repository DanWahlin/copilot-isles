import {
  BufferAttribute,
  BufferGeometry,
  Camera,
  Group,
  Mesh,
  Sphere,
  Vector3,
  type Material,
} from 'three/webgpu';
import type { Tier, HeightField } from '../contracts';
import { COVE } from '../layout';
import { tierSettings, type TierSettings } from '../../engine/quality';
import { coveHeight, coveMasks, CoveHeightField, type HeightGridData } from './cove-height';
import type { TerrainBakeData } from './bake';
import { createTerrainMaterial } from './terrain-material';

interface ChunkGeometrySet {
  step: number;
  geometry: BufferGeometry;
  triangles: number;
}

interface TerrainChunk {
  mesh: Mesh;
  center: Vector3;
  geometries: ChunkGeometrySet[];
  current: number;
}

export type TerrainHeightGrid = HeightGridData;

export interface CreatedTerrain {
  group: Group;
  heightField: HeightField;
  update(camera: Camera): void;
  dispose(): void;
  heightGrid: TerrainHeightGrid;
}

export interface CreateTerrainOptions {
  tier: Tier | TierSettings;
  data: TerrainBakeData;
}

function resolveTier(tier: Tier | TierSettings): TierSettings {
  return typeof tier === 'string' ? tierSettings(tier) : tier;
}

function stepsForTier(tier: TierSettings): readonly number[] {
  if (tier.tier === 'lite' || tier.tier === 'low') return [4, 8, 16];
  return [2, 4, 8];
}

function thresholdsForTier(tier: TierSettings): readonly number[] {
  if (tier.tier === 'lite' || tier.tier === 'low') return [110, 285];
  if (tier.tier === 'medium') return [190, 400];
  return [260, 520];
}

function clampIndex(v: number, max: number): number {
  return Math.max(0, Math.min(max, v));
}

function sampleVertex(
  data: TerrainBakeData,
  x: number,
  z: number,
): {
  h: number;
  normal: [number, number, number];
  light: [number, number, number, number];
  mask: [number, number, number, number];
} {
  const gx = clampIndex(Math.round((x - data.minX) / data.cell), data.nx - 1);
  const gz = clampIndex(Math.round((z - data.minZ) / data.cell), data.nz - 1);
  const i = gz * data.nx + gx;
  const no = i * 3;
  const mo = i * 4;
  return {
    h: data.heights[i],
    normal: [data.normals[no], data.normals[no + 1], data.normals[no + 2]],
    light: [data.ao[i] / 255, data.sunMorning[i] / 255, data.sunGolden[i] / 255, data.rim[i] / 255],
    mask: [
      data.masks[mo] / 255,
      data.masks[mo + 1] / 255,
      data.masks[mo + 2] / 255,
      data.masks[mo + 3] / 255,
    ],
  };
}

function pushVertex(
  positions: number[],
  normals: number[],
  masks: number[],
  lights: number[],
  uvs: number[],
  data: TerrainBakeData,
  x: number,
  z: number,
  u: number,
  v: number,
  yOffset = 0,
): number {
  const vertex = sampleVertex(data, x, z);
  positions.push(x, vertex.h + yOffset, z);
  normals.push(vertex.normal[0], vertex.normal[1], vertex.normal[2]);
  masks.push(vertex.mask[0], vertex.mask[1], vertex.mask[2], vertex.mask[3]);
  lights.push(vertex.light[0], vertex.light[1], vertex.light[2], vertex.light[3]);
  uvs.push(u, v);
  return positions.length / 3 - 1;
}

function buildChunkGeometry(
  data: TerrainBakeData,
  minX: number,
  maxX: number,
  minZ: number,
  maxZ: number,
  step: number,
): ChunkGeometrySet {
  const positions: number[] = [];
  const normals: number[] = [];
  const masks: number[] = [];
  const lights: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const cols = Math.floor((maxX - minX) / step) + 1;
  const rows = Math.floor((maxZ - minZ) / step) + 1;
  const ids: number[][] = [];
  for (let iz = 0; iz < rows; iz++) {
    const z = iz === rows - 1 ? maxZ : minZ + iz * step;
    const row: number[] = [];
    for (let ix = 0; ix < cols; ix++) {
      const x = ix === cols - 1 ? maxX : minX + ix * step;
      row.push(
        pushVertex(positions, normals, masks, lights, uvs, data, x, z, (x - minX) / 32, (z - minZ) / 32),
      );
    }
    ids.push(row);
  }
  for (let iz = 0; iz < rows - 1; iz++) {
    for (let ix = 0; ix < cols - 1; ix++) {
      const a = ids[iz][ix];
      const b = ids[iz][ix + 1];
      const c = ids[iz + 1][ix];
      const d = ids[iz + 1][ix + 1];
      indices.push(a, c, b, b, c, d);
    }
  }

  const skirtDepth = -Math.max(2.4, step * 0.45);
  const addSkirt = (edge: number[]): void => {
    for (let i = 0; i < edge.length - 1; i++) {
      const a = edge[i];
      const b = edge[i + 1];
      const ax = positions[a * 3];
      const ay = positions[a * 3 + 1];
      const az = positions[a * 3 + 2];
      const bx = positions[b * 3];
      const by = positions[b * 3 + 1];
      const bz = positions[b * 3 + 2];
      const va = positions.length / 3;
      positions.push(ax, ay + skirtDepth, az, bx, by + skirtDepth, bz);
      normals.push(
        normals[a * 3],
        normals[a * 3 + 1],
        normals[a * 3 + 2],
        normals[b * 3],
        normals[b * 3 + 1],
        normals[b * 3 + 2],
      );
      masks.push(...masks.slice(a * 4, a * 4 + 4), ...masks.slice(b * 4, b * 4 + 4));
      lights.push(...lights.slice(a * 4, a * 4 + 4), ...lights.slice(b * 4, b * 4 + 4));
      uvs.push(uvs[a * 2], uvs[a * 2 + 1], uvs[b * 2], uvs[b * 2 + 1]);
      indices.push(a, va, b, b, va, va + 1);
    }
  };
  const edgeEpsilon = data.cell * 0.5;
  if (Math.abs(minZ - data.minZ) <= edgeEpsilon) addSkirt(ids[0]);
  if (Math.abs(maxZ - data.maxZ) <= edgeEpsilon) addSkirt(ids[rows - 1].slice().reverse());
  if (Math.abs(minX - data.minX) <= edgeEpsilon) addSkirt(ids.map((row) => row[0]).reverse());
  if (Math.abs(maxX - data.maxX) <= edgeEpsilon) addSkirt(ids.map((row) => row[cols - 1]));

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute('normal', new BufferAttribute(new Float32Array(normals), 3));
  geometry.setAttribute('terrainMask', new BufferAttribute(new Float32Array(masks), 4));
  geometry.setAttribute('terrainLight', new BufferAttribute(new Float32Array(lights), 4));
  geometry.setAttribute('uv', new BufferAttribute(new Float32Array(uvs), 2));
  geometry.setIndex(indices);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return { step, geometry, triangles: indices.length / 3 };
}

function buildFarSeabed(material: Material): Mesh {
  const inner = 390;
  const outer = COVE.seabedRadius;
  const rings = 10;
  const segments = 144;
  const positions: number[] = [];
  const normals: number[] = [];
  const masks: number[] = [];
  const lights: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (let r = 0; r <= rings; r++) {
    const t = r / rings;
    const radius = inner + (outer - inner) * t;
    for (let s = 0; s <= segments; s++) {
      const a = (s / segments) * Math.PI * 2;
      const x = Math.cos(a) * radius;
      const z = Math.sin(a) * radius;
      const h = coveHeight(x, z);
      const m = coveMasks(x, z);
      positions.push(x, h, z);
      normals.push(0, 1, 0);
      masks.push(m.sand, m.grass, m.rock, m.cliff);
      lights.push(0.92, 1, 1, 0);
      uvs.push(s / segments, t);
    }
  }
  const stride = segments + 1;
  for (let r = 0; r < rings; r++) {
    for (let s = 0; s < segments; s++) {
      const a = r * stride + s;
      const b = a + 1;
      const c = a + stride;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute('normal', new BufferAttribute(new Float32Array(normals), 3));
  geometry.setAttribute('terrainMask', new BufferAttribute(new Float32Array(masks), 4));
  geometry.setAttribute('terrainLight', new BufferAttribute(new Float32Array(lights), 4));
  geometry.setAttribute('uv', new BufferAttribute(new Float32Array(uvs), 2));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  const mesh = new Mesh(geometry, material);
  mesh.name = 'terrain-far-seabed-ring';
  return mesh;
}

export function createTerrain(options: CreateTerrainOptions): CreatedTerrain {
  const tier = resolveTier(options.tier);
  const data = options.data;
  const group = new Group();
  group.name = 'test-cove-terrain';
  const material = createTerrainMaterial();
  const chunks: TerrainChunk[] = [];
  const chunkSize = 128;
  const steps = stepsForTier(tier);
  const thresholds = thresholdsForTier(tier);

  for (let z0 = data.minZ; z0 < data.maxZ - 0.1; z0 += chunkSize) {
    for (let x0 = data.minX; x0 < data.maxX - 0.1; x0 += chunkSize) {
      const x1 = Math.min(data.maxX, x0 + chunkSize);
      const z1 = Math.min(data.maxZ, z0 + chunkSize);
      const geometries = steps.map((step) => buildChunkGeometry(data, x0, x1, z0, z1, step));
      const mesh = new Mesh(geometries[geometries.length - 1].geometry, material);
      mesh.name = `terrain-chunk-${Math.round(x0)}-${Math.round(z0)}`;
      mesh.frustumCulled = true;
      group.add(mesh);
      chunks.push({
        mesh,
        center: new Vector3((x0 + x1) * 0.5, 8, (z0 + z1) * 0.5),
        geometries,
        current: geometries.length - 1,
      });
    }
  }

  const farSeabed = buildFarSeabed(material);
  group.add(farSeabed);
  const heightGrid: TerrainHeightGrid = {
    heights: data.heights,
    nx: data.nx,
    nz: data.nz,
    minX: data.minX,
    minZ: data.minZ,
    cell: data.cell,
  };
  const heightField = new CoveHeightField(heightGrid);

  return {
    group,
    heightField,
    heightGrid,
    update(camera: Camera) {
      for (const chunk of chunks) {
        const distance = camera.position.distanceTo(chunk.center);
        const lod = distance < thresholds[0] ? 0 : distance < thresholds[1] ? 1 : 2;
        const next = Math.min(chunk.geometries.length - 1, lod);
        if (next !== chunk.current) {
          chunk.current = next;
          chunk.mesh.geometry = chunk.geometries[next].geometry;
          chunk.mesh.geometry.boundingSphere ??= new Sphere(chunk.center, chunkSize);
        }
      }
    },
    dispose() {
      const seen = new Set<BufferGeometry>();
      for (const chunk of chunks) {
        for (const geometry of chunk.geometries) {
          if (!seen.has(geometry.geometry)) {
            geometry.geometry.dispose();
            seen.add(geometry.geometry);
          }
        }
      }
      farSeabed.geometry.dispose();
      material.dispose();
    },
  };
}
