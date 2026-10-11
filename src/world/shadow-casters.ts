import { Sphere, type InstancedMesh, type Mesh, type Object3D } from 'three/webgpu';

/**
 * Sun shadow caster rules (PLAN §12.1, §12.4): one table decides which meshes cast sun shadows,
 * into which maps, and whether they move. Small props, grass and small plants don't cast (they rely
 * on AO and contact shading); only large objects cast into the far cascades; moving things are kept
 * apart from the static world so a cached map can skip them.
 *
 * The result is written to render layers, which three's shadow cameras test like any camera:
 * every object keeps layer 0 (the main camera's), plus these bits.
 */
export const SHADOW_LAYER = {
  /** Large enough to cast into the far cascades. */
  far: 1,
  /** Static world: drawn into the cached static map. */
  static: 2,
  /** Moves (characters, ships, the crane arm, the mill wheel…): drawn into the dynamic map. */
  mover: 3,
} as const;

/** The render-layer staging bit used by the warm pass (engine/warm.ts); staged objects aren't touched. */
const STAGING_BIT = 1 << 31;
const LAYER_BITS = (1 << SHADOW_LAYER.far) | (1 << SHADOW_LAYER.static) | (1 << SHADOW_LAYER.mover);

/** Camera masks for the shadow maps (a camera draws an object when any bit is shared). */
export const SHADOW_MASK = {
  /** Near cascades and single maps: every caster (layer 0 catches casters not classified yet). */
  near: 1 | LAYER_BITS,
  /** Far cascades: large casters only. */
  far: 1 << SHADOW_LAYER.far,
  /** The cached static map: static casters, near and far. */
  static: 1 << SHADOW_LAYER.static,
  /** The dynamic map: moving casters. */
  mover: 1 << SHADOW_LAYER.mover,
} as const;

/** `none`: no sun shadow; `near`: near cascade / dynamic map only; `far`: every cascade. */
export type CasterSize = 'none' | 'near' | 'far';

export interface CasterClass {
  size: CasterSize;
  moving: boolean;
}

/** Per-object override in `userData.shadow` (plain data, so it survives clone()). */
export interface CasterHint {
  size?: CasterSize;
  moving?: boolean;
}

export interface CasterInput {
  /** Names from the scene root down to the mesh, joined with ' > ' (unnamed nodes use their type). */
  path: string;
  /** World-space bounding radius (m); for instanced meshes, the largest single instance. */
  radius: number;
  skinned?: boolean;
  hint?: CasterHint;
}

/** Bounding radius limits (m): below `near` no shadow; at or above `far`, casts into far cascades. */
export const CASTER_RADIUS = { near: 0.75, far: 5 } as const;

interface CasterRule {
  test: RegExp;
  size?: CasterSize;
  /** Caps the radius-based size (thin buckets: never far, but still none when tiny). */
  max?: 'near';
  moving?: boolean;
}

/**
 * Ordered rules over the mesh's path. The first rule that sets `size` (or caps it with `max`) wins
 * it, and the first that sets `moving` wins that; unset values fall back to the radius limits and
 * "static".
 */
export const CASTER_RULES: readonly CasterRule[] = [
  // Flat ground, and lots of tiny things merged into one wide mesh (the radius would mislead).
  { test: /paving|message bottles|fishing (line|float)|starfish|debris|grass|sparkle/i, size: 'none' },
  // Small instanced dock clutter: contact shading is enough.
  { test: /barrels|sacks|lobster-pots|bucket/i, size: 'none' },
  // Characters and everything they wear or carry (skinned bounds are unreliable); birds.
  { test: /(^| > )character_|fisherman|wingman|hero parrot|dock gull/, size: 'near', moving: true },
  // A quest prop you stand next to; its lid opens.
  { test: /treasure chest/, size: 'near', moving: true },
  // Things that move: boats, the crane's arm and the crates it lifts, bobbing buoys.
  {
    test: /brigantine|moored sloop|fishing boat|rowboat|crane \(slewing\)|real crate:|helm buoy/,
    moving: true,
  },
  // Thin or small-detail merged buckets: they only read up close.
  {
    test: /rope|rigging|lines\b|metal|ironwork|\biron\b|signs?\b|flags?\b|plaques|labels|swatches/i,
    max: 'near',
  },
];

