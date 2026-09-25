import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  DoubleSide,
  Group,
  Mesh,
  MeshStandardNodeMaterial,
  SRGBColorSpace,
  TorusGeometry,
  Vector3,
  type Material,
} from 'three/webgpu';
import type { TierSettings } from '../../engine/quality';
import type { VillageKit } from '../village';
import {
  box,
  coloredIndexedGeometry,
  cylinder,
  merge,
  paint,
  plank,
  TRIM,
  tubeBetween,
  worldUv,
} from './geo';
import { lerp } from '../../util/math';

export type FlagKind = 'you' | 'captain' | 'guild';

/** Canvas artwork for a flag, about 2:1 (each call returns a new canvas). */
function drawFlag(kind: FlagKind): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const palette = flagPalette(kind);

  ctx.fillStyle = palette.base;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const grad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  grad.addColorStop(0, 'rgba(255,255,255,0.18)');
  grad.addColorStop(0.55, 'rgba(255,255,255,0.03)');
  grad.addColorStop(1, 'rgba(0,0,0,0.2)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = palette.trim;
  ctx.lineWidth = 14;
  ctx.strokeRect(10, 10, canvas.width - 20, canvas.height - 20);
  ctx.globalAlpha = 0.22;
  for (let x = 36; x < canvas.width; x += 44) {
    ctx.beginPath();
    ctx.moveTo(x, 18);
    ctx.bezierCurveTo(x + 16, 72, x - 16, 128, x + 8, 238);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  if (kind === 'captain') drawGull(ctx, palette.mark);
  else if (kind === 'guild') drawKeys(ctx, palette.mark);
  else drawCompass(ctx, palette.mark);

  ctx.font = 'bold 34px ui-serif, Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = palette.text;
  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = 3;
  ctx.fillText(kind === 'captain' ? 'M. REYES' : kind === 'guild' ? 'GUILD' : 'YOUR FORK', 256, 214);
  ctx.shadowBlur = 0;
  return canvas;
}

export interface SloopOptions {
  kit: VillageKit;
  tier: TierSettings;
  flag: FlagKind;
  /** Hull strake paint, so the two sloops differ. */
  accent: number;
  seed: number;
}

export interface Sloop {
  /** Origin: hull centre at the waterline (y = 0). Local +z is the bow, and +y is up. */
  readonly group: Group;
  /** Local deck-top point amidships where the crane sets crates down: flat and clear ~1.6 × 1.6 m. */
  readonly cargo: Vector3;
  readonly halfLength: number;
  readonly halfBeam: number;
  /** Gentle bob and roll at the berth (±3 cm, under 1.5°), animating the group's children, not its world transform. */
  update(dt: number, t: number): void;
  dispose(): void;
}

type BucketKey = 'wood' | 'cloth' | 'rope' | 'metal';

interface Detail {
  stations: number;
  cyl: number;
  flagCols: number;
  ropeRadius: number;
}

interface FlagRig {
  mesh: Mesh;
  geometry: BufferGeometry;
  material: MeshStandardNodeMaterial;
  texture: CanvasTexture;
  base: Float32Array;
  wave: number;
}

const HALF_LENGTH = 5.05;
const HALF_BEAM = 1.55;
const DECK_Y = 0.78;
const MAST_Z = 0.55;
const MAST_H = 6.2;
const FLAG_H = 0.56;
const FLAG_W = 1.12;
/** The sloop's rigging runs at a finer UV scale than the other sites, and lines can be very short. */
const SLOOP_TUBE = { uvScale: 0.6, minLength: 0 } as const;

export function createSloop(o: SloopOptions): Sloop {
  const detail = detailForTier(o.tier);
  const group = new Group();
  group.name = `moored sloop ${o.flag}`;
  const motion = new Group();
  motion.name = 'sloop bobbing hull';
  group.add(motion);

  const buckets: Record<BucketKey, BufferGeometry[]> = { wood: [], cloth: [], rope: [], metal: [] };
  buckets.wood.push(createHull(detail.stations, o.accent));
  buckets.wood.push(createDeck());
  addDeckDetails(buckets, detail, o.accent);
  addRig(buckets, detail);
  addDolphinPiles(buckets, detail);

  const meshes = [
    addMergedMesh(motion, 'sloop wood', buckets.wood, o.kit.materials.wood),
    addMergedMesh(motion, 'sloop cloth', buckets.cloth, o.kit.materials.cloth),
    addMergedMesh(motion, 'sloop rope', buckets.rope, o.kit.materials.rope),
    addMergedMesh(motion, 'sloop metal', buckets.metal, o.kit.materials.metal),
  ].filter((mesh): mesh is Mesh => !!mesh);
  const flag = addFlag(
    motion,
    o.flag,
    detail.flagCols,
    { x: 0.07, y: MAST_H + 0.86, z: MAST_Z - 0.02 },
    o.seed,
  );

  const phase = seeded(o.seed) * Math.PI * 2;
  const cargo = new Vector3(0, DECK_Y + 0.16, -0.25);
  return {
    group,
    cargo,
    halfLength: HALF_LENGTH,
    halfBeam: HALF_BEAM,
    update(_dt, t) {
      const bob = Math.sin(t * 1.05 + phase) * 0.03;
      motion.position.y = bob;
      motion.rotation.z = Math.sin(t * 0.83 + phase * 1.7) * ((1.35 * Math.PI) / 180);
      motion.rotation.x = Math.sin(t * 0.71 + phase * 0.7) * ((0.55 * Math.PI) / 180);
      updateFlag(flag, t);
    },
    dispose() {
      for (const mesh of meshes) mesh.geometry.dispose();
      flag.geometry.dispose();
      flag.texture.dispose();
      flag.material.dispose();
      group.removeFromParent();
    },
  };
}

/** A berth marker for the pier edge: a 3 m pole with the flag, and a painted plaque with the berth number. Origin at its foot. */
export function createBerthFlag(o: { kit: VillageKit; kind: FlagKind; berth: 1 | 2 | 3 }): {
  group: Group;
  update(dt: number, t: number): void;
  dispose(): void;
} {
  const group = new Group();
  group.name = `berth ${o.berth} flag`;
  const wood: BufferGeometry[] = [
    cylinder(0.055, 0.075, 3, { y: 0 }, 0xe8d4bb, 8),
    plank(0.92, 0.44, 0.055, { y: 0.92, z: -0.08 }, 0xd7b985, TRIM.light, 0.8),
  ];
  addPlaqueNumber(wood, o.berth);
  const pole = addMergedMesh(group, 'berth pole and plaque', wood, o.kit.materials.wood)!;
  const flag = addFlag(group, o.kind, 6, { x: 0.08, y: 2.62, z: 0 }, o.berth * 19 + 5, 0.88, 0.44);
  return {
    group,
    update(_dt, t) {
      updateFlag(flag, t);
    },
    dispose() {
      pole.geometry.dispose();
      flag.geometry.dispose();
      flag.texture.dispose();
      flag.material.dispose();
      group.removeFromParent();
    },
  };
}

function detailForTier(tier: TierSettings): Detail {
  if (tier.tier === 'lite') return { stations: 18, cyl: 6, flagCols: 4, ropeRadius: 0.016 };
  if (tier.tier === 'low') return { stations: 22, cyl: 7, flagCols: 5, ropeRadius: 0.017 };
  if (tier.tier === 'medium') return { stations: 28, cyl: 8, flagCols: 7, ropeRadius: 0.018 };
  return { stations: 32, cyl: 8, flagCols: 9, ropeRadius: 0.018 };
}

function createHull(stations: number, accent: number): BufferGeometry {
  const rings: number[][] = [];
  const positions: number[] = [];
  const uvs: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const add = (x: number, y: number, z: number, u: number, v: number, color: number) => {
    const i = positions.length / 3;
    positions.push(x, y, z);
    uvs.push(u, v);
    colors.push(((color >> 16) & 255) / 255, ((color >> 8) & 255) / 255, (color & 255) / 255);
    return i;
  };
  for (let i = 0; i <= stations; i += 1) {
    const t = i / stations;
    const z = -HALF_LENGTH + t * HALF_LENGTH * 2;
    const shape = hullShapeAt(z);
    const beam = hullHalfBeamAt(z);
    const sheer = sheerAt(z);
    const keel = -0.82 + 0.18 * (1 - shape);
    const ring: number[] = [];
    const pts = [
      [-beam * 0.9, sheer],
      [-beam, 0.38],
      [-beam * 0.97, 0.06],
      [-beam * 0.82, -0.32],
      [-beam * 0.48, -0.68],
      [0, keel],
      [beam * 0.48, -0.68],
      [beam * 0.82, -0.32],
      [beam * 0.97, 0.06],
      [beam, 0.38],
      [beam * 0.9, sheer],
    ] as const;
    for (const [x, y] of pts) ring.push(add(x, y, z, t * 3.6, (y + 0.9) * 0.9, 0xf1ddc5));
    rings.push(ring);
  }

  for (let z = 0; z < rings.length - 1; z += 1) {
    const a = rings[z]!;
    const b = rings[z + 1]!;
    for (let r = 0; r < a.length - 1; r += 1)
      indices.push(a[r]!, b[r]!, a[r + 1]!, a[r + 1]!, b[r]!, b[r + 1]!);
  }
  addSideRibbon(indices, positions, uvs, colors, stations, 0.14, 0.31, accent);
  addSideRibbon(indices, positions, uvs, colors, stations, -0.16, -0.03, 0x2f2f2a);
  return coloredIndexedGeometry(positions, uvs, colors, indices);
}

function hullShapeAt(z: number): number {
  return Math.max(0.05, Math.sin(Math.PI * ((z + HALF_LENGTH) / (HALF_LENGTH * 2))));
}

function hullHalfBeamAt(z: number): number {
  const shape = hullShapeAt(z);
  const bowFine = 1 - 0.16 * Math.max(0, (z - 3.5) / 1.55);
  const sternFull = 1 + 0.08 * Math.max(0, (-z - 3.2) / 1.85);
  return HALF_BEAM * Math.pow(shape, 0.36) * bowFine * sternFull;
}

function sheerAt(z: number): number {
  const t = (z + HALF_LENGTH) / (HALF_LENGTH * 2);
  const ends = Math.pow(Math.abs(t - 0.5) * 2, 1.42);
  const bow = Math.max(0, (z - 3.15) / 1.9);
  return DECK_Y + 0.16 * ends + 0.28 * bow * bow;
}

function deckHalfBeamAt(z: number): number {
  return Math.max(0.18, hullHalfBeamAt(z) * 0.78 - 0.03);
}

function deckYAt(x: number, z: number): number {
  const half = Math.max(0.2, deckHalfBeamAt(z));
  const camber = 0.065 * (1 - Math.min(1, Math.abs(x) / half) ** 2);
  return sheerAt(z) - 0.035 + camber;
}

function addSideRibbon(
  indices: number[],
  positions: number[],
  uvs: number[],
  colors: number[],
  stations: number,
  y0: number,
  y1: number,
  color: number,
): void {
  const add = (x: number, y: number, z: number, u: number, v: number) => {
    const i = positions.length / 3;
    positions.push(x, y, z);
    uvs.push(u, v);
    colors.push(((color >> 16) & 255) / 255, ((color >> 8) & 255) / 255, (color & 255) / 255);
    return i;
  };
  for (const side of [-1, 1] as const) {
    let prev: readonly [number, number, number, number] | null = null;
    for (let i = 0; i <= stations; i += 1) {
      const t = i / stations;
      const z = -HALF_LENGTH + t * HALF_LENGTH * 2;
      const beam = hullHalfBeamAt(z);
      const x = side * beam * 1.012;
      const a = add(x, y0, z, t * 3, 0);
      const b = add(x, y1, z, t * 3, 1);
      if (prev) indices.push(prev[0], a, prev[1], prev[1], a, b);
      prev = [a, b, x, z];
    }
  }
}

function createDeck(): BufferGeometry {
  const parts: BufferGeometry[] = [deckSurface(28, 6)];
  const stations = 12;
  for (const side of [-1, 1] as const) {
    let coverPrev: { x: number; y: number; z: number } | null = null;
    let railPrev: { x: number; y: number; z: number } | null = null;
    let rubPrev: { x: number; y: number; z: number } | null = null;
    for (let i = 0; i <= stations; i += 1) {
      const z = -HALF_LENGTH + 0.34 + (i / stations) * (HALF_LENGTH * 2 - 0.68);
      const half = deckHalfBeamAt(z);
      const y = deckYAt(side * half, z);
      const cover = { x: side * half, y: y + 0.035, z };
      const rail = { x: side * (half + 0.08), y: y + 0.17, z };
      const rub = { x: side * (hullHalfBeamAt(z) + 0.04), y: 0.24, z };
      if (coverPrev) parts.push(tubeBetween(0.038, coverPrev, cover, 0xeedcc4, 5, SLOOP_TUBE));
      if (railPrev) parts.push(tubeBetween(0.035, railPrev, rail, 0xd8bea0, 5, SLOOP_TUBE));
      if (rubPrev) parts.push(tubeBetween(0.045, rubPrev, rub, 0xb78652, 5, SLOOP_TUBE));
      coverPrev = cover;
      railPrev = rail;
      rubPrev = rub;
    }
  }
  for (const x of [-0.78, -0.39, 0, 0.39, 0.78]) {
    const valid: number[] = [];
    for (let i = 0; i <= 32; i += 1) {
      const z = -3.95 + (i / 32) * 7.6;
      if (Math.abs(x) <= deckHalfBeamAt(z) - 0.18) valid.push(z);
    }
    if (valid.length < 2) continue;
    const z0 = valid[0]!;
    const z1 = valid[valid.length - 1]!;
    const pieces = 4;
    for (let i = 0; i < pieces; i += 1) {
      const a = z0 + ((z1 - z0) * i) / pieces;
      const b = z0 + ((z1 - z0) * (i + 1)) / pieces;
      parts.push(
        tubeBetween(
          0.009,
          { x, y: deckYAt(x, a) + 0.016, z: a },
          { x, y: deckYAt(x, b) + 0.016, z: b },
          0x6f4a28,
          5,
          SLOOP_TUBE,
        ),
      );
    }
  }
  parts.push(
    tubeBetween(
      0.09,
      { x: 0, y: -0.45, z: HALF_LENGTH + 0.18 },
      { x: 0, y: 1.26, z: HALF_LENGTH - 0.22 },
      0xe0c7a8,
      7,
      SLOOP_TUBE,
    ),
  );
  parts.push(plank(2.0, 0.78, 0.13, { y: 0.02, z: -HALF_LENGTH + 0.1 }, 0xd3b18c, TRIM.dark, 0.7));
  return merge(parts);
}

function deckSurface(stations: number, across: number): BufferGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const add = (x: number, y: number, z: number, u: number, v: number) => {
    const i = positions.length / 3;
    positions.push(x, y, z);
    uvs.push(u, v);
    colors.push(0xf5 / 255, 0xe2 / 255, 0xc8 / 255);
    return i;
  };
  for (let i = 0; i <= stations; i += 1) {
    const z = -HALF_LENGTH + 0.35 + (i / stations) * (HALF_LENGTH * 2 - 0.72);
    const half = deckHalfBeamAt(z) - 0.08;
    for (let j = 0; j <= across; j += 1) {
      const f = j / across;
      const x = (f * 2 - 1) * half;
      add(x, deckYAt(x, z), z, z * 0.55, f);
    }
  }
  for (let i = 0; i < stations; i += 1) {
    for (let j = 0; j < across; j += 1) {
      const a = i * (across + 1) + j;
      indices.push(a, a + across + 1, a + 1, a + 1, a + across + 1, a + across + 2);
    }
  }
  return coloredIndexedGeometry(positions, uvs, colors, indices);
}

