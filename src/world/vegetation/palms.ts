// Adapted from Tidewater © 2026 DRG Software Solutions LLC, MIT, src/world/vegetation/PlantGeometry.js@fd6cae6
// Adapted from Tidewater © 2026 DRG Software Solutions LLC, MIT, src/world/vegetation/GeoBuilder.js@fd6cae6
import {
  BufferGeometry,
  Float32BufferAttribute,
  InterleavedBuffer,
  InterleavedBufferAttribute,
  Uint16BufferAttribute,
  Uint32BufferAttribute,
  Vector3,
} from 'three/webgpu';
import { ICOSAHEDRON_FACES, ICOSAHEDRON_VERTICES } from '../../util/icosahedron';
import { mulberry32, smoothstep } from '../../util/math';

export const PALM_PART = { STEM: 0, FROND: 1, COCONUT: 5 } as const;

const UP = new Vector3(0, 1, 0);
const v0 = new Vector3();
const v1 = new Vector3();
const v2 = new Vector3();
const v3 = new Vector3();

class GeoBuilder {
  private readonly pos: number[] = [];
  private readonly nor: number[] = [];
  private readonly tex: number[] = [];
  private readonly veg: number[] = [];
  private readonly mat: number[] = [];
  private readonly shade: number[] = [];
  private readonly idx: number[] = [];

  get count(): number {
    return this.pos.length / 3;
  }

  vertex(p: Vector3, n: Vector3, u: number, v: number, veg: number[], mat: number[]): number {
    this.pos.push(p.x, p.y, p.z);
    this.nor.push(n.x, n.y, n.z);
    this.tex.push(u, v);
    this.veg.push(veg[0] ?? 0, veg[1] ?? 0, veg[2] ?? 0, veg[3] ?? 0);
    this.mat.push(mat[0] ?? 0, mat[1] ?? 0, mat[2] ?? 0, mat[3] ?? 0);
    this.shade.push(Math.min(1, Math.max(0, 0.2 + v * 0.55 + (veg[0] ?? 0) * 0.25)));
    return this.count - 1;
  }

  tri(a: number, b: number, c: number): void {
    this.idx.push(a, b, c);
  }

  quad(a: number, b: number, c: number, d: number): void {
    this.idx.push(a, b, c, a, c, d);
  }

  build(boundingRadius = 0, boundingCenter: Vector3 | null = null): BufferGeometry {
    const geometry = new BufferGeometry();
    const layout = [
      ['position', this.pos, 3],
      ['normal', this.nor, 3],
      ['uv', this.tex, 2],
      ['aVeg', this.veg, 4],
      // aMat.x is the part id (stem, frond, coconut). No vertex colours: palms are white there, and
      // fewer attributes leave room for instanced matrices as attributes (engine/instancing.ts).
      ['aMat', this.mat, 4],
      ['shade', this.shade, 1],
    ] as const;
    const stride = layout.reduce((sum, [, , size]) => sum + size, 0);
    const data = new Float32Array(this.count * stride);
    let offset = 0;
    for (const [, source, size] of layout) {
      for (let i = 0; i < this.count; i += 1) {
        for (let c = 0; c < size; c += 1) data[i * stride + offset + c] = source[i * size + c] ?? 0;
      }
      offset += size;
    }
    const interleaved = new InterleavedBuffer(data, stride);
    offset = 0;
    for (const [name, , size] of layout) {
      geometry.setAttribute(name, new InterleavedBufferAttribute(interleaved, size, offset));
      offset += size;
    }
    const fade = new Float32Array(this.count);
    const tint = new Float32Array(this.count * 3);
    fade.fill(1);
    tint.fill(1);
    geometry.setAttribute('fade', new Float32BufferAttribute(fade, 1));
    geometry.setAttribute('tint', new Float32BufferAttribute(tint, 3));
    geometry.setIndex(
      this.count > 65535 ? new Uint32BufferAttribute(this.idx, 1) : new Uint16BufferAttribute(this.idx, 1),
    );
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    if (boundingRadius > 0 && geometry.boundingSphere) {
      geometry.boundingSphere.radius = Math.max(geometry.boundingSphere.radius, boundingRadius);
      if (boundingCenter) geometry.boundingSphere.center.copy(boundingCenter);
    }
    return geometry;
  }
}

interface StemOptions {
  radial: number;
  rows: number[];
  radius: (u: number) => number;
  height: number;
  mat?: number[];
  cap?: boolean;
  texU?: number;
  curve?: (u: number, out: Vector3) => Vector3;
}

