import { BufferAttribute, BufferGeometry, Color } from 'three/webgpu';
import { HOUSE_STOREY_HEIGHT, type HouseSide } from '../../village/house-builder';
import type { MaterialKey, VillageKit } from '../../village/kit';
import { box, cone, lanternPaint, rod, rope, type Buckets } from '../../village/pieces';
import { addVerandaHouse, tintFor } from '../../village/veranda-house';
import { mulberry32 } from '../../../util/math';
import { keelhavenHeight } from './height';
import { GATE_PATH, GATE_PATH_HALF } from './works';
import { FRAME, toFrame, toWorld, type Uv } from './layout';
import { lineDeck, type WalkDeck } from './decks';
import { YARD_PAINT, at, ground, ropeCoil, stores, ubox, YAW_U, type ShipyardOut } from './shipyard';
import {
  BOARD,
  BRIDGE,
  GATE_LIGHT,
  SQUARE,
  SQUARE_TREE,
  STREET,
  townHouseLook,
  townHouses,
  type TownHouse,
} from './town';

/**
 * Keelhaven's Old Town and the Gate Light (spec §3.5, §3.7, in the merged cove frame): kit houses on
 * stone plinths along the main street from the quay to the Evidence Board's square, each with its
 * own weathering (an awning, a lantern by the door, a lean-to with a patched plank roof, crates and
 * casks, nets drying), the tavern at the quay, lamp posts down the street, a well and the Evidence
 * Board (blank name boards: the course's words come from its pack later) on the square, the
 * footbridge over the Keel River to the shipyard, and the Gate Light tower and its keeper's house on
 * the North Head. All in the village kit's materials (no new shader).
 */

const SHUTTERS = [0x3f7a5a, 0x2f7f86, 0x4f78a8, 0xa94a3c, 0x2e5d4b, 0xd9b24a, 0xf2efe6] as const;
const TRIM = [0xf2efe6, 0xf2efe6, 0xf2efe6, 0xe8dcc0] as const;
const AWNINGS = [
  [0xb85a3c, 0xefe6d2],
  [0x3f6e7a, 0xefe6d2],
  [0x9c7a3a, 0xe8dcc0],
  [0x6f8a4a, 0xefe6d2],
] as const;

const pick = <T>(list: readonly T[], r: number): T => list[Math.floor(r * list.length)]!;

const DF = { u: 0, v: 0 };

/** A veranda's deck (world, `VerandaHouseInfo.decks`) as a walk deck in the cove frame. */
function verandaDeck(d: {
  x: number;
  z: number;
  ax: number;
  az: number;
  half: number;
  width: number;
  y: number;
}): WalkDeck {
  toFrame(d.x, d.z, DF);
  const au = d.ax * FRAME.axis.x + d.az * FRAME.axis.z;
  const av = d.ax * FRAME.across.x + d.az * FRAME.across.z;
  return { u: DF.u, v: DF.v, au, av, half: d.half, width: d.width, y0: d.y, y1: d.y, wood: true };
}

/** A heading (yaw) whose local −z (a house's front) faces cove-frame direction `face`. */
function faceYaw(face: Uv): number {
  const dx = face.u * FRAME.axis.x + face.v * FRAME.across.x;
  const dz = face.u * FRAME.axis.z + face.v * FRAME.across.z;
  return Math.atan2(-dx, -dz);
}

/** A point `side` m across and `out` m in front of a house's middle (cove frame; across is (−face.v, face.u)). */
function housePoint(h: TownHouse, side: number, out: number): Uv {
  return { u: h.u + h.face.u * out + -h.face.v * side, v: h.v + h.face.v * out + h.face.u * side };
}

/** A house's foot: the ground under its corners, and the floor level it stands at (a plinth fills the rest). */
function footOf(h: TownHouse): { low: number; base: number } {
  let low = Infinity;
  let high = -Infinity;
  for (const [a, b] of [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
    [0, 0],
  ] as const) {
    const p = housePoint(h, (a * h.w) / 2, (b * h.d) / 2);
    const g = ground(p.u, p.v);
    low = Math.min(low, g);
    high = Math.max(high, g);
  }
  return { low, base: high + 0.18 };
}

