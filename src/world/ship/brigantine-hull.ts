import { BufferGeometry } from 'three/webgpu';
import type { Tier } from '../contracts';
import { clamp01, lerp } from '../../util/math';
import {
  BRIGANTINE_HALF_LENGTH,
  BRIGANTINE_LENGTH,
  deckHeightAt,
  halfBeamAt,
  keelHeightAt,
  sheerHeightAt,
  waterlineHalfBeamAt,
} from './lines';
import { detailForTier, type Detail } from './brigantine-detail';
import { MeshBuilder, type P3 } from './mesh-builder';

/** The quarterdeck platform's centre; its flat top is 0.18 above the deck line here. */
export const QUARTERDECK_Z = -8.0;
/** The ship's wheel stands athwartships on the quarterdeck, its hub this high above the deck line. */
export const WHEEL = { z: -8.95, hub: 0.78 } as const;

/** Builds the brigantine hull, deck, rail, trim, and name-board geometry. */
export function createHullGeometry(tier: Tier): BufferGeometry {
  const d = detailForTier(tier);
  const builder = new MeshBuilder();
  builder.setRegion(0);
  builder.setColor(0x17100c);
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

function addShipBell(builder: MeshBuilder, x: number, z: number, detail: Detail): void {
  const y = deckHeightAt(z);
  builder.setRegion(3);
  builder.setColor(0xd6a64a);
  builder.addCylinderBetween(
    { x: x - 0.34, y: y + 0.92, z },
    { x: x + 0.34, y: y + 0.92, z },
    0.035,
    detail.cyl,
  );
  builder.addCylinderBetween({ x, y: y + 0.58, z }, { x, y: y + 1.08, z }, 0.026, detail.cyl);
  builder.addLathe(
    [
      { center: { x, y: y + 0.54, z }, radius: 0.15 },
      { center: { x, y: y + 0.72, z }, radius: 0.11 },
      { center: { x, y: y + 0.86, z }, radius: 0.055 },
    ],
    { x: 0, y: 1, z: 0 },
    detail.cyl,
  );
  builder.setRegion(4);
  builder.setColor(0x1b1510);
  builder.addCylinderBetween({ x, y: y + 0.52, z }, { x, y: y + 0.46, z }, 0.025, 6);
}

function addGrating(
  builder: MeshBuilder,
  x: number,
  z: number,
  sx: number,
  sz: number,
  detail: Detail,
): void {
  const y = deckHeightAt(z);
  builder.setRegion(4);
  builder.setColor(0x21160d);
  builder.addBox(x, y + 0.11, z, sx, 0.08, sz);
  builder.setRegion(1);
  builder.setColor(0xb57943);
  builder.addBox(x, y + 0.16, z, sx + 0.12, 0.08, 0.08);
  builder.addBox(x, y + 0.16, z, 0.08, 0.08, sz + 0.12);
  const slats = Math.max(3, Math.min(7, Math.round(sz / 0.32)));
  for (let i = 0; i < slats; i++) {
    const f = slats === 1 ? 0.5 : i / (slats - 1);
    builder.addCylinderBetween(
      { x: x - sx * 0.42, y: y + 0.22, z: z - sz * 0.36 + sz * 0.72 * f },
      { x: x + sx * 0.42, y: y + 0.22, z: z - sz * 0.36 + sz * 0.72 * f },
      0.018,
      detail.cyl,
    );
  }
}

function addCoiledLine(builder: MeshBuilder, x: number, z: number, radius: number, detail: Detail): void {
  const y = deckHeightAt(z) + 0.12;
  builder.setRegion(4);
  builder.setColor(0x2b2118);
  const turns = 2.7;
  const steps = Math.max(14, detail.cyl * 2);
  let previous = { x: x + radius, y, z };
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const a = t * Math.PI * 2 * turns;
    const r = radius * (1 - t * 0.68);
    const next = { x: x + Math.cos(a) * r, y: y + t * 0.045, z: z + Math.sin(a) * r };
    builder.addCylinderBetween(previous, next, 0.024, 6);
    previous = next;
  }
}