function addDeckDetails(buckets: Record<BucketKey, BufferGeometry[]>, detail: Detail, accent: number): void {
  buckets.wood.push(
    plank(1.05, 0.24, 0.82, { y: deckYAt(0, -2.15) + 0.02, z: -2.15 }, 0xe8d4b8, TRIM.light, 0.65),
  );
  buckets.wood.push(
    plank(0.95, 0.55, 0.85, { x: 0.58, y: deckYAt(0.58, -1.55), z: -1.55 }, 0xdfc6a9, TRIM.light, 0.7),
  );
  buckets.wood.push(
    plank(0.72, 0.14, 0.56, { x: -0.52, y: deckYAt(-0.52, 2.45) + 0.02, z: 2.45 }, 0xd4a070, TRIM.dark, 0.8),
  );
  buckets.wood.push(
    tubeBetween(
      0.045,
      { x: 0, y: deckYAt(0, 4.45) + 0.02, z: 4.42 },
      { x: 0, y: deckYAt(0, 4.45) + 0.32, z: 6.25 },
      0xe3ccb0,
      detail.cyl,
      SLOOP_TUBE,
    ),
  );
  buckets.wood.push(
    plank(0.28, 0.18, 1.6, { y: deckYAt(0, -3.65) + 0.04, z: -3.65, ry: -0.3 }, 0xd8bca0, TRIM.dark, 0.75),
  );
  buckets.wood.push(plank(1.0, 0.12, 0.18, { y: deckYAt(0, 2.7) + 0.04, z: 2.7 }, accent, TRIM.light, 0.8));
  buckets.wood.push(
    tubeBetween(
      0.035,
      { x: -1.2, y: deckYAt(-1.2, -1.6) + 0.08, z: -2.85 },
      { x: -1.18, y: deckYAt(-1.18, 1.55) + 0.08, z: 1.55 },
      0xe5d1b8,
      6,
      SLOOP_TUBE,
    ),
  );
  buckets.wood.push(
    tubeBetween(
      0.035,
      { x: 1.2, y: deckYAt(1.2, -1.25) + 0.08, z: -2.45 },
      { x: 1.18, y: deckYAt(1.18, 1.9) + 0.08, z: 1.9 },
      0xe5d1b8,
      6,
      SLOOP_TUBE,
    ),
  );
  buckets.wood.push(
    cylinder(0.18, 0.2, 0.46, { x: -0.86, y: deckYAt(-0.86, 2.85) + 0.03, z: 2.85 }, 0xd2b28f, detail.cyl),
  );
  for (const x of [-1.18, 1.18]) {
    for (const z of [-2.8, 2.7])
      buckets.metal.push(cylinder(0.05, 0.06, 0.12, { x, y: deckYAt(x, z) + 0.03, z }, 0xd0c9bd, detail.cyl));
    for (const z of [-1.85, 1.85]) {
      buckets.rope.push(
        tubeBetween(0.09, { x, y: 0.1, z }, { x, y: 0.78, z: z + 0.08 }, 0xd8c092, detail.cyl, SLOOP_TUBE),
      );
    }
  }
  buckets.rope.push(coil(0.22, { x: 0.88, y: deckYAt(0.88, 2.15) + 0.045, z: 2.15 }, 0xd8c092));
  buckets.rope.push(coil(0.16, { x: -0.95, y: deckYAt(-0.95, -2.65) + 0.045, z: -2.65 }, 0xcbb088));
  buckets.rope.push(
    tubeBetween(
      0.014,
      { x: 0, y: deckYAt(0, -3.75) + 0.18, z: -3.2 },
      { x: -1.05, y: deckYAt(-1.05, -2.95) + 0.12, z: -2.95 },
      0xd9bf93,
      5,
      SLOOP_TUBE,
    ),
  );
  buckets.rope.push(
    tubeBetween(
      0.014,
      { x: 0, y: deckYAt(0, -3.75) + 0.18, z: -3.2 },
      { x: 1.05, y: deckYAt(1.05, -2.95) + 0.12, z: -2.95 },
      0xd9bf93,
      5,
      SLOOP_TUBE,
    ),
  );
}

