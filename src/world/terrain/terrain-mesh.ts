import {
  BufferAttribute,
  BufferGeometry,
  Camera,
  Group,
  Mesh,
  Sphere,
  Vector3,
  type Node,
} from 'three/webgpu';
import type { Tier, HeightField } from '../contracts';
import { tierSettings, type TierSettings } from '../../engine/quality';
import type { HeightGridData } from './cove-height';
import type { TerrainBakeData } from './bake';
import { createTerrainMaterial } from './terrain-material';
import { createTerrainRocks } from './terrain-rocks';
import { clamp, lerp } from '../../util/math';

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

type TerrainHeightGrid = HeightGridData;

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
  name?: string;
  createRocks?: ((heightField: HeightField, data: TerrainBakeData, tier: Tier) => Group | null) | null;
  cloudShadowNode?: Node<'float'> | null;
}

function resolveTier(tier: Tier | TierSettings): TierSettings {
  return typeof tier === 'string' ? tierSettings(tier) : tier;
}

function stepsForTier(tier: TierSettings): readonly number[] {
  if (tier.tier === 'lite') return [4, 8, 16];
  if (tier.tier === 'low') return [3, 6, 12];
  if (tier.tier === 'medium') return [2, 4, 8];
  return [1, 2, 3];
}

function thresholdsForTier(tier: TierSettings): readonly number[] {
  if (tier.tier === 'lite' || tier.tier === 'low') return [110, 285];
  if (tier.tier === 'medium') return [190, 400];
  return [115, 320];
}

function bilinearIndices(
  data: TerrainBakeData,
  x: number,
  z: number,
): [number, number, number, number, number, number] {
  const gx = clamp((x - data.minX) / data.cell, 0, data.nx - 1.001);
  const gz = clamp((z - data.minZ) / data.cell, 0, data.nz - 1.001);
  const ix = Math.floor(gx);
  const iz = Math.floor(gz);
  const tx = gx - ix;
  const tz = gz - iz;
  const i00 = iz * data.nx + ix;
  return [i00, i00 + 1, i00 + data.nx, i00 + data.nx + 1, tx, tz];
}

function sampleFloat(
  values: Float32Array,
  data: TerrainBakeData,
  x: number,
  z: number,
  component = 0,
  stride = 1,
): number {
  const [i00, i10, i01, i11, tx, tz] = bilinearIndices(data, x, z);
  const a = lerp(values[i00 * stride + component], values[i10 * stride + component], tx);
  const b = lerp(values[i01 * stride + component], values[i11 * stride + component], tx);
  return lerp(a, b, tz);
}

function sampleByte(
  values: Uint8Array,
  data: TerrainBakeData,
  x: number,
  z: number,
  component = 0,
  stride = 1,
): number {
  const [i00, i10, i01, i11, tx, tz] = bilinearIndices(data, x, z);
  const a = lerp(values[i00 * stride + component], values[i10 * stride + component], tx);
  const b = lerp(values[i01 * stride + component], values[i11 * stride + component], tx);
  return lerp(a, b, tz) / 255;
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
  const nx = sampleFloat(data.normals, data, x, z, 0, 3);
  const ny = sampleFloat(data.normals, data, x, z, 1, 3);
  const nz = sampleFloat(data.normals, data, x, z, 2, 3);
  const normalLength = Math.hypot(nx, ny, nz) || 1;
  return {
    h: sampleFloat(data.heights, data, x, z),
    normal: [nx / normalLength, ny / normalLength, nz / normalLength],
    light: [
      sampleByte(data.ao, data, x, z),
      sampleByte(data.sunMorning, data, x, z),
      sampleByte(data.sunGolden, data, x, z),
      sampleByte(data.rim, data, x, z),
    ],
    mask: [
      sampleByte(data.masks, data, x, z, 0, 4),
      sampleByte(data.masks, data, x, z, 1, 4),
      sampleByte(data.masks, data, x, z, 2, 4),
      sampleByte(data.masks, data, x, z, 3, 4),
    ],
  };
}

class BakedTerrainHeightField implements HeightField {
  constructor(private readonly data: TerrainBakeData) {}

  heightAt(x: number, z: number): number {
    if (!this.contains(x, z)) return -52;
    return sampleFloat(this.data.heights, this.data, x, z);
  }

  normalAt(x: number, z: number, out: Float32Array | number[]): Float32Array | number[] {
    if (!this.contains(x, z)) {
      out[0] = 0;
      out[1] = 1;
      out[2] = 0;
      return out;
    }
    const nx = sampleFloat(this.data.normals, this.data, x, z, 0, 3);
    const ny = sampleFloat(this.data.normals, this.data, x, z, 1, 3);
    const nz = sampleFloat(this.data.normals, this.data, x, z, 2, 3);
    const len = Math.hypot(nx, ny, nz) || 1;
    out[0] = nx / len;
    out[1] = ny / len;
    out[2] = nz / len;
    return out;
  }

  masksAt(x: number, z: number): { sand: number; grass: number; rock: number; cliff: number } {
    if (!this.contains(x, z)) return { sand: 0, grass: 0, rock: 1, cliff: 0 };
    return {
      sand: sampleByte(this.data.masks, this.data, x, z, 0, 4),
      grass: sampleByte(this.data.masks, this.data, x, z, 1, 4),
      rock: sampleByte(this.data.masks, this.data, x, z, 2, 4),
      cliff: sampleByte(this.data.masks, this.data, x, z, 3, 4),
    };
  }

  private contains(x: number, z: number): boolean {
    return x >= this.data.minX && x <= this.data.maxX && z >= this.data.minZ && z <= this.data.maxZ;
  }
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

export function createTerrain(options: CreateTerrainOptions): CreatedTerrain {
  const steps = buildTerrain(options);
  for (;;) {
    const r = steps.next();
    if (r.done) return r.value;
  }
}

/**
 * The same terrain, built a chunk at a time: `breathe` runs between chunks (resolve it on the next
 * frame to keep the screen moving while the island builds).
 */
export async function createTerrainAsync(
  options: CreateTerrainOptions,
  breathe: () => Promise<void>,
): Promise<CreatedTerrain> {
  const steps = buildTerrain(options);
  for (;;) {
    const r = steps.next();
    if (r.done) return r.value;
    await breathe();
  }
}

/** Builds the terrain, yielding after each chunk. */
function* buildTerrain(options: CreateTerrainOptions): Generator<void, CreatedTerrain, void> {
  const tier = resolveTier(options.tier);
  const data = options.data;
  const group = new Group();
  group.name = options.name ?? 'test-cove-terrain';
  const material = createTerrainMaterial({ tier: tier.tier, cloudShadowNode: options.cloudShadowNode });
  const chunks: TerrainChunk[] = [];
  const chunkSize = 256;
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
      yield;
    }
  }

  const heightGrid: TerrainHeightGrid = {
    heights: data.heights,
    nx: data.nx,
    nz: data.nz,
    minX: data.minX,
    minZ: data.minZ,
    cell: data.cell,
  };
  const heightField = new BakedTerrainHeightField(data);
  const rocks = (options.createRocks ?? createTerrainRocks)(heightField, data, tier.tier);
  if (rocks) group.add(rocks);

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
      rocks?.traverse((object) => {
        if (!(object instanceof Mesh)) return;
        object.geometry.dispose();
        if (Array.isArray(object.material)) object.material.forEach((m) => m.dispose());
        else object.material.dispose();
      });
      material.dispose();
    },
  };
}
