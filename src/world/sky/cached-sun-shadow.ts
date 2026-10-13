import { Matrix4, Object3D, ShadowBaseNode, Vector3, type Mesh } from 'three/webgpu';
import type {
  DirectionalLight,
  DirectionalLightShadow,
  Light,
  Node,
  NodeBuilder,
  NodeFrame,
  ShadowNode,
} from 'three/webgpu';
import {
  Fn,
  If,
  dot,
  float,
  length,
  min,
  normalWorld,
  shadow,
  shadowPositionWorld,
  smoothstep,
  uniform,
} from 'three/tsl';
import { CasterSweep } from '../shadow-casters';
import {
  StaticShadowState,
  commitStaticRefresh,
  staticRefreshReason,
  type StaticRefresh,
} from './shadow-cache';

/** One shadow map's coverage and filtering (PLAN §12.1 sizes). */
export interface SunShadowMap {
  /** Texels per side. */
  size: number;
  /** Half the side of the map's square in light space (m). */
  half: number;
  /** Depth bias in metres (converted to the map's depth range). */
  biasMeters: number;
  normalBias: number;
  /** The layers (shadow-casters.ts SHADOW_MASK) its camera draws. */
  mask: number;
}

/** How far (m) the shadow camera sits from the map's centre toward the sun; the depth range is twice that. */
const LIGHT_DISTANCE = 400;
/** Fraction of a map's half-size over which its shadows fade out at the edge. */
const EDGE_FADE = 0.12;

const vec3Uniform = (v: Vector3) => uniform(v);

/**
 * Leaves `root`'s meshes out of the sun's shadows (PLAN §15.4). They take `receiveShadow` and skip the
 * shadow lookup instead (`userData.sunShadow = false`), so each look has one shader whether or not a
 * mesh takes the shadows: `receiveShadow = false` built a second shader for the same look (the
 * Anchorage village's kit pieces against Port Meridian's). They look and cost as before.
 */
export function skipSunShadows(root: Object3D): void {
  root.traverse((object) => {
    if (!(object as Mesh).isMesh) return;
    (object as Mesh).receiveShadow = true;
    object.userData.sunShadow = false;
  });
}

/**
 * The same for every mesh under `root` with `receiveShadow` off. Run it before a mesh is first
 * compiled: changing `receiveShadow` later builds its shaders again.
 */
export function skipSunShadowsWhereOff(root: Object3D): void {
  root.traverse((object) => {
    const mesh = object as Mesh;
    if (!mesh.isMesh || mesh.receiveShadow) return;
    mesh.receiveShadow = true;
    object.userData.sunShadow = false;
  });
}

/** 0 while drawing a mesh marked by skipSunShadows, else 1 (read per object). */
const receivesSun = uniform(1).onObjectUpdate(({ object }) => (object?.userData.sunShadow === false ? 0 : 1));
type Vec3Uniform = ReturnType<typeof vec3Uniform>;

const _up = new Vector3(0, 1, 0);
const _origin = new Vector3();
const _orient = new Matrix4();
const _orientInv = new Matrix4();
const _p = new Vector3();
const _dir = new Vector3();
const _center = new Vector3();

/** A light stand-in: the shadow node reads its world matrix and its target's (like CSMShadowNode). */
class ShadowSlot extends Object3D {
  readonly target = new Object3D();
  constructor(readonly shadow: DirectionalLightShadow) {
    super();
    this.castShadow = true;
  }
}

/**
 * The sun's shadows as two maps (PLAN §12.1, §12.4): a large static map that's drawn only when the
 * focus moves past the threshold, the sun turns, or a static caster changes (shadow-cache.ts), and a
 * small map around the focus for moving things, drawn every frame. Receivers take the darker of the
 * two, each faded out toward its edge. Without `dynamic`, moving things cast no sun shadow.
 */
export class CachedSunShadowNode extends ShadowBaseNode {
  /** Set each frame by the owner: the point the maps follow (the player or the ship). */
  readonly focus = new Vector3();
  readonly staticState = new StaticShadowState();
  /** The caster sweep, run with tracking, flags static changes for a refresh. */
  readonly sweep = new CasterSweep();
  /** Static map refreshes so far, and why the last one ran (debug). */
  refreshes = 0;
  lastReason: StaticRefresh = 'none';
  /**
   * Warm-ups running: the static map redraws every frame meanwhile and draws the movers too (it
   * reaches further than the mover map), so each caster's shadow pipeline is built during the warm-up
   * and not on a later refresh in play. Call `invalidate()` when it ends.
   */
  warming = 0;
  private forced = false;
  private sceneChanged = false;
  private readonly slots: ShadowSlot[] = [];
  private readonly specs: SunShadowMap[];
  private shadowNodes: ShadowNode[] | null = null;
  private readonly centerU: Vec3Uniform[] = [];
  private readonly dirU: Vec3Uniform[] = [];
  private lastFrame = -1;

