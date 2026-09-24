// Adapted from Tidewater © 2026 DRG Software Solutions LLC, MIT, src/world/vegetation/PlantGeometry.js@d32799f
import { BufferGeometry, Float32BufferAttribute, Vector3 } from 'three/webgpu';
import type { PlantSpecies } from './types';
import { hash2 } from './random';

const PART_BARK = 0;
const PART_LEAF = 1;
const PART_FRUIT = 2;
const PART_DEAD = 3;

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

const tmpV = new Vector3();
const tmpA = new Vector3();
const tmpB = new Vector3();
const tmpC = new Vector3();

function basisFromDir(dir: Vector3): { right: Vector3; up: Vector3 } {
  const upRef = Math.abs(dir.y) > 0.92 ? new Vector3(1, 0, 0) : new Vector3(0, 1, 0);
  const right = tmpA.copy(upRef).cross(dir).normalize().clone();
  const up = tmpB.copy(dir).cross(right).normalize().clone();
  return { right, up };
}

function addBranch(
  builder: GeoBuilder,
  start: Vector3,
  end: Vector3,
  radius0: number,
  radius1: number,
  sides: number,
  part = PART_BARK,
  shade0 = 0.55,
): void {
  const dir = tmpV.copy(end).sub(start);
  const len = dir.length();
  if (len < 0.001) return;
  dir.divideScalar(len);
  const { right, up } = basisFromDir(dir);
  for (let i = 0; i < sides; i += 1) {
    const a0 = (i / sides) * Math.PI * 2;
    const a1 = ((i + 1) / sides) * Math.PI * 2;
    const ring = (center: Vector3, r: number, a: number) =>
      center
        .clone()
        .addScaledVector(right, Math.cos(a) * r)
        .addScaledVector(up, Math.sin(a) * r);
    builder.addQuad(
      ring(start, radius0, a0).toArray(),
      ring(start, radius0, a1).toArray(),
      ring(end, radius1, a1).toArray(),
      ring(end, radius1, a0).toArray(),
      part,
      shade0 + (i % 2) * 0.08,
    );
  }
}

function addCurvedTrunk(
  builder: GeoBuilder,
  height: number,
  radius0: number,
  radius1: number,
  sides: number,
  segments: number,
  curveX: number,
  curveZ: number,
  offsetX = 0,
  offsetZ = 0,
): Vector3 {
  let prev = new Vector3(offsetX, 0, offsetZ);
  for (let y = 0; y < segments; y += 1) {
    const t1 = (y + 1) / segments;
    const next = new Vector3(offsetX + curveX * t1 * t1, height * t1, offsetZ + curveZ * t1 * t1);
    const r0 = radius0 + (radius1 - radius0) * (y / segments);
    const r1 = radius0 + (radius1 - radius0) * t1;
    addBranch(builder, prev, next, r0, r1, sides, PART_BARK, y % 2 === 0 ? 0.44 : 0.67);
    prev = next;
  }
  return prev;
}

function addDiamondCard(
  builder: GeoBuilder,
  center: Vector3,
  axis: Vector3,
  side: Vector3,
  length: number,
  width: number,
  part: number,
  shade: number,
): void {
  const tip = center.clone().addScaledVector(axis, length * 0.55);
  const base = center.clone().addScaledVector(axis, -length * 0.45);
  const left = center.clone().addScaledVector(side, width);
  const right = center.clone().addScaledVector(side, -width);
  builder.addTri(base.toArray(), left.toArray(), tip.toArray(), part, shade);
  builder.addTri(base.toArray(), tip.toArray(), right.toArray(), part, shade * 0.94);
}