/** One house: a coral-stone plinth to the ground, the kit's walls and roof, and its own weathering. */
function house(
  b: Buckets,
  kit: VillageKit,
  out: ShipyardOut,
  h: TownHouse,
  lite: boolean,
  sparse: boolean,
  seed: number,
): void {
  const rand = mulberry32(seed);
  const { low, base } = footOf(h);
  const yaw = faceYaw(h.face);
  const c = at(h.u, 0, h.v);
  // The plinth: from under the lowest ground to the floor, a hand wider than the walls.
  box(
    b,
    'stone',
    c.x,
    (low - 0.4 + base) / 2,
    c.z,
    h.w + 0.5,
    base - low + 0.4,
    h.d + 0.5,
    yaw,
    YARD_PAINT.stone,
  );
  const tavern = h.role === 'tavern';
  const yard = !!h.role && !tavern;
  const sides: HouseSide[] = [];
  if (h.porch.front > 0) sides.push('front');
  // Seen from the street, the house's left is its local +x (its front faces local −z).
  if (h.porch.side) sides.push(h.porch.side < 0 ? 'right' : 'left');
  const look = townHouseLook(h);
  const info = addVerandaHouse(b, kit, {
    footprint: { w: h.w, d: h.d },
    storeys: h.storeys === 3 ? 2 : h.storeys,
    origin: { x: c.x, y: base, z: c.z },
    rotY: yaw,
    seed: h.seed,
    walls: tavern || yard ? 'plaster' : h.w === 4 || rand() < 0.4 ? 'boards' : 'plaster',
    wall: look.wall,
    trim: pick(TRIM, rand()),
    shutter: tavern ? 0x2f7f86 : pick(SHUTTERS, rand()),
    door: pick(SHUTTERS, rand()),
    roof: {
      shape: look.hip ? 'hip' : 'gable',
      ridge: look.along ? 'along' : 'across',
      cover: look.shingle ? 'shingle' : 'tin',
      colour: look.roof,
      pitch: look.pitch,
    },
    veranda: sides.length ? { sides, depth: h.porch.front || 2.2, gallery: h.porch.gallery } : undefined,
    windows: sparse ? 'sparse' : rand() < 0.5 ? 'regular' : 'busy',
    weather: lite ? 0.6 : 0.45 + rand() * 0.5,
    lite,
    groundAt: (x, z) => keelhavenHeight(x, z),
  });
  for (const p of info.posts)
    out.circles.push({ x: p.x, z: p.z, r: 0.14, y0: low - 0.5, y1: base + 3, height: 3 });
  for (const d of info.decks) out.decks.push(verandaDeck(d));
  const top = info.top;
  const eave = base + h.storeys * HOUSE_STOREY_HEIGHT;
  if (tavern) {
    // A flagstaff off its roof's peak, its flag out over the quay (it reads from the cove's mouth).
    rod(
      b,
      'wood',
      { x: c.x, y: top - 0.4, z: c.z },
      { x: c.x, y: top + 6.5, z: c.z },
      0.08,
      6,
      YARD_PAINT.tar,
      0.05,
    );
    const fy = top + 5.6;
    const flagYaw = yaw + Math.PI / 2;
    const fx = Math.cos(flagYaw);
    const fz = -Math.sin(flagYaw);
    box(b, 'cloth', c.x + fx * 1.25, fy, c.z + fz * 1.25, 2.4, 1.5, 0.03, flagYaw, 0xb8322a);
    box(b, 'cloth', c.x + fx * 1.25, fy, c.z + fz * 1.25, 2.42, 0.32, 0.035, flagYaw, 0xf2efe6);
  }
  out.colliders.push({ x: c.x, z: c.z, hx: h.w * 0.52, hz: h.d * 0.52, rot: yaw, height: eave - base + 2 });
  out.cameraBoxes.push({
    x: c.x,
    z: c.z,
    hx: h.w * 0.5 + 0.35,
    hz: h.d * 0.5 + 0.35,
    rot: yaw,
    y0: base - 0.5,
    y1: top,
  });
  // Steps up to the door where the floor stands over the street.
  const rise = base - ground(housePoint(h, 0, h.d / 2 + 0.9).u, housePoint(h, 0, h.d / 2 + 0.9).v);
  const front = (k: number) => housePoint(h, 0, h.d / 2 + 0.25 + k);
  for (let k = 0; h.porch.front === 0 && rise > 0.3 && k < Math.ceil(rise / 0.22); k++) {
    const p = front(0.35 + k * 0.32);
    const y = base - (k + 1) * 0.22;
    ubox(
      b,
      'stone',
      p.u,
      (y + base - k * 0.22) / 2 - 0.11,
      p.v,
      0.34,
      0.22 + 0.01 * k,
      1.6,
      YARD_PAINT.stone,
      yaw - YAW_U + Math.PI / 2,
    );
  }
  if (lite) return;
  // A lantern on a bracket by the door (lower under a veranda's roof).
  const porch = h.porch.front > 0;
  const lamp = housePoint(h, h.w * 0.25 + 0.4, h.d / 2 + 0.28);
  const lp = at(lamp.u, base + (porch && h.storeys === 1 ? 2.05 : 2.5), lamp.v);
  const glow = box(b, 'glow', lp.x, lp.y, lp.z, 0.2, 0.28, 0.2, yaw, 0xffffff);
  lanternPaint(glow, 4.2);
  cone(b, 'metal', lp.x, lp.y + 0.14, lp.z, 0.18, 0.15, 6, YARD_PAINT.iron);
  const wall = at(
    housePoint(h, h.w * 0.25 + 0.4, h.d / 2 + 0.02).u,
    lp.y + 0.35,
    housePoint(h, h.w * 0.25 + 0.4, h.d / 2 + 0.02).v,
  );
  rod(b, 'metal', wall, { x: lp.x, y: lp.y + 0.3, z: lp.z }, 0.02, 3, YARD_PAINT.iron);
  out.cameraBoxes.push({ x: lp.x, z: lp.z, hx: 0.2, hz: 0.2, rot: yaw, y0: lp.y - 0.2, y1: lp.y + 0.35 });
  // An awning over the door: striped canvas sloping out on two posts.
  if (!porch && rand() < 0.55) {
    const [c0, c1] = AWNINGS[Math.floor(rand() * AWNINGS.length)]!;
    const width = Math.min(h.w - 0.6, tavern ? 7 : 3.4);
    const depth = tavern ? 2.6 : 1.8;
    const slats = Math.round(width / 0.5);
    const mid = housePoint(h, 0, h.d / 2 + depth / 2 + 0.1);
    const pitch = 0.32;
    for (let k = 0; k < slats; k++) {
      const off = (k + 0.5 - slats / 2) * (width / slats);
      const p = { u: mid.u + -h.face.v * off, v: mid.v + h.face.u * off };
      // Its outer edge (the front, local −z) lower than its edge on the wall.
      ubox(
        b,
        'cloth',
        p.u,
        base + 2.55,
        p.v,
        width / slats + 0.005,
        0.04,
        depth,
        k % 2 ? c1 : c0,
        yaw - YAW_U,
        -pitch,
      );
    }
    for (const s of [-width / 2, width / 2]) {
      const p = housePoint(h, s, h.d / 2 + depth);
      const g = ground(p.u, p.v);
      const q = at(p.u, g, p.v);
      rod(
        b,
        'wood',
        { x: q.x, y: g - 0.2, z: q.z },
        { x: q.x, y: base + 2.3, z: q.z },
        0.07,
        6,
        YARD_PAINT.weathered,
      );
      out.circles.push({ x: q.x, z: q.z, r: 0.15, y0: g - 0.5, y1: base + 2.3, height: 2.4 });
    }
    out.cameraBoxes.push({
      ...toWorld(mid.u, mid.v),
      hx: width / 2,
      hz: depth / 2,
      rot: yaw,
      y0: base + 2.2,
      y1: base + 2.9,
    });
  }
  // A lean-to on a side wall: posts, and a plank roof patched with newer and older boards.
  if (!h.porch.side && rand() < 0.4) {
    const side = rand() < 0.5 ? -1 : 1;
    const len = h.d - 1;
    const mid = housePoint(h, side * (h.w / 2 + 1.1), 0);
    const g = ground(mid.u, mid.v);
    const yRoof = Math.max(base, g) + 2.3;
    for (const along of [-len / 2, len / 2]) {
      const p = housePoint(h, side * (h.w / 2 + 2.0), along);
      const pg = ground(p.u, p.v);
      const q = at(p.u, 0, p.v);
      rod(
        b,
        'wood',
        { x: q.x, y: pg - 0.2, z: q.z },
        { x: q.x, y: yRoof - 0.1, z: q.z },
        0.08,
        6,
        YARD_PAINT.weathered,
      );
      out.circles.push({ x: q.x, z: q.z, r: 0.15, y0: pg - 0.5, y1: yRoof, height: 2.2 });
    }
    const boards = Math.round(len / 0.3);
    for (let k = 0; k < boards; k++) {
      const along = (k + 0.5 - boards / 2) * (len / boards);
      const p = housePoint(h, side * (h.w / 2 + 1.05), along);
      const patch = rand();
      const colour = patch < 0.15 ? YARD_PAINT.oak : patch < 0.3 ? YARD_PAINT.tar : YARD_PAINT.silver;
      // Boards out from the wall, sloping down away from it.
      ubox(
        b,
        'wood',
        p.u,
        yRoof + (patch < 0.15 ? 0.03 : 0),
        p.v,
        2.3,
        0.05,
        len / boards - 0.02,
        colour,
        yaw - YAW_U,
        0,
        -side * 0.28,
      );
    }
    stores(b, mid.u, mid.v, Math.max(g, low), seed + 7);
  } else if (rand() < 0.5) {
    const p = housePoint(h, -(h.w / 2 + 1.0), h.d / 2 - 0.5);
    stores(b, p.u, p.v, ground(p.u, p.v), seed + 9);
  }
  // Nets drying on a frame by the houses near the beach.
  if (h.u < 60 && rand() < 0.5) {
    const p = housePoint(h, h.w / 2 + 1.6, h.d / 2 + 1.2);
    nets(b, out, p.u, p.v, ground(p.u, p.v), yaw - YAW_U, seed + 11);
  }
}

