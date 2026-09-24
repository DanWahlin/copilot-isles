import type { PerspectiveCamera, Group, WebGPURenderer } from 'three/webgpu';
import type { HeightField, Tier } from '../contracts';
import type { TierSettings } from '../../engine/quality';

export interface HeightGrid {
  heights: Float32Array;
  nx: number;
  nz: number;
  minX: number;
  minZ: number;
  cell: number;
}

export type PlantSpecies =
  'palmTall' | 'palmCluster' | 'palmYoung' | 'banana' | 'fern' | 'shrub' | 'broadleafTree';

export type GrassKind = 'seaOats' | 'meadow' | 'creeper';

export interface PlantInstance {
  species: PlantSpecies;
  x: number;
  y: number;
  z: number;
  scale: number;
  rotation: number;
  leanX: number;
  leanZ: number;
  colorSeed: number;
  lodSeed: number;
  slopeDeg: number;
}

export interface ScatterSummary {
  plants: Record<PlantSpecies, PlantInstance[]>;
  seed: number;
  attempts: number;
  rejected: number;
}

export interface VegetationStats {
  totalInstances: number;
  visibleInstances: number;
  drawCalls: number;
  triangles: number;
  pipelineCount: number;
  impostorBakeMs: number;
  grassCellsVisible: number;
  meshBatchesVisible: number;
}

export interface VegetationSystem {
  group: Group;
  update(camera: PerspectiveCamera): void;
  dispose(): void;
  stats(): VegetationStats;
}

export interface CreateVegetationOptions {
  heightField: HeightField;
  heightGrid: HeightGrid;
  tier: Tier | TierSettings;
  renderer: WebGPURenderer;
  seed?: number;
}

export interface ScatterOptions {
  heightField: HeightField;
  tier: Tier | TierSettings;
  seed?: number;
}