function addDeckCannon(builder: MeshBuilder, side: -1 | 1, z: number, detail: Detail, rich: boolean): void {
  const y = deckHeightAt(z);
  const x = side * halfBeamAt(z, y) * 0.56;
  builder.setRegion(2);
  builder.setColor(0x842015);
  builder.addBox(x - side * 0.18, y + 0.2, z - 0.22, 0.55, 0.24, 0.1);
  builder.addBox(x - side * 0.18, y + 0.2, z + 0.22, 0.55, 0.24, 0.1);
  builder.addBeamBetween(
    { x: x - side * 0.46, y: y + 0.16, z: z - 0.2 },
    { x: x + side * 0.18, y: y + 0.2, z: z - 0.2 },
    0.08,
    0.13,
  );
  builder.addBeamBetween(
    { x: x - side * 0.46, y: y + 0.16, z: z + 0.2 },
    { x: x + side * 0.18, y: y + 0.2, z: z + 0.2 },
    0.08,
    0.13,
  );
  builder.setRegion(1);
  builder.setColor(0x5f351f);
  for (const axleX of [-0.34, 0.12]) {
    builder.addCylinderBetween(
      { x: x + side * axleX, y: y + 0.08, z: z - 0.3 },
      { x: x + side * axleX, y: y + 0.08, z: z + 0.3 },
      0.032,
      8,
    );
  }
  builder.setRegion(4);
  builder.setColor(0x12100e);
  const wheelSeg = rich ? 12 : 8;
  for (const axleX of [-0.34, 0.12]) {
    for (const dz of [-0.28, 0.28]) {
      builder.addCylinderBetween(
        { x: x + side * axleX, y: y + 0.08, z: z + dz - 0.028 },
        { x: x + side * axleX, y: y + 0.08, z: z + dz + 0.028 },
        0.105,
        wheelSeg,
      );
    }
  }
  builder.addCylinderBetween(
    { x: x - side * 0.56, y: y + 0.35, z },
    { x: x + side * 0.8, y: y + 0.39, z },
    0.105,
    detail.cyl,
    { endRadius: 0.072 },
  );
  for (const ringX of [-0.32, 0.04, 0.42]) {
    builder.addCylinderBetween(
      { x: x + side * (ringX - 0.022), y: y + 0.35, z },
      { x: x + side * (ringX + 0.022), y: y + 0.35, z },
      0.119,
      detail.cyl,
    );
  }
  builder.addCylinderBetween(
    { x: x - side * 0.66, y: y + 0.345, z },
    { x: x - side * 0.82, y: y + 0.34, z },
    0.052,
    detail.cyl,
    { endRadius: 0.03 },
  );
  if (rich) {
    builder.setRegion(4);
    builder.setColor(0x2d2117);
    for (const dz of [-0.27, 0.27]) {
      builder.addCylinderBetween(
        { x: side * (halfBeamAt(z, y) * 0.75), y: y + 0.34, z: z + dz },
        { x: x - side * 0.78, y: y + 0.33, z },
        0.017,
        6,
      );
    }
  }
}

function addBarrel(builder: MeshBuilder, x: number, z: number, detail: Detail): void {
  const y = deckHeightAt(z);
  builder.setRegion(1);
  builder.setColor(0x7b4a27);
  builder.addLathe(
    [
      { center: { x, y: y + 0.03, z }, radius: 0.18 },
      { center: { x, y: y + 0.22, z }, radius: 0.24 },
      { center: { x, y: y + 0.46, z }, radius: 0.2 },
    ],
    { x: 0, y: 1, z: 0 },
    detail.cyl,
  );
  builder.setRegion(4);
  builder.setColor(0x1f1b17);
  builder.addCylinderBetween({ x, y: y + 0.2, z: z - 0.25 }, { x, y: y + 0.2, z: z + 0.25 }, 0.012, 6);
  builder.addCylinderBetween({ x, y: y + 0.38, z: z - 0.22 }, { x, y: y + 0.38, z: z + 0.22 }, 0.012, 6);
}

function addLadder(builder: MeshBuilder, side: -1 | 1, z0: number, z1: number): void {
  const low = deckHeightAt(z0) + 0.08;
  const high = deckHeightAt(z1) + 0.08;
  const x = side * 1.35;
  builder.setRegion(1);
  builder.setColor(0x7b4a27);
  for (const dx of [-0.18, 0.18])
    builder.addCylinderBetween({ x: x + dx, y: low, z: z0 }, { x: x + dx, y: high, z: z1 }, 0.022, 6);
  for (let i = 0; i <= 5; i++) {
    const t = i / 5;
    const z = lerp(z0, z1, t);
    const y = lerp(low, high, t);
    builder.addCylinderBetween({ x: x - 0.25, y, z }, { x: x + 0.25, y, z }, 0.018, 6);
  }
}

