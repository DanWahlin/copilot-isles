import {
  BufferGeometry,
  Color,
  Frustum,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  Object3D,
  Quaternion,
  Sphere,
  Vector3,
  type Group,
  type Material,
  type PerspectiveCamera,
  type Texture,
} from 'three/webgpu';
import { buildSlice } from '../../engine/build-slice';
import { markInstancesChanged, sharedInstancedMesh } from '../../engine/instancing';
import { islandsTakeSunShadows, tierSettings, type TierSettings } from '../../engine/quality';
import { assignCaster } from '../shadow-casters';
import type { Tier } from '../contracts';
import { createHeightDataTexture } from './materials';
import { GrassField } from './grass';
import { ImpostorBatch, bakeImpostorAtlas } from './impostors';
import {
  loadVegetationGeometries,
  palmMaterial,
  type PalmLod,
  type PalmVariant,
  type VegetationModelPart,
} from './model-loader';
import { scatterVegetationAsync } from './scatter';
import type {
  CreateVegetationOptions,
  IslandVegetationRules,
  PlantInstance,
  PlantSpecies,
  VegetationStats,
  VegetationSystem,
} from './types';
import { clamp01, smoothstep } from '../../util/math';
import { disposeMaterialWithTextures } from '../../util/dispose-three';

interface PlantBatch {
  species: PlantSpecies;
  mesh: InstancedMesh;
  fade: InstancedBufferAttribute;
  tint: InstancedBufferAttribute;
  instances: PlantInstance[];
  /** Each instance's tint (r, g, b), worked out once. */
  tints: Float32Array;
  /** Unscaled bounding radius about the plant's root (m), for the per-instance frustum test. */
  reach: number;
  trianglesPerInstance: number;
  nearOnly: boolean;
  farDistance: number;
  visible: number;
}

const TREE_LIKE = new Set<PlantSpecies>(['palmTall', 'palmCluster', 'palmYoung', 'broadleafTree']);
const tmpObject = new Object3D();
const tmpQuat = new Quaternion();
const tmpScale = new Vector3();
const shear = new Matrix4();
const tmpMatrix = new Matrix4();
const UP = new Vector3(0, 1, 0);
const viewProj = new Matrix4();
const frustum = new Frustum();
const plantSphere = new Sphere();
/**
 * Padding (m) on each plant's bounds in the per-instance frustum test. The batches don't cast sun
 * shadows (palms cast through their own casters, `createPalmCaster`) or show in the harbour mirror,
 * so only the main camera needs them.
 */
const PLANT_FRUSTUM_PAD = 1.5;

function resolveTier(tier: Tier | TierSettings): TierSettings {
  return typeof tier === 'string' ? tierSettings(tier) : tier;
}

function triangleCount(geometry: BufferGeometry): number {
  if (geometry.index) return Math.floor(geometry.index.count / 3);
  return Math.floor((geometry.getAttribute('position')?.count ?? 0) / 3);
}

function palmGeometryDistance(tier: TierSettings): number {
  if (tier.tier === 'lite') return tier.treeNear * 1.45;
  if (tier.tier === 'low') return tier.treeNear * 1.4;
  if (tier.tier === 'medium') return tier.treeNear * 1.55;
  return 285;
}

/** Distance where a species' live geometry dissolves into its impostor (shared by both sides). */
function geometryHandoff(species: PlantSpecies, tier: TierSettings): number {
  if (species === 'shrub' || species === 'flowerBush') return Math.min(45, tier.treeNear * 0.62);
  if (species.startsWith('palm')) return palmGeometryDistance(tier);
  return tier.treeNear;
}

function palmVariant(instance: PlantInstance): PalmVariant {
  return instance.lodSeed < 0.6 ? 'a' : 'b';
}

function palmLod(instance: PlantInstance, island: IslandVegetationRules): PalmLod {
  if (!instance.species.startsWith('palm')) return 'grove';
  for (const zone of island.heroPalmZones ?? []) {
    if (Math.hypot(instance.x - zone.x, instance.z - zone.z) < zone.r) return 'hero';
  }
  return 'grove';
}