function addPalmFrond(
  builder: GeoBuilder,
  origin: Vector3,
  yaw: number,
  pitch: number,
  length: number,
  width: number,
  seed: number,
  dead = false,
): void {
  const forward = new Vector3(
    Math.sin(yaw) * Math.cos(pitch),
    Math.sin(pitch),
    Math.cos(yaw) * Math.cos(pitch),
  );
  const side = new Vector3(Math.cos(yaw), 0, -Math.sin(yaw)).normalize();
  const last = origin.clone();
  const segments = 5;
  for (let i = 1; i <= segments; i += 1) {
    const t = i / segments;
    const p = origin
      .clone()
      .addScaledVector(forward, length * t)
      .addScaledVector(new Vector3(0, -1, 0), length * (0.1 * t + 0.42 * t * t));
    addBranch(
      builder,
      last,
      p,
      width * 0.035 * (1 - (i - 1) / segments),
      width * 0.02 * (1 - t),
      4,
      dead ? PART_DEAD : PART_LEAF,
      0.62,
    );
    last.copy(p);
  }

  const leaflets = Math.max(9, Math.floor(length * 2.2));
  for (let i = 0; i < leaflets; i += 1) {
    const t = (i + 0.45) / leaflets;
    const center = origin
      .clone()
      .addScaledVector(forward, length * t)
      .addScaledVector(new Vector3(0, -1, 0), length * (0.1 * t + 0.42 * t * t));
    const leafletLen = width * (1.45 - Math.abs(t - 0.42) * 1.2) * (0.85 + hash2(i, seed, 71) * 0.25);
    const leafletWidth = width * 0.09 * (1 - t * 0.25);
    const sweep = 0.35 + t * 0.55;
    const shade = dead ? 0.45 + t * 0.25 : 0.42 + t * 0.55;
    for (const sideSign of [-1, 1]) {
      const axis = side
        .clone()
        .multiplyScalar(sideSign)
        .addScaledVector(forward, 0.18 - t * 0.16)
        .addScaledVector(new Vector3(0, -1, 0), 0.18 + t * 0.22)
        .normalize();
      const cross = tmpC.copy(axis).cross(forward).normalize();
      const c = center.clone().addScaledVector(side, sideSign * width * sweep * Math.sin(Math.PI * t));
      addDiamondCard(builder, c, axis, cross, leafletLen, leafletWidth, dead ? PART_DEAD : PART_LEAF, shade);
    }
  }
}

function addCoconutCluster(builder: GeoBuilder, origin: Vector3, seed: number): void {
  const count = 5 + Math.floor(hash2(seed, 2, 9) * 4);
  for (let i = 0; i < count; i += 1) {
    const yaw = (i / count) * Math.PI * 2;
    const center = origin
      .clone()
      .add(new Vector3(Math.cos(yaw) * 0.28, -0.45 - (i % 3) * 0.06, Math.sin(yaw) * 0.28));
    const r = 0.16 + hash2(i, seed, 3) * 0.05;
    const top = center.clone().add(new Vector3(0, r, 0));
    const bottom = center.clone().add(new Vector3(0, -r, 0));
    const east = center.clone().add(new Vector3(r, 0, 0));
    const west = center.clone().add(new Vector3(-r, 0, 0));
    const north = center.clone().add(new Vector3(0, 0, r));
    const south = center.clone().add(new Vector3(0, 0, -r));
    builder.addTri(top.toArray(), east.toArray(), north.toArray(), PART_FRUIT, 0.45);
    builder.addTri(top.toArray(), north.toArray(), west.toArray(), PART_FRUIT, 0.5);
    builder.addTri(top.toArray(), west.toArray(), south.toArray(), PART_FRUIT, 0.42);
    builder.addTri(top.toArray(), south.toArray(), east.toArray(), PART_FRUIT, 0.48);
    builder.addTri(bottom.toArray(), north.toArray(), east.toArray(), PART_FRUIT, 0.32);
    builder.addTri(bottom.toArray(), west.toArray(), north.toArray(), PART_FRUIT, 0.36);
    builder.addTri(bottom.toArray(), south.toArray(), west.toArray(), PART_FRUIT, 0.3);
    builder.addTri(bottom.toArray(), east.toArray(), south.toArray(), PART_FRUIT, 0.34);
  }
}