function addStem(
  builder: GeoBuilder,
  { radial, rows, radius, height, mat = [0, 0, 0, 0], cap = true, texU = 1, curve }: StemOptions,
): void {
  const start = builder.count;
  for (let j = 0; j < rows.length; j += 1) {
    const u = rows[j]!;
    const r = radius(u);
    const du = 0.01;
    const dr = (radius(u + du) - radius(u - du)) / (2 * du * height);
    const center = curve ? curve(u, v2.set(0, 0, 0)).clone() : v2.set(0, u * height, 0).clone();
    for (let i = 0; i <= radial; i += 1) {
      const a = (i / radial) * Math.PI * 2;
      const c = Math.cos(a);
      const s = Math.sin(a);
      v0.set(center.x + c * r, center.y, center.z + s * r);
      v1.set(c, -dr, s).normalize();
      builder.vertex(v0, v1, (i / radial) * texU, u, [u, 0, 0, 0], mat);
    }
  }

  for (let j = 0; j < rows.length - 1; j += 1) {
    for (let i = 0; i < radial; i += 1) {
      const a = start + j * (radial + 1) + i;
      const c = a + radial + 1;
      builder.quad(a, c, c + 1, a + 1);
    }
  }

  if (cap) {
    const uTop = rows[rows.length - 1]!;
    const center = curve ? curve(uTop, v2.set(0, 0, 0)) : v2.set(0, uTop * height, 0);
    const top = builder.vertex(center, UP, 0.5, uTop, [uTop + 0.015, 0, 0, 0], mat);
    const ring = start + (rows.length - 1) * (radial + 1);
    for (let i = 0; i < radial; i += 1) builder.tri(ring + i, top, ring + i + 1);
  }
}

interface FrondOptions {
  origin: Vector3;
  azimuth: number;
  elevation: number;
  bend: number;
  twist?: number;
  length: number;
  segs?: number;
  cross?: number;
  leafLen: (s: number) => number;
  leafAngle: (s: number) => number;
  droop: (s: number) => number;
  curl?: number;
  part?: number;
  age?: number;
  seed?: number;
  phase?: number;
  flutter?: number;
  minWidth?: number;
  bendPow?: number;
  stemU?: number;
}

function addFrond(builder: GeoBuilder, options: FrondOptions): void {
  const {
    origin,
    azimuth,
    elevation,
    bend,
    twist = 0,
    length,
    segs = 8,
    cross = 2,
    leafLen,
    leafAngle,
    droop,
    curl = 0.2,
    part = PALM_PART.FROND,
    age = 0,
    seed = 0,
    phase = 0,
    flutter = 1,
    minWidth = 0.035,
    bendPow = 1.4,
    stemU = 1,
  } = options;

  const points: Vector3[] = [];
  const p = origin.clone();
  for (let k = 0; k <= segs; k += 1) {
    points.push(p.clone());
    const sm = (k + 0.5) / segs;
    const el = elevation - bend * Math.pow(sm, bendPow);
    const az = azimuth + twist * sm;
    v0.set(Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az));
    p.addScaledVector(v0, length / segs);
  }

  const azPerp = new Vector3(-Math.sin(azimuth), 0, Math.cos(azimuth));
  const tangent = new Vector3();
  const sideAxis = new Vector3();
  const normalUp = new Vector3();
  const side = new Vector3();
  const leafDir = new Vector3();

  for (const sigma of [-1, 1]) {
    const grid: Array<Array<{ q: Vector3; s: number; t: number; Ll: number; nup: Vector3 }>> = [];
    for (let k = 0; k <= segs; k += 1) {
      const s = k / segs;
      tangent.subVectors(points[Math.min(segs, k + 1)]!, points[Math.max(0, k - 1)]!).normalize();
      sideAxis.crossVectors(tangent, UP);
      if (sideAxis.lengthSq() < 0.04) sideAxis.copy(azPerp);
      sideAxis.normalize();
      normalUp.crossVectors(sideAxis, tangent).normalize();
      const Ll = Math.max(leafLen(s), minWidth);
      const al = leafAngle(s);
      const be = droop(s);
      side
        .copy(sideAxis)
        .multiplyScalar(sigma * Math.cos(be))
        .addScaledVector(normalUp, -Math.sin(be));
      leafDir.copy(tangent).multiplyScalar(Math.cos(al)).addScaledVector(side, Math.sin(al)).normalize();
      const row: Array<{ q: Vector3; s: number; t: number; Ll: number; nup: Vector3 }> = [];
      for (let j = 0; j <= cross; j += 1) {
        const t = j / cross;
        const q = points[k]!.clone()
          .addScaledVector(leafDir, Ll * t)
          .addScaledVector(normalUp, -Ll * curl * t * t);
        row.push({ q, s, t, Ll, nup: normalUp.clone() });
      }
      grid.push(row);
    }

    const idx: number[][] = [];
    for (let k = 0; k <= segs; k += 1) {
      const row: number[] = [];
      for (let j = 0; j <= cross; j += 1) {
        const g = grid[k]![j]!;
        const ka = Math.max(0, k - 1);
        const kb = Math.min(segs, k + 1);
        const ja = Math.max(0, j - 1);
        const jb = Math.min(cross, j + 1);
        v1.subVectors(grid[kb]![j]!.q, grid[ka]![j]!.q);
        v2.subVectors(grid[k]![jb]!.q, grid[k]![ja]!.q);
        v3.crossVectors(v1, v2);
        if (v3.lengthSq() < 1e-12) v3.copy(g.nup);
        v3.normalize();
        if (v3.dot(g.nup) < 0) v3.negate();
        const fl = g.t * smoothstep(0.05, 0.3, g.s) * flutter;
        row.push(builder.vertex(g.q, v3, g.s, g.t, [stemU, g.s, fl, phase], [part, age, g.Ll, seed]));
      }
      idx.push(row);
    }

    for (let k = 0; k < segs; k += 1) {
      for (let j = 0; j < cross; j += 1) {
        const a = idx[k]![j]!;
        const b = idx[k + 1]![j]!;
        const c = idx[k + 1]![j + 1]!;
        const d = idx[k]![j + 1]!;
        if (sigma > 0) builder.quad(a, d, c, b);
        else builder.quad(a, b, c, d);
      }
    }
  }
}

