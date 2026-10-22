import { BufferGeometry, CylinderGeometry, Matrix4, SphereGeometry } from 'three/webgpu';
import { box, cylinder, paint, plank, TRIM, tubeBetween, worldUv } from '../sites/geo';
import type { MaterialKey, VillageBoxCollider } from '../village/kit';
import { starGeometry } from '../starfish';
import { boardOutline, finish, frameRing, prismZ, turned } from './shapes';
import { stallToWorld, type MarketStallLayout, type StallBoardSpot, type StallPlace } from './layout';

/**
 * The parts every Model Market stall shares (docs/specs/MODEL-MARKET.md §2), built in the stall's own
 * frame into the village kit's material buckets (no new material or shader): the three shaped boards
 * and their chains, the plank counter with its plaque frame, the starfish jar and the bell, the
 * striped awning, shelves of turned pots, the cork jobs board and an iron lantern. Each island's
 * stall builds its own shell round them in its own style, with its own palette (`StallStyle`), then
 * `placeStall` turns the lot into the world.
 */

export type StallBuckets = Record<MaterialKey, BufferGeometry[]>;

/** A stall's colours (vertex paint; the kit's materials multiply it). */
export interface StallStyle {
  readonly wood: number;
  readonly woodLight: number;
  readonly darkWood: number;
  readonly plank: readonly [number, number];
  readonly brass: number;
  readonly iron: number;
  /** The awning's two stripes, front edge first. */
  readonly awning: readonly [number, number];
  /** The cloth over the counter's end, two stripes. */
  readonly counterCloth: readonly [number, number];
  readonly curtain: number;
  readonly cork: number;
  /** The boards' faces and frames, smallest first (the biggest's frame is gilded). */
  readonly boardFace: readonly [number, number, number];
  readonly boardFrame: readonly [number, number, number];
  /** The pots and bottles on the shelves. */
  readonly shelfTints: readonly number[];
}

/**
 * The lantern glass is the kit's glow material. It mixes its vertex colour × 0.18 by day with an
 * orange glow by night, so a colour over 1 keeps the glass warm and bright in the afternoon too.
 */
const LANTERN_GLASS: readonly [number, number, number] = [5.5, 3.9, 1.4];
/** The jar's highlights: white on the glow material by day. */
const GLASS_SHINE: readonly [number, number, number] = [4.3, 5.0, 5.1];
/** The collectible starfish's shape and colours, 0.55 m in radius. */
const starShape = starGeometry();
const placed = new Matrix4();

/** A sphere (a blob of leaves or flowers, a knob), squashed by sy. */
export function blob(
  x: number,
  y: number,
  z: number,
  r: number,
  sy: number,
  hex: number,
  w = 7,
  h = 5,
): BufferGeometry {
  const g = new SphereGeometry(r, w, h);
  g.scale(1, sy, 1);
  g.translate(x, y, z);
  worldUv(g, 1.8);
  return paint(g, hex);
}

/** A round rim (a torus-like ring of radius r, tube t) lying flat at (x, y, z). */
export function turnedRing(
  r: number,
  t: number,
  x: number,
  y: number,
  z: number,
  hex: number,
  lite: boolean,
): BufferGeometry {
  const profile: [number, number][] = [];
  for (let k = 0; k <= 4; k += 1) {
    const a = -Math.PI / 2 + (k / 4) * Math.PI;
    profile.push([r + Math.cos(a) * t, t + Math.sin(a) * t]);
  }
  return turned(profile, lite ? 12 : 18, x, y, z, hex);
}

/**
 * Two chains from a beam (its foot at `beam.y`, face at `beam.z`) down to a board's top: iron links,
 * alternately turned (one thin rod each on a cheap tier).
 */
