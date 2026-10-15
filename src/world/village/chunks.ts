import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BufferAttribute, Vector3, type BufferGeometry, type Camera, type Mesh } from 'three/webgpu';
import type { TierSettings } from '../../engine/quality';
import { chooseLodLevel, lodRanges, type LodRanges, type LodSimplifier } from '../characters/character-lod';

/**
 * Spatial chunks for a town's merged static meshes (PLAN §12.2, §12.4). One merged mesh per material
 * is one draw, but it has one bounding sphere round the whole town, so frustum culling can't skip any
 * of it. Here the placed pieces of one material are split into a few chunks by position. Each is
 * still one draw with the same material, so there's no new pipeline.
 */
export interface ChunkOptions {
  /** A chunk is split in two (along its longer side, at the median piece) while it has more triangles. */
  maxTriangles: number;
}

/**
 * A tier's chunk size: about 24k triangles a chunk, 48k on Lite (it draws its towns at LOD 1 at
 * least, so it spends fewer draws on the split).
 */
export function chunkOptions(tier: TierSettings): ChunkOptions {
  return { maxTriangles: tier.tier === 'lite' ? 48_000 : 24_000 };
}

export interface GeometryChunk {
  geometry: BufferGeometry;
  triangles: number;
}

interface Piece {
  geometry: BufferGeometry;
  x: number;
  z: number;
  triangles: number;
}

export function triangleCount(geometry: BufferGeometry): number {
  return Math.floor((geometry.index ? geometry.index.count : geometry.getAttribute('position').count) / 3);
}

function split(pieces: Piece[], maxTriangles: number, out: Piece[][]): void {
  let triangles = 0;
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const p of pieces) {
    triangles += p.triangles;
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minZ = Math.min(minZ, p.z);
    maxZ = Math.max(maxZ, p.z);
  }
  if (triangles <= maxTriangles || pieces.length < 2) {
    out.push(pieces);
    return;
  }
  const alongX = maxX - minX >= maxZ - minZ;
  const sorted = [...pieces].sort((a, b) => (alongX ? a.x - b.x : a.z - b.z));
  // Split where the triangles (not the pieces) are halved, so the two sides weigh the same.
  let half = 0;
  let cut = 1;
  for (; cut < sorted.length - 1; cut++) {
    half += sorted[cut - 1]!.triangles;
    if (half * 2 >= triangles) break;
  }
  split(sorted.slice(0, cut), maxTriangles, out);
  split(sorted.slice(cut), maxTriangles, out);
}

/**
 * Merges placed pieces (world-space geometries with the same attributes) into spatial chunks. The
 * pieces are consumed: they're disposed once merged. The triangle total doesn't change.
 */
export function mergeIntoChunks(geometries: BufferGeometry[], options: ChunkOptions): GeometryChunk[] {
  return [...eachChunk(geometries, options)];
}

/**
 * `mergeIntoChunks` a chunk at a time, so a sliced build can breathe between chunks (merging a big
 * material's pieces at once took tens of milliseconds). The pieces are disposed once it's run out.
 */
export function* eachChunk(geometries: BufferGeometry[], options: ChunkOptions): Generator<GeometryChunk> {
  const pieces: Piece[] = geometries.map((geometry) => {
    if (!geometry.boundingSphere) geometry.computeBoundingSphere();
    const s = geometry.boundingSphere!;
    return { geometry, x: s.center.x, z: s.center.z, triangles: triangleCount(geometry) };
  });
  const leaves: Piece[][] = [];
  if (pieces.length > 0) split(pieces, options.maxTriangles, leaves);
  try {
    for (const leaf of leaves) {
      const merged = mergeGeometries(
        leaf.map((p) => p.geometry),
        false,
      );
      if (!merged) continue;
      merged.computeBoundingSphere();
      merged.computeBoundingBox();
      yield { geometry: merged, triangles: triangleCount(merged) };
    }
  } finally {
    for (const geometry of geometries) geometry.dispose();
  }
}

/**
 * Lite: moves one material bucket's pieces into another's, so they draw as one (a draw fewer), when
 * every piece has the same attributes (so they merge). For looks that are alike: the kit's rope and
 * cloth are both vertex colour over a faint procedural pattern, matte. Returns whether it moved them.
 */
export function moveBucketInto<K extends string>(
  buckets: Record<K, BufferGeometry[]>,
  from: K,
  to: K,
): boolean {
  const moving = buckets[from];
  const target = buckets[to];
  if (moving.length === 0) return false;
  const layout = (g: BufferGeometry) =>
    `${Object.keys(g.attributes).sort().join(',')}|${g.index ? 'i' : ''}|${Object.keys(g.morphAttributes).length}`;
  const want = layout(target[0] ?? moving[0]!);
  for (const g of moving) if (layout(g) !== want) return false;
  for (const g of target) if (layout(g) !== want) return false;
  target.push(...moving.splice(0));
  return true;
}