function addPalmTree(
  builder: GeoBuilder,
  height: number,
  crownRadius: number,
  fronds: number,
  offsetX: number,
  offsetZ: number,
  curveX: number,
  curveZ: number,
  seed: number,
): void {
  const crown = addCurvedTrunk(
    builder,
    height,
    height * 0.026,
    height * 0.014,
    8,
    Math.max(7, Math.floor(height * 0.85)),
    curveX,
    curveZ,
    offsetX,
    offsetZ,
  );
  const crownLift = crown.clone().add(new Vector3(0, 0.12, 0));
  for (let i = 0; i < fronds; i += 1) {
    const yaw = (i / fronds) * Math.PI * 2 + hash2(i, seed, 4) * 0.25;
    const pitch = -0.03 - hash2(i, seed, 5) * 0.18;
    const len = crownRadius * (0.83 + hash2(i, seed, 6) * 0.28);
    const width = crownRadius * 0.13 * (0.85 + hash2(i, seed, 7) * 0.35);
    addPalmFrond(builder, crownLift, yaw, pitch, len, width, seed + i, false);
  }
  if (hash2(seed, 9, 12) > 0.32) {
    const deadCount = 1 + Math.floor(hash2(seed, 13, 19) * 2);
    for (let i = 0; i < deadCount; i += 1) {
      const yaw = hash2(seed, i, 22) * Math.PI * 2;
      addPalmFrond(
        builder,
        crown.clone().add(new Vector3(0, -0.18, 0)),
        yaw,
        -0.62,
        crownRadius * 0.65,
        crownRadius * 0.08,
        seed + 100 + i,
        true,
      );
    }
  }
  addCoconutCluster(builder, crown.clone().add(new Vector3(0, -0.08, 0)), seed);
}

function createPalmGeometry(kind: 'tall' | 'cluster' | 'young'): BufferGeometry {
  const b = new GeoBuilder();
  if (kind === 'cluster') {
    const trunks = 2 + Math.floor(hash2(1, 2, 3) * 2.99);
    for (let i = 0; i < trunks; i += 1) {
      const yaw = (i / trunks) * Math.PI * 2 + 0.4;
      const h = 7.3 + i * 0.8 + hash2(i, 4, 5) * 1.3;
      addPalmTree(
        b,
        h,
        4.4 + hash2(i, 8, 9) * 0.6,
        15 + (i % 3),
        Math.cos(yaw) * 0.55,
        Math.sin(yaw) * 0.55,
        Math.cos(yaw + 0.7) * 0.35,
        0.45 + Math.sin(yaw) * 0.28,
        100 + i * 17,
      );
    }
    return b.toGeometry();
  }
  if (kind === 'young') {
    addPalmTree(b, 5.2, 3.1, 14, 0, 0, 0.1, 0.18, 37);
    return b.toGeometry();
  }
  addPalmTree(b, 12.6, 6.1, 19, 0, 0, 0.35, 1.15, 71);
  return b.toGeometry();
}

function addBroadLeaf(builder: GeoBuilder, center: Vector3, yaw: number, size: number, shade: number): void {
  const axis = new Vector3(Math.sin(yaw), 0.22 + Math.sin(yaw * 1.7) * 0.12, Math.cos(yaw)).normalize();
  const side = new Vector3(Math.cos(yaw), 0.05, -Math.sin(yaw)).normalize();
  addDiamondCard(builder, center, axis, side, size, size * 0.36, PART_LEAF, shade);
}

function addLeafCluster(
  builder: GeoBuilder,
  center: Vector3,
  rx: number,
  ry: number,
  rz: number,
  cards: number,
  seed: number,
  shadeBase: number,
): void {
  for (let i = 0; i < cards; i += 1) {
    const a = hash2(seed, i, 101) * Math.PI * 2;
    const e = Math.asin(hash2(seed, i, 102) * 2 - 1) * 0.65;
    const r = 0.35 + hash2(seed, i, 103) * 0.75;
    const p = center
      .clone()
      .add(
        new Vector3(
          Math.cos(a) * Math.cos(e) * rx * r,
          Math.sin(e) * ry * r,
          Math.sin(a) * Math.cos(e) * rz * r,
        ),
      );
    const shade = shadeBase + hash2(seed, i, 104) * 0.32 + Math.max(0, p.y - center.y) * 0.08;
    addBroadLeaf(builder, p, a + hash2(seed, i, 105) * 1.2, 0.55 + hash2(seed, i, 106) * 0.48, shade);
  }
}

