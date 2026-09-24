// Adapted from Tidewater © 2026 DRG Software Solutions LLC, MIT, src/world/vegetation/PlantGeometry.js@d32799f
import { BufferGeometry, Float32BufferAttribute, Vector3 } from 'three/webgpu';
import type { PlantSpecies } from './types';

const PART_BARK = 0;
const PART_LEAF = 1;
const PART_FRUIT = 2;

class GeoBuilder {
  positions: number[] = [];
  normals: number[] = [];
  uvs: number[] = [];
  parts: number[] = [];
  shade: number[] = [];

  addVertex(
    x: number,
    y: number,
    z: number,
    nx: number,
    ny: number,
    nz: number,
    u: number,
    v: number,
    part: number,
    s: number,
  ): number {
    this.positions.push(x, y, z);
    this.normals.push(nx, ny, nz);
    this.uvs.push(u, v);
    this.parts.push(part);
    this.shade.push(s);
    return this.parts.length - 1;
  }

  addTri(a: number[], b: number[], c: number[], part: number, s = 1): void {
    const ab = new Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const ac = new Vector3(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
    const n = ab.cross(ac).normalize();
    this.addVertex(a[0], a[1], a[2], n.x, n.y, n.z, 0, 0, part, s);
    this.addVertex(b[0], b[1], b[2], n.x, n.y, n.z, 1, 0, part, s);
    this.addVertex(c[0], c[1], c[2], n.x, n.y, n.z, 0.5, 1, part, s);
  }

  addQuad(a: number[], b: number[], c: number[], d: number[], part: number, s = 1): void {
    this.addTri(a, b, c, part, s);
    this.addTri(a, c, d, part, s);
  }

  toGeometry(): BufferGeometry {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(this.positions, 3));
    geometry.setAttribute('normal', new Float32BufferAttribute(this.normals, 3));
    geometry.setAttribute('uv', new Float32BufferAttribute(this.uvs, 2));
    geometry.setAttribute('vegPart', new Float32BufferAttribute(this.parts, 1));
    geometry.setAttribute('shade', new Float32BufferAttribute(this.shade, 1));
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return geometry;
  }
}

function addCylinder(
  builder: GeoBuilder,
  height: number,
  radius0: number,
  radius1: number,
  sides: number,
  segments: number,
  curveX = 0,
  curveZ = 0,
): void {
  for (let y = 0; y < segments; y += 1) {
    const t0 = y / segments;
    const t1 = (y + 1) / segments;
    const c0 = [curveX * t0 * t0, height * t0, curveZ * t0 * t0];
    const c1 = [curveX * t1 * t1, height * t1, curveZ * t1 * t1];
    const r0 = radius0 + (radius1 - radius0) * t0;
    const r1 = radius0 + (radius1 - radius0) * t1;
    for (let i = 0; i < sides; i += 1) {
      const a0 = (i / sides) * Math.PI * 2;
      const a1 = ((i + 1) / sides) * Math.PI * 2;
      const p00 = [c0[0] + Math.cos(a0) * r0, c0[1], c0[2] + Math.sin(a0) * r0];
      const p10 = [c0[0] + Math.cos(a1) * r0, c0[1], c0[2] + Math.sin(a1) * r0];
      const p11 = [c1[0] + Math.cos(a1) * r1, c1[1], c1[2] + Math.sin(a1) * r1];
      const p01 = [c1[0] + Math.cos(a0) * r1, c1[1], c1[2] + Math.sin(a0) * r1];
      builder.addQuad(p00, p10, p11, p01, PART_BARK, 0.55 + t0 * 0.3);
    }
  }
}

function addLeafStrip(
  builder: GeoBuilder,
  origin: number[],
  yaw: number,
  pitch: number,
  length: number,
  width: number,
  segments: number,
  part = PART_LEAF,
): void {
  const dir = new Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
  const side = new Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
  const droop = new Vector3(0, -1, 0);
  for (let i = 0; i < segments; i += 1) {
    const t0 = i / segments;
    const t1 = (i + 1) / segments;
    const center0 = new Vector3(origin[0], origin[1], origin[2])
      .addScaledVector(dir, length * t0)
      .addScaledVector(droop, length * 0.23 * t0 * t0);
    const center1 = new Vector3(origin[0], origin[1], origin[2])
      .addScaledVector(dir, length * t1)
      .addScaledVector(droop, length * 0.23 * t1 * t1);
    const w0 = width * Math.sin((1 - t0) * Math.PI * 0.5) * (1 - t0 * 0.72);
    const w1 = width * Math.sin((1 - t1) * Math.PI * 0.5) * (1 - t1 * 0.72);
    const lift0 = Math.sin(t0 * Math.PI) * width * 0.08;
    const lift1 = Math.sin(t1 * Math.PI) * width * 0.08;
    const a = center0
      .clone()
      .addScaledVector(side, -w0)
      .addScaledVector(new Vector3(0, 1, 0), lift0);
    const b = center0
      .clone()
      .addScaledVector(side, w0)
      .addScaledVector(new Vector3(0, 1, 0), lift0);
    const c = center1
      .clone()
      .addScaledVector(side, w1)
      .addScaledVector(new Vector3(0, 1, 0), lift1);
    const d = center1
      .clone()
      .addScaledVector(side, -w1)
      .addScaledVector(new Vector3(0, 1, 0), lift1);
    builder.addQuad(a.toArray(), b.toArray(), c.toArray(), d.toArray(), part, 0.5 + (1 - t0) * 0.45);
  }
}

