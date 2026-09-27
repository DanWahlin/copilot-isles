import { BufferAttribute, BufferGeometry } from 'three/webgpu';
import type { Tier } from '../contracts';
import { deckHeightAt, halfBeamAt, waterlineHalfBeamAt } from './lines';
import { detailForTier, lerpPoint } from './brigantine-detail';
import { MeshBuilder, type P3 } from './mesh-builder';

interface MastSpec {
  id: 'fore' | 'main' | 'mizzen';
  z: number;
  lowerTop: number;
  topTop: number;
  truck: number;
  radius: number;
  shroudSpread: number;
}

interface YardSpec {
  mast: MastSpec;
  y: number;
  span: number;
  radius: number;
  canvasRadius: number;
}

interface CurvedQuadOptions {
  leechInset: number;
  footRoach: number;
}

const FORE: MastSpec = {
  id: 'fore',
  z: 5.25,
  lowerTop: 10.15,
  topTop: 16.4,
  truck: 21.05,
  radius: 0.31,
  shroudSpread: 2.25,
};
const MAIN: MastSpec = {
  id: 'main',
  z: -1.65,
  lowerTop: 10.95,
  topTop: 17.75,
  truck: 22.65,
  radius: 0.37,
  shroudSpread: 2.55,
};
const MIZZEN: MastSpec = {
  id: 'mizzen',
  z: -7.8,
  lowerTop: 8.9,
  topTop: 14.2,
  truck: 18.55,
  radius: 0.27,
  shroudSpread: 1.75,
};
const MASTS: readonly MastSpec[] = [FORE, MAIN, MIZZEN];
const YARD_BRACE = 0.18;

const YARDS: readonly YardSpec[] = [
  { mast: FORE, y: 7.15, span: 5.9, radius: 0.16, canvasRadius: 0.25 },
  { mast: FORE, y: 11.2, span: 4.95, radius: 0.125, canvasRadius: 0.2 },
  { mast: FORE, y: 14.95, span: 3.65, radius: 0.1, canvasRadius: 0.16 },
  { mast: MAIN, y: 7.35, span: 6.55, radius: 0.17, canvasRadius: 0.28 },
  { mast: MAIN, y: 12.05, span: 5.45, radius: 0.135, canvasRadius: 0.22 },
  { mast: MAIN, y: 16.15, span: 3.95, radius: 0.105, canvasRadius: 0.17 },
  { mast: MIZZEN, y: 9.45, span: 3.95, radius: 0.12, canvasRadius: 0.19 },
  { mast: MIZZEN, y: 12.95, span: 2.95, radius: 0.092, canvasRadius: 0.15 },
];

const MIZZEN_STAY_AFT: P3 = { x: 0, y: MIZZEN.lowerTop + 0.05, z: MIZZEN.z };
const MIZZEN_STAY_FORE: P3 = { x: 0, y: MAIN.lowerTop + 0.05, z: MAIN.z };

/** The point on the lower mizzen stay (mizzen top to main top) at local `z`, for things hung from it. */
export function mizzenStayPoint(z: number): P3 {
  const t = (z - MIZZEN_STAY_AFT.z) / (MIZZEN_STAY_FORE.z - MIZZEN_STAY_AFT.z);
  return lerpPoint(MIZZEN_STAY_AFT, MIZZEN_STAY_FORE, Math.min(1, Math.max(0, t)));
}