function instancesForPart(
  instances: PlantInstance[],
  part: VegetationModelPart,
  island: IslandVegetationRules,
): PlantInstance[] {
  if (!instances[0]?.species.startsWith('palm')) return instances;
  return instances.filter(
    (instance) => palmVariant(instance) === part.palmVariant && palmLod(instance, island) === part.palmLod,
  );
}

function collectPalmInstances(scatter: Record<PlantSpecies, PlantInstance[]>): PlantInstance[] {
  return [...scatter.palmTall, ...scatter.palmCluster, ...scatter.palmYoung];
}

function tintFor(instance: PlantInstance): Color {
  const color = new Color();
  switch (instance.species) {
    case 'palmTall':
    case 'palmCluster':
    case 'palmYoung':
      color.setHSL(0.28 + instance.colorSeed * 0.045, 0.48, 0.39 + instance.colorSeed * 0.12);
      break;
    case 'banana':
      color.setHSL(0.25 + instance.colorSeed * 0.04, 0.55, 0.42 + instance.colorSeed * 0.13);
      break;
    case 'fern':
      color.setHSL(0.32 + instance.colorSeed * 0.05, 0.5, 0.32 + instance.colorSeed * 0.1);
      break;
    case 'shrub':
    case 'flowerBush':
      color.setHSL(0.27 + instance.colorSeed * 0.06, 0.42, 0.36 + instance.colorSeed * 0.1);
      break;
    case 'log':
      color.setHSL(0.08, 0.28, 0.48 + instance.colorSeed * 0.08);
      break;
    case 'broadleafTree':
      color.setHSL(0.25 + instance.colorSeed * 0.05, 0.38, 0.36 + instance.colorSeed * 0.1);
      break;
    case 'cypress':
      color.setHSL(0.3 + instance.colorSeed * 0.04, 0.32, 0.22 + instance.colorSeed * 0.08);
      break;
    case 'cactus':
    case 'brush':
      color.setHSL(0.2 + instance.colorSeed * 0.08, 0.3, 0.42 + instance.colorSeed * 0.14);
      break;
  }
  return color;
}

function setPlantMatrix(instance: PlantInstance): Matrix4 {
  tmpObject.position.set(instance.x, instance.y, instance.z);
  tmpQuat.setFromAxisAngle(UP, instance.rotation);
  tmpObject.quaternion.copy(tmpQuat);
  tmpScale.setScalar(instance.scale);
  tmpObject.scale.copy(tmpScale);
  tmpObject.updateMatrix();
  shear.makeShear(0, 0, instance.leanX, instance.leanZ, 0, 0);
  tmpMatrix.copy(tmpObject.matrix).multiply(shear);
  return tmpMatrix;
}

function attachInstanceAttributes(
  geometry: BufferGeometry,
  max: number,
): { fade: InstancedBufferAttribute; tint: InstancedBufferAttribute } {
  const capacity = Math.max(1, max);
  const fade = new InstancedBufferAttribute(new Float32Array(capacity), 1);
  const tint = new InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
  geometry.setAttribute('fade', fade);
  geometry.setAttribute('tint', tint);
  return { fade, tint };
}

function createBatch(
  species: PlantSpecies,
  instances: PlantInstance[],
  part: VegetationModelPart,
  tier: TierSettings,
): PlantBatch {
  const geometry = part.geometry.clone();
  const { fade, tint } = attachInstanceAttributes(geometry, instances.length);
  if (!geometry.boundingSphere) geometry.computeBoundingSphere();
  const bounds = geometry.boundingSphere!;
  const tints = new Float32Array(instances.length * 3);
  instances.forEach((instance, i) => tintFor(instance).toArray(tints, i * 3));
  const mesh = sharedInstancedMesh(geometry, part.material as Material, instances.length, { count: 0 });
  mesh.name = `vegetation-${species}`;
  mesh.receiveShadow = true;
  // The instances are culled on the CPU (`updateBatch`), so three's own test always passes. A warm-up
  // clears `frustumCulled` to draw a mesh whatever the camera sees: then every plant in range draws.
  mesh.frustumCulled = true;
  mesh.intersectsFrustum = () => true;
  // Flowering bushes hand off to the shrub impostor: drawn small, their alpha-tested leaves thin out
  // and leave only the red blooms, which read as red blobs on the hills.
  const nearOnly = TREE_LIKE.has(species) || species === 'flowerBush';
  const farDistance =
    species === 'fern'
      ? tier.grassDistance + 34
      : species === 'banana'
        ? tier.grassDistance + 48
        : species === 'brush'
          ? tier.treeNear * 1.6
          : species === 'cypress'
            ? tier.treeNear * 3
            : tier.treeNear;
  return {
    species,
    mesh,
    fade,
    tint,
    instances,
    tints,
    reach: bounds.center.length() + bounds.radius,
    trianglesPerInstance: triangleCount(geometry),
    nearOnly,
    farDistance,
    visible: 0,
  };
}