function addRig(buckets: Record<BucketKey, BufferGeometry[]>, detail: Detail): void {
  const mastBase = { x: 0, y: DECK_Y, z: MAST_Z };
  const mastTop = { x: 0, y: MAST_H + 0.78, z: MAST_Z };
  const boomIn = { x: 0, y: 2.24, z: MAST_Z - 0.2 };
  const boomEnd = { x: 0, y: 2.22, z: -3.45 };
  const bow = { x: 0, y: 0.8, z: 4.72 };
  buckets.wood.push(tubeBetween(0.085, mastBase, mastTop, 0xe9d7bf, detail.cyl, SLOOP_TUBE));
  buckets.wood.push(tubeBetween(0.055, boomIn, boomEnd, 0xe4cfb3, detail.cyl, SLOOP_TUBE));
  buckets.wood.push(
    tubeBetween(
      0.045,
      { x: 0.04, y: 2.44, z: MAST_Z - 0.1 },
      { x: 0.04, y: 2.36, z: -2.95 },
      0xdfc7a9,
      detail.cyl,
      SLOOP_TUBE,
    ),
  );
  addFurledBundle(
    buckets,
    { x: 0, y: 2.12, z: MAST_Z - 0.25 },
    { x: 0, y: 2.08, z: -3.2 },
    0.13,
    7,
    0xefe4cc,
    detail,
  );
  addFurledBundle(
    buckets,
    { x: 0.02, y: 1.05, z: 3.15 },
    { x: 0.02, y: 1.13, z: 4.55 },
    0.1,
    5,
    0xefe4cc,
    detail,
  );
  buckets.rope.push(tubeBetween(detail.ropeRadius, mastTop, bow, 0xe6cfa3, 6, SLOOP_TUBE));
  buckets.rope.push(
    tubeBetween(detail.ropeRadius, mastTop, { x: 0, y: 0.82, z: -4.55 }, 0xe6cfa3, 6, SLOOP_TUBE),
  );
  for (const x of [-1.12, 1.12]) {
    for (const z of [-2.2, -0.5, 1.2])
      buckets.rope.push(tubeBetween(detail.ropeRadius, mastTop, { x, y: 0.88, z }, 0xe6cfa3, 6, SLOOP_TUBE));
  }
}