function yardPoint(yard: YardSpec, x: number, y = yard.y): P3 {
  return { x, y, z: yard.mast.z + x * YARD_BRACE };
}

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

  private addPanelIndices(base: number, cols: number, rows: number): void {
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const i = base + y * (cols + 1) + x;
        this.indices.push(i, i + 1, i + cols + 2, i, i + cols + 2, i + cols + 1);
      }
    }
  }

  private addPanel(
    p00: P3,
    p10: P3,
    p01: P3,
    p11: P3,
    normal: P3,
    cols: number,
    rows: number,
    curve?: CurvedQuadOptions,
  ): void {
    const base = this.positions.length / 3;
    for (let y = 0; y <= rows; y++) {
      const v = y / rows;
      for (let x = 0; x <= cols; x++) {
        const u = x / cols;
        const lower = lerpPoint(p00, p10, u);
        const upper = lerpPoint(p01, p11, u);
        const p = lerpPoint(lower, upper, v);
        if (curve) {
          const center = lerpPoint(lerpPoint(p00, p10, 0.5), lerpPoint(p01, p11, 0.5), v);
          const edge = Math.pow(Math.abs(u - 0.5) * 2, 1.7) * Math.sin(Math.PI * v);
          const roach = Math.sin(Math.PI * u) * Math.pow(1 - v, 1.9) * curve.footRoach;
          p.x += (center.x - p.x) * edge * curve.leechInset;
          p.y -= roach;
        }
        const anchor = lerpPoint(p01, p11, u);
        this.addVertex(p, anchor, normal, u, v);
      }
    }
    this.addPanelIndices(base, cols, rows);
  }

  addQuad(p00: P3, p10: P3, p01: P3, p11: P3, normal: P3, cols: number, rows: number): void {
    this.addPanel(p00, p10, p01, p11, normal, cols, rows);
  }

  addCurvedQuad(
    p00: P3,
    p10: P3,
    p01: P3,
    p11: P3,
    normal: P3,
    cols: number,
    rows: number,
    leechInset: number,
    footRoach: number,
  ): void {
    this.addPanel(p00, p10, p01, p11, normal, cols, rows, { leechInset, footRoach });
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

function addFightingTop(
  builder: MeshBuilder,
  mast: MastSpec,
  y: number,
  radius: number,
  segments: number,
): void {
  builder.setRegion(1);
  builder.setColor(0x55311e);
  builder.addDisc({ x: 0, y, z: mast.z }, { x: 0, y: 1, z: 0 }, radius, segments);
  builder.addCylinderBetween(
    { x: -radius * 0.78, y: y + 0.08, z: mast.z - radius * 0.36 },
    { x: radius * 0.78, y: y + 0.08, z: mast.z - radius * 0.36 },
    0.035,
    segments,
  );
  builder.addCylinderBetween(
    { x: -radius * 0.78, y: y + 0.08, z: mast.z + radius * 0.36 },
    { x: radius * 0.78, y: y + 0.08, z: mast.z + radius * 0.36 },
    0.035,
    segments,
  );
  builder.setRegion(4);
  builder.setColor(0x201a14);
  const rail: P3[] = [];
  const count = Math.max(8, segments);
  for (let i = 0; i <= count; i++) {
    const a = (i / count) * Math.PI * 2;
    rail.push({ x: Math.cos(a) * radius * 0.98, y: y + 0.42, z: mast.z + Math.sin(a) * radius * 0.72 });
  }
  builder.addRail(rail, 0.026, 6);
  for (let i = 0; i < count; i += 2) {
    const a = (i / count) * Math.PI * 2;
    const p = { x: Math.cos(a) * radius * 0.96, y: y + 0.04, z: mast.z + Math.sin(a) * radius * 0.7 };
    builder.addCylinderBetween(p, { x: p.x, y: y + 0.43, z: p.z }, 0.014, 5);
  }
}

function addCrosstrees(
  builder: MeshBuilder,
  mast: MastSpec,
  y: number,
  span: number,
  segments: number,
): void {
  builder.setRegion(1);
  builder.setColor(0x4a2a1b);
  builder.addCylinderBetween({ x: -span, y, z: mast.z }, { x: span, y, z: mast.z }, 0.052, segments);
  builder.addCylinderBetween({ x: 0, y, z: mast.z - 0.5 }, { x: 0, y, z: mast.z + 0.5 }, 0.04, segments);
}

function addYard(builder: MeshBuilder, yard: YardSpec, segments: number): void {
  builder.setRegion(1);
  builder.setColor(0x4b2b1b);
  builder.addCylinderBetween(yardPoint(yard, -yard.span), yardPoint(yard, yard.span), yard.radius, segments, {
    endRadius: yard.radius * 0.62,
  });
  builder.setRegion(4);
  builder.setColor(0x1d1610);
  for (const side of [-1, 1] as const) {
    builder.addCylinderBetween(
      yardPoint(yard, side * yard.span * 0.88, yard.y - 0.23),
      yardPoint(yard, side * yard.span),
      0.018,
      5,
    );
  }
}

export function createSparGeometry(tier: Tier): BufferGeometry {
  const detail = detailForTier(tier);
  const b = new MeshBuilder();
  const seg = detail.cyl;
  for (const mast of MASTS) {
    const base = deckHeightAt(mast.z);
    b.setRegion(1);
    b.setColor(0x4b2b1b);
    b.addCylinderBetween(
      { x: 0, y: base - 0.86, z: mast.z },
      { x: 0, y: mast.lowerTop + 0.18, z: mast.z },
      mast.radius,
      seg,
      { endRadius: mast.radius * 0.76 },
    );
    b.addCylinderBetween(
      { x: 0, y: mast.lowerTop - 0.38, z: mast.z },
      { x: 0, y: mast.topTop + 0.22, z: mast.z },
      mast.radius * 0.62,
      seg,
      { endRadius: mast.radius * 0.45 },
    );
    b.addCylinderBetween(
      { x: 0, y: mast.topTop - 0.18, z: mast.z },
      { x: 0, y: mast.truck, z: mast.z },
      mast.radius * 0.42,
      seg,
      { endRadius: mast.radius * 0.28 },
    );
    b.setRegion(4);
    b.setColor(0x17110d);
    for (const y of [base + 1.2, mast.lowerTop - 0.55, mast.lowerTop + 1.05, mast.topTop - 0.45]) {
      b.addCylinderBetween(
        { x: 0, y: y - 0.045, z: mast.z },
        { x: 0, y: y + 0.045, z: mast.z },
        mast.radius * 1.04,
        seg,
      );
    }
    b.setRegion(4);
    b.setColor(0x1b1510);
    b.addCylinderBetween(
      { x: 0, y: mast.truck - 0.08, z: mast.z },
      { x: 0, y: mast.truck + 0.38, z: mast.z },
      0.04,
      seg,
    );
    addFightingTop(b, mast, mast.lowerTop, mast.id === 'main' ? 1.35 : mast.id === 'fore' ? 1.2 : 1.0, seg);
    addCrosstrees(b, mast, mast.topTop, mast.id === 'main' ? 1.0 : 0.82, seg);
  }
  for (const yard of YARDS) addYard(b, yard, seg);

  b.setRegion(1);
  b.setColor(0x4b2b1b);
  b.addCylinderBetween({ x: 0, y: 2.35, z: 10.72 }, { x: 0, y: 3.05, z: 18.75 }, 0.2, seg, {
    endRadius: 0.12,
  });
  b.addCylinderBetween({ x: 0, y: 2.92, z: 17.85 }, { x: 0, y: 3.04, z: 22.45 }, 0.11, seg, {
    endRadius: 0.06,
  });
  b.addCylinderBetween({ x: 0, y: 3.24, z: MIZZEN.z - 0.12 }, { x: 0, y: 3.04, z: -11.55 }, 0.13, seg, {
    endRadius: 0.085,
  });
  b.addCylinderBetween({ x: 0, y: 8.1, z: MIZZEN.z - 0.06 }, { x: 0, y: 9.8, z: -10.85 }, 0.095, seg, {
    endRadius: 0.06,
  });

  b.setRegion(4);
  b.setColor(0x1b1510);
  for (const z of [-8.7, -4.8, -0.9, 3.3, 7.4]) {
    b.addCylinderBetween(
      { x: -waterlineHalfBeamAt(z) * 0.82, y: deckHeightAt(z) + 0.2, z },
      { x: waterlineHalfBeamAt(z) * 0.82, y: deckHeightAt(z) + 0.2, z },
      0.045,
      seg,
    );
  }
  return b.build();
}

export function createBundledCanvasGeometry(tier: Tier): BufferGeometry {
  const detail = detailForTier(tier);
  const b = new MeshBuilder();
  b.setRegion(5);
  b.setColor(0xe8d8b5);
  for (const yard of YARDS) {
    b.addCylinderBetween(
      {
        ...yardPoint(yard, -yard.span * 0.87, yard.y - 0.18),
        z: yardPoint(yard, -yard.span * 0.87).z - 0.045,
      },
      { ...yardPoint(yard, yard.span * 0.87, yard.y - 0.18), z: yardPoint(yard, yard.span * 0.87).z - 0.045 },
      yard.canvasRadius,
      detail.cyl,
      { endRadius: yard.canvasRadius * 0.72 },
    );
  }
  b.addCylinderBetween({ x: 0, y: 3.14, z: -11.25 }, { x: 0, y: 3.25, z: -8.05 }, 0.16, detail.cyl);
  b.addCylinderBetween({ x: 0, y: 8.9, z: -10.45 }, { x: 0, y: 8.18, z: -8.0 }, 0.12, detail.cyl);
  b.addCylinderBetween({ x: 0, y: 2.94, z: 13.2 }, { x: 0, y: 7.2, z: FORE.z }, 0.082, detail.cyl);
  b.addCylinderBetween({ x: 0, y: 3.0, z: 17.4 }, { x: 0, y: 9.6, z: FORE.z }, 0.074, detail.cyl);
  b.addCylinderBetween({ x: 0, y: 3.02, z: 21.5 }, { x: 0, y: 11.2, z: FORE.z }, 0.065, detail.cyl);
  return b.build();
}

function addSquareSail(
  s: SailBuilder,
  z: number,
  y0: number,
  y1: number,
  halfFoot: number,
  halfHead: number,
  normal: P3,
  detail: number,
): void {
  s.addCurvedQuad(
    { x: -halfFoot, y: y0, z: z - halfFoot * YARD_BRACE },
    { x: halfFoot, y: y0, z: z + halfFoot * YARD_BRACE },
    { x: -halfHead, y: y1, z: z - halfHead * YARD_BRACE },
    { x: halfHead, y: y1, z: z + halfHead * YARD_BRACE },
    normal,
    detail,
    detail,
    0.16,
    Math.min(0.42, (y1 - y0) * 0.08),
  );
}

export function createSailGeometry(tier: Tier): BufferGeometry {
  const s = new SailBuilder();
  const detail = detailForTier(tier).sail;
  addSquareSail(s, FORE.z, 3.65, 6.95, 5.45, 5.85, { x: 0, y: 0, z: -1 }, detail);
  addSquareSail(s, FORE.z, 7.75, 11.0, 4.45, 4.85, { x: 0, y: 0, z: -1 }, detail);
  addSquareSail(s, FORE.z, 11.95, 14.75, 3.15, 3.5, { x: 0, y: 0, z: -1 }, detail);
  addSquareSail(s, MAIN.z, 3.75, 7.15, 6.1, 6.45, { x: 0, y: 0, z: -1 }, detail);
  addSquareSail(s, MAIN.z, 8.45, 11.8, 5.05, 5.4, { x: 0, y: 0, z: -1 }, detail);
  addSquareSail(s, MAIN.z, 13.05, 15.95, 3.55, 3.9, { x: 0, y: 0, z: -1 }, detail);
  addSquareSail(s, MIZZEN.z, 6.25, 9.25, 3.45, 3.85, { x: 0, y: 0, z: -1 }, detail);
  addSquareSail(s, MIZZEN.z, 10.0, 12.78, 2.55, 2.9, { x: 0, y: 0, z: -1 }, detail);

  s.addQuad(
    { x: 0, y: 3.05, z: -11.35 },
    { x: 0, y: 3.3, z: MIZZEN.z - 0.08 },
    { x: 0, y: 9.05, z: -10.65 },
    { x: 0, y: 8.05, z: MIZZEN.z - 0.08 },
    { x: 1, y: 0, z: 0 },
    detail,
    detail,
  );
  s.addTriangle(
    { x: 0, y: 2.92, z: 12.2 },
    { x: 0, y: 2.9, z: 7.2 },
    { x: 0, y: 8.15, z: FORE.z },
    { x: -1, y: 0, z: 0 },
    detail,
  );
  s.addTriangle(
    { x: 0, y: 2.98, z: 17.2 },
    { x: 0, y: 2.86, z: 10.65 },
    { x: 0, y: 10.25, z: FORE.z },
    { x: -1, y: 0, z: 0 },
    detail,
  );
  s.addTriangle(
    { x: 0, y: 3.03, z: 22.08 },
    { x: 0, y: 2.94, z: 15.35 },
    { x: 0, y: 11.95, z: FORE.z },
    { x: -1, y: 0, z: 0 },
    detail,
  );
  if (tier !== 'lite') {
    s.addTriangle(
      { x: 0, y: 4.35, z: MAIN.z + 0.45 },
      { x: 0, y: 3.85, z: FORE.z - 0.15 },
      { x: 0, y: 10.7, z: FORE.z - 0.15 },
      { x: -1, y: 0, z: 0 },
      Math.max(6, detail - 3),
    );
  }
  return s.build();
}

function lineAt(a: P3, b: P3, y: number): P3 {
  const t = (y - a.y) / Math.max(0.001, b.y - a.y);
  return lerpPoint(a, b, t);
}

function addShrouds(
  positions: number[],
  mast: MastSpec,
  side: -1 | 1,
  count: number,
  ratlineStep: number,
): void {
  const line = (a: P3, b: P3) => positions.push(a.x, a.y, a.z, b.x, b.y, b.z);
  const shrouds: Array<{ base: P3; top: P3 }> = [];
  for (let i = 0; i < count; i++) {
    const f = count === 1 ? 0.5 : i / (count - 1);
    const z = mast.z - mast.shroudSpread + mast.shroudSpread * 2 * f;
    const y = deckHeightAt(z) + 0.18;
    const base = { x: side * (halfBeamAt(z, y) + 0.34), y, z };
    const top = { x: side * 0.08, y: mast.lowerTop + 0.32, z: mast.z };
    shrouds.push({ base, top });
    line(base, top);
  }
  const firstY = Math.max(...shrouds.map((s) => s.base.y)) + 0.55;
  for (let y = firstY; y < mast.lowerTop - 0.58; y += ratlineStep) {
    for (let i = 0; i < shrouds.length - 1; i++)
      line(
        lineAt(shrouds[i]!.base, shrouds[i]!.top, y),
        lineAt(shrouds[i + 1]!.base, shrouds[i + 1]!.top, y),
      );
  }
  for (const z of [-0.32, 0.32]) {
    const topmastBase = { x: side * 0.62, y: mast.lowerTop + 0.2, z: mast.z + z };
    const topmastTop = { x: side * 0.04, y: mast.topTop + 0.15, z: mast.z };
    line(topmastBase, topmastTop);
  }
}

export function createRiggingGeometry(tier: Tier): BufferGeometry {
  const positions: number[] = [];
  const line = (a: P3, b: P3) => positions.push(a.x, a.y, a.z, b.x, b.y, b.z);
  const ratlineStep = tier === 'lite' ? 1.18 : tier === 'low' ? 0.92 : tier === 'medium' ? 0.68 : 0.48;
  const shroudCount = tier === 'lite' ? 3 : tier === 'low' ? 4 : tier === 'medium' ? 5 : 6;

  for (const mast of MASTS) {
    for (const side of [-1, 1] as const)
      addShrouds(
        positions,
        mast,
        side,
        Math.max(3, shroudCount - (mast.id === 'mizzen' ? 1 : 0)),
        ratlineStep,
      );
  }

  const bowBase = { x: 0, y: 2.18, z: 11.2 };
  const bowOuter = { x: 0, y: 3.02, z: 22.35 };
  const bowsprit = { x: 0, y: 3.0, z: 18.6 };
  line({ x: 0, y: FORE.lowerTop + 0.1, z: FORE.z }, bowBase);
  line({ x: 0, y: FORE.topTop, z: FORE.z }, bowsprit);
  line({ x: 0, y: FORE.truck - 0.5, z: FORE.z }, bowOuter);
  line({ x: 0, y: 0.62, z: 13.45 }, bowOuter);
  line({ x: 0, y: 1.15, z: 10.6 }, bowsprit);

  line({ x: 0, y: MAIN.lowerTop + 0.05, z: MAIN.z }, { x: 0, y: FORE.lowerTop + 0.1, z: FORE.z });
  line({ x: 0, y: MAIN.topTop, z: MAIN.z }, { x: 0, y: FORE.topTop - 0.35, z: FORE.z });
  line(MIZZEN_STAY_AFT, MIZZEN_STAY_FORE);
  line({ x: 0, y: MIZZEN.topTop, z: MIZZEN.z }, { x: 0, y: MAIN.topTop - 0.3, z: MAIN.z });

  for (const side of [-1, 1] as const) {
    line(
      { x: side * 2.65, y: deckHeightAt(-10.7) + 0.1, z: -10.7 },
      { x: 0, y: MIZZEN.truck - 0.4, z: MIZZEN.z },
    );
    line({ x: side * 3.0, y: deckHeightAt(-10.4) + 0.1, z: -10.4 }, { x: 0, y: MAIN.truck - 0.4, z: MAIN.z });
    line({ x: side * 3.05, y: deckHeightAt(8.7) + 0.1, z: 8.7 }, { x: 0, y: FORE.truck - 0.4, z: FORE.z });
  }

  for (const yard of YARDS) {
    for (const side of [-1, 1] as const) {
      const end = yardPoint(yard, side * yard.span);
      const center = { x: 0, y: yard.y + 0.4, z: yard.mast.z };
      line(end, center);
      line(end, yardPoint(yard, side * yard.span * 0.45, yard.y - 0.48));
      line(yardPoint(yard, side * yard.span * 0.45, yard.y - 0.48), {
        x: 0,
        y: yard.y - 0.34,
        z: yard.mast.z,
      });
      const braceTarget = yard.mast.id === 'fore' ? MAIN : yard.mast.id === 'main' ? MIZZEN : MAIN;
      line(end, { x: side * 0.28, y: Math.max(4.8, yard.y - 1.25), z: braceTarget.z });
    }
  }

  line({ x: 0, y: 8.05, z: MIZZEN.z }, { x: 0, y: 9.8, z: -10.85 });
  line({ x: 0, y: 3.28, z: MIZZEN.z }, { x: 0, y: 3.05, z: -11.55 });
  for (const side of [-1, 1] as const) {
    line({ x: side * 0.28, y: 8.4, z: MIZZEN.z }, { x: side * 1.25, y: 3.1, z: -11.15 });
    line({ x: side * 1.3, y: 3.25, z: -11.2 }, { x: side * 0.05, y: 9.2, z: -10.5 });
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.computeBoundingSphere();
  return geometry;
}
