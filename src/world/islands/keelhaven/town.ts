import { mulberry32, segmentDistance, smoothstep } from '../../../util/math';
import { toFrame, type Uv } from './layout';
import { inWorks } from './works';

/**
 * Keelhaven's Old Town, as plain data in the cove frame (u inland, v across; v > 0 the south side):
 * the main street from the quay's root up the town flat to the Evidence Board's square, the houses
 * along it (each facing the street), the tavern at the quay, the footbridge over the Keel River to the
 * shipyard, and the Gate Light on the North Head. No three.js and no height here (the bake's masks
 * read it).
 */

/** The main street's middle line, from the quay's root to the square, and its half-width (m). */
export const STREET: readonly Uv[] = [
  { u: 10, v: 58 },
  { u: 28, v: 51 },
  { u: 46, v: 45 },
  { u: 66, v: 39 },
  { u: 86, v: 33 },
  { u: 100, v: 29 },
];
export const STREET_HALF = 3.2;
/** A lane from the square's south side up the flat, a row of houses either side, and its half-width. */
export const LANE: readonly Uv[] = [
  { u: 113.5, v: 38 },
  { u: 114.5, v: 52 },
  { u: 117, v: 66 },
];
export const LANE_HALF = 2.2;

/** The Evidence Board's square (a rectangle), the board on its north side facing the square. */
export const SQUARE = { u0: 98, u1: 124, v0: 13, v1: 38 } as const;
export const BOARD = { u: 112, v: 16.5 } as const;
/** The square's shade tree (its seat is a ring of stone round it). */
export const SQUARE_TREE = { u: 104.5, v: 21.5 } as const;
/** A footbridge over the Keel River: its line along v (from `v0` to `v1`) at `u`, and its half-width. */
export interface Footbridge {
  readonly u: number;
  readonly v0: number;
  readonly v1: number;
  readonly half: number;
}
/** The footbridge over the Keel River, from the square to the shipyard's gate (v falls north). */
export const BRIDGE: Footbridge = { u: 112, v0: 12, v1: -6, half: 1.6 };
/**
 * The beach footbridge where the river crosses the sand, on the short way between the quay and the
 * lock terrace (the compass's beach route), so the walk back to the ship doesn't go round by the square.
 */
export const BEACH_BRIDGE: Footbridge = { u: 16, v0: 9, v1: -7, half: 1.4 };
/** The path on from the bridge to the yard's edge. */
export const YARD_PATH: readonly Uv[] = [
  { u: 112, v: 12 },
  { u: 112, v: -22 },
];

/** A house of the town: its middle, its size (w along its front, d deep), and the way its front faces. */
export interface TownHouse {
  id: string;
  u: number;
  v: number;
  w: 4 | 6 | 8;
  d: 4 | 6 | 8;
  /** The direction its front faces, in the cove frame (a unit vector). */
  face: Uv;
  storeys: 1 | 2 | 3;
  seed: number;
  /** The tavern, the chandlery: houses with a part in the island's story. */
  role?: 'tavern' | 'chandler' | 'sailmaker' | 'cooper';
  /** In the second row up the flat (Lite and Low leave that row out: PLAN §12.1 tier cuts). */
  back?: boolean;
  /**
   * Its veranda: `front` m deep across its front (0: none), and one on a side too (−1 its left, +1 its
   * right, seen from the street), with a gallery over it on a two-storey house.
   */
  porch: { front: number; side?: -1 | 1; gallery?: boolean };
}

/** The tavern at the quay's landward end, its front to the landing. */
const TAVERN: TownHouse = {
  id: 'tavern',
  u: 22,
  v: 73,
  w: 8,
  d: 8,
  face: { u: -1, v: 0 },
  storeys: 2,
  seed: 31,
  role: 'tavern',
  porch: { front: 2.8, side: 1, gallery: true },
};

