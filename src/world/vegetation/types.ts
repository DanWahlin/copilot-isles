import type { PerspectiveCamera, Group, Object3D, WebGPURenderer } from 'three/webgpu';
import type { HeightField, Tier } from '../contracts';
import type { TierSettings } from '../../engine/quality';
import type { VegetationExclude } from './exclusions';
import type { SeededRandom } from './random';
import type { FloraRules } from '../flora/types';

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

export type GrassKind = 'seaOats' | 'meadow' | 'creeper' | 'moss' | 'seedHead';

export interface VegetationMasks {
  sand: number;
  grass: number;
  rock: number;
  cliff: number;
}

export interface ScatterBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface SpeciesRule {
  countHigh: number;
  minDistance: number;
  maxSlopeDeg: number;
  score(x: number, z: number, y: number, masks: VegetationMasks): number;
  scale(rng: SeededRandom): number;
  lean(x: number, z: number, rng: SeededRandom): { x: number; z: number };
}

export type SpeciesRuleMap = Record<PlantSpecies, SpeciesRule>;

export interface CuratedPlant {
  species: 'palmTall' | 'palmCluster' | 'palmYoung';
  x: number;
  z: number;
  scale: number;
  rotation: number;
}

export interface IslandVegetationRules {
  bounds: ScatterBounds;
  grassBounds: ScatterBounds;
  rules: SpeciesRuleMap;
  excluded(x: number, z: number, y: number, normalY: number, masks: VegetationMasks): boolean;
  curatedPlants?: readonly CuratedPlant[];
  curatedLean?(plant: CuratedPlant, rng: SeededRandom): { x: number; z: number };
  heroPalmZones?: readonly { x: number; z: number; r: number }[];
  appendExtraPlants?(
    plants: Record<PlantSpecies, PlantInstance[]>,
    heightField: HeightField,
    tier: Tier,
    phase: 'beforeExternal' | 'afterExternal',
  ): void;
}

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

/** An island's grass and flowers to add with its plants: its rules and its ground. */
export interface FloraSource {
  rules: FloraRules;
  heightField: HeightField;
  heightGrid: HeightGrid;
}

/** Plants added after the island's own (another island's), drawn only while `group` is visible. */
export interface VegetationPatch {
  group: Group;
}

export interface VegetationSystem {
  group: Group;
  update(camera: PerspectiveCamera): void;
  /**
   * Adds another island's plants as their own batches and impostors, under a hidden group (show it
   * when that island's in view). Shares the loaded models and the impostor atlas; freed with the system.
   */
  addPlants(plants: readonly PlantInstance[], name: string, flora?: FloraSource): Promise<VegetationPatch>;
  /** Frees a patch from `addPlants` (its island has unloaded); the shared models and atlas stay. */
  removePlants(patch: VegetationPatch): void;
  /** The first island's own plants (batches, casters, grass, impostors), not the patches. */
  home(): Object3D[];
  /** Stops (or resumes) updating the first island's own plants while it's dormant. */
  setHomeAwake(on: boolean): void;
  dispose(): void;
  stats(): VegetationStats;
}

export interface CreateVegetationOptions {
  heightField: HeightField;
  heightGrid: HeightGrid;
  tier: Tier | TierSettings;
  renderer: WebGPURenderer;
  island: IslandVegetationRules;
  seed?: number;
  /** Optional dynamic exclusion mask (for village walkables, buildings, puzzle pads, etc.). */
  exclude?: VegetationExclude;
  /** Hand-placed plants (e.g. the village's palms) added to the scatter's instanced batches. */
  extraPlants?: readonly PlantInstance[];
  /** The island's grass and flowers (none without). */
  flora?: FloraRules;
}

export interface ScatterOptions {
  heightField: HeightField;
  tier: Tier | TierSettings;
  island: IslandVegetationRules;
  seed?: number;
  exclude?: VegetationExclude;
}