function addDolphinPiles(buckets: Record<BucketKey, BufferGeometry[]>, detail: Detail): void {
  const pile = (x: number, z: number) => cylinder(0.18, 0.28, 6.9, { x, y: -6, z }, 0xd0b89c, detail.cyl);
  buckets.wood.push(
    pile(-0.82, -6.0),
    pile(0.82, -6.0),
    pile(0, -6.38),
    tubeBetween(
      0.045,
      { x: -0.82, y: 0.65, z: -6.0 },
      { x: 0.82, y: 0.65, z: -6.0 },
      0xe1c898,
      detail.cyl,
      SLOOP_TUBE,
    ),
    tubeBetween(
      0.04,
      { x: -0.62, y: 0.45, z: -5.92 },
      { x: 0, y: 0.5, z: -6.38 },
      0xe1c898,
      detail.cyl,
      SLOOP_TUBE,
    ),
    tubeBetween(
      0.04,
      { x: 0.62, y: 0.45, z: -5.92 },
      { x: 0, y: 0.5, z: -6.38 },
      0xe1c898,
      detail.cyl,
      SLOOP_TUBE,
    ),
  );
  for (const x of [-0.82, 0, 0.82]) {
    buckets.rope.push(
      tubeBetween(
        0.025,
        { x: x - 0.18, y: 0.15, z: -6.06 },
        { x: x + 0.18, y: 0.16, z: -5.94 },
        0xc9ad7f,
        6,
        SLOOP_TUBE,
      ),
    );
    buckets.rope.push(
      tubeBetween(
        0.025,
        { x: x - 0.18, y: 0.55, z: -6.06 },
        { x: x + 0.18, y: 0.56, z: -5.94 },
        0xc9ad7f,
        6,
        SLOOP_TUBE,
      ),
    );
  }
  buckets.rope.push(
    tubeBetween(0.028, { x: 0, y: 0.72, z: -4.92 }, { x: 0, y: 0.48, z: -6.38 }, 0xd8bd8c, 7, SLOOP_TUBE),
  );
}