function addSternCounter(builder: MeshBuilder, detail: Detail): void {
  builder.setRegion(0);
  builder.setColor(0x17100c);
  const rings = [
    { y: -0.75, z: -11.58, half: 0.26 },
    { y: -0.18, z: -12.12, half: 0.62 },
    { y: 0.56, z: -12.42, half: 1.28 },
    { y: 1.26, z: -12.42, half: 2.1 },
    { y: 2.08, z: -12.2, half: 2.62 },
    { y: 2.86, z: -12.05, half: 2.34 },
  ];
  for (let i = 0; i < rings.length - 1; i++) {
    const a = rings[i]!;
    const b = rings[i + 1]!;
    builder.addQuad(
      { x: -a.half, y: a.y, z: a.z },
      { x: a.half, y: a.y, z: a.z },
      { x: b.half, y: b.y, z: b.z },
      { x: -b.half, y: b.y, z: b.z },
    );
  }
  builder.setRegion(3);
  builder.setColor(0xd2a352);
  for (const ring of [rings[2]!, rings[3]!, rings[4]!]) {
    builder.addCylinderBetween(
      { x: -ring.half, y: ring.y + 0.02, z: ring.z - 0.015 },
      { x: ring.half, y: ring.y + 0.02, z: ring.z - 0.015 },
      0.036,
      detail.cyl,
    );
  }
  builder.setRegion(4);
  builder.setColor(0x17110c);
  builder.addBox(0, 0.0, -12.56, 0.48, 1.95, 0.16);
  builder.setRegion(1);
  builder.setColor(0x4a2a1a);
  builder.addBox(0, -0.18, -12.68, 0.34, 1.72, 0.12);
  builder.setRegion(3);
  builder.setColor(0xd2a352);
  builder.addCylinderBetween({ x: -0.26, y: 1.1, z: -12.6 }, { x: 0.26, y: 1.1, z: -12.6 }, 0.03, detail.cyl);
}

function addHeadRails(builder: MeshBuilder, detail: Detail): void {
  builder.setRegion(3);
  builder.setColor(0xd2a352);
  for (const side of [-1, 1] as const) {
    const railA: P3[] = [];
    const railB: P3[] = [];
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      const z = lerp(9.4, 12.72, t);
      const yA = lerp(2.58, 1.28, t) + Math.sin(t * Math.PI) * 0.22;
      const yB = yA - 0.38;
      const x = side * lerp(halfBeamAt(9.4, 2.55) + 0.2, 0.55, t);
      railA.push({ x, y: yA, z });
      railB.push({ x: x * 0.86, y: yB, z: z - 0.06 });
    }
    builder.addRail(railA, 0.026, detail.cyl);
    builder.addRail(railB, 0.021, detail.cyl);
    for (const i of [2, 5, 8]) {
      builder.addCylinderBetween(railA[i]!, railB[i]!, 0.018, 6);
    }
  }
  builder.setRegion(1);
  builder.setColor(0x55341f);
  builder.addCylinderBetween({ x: 0, y: 0.78, z: 11.25 }, { x: 0, y: 2.32, z: 13.42 }, 0.11, detail.cyl, {
    endRadius: 0.08,
  });
  builder.setRegion(3);
  builder.setColor(0xc99732);
  builder.addTriangle({ x: 0, y: 1.02, z: 11.45 }, { x: 0, y: 2.08, z: 12.9 }, { x: 0, y: 0.88, z: 13.28 });
}

function addGunport(builder: MeshBuilder, side: -1 | 1, z: number, detail: Detail, rich: boolean): void {
  const x = side * (waterlineHalfBeamAt(z) + 0.12);
  const seg = rich ? detail.cyl : Math.min(8, detail.cyl);
  builder.setRegion(2);
  builder.setColor(0x8f2016);
  builder.addBox(x - side * 0.035, 1.55, z, 0.09, 0.72, 0.96);
  builder.setRegion(4);
  builder.setColor(0x080706);
  builder.addBox(x, 1.52, z, 0.14, 0.5, 0.72);
  builder.addCylinderBetween(
    { x: x - side * 0.16, y: 1.5, z },
    { x: x + side * 0.48, y: 1.5, z },
    0.083,
    seg,
    { endRadius: 0.067 },
  );
  if (rich) {
    for (const ringX of [-0.02, 0.22]) {
      builder.addCylinderBetween(
        { x: x + side * ringX, y: 1.5, z },
        { x: x + side * (ringX + 0.03), y: 1.5, z },
        0.092,
        seg,
      );
    }
    builder.addCylinderBetween(
      { x: x - side * 0.22, y: 1.5, z },
      { x: x - side * 0.34, y: 1.5, z },
      0.035,
      seg,
      { endRadius: 0.022 },
    );
  }
  builder.setRegion(3);
  builder.setColor(0xd2a352);
  builder.addBox(x + side * 0.006, 1.9, z, 0.065, 0.06, 1.04);
  if (rich) builder.addBox(x + side * 0.006, 1.18, z, 0.055, 0.055, 0.86);
}