export function addBoardChains(
  l: StallBuckets,
  b: StallBoardSpot,
  boardZ: number,
  beam: { y: number; z: number },
  lite: boolean,
  iron: number,
): void {
  const top = b.top + (b.shape === 'crest' ? 0.07 : 0.05);
  for (const s of [-1, 1]) {
    const x = b.x + s * Math.min(b.w / 2 - 0.18, 0.75);
    const y0 = beam.y;
    if (lite) {
      l.metal.push(tubeBetween(0.014, { x, y: top, z: boardZ - 0.02 }, { x, y: y0, z: beam.z }, iron, 4));
      continue;
    }
    const links = Math.max(2, Math.round((y0 - top) / 0.075));
    const lh = (y0 - top) / links;
    for (let k = 0; k < links; k += 1)
      l.metal.push(
        box(
          k % 2 ? 0.016 : 0.05,
          lh + 0.012,
          k % 2 ? 0.05 : 0.016,
          { x, y: top + k * lh - 0.006, z: boardZ - 0.02 },
          iron,
          1.8,
        ),
      );
  }
}

/**
 * A board: its shaped backing, the painted face over it, and a chunky carved frame that follows the
 * outline all round, scalloped top or crest included (gilded on the biggest board).
 */
export function addHangingBoard(
  l: StallBuckets,
  layout: MarketStallLayout,
  i: number,
  style: StallStyle,
): void {
  const b = layout.boards[i]!;
  const z = layout.boardZ;
  const rim = i === 2 ? 0.11 : 0.08;
  const y0 = b.top - b.h;
  const at = (pts: [number, number][], dy: number) =>
    pts.map(([x, y]) => [b.x + x, dy + y] as [number, number]);
  const outer = at(boardOutline(b.w + rim * 2, b.h + rim * 2, b.shape), y0 - rim);
  const inner = at(boardOutline(b.w, b.h, b.shape), y0);
  const frame = i === 2 ? l.plaster : l.wood;
  frame.push(prismZ(outer, z - 0.07, z - 0.03, style.boardFrame[i]!));
  l.cloth.push(prismZ(inner, z - 0.03, z - 0.004, style.boardFace[i]!));
  frame.push(frameRing(outer, inner, z - 0.03, z + 0.035, style.boardFrame[i]!));
}

/** A counter: its span and depth, its body's height, the posts on its front, and what's on it. */
export interface StallCounter {
  readonly x0: number;
  readonly x1: number;
  readonly z: number;
  readonly d: number;
  readonly h: number;
  /** The posts across its front (x). */
  readonly posts: readonly number[];
  /** A striped cloth over one end, from x0 along +x (null for none). */
  readonly cloth: { readonly x0: number; readonly stripes: number } | null;
  /** The keeper's step behind it (null for none). */
  readonly step: {
    readonly x0: number;
    readonly x1: number;
    readonly z0: number;
    readonly z1: number;
    readonly h: number;
  } | null;
}

/** The counter body's front face (its top overhangs it). */
export const counterFront = (c: StallCounter): number => c.z + (c.d - 0.1) / 2;