function addFurledBundle(
  buckets: Record<BucketKey, BufferGeometry[]>,
  a: { x: number; y: number; z: number },
  b: { x: number; y: number; z: number },
  radius: number,
  lobes: number,
  color: number,
  detail: Detail,
): void {
  for (let i = 0; i < lobes; i += 1) {
    const t0 = i / lobes;
    const t1 = (i + 1) / lobes;
    const wob0 = Math.sin(i * 1.7) * radius * 0.22;
    const wob1 = Math.sin((i + 1) * 1.7) * radius * 0.22;
    const p0 = {
      x: lerp(a.x, b.x, t0) + wob0,
      y: lerp(a.y, b.y, t0) + Math.cos(i * 1.3) * radius * 0.18,
      z: lerp(a.z, b.z, t0),
    };
    const p1 = {
      x: lerp(a.x, b.x, t1) + wob1,
      y: lerp(a.y, b.y, t1) + Math.cos((i + 1) * 1.3) * radius * 0.18,
      z: lerp(a.z, b.z, t1),
    };
    buckets.cloth.push(
      tubeBetween(radius * (0.78 + (i % 3) * 0.12), p0, p1, color, Math.max(6, detail.cyl - 2), SLOOP_TUBE),
    );
    if (i > 0 && i % 2 === 0)
      buckets.rope.push(
        tubeBetween(0.014, { ...p0, x: p0.x - 0.17 }, { ...p0, x: p0.x + 0.17 }, 0xc5a778, 5, SLOOP_TUBE),
      );
  }
}

