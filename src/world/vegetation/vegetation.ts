import {
  Color,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  Object3D,
  Quaternion,
  Vector3,
  type BufferGeometry,
  type Group,
  type Material,
  type PerspectiveCamera,
} from 'three/webgpu';
import { buildSlice } from '../../engine/build-slice';
import { tierSettings, type TierSettings } from '../../engine/quality';
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
import { seaStackPlantSpots } from '../terrain/sea-stack-shape';
import { headlandCliffPlantSpots } from '../terrain/headland-cliff-shape';
import type { HeightField } from '../contracts';
import type {
  CreateVegetationOptions,
  PlantInstance,
  PlantSpecies,
  VegetationStats,
  VegetationSystem,
} from './types';
import { clamp01, smoothstep } from '../../util/math';

interface PlantBatch {
  species: PlantSpecies;
  mesh: InstancedMesh;
  fade: InstancedBufferAttribute;
  tint: InstancedBufferAttribute;
  instances: PlantInstance[];
  trianglesPerInstance: number;
  nearOnly: boolean;
  farDistance: number;
  visible: number;
}

const TREE_LIKE = new Set<PlantSpecies>(['palmTall', 'palmCluster', 'palmYoung', 'broadleafTree']);
const HERO_PALM_ZONES = [{ x: -110, z: -66, r: 54 }] as const;
const tmpObject = new Object3D();
const tmpQuat = new Quaternion();
const tmpScale = new Vector3();
const shear = new Matrix4();
const tmpMatrix = new Matrix4();

function resolveTier(tier: Tier | TierSettings): TierSettings {
  return typeof tier === 'string' ? tierSettings(tier) : tier;
}

function triangleCount(geometry: BufferGeometry): number {
  if (geometry.index) return Math.floor(geometry.index.count / 3);
  return Math.floor((geometry.getAttribute('position')?.count ?? 0) / 3);
}