/** A fishing net drying: two poles and a rail, the net sagging off it and a float line along its foot. */
function nets(
  b: Buckets,
  out: ShipyardOut,
  u: number,
  v: number,
  y: number,
  yaw: number,
  seed: number,
): void {
  const rand = mulberry32(seed);
  const len = 3.2;
  const du = Math.cos(yaw) * (len / 2);
  const dv = -Math.sin(yaw) * (len / 2);
  const a = at(u - du, y, v - dv);
  const e = at(u + du, y, v + dv);
  for (const p of [a, e]) {
    rod(
      b,
      'wood',
      { x: p.x, y: y - 0.2, z: p.z },
      { x: p.x, y: y + 2.3, z: p.z },
      0.06,
      5,
      YARD_PAINT.weathered,
    );
    out.circles.push({ x: p.x, z: p.z, r: 0.12, y0: y - 0.5, y1: y + 2.3, height: 2.3 });
  }
  rod(
    b,
    'wood',
    { x: a.x, y: y + 2.2, z: a.z },
    { x: e.x, y: y + 2.2, z: e.z },
    0.04,
    4,
    YARD_PAINT.weathered,
  );
  // The net: a mesh of thin cords sagging off the rail (a solid sheet read as a dark board).
  const rows = 6;
  const cols = 9;
  const pts: { x: number; y: number; z: number }[] = [];
  const nx = Math.sin(yaw) * 0.25;
  const nz = Math.cos(yaw) * 0.25;
  for (let r = 0; r < rows; r++)
    for (let k = 0; k < cols; k++) {
      const t = k / (cols - 1);
      const sag = 0.3 * Math.sin(t * Math.PI) * (r / (rows - 1));
      const yy = y + 2.18 - (r / (rows - 1)) * (1.5 + rand() * 0.1) - sag;
      const out2 = (r / (rows - 1)) * (0.3 + rand() * 0.1);
      pts.push({ x: a.x + (e.x - a.x) * t + nx * out2, y: yy, z: a.z + (e.z - a.z) * t + nz * out2 });
    }
  const cord = 0xb9a77c;
  for (let r = 0; r < rows; r++)
    for (let k = 0; k < cols - 1; k++)
      rod(b, 'rope', pts[r * cols + k]!, pts[r * cols + k + 1]!, 0.012, 3, cord, 0.012, true);
  for (let k = 0; k < cols; k++)
    for (let r = 0; r < rows - 1; r++)
      rod(b, 'rope', pts[r * cols + k]!, pts[(r + 1) * cols + k]!, 0.012, 3, cord, 0.012, true);
  // Cork floats along its foot.
  for (let k = 0; k < 5; k++) {
    const t = (k + 0.5) / 5;
    const p = pts[(rows - 1) * cols + Math.round(t * (cols - 1))]!;
    box(b, 'wood', p.x, p.y - 0.04, p.z, 0.12, 0.08, 0.12, yaw, YARD_PAINT.ochre);
  }
}

/** A lamp post's arm yaw for its arm to reach toward cove-frame direction (du, dv). */
function armYaw(du: number, dv: number): number {
  const dx = du * FRAME.axis.x + dv * FRAME.across.x;
  const dz = du * FRAME.axis.z + dv * FRAME.across.z;
  return Math.atan2(-dz, dx);
}

/** A lamp post: a tarred post, an arm, a lantern hanging from it. */
function lampPost(b: Buckets, out: ShipyardOut, u: number, v: number, armYaw: number): void {
  const g = ground(u, v);
  const p = at(u, g, v);
  rod(b, 'wood', { x: p.x, y: g - 0.3, z: p.z }, { x: p.x, y: g + 3.4, z: p.z }, 0.09, 6, YARD_PAINT.tar);
  const arm = { x: p.x + Math.cos(armYaw) * 0.7, y: g + 3.3, z: p.z - Math.sin(armYaw) * 0.7 };
  rod(b, 'wood', { x: p.x, y: g + 3.3, z: p.z }, arm, 0.04, 4, YARD_PAINT.tar);
  const glow = box(b, 'glow', arm.x, arm.y - 0.45, arm.z, 0.22, 0.3, 0.22, armYaw, 0xffffff);
  lanternPaint(glow, 4.6);
  cone(b, 'metal', arm.x, arm.y - 0.3, arm.z, 0.2, 0.16, 6, YARD_PAINT.iron);
  rod(b, 'metal', arm, { x: arm.x, y: arm.y - 0.3, z: arm.z }, 0.015, 3, YARD_PAINT.iron);
  out.circles.push({ x: p.x, z: p.z, r: 0.2, y0: g - 0.5, y1: g + 3.4, height: 3.4 });
}

/**
 * The Evidence Board: a tall timber board under a little roof, crowded with the name boards the
 * shipwrights pulled off the wrecks (blank here, in faded paints: their names are the course's), and
 * a bench in front of it.
 */
function evidenceBoard(b: Buckets, out: ShipyardOut): void {
  const { u, v } = BOARD;
  const g = ground(u, v);
  const w = 4.6;
  const yaw = faceYaw({ u: 0, v: 1 });
  for (const s of [-w / 2, w / 2]) {
    const p = at(u + s, g, v);
    rod(b, 'wood', { x: p.x, y: g - 0.4, z: p.z }, { x: p.x, y: g + 3.9, z: p.z }, 0.12, 6, YARD_PAINT.tar);
  }
  ubox(b, 'wood', u, g + 2.2, v - 0.02, w, 2.6, 0.1, YARD_PAINT.weathered);
  // Its roof: two plank slopes.
  for (const side of [-1, 1])
    ubox(b, 'wood', u, g + 4.05, v + side * 0.35, w + 0.8, 0.06, 0.85, YARD_PAINT.silver, 0, side * -0.55);
  // The name boards, each a different length and faded colour, some askew.
  const rand = mulberry32(0xb0a7d);
  const paints = [0x2f4f6f, 0x7a2e24, 0x1f3a2a, 0x5a4a32, 0xe0d4b8, 0x6b2e4a, 0x3a3a3a];
  for (let row = 0; row < 5; row++)
    for (let k = 0; k < 3; k++) {
      if (rand() < 0.15) continue;
      const len = 0.9 + rand() * 0.6;
      const du = (k - 1) * 1.45 + (rand() - 0.5) * 0.3;
      const y = g + 1.15 + row * 0.47;
      ubox(
        b,
        'wood',
        u + du,
        y,
        v + 0.07 + (k % 2) * 0.012,
        len,
        0.28,
        0.04,
        paints[Math.floor(rand() * paints.length)]!,
        0,
        0,
        (rand() - 0.5) * 0.16,
      );
    }
  out.colliders.push({ ...toWorld(u, v), hx: w / 2 + 0.2, hz: 0.3, rot: YAW_U, height: 4 });
  out.cameraBoxes.push({ ...toWorld(u, v), hx: w / 2 + 0.3, hz: 0.5, rot: YAW_U, y0: g, y1: g + 4.3 });
  // A bench facing it.
  const bench = { u, v: v + 3.2 };
  const bg = ground(bench.u, bench.v);
  ubox(b, 'wood', bench.u, bg + 0.45, bench.v, 2.4, 0.08, 0.42, YARD_PAINT.silver);
  for (const s of [-1, 1])
    ubox(b, 'wood', bench.u + s, bg + 0.21, bench.v, 0.1, 0.46, 0.38, YARD_PAINT.weathered);
  void yaw;
}

/** The well in the square: a stone ring, a timber frame, a bucket on its rope. */
function well(b: Buckets, out: ShipyardOut, u: number, v: number): void {
  const g = ground(u, v);
  const p = at(u, g, v);
  rod(b, 'stone', { x: p.x, y: g - 0.3, z: p.z }, { x: p.x, y: g + 0.8, z: p.z }, 1.1, 12, YARD_PAINT.stone);
  rod(b, 'stone', { x: p.x, y: g + 0.8, z: p.z }, { x: p.x, y: g + 0.82, z: p.z }, 0.92, 12, 0x3a3f42);
  for (const s of [-1, 1]) {
    const q = at(u + s * 0.95, g, v);
    rod(b, 'wood', { x: q.x, y: g + 0.7, z: q.z }, { x: q.x, y: g + 2.4, z: q.z }, 0.07, 5, YARD_PAINT.tar);
  }
  const a = at(u - 1.05, g + 2.3, v);
  const e = at(u + 1.05, g + 2.3, v);
  rod(b, 'wood', a, e, 0.06, 6, YARD_PAINT.weathered);
  rod(b, 'rope', { x: p.x, y: g + 2.25, z: p.z }, { x: p.x, y: g + 1.3, z: p.z }, 0.015, 3, YARD_PAINT.rope);
  rod(
    b,
    'wood',
    { x: p.x, y: g + 1.0, z: p.z },
    { x: p.x, y: g + 1.3, z: p.z },
    0.16,
    8,
    YARD_PAINT.weathered,
    0.19,
  );
  out.circles.push({ x: p.x, z: p.z, r: 1.2, y0: g - 0.5, y1: g + 0.9, height: 0.9 });
}

