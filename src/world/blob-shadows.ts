import {
  InstancedMesh,
  MeshBasicNodeMaterial,
  PlaneGeometry,
  type Camera,
  type Object3D,
  type Renderer,
  type Scene,
} from 'three/webgpu';
import { float, smoothstep, uv, vec3 } from 'three/tsl';

/**
 * Blob shadows (PLAN §12.1 "Shadows", Low and Lite): a soft dark disc under each character, so
 * people stay on the ground where the tier has no sun shadow map for moving things. One instanced
 * mesh and one small material for every character: one draw and one pipeline in all.
 */
export const BLOB = {
  /** Disc radius (m) for a character of scale 1. */
  radius: 0.45,
  /**
   * Lift above the feet (m). Drawn ground (cobbles, terrain between vertices) sits up to about 6 cm
   * above a character's feet, and a lower disc was hidden under it.
   */
  lift: 0.1,
  /**
   * Darkness at the centre. Blending is in linear light, so this reads much lighter on screen (0.42
   * was barely visible on dark cobbles).
   */
  opacity: 0.72,
  /** Fraction of the radius that stays at full darkness before the soft edge. */
  core: 0.3,
  /** Most characters drawn at once (the nearest are not chosen; extra ones are skipped). */
  max: 64,
  /** How often (frames) the scene is searched for characters. */
  sweepEvery: 30,
} as const;

/** Camera distance (m) where blobs end, per tier; they shrink away over the last 20%. */
export const BLOB_RANGE = { low: 40, lite: 28 } as const;

/** Every character's root is named `character_<body>` (characters/index.ts). */
export function isCharacterRoot(o: Object3D): boolean {
  return o.name.startsWith('character_');
}

/** Blob scale (0–1) at camera distance `d`: 1 inside 80% of `range`, easing to 0 at `range`. */
export function blobFade(d: number, range: number): number {
  const t = (range - d) / (range * 0.2);
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return t * t * (3 - 2 * t);
}

/** Whether `o` and all its ancestors are visible, up to a scene. */
function shownInScene(o: Object3D): boolean {
  let p: Object3D | null = o;
  for (; p; p = p.parent) {
    if (!p.visible) return false;
    if ((p as Scene).isScene) return true;
  }
  return false;
}

export class BlobShadows {
  readonly mesh: InstancedMesh;
  private readonly roots: Object3D[] = [];
  private lastFrame = -1;
  private sweepAt = 0;

  constructor(private readonly range: number) {
    const geometry = new PlaneGeometry(2, 2);
    geometry.rotateX(-Math.PI / 2);
    const material = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false });
    material.fog = false;
    material.polygonOffset = true;
    material.polygonOffsetFactor = -2;
    material.polygonOffsetUnits = -2;
    const r = uv().sub(0.5).length().mul(2);
    material.colorNode = vec3(0, 0, 0);
    material.opacityNode = float(BLOB.opacity).mul(float(1).sub(smoothstep(BLOB.core, 1, r)));
    const mesh = new InstancedMesh(geometry, material, BLOB.max);
    mesh.name = 'blob shadows';
    mesh.count = 0;
    mesh.frustumCulled = false;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.renderOrder = 1;
    mesh.raycast = () => {};
    // Placed while drawing: every character's world matrix is current then, so the blob never lags.
    mesh.onBeforeRender = (renderer, scene, camera) =>
      this.place(renderer as unknown as Renderer, scene, camera);
    this.mesh = mesh;
  }

  private collect(o: Object3D): void {
    if (isCharacterRoot(o)) {
      if (this.roots.length < BLOB.max * 2) this.roots.push(o);
      return;
    }
    const kids = o.children;
    for (let i = 0; i < kids.length; i++) this.collect(kids[i]!);
  }

  private place(renderer: Renderer, scene: Object3D, camera: Camera): void {
    const frame = renderer.info.frame;
    if (frame === this.lastFrame) return;
    this.lastFrame = frame;
    if (frame >= this.sweepAt) {
      this.sweepAt = frame + BLOB.sweepEvery;
      this.roots.length = 0;
      this.collect(scene);
    }
    const cam = camera.matrixWorld.elements;
    const out = this.mesh.instanceMatrix.array as Float32Array;
    let n = 0;
    for (let i = 0; i < this.roots.length && n < BLOB.max; i++) {
      const root = this.roots[i]!;
      if (!shownInScene(root)) continue;
      const e = root.matrixWorld.elements;
      const x = e[12]!,
        y = e[13]!,
        z = e[14]!;
      const fade = blobFade(Math.hypot(x - cam[12]!, y - cam[13]!, z - cam[14]!), this.range);
      if (fade <= 0) continue;
      const s = BLOB.radius * fade * Math.min(1.5, Math.max(0.5, Math.hypot(e[0]!, e[1]!, e[2]!)));
      const o = n * 16;
      out[o] = s;
      out[o + 1] = out[o + 2] = out[o + 3] = out[o + 4] = 0;
      out[o + 5] = 1;
      out[o + 6] = out[o + 7] = out[o + 8] = out[o + 9] = 0;
      out[o + 10] = s;
      out[o + 11] = 0;
      out[o + 12] = x;
      out[o + 13] = y + BLOB.lift;
      out[o + 14] = z;
      out[o + 15] = 1;
      n++;
    }
    if (n > 0 || this.mesh.count > 0) this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.count = n;
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    (this.mesh.material as MeshBasicNodeMaterial).dispose();
    this.mesh.dispose();
  }
}