function palmGeometryDistance(tier: TierSettings): number {
  if (tier.tier === 'lite') return tier.treeNear * 1.25;
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

function palmLod(instance: PlantInstance): PalmLod {
  if (!instance.species.startsWith('palm')) return 'grove';
  for (const zone of HERO_PALM_ZONES) {
    if (Math.hypot(instance.x - zone.x, instance.z - zone.z) < zone.r) return 'hero';
  }
  return 'grove';
}

function instancesForPart(instances: PlantInstance[], part: VegetationModelPart): PlantInstance[] {
  if (!instances[0]?.species.startsWith('palm')) return instances;
  return instances.filter(
    (instance) => palmVariant(instance) === part.palmVariant && palmLod(instance) === part.palmLod,
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
  tmpQuat.setFromAxisAngle(new Vector3(0, 1, 0), instance.rotation);
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
  const mesh = new InstancedMesh(geometry, part.material as Material, Math.max(1, instances.length));
  mesh.name = `vegetation-${species}`;
  mesh.count = 0;
  mesh.frustumCulled = false;
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
    trianglesPerInstance: triangleCount(geometry),
    nearOnly,
    farDistance,
    visible: 0,
  };
}

function updateBatch(batch: PlantBatch, camera: PerspectiveCamera, tier: TierSettings): void {
  batch.visible = 0;
  const handoff = geometryHandoff(batch.species, tier);
  for (const instance of batch.instances) {
    const d = Math.hypot(instance.x - camera.position.x, instance.z - camera.position.z);
    const maxD = batch.nearOnly ? handoff + 10 : batch.farDistance;
    if (d > maxD) continue;
    const slot = batch.visible;
    if (slot >= batch.instances.length) continue;
    batch.mesh.setMatrixAt(slot, setPlantMatrix(instance));
    {
      const tint = tintFor(instance);
      batch.tint.setXYZ(slot, tint.r, tint.g, tint.b);
    }
    const fadeNear = batch.nearOnly
      ? 1 - smoothstep(handoff - 10, handoff + 6, d)
      : 1 - smoothstep(maxD - 18, maxD, d);
    batch.fade.setX(slot, clamp01(fadeNear - instance.lodSeed * 0.03));
    batch.visible += 1;
  }
  batch.mesh.count = batch.visible;
  batch.mesh.instanceMatrix.needsUpdate = true;
  batch.tint.needsUpdate = true;
  batch.fade.needsUpdate = true;
}

/** The jungle on the sea stack's dome and ledges (placed on its shape, not on the height field). */
function appendSeaStackPlants(plants: Record<PlantSpecies, PlantInstance[]>): void {
  for (const spot of seaStackPlantSpots()) {
    plants[spot.species].push({
      species: spot.species,
      x: spot.x,
      y: spot.y,
      z: spot.z,
      scale: spot.scale,
      rotation: spot.rotation,
      leanX: spot.leanX,
      leanZ: spot.leanZ,
      colorSeed: spot.seed,
      lodSeed: spot.seed,
      slopeDeg: 0,
    });
  }
}

/** Scrub, palms and trees on the headland's clifftop, shoulders and edge (thinned per tier). */
const HEADLAND_PLANT_DENSITY: Record<Tier, number> = {
  lite: 0.2,
  low: 0.45,
  medium: 0.75,
  high: 1,
  ultra: 1,
};

function appendHeadlandPlants(
  plants: Record<PlantSpecies, PlantInstance[]>,
  heightField: HeightField,
  tier: Tier,
): void {
  for (const spot of headlandCliffPlantSpots(heightField, HEADLAND_PLANT_DENSITY[tier])) {
    plants[spot.species].push({
      species: spot.species,
      x: spot.x,
      y: spot.y,
      z: spot.z,
      scale: spot.scale,
      rotation: spot.rotation,
      leanX: spot.leanX,
      leanZ: spot.leanZ,
      colorSeed: spot.seed,
      lodSeed: spot.seed,
      slopeDeg: 0,
    });
  }
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
      { heightField: options.heightField, tier, seed, exclude: options.exclude },
      buildSlice,
    ),
    loadVegetationGeometries(),
  ]);
  appendSeaStackPlants(scatter.plants);
  for (const plant of options.extraPlants ?? []) scatter.plants[plant.species].push(plant);
  appendHeadlandPlants(scatter.plants, options.heightField, tier.tier);
  const batches: PlantBatch[] = [];
  const palmInstances = collectPalmInstances(scatter.plants);
  if (palmInstances.length > 0) {
    for (const part of geometries.palmTall) {
      const partInstances = instancesForPart(palmInstances, part);
      if (partInstances.length === 0) continue;
      const batch = createBatch('palmTall', partInstances, part, tier);
      batches.push(batch);
      group.add(batch.mesh);
    }
  }
  for (const species of Object.keys(scatter.plants) as PlantSpecies[]) {
    if (species.startsWith('palm')) continue;
    const instances = scatter.plants[species];
    if (instances.length === 0) continue;
    for (const part of geometries[species]) {
      const partInstances = instancesForPart(instances, part);
      if (partInstances.length === 0) continue;
      const batch = createBatch(species, partInstances, part, tier);
      batches.push(batch);
      group.add(batch.mesh);
    }
  }

  const heightTexture = createHeightDataTexture(options.heightGrid);
  const grass = new GrassField(
    options.heightField,
    options.heightGrid,
    heightTexture,
    tier,
    seed,
    options.exclude,
    true,
  );
  await grass.build(buildSlice);
  group.add(grass.group);

  const impostorEntries = collectTreeLike(scatter.plants);
  const impostorBake =
    impostorEntries.length > 0 ? await bakeImpostorAtlas(options.renderer, geometries) : null;
  const impostors = impostorBake
    ? new ImpostorBatch(impostorEntries, impostorBake, {
        handoff: (species) => geometryHandoff(species, tier),
        palmVariant,
        tint: tintFor,
      })
    : null;
  if (impostors) group.add(impostors.mesh);

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
      for (const batch of batches) updateBatch(batch, camera, tier);
      grass.update(camera);
      impostors?.update(camera);
      const grassStats = grass.stats();
      const impostorStats = impostors?.stats() ?? { visibleInstances: 0, drawCalls: 0, triangles: 0 };
      let visibleInstances = grassStats.visibleInstances + impostorStats.visibleInstances;
      let drawCalls = grassStats.drawCalls + impostorStats.drawCalls;
      let triangles = grassStats.triangles + impostorStats.triangles;
      let meshBatchesVisible = 0;
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
    dispose() {
      for (const batch of batches) {
        batch.mesh.geometry.dispose();
        batch.mesh.dispose();
      }
      grass.dispose();
      impostors?.dispose();
      heightTexture.dispose();
      const disposedMaterials = new Set<Material>();
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
              m.dispose();
            }
          } else if (material !== sharedPalmMaterial && !disposedMaterials.has(material)) {
            disposedMaterials.add(material);
            material.dispose();
          }
        }
      }
    },
    stats() {
      return lastStats;
    },
  };
}
