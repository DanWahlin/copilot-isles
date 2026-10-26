import { ClampToEdgeWrapping, DataTexture, FloatType, LinearFilter, RedFormat } from 'three/webgpu';
import type { TerrainBakeData } from '../terrain/bake';
import { DEFAULT_TERRAIN_BOUNDS, coveHeight } from '../terrain/cove-height';
import { MERIDIAN, meridianHeight } from '../islands/meridian';

const SIZE = 512;
const MERIDIAN_MARGIN = 180;

export const WATER_DEPTH_BOUNDS = {
  minX: Math.min(DEFAULT_TERRAIN_BOUNDS.minX - 80, MERIDIAN.bounds.minX - MERIDIAN_MARGIN),
  maxX: Math.max(DEFAULT_TERRAIN_BOUNDS.maxX + 80, MERIDIAN.bounds.maxX + MERIDIAN_MARGIN),
  minZ: Math.min(DEFAULT_TERRAIN_BOUNDS.minZ - 80, MERIDIAN.bounds.minZ - MERIDIAN_MARGIN),
  maxZ: Math.max(DEFAULT_TERRAIN_BOUNDS.maxZ + 80, MERIDIAN.bounds.maxZ + MERIDIAN_MARGIN),
} as const;

let cached: DataTexture | null = null;

function isMeridianSample(x: number, z: number): boolean {
  return (
    x >= MERIDIAN.bounds.minX - MERIDIAN_MARGIN &&
    x <= MERIDIAN.bounds.maxX + MERIDIAN_MARGIN &&
    z >= MERIDIAN.bounds.minZ - MERIDIAN_MARGIN &&
    z <= MERIDIAN.bounds.maxZ + MERIDIAN_MARGIN
  );
}

function floorHeightAt(x: number, z: number): number {
  return isMeridianSample(x, z) ? meridianHeight(x, z) : coveHeight(x, z);
}

export function waterDepthTexture(): DataTexture {
  if (cached) return cached;
  const steps = bakeSteps();
  for (;;) {
    const r = steps.next();
    if (r.done) return r.value;
  }
}

/** Frees the cached textures' GPU copies (their data stays baked for the next voyage). */
export function releaseWaterDepthTexture(): void {
  cached?.dispose();
  placeholder?.dispose();
}

/**
 * Bakes the texture ahead of time, `budgetMs` of main-thread time per frame (e.g. on the title, so
 * the island build later finds it ready). Resolves once it's cached.
 */
export function prewarmWaterDepthTexture(budgetMs = 4): Promise<void> {
  if (cached) return Promise.resolve();
  const steps = bakeSteps();
  return new Promise((resolve) => {
    const step = () => {
      if (cached) return resolve();
      const end = performance.now() + budgetMs;
      while (performance.now() < end) if (steps.next().done) return resolve();
      requestAnimationFrame(step);
    };
    step();
  });
}

/** Fills the texture a row at a time (yielding after each); the first bake to finish is cached. */
function* bakeSteps(): Generator<void, DataTexture, void> {
  const data = new Float32Array(SIZE * SIZE);
  const spanX = WATER_DEPTH_BOUNDS.maxX - WATER_DEPTH_BOUNDS.minX;
  const spanZ = WATER_DEPTH_BOUNDS.maxZ - WATER_DEPTH_BOUNDS.minZ;
  for (let z = 0; z < SIZE; z++) {
    const wz = WATER_DEPTH_BOUNDS.minZ + (z / (SIZE - 1)) * spanZ;
    for (let x = 0; x < SIZE; x++) {
      const wx = WATER_DEPTH_BOUNDS.minX + (x / (SIZE - 1)) * spanX;
      data[z * SIZE + x] = floorHeightAt(wx, wz);
    }
    yield;
  }
  if (cached) return cached;
  cached = floorTexture(data, SIZE, 'ocean-floor-height');
  return cached;
}

/** A floor-height texture: one format, size class and filter for every tile (so a swap builds no shader). */
function floorTexture(data: Float32Array, size: number, name: string): DataTexture {
  const tex = new DataTexture(data, size, size, RedFormat, FloatType);
  tex.magFilter = LinearFilter;
  tex.minFilter = LinearFilter;
  tex.wrapS = ClampToEdgeWrapping;
  tex.wrapT = ClampToEdgeWrapping;
  tex.needsUpdate = true;
  tex.name = name;
  return tex;
}

// ---------------------------------------------------------------------------------------------
// Island tiles: each streamed island's own floor (its baked terrain), one at a time in the ocean's
// second slot (the nearest to the camera). The home tile above (Anchorage and Port Meridian) stays.

/** One island's floor heights over its baked bounds, for the ocean's depth colour and shore foam. */
export interface WaterDepthTile {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
  readonly texture: DataTexture;
}