function addBowFittings(builder: MeshBuilder, detail: Detail): void {
  builder.setRegion(0);
  builder.setColor(0x101416);
  for (const side of [-1, 1] as const) {
    builder.addQuad(
      { x: side * 0.72, y: 0.22, z: 10.9 },
      { x: side * 0.18, y: 0.66, z: 12.85 },
      { x: side * 0.26, y: 2.42, z: 12.7 },
      { x: side * 1.05, y: 2.62, z: 10.55 },
    );
    builder.addQuad(
      { x: side * 0.18, y: 0.66, z: 12.85 },
      { x: side * 0.02, y: 0.82, z: 13.44 },
      { x: side * 0.08, y: 2.25, z: 13.26 },
      { x: side * 0.26, y: 2.42, z: 12.7 },
    );
  }
  builder.setRegion(4);
  builder.setColor(0x15110d);
  builder.addCylinderBetween({ x: 0, y: -0.72, z: 11.0 }, { x: 0, y: 2.5, z: 13.38 }, 0.13, detail.cyl, {
    endRadius: 0.065,
  });
  builder.setRegion(3);
  builder.setColor(0xd2a352);
  builder.addCylinderBetween(
    { x: -0.12, y: 2.36, z: 12.85 },
    { x: 0.12, y: 2.36, z: 12.85 },
    0.032,
    detail.cyl,
  );

  builder.setRegion(1);
  builder.setColor(0x4b2b1b);
  for (const side of [-1, 1] as const) {
    const x = side * 0.42;
    builder.addCylinderBetween({ x, y: 1.75, z: 10.9 }, { x, y: 3.08, z: 11.55 }, 0.095, detail.cyl, {
      endRadius: 0.075,
    });
    builder.addBox(side * 0.72, 2.2, 10.45, 0.14, 0.95, 0.22);
  }
  builder.setRegion(4);
  builder.setColor(0x17110c);
  for (const z of [11.15, 11.38, 11.62]) {
    builder.addCylinderBetween({ x: -0.34, y: 2.22, z }, { x: 0.34, y: 2.22, z }, 0.034, detail.cyl);
    builder.addCylinderBetween({ x: -0.24, y: 1.82, z }, { x: 0.24, y: 2.64, z }, 0.026, 6);
    builder.addCylinderBetween({ x: 0.24, y: 1.82, z }, { x: -0.24, y: 2.64, z }, 0.026, 6);
  }
  builder.setRegion(3);
  builder.setColor(0xd2a352);
  for (const side of [-1, 1] as const) {
    builder.addRail(
      [
        { x: side * 0.66, y: 2.35, z: 10.55 },
        { x: side * 0.55, y: 2.12, z: 11.35 },
        { x: side * 0.32, y: 1.72, z: 12.3 },
      ],
      0.028,
      detail.cyl,
    );
    builder.addCylinderBetween(
      { x: side * 0.58, y: 2.22, z: 10.85 },
      { x: side * 0.38, y: 1.62, z: 12.12 },
      0.022,
      6,
    );
  }
}

