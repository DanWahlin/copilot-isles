import { BufferAttribute, BufferGeometry, CylinderGeometry, Matrix4, SphereGeometry } from 'three/webgpu';
import { box, cylinder, paint, tubeBetween, worldUv } from '../sites/geo';
import type { MaterialKey, VillageBoxCollider } from '../village/kit';
import { LIMESTONE_LIGHT } from './terraces';

/**
 * Gilda's Model Market (docs/specs/MODEL-MARKET.md §2): a three-arched stone stall against the
 * corner house on the plaza's east side, by the top of the stair street from the quay. Three painted
 * signboards hang in the arches (small green Lightweight, middle blue Versatile, big red-and-gold
 * Powerful), with a striped awning over the counter, a glass starfish jar for a till, a bell, a cork
 * jobs board, a lantern and shelves of pottery. All of it goes into the town's material buckets (no new
 * draw or shader); the boards' lettering is one sign atlas (src/world/sites/model-market.ts).
 *
 * Everything here is in the stall's own frame: origin at the front of the arches, on the plaza floor;
 * +z out into the plaza, +x to the player's right as they face it.
 */
export const MODEL_MARKET = { x: 678.1, z: -787.3, heading: -Math.PI / 2 } as const;

/** Half the stall's width (the side walls' centres), its depth to the back wall, and the arches. */
const HW = 4.6;
const BACK = -3.5;
const PIERS = [-1.53, 1.53] as const;
const PIER_H = 4.35;
const ARCH_Y = 3.85;
const ARCH_R = 1.4;
const LINTEL = { y0: 4.35, y1: 4.95 } as const;
const BAND = { y0: 4.95, y1: 5.8 } as const;
const TOP = 6.0;
/** The side and back walls stop under the cornice. */
const WALL_H = BAND.y1;
const COUNTER = { x0: -4.3, x1: 2.0, z: -0.95, d: 0.7, h: 1.0 } as const;
/** The stallholder's step behind the counter, so she's seen over it. */
const STEP = { z0: -1.32, z1: -2.9, h: 0.3 } as const;
/** The counter body's front face (its top overhangs it by 5 cm). */
const COUNTER_FRONT = COUNTER.z + (COUNTER.d - 0.1) / 2;

/** Where things are in the stall's frame (shared by the town, the signs and the puzzle). */
export const MARKET_LAYOUT = {
  /** The three boards: arch centre x, board size (bigger model, bigger board), smallest first. */
  boards: [
    { x: -3.07, w: 1.55, h: 0.9 },
    { x: 0, w: 1.95, h: 1.15 },
    { x: 3.07, w: 2.3, h: 1.4 },
  ],
  /** Every board hangs from the arch with its top here, in the arch's plane. */
  boardTop: 3.8,
  boardZ: 0.05,
  /** The name banner on the plaster band over the arches. */
  banner: { y: (BAND.y0 + BAND.y1) / 2, z: 0.3 + 0.012, w: 5.2, h: 0.62 },
  /** The chalk plaque on the counter's front (House special: Auto). */
  plaque: { x: -0.25, y: 0.62, z: COUNTER_FRONT + 0.03 + 0.012, w: 1.6, h: 0.42 },
  /** The cork jobs board (its face), and its four notes. */
  cork: { x: 3.2, y: 1.62, z: -0.9 + 0.03, w: 1.6, h: 1.1 },
  notes: [
    { x: 2.78, y: 1.86, rz: 0.05 },
    { x: 3.6, y: 1.9, rz: -0.06 },
    { x: 2.82, y: 1.36, rz: -0.04 },
    { x: 3.64, y: 1.34, rz: 0.07 },
  ],
  noteSize: { w: 0.62, h: 0.42 },
  /** Gilda's spot behind the counter, and yours in front of it. */
  vendor: { x: -0.4, z: -1.75, y: STEP.h },
  stand: { x: -0.25, z: 1.0 },
  /** The counter's front, where E works from. */
  counter: { x: -0.25, z: -0.45 },
  jar: { x: -2.3, y: COUNTER.h + 0.05, z: COUNTER.z },
} as const;