/** The counter: a dark body, a light top with an overhang, a plank front between posts, and a kick rail. */
export function addStallCounter(
  l: StallBuckets,
  c: StallCounter,
  plaque: MarketStallLayout['plaque'],
  style: StallStyle,
): void {
  const cx = (c.x0 + c.x1) / 2;
  const cw = c.x1 - c.x0;
  l.wood.push(box(cw, c.h - 0.06, c.d - 0.1, { x: cx, z: c.z }, style.wood, 1.8));
  l.wood.push(
    plank(
      cw + 0.06,
      0.07,
      c.d + 0.04,
      { x: cx, y: c.h - 0.07, z: c.z + 0.02 },
      style.woodLight,
      TRIM.light,
      0.5,
    ),
  );
  const front = counterFront(c);
  const pq = plaque;
  for (const x of c.posts)
    l.wood.push(box(0.1, c.h - 0.1, 0.05, { x, y: 0.02, z: front + 0.025 }, style.darkWood, 1.8));
  // Vertical planks between the posts, 1.5 cm proud of the body.
  let k = 0;
  for (let x = c.x0 + 0.12; x < c.x1 - 0.1; x += 0.2, k += 1) {
    if (c.posts.some((p) => Math.abs(p - x) < 0.11)) continue;
    if (Math.abs(x - pq.x) < pq.w / 2 + 0.02) continue;
    l.wood.push(
      plank(
        0.185,
        c.h - 0.24,
        0.015,
        { x, y: 0.12, z: front + 0.0075 },
        style.plank[k % 2]!,
        TRIM.light,
        0.5,
        0.2,
      ),
    );
  }
  l.wood.push(box(cw, 0.1, 0.04, { x: cx, y: 0.02, z: front + 0.02 }, style.darkWood, 1.8));
  l.wood.push(box(cw, 0.08, 0.035, { x: cx, y: c.h - 0.16, z: front + 0.0175 }, style.darkWood, 1.8));
  // The House special plaque's carved frame (its lettering is a sign).
  l.wood.push(
    box(
      pq.w + 0.12,
      pq.h + 0.12,
      0.03,
      { x: pq.x, y: pq.y - pq.h / 2 - 0.06, z: front + 0.015 },
      style.darkWood,
      1.8,
    ),
  );
  if (c.step)
    l.wood.push(
      box(
        c.step.x1 - c.step.x0,
        c.step.h,
        c.step.z0 - c.step.z1,
        { x: (c.step.x0 + c.step.x1) / 2, z: (c.step.z0 + c.step.z1) / 2 },
        style.woodLight,
        1.8,
      ),
    );
  if (!c.cloth) return;
  // The striped cloth over the counter's end: across the top and down the front.
  const sw = 0.17;
  for (let s = 0; s < c.cloth.stripes; s += 1) {
    const x = c.cloth.x0 + (s + 0.5) * sw;
    const hex = style.counterCloth[s % 2]!;
    l.cloth.push(box(sw, 0.012, c.d + 0.08, { x, y: c.h, z: c.z + 0.04 }, hex, 1.8));
    l.cloth.push(box(sw, c.h - 0.12, 0.012, { x, y: 0.12, z: c.z + c.d / 2 + 0.085 }, hex, 1.8));
  }
}

/**
 * The till: a big glass jar at the counter's front edge holding the keeper's starfish, the game's own
 * collectible shape in its coral and gold. The glass is all but invisible (no see-through material
 * for it): a base, a rim at the foot and a rounded shoulder, a brass lid with a knob, and two bright
 * streaks of highlight down the front (unlit glow, like the lanterns' glass). And the brass bell on
 * the counter at `bell`.
 */
