import { box, plank, TRIM } from '../sites/geo';
import { makeBuckets, type VillageBoxCollider } from '../village/kit';
import type { MarketStallLayout, StallPlace } from './layout';
import {
  addBoardChains,
  addHangingBoard,
  addJobsBoard,
  addStallAwning,
  addStallCounter,
  addStallLantern,
  addStallShelves,
  addTill,
  counterFront,
  placeStall,
  stallBox,
  walkBox,
  type StallBuckets,
  type StallCounter,
  type StallStyle,
} from './parts';

/**
 * The market booth the islands without an arcade build (docs/specs/MODEL-MARKET.md §2): an open-
 * fronted timber booth with the same parts as Gilda's stall at Port Meridian (the three boards on
 * chains from a sign beam, the plank counter with the House special plaque, the starfish jar and bell,
 * the striped awning, shelves, a curtained door, the cork jobs board and two lanterns), in the
 * island's own colours. The island adds its roof and dressing (`roof`, `dress`) in the booth's frame;
 * placement, colours, roof and dressing are island data (each island's package).
 *
 * Frame (as every stall's, layout.ts): origin on the floor under the sign beam's middle, +z out to you.
 */

/** Half the booth's width (posts' centres), the back wall's inner face, and the sign beam's foot. */
const HALF = 3.4;
const BACK = -2.9;
const BEAM_Y = 3.95;
const BEAM = { h: 0.24, z: 0.1, d: 0.2 } as const;
const POST = 0.2;
const SIDE_H = 1.1;
/** The posts' tops (the roof sits on a wall plate here). */
export const BOOTH_TOP = BEAM_Y + BEAM.h;
/** The booth's footprint in its frame (posts' outer faces), for roofs and colliders. */
export const BOOTH_EXTENT = { x0: -HALF - POST / 2, x1: HALF + POST / 2, z0: BACK - 0.2, z1: BEAM.z + 0.1 };

const COUNTER: StallCounter = {
  x0: -2.95,
  x1: 2.95,
  z: -1.1,
  d: 0.7,
  h: 1.0,
  posts: [-2.9, -1.75, 1.75, 2.9],
  cloth: { x0: 2.0, stripes: 5 },
  step: { x0: -1.2, x1: 1.2, z0: -1.5, z1: -2.75, h: 0.22 },
};
const FRONT = counterFront(COUNTER);

/** Where things are in a booth (as Gilda's stall's MARKET_LAYOUT; the signs and the market read it). */
export const BOOTH_LAYOUT: MarketStallLayout = {
  boards: [
    { x: -2.45, w: 1.32, h: 0.74, top: 3.5, shape: 'scallop', beam: BEAM_Y },
    { x: -0.55, w: 1.86, h: 1.0, top: 3.62, shape: 'scallop', beam: BEAM_Y },
    { x: 1.9, w: 2.6, h: 1.42, top: 3.82, shape: 'crest', beam: BEAM_Y },
  ],
  boardZ: BEAM.z + 0.05,
  plaque: { x: 0, y: 0.6, z: FRONT + 0.035, w: 1.5, h: 0.4 },
  // On the left front post, under the sign beam.
  name: { x: -HALF, y: 2.15, z: POST / 2 + 0.045, w: 0.66, h: 0.34 },
  cork: { x: 2.05, y: 2.05, z: BACK + 0.16, w: 1.4, h: 0.85 },
  notes: [
    { x: 1.7, y: 1.83, rz: 0.05 },
    { x: 2.39, y: 1.85, rz: -0.06 },
    { x: 1.73, y: 1.43, rz: -0.04 },
    { x: 2.41, y: 1.42, rz: 0.07 },
  ],
  noteSize: { w: 0.58, h: 0.37 },
  vendor: { x: 0.15, z: -2.0, y: COUNTER.step!.h },
  stand: { x: 0.05, z: 0.35 },
  counter: { x: 0.05, z: -0.7 },
  jar: { x: -0.95, y: COUNTER.h, z: FRONT - 0.2 },
  // Square on from a few steps out: the boards across the top, the keeper at the counter.
  shot: { eye: [-0.3, 2.45, 5.6], at: [0.05, 2.25, -1.6] },
};

/** A booth's own colours: the stall's parts', and its timber frame's. */
export interface BoothStyle extends StallStyle {
  /** The posts, the sign beam and the wall plate. */
  readonly frame: number;
  /** The side and back walls' boards (two, alternating). */
  readonly boards: readonly [number, number];
}

export interface BoothColliders {
  boxes: VillageBoxCollider[];
  camera: VillageBoxCollider[];
}