/** A point in the stall's frame, in the world. */
export function marketToWorld(lx: number, lz: number): { x: number; z: number } {
  const c = Math.cos(MODEL_MARKET.heading);
  const s = Math.sin(MODEL_MARKET.heading);
  return { x: MODEL_MARKET.x + lx * c + lz * s, z: MODEL_MARKET.z - lx * s + lz * c };
}

const PIER = 0x91704c;
const PLASTER = 0xe8cf9a;
const BACK_PLASTER = 0xd9a86a;
const WOOD = 0x6b4527;
const WOOD_LIGHT = 0x9a6a3e;
const DARK_WOOD = 0x3c281a;
const BRASS = 0xc89a3c;
const METAL = 0x2d302d;
const RED = 0xc8302a;
const WHITE = 0xf3eee2;
const CORK = 0xa8743f;

type Buckets = Record<MaterialKey, BufferGeometry[]>;

interface MarketColliders {
  boxes: VillageBoxCollider[];
  camera: VillageBoxCollider[];
}

/** A flattened arch of seven stones (the town arcade's look), centred on x. */
function arch(stone: BufferGeometry[], x: number, y: number): void {
  for (let i = 0; i < 7; i += 1) {
    const t = (i / 6) * Math.PI;
    stone.push(
      box(
        ARCH_R * 0.22,
        0.34,
        0.62,
        {
          x: x + Math.cos(t) * ARCH_R * 0.76,
          y: y + Math.sin(t) * ARCH_R * 0.32,
          rz: (Math.PI / 2 - t) * 0.22,
        },
        PIER,
        1.8,
      ),
    );
  }
}

/** A puffy five-armed star lying flat (a starfish in the jar), as one small geometry. */
function star(x: number, y: number, z: number, r: number, tilt: number, spin: number): BufferGeometry {
  const pos: number[] = [0, 0.03, 0];
  for (let i = 0; i < 10; i += 1) {
    const a = (i / 10) * Math.PI * 2 + spin;
    const rr = i % 2 === 0 ? r : r * 0.45;
    pos.push(Math.cos(a) * rr, 0, Math.sin(a) * rr);
  }
  const index: number[] = [];
  for (let i = 0; i < 10; i += 1) index.push(0, 1 + ((i + 1) % 10), 1 + i);
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setIndex(index);
  g.computeVertexNormals();
  g.applyMatrix4(new Matrix4().makeRotationX(tilt));
  g.translate(x, y, z);
  worldUv(g, 1.8);
  return paint(g, 0xf06a34);
}

/** A leafy shrub over a pot: three small crowns (the town's tree-crown look, vertex-coloured cloth). */
function bush(x: number, y: number, z: number, lite: boolean): BufferGeometry[] {
  const crowns = [
    [0, 0.42, 0, 0.36, 0x3d7a37],
    [-0.2, 0.3, 0.12, 0.26, 0x4f8d3f],
    [0.2, 0.32, 0.1, 0.27, 0x356f31],
  ] as const;
  return crowns.map(([dx, dy, dz, r, colour]) => {
    const g = new SphereGeometry(r, lite ? 6 : 7, lite ? 4 : 5);
    g.scale(1, 1.2, 1);
    g.translate(x + dx, y + dy, z + dz);
    worldUv(g, 1.8);
    return paint(g, colour);
  });
}

/** A half sphere (the counter bell). */
function dome(x: number, y: number, z: number, r: number, colour: number): BufferGeometry {
  const g = new SphereGeometry(r, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2);
  g.translate(x, y, z);
  worldUv(g, 1.8);
  return paint(g, colour);
}

/**
 * Adds the stall's geometry to the town's buckets (in world space), and its colliders: walls, piers,
 * the counter and the jobs board stop the walker; the camera also keeps out of the arches, the band,
 * the boards and the awning. `lite` leaves out the small shelf pottery.
 */
