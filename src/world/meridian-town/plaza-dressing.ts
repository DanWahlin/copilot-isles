import { box, type Point3 } from '../sites/geo';
import {
  COPING,
  FaceBuilder,
  addBlob,
  SANDSTONE,
  SANDSTONE_DARK,
  addBox,
  addTube,
  type Buckets,
  type PlazaColliders,
} from './plaza-kit';
import { addPottedPlant } from './plaza-plants';

/**
 * The plaza's festive dressing: pennant bunting strung between façades and piers, the gate piers
 * that frame the lanes off the harbour front, benches and café tables.
 */
const PENNANTS = [0xc8302a, 0x1f6fa8, 0xf0c040, 0xf3eee2, 0x2e8a5c, 0xe0679a] as const;

/** A sagging line of pennants from a to b (`count` flags), into the rope and cloth buckets. */
export function addBunting(
  b: Buckets,
  a: Point3,
  c: Point3,
  sag: number,
  spacing: number,
  seed: number,
): void {
  const len = Math.hypot(c.x - a.x, c.z - a.z);
  const count = Math.max(3, Math.round(len / spacing));
  const at = (t: number): Point3 => ({
    x: a.x + (c.x - a.x) * t,
    y: a.y + (c.y - a.y) * t - Math.sin(t * Math.PI) * sag,
    z: a.z + (c.z - a.z) * t,
  });
  // The line in four straight runs (a smooth enough sag at this size).
  for (let i = 0; i < 4; i += 1) addTube(b, 'rope', 0.02, at(i / 4), at((i + 1) / 4), 0x6b5236, 4);
  const dx = (c.x - a.x) / len;
  const dz = (c.z - a.z) / len;
  const flags = new Map<number, FaceBuilder>();
  for (let i = 0; i < count; i += 1) {
    const t = (i + 0.5) / count;
    const p = at(t);
    const half = Math.min(0.2, (len / count) * 0.36);
    const colour = PENNANTS[(i + seed) % PENNANTS.length]!;
    const f = flags.get(colour) ?? new FaceBuilder();
    flags.set(colour, f);
    // Hung a touch off plumb, as if a breeze had them.
    const sway = Math.sin(seed * 3.1 + i * 1.7) * 0.08;
    f.tri(
      { x: p.x - dx * half, y: p.y, z: p.z - dz * half },
      { x: p.x + dx * half, y: p.y, z: p.z + dz * half },
      { x: p.x + dz * sway, y: p.y - 0.46, z: p.z - dx * sway },
      [0, 0],
      [1, 0],
      [0.5, 1],
    );
  }
  for (const [colour, f] of flags) b.cloth.push(f.build(colour));
}

/** A stone gate pier (a lane's mouth) with a cap and an urn of leaves; returns its top. */
export function addGatePier(
  b: Buckets,
  colliders: PlazaColliders,
  x: number,
  y: number,
  z: number,
  detail: 'lite' | 'full',
  seed: number,
): number {
  const h = 3.1;
  addBox(b, 'stone', x, y, z, 1.15, 0.45, 1.15, 0, SANDSTONE_DARK);
  addBox(b, 'stone', x, y + 0.45, z, 0.95, h - 0.45, 0.95, 0, SANDSTONE);
  addBox(b, 'stone', x, y + h, z, 1.2, 0.18, 1.2, 0, COPING);
  addBox(b, 'stone', x, y + h + 0.18, z, 0.9, 0.12, 0.9, 0, COPING);
  addPottedPlant(b, x, y + h + 0.3, z, 0.85, seed % 2 ? 'leafy' : 'flowers', detail, seed);
  colliders.boxes.push({ x, z, hx: 0.6, hz: 0.6, rot: 0, height: h + 0.3 });
  colliders.camera?.push({ x, z, hx: 0.6, hz: 0.6, rot: 0, y0: y, y1: y + h + 0.6 });
  return y + h + 0.3;
}

/** A plain wooden plaza bench (seat, back, two stone feet), facing yaw `rot` (+z turned by rot). */
export function addPlazaBench(
  b: Buckets,
  colliders: PlazaColliders,
  x: number,
  y: number,
  z: number,
  rot: number,
): void {
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  const at = (lx: number, lz: number) => ({ x: x + lx * c + lz * s, z: z - lx * s + lz * c });
  for (const lx of [-0.85, 0.85]) {
    const p = at(lx, 0);
    addBox(b, 'stone', p.x, y, p.z, 0.22, 0.42, 0.5, rot, SANDSTONE_DARK);
  }
  for (const lz of [-0.15, 0.03, 0.21]) {
    const p = at(0, lz);
    addBox(b, 'wood', p.x, y + 0.42, p.z, 2.2, 0.06, 0.15, rot, 0x6e4528);
  }
  for (const ly of [0.62, 0.82]) {
    const p = at(0, -0.3);
    addBox(b, 'wood', p.x, y + ly, p.z, 2.2, 0.12, 0.05, rot, 0x5e3a22, -0.12);
  }
  colliders.boxes.push({ x, z, hx: 1.15, hz: 0.38, rot, height: 1.0 });
}

