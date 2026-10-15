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
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Tier, HeightField } from '../contracts';
import { tierSettings, type TierSettings } from '../../engine/quality';
import type { HeightGridData } from './cove-height';
import type { TerrainBakeData } from './bake';
import { createTerrainMaterial } from './terrain-material';
import { plainShadowColor } from '../../engine/shadow-color';
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
  /**
   * Pins every chunk to one level of detail (0 = finest), or null to go back to distance (warm-ups).
   * The level after the coarsest shows the merged far blocks instead (`MERGED_BLOCKS`).
   */
  setLod(lod: number | null): void;
  /** How many levels `setLod` takes (the chunks' levels and the merged blocks): a warm-up draws each once. */
  readonly lodCount: number;
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
   * Where a mesh covers the steep faces (the headland's cliff): there, every level of detail lowers its
   * vertices on the steep faces (see `meshVertexHeight`), so its triangles stay behind that mesh
   * instead of poking through it. The finest level (the one the player walks on) lowers only vertices
   * whose every triangle is too steep to walk on (`FinestRecess`), so walkable ground doesn't move, and
   * the gameplay height field matches that level exactly. The covering mesh is traced from the field's
   * `shapeField` (the ground before the recess), so it doesn't follow the recess inland.
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

/** The lowest baked height on a ring of radius `r` round (x, z), or `h` if that is lower. */
function lowestAround(data: TerrainBakeData, x: number, z: number, h: number, r: number): number {
  let lo = h;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    lo = Math.min(lo, sampleFloat(data.heights, data, x + Math.cos(a) * r, z + Math.sin(a) * r));
  }
  return lo;
}

/** The recess box a coarser level of `step` metres uses (the finest level uses `FinestRecess`). */
function levelRecess(step: number, finestStep: number, recessBox: RecessBox | null): RecessBox | null {
  return step > finestStep ? recessBox : null;
}

/**
 * The player's walkable-slope limit (`minSlopeY` in the player controller): ground whose normal's y is
 * below it is too steep to climb.
 */
const WALKABLE_NORMAL_Y = 0.74;

/** The largest y on the great-circle arc from unit vector p to unit vector q (-1 if it's at an end). */
function arcMaxY(px: number, py: number, pz: number, qx: number, qy: number, qz: number): number {
  const cx = py * qz - pz * qy;
  const cy = pz * qx - px * qz;
  const cz = px * qy - py * qx;
  const cl = Math.hypot(cx, cy, cz);
  if (cl < 1e-9) return -1;
  // The circle's highest point: the pole (0, 1, 0) projected onto the arc's plane.
  const k = cy / cl;
  const wx = (-k * cx) / cl;
  const wy = 1 - k * k;
  const wz = (-k * cz) / cl;
  // It's on the arc if it is between p and q (p × w and w × q both point along p × q).
  const pw = (py * wz - pz * wy) * cx + (pz * wx - px * wz) * cy + (px * wy - py * wx) * cz;
  const wq = (wy * qz - wz * qy) * cx + (wz * qx - wx * qz) * cy + (wx * qy - wy * qx) * cz;
  return pw >= 0 && wq >= 0 ? Math.sqrt(Math.max(0, wy)) : -1;
}

/**
 * The largest y of the shading normal across a triangle whose unit vertex normals are p, q and r:
 * `normalAt` blends them barycentrically and normalises, which sweeps the spherical triangle p, q, r.
 * Its highest point is a corner, a point on an edge arc, or the pole itself if the triangle holds it.
 */
function triangleMaxNormalY(
  px: number,
  py: number,
  pz: number,
  qx: number,
  qy: number,
  qz: number,
  rx: number,
  ry: number,
  rz: number,
): number {
  const det = px * (qy * rz - qz * ry) - py * (qx * rz - qz * rx) + pz * (qx * ry - qy * rx);
  if (Math.abs(det) > 1e-12) {
    const a = (qz * rx - qx * rz) / det;
    const b = (rz * px - rx * pz) / det;
    const c = (pz * qx - px * qz) / det;
    if (a >= 0 && b >= 0 && c >= 0) return 1;
  }
  return Math.max(
    py,
    qy,
    ry,
    arcMaxY(px, py, pz, qx, qy, qz),
    arcMaxY(qx, qy, qz, rx, ry, rz),
    arcMaxY(rx, ry, rz, px, py, pz),
  );
}

