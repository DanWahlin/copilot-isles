// Adapted from Tidewater © 2026 DRG Software Solutions LLC, MIT, src/world/vegetation/Impostors.js@d32799f
import {
  AmbientLight,
  Color,
  DoubleSide,
  DirectionalLight,
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
  type PerspectiveCamera,
  type Material,
  type Texture,
  type WebGPURenderer,
  Vector4,
} from 'three/webgpu';
import { float, texture, uv } from 'three/tsl';
import type { PlantInstance } from './types';
import type { VegetationGeometryCatalog } from './model-loader';
import { createImpostorMaterial } from './materials';
import { clamp01, smoothstep } from '../../util/math';

// three's TSL typings do not expose map sample swizzles precisely here.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyNode = any;

interface ImpostorEntry extends PlantInstance {
  radius: number;
}

const tmp = new Object3D();
const matrix = new Matrix4();
const scale = new Vector3();
const quat = new Quaternion();
const up = new Vector3(0, 1, 0);

export interface ImpostorBake {
  texture: Texture;
  target: WebGLRenderTarget;
  bakeMs: number;
}

function bakeMaterial(source: Material | Material[]): MeshBasicNodeMaterial {
  const material = (Array.isArray(source) ? source[0] : source) as Material & {
    color?: Color;
    map?: Texture | null;
  };
  const out = new MeshBasicNodeMaterial({
    color: material.color ?? new Color(0xffffff),
    side: DoubleSide,
    alphaTest: material.map ? 0.01 : 0.1,
    transparent: !!material.map,
    depthWrite: true,
  });
  if (material.map) {
    const sample = texture(material.map, uv()) as AnyNode;
    out.colorNode = sample.rgb;
    out.opacityNode = sample.a;
    out.alphaTestNode = float(0.01);
  }
  return out;
}

export async function bakeImpostorAtlas(
  renderer: WebGPURenderer,
  geometries: VegetationGeometryCatalog,
): Promise<ImpostorBake> {
  const started = performance.now();
  const target = new WebGLRenderTarget(768, 768, { depthBuffer: true });
  target.texture.name = 'vegetation-hemi-octahedral-impostors';
  const previousTarget = renderer.getRenderTarget();
  const scene = new Scene();
  scene.background = null;
  scene.add(new AmbientLight(0xb8d0a0, 1.6));
  const sun = new DirectionalLight(0xffd69c, 2.2);
  sun.position.set(-4, 7, 5);
  scene.add(sun);
  const makePrototype = (species: 'palmTall' | 'broadleafTree' | 'shrub') => {
    const root = new Object3D();
    for (const part of geometries[species]) root.add(new Mesh(part.geometry, bakeMaterial(part.material)));
    return root;
  };
  const prototypes = [makePrototype('palmTall'), makePrototype('broadleafTree'), makePrototype('shrub')];
  const camera = new OrthographicCamera(-7, 7, 8, -2, 0.1, 40);
  camera.position.set(0, 5, 15);
  camera.lookAt(0, 4, 0);

  // Save shared renderer state; the bake must leave the canvas viewport/scissor/clear untouched.
  const prevViewport = renderer.getViewport(new Vector4());
  const prevScissor = renderer.getScissor(new Vector4());
  const prevScissorTest = renderer.getScissorTest();
  const prevClear = renderer.getClearColor(new Color());
  const prevAlpha = renderer.getClearAlpha();
  renderer.setRenderTarget(target);
  renderer.setClearColor(new Color(0x000000), 0);
  renderer.clear();
  renderer.setScissorTest(true);
  const tile = 128;
  for (let y = 0; y < 6; y += 1) {
    for (let x = 0; x < 6; x += 1) {
      const prototype = prototypes[(x + y) % prototypes.length];
      scene.remove(...prototypes);
      scene.add(prototype);
      prototype.rotation.y = (x / 6) * Math.PI * 2;
      prototype.rotation.x = -0.18 + y * 0.055;
      renderer.setViewport(x * tile, y * tile, tile, tile);
      renderer.setScissor(x * tile, y * tile, tile, tile);
      renderer.render(scene, camera);
    }
  }
  renderer.setRenderTarget(previousTarget);
  renderer.setViewport(prevViewport);
  renderer.setScissor(prevScissor);
  renderer.setScissorTest(prevScissorTest);
  renderer.setClearColor(prevClear, prevAlpha);

  for (const prototype of prototypes) {
    prototype.traverse((object) => {
      const mesh = object as Mesh;
      if (!mesh.isMesh) return;
      if (Array.isArray(mesh.material)) for (const m of mesh.material) m.dispose();
      else mesh.material.dispose();
    });
  }
  return { texture: target.texture, target, bakeMs: performance.now() - started };
}

