// Adapted from Tidewater © 2026 DRG Software Solutions LLC, MIT, src/world/vegetation/PlantGeometry.js@d32799f
import { BufferGeometry, Color, Float32BufferAttribute, Vector3 } from 'three/webgpu';
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
  colors: number[] = [];
  palmCards: number[] = [];

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
    color = partColor(part, s),
    palmCard = 0,
  ): number {
    this.positions.push(x, y, z);
    this.normals.push(nx, ny, nz);
    this.uvs.push(u, v);
    this.parts.push(part);
    this.shade.push(s);
    this.colors.push(color.r, color.g, color.b);
    this.palmCards.push(palmCard);
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

  addQuadCard(
    a: Vector3,
    b: Vector3,
    c: Vector3,
    d: Vector3,
    normal: Vector3,
    uvA: [number, number],
    uvB: [number, number],
    uvC: [number, number],
    uvD: [number, number],
    part: number,
    s: number,
  ): void {
    const color = partColor(part, s);
    const push = (p: Vector3, uv: [number, number]) =>
      this.addVertex(p.x, p.y, p.z, normal.x, normal.y, normal.z, uv[0], uv[1], part, s, color, 1);
    push(a, uvA);
    push(b, uvB);
    push(c, uvC);
    push(a, uvA);
    push(c, uvC);
    push(d, uvD);
  }

  toGeometry(): BufferGeometry {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(this.positions, 3));
    geometry.setAttribute('normal', new Float32BufferAttribute(this.normals, 3));
    geometry.setAttribute('uv', new Float32BufferAttribute(this.uvs, 2));
    geometry.setAttribute('vegPart', new Float32BufferAttribute(this.parts, 1));
    geometry.setAttribute('shade', new Float32BufferAttribute(this.shade, 1));
    geometry.setAttribute('color', new Float32BufferAttribute(this.colors, 3));
    geometry.setAttribute('palmCard', new Float32BufferAttribute(this.palmCards, 1));
    const fade = new Float32Array(this.parts.length);
    fade.fill(1);
    geometry.setAttribute('fade', new Float32BufferAttribute(fade, 1));
    const tint = new Float32Array(this.parts.length * 3);
    tint.fill(1);
    geometry.setAttribute('tint', new Float32BufferAttribute(tint, 3));
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return geometry;
  }
}

const tmpV = new Vector3();
const tmpA = new Vector3();
const tmpB = new Vector3();
const tmpD = new Vector3();
const DOWN = new Vector3(0, -1, 0);
const tmpColor = new Color();