export function addModelMarketStall(
  buckets: Buckets,
  colliders: MarketColliders,
  y: number,
  lite: boolean,
): void {
  const local = {
    stone: [] as BufferGeometry[],
    plaster: [] as BufferGeometry[],
    wood: [] as BufferGeometry[],
    cloth: [] as BufferGeometry[],
    metal: [] as BufferGeometry[],
    glow: [] as BufferGeometry[],
  };
  const { stone, plaster, wood, cloth, metal, glow } = local;

  // The shell: the back wall, two side walls, the inner piers, the arches, lintel, band and cornice.
  // Faces that meet are back to back or 1 cm apart or more (no z-fighting: flickertest's rule).
  plaster.push(box(HW * 2 - 0.6, WALL_H, 0.3, { z: BACK + 0.15 }, BACK_PLASTER, 1.8));
  for (const side of [-1, 1])
    stone.push(box(0.6, WALL_H, -BACK + 0.3, { x: side * HW, z: (BACK + 0.3) / 2 }, PIER, 1.8));
  for (const x of PIERS) {
    stone.push(box(0.6, PIER_H, 0.6, { x }, PIER, 1.8));
    stone.push(box(0.72, 0.16, 0.72, { x, y: PIER_H - 0.16 }, LIMESTONE_LIGHT, 1.8));
  }
  for (const b of MARKET_LAYOUT.boards) arch(stone, b.x, ARCH_Y);
  stone.push(box(HW * 2 + 0.66, LINTEL.y1 - LINTEL.y0, 0.7, { y: LINTEL.y0 }, LIMESTONE_LIGHT, 1.8));
  plaster.push(box(HW * 2 - 0.6, BAND.y1 - BAND.y0, 0.6, { y: BAND.y0 }, PLASTER, 1.8));
  stone.push(box(HW * 2 + 0.9, TOP - BAND.y1, 0.8, { y: BAND.y1, z: 0.02 }, LIMESTONE_LIGHT, 1.8));
  // The roof slab behind the band, between the walls, 2 cm under their tops.
  const roofZ0 = BACK + 0.3;
  const roofZ1 = -0.38;
  stone.push(
    box(
      HW * 2 - 0.6,
      0.18,
      roofZ1 - roofZ0,
      { y: WALL_H - 0.2, z: (roofZ0 + roofZ1) / 2 },
      LIMESTONE_LIGHT,
      1.8,
    ),
  );

  // The counter: a dark body, a lighter top with an overhang, and battens on its front.
  const cx = (COUNTER.x0 + COUNTER.x1) / 2;
  const cw = COUNTER.x1 - COUNTER.x0;
  wood.push(box(cw, COUNTER.h - 0.06, COUNTER.d - 0.1, { x: cx, z: COUNTER.z }, WOOD, 1.8));
  wood.push(box(cw + 0.12, 0.06, COUNTER.d, { x: cx, y: COUNTER.h - 0.06, z: COUNTER.z }, WOOD_LIGHT, 1.8));
  const front = COUNTER_FRONT;
  for (let x = COUNTER.x0 + 0.3; x < COUNTER.x1 - 0.1; x += 0.62)
    if (Math.abs(x - MARKET_LAYOUT.plaque.x) > MARKET_LAYOUT.plaque.w / 2 + 0.08)
      wood.push(box(0.07, COUNTER.h - 0.2, 0.025, { x, y: 0.05, z: front + 0.0125 }, DARK_WOOD, 1.8));
  // The chalk plaque's frame on the counter's front (the plaque's lettering is a sign).
  const pq = MARKET_LAYOUT.plaque;
  wood.push(
    box(
      pq.w + 0.1,
      pq.h + 0.1,
      0.03,
      { x: pq.x, y: pq.y - pq.h / 2 - 0.05, z: front + 0.015 },
      DARK_WOOD,
      1.8,
    ),
  );

  // The step Gilda stands on behind the counter.
  wood.push(box(cw - 0.1, STEP.h, STEP.z0 - STEP.z1, { x: cx, z: (STEP.z0 + STEP.z1) / 2 }, WOOD_LIGHT, 1.8));

  // The till: an open glass jar heaped with starfish, a brass rim, and the bell.
  const j = MARKET_LAYOUT.jar;
  const glass = new CylinderGeometry(0.19, 0.17, 0.34, 14, 1, true);
  glass.translate(j.x, j.y + 0.12, j.z);
  worldUv(glass, 1.8);
  plaster.push(paint(glass, 0xbfe3df));
  plaster.push(cylinder(0.17, 0.17, 0.02, { x: j.x, y: j.y - 0.05, z: j.z }, 0xbfe3df, 14));
  metal.push(cylinder(0.2, 0.2, 0.03, { x: j.x, y: j.y + 0.28, z: j.z }, BRASS, 14));
  plaster.push(star(j.x - 0.02, j.y + 0.22, j.z + 0.02, 0.13, 0.25, 0.3));
  plaster.push(star(j.x + 0.05, j.y + 0.28, j.z - 0.04, 0.11, -0.35, 1.2));
  plaster.push(star(j.x - 0.06, j.y + 0.33, j.z - 0.03, 0.1, 0.5, 2.1));
  plaster.push(star(j.x + 0.03, j.y + 0.37, j.z + 0.05, 0.09, -0.2, 0.7));
  wood.push(cylinder(0.11, 0.12, 0.03, { x: 0.75, y: COUNTER.h, z: COUNTER.z + 0.05 }, DARK_WOOD, 10));
  metal.push(dome(0.75, COUNTER.h + 0.03, COUNTER.z + 0.05, 0.09, BRASS));
  metal.push(cylinder(0.012, 0.012, 0.05, { x: 0.75, y: COUNTER.h + 0.11, z: COUNTER.z + 0.05 }, BRASS, 6));

  // The striped awning over the counter, sloping down to the front, with a scalloped valance.
  const aw = { x0: COUNTER.x0, x1: COUNTER.x1 + 0.1, zFront: -0.3, zBack: -1.75, yFront: 2.45, yBack: 2.8 };
  const stripes = 10;
  const sw = (aw.x1 - aw.x0) / stripes;
  const depth = Math.hypot(aw.zFront - aw.zBack, aw.yBack - aw.yFront);
  const tilt = Math.atan2(aw.yBack - aw.yFront, aw.zFront - aw.zBack);
  for (let i = 0; i < stripes; i += 1) {
    const x = aw.x0 + (i + 0.5) * sw;
    cloth.push(
      // Alternate stripes sit 1.2 cm apart where they overlap.
      box(
        sw + 0.01,
        0.04,
        depth,
        {
          x,
          y: (aw.yFront + aw.yBack) / 2 - 0.02 + (i % 2) * 0.012,
          z: (aw.zFront + aw.zBack) / 2,
          rx: tilt,
        },
        i % 2 ? WHITE : RED,
        1.8,
      ),
    );
    cloth.push(
      box(sw - 0.04, 0.2, 0.03, { x, y: aw.yFront - 0.2, z: aw.zFront + 0.01 }, i % 2 ? RED : WHITE, 1.8),
    );
  }
  wood.push(
    tubeBetween(
      0.045,
      { x: aw.x0, y: aw.yFront, z: aw.zFront },
      { x: aw.x1, y: aw.yFront, z: aw.zFront },
      DARK_WOOD,
      6,
    ),
  );

  // The boards' backing: dark timber for the two smaller boards, gold for the Powerful one, and two
  // chains each from under the arch.
  MARKET_LAYOUT.boards.forEach((b, i) => {
    const cy = MARKET_LAYOUT.boardTop - b.h / 2;
    const trim = i === 2 ? 0.09 : 0.06;
    wood.push(
      box(
        b.w + trim,
        b.h + trim,
        0.05,
        { x: b.x, y: cy - (b.h + trim) / 2, z: MARKET_LAYOUT.boardZ - 0.012 - 0.025 },
        i === 2 ? BRASS : DARK_WOOD,
        1.8,
      ),
    );
    for (const side of [-1, 1]) {
      const cxk = b.x + side * Math.min(b.w / 2 - 0.12, 0.78);
      metal.push(
        tubeBetween(
          0.018,
          { x: cxk, y: MARKET_LAYOUT.boardTop - 0.02, z: MARKET_LAYOUT.boardZ - 0.035 },
          { x: cxk, y: ARCH_Y + 0.35, z: MARKET_LAYOUT.boardZ - 0.035 },
          METAL,
          4,
        ),
      );
    }
  });

  // The cork jobs board on two posts, with a header plank.
  const ck = MARKET_LAYOUT.cork;
  for (const dx of [-0.86, 0.86])
    wood.push(cylinder(0.06, 0.07, 2.45, { x: ck.x + dx, z: ck.z - 0.06 }, DARK_WOOD, 6));
  wood.push(
    box(ck.w + 0.14, ck.h + 0.14, 0.05, { x: ck.x, y: ck.y - ck.h / 2 - 0.07, z: ck.z - 0.08 }, WOOD, 1.8),
  );
  cloth.push(box(ck.w, ck.h, 0.02, { x: ck.x, y: ck.y - ck.h / 2, z: ck.z - 0.02 }, CORK, 1.8));

  // Shelves on the back wall with pottery, and a blue curtain over the back door.
  for (const [x0, x1] of [
    [-4.1, -1.2],
    [1.9, 4.1],
  ] as const)
    for (const sy of [1.35, 2.05]) {
      wood.push(box(x1 - x0, 0.05, 0.36, { x: (x0 + x1) / 2, y: sy, z: BACK + 0.3 + 0.18 }, WOOD_LIGHT, 1.8));
      if (lite) continue;
      for (let x = x0 + 0.25, k = 0; x < x1 - 0.15; x += 0.42, k += 1) {
        const tint = [0x2f5f9a, 0x2e7c59, 0xa73a31, 0xb07a3c][(k + Math.round(sy * 3)) % 4]!;
        plaster.push(
          cylinder(
            0.07 + (k % 2) * 0.03,
            0.09,
            0.2 + (k % 3) * 0.07,
            { x, y: sy + 0.05, z: BACK + 0.48 },
            tint,
            8,
          ),
        );
      }
    }
  cloth.push(box(1.3, 2.3, 0.03, { x: 0.35, z: BACK + 0.32 }, 0x23558a, 1.8));

  // A lantern on a bracket in front of each inner pier, between the boards.
  for (const px of PIERS) {
    const lz = 0.62;
    metal.push(tubeBetween(0.03, { x: px, y: 3.3, z: 0.3 }, { x: px, y: 3.3, z: lz }, METAL, 5));
    metal.push(box(0.26, 0.04, 0.26, { x: px, y: 3.02, z: lz }, METAL, 1.8));
    metal.push(box(0.2, 0.05, 0.2, { x: px, y: 2.6, z: lz }, METAL, 1.8));
    for (const [dx, dz] of [
      [-0.1, -0.1],
      [0.1, -0.1],
      [-0.1, 0.1],
      [0.1, 0.1],
    ] as const)
      metal.push(box(0.02, 0.38, 0.02, { x: px + dx, y: 2.64, z: lz + dz }, METAL, 1.8));
    glow.push(box(0.15, 0.32, 0.15, { x: px, y: 2.67, z: lz }, 0xffd08a, 1.8));
    metal.push(tubeBetween(0.012, { x: px, y: 3.06, z: lz }, { x: px, y: 3.3, z: lz }, METAL, 4));
  }

  // A potted shrub at each front corner.
  for (const px of [-HW - 0.75, HW + 0.75]) {
    stone.push(cylinder(0.36, 0.28, 0.55, { x: px, z: 0.45 }, 0xb2643a, 10));
    stone.push(cylinder(0.4, 0.4, 0.08, { x: px, y: 0.5, z: 0.45 }, 0x9a5430, 10));
    cloth.push(...bush(px, 0.55, 0.45, lite));
  }

  // Crates and a barrel in the jobs board's bay, behind it.
  wood.push(box(0.7, 0.6, 0.6, { x: 3.6, z: -2.5, ry: 0.1 }, 0x7b5636, 1.8));
  wood.push(box(0.6, 0.5, 0.55, { x: 3.55, y: 0.6, z: -2.45, ry: -0.15 }, 0x8a6240, 1.8));
  wood.push(cylinder(0.32, 0.28, 0.9, { x: 2.6, z: -2.6 }, 0x6f4a2c, 10));

  const m = new Matrix4().makeRotationY(MODEL_MARKET.heading).setPosition(MODEL_MARKET.x, y, MODEL_MARKET.z);
  for (const key of Object.keys(local) as (keyof typeof local)[])
    for (const g of local[key]) buckets[key].push(g.applyMatrix4(m));

  const at = (lx: number, lz: number, hx: number, hz: number, y0: number, y1: number): VillageBoxCollider => {
    const p = marketToWorld(lx, lz);
    return { x: p.x, z: p.z, hx, hz, rot: MODEL_MARKET.heading, y0: y + y0, y1: y + y1 };
  };
  const walls = [
    at(0, BACK + 0.15, HW + 0.3, 0.15, 0, WALL_H),
    at(-HW, (BACK + 0.3) / 2, 0.3, (-BACK + 0.3) / 2, 0, WALL_H),
    at(HW, (BACK + 0.3) / 2, 0.3, (-BACK + 0.3) / 2, 0, WALL_H),
    ...PIERS.map((x) => at(x, 0, 0.3, 0.3, 0, PIER_H)),
  ];
  const walk = (c: VillageBoxCollider, h: number): VillageBoxCollider => ({
    x: c.x,
    z: c.z,
    hx: c.hx,
    hz: c.hz,
    rot: c.rot,
    height: h,
  });
  colliders.boxes.push(
    ...walls.map((c) => walk(c, TOP)),
    walk(at(cx, COUNTER.z, cw / 2 + 0.06, COUNTER.d / 2, 0, COUNTER.h), COUNTER.h),
    ...[-HW - 0.75, HW + 0.75].map((px) => walk(at(px, 0.45, 0.42, 0.42, 0, 1.3), 1.3)),
    // The jobs board, the crates and barrel behind it: the counter's end to the side wall.
    walk(at((COUNTER.x1 + HW - 0.3) / 2, -0.95, (HW - 0.3 - COUNTER.x1) / 2, 0.35, 0, 2.5), 2.5),
  );
  colliders.camera.push(
    ...walls,
    // The lintel, band and cornice over the arches, and the roof.
    at(0, 0, HW + 0.45, 0.4, PIER_H - 0.3, TOP),
    at(0, (roofZ0 + roofZ1) / 2, HW, (roofZ1 - roofZ0) / 2, WALL_H - 0.25, WALL_H),
    at(cx, COUNTER.z, cw / 2, COUNTER.d / 2, 0, COUNTER.h),
    at(
      (aw.x0 + aw.x1) / 2,
      (aw.zFront + aw.zBack) / 2,
      (aw.x1 - aw.x0) / 2,
      (aw.zFront - aw.zBack) / 2,
      aw.yFront - 0.25,
      aw.yBack + 0.05,
    ),
    ...MARKET_LAYOUT.boards.map((b) =>
      at(
        b.x,
        MARKET_LAYOUT.boardZ - 0.03,
        b.w / 2 + 0.05,
        0.06,
        MARKET_LAYOUT.boardTop - b.h - 0.05,
        ARCH_Y + 0.4,
      ),
    ),
    at(ck.x, ck.z - 0.04, ck.w / 2 + 0.1, 0.08, 0, ck.y + 0.1),
    // The shelves along the back wall, and the crates and barrel in the corner.
    at(0, BACK + 0.3 + 0.2, HW - 0.3, 0.22, 1.2, 2.5),
    at(3.2, -2.55, 1.1, 0.45, 0, 1.2),
  );
}