/** A café table with two chairs, set at yaw `rot`. */
export function addCafeTable(
  b: Buckets,
  colliders: PlazaColliders,
  x: number,
  y: number,
  z: number,
  rot: number,
  cloth: number,
): void {
  addBox(b, 'metal', x, y, z, 0.08, 0.72, 0.08, rot, 0x2d302d);
  addBox(b, 'metal', x, y, z, 0.5, 0.04, 0.5, rot, 0x2d302d);
  addBox(b, 'cloth', x, y + 0.72, z, 0.86, 0.04, 0.86, rot + Math.PI / 4, cloth);
  for (const side of [-1, 1]) {
    const cx = x + Math.sin(rot) * side * 0.78;
    const cz = z + Math.cos(rot) * side * 0.78;
    const face = rot + (side > 0 ? Math.PI : 0);
    addBox(b, 'wood', cx, y + 0.42, cz, 0.42, 0.05, 0.42, face, 0x7a4e2c);
    for (const [lx, lz] of [
      [-0.17, -0.17],
      [0.17, -0.17],
      [-0.17, 0.17],
      [0.17, 0.17],
    ] as const) {
      const c = Math.cos(face);
      const s = Math.sin(face);
      addBox(b, 'wood', cx + lx * c + lz * s, y, cz - lx * s + lz * c, 0.04, 0.42, 0.04, face, 0x4a2f1c);
    }
    const back = { x: cx - Math.sin(face) * 0.2, z: cz - Math.cos(face) * 0.2 };
    addBox(b, 'wood', back.x, y + 0.47, back.z, 0.42, 0.42, 0.04, face, 0x7a4e2c);
  }
  colliders.circles.push({ x, z, r: 0.75 });
}

/**
 * Ivy hanging from a wall top at (x, top, z): a cushion of leaves on the coping and strands of small
 * leaves trailing down the face (yaw `rot` faces out), longest in the middle. Leaves are flat cards.
 */
export function addIvy(
  b: Buckets,
  x: number,
  top: number,
  z: number,
  rot: number,
  drop: number,
  seed: number,
): void {
  const ox = Math.sin(rot);
  const oz = Math.cos(rot);
  const ax = Math.cos(rot);
  const az = -Math.sin(rot);
  const r = (k: number) => {
    const v = Math.sin(seed * 12.989 + k * 78.233) * 43758.5453;
    return v - Math.floor(v);
  };
  addBlob(
    b,
    'cloth',
    x + ox * 0.05,
    top + 0.05,
    z + oz * 0.05,
    Math.abs(ax) * 0.75 + Math.abs(ox) * 0.3,
    0.26,
    Math.abs(az) * 0.75 + Math.abs(oz) * 0.3,
    0x4a8e44,
    6,
    3,
  );
  const greens = [0x4f9a48, 0x5fae52, 0x3f8a43, 0x6cb85a];
  const leaves = new Map<number, FaceBuilder>();
  const strands = 8;
  let k = 0;
  for (let i = 0; i < strands; i += 1) {
    const along = (i / (strands - 1) - 0.5) * 1.4 + (r(i) - 0.5) * 0.12;
    const len = drop * (1 - Math.abs(along) * 0.7) * (0.6 + r(i + 20) * 0.4);
    const n = Math.max(2, Math.round(len / 0.17));
    for (let j = 0; j < n; j += 1) {
      k += 1;
      const y = top - 0.05 - j * 0.17;
      const sway = Math.sin(seed + i * 1.3 + j * 0.7) * 0.06;
      const cx = x + ax * (along + sway) + ox * 0.06;
      const cz = z + az * (along + sway) + oz * 0.06;
      const side = j % 2 ? 1 : -1;
      const w = 0.12 + r(k + 40) * 0.05;
      // A leaf: a small diamond tipped out from the stem and down.
      const base = { x: cx, y, z: cz };
      const tip = {
        x: cx + ax * side * w * 1.4 + ox * 0.1,
        y: y - 0.14,
        z: cz + az * side * w * 1.4 + oz * 0.1,
      };
      const l = {
        x: cx + ax * side * w * 0.7 + ox * 0.14,
        y: y + 0.03,
        z: cz + az * side * w * 0.7 + oz * 0.14,
      };
      const rr = {
        x: cx + ax * side * w * 0.7 - ox * 0.02,
        y: y - 0.12,
        z: cz + az * side * w * 0.7 - oz * 0.02,
      };
      const colour = greens[(k + seed) % greens.length]!;
      const f = leaves.get(colour) ?? new FaceBuilder();
      leaves.set(colour, f);
      f.tri(base, l, tip, [0, 0], [1, 0], [1, 1]);
      f.tri(base, tip, rr, [0, 0], [1, 1], [0, 1]);
    }
  }
  for (const [colour, f] of leaves) b.cloth.push(f.build(colour));
}

