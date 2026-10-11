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
import { buildTerrainRocks } from './terrain-rocks';
import { clamp, lerp } from '../../util/math';

interface ChunkGeometrySet {
  step: number;
  geometry: BufferGeometry;
  triangles: number;
}

interface TerrainChunk {
  mesh: Mesh;
  center: Vector3;
  /** The chunk's ground rectangle (the level of detail is picked by the distance to it). */
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  geometries: ChunkGeometrySet[];
  current: number;
}

type TerrainHeightGrid = HeightGridData;

export interface CreatedTerrain {
  group: Group;
  heightField: HeightField;
  /** Picks each chunk's level of detail from the camera's distance to the chunk (see `terrainLodThresholds`). */
  update(camera: Camera): void;
  /** Pins every chunk to one level of detail (0 = finest), or null to go back to distance (warm-ups). */
  setLod(lod: number | null): void;
  dispose(): void;
  heightGrid: TerrainHeightGrid;
}

export interface CreateTerrainOptions {
  tier: Tier | TierSettings;
  data: TerrainBakeData;
  name?: string;
  createRocks?: ((heightField: HeightField, data: TerrainBakeData, tier: Tier) => Group | null) | null;
  cloudShadowNode?: Node<'float'> | null;
  /**
   * Where a mesh covers the steep faces (the headland's cliff): there, the coarse LODs take the lowest
   * height near each vertex on steep ground, so their long slanted triangles stay behind that mesh
   * instead of poking through it. The height field itself (gameplay) is unchanged.
   */
  recessSteep?: { minX: number; maxX: number; minZ: number; maxZ: number } | null;
}

type RecessBox = NonNullable<CreateTerrainOptions['recessSteep']>;

/** The lowest height within `r` of (x, z) if the ground there is steep, else `h`. */
function recessedHeight(data: TerrainBakeData, x: number, z: number, h: number, r: number): number {
  let lo = h;
  let hi = h;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const s = sampleFloat(data.heights, data, x + Math.cos(a) * r, z + Math.sin(a) * r);
    lo = Math.min(lo, s);
    hi = Math.max(hi, s);
  }
  return hi - lo > r * 2.4 ? lo : h;
}

