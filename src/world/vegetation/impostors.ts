// Adapted from Tidewater © 2026 DRG Software Solutions LLC, MIT, src/world/vegetation/Impostors.js@d32799f
import { markInstancesChanged, sharedInstancedMesh } from '../../engine/instancing';
import {
  Box3,
  Color,
  DepthTexture,
  DoubleSide,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicNodeMaterial,
  Object3D,
  OrthographicCamera,
  PlaneGeometry,
  Quaternion,
  Scene,
  Vector3,
  WebGLRenderTarget,
  type Material,
  type PerspectiveCamera,
  type Texture,
  type WebGPURenderer,
} from 'three/webgpu';
import type { PlantInstance, PlantSpecies } from './types';
import type { PalmVariant, VegetationGeometryCatalog, VegetationModelPart } from './model-loader';
import { createImpostorMaterial } from './materials';
import { clamp01, smoothstep } from '../../util/math';
import { disposeRenderTarget } from '../../util/dispose-three';

const tmp = new Object3D();
const matrix = new Matrix4();
const quat = new Quaternion();
const up = new Vector3(0, 1, 0);
const tmpBox = new Box3();

/** Atlas layout: each prototype is baked from `VIEWS` yaw angles into a `GRID`×`GRID` sheet. */
const GRID = 6;
const TILE_PX = 128;
const VIEWS = 9;
const PROTOTYPES = ['palmA', 'palmB', 'broadleaf', 'shrub'] as const;
type Prototype = (typeof PROTOTYPES)[number];

/** Square world-space frame each prototype was baked into (metres at instance scale 1). */
interface PrototypeFrame {
  size: number;
  bottom: number;
}

export interface ImpostorBake {
  texture: Texture;
  target: WebGLRenderTarget;
  frames: Record<Prototype, PrototypeFrame>;
  bakeMs: number;
}

/** Which baked prototype stands in for an instance; palms match the geometry batch's variant. */
function prototypeFor(
  instance: PlantInstance,
  palmVariant: (instance: PlantInstance) => PalmVariant,
): Prototype {
  if (instance.species.startsWith('palm')) return palmVariant(instance) === 'a' ? 'palmA' : 'palmB';
  return instance.species === 'broadleafTree' ? 'broadleaf' : 'shrub';
}

function prototypeParts(geometries: VegetationGeometryCatalog, prototype: Prototype): VegetationModelPart[] {
  if (prototype === 'broadleaf') return geometries.broadleafTree;
  if (prototype === 'shrub') return geometries.shrub;
  const variant: PalmVariant = prototype === 'palmA' ? 'a' : 'b';
  return geometries.palmTall.filter((part) => part.palmVariant === variant && part.palmLod === 'grove');
}

function tileIndex(prototype: Prototype, view: number): number {
  return PROTOTYPES.indexOf(prototype) * VIEWS + view;
}

/** Unlit copy of a vegetation material, so the atlas holds albedo and impostors light in-scene. */
function albedoMaterial(source: Material): MeshBasicNodeMaterial {
  const src = source as Material & {
    color?: Color;
    map?: Texture | null;
    colorNode?: MeshBasicNodeMaterial['colorNode'];
  };
  const out = new MeshBasicNodeMaterial({
    color: src.color ?? new Color(0xffffff),
    map: src.map ?? null,
    alphaTest: src.alphaTest,
    vertexColors: true,
    side: DoubleSide,
  });
  if (src.colorNode) out.colorNode = src.colorNode;
  return out;
}

/**
 * Renders the real vegetation models' albedo into an atlas: one square tile per prototype per yaw,
 * framed from each model's true radius and height so crowns and fronds never crop.
 */
export async function bakeImpostorAtlas(
  renderer: WebGPURenderer,
  geometries: VegetationGeometryCatalog,
): Promise<ImpostorBake> {
  const started = performance.now();
  const target = new WebGLRenderTarget(GRID * TILE_PX, GRID * TILE_PX, { depthBuffer: true });
  target.texture.name = 'vegetation-impostor-atlas';
  target.depthTexture = new DepthTexture(GRID * TILE_PX, GRID * TILE_PX);
  target.depthTexture.name = 'vegetation-impostor-atlas-depth';
  const previousTarget = renderer.getRenderTarget();
  const scene = new Scene();
  scene.background = null;
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 80);

  // Render targets use their own viewport/scissor; autoClear would wipe earlier tiles, so the
  // target is cleared once and each tile is scissored in. Shared renderer state is restored after.
  const prevScissorTest = renderer.getScissorTest();
  const prevAutoClear = renderer.autoClear;
  const prevClear = renderer.getClearColor(new Color());
  const prevAlpha = renderer.getClearAlpha();
  renderer.setRenderTarget(target);
  renderer.setClearColor(new Color(0x000000), 0);
  renderer.clear();
  renderer.autoClear = false;
  renderer.setScissorTest(true);

  const frames = {} as Record<Prototype, PrototypeFrame>;
  for (const prototype of PROTOTYPES) {
    const root = new Object3D();
    tmpBox.makeEmpty();
    let radius = 0;
    for (const part of prototypeParts(geometries, prototype)) {
      // Bake from a clone: drawing the shared catalog geometry into the target renders only its
      // first few triangles on WebGPU (r186), while a fresh copy of the same data draws fully.
      const geometry = part.geometry.clone();
      const materials = Array.isArray(part.material) ? part.material : [part.material];
      root.add(
        new Mesh(
          geometry,
          materials.length > 1 ? materials.map(albedoMaterial) : albedoMaterial(materials[0]!),
        ),
      );
      geometry.computeBoundingBox();
      tmpBox.union(geometry.boundingBox!);
      const position = geometry.getAttribute('position');
      for (let i = 0; i < position.count; i += 1)
        radius = Math.max(radius, Math.hypot(position.getX(i), position.getZ(i)));
    }
    const size = Math.max(radius * 2, tmpBox.max.y - tmpBox.min.y) * 1.06;
    const bottom = tmpBox.min.y - size * 0.02;
    frames[prototype] = { size, bottom };
    camera.left = -size / 2;
    camera.right = size / 2;
    camera.bottom = bottom;
    camera.top = bottom + size;
    camera.position.set(0, 0, 40);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    scene.add(root);
    for (let view = 0; view < VIEWS; view += 1) {
      const k = tileIndex(prototype, view);
      const x = (k % GRID) * TILE_PX;
      const y = Math.floor(k / GRID) * TILE_PX;
      root.rotation.y = (view / VIEWS) * Math.PI * 2;
      target.viewport.set(x, y, TILE_PX, TILE_PX);
      target.scissor.set(x, y, TILE_PX, TILE_PX);
      renderer.render(scene, camera);
    }
    scene.remove(root);
    root.traverse((object) => {
      const mesh = object as Mesh;
      if (!mesh.isMesh) return;
      mesh.geometry.dispose();
      for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material])
        material.dispose();
    });
  }
  renderer.setRenderTarget(previousTarget);
  renderer.setScissorTest(prevScissorTest);
  renderer.autoClear = prevAutoClear;
  renderer.setClearColor(prevClear, prevAlpha);
  return { texture: target.texture, target, frames, bakeMs: performance.now() - started };
}