/**
 * The vertex coordinates along one axis of the mesh (every chunk's columns, `buildChunkGeometry`),
 * between `lo` and `hi`.
 */
function meshAxisVertices(min: number, max: number, step: number, lo: number, hi: number): number[] {
  const out: number[] = [];
  for (let c0 = min; c0 < max - 0.1; c0 += TERRAIN_CHUNK_SIZE) {
    const c1 = Math.min(max, c0 + TERRAIN_CHUNK_SIZE);
    const cols = Math.floor((c1 - c0) / step) + 1;
    for (let i = 0; i < cols; i++) {
      const v = i === cols - 1 ? c1 : c0 + i * step;
      if (v < lo || v > hi) continue;
      if (out.length > 0 && Math.abs(v - out[out.length - 1]!) < 1e-6) continue;
      out.push(v);
    }
  }
  return out;
}

/**
 * The finest level's recess inside the recess box: a vertex whose six triangles are all too steep to
 * walk on (judged on the ground before the recess) drops to the lowest ground within `step / 2 + 0.5` m,
 * so the drawn face stays behind the cliff mesh. A triangle the player can walk on keeps all three
 * vertices, so walkable ground never moves. Built once per terrain; `heightAt` is a map lookup.
 */
class FinestRecess {
  private readonly lowered = new Map<number, number>();

  constructor(
    private readonly data: TerrainBakeData,
    step: number,
    private readonly box: RecessBox,
    shape: BakedTerrainHeightField,
  ) {
    const xs = meshAxisVertices(data.minX, data.maxX, step, box.minX, box.maxX);
    const zs = meshAxisVertices(data.minZ, data.maxZ, step, box.minZ, box.maxZ);
    const r = step * 0.5 + 0.5;
    const cellsX = xs.length - 1;
    // Each cell's two triangles (lower: 00, 10, 01; upper: 10, 01, 11, `buildChunkGeometry`), judged
    // once: 1 too steep to stand on anywhere, 2 not.
    const steep = new Uint8Array(Math.max(0, cellsX * (zs.length - 1) * 2));
    const n = new Float32Array(9);
    const unitNormal = (i: number, j: number, o: number): void => {
      const a = sampleFloat(data.normals, data, xs[i]!, zs[j]!, 0, 3);
      const b = sampleFloat(data.normals, data, xs[i]!, zs[j]!, 1, 3);
      const c = sampleFloat(data.normals, data, xs[i]!, zs[j]!, 2, 3);
      const l = Math.hypot(a, b, c) || 1;
      n[o] = a / l;
      n[o + 1] = b / l;
      n[o + 2] = c / l;
    };
    // A triangle is too steep when its face (on the ground before the recess) and its shading normal
    // (`HeightField.normalAt`, which the slope check reads) are too steep everywhere across it.
    const triangleSteep = (ci: number, cj: number, upper: number): boolean => {
      if (ci < 0 || cj < 0 || ci >= cellsX || cj >= zs.length - 1) return false;
      const t = (cj * cellsX + ci) * 2 + upper;
      if (steep[t] === 0) {
        const x0 = xs[ci]!;
        const x1 = xs[ci + 1]!;
        const z0 = zs[cj]!;
        const z1 = zs[cj + 1]!;
        const cx = upper ? (x1 * 2 + x0) / 3 : (x0 * 2 + x1) / 3;
        const cz = upper ? (z1 * 2 + z0) / 3 : (z0 * 2 + z1) / 3;
        let isSteep = shape.faceNormalY(cx, cz) < WALKABLE_NORMAL_Y;
        if (isSteep) {
          unitNormal(ci + 1, cj, 0);
          unitNormal(ci, cj + 1, 3);
          if (upper) unitNormal(ci + 1, cj + 1, 6);
          else unitNormal(ci, cj, 6);
          isSteep =
            triangleMaxNormalY(n[0]!, n[1]!, n[2]!, n[3]!, n[4]!, n[5]!, n[6]!, n[7]!, n[8]!) <
            WALKABLE_NORMAL_Y;
        }
        steep[t] = isSteep ? 1 : 2;
      }
      return steep[t] === 1;
    };
    // A vertex is lowered only when all six triangles that share it are too steep, so no point where
    // the player can stand moves.
    const steepFan = (i: number, j: number): boolean =>
      triangleSteep(i, j, 0) &&
      triangleSteep(i - 1, j, 1) &&
      triangleSteep(i - 1, j, 0) &&
      triangleSteep(i - 1, j - 1, 1) &&
      triangleSteep(i, j - 1, 0) &&
      triangleSteep(i, j - 1, 1);
    for (let j = 0; j < zs.length; j++) {
      const z = zs[j]!;
      for (let i = 0; i < xs.length; i++) {
        const x = xs[i]!;
        if (!steepFan(i, j)) continue;
        const h = sampleFloat(data.heights, data, x, z);
        const lo = lowestAround(data, x, z, h, r);
        if (lo < h) this.lowered.set(this.key(x, z), lo);
      }
    }
  }

