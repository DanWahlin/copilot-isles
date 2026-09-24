import {
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  Group,
  LineBasicMaterial,
  LineSegments,
  MathUtils,
  Mesh,
  MeshBasicNodeMaterial,
  MeshStandardNodeMaterial,
  Object3D,
  type Material,
  type UniformNode,
} from 'three/webgpu';
import {
  abs,
  attribute,
  color,
  float,
  mix,
  positionLocal,
  positionWorld,
  sin,
  uniform,
  vec2,
} from 'three/tsl';
import type { Tier, WaveSampler, HeightField, CircleObstacle } from '../contracts';
import { world } from '../uniforms';
import { gustNode } from '../wind-nodes';
import { ShipDynamics, type ShipEnv } from './dynamics';
import {
  BRIGANTINE_CAPSULES,
  BRIGANTINE_HALF_BEAM_TABLE,
  BRIGANTINE_HALF_LENGTH,
  BRIGANTINE_LENGTH,
  BRIGANTINE_STATIONS,
  deckHeightAt,
  halfBeamAt,
  keelHeightAt,
  sheerHeightAt,
  waterlineHalfBeamAt,
  type BuoyancyStation,
  type HullCapsule,
} from './lines';

export interface BrigantineOptions {
  tier: Tier;
}

export interface BrigantineUniforms {
  trim: UniformNode<'float', number>;
  luff: UniformNode<'float', number>;
}

export interface BrigantineEnv extends ShipEnv {
  waves: WaveSampler;
  ground: HeightField | null;
  obstacles: readonly CircleObstacle[];
}

export interface Brigantine {
  group: Group;
  dynamics: ShipDynamics;
  uniforms: BrigantineUniforms;
  update(dt: number, t: number, env: BrigantineEnv): void;
  waterlineTable: Float32Array;
  stations: readonly BuoyancyStation[];
  capsules: readonly HullCapsule[];
  triangleCount: number;
  drawCallCount: number;
  dispose(): void;
}

interface P3 {
  x: number;
  y: number;
  z: number;
}

class MeshBuilder {
  readonly positions: number[] = [];
  readonly uvs: number[] = [];
  readonly indices: number[] = [];

  addVertex(x: number, y: number, z: number, u = 0, v = 0): number {
    const i = this.positions.length / 3;
    this.positions.push(x, y, z);
    this.uvs.push(u, v);
    return i;
  }

  addQuad(a: P3, b: P3, c: P3, d: P3, uvScale = 1): void {
    const i = this.addVertex(a.x, a.y, a.z, 0, 0);
    this.addVertex(b.x, b.y, b.z, uvScale, 0);
    this.addVertex(c.x, c.y, c.z, uvScale, uvScale);
    this.addVertex(d.x, d.y, d.z, 0, uvScale);
    this.indices.push(i, i + 1, i + 2, i, i + 2, i + 3);
  }

  addTriangle(a: P3, b: P3, c: P3): void {
    const i = this.addVertex(a.x, a.y, a.z, 0, 0);
    this.addVertex(b.x, b.y, b.z, 1, 0);
    this.addVertex(c.x, c.y, c.z, 0.5, 1);
    this.indices.push(i, i + 1, i + 2);
  }

  addBox(cx: number, cy: number, cz: number, sx: number, sy: number, sz: number): void {
    const x0 = cx - sx * 0.5;
    const x1 = cx + sx * 0.5;
    const y0 = cy - sy * 0.5;
    const y1 = cy + sy * 0.5;
    const z0 = cz - sz * 0.5;
    const z1 = cz + sz * 0.5;
    this.addQuad(
      { x: x0, y: y0, z: z1 },
      { x: x1, y: y0, z: z1 },
      { x: x1, y: y1, z: z1 },
      { x: x0, y: y1, z: z1 },
    );
    this.addQuad(
      { x: x1, y: y0, z: z0 },
      { x: x0, y: y0, z: z0 },
      { x: x0, y: y1, z: z0 },
      { x: x1, y: y1, z: z0 },
    );
    this.addQuad(
      { x: x0, y: y0, z: z0 },
      { x: x0, y: y0, z: z1 },
      { x: x0, y: y1, z: z1 },
      { x: x0, y: y1, z: z0 },
    );
    this.addQuad(
      { x: x1, y: y0, z: z1 },
      { x: x1, y: y0, z: z0 },
      { x: x1, y: y1, z: z0 },
      { x: x1, y: y1, z: z1 },
    );
    this.addQuad(
      { x: x0, y: y1, z: z1 },
      { x: x1, y: y1, z: z1 },
      { x: x1, y: y1, z: z0 },
      { x: x0, y: y1, z: z0 },
    );
    this.addQuad(
      { x: x0, y: y0, z: z0 },
      { x: x1, y: y0, z: z0 },
      { x: x1, y: y0, z: z1 },
      { x: x0, y: y0, z: z1 },
    );
  }