/** The footbridge over the Keel River: plank deck on two stringers and stone abutments, rails each side. */
function footbridge(b: Buckets, out: ShipyardOut): void {
  const { u, v0, v1, half } = BRIDGE;
  const g0 = ground(u, v0);
  const g1 = ground(u, v1);
  const y0 = g0 + 0.25;
  const y1 = g1 + 0.25;
  const mid = (v0 + v1) / 2;
  const yMid = Math.max(y0, y1) + 0.5;
  const yAt = (v: number) => {
    const t = (v - v0) / (v1 - v0);
    return y0 + (y1 - y0) * t + (yMid - (y0 + y1) / 2) * Math.sin(t * Math.PI);
  };
  const n = Math.round(Math.abs(v1 - v0) / 0.35);
  for (let k = 0; k < n; k++) {
    const v = v0 + ((k + 0.5) / n) * (v1 - v0);
    ubox(
      b,
      'wood',
      u,
      yAt(v),
      v,
      half * 2,
      0.08,
      Math.abs(v1 - v0) / n - 0.025,
      k % 5 ? YARD_PAINT.silver : YARD_PAINT.oak,
    );
  }
  for (let k = 0; k < 8; k++) {
    const va = v0 + (k / 8) * (v1 - v0);
    const vb = v0 + ((k + 1) / 8) * (v1 - v0);
    out.decks.push(lineDeck([u, va, yAt(va) + 0.04], [u, vb, yAt(vb) + 0.04], half - 0.1, true));
  }
  for (const s of [-1, 1]) {
    let prev: { x: number; y: number; z: number } | null = null;
    for (let k = 0; k <= 6; k++) {
      const v = v0 + (k / 6) * (v1 - v0);
      const p = at(u + s * (half - 0.15), yAt(v) - 0.25, v);
      if (prev) rod(b, 'wood', prev, p, 0.1, 5, YARD_PAINT.tar);
      const top = { x: p.x, y: yAt(v) + 1.0, z: p.z };
      rod(b, 'wood', { x: p.x, y: yAt(v), z: p.z }, top, 0.05, 5, YARD_PAINT.weathered);
      if (k > 0)
        rod(
          b,
          'wood',
          { x: prev!.x, y: yAt(v - (v1 - v0) / 6) + 1.0, z: prev!.z },
          top,
          0.04,
          5,
          YARD_PAINT.weathered,
        );
      prev = p;
    }
    const m = at(u + s * (half - 0.15), 0, mid);
    out.colliders.push({
      x: m.x,
      z: m.z,
      hx: 0.12,
      hz: Math.abs(v1 - v0) / 2,
      rot: YAW_U,
      y0: Math.min(y0, y1) - 0.5,
      y1: yMid + 1.3,
      height: 1,
    });
  }
  for (const [v, g] of [
    [v0, g0],
    [v1, g1],
  ] as const)
    ubox(b, 'stone', u, g - 0.3, v, half * 2 + 0.6, 1.1, 1.2, YARD_PAINT.stone);
}

/** Paint a piece so it reads `hex` over its material's texture (see `tintFor`). */
function repaint(g: BufferGeometry, key: MaterialKey, hex: number, k = 1): BufferGeometry {
  const [r, gg, bl] = tintFor(key, hex, k);
  const c = g.getAttribute('color');
  for (let i = 0; i < c.count; i++) c.setXYZ(i, r, gg, bl);
  c.needsUpdate = true;
  return g;
}

/**
 * The Gate Light: the island's landmark, where the Trial is held. A tall tapering tower in white and
 * red bands on the North Head's bench (it reads from the quay and from the sea off the cove's mouth),
 * a corbelled gallery with an iron rail, the lantern room's glass (bright warm white: by day it
 * catches the sun, by night it's the light) under a brass dome and vane, slit windows up the tower,
 * its door, and the keeper's house beside it.
 */