function partColor(part: number, shade: number): Color {
  if (part === PART_LEAF) return tmpColor.setHSL(0.245 - shade * 0.014, 0.5, 0.17 + shade * 0.12).clone();
  if (part === PART_FRUIT) return tmpColor.setHSL(0.085, 0.46, 0.18 + shade * 0.1).clone();
  if (part === PART_DEAD) return tmpColor.setHSL(0.105, 0.38, 0.34 + shade * 0.12).clone();
  return tmpColor.setHSL(0.074, 0.36, 0.38 + shade * 0.16).clone();
}

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
  const curveLen = Math.hypot(curveX, curveZ);
  const sideX = curveLen > 0.001 ? -curveZ / curveLen : 1;
  const sideZ = curveLen > 0.001 ? curveX / curveLen : 0;
  const centerAt = (t: number) => {
    const sBend = Math.sin(t * Math.PI * 1.45) * height * 0.017 * (1 - Math.abs(t - 0.58) * 0.7);
    return new Vector3(
      offsetX + curveX * (0.18 * t + 0.82 * t * t) + sideX * sBend,
      height * t,
      offsetZ + curveZ * (0.18 * t + 0.82 * t * t) + sideZ * sBend,
    );
  };
  const radiusAt = (t: number) => {
    const taper = radius0 + (radius1 - radius0) * t;
    const flare = 1 + Math.max(0, 1 - t * 6.8) ** 2 * 1.25;
    const ring = 1 + Math.max(0, Math.sin(t * height * 5.35)) * 0.045;
    return taper * flare * ring;
  };

  let prev = centerAt(0);
  for (let y = 0; y < segments; y += 1) {
    const t1 = (y + 1) / segments;
    const next = centerAt(t1);
    const r0 = radiusAt(y / segments);
    const r1 = radiusAt(t1);
    addBranch(builder, prev, next, r0, r1, sides, PART_BARK, y % 2 === 0 ? 0.42 : 0.66);
    prev = next;
  }

  const leanYaw = Math.atan2(curveX, curveZ);
  const base = centerAt(0);
  for (let i = 0; i < 5; i += 1) {
    const a = leanYaw + i * (Math.PI / 2) + (i % 2) * 0.18;
    addBranch(
      builder,
      base.clone().add(new Vector3(Math.sin(a) * radius0 * 0.58, 0.08, Math.cos(a) * radius0 * 0.58)),
      base.clone().add(new Vector3(Math.sin(a) * radius0 * 2.25, -0.02, Math.cos(a) * radius0 * 2.25)),
      radius0 * 0.32,
      radius0 * 0.08,
      Math.max(5, sides - 3),
      PART_BARK,
      0.38,
    );
  }

  for (let i = 1; i < segments; i += 1) {
    const t = i / segments;
    const half = Math.min(0.006, 0.34 / height);
    addBranch(
      builder,
      centerAt(Math.max(0, t - half)),
      centerAt(Math.min(1, t + half)),
      radiusAt(t) * 1.08,
      radiusAt(t) * 1.06,
      sides,
      PART_BARK,
      i % 2 === 0 ? 0.26 : 0.56,
    );
  }
  return centerAt(1);
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
  const curvePoint = (t: number) =>
    origin
      .clone()
      .addScaledVector(forward, length * t)
      .addScaledVector(DOWN, length * (0.02 * t + 0.43 * t * t))
      .addScaledVector(new Vector3(0, 1, 0), Math.sin(Math.PI * t) * length * 0.17);
  const last = origin.clone();
  const segments = 8;
  for (let i = 1; i <= segments; i += 1) {
    const t = i / segments;
    const p = curvePoint(t);
    addBranch(
      builder,
      last,
      p,
      width * 0.055 * (1 - (i - 1) / segments),
      width * 0.024 * (1 - t),
      4,
      dead ? PART_DEAD : PART_LEAF,
      dead ? 0.5 : 0.58 + t * 0.2,
    );
    last.copy(p);
  }

  const leaflets = Math.max(8, Math.floor(length * 1.35));
  for (let i = 0; i < leaflets; i += 1) {
    const t = (i + 0.55) / leaflets;
    const center = curvePoint(t);
    const fullness = Math.sin(Math.PI * t);
    const shade = dead ? 0.34 + t * 0.26 : 0.3 + t * 0.56;
    for (const sideSign of [-1, 1]) {
      const axis = side
        .clone()
        .multiplyScalar(sideSign)
        .addScaledVector(forward, -0.16 + t * 0.28)
        .addScaledVector(DOWN, 0.42 + t * 0.38)
        .normalize();
      const bladeSide = tmpD.copy(axis).cross(forward).normalize();
      const root = center
        .clone()
        .addScaledVector(side, sideSign * width * (0.16 + fullness * 0.18))
        .addScaledVector(DOWN, width * fullness * 0.1);
      addLeafletBlade(
        builder,
        root,
        axis,
        bladeSide,
        width * (1.05 + fullness * 1.25) * (0.92 + hash2(seed, i, 71) * 0.14),
        width * 0.16 * (1 - t * 0.28) * (dead ? 0.7 : 1),
        dead ? PART_DEAD : PART_LEAF,
        shade,
      );
    }
  }
}