  addCylinderBetween(a: P3, b: P3, radius: number, segments = 10, cap = true): void {
    const ax = b.x - a.x;
    const ay = b.y - a.y;
    const az = b.z - a.z;
    const len = Math.hypot(ax, ay, az);
    if (len < 0.0001) return;
    const ux = ax / len;
    const uy = ay / len;
    const uz = az / len;
    const helper = Math.abs(uy) < 0.92 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
    let vx = uy * helper.z - uz * helper.y;
    let vy = uz * helper.x - ux * helper.z;
    let vz = ux * helper.y - uy * helper.x;
    const vl = Math.hypot(vx, vy, vz) || 1;
    vx /= vl;
    vy /= vl;
    vz /= vl;
    const wx = uy * vz - uz * vy;
    const wy = uz * vx - ux * vz;
    const wz = ux * vy - uy * vx;
    const start = this.positions.length / 3;
    for (let ring = 0; ring < 2; ring++) {
      const base = ring === 0 ? a : b;
      for (let i = 0; i < segments; i++) {
        const theta = (i / segments) * Math.PI * 2;
        const ct = Math.cos(theta);
        const st = Math.sin(theta);
        this.addVertex(
          base.x + (vx * ct + wx * st) * radius,
          base.y + (vy * ct + wy * st) * radius,
          base.z + (vz * ct + wz * st) * radius,
          i / segments,
          ring,
        );
      }
    }
    for (let i = 0; i < segments; i++) {
      const n = (i + 1) % segments;
      this.indices.push(
        start + i,
        start + n,
        start + segments + n,
        start + i,
        start + segments + n,
        start + segments + i,
      );
    }
    if (cap) {
      const ca = this.addVertex(a.x, a.y, a.z, 0.5, 0.5);
      const cb = this.addVertex(b.x, b.y, b.z, 0.5, 0.5);
      for (let i = 0; i < segments; i++) {
        const n = (i + 1) % segments;
        this.indices.push(ca, start + n, start + i, cb, start + segments + i, start + segments + n);
      }
    }
  }

  build(): BufferGeometry {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(this.positions), 3));
    geometry.setAttribute('uv', new BufferAttribute(new Float32Array(this.uvs), 2));
    geometry.setIndex(this.indices);
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    return geometry;
  }
}

class SailBuilder {
  readonly positions: number[] = [];
  readonly anchors: number[] = [];
  readonly normals: number[] = [];
  readonly sailUvs: number[] = [];
  readonly indices: number[] = [];

  addVertex(p: P3, anchor: P3, normal: P3, u: number, v: number): number {
    const i = this.positions.length / 3;
    this.positions.push(p.x, p.y, p.z);
    this.anchors.push(anchor.x, anchor.y, anchor.z);
    this.normals.push(normal.x, normal.y, normal.z);
    this.sailUvs.push(u, v);
    return i;
  }

  addQuad(p00: P3, p10: P3, p01: P3, p11: P3, normal: P3, cols: number, rows: number): void {
    const base = this.positions.length / 3;
    for (let y = 0; y <= rows; y++) {
      const v = y / rows;
      for (let x = 0; x <= cols; x++) {
        const u = x / cols;
        const a = lerpPoint(p00, p10, u);
        const b = lerpPoint(p01, p11, u);
        const p = lerpPoint(a, b, v);
        const anchor = lerpPoint(p01, p11, u);
        this.addVertex(p, anchor, normal, u, v);
      }
    }
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const i = base + y * (cols + 1) + x;
        this.indices.push(i, i + 1, i + cols + 2, i, i + cols + 2, i + cols + 1);
      }
    }
  }

  addTriangle(p0: P3, p1: P3, p2: P3, normal: P3, steps: number): void {
    const indexAt = (row: number, col: number) => row * (steps + 1) - (row * (row - 1)) / 2 + col;
    const base = this.positions.length / 3;
    for (let row = 0; row <= steps; row++) {
      const v = row / steps;
      for (let col = 0; col <= steps - row; col++) {
        const u = col / steps;
        const w = 1 - u - v;
        const p = {
          x: p0.x * w + p1.x * u + p2.x * v,
          y: p0.y * w + p1.y * u + p2.y * v,
          z: p0.z * w + p1.z * u + p2.z * v,
        };
        const anchor = lerpPoint(p0, p2, v);
        this.addVertex(p, anchor, normal, u, v);
      }
    }
    for (let row = 0; row < steps; row++) {
      for (let col = 0; col < steps - row; col++) {
        const a = base + indexAt(row, col);
        const b = base + indexAt(row, col + 1);
        const c = base + indexAt(row + 1, col);
        this.indices.push(a, b, c);
        if (col < steps - row - 1) {
          const d = base + indexAt(row + 1, col + 1);
          this.indices.push(b, d, c);
        }
      }
    }
  }

  build(): BufferGeometry {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(this.positions), 3));
    geometry.setAttribute('sailAnchor', new BufferAttribute(new Float32Array(this.anchors), 3));
    geometry.setAttribute('sailNormal', new BufferAttribute(new Float32Array(this.normals), 3));
    geometry.setAttribute('sailUv', new BufferAttribute(new Float32Array(this.sailUvs), 2));
    geometry.setIndex(this.indices);
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    return geometry;
  }
}

