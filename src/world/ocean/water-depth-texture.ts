import { ClampToEdgeWrapping, DataTexture, FloatType, LinearFilter, RedFormat } from 'three/webgpu';
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

  const data = new Float32Array(SIZE * SIZE);
  const spanX = WATER_DEPTH_BOUNDS.maxX - WATER_DEPTH_BOUNDS.minX;
  const spanZ = WATER_DEPTH_BOUNDS.maxZ - WATER_DEPTH_BOUNDS.minZ;
  for (let z = 0; z < SIZE; z++) {
    const wz = WATER_DEPTH_BOUNDS.minZ + (z / (SIZE - 1)) * spanZ;
    for (let x = 0; x < SIZE; x++) {
      const wx = WATER_DEPTH_BOUNDS.minX + (x / (SIZE - 1)) * spanX;
      data[z * SIZE + x] = floorHeightAt(wx, wz);
    }
  }

  cached = new DataTexture(data, SIZE, SIZE, RedFormat, FloatType);
  cached.magFilter = LinearFilter;
  cached.minFilter = LinearFilter;
  cached.wrapS = ClampToEdgeWrapping;
  cached.wrapT = ClampToEdgeWrapping;
  cached.needsUpdate = true;
  cached.name = 'ocean-floor-height';
  return cached;
}