interface ImpostorEntry {
  instance: PlantInstance;
  prototype: Prototype;
  tint: Color;
}

export interface ImpostorOptions {
  /** Distance where each species' geometry hands off to its impostor. */
  handoff: (species: PlantSpecies) => number;
  palmVariant: (instance: PlantInstance) => PalmVariant;
  tint: (instance: PlantInstance) => Color;
  /** The atlas belongs to another batch (it frees it), e.g. a later island's plants. */
  sharedBake?: boolean;
}

export class ImpostorBatch {
  readonly mesh: InstancedMesh;
  private readonly fade: InstancedBufferAttribute;
  private readonly tint: InstancedBufferAttribute;
  private readonly atlasUv: InstancedBufferAttribute;
  private readonly entries: ImpostorEntry[];
  private visible = 0;

  constructor(
    instances: PlantInstance[],
    private readonly bake: ImpostorBake,
    private readonly options: ImpostorOptions,
  ) {
    this.entries = instances.map((instance) => ({
      instance,
      prototype: prototypeFor(instance, options.palmVariant),
      tint: options.tint(instance),
    }));
    const geometry = new PlaneGeometry(1, 1, 1, 1);
    const capacity = Math.max(1, instances.length);
    this.fade = new InstancedBufferAttribute(new Float32Array(capacity), 1);
    this.tint = new InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
    this.atlasUv = new InstancedBufferAttribute(new Float32Array(capacity * 4), 4);
    geometry.setAttribute('fade', this.fade);
    geometry.setAttribute('tint', this.tint);
    geometry.setAttribute('atlasUv', this.atlasUv);
    this.mesh = sharedInstancedMesh(geometry, createImpostorMaterial(bake.texture), capacity, { count: 0 });
    this.mesh.name = 'vegetation-impostors';
    this.mesh.frustumCulled = false;
  }

  update(camera: PerspectiveCamera): void {
    this.visible = 0;
    const tile = 1 / GRID;
    for (const { instance, prototype, tint } of this.entries) {
      const near = this.options.handoff(instance.species);
      const far = Math.max(near + 190, 620);
      const d = Math.hypot(instance.x - camera.position.x, instance.z - camera.position.z);
      if (d < near - 10 || d > far) continue;
      const yaw = Math.atan2(camera.position.x - instance.x, camera.position.z - instance.z);
      const frame = this.bake.frames[prototype];
      const s = frame.size * instance.scale;
      quat.setFromAxisAngle(up, yaw);
      tmp.position.set(instance.x, instance.y + (frame.bottom + frame.size / 2) * instance.scale, instance.z);
      tmp.quaternion.copy(quat);
      tmp.scale.set(s, s, s);
      tmp.updateMatrix();
      matrix.copy(tmp.matrix);
      this.mesh.setMatrixAt(this.visible, matrix);
      this.tint.setXYZ(this.visible, tint.r, tint.g, tint.b);
      // The baked view whose yaw matches how the camera sees this instance's mesh rotation.
      const turns = (instance.rotation - yaw) / (Math.PI * 2);
      const view = Math.round((turns - Math.floor(turns)) * VIEWS) % VIEWS;
      const k = tileIndex(prototype, view);
      this.atlasUv.setXYZW(this.visible, (k % GRID) * tile, Math.floor(k / GRID) * tile, tile, tile);
      const thin = 1 - smoothstep(far - 110, far, d) * (0.35 + instance.lodSeed * 0.45);
      this.fade.setX(this.visible, clamp01(smoothstep(near - 10, near + 6, d) * thin));
      this.visible += 1;
    }
    this.mesh.count = this.visible;
    markInstancesChanged(this.mesh);
    this.tint.needsUpdate = true;
    this.atlasUv.needsUpdate = true;
    this.fade.needsUpdate = true;
  }

  stats(): { visibleInstances: number; drawCalls: number; triangles: number } {
    return {
      visibleInstances: this.visible,
      drawCalls: this.visible > 0 ? 1 : 0,
      triangles: this.visible * 2,
    };
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    if (Array.isArray(this.mesh.material)) for (const material of this.mesh.material) material.dispose();
    else this.mesh.material.dispose();
    this.mesh.dispose();
    if (!this.options.sharedBake) disposeRenderTarget(this.bake.target);
  }
}