/** Pure classification (tested): rules first, then size by radius. A hint overrides both. */
export function classifyCaster(input: CasterInput): CasterClass {
  let size: CasterSize | undefined = input.hint?.size;
  let moving: boolean | undefined = input.hint?.moving;
  let max: 'near' | undefined;
  for (const rule of CASTER_RULES) {
    if ((size !== undefined || max !== undefined) && moving !== undefined) break;
    if (!rule.test.test(input.path)) continue;
    if (size === undefined && max === undefined) {
      size = rule.size;
      max = rule.max;
    }
    if (moving === undefined && rule.moving !== undefined) moving = rule.moving;
  }
  if (input.skinned) {
    size ??= 'near';
    moving ??= true;
  }
  if (size === undefined) {
    size = input.radius < CASTER_RADIUS.near ? 'none' : input.radius < CASTER_RADIUS.far ? 'near' : 'far';
    if (max === 'near' && size === 'far') size = 'near';
  }
  return { size, moving: moving ?? false };
}

/** The layer bits (on top of layer 0) a caster class gets. */
export function casterLayerBits(c: CasterClass): number {
  if (c.size === 'none') return 0;
  let bits = c.moving ? 1 << SHADOW_LAYER.mover : 1 << SHADOW_LAYER.static;
  if (c.size === 'far') bits |= 1 << SHADOW_LAYER.far;
  return bits;
}

/** Marks a mesh (or group: the hint is read from the nearest ancestor that has one) as moving. */
export function markShadowMover(obj: Object3D, size?: CasterSize): void {
  obj.userData.shadow = size ? { moving: true, size } : { moving: true };
}

/** Runtime record per classified mesh (kept off userData so clones don't inherit it). */
export interface CasterRecord extends CasterClass {
  bits: number;
  /** World matrix and instance version when last seen, to catch "static" meshes that move. */
  e0: number;
  e5: number;
  e12: number;
  e13: number;
  e14: number;
  instVersion: number;
  /** Whether the mesh was visible (with all its ancestors) when last seen. */
  shown: boolean;
  /** Sweeps in a row in which a static caster moved. */
  moves: number;
}

const records = new WeakMap<Object3D, CasterRecord>();
const sphere = new Sphere();

export function casterRecord(obj: Object3D): CasterRecord | undefined {
  return records.get(obj);
}

function pathOf(obj: Object3D): string {
  const names: string[] = [];
  for (let o: Object3D | null = obj; o && !(o as { isScene?: boolean }).isScene; o = o.parent) {
    names.push(o.name || o.type);
  }
  return names.reverse().join(' > ');
}

function hintOf(obj: Object3D): CasterHint | undefined {
  for (let o: Object3D | null = obj; o; o = o.parent) {
    const h = o.userData.shadow as CasterHint | undefined;
    if (h) return h;
  }
  return undefined;
}

/** The largest axis scale in a column-major 4×4 matrix's upper 3×3. */
function maxScale(e: ArrayLike<number>, o: number): number {
  const sx = e[o]! * e[o]! + e[o + 1]! * e[o + 1]! + e[o + 2]! * e[o + 2]!;
  const sy = e[o + 4]! * e[o + 4]! + e[o + 5]! * e[o + 5]! + e[o + 6]! * e[o + 6]!;
  const sz = e[o + 8]! * e[o + 8]! + e[o + 9]! * e[o + 9]! + e[o + 10]! * e[o + 10]!;
  return Math.sqrt(Math.max(sx, sy, sz));
}

/** World bounding radius of one mesh (for instanced meshes, its largest instance). Allocates once. */
export function casterRadius(mesh: Mesh): number {
  const geo = mesh.geometry;
  if (!geo.boundingSphere) geo.computeBoundingSphere();
  sphere.copy(geo.boundingSphere!);
  let r = sphere.radius;
  const inst = mesh as unknown as InstancedMesh;
  if (inst.isInstancedMesh) {
    const arr = inst.instanceMatrix.array;
    let s = 0;
    for (let i = 0; i < inst.count; i++) s = Math.max(s, maxScale(arr, i * 16));
    r *= s;
  }
  return r * mesh.matrixWorld.getMaxScaleOnAxis();
}

function snapshot(obj: Object3D, rec: CasterRecord, shown: boolean): void {
  const e = obj.matrixWorld.elements;
  rec.e0 = e[0]!;
  rec.e5 = e[5]!;
  rec.e12 = e[12]!;
  rec.e13 = e[13]!;
  rec.e14 = e[14]!;
  const inst = obj as unknown as InstancedMesh;
  rec.instVersion = inst.isInstancedMesh ? inst.instanceMatrix.version : 0;
  rec.shown = shown;
}