function coil(radius: number, p: { x: number; y: number; z: number }, color: number): BufferGeometry {
  const g = new TorusGeometry(radius, 0.028, 6, 24);
  g.rotateX(Math.PI / 2);
  g.translate(p.x, p.y, p.z);
  worldUv(g, 0.8);
  return paint(g, color);
}

function addMergedMesh(group: Group, name: string, parts: BufferGeometry[], material: Material): Mesh | null {
  if (parts.length === 0) return null;
  const geometry = merge(parts);
  geometry.computeBoundingSphere();
  const mesh = new Mesh(geometry, material);
  mesh.name = name;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

function addFlag(
  group: Group,
  kind: FlagKind,
  cols: number,
  pos: { x: number; y: number; z: number },
  seed: number,
  width = FLAG_W,
  height = FLAG_H,
): FlagRig {
  const geometry = flagGeometry(cols, width, height);
  geometry.translate(pos.x, pos.y, pos.z);
  const base = (geometry.getAttribute('position') as BufferAttribute).array.slice() as Float32Array;
  const texture = new CanvasTexture(drawFlag(kind));
  texture.colorSpace = SRGBColorSpace;
  texture.needsUpdate = true;
  const material = new MeshStandardNodeMaterial({
    map: texture,
    roughness: 0.78,
    metalness: 0,
    side: DoubleSide,
    transparent: false,
  });
  const mesh = new Mesh(geometry, material);
  mesh.name = `${kind} flag`;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return { mesh, geometry, material, texture, base, wave: seeded(seed) * Math.PI * 2 };
}

function flagGeometry(cols: number, width: number, height: number): BufferGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (let x = 0; x <= cols; x += 1) {
    const u = x / cols;
    for (let y = 0; y <= 1; y += 1) {
      positions.push(u * width, (0.5 - y) * height, 0);
      uvs.push(u, y);
    }
  }
  for (let x = 0; x < cols; x += 1) {
    const a = x * 2;
    indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  g.setAttribute('uv', new BufferAttribute(new Float32Array(uvs), 2));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

function updateFlag(flag: FlagRig, t: number): void {
  const pos = flag.geometry.getAttribute('position') as BufferAttribute;
  const uvAttr = flag.geometry.getAttribute('uv') as BufferAttribute;
  for (let i = 0; i < pos.count; i += 1) {
    const u = uvAttr.getX(i);
    pos.setZ(i, flag.base[i * 3 + 2]! + Math.sin(t * 4.2 + flag.wave + u * 7.2) * 0.045 * u);
    pos.setY(i, flag.base[i * 3 + 1]! + Math.sin(t * 3.0 + flag.wave + u * 5.1) * 0.018 * u);
  }
  pos.needsUpdate = true;
  flag.geometry.computeVertexNormals();
}

function addPlaqueNumber(parts: BufferGeometry[], berth: 1 | 2 | 3): void {
  const strokes: Record<1 | 2 | 3, readonly string[]> = {
    1: ['bc', 'cf'],
    2: ['ab', 'bc', 'de', 'ef', 'cd'],
    3: ['ab', 'bc', 'cd', 'cf', 'de'],
  };
  const pts: Record<string, [number, number]> = {
    a: [-0.2, 1.27],
    b: [0.2, 1.27],
    c: [0.2, 1.11],
    d: [0.2, 0.95],
    e: [-0.2, 0.95],
    f: [-0.2, 1.11],
  };
  for (const s of strokes[berth]) {
    const p0 = pts[s[0]!]!;
    const p1 = pts[s[1]!]!;
    const dx = p1[0] - p0[0];
    const dy = p1[1] - p0[1];
    const horizontal = Math.abs(dx) > Math.abs(dy);
    parts.push(
      box(
        horizontal ? Math.abs(dx) + 0.06 : 0.06,
        horizontal ? 0.055 : Math.abs(dy) + 0.06,
        0.018,
        { x: (p0[0] + p1[0]) * 0.5, y: Math.min(p0[1], p1[1]), z: -0.12 },
        0x5f4630,
      ),
    );
  }
}

function flagPalette(kind: FlagKind): { base: string; trim: string; mark: string; text: string } {
  if (kind === 'captain') return { base: '#167a7c', trim: '#f2fbff', mark: '#f4fbff', text: '#f5fbff' };
  if (kind === 'guild') return { base: '#8e1f2a', trim: '#d8a63a', mark: '#f3c65b', text: '#f5d376' };
  return { base: '#15274f', trim: '#d6a84b', mark: '#f5c968', text: '#f5d376' };
}

function drawGull(ctx: CanvasRenderingContext2D, colorText: string): void {
  ctx.strokeStyle = colorText;
  ctx.lineWidth = 16;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(126, 118);
  ctx.bezierCurveTo(172, 62, 214, 72, 256, 126);
  ctx.bezierCurveTo(298, 72, 340, 62, 386, 118);
  ctx.stroke();
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(246, 128);
  ctx.lineTo(266, 128);
  ctx.stroke();
}

function drawKeys(ctx: CanvasRenderingContext2D, colorText: string): void {
  ctx.strokeStyle = colorText;
  ctx.lineWidth = 13;
  ctx.lineCap = 'round';
  for (const rot of [-0.58, 0.58]) {
    ctx.save();
    ctx.translate(256, 118);
    ctx.rotate(rot);
    ctx.beginPath();
    ctx.arc(-58, 0, 24, 0, Math.PI * 2);
    ctx.moveTo(-34, 0);
    ctx.lineTo(92, 0);
    ctx.moveTo(52, 0);
    ctx.lineTo(52, 28);
    ctx.moveTo(78, 0);
    ctx.lineTo(78, 20);
    ctx.stroke();
    ctx.restore();
  }
}

function drawCompass(ctx: CanvasRenderingContext2D, colorText: string): void {
  ctx.fillStyle = colorText;
  ctx.strokeStyle = colorText;
  ctx.lineWidth = 4;
  ctx.save();
  ctx.translate(256, 112);
  for (let i = 0; i < 16; i += 1) {
    const a = (i / 16) * Math.PI * 2;
    const r0 = i % 2 === 0 ? 12 : 22;
    const r1 = i % 2 === 0 ? 72 : 48;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a - 0.08) * r0, Math.sin(a - 0.08) * r0);
    ctx.lineTo(Math.cos(a) * r1, Math.sin(a) * r1);
    ctx.lineTo(Math.cos(a + 0.08) * r0, Math.sin(a + 0.08) * r0);
    ctx.closePath();
    ctx.fill();
  }
  ctx.beginPath();
  ctx.arc(0, 0, 26, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function seeded(seed: number): number {
  const n = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return n - Math.floor(n);
}