function lerpPoint(a: P3, b: P3, t: number): P3 {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t };
}

function triangleCount(group: Object3D): number {
  let tris = 0;
  group.traverse((object) => {
    const mesh = object as Mesh;
    if (!mesh.isMesh && !(object as LineSegments).isLineSegments) return;
    const geometry = (object as Mesh | LineSegments).geometry;
    const index = geometry.getIndex();
    const position = geometry.getAttribute('position');
    if ((object as LineSegments).isLineSegments) return;
    tris += index ? index.count / 3 : position.count / 3;
  });
  return Math.round(tris);
}

function drawCallCount(group: Object3D): number {
  let calls = 0;
  group.traverse((object) => {
    const maybe = object as Mesh | LineSegments;
    if ('isMesh' in maybe || 'isLineSegments' in maybe) calls += 1;
  });
  return calls;
}

function createHullGeometry(tier: Tier): BufferGeometry {
  const builder = new MeshBuilder();
  const zSegments = tier === 'lite' || tier === 'low' ? 28 : 40;
  const yFractions = [0, 0.12, 0.26, 0.42, 0.6, 0.78, 0.92, 1];
  const star: number[][] = [];
  const port: number[][] = [];
  for (let zi = 0; zi <= zSegments; zi++) {
    const z = -BRIGANTINE_HALF_LENGTH + (BRIGANTINE_LENGTH * zi) / zSegments;
    const keel = keelHeightAt(z);
    const sheer = sheerHeightAt(z);
    star[zi] = [];
    port[zi] = [];
    for (let yi = 0; yi < yFractions.length; yi++) {
      const f = yFractions[yi]!;
      const y = keel + (sheer - keel) * f;
      const x = halfBeamAt(z, y);
      star[zi]![yi] = builder.addVertex(x, y, z, zi / zSegments, f);
      port[zi]![yi] = builder.addVertex(-x, y, z, zi / zSegments, f);
    }
  }
  for (let zi = 0; zi < zSegments; zi++) {
    for (let yi = 0; yi < yFractions.length - 1; yi++) {
      const a = star[zi]![yi]!;
      const b = star[zi + 1]![yi]!;
      const c = star[zi + 1]![yi + 1]!;
      const d = star[zi]![yi + 1]!;
      builder.indices.push(a, b, c, a, c, d);
      const pa = port[zi]![yi]!;
      const pb = port[zi]![yi + 1]!;
      const pc = port[zi + 1]![yi + 1]!;
      const pd = port[zi + 1]![yi]!;
      builder.indices.push(pa, pd, pc, pa, pc, pb);
    }
  }
  for (let zi = 0; zi < zSegments; zi++) {
    const a = port[zi]![0]!;
    const b = port[zi + 1]![0]!;
    const c = star[zi + 1]![0]!;
    const d = star[zi]![0]!;
    builder.indices.push(a, b, c, a, c, d);
  }
  const lastY = yFractions.length - 1;
  for (const zi of [0, zSegments]) {
    for (let yi = 0; yi < lastY; yi++) {
      const a = port[zi]![yi]!;
      const b = star[zi]![yi]!;
      const c = star[zi]![yi + 1]!;
      const d = port[zi]![yi + 1]!;
      if (zi === 0) builder.indices.push(a, b, c, a, c, d);
      else builder.indices.push(a, d, c, a, c, b);
    }
  }
  return builder.build();
}

function createDeckGeometry(): BufferGeometry {
  const builder = new MeshBuilder();
  const sections = 36;
  for (let i = 0; i < sections; i++) {
    const z0 = -10.9 + (21.1 * i) / sections;
    const z1 = -10.9 + (21.1 * (i + 1)) / sections;
    const x00 = -halfBeamAt(z0, deckHeightAt(z0)) * 0.82;
    const x01 = halfBeamAt(z0, deckHeightAt(z0)) * 0.82;
    const x10 = -halfBeamAt(z1, deckHeightAt(z1)) * 0.82;
    const x11 = halfBeamAt(z1, deckHeightAt(z1)) * 0.82;
    builder.addQuad(
      { x: x00, y: deckHeightAt(z0), z: z0 },
      { x: x01, y: deckHeightAt(z0), z: z0 },
      { x: x11, y: deckHeightAt(z1), z: z1 },
      { x: x10, y: deckHeightAt(z1), z: z1 },
      4,
    );
  }
  builder.addBox(0, deckHeightAt(-2.5) + 0.16, -2.5, 1.35, 0.22, 2.0);
  builder.addBox(0, deckHeightAt(3.1) + 0.16, 3.1, 1.2, 0.22, 1.65);
  builder.addBox(0, deckHeightAt(-7.3) + 0.18, -7.3, 1.4, 0.24, 1.15);
  builder.addCylinderBetween(
    { x: 0, y: deckHeightAt(-0.2), z: -0.2 },
    { x: 0, y: deckHeightAt(-0.2) + 0.8, z: -0.2 },
    0.24,
    12,
  );
  builder.addCylinderBetween(
    { x: -0.9, y: deckHeightAt(-8.9) + 0.75, z: -8.9 },
    { x: 0.9, y: deckHeightAt(-8.9) + 0.75, z: -8.9 },
    0.055,
    10,
  );
  builder.addCylinderBetween(
    { x: 0, y: deckHeightAt(-8.9) + 0.25, z: -8.9 },
    { x: 0, y: deckHeightAt(-8.9) + 1.25, z: -8.9 },
    0.05,
    8,
  );
  for (let s = -1; s <= 1; s += 2) {
    builder.addCylinderBetween(
      { x: s * 0.62, y: deckHeightAt(-8.9) + 0.75, z: -8.9 },
      { x: -s * 0.62, y: deckHeightAt(-8.9) + 0.75, z: -8.9 },
      0.025,
      6,
    );
    builder.addCylinderBetween(
      { x: 0, y: deckHeightAt(-8.9) + 0.75, z: -9.52 * s * 0.02 },
      { x: 0, y: deckHeightAt(-8.9) + 0.75, z: -8.9 + s * 0.62 },
      0.025,
      6,
    );
  }
  return builder.build();
}