export function createDeckGeometry(tier: Tier): BufferGeometry {
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
  builder.addBox(0, deckHeightAt(QUARTERDECK_Z) + 0.09, QUARTERDECK_Z, 4.3, 0.18, 5.8);
  builder.addBox(0, deckHeightAt(8.7) + 0.08, 8.7, 3.5, 0.16, 3.7);
  builder.addBox(0, deckHeightAt(-2.45) + 0.16, -2.45, 1.45, 0.22, 2.05);
  builder.addBox(0, deckHeightAt(3.15) + 0.16, 3.15, 1.25, 0.22, 1.65);
  builder.addBox(0, deckHeightAt(-7.25) + 0.18, -7.25, 1.55, 0.24, 1.12);
  addGrating(builder, 0, -2.45, 1.14, 1.58, detail);
  addGrating(builder, 0, 3.15, 0.95, 1.24, detail);
  for (const z of [-1.8, 2.8, 6.5]) {
    for (const x of [-0.35, 0.35]) builder.addBox(x, deckHeightAt(z) + 0.12, z, 0.18, 0.12, 1.05);
  }
  builder.addCylinderBetween(
    { x: 0, y: deckHeightAt(-0.15), z: -0.15 },
    { x: 0, y: deckHeightAt(-0.15) + 0.85, z: -0.15 },
    0.26,
    detail.cyl,
  );
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    builder.addCylinderBetween(
      { x: Math.cos(a) * 0.22, y: deckHeightAt(-0.15) + 0.78, z: -0.15 + Math.sin(a) * 0.22 },
      { x: Math.cos(a) * 0.82, y: deckHeightAt(-0.15) + 0.78, z: -0.15 + Math.sin(a) * 0.82 },
      0.022,
      6,
    );
  }
  const wheelHub = deckHeightAt(WHEEL.z) + WHEEL.hub;
  builder.addCylinderBetween(
    { x: -0.95, y: wheelHub, z: WHEEL.z },
    { x: 0.95, y: wheelHub, z: WHEEL.z },
    0.055,
    detail.cyl,
  );
  builder.addCylinderBetween(
    { x: 0, y: wheelHub - 0.53, z: WHEEL.z },
    { x: 0, y: wheelHub + 0.5, z: WHEEL.z },
    0.05,
    detail.cyl,
  );
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    builder.addCylinderBetween(
      { x: Math.cos(a) * 0.15, y: wheelHub + Math.sin(a) * 0.15, z: WHEEL.z },
      { x: Math.cos(a) * 0.65, y: wheelHub + Math.sin(a) * 0.65, z: WHEEL.z },
      0.018,
      5,
    );
  }
  builder.setRegion(3);
  builder.setColor(0xd2a352);
  builder.addBox(0, deckHeightAt(-8.15) + 0.36, -8.15, 0.46, 0.62, 0.38);
  builder.setRegion(4);
  builder.setColor(0x181410);
  builder.addBox(0, deckHeightAt(-8.15) + 0.72, -8.15, 0.35, 0.12, 0.28);
  builder.addCylinderBetween(
    { x: -0.32, y: deckHeightAt(0.8) + 0.06, z: 0.8 },
    { x: 0.32, y: deckHeightAt(0.8) + 0.06, z: 0.8 },
    0.11,
    detail.cyl,
  );
  builder.setRegion(1);
  builder.setColor(0x7b4a27);
  for (const z of [-4.9, -2.65, 1.65, 4.15]) {
    builder.addBox(-1.0, deckHeightAt(z) + 0.13, z, 0.48, 0.26, 0.56);
    builder.addBox(1.0, deckHeightAt(z + 0.18) + 0.16, z + 0.18, 0.6, 0.32, 0.46);
  }
  for (const [x, z] of [
    [-1.32, -5.9],
    [1.42, -6.15],
    [-1.1, 2.05],
    [1.08, 3.85],
  ] as const)
    addBarrel(builder, x, z, detail);
  if (tier !== 'lite') {
    for (const [x, z] of [
      [-1.55, -1.1],
      [1.5, -0.45],
      [-1.42, 5.75],
    ] as const)
      addCoiledLine(builder, x, z, 0.26, detail);
  }
  if (tier !== 'lite') {
    const cannonZ = tier === 'low' ? [-5.8, -1.3, 3.25] : [-5.8, -3.55, -1.3, 1.0, 3.25, 5.55];
    for (const z of cannonZ) {
      addDeckCannon(builder, -1, z, detail, tier !== 'low');
      addDeckCannon(builder, 1, z, detail, tier !== 'low');
    }
    addLadder(builder, -1, -5.2, -7.35);
    addLadder(builder, 1, 6.9, 8.45);
  }
  addShipBell(builder, 0, 7.85, detail);
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