function gateLight(b: Buckets, kit: VillageKit, out: ShipyardOut, lite: boolean): void {
  const L = GATE_LIGHT;
  const p = at(L.u, L.y, L.v);
  const seg = lite ? 12 : 20;
  const foot = L.y - 1.2;
  const r0 = 4.4;
  const r1 = 3.1;
  const height = 27;
  const radius = (y: number) => r0 + (r1 - r0) * ((y - L.y) / height);
  // The shaft in bands: white, with three red bands (the top one under the gallery).
  const bands: [number, number, number][] = [
    [foot, L.y + 1.4, YARD_PAINT.stone],
    [L.y + 1.4, L.y + 8, 0xf4efe6],
    [L.y + 8, L.y + 11.5, 0xc4382a],
    [L.y + 11.5, L.y + 16.5, 0xf4efe6],
    [L.y + 16.5, L.y + 20, 0xc4382a],
    [L.y + 20, L.y + 23.6, 0xf4efe6],
    [L.y + 23.6, L.y + height, 0xc4382a],
  ];
  bands.forEach(([y0, y1, colour], i) => {
    const key: MaterialKey = i === 0 ? 'stone' : 'plaster';
    const g = rod(
      b,
      key,
      { x: p.x, y: y0, z: p.z },
      { x: p.x, y: y1, z: p.z },
      radius(Math.max(y0, L.y)),
      seg,
      colour,
      radius(y1),
      i > 0,
    );
    if (key === 'plaster') repaint(g, key, colour);
  });
  const top = L.y + height;
  // The gallery: a corbelled stone ring, its floor, and the rail round it.
  repaint(
    rod(
      b,
      'plaster',
      { x: p.x, y: top - 0.6, z: p.z },
      { x: p.x, y: top, z: p.z },
      r1 + 0.05,
      seg,
      0xf4efe6,
      r1 + 1.1,
    ),
    'plaster',
    0xf4efe6,
  );
  repaint(
    rod(b, 'plaster', { x: p.x, y: top, z: p.z }, { x: p.x, y: top + 0.3, z: p.z }, r1 + 1.15, seg, 0xf4efe6),
    'plaster',
    0xf4efe6,
  );
  const railR = r1 + 1.0;
  for (let k = 0; k < seg; k++) {
    const a0 = (k / seg) * Math.PI * 2;
    const a1 = ((k + 1) / seg) * Math.PI * 2;
    const q0 = { x: p.x + Math.cos(a0) * railR, y: top + 1.35, z: p.z + Math.sin(a0) * railR };
    const q1 = { x: p.x + Math.cos(a1) * railR, y: top + 1.35, z: p.z + Math.sin(a1) * railR };
    rod(b, 'metal', q0, q1, 0.05, 4, 0x2e3a36);
    rod(b, 'metal', { x: q0.x, y: top + 0.3, z: q0.z }, q0, 0.035, 4, 0x2e3a36);
  }
  // The lantern room: a low wall, the glass with its astragals, a brass dome, a ball and a vane.
  const lr = 2.15;
  repaint(
    rod(
      b,
      'plaster',
      { x: p.x, y: top + 0.3, z: p.z },
      { x: p.x, y: top + 1.3, z: p.z },
      lr + 0.15,
      seg,
      0xc4382a,
    ),
    'plaster',
    0xc4382a,
  );
  const glass = rod(
    b,
    'glow',
    { x: p.x, y: top + 1.3, z: p.z },
    { x: p.x, y: top + 5.1, z: p.z },
    lr,
    seg,
    0xffffff,
  );
  const col = glass.getAttribute('color');
  // Bright enough to read warm white by day (the glow material shows its paint at 0.18 in daylight).
  for (let i = 0; i < col.count; i++) col.setXYZ(i, 6.2, 5.8, 4.6);
  // The lens inside, brighter still.
  const lens = rod(
    b,
    'glow',
    { x: p.x, y: top + 2.0, z: p.z },
    { x: p.x, y: top + 4.2, z: p.z },
    0.9,
    lite ? 8 : 12,
    0xffffff,
    0.75,
  );
  lanternPaint(lens, 7.5);
  for (let k = 0; k < (lite ? 6 : 10); k++) {
    const a = (k / (lite ? 6 : 10)) * Math.PI * 2;
    const q = { x: p.x + Math.cos(a) * (lr + 0.02), z: p.z + Math.sin(a) * (lr + 0.02) };
    rod(b, 'metal', { x: q.x, y: top + 1.3, z: q.z }, { x: q.x, y: top + 5.1, z: q.z }, 0.06, 4, 0x2e3a36);
  }
  rod(
    b,
    'metal',
    { x: p.x, y: top + 5.1, z: p.z },
    { x: p.x, y: top + 5.35, z: p.z },
    lr + 0.35,
    seg,
    0x2e3a36,
  );
  cone(b, 'metal', p.x, top + 5.35, p.z, lr + 0.25, 1.9, seg, 0xc9a24a);
  rod(
    b,
    'metal',
    { x: p.x, y: top + 7.1, z: p.z },
    { x: p.x, y: top + 7.6, z: p.z },
    0.28,
    8,
    0xc9a24a,
    0.05,
  );
  rod(
    b,
    'metal',
    { x: p.x, y: top + 7.2, z: p.z },
    { x: p.x, y: top + 9.2, z: p.z },
    0.05,
    4,
    YARD_PAINT.iron,
  );
  box(b, 'metal', p.x + 0.35, top + 8.7, p.z, 0.7, 0.25, 0.03, YAW_U + 0.6, YARD_PAINT.iron);
  // Its door (to the keeper's side) and slit windows climbing round the tower.
  const toKeeper = Math.atan2(at(L.keeper.u, 0, L.keeper.v).z - p.z, at(L.keeper.u, 0, L.keeper.v).x - p.x);
  const dr = radius(L.y) + 0.05;
  box(
    b,
    'wood',
    p.x + Math.cos(toKeeper) * dr,
    L.y + 1.2,
    p.z + Math.sin(toKeeper) * dr,
    1.3,
    2.4,
    0.2,
    -toKeeper - Math.PI / 2,
    YARD_PAINT.tar,
  );
  for (let k = 0; k < 5; k++) {
    const a = toKeeper + 0.9 + k * 1.3;
    const y = L.y + 5 + k * 4.2;
    const rr = radius(y) + 0.02;
    const w = box(
      b,
      'glow',
      p.x + Math.cos(a) * rr,
      y,
      p.z + Math.sin(a) * rr,
      0.45,
      1.1,
      0.12,
      -a - Math.PI / 2,
      0xffffff,
    );
    lanternPaint(w, 2.2);
  }
  out.colliders.push({ x: p.x, z: p.z, hx: r0 + 0.2, hz: r0 + 0.2, rot: 0, height: height + 2 });
  out.cameraBoxes.push({ x: p.x, z: p.z, hx: r0, hz: r0, rot: 0, y0: foot, y1: top + 8 });
  // The keeper's house beside it.
  const k = at(L.keeper.u, L.y, L.keeper.v);
  const keeper = addVerandaHouse(b, kit, {
    footprint: { w: 6, d: 4 },
    storeys: 1,
    origin: { x: k.x, y: L.y, z: k.z },
    rotY: faceYaw({ u: 1, v: 0 }),
    seed: 17,
    walls: 'plaster',
    wall: 0xece6d8,
    trim: 0xf2efe6,
    shutter: 0x2f7f86,
    door: 0x2f7f86,
    roof: { shape: 'hip', cover: 'tin', colour: 0xa8503a, pitch: 0.7 },
    veranda: { sides: ['front'], depth: 2 },
    windows: 'sparse',
    weather: 0.5,
    lite,
    groundAt: (x, z) => keelhavenHeight(x, z),
  });
  out.colliders.push({ x: k.x, z: k.z, hx: 3.2, hz: 2.2, rot: faceYaw({ u: 1, v: 0 }), height: 5 });
  for (const d of keeper.decks) out.decks.push(verandaDeck(d));
}

/** A washing line between two posts, shirts and sheets on it. */
function washing(b: Buckets, u0: number, v0: number, u1: number, v1: number, seed: number): void {
  const rand = mulberry32(seed);
  const g0 = ground(u0, v0);
  const g1 = ground(u1, v1);
  const a = at(u0, g0 + 2.4, v0);
  const e = at(u1, g1 + 2.4, v1);
  for (const [p, g] of [
    [a, g0],
    [e, g1],
  ] as const)
    rod(b, 'wood', { x: p.x, y: g - 0.2, z: p.z }, p, 0.05, 5, YARD_PAINT.weathered);
  rope(b, a, e, 0.25, 0.012, YARD_PAINT.rope, 6);
  const yaw = Math.atan2(-(e.z - a.z), e.x - a.x);
  const n = 5;
  for (let k = 0; k < n; k++) {
    const t = (k + 0.5) / n;
    const sag = 0.25 * 4 * t * (1 - t);
    const hgt = 0.5 + rand() * 0.6;
    const colour = [YARD_PAINT.canvas, 0xd9c7a0, 0xa9443a, 0x46607a, YARD_PAINT.canvasOld][
      Math.floor(rand() * 5)
    ]!;
    box(
      b,
      'cloth',
      a.x + (e.x - a.x) * t,
      a.y + (e.y - a.y) * t - sag - hgt / 2,
      a.z + (e.z - a.z) * t,
      0.45 + rand() * 0.4,
      hgt,
      0.02,
      yaw,
      colour,
    );
  }
}

/**
 * A market stall on the square: four posts, a plank counter with produce crates and baskets on it,
 * and a striped canvas awning sloping to the front (local −z faces `face`).
 */