/** The houses round the square (the chandlery and the sail loft on it). */
const SQUARE_HOUSES: readonly TownHouse[] = [
  {
    id: 'chandlery',
    u: 131,
    v: 22,
    w: 6,
    d: 8,
    face: { u: -1, v: 0 },
    storeys: 2,
    seed: 41,
    role: 'chandler',
    porch: { front: 2.4, gallery: true },
  },
  {
    id: 'sail-loft',
    u: 130.5,
    v: 34,
    w: 6,
    d: 6,
    face: { u: -1, v: 0 },
    storeys: 2,
    seed: 43,
    role: 'sailmaker',
    porch: { front: 2.2 },
  },
  {
    id: 'square-south',
    u: 108,
    v: 44.5,
    w: 6,
    d: 6,
    face: { u: 0, v: -1 },
    storeys: 1,
    seed: 47,
    porch: { front: 2.2, side: -1 },
  },
  {
    id: 'cooperage',
    u: 119,
    v: 44,
    w: 6,
    d: 4,
    face: { u: 0, v: -1 },
    storeys: 1,
    seed: 53,
    role: 'cooper',
    porch: { front: 0 },
  },
];

/** The footprints sized by the kit's roofs (w × d). */
const FOOTPRINTS: readonly [4 | 6 | 8, 4 | 6 | 8][] = [
  [4, 6],
  [6, 6],
  [6, 8],
  [4, 4],
  [6, 6],
  [4, 8],
  [8, 8],
];

/** The flat's south edge (the wall's toe), and how near the river a house may stand (its middle line). */
const SOUTH_EDGE = 66;
const RIVER_CLEAR = 14;

/** A house's footprint as an oriented rectangle in the cove frame: its corners, round its middle. */
type Box = readonly Uv[];

function boxOf(h: TownHouse, margin: number): Box {
  // Its front faces `face`; its width runs across that, its depth along it. Its verandas widen it.
  const fu = h.face.u;
  const fv = h.face.v;
  // A side veranda widens it both ways (which way is its own builder's business).
  const side = h.porch.side ? h.porch.front || 2.2 : 0;
  const a0 = -(h.w / 2 + margin + side);
  const a1 = h.w / 2 + margin + side;
  const b0 = -(h.d / 2 + margin);
  const b1 = h.d / 2 + margin + h.porch.front;
  const out: Uv[] = [];
  for (const [a, b] of [
    [a0, b0],
    [a1, b0],
    [a1, b1],
    [a0, b1],
  ] as const)
    out.push({ u: h.u + a * -fv + b * fu, v: h.v + a * fu + b * fv });
  return out;
}

/** Whether two convex boxes overlap (separating axes). */
function overlaps(a: Box, b: Box): boolean {
  for (const box of [a, b])
    for (let i = 0; i < box.length; i++) {
      const p = box[i]!;
      const q = box[(i + 1) % box.length]!;
      const nu = -(q.v - p.v);
      const nv = q.u - p.u;
      let a0 = Infinity;
      let a1 = -Infinity;
      let b0 = Infinity;
      let b1 = -Infinity;
      for (const c of a) {
        const d = c.u * nu + c.v * nv;
        a0 = Math.min(a0, d);
        a1 = Math.max(a1, d);
      }
      for (const c of b) {
        const d = c.u * nu + c.v * nv;
        b0 = Math.min(b0, d);
        b1 = Math.max(b1, d);
      }
      if (a1 <= b0 || b1 <= a0) return false;
    }
  return true;
}

/** Whether (u, v) lies inside a convex box (its corners either way round). */
function insideBox(box: Box, u: number, v: number): boolean {
  let pos = false;
  let neg = false;
  for (let i = 0; i < box.length; i++) {
    const p = box[i]!;
    const q = box[(i + 1) % box.length]!;
    const c = (q.u - p.u) * (v - p.v) - (q.v - p.v) * (u - p.u);
    if (c > 0) pos = true;
    else if (c < 0) neg = true;
    if (pos && neg) return false;
  }
  return true;
}

function lineDistance(line: readonly Uv[], u: number, v: number): number {
  let d = Infinity;
  for (let i = 0; i < line.length - 1; i++) {
    const a = line[i]!;
    const b = line[i + 1]!;
    d = Math.min(d, segmentDistance(u, v, a.u, a.v, b.u, b.v));
  }
  return d;
}

/**
 * Distance (m) from (u, v) to the street's middle line, or to the lane's (as if it were as wide as
 * the street: the lane is narrower by that much).
 */
export function streetDistance(u: number, v: number): number {
  return Math.min(lineDistance(STREET, u, v), lineDistance(LANE, u, v) + STREET_HALF - LANE_HALF);
}