/** The booth's frame and walls: posts, the sign beam with its corbels, a wall plate, side and back walls. */
function addFrame(l: StallBuckets, style: BoothStyle, lite: boolean): void {
  for (const x of [-HALF, HALF])
    for (const z of [0, BACK - 0.1])
      l.wood.push(plank(POST, BOOTH_TOP, POST, { x, z }, style.frame, TRIM.dark, 0.5));
  // The sign beam across the front, and a wall plate round the top for the roof.
  l.wood.push(
    plank(HALF * 2 + POST, BEAM.h, BEAM.d, { x: 0, y: BEAM_Y, z: BEAM.z - 0.1 }, style.frame, TRIM.dark, 0.5),
  );
  for (const s of [-1, 1])
    l.wood.push(box(0.14, 0.3, 0.16, { x: s * (HALF - 0.17), y: BEAM_Y - 0.3, z: 0 }, style.darkWood, 1.8));
  l.wood.push(
    plank(
      HALF * 2 + POST,
      0.18,
      0.16,
      { x: 0, y: BOOTH_TOP - 0.18, z: BACK - 0.1 },
      style.frame,
      TRIM.dark,
      0.5,
    ),
  );
  for (const x of [-HALF, HALF])
    l.wood.push(
      plank(
        0.16,
        0.18,
        -BACK + 0.1,
        { x, y: BOOTH_TOP - 0.18, z: (BACK - 0.1) / 2 },
        style.frame,
        TRIM.dark,
        0.5,
      ),
    );
  // The back wall: upright boards from the floor to the plate.
  const bw = lite ? 0.56 : 0.28;
  for (let x = -HALF + bw / 2, k = 0; x < HALF; x += bw, k += 1)
    l.wood.push(
      plank(
        bw - 0.01,
        BOOTH_TOP - 0.18,
        0.06,
        { x, z: BACK - 0.03 },
        style.boards[k % 2]!,
        TRIM.light,
        0.5,
        0.3,
      ),
    );
  // Half walls on the sides, boards laid along, a rail on top.
  const rows = lite ? 2 : 4;
  for (const x of [-HALF, HALF]) {
    for (let r = 0; r < rows; r += 1)
      l.wood.push(
        plank(
          0.05,
          SIDE_H / rows - 0.01,
          -BACK - 0.1,
          { x, y: (r * SIDE_H) / rows, z: (BACK + 0.1) / 2 - 0.05 },
          style.boards[r % 2]!,
          TRIM.light,
          0.5,
          0.3,
        ),
      );
    l.wood.push(box(0.12, 0.06, -BACK, { x, y: SIDE_H, z: BACK / 2 - 0.05 }, style.darkWood, 1.8));
  }
  // The name plaque's carved backing on the left front post (its lettering is a sign).
  const nm = BOOTH_LAYOUT.name;
  l.wood.push(
    box(
      nm.w + 0.08,
      nm.h + 0.08,
      0.03,
      { x: nm.x, y: nm.y - nm.h / 2 - 0.04, z: POST / 2 + 0.015 },
      style.darkWood,
      1.8,
    ),
  );
}

/**
 * Builds a market booth into the island's buckets (world space) with its colliders: the posts, walls
 * and counter stop the walker, and the camera keeps out of the roof, the walls, the counter and the
 * shelves. `roof` and `dress` add the island's own parts in the booth's frame (and their colliders,
 * through `at`).
 */
export function addMarketBooth(
  into: StallBuckets,
  colliders: BoothColliders,
  place: StallPlace,
  y: number,
  style: BoothStyle,
  lite: boolean,
  island: {
    /** Iron lanterns on the front posts (an island whose street lamps light the booth goes without). */
    lanterns?: boolean;
    roof(l: StallBuckets): void;
    dress?(l: StallBuckets, at: ReturnType<typeof stallBox>, colliders: BoothColliders): void;
  },
): void {
  const l = makeBuckets();
  const at = stallBox(place, y);
  addFrame(l, style, lite);
  BOOTH_LAYOUT.boards.forEach((b, i) => {
    // Short drops from the sign beam: a rod a chain (links would add more iron than they show).
    addBoardChains(l, b, BOOTH_LAYOUT.boardZ, { y: b.beam, z: BEAM.z }, true, style.iron);
    addHangingBoard(l, BOOTH_LAYOUT, i, style);
  });
  addStallCounter(l, COUNTER, BOOTH_LAYOUT.plaque, style);
  addTill(l, BOOTH_LAYOUT.jar, COUNTER.h, { x: -0.35, z: COUNTER.z + 0.05 }, lite, style);
  addStallAwning(l, { x0: -2.95, x1: 2.95, zFront: -0.72, zBack: -2.3, yFront: 2.45, yBack: 2.8 }, style, 10);
  addStallShelves(
    l,
    { back: BACK, units: [[-3.25, -0.9]], curtain: { x: 0.05, w: 1.3, h: 2.3 } },
    lite,
    style,
  );
  addJobsBoard(l, BOOTH_LAYOUT.cork, style);
  if (island.lanterns !== false)
    for (const x of [-HALF, HALF]) addStallLantern(l, x, POST / 2, 3.0, style.iron);
  island.roof(l);
  island.dress?.(l, at, colliders);
  placeStall(l, into, place, y);

  const sideZ = (BACK - 0.1) / 2;
  const walls = [
    at(0, BACK - 0.05, HALF + POST / 2, 0.1, 0, BOOTH_TOP),
    ...[-HALF, HALF].map((x) => at(x, sideZ, POST / 2 + 0.03, -sideZ + 0.1, 0, SIDE_H + 0.06)),
    ...[-HALF, HALF].map((x) => at(x, 0, POST / 2 + 0.05, POST / 2 + 0.05, 0, BOOTH_TOP)),
  ];
  const cx = (COUNTER.x0 + COUNTER.x1) / 2;
  const cw = COUNTER.x1 - COUNTER.x0;
  colliders.boxes.push(
    walkBox(walls[0]!, BOOTH_TOP),
    ...walls.slice(1, 3).map((w) => walkBox(w, SIDE_H + 0.06)),
    ...walls.slice(3).map((w) => walkBox(w, BOOTH_TOP)),
    walkBox(at(cx, COUNTER.z, cw / 2, COUNTER.d / 2 + 0.04, 0, COUNTER.h), COUNTER.h),
  );
  colliders.camera.push(
    ...walls,
    // The roof over it all, and the sign beam.
    at(
      0,
      (BACK - 0.2 + BEAM.z + 0.3) / 2,
      HALF + 0.6,
      (BEAM.z + 0.3 - BACK + 0.2) / 2,
      BEAM_Y - 0.05,
      BOOTH_TOP + 1.6,
    ),
    at(cx, COUNTER.z, cw / 2, COUNTER.d / 2, 0, COUNTER.h + 0.1),
    at(-2.05, BACK + 0.2, 1.2, 0.22, 1.2, 2.8),
  );
}