/**
 * Every palm of a batch, for the sun's cached (static) shadow map: the batch itself only holds the
 * palms the camera sees, and the cached map outlives a turn of the camera. It shares the batch's
 * vertex buffers and material, and no camera draws it (layer 0 off); `assignCaster` puts it on the
 * static map's layers now, so the warm-ups' static map draws build its shadow shader.
 */
function createPalmCaster(batch: PlantBatch): InstancedMesh {
  const source = batch.mesh.geometry;
  const geometry = new BufferGeometry();
  geometry.setIndex(source.index);
  for (const [name, attribute] of Object.entries(source.attributes)) {
    if (name !== 'fade' && name !== 'tint') geometry.setAttribute(name, attribute);
  }
  const count = batch.instances.length;
  geometry.setAttribute('fade', new InstancedBufferAttribute(new Float32Array(count).fill(1), 1));
  geometry.setAttribute('tint', new InstancedBufferAttribute(batch.tints, 3));
  const mesh = sharedInstancedMesh(geometry, batch.mesh.material, count);
  mesh.name = `${batch.mesh.name} shadow`;
  for (let i = 0; i < count; i++) mesh.setMatrixAt(i, setPlantMatrix(batch.instances[i]!));
  markInstancesChanged(mesh);
  mesh.castShadow = true;
  mesh.layers.mask = 0;
  assignCaster(mesh);
  return mesh;
}

/** Sets the shared frustum from the camera (call before `updateBatch` each frame). */
function setPlantFrustum(camera: PerspectiveCamera): void {
  camera.updateMatrixWorld();
  viewProj.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  frustum.setFromProjectionMatrix(viewProj);
}

/** Fills the batch with the plants in range and in view (the frustum from `setPlantFrustum`). */
function updateBatch(batch: PlantBatch, camera: PerspectiveCamera, tier: TierSettings): void {
  batch.visible = 0;
  const handoff = geometryHandoff(batch.species, tier);
  const tints = batch.tints;
  for (let i = 0; i < batch.instances.length; i++) {
    const instance = batch.instances[i]!;
    const d = Math.hypot(instance.x - camera.position.x, instance.z - camera.position.z);
    // A near-only plant has dissolved into its impostor by `handoff + 6` (its fade is 0 there, and the
    // material draws none of it): past that it isn't drawn at all.
    const maxD = batch.nearOnly ? handoff + 6 : batch.farDistance;
    if (d > maxD) continue;
    if (batch.mesh.frustumCulled) {
      const lean = 1 + Math.abs(instance.leanX) + Math.abs(instance.leanZ);
      plantSphere.center.set(instance.x, instance.y, instance.z);
      plantSphere.radius = batch.reach * instance.scale * lean + PLANT_FRUSTUM_PAD;
      if (!frustum.intersectsSphere(plantSphere)) continue;
    }
    const slot = batch.visible;
    batch.mesh.setMatrixAt(slot, setPlantMatrix(instance));
    batch.tint.setXYZ(slot, tints[i * 3]!, tints[i * 3 + 1]!, tints[i * 3 + 2]!);
    const fadeNear = batch.nearOnly
      ? 1 - smoothstep(handoff - 10, handoff + 6, d)
      : 1 - smoothstep(maxD - 18, maxD, d);
    batch.fade.setX(slot, clamp01(fadeNear - instance.lodSeed * 0.03));
    batch.visible += 1;
  }
  batch.mesh.count = batch.visible;
  markInstancesChanged(batch.mesh);
  batch.tint.needsUpdate = true;
  batch.fade.needsUpdate = true;
}

