import {
  Mesh,
  type InstancedMesh,
  type Material,
  type Node,
  type Object3D,
  type Scene,
  type Vector3,
} from 'three/webgpu';
import { bakeInstances } from '../engine/instancing';
import type { TierSettings } from '../engine/quality';
import { loadLodSimplifier } from './characters/character-lod';
import type { CircleObstacle } from './contracts';
import type { FloraRules } from './flora/types';
import { createBirds, type BirdsSystem } from './life/birds';
import { skipSunShadows } from './sky/cached-sun-shadow';
import type { TerrainBakeData } from './terrain/bake';
import type { CompositeHeightField } from './terrain/composite-height-field';
import type { CreatedTerrain } from './terrain/terrain-mesh';
import type { VegetationSystem } from './vegetation';
import type { PlantInstance, VegetationPatch } from './vegetation/types';
import { LITE_ROCK_ERROR, simplifyInPlace } from './village/chunks';

/** What a streamed island (Port Meridian, Thousand-Bough) takes from the world it streams into. */
export interface IslandStreamContext {
  scene: Scene;
  tier: TierSettings;
  packBase: string;
  cloudShadowNode?: Node<'float'> | null;
  breathe: () => Promise<void>;
  heightField: CompositeHeightField;
  /** The ship's obstacles (the island's quays, piles and rocks join them while it's in). */
  shipObstacles: CircleObstacle[];
  vegetation: () => VegetationSystem | null;
  birds: boolean;
  /** Where the tier has sun shadows but the islands don't take them (cove-scene's `skipIslandShadows`). */
  skipShadows: boolean;
  disabled: boolean;
  /**
   * Loads the island's course data (its chapter's part, src/course/load.ts) at the stream's request
   * priority. The stream waits for it with its terrain, so the island's quests, scripts and puzzles
   * are in before anything on it is made; a part that fails fails the stream, which tries again.
   */
  courseData?: (priority: RequestPriority) => Promise<void>;
}

/**
 * Puts a streamed island's terrain and coast foam in the scene, hidden until its warm-up shows them,
 * and its ground into the world's height field.
 */
export function addIslandGround(
  ctx: Pick<IslandStreamContext, 'scene' | 'heightField'>,
  data: TerrainBakeData,
  terrain: CreatedTerrain,
  foam: Mesh,
): void {
  terrain.group.visible = false;
  foam.visible = false;
  ctx.scene.add(terrain.group, foam);
  ctx.heightField.add(
    { minX: data.minX, maxX: data.maxX, minZ: data.minZ, maxZ: data.maxZ },
    terrain.heightField,
  );
}

/** Takes a streamed island's ground out of the world's height field and its obstacles off the ship's. */
export function removeIslandGround(
  ctx: Pick<IslandStreamContext, 'heightField' | 'shipObstacles'>,
  terrain: CreatedTerrain | null,
  obstacles: readonly CircleObstacle[],
): void {
  if (terrain) ctx.heightField.remove(terrain.heightField);
  for (const o of obstacles) {
    const i = ctx.shipObstacles.indexOf(o);
    if (i >= 0) ctx.shipObstacles.splice(i, 1);
  }
}

/** A streamed island's plants as their own vegetation batches, shown with the island. */
export async function addIslandPlants(
  ctx: Pick<IslandStreamContext, 'skipShadows'>,
  vegetation: VegetationSystem,
  flora: readonly PlantInstance[],
  name: string,
  rules: FloraRules,
  terrain: CreatedTerrain,
): Promise<VegetationPatch> {
  const plants = await vegetation.addPlants(flora, name, {
    rules,
    heightField: terrain.heightField,
    heightGrid: terrain.heightGrid,
  });
  if (ctx.skipShadows) skipSunShadows(plants.group);
  return plants;
}

/** Gulls wheeling over a streamed island, hidden until it's shown; null where there are none. */
export function addIslandBirds(
  ctx: Pick<IslandStreamContext, 'scene' | 'tier' | 'birds'>,
  center: Vector3,
  radius: number,
  seed: number,
): BirdsSystem | null {
  if (!ctx.birds || ctx.tier.birds <= 0) return null;
  const birds = createBirds({ tier: ctx.tier, perches: [], center, radius, seed });
  birds.group.visible = false;
  ctx.scene.add(birds.group);
  return birds;
}

/**
 * Lite (PLAN §12.1, the weakest GPUs): the islands' loose instanced rocks (not cliffs or sea stacks)
 * draw a coarser copy of their shape, all baked into one draw (they never move). Done before the
 * island warms, so nothing uploads twice.
 */
export async function coarserRocksOnLite(root: Object3D, tier: TierSettings): Promise<void> {
  if (tier.tier !== 'lite') return;
  const simplify = await loadLodSimplifier();
  const rocks: InstancedMesh[] = [];
  root.traverse((o) => {
    const mesh = o as InstancedMesh;
    if (mesh.isInstancedMesh && /rocks-Rock_/.test(mesh.name)) rocks.push(mesh);
  });
  if (rocks.length === 0) return;
  if (simplify) for (const mesh of rocks) simplifyInPlace(mesh.geometry, simplify, LITE_ROCK_ERROR);
  const parent = rocks[0]!.parent;
  const material = rocks[0]!.material;
  const same = rocks.filter((mesh) => mesh.parent === parent && mesh.material === material);
  const baked = parent ? bakeInstances(same) : null;
  if (!parent || !baked) return;
  const mesh = new Mesh(baked, material);
  mesh.name = `${parent.name}-Rock_baked`;
  mesh.castShadow = false;
  mesh.receiveShadow = same[0]!.receiveShadow;
  for (const rock of same) {
    rock.removeFromParent();
    rock.geometry.dispose();
    rock.dispose();
  }
  parent.add(mesh);
}

/**
 * Lite: the flowing water strips (mill race, fountain, Meridian's brooks) draw in one pass, not a back
 * then a front pass (three's default for a two-sided transparent material). They're shallow strips
 * seen from above, so the order of their two sides doesn't show.
 */
export function singlePassWaterOnLite(root: Object3D, tier: TierSettings): void {
  if (tier.tier !== 'lite') return;
  root.traverse((o) => {
    const mesh = o as Mesh;
    if (mesh.isMesh && mesh.userData.waterStrips) (mesh.material as Material).forceSinglePass = true;
  });
}

/** Disposes every geometry and material under `root` (a group that owns them all). */
export function disposeTree(root: Object3D): void {
  root.traverse((o) => {
    const m = o as Object3D & { geometry?: { dispose(): void }; material?: { dispose(): void } };
    m.geometry?.dispose();
    m.material?.dispose();
  });
}