function createBananaGeometry(): BufferGeometry {
  const b = new GeoBuilder();
  addCurvedTrunk(b, 2.25, 0.28, 0.19, 7, 5, 0.08, 0.02);
  for (let i = 0; i < 10; i += 1) {
    const yaw = (i / 10) * Math.PI * 2 + (i % 2) * 0.2;
    addPalmFrond(
      b,
      new Vector3(0, 2.2 + (i % 3) * 0.12, 0),
      yaw,
      0.16 - (i % 3) * 0.08,
      3.1 + (i % 4) * 0.22,
      0.44,
      200 + i,
    );
  }
  return b.toGeometry();
}

function createFernGeometry(): BufferGeometry {
  const b = new GeoBuilder();
  addCurvedTrunk(b, 0.3, 0.05, 0.03, 5, 1, 0, 0);
  for (let i = 0; i < 16; i += 1) {
    const yaw = (i / 16) * Math.PI * 2;
    addPalmFrond(b, new Vector3(0, 0.16, 0), yaw, 0.15, 1.05 + (i % 4) * 0.08, 0.11, 300 + i);
  }
  return b.toGeometry();
}

function createShrubGeometry(): BufferGeometry {
  const b = new GeoBuilder();
  addCurvedTrunk(b, 0.78, 0.12, 0.06, 6, 3, 0.05, -0.03);
  const centers = [
    new Vector3(-0.42, 0.82, 0.1),
    new Vector3(0.3, 1.02, -0.24),
    new Vector3(0.16, 0.78, 0.38),
    new Vector3(-0.12, 1.16, 0.08),
  ];
  centers.forEach((c, i) => addLeafCluster(b, c, 0.62, 0.42, 0.58, 18, 400 + i * 19, 0.38 + i * 0.06));
  return b.toGeometry();
}

function createBroadleafTreeGeometry(): BufferGeometry {
  const b = new GeoBuilder();
  const root = new Vector3(0, 0, 0);
  const trunkTop = new Vector3(-0.06, 4.8, 0.05);
  addBranch(b, root, trunkTop, 0.34, 0.18, 9, PART_BARK, 0.55);
  const branches = [
    { end: new Vector3(-1.45, 5.55, 0.7), r: 0.11 },
    { end: new Vector3(1.35, 5.75, -0.55), r: 0.1 },
    { end: new Vector3(0.25, 6.25, 1.05), r: 0.095 },
    { end: new Vector3(-0.35, 6.35, -1.0), r: 0.09 },
    { end: new Vector3(0.05, 7.0, 0.1), r: 0.08 },
  ];
  branches.forEach((branch, i) =>
    addBranch(b, trunkTop, branch.end, 0.15, branch.r, 7, PART_BARK, 0.48 + i * 0.04),
  );
  const clusters = [
    { c: new Vector3(-1.45, 5.6, 0.7), r: [1.35, 0.95, 1.2] },
    { c: new Vector3(1.3, 5.75, -0.55), r: [1.45, 1.0, 1.25] },
    { c: new Vector3(0.25, 6.2, 1.0), r: [1.25, 0.92, 1.3] },
    { c: new Vector3(-0.35, 6.25, -1.0), r: [1.22, 0.9, 1.22] },
    { c: new Vector3(0.0, 6.9, 0.05), r: [1.35, 1.0, 1.35] },
    { c: new Vector3(-0.4, 5.35, -0.15), r: [1.1, 0.75, 1.0] },
  ];
  clusters.forEach((cluster, i) =>
    addLeafCluster(
      b,
      cluster.c,
      cluster.r[0],
      cluster.r[1],
      cluster.r[2],
      30,
      500 + i * 31,
      0.34 + i * 0.045,
    ),
  );
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
    case 'flowerBush':
      return createShrubGeometry();
    case 'log':
      return createShrubGeometry();
  }
}

export function triangleCount(geometry: BufferGeometry): number {
  return Math.floor((geometry.getAttribute('position')?.count ?? 0) / 3);
}
