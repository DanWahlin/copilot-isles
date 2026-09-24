import {
  BufferAttribute,
  BufferGeometry,
  DataTexture,
  DoubleSide,
  Group,
  LinearFilter,
  LinearMipmapLinearFilter,
  LineBasicMaterial,
  LineSegments,
  MathUtils,
  Mesh,
  MeshStandardNodeMaterial,
  Object3D,
  RGBAFormat,
  RepeatWrapping,
  SRGBColorSpace,
  TextureLoader,
  UnsignedByteType,
  type Material,
  type Texture,
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
  smoothstep,
  texture,
  uniform,
  vec2,
} from 'three/tsl';
import { packs } from '../../engine/packs';
import type { CircleObstacle, HeightField, Tier, WaveSampler } from '../contracts';
import { updateShipOceanInteraction } from '../ocean/ship-interaction';
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
  anchors: ShipAnchors;
  /** Writes 32 closed-polyline world-space xz points: local +x side stern→bow, then local -x side bow→stern. */
  waterlinePolygon(outWorld: Float32Array): Float32Array;
  /** Writes [x, z] for the current bow waterline point. */
  bowWorld(outWorld: Float32Array | number[]): Float32Array | number[];
  /** Writes [x, z] for the current stern waterline point. */
  sternWorld(outWorld: Float32Array | number[]): Float32Array | number[];
  dispose(): void;
}

export interface ShipAnchors {
  helm: { x: number; y: number; z: number; heading: number };
  boarding: { x: number; y: number; z: number };
}

interface P3 {
  x: number;
  y: number;
  z: number;
}

interface Detail {
  hullZ: number;
  hullY: number;
  sail: number;
  cyl: number;
  rig: number;
  railStep: number;
}

const WATERLINE_POLYGON_POINTS = 32;
const BOW_Z = BRIGANTINE_HALF_LENGTH + 0.28;
const STERN_Z = -BRIGANTINE_HALF_LENGTH - 0.15;
const HELM_Z = -9.55;
const BOARDING_Z = -0.15;

function detailForTier(tier: Tier): Detail {
  if (tier === 'lite') return { hullZ: 44, hullY: 12, sail: 7, cyl: 8, rig: 5, railStep: 1.15 };
  if (tier === 'low') return { hullZ: 56, hullY: 14, sail: 9, cyl: 10, rig: 5, railStep: 0.9 };
  if (tier === 'medium') return { hullZ: 88, hullY: 18, sail: 15, cyl: 12, rig: 6, railStep: 0.62 };
  return { hullZ: 128, hullY: 22, sail: 22, cyl: 14, rig: 7, railStep: 0.45 };
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpPoint(a: P3, b: P3, t: number): P3 {
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), z: lerp(a.z, b.z, t) };
}

function localToWorldXZ(
  pose: ShipDynamics['pose'],
  x: number,
  z: number,
  out: Float32Array | number[],
  i: number,
): void {
  const s = Math.sin(pose.heading);
  const c = Math.cos(pose.heading);
  out[i] = pose.x + c * x + s * z;
  out[i + 1] = pose.z - s * x + c * z;
}

class MeshBuilder {
  readonly positions: number[] = [];
  readonly uvs: number[] = [];
  readonly colors: number[] = [];
  readonly regions: number[] = [];
  readonly indices: number[] = [];
  private currentColor: [number, number, number] = [1, 1, 1];
  private currentRegion = 0;