/**
 * The harbour wall's face over the quay (z `faceZ`, from the quay up to the lane): pilasters between
 * the quay's palms, a string course, ivy and pots of flowers along its coping, and a walker's wall so
 * you can't walk into it from the quay.
 */
export function dressHarbourWall(
  b: Buckets,
  colliders: PlazaColliders,
  x0: number,
  x1: number,
  faceZ: number,
  bottom: number,
  top: number,
  detail: 'lite' | 'medium' | 'full',
): void {
  const mid = (x0 + x1) * 0.5;
  addBox(b, 'stone', mid, bottom, faceZ + 0.12, x1 - x0, 0.55, 0.3, 0, SANDSTONE_DARK);
  if (detail !== 'lite')
    addBox(b, 'stone', mid, bottom + (top - bottom) * 0.55, faceZ + 0.07, x1 - x0, 0.16, 0.2, 0, COPING);
  // Pilasters half-way between the quay's palms (594 + 11k).
  for (let x = 599.5; x < x1 - 1; x += 11) {
    if (x < x0 + 1) continue;
    addBox(b, 'stone', x, bottom, faceZ + 0.15, 0.8, top - bottom - 0.05, 0.36, 0, SANDSTONE_DARK);
    if (detail === 'lite') continue;
    addBox(b, 'stone', x, top - 0.6, faceZ + 0.22, 1.0, 0.18, 0.5, 0, COPING);
  }
  if (detail !== 'lite') {
    for (let x = x0 + 4.5, i = 0; x < x1 - 2; x += 11, i += 1) {
      addPottedPlant(b, x, top + 0.22, faceZ - 0.45, 0.7, i % 3 === 1 ? 'leafy' : 'flowers', 'full', 40 + i);
      if (detail === 'full' && i % 2 === 0) addIvy(b, x + 2.4, top + 0.1, faceZ, 0, 2.2 + (i % 3) * 0.5, i);
    }
  }
  colliders.boxes.push({
    x: mid,
    z: faceZ - 0.45,
    hx: (x1 - x0) * 0.5,
    hz: 0.45,
    rot: 0,
    height: top - bottom,
  });
}

/** A flat ring band (r0 to r1 round x, z) of dressed stone at y, in `segments` pieces. */
function addRing(
  b: Buckets,
  x: number,
  y: number,
  z: number,
  r0: number,
  r1: number,
  segments: number,
  colour: number,
): void {
  const f = new FaceBuilder();
  for (let i = 0; i < segments; i += 1) {
    const a0 = (i / segments) * Math.PI * 2;
    const a1 = ((i + 1) / segments) * Math.PI * 2;
    const p = (a: number, r: number) => ({ x: x + Math.sin(a) * r, y, z: z + Math.cos(a) * r });
    f.quad(
      p(a0, r0),
      p(a1, r0),
      p(a1, r1),
      p(a0, r1),
      [a0 * r0 * 0.55, 0],
      [a1 * r0 * 0.55, 0],
      [a1 * r1 * 0.55, 0.4],
      [a0 * r1 * 0.55, 0.4],
    );
  }
  b.paving.push(f.build(colour));
}

export interface PlazaDressingLayout {
  /** The plaza's paved floor (its top) and the fountain's centre. */
  y: number;
  fountain: { x: number; z: number };
  /** The border's rectangle, and boxes it must leave alone (the market's stall). */
  border: { x0: number; x1: number; z0: number; z1: number };
  keepOut: readonly { x0: number; x1: number; z0: number; z1: number }[];
}

const BORDER = 0xe0cfae;
const BAND = 0xeee2c8;

/**
 * The plaza's paving pattern (a dressed stone border, a ring round the fountain and a cross of bands
 * out to the border), its benches, café tables and bunting from the clock tower to the corner houses.
 */
