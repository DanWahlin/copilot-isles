import type { Point3 } from '../sites/geo';
import {
  FaceBuilder,
  GERANIUM,
  LEAF,
  LEAF_DARK,
  PINK,
  SUNFLOWER,
  TERRACOTTA_POT,
  addBlob,
  addCylinder,
  type Buckets,
} from './plaza-kit';

/**
 * Hand-built potted plants for the plaza's stairs, walls and edges (into the town's buckets, so no
 * new draw): a terracotta pot with broad banana-like leaves, a little fan palm, a mound of
 * geraniums, a clipped cypress or a round shrub. Leaves are flat cards (the town's cloth is
 * double-sided), a couple of triangles each.
 */
export type PottedKind = 'leafy' | 'fan' | 'flowers' | 'cypress' | 'shrub';

function hash(seed: number, k: number): number {
  const v = Math.sin(seed * 127.1 + k * 311.7) * 43758.5453;
  return v - Math.floor(v);
}

/** A terracotta pot standing on y; returns the soil's height. */
export function addPot(
  b: Buckets,
  x: number,
  y: number,
  z: number,
  s: number,
  detail: 'lite' | 'full',
): number {
  const seg = detail === 'lite' ? 6 : 10;
  addCylinder(b, 'stone', x, y, z, 0.36 * s, 0.25 * s, 0.5 * s, seg, TERRACOTTA_POT);
  if (detail === 'full')
    addCylinder(b, 'stone', x, y + 0.46 * s, z, 0.41 * s, 0.4 * s, 0.1 * s, seg, 0xc8673a);
  return y + 0.5 * s;
}

/** Broad leaves arching out from (x, y, z): `count` of them, `len` long. */
export function addLeaves(
  b: Buckets,
  x: number,
  y: number,
  z: number,
  len: number,
  width: number,
  count: number,
  seed: number,
  colour = LEAF,
): void {
  const f = new FaceBuilder();
  for (let i = 0; i < count; i += 1) {
    const yaw = (i / count) * Math.PI * 2 + hash(seed, i) * 0.7;
    const lift = 0.55 + hash(seed, i + 20) * 0.6;
    const l = len * (0.75 + hash(seed, i + 40) * 0.4);
    const dx = Math.sin(yaw);
    const dz = Math.cos(yaw);
    const mid: Point3 = { x: x + dx * l * 0.45, y: y + l * lift * 0.75, z: z + dz * l * 0.45 };
    const tip: Point3 = { x: x + dx * l, y: y + l * lift * 0.55, z: z + dz * l };
    const w = width * (0.8 + hash(seed, i + 60) * 0.4);
    const left: Point3 = { x: mid.x + dz * w, y: mid.y - w * 0.15, z: mid.z - dx * w };
    const right: Point3 = { x: mid.x - dz * w, y: mid.y - w * 0.15, z: mid.z + dx * w };
    const base: Point3 = { x, y, z };
    f.tri(base, right, left, [0.5, 0], [1, 0.5], [0, 0.5]);
    f.tri(left, right, tip, [0, 0.5], [1, 0.5], [0.5, 1]);
  }
  b.cloth.push(f.build(colour));
}

/** A fan palm's fronds: pleated half-discs on short stalks round a stubby trunk top. */
export function addFanFronds(
  b: Buckets,
  x: number,
  y: number,
  z: number,
  r: number,
  count: number,
  seed: number,
): void {
  const f = new FaceBuilder();
  for (let i = 0; i < count; i += 1) {
    const yaw = (i / count) * Math.PI * 2 + hash(seed, i) * 0.5;
    const tilt = 0.25 + hash(seed, i + 10) * 0.9;
    const dx = Math.sin(yaw);
    const dz = Math.cos(yaw);
    const stalk = r * 0.35;
    const c: Point3 = { x: x + dx * stalk, y: y + stalk * tilt, z: z + dz * stalk };
    const spikes = 5;
    let prev: Point3 | null = null;
    for (let k = 0; k <= spikes; k += 1) {
      const a = (k / spikes - 0.5) * 2.2;
      const ox = Math.sin(yaw + a);
      const oz = Math.cos(yaw + a);
      const pt: Point3 = {
        x: c.x + ox * r * 0.65,
        y: c.y + r * 0.65 * (tilt * 0.8 - Math.abs(a) * 0.12) + (k % 2) * 0.04,
        z: c.z + oz * r * 0.65,
      };
      if (prev) f.tri(c, prev, pt, [0.5, 0], [0, 1], [1, 1]);
      prev = pt;
    }
  }
  b.cloth.push(f.build(0x3f8a43));
}

/** A potted plant on y (a pot, then its plant). */
export function addPottedPlant(
  b: Buckets,
  x: number,
  y: number,
  z: number,
  s: number,
  kind: PottedKind,
  detail: 'lite' | 'full',
  seed: number,
): void {
  const soil = addPot(b, x, y, z, s, detail);
  addPlantOn(b, x, soil, z, s, kind, detail, seed);
}

/** A plant growing from (x, y, z) (soil in a pot or a planter). */
export function addPlantOn(
  b: Buckets,
  x: number,
  y: number,
  z: number,
  s: number,
  kind: PottedKind,
  detail: 'lite' | 'full',
  seed: number,
): void {
  const lite = detail === 'lite';
  if (kind === 'leafy') {
    addLeaves(
      b,
      x,
      y - 0.05,
      z,
      1.15 * s,
      0.26 * s,
      lite ? 5 : 8,
      seed,
      hash(seed, 3) > 0.5 ? LEAF : 0x3b8c3f,
    );
  } else if (kind === 'fan') {
    addCylinder(b, 'wood', x, y - 0.05, z, 0.09 * s, 0.13 * s, 0.75 * s, 6, 0x6b4a2c);
    addFanFronds(b, x, y + 0.7 * s, z, 1.25 * s, lite ? 5 : 8, seed);
  } else if (kind === 'flowers') {
    addBlob(
      b,
      'cloth',
      x,
      y + 0.12 * s,
      z,
      0.42 * s,
      0.3 * s,
      0.42 * s,
      LEAF_DARK,
      lite ? 5 : 7,
      lite ? 3 : 4,
    );
    const colours = [GERANIUM, PINK, GERANIUM, SUNFLOWER, 0xf2f0e6];
    const dots = lite ? 3 : 7;
    for (let i = 0; i < dots; i += 1) {
      const a = (i / dots) * Math.PI * 2 + hash(seed, i);
      const r = 0.26 * s * (0.6 + hash(seed, i + 5) * 0.5);
      addBlob(
        b,
        'cloth',
        x + Math.sin(a) * r,
        y + 0.3 * s + hash(seed, i + 9) * 0.08 * s,
        z + Math.cos(a) * r,
        0.09 * s,
        0.07 * s,
        0.09 * s,
        colours[(seed + i) % colours.length]!,
        4,
        2,
      );
    }
  } else if (kind === 'cypress') {
    addCylinder(b, 'cloth', x, y - 0.05, z, 0.04 * s, 0.32 * s, 1.9 * s, lite ? 5 : 7, 0x174a28);
    addBlob(b, 'cloth', x, y + 0.55 * s, z, 0.3 * s, 0.75 * s, 0.3 * s, 0x1d5530, lite ? 5 : 7, lite ? 3 : 4);
  } else {
    addBlob(b, 'cloth', x, y + 0.28 * s, z, 0.5 * s, 0.42 * s, 0.5 * s, 0x2f6e35, lite ? 5 : 7, lite ? 3 : 5);
  }
}