/** The lowest baked height at the grid points in a rectangle (clamped to the grid). */
function lowestHeightIn(
  data: TerrainBakeData,
  minX: number,
  maxX: number,
  minZ: number,
  maxZ: number,
): number {
  const ix0 = clamp(Math.floor((minX - data.minX) / data.cell), 0, data.nx - 1);
  const ix1 = clamp(Math.ceil((maxX - data.minX) / data.cell), 0, data.nx - 1);
  const iz0 = clamp(Math.floor((minZ - data.minZ) / data.cell), 0, data.nz - 1);
  const iz1 = clamp(Math.ceil((maxZ - data.minZ) / data.cell), 0, data.nz - 1);
  let lo = Infinity;
  for (let iz = iz0; iz <= iz1; iz++)
    for (let ix = ix0; ix <= ix1; ix++) lo = Math.min(lo, data.heights[iz * data.nx + ix]!);
  return lo;
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

/**
 * Level-of-detail distances in metres, measured from the camera to the nearest point of a chunk's
 * ground rectangle (not its centre): closer than the first is the finest level, then the next.
 * The first is well past the walking camera's reach (`WALK_RIG.maxDist`, 14 m), so the chunk under
 * the player and every chunk near the player always draw the finest level, the one the gameplay
 * height field matches.
 */
export function terrainLodThresholds(tier: Tier | TierSettings): readonly number[] {
  const t = resolveTier(tier).tier;
  if (t === 'lite' || t === 'low') return [40, 170];
  if (t === 'medium') return [64, 270];
  return [40, 200];
}

/** How far past a threshold (metres) a chunk must be before it goes coarser, so it doesn't flicker on the line. */
export const TERRAIN_LOD_HYSTERESIS = 12;

/** Horizontal distance from (x, z) to the nearest point of a chunk's rectangle (0 inside it). */
export function chunkBoxDistance(
  x: number,
  z: number,
  minX: number,
  maxX: number,
  minZ: number,
  maxZ: number,
): number {
  const dx = x < minX ? minX - x : x > maxX ? x - maxX : 0;
  const dz = z < minZ ? minZ - z : z > maxZ ? z - maxZ : 0;
  return Math.hypot(dx, dz);
}

/**
 * The level of detail for a chunk at `distance`, given the level it shows now: it goes finer as soon
 * as it crosses a threshold, but coarser only `hysteresis` metres past it.
 */
export function pickTerrainLod(
  distance: number,
  current: number,
  thresholds: readonly number[],
  hysteresis = TERRAIN_LOD_HYSTERESIS,
): number {
  let fine = 0;
  let coarse = 0;
  for (const t of thresholds) {
    if (distance >= t) fine++;
    if (distance >= t + hysteresis) coarse++;
  }
  return Math.min(fine, Math.max(current, coarse));
}

/** Bilinear sample of a baked grid channel (no allocation). */
function sampleGrid(
  values: Float32Array | Uint8Array,
  data: TerrainBakeData,
  x: number,
  z: number,
  component: number,
  stride: number,
): number {
  const gx = clamp((x - data.minX) / data.cell, 0, data.nx - 1.001);
  const gz = clamp((z - data.minZ) / data.cell, 0, data.nz - 1.001);
  const ix = Math.floor(gx);
  const iz = Math.floor(gz);
  const tx = gx - ix;
  const tz = gz - iz;
  const i00 = iz * data.nx + ix;
  const i01 = i00 + data.nx;
  const a = lerp(values[i00 * stride + component], values[(i00 + 1) * stride + component], tx);
  const b = lerp(values[i01 * stride + component], values[(i01 + 1) * stride + component], tx);
  return lerp(a, b, tz);
}

function sampleFloat(
  values: Float32Array,
  data: TerrainBakeData,
  x: number,
  z: number,
  component = 0,
  stride = 1,
): number {
  return sampleGrid(values, data, x, z, component, stride);
}

function sampleByte(
  values: Uint8Array,
  data: TerrainBakeData,
  x: number,
  z: number,
  component = 0,
  stride = 1,
): number {
  return sampleGrid(values, data, x, z, component, stride) / 255;
}

/**
 * Side of a terrain chunk, in metres. Chunks start at the data's min corner. Small enough that the
 * finest level drawn round the player covers little more than it needs to.
 */
export const TERRAIN_CHUNK_SIZE = 128;

/**
 * One axis of the mesh cell under a point: the cell's two vertex coordinates and the 0-1 position
 * between them. It follows `buildTerrain`'s chunk layout and `buildChunkGeometry`'s vertex columns
 * (a chunk's last column sits on the chunk edge, so that cell can be wider than `step`).
 */
class MeshAxis {
  a = 0;
  b = 0;
  t = 0;

  set(v: number, min: number, max: number, step: number): void {
    let chunk = Math.max(0, Math.floor((v - min) / TERRAIN_CHUNK_SIZE));
    while (chunk > 0 && min + chunk * TERRAIN_CHUNK_SIZE >= max - 0.1) chunk--;
    const c0 = min + chunk * TERRAIN_CHUNK_SIZE;
    const c1 = Math.min(max, c0 + TERRAIN_CHUNK_SIZE);
    const cols = Math.max(2, Math.floor((c1 - c0) / step) + 1);
    const i = clamp(Math.floor((v - c0) / step), 0, cols - 2);
    this.a = c0 + i * step;
    this.b = i + 1 === cols - 1 ? c1 : c0 + (i + 1) * step;
    this.t = clamp((v - this.a) / (this.b - this.a), 0, 1);
  }
}

/**
 * The ground as the terrain mesh draws it. Each mesh cell is split into two triangles along the
 * (x1, z0)–(x0, z1) diagonal (`indices.push(a, c, b, b, c, d)` in `buildChunkGeometry`), so a lookup
 * finds the cell, picks the triangle, and interpolates its three vertices (barycentric). The vertices
 * are the same bilinear samples of the baked grid that the mesh uses, so the result lies on the drawn
 * triangle's plane, not on the bilinear patch (which bulges off it on slopes).
 */
class BakedTerrainHeightField implements HeightField {
  private readonly ax = new MeshAxis();
  private readonly az = new MeshAxis();
  /** Barycentric weights of the cell's corners 00, 10, 01, 11 (one is always 0). */
  private w00 = 0;
  private w10 = 0;
  private w01 = 0;
  private w11 = 0;

  constructor(
    private readonly data: TerrainBakeData,
    /** The mesh grid step to match (the finest level of detail). */
    private readonly step: number,
  ) {}

  heightAt(x: number, z: number): number {
    if (!this.contains(x, z)) return -52;
    return this.triangleSample(this.data.heights, x, z, 0, 1);
  }

  /** The drawn shading normal: the triangle's vertex normals, blended like the GPU blends them. */
  normalAt(x: number, z: number, out: Float32Array | number[]): Float32Array | number[] {
    if (!this.contains(x, z)) {
      out[0] = 0;
      out[1] = 1;
      out[2] = 0;
      return out;
    }
    this.locate(x, z);
    let nx = 0;
    let ny = 0;
    let nz = 0;
    for (let k = 0; k < 4; k++) {
      const w = k === 0 ? this.w00 : k === 1 ? this.w10 : k === 2 ? this.w01 : this.w11;
      if (w <= 0) continue;
      const vx = k & 1 ? this.ax.b : this.ax.a;
      const vz = k & 2 ? this.az.b : this.az.a;
      const a = sampleFloat(this.data.normals, this.data, vx, vz, 0, 3);
      const b = sampleFloat(this.data.normals, this.data, vx, vz, 1, 3);
      const c = sampleFloat(this.data.normals, this.data, vx, vz, 2, 3);
      const s = w / (Math.hypot(a, b, c) || 1);
      nx += a * s;
      ny += b * s;
      nz += c * s;
    }
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

  /** Finds the mesh cell and triangle under (x, z) and sets the corner weights. */
  private locate(x: number, z: number): void {
    const d = this.data;
    this.ax.set(x, d.minX, d.maxX, this.step);
    this.az.set(z, d.minZ, d.maxZ, this.step);
    const tx = this.ax.t;
    const tz = this.az.t;
    if (tx + tz <= 1) {
      this.w00 = 1 - tx - tz;
      this.w10 = tx;
      this.w01 = tz;
      this.w11 = 0;
    } else {
      this.w00 = 0;
      this.w10 = 1 - tz;
      this.w01 = 1 - tx;
      this.w11 = tx + tz - 1;
    }
  }

  private triangleSample(
    values: Float32Array,
    x: number,
    z: number,
    component: number,
    stride: number,
  ): number {
    this.locate(x, z);
    const d = this.data;
    const { a: x0, b: x1 } = this.ax;
    const { a: z0, b: z1 } = this.az;
    let h = 0;
    if (this.w00 > 0) h += this.w00 * sampleFloat(values, d, x0, z0, component, stride);
    if (this.w10 > 0) h += this.w10 * sampleFloat(values, d, x1, z0, component, stride);
    if (this.w01 > 0) h += this.w01 * sampleFloat(values, d, x0, z1, component, stride);
    if (this.w11 > 0) h += this.w11 * sampleFloat(values, d, x1, z1, component, stride);
    return h;
  }

  private contains(x: number, z: number): boolean {
    return x >= this.data.minX && x <= this.data.maxX && z >= this.data.minZ && z <= this.data.maxZ;
  }
}

/** The gameplay height field for a terrain: it matches the tier's finest mesh triangles. */
export function createTerrainHeightField(data: TerrainBakeData, tier: Tier | TierSettings): HeightField {
  return new BakedTerrainHeightField(data, stepsForTier(resolveTier(tier))[0]!);
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
  recess = 0,
): number {
  const vertex = sampleVertex(data, x, z);
  const h = recess > 0 ? recessedHeight(data, x, z, vertex.h, recess) : vertex.h;
  positions.push(x, h + yOffset, z);
  normals.push(vertex.normal[0], vertex.normal[1], vertex.normal[2]);
  masks.push(vertex.mask[0], vertex.mask[1], vertex.mask[2], vertex.mask[3]);
  lights.push(vertex.light[0], vertex.light[1], vertex.light[2], vertex.light[3]);
  uvs.push(u, v);
  return positions.length / 3 - 1;
}

/** Builds one chunk's geometry, yielding every few rows (a slice point for the async build). */
function* buildChunkGeometry(
  data: TerrainBakeData,
  minX: number,
  maxX: number,
  minZ: number,
  maxZ: number,
  step: number,
  recessBox: RecessBox | null = null,
  coarsestStep = step,
): Generator<void, ChunkGeometrySet, void> {
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
      const recess =
        step > 1 &&
        recessBox &&
        x >= recessBox.minX &&
        x <= recessBox.maxX &&
        z >= recessBox.minZ &&
        z <= recessBox.maxZ
          ? step * 0.5 + 0.5
          : 0;
      row.push(
        pushVertex(
          positions,
          normals,
          masks,
          lights,
          uvs,
          data,
          x,
          z,
          (x - minX) / 32,
          (z - minZ) / 32,
          0,
          recess,
        ),
      );
    }
    ids.push(row);
    if ((iz & 3) === 3) yield;
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
  // Between chunks, a neighbour can show another level of detail, so its edge runs above or below this
  // one. An inner skirt hangs below the lowest ground any level's edge can reach there (each edge
  // vertex is on the ground, or lower where the steep recess applies), so no crack shows at the seam.
  const seamReach = coarsestStep + data.cell;
  const seamBand = data.cell + (recessBox ? coarsestStep * 0.5 + 0.5 : 0);
  const addSkirt = (edge: number[], inner: boolean): void => {
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
      let floor = Infinity;
      if (inner) {
        const alongX = Math.abs(bx - ax) > Math.abs(bz - az);
        const padX = alongX ? seamReach : seamBand;
        const padZ = alongX ? seamBand : seamReach;
        floor =
          lowestHeightIn(
            data,
            Math.min(ax, bx) - padX,
            Math.max(ax, bx) + padX,
            Math.min(az, bz) - padZ,
            Math.max(az, bz) + padZ,
          ) - 0.3;
      }
      positions.push(ax, Math.min(ay + skirtDepth, floor), az, bx, Math.min(by + skirtDepth, floor), bz);
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
  addSkirt(ids[0], Math.abs(minZ - data.minZ) > edgeEpsilon);
  addSkirt(ids[rows - 1].slice().reverse(), Math.abs(maxZ - data.maxZ) > edgeEpsilon);
  addSkirt(ids.map((row) => row[0]).reverse(), Math.abs(minX - data.minX) > edgeEpsilon);
  addSkirt(
    ids.map((row) => row[cols - 1]),
    Math.abs(maxX - data.maxX) > edgeEpsilon,
  );

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

/** Every chunk's geometry for one level of detail, built at once (tests and tools; the caller disposes). */
export function buildTerrainLodGeometries(
  data: TerrainBakeData,
  tier: Tier | TierSettings,
  lod = 0,
): BufferGeometry[] {
  const steps = stepsForTier(resolveTier(tier));
  const step = steps[lod]!;
  const out: BufferGeometry[] = [];
  for (let z0 = data.minZ; z0 < data.maxZ - 0.1; z0 += TERRAIN_CHUNK_SIZE) {
    for (let x0 = data.minX; x0 < data.maxX - 0.1; x0 += TERRAIN_CHUNK_SIZE) {
      const build = buildChunkGeometry(
        data,
        x0,
        Math.min(data.maxX, x0 + TERRAIN_CHUNK_SIZE),
        z0,
        Math.min(data.maxZ, z0 + TERRAIN_CHUNK_SIZE),
        step,
        null,
        steps[steps.length - 1],
      );
      for (;;) {
        const r = build.next();
        if (r.done) {
          out.push(r.value.geometry);
          break;
        }
      }
    }
  }
  return out;
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
  const steps = stepsForTier(tier);
  const thresholds = terrainLodThresholds(tier);
  const coarsest = steps[steps.length - 1]!;

  for (let z0 = data.minZ; z0 < data.maxZ - 0.1; z0 += TERRAIN_CHUNK_SIZE) {
    for (let x0 = data.minX; x0 < data.maxX - 0.1; x0 += TERRAIN_CHUNK_SIZE) {
      const x1 = Math.min(data.maxX, x0 + TERRAIN_CHUNK_SIZE);
      const z1 = Math.min(data.maxZ, z0 + TERRAIN_CHUNK_SIZE);
      const geometries: ChunkGeometrySet[] = [];
      for (const step of steps)
        geometries.push(
          yield* buildChunkGeometry(data, x0, x1, z0, z1, step, options.recessSteep ?? null, coarsest),
        );
      const mesh = new Mesh(geometries[geometries.length - 1].geometry, material);
      mesh.name = `terrain-chunk-${Math.round(x0)}-${Math.round(z0)}`;
      mesh.frustumCulled = true;
      group.add(mesh);
      chunks.push({
        mesh,
        center: new Vector3((x0 + x1) * 0.5, 8, (z0 + z1) * 0.5),
        minX: x0,
        maxX: x1,
        minZ: z0,
        maxZ: z1,
        geometries,
        current: geometries.length - 1,
      });
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
  const heightField = new BakedTerrainHeightField(data, steps[0]!);
  let pinned: number | null = null;
  const showLod = (chunk: (typeof chunks)[number], lod: number) => {
    const next = Math.min(chunk.geometries.length - 1, lod);
    if (next === chunk.current) return;
    chunk.current = next;
    chunk.mesh.geometry = chunk.geometries[next]!.geometry;
    chunk.mesh.geometry.boundingSphere ??= new Sphere(chunk.center, TERRAIN_CHUNK_SIZE);
  };
  yield;
  const rocks = options.createRocks
    ? options.createRocks(heightField, data, tier.tier)
    : yield* buildTerrainRocks(heightField, tier.tier);
  if (rocks) group.add(rocks);

  return {
    group,
    heightField,
    heightGrid,
    update(camera: Camera) {
      const { x, z } = camera.position;
      for (const chunk of chunks) {
        const distance = chunkBoxDistance(x, z, chunk.minX, chunk.maxX, chunk.minZ, chunk.maxZ);
        showLod(chunk, pinned ?? pickTerrainLod(distance, chunk.current, thresholds));
      }
    },
    setLod(lod: number | null) {
      pinned = lod;
      if (lod !== null) for (const chunk of chunks) showLod(chunk, lod);
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