function createSidePaintGeometry(): BufferGeometry {
  const builder = new MeshBuilder();
  const steps = 48;
  for (let i = 0; i < steps; i++) {
    const z0 = -11.15 + (21.9 * i) / steps;
    const z1 = -11.15 + (21.9 * (i + 1)) / steps;
    const y0 = 0.08;
    const y1 = Math.min(sheerHeightAt((z0 + z1) * 0.5) - 0.12, 2.42);
    for (const side of [-1, 1] as const) {
      const x0 = side * (waterlineHalfBeamAt(z0) + 0.075);
      const x1 = side * (waterlineHalfBeamAt(z1) + 0.075);
      const a = { x: x0, y: y0, z: z0 };
      const b = { x: x1, y: y0, z: z1 };
      const c = { x: x1, y: y1, z: z1 };
      const d = { x: x0, y: y1, z: z0 };
      if (side > 0) {
        builder.addQuad(a, b, c, d);
        builder.addQuad(d, c, b, a);
      } else {
        builder.addQuad(b, a, d, c);
        builder.addQuad(c, d, a, b);
      }
    }
  }
  return builder.build();
}

function createTrimGeometry(): BufferGeometry {
  const builder = new MeshBuilder();
  const steps = 48;
  for (let i = 0; i < steps; i++) {
    const z0 = -11.25 + (22.1 * i) / steps;
    const z1 = -11.25 + (22.1 * (i + 1)) / steps;
    for (const side of [-1, 1] as const) {
      const x0 = side * (waterlineHalfBeamAt(z0) + 0.045);
      const x1 = side * (waterlineHalfBeamAt(z1) + 0.045);
      builder.addQuad(
        { x: x0, y: 0.84, z: z0 },
        { x: x1, y: 0.84, z: z1 },
        { x: x1, y: 1.05, z: z1 },
        { x: x0, y: 1.05, z: z0 },
      );
      builder.addQuad(
        { x: x0, y: -0.16, z: z0 },
        { x: x1, y: -0.16, z: z1 },
        { x: x1, y: 0.02, z: z1 },
        { x: x0, y: 0.02, z: z0 },
      );
      builder.addQuad(
        { x: x0, y: 2.42, z: z0 },
        { x: x1, y: 2.42, z: z1 },
        { x: x1, y: 2.62, z: z1 },
        { x: x0, y: 2.62, z: z0 },
      );
    }
  }
  const portZ = [-7.8, -5.7, -3.6, -1.5, 0.7, 2.8, 5.0, 7.0];
  for (const z of portZ) {
    for (const side of [-1, 1] as const) {
      const x = side * (waterlineHalfBeamAt(z) + 0.08);
      builder.addQuad(
        { x, y: 1.28, z: z - 0.34 },
        { x, y: 1.28, z: z + 0.34 },
        { x, y: 1.82, z: z + 0.34 },
        { x, y: 1.82, z: z - 0.34 },
      );
    }
  }
  for (const x of [-1.25, 0, 1.25]) {
    builder.addQuad(
      { x: x - 0.42, y: 1.45, z: -12.06 },
      { x: x + 0.42, y: 1.45, z: -12.06 },
      { x: x + 0.42, y: 2.1, z: -12.06 },
      { x: x - 0.42, y: 2.1, z: -12.06 },
    );
  }
  return builder.build();
}