/**
 * The town's houses: the tavern and the square's, then a row each side of the main street (fronts to
 * the street, irregular gaps, mixed sizes and heights) and a second row behind the south one up the
 * flat. Seeded; none on the street, the square, the river's banks, the works or another house.
 */
function layOut(): TownHouse[] {
  const rand = mulberry32(0x70a1);
  const houses: TownHouse[] = [TAVERN, ...SQUARE_HOUSES];
  const boxes: Box[] = houses.map((h) => boxOf(h, 1.2));
  const square: Box = [
    { u: SQUARE.u0, v: SQUARE.v0 },
    { u: SQUARE.u1, v: SQUARE.v0 },
    { u: SQUARE.u1, v: SQUARE.v1 },
    { u: SQUARE.u0, v: SQUARE.v1 },
  ];
  const fits = (h: TownHouse) => {
    const box = boxOf(h, 1.2);
    for (const c of box) {
      if (c.v < RIVER_CLEAR || c.v > SOUTH_EDGE || c.u < 4 || c.u > 150) return false;
      if (inWorks(c.u, c.v)) return false;
      if (streetDistance(c.u, c.v) < STREET_HALF + 0.8) return false;
    }
    if (streetDistance(h.u, h.v) < STREET_HALF + 0.8) return false;
    return !boxes.some((o) => overlaps(o, box)) && !overlaps(square, box);
  };
  let n = 0;
  // Three rows up the flat on the south side of the street, two toward the river on the north, and
  // one each side of the lane.
  const ways = [
    {
      line: STREET,
      half: STREET_HALF,
      rows: [
        [1, 0],
        [1, 1],
        [1, 2],
        [-1, 0],
        [-1, 1],
      ],
    },
    {
      line: LANE,
      half: LANE_HALF,
      rows: [
        [1, 0],
        [-1, 0],
        [1, 1],
        [-1, 1],
      ],
    },
  ] as const;
  for (const way of ways)
    for (const [side, row] of way.rows) {
      const line = way.line;
      for (let i = 0; i < line.length - 1; i++) {
        const a = line[i]!;
        const b = line[i + 1]!;
        const len = Math.hypot(b.u - a.u, b.v - a.v);
        const tu = (b.u - a.u) / len;
        const tv = (b.v - a.v) / len;
        // The normal toward +v (the south side).
        const nu = -tv;
        const nv = tu;
        let t = 2 + rand() * 3;
        while (t < len - 2) {
          let [w, d] = FOOTPRINTS[Math.floor(rand() * FOOTPRINTS.length)]!;
          // Most front-row houses have a veranda to the street, a few one on a side too.
          const front = row === 0 && rand() < 0.78 ? 2.1 + rand() * 0.5 : 0;
          const porchSide: -1 | 1 | undefined =
            row === 0 && rand() < 0.22 ? (rand() < 0.5 ? -1 : 1) : undefined;
          const placed = (): boolean => {
            const setBack = way.half + 1.2 + front + rand() * 1.4 + d / 2 + row * (d + 6.5 + rand() * 3);
            const mu = a.u + tu * (t + w / 2) + nu * side * setBack;
            const mv = a.v + tv * (t + w / 2) + nv * side * setBack;
            const h: TownHouse = {
              id: `house-${++n}`,
              u: mu,
              v: mv,
              w,
              d,
              // Fronts face the street; the back row faces the same way, over the front row's roofs.
              face: { u: -nu * side, v: -nv * side },
              // Low houses, a third of them with an upper storey (and some of those a gallery).
              storeys: rand() < 0.36 ? 2 : 1,
              seed: Math.floor(rand() * 1000),
              back: row > 0,
              porch: { front: row > 0 ? 2.2 : front, side: porchSide },
            };
            h.porch.gallery = h.storeys === 2 && h.porch.front > 0 && rand() < 0.6;
            if (!fits(h)) return false;
            houses.push(h);
            boxes.push(boxOf(h, 1.2));
            return true;
          };
          // Where a big house doesn't fit, a small one may.
          let ok = placed();
          if (!ok && w * d > 16) {
            [w, d] = [4, rand() < 0.5 ? 4 : 6];
            ok = placed();
          }
          t += ok ? w + 1.2 + rand() * 3.2 : 2;
        }
      }
    }
  return houses;
}

let houses: TownHouse[] | null = null;

/** The town's houses (laid out once). */
export function townHouses(): readonly TownHouse[] {
  return (houses ??= layOut());
}