function addCrownBlob(
  builder: GeoBuilder,
  cx: number,
  cy: number,
  cz: number,
  rx: number,
  ry: number,
  rz: number,
  shade: number,
): void {
  const rings = 5;
  const sides = 8;
  for (let j = 0; j < rings; j += 1) {
    const v0 = -Math.PI / 2 + (j / rings) * Math.PI;
    const v1 = -Math.PI / 2 + ((j + 1) / rings) * Math.PI;
    for (let i = 0; i < sides; i += 1) {
      const u0 = (i / sides) * Math.PI * 2;
      const u1 = ((i + 1) / sides) * Math.PI * 2;
      const p = (u: number, v: number) => [
        cx + Math.cos(v) * Math.cos(u) * rx,
        cy + Math.sin(v) * ry,
        cz + Math.cos(v) * Math.sin(u) * rz,
      ];
      builder.addQuad(p(u0, v0), p(u1, v0), p(u1, v1), p(u0, v1), PART_LEAF, shade);
    }
  }
}

function createPalmGeometry(kind: 'tall' | 'cluster' | 'young'): BufferGeometry {
  const b = new GeoBuilder();
  const tall = kind === 'tall';
  const young = kind === 'young';
  const height = tall ? 12.5 : young ? 5.6 : 8.2;
  const crownY = height;
  addCylinder(
    b,
    height,
    young ? 0.18 : 0.28,
    young ? 0.13 : 0.18,
    8,
    tall ? 9 : 6,
    tall ? 0.4 : 0.15,
    tall ? 1.0 : 0.25,
  );
  const fronds = tall ? 24 : young ? 12 : 20;
  for (let i = 0; i < fronds; i += 1) {
    const yaw = (i / fronds) * Math.PI * 2 + (i % 2) * 0.12;
    const pitch = -0.08 - (i % 3) * 0.045;
    const len = (tall ? 6.2 : young ? 3.2 : 4.7) * (0.86 + ((i * 17) % 9) * 0.025);
    const wid = (tall ? 0.72 : young ? 0.42 : 0.58) * (0.9 + ((i * 13) % 7) * 0.025);
    addLeafStrip(b, [tall ? 0.4 : 0.15, crownY, tall ? 1.0 : 0.25], yaw, pitch, len, wid, 5);
  }
  if (kind !== 'young') {
    for (let i = 0; i < 5; i += 1) {
      const yaw = (i / 5) * Math.PI * 2;
      addLeafStrip(b, [0.25, crownY - 0.35, 0.35], yaw, -0.85, 0.65, 0.09, 2, PART_FRUIT);
    }
  }
  return b.toGeometry();
}

function createBananaGeometry(): BufferGeometry {
  const b = new GeoBuilder();
  addCylinder(b, 2.4, 0.28, 0.2, 7, 4, 0.08, 0.02);
  for (let i = 0; i < 9; i += 1) {
    const yaw = (i / 9) * Math.PI * 2 + (i % 2) * 0.22;
    addLeafStrip(b, [0, 2.2 + (i % 3) * 0.12, 0], yaw, 0.22 - (i % 3) * 0.12, 3.3 + (i % 4) * 0.25, 0.62, 5);
  }
  return b.toGeometry();
}

function createFernGeometry(): BufferGeometry {
  const b = new GeoBuilder();
  addCylinder(b, 0.35, 0.05, 0.03, 5, 1);
  for (let i = 0; i < 14; i += 1) {
    const yaw = (i / 14) * Math.PI * 2;
    addLeafStrip(b, [0, 0.18, 0], yaw, 0.18, 1.15 + (i % 4) * 0.08, 0.14, 4);
  }
  return b.toGeometry();
}

function createShrubGeometry(): BufferGeometry {
  const b = new GeoBuilder();
  addCylinder(b, 0.8, 0.11, 0.07, 6, 2);
  addCrownBlob(b, -0.3, 0.95, 0.05, 0.75, 0.52, 0.65, 0.68);
  addCrownBlob(b, 0.25, 1.08, -0.18, 0.7, 0.58, 0.72, 0.82);
  addCrownBlob(b, 0.08, 0.82, 0.33, 0.66, 0.42, 0.55, 0.58);
  return b.toGeometry();
}

function createBroadleafTreeGeometry(): BufferGeometry {
  const b = new GeoBuilder();
  addCylinder(b, 5.4, 0.3, 0.18, 8, 6, -0.12, 0.08);
  addCylinder(b, 4.0, 0.13, 0.07, 6, 3, -0.9, 0.6);
  addCylinder(b, 4.1, 0.12, 0.06, 6, 3, 0.8, -0.4);
  addCrownBlob(b, -0.8, 5.6, 0.4, 1.8, 1.2, 1.55, 0.68);
  addCrownBlob(b, 0.75, 5.95, -0.25, 1.9, 1.28, 1.7, 0.78);
  addCrownBlob(b, 0.05, 6.55, 0.1, 1.65, 1.05, 1.45, 0.92);
  return b.toGeometry();
}

export function createPlantGeometry(species: PlantSpecies): BufferGeometry {
  switch (species) {
    case 'palmTall':
      return createPalmGeometry('tall');
    case 'palmCluster':
      return createPalmGeometry('cluster');
    case 'palmYoung':
      return createPalmGeometry('young');
    case 'banana':
      return createBananaGeometry();
    case 'fern':
      return createFernGeometry();
    case 'shrub':
      return createShrubGeometry();
    case 'broadleafTree':
      return createBroadleafTreeGeometry();
  }
}

export function triangleCount(geometry: BufferGeometry): number {
  return Math.floor((geometry.getAttribute('position')?.count ?? 0) / 3);
}
