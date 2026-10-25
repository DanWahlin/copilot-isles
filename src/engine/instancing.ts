import {
  BufferAttribute,
  Color,
  InstancedMesh,
  InterleavedBuffer,
  InterleavedBufferAttribute,
  Matrix4,
  type BufferGeometry,
  type Material,
} from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { InstanceMatrices, releaseInstanceBuffers } from './instance-buffers';

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

/** The vertex buffers a geometry's attributes use (an interleaved buffer counts once). */
function bufferCount(geometry: BufferGeometry): number {
  const buffers = new Set<unknown>();
  for (const a of Object.values(geometry.attributes)) {
    buffers.add('isInterleavedBufferAttribute' in a && a.isInterleavedBufferAttribute ? a.data : a);
  }
  return buffers.size;
}

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
  // Two matrix buffers (4 attributes each), plus the instance colours if any.
  if (attributes + 8 > MAX_VERTEX_ATTRIBUTES) return n;
  if (bufferCount(geometry) + 2 + (instanceColors ? 1 : 0) > MAX_VERTEX_BUFFERS) return n;
  return SHARED_INSTANCE_CAPACITY;
}

/**
 * Packs a geometry's per-vertex attributes (not the per-instance ones) into one interleaved Float32
 * buffer, in place, so they take one vertex buffer. The values and names don't change, so the
 * shader doesn't either. Attributes already interleaved are left as they are.
 */
export function interleaveVertexAttributes(geometry: BufferGeometry): void {
  const names = Object.keys(geometry.attributes).filter((name) => {
    const a = geometry.attributes[name]!;
    return (
      !('isInterleavedBufferAttribute' in a && a.isInterleavedBufferAttribute) &&
      !('isInstancedBufferAttribute' in a && a.isInstancedBufferAttribute)
    );
  });
  if (names.length < 2) return;
  const sources = names.map((name) => geometry.getAttribute(name) as BufferAttribute);
  const count = sources[0]!.count;
  if (sources.some((a) => a.count !== count)) return;
  const stride = sources.reduce((s, a) => s + a.itemSize, 0);
  const data = new Float32Array(count * stride);
  let offset = 0;
  for (const a of sources) {
    for (let i = 0; i < count; i++)
      for (let c = 0; c < a.itemSize; c++) data[i * stride + offset + c] = a.getComponent(i, c);
    offset += a.itemSize;
  }
  const buffer = new InterleavedBuffer(data, stride);
  offset = 0;
  for (let k = 0; k < names.length; k++) {
    const a = sources[k]!;
    geometry.setAttribute(names[k]!, new InterleavedBufferAttribute(buffer, a.itemSize, offset));
    offset += a.itemSize;
  }
}

const releaseOnDispose = (e: { target: InstancedMesh }) => void releaseInstanceBuffers(e.target);

/**
 * An InstancedMesh that shares its shader with others of the same material (see above), drawing
 * `count` instances (all of them by default). A geometry with too many vertex buffers for that (or,
 * past 1,024 instances, for the matrices' attributes at all) has its per-vertex attributes
 * interleaved into one (`interleaveVertexAttributes`) first. Its `dispose`
 * frees the instance buffers three made for it (`releaseInstanceBuffers`, issue 262), not its
 * geometry's: send it only when the mesh won't be drawn again.
 */
export function sharedInstancedMesh<G extends BufferGeometry, M extends Material | Material[]>(
  geometry: G,
  material: M,
  capacity: number,
  opts: { count?: number; instanceColors?: boolean } = {},
): InstancedMesh<G, M> {
  // Past the uniform buffer's room the matrices are attributes whatever the geometry: interleave its
  // attributes if they'd leave no vertex buffers for them (a big batch of a many-attribute plant).
  const big = Math.max(1, capacity) >= SHARED_INSTANCE_CAPACITY;
  if (
    big
      ? bufferCount(geometry) + 2 + (opts.instanceColors ? 1 : 0) > MAX_VERTEX_BUFFERS
      : sharedInstanceCapacity(geometry, capacity, opts.instanceColors) < SHARED_INSTANCE_CAPACITY
  )
    interleaveVertexAttributes(geometry);
  const mesh = new InstancedMesh<G, M>(
    geometry,
    material,
    sharedInstanceCapacity(geometry, capacity, opts.instanceColors),
  );
  mesh.count = opts.count ?? capacity;
  const matrices = new InstanceMatrices(mesh.instanceMatrix.array, 16);
  matrices.setUsage(mesh.instanceMatrix.usage);
  mesh.instanceMatrix = matrices;
  mesh.addEventListener('dispose', releaseOnDispose);
  return mesh;
}

const changedRanges = new WeakMap<BufferAttribute, { start: number; count: number }>();

/** Marks the first `count` values of an attribute for upload (no allocation after the first call). */
export function markAttributeChanged(attribute: BufferAttribute, count: number): void {
  let range = changedRanges.get(attribute);
  if (!range) {
    range = { start: 0, count };
    changedRanges.set(attribute, range);
  } else {
    range.start = 0;
    range.count = count;
  }
  attribute.updateRanges.length = 0;
  attribute.updateRanges.push(range);
  attribute.needsUpdate = true;
}

/** Marks the instances in use (`mesh.count`) for upload, rather than the whole padded buffer. */
export function markInstancesChanged(mesh: InstancedMesh, colors = false): void {
  const n = Math.max(1, mesh.count);
  markAttributeChanged(mesh.instanceMatrix, n * 16);
  if (colors && mesh.instanceColor) markAttributeChanged(mesh.instanceColor, n * 3);
}

/**
 * Bakes static instanced meshes that share a look into one plain geometry in their parent's space:
 * each instance's copy is moved by its matrix and painted its instance colour (white without one), so
 * a material with `vertexColors` draws them as before, in one draw (PLAN §12.2, merge static decor).
 * Only position, normal, uv and colour are kept. Returns null when there's nothing to bake.
 */
export function bakeInstances(meshes: readonly InstancedMesh[]): BufferGeometry | null {
  const parts: BufferGeometry[] = [];
  const matrix = new Matrix4();
  const color = new Color();
  for (const mesh of meshes) {
    const local = new Matrix4().copy(mesh.matrix);
    const source = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
    for (const name of Object.keys(source.attributes))
      if (!['position', 'normal', 'uv', 'color'].includes(name)) source.deleteAttribute(name);
    if (!source.getAttribute('uv'))
      source.setAttribute(
        'uv',
        new BufferAttribute(new Float32Array(source.getAttribute('position').count * 2), 2),
      );
    const tint = source.getAttribute('color');
    for (let i = 0; i < mesh.count; i++) {
      const g = source.clone();
      mesh.getMatrixAt(i, matrix);
      g.applyMatrix4(matrix.premultiply(local));
      if (mesh.instanceColor) mesh.getColorAt(i, color);
      else color.setRGB(1, 1, 1);
      const n = g.getAttribute('position').count;
      const colors = new Float32Array(n * 3);
      for (let v = 0; v < n; v++) {
        colors[v * 3] = color.r * (tint ? tint.getX(v) : 1);
        colors[v * 3 + 1] = color.g * (tint ? tint.getY(v) : 1);
        colors[v * 3 + 2] = color.b * (tint ? tint.getZ(v) : 1);
      }
      g.setAttribute('color', new BufferAttribute(colors, 3));
      parts.push(g);
    }
    source.dispose();
  }
  if (parts.length === 0) return null;
  const merged = mergeGeometries(parts, false);
  for (const g of parts) g.dispose();
  merged?.computeBoundingSphere();
  return merged;
}