function addIcosphere(
  builder: GeoBuilder,
  center: Vector3,
  radii: Vector3,
  mat: number[],
  veg: number[],
): void {
  const ids = ICOSAHEDRON_VERTICES.map(([x, y, z]) => {
    v0.set(x, y, z).normalize();
    v1.copy(v0).multiply(radii).add(center);
    v2.copy(v0).divide(radii).normalize();
    return builder.vertex(v1, v2, 0.5, 0.5, veg, mat);
  });
  for (const [a, b, c] of ICOSAHEDRON_FACES) builder.tri(ids[a]!, ids[b]!, ids[c]!);
}

const PALM_H = 10;

function palmRadius(u: number): number {
  const y = u * PALM_H;
  let radius = 0.155 + 0.045 * (1 - u) + 0.19 * Math.exp(-Math.max(y, 0) / 0.42);
  radius *= 1 + 0.05 * Math.sin(y * 1.7) * (1 - u);
  radius += 0.07 * smoothstep(0.955, 0.99, u) - 0.1 * smoothstep(0.995, 1.02, u);
  return radius;
}

function trunkCurve(seed: number): (u: number, out: Vector3) => Vector3 {
  const rand = mulberry32(seed * 101 + 17);
  const az = rand() * Math.PI * 2;
  const bend = 0.55 + rand() * 0.45;
  const cross = (rand() - 0.5) * 0.24;
  return (u, out) => {
    const k = u * u * (1.25 - 0.25 * u);
    return out.set(
      Math.cos(az) * bend * k + Math.cos(az + Math.PI / 2) * cross * Math.sin(u * Math.PI),
      u * PALM_H,
      Math.sin(az) * bend * k + Math.sin(az + Math.PI / 2) * cross * Math.sin(u * Math.PI),
    );
  };
}

interface PalmFrondSpec {
  a: number;
  dead: boolean;
  azimuth: number;
  elevation: number;
  bend: number;
  twist: number;
  length: number;
  attachY: number;
  seed: number;
  phase: number;
}

function palmFrondParams(rand: () => number, count: number): PalmFrondSpec[] {
  const list: PalmFrondSpec[] = [];
  for (let i = 0; i < count; i += 1) {
    const a = count > 1 ? i / (count - 1) : 0.5;
    const dead = i === count - 1 && count > 10;
    const length = (3.9 + 1.3 * smoothstep(0, 0.45, a)) * (0.9 + 0.2 * rand());
    list.push({
      a,
      dead,
      azimuth: i * 2.39996 + (rand() - 0.5) * 0.35,
      elevation: dead ? -1.3 : 1.02 - 1.45 * Math.pow(a, 0.8) + (rand() - 0.5) * 0.25,
      bend: dead ? 0.15 : 0.62 + 0.8 * a + rand() * 0.3,
      twist: (rand() - 0.5) * 0.3,
      length: dead ? length * 0.85 : length,
      attachY: 0.3 - 0.45 * a,
      seed: rand(),
      phase: rand(),
    });
  }
  return list;
}

