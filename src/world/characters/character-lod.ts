import { BufferAttribute, type BufferGeometry, type Mesh, type Object3D } from 'three/webgpu';
import type { Tier } from '../contracts';

/**
 * Character levels of detail (PLAN §12.3, "skinned-mesh LODs"). Each character mesh keeps its
 * vertices, skin weights, skeleton and materials; only its triangles change. Two coarser index lists
 * (about 45% and 15% of the triangles, made once at load with meshoptimizer's simplifier) go after
 * the full one in the same index buffer, and each draw picks its range with `geometry.drawRange`.
 * So a LOD adds no geometry, no GPU buffer and no pipeline, and the hitch guard stays quiet.
 */

/** Wanted triangle shares of LOD 1 and LOD 2. */
export const LOD_RATIOS = [0.45, 0.15] as const;
/** The simplifier stops short of the share when a collapse would move the surface more than this (of the mesh's size). */
const TARGET_ERROR = 0.05;
/** Meshes smaller than this aren't worth a LOD (faces, buckets, small weapons). */
const MIN_TRIANGLES = 600;
/** How far past an edge the camera has to go before the level changes back (no flicker on the edge). */
export const LOD_HYSTERESIS = 0.15;

export interface LodDistances {
  /** Camera distances (m) where LOD 1 and LOD 2 start. Lower tiers switch sooner. */
  readonly edges: readonly [number, number];
  /** Characters this near the player (m) keep full detail, so nothing changes beside you. */
  readonly nearPlayer: number;
}

export const LOD_DISTANCES: Readonly<Record<Tier, LodDistances>> = {
  lite: { edges: [10, 24], nearPlayer: 6 },
  low: { edges: [14, 32], nearPlayer: 8 },
  medium: { edges: [20, 45], nearPlayer: 10 },
  high: { edges: [28, 60], nearPlayer: 12 },
  ultra: { edges: [40, 80], nearPlayer: 16 },
};

/** The player's own model keeps full detail out past the walk camera's furthest zoom (14 m). */
const PLAYER_EDGES: readonly [number, number] = [18, 36];

/** The simplifier call the LOD build uses (meshoptimizer's, or a stand-in in tests). */
export interface LodSimplifier {
  simplifyWithAttributes(
    indices: Uint32Array,
    positions: Float32Array,
    positionStride: number,
    attributes: Float32Array,
    attributeStride: number,
    weights: number[],
    lock: Uint8Array | null,
    targetIndexCount: number,
    targetError: number,
    flags?: ('LockBorder' | 'Sparse' | 'ErrorAbsolute' | 'Prune' | 'Regularize' | 'Permissive')[],
  ): [Uint32Array, number];
}

let simplifier: Promise<LodSimplifier | null> | null = null;

/** meshoptimizer's simplifier (a lazy chunk, WebAssembly), or null where it can't run. */
export function loadLodSimplifier(): Promise<LodSimplifier | null> {
  simplifier ??= import('meshoptimizer/simplifier')
    .then(async ({ MeshoptSimplifier }) => {
      await MeshoptSimplifier.ready;
      return MeshoptSimplifier.supported ? (MeshoptSimplifier as LodSimplifier) : null;
    })
    .catch(() => null);
  return simplifier;
}

/** `[start, count]` of LOD 0, 1 and 2 in the geometry's index, set by `buildLodIndex`. */
export type LodRanges = readonly [number, number, number, number, number, number];

export function lodRanges(geometry: BufferGeometry): LodRanges | null {
  return (geometry.userData.lodRanges as LodRanges | undefined) ?? null;
}

/**
 * Adds LOD 1 and LOD 2 to an indexed geometry's index (after the full list) and sets the draw range
 * to the full list. The vertices don't change: the simplifier only drops triangles and moves corners
 * onto vertices that are already there, so the skin weights and bind pose stay as they are. Normals
 * and UVs (or vertex colours) weigh in, so palette seams hold. Returns false (and changes nothing)
 * for geometry it skips: not indexed, grouped, small, or already done.
 */
export function buildLodIndex(
  geometry: BufferGeometry,
  simplify: LodSimplifier,
  ratios: readonly [number, number] = LOD_RATIOS,
): boolean {
  const input = simplifierInput(geometry, MIN_TRIANGLES);
  if (!input) return false;
  const { indices, positions } = input;
  const full = indices.length;
  const vertices = positions.length / 3;
  const { data, stride, weights } = lodAttributes(geometry, vertices);
  const levels = ratios.map((ratio) => {
    const target = Math.max(3, Math.floor((full * ratio) / 3) * 3);
    return simplify.simplifyWithAttributes(
      indices,
      positions,
      3,
      data,
      stride,
      weights,
      null,
      target,
      TARGET_ERROR,
    )[0];
  });
  const lod1 = levels[0]!;
  // LOD 2 is never more than LOD 1 (a mesh the simplifier can't take far reuses LOD 1).
  const lod2 = levels[1]!.length <= lod1.length ? levels[1]! : lod1;
  setLodIndex(geometry, indices, lod1, lod2);
  return true;
}