function applyBits(obj: Object3D, rec: CasterRecord): void {
  if (rec.size === 'none') {
    obj.castShadow = false;
    return;
  }
  const mask = obj.layers.mask;
  if ((mask & LAYER_BITS) !== rec.bits) obj.layers.mask = (mask & ~LAYER_BITS) | rec.bits;
}

/** Classifies one mesh (first sight only) and writes its layers; returns its record. */
export function assignCaster(mesh: Mesh): CasterRecord {
  let rec = records.get(mesh);
  if (!rec) {
    const c = classifyCaster({
      path: pathOf(mesh),
      radius: casterRadius(mesh),
      skinned: (mesh as { isSkinnedMesh?: boolean }).isSkinnedMesh === true,
      hint: hintOf(mesh),
    });
    rec = {
      ...c,
      bits: casterLayerBits(c),
      e0: 0,
      e5: 0,
      e12: 0,
      e13: 0,
      e14: 0,
      instVersion: 0,
      shown: false,
      moves: 0,
    };
    snapshot(mesh, rec, mesh.visible);
    records.set(mesh, rec);
  }
  applyBits(mesh, rec);
  return rec;
}

/** Counts from one sweep (reused object). */
export interface SweepResult {
  /** Meshes classified for the first time. */
  added: number;
  /** Static casters that moved, appeared or hid since the last sweep (the static map is stale). */
  staticChanged: number;
  /** Static casters that moved and were moved to the dynamic map. */
  promoted: number;
}

/**
 * Walks a scene, classifies casters it hasn't seen, and keeps their layers right (the warm pass and
 * shared skinning copy masks around). With `track`, it also watches static casters: one that moves
 * becomes a mover (its own shadow then updates every frame), and any move, appearance or hide marks
 * the static map stale. No allocations after a mesh's first sight.
 */
export class CasterSweep {
  readonly result: SweepResult = { added: 0, staticChanged: 0, promoted: 0 };
  private track = false;

  run(root: Object3D, track = false): SweepResult {
    this.track = track;
    this.result.added = this.result.staticChanged = this.result.promoted = 0;
    this.walk(root, true);
    return this.result;
  }

  /** Depth-first walk that carries the "visible with all ancestors" state without allocating. */
  private walk(obj: Object3D, parentShown: boolean): void {
    const shown = parentShown && obj.visible;
    this.visit(obj, shown);
    const kids = obj.children;
    for (let i = 0; i < kids.length; i++) this.walk(kids[i]!, shown);
  }

  private visit(obj: Object3D, shown: boolean): void {
    if (!(obj as Mesh).isMesh || (obj.layers.mask & STAGING_BIT) !== 0) return;
    let rec = records.get(obj);
    if (!rec) {
      if (!obj.castShadow) return;
      rec = assignCaster(obj as Mesh);
      rec.shown = shown;
      this.result.added++;
      if (rec.size !== 'none' && !rec.moving && shown) this.result.staticChanged++;
      return;
    }
    applyBits(obj, rec);
    if (!this.track || rec.size === 'none' || rec.moving) return;
    const e = obj.matrixWorld.elements;
    const inst = obj as unknown as InstancedMesh;
    const moved =
      Math.abs(e[0]! - rec.e0) > 1e-4 ||
      Math.abs(e[5]! - rec.e5) > 1e-4 ||
      Math.abs(e[12]! - rec.e12) > 1e-3 ||
      Math.abs(e[13]! - rec.e13) > 1e-3 ||
      Math.abs(e[14]! - rec.e14) > 1e-3 ||
      (inst.isInstancedMesh === true && inst.instanceMatrix.version !== rec.instVersion);
    if (moved) {
      // Moved in two sweeps running: it animates, so it joins the movers. A one-off placement
      // (a site set down, a prop put back) only refreshes the static map.
      if (++rec.moves >= 2) {
        rec.moving = true;
        rec.bits = casterLayerBits(rec);
        applyBits(obj, rec);
        this.result.promoted++;
      }
      if (shown || rec.shown) this.result.staticChanged++;
      snapshot(obj, rec, shown);
      return;
    }
    rec.moves = 0;
    if (shown !== rec.shown) {
      rec.shown = shown;
      this.result.staticChanged++;
    }
  }
}
