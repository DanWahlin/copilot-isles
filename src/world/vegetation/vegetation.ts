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
import { tierSettings, type TierSettings } from '../../engine/quality';
import type { Tier } from '../contracts';
import { createHeightDataTexture } from './materials';
import { GrassField } from './grass';
import { ImpostorBatch, bakeImpostorAtlas } from './impostors';
import { triangleCount } from './plant-geometry';
import { loadVegetationGeometries, type VegetationModelPart } from './model-loader';
import { scatterVegetation } from './scatter';
import type {
  CreateVegetationOptions,
  PlantInstance,
  PlantSpecies,
  VegetationStats,
  VegetationSystem,
} from './types';
import { clamp01, smoothstep } from './random';

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
const tmpObject = new Object3D();
const tmpQuat = new Quaternion();
const tmpScale = new Vector3();
const shear = new Matrix4();
const tmpMatrix = new Matrix4();

function resolveTier(tier: Tier | TierSettings): TierSettings {
  return typeof tier === 'string' ? tierSettings(tier) : tier;
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
  const nearOnly = TREE_LIKE.has(species);
  const farDistance =
    species === 'fern'
      ? tier.grassDistance + 34
      : species === 'banana'
        ? tier.grassDistance + 48
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
  const handoff = batch.species === 'shrub' ? Math.min(45, tier.treeNear * 0.62) : tier.treeNear;
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

function collectTreeLike(): PlantInstance[] {
  // The 6x6 atlas path is disabled for this pass: WebGL2 was exposing source-texture padding
  // as floating coloured quads on shrub/tree impostors. Near mesh LODs remain active.
  return [];
}

export async function createVegetation(options: CreateVegetationOptions): Promise<VegetationSystem> {
  const tier = resolveTier(options.tier);
  const seed = options.seed ?? 0xc0c011e5;
  const group = new Object3D() as Group;
  group.name = 'vegetation';

  const [scatter, geometries] = await Promise.all([
    Promise.resolve(
      scatterVegetation({ heightField: options.heightField, tier, seed, exclude: options.exclude }),
    ),
    loadVegetationGeometries(),
  ]);
  const batches: PlantBatch[] = [];
  for (const species of Object.keys(scatter.plants) as PlantSpecies[]) {
    const instances = scatter.plants[species];
    if (instances.length === 0) continue;
    for (const part of geometries[species]) {
      const batch = createBatch(species, instances, part, tier);
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
  );
  group.add(grass.group);

  const impostorBake = await bakeImpostorAtlas(options.renderer, geometries);
  const impostors = new ImpostorBatch(collectTreeLike(), impostorBake.texture);
  group.add(impostors.mesh);

  let lastStats: VegetationStats = {
    totalInstances: batches.reduce((sum, batch) => sum + batch.instances.length, 0),
    visibleInstances: 0,
    drawCalls: 0,
    triangles: 0,
    pipelineCount: 0,
    impostorBakeMs: impostorBake.bakeMs,
    grassCellsVisible: 0,
    meshBatchesVisible: 0,
  };

  return {
    group,
    update(camera) {
      for (const batch of batches) updateBatch(batch, camera, tier);
      grass.update(camera);
      impostors.update(camera, tier.treeNear);
      const grassStats = grass.stats();
      const impostorStats = impostors.stats();
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
        impostorBakeMs: impostorBake.bakeMs,
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
      impostors.dispose();
      impostorBake.target.dispose();
      heightTexture.dispose();
      for (const parts of Object.values(geometries)) {
        for (const part of parts) {
          part.geometry.dispose();
          const material = part.material as Material | Material[];
          if (Array.isArray(material)) for (const m of material) m.dispose();
          else material.dispose();
        }
      }
    },
    stats() {
      return lastStats;
    },
  };
}