/**
 * An indexed, ungrouped geometry's whole triangle list and its positions, flat, as the simplifier
 * takes them. Null for one it skips: not indexed, grouped, given LODs already, or under `minTriangles`.
 */
export function simplifierInput(
  geometry: BufferGeometry,
  minTriangles = 0,
): { indices: Uint32Array; positions: Float32Array } | null {
  const index = geometry.index;
  const position = geometry.getAttribute('position');
  if (!index || !position || geometry.groups.length > 0 || lodRanges(geometry)) return null;
  const full = index.count - (index.count % 3);
  if (full / 3 < minTriangles) return null;
  const indices = new Uint32Array(full);
  for (let i = 0; i < full; i++) indices[i] = index.getX(i);
  const positions = new Float32Array(position.count * 3);
  for (let i = 0; i < position.count; i++) {
    positions[i * 3] = position.getX(i);
    positions[i * 3 + 1] = position.getY(i);
    positions[i * 3 + 2] = position.getZ(i);
  }
  return { indices, positions };
}

/**
 * Puts LOD 1 and LOD 2 after the full list (`indices`) in the geometry's index, records the three
 * ranges (`lodRanges`) and draws the full list.
 */
export function setLodIndex(
  geometry: BufferGeometry,
  indices: Uint32Array,
  lod1: Uint32Array,
  lod2: Uint32Array,
): void {
  const full = indices.length;
  const total = full + lod1.length + lod2.length;
  const combined =
    geometry.getAttribute('position').count <= 65535 ? new Uint16Array(total) : new Uint32Array(total);
  combined.set(indices, 0);
  combined.set(lod1, full);
  combined.set(lod2, full + lod1.length);
  geometry.setIndex(new BufferAttribute(combined, 1));
  geometry.setDrawRange(0, full);
  const ranges: LodRanges = [0, full, full, lod1.length, full + lod1.length, lod2.length];
  geometry.userData.lodRanges = ranges;
}

/** Per-vertex attributes the simplifier keeps (normal, then UV or colour) and their weights. */
function lodAttributes(
  geometry: BufferGeometry,
  vertices: number,
): { data: Float32Array; stride: number; weights: number[] } {
  const normal = geometry.getAttribute('normal');
  const uv = geometry.getAttribute('uv');
  const color = uv ? null : geometry.getAttribute('color');
  const extra = uv ? 2 : color ? 3 : 0;
  const stride = (normal ? 3 : 0) + extra;
  if (!stride) return { data: new Float32Array(vertices), stride: 1, weights: [0] };
  const data = new Float32Array(vertices * stride);
  const at = normal ? 3 : 0;
  for (let i = 0; i < vertices; i++) {
    const o = i * stride;
    if (normal) {
      data[o] = normal.getX(i);
      data[o + 1] = normal.getY(i);
      data[o + 2] = normal.getZ(i);
    }
    if (uv) {
      data[o + at] = uv.getX(i);
      data[o + at + 1] = uv.getY(i);
    } else if (color) {
      data[o + at] = color.getX(i);
      data[o + at + 1] = color.getY(i);
      data[o + at + 2] = color.getZ(i);
    }
  }
  const weights = [...(normal ? [0.5, 0.5, 0.5] : []), ...Array<number>(extra).fill(1)];
  return { data, stride, weights };
}

/**
 * Builds LODs for every mesh under `root` that can take one, yielding between meshes when `yieldEach`
 * is set (a load in the background mustn't make one long frame). Geometry shared by clones is done
 * once (it carries its ranges).
 */
export async function buildLods(root: Object3D, simplify: LodSimplifier, yieldEach = false): Promise<number> {
  const geometries = new Set<BufferGeometry>();
  root.traverse((object) => {
    if ((object as Mesh).isMesh && object.name !== 'character-face')
      geometries.add((object as Mesh).geometry);
  });
  let built = 0;
  for (const geometry of geometries) {
    if (!buildLodIndex(geometry, simplify)) continue;
    built++;
    if (yieldEach) await new Promise((resolve) => setTimeout(resolve, 0));
  }
  return built;
}