  /** The vertex at (x, z) (baked height `h`), lowered if it is recessed. */
  heightAt(x: number, z: number, h: number): number {
    const b = this.box;
    if (x < b.minX || x > b.maxX || z < b.minZ || z > b.maxZ) return h;
    return this.lowered.get(this.key(x, z)) ?? h;
  }

  /** How many vertices are lowered (tests). */
  get size(): number {
    return this.lowered.size;
  }

  private key(x: number, z: number): number {
    return Math.round((x - this.data.minX) * 16) * 16777216 + Math.round((z - this.data.minZ) * 16);
  }
}

/**
 * The height of a terrain mesh vertex at (x, z) on a grid of `step` metres: the baked height, or, on a
 * steep face, lower: on the finest level by `finest` (`FinestRecess`), on a coarser level inside its
 * recess box (`levelRecess`) the lowest ground near it. The mesh builds every vertex with it and the
 * gameplay height field reads the finest level's vertices with it, so the two always agree.
 */
function meshVertexHeight(
  data: TerrainBakeData,
  x: number,
  z: number,
  step: number,
  recessBox: RecessBox | null,
  finest: FinestRecess | null = null,
): number {
  const h = sampleFloat(data.heights, data, x, z);
  if (finest) return finest.heightAt(x, z, h);
  if (!recessBox || x < recessBox.minX || x > recessBox.maxX || z < recessBox.minZ || z > recessBox.maxZ)
    return h;
  return recessedHeight(data, x, z, h, step * 0.5 + 0.5);
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

/**
 * Blocks of chunks (the whole terrain, 4 × 4, 2 × 2 and pairs; chunks across × along) merged at their
 * coarsest level (on Lite, blocks of up to four chunks at the middle level too): a block draws in place
 * of its chunks (one draw, the same material) while none of them is finer than that level, e.g. the
 * far side of the island you're on, or a whole island seen from the sea. It draws at its finest
 * chunk's level, so nothing gets coarser. Largest first.
 */
/**
 * A merged block draws whole even when only part of it is in view, so it's kept small (Low's whole
 * Thousand-Bough is over it, so there it merges 4 × 4). Only Lite and Low merge (PLAN §12.1: their
 * draw budgets are the tight ones; Medium and up have the room, and their coarse chunks are dense).
 */
const MAX_MERGED_TRIANGLES = 12_000;
const MERGED_BLOCKS: readonly (readonly [number, number])[] = [
  [Infinity, Infinity],
  [4, 4],
  [2, 2],
  [2, 1],
  [1, 2],
];

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
    /** The finest level's steep recess, if the terrain has one. */
    readonly recess: FinestRecess | null = null,
    /** The ground before the recess (meshes that cover the steep faces are traced from it). */
    readonly shapeField?: BakedTerrainHeightField,
  ) {}

  heightAt(x: number, z: number): number {
    if (!this.contains(x, z)) return -52;
    this.locate(x, z);
    const { a: x0, b: x1 } = this.ax;
    const { a: z0, b: z1 } = this.az;
    let h = 0;
    if (this.w00 > 0) h += this.w00 * this.vertexHeight(x0, z0);
    if (this.w10 > 0) h += this.w10 * this.vertexHeight(x1, z0);
    if (this.w01 > 0) h += this.w01 * this.vertexHeight(x0, z1);
    if (this.w11 > 0) h += this.w11 * this.vertexHeight(x1, z1);
    return h;
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

  /** The y of the drawn triangle's face normal under (x, z) (1 outside the terrain). */
  faceNormalY(x: number, z: number): number {
    if (!this.contains(x, z)) return 1;
    this.locate(x, z);
    const { a: x0, b: x1 } = this.ax;
    const { a: z0, b: z1 } = this.az;
    let gx: number;
    let gz: number;
    if (this.w11 === 0) {
      const h00 = this.vertexHeight(x0, z0);
      gx = (this.vertexHeight(x1, z0) - h00) / (x1 - x0);
      gz = (this.vertexHeight(x0, z1) - h00) / (z1 - z0);
    } else {
      const h11 = this.vertexHeight(x1, z1);
      gx = (h11 - this.vertexHeight(x0, z1)) / (x1 - x0);
      gz = (h11 - this.vertexHeight(x1, z0)) / (z1 - z0);
    }
    return 1 / Math.sqrt(1 + gx * gx + gz * gz);
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

  /** A finest-level vertex's height, built like the mesh builds it. */
  private vertexHeight(x: number, z: number): number {
    return meshVertexHeight(this.data, x, z, this.step, null, this.recess);
  }

  private contains(x: number, z: number): boolean {
    return x >= this.data.minX && x <= this.data.maxX && z >= this.data.minZ && z <= this.data.maxZ;
  }
}

/** The finest level's height field, with its steep recess (and the ground before it) if `recessSteep` is set. */
function finestHeightField(
  data: TerrainBakeData,
  step: number,
  recessSteep: RecessBox | null,
): BakedTerrainHeightField {
  const shape = new BakedTerrainHeightField(data, step);
  if (!recessSteep) return shape;
  return new BakedTerrainHeightField(data, step, new FinestRecess(data, step, recessSteep, shape), shape);
}

/**
 * The gameplay height field for a terrain: it matches the tier's finest mesh triangles (with the same
 * steep recess as the mesh, if `recessSteep` is set; its `shapeField` is the ground before it).
 */
export function createTerrainHeightField(
  data: TerrainBakeData,
  tier: Tier | TierSettings,
  recessSteep: RecessBox | null = null,
): HeightField {
  return finestHeightField(data, stepsForTier(resolveTier(tier))[0]!, recessSteep);
}

/** Tent-filter taps (offset in footprints, weight) for a coarse level's vertex. */
const FOOTPRINT_TAPS = [
  [-1 / 3, 0.25],
  [0, 0.5],
  [1 / 3, 0.25],
] as const;

/**
 * A vertex's normal, baked light and masks at (x, z). A coarser level's vertex stands for a
 * `footprint`-wide patch of the 2 m bake, so its normal and light are the patch's (tent-filtered)
 * mean, not the one grid point under it: point samples alias on steep faces, where every few metres
 * of relief turns the normal and the sun's visibility, and the GPU then stretches whichever value a
 * vertex caught down the face's tall triangles into streaks. The finest level (footprint 0) samples
 * the point, like `BakedTerrainHeightField.normalAt`.
 */
function sampleVertex(
  data: TerrainBakeData,
  x: number,
  z: number,
  footprint = 0,
): {
  normal: [number, number, number];
  light: [number, number, number, number];
  mask: [number, number, number, number];
} {
  let nx = 0;
  let ny = 0;
  let nz = 0;
  const light: [number, number, number, number] = [0, 0, 0, 0];
  const taps = footprint > data.cell ? FOOTPRINT_TAPS : ([[0, 1]] as const);
  for (const [oz, wz] of taps)
    for (const [ox, wx] of taps) {
      const sx = x + ox * footprint;
      const sz = z + oz * footprint;
      const w = wx * wz;
      nx += sampleFloat(data.normals, data, sx, sz, 0, 3) * w;
      ny += sampleFloat(data.normals, data, sx, sz, 1, 3) * w;
      nz += sampleFloat(data.normals, data, sx, sz, 2, 3) * w;
      light[0] += sampleByte(data.ao, data, sx, sz) * w;
      light[1] += sampleByte(data.sunMorning, data, sx, sz) * w;
      light[2] += sampleByte(data.sunGolden, data, sx, sz) * w;
      light[3] += sampleByte(data.rim, data, sx, sz) * w;
    }
  const normalLength = Math.hypot(nx, ny, nz) || 1;
  return {
    normal: [nx / normalLength, ny / normalLength, nz / normalLength],
    light,
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
  step: number,
  recessBox: RecessBox | null,
  finest: FinestRecess | null,
  footprint: number,
): number {
  const vertex = sampleVertex(data, x, z, footprint);
  positions.push(x, meshVertexHeight(data, x, z, step, recessBox, finest), z);
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
  finestStep = step,
  finest: FinestRecess | null = null,
): Generator<void, ChunkGeometrySet, void> {
  const vertexRecess = levelRecess(step, finestStep, recessBox);
  const finestRecess = step === finestStep ? finest : null;
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
          step,
          vertexRecess,
          finestRecess,
          step > finestStep ? step : 0,
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
  recessSteep: RecessBox | null = null,
): BufferGeometry[] {
  const steps = stepsForTier(resolveTier(tier));
  const step = steps[lod]!;
  const finest = lod === 0 && recessSteep ? finestHeightField(data, step, recessSteep).recess : null;
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
        recessSteep,
        steps[steps.length - 1],
        steps[0],
        finest,
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
  const material = plainShadowColor(
    createTerrainMaterial({ tier: tier.tier, cloudShadowNode: options.cloudShadowNode }),
  );
  const chunks: TerrainChunk[] = [];
  const steps = stepsForTier(tier);
  const thresholds = terrainLodThresholds(tier);
  const coarsest = steps[steps.length - 1]!;
  const heightField = finestHeightField(data, steps[0]!, options.recessSteep ?? null);
  yield;

  for (let z0 = data.minZ; z0 < data.maxZ - 0.1; z0 += TERRAIN_CHUNK_SIZE) {
    for (let x0 = data.minX; x0 < data.maxX - 0.1; x0 += TERRAIN_CHUNK_SIZE) {
      const x1 = Math.min(data.maxX, x0 + TERRAIN_CHUNK_SIZE);
      const z1 = Math.min(data.maxZ, z0 + TERRAIN_CHUNK_SIZE);
      const geometries: ChunkGeometrySet[] = [];
      for (const step of steps)
        geometries.push(
          yield* buildChunkGeometry(
            data,
            x0,
            x1,
            z0,
            z1,
            step,
            options.recessSteep ?? null,
            coarsest,
            steps[0],
            heightField.recess,
          ),
        );
      const mesh = new Mesh(geometries[geometries.length - 1].geometry, material);
      mesh.name = `terrain-chunk-${Math.round(x0)}-${Math.round(z0)}`;
      mesh.frustumCulled = true;
      // The ground takes the sun's shadows where the tier draws them (cove-scene skips them on Low).
      mesh.receiveShadow = true;
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
  // The merged far blocks, largest first; each one's chunks by index.
  const blocks: { meshes: (Mesh | null)[]; members: number[] }[] = [];
  const coarsestLod = steps.length - 1;
  const mergedLod = steps.length;
  const merges = tier.tier === 'lite' || tier.tier === 'low';
  for (const [sx, sz] of merges ? MERGED_BLOCKS : []) {
    const bySpot = new Map<string, number[]>();
    chunks.forEach((c, i) => {
      const ix = Math.floor(Math.round((c.minX - data.minX) / TERRAIN_CHUNK_SIZE) / sx);
      const iz = Math.floor(Math.round((c.minZ - data.minZ) / TERRAIN_CHUNK_SIZE) / sz);
      const key = Number.isFinite(sx) ? `${ix},${iz}` : 'all';
      const list = bySpot.get(key);
      if (list) list.push(i);
      else bySpot.set(key, [i]);
    });
    for (const [key, members] of bySpot) {
      // One chunk, or the same chunks as a bigger block: nothing saved.
      if (
        members.length < 2 ||
        blocks.some((b) => b.members.length === members.length && b.members.every((m, k) => m === members[k]))
      )
        continue;
      // Lite merges blocks of up to four chunks from the middle level too (its chunks there are a few
      // hundred triangles each); a bigger block at that level would draw too many of them out of view.
      const firstMergedLod =
        tier.tier === 'lite' && members.length <= 4 ? Math.min(1, coarsestLod) : coarsestLod;
      const meshes: (Mesh | null)[] = [];
      for (let lod = 0; lod <= coarsestLod; lod++) {
        let triangles = 0;
        for (const i of members) triangles += chunks[i]!.geometries[lod]!.triangles;
        if (lod < firstMergedLod || triangles > MAX_MERGED_TRIANGLES) {
          meshes.push(null);
          continue;
        }
        const geometry = mergeGeometries(
          members.map((i) => chunks[i]!.geometries[lod]!.geometry),
          false,
        );
        if (!geometry) {
          meshes.push(null);
          continue;
        }
        geometry.computeBoundingBox();
        geometry.computeBoundingSphere();
        const mesh = new Mesh(geometry, material);
        const where = Number.isFinite(sx) ? `${sx}x${sz}-${key.replace(',', '-')}` : 'all';
        mesh.name = `terrain-chunks-${where}-lod${lod}`;
        mesh.frustumCulled = true;
        mesh.receiveShadow = true;
        mesh.visible = false;
        group.add(mesh);
        meshes.push(mesh);
        yield;
      }
      if (meshes.some((m) => m)) blocks.push({ meshes, members });
    }
  }
  // Which chunks a shown block covers, refilled each frame.
  const covered = new Uint8Array(chunks.length);
  let pinned: number | null = null;
  const placeBlocks = () => {
    covered.fill(0);
    for (const block of blocks) {
      // A block draws at its finest chunk's level, if that level is merged and no bigger block covers it.
      let level = -1;
      if (pinned === null) {
        level = coarsestLod;
        for (const i of block.members) {
          if (covered[i]) {
            level = -1;
            break;
          }
          level = Math.min(level, chunks[i]!.current);
        }
        if (level >= 0 && block.meshes[level]) for (const i of block.members) covered[i] = 1;
      }
      for (let lod = 0; lod < block.meshes.length; lod++) {
        const mesh = block.meshes[lod];
        if (mesh) mesh.visible = pinned === mergedLod || (pinned === null && lod === level);
      }
    }
    for (let i = 0; i < chunks.length; i++) chunks[i]!.mesh.visible = pinned !== mergedLod && !covered[i];
  };
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
      placeBlocks();
    },
    setLod(lod: number | null) {
      pinned = lod;
      if (lod !== null) for (const chunk of chunks) showLod(chunk, lod);
      placeBlocks();
    },
    lodCount: blocks.length ? mergedLod + 1 : steps.length,
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
      for (const block of blocks) for (const mesh of block.meshes) mesh?.geometry.dispose();
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