export function addTill(
  l: StallBuckets,
  j: MarketStallLayout['jar'],
  counterH: number,
  bell: { x: number; z: number },
  lite: boolean,
  style: StallStyle,
): void {
  const r = 0.25;
  const h = 0.5;
  l.plaster.push(cylinder(r + 0.01, r + 0.01, 0.03, { x: j.x, y: j.y, z: j.z }, 0xc9e7e3, 16));
  l.plaster.push(turnedRing(r, 0.022, j.x, j.y + 0.03, j.z, 0xd8f0ec, lite));
  l.plaster.push(turnedRing(r * 0.86, 0.02, j.x, j.y + h + 0.02, j.z, 0xd8f0ec, lite));
  l.plaster.push(cylinder(r * 0.8, r * 0.8, 0.06, { x: j.x, y: j.y + h + 0.07, z: j.z }, style.brass, 16));
  l.plaster.push(cylinder(r * 0.84, r * 0.84, 0.02, { x: j.x, y: j.y + h + 0.07, z: j.z }, 0xc8902e, 16));
  l.plaster.push(blob(j.x, j.y + h + 0.16, j.z, 0.045, 1, style.brass, 8, 5));
  // The highlights: two thin curved streaks on the front left, as glass catches the sun.
  for (const [a0, a1, y0, y1] of [
    [-0.75, -0.62, 0.08, 0.47],
    [-0.52, -0.46, 0.15, 0.4],
  ] as const) {
    const g = new CylinderGeometry(r + 0.004, r + 0.004, y1 - y0, 3, 1, true, a0, a1 - a0);
    g.translate(j.x, j.y + (y0 + y1) / 2, j.z);
    const streak = finish(g, 0xffffff);
    const c = streak.getAttribute('color');
    for (let i = 0; i < c.count; i += 1) c.setXYZ(i, ...GLASS_SHINE);
    l.glow.push(streak);
  }
  // The starfish: 0.2 m across, heaped and tilted toward you, a shade brighter than in the wild.
  const stars: readonly [number, number, number, number, number, number][] = [
    [-0.09, 0.16, 0.06, 0.135, -0.35, 0.3],
    [0.1, 0.15, -0.03, 0.13, 0.25, -0.5],
    [0.01, 0.34, 0.08, 0.14, -0.2, 0.9],
    [-0.06, 0.42, -0.1, 0.12, 0.45, 1.7],
  ];
  for (const [dx, dy, dz, sr, tilt, spin] of lite ? stars.slice(0, 3) : stars) {
    const g = starShape.clone();
    g.scale(sr / 0.55, sr / 0.55, sr / 0.55);
    g.rotateZ(spin);
    g.rotateX(tilt);
    g.rotateY(dx * 2);
    g.translate(j.x + dx, j.y + dy, j.z + dz);
    const c = g.getAttribute('color');
    for (let i = 0; i < c.count; i += 1)
      c.setXYZ(i, Math.min(1.25, c.getX(i) * 1.12), c.getY(i) * 1.12, c.getZ(i) * 1.12);
    worldUv(g, 1.8);
    l.cloth.push(g);
  }
  // The bell on a turned wooden base.
  const { x: bx, z: bz } = bell;
  l.wood.push(cylinder(0.12, 0.13, 0.035, { x: bx, y: counterH, z: bz }, style.darkWood, 12));
  l.plaster.push(blob(bx, counterH + 0.035, bz, 0.1, 0.85, style.brass, 12, 6));
  l.plaster.push(cylinder(0.012, 0.012, 0.06, { x: bx, y: counterH + 0.11, z: bz }, style.brass, 6));
  l.plaster.push(blob(bx, counterH + 0.18, bz, 0.022, 1, style.brass, 6, 4));
}

/** An awning sloping down to its front edge (its rail along there). */
export interface StallAwning {
  readonly x0: number;
  readonly x1: number;
  readonly zFront: number;
  readonly zBack: number;
  readonly yFront: number;
  readonly yBack: number;
}

/** The striped awning over the counter, sloping down to the front, with a scalloped valance. */
export function addStallAwning(l: StallBuckets, aw: StallAwning, style: StallStyle, stripes = 12): void {
  const sw = (aw.x1 - aw.x0) / stripes;
  const depth = Math.hypot(aw.zFront - aw.zBack, aw.yBack - aw.yFront);
  const tilt = Math.atan2(aw.yBack - aw.yFront, aw.zFront - aw.zBack);
  for (let i = 0; i < stripes; i += 1) {
    const x = aw.x0 + (i + 0.5) * sw;
    const hex = style.awning[i % 2]!;
    l.cloth.push(
      // Alternate stripes sit 1.2 cm apart where they overlap.
      box(
        sw + 0.01,
        0.03,
        depth,
        {
          x,
          y: (aw.yFront + aw.yBack) / 2 - 0.015 + (i % 2) * 0.012,
          z: (aw.zFront + aw.zBack) / 2,
          rx: tilt,
        },
        hex,
        1.8,
      ),
    );
    // A tongue of the valance: straight sides and a round foot.
    const tongue: [number, number][] = [
      [x - sw / 2, aw.yFront],
      [x - sw / 2, aw.yFront - 0.12],
    ];
    for (let k = 1; k < 6; k += 1) {
      const a = Math.PI + (k / 6) * Math.PI;
      tongue.push([x + Math.cos(a) * sw * 0.5, aw.yFront - 0.12 + Math.sin(a) * 0.08]);
    }
    tongue.push([x + sw / 2, aw.yFront - 0.12], [x + sw / 2, aw.yFront]);
    l.cloth.push(
      prismZ(tongue, aw.zFront + 0.005 + (i % 2) * 0.006, aw.zFront + 0.02 + (i % 2) * 0.006, hex),
    );
  }
  l.wood.push(
    tubeBetween(
      0.035,
      { x: aw.x0, y: aw.yFront + 0.01, z: aw.zFront - 0.02 },
      { x: aw.x1, y: aw.yFront + 0.01, z: aw.zFront - 0.02 },
      style.darkWood,
      6,
    ),
  );
}