/** Synchronous `buildLods` for one character's own meshes (its merged accessories), once the simplifier is loaded. */
export function buildLodsNow(root: Object3D, simplify: LodSimplifier | null): void {
  if (!simplify) return;
  root.traverse((object) => {
    if ((object as Mesh).isMesh && object.name !== 'character-face')
      buildLodIndex((object as Mesh).geometry, simplify);
  });
}

/**
 * The level for camera distance `d`, from the current one, with hysteresis: a level goes coarser
 * past `edge × (1 + h)` and finer inside `edge × (1 − h)`.
 */
export function chooseLodLevel(
  d: number,
  current: number,
  edges: readonly [number, number],
  h = LOD_HYSTERESIS,
): number {
  let level = Math.max(0, Math.min(2, current | 0));
  while (level < 2 && d > edges[level]! * (1 + h)) level++;
  while (level > 0 && d < edges[level - 1]! * (1 - h)) level--;
  return level;
}

interface LodView {
  camera: Object3D;
  focus: Object3D | null;
  edges: readonly [number, number];
  playerEdges: readonly [number, number];
  nearPlayer: number;
}

/** The game's view (set by the session); none (title, opening, dev pages) means full detail. */
let view: LodView | null = null;

export function setCharacterLodView(o: { camera: Object3D; focus: Object3D | null; tier: Tier }): void {
  const d = LOD_DISTANCES[o.tier] ?? LOD_DISTANCES.high;
  view = {
    camera: o.camera,
    focus: o.focus,
    edges: d.edges,
    playerEdges: [Math.max(d.edges[0], PLAYER_EDGES[0]), Math.max(d.edges[1], PLAYER_EDGES[1])],
    nearPlayer: d.nearPlayer,
  };
}

/** Clears the view (only if it's still the one for `focus`, when given: a newer session's stays). */
export function clearCharacterLodView(focus?: Object3D): void {
  if (focus && view?.focus !== focus) return;
  view = null;
}

function distance(a: Object3D, b: Object3D): number {
  const p = a.matrixWorld.elements;
  const q = b.matrixWorld.elements;
  return Math.hypot(p[12]! - q[12]!, p[13]! - q[13]!, p[14]! - q[14]!);
}

/**
 * One character's level, chosen when it's drawn (from the view camera, so the shadow and every other
 * pass agree). Full detail when it's talking or in the talk spotlight (`forced`) or near the player;
 * the shadow passes draw one level coarser, except at full detail.
 */
export class CharacterLod {
  level = 0;
  /** Talking, or lit for a talk shot: full detail. */
  forced = false;
  private near = false;

  /** `player`: the player's own model, which has no near-the-player rule and keeps full detail longer. */
  constructor(
    readonly root: Object3D,
    readonly player = false,
  ) {}

  /** The level to draw now, for the main passes or (`shadow`) a shadow pass. */
  resolve(shadow: boolean): number {
    const v = view;
    if (!v) return (this.level = 0);
    let full = this.forced;
    if (!this.player && v.focus) {
      const d = distance(this.root, v.focus);
      this.near = this.near ? d < v.nearPlayer * (1 + LOD_HYSTERESIS) : d < v.nearPlayer;
      full ||= this.near;
    }
    if (full) return (this.level = 0);
    this.level = chooseLodLevel(
      distance(this.root, v.camera),
      this.level,
      this.player ? v.playerEdges : v.edges,
    );
    return shadow ? Math.min(2, this.level + 1) : this.level;
  }
}

/**
 * Hooks `lod` into every mesh under `root` that has LOD ranges: before each draw (any pass) the mesh's
 * draw range is set to its level, and after it back to the full list (the geometry is shared with
 * other characters, and raycasts and fitting read the draw range). Allocates only here, not per draw.
 */
export function attachCharacterLod(root: Object3D, lod: CharacterLod): number {
  let attached = 0;
  root.traverse((object) => {
    const mesh = object as Mesh;
    if (!mesh.isMesh) return;
    const ranges = lodRanges(mesh.geometry);
    if (!ranges) return;
    let shadow = false;
    mesh.onBeforeShadow = () => {
      shadow = true;
    };
    mesh.onAfterShadow = () => {
      shadow = false;
    };
    mesh.onBeforeRender = (_renderer, _scene, _camera, geometry) => {
      const r = lodRanges(geometry);
      if (!r) return;
      const level = lod.resolve(shadow);
      geometry.drawRange.start = r[level * 2]!;
      geometry.drawRange.count = r[level * 2 + 1]!;
    };
    mesh.onAfterRender = (_renderer, _scene, _camera, geometry) => {
      const r = lodRanges(geometry);
      if (!r) return;
      geometry.drawRange.start = r[0];
      geometry.drawRange.count = r[1];
    };
    attached++;
  });
  return attached;
}