export function createTrimGeometry(tier: Tier): BufferGeometry {
  const detail = detailForTier(tier);
  const builder = new MeshBuilder();
  builder.setRegion(2);
  builder.setColor(0x8f2016);
  const steps = tier === 'lite' || tier === 'low' ? 56 : 116;
  const stripeZ0 = -10.45;
  const stripeZ1 = 9.35;
  for (let i = 0; i < steps; i++) {
    const z0 = stripeZ0 + ((stripeZ1 - stripeZ0) * i) / steps;
    const z1 = stripeZ0 + ((stripeZ1 - stripeZ0) * (i + 1)) / steps;
    for (const side of [-1, 1] as const) {
      const x0 = side * (waterlineHalfBeamAt(z0) + 0.055);
      const x1 = side * (waterlineHalfBeamAt(z1) + 0.055);
      // Painted strake, ochre wale, black boot-top, and a dark lower fairing at the waterline.
      builder.setRegion(2);
      builder.setColor(0x8f2016);
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
      builder.setRegion(4);
      builder.setColor(0x11100f);
      builder.addQuad(
        { x: x0, y: -0.58, z: z0 },
        { x: x1, y: -0.58, z: z1 },
        { x: x1, y: -0.24, z: z1 },
        { x: x0, y: -0.24, z: z0 },
      );
      builder.setRegion(2);
      builder.setColor(0x8f2016);
      builder.addQuad(
        { x: x0, y: -0.2, z: z0 },
        { x: x1, y: -0.2, z: z1 },
        { x: x1, y: 0.04, z: z1 },
        { x: x0, y: 0.04, z: z0 },
      );
    }
  }
  const portZ = [-8.1, -6.0, -3.9, -1.8, 0.4, 2.6, 4.8, 6.9];
  for (const z of portZ) {
    for (const side of [-1, 1] as const) {
      addGunport(builder, side, z, detail, tier !== 'lite' && tier !== 'low');
    }
  }
  // Stern gallery, quarter galleries, transom frame, rudder, catheads, anchors, channels, chainplates, deadeyes.
  addSternCounter(builder, detail);
  builder.setRegion(0);
  builder.setColor(0x17100c);
  builder.addBox(0, 2.1, -12.22, 4.9, 1.15, 0.22);
  builder.addBox(0, 2.85, -12.28, 4.45, 0.92, 0.2);
  builder.addBox(-2.75, 2.0, -11.55, 0.55, 1.0, 1.2);
  builder.addBox(2.75, 2.0, -11.55, 0.55, 1.0, 1.2);
  for (const side of [-1, 1] as const) {
    const xHullLow = side * (halfBeamAt(-10.65, 1.55) + 0.04);
    const xHullHigh = side * (halfBeamAt(-10.85, 2.55) + 0.02);
    const xGallery = side * 2.98;
    builder.addQuad(
      { x: xHullLow, y: 1.5, z: -10.65 },
      { x: xGallery, y: 1.62, z: -11.05 },
      { x: xGallery, y: 2.55, z: -11.05 },
      { x: xHullHigh, y: 2.48, z: -10.85 },
    );
    builder.addQuad(
      { x: xGallery, y: 1.62, z: -11.05 },
      { x: side * 2.68, y: 1.48, z: -12.1 },
      { x: side * 2.68, y: 2.68, z: -12.1 },
      { x: xGallery, y: 2.55, z: -11.05 },
    );
    builder.setRegion(3);
    builder.setColor(0xd2a352);
    builder.addCylinderBetween(
      { x: xHullLow, y: 1.55, z: -10.65 },
      { x: xGallery, y: 1.68, z: -11.05 },
      0.032,
      detail.cyl,
    );
    builder.addCylinderBetween(
      { x: xHullHigh, y: 2.5, z: -10.85 },
      { x: xGallery, y: 2.58, z: -11.05 },
      0.032,
      detail.cyl,
    );
    builder.setRegion(0);
    builder.setColor(0x17100c);
  }
  builder.setRegion(2);
  builder.setColor(0x8f2016);
  builder.addBox(0, 1.58, -12.36, 4.65, 0.18, 0.08);
  builder.addBox(0, 2.48, -12.37, 4.35, 0.16, 0.08);
  builder.setRegion(4);
  builder.setColor(0x17110c);
  builder.addBox(0, 0.05, -12.43, 0.44, 2.25, 0.18);
  const foreDeadeyes = [1.1, 2.8, 4.5, 6.2, 7.9];
  const mainDeadeyes = [-8.4, -6.8, -5.2, -3.6, -2.0];
  const mizzenDeadeyes = [-9.4, -8.4, -7.4, -6.4];
  const addChannel = (side: -1 | 1, z0: number, z1: number) => {
    builder.setRegion(1);
    builder.setColor(0x9b6536);
    const yTop = 1.98;
    const yBot = 1.84;
    const yOut = 1.93;
    const n = 12;
    for (let i = 0; i < n; i++) {
      const a = lerp(z0, z1, i / n);
      const b = lerp(z0, z1, (i + 1) / n);
      const xa = side * (halfBeamAt(a, yOut) + 0.06);
      const xb = side * (halfBeamAt(b, yOut) + 0.06);
      const xai = side * (halfBeamAt(a, yOut) + 0.02);
      const xbi = side * (halfBeamAt(b, yOut) + 0.02);
      const xao = side * (halfBeamAt(a, yOut) + 0.24);
      const xbo = side * (halfBeamAt(b, yOut) + 0.24);
      builder.addQuad(
        { x: xa, y: yBot, z: a },
        { x: xb, y: yBot, z: b },
        { x: xb, y: yTop, z: b },
        { x: xa, y: yTop, z: a },
      );
      builder.addQuad(
        { x: xai, y: yTop, z: a },
        { x: xbi, y: yTop, z: b },
        { x: xbo, y: yTop, z: b },
        { x: xao, y: yTop, z: a },
      );
    }
  };
  const addDeadeye = (side: -1 | 1, z: number) => {
    builder.setRegion(4);
    builder.setColor(0x1f1d1b);
    const y = 1.94;
    const x = side * (halfBeamAt(z, y) + 0.18);
    builder.addCylinderBetween({ x: x - side * 0.04, y, z }, { x: x + side * 0.08, y, z }, 0.095, 10);
    const yTop = 1.84;
    const yBot = 1.22;
    const xTop = side * (halfBeamAt(z, yTop) + 0.05);
    const xBot = side * (halfBeamAt(z, yBot) + 0.05);
    builder.addQuad(
      { x: xBot, y: yBot, z: z - 0.035 },
      { x: xBot, y: yBot, z: z + 0.035 },
      { x: xTop, y: yTop, z: z + 0.035 },
      { x: xTop, y: yTop, z: z - 0.035 },
    );
  };
  const addAnchor = (side: -1 | 1, catEnd: P3) => {
    builder.setRegion(4);
    builder.setColor(0x2a2826);
    const top = { x: side * (halfBeamAt(8.42, 2.06) + 0.13), y: 2.06, z: 8.42 };
    const crown = { x: side * (halfBeamAt(7.85, 1.3) + 0.12), y: 1.3, z: 7.85 };
    builder.addCylinderBetween(catEnd, top, 0.018, 6);
    builder.addCylinderBetween(top, crown, 0.032, 8);
    builder.addCylinderBetween(
      { x: top.x, y: top.y + 0.12, z: top.z - 0.28 },
      { x: top.x, y: top.y + 0.12, z: top.z + 0.28 },
      0.025,
      8,
    );
    const palmA = { x: side * (halfBeamAt(7.58, 1.46) + 0.11), y: 1.46, z: 7.58 };
    const palmB = { x: side * (halfBeamAt(8.17, 1.45) + 0.11), y: 1.45, z: 8.17 };
    builder.addCylinderBetween(crown, palmA, 0.03, 8);
    builder.addCylinderBetween(crown, palmB, 0.03, 8);
    builder.addTriangle(
      crown,
      { x: palmA.x, y: palmA.y + 0.18, z: palmA.z - 0.16 },
      { x: palmA.x, y: palmA.y - 0.02, z: palmA.z + 0.06 },
    );
    builder.addTriangle(
      crown,
      { x: palmB.x, y: palmB.y + 0.18, z: palmB.z + 0.16 },
      { x: palmB.x, y: palmB.y - 0.02, z: palmB.z - 0.06 },
    );
  };
  for (const side of [-1, 1] as const) {
    builder.setRegion(1);
    builder.setColor(0x9b6536);
    const catBase = { x: side * (halfBeamAt(8.75, 2.5) + 0.02), y: 2.5, z: 8.75 };
    const catEnd = { x: catBase.x + side * 0.86, y: 2.47, z: 9.25 };
    builder.addBeamBetween(catBase, catEnd, 0.18, 0.18);
    builder.setRegion(4);
    builder.setColor(0x22201e);
    builder.addCylinderBetween(
      { x: catEnd.x, y: catEnd.y - 0.1, z: catEnd.z },
      { x: catEnd.x, y: catEnd.y + 0.1, z: catEnd.z },
      0.07,
      8,
    );
    addAnchor(side, catEnd);
    addChannel(side, mizzenDeadeyes[0]! - 0.32, mizzenDeadeyes[mizzenDeadeyes.length - 1]! + 0.32);
    addChannel(side, mainDeadeyes[0]! - 0.45, mainDeadeyes[mainDeadeyes.length - 1]! + 0.45);
    addChannel(side, foreDeadeyes[0]! - 0.45, foreDeadeyes[foreDeadeyes.length - 1]! + 0.45);
    for (const z of [...mizzenDeadeyes, ...mainDeadeyes, ...foreDeadeyes]) addDeadeye(side, z);
  }
  addBowFittings(builder, detail);
  addHeadRails(builder, detail);
  builder.setRegion(4);
  builder.setColor(0x17110c);
  builder.addBox(0, 3.52, -12.4, 0.42, 0.18, 0.055);
  builder.addCylinderBetween({ x: 0, y: 3.56, z: -12.36 }, { x: 0, y: 3.78, z: -12.2 }, 0.025, 8);
  builder.addCylinderBetween({ x: 0, y: 3.78, z: -12.2 }, { x: 0, y: 3.65, z: -12.05 }, 0.025, 8);
  return builder.build();
}

