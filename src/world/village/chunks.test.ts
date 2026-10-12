import { beforeAll, describe, expect, it } from 'vitest';
import { Box3, BoxGeometry, Mesh, SphereGeometry, type BufferGeometry } from 'three/webgpu';
import { TIERS } from '../../engine/quality';
import { TIER_ORDER } from '../../engine/tier-info';
import { loadLodSimplifier, lodRanges, type LodSimplifier } from '../characters/character-lod';
import {
  ChunkLods,
  buildChunkLodIndex,
  chunkLodEdges,
  chunkLodFloor,
  mergeIntoChunks,
  simplifyInPlace,
  triangleCount,
} from './chunks';
import { paint } from './kit';

/** A row of placed boxes: `n` across x (8 m apart) and `rows` along z, each `size` metres across. */
function pieces(n: number, rows: number, size: number): BufferGeometry[] {
  const out: BufferGeometry[] = [];
  for (let i = 0; i < n; i++)
    for (let j = 0; j < rows; j++) out.push(new BoxGeometry(size, size, size).translate(i * 8, 0, j * 8));
  return out;
}

function boundsOf(list: BufferGeometry[]): Box3 {
  const box = new Box3();
  for (const g of list) {
    g.computeBoundingBox();
    box.union(g.boundingBox!);
  }
  return box;
}

describe('mergeIntoChunks', () => {
  it('keeps one chunk while the material is under the triangle limit', () => {
    const list = pieces(4, 2, 1);
    const chunks = mergeIntoChunks(list, { maxTriangles: 1000 });
    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.triangles).toBe(4 * 2 * 12);
  });

  it('splits by position into chunks under the limit, with the same triangles and bounds', () => {
    const list = pieces(16, 4, 1);
    const total = list.reduce((sum, g) => sum + triangleCount(g), 0);
    const whole = boundsOf(list);
    const chunks = mergeIntoChunks(list, { maxTriangles: 200 });
    // 64 boxes of 12 triangles (768) halve to 384, then 192: four chunks.
    expect(chunks).toHaveLength(4);
    expect(chunks.reduce((sum, c) => sum + c.triangles, 0)).toBe(total);
    for (const c of chunks) {
      expect(c.triangles).toBeLessThanOrEqual(200);
      expect(c.triangles).toBe(triangleCount(c.geometry));
      expect(c.geometry.boundingSphere).not.toBeNull();
      expect(whole.containsBox(c.geometry.boundingBox!)).toBe(true);
    }
    // Spatial: the chunks split the row along x (its long side), so their boxes don't overlap.
    const boxes = chunks.map((c) => c.geometry.boundingBox!).sort((a, b) => a.min.x - b.min.x);
    for (let i = 1; i < boxes.length; i++) expect(boxes[i]!.min.x).toBeGreaterThan(boxes[i - 1]!.max.x);
    expect(boundsOf(chunks.map((c) => c.geometry)).equals(whole)).toBe(true);
    // Each chunk is a quarter of the row, so its bounds are much smaller than the whole.
    for (const c of chunks) expect(c.geometry.boundingSphere!.radius).toBeLessThan(whole.max.x / 3);
  });

  it('frees the pieces it merged', () => {
    const list = pieces(2, 1, 1);
    let disposed = 0;
    for (const g of list) g.addEventListener('dispose', () => disposed++);
    mergeIntoChunks(list, { maxTriangles: 1000 });
    expect(disposed).toBe(2);
  });
});

describe('chunk levels of detail', () => {
  let simplify: LodSimplifier;
  beforeAll(async () => {
    simplify = (await loadLodSimplifier())!;
    expect(simplify).toBeTruthy();
  });

  /** Painted, finely tessellated balls in a row: plenty for the simplifier to take. */
  function balls(): BufferGeometry {
    const list: BufferGeometry[] = [];
    for (let i = 0; i < 6; i++) {
      const g = new SphereGeometry(1.5, 32, 24).translate(i * 5, 1, 0);
      paint(g, 0x9b7651);
      list.push(g);
    }
    return mergeIntoChunks(list, { maxTriangles: 1e6 })[0]!.geometry;
  }

  it('adds two coarser index lists after the full one, keeping the vertices', () => {
    const g = balls();
    const full = g.index!.count;
    const vertices = g.getAttribute('position').count;
    expect(buildChunkLodIndex(g, simplify)).toBe(true);
    const r = lodRanges(g)!;
    expect(r[0]).toBe(0);
    expect(r[1]).toBe(full);
    expect(r[3]).toBeLessThan(full);
    expect(r[5]).toBeLessThanOrEqual(r[3]);
    expect(g.index!.count).toBe(r[1] + r[3] + r[5]);
    expect(g.getAttribute('position').count).toBe(vertices);
    expect(g.drawRange.count).toBe(full);
  });

  it('skips small chunks', () => {
    expect(buildChunkLodIndex(new BoxGeometry(1, 1, 1), simplify)).toBe(false);
  });

  it('switches level by distance from the camera to the chunk', () => {
    const g = balls();
    buildChunkLodIndex(g, simplify);
    const r = lodRanges(g)!;
    const mesh = new Mesh(g);
    const lods = new ChunkLods([50, 150]);
    expect(lods.attach(mesh)).toBe(true);
    const draw = (z: number) => {
      lods.update(0, 0, z);
      mesh.onBeforeRender(null!, null!, null!, g, null!, null!);
      const count = g.drawRange.count;
      mesh.onAfterRender(null!, null!, null!, g, null!, null!);
      return count;
    };
    expect(draw(10)).toBe(r[1]);
    expect(draw(120)).toBe(r[3]);
    expect(draw(400)).toBe(r[5]);
    expect(draw(10)).toBe(r[1]);
    // With a floor of 1 (Lite), even a near chunk draws LOD 1.
    const lite = new ChunkLods([50, 150], chunkLodFloor(TIERS.lite));
    const near = new Mesh(g);
    lite.attach(near);
    lite.update(0, 0, 10);
    near.onBeforeRender(null!, null!, null!, g, null!, null!);
    expect(g.drawRange.count).toBe(r[3]);
    near.onAfterRender(null!, null!, null!, g, null!, null!);
    expect(chunkLodFloor(TIERS.low)).toBe(0);
    // After the draw the full list is back (raycasts and the next draw read it).
    expect(g.drawRange.count).toBe(r[1]);
  });

  it('simplifies a shape in place, keeping its vertices', () => {
    const g = new SphereGeometry(1, 24, 16);
    const vertices = g.getAttribute('position').count;
    const before = triangleCount(g);
    const saved = simplifyInPlace(g, simplify, 0.02);
    expect(saved).toBeGreaterThan(0);
    expect(triangleCount(g)).toBe(before - saved);
    expect(g.getAttribute('position').count).toBe(vertices);
  });

  it('starts the coarser levels further out on higher tiers', () => {
    const edges = TIER_ORDER.map((t) => chunkLodEdges(TIERS[t]));
    for (const [d1, d2] of edges) expect(d2).toBeGreaterThan(d1);
    for (let i = 1; i < edges.length; i++) expect(edges[i]![0]).toBeGreaterThan(edges[i - 1]![0]);
    // Medium and up: the first level's 5 cm is half a pixel or less, so it starts past ~90 m.
    expect(chunkLodEdges(TIERS.medium)[0]).toBeGreaterThan(90);
  });
});