/**
 * Chunk levels of detail (PLAN §12.3). Like the characters' LODs, two coarser index lists go after
 * the full one in the chunk's own index buffer, and each draw picks its range: no new geometry,
 * buffer or pipeline. Each level may move the surface by at most its error (m, absolute), and drops
 * loose bits smaller than that, so it's only drawn where that error is under about half a pixel (a
 * pixel on Lite and Low).
 */
export const CHUNK_LOD_ERRORS = [0.05, 0.18] as const;
/** Chunks smaller than this keep one level. */
const CHUNK_LOD_MIN_TRIANGLES = 1500;

/**
 * Adds LOD 1 and 2 to a chunk's index (see `CHUNK_LOD_ERRORS`) and records their ranges like the
 * characters' (`lodRanges`). Normals and vertex colours weigh in, so painted edges hold. Returns false
 * (and changes nothing) for a small or grouped chunk, or one the simplifier can't reduce.
 */
export function buildChunkLodIndex(
  geometry: BufferGeometry,
  simplify: LodSimplifier,
  errors: readonly [number, number] = CHUNK_LOD_ERRORS,
): boolean {
  const index = geometry.index;
  const position = geometry.getAttribute('position');
  if (!index || !position || geometry.groups.length > 0 || lodRanges(geometry)) return false;
  const full = index.count - (index.count % 3);
  if (full / 3 < CHUNK_LOD_MIN_TRIANGLES) return false;
  const vertices = position.count;
  const indices = new Uint32Array(full);
  for (let i = 0; i < full; i++) indices[i] = index.getX(i);
  const positions = new Float32Array(vertices * 3);
  for (let i = 0; i < vertices; i++) {
    positions[i * 3] = position.getX(i);
    positions[i * 3 + 1] = position.getY(i);
    positions[i * 3 + 2] = position.getZ(i);
  }
  const normal = geometry.getAttribute('normal');
  const color = geometry.getAttribute('color');
  const stride = (normal ? 3 : 0) + (color ? 3 : 0) || 1;
  const data = new Float32Array(vertices * stride);
  for (let i = 0; i < vertices; i++) {
    let o = i * stride;
    if (normal) {
      data[o++] = normal.getX(i);
      data[o++] = normal.getY(i);
      data[o++] = normal.getZ(i);
    }
    if (color) {
      data[o] = color.getX(i);
      data[o + 1] = color.getY(i);
      data[o + 2] = color.getZ(i);
    }
  }
  const weights = [...(normal ? [0.5, 0.5, 0.5] : []), ...(color ? [1, 1, 1] : [])];
  if (weights.length === 0) weights.push(0);
  const lod1 = simplify.simplifyWithAttributes(
    indices,
    positions,
    3,
    data,
    stride,
    weights,
    null,
    3,
    errors[0],
    ['ErrorAbsolute', 'Prune'],
  )[0];
  // LOD 2 starts from LOD 1, so it's never more than LOD 1.
  const lod2 = simplify.simplifyWithAttributes(
    lod1,
    positions,
    3,
    data,
    stride,
    weights,
    null,
    3,
    errors[1],
    ['ErrorAbsolute', 'Prune'],
  )[0];
  if (lod2.length >= full * 0.9) return false;
  const total = full + lod1.length + lod2.length;
  const combined = vertices <= 65535 ? new Uint16Array(total) : new Uint32Array(total);
  combined.set(indices, 0);
  combined.set(lod1, full);
  combined.set(lod2, full + lod1.length);
  geometry.setIndex(new BufferAttribute(combined, 1));
  geometry.setDrawRange(0, full);
  const ranges: LodRanges = [0, full, full, lod1.length, full + lod1.length, lod2.length];
  geometry.userData.lodRanges = ranges;
  return true;
}

/**
 * Camera distances (m) where a chunk's LOD 1 and LOD 2 start on a tier: where their error is half a
 * pixel (a pixel on Lite and Low) at the tier's render scale, on a 1080p screen (1440p on Ultra) with
 * the 55° walk camera.
 */
export function chunkLodEdges(
  tier: TierSettings,
  errors: readonly [number, number] = CHUNK_LOD_ERRORS,
): [number, number] {
  const rows = (tier.tier === 'ultra' ? 1440 : 1080) * tier.renderScale;
  const pixel = (2 * Math.tan((55 * Math.PI) / 360)) / rows;
  const allowed = tier.tier === 'lite' || tier.tier === 'low' ? 1 : 0.5;
  return [errors[0] / (pixel * allowed), errors[1] / (pixel * allowed)];
}

/**
 * The finest chunk level a tier draws: Lite (impostor-heavy, the weakest GPUs) draws its towns at
 * LOD 1 (5 cm off at most) even up close, the rest start at full detail.
 */
export function chunkLodFloor(tier: TierSettings): number {
  return tier.tier === 'lite' ? 1 : 0;
}

/**
 * Picks each chunk's level as it's drawn, from the camera position given to `update` (so the shadow
 * passes draw the same level as the view), by the distance to its bounding sphere's edge.
 */
export class ChunkLods {
  private x = 0;
  private y = 0;
  private z = 0;