const TILE_SIZE = 512;
const tiles: WaterDepthTile[] = [];
let placeholder: DataTexture | null = null;

/** What the island slot holds while no island has a tile: a 1 × 1 deep floor, with the tiles' format and filters. */
export function waterDepthPlaceholder(): DataTexture {
  return (placeholder ??= floorTexture(new Float32Array([-58]), 1, 'ocean-floor-none'));
}

/**
 * Builds an island's tile from its baked terrain (bilinear over the bake's own grid), a few rows a
 * step; run it with the island's `breathe`. Outside the bake the floor is the deep floor. `floorAt` puts
 * the island's own floor where the bake's 2 m grid can't hold it (a lock's walls: the sea in a cut reads
 * deep to its walls, not a saw-tooth of shallows).
 */
export function* waterDepthTileFromTerrain(
  data: TerrainBakeData,
  name: string,
  floorAt: ((x: number, z: number) => number | null) | null = null,
): Generator<void, WaterDepthTile, void> {
  const out = new Float32Array(TILE_SIZE * TILE_SIZE);
  const { nx, nz, heights, cell } = data;
  const spanX = data.maxX - data.minX;
  const spanZ = data.maxZ - data.minZ;
  for (let row = 0; row < TILE_SIZE; row++) {
    const gz = Math.min(nz - 1.0001, ((row / (TILE_SIZE - 1)) * spanZ) / cell);
    const iz = Math.floor(gz);
    const tz = gz - iz;
    for (let col = 0; col < TILE_SIZE; col++) {
      const gx = Math.min(nx - 1.0001, ((col / (TILE_SIZE - 1)) * spanX) / cell);
      const ix = Math.floor(gx);
      const tx = gx - ix;
      const i = iz * nx + ix;
      const a = heights[i]! + (heights[i + 1]! - heights[i]!) * tx;
      const b = heights[i + nx]! + (heights[i + nx + 1]! - heights[i + nx]!) * tx;
      const pinned = floorAt
        ? floorAt(data.minX + (col / (TILE_SIZE - 1)) * spanX, data.minZ + (row / (TILE_SIZE - 1)) * spanZ)
        : null;
      out[row * TILE_SIZE + col] = pinned ?? a + (b - a) * tz;
    }
    if ((row & 31) === 31) yield;
  }
  return {
    minX: data.minX,
    maxX: data.maxX,
    minZ: data.minZ,
    maxZ: data.maxZ,
    texture: floorTexture(out, TILE_SIZE, `ocean-floor-${name}`),
  };
}

/**
 * Lends the ocean an island's tile while the island is in memory (the stream that adds it removes it
 * and frees its texture). Add it before the island's warm-up: the ocean binds the nearest tile at once,
 * so the warm's draws upload it.
 */
export function addWaterDepthTile(tile: WaterDepthTile): void {
  if (!tiles.includes(tile)) tiles.push(tile);
}

/**
 * Every lent tile's texture (an island's warm uploads them all: with two islands lent, the ocean binds
 * the nearest, so the other's first use would upload it mid-voyage).
 */
export function lentWaterDepthTextures(): DataTexture[] {
  return tiles.map((t) => t.texture);
}

/** Takes an island's tile back and frees its GPU copy. */
export function removeWaterDepthTile(tile: WaterDepthTile): void {
  const i = tiles.indexOf(tile);
  if (i >= 0) tiles.splice(i, 1);
  tile.texture.dispose();
}

/** The tile nearest to (x, z) (0 inside its bounds), or null when no island has one. No allocation. */
export function nearestWaterDepthTile(x: number, z: number): WaterDepthTile | null {
  let best: WaterDepthTile | null = null;
  let bestDistance = Infinity;
  for (const tile of tiles) {
    const dx = x < tile.minX ? tile.minX - x : x > tile.maxX ? x - tile.maxX : 0;
    const dz = z < tile.minZ ? tile.minZ - z : z > tile.maxZ ? z - tile.maxZ : 0;
    const distance = dx * dx + dz * dz;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = tile;
    }
  }
  return best;
}

/**
 * The island slot's bounds for the ocean's shader: (min x, min z, 1 / span x, 1 / span z), so a point's
 * uv is (p − min) × inverse span, inside the tile for 0-1. Empty (no tile): every point far outside
 * (a span of 0 would put every point at uv 0, inside).
 */
export function tileUvBounds(
  tile: WaterDepthTile | null,
  out: { set(x: number, y: number, z: number, w: number): unknown },
): void {
  if (tile) out.set(tile.minX, tile.minZ, 1 / (tile.maxX - tile.minX), 1 / (tile.maxZ - tile.minZ));
  else out.set(1e9, 1e9, 1, 1);
}