function marketStall(b: Buckets, out: ShipyardOut, u: number, v: number, face: Uv, seed: number): void {
  const rand = mulberry32(seed);
  const g = ground(u, v);
  const yaw = faceYaw(face);
  const across = { u: -face.v, v: face.u };
  const pt = (s: number, o: number) => ({
    u: u + across.u * s + face.u * o,
    v: v + across.v * s + face.v * o,
  });
  const w = 3.2;
  const d = 1.8;
  for (const [s, o, top] of [
    [-w / 2, d / 2, 2.4],
    [w / 2, d / 2, 2.4],
    [-w / 2, -d / 2, 2.0],
    [w / 2, -d / 2, 2.0],
  ] as const) {
    const p = pt(s, o);
    const q = at(p.u, g, p.v);
    rod(
      b,
      'wood',
      { x: q.x, y: g - 0.2, z: q.z },
      { x: q.x, y: g + top, z: q.z },
      0.06,
      5,
      YARD_PAINT.weathered,
    );
  }
  const c = at(u, g + 0.9, v);
  box(b, 'wood', c.x, c.y, c.z, w, 0.08, d * 0.8, yaw, YARD_PAINT.silver);
  box(b, 'wood', c.x, g + 0.45, c.z, w - 0.1, 0.9, d * 0.7, yaw, YARD_PAINT.weathered);
  const [c0, c1] = AWNINGS[Math.floor(rand() * AWNINGS.length)]!;
  const slats = 7;
  for (let k = 0; k < slats; k++) {
    const p = pt((k + 0.5 - slats / 2) * (w / slats), 0);
    const q = at(p.u, g + 2.22, p.v);
    box(b, 'cloth', q.x, q.y, q.z, w / slats + 0.005, 0.03, d + 0.5, yaw, k % 2 ? c1 : c0, -0.22);
  }
  // Its goods: crates heaped with fruit (mangoes, limes, plantain, breadfruit), baskets of fish,
  // bolts of cloth or pots, by the stall's trade; more on the ground in front, and a bunch hanging.
  const trade = Math.floor(rand() * 3);
  const fruit = [0xe0a030, 0x8fae3a, 0xd9c24a, 0xa8432c, 0x6f8a3a];
  for (let k = 0; k < 3; k++) {
    const p = pt((k - 1) * 0.95, -0.15);
    const q = at(p.u, g + 0.94, p.v);
    const turn = yaw + (rand() - 0.5) * 0.2;
    if (trade === 2 && k !== 1) {
      // Pots and jars.
      for (let j = 0; j < 3; j++) {
        const o = at(p.u + (rand() - 0.5) * 0.5, g + 0.94, p.v + (rand() - 0.5) * 0.3);
        const hgt = 0.22 + rand() * 0.2;
        rod(
          b,
          'stone',
          { x: o.x, y: q.y, z: o.z },
          { x: o.x, y: q.y + hgt, z: o.z },
          0.1 + rand() * 0.05,
          7,
          0xb8653e,
          0.06,
        );
      }
      continue;
    }
    box(b, 'wood', q.x, q.y + 0.12, q.z, 0.7, 0.24, 0.5, turn, YARD_PAINT.oak);
    if (trade === 1 && k === 1) {
      // Bolts of cloth, stacked.
      for (let j = 0; j < 3; j++)
        box(
          b,
          'cloth',
          q.x,
          q.y + 0.3 + j * 0.13,
          q.z,
          0.62,
          0.12,
          0.4,
          turn + (rand() - 0.5) * 0.2,
          [0xb85a3c, 0x3f6e7a, 0xe8dcc0, 0xd9b24a][Math.floor(rand() * 4)]!,
        );
      continue;
    }
    // A heap of fruit (or fish, silver-grey, on a fish stall): small lumps mounded in the crate.
    const fish = trade === 1;
    const c = fish ? 0xa9b2b4 : fruit[Math.floor(rand() * fruit.length)]!;
    for (let j = 0; j < 7; j++) {
      const ox = (rand() - 0.5) * 0.5;
      const oz = (rand() - 0.5) * 0.32;
      const lift = 0.3 + (0.12 - Math.hypot(ox, oz) * 0.25) + rand() * 0.04;
      const cy = Math.cos(turn);
      const sy = Math.sin(turn);
      if (fish)
        box(
          b,
          'cloth',
          q.x + ox * cy + oz * sy,
          q.y + lift,
          q.z - ox * sy + oz * cy,
          0.34,
          0.06,
          0.1,
          turn + (rand() - 0.5) * 0.6,
          c,
        );
      else
        rod(
          b,
          'cloth',
          { x: q.x + ox * cy + oz * sy, y: q.y + lift - 0.06, z: q.z - ox * sy + oz * cy },
          { x: q.x + ox * cy + oz * sy, y: q.y + lift + 0.06, z: q.z - ox * sy + oz * cy },
          0.075,
          6,
          c,
          0.07,
        );
    }
  }
  // Baskets and a sack on the ground in front of the counter.
  for (let k = 0; k < 2; k++) {
    const p = pt((k - 0.5) * 1.8 + (rand() - 0.5) * 0.4, -d / 2 - 0.45);
    const q = at(p.u, ground(p.u, p.v), p.v);
    rod(b, 'wood', { x: q.x, y: q.y, z: q.z }, { x: q.x, y: q.y + 0.34, z: q.z }, 0.26, 8, 0xc9a86a, 0.3);
    rod(
      b,
      'cloth',
      { x: q.x, y: q.y + 0.3, z: q.z },
      { x: q.x, y: q.y + 0.38, z: q.z },
      0.24,
      8,
      fruit[Math.floor(rand() * fruit.length)]!,
      0.18,
    );
  }
  // A bunch hanging from the awning's front rail.
  const hang = pt(w / 2 - 0.5, -d / 2 + 0.1);
  const hq = at(hang.u, g + 1.95, hang.v);
  rod(
    b,
    'rope',
    { x: hq.x, y: g + 2.25, z: hq.z },
    { x: hq.x, y: g + 1.95, z: hq.z },
    0.012,
    3,
    YARD_PAINT.rope,
  );
  rod(
    b,
    'cloth',
    { x: hq.x, y: g + 1.55, z: hq.z },
    { x: hq.x, y: g + 1.98, z: hq.z },
    0.14,
    7,
    trade === 1 ? 0x8a8f86 : 0xd9c24a,
    0.2,
  );
  out.colliders.push({ ...toWorld(u, v), hx: w / 2 + 0.1, hz: d / 2 + 0.1, rot: yaw, height: 1 });
  out.cameraBoxes.push({
    ...toWorld(u, v),
    hx: w / 2 + 0.3,
    hz: d / 2 + 0.5,
    rot: yaw,
    y0: g + 1.9,
    y1: g + 2.6,
  });
}

/**
 * The square's paving: coral-stone flags (each its own shade, a few sunk dark or cracked), laid over the
 * ground with a kerb of bigger stones round them, open where the street, the bridge's path and the
 * lane to the chandlery come in.
 */
