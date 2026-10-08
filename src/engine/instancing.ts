import { InstancedMesh, type BufferGeometry, type Material } from 'three/webgpu';

/**
 * three (r186) draws an InstancedMesh's matrices from a uniform buffer while they fit in one (64 KB,
 * WebGPU's default `maxUniformBufferBindingSize`: 1,024 matrices), and names that buffer after its
 * node id. So every instanced mesh got its own vertex shader in every pass, even ten batches with one
 * material. Past that size it reads them as vertex attributes instead, named by slot, so batches with
 * the same material share a shader (issue 237). Padding the capacity past it costs 64 KB of matrices
 * per mesh (and as much again for last frame's, for motion vectors); only the instances in use are
 * uploaded (`markInstancesChanged`).
 */
export const SHARED_INSTANCE_CAPACITY = 1025;

/** WebGPU's default vertex limits; the attribute path needs room for two matrices (now and last frame). */
const MAX_VERTEX_BUFFERS = 8;
const MAX_VERTEX_ATTRIBUTES = 16;

/**
 * The capacity to give an instanced mesh of `count` instances so it shares its shader: padded past
 * the uniform-buffer size, unless its geometry leaves no room for the matrix attributes (then
 * `count`, as before).
 */
export function sharedInstanceCapacity(
  geometry: BufferGeometry,
  count: number,
  instanceColors = false,
): number {
  const n = Math.max(1, count);
  if (n >= SHARED_INSTANCE_CAPACITY) return n;
  const attributes = Object.keys(geometry.attributes).length + (instanceColors ? 1 : 0);
  const buffers = new Set<unknown>();
  for (const a of Object.values(geometry.attributes)) {
    buffers.add('isInterleavedBufferAttribute' in a && a.isInterleavedBufferAttribute ? a.data : a);
  }
  // Two matrix buffers (4 attributes each), plus the instance colours if any.
  if (attributes + 8 > MAX_VERTEX_ATTRIBUTES) return n;
  if (buffers.size + 2 + (instanceColors ? 1 : 0) > MAX_VERTEX_BUFFERS) return n;
  return SHARED_INSTANCE_CAPACITY;
}

/**
 * An InstancedMesh that shares its shader with others of the same material (see above), drawing
 * `count` instances (all of them by default).
 */
export function sharedInstancedMesh<G extends BufferGeometry, M extends Material | Material[]>(
  geometry: G,
  material: M,
  capacity: number,
  opts: { count?: number; instanceColors?: boolean } = {},
): InstancedMesh<G, M> {
  const mesh = new InstancedMesh<G, M>(
    geometry,
    material,
    sharedInstanceCapacity(geometry, capacity, opts.instanceColors),
  );
  mesh.count = opts.count ?? capacity;
  return mesh;
}

/** Marks the instances in use (`mesh.count`) for upload, rather than the whole padded buffer. */
export function markInstancesChanged(mesh: InstancedMesh, colors = false): void {
  const n = Math.max(1, mesh.count);
  mesh.instanceMatrix.clearUpdateRanges();
  mesh.instanceMatrix.addUpdateRange(0, n * 16);
  mesh.instanceMatrix.needsUpdate = true;
  if (colors && mesh.instanceColor) {
    mesh.instanceColor.clearUpdateRanges();
    mesh.instanceColor.addUpdateRange(0, n * 3);
    mesh.instanceColor.needsUpdate = true;
  }
}
