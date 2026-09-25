import { BufferAttribute, BufferGeometry } from 'three/webgpu';

/** Shared indexed mesh helper for the ship's handcrafted procedural geometry. */
export interface P3 {
  x: number;
  y: number;
  z: number;
}

interface Basis {
  ax: number;
  ay: number;
  az: number;
  vx: number;
  vy: number;
  vz: number;
  wx: number;
  wy: number;
  wz: number;
}

type QuadUv = { u0: number; v0: number; u1: number; v1: number };
type QuadUvOrder = 'horizontal' | 'vertical';

interface MeshBuilderOptions {
  defaultRegion?: number;
  cylinderCaps?: boolean;
}

export function basisFromAxis(axis: P3): Basis {
  const len = Math.hypot(axis.x, axis.y, axis.z) || 1;
  const ax = axis.x / len;
  const ay = axis.y / len;
  const az = axis.z / len;
  const hx = Math.abs(ay) < 0.92 ? 0 : 1;
  const hy = Math.abs(ay) < 0.92 ? 1 : 0;
  const hz = 0;
  let vx = ay * hz - az * hy;
  let vy = az * hx - ax * hz;
  let vz = ax * hy - ay * hx;
  const vl = Math.hypot(vx, vy, vz) || 1;
  vx /= vl;
  vy /= vl;
  vz /= vl;
  const wx = ay * vz - az * vy;
  const wy = az * vx - ax * vz;
  const wz = ax * vy - ay * vx;
  return { ax, ay, az, vx, vy, vz, wx, wy, wz };
}

export class MeshBuilder<TDynamic extends object = object> {
  readonly positions: number[] = [];
  readonly uvs: number[] = [];
  readonly colors: number[] = [];
  readonly regions: number[] = [];
  readonly indices: number[] = [];
  readonly dynamics: Array<TDynamic & { indices: number[] }> = [];

  private currentColor: [number, number, number] = [1, 1, 1];
  private currentRegion: number;
  private readonly cylinderCaps: boolean;

  constructor(options: MeshBuilderOptions = {}) {
    this.currentRegion = options.defaultRegion ?? 0;
    this.cylinderCaps = options.cylinderCaps ?? true;
  }

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

  addQuad(a: P3, b: P3, c: P3, d: P3, uvScale = 1): number[] {
    const i = this.addVertex(a.x, a.y, a.z, 0, 0);
    this.addVertex(b.x, b.y, b.z, uvScale, 0);
    this.addVertex(c.x, c.y, c.z, uvScale, uvScale);
    this.addVertex(d.x, d.y, d.z, 0, uvScale);
    this.indices.push(i, i + 1, i + 2, i, i + 2, i + 3);
    return [i, i + 1, i + 2, i + 3];
  }

  addQuadUv(a: P3, b: P3, c: P3, d: P3, uv: QuadUv, order: QuadUvOrder = 'horizontal'): number[] {
    const i = this.addVertex(a.x, a.y, a.z, uv.u0, uv.v0);
    if (order === 'vertical') {
      this.addVertex(b.x, b.y, b.z, uv.u0, uv.v1);
      this.addVertex(c.x, c.y, c.z, uv.u1, uv.v1);
      this.addVertex(d.x, d.y, d.z, uv.u1, uv.v0);
    } else {
      this.addVertex(b.x, b.y, b.z, uv.u1, uv.v0);
      this.addVertex(c.x, c.y, c.z, uv.u1, uv.v1);
      this.addVertex(d.x, d.y, d.z, uv.u0, uv.v1);
    }
    this.indices.push(i, i + 1, i + 2, i, i + 2, i + 3);
    return [i, i + 1, i + 2, i + 3];
  }

  addTriangle(a: P3, b: P3, c: P3): void {
    const i = this.addVertex(a.x, a.y, a.z, 0, 0);
    this.addVertex(b.x, b.y, b.z, 1, 0);
    this.addVertex(c.x, c.y, c.z, 0.5, 1);
    this.indices.push(i, i + 1, i + 2);
  }

  addBox(
    cx: number,
    cy: number,
    cz: number,
    sx: number,
    sy: number,
    sz: number,
    dynamic?: TDynamic,
  ): number[] {
    const x0 = cx - sx * 0.5;
    const x1 = cx + sx * 0.5;
    const y0 = cy - sy * 0.5;
    const y1 = cy + sy * 0.5;
    const z0 = cz - sz * 0.5;
    const z1 = cz + sz * 0.5;
    const start = this.positions.length / 3;
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
    const out = Array.from({ length: 24 }, (_, i) => start + i);
    if (dynamic) this.dynamics.push({ ...dynamic, indices: out });
    return out;
  }