function collectTreeLike(scatter: Record<PlantSpecies, PlantInstance[]>): PlantInstance[] {
  const output: PlantInstance[] = [];
  for (const species of Object.keys(scatter) as PlantSpecies[]) {
    if (TREE_LIKE.has(species) || species === 'shrub' || species === 'flowerBush')
      output.push(...scatter[species]);
  }
  return output;
}

export async function createVegetation(options: CreateVegetationOptions): Promise<VegetationSystem> {
  const tier = resolveTier(options.tier);
  const seed = options.seed ?? 0xc0c011e5;
  const group = new Object3D() as Group;
  group.name = 'vegetation';

  const [scatter, geometries] = await Promise.all([
    scatterVegetationAsync(
      { heightField: options.heightField, tier, island: options.island, seed, exclude: options.exclude },
      buildSlice,
    ),
    loadVegetationGeometries(),
  ]);
  options.island.appendExtraPlants?.(scatter.plants, options.heightField, tier.tier, 'beforeExternal');
  for (const plant of options.extraPlants ?? []) scatter.plants[plant.species].push(plant);
  options.island.appendExtraPlants?.(scatter.plants, options.heightField, tier.tier, 'afterExternal');
  const casters: InstancedMesh[] = [];
  const buildBatches = (plants: Record<PlantSpecies, PlantInstance[]>, target: Object3D): PlantBatch[] => {
    const out: PlantBatch[] = [];
    const palmInstances = collectPalmInstances(plants);
    if (palmInstances.length > 0) {
      for (const part of geometries.palmTall) {
        const partInstances = instancesForPart(palmInstances, part, options.island);
        if (partInstances.length === 0) continue;
        out.push(createBatch('palmTall', partInstances, part, tier));
      }
    }
    for (const species of Object.keys(plants) as PlantSpecies[]) {
      if (species.startsWith('palm')) continue;
      const instances = plants[species];
      if (instances.length === 0) continue;
      for (const part of geometries[species]) {
        const partInstances = instancesForPart(instances, part, options.island);
        if (partInstances.length === 0) continue;
        out.push(createBatch(species, partInstances, part, tier));
      }
    }
    for (const batch of out) target.add(batch.mesh);
    if (islandsTakeSunShadows(tier)) {
      for (const batch of out) {
        if (!batch.species.startsWith('palm')) continue;
        const caster = createPalmCaster(batch);
        casters.push(caster);
        target.add(caster);
      }
    }
    return out;
  };
  const batches = buildBatches(scatter.plants, group);

  const heightTexture = createHeightDataTexture(options.heightGrid);
  const grass = new GrassField(
    options.heightField,
    options.heightGrid,
    heightTexture,
    tier,
    seed,
    options.island.grassBounds,
    options.exclude,
    true,
  );
  await grass.build(buildSlice);
  group.add(grass.group);

  const impostorOptions = {
    handoff: (species: PlantSpecies) => geometryHandoff(species, tier),
    palmVariant,
    tint: tintFor,
  };
  const impostorEntries = collectTreeLike(scatter.plants);
  let impostorBake =
    impostorEntries.length > 0 ? await bakeImpostorAtlas(options.renderer, geometries) : null;
  const impostors = impostorBake ? new ImpostorBatch(impostorEntries, impostorBake, impostorOptions) : null;
  if (impostors) group.add(impostors.mesh);
  // Atlas for patches when the island itself had no tree-likes (the patch's batch then owns it).
  let patchOwnsBake = false;

  interface Patch {
    group: Group;
    batches: PlantBatch[];
    impostors: ImpostorBatch | null;
  }
  const patches: Patch[] = [];

  let lastStats: VegetationStats = {
    totalInstances: batches.reduce((sum, batch) => sum + batch.instances.length, 0),
    visibleInstances: 0,
    drawCalls: 0,
    triangles: 0,
    pipelineCount: 0,
    impostorBakeMs: impostorBake?.bakeMs ?? 0,
    grassCellsVisible: 0,
    meshBatchesVisible: 0,
  };

  return {
    group,
    update(camera) {
      setPlantFrustum(camera);
      for (const batch of batches) updateBatch(batch, camera, tier);
      grass.update(camera);
      impostors?.update(camera);
      const grassStats = grass.stats();
      const impostorStats = impostors?.stats() ?? { visibleInstances: 0, drawCalls: 0, triangles: 0 };
      let visibleInstances = grassStats.visibleInstances + impostorStats.visibleInstances;
      let drawCalls = grassStats.drawCalls + impostorStats.drawCalls;
      let triangles = grassStats.triangles + impostorStats.triangles;
      let meshBatchesVisible = 0;
      // A patch's plants only update (and count) while it's shown.
      for (const patch of patches) {
        if (!patch.group.visible) continue;
        for (const batch of patch.batches) updateBatch(batch, camera, tier);
        patch.impostors?.update(camera);
        const s = patch.impostors?.stats();
        if (s) {
          visibleInstances += s.visibleInstances;
          drawCalls += s.drawCalls;
          triangles += s.triangles;
        }
        for (const batch of patch.batches) {
          visibleInstances += batch.visible;
          if (batch.visible > 0) {
            drawCalls += 1;
            meshBatchesVisible += 1;
            triangles += batch.visible * batch.trianglesPerInstance;
          }
        }
      }
      for (const batch of batches) {
        visibleInstances += batch.visible;
        if (batch.visible > 0) {
          drawCalls += 1;
          meshBatchesVisible += 1;
          triangles += batch.visible * batch.trianglesPerInstance;
        }
      }
      const info = options.renderer.info as unknown as {
        memory?: { programs?: number };
        render?: { drawCalls?: number; calls?: number; triangles?: number };
      };
      lastStats = {
        totalInstances:
          batches.reduce((sum, batch) => sum + batch.instances.length, 0) +
          grassStats.visibleInstances +
          impostorStats.visibleInstances,
        visibleInstances,
        drawCalls,
        triangles,
        pipelineCount: info.memory?.programs ?? 0,
        impostorBakeMs: impostorBake?.bakeMs ?? 0,
        grassCellsVisible: grassStats.visibleCells,
        meshBatchesVisible,
      };
    },
    async addPlants(list, name) {
      const plants = {} as Record<PlantSpecies, PlantInstance[]>;
      for (const species of Object.keys(scatter.plants) as PlantSpecies[]) plants[species] = [];
      for (const plant of list) plants[plant.species].push(plant);
      const patchGroup = new Object3D() as Group;
      patchGroup.name = name;
      patchGroup.visible = false;
      const patchBatches = buildBatches(plants, patchGroup);
      await buildSlice();
      const entries = collectTreeLike(plants);
      if (entries.length > 0 && !impostorBake) {
        impostorBake = await bakeImpostorAtlas(options.renderer, geometries);
        patchOwnsBake = true;
      }
      const patchImpostors =
        entries.length > 0 && impostorBake
          ? new ImpostorBatch(entries, impostorBake, { ...impostorOptions, sharedBake: !patchOwnsBake })
          : null;
      // Only the first patch to bake the atlas owns it.
      patchOwnsBake = false;
      if (patchImpostors) patchGroup.add(patchImpostors.mesh);
      patches.push({ group: patchGroup, batches: patchBatches, impostors: patchImpostors });
      group.add(patchGroup);
      return { group: patchGroup };
    },
    dispose() {
      for (const batch of [...batches, ...patches.flatMap((p) => p.batches)]) {
        batch.mesh.geometry.dispose();
        batch.mesh.dispose();
      }
      for (const caster of casters) {
        caster.geometry.dispose();
        caster.dispose();
      }
      grass.dispose();
      // Patches first: one may share the island's atlas, which the island's batch frees.
      for (const patch of patches) patch.impostors?.dispose();
      impostors?.dispose();
      heightTexture.dispose();
      const disposedMaterials = new Set<Material>();
      const disposedTextures = new Set<Texture>();
      const sharedPalmMaterial = palmMaterial();
      for (const parts of Object.values(geometries)) {
        for (const part of parts) {
          part.geometry.dispose();
          const material = part.material as Material | Material[];
          if (Array.isArray(material)) {
            for (const m of material) {
              if (m === sharedPalmMaterial) continue;
              if (disposedMaterials.has(m)) continue;
              disposedMaterials.add(m);
              disposeMaterialWithTextures(m, disposedTextures);
            }
          } else if (material !== sharedPalmMaterial && !disposedMaterials.has(material)) {
            disposedMaterials.add(material);
            disposeMaterialWithTextures(material, disposedTextures);
          }
        }
      }
    },
    stats() {
      return lastStats;
    },
  };
}