export function createWindowGeometry(): BufferGeometry {
  const b = new MeshBuilder();
  b.setRegion(6);
  b.setColor(0xffb060);
  for (const x of [-1.45, -0.48, 0.48, 1.45]) b.addBox(x, 2.1, -12.39, 0.42, 0.36, 0.035);
  for (const x of [-1.18, -0.4, 0.4, 1.18]) b.addBox(x, 2.84, -12.43, 0.34, 0.3, 0.035);
  for (const side of [-1, 1] as const) {
    b.addBox(side * 2.76, 2.08, -11.17, 0.045, 0.34, 0.46);
    b.addBox(side * 2.94, 2.1, -11.6, 0.045, 0.32, 0.38);
    b.addBox(side * 2.82, 2.76, -11.32, 0.045, 0.28, 0.4);
  }
  b.setRegion(4);
  b.setColor(0x0a0d0e);
  b.addBox(0, 1.42, -12.41, 2.8, 0.34, 0.04);
  b.addBox(0, 2.47, -12.44, 3.15, 0.16, 0.04);
  return b.build();
}

export function createSternGoldGeometry(): BufferGeometry {
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
  for (const x of [-1.18, -0.4, 0.4, 1.18]) {
    b.addBox(x, 2.99, -12.46, 0.48, 0.055, 0.035);
    b.addBox(x, 2.69, -12.46, 0.48, 0.055, 0.035);
    b.addBox(x - 0.24, 2.84, -12.46, 0.048, 0.33, 0.035);
    b.addBox(x + 0.24, 2.84, -12.46, 0.048, 0.33, 0.035);
    b.addBox(x, 2.84, -12.475, 0.028, 0.29, 0.03);
  }
  b.addCylinderBetween({ x: -2.35, y: 2.65, z: -12.38 }, { x: 2.35, y: 2.65, z: -12.38 }, 0.045, 10);
  b.addCylinderBetween({ x: -2.05, y: 3.24, z: -12.4 }, { x: 2.05, y: 3.24, z: -12.4 }, 0.038, 10);
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
  b.addCylinderBetween({ x: -0.32, y: 3.14, z: -12.36 }, { x: 0.32, y: 3.14, z: -12.36 }, 0.035, 10);
  b.addCylinderBetween({ x: 0, y: 3.12, z: -12.36 }, { x: 0, y: 2.68, z: -12.36 }, 0.025, 8);
  return b.build();
}