function atlasFamily(species: PlantInstance['species']): number {
  if (species === 'broadleafTree') return 1;
  if (species === 'shrub' || species === 'flowerBush') return 2;
  return 0;
}

function atlasTile(
  species: PlantInstance['species'],
  seed: number,
): { x: number; y: number; w: number; h: number } {
  const family = atlasFamily(species);
  const candidates: { x: number; y: number }[] = [];
  for (let y = 0; y < 6; y += 1) {
    for (let x = 0; x < 6; x += 1) {
      if ((x + y) % 3 === family) candidates.push({ x, y });
    }
  }
  const c = candidates[Math.floor(seed * candidates.length) % candidates.length] ?? candidates[0]!;
  const s = 1 / 6;
  return { x: c.x * s, y: c.y * s, w: s, h: s };
}

export class ImpostorBatch {
  readonly mesh: InstancedMesh;
  private readonly fade: InstancedBufferAttribute;
  private readonly tint: InstancedBufferAttribute;
  private readonly atlasUv: InstancedBufferAttribute;
  private readonly capacity: number;
  private readonly entries: ImpostorEntry[];
  private visible = 0;

  constructor(entries: PlantInstance[], atlas: Texture, maxCount = entries.length) {
    this.entries = entries.map((entry) => ({
      ...entry,
      radius: entry.species === 'shrub' ? 2.4 : entry.species === 'broadleafTree' ? 6 : 7.5,
    }));
    const geometry = new PlaneGeometry(1, 1, 1, 1);
    this.capacity = Math.max(1, maxCount);
    this.fade = new InstancedBufferAttribute(new Float32Array(this.capacity), 1);
    this.tint = new InstancedBufferAttribute(new Float32Array(this.capacity * 3), 3);
    this.atlasUv = new InstancedBufferAttribute(new Float32Array(this.capacity * 4), 4);
    geometry.setAttribute('fade', this.fade);
    geometry.setAttribute('tint', this.tint);
    geometry.setAttribute('atlasUv', this.atlasUv);
    this.mesh = new InstancedMesh(geometry, createImpostorMaterial(atlas), this.capacity);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
  }

  update(camera: PerspectiveCamera, nearDistance: number): void {
    this.visible = 0;
    const far = Math.max(nearDistance + 80, 330);
    for (const entry of this.entries) {
      const d = Math.hypot(entry.x - camera.position.x, entry.z - camera.position.z);
      if (d < nearDistance * (entry.species === 'shrub' ? 0.62 : 1) || d > far) continue;
      if (this.visible >= this.capacity) continue;
      const yaw = Math.atan2(camera.position.x - entry.x, camera.position.z - entry.z);
      quat.setFromAxisAngle(up, yaw);
      tmp.position.set(entry.x, entry.y + entry.radius * 0.54, entry.z);
      tmp.quaternion.copy(quat);
      const thin = 1 - smoothstep(far - 110, far, d) * (0.35 + entry.lodSeed * 0.45);
      const s = entry.radius * entry.scale;
      scale.set(s * 1.45, s * 1.2, s * 1.45);
      tmp.scale.copy(scale);
      tmp.updateMatrix();
      matrix.copy(tmp.matrix);
      this.mesh.setMatrixAt(this.visible, matrix);
      const color = new Color().setHSL(0.26 + entry.colorSeed * 0.07, 0.42, 0.48 + entry.colorSeed * 0.08);
      this.tint.setXYZ(this.visible, color.r, color.g, color.b);
      const tile = atlasTile(entry.species, entry.lodSeed);
      this.atlasUv.setXYZW(this.visible, tile.x, tile.y, tile.w, tile.h);
      this.fade.setX(this.visible, clamp01(smoothstep(nearDistance, nearDistance + 18, d) * thin));
      this.visible += 1;
    }
    this.mesh.count = this.visible;
    this.mesh.instanceMatrix.needsUpdate = true;
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
  }
}