function squarePaving(b: Buckets, lite: boolean): void {
  const { u0, u1, v0, v1 } = SQUARE;
  const cell = lite ? 3.2 : 2.1;
  const nu = Math.round((u1 - u0) / cell);
  const nv = Math.round((v1 - v0) / cell);
  const du = (u1 - u0) / nu;
  const dv = (v1 - v0) / nv;
  const pos: number[] = [];
  const col: number[] = [];
  const uvs: number[] = [];
  const idx: number[] = [];
  const base = new Color(YARD_PAINT.paving);
  const rand = mulberry32(0x5a1e);
  for (let i = 0; i < nu; i++)
    for (let j = 0; j < nv; j++) {
      // Each patch of setts its own tone (the setts and their joints are the texture's).
      const tone = 0.9 + 0.14 * rand();
      const sunk = rand() < 0.07 ? 0.8 : 1;
      const r = base.r * tone * sunk;
      const g = base.g * tone * sunk;
      const bl = base.b * tone * sunk * (0.97 + 0.06 * rand());
      const n = pos.length / 3;
      for (const [a, c] of [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
      ] as const) {
        const u = u0 + (i + a) * du;
        const v = v0 + (j + c) * dv;
        const p = toWorld(u, v);
        pos.push(p.x, ground(u, v) + 0.06, p.z);
        col.push(r, g, bl);
        uvs.push(p.x * 0.45, p.z * 0.45);
      }
      // Wound to face up (the frame's u, v turn the other way to world x, z).
      idx.push(n, n + 2, n + 1, n, n + 3, n + 2);
    }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  geo.setAttribute('uv', new BufferAttribute(new Float32Array(uvs), 2));
  geo.setAttribute('color', new BufferAttribute(new Float32Array(col), 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const nrm = geo.getAttribute('normal');
  if (nrm.getY(0) < 0) {
    for (let k = 0; k < idx.length; k += 3) [idx[k + 1], idx[k + 2]] = [idx[k + 2]!, idx[k + 1]!];
    geo.setIndex(idx);
    geo.computeVertexNormals();
  }
  b.paving.push(geo);
  // The kerb: a course of long stones round the flags, with gaps where the ways come in.
  const gaps: [edge: 'u0' | 'u1' | 'v0' | 'v1', from: number, to: number][] = [
    ['u0', 24, 34],
    ['v0', 108.5, 115.5],
    ['u1', 25, 30],
  ];
  const kerb = (edge: 'u0' | 'u1' | 'v0' | 'v1') => {
    const alongU = edge === 'v0' || edge === 'v1';
    const fixed = SQUARE[edge];
    const a0 = alongU ? u0 - 0.2 : v0 - 0.2;
    const a1 = alongU ? u1 + 0.2 : v1 + 0.2;
    for (let a = a0; a < a1 - 0.3;) {
      const len = Math.min(a1 - a, 0.9 + rand() * 0.6);
      const mid = a + len / 2;
      a += len + 0.04;
      if (gaps.some(([e, f, t]) => e === edge && mid > f && mid < t)) continue;
      const u = alongU ? mid : fixed;
      const v = alongU ? fixed : mid;
      const g = ground(u, v);
      ubox(
        b,
        'stone',
        u,
        g + 0.05,
        v,
        alongU ? len : 0.42,
        0.34 + rand() * 0.06,
        alongU ? 0.42 : len,
        YARD_PAINT.stone,
        (rand() - 0.5) * 0.04,
      );
    }
  };
  for (const e of ['u0', 'u1', 'v0', 'v1'] as const) kerb(e);
}

/** A plank bench on two legs, its seat `len` long, turned `yaw` from the cove's u. */
function bench(b: Buckets, out: ShipyardOut, u: number, v: number, yaw: number, len = 2.2): void {
  const g = ground(u, v);
  ubox(b, 'wood', u, g + 0.47, v, len, 0.07, 0.42, YARD_PAINT.silver, yaw);
  const cu = Math.cos(yaw);
  const sv = -Math.sin(yaw);
  for (const s of [-0.42, 0.42])
    ubox(b, 'wood', u + cu * s * len, g + 0.22, v + sv * s * len, 0.1, 0.48, 0.38, YARD_PAINT.weathered, yaw);
  // A back rail on posts.
  const bu = u + Math.sin(yaw) * 0.2;
  const bv = v + Math.cos(yaw) * 0.2;
  ubox(b, 'wood', bu, g + 0.85, bv, len, 0.14, 0.05, YARD_PAINT.silver, yaw);
  const p = at(u, g, v);
  out.colliders.push({ x: p.x, z: p.z, hx: len / 2, hz: 0.3, rot: YAW_U + yaw, height: 0.9 });
}

/** A shade tree's seat: a ring of coral stone round its trunk, capped with planks. */
function treeSeat(b: Buckets, out: ShipyardOut, u: number, v: number, r: number): void {
  const g = ground(u, v);
  const p = at(u, g, v);
  rod(
    b,
    'stone',
    { x: p.x, y: g - 0.3, z: p.z },
    { x: p.x, y: g + 0.42, z: p.z },
    r,
    18,
    YARD_PAINT.stone,
    r,
    true,
  );
  rod(
    b,
    'stone',
    { x: p.x, y: g - 0.3, z: p.z },
    { x: p.x, y: g + 0.42, z: p.z },
    r - 0.35,
    18,
    YARD_PAINT.wetStone,
    r - 0.35,
    true,
  );
  // The cap: planks round the ring.
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    const q = at(u + Math.cos(a) * (r - 0.17), g, v + Math.sin(a) * (r - 0.17));
    box(b, 'wood', q.x, g + 0.46, q.z, 0.42, 0.07, r * 0.52, YAW_U - a, YARD_PAINT.silver);
  }
  // Earth inside the ring, up to its rim.
  rod(b, 'stone', { x: p.x, y: g + 0.3, z: p.z }, { x: p.x, y: g + 0.36, z: p.z }, r - 0.36, 14, 0x5a4632);
  out.circles.push({ x: p.x, z: p.z, r: r + 0.1, y0: g - 0.5, y1: g + 0.5, height: 0.5 });
}

/** A cluster of casks and barrels, some on their sides, a few with sacks leaning on them. */
function barrels(b: Buckets, out: ShipyardOut, u: number, v: number, seed: number): void {
  const rand = mulberry32(seed);
  const n = 3 + Math.floor(rand() * 3);
  for (let k = 0; k < n; k++) {
    const pu = u + (rand() - 0.5) * 2.2;
    const pv = v + (rand() - 0.5) * 1.6;
    const g = ground(pu, pv);
    const p = at(pu, g, pv);
    const colour = rand() < 0.3 ? YARD_PAINT.tar : rand() < 0.5 ? YARD_PAINT.weathered : YARD_PAINT.oak;
    if (rand() < 0.25) {
      const a = rand() * Math.PI;
      const e = { x: p.x + Math.cos(a) * 0.9, y: g + 0.34, z: p.z + Math.sin(a) * 0.9 };
      rod(b, 'wood', { x: p.x, y: g + 0.34, z: p.z }, e, 0.34, 9, colour, 0.34);
    } else {
      rod(b, 'wood', { x: p.x, y: g, z: p.z }, { x: p.x, y: g + 0.95, z: p.z }, 0.33, 9, colour, 0.3);
      for (const y of [0.18, 0.76])
        rod(
          b,
          'metal',
          { x: p.x, y: g + y, z: p.z },
          { x: p.x, y: g + y + 0.05, z: p.z },
          0.34,
          9,
          YARD_PAINT.iron,
        );
      out.circles.push({ x: p.x, z: p.z, r: 0.38, y0: g - 0.5, y1: g + 1, height: 1 });
    }
    if (rand() < 0.35) {
      const s = at(pu + 0.45, g, pv + 0.2);
      rod(
        b,
        'cloth',
        { x: s.x, y: g, z: s.z },
        { x: s.x + 0.05, y: g + 0.6, z: s.z },
        0.24,
        7,
        YARD_PAINT.canvasOld,
        0.17,
      );
    }
  }
}

/**
 * The path up the North Head to the Gate Light (works.ts `GATE_PATH`): a timber stair laid along the
 * head's face, each tread on the slope's high side and on a post over its drop, a post-and-rope rail
 * along the drop, and lamps on its high side every 40 m or so, which lead the eye from the lock flight
 * to the light. The ground isn't cut for it (the far terrain levels can't hold a narrow bench).
 */
function gatePath(b: Buckets, out: ShipyardOut, lite: boolean): void {
  const step = lite ? 2.8 : 1.4;
  const half = GATE_PATH_HALF * 0.5;
  let run = 0;
  let next = 0;
  let nextLamp = 30;
  let k = 0;
  let prevRail: { x: number; y: number; z: number } | null = null;
  // The treads only climb: over a gully they bridge on taller posts (a dip read as a sag in the stair).
  let climb = -Infinity;
  for (let i = 0; i + 1 < GATE_PATH.length; i++) {
    const a = GATE_PATH[i]!;
    const e = GATE_PATH[i + 1]!;
    const len = Math.hypot(e[0] - a[0], e[1] - a[1]);
    const tu = (e[0] - a[0]) / len;
    const tv = (e[1] - a[1]) / len;
    // Across, toward the drop (the side whose ground is lower).
    const mu = (a[0] + e[0]) / 2;
    const mv = (a[1] + e[1]) / 2;
    const side = ground(mu - tv * 5, mv + tu * 5) < ground(mu + tv * 5, mv - tu * 5) ? 1 : -1;
    const nu = -tv * side;
    const nv = tu * side;
    const dx = tu * FRAME.axis.x + tv * FRAME.across.x;
    const dz = tu * FRAME.axis.z + tv * FRAME.across.z;
    const yaw = Math.atan2(-dz, dx);
    for (let t = next - run; t < len; t += step) {
      const u = a[0] + tu * (t + step / 2);
      const v = a[1] + tv * (t + step / 2);
      // The tread stands on the slope's high edge and over the ground on its line.
      const high = ground(u - nu * half, v - nv * half);
      const along = (t + step / 2) / len;
      const profile = a[2] + (e[2] - a[2]) * Math.min(1, along);
      climb = Math.max(climb, Math.max(high, ground(u, v), profile) + 0.14);
      const y = climb;
      const c = at(u, y, v);
      box(
        b,
        'wood',
        c.x,
        y - 0.04,
        c.z,
        step + 0.03,
        0.08,
        half * 2,
        yaw,
        k % 7 ? YARD_PAINT.silver : YARD_PAINT.oak,
      );
      // Walked tread by tread, with a fence along its drop edge (the rope rail).
      out.decks.push(
        lineDeck(
          [u - (tu * step) / 2, v - (tv * step) / 2, y],
          [u + (tu * step) / 2, v + (tv * step) / 2, y],
          half,
          true,
        ),
      );
      const fence = at(u + nu * (half - 0.04), 0, v + nv * (half - 0.04));
      out.colliders.push({
        x: fence.x,
        z: fence.z,
        hx: step / 2 + 0.02,
        hz: 0.06,
        rot: yaw,
        y0: y - 0.6,
        y1: y + 1.1,
        height: 1,
      });
      // A bearer under it, and a post down to the ground at its drop edge.
      const du = u + nu * (half - 0.08);
      const dv = v + nv * (half - 0.08);
      const g = ground(du, dv);
      const q = at(du, g, dv);
      if (y - g > 0.2)
        rod(
          b,
          'wood',
          { x: q.x, y: g - 0.3, z: q.z },
          { x: q.x, y: y - 0.08, z: q.z },
          0.07,
          5,
          YARD_PAINT.weathered,
        );
      // The rail: a post every other tread, a rope between.
      if (k % (lite ? 2 : 2) === 0) {
        const top = { x: q.x, y: y + 1.0, z: q.z };
        rod(b, 'wood', { x: q.x, y: y - 0.08, z: q.z }, top, 0.05, 5, YARD_PAINT.weathered);
        out.circles.push({ x: q.x, z: q.z, r: 0.1, y0: g - 0.5, y1: y + 1, height: y + 1 - g });
        if (prevRail && !lite && Math.hypot(top.x - prevRail.x, top.z - prevRail.z) < 4)
          rope(b, prevRail, top, 0.1, 0.02, YARD_PAINT.rope, 4);
        prevRail = top;
      }
      if (run + t >= nextLamp) {
        nextLamp = run + t + 40;
        lampPost(b, out, u - nu * (half + 0.5), v - nv * (half + 0.5), armYaw(nu, nv));
      }
      k++;
      next = run + t + step;
    }
    run += len;
  }
}

/** Builds the Old Town and the Gate Light into `b`, a part at a step. */
export function* buildTown(
  b: Buckets,
  kit: VillageKit,
  out: ShipyardOut,
  lite: boolean,
  /** Lite and Low: the second row up the flat left out, and fewer windows (PLAN §12.1). */
  sparse = lite,
): Generator<void, void, void> {
  const list = townHouses().filter((h) => !sparse || !h.back);
  list.forEach((h, i) => {
    house(b, kit, out, h, lite, sparse, 0x7000 + i * 31);
  });
  yield;
  // Lamp posts down the street, alternate sides, about every 16 m.
  let side = 1;
  for (let i = 0; i < STREET.length - 1; i++) {
    const a = STREET[i]!;
    const e = STREET[i + 1]!;
    const len = Math.hypot(e.u - a.u, e.v - a.v);
    const tu = (e.u - a.u) / len;
    const tv = (e.v - a.v) / len;
    for (let t = 6; t < len; t += 16) {
      const u = a.u + tu * t + -tv * side * 4.1;
      const v = a.v + tv * t + tu * side * 4.1;
      // Its arm reaches out over the street.
      const du = tv * side;
      const dv = -tu * side;
      const dx = du * FRAME.axis.x + dv * FRAME.across.x;
      const dz = du * FRAME.axis.z + dv * FRAME.across.z;
      lampPost(b, out, u, v, Math.atan2(-dz, dx));
      side = -side;
    }
  }
  yield;
  squarePaving(b, lite);
  evidenceBoard(b, out);
  well(b, out, (SQUARE.u0 + SQUARE.u1) / 2 + 3, (SQUARE.v0 + SQUARE.v1) / 2 + 4);
  footbridge(b, out);
  // The shade tree's seat (the tree is the vegetation's: `townPlants`), benches round it and the board.
  treeSeat(b, out, SQUARE_TREE.u, SQUARE_TREE.v, 2.3);
  bench(b, out, SQUARE_TREE.u + 3.4, SQUARE_TREE.v + 1, Math.PI / 2 + 0.2, 1.8);
  if (!lite) bench(b, out, SQUARE.u1 - 1.6, SQUARE.v0 + 9, -Math.PI / 2, 2);
  // Market stalls round the square's edges, fronts to its middle.
  marketStall(b, out, SQUARE.u0 + 3.5, SQUARE.v0 + 11, { u: 1, v: 0 }, 0x6a1);
  marketStall(b, out, SQUARE.u0 + 3.5, SQUARE.v0 + 17.5, { u: 1, v: 0 }, 0x6a2);
  marketStall(b, out, SQUARE.u0 + 12, SQUARE.v1 - 2.5, { u: 0, v: -1 }, 0x6a3);
  marketStall(b, out, SQUARE.u1 - 3.5, SQUARE.v1 - 7, { u: -1, v: 0 }, 0x6a4);
  if (!lite) marketStall(b, out, SQUARE.u0 + 19, SQUARE.v1 - 2.5, { u: 0, v: -1 }, 0x6a5);
  // Casks, barrels and crates round the square, a cart's worth of stores by the chandlery.
  barrels(b, out, SQUARE.u1 - 2.5, SQUARE.v0 + 2.5, 0x5b1);
  barrels(b, out, SQUARE.u0 + 2, SQUARE.v1 - 2, 0x5b2);
  if (!lite) barrels(b, out, SQUARE.u0 + 6.5, SQUARE.v0 + 2, 0x5b3);
  stores(b, SQUARE.u1 + 2.6, SQUARE.v0 + 4, ground(SQUARE.u1 + 2.6, SQUARE.v0 + 4), 0x5a1);
  ropeCoil(b, SQUARE.u0 + 1.5, SQUARE.v0 + 6, ground(SQUARE.u0 + 1.5, SQUARE.v0 + 6));
  // Lanterns at its corners.
  for (const [u, v] of [
    [SQUARE.u0 + 0.8, SQUARE.v0 + 0.8],
    [SQUARE.u1 - 0.8, SQUARE.v0 + 0.8],
    [SQUARE.u1 - 0.8, SQUARE.v1 - 0.8],
    [SQUARE.u0 + 0.8, SQUARE.v1 - 0.8],
  ] as const)
    lampPost(b, out, u, v, armYaw(SQUARE.u0 + SQUARE.u1 - 2 * u, SQUARE.v0 + SQUARE.v1 - 2 * v));
  if (!lite) {
    washing(b, 60, 64, 70, 63, 0x3a1);
    washing(b, 33, 66, 42, 64, 0x3a2);
  }
  yield;
  gateLight(b, kit, out, lite);
  gatePath(b, out, lite);
}