function addPalmCrown(
  builder: GeoBuilder,
  fronds: PalmFrondSpec[],
  crown: Vector3,
  { segs, cross, leafScale = 1 }: { segs: number; cross: number; leafScale?: number },
): void {
  for (const f of fronds) {
    const origin = crown
      .clone()
      .add(new Vector3(Math.cos(f.azimuth) * 0.14, f.attachY, Math.sin(f.azimuth) * 0.14));
    const length = f.length;
    addFrond(builder, {
      origin,
      azimuth: f.azimuth,
      elevation: f.elevation,
      bend: f.bend,
      twist: f.twist,
      length,
      segs,
      cross,
      leafLen: (s) =>
        leafScale * 0.19 * length * (smoothstep(0.05, 0.27, s) * (1 - 0.62 * smoothstep(0.32, 1, s))),
      leafAngle: (s) => 1.05 - 0.45 * s,
      droop: (s) => (f.dead ? 1.25 : 0.48 + 0.5 * f.a) + 0.32 * s,
      curl: f.dead ? 0.1 : 0.22,
      part: PALM_PART.FROND,
      age: f.dead ? 1 : f.a * 0.55,
      seed: f.seed,
      phase: f.phase,
      flutter: f.dead ? 0.3 : 1,
      minWidth: 0.045,
    });
  }
}

export function buildPalmNear(seed = 11): BufferGeometry {
  const rand = mulberry32(seed);
  const builder = new GeoBuilder();
  const curve = trunkCurve(seed);
  const rows = [
    -0.03, 0, 0.015, 0.04, 0.08, 0.14, 0.22, 0.32, 0.43, 0.54, 0.65, 0.76, 0.86, 0.94, 0.975, 0.992, 1.005,
  ];
  addStem(builder, {
    radial: 10,
    rows,
    radius: palmRadius,
    height: PALM_H,
    mat: [PALM_PART.STEM, 0, 0, 0],
    curve,
  });
  const crown = curve(1, new Vector3());
  for (let i = 0; i < 6; i += 1) {
    const az = i * 2.39996 + rand() * 0.5;
    const rr = 0.2 + rand() * 0.1;
    const center = crown.clone().add(new Vector3(Math.cos(az) * rr, -0.3 - rand() * 0.35, Math.sin(az) * rr));
    const s = 0.12 + rand() * 0.035;
    addIcosphere(
      builder,
      center,
      new Vector3(s, s * 1.12, s),
      [PALM_PART.COCONUT, rand(), 0, i / 6],
      [1, 0, 0, 0],
    );
  }
  addPalmCrown(builder, palmFrondParams(rand, 15), crown, { segs: 8, cross: 2 });
  return builder.build(16, new Vector3(0, 6, 0));
}

export function buildPalmFar(seed = 11): BufferGeometry {
  const rand = mulberry32(seed);
  const builder = new GeoBuilder();
  const curve = trunkCurve(seed);
  addStem(builder, {
    radial: 5,
    rows: [-0.03, 0.03, 0.2, 0.6, 1.0],
    radius: palmRadius,
    height: PALM_H,
    mat: [PALM_PART.STEM, 0, 0, 0],
    cap: false,
    curve,
  });
  const fronds = palmFrondParams(rand, 15).filter((_f, i) => i !== 1 && i !== 5 && i !== 9);
  addPalmCrown(builder, fronds, curve(1, new Vector3()), { segs: 3, cross: 1, leafScale: 1.15 });
  return builder.build(16, new Vector3(0, 6, 0));
}

export function buildYoungPalm(seed = 5): BufferGeometry {
  const rand = mulberry32(seed);
  const builder = new GeoBuilder();
  addStem(builder, {
    radial: 5,
    rows: [-0.2, 0.3, 1.0],
    radius: (u) => 0.16 - 0.07 * u,
    height: 0.6,
    mat: [PALM_PART.STEM, 0.35, 0, 0],
    cap: false,
  });
  for (let i = 0; i < 8; i += 1) {
    const a = i / 7;
    const az = i * 2.39996 + rand() * 0.4;
    const length = (1.7 + 0.9 * a) * (0.85 + 0.3 * rand());
    addFrond(builder, {
      origin: new Vector3(0, 0.1 - 0.15 * a, 0),
      azimuth: az,
      elevation: 1.35 - 0.8 * a + (rand() - 0.5) * 0.2,
      bend: 0.6 + 0.7 * a,
      twist: (rand() - 0.5) * 0.3,
      length,
      segs: 5,
      cross: 1,
      leafLen: (s) => 0.21 * length * (smoothstep(0.04, 0.25, s) * (1 - 0.6 * smoothstep(0.3, 1, s))),
      leafAngle: (s) => 1.0 - 0.4 * s,
      droop: (s) => 0.25 + 0.4 * a + 0.2 * s,
      curl: 0.15,
      part: PALM_PART.FROND,
      age: a * 0.4,
      seed: rand(),
      phase: rand(),
      minWidth: 0.03,
    });
  }
  return builder.build(4, new Vector3(0, 1, 0));
}
