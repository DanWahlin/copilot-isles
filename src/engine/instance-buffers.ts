import { InstancedBufferAttribute, type InstancedMesh } from 'three/webgpu';

/**
 * Frees the instance buffers three makes for an instanced mesh or sprite when it's disposed (issue 262).
 *
 * On the attribute path (`sharedInstancedMesh`, past 1,024 matrices) three r186 reads a mesh's
 * matrices through an interleaved buffer it makes itself over `instanceMatrix.array`, and last
 * frame's through another over a clone of `instanceMatrix` (for motion vectors); instance colours go
 * through an attribute over `instanceColor.array` (three/src/nodes/accessors/Instance.js). Attributes
 * a material reads with `instancedBufferAttribute` (the mist's cards, the fireflies, battle smoke) are
 * the same: node attributes. three frees node attributes only when the **geometry** is disposed, and
 * only those of the first render object that drew it (Geometries.js). So an island's instanced meshes
 * and sprites over a geometry that outlives it (a shared rock, the crates, the banyan's cached parts,
 * the sprite quad) kept theirs for good, ~128 KB per mesh per visit. Disposing the shared geometry
 * would also free its vertex buffers, which other islands still draw (issue 251).
 *
 * `trackInstanceBuffers` wraps the renderer's public `info.createAttribute`/`destroyAttribute` (on
 * this renderer only; no three internals are patched) to note each instance attribute by the array it
 * views. `releaseInstanceBuffers` and `releaseInstanceAttributes` free exactly those of one mesh or
 * of given attributes through the backend's and the info's public `destroyAttribute`, as three's own
 * geometry dispose does, and nothing of the geometry. three may still free them again later, with the
 * geometry (its first render object's): the wrapped `backend.destroyAttribute` skips a buffer already
 * freed here (WebGPU's backend would throw on a plain attribute it had already forgotten).
 *
 * The mesh must not be drawn again: like after three's geometry dispose, its next draw would submit
 * the destroyed buffers. `sharedInstancedMesh` frees on the mesh's `dispose`, which the owners send
 * only at the end of a mesh's life (`freeInSlices`, `releaseRemovedObjects`).
 */

interface InstanceAttributeLike {
  isInterleavedBufferAttribute?: boolean;
  isInstancedBufferAttribute?: boolean;
  array?: object;
  data?: { isInstancedInterleavedBuffer?: boolean; array?: object };
}

export interface InstanceBufferRenderer {
  info: { createAttribute?(a: object): void; destroyAttribute?(a: object): void };
  backend: { destroyAttribute?(a: object): void };
}

/**
 * An instanced mesh's matrices that remember three's copies of them (last frame's, made with
 * `clone()` the first time a pass needs motion vectors), so their buffers can be freed too.
 */
export class InstanceMatrices extends InstancedBufferAttribute {
  readonly copies: InstancedBufferAttribute[] = [];

  override clone(): InstancedBufferAttribute {
    const copy = super.clone() as InstancedBufferAttribute;
    this.copies.push(copy);
    return copy;
  }
}

interface Tracker {
  renderer: InstanceBufferRenderer;
  /** three's live instance attributes, by the array they view. */
  views: WeakMap<object, Set<object>>;
  /** Freed here: not freed again when three frees its geometry. */
  freed: WeakSet<object>;
  destroyBuffer: (a: object) => void;
}

const TRACKED = Symbol('instanceBuffers');
let tracker: Tracker | null = null;

/** The array an instance attribute three uploaded views (its interleaved buffer's, or its own), or null. */
function viewedArray(a: object): object | null {
  const attr = a as InstanceAttributeLike;
  if (attr.isInterleavedBufferAttribute)
    return attr.data?.isInstancedInterleavedBuffer ? (attr.data.array ?? null) : null;
  return attr.isInstancedBufferAttribute ? (attr.array ?? null) : null;
}

/**
 * Notes the instance attributes `renderer` uploads from now on, for `releaseInstanceBuffers`. Call it
 * once, before anything is drawn; the last renderer tracked is the one released through.
 */
export function trackInstanceBuffers(renderer: InstanceBufferRenderer): void {
  const info = renderer.info as InstanceBufferRenderer['info'] & { [TRACKED]?: Tracker };
  const existing = info[TRACKED];
  if (existing) {
    tracker = existing;
    return;
  }
  const backend = renderer.backend;
  const create = info.createAttribute;
  const destroy = info.destroyAttribute;
  const destroyBuffer = backend.destroyAttribute;
  if (typeof create !== 'function' || typeof destroy !== 'function' || typeof destroyBuffer !== 'function')
    return;
  const t: Tracker = {
    renderer,
    views: new WeakMap(),
    freed: new WeakSet(),
    destroyBuffer: (a) => destroyBuffer.call(backend, a),
  };
  info.createAttribute = function (this: unknown, a: object) {
    create.call(this, a);
    const array = viewedArray(a);
    if (!array) return;
    t.freed.delete(a);
    let set = t.views.get(array);
    if (!set) t.views.set(array, (set = new Set()));
    set.add(a);
  };
  // Freed by three itself (a geometry's dispose): not ours to free again.
  info.destroyAttribute = function (this: unknown, a: object) {
    const array = viewedArray(a);
    if (array) t.views.get(array)?.delete(a);
    destroy.call(this, a);
  };
  backend.destroyAttribute = function (this: unknown, a: object) {
    if (t.freed.has(a)) return;
    destroyBuffer.call(this, a);
  };
  info[TRACKED] = t;
  tracker = t;
}

/** Frees what three uploaded viewing each of `arrays`; returns how many attribute views. */
function releaseViews(arrays: readonly object[]): number {
  if (!tracker) return 0;
  const { renderer, views, freed, destroyBuffer } = tracker;
  let n = 0;
  for (const array of arrays) {
    const set = views.get(array);
    if (!set) continue;
    views.delete(array);
    for (const a of set) {
      destroyBuffer(a);
      freed.add(a);
      renderer.info.destroyAttribute?.(a);
      n++;
    }
  }
  return n;
}

/** The arrays three's instance attributes for `mesh` view: its matrices, their copies and its colours. */
function meshArrays(mesh: InstancedMesh): object[] {
  const arrays: object[] = [mesh.instanceMatrix.array];
  if (mesh.instanceMatrix instanceof InstanceMatrices)
    for (const copy of mesh.instanceMatrix.copies) arrays.push(copy.array);
  if (mesh.instanceColor) arrays.push(mesh.instanceColor.array);
  return arrays;
}

/**
 * Frees the GPU buffers three made for `mesh`'s instances (matrices, last frame's, colours), not its
 * geometry's. Returns how many attribute views it freed. The mesh must never be drawn again.
 */
export function releaseInstanceBuffers(mesh: InstancedMesh): number {
  return releaseViews(meshArrays(mesh));
}

/**
 * Frees the GPU buffers of per-instance attributes a material reads (`instancedBufferAttribute`), for
 * a sprite or mesh over a shared geometry that's done. Nothing may draw them again.
 */
export function releaseInstanceAttributes(attributes: readonly InstancedBufferAttribute[]): number {
  return releaseViews(attributes.map((a) => a.array));
}

/** For tests: forget the tracked renderer. */
export function untrackInstanceBuffers(): void {
  tracker = null;
}
