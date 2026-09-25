import { BufferAttribute, BufferGeometry } from 'three/webgpu';
import type { Tier } from '../contracts';
import { deckHeightAt, halfBeamAt, waterlineHalfBeamAt } from './lines';
import { detailForTier, lerpPoint } from './brigantine-detail';
import { MeshBuilder, type P3 } from './mesh-builder';

/** Builds spars, rigging lines, furled canvas, and deformable sail geometry. */
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

export function createSparGeometry(tier: Tier): BufferGeometry {
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
  b.setRegion(4);
  b.setColor(0x27231f);
  b.addCylinderBetween({ x: 0, y: 3.04, z: 22.05 }, { x: 0, y: 3.05, z: 22.32 }, 0.083, detail.cyl);
  b.setRegion(1);
  b.setColor(0xb77a42);
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

export function createBundledCanvasGeometry(tier: Tier): BufferGeometry {
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

export function createSailGeometry(tier: Tier): BufferGeometry {
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

export function createRiggingGeometry(): BufferGeometry {
  const positions: number[] = [];
  const line = (a: P3, b: P3) => positions.push(a.x, a.y, a.z, b.x, b.y, b.z);
  const foreTop = { x: 0, y: 17.9, z: 4.1 };
  const mainTop = { x: 0, y: 19.0, z: -4.25 };
  for (const side of [-1, 1] as const) {
    const foreFeet = [1.1, 2.8, 4.5, 6.2, 7.9];
    const mainFeet = [-8.4, -6.8, -5.2, -3.6, -2.0];
    for (const z of foreFeet) line({ x: side * (halfBeamAt(z, 1.94) + 0.2), y: 1.94, z }, foreTop);
    for (const z of mainFeet) line({ x: side * (halfBeamAt(z, 1.94) + 0.2), y: 1.94, z }, mainTop);
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