  /** `floor`: the finest level drawn (Lite draws its towns at LOD 1 even up close). */
  constructor(
    private readonly edges: readonly [number, number],
    private readonly floor = 0,
  ) {}

  /** Hooks a chunk mesh that has LOD ranges (`buildChunkLodIndex`); allocates only here. */
  attach(mesh: Mesh): boolean {
    const geometry = mesh.geometry;
    if (!lodRanges(geometry)) return false;
    if (!geometry.boundingSphere) geometry.computeBoundingSphere();
    const sphere = geometry.boundingSphere!;
    let level = 0;
    mesh.onBeforeRender = (_renderer, _scene, _camera, g) => {
      const r = lodRanges(g);
      if (!r) return;
      const d = Math.max(
        0,
        Math.hypot(sphere.center.x - this.x, sphere.center.y - this.y, sphere.center.z - this.z) -
          sphere.radius,
      );
      level = chooseLodLevel(d, level, this.edges);
      const drawn = Math.max(level, this.floor);
      g.drawRange.start = r[drawn * 2]!;
      g.drawRange.count = r[drawn * 2 + 1]!;
    };
    mesh.onAfterRender = (_renderer, _scene, _camera, g) => {
      const r = lodRanges(g);
      if (!r) return;
      g.drawRange.start = r[0];
      g.drawRange.count = r[1];
    };
    return true;
  }

  /** Call once a frame with the camera's position. */
  update(x: number, y: number, z: number): void {
    this.x = x;
    this.y = y;
    this.z = z;
  }
}

const movingCentre = new Vector3();
const movingCamera = new Vector3();

/**
 * `ChunkLods` for a mesh that moves (the ship): its level is picked as it's drawn, from the drawing
 * camera's distance to its bounding sphere in world space (with the same hysteresis). The mesh needs
 * LOD ranges (`buildChunkLodIndex`). Returns false (and changes nothing) without them.
 */
export function attachMovingLod(mesh: Mesh, edges: readonly [number, number]): boolean {
  const geometry = mesh.geometry;
  if (!lodRanges(geometry)) return false;
  if (!geometry.boundingSphere) geometry.computeBoundingSphere();
  const sphere = geometry.boundingSphere!;
  let level = 0;
  mesh.onBeforeRender = (_renderer, _scene, camera: Camera, g) => {
    const r = lodRanges(g);
    if (!r) return;
    movingCentre.copy(sphere.center).applyMatrix4(mesh.matrixWorld);
    movingCamera.setFromMatrixPosition(camera.matrixWorld);
    level = chooseLodLevel(Math.max(0, movingCentre.distanceTo(movingCamera) - sphere.radius), level, edges);
    g.drawRange.start = r[level * 2]!;
    g.drawRange.count = r[level * 2 + 1]!;
  };
  mesh.onAfterRender = (_renderer, _scene, _camera, g) => {
    const r = lodRanges(g);
    if (!r) return;
    g.drawRange.start = r[0];
    g.drawRange.count = r[1];
  };
  return true;
}

/**
 * Lite's rocks (`simplifyInPlace` on the shared rock shapes, about a metre across): at most 3 cm off on
 * the unscaled rock (about 9 cm placed), about half the triangles.
 */
export const LITE_ROCK_ERROR = 0.03;

/**
 * Replaces a mesh's triangles with a coarser set (the surface moves `error` at most, in the geometry's
 * own units) in place: same vertices, a smaller index. For a tier's cheaper copy of small, many-times
 * instanced shapes (Lite's loose rocks). Returns the triangles saved.
 */
export function simplifyInPlace(geometry: BufferGeometry, simplify: LodSimplifier, error: number): number {
  const index = geometry.index;
  const position = geometry.getAttribute('position');
  if (!index || !position || geometry.groups.length > 0 || lodRanges(geometry)) return 0;
  const full = index.count - (index.count % 3);
  const indices = new Uint32Array(full);
  for (let i = 0; i < full; i++) indices[i] = index.getX(i);
  const positions = new Float32Array(position.count * 3);
  for (let i = 0; i < position.count; i++) {
    positions[i * 3] = position.getX(i);
    positions[i * 3 + 1] = position.getY(i);
    positions[i * 3 + 2] = position.getZ(i);
  }
  const normal = geometry.getAttribute('normal');
  const data = new Float32Array(position.count * 3);
  if (normal)
    for (let i = 0; i < position.count; i++) {
      data[i * 3] = normal.getX(i);
      data[i * 3 + 1] = normal.getY(i);
      data[i * 3 + 2] = normal.getZ(i);
    }
  const out = simplify.simplifyWithAttributes(
    indices,
    positions,
    3,
    data,
    3,
    normal ? [0.5, 0.5, 0.5] : [0, 0, 0],
    null,
    3,
    error,
    ['ErrorAbsolute'],
  )[0];
  if (out.length >= full) return 0;
  geometry.setIndex(new BufferAttribute(position.count <= 65535 ? new Uint16Array(out) : out, 1));
  return (full - out.length) / 3;
}