export function createNameBoardGeometry(): BufferGeometry {
  const b = new MeshBuilder();
  b.setRegion(7);
  b.setColor(0xffffff);
  const nameUv = { u0: 0.06, v0: 0.04, u1: 0.94, v1: 0.48 };
  b.addQuadUv(
    { x: 1.85, y: 1.22, z: -12.49 },
    { x: -1.85, y: 1.22, z: -12.49 },
    { x: -1.85, y: 1.63, z: -12.49 },
    { x: 1.85, y: 1.63, z: -12.49 },
    nameUv,
  );
  const bowZ0 = 6.65;
  const bowZ1 = 8.65;
  const bowY0 = 2.18;
  const bowY1 = 2.52;
  const segments = 8;
  for (const side of [-1, 1] as const) {
    for (let i = 0; i < segments; i++) {
      const t0 = i / segments;
      const t1 = (i + 1) / segments;
      const z0 = lerp(bowZ0, bowZ1, t0);
      const z1 = lerp(bowZ0, bowZ1, t1);
      const out0 = lerp(0.07, 0.16, t0);
      const out1 = lerp(0.07, 0.16, t1);
      const x00 = side * (halfBeamAt(z0, bowY0) + out0);
      const x01 = side * (halfBeamAt(z1, bowY0) + out1);
      const x10 = side * (halfBeamAt(z0, bowY1) + out0);
      const x11 = side * (halfBeamAt(z1, bowY1) + out1);
      const uAtZ0 = side > 0 ? lerp(nameUv.u1, nameUv.u0, t0) : lerp(nameUv.u0, nameUv.u1, t0);
      const uAtZ1 = side > 0 ? lerp(nameUv.u1, nameUv.u0, t1) : lerp(nameUv.u0, nameUv.u1, t1);
      b.addQuadUv(
        { x: x00, y: bowY0, z: z0 },
        { x: x01, y: bowY0, z: z1 },
        { x: x11, y: bowY1, z: z1 },
        { x: x10, y: bowY1, z: z0 },
        { u0: uAtZ0, v0: nameUv.v0, u1: uAtZ1, v1: nameUv.v1 },
      );
    }
  }
  return b.build();
}