function addLeafletBlade(
  builder: GeoBuilder,
  root: Vector3,
  axis: Vector3,
  side: Vector3,
  length: number,
  width: number,
  part: number,
  shade: number,
): void {
  const mid = root.clone().addScaledVector(axis, length * 0.5);
  const tip = root.clone().addScaledVector(axis, length);
  const normal = side.clone().cross(axis).normalize();
  const rootW = width * 0.28;
  const midW = width;
  const tipW = width * 0.08;
  builder.addQuadCard(
    root.clone().addScaledVector(side, -rootW),
    mid.clone().addScaledVector(side, -midW),
    mid.clone().addScaledVector(side, midW),
    root.clone().addScaledVector(side, rootW),
    normal,
    [0, 0],
    [0.5, 1],
    [0.5, 0],
    [0, 1],
    part,
    shade,
  );
  builder.addQuadCard(
    mid.clone().addScaledVector(side, -midW),
    tip.clone().addScaledVector(side, -tipW),
    tip.clone().addScaledVector(side, tipW),
    mid.clone().addScaledVector(side, midW),
    normal,
    [0.5, 1],
    [1, 1],
    [1, 0],
    [0.5, 0],
    part,
    Math.min(1, shade + 0.08),
  );
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

function addCoconutCluster(builder: GeoBuilder, origin: Vector3, seed: number): void {
  const count = 3 + Math.floor(hash2(seed, 2, 9) * 4);
  for (let i = 0; i < count; i += 1) {
    const yaw = (i / count) * Math.PI * 2;
    const center = origin
      .clone()
      .add(new Vector3(Math.cos(yaw) * 0.24, -2.0 - (i % 3) * 0.13, Math.sin(yaw) * 0.24));
    const r = 0.4 + hash2(i, seed, 3) * 0.08;
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

function addCrownBoot(builder: GeoBuilder, origin: Vector3, seed: number): void {
  for (let i = 0; i < 6; i += 1) {
    const yaw = (i / 6) * Math.PI * 2 + hash2(seed, i, 41) * 0.18;
    const dir = tmpD.set(Math.sin(yaw), -0.28, Math.cos(yaw)).normalize();
    addBranch(
      builder,
      origin.clone().addScaledVector(dir, 0.05),
      origin.clone().addScaledVector(dir, 0.52),
      0.07,
      0.02,
      4,
      PART_DEAD,
      0.5 + hash2(seed, i, 42) * 0.18,
    );
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
  addCrownBoot(builder, crown.clone().add(new Vector3(0, -0.08, 0)), seed);
  for (let i = 0; i < fronds; i += 1) {
    const layer = i % 5;
    const yaw = (i / fronds) * Math.PI * 2 + hash2(i, seed, 4) * 0.32;
    const pitch =
      layer === 0
        ? 0.18 + hash2(i, seed, 5) * 0.08
        : layer === 1
          ? 0.04 - hash2(i, seed, 5) * 0.08
          : layer === 2
            ? -0.18 - hash2(i, seed, 5) * 0.11
            : layer === 3
              ? -0.32 - hash2(i, seed, 5) * 0.1
              : -0.48 - hash2(i, seed, 5) * 0.08;
    const len = crownRadius * (0.78 + hash2(i, seed, 6) * 0.32) * (layer === 0 ? 0.78 : 1);
    const width = crownRadius * 0.22 * (0.9 + hash2(i, seed, 7) * 0.24);
    addPalmFrond(
      builder,
      crownLift.clone().add(new Vector3(0, layer === 0 ? 0.16 : 0, 0)),
      yaw,
      pitch,
      len,
      width,
      seed + i,
      false,
    );
  }
  if (hash2(seed, 9, 12) > 0.18) {
    const deadCount = 1 + Math.floor(hash2(seed, 13, 19) * 3);
    for (let i = 0; i < deadCount; i += 1) {
      const yaw = hash2(seed, i, 22) * Math.PI * 2;
      addPalmFrond(
        builder,
        crown.clone().add(new Vector3(0, -0.18, 0)),
        yaw,
        -0.74,
        crownRadius * 0.62,
        crownRadius * 0.09,
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
        4.35 + hash2(i, 8, 9) * 0.5,
        14 + (i % 4),
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
    addPalmTree(b, 5.2, 2.9, 13, 0, 0, 0.1, 0.18, 37);
    return b.toGeometry();
  }
  addPalmTree(b, 12.6, 5.75, 17, 0, 0, 0.35, 1.15, 71);
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