  setColor(hex: number): void {
    this.currentColor = [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
  }

  setRegion(region: number): void {
    this.currentRegion = region;
  }

  addVertex(x: number, y: number, z: number, u = 0, v = 0): number {
    const i = this.positions.length / 3;
    this.positions.push(x, y, z);
    this.uvs.push(u, v);
    this.colors.push(this.currentColor[0], this.currentColor[1], this.currentColor[2]);
    this.regions.push(this.currentRegion);
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

  addRail(points: P3[], radius: number, segments: number): void {
    for (let i = 0; i < points.length - 1; i++)
      this.addCylinderBetween(points[i]!, points[i + 1]!, radius, segments, true);
  }

  build(): BufferGeometry {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(this.positions), 3));
    geometry.setAttribute('uv', new BufferAttribute(new Float32Array(this.uvs), 2));
    geometry.setAttribute('color', new BufferAttribute(new Float32Array(this.colors), 3));
    geometry.setAttribute('shipRegion', new BufferAttribute(new Float32Array(this.regions), 1));
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
        const lower = lerpPoint(p00, p10, u);
        const upper = lerpPoint(p01, p11, u);
        const p = lerpPoint(lower, upper, v);
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

function triangleCount(group: Object3D): number {
  let tris = 0;
  group.traverse((object) => {
    const mesh = object as Mesh;
    if (!mesh.isMesh) return;
    const geometry = mesh.geometry;
    const index = geometry.getIndex();
    const position = geometry.getAttribute('position');
    tris += index ? index.count / 3 : position.count / 3;
  });
  return Math.round(tris);
}

function drawCallCount(group: Object3D): number {
  let calls = 0;
  group.traverse((object) => {
    const drawable = object as Mesh | LineSegments;
    if ('isMesh' in drawable || 'isLineSegments' in drawable) calls += 1;
  });
  return calls;
}

function createHullGeometry(tier: Tier): BufferGeometry {
  const d = detailForTier(tier);
  const builder = new MeshBuilder();
  builder.setRegion(0);
  builder.setColor(0xa0663a);
  const yFractions = Array.from({ length: d.hullY + 1 }, (_, i) => i / d.hullY);
  const star: number[][] = [];
  const port: number[][] = [];
  for (let zi = 0; zi <= d.hullZ; zi++) {
    const z = -BRIGANTINE_HALF_LENGTH + (BRIGANTINE_LENGTH * zi) / d.hullZ;
    const keel = keelHeightAt(z);
    const sheer = sheerHeightAt(z);
    star[zi] = [];
    port[zi] = [];
    for (let yi = 0; yi < yFractions.length; yi++) {
      const f = yFractions[yi]!;
      const eased =
        f < 0.55 ? Math.pow(f / 0.55, 0.78) * 0.55 : 0.55 + Math.pow((f - 0.55) / 0.45, 1.18) * 0.45;
      const y = keel + (sheer - keel) * eased;
      const tumble = y > 0.25 ? 1 - 0.11 * clamp01((y - 0.25) / Math.max(0.1, sheer - 0.25)) : 1;
      const x = halfBeamAt(z, y) * tumble;
      star[zi]![yi] = builder.addVertex(x, y, z, zi / d.hullZ, f);
      port[zi]![yi] = builder.addVertex(-x, y, z, zi / d.hullZ, f);
    }
  }
  for (let zi = 0; zi < d.hullZ; zi++) {
    for (let yi = 0; yi < yFractions.length - 1; yi++) {
      const a = star[zi]![yi]!;
      const b = star[zi + 1]![yi]!;
      const c = star[zi + 1]![yi + 1]!;
      const e = star[zi]![yi + 1]!;
      builder.indices.push(a, b, c, a, c, e);
      const pa = port[zi]![yi]!;
      const pb = port[zi]![yi + 1]!;
      const pc = port[zi + 1]![yi + 1]!;
      const pd = port[zi + 1]![yi]!;
      builder.indices.push(pa, pd, pc, pa, pc, pb);
    }
  }
  for (let zi = 0; zi < d.hullZ; zi++) {
    const a = port[zi]![0]!;
    const b = port[zi + 1]![0]!;
    const c = star[zi + 1]![0]!;
    const e = star[zi]![0]!;
    builder.indices.push(a, b, c, a, c, e);
  }
  const top = yFractions.length - 1;
  for (const zi of [0, d.hullZ]) {
    for (let yi = 0; yi < top; yi++) {
      const a = port[zi]![yi]!;
      const b = star[zi]![yi]!;
      const c = star[zi]![yi + 1]!;
      const e = port[zi]![yi + 1]!;
      if (zi === 0) builder.indices.push(a, b, c, a, c, e);
      else builder.indices.push(a, e, c, a, c, b);
    }
  }
  // Raked cutwater and false keel give the bow a sharp 18th-century profile.
  builder.setRegion(4);
  builder.setColor(0x24201c);
  builder.addTriangle({ x: 0, y: -2.5, z: 10.6 }, { x: 0, y: 2.35, z: 11.95 }, { x: 0, y: -2.1, z: 12.75 });
  builder.addBox(0, -2.45, -1.2, 0.18, 0.32, 18.2);
  return builder.build();
}

function addCurvedRail(
  builder: MeshBuilder,
  side: -1 | 1,
  z0: number,
  z1: number,
  yOffset: number,
  radius: number,
  detail: Detail,
): void {
  const pts: P3[] = [];
  const steps = Math.max(3, Math.ceil(Math.abs(z1 - z0) / detail.railStep));
  for (let i = 0; i <= steps; i++) {
    const z = lerp(z0, z1, i / steps);
    const y = sheerHeightAt(z) + yOffset;
    pts.push({ x: side * (halfBeamAt(z, y) * 0.96 + radius * 0.4), y, z });
  }
  builder.addRail(pts, radius, detail.cyl);
}

function createDeckGeometry(tier: Tier): BufferGeometry {
  const detail = detailForTier(tier);
  const builder = new MeshBuilder();
  builder.setRegion(1);
  builder.setColor(0xd8b078);
  const sections = tier === 'lite' || tier === 'low' ? 44 : 82;
  for (let i = 0; i < sections; i++) {
    const z0 = -10.95 + (21.25 * i) / sections;
    const z1 = -10.95 + (21.25 * (i + 1)) / sections;
    const y0 = deckHeightAt(z0);
    const y1 = deckHeightAt(z1);
    const x00 = -halfBeamAt(z0, y0) * 0.76;
    const x01 = halfBeamAt(z0, y0) * 0.76;
    const x10 = -halfBeamAt(z1, y1) * 0.76;
    const x11 = halfBeamAt(z1, y1) * 0.76;
    builder.addQuad(
      { x: x00, y: y0, z: z0 },
      { x: x01, y: y0, z: z0 },
      { x: x11, y: y1, z: z1 },
      { x: x10, y: y1, z: z1 },
      6,
    );
  }
  // Raised platforms, hatches, capstan, helm, companionway, bits, and grates.
  builder.addBox(0, deckHeightAt(-8.0) + 0.09, -8.0, 4.3, 0.18, 5.8);
  builder.addBox(0, deckHeightAt(8.7) + 0.08, 8.7, 3.5, 0.16, 3.7);
  builder.addBox(0, deckHeightAt(-2.45) + 0.16, -2.45, 1.45, 0.22, 2.05);
  builder.addBox(0, deckHeightAt(3.15) + 0.16, 3.15, 1.25, 0.22, 1.65);
  builder.addBox(0, deckHeightAt(-7.25) + 0.18, -7.25, 1.55, 0.24, 1.12);
  for (const z of [-1.8, 2.8, 6.5]) {
    for (const x of [-0.35, 0.35]) builder.addBox(x, deckHeightAt(z) + 0.12, z, 0.18, 0.12, 1.05);
  }
  builder.addCylinderBetween(
    { x: 0, y: deckHeightAt(-0.15), z: -0.15 },
    { x: 0, y: deckHeightAt(-0.15) + 0.85, z: -0.15 },
    0.26,
    detail.cyl,
  );
  builder.addCylinderBetween(
    { x: -0.95, y: deckHeightAt(-8.95) + 0.78, z: -8.95 },
    { x: 0.95, y: deckHeightAt(-8.95) + 0.78, z: -8.95 },
    0.055,
    detail.cyl,
  );
  builder.addCylinderBetween(
    { x: 0, y: deckHeightAt(-8.95) + 0.25, z: -8.95 },
    { x: 0, y: deckHeightAt(-8.95) + 1.28, z: -8.95 },
    0.05,
    detail.cyl,
  );
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    builder.addCylinderBetween(
      { x: Math.cos(a) * 0.15, y: deckHeightAt(-8.95) + 0.78 + Math.sin(a) * 0.15, z: -8.95 },
      { x: Math.cos(a) * 0.65, y: deckHeightAt(-8.95) + 0.78 + Math.sin(a) * 0.65, z: -8.95 },
      0.018,
      5,
    );
  }
  for (const side of [-1, 1] as const) {
    addCurvedRail(builder, side, -11.0, 10.4, 0.18, 0.07, detail);
    addCurvedRail(builder, side, -11.0, 10.4, -0.42, 0.045, detail);
    const count = tier === 'lite' || tier === 'low' ? 18 : 34;
    for (let i = 0; i <= count; i++) {
      const z = lerp(-10.6, 10.0, i / count);
      const yTop = sheerHeightAt(z) + 0.15;
      const yBot = sheerHeightAt(z) - 0.36;
      const x = side * (halfBeamAt(z, yTop) * 0.96 + 0.03);
      builder.addCylinderBetween({ x, y: yBot, z }, { x, y: yTop, z }, 0.018, 6);
    }
  }
  return builder.build();
}

function createTrimGeometry(tier: Tier): BufferGeometry {
  const detail = detailForTier(tier);
  const builder = new MeshBuilder();
  builder.setRegion(2);
  builder.setColor(0x7bc0bd);
  const steps = tier === 'lite' || tier === 'low' ? 56 : 116;
  for (let i = 0; i < steps; i++) {
    const z0 = -11.35 + (22.35 * i) / steps;
    const z1 = -11.35 + (22.35 * (i + 1)) / steps;
    for (const side of [-1, 1] as const) {
      const x0 = side * (waterlineHalfBeamAt(z0) + 0.055);
      const x1 = side * (waterlineHalfBeamAt(z1) + 0.055);
      // Painted strake, ochre wale, algae boot-top, and rail cap.
      builder.setRegion(2);
      builder.setColor(0x7bc0bd);
      builder.addQuad(
        { x: x0, y: 0.75, z: z0 },
        { x: x1, y: 0.75, z: z1 },
        { x: x1, y: 1.06, z: z1 },
        { x: x0, y: 1.06, z: z0 },
      );
      builder.setRegion(3);
      builder.setColor(0xd2a352);
      builder.addQuad(
        { x: x0, y: 1.96, z: z0 },
        { x: x1, y: 1.96, z: z1 },
        { x: x1, y: 2.16, z: z1 },
        { x: x0, y: 2.16, z: z0 },
      );
      builder.setRegion(2);
      builder.setColor(0x2b827b);
      builder.addQuad(
        { x: x0, y: -0.2, z: z0 },
        { x: x1, y: -0.2, z: z1 },
        { x: x1, y: 0.04, z: z1 },
        { x: x0, y: 0.04, z: z0 },
      );
    }
  }
  builder.setRegion(4);
  builder.setColor(0x34332f);
  const portZ = [-8.1, -6.0, -3.9, -1.8, 0.4, 2.6, 4.8, 6.9];
  for (const z of portZ) {
    for (const side of [-1, 1] as const) {
      const x = side * (waterlineHalfBeamAt(z) + 0.12);
      builder.addBox(x, 1.52, z, 0.12, 0.58, 0.82);
    }
  }
  // Stern gallery, quarter galleries, transom frame, rudder, catheads, anchors, chainplates, deadeyes.
  builder.setRegion(3);
  builder.setColor(0xd2a352);
  builder.addBox(0, 2.1, -12.22, 4.9, 1.15, 0.22);
  builder.addBox(-2.75, 2.0, -11.55, 0.55, 1.0, 1.2);
  builder.addBox(2.75, 2.0, -11.55, 0.55, 1.0, 1.2);
  builder.addBox(0, 0.05, -12.43, 0.44, 2.25, 0.18);
  for (const side of [-1, 1] as const) {
    builder.addCylinderBetween(
      { x: side * 2.25, y: 2.55, z: 8.75 },
      { x: side * 4.25, y: 2.42, z: 9.35 },
      0.075,
      detail.cyl,
    );
    builder.addBox(side * 3.65, 0.85, 7.65, 0.34, 0.62, 0.14);
    builder.addCylinderBetween(
      { x: side * 3.65, y: 1.15, z: 7.6 },
      { x: side * 3.65, y: 0.15, z: 7.1 },
      0.035,
      detail.cyl,
    );
    for (const z of [-6.8, -5.3, -3.8, 1.6, 3.1, 4.6, 6.1]) {
      const x = side * (waterlineHalfBeamAt(z) + 0.2);
      builder.addCylinderBetween(
        { x, y: 1.95, z },
        { x: side * (waterlineHalfBeamAt(z) + 0.52), y: 1.48, z },
        0.018,
        6,
      );
      builder.addCylinderBetween(
        { x: side * (waterlineHalfBeamAt(z) + 0.42), y: 1.48, z },
        { x: side * (waterlineHalfBeamAt(z) + 0.42), y: 1.25, z },
        0.055,
        8,
      );
    }
  }
  builder.addCylinderBetween({ x: 0, y: 1.05, z: 10.9 }, { x: 0, y: 2.8, z: 12.05 }, 0.12, detail.cyl);
  builder.addCylinderBetween({ x: 0, y: 0.15, z: 12.0 }, { x: 0, y: 1.55, z: 13.0 }, 0.08, detail.cyl);
  builder.addTriangle({ x: 0, y: 1.65, z: 11.05 }, { x: 0, y: 1.92, z: 11.55 }, { x: 0, y: 1.15, z: 11.55 });
  return builder.build();
}

function createWindowGeometry(): BufferGeometry {
  const b = new MeshBuilder();
  b.setRegion(6);
  b.setColor(0xffb060);
  for (const x of [-1.45, -0.48, 0.48, 1.45]) b.addBox(x, 2.1, -12.39, 0.42, 0.36, 0.035);
  for (const side of [-1, 1] as const) {
    b.addBox(side * 2.76, 2.08, -11.17, 0.045, 0.34, 0.46);
    b.addBox(side * 2.94, 2.1, -11.6, 0.045, 0.32, 0.38);
  }
  b.setRegion(4);
  b.setColor(0x0a0d0e);
  b.addBox(0, 1.42, -12.41, 2.8, 0.34, 0.04);
  return b.build();
}

function addGlyph(builder: MeshBuilder, glyph: string, cx: number, cy: number, z: number): void {
  const patterns: Record<string, string[]> = {
    C: ['111', '100', '100', '100', '111'],
    O: ['111', '101', '101', '101', '111'],
    P: ['110', '101', '110', '100', '100'],
    I: ['111', '010', '010', '010', '111'],
    L: ['100', '100', '100', '100', '111'],
    T: ['111', '010', '010', '010', '010'],
  };
  const rows = patterns[glyph] ?? patterns.O;
  const s = 0.055;
  for (let y = 0; y < rows.length; y++) {
    const row = rows[y]!;
    for (let x = 0; x < row.length; x++) {
      if (row[x] !== '1') continue;
      builder.addBox(cx + (1 - x) * s, cy + (2 - y) * s, z, s * 0.82, s * 0.82, 0.026);
    }
  }
}

function createSternGoldGeometry(): BufferGeometry {
  const b = new MeshBuilder();
  b.setRegion(3);
  b.setColor(0xd2a352);
  // Stern gallery frames, mullions, carved rails and a readable name board.
  for (const x of [-1.45, -0.48, 0.48, 1.45]) {
    b.addBox(x, 2.1, -12.44, 0.58, 0.06, 0.035);
    b.addBox(x, 1.9, -12.44, 0.58, 0.055, 0.035);
    b.addBox(x - 0.29, 2.0, -12.44, 0.055, 0.36, 0.035);
    b.addBox(x + 0.29, 2.0, -12.44, 0.055, 0.36, 0.035);
    b.addBox(x, 2.0, -12.455, 0.035, 0.34, 0.03);
    b.addBox(x, 2.0, -12.455, 0.5, 0.028, 0.03);
  }
  b.addCylinderBetween({ x: -2.35, y: 2.65, z: -12.38 }, { x: 2.35, y: 2.65, z: -12.38 }, 0.045, 10);
  b.addCylinderBetween({ x: -2.45, y: 1.72, z: -12.4 }, { x: 2.45, y: 1.72, z: -12.4 }, 0.04, 10);
  for (const x of [-2.25, 2.25]) {
    b.addCylinderBetween({ x, y: 1.58, z: -12.37 }, { x, y: 2.72, z: -12.37 }, 0.035, 10);
  }
  for (const side of [-1, 1] as const) {
    b.addBox(side * 2.72, 2.33, -11.48, 0.06, 0.75, 0.62);
    b.addBox(side * 2.95, 1.72, -11.55, 0.08, 0.08, 1.05);
    b.addCylinderBetween(
      { x: side * 2.55, y: 2.62, z: -12.1 },
      { x: side * 3.08, y: 2.42, z: -11.0 },
      0.035,
      10,
    );
  }
  const letters = 'COPILOT';
  for (let i = 0; i < letters.length; i++) addGlyph(b, letters[i]!, 0.84 - i * 0.28, 1.42, -12.455);
  b.addCylinderBetween({ x: -0.32, y: 3.14, z: -12.36 }, { x: 0.32, y: 3.14, z: -12.36 }, 0.035, 10);
  b.addCylinderBetween({ x: 0, y: 3.12, z: -12.36 }, { x: 0, y: 2.68, z: -12.36 }, 0.025, 8);
  return b.build();
}

function createSparGeometry(tier: Tier): BufferGeometry {
  const detail = detailForTier(tier);
  const b = new MeshBuilder();
  b.setRegion(1);
  b.setColor(0xb77a42);
  const fore = { z: 4.1, base: deckHeightAt(4.1) };
  const main = { z: -4.25, base: deckHeightAt(-4.25) };
  b.addCylinderBetween(
    { x: 0, y: fore.base - 0.8, z: fore.z },
    { x: 0, y: 18.7, z: fore.z },
    0.19,
    detail.cyl,
  );
  b.addCylinderBetween(
    { x: 0, y: main.base - 0.8, z: main.z },
    { x: 0, y: 20.0, z: main.z },
    0.21,
    detail.cyl,
  );
  b.addCylinderBetween({ x: -5.6, y: 7.2, z: fore.z }, { x: 5.6, y: 7.2, z: fore.z }, 0.12, detail.cyl);
  b.addCylinderBetween({ x: -4.55, y: 11.45, z: fore.z }, { x: 4.55, y: 11.45, z: fore.z }, 0.09, detail.cyl);
  b.addCylinderBetween({ x: -3.4, y: 14.95, z: fore.z }, { x: 3.4, y: 14.95, z: fore.z }, 0.073, detail.cyl);
  b.addCylinderBetween({ x: 0, y: 3.35, z: main.z - 0.12 }, { x: 0, y: 3.05, z: -11.0 }, 0.11, detail.cyl);
  b.addCylinderBetween({ x: 0, y: 8.75, z: main.z - 0.1 }, { x: 0, y: 10.65, z: -10.05 }, 0.082, detail.cyl);
  b.addCylinderBetween({ x: 0, y: 2.35, z: 10.72 }, { x: 0, y: 2.9, z: 18.6 }, 0.14, detail.cyl);
  b.addCylinderBetween({ x: 0, y: 2.78, z: 17.8 }, { x: 0, y: 3.05, z: 22.3 }, 0.08, detail.cyl);
  for (const z of [-7.8, -2.6, 3.0, 7.7]) {
    b.addCylinderBetween(
      { x: -waterlineHalfBeamAt(z) * 0.76, y: deckHeightAt(z) + 0.18, z },
      { x: waterlineHalfBeamAt(z) * 0.76, y: deckHeightAt(z) + 0.18, z },
      0.047,
      detail.cyl,
    );
  }
  return b.build();
}

function createBundledCanvasGeometry(tier: Tier): BufferGeometry {
  const detail = detailForTier(tier);
  const b = new MeshBuilder();
  b.setRegion(5);
  b.setColor(0xefe4cc);
  const foreZ = 4.1;
  b.addCylinderBetween(
    { x: -5.05, y: 6.98, z: foreZ - 0.05 },
    { x: 5.05, y: 6.98, z: foreZ - 0.05 },
    0.24,
    detail.cyl,
  );
  b.addCylinderBetween(
    { x: -4.08, y: 11.22, z: foreZ - 0.05 },
    { x: 4.08, y: 11.22, z: foreZ - 0.05 },
    0.19,
    detail.cyl,
  );
  b.addCylinderBetween(
    { x: -3.05, y: 14.72, z: foreZ - 0.04 },
    { x: 3.05, y: 14.72, z: foreZ - 0.04 },
    0.145,
    detail.cyl,
  );
  b.addCylinderBetween({ x: 0, y: 3.23, z: -4.6 }, { x: 0, y: 3.06, z: -10.35 }, 0.19, detail.cyl);
  return b.build();
}

function createSailGeometry(tier: Tier): BufferGeometry {
  const s = new SailBuilder();
  const detail = detailForTier(tier).sail;
  const foreZ = 4.05;
  s.addQuad(
    { x: -4.95, y: 3.45, z: foreZ },
    { x: 4.95, y: 3.45, z: foreZ },
    { x: -5.25, y: 6.95, z: foreZ },
    { x: 5.25, y: 6.95, z: foreZ },
    { x: 0, y: 0, z: -1 },
    detail,
    detail,
  );
  s.addQuad(
    { x: -3.95, y: 7.65, z: foreZ },
    { x: 3.95, y: 7.65, z: foreZ },
    { x: -4.28, y: 11.2, z: foreZ },
    { x: 4.28, y: 11.2, z: foreZ },
    { x: 0, y: 0, z: -1 },
    detail,
    detail,
  );
  s.addQuad(
    { x: -2.9, y: 11.95, z: foreZ },
    { x: 2.9, y: 11.95, z: foreZ },
    { x: -3.18, y: 14.7, z: foreZ },
    { x: 3.18, y: 14.7, z: foreZ },
    { x: 0, y: 0, z: -1 },
    detail,
    Math.max(5, detail - 4),
  );
  s.addQuad(
    { x: 0, y: 3.15, z: -10.55 },
    { x: 0, y: 3.38, z: -4.45 },
    { x: 0, y: 10.1, z: -9.75 },
    { x: 0, y: 8.45, z: -4.35 },
    { x: 1, y: 0, z: 0 },
    detail,
    detail,
  );
  s.addTriangle(
    { x: 0, y: 8.75, z: -4.2 },
    { x: 0, y: 10.42, z: -9.55 },
    { x: 0, y: 15.7, z: -4.2 },
    { x: 1, y: 0, z: 0 },
    detail,
  );
  s.addTriangle(
    { x: 0, y: 2.65, z: 18.05 },
    { x: 0, y: 2.2, z: 9.75 },
    { x: 0, y: 7.25, z: 4.2 },
    { x: -1, y: 0, z: 0 },
    detail,
  );
  s.addTriangle(
    { x: 0, y: 2.88, z: 21.9 },
    { x: 0, y: 2.58, z: 15.85 },
    { x: 0, y: 9.65, z: 4.15 },
    { x: -1, y: 0, z: 0 },
    detail,
  );
  s.addTriangle(
    { x: 0, y: 3.2, z: 9.15 },
    { x: 0, y: 3.05, z: -1.25 },
    { x: 0, y: 11.25, z: 4.1 },
    { x: -1, y: 0, z: 0 },
    detail,
  );
  return s.build();
}

function createRiggingGeometry(): BufferGeometry {
  const positions: number[] = [];
  const line = (a: P3, b: P3) => positions.push(a.x, a.y, a.z, b.x, b.y, b.z);
  const foreTop = { x: 0, y: 17.9, z: 4.1 };
  const mainTop = { x: 0, y: 19.0, z: -4.25 };
  for (const side of [-1, 1] as const) {
    const foreFeet = [1.1, 2.8, 4.5, 6.2, 7.9];
    const mainFeet = [-8.4, -6.8, -5.2, -3.6, -2.0];
    for (const z of foreFeet) line({ x: side * (waterlineHalfBeamAt(z) + 0.38), y: 1.35, z }, foreTop);
    for (const z of mainFeet) line({ x: side * (waterlineHalfBeamAt(z) + 0.38), y: 1.35, z }, mainTop);
    line({ x: side * 2.8, y: deckHeightAt(-10.5) + 0.1, z: -10.5 }, mainTop);
    line({ x: side * 2.85, y: deckHeightAt(9.2) + 0.1, z: 9.2 }, foreTop);
  }
  line(mainTop, foreTop);
  line(foreTop, { x: 0, y: 2.75, z: 18.8 });
  line(foreTop, { x: 0, y: 2.95, z: 22.3 });
  line(mainTop, { x: 0, y: 2.55, z: 10.6 });
  line(mainTop, { x: 0, y: 3.3, z: -11.2 });
  for (const yard of [7.2, 11.45, 14.95]) {
    line({ x: -5.0, y: yard, z: 4.1 }, { x: 0, y: yard + 0.45, z: 4.1 });
    line({ x: 5.0, y: yard, z: 4.1 }, { x: 0, y: yard + 0.45, z: 4.1 });
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.computeBoundingSphere();
  return geometry;
}

let shipWoodTexture: Texture | null = null;

function getShipWoodTexture(): Texture {
  if (shipWoodTexture) return shipWoodTexture;
  if (typeof document === 'undefined') {
    shipWoodTexture = new DataTexture(new Uint8Array([132, 92, 54, 255]), 1, 1, RGBAFormat, UnsignedByteType);
    shipWoodTexture.needsUpdate = true;
  } else {
    shipWoodTexture = new TextureLoader().load(packs.url('/packs/testcove/ship/wood-trim.webp'));
  }
  shipWoodTexture.colorSpace = SRGBColorSpace;
  shipWoodTexture.wrapS = RepeatWrapping;
  shipWoodTexture.wrapT = RepeatWrapping;
  shipWoodTexture.generateMipmaps = true;
  shipWoodTexture.minFilter = LinearMipmapLinearFilter;
  shipWoodTexture.magFilter = LinearFilter;
  shipWoodTexture.anisotropy = 8;
  shipWoodTexture.repeat.set(1.35, 1.65);
  return shipWoodTexture;
}

function makeShipMaterial(): MeshStandardNodeMaterial {
  const m = new MeshStandardNodeMaterial({
    color: 0xffffff,
    roughness: 0.66,
    metalness: 0.02,
    side: DoubleSide,
  });
  const vc = attribute('color', 'vec3');
  const region = attribute('shipRegion', 'float');
  const r1 = smoothstep(0.6, 0.9, region).mul(float(1).sub(smoothstep(1.1, 1.4, region)));
  const r2 = smoothstep(1.6, 1.9, region).mul(float(1).sub(smoothstep(2.1, 2.4, region)));
  const r3 = smoothstep(2.6, 2.9, region).mul(float(1).sub(smoothstep(3.1, 3.4, region)));
  const r4 = smoothstep(3.6, 3.9, region).mul(float(1).sub(smoothstep(4.1, 4.4, region)));
  const r5 = smoothstep(4.6, 4.9, region).mul(float(1).sub(smoothstep(5.1, 5.4, region)));
  const r6 = smoothstep(5.6, 5.9, region);

  const hullWood = texture(
    getShipWoodTexture(),
    vec2(positionLocal.z.mul(0.085).add(positionLocal.x.mul(0.02)), positionLocal.y.mul(0.23).add(0.42)),
  ).rgb;
  const deckWood = texture(
    getShipWoodTexture(),
    vec2(positionLocal.x.mul(0.18).add(positionLocal.z.mul(0.015)), positionLocal.z.mul(0.12).add(0.18)),
  ).rgb;
  const plankNoise = sin(positionLocal.z.mul(5.5).add(positionLocal.y.mul(1.7)))
    .mul(0.5)
    .add(0.5);
  const hullSeam = abs(sin(positionLocal.y.mul(7.6)))
    .smoothstep(0.986, 1.0)
    .mul(0.13);
  const deckSeam = abs(sin(positionLocal.x.mul(8.2)))
    .smoothstep(0.965, 1.0)
    .mul(0.22);
  const hull = hullWood
    .mul(mix(color(0x8b5130), color(0xd08748), plankNoise.mul(0.2).add(0.24)))
    .sub(color(0x1a0905).mul(hullSeam));
  const deck = deckWood.mul(mix(color(0xc08c55), color(0xffce87), 0.34)).sub(color(0x2a170c).mul(deckSeam));
  const paintGrain = hullWood.mul(0.28).add(0.72);
  const teal = paintGrain.mul(color(0x2d8b88));
  const gold = paintGrain.mul(color(0xd7a554));
  const iron = mix(
    color(0x171717),
    color(0x4a4840),
    sin(positionLocal.x.mul(13).add(positionLocal.z.mul(9)))
      .mul(0.18)
      .add(0.24),
  );
  const weave = sin(positionLocal.x.mul(38))
    .mul(sin(positionLocal.z.mul(32)))
    .mul(0.045)
    .add(0.96);
  const canvas = color(0xefe4cc)
    .mul(weave)
    .sub(color(0x5b4328).mul(abs(sin(positionLocal.z.mul(4.5))).mul(0.04)));
  const glow = color(0xffb060).mul(world.night.smoothstep(0.08, 0.9).mul(2.8).add(0.2));

  let outColor = hull;
  outColor = mix(outColor, deck, r1);
  outColor = mix(outColor, teal, r2);
  outColor = mix(outColor, gold, r3);
  outColor = mix(outColor, iron, r4);
  outColor = mix(outColor, canvas, r5);
  outColor = mix(outColor, glow, r6);
  m.colorNode = outColor.mul(vc.mul(0.18).add(0.88));
  m.emissiveNode = glow.mul(r6).mul(world.night.smoothstep(0.08, 0.9));
  m.roughnessNode = mix(float(0.62), float(0.88), r5).add(r4.mul(0.1));
  return m;
}

function makeCanvasMaterial(uniforms: BrigantineUniforms): MeshStandardNodeMaterial {
  const m = new MeshStandardNodeMaterial({
    roughness: 0.88,
    metalness: 0,
    side: DoubleSide,
    transparent: true,
    opacity: 0.9,
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
    .mul(world.windSpeed.mul(0.035).add(0.2))
    .mul(gust.mul(0.28).add(0.86))
    .mul(windFacing)
    .add(flutter);
  m.positionNode = mix(sailAnchor, positionLocal.add(sailNormal.mul(billow)), uniforms.trim);
  const panelU = abs(sin(sailUv.x.mul(Math.PI * 8))).smoothstep(0.965, 1.0);
  const panelV = abs(sin(sailUv.y.mul(Math.PI * 5))).smoothstep(0.965, 1.0);
  const dirt = sailUv.y
    .oneMinus()
    .mul(0.12)
    .add(abs(sin(positionLocal.x.mul(3.7).add(positionLocal.y))).mul(0.08));
  const backlit = world.sunDir.x
    .mul(sailNormal.x)
    .add(world.sunDir.z.mul(sailNormal.z))
    .negate()
    .smoothstep(0.05, 0.8);
  m.colorNode = mix(color(0xd4bf91), color(0xffebbd), belly.mul(0.22)).sub(
    color(0x5b4328).mul(panelU.add(panelV).mul(0.12).add(dirt)),
  );
  m.emissiveNode = color(0xffd79a).mul(backlit.mul(world.sunDir.y.smoothstep(0.02, 0.45)).mul(0.08));
  return m;
}

function addMesh(
  group: Group,
  geometry: BufferGeometry,
  material: Material,
  name: string,
  castShadow = true,
): Mesh {
  const mesh = new Mesh(geometry, material);
  mesh.name = name;
  mesh.castShadow = castShadow;
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
  const anchors: ShipAnchors = {
    helm: { x: 0, y: deckHeightAt(-8.0) + 0.18, z: HELM_Z, heading: 0 },
    // At COVE.mooring heading π, local +x maps to world -x (west/port rail), which is the pier-facing side.
    boarding: {
      x: halfBeamAt(BOARDING_Z, deckHeightAt(BOARDING_Z)) * 0.72,
      y: deckHeightAt(BOARDING_Z),
      z: BOARDING_Z,
    },
  };
  const materials: Material[] = [];
  const register = <T extends Material>(m: T): T => {
    materials.push(m);
    return m;
  };

  const shipMaterial = register(makeShipMaterial());
  const riggingLineMaterial = register(
    new LineBasicMaterial({ color: 0x17110c, transparent: true, opacity: 0.72 }),
  );
  addMesh(group, createHullGeometry(tier), shipMaterial, 'rounded planked hull');
  addMesh(group, createDeckGeometry(tier), shipMaterial, 'deck planking rails and fittings', false);
  addMesh(group, createTrimGeometry(tier), shipMaterial, 'wales strakes gunports galleries anchors');
  addMesh(group, createWindowGeometry(), shipMaterial, 'stern gallery windows and name board backing', false);
  addMesh(group, createSternGoldGeometry(), shipMaterial, 'stern gallery trim and COPILOT name board');
  addMesh(group, createSparGeometry(tier), shipMaterial, 'masts yards boom bowsprit jibboom', false);
  addMesh(group, createBundledCanvasGeometry(tier), shipMaterial, 'furled canvas bundles', false);
  addMesh(
    group,
    createSailGeometry(tier),
    register(makeCanvasMaterial(uniforms)),
    'billowed procedural sails',
  );
  const rigging = new LineSegments(createRiggingGeometry(), riggingLineMaterial);
  rigging.name = 'standing and running rigging lines';
  group.add(rigging);

  const lanternPivot = new Group();
  lanternPivot.name = 'stern lantern pendulum';
  lanternPivot.position.set(0, 3.65, -12.05);
  const lanternRig = new MeshBuilder();
  lanternRig.setRegion(4);
  lanternRig.setColor(0x17110c);
  lanternRig.addCylinderBetween({ x: 0, y: 0, z: 0 }, { x: 0, y: -0.58, z: 0 }, 0.018, 6);
  lanternRig.addBox(0, -0.2, 0, 0.2, 0.04, 0.2);
  addMesh(lanternPivot, lanternRig.build(), shipMaterial, 'lantern hanger', false);
  const lanternGeo = new MeshBuilder();
  lanternGeo.setRegion(6);
  lanternGeo.setColor(0xffb060);
  lanternGeo.addBox(0, -0.74, 0, 0.24, 0.3, 0.24);
  addMesh(lanternPivot, lanternGeo.build(), shipMaterial, 'stern lantern', false);
  group.add(lanternPivot);

  const blockPivot = new Group();
  blockPivot.name = 'hanging block spring';
  blockPivot.position.set(-1.15, 9.2, -4.65);
  const blockGeo = new MeshBuilder();
  blockGeo.setRegion(4);
  blockGeo.setColor(0x17110c);
  blockGeo.addCylinderBetween({ x: 0, y: 0, z: 0 }, { x: 0, y: -0.85, z: 0.12 }, 0.014, 6);
  blockGeo.addBox(0, -0.98, 0.15, 0.18, 0.24, 0.12);
  addMesh(blockPivot, blockGeo.build(), shipMaterial, 'hanging line and block', false);
  group.add(blockPivot);

  const oceanBow = new Float32Array(2);
  const oceanStern = new Float32Array(2);
  const waterlineLocal = new Float32Array(WATERLINE_POLYGON_POINTS * 2);
  let wi = 0;
  for (let i = 0; i < WATERLINE_POLYGON_POINTS / 2; i++) {
    const z = -BRIGANTINE_HALF_LENGTH + (BRIGANTINE_LENGTH * i) / (WATERLINE_POLYGON_POINTS / 2 - 1);
    waterlineLocal[wi++] = waterlineHalfBeamAt(z);
    waterlineLocal[wi++] = z;
  }
  for (let i = WATERLINE_POLYGON_POINTS / 2 - 1; i >= 0; i--) {
    const z = -BRIGANTINE_HALF_LENGTH + (BRIGANTINE_LENGTH * i) / (WATERLINE_POLYGON_POINTS / 2 - 1);
    waterlineLocal[wi++] = -waterlineHalfBeamAt(z);
    waterlineLocal[wi++] = z;
  }

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
    anchors,
    waterlineTable: BRIGANTINE_HALF_BEAM_TABLE,
    stations: BRIGANTINE_STATIONS,
    capsules: BRIGANTINE_CAPSULES,
    triangleCount: 0,
    drawCallCount: 0,
    waterlinePolygon(outWorld: Float32Array): Float32Array {
      const n = Math.min(outWorld.length / 2, WATERLINE_POLYGON_POINTS);
      for (let i = 0; i < n; i++)
        localToWorldXZ(dynamics.pose, waterlineLocal[i * 2]!, waterlineLocal[i * 2 + 1]!, outWorld, i * 2);
      return outWorld;
    },
    bowWorld(outWorld: Float32Array | number[]): Float32Array | number[] {
      localToWorldXZ(dynamics.pose, 0, BOW_Z, outWorld, 0);
      return outWorld;
    },
    sternWorld(outWorld: Float32Array | number[]): Float32Array | number[] {
      localToWorldXZ(dynamics.pose, 0, STERN_Z, outWorld, 0);
      return outWorld;
    },
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
      localToWorldXZ(dynamics.pose, 0, BOW_Z, oceanBow, 0);
      localToWorldXZ(dynamics.pose, 0, STERN_Z, oceanStern, 0);
      updateShipOceanInteraction(
        dynamics.pose.x,
        dynamics.pose.z,
        dynamics.pose.heading,
        dynamics.forwardSpeed,
        oceanBow[0]!,
        oceanBow[1]!,
        oceanStern[0]!,
        oceanStern[1]!,
        t,
      );
      updateSecondary(dt);
    },
    dispose(): void {
      group.traverse((object) => {
        const mesh = object as Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
      });
      for (const material of materials) material.dispose();
    },
  };
  api.triangleCount = triangleCount(group);
  api.drawCallCount = drawCallCount(group);
  return api;
}
