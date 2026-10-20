import { BufferAttribute, BufferGeometry, SphereGeometry } from 'three/webgpu';
import type { CircleObstacle } from '../contracts';
import { box, card, cylinder, tubeBetween, worldUv, type Point3 } from '../sites/geo';
import { paint, transform, type MaterialKey, type VillageBoxCollider } from '../village/kit';

/**
 * Small building helpers for the plaza art pass (the plaza's rim, the harbour stair, roofs and
 * dressing): everything goes into the town's material buckets, so it merges into the town's chunks
 * (no new draw or shader).
 */
export type Buckets = Record<MaterialKey, BufferGeometry[]>;
export interface PlazaColliders {
  circles: CircleObstacle[];
  boxes: VillageBoxCollider[];
  camera?: VillageBoxCollider[];
}

/** Warm sandstone for the plaza's walls and stairs (the concept's honey stone), and its trims. */
export const SANDSTONE = 0xd9a86c;
export const SANDSTONE_DARK = 0xb98a58;
export const COPING = 0xf2dcb0;
export const TERRACOTTA_POT = 0xb8562e;
export const LEAF = 0x2f7a3a;
export const LEAF_DARK = 0x1e5a2c;
export const GERANIUM = 0xd8333a;
export const PINK = 0xe0679a;
export const SUNFLOWER = 0xf0c040;

/** A box whose base sits at y, turned by `ry` (yaw), into a bucket; world UVs like the town's (1.8/m). */
export function addBox(
  b: Buckets,
  key: MaterialKey,
  x: number,
  y: number,
  z: number,
  w: number,
  h: number,
  d: number,
  ry: number,
  colour: number,
  rx = 0,
  rz = 0,
): void {
  if (w <= 0 || h <= 0 || d <= 0) return;
  b[key].push(box(w, h, d, { x, y, z, ry, rx, rz }, key === 'paving' ? 0xffffff : colour, 1.8));
}

/** A flat card (bottom edge at y) facing along yaw `ry`, for cheap trim. */
export function addCard(
  b: Buckets,
  key: MaterialKey,
  x: number,
  y: number,
  z: number,
  w: number,
  h: number,
  ry: number,
  colour: number,
): void {
  b[key].push(card(w, h, { x, y, z, ry }, colour, 1.8));
}

export function addCylinder(
  b: Buckets,
  key: MaterialKey,
  x: number,
  y: number,
  z: number,
  rTop: number,
  rBottom: number,
  h: number,
  segments: number,
  colour: number,
): void {
  const g = cylinder(rTop, rBottom, h, { x, y, z }, colour, segments);
  worldUv(g, 1.8);
  b[key].push(g);
}

export function addTube(
  b: Buckets,
  key: MaterialKey,
  radius: number,
  a: Point3,
  c: Point3,
  colour: number,
  segments = 5,
): void {
  b[key].push(tubeBetween(radius, a, c, colour, segments));
}

/** A squashed sphere (a shrub, a crown of leaves, a flower head). */
export function addBlob(
  b: Buckets,
  key: MaterialKey,
  x: number,
  y: number,
  z: number,
  sx: number,
  sy: number,
  sz: number,
  colour: number,
  ws: number,
  hs: number,
): void {
  const g = new SphereGeometry(1, ws, hs);
  transform(g, x, y, z, 0, 0, 0, sx, sy, sz);
  worldUv(g, 0.8);
  paint(g, colour);
  b[key].push(g);
}

/**
 * Builds a geometry from flat faces (each face its own vertices, so hard edges stay hard): a list of
 * quads or triangles in world space, with UVs per corner. Painted with `colour` (the town's paint:
 * a small per-vertex variation).
 */
export class FaceBuilder {
  private readonly positions: number[] = [];
  private readonly uvs: number[] = [];
  private readonly indices: number[] = [];

  /** A triangle a, b, c (counter-clockwise seen from the front). */
  tri(
    a: Point3,
    b: Point3,
    c: Point3,
    ua: [number, number],
    ub: [number, number],
    uc: [number, number],
  ): this {
    const i = this.positions.length / 3;
    this.positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    this.uvs.push(ua[0], ua[1], ub[0], ub[1], uc[0], uc[1]);
    this.indices.push(i, i + 1, i + 2);
    return this;
  }

  /** A quad a, b, c, d (counter-clockwise seen from the front). */
  quad(
    a: Point3,
    b: Point3,
    c: Point3,
    d: Point3,
    ua: [number, number],
    ub: [number, number],
    uc: [number, number],
    ud: [number, number],
  ): this {
    const i = this.positions.length / 3;
    this.positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z, d.x, d.y, d.z);
    this.uvs.push(ua[0], ua[1], ub[0], ub[1], uc[0], uc[1], ud[0], ud[1]);
    this.indices.push(i, i + 1, i + 2, i, i + 2, i + 3);
    return this;
  }

  get empty(): boolean {
    return this.indices.length === 0;
  }

  build(colour: number): BufferGeometry {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(this.positions), 3));
    g.setAttribute('uv', new BufferAttribute(new Float32Array(this.uvs), 2));
    g.setIndex(this.indices);
    paint(g, colour);
    return g;
  }
}