function createSparGeometry(): BufferGeometry {
  const b = new MeshBuilder();
  const fore = { x: 0, z: 4.1, base: deckHeightAt(4.1) };
  const main = { x: 0, z: -4.25, base: deckHeightAt(-4.25) };
  b.addCylinderBetween({ x: 0, y: fore.base - 0.7, z: fore.z }, { x: 0, y: 18.2, z: fore.z }, 0.18, 12);
  b.addCylinderBetween({ x: 0, y: main.base - 0.7, z: main.z }, { x: 0, y: 19.4, z: main.z }, 0.2, 12);
  b.addCylinderBetween({ x: -5.35, y: 7.2, z: fore.z }, { x: 5.35, y: 7.2, z: fore.z }, 0.11, 10);
  b.addCylinderBetween({ x: -4.3, y: 11.3, z: fore.z }, { x: 4.3, y: 11.3, z: fore.z }, 0.085, 10);
  b.addCylinderBetween({ x: -3.25, y: 14.65, z: fore.z }, { x: 3.25, y: 14.65, z: fore.z }, 0.07, 8);
  b.addCylinderBetween({ x: 0, y: 3.35, z: main.z - 0.15 }, { x: 0, y: 3.0, z: -10.7 }, 0.105, 10);
  b.addCylinderBetween({ x: 0, y: 8.65, z: main.z - 0.1 }, { x: 0, y: 10.45, z: -9.75 }, 0.08, 10);
  b.addCylinderBetween({ x: 0, y: 2.35, z: 10.8 }, { x: 0, y: 2.8, z: 18.2 }, 0.13, 10);
  b.addCylinderBetween({ x: 0, y: 2.72, z: 17.5 }, { x: 0, y: 2.95, z: 21.8 }, 0.075, 8);
  for (const z of [-7.8, -2.6, 3.0, 7.7]) {
    b.addCylinderBetween(
      { x: -waterlineHalfBeamAt(z) * 0.75, y: deckHeightAt(z) + 0.18, z },
      { x: waterlineHalfBeamAt(z) * 0.75, y: deckHeightAt(z) + 0.18, z },
      0.045,
      8,
    );
  }
  return b.build();
}

function createBundledCanvasGeometry(): BufferGeometry {
  const b = new MeshBuilder();
  const foreZ = 4.1;
  b.addCylinderBetween({ x: -4.9, y: 7.0, z: foreZ - 0.05 }, { x: 4.9, y: 7.0, z: foreZ - 0.05 }, 0.23, 10);
  b.addCylinderBetween(
    { x: -3.9, y: 11.08, z: foreZ - 0.05 },
    { x: 3.9, y: 11.08, z: foreZ - 0.05 },
    0.18,
    10,
  );
  b.addCylinderBetween(
    { x: -2.9, y: 14.43, z: foreZ - 0.04 },
    { x: 2.9, y: 14.43, z: foreZ - 0.04 },
    0.14,
    8,
  );
  b.addCylinderBetween({ x: 0, y: 3.23, z: -4.6 }, { x: 0, y: 3.05, z: -10.1 }, 0.18, 10);
  return b.build();
}

function createSailGeometry(tier: Tier): BufferGeometry {
  const s = new SailBuilder();
  const detail = tier === 'lite' || tier === 'low' ? 6 : 10;
  const foreZ = 4.05;
  s.addQuad(
    { x: -4.8, y: 3.55, z: foreZ },
    { x: 4.8, y: 3.55, z: foreZ },
    { x: -5.05, y: 6.95, z: foreZ },
    { x: 5.05, y: 6.95, z: foreZ },
    { x: 0, y: 0, z: -1 },
    detail,
    detail,
  );
  s.addQuad(
    { x: -3.75, y: 7.65, z: foreZ },
    { x: 3.75, y: 7.65, z: foreZ },
    { x: -4.1, y: 11.1, z: foreZ },
    { x: 4.1, y: 11.1, z: foreZ },
    { x: 0, y: 0, z: -1 },
    detail,
    detail,
  );
  s.addQuad(
    { x: -2.75, y: 11.85, z: foreZ },
    { x: 2.75, y: 11.85, z: foreZ },
    { x: -3.05, y: 14.45, z: foreZ },
    { x: 3.05, y: 14.45, z: foreZ },
    { x: 0, y: 0, z: -1 },
    detail,
    Math.max(4, detail - 2),
  );
  s.addQuad(
    { x: 0, y: 3.2, z: -10.25 },
    { x: 0, y: 3.35, z: -4.45 },
    { x: 0, y: 10.0, z: -9.45 },
    { x: 0, y: 8.35, z: -4.35 },
    { x: 1, y: 0, z: 0 },
    detail,
    detail,
  );
  s.addTriangle(
    { x: 0, y: 8.65, z: -4.2 },
    { x: 0, y: 10.25, z: -9.3 },
    { x: 0, y: 15.3, z: -4.2 },
    { x: 1, y: 0, z: 0 },
    detail,
  );
  s.addTriangle(
    { x: 0, y: 2.65, z: 17.7 },
    { x: 0, y: 2.2, z: 9.8 },
    { x: 0, y: 7.1, z: 4.2 },
    { x: -1, y: 0, z: 0 },
    detail,
  );
  s.addTriangle(
    { x: 0, y: 2.82, z: 21.4 },
    { x: 0, y: 2.55, z: 15.7 },
    { x: 0, y: 9.5, z: 4.15 },
    { x: -1, y: 0, z: 0 },
    detail,
  );
  s.addTriangle(
    { x: 0, y: 3.2, z: 9.2 },
    { x: 0, y: 3.05, z: -1.2 },
    { x: 0, y: 11.0, z: 4.1 },
    { x: -1, y: 0, z: 0 },
    detail,
  );
  return s.build();
}

