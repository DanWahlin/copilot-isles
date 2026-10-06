import type { PerspectiveCamera, Group, WebGPURenderer } from 'three/webgpu';
import type { HeightField, Tier } from '../contracts';
import type { TierSettings } from '../../engine/quality';
import type { VegetationExclude } from './exclusions';

export interface HeightGrid {
  heights: Float32Array;
  nx: number;
  nz: number;
  minX: number;
  minZ: number;
  cell: number;
}

export type PlantSpecies =
  | 'palmTall'
  | 'palmCluster'
  | 'palmYoung'
  | 'banana'
  | 'fern'
  | 'shrub'
  | 'broadleafTree'
  | 'flowerBush'
  | 'log'
  | 'cactus'
  | 'brush'
  | 'cypress';

export type GrassKind = 'seaOats' | 'meadow' | 'creeper' | 'wildflower' | 'seedHead';

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
  /** Optional dynamic exclusion mask (for village walkables, buildings, puzzle pads, etc.). */
  exclude?: VegetationExclude;
  /** Hand-placed plants (e.g. the village's palms) added to the scatter's instanced batches. */
  extraPlants?: readonly PlantInstance[];
}

export interface ScatterOptions {
  heightField: HeightField;
  tier: Tier | TierSettings;
  seed?: number;
  exclude?: VegetationExclude;
}