/** Shelf units against a back wall (their x spans), and a curtained door between them (null for none). */
export interface StallShelves {
  /** The back wall's inner face. */
  readonly back: number;
  readonly units: readonly (readonly [number, number])[];
  readonly curtain: { readonly x: number; readonly w: number; readonly h: number } | null;
}

/** Shelves of bottles, jars and pots against the back wall, either side of the curtained door. */
export function addStallShelves(l: StallBuckets, o: StallShelves, lite: boolean, style: StallStyle): void {
  const zs = o.back + 0.2;
  const tints = style.shelfTints;
  const bottle = [
    [0, 0],
    [0.07, 0],
    [0.08, 0.14],
    [0.06, 0.2],
    [0.025, 0.24],
    [0.025, 0.3],
    [0, 0.3],
  ] as const;
  const jar = [
    [0, 0],
    [0.09, 0],
    [0.11, 0.08],
    [0.1, 0.17],
    [0.07, 0.2],
    [0, 0.2],
  ] as const;
  const pot = [
    [0, 0],
    [0.07, 0],
    [0.12, 0.1],
    [0.1, 0.2],
    [0.08, 0.23],
    [0.09, 0.25],
    [0, 0.25],
  ] as const;
  const shapes = [bottle, jar, pot] as const;
  for (const [x0, x1] of o.units) {
    for (const x of [x0 + 0.04, x1 - 0.04])
      l.wood.push(box(0.06, 2.75, 0.36, { x, z: zs }, style.darkWood, 1.8));
    [1.3, 1.95, 2.6].forEach((sy, row) => {
      l.wood.push(box(x1 - x0, 0.05, 0.38, { x: (x0 + x1) / 2, y: sy, z: zs }, style.woodLight, 1.8));
      if (lite && row !== 1) return;
      for (let x = x0 + 0.28, k = 0; x < x1 - 0.2; x += lite ? 0.62 : 0.36, k += 1) {
        const pick = (k + row * 2 + (x0 > 0 ? 1 : 0)) % 3;
        const s = 0.9 + ((k * 7 + row * 3) % 4) * 0.12;
        const shape = shapes[pick]!.map(([r, y]) => [r * s, y * s] as const);
        l.plaster.push(
          turned(
            shape,
            lite ? 6 : 8,
            x,
            sy + 0.05,
            zs + (k % 2 ? 0.04 : -0.04),
            tints[(k + row) % tints.length]!,
          ),
        );
      }
    });
  }
  const c = o.curtain;
  if (!c) return;
  l.cloth.push(box(c.w, c.h, 0.03, { x: c.x, z: o.back + 0.03 }, style.curtain, 1.8));
  l.wood.push(
    tubeBetween(
      0.025,
      { x: c.x - c.w / 2 - 0.1, y: c.h + 0.03, z: o.back + 0.08 },
      { x: c.x + c.w / 2 + 0.1, y: c.h + 0.03, z: o.back + 0.08 },
      style.darkWood,
      5,
    ),
  );
}