  addBeamBetween(a: P3, b: P3, width: number, height: number): void {
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dz) || 1;
    const px = (-dz / len) * width * 0.5;
    const pz = (dx / len) * width * 0.5;
    const ay0 = a.y - height * 0.5;
    const ay1 = a.y + height * 0.5;
    const by0 = b.y - height * 0.5;
    const by1 = b.y + height * 0.5;
    const a0 = { x: a.x - px, y: ay0, z: a.z - pz };
    const a1 = { x: a.x + px, y: ay0, z: a.z + pz };
    const a2 = { x: a.x + px, y: ay1, z: a.z + pz };
    const a3 = { x: a.x - px, y: ay1, z: a.z - pz };
    const b0 = { x: b.x - px, y: by0, z: b.z - pz };
    const b1 = { x: b.x + px, y: by0, z: b.z + pz };
    const b2 = { x: b.x + px, y: by1, z: b.z + pz };
    const b3 = { x: b.x - px, y: by1, z: b.z - pz };
    this.addQuad(a0, b0, b3, a3);
    this.addQuad(a1, a2, b2, b1);
    this.addQuad(a3, b3, b2, a2);
    this.addQuad(a0, a1, b1, b0);
    this.addQuad(a0, a3, a2, a1);
    this.addQuad(b0, b1, b2, b3);
  }

  addLathe(
    rings: readonly { center: P3; radius: number }[],
    axis: P3,
    segments = 14,
    dynamic?: TDynamic,
  ): number[] {
    const { vx, vy, vz, wx, wy, wz } = basisFromAxis(axis);
    const start = this.positions.length / 3;
    for (let r = 0; r < rings.length; r++) {
      const ring = rings[r]!;
      for (let i = 0; i < segments; i++) {
        const theta = (i / segments) * Math.PI * 2;
        const ct = Math.cos(theta);
        const st = Math.sin(theta);
        this.addVertex(
          ring.center.x + (vx * ct + wx * st) * ring.radius,
          ring.center.y + (vy * ct + wy * st) * ring.radius,
          ring.center.z + (vz * ct + wz * st) * ring.radius,
          i / segments,
          r / Math.max(1, rings.length - 1),
        );
      }
    }
    for (let r = 0; r < rings.length - 1; r++) {
      for (let i = 0; i < segments; i++) {
        const n = (i + 1) % segments;
        const a = start + r * segments + i;
        const b = start + r * segments + n;
        const c = start + (r + 1) * segments + n;
        const d = start + (r + 1) * segments + i;
        this.indices.push(a, b, c, a, c, d);
      }
    }
    const out = Array.from({ length: rings.length * segments }, (_, i) => start + i);
    if (dynamic) this.dynamics.push({ ...dynamic, indices: out });
    return out;
  }

  addDisc(center: P3, normal: P3, radius: number, segments = 18, dynamic?: TDynamic): number[] {
    const { vx, vy, vz, wx, wy, wz } = basisFromAxis(normal);
    const start = this.positions.length / 3;
    this.addVertex(center.x, center.y, center.z, 0.5, 0.5);
    for (let i = 0; i < segments; i++) {
      const theta = (i / segments) * Math.PI * 2;
      const ct = Math.cos(theta);
      const st = Math.sin(theta);
      this.addVertex(
        center.x + (vx * ct + wx * st) * radius,
        center.y + (vy * ct + wy * st) * radius,
        center.z + (vz * ct + wz * st) * radius,
        ct * 0.5 + 0.5,
        st * 0.5 + 0.5,
      );
    }
    for (let i = 0; i < segments; i++)
      this.indices.push(start, start + 1 + i, start + 1 + ((i + 1) % segments));
    const out = Array.from({ length: segments + 1 }, (_, i) => start + i);
    if (dynamic) this.dynamics.push({ ...dynamic, indices: out });
    return out;
  }

  addCylinderBetween(
    a: P3,
    b: P3,
    radius: number,
    segments = 10,
    options: boolean | number | { cap?: boolean; endRadius?: number } = {},
  ): void {
    const axis = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
    if (Math.hypot(axis.x, axis.y, axis.z) < 0.0001) return;
    const { vx, vy, vz, wx, wy, wz } = basisFromAxis(axis);
    let cap = this.cylinderCaps;
    let endRadius = radius;
    if (typeof options === 'boolean') {
      cap = options;
    } else if (typeof options === 'number') {
      endRadius = options;
    } else {
      cap = options.cap ?? cap;
      endRadius = options.endRadius ?? endRadius;
    }
    const start = this.positions.length / 3;
    for (let ring = 0; ring < 2; ring++) {
      const base = ring === 0 ? a : b;
      const ringRadius = ring === 0 ? radius : endRadius;
      for (let i = 0; i < segments; i++) {
        const theta = (i / segments) * Math.PI * 2;
        const ct = Math.cos(theta);
        const st = Math.sin(theta);
        this.addVertex(
          base.x + (vx * ct + wx * st) * ringRadius,
          base.y + (vy * ct + wy * st) * ringRadius,
          base.z + (vz * ct + wz * st) * ringRadius,
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
    if (!cap) return;
    const ca = this.addVertex(a.x, a.y, a.z, 0.5, 0.5);
    const cb = this.addVertex(b.x, b.y, b.z, 0.5, 0.5);
    for (let i = 0; i < segments; i++) {
      const n = (i + 1) % segments;
      this.indices.push(ca, start + n, start + i, cb, start + segments + i, start + segments + n);
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