/** Whether (u, v) lies on a house or within `margin` m of one. */
export function onHouse(u: number, v: number, margin = 0): boolean {
  for (const h of townHouses()) {
    if (Math.abs(u - h.u) > 11 + margin || Math.abs(v - h.v) > 11 + margin) continue;
    if (insideBox(boxOf(h, margin), u, v)) return true;
  }
  return false;
}

const F = { u: 0, v: 0 };

/**
 * How much trodden ground (0-1) world (x, z) is: the street (worn widest at its middle), the square,
 * the path over the bridge to the yard, and the yards round each house's door.
 */
export function townGroundAt(x: number, z: number): number {
  toFrame(x, z, F);
  const { u, v } = F;
  if (u < 0 || u > 140 || v < -26 || v > 80) return 0;
  let w = 1 - smoothstep(STREET_HALF - 0.6, STREET_HALF + 1.4, streetDistance(u, v));
  const sq = Math.max(SQUARE.u0 - u, 0, u - SQUARE.u1) + Math.max(SQUARE.v0 - v, 0, v - SQUARE.v1);
  w = Math.max(w, 1 - smoothstep(0, 2, sq));
  const a = YARD_PATH[0]!;
  const b = YARD_PATH[1]!;
  w = Math.max(w, 1 - smoothstep(1.2, 2.6, segmentDistance(u, v, a.u, a.v, b.u, b.v)));
  return w;
}

/** Whether (u, v) is in the town: on its trodden ground or a house (plants and flowers keep off). */
export function inTown(u: number, v: number, margin = 0): boolean {
  if (onHouse(u, v, margin + 0.8)) return true;
  if (streetDistance(u, v) < STREET_HALF + 1 + margin) return true;
  if (u > SQUARE.u0 - margin && u < SQUARE.u1 + margin && v > SQUARE.v0 - margin && v < SQUARE.v1 + margin)
    return true;
  if (Math.abs(u - BEACH_BRIDGE.u) < 3 + margin && v < BEACH_BRIDGE.v0 + 2 && v > BEACH_BRIDGE.v1 - 2)
    return true;
  return Math.abs(u - BRIDGE.u) < 2.6 + margin && v < SQUARE.v0 && v > -22;
}

/**
 * The Gate Light on the North Head: the tower's foot (cove frame) on its levelled bench (`PADS.light`),
 * where its lamp is in sight from the beach, the quay, the yard and the sea off the cove's mouth.
 */
export const GATE_LIGHT = { u: -231, v: -157, y: 44, keeper: { u: -230, v: -146 } } as const;

/**
 * The town's paint (sRGB, as you see it): faded pastel walls (sea-green, salmon, butter-yellow,
 * sky-blue, white), and roofs of red-oxide, galvanised or rusting tin, or silver shingle.
 */
const WALLS = [
  0x9fcdb8, 0xe8a58c, 0xefd890, 0x9cc3dc, 0xece6d8, 0xb9dcc4, 0xe9b9a2, 0xa8d4cf, 0xf0dca8,
] as const;
const TIN = [0xa8503a, 0xb86a52, 0xb8bcbc, 0x8e5a3e, 0x6e8f78, 0xa8503a, 0x9aa3a6] as const;
const SHINGLE = 0x9f9b92;

/** A house's own look (seeded by the house): what the town builds and what its far silhouette shows. */
export interface TownHouseLook {
  wall: number;
  roof: number;
  shingle: boolean;
  hip: boolean;
  /** A gable roof's ridge along its depth (its gable to the street). */
  along: boolean;
  pitch: number;
}

export function townHouseLook(h: TownHouse): TownHouseLook {
  const r = mulberry32(h.seed * 977 + 0x51);
  const pick = <T>(list: readonly T[]): T => list[Math.floor(r() * list.length)]!;
  const tavern = h.role === 'tavern';
  const wall = tavern ? 0xece6d8 : pick(WALLS);
  const shingle = !tavern && r() < 0.22;
  const roof = tavern ? 0xa8503a : shingle ? SHINGLE : pick(TIN);
  return {
    wall,
    roof,
    shingle,
    hip: tavern || r() < 0.55,
    along: h.w === 4 && r() < 0.6,
    pitch: 0.62 + r() * 0.16,
  };
}