function createRiggingGeometry(): BufferGeometry {
  const positions: number[] = [];
  const line = (a: P3, b: P3) => positions.push(a.x, a.y, a.z, b.x, b.y, b.z);
  const foreTop = { x: 0, y: 16.8, z: 4.1 };
  const mainTop = { x: 0, y: 18.1, z: -4.25 };
  for (const side of [-1, 1] as const) {
    for (const z of [1.4, 3.0, 5.1, 7.2])
      line({ x: side * waterlineHalfBeamAt(z) * 0.9, y: deckHeightAt(z) + 0.25, z }, foreTop);
    for (const z of [-7.9, -5.8, -3.6, -1.7])
      line({ x: side * waterlineHalfBeamAt(z) * 0.9, y: deckHeightAt(z) + 0.25, z }, mainTop);
    line({ x: side * 2.7, y: deckHeightAt(-10.2) + 0.1, z: -10.2 }, mainTop);
    line({ x: side * 2.7, y: deckHeightAt(9.2) + 0.1, z: 9.2 }, foreTop);
  }
  line({ x: 0, y: 18.1, z: -4.25 }, { x: 0, y: 16.8, z: 4.1 });
  line(foreTop, { x: 0, y: 2.75, z: 18.8 });
  line(foreTop, { x: 0, y: 2.9, z: 21.8 });
  line(mainTop, { x: 0, y: 2.45, z: 10.6 });
  line(mainTop, { x: 0, y: 3.2, z: -11.2 });
  for (const side of [-1, 1] as const) {
    for (let y = 5.0; y < 12.5; y += 1.15) {
      line({ x: side * 1.65, y, z: 2.2 }, { x: side * 2.65, y: y - 0.2, z: 7.0 });
      line({ x: side * 1.65, y: y + 0.15, z: -6.3 }, { x: side * 2.55, y: y - 0.1, z: -1.9 });
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.computeBoundingSphere();
  return geometry;
}

function makeHullMaterial(): MeshBasicNodeMaterial {
  const m = new MeshBasicNodeMaterial({ color: 0x090c0d, side: DoubleSide });
  const grain = sin(positionLocal.z.mul(9.7).add(positionLocal.y.mul(15.3)))
    .mul(0.5)
    .add(0.5);
  const wet = positionLocal.y.smoothstep(-0.35, 0.25).oneMinus();
  m.colorNode = mix(color(0x080a0c), color(0x172027), grain.mul(0.24)).add(
    color(0x0f321f).mul(wet.mul(0.42)),
  );
  return m;
}

function makeSidePaintMaterial(): MeshBasicNodeMaterial {
  const m = new MeshBasicNodeMaterial({ color: 0x07090a, side: DoubleSide });
  const grain = sin(positionLocal.z.mul(10.0).add(positionLocal.y.mul(18.0)))
    .mul(0.5)
    .add(0.5);
  const wet = positionLocal.y.smoothstep(-0.12, 0.22).oneMinus();
  m.colorNode = mix(color(0x050607), color(0x162126), grain.mul(0.18)).add(
    color(0x0b2f1e).mul(wet.mul(0.35)),
  );
  return m;
}

function makeWoodMaterial(): MeshStandardNodeMaterial {
  const m = new MeshStandardNodeMaterial({
    color: 0x8a5d34,
    roughness: 0.72,
    metalness: 0,
    side: DoubleSide,
  });
  const grain = sin(positionLocal.x.mul(18).add(positionLocal.z.mul(5.3)))
    .mul(0.5)
    .add(0.5);
  m.colorNode = mix(color(0x6c4324), color(0xb9854c), grain.mul(0.55));
  return m;
}

function makeTrimMaterial(): MeshStandardNodeMaterial {
  const m = new MeshStandardNodeMaterial({
    color: 0xa66a24,
    roughness: 0.62,
    metalness: 0.02,
    side: DoubleSide,
  });
  const algae = positionLocal.y.smoothstep(-0.25, 0.1).oneMinus();
  const stripe = color(0xb87828).mul(float(1).sub(algae.mul(0.22)));
  m.colorNode = mix(stripe, color(0x123a25), algae.mul(0.55));
  return m;
}

function makeCanvasMaterial(uniforms: BrigantineUniforms): MeshStandardNodeMaterial {
  const m = new MeshStandardNodeMaterial({
    roughness: 0.9,
    metalness: 0,
    side: DoubleSide,
    transparent: true,
    opacity: 0.88,
  });
  const sailUv = attribute('sailUv', 'vec2');
  const sailNormal = attribute('sailNormal', 'vec3');
  const sailAnchor = attribute('sailAnchor', 'vec3');
  const belly = sin(sailUv.x.mul(Math.PI))
    .mul(sin(sailUv.y.mul(Math.PI)))
    .max(0);
  const gust = gustNode(vec2(positionWorld.x, positionWorld.z));
  const windFacing = abs(world.windDir.x.mul(sailNormal.x).add(world.windDir.y.mul(sailNormal.z)))
    .mul(0.45)
    .add(0.65);
  const flutter = sin(world.time.mul(12.0).add(sailUv.x.mul(31)).add(sailUv.y.mul(17)))
    .mul(uniforms.luff)
    .mul(0.34);
  const billow = belly
    .mul(uniforms.trim)
    .mul(world.windSpeed.mul(0.035).add(0.18))
    .mul(gust.mul(0.28).add(0.86))
    .mul(windFacing)
    .add(flutter);
  m.positionNode = mix(sailAnchor, positionLocal.add(sailNormal.mul(billow)), uniforms.trim);
  const stain = sin(positionLocal.x.mul(4.1).add(positionLocal.y.mul(2.3)).add(positionLocal.z.mul(1.7)))
    .mul(0.5)
    .add(0.5);
  const patch = sin(positionLocal.x.mul(11.0).add(positionLocal.y.mul(7.0)))
    .smoothstep(0.74, 0.9)
    .mul(0.18);
  m.colorNode = mix(color(0xd8c49a), color(0xffefc1), stain.mul(0.35)).sub(color(0x4d3a24).mul(patch));
  m.emissiveNode = color(0xffd89a).mul(world.sunDir.y.oneMinus().clamp(0, 1).mul(0.035));
  return m;
}

function makeBundleMaterial(): MeshStandardNodeMaterial {
  const m = new MeshStandardNodeMaterial({
    color: 0xc9b184,
    roughness: 0.92,
    metalness: 0,
    side: DoubleSide,
  });
  const fold = sin(positionLocal.x.mul(18).add(positionLocal.z.mul(21)))
    .mul(0.5)
    .add(0.5);
  m.colorNode = mix(color(0xbba57a), color(0xe5cf9d), fold.mul(0.35));
  return m;
}

function makeLanternMaterial(): MeshBasicNodeMaterial {
  const m = new MeshBasicNodeMaterial({ transparent: true, opacity: 0.88 });
  m.colorNode = mix(color(0xff9c3a), color(0xffe3a1), sin(world.time.mul(4)).mul(0.5).add(0.5));
  return m;
}

function addMesh(group: Group, geometry: BufferGeometry, material: Material, name: string): Mesh {
  const mesh = new Mesh(geometry, material);
  mesh.name = name;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

function copyPose(source: ShipDynamics['pose'], target: ShipDynamics['pose']): void {
  target.x = source.x;
  target.z = source.z;
  target.heading = source.heading;
  target.heave = source.heave;
  target.pitch = source.pitch;
  target.roll = source.roll;
  target.speed = source.speed;
  target.luff = source.luff;
  target.shake = source.shake;
}

function shortestYaw(a: number, b: number, t: number): number {
  let d = (b - a + Math.PI) % (Math.PI * 2);
  if (d < 0) d += Math.PI * 2;
  return a + (d - Math.PI) * t;
}

export function createBrigantine({ tier }: BrigantineOptions): Brigantine {
  const group = new Group();
  group.name = `brigantine-${tier}`;
  group.rotation.order = 'YXZ';

  const dynamics = new ShipDynamics();
  const uniforms: BrigantineUniforms = { trim: uniform(1), luff: uniform(0) };
  const materials: Material[] = [];
  const register = <T extends Material>(m: T): T => {
    materials.push(m);
    return m;
  };

  addMesh(group, createHullGeometry(tier), register(makeHullMaterial()), 'lofted hull shell');
  addMesh(group, createSidePaintGeometry(), register(makeSidePaintMaterial()), 'tarred hull paint panels');
  addMesh(group, createDeckGeometry(), register(makeWoodMaterial()), 'deck and fittings');
  addMesh(group, createTrimGeometry(), register(makeTrimMaterial()), 'wales stripe gunports algae');
  addMesh(group, createSparGeometry(), register(makeWoodMaterial()), 'masts spars bowsprit');
  addMesh(group, createBundledCanvasGeometry(), register(makeBundleMaterial()), 'furled canvas bundles');
  addMesh(
    group,
    createSailGeometry(tier),
    register(makeCanvasMaterial(uniforms)),
    'billowed procedural sails',
  );

  const riggingMaterial = register(
    new LineBasicMaterial({ color: 0x17110c, transparent: true, opacity: 0.72 }),
  );
  const rigging = new LineSegments(createRiggingGeometry(), riggingMaterial);
  rigging.name = 'standing rigging and ratlines';
  group.add(rigging);

  const lanternPivot = new Group();
  lanternPivot.name = 'stern lantern pendulum';
  lanternPivot.position.set(0, 3.55, -11.85);
  const lanternLine = addMesh(
    lanternPivot,
    (() => {
      const b = new MeshBuilder();
      b.addCylinderBetween({ x: 0, y: 0, z: 0 }, { x: 0, y: -0.55, z: 0 }, 0.018, 6);
      return b.build();
    })(),
    riggingMaterial,
    'lantern hanger',
  );
  lanternLine.castShadow = false;
  const lantern = addMesh(
    lanternPivot,
    (() => {
      const b = new MeshBuilder();
      b.addBox(0, -0.72, 0, 0.22, 0.28, 0.22);
      return b.build();
    })(),
    register(makeLanternMaterial()),
    'stern lantern',
  );
  lantern.castShadow = false;
  group.add(lanternPivot);

  const blockPivot = new Group();
  blockPivot.name = 'hanging block spring';
  blockPivot.position.set(-1.15, 9.2, -4.65);
  const blockLine = addMesh(
    blockPivot,
    (() => {
      const b = new MeshBuilder();
      b.addCylinderBetween({ x: 0, y: 0, z: 0 }, { x: 0, y: -0.85, z: 0.12 }, 0.014, 6);
      return b.build();
    })(),
    riggingMaterial,
    'block hanger',
  );
  blockLine.castShadow = false;
  const block = addMesh(
    blockPivot,
    (() => {
      const b = new MeshBuilder();
      b.addBox(0, -0.98, 0.15, 0.18, 0.24, 0.12);
      return b.build();
    })(),
    materials[1]!,
    'wooden hanging block',
  );
  block.castShadow = false;
  group.add(blockPivot);

  let accumulator = 0;
  const fixed = 1 / 60;
  const previous: ShipDynamics['pose'] = {
    x: 0,
    z: 0,
    heading: 0,
    heave: 0,
    pitch: 0,
    roll: 0,
    speed: 0,
    luff: 0,
    shake: 0,
  };
  const current: ShipDynamics['pose'] = {
    x: 0,
    z: 0,
    heading: 0,
    heave: 0,
    pitch: 0,
    roll: 0,
    speed: 0,
    luff: 0,
    shake: 0,
  };
  let lanternX = 0;
  let lanternZ = 0;
  let lanternVx = 0;
  let lanternVz = 0;
  let blockX = 0;
  let blockZ = 0;
  let blockVx = 0;
  let blockVz = 0;

  const updateSecondary = (dt: number) => {
    const ax = MathUtils.clamp(dynamics.measuredAcceleration[0] * 0.012, -0.28, 0.28);
    const az = MathUtils.clamp(dynamics.measuredAcceleration[2] * 0.012, -0.28, 0.28);
    const spring = (currentValue: number, velocity: number, target: number, hz: number): [number, number] => {
      const omega = Math.PI * 2 * hz;
      const accel = (target - currentValue) * omega * omega - 2 * 0.68 * omega * velocity;
      const v = velocity + accel * dt;
      return [currentValue + v * dt, v];
    };
    [lanternX, lanternVx] = spring(lanternX, lanternVx, -az, 0.72);
    [lanternZ, lanternVz] = spring(lanternZ, lanternVz, ax, 0.68);
    [blockX, blockVx] = spring(blockX, blockVx, -az * 0.75, 0.9);
    [blockZ, blockVz] = spring(blockZ, blockVz, ax * 0.75, 0.86);
    lanternPivot.rotation.x = MathUtils.clamp(lanternX, -0.38, 0.38);
    lanternPivot.rotation.z = MathUtils.clamp(lanternZ, -0.38, 0.38);
    blockPivot.rotation.x = MathUtils.clamp(blockX, -0.32, 0.32);
    blockPivot.rotation.z = MathUtils.clamp(blockZ, -0.32, 0.32);
  };

  const api: Brigantine = {
    group,
    dynamics,
    uniforms,
    waterlineTable: BRIGANTINE_HALF_BEAM_TABLE,
    stations: BRIGANTINE_STATIONS,
    capsules: BRIGANTINE_CAPSULES,
    triangleCount: 0,
    drawCallCount: 0,
    update(dt: number, t: number, env: BrigantineEnv): void {
      accumulator = Math.min(accumulator + Math.max(0, dt), fixed * 5);
      while (accumulator >= fixed) {
        copyPose(dynamics.pose, previous);
        dynamics.step(fixed, dynamics.control, {
          waves: env.waves,
          ground: env.ground,
          obstacles: env.obstacles,
          t,
        });
        accumulator -= fixed;
      }
      copyPose(dynamics.pose, current);
      const alpha = MathUtils.clamp(accumulator / fixed, 0, 1);
      const x = MathUtils.lerp(previous.x, current.x, alpha);
      const z = MathUtils.lerp(previous.z, current.z, alpha);
      const heave = MathUtils.lerp(previous.heave, current.heave, alpha);
      const pitch = MathUtils.lerp(previous.pitch, current.pitch, alpha);
      const roll = MathUtils.lerp(previous.roll, current.roll, alpha);
      const yaw = shortestYaw(previous.heading, current.heading, alpha);
      const shake = current.shake * Math.sin(t * 37) * 0.018;
      group.position.set(x, heave + Math.abs(shake) * 0.3, z);
      group.rotation.set(pitch + shake * 0.5, yaw, roll + shake, 'YXZ');
      uniforms.trim.value = dynamics.control.trim;
      uniforms.luff.value = dynamics.pose.luff;
      updateSecondary(dt);
    },
    dispose(): void {
      group.traverse((object) => {
        const mesh = object as Mesh | LineSegments;
        if (mesh.geometry) mesh.geometry.dispose();
      });
      for (const material of materials) material.dispose();
    },
  };
  api.triangleCount = triangleCount(group);
  api.drawCallCount = drawCallCount(group);
  return api;
}