/** The cork jobs board on two posts. */
export function addJobsBoard(l: StallBuckets, ck: MarketStallLayout['cork'], style: StallStyle): void {
  for (const dx of [-ck.w / 2 - 0.05, ck.w / 2 + 0.05])
    l.wood.push(box(0.08, ck.y + 0.12, 0.08, { x: ck.x + dx, z: ck.z - 0.06 }, style.darkWood, 1.8));
  l.wood.push(
    box(ck.w + 0.16, ck.h + 0.16, 0.05, { x: ck.x, y: ck.y - ck.h - 0.08, z: ck.z - 0.07 }, style.wood, 1.8),
  );
  l.cloth.push(box(ck.w, ck.h, 0.02, { x: ck.x, y: ck.y - ck.h, z: ck.z - 0.03 }, style.cork, 1.8));
}

/**
 * An iron lantern on a bracket out from a face at `face` (z), its glass lit warm, its cap at `top`
 * plus a little: the bracket's arm is 0.2 m over it.
 */
export function addStallLantern(l: StallBuckets, px: number, face: number, top: number, iron: number): void {
  const lz = face + 0.42;
  const arm = top + 0.2;
  l.metal.push(tubeBetween(0.028, { x: px, y: arm, z: face }, { x: px, y: arm, z: lz + 0.04 }, iron, 5));
  l.metal.push(
    tubeBetween(0.016, { x: px, y: arm, z: face + 0.02 }, { x: px, y: top - 0.03, z: face }, iron, 4),
  );
  l.metal.push(tubeBetween(0.012, { x: px, y: top + 0.12, z: lz }, { x: px, y: arm, z: lz }, iron, 4));
  const cap = new CylinderGeometry(0.03, 0.17, 0.14, 4, 1);
  cap.rotateY(Math.PI / 4);
  cap.translate(px, top + 0.06, lz);
  l.metal.push(finish(cap, iron));
  l.metal.push(box(0.22, 0.04, 0.22, { x: px, y: top - 0.02, z: lz }, iron, 1.8));
  l.metal.push(box(0.18, 0.05, 0.18, { x: px, y: top - 0.42, z: lz }, iron, 1.8));
  for (const [dx, dz] of [
    [-0.085, -0.085],
    [0.085, -0.085],
    [-0.085, 0.085],
    [0.085, 0.085],
  ] as const)
    l.metal.push(box(0.022, 0.38, 0.022, { x: px + dx, y: top - 0.39, z: lz + dz }, iron, 1.8));
  const glass = box(0.15, 0.33, 0.15, { x: px, y: top - 0.37, z: lz }, 0xffffff, 1.8);
  const c = glass.getAttribute('color');
  for (let i = 0; i < c.count; i += 1) c.setXYZ(i, ...LANTERN_GLASS);
  l.glow.push(glass);
}

/** Turns a stall's parts (in its frame) into the world, into the island's buckets. */
export function placeStall(local: StallBuckets, into: StallBuckets, place: StallPlace, y: number): void {
  placed.makeRotationY(place.heading).setPosition(place.x, y, place.z);
  for (const key of Object.keys(local) as MaterialKey[])
    for (const g of local[key]) into[key].push(g.applyMatrix4(placed));
}

/** A box collider from the stall's frame (`lx`, `lz` its centre, `hx`, `hz` its half size), y0 to y1 over its floor. */
export function stallBox(
  place: StallPlace,
  y: number,
): (lx: number, lz: number, hx: number, hz: number, y0: number, y1: number) => VillageBoxCollider {
  return (lx, lz, hx, hz, y0, y1) => {
    const p = stallToWorld(place, lx, lz);
    return { x: p.x, z: p.z, hx, hz, rot: place.heading, y0: y + y0, y1: y + y1 };
  };
}

/** A walking box from a camera box: the walker stops at it, and stands on it if it's low. */
export const walkBox = (cl: VillageBoxCollider, height: number): VillageBoxCollider => ({
  x: cl.x,
  z: cl.z,
  hx: cl.hx,
  hz: cl.hz,
  rot: cl.rot,
  height,
});