  constructor(
    light: DirectionalLight,
    staticMap: SunShadowMap,
    readonly dynamicMap: SunShadowMap | null,
  ) {
    super(light);
    this.specs = dynamicMap ? [staticMap, dynamicMap] : [staticMap];
    for (const spec of this.specs) {
      const s = light.shadow.clone() as DirectionalLightShadow;
      s.mapSize.set(spec.size, spec.size);
      const c = s.camera;
      c.left = c.bottom = -spec.half;
      c.right = c.top = spec.half;
      c.near = 1;
      c.far = LIGHT_DISTANCE * 2;
      c.layers.mask = spec.mask;
      c.updateProjectionMatrix();
      s.bias = -spec.biasMeters / (LIGHT_DISTANCE * 2);
      s.normalBias = spec.normalBias;
      s.autoUpdate = spec !== staticMap;
      s.needsUpdate = false;
      this.slots.push(new ShadowSlot(s));
      this.centerU.push(vec3Uniform(new Vector3()));
      this.dirU.push(vec3Uniform(new Vector3(0, -1, 0)));
    }
  }

  /** The maps' shadow settings (for disposal and tests). */
  get shadows(): readonly DirectionalLightShadow[] {
    return this.slots.map((s) => s.shadow);
  }

  /** Redraw the static map on the next frame (a scene or preset change the sweep can't see). */
  invalidate(): void {
    this.forced = true;
  }

  /** Classifies new casters and watches static ones; a change marks the static map for a refresh. */
  sweepCasters(root: Object3D): void {
    if (this.sweep.run(root, true).staticChanged > 0) this.sceneChanged = true;
  }

  override build(builder: NodeBuilder, output?: string | Node | null): string | Node | null {
    // Before the map nodes, so the maps are placed before they draw (as CSMShadowNode does).
    (builder as NodeBuilder & { addSequentialNode(node: unknown): void }).addSequentialNode(this);
    return super.build(builder, output);
  }

  override setup(builder: NodeBuilder): Node {
    const nodes = (this.shadowNodes ??= this.slots.map((slot) =>
      shadow(slot as unknown as Light, slot.shadow),
    )) as unknown as Node<'float'>[];
    const position = shadowPositionWorld as Node<'vec3'>;
    return Fn(() => {
      this.setupShadowPosition(builder);
      // Build the world normal out here: the maps below are looked up conditionally, and the material's
      // own lighting reads the same normal later. Built first inside a branch, it was only set when the
      // branch ran, so meshes outside the maps (or skipping them) lost their lighting normal.
      (normalWorld as Node<'vec3'>).toVar('sunShadowNormal');
      const lit = float(1).toVar('sunShadow');
      for (let i = 0; i < nodes.length; i++) {
        const half = this.specs[i]!.half;
        // Distance from the map's centre across the light (its square's inscribed circle).
        const d = position.sub(this.centerU[i]!);
        const across = length(d.sub(this.dirU[i]!.mul(dot(d, this.dirU[i]!))));
        If(across.lessThan(half).and(receivesSun.greaterThan(0.5)), () => {
          const weight = float(1).sub(smoothstep(half * (1 - EDGE_FADE), half, across));
          lit.assign(min(lit, float(1).sub(nodes[i]!.oneMinus().mul(weight))));
        });
      }
      return lit;
    })() as unknown as Node;
  }

  override updateBefore(frame: NodeFrame): boolean | undefined {
    if (frame.frameId === this.lastFrame) return undefined;
    this.lastFrame = frame.frameId;
    const light = this.light as DirectionalLight;
    _dir.subVectors(light.target.position, light.position).normalize();
    const reason = staticRefreshReason(
      this.staticState,
      this.focus.x,
      this.focus.z,
      -_dir.x,
      -_dir.y,
      -_dir.z,
      this.sceneChanged,
      this.forced || this.warming > 0,
    );
    if (reason !== 'none') {
      const moverMask = this.specs[1]?.mask ?? 0;
      this.slots[0]!.shadow.camera.layers.mask = this.specs[0]!.mask | (this.warming > 0 ? moverMask : 0);
      commitStaticRefresh(this.staticState, this.focus.x, this.focus.z, -_dir.x, -_dir.y, -_dir.z);
      _center.set(this.staticState.cx, this.focus.y, this.staticState.cz);
      this.place(0, _center, _dir);
      this.slots[0]!.shadow.needsUpdate = true;
      this.forced = this.sceneChanged = false;
      this.lastReason = reason;
      this.refreshes++;
    }
    if (this.slots.length > 1) this.place(1, this.focus, _dir);
    return undefined;
  }

  /** Moves map `i` to `center` with the light along `dir`, snapped to whole texels (no shimmer). */
  private place(i: number, center: Vector3, dir: Vector3): void {
    const slot = this.slots[i]!;
    const spec = this.specs[i]!;
    const texel = (spec.half * 2) / spec.size;
    _orient.lookAt(_origin, dir, _up);
    _orientInv.copy(_orient).invert();
    _p.copy(center).applyMatrix4(_orientInv);
    _p.x = Math.floor(_p.x / texel) * texel;
    _p.y = Math.floor(_p.y / texel) * texel;
    _p.z += LIGHT_DISTANCE;
    _p.applyMatrix4(_orient);
    slot.position.copy(_p);
    slot.target.position.copy(_p).add(dir);
    slot.updateMatrixWorld();
    slot.target.updateMatrixWorld();
    this.centerU[i]!.value.copy(center);
    this.dirU[i]!.value.copy(dir);
  }

  override dispose(): void {
    for (const node of this.shadowNodes ?? []) node.dispose();
    this.shadowNodes = null;
    super.dispose();
  }
}