export function addPlazaDressing(
  b: Buckets,
  colliders: PlazaColliders,
  layout: PlazaDressingLayout,
  detail: 'lite' | 'medium' | 'full',
): void {
  const { y, fountain, border } = layout;
  const top = y + 0.095;
  const blocked = (x: number, z: number) =>
    layout.keepOut.some((k) => x > k.x0 && x < k.x1 && z > k.z0 && z < k.z1);
  // A run of band from (ax, az) to (bx, bz), skipping what's kept clear, in pieces of about 3 m.
  const band = (ax: number, az: number, bx: number, bz: number, w: number, colour: number) => {
    const len = Math.hypot(bx - ax, bz - az);
    const n = Math.max(1, Math.round(len / 3));
    const rot = Math.atan2(-(bz - az), bx - ax);
    for (let i = 0; i < n; i += 1) {
      const t = (i + 0.5) / n;
      const x = ax + (bx - ax) * t;
      const z = az + (bz - az) * t;
      if (blocked(x, z)) continue;
      b.paving.push(box(len / n + 0.02, 0.03, w, { x, y: top - 0.03, z, ry: rot }, colour, 1.8));
    }
  };
  band(border.x0, border.z0, border.x1, border.z0, 0.9, BORDER);
  band(border.x0, border.z1, border.x1, border.z1, 0.9, BORDER);
  band(border.x0, border.z0, border.x0, border.z1, 0.9, BORDER);
  band(border.x1, border.z0, border.x1, border.z1, 0.9, BORDER);
  const r0 = 4.6;
  const r1 = 5.3;
  addRing(b, fountain.x, top, fountain.z, r0, r1, detail === 'lite' ? 20 : 36, BORDER);
  band(fountain.x, fountain.z - r1, fountain.x, border.z1, 0.5, BAND);
  band(fountain.x, fountain.z + r1, fountain.x, border.z0, 0.5, BAND);
  band(fountain.x + r1, fountain.z, border.x1, fountain.z, 0.5, BAND);
  band(fountain.x - r1, fountain.z, border.x0, fountain.z, 0.5, BAND);

  // Benches round the fountain's north side and by the voyage office, facing into the plaza.
  for (const [x, z, rot] of [
    [fountain.x - 6.6, fountain.z - 6.6, Math.PI / 4],
    [fountain.x + 6.6, fountain.z - 6.6, -Math.PI / 4],
    [border.x0 + 2.2, fountain.z + 3.0, Math.PI / 2],
  ] as const)
    addPlazaBench(b, colliders, x, y, z, rot);

  addCafeTable(b, colliders, 688.6, y, -806.0, 0.3, 0xf3eee2);
  addCafeTable(b, colliders, 686.2, y, -814.2, -0.4, 0xc8302a);
  if (detail === 'lite') return;
  // Pennants from the clock tower's front corners out to the corner houses.
  addBunting(b, { x: 665.3, y: y + 7.2, z: -821.9 }, { x: 646.8, y: y + 4.2, z: -795.4 }, 1.4, 0.7, 1);
  addBunting(b, { x: 670.7, y: y + 7.2, z: -821.9 }, { x: 692.2, y: y + 4.2, z: -794.6 }, 1.4, 0.7, 4);
}

/**
 * A terrace's retaining wall (its face toward +z at `faceZ`, from `bottom` to its cap at `top`):
 * buttresses along it, pots of flowers on its cap (Medium up) and ivy trailing down (High).
 */
export function dressTerraceWall(
  b: Buckets,
  x0: number,
  x1: number,
  faceZ: number,
  bottom: number,
  top: number,
  detail: 'lite' | 'medium' | 'full',
  seed: number,
): void {
  const h = top - bottom;
  if (h < 1.2) return;
  for (let x = x0 + 3.2; x < x1 - 2; x += 6.5)
    addBox(b, 'stone', x, bottom, faceZ + 0.12, 0.7, h - 0.02, 0.32, 0, SANDSTONE_DARK);
  if (detail === 'lite') return;
  let i = 0;
  for (let x = x0 + 6.4; x < x1 - 3; x += 13, i += 1) {
    addPottedPlant(
      b,
      x + 3.25,
      top + 0.26,
      faceZ - 0.42,
      0.62,
      (seed + i) % 3 === 0 ? 'leafy' : 'flowers',
      'full',
      seed + i,
    );
    if (detail === 'full' && (seed + i) % 2 === 0)
      addIvy(b, x - 1.2, top + 0.2, faceZ - 0.02, 0, Math.min(h - 0.4, 2.4), seed + i);
  }
}
