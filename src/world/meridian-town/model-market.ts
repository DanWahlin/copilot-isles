import type { BufferGeometry } from 'three/webgpu';
import { box, cylinder, plank, TRIM } from '../sites/geo';
import { makeBuckets, type MaterialKey, type VillageBoxCollider } from '../village/kit';
import { archBand, archStones, spandrel, turned } from '../market-stall/shapes';
import { stallToWorld, type MarketStallLayout } from '../market-stall/layout';
import {
  addBoardChains,
  addHangingBoard,
  addJobsBoard,
  addStallAwning,
  addStallCounter,
  addStallLantern,
  addStallShelves,
  addTill,
  blob,
  counterFront,
  placeStall,
  stallBox,
  walkBox,
  type StallBuckets,
  type StallCounter,
  type StallStyle,
} from '../market-stall/parts';
import { addPlantOn, addPottedPlant } from './plaza-plants';
import { addTiledRoof } from './plaza-roofs';
import { clamp01, smoothstep } from '../../util/math';
import { LIMESTONE_LIGHT, TERRACOTTA } from './terraces';

/**
 * Gilda's Model Market (docs/specs/MODEL-MARKET.md §2): a sandstone loggia of three round arches with
 * an upper storey over it, built against the corner house on the plaza's east side, by the top of the
 * stair street from the quay (concept B). Square piers with plinths and capitals carry voussoir arches
 * with a moulded archivolt; a cornice, a plastered upper floor with shuttered windows, rafter ends and
 * a tiled eave close it off at the corner house's eave height. Under each arch a carved beam carries a
 * shaped signboard on two chains, growing with the models (sage Lightweight, blue Versatile, red and
 * gold Powerful). Behind the plank counter: a striped awning, shelves of bottles and jars, Gilda's
 * jar of starfish, a brass bell, the cork jobs board, iron lanterns, a draped cloth, potted palms and
 * geraniums, a planter and a barrel. The parts every stall shares are src/world/market-stall/'s; all of
 * it goes into the town's material buckets (no new draw or shader), and the boards' lettering is one
 * sign atlas (src/world/sites/model-market.ts).
 *
 * Everything here is in the stall's own frame: origin at the arches' centre line, on the plaza floor;
 * +z out into the plaza, +x to the player's right as they face it.
 */
export const MODEL_MARKET = { x: 677.1, z: -787.6, heading: -Math.PI / 2 } as const;

/**
 * Arch centres and pier centres: the stall's three bays, and a fourth on the right that runs on over
 * the harbour-front lane as an open passage (a sottoportico), so the arcade continues down the street.
 */
const ARCHES = [-3.7, 0, 3.7, 7.4] as const;
const PIERS = [-5.55, -1.85, 1.85, 5.55, 9.25] as const;
const PIER = { w: 0.8, d: 0.84 } as const;
/** The stall's half width to its side walls' outer faces. */
const OUTER = 5.95;
/** The whole building's left and right faces (the passage bay on the right). */
const X0 = -OUTER;
const X1 = 9.65;
const XC = (X0 + X1) / 2;
const XW = X1 - X0;
/** The passage bay's inner faces. */
const PASS = { x0: OUTER, x1: 8.85 } as const;
/** The piers' inner faces at the ends (the side walls' inner faces too). */
const INNER = 5.15;
const PLINTH_H = 0.45;
const CAPITAL_Y = 4.1;
/** The arches spring here: semicircles from the piers' faces, a voussoir ring and a moulding round them. */
const SPRING = 4.4;
const R_IN = 1.45;
const R_OUT = 1.77;
const R_MOULD = 1.85;
/** The arcade's wall faces (front and back of the piers and spandrels). */
const FRONT = PIER.d / 2;
/** Top of the arcade wall, the cornice over it, and the upper storey's wall face. */
const WALL_TOP = SPRING + R_MOULD + 0.15;
const CORNICE_TOP = WALL_TOP + 0.36;
const UPPER = { y1: CORNICE_TOP + 2.85, front: 0.2 } as const;
const EAVE = UPPER.y1 + 0.15;
/** The back wall's inner face: its outer face stands 10 cm off the corner house. */
const BACK = -4.6;
const CEILING = WALL_TOP - 0.3;
/** The counter stands back under the arches, behind a walkway. */
const COUNTER: StallCounter = {
  x0: -INNER,
  x1: INNER,
  z: -2.15,
  d: 0.7,
  h: 1.0,
  posts: [-5.08, -3.7, -2.1, -0.92, 0.92, 2.1, 3.7, 5.08],
  // The blue-and-white cloth over the counter's right end.
  cloth: { x0: 4.05, stripes: 6 },
  // The stallholder's step behind the counter (the middle bay), so she's seen over it.
  step: { x0: -1.6, x1: 1.6, z0: -2.55, z1: -4.0, h: 0.3 },
};
/** The counter body's front face (its top overhangs it by 7 cm). */
const COUNTER_FRONT = counterFront(COUNTER);
const BEAM = { h: 0.24, z: 0.1, d: 0.2 } as const;
const AWNING = { x0: -INNER, x1: INNER, zFront: -1.72, zBack: -3.3, yFront: 2.6, yBack: 3.0 } as const;

/** Where things are in the stall's frame (shared by the town, the signs and the puzzle). */
export const MARKET_LAYOUT: MarketStallLayout = {
  /**
   * The three boards, smallest first: arch centre x, face size (bigger model, bigger board), the
   * face's top, its outline's top (a scalloped edge, or the Powerful board's crest), and the foot of
   * the carved beam it hangs from inside its arch (each a step higher, like the boards).
   */
  boards: [
    { x: -3.85, w: 1.32, h: 0.74, top: 3.5, shape: 'scallop', beam: 3.78 },
    { x: 0, w: 1.86, h: 1.0, top: 3.98, shape: 'scallop', beam: 4.3 },
    { x: 3.7, w: 2.6, h: 1.42, top: 4.42, shape: 'crest', beam: 4.92 },
  ],
  /** The boards' painted faces, in the arch's opening. */
  boardZ: BEAM.z + 0.05,
  /** The chalk plaque on the counter's front (House special: Auto). */
  plaque: { x: 0, y: 0.6, z: COUNTER_FRONT + 0.035, w: 1.5, h: 0.4 },
  /** The small carved name plaque on the left end pier. */
  name: { x: PIERS[0], y: 2.0, z: FRONT + 0.045, w: 0.66, h: 0.34 },
  /** The cork jobs board (its face), and its four notes. */
  cork: { x: 3.6, y: 2.1, z: -2.75, w: 1.4, h: 0.85 },
  notes: [
    { x: 3.25, y: 1.88, rz: 0.05 },
    { x: 3.94, y: 1.9, rz: -0.06 },
    { x: 3.28, y: 1.48, rz: -0.04 },
    { x: 3.96, y: 1.47, rz: 0.07 },
  ],
  noteSize: { w: 0.58, h: 0.37 },
  /** Gilda's spot behind the counter, and yours in front of it (in the walkway under the middle arch). */
  vendor: { x: 0.25, z: -3.0, y: COUNTER.step!.h },
  stand: { x: 0.1, z: -0.9 },
  /** The counter's front, where E works from. */
  counter: { x: 0.1, z: -1.75 },
  /** The starfish jar, at the counter's front edge, front left of Gilda. */
  jar: { x: -0.95, y: COUNTER.h, z: COUNTER_FRONT - 0.2 },
  // Square on from the plaza at a standing eye height, like concept B's close-up: the three boards
  // across the top, Gilda at the counter in the middle, the jar, the bell and the jobs board.
  shot: { eye: [-0.4, 2.8, 6.6], at: [0.1, 2.85, -2.0] },
};

/** A point in the stall's frame, in the world. */
export const marketToWorld = (lx: number, lz: number): { x: number; z: number } =>
  stallToWorld(MODEL_MARKET, lx, lz);

/** Warm sandstone (two course tints), its lighter dressings, and the plaster over it. */
const SAND = [0xeda150, 0xf3ad5a] as const;
const SAND_EDGE = 0xfcdba4;
const SAND_SPANDREL = 0xeca456;
/** The spandrels' inner faces, in the walkway's shade. */
const SAND_SHADE = 0xd08a44;
const VOUSSOIR = [0xf8ca88, 0xf1ba70] as const;
const UPPER_PLASTER = 0xefb064;
const BACK_PLASTER = 0xf0b874;
const WOOD = 0x7a4e2b;
const WOOD_LIGHT = 0xa5733f;
const DARK_WOOD = 0x3c281a;
const IRON = 0x2b2d2c;
const SHUTTER = 0x2f6b4d;
const GLASS = 0x1b2528;
/** The stall's shared parts' colours: the boards sage, sky blue, and red framed in gold. */
const STYLE: StallStyle = {
  wood: WOOD,
  woodLight: WOOD_LIGHT,
  darkWood: DARK_WOOD,
  plank: [0x8e5b33, 0x82522e],
  brass: 0xe9b54a,
  iron: IRON,
  awning: [0xc8302a, 0xf5efe2],
  counterCloth: [0x2f64aa, 0xf5efe2],
  curtain: 0x23558a,
  cork: 0xb07a45,
  boardFace: [0x8fae74, 0x3e7fc6, 0xb3302a],
  boardFrame: [0x5b3a20, 0x5b3a20, 0xe6b44c],
  shelfTints: [0x2f5fa8, 0x3d8a4f, 0xb03a2e, 0xc8873a, 0x2a4f8f, 0x6a8f3a],
};

type Buckets = Record<MaterialKey, BufferGeometry[]>;

interface MarketColliders {
  boxes: VillageBoxCollider[];
  camera: VillageBoxCollider[];
}

/** The loggia: piers, arches, spandrels, cornice, upper storey, eave and roof, and the inside's shell. */
function addShell(l: StallBuckets, lite: boolean): void {
  const { plaster, wood, roofTile } = l;
  // Piers: a plinth, the shaft in courses (alternate courses a shade lighter and 1 cm in, for the
  // joints), and a two-step capital.
  const courses = 6;
  const courseH = (CAPITAL_Y - PLINTH_H) / courses;
  for (const x of PIERS) {
    plaster.push(box(PIER.w + 0.16, PLINTH_H - 0.1, PIER.d + 0.16, { x }, SAND[0], 1.8));
    plaster.push(box(PIER.w + 0.1, 0.1, PIER.d + 0.1, { x, y: PLINTH_H - 0.1 }, SAND_EDGE, 1.8));
    for (let i = 0; i < courses; i += 1) {
      const inset = i % 2 ? 0.02 : 0;
      plaster.push(
        box(PIER.w - inset, courseH, PIER.d - inset, { x, y: PLINTH_H + i * courseH }, SAND[i % 2]!, 1.8),
      );
    }
    plaster.push(box(PIER.w + 0.1, 0.14, PIER.d + 0.1, { x, y: CAPITAL_Y }, SAND_EDGE, 1.8));
    plaster.push(
      box(PIER.w + 0.22, SPRING - CAPITAL_Y - 0.14, PIER.d + 0.2, { x, y: CAPITAL_Y + 0.14 }, SAND_EDGE, 1.8),
    );
  }

  // The arches: voussoirs (a proud keystone), the moulding round them, and the spandrel walls front
  // and back. Above the end piers the wall runs on to the corners.
  const steps = lite ? 2 : 3;
  for (const cx of ARCHES) {
    plaster.push(
      archStones({
        cx,
        cy: SPRING,
        rIn: R_IN,
        rOut: R_OUT,
        z0: -FRONT,
        z1: FRONT + 0.03,
        stones: 11,
        steps,
        colours: VOUSSOIR,
        keystone: 0.04,
      }),
    );
    plaster.push(archBand(cx, SPRING, R_OUT, R_MOULD, FRONT - 0.1, FRONT + 0.06, lite ? 10 : 16, SAND_EDGE));
    plaster.push(spandrel(cx, SPRING, R_MOULD, R_MOULD, WALL_TOP, FRONT, lite ? 10 : 16, SAND_SPANDREL));
    plaster.push(spandrel(cx, SPRING, R_MOULD, R_OUT, WALL_TOP, -FRONT, lite ? 8 : 12, SAND_SHADE, true));
  }
  for (const [a, b] of [
    [X0, PIERS[0]],
    [PIERS[4], X1],
  ] as const)
    plaster.push(box(b - a, WALL_TOP - SPRING, PIER.d, { x: (a + b) / 2, y: SPRING }, SAND_SPANDREL, 1.8));

  // The cornice: a fillet and a deeper moulding over it.
  plaster.push(box(XW + 0.2, 0.16, 0.95, { x: XC, y: WALL_TOP, z: 0.025 }, SAND_EDGE, 1.8));
  plaster.push(
    box(
      XW + 0.4,
      CORNICE_TOP - WALL_TOP - 0.16,
      1.1,
      { x: XC, y: WALL_TOP + 0.16, z: 0.1 },
      LIMESTONE_LIGHT,
      1.8,
    ),
  );

  // The side walls (the stall's two, and the passage's outer one) and the stall's back wall, the
  // passage's open back under a lintel, and a dark timber ceiling with beams over it all.
  for (const x of [-(OUTER + INNER) / 2, (OUTER + INNER) / 2, PIERS[4]]) {
    plaster.push(
      box(OUTER - INNER, WALL_TOP, -BACK - FRONT + 0.15, { x, z: (BACK - 0.15 - FRONT) / 2 }, SAND[1], 1.8),
    );
  }
  plaster.push(box(INNER * 2, CEILING, 0.15, { z: BACK - 0.075 }, BACK_PLASTER, 1.8));
  const pw = PASS.x1 - PASS.x0;
  const px = (PASS.x0 + PASS.x1) / 2;
  plaster.push(box(pw, 0.4, 0.4, { x: px, y: SPRING - 0.4, z: BACK + 0.05 }, SAND_EDGE, 1.8));
  plaster.push(box(pw, WALL_TOP - SPRING, 0.4, { x: px, y: SPRING, z: BACK + 0.05 }, SAND[0], 1.8));
  wood.push(
    box(
      PASS.x1 + INNER,
      0.12,
      -BACK - FRONT,
      { x: (PASS.x1 - INNER) / 2, y: CEILING, z: (BACK - FRONT) / 2 },
      DARK_WOOD,
      1.8,
    ),
  );
  for (let x = -INNER + 0.6; x < PASS.x1; x += 1.15)
    if (x < INNER || x > PASS.x0)
      wood.push(
        box(0.16, 0.2, -BACK - FRONT, { x, y: CEILING - 0.2, z: (BACK - FRONT) / 2 }, DARK_WOOD, 1.8),
      );

  // The upper storey: a plastered wall over the cornice, its side walls back to the corner house,
  // three shuttered windows over the arches, a string course, rafter ends and a tiled eave.
  plaster.push(
    box(XW, UPPER.y1 - CORNICE_TOP, 0.4, { x: XC, y: CORNICE_TOP, z: UPPER.front - 0.2 }, UPPER_PLASTER, 1.8),
  );
  // Its back over the passage and above the corner house's eave.
  plaster.push(box(XW, UPPER.y1 - WALL_TOP, 0.3, { x: XC, y: WALL_TOP, z: BACK }, UPPER_PLASTER, 1.8));
  for (const sx of [X0 + 0.15, X1 - 0.15])
    plaster.push(
      box(
        0.3,
        UPPER.y1 - CORNICE_TOP,
        -BACK + 0.15 + UPPER.front - 0.4,
        {
          x: sx,
          y: CORNICE_TOP,
          z: (BACK - 0.15 + UPPER.front - 0.4) / 2,
        },
        UPPER_PLASTER,
        1.8,
      ),
    );
  const wy = CORNICE_TOP + 0.62;
  const wh = 1.25;
  const f = UPPER.front;
  for (const x of ARCHES) {
    l.metal.push(box(0.84, wh, 0.05, { x, y: wy, z: f + 0.012 }, GLASS, 1.8));
    // A light stone surround (sill proud, lintel with a keystone) and open shutters.
    plaster.push(box(0.12, wh + 0.12, 0.08, { x: x - 0.48, y: wy - 0.06, z: f + 0.04 }, SAND_EDGE, 1.8));
    plaster.push(box(0.12, wh + 0.12, 0.08, { x: x + 0.48, y: wy - 0.06, z: f + 0.04 }, SAND_EDGE, 1.8));
    plaster.push(box(1.08, 0.14, 0.09, { x, y: wy + wh, z: f + 0.045 }, SAND_EDGE, 1.8));
    plaster.push(box(0.2, 0.2, 0.1, { x, y: wy + wh + 0.02, z: f + 0.06 }, SAND_EDGE, 1.8));
    plaster.push(box(1.12, 0.08, 0.2, { x, y: wy - 0.1, z: f + 0.1 }, SAND_EDGE, 1.8));
    for (const s of [-1, 1]) {
      wood.push(box(0.4, wh, 0.04, { x: x + s * 0.76, y: wy, z: f + 0.03 }, SHUTTER, 1.8));
      if (!lite)
        for (let k = 0; k < 4; k += 1)
          wood.push(
            box(0.32, 0.03, 0.02, { x: x + s * 0.76, y: wy + 0.17 + k * 0.29, z: f + 0.055 }, 0x245a3f, 1.8),
          );
    }
    // A flower box under each window.
    wood.push(box(0.92, 0.16, 0.2, { x, y: wy - 0.3, z: f + 0.12 }, DARK_WOOD, 1.8));
    if (!lite)
      for (let k = 0; k < 4; k += 1)
        l.cloth.push(
          blob(x - 0.33 + k * 0.22, wy - 0.1, f + 0.13, 0.11, 0.75, k % 2 ? 0xd2367a : 0xe7a93a, 6, 4),
        );
    else l.cloth.push(box(0.86, 0.12, 0.16, { x, y: wy - 0.14, z: f + 0.12 }, 0xd2367a, 1.8));
  }
  plaster.push(box(XW + 0.1, 0.15, 0.6, { x: XC, y: UPPER.y1, z: f + 0.1 }, SAND_EDGE, 1.8));
  // The roof: a tiled gable along the façade like the plaza's houses, its eave over the string course.
  const roof = makeBuckets();
  const roofBack = BACK - 0.15;
  addTiledRoof(
    roof,
    XC,
    EAVE,
    (f + roofBack) / 2,
    XW,
    f - roofBack,
    0,
    TERRACOTTA,
    UPPER_PLASTER,
    'gable',
    lite ? 'lite' : 'full',
  );
  roofTile.push(...roof.roofTile);
  wood.push(...roof.wood);
  plaster.push(...roof.plaster);
  // The name plaque's carved backing on the left end pier (its lettering is a sign).
  const nm = MARKET_LAYOUT.name;
  wood.push(
    box(
      nm.w + 0.08,
      nm.h + 0.08,
      0.03,
      { x: nm.x, y: nm.y - nm.h / 2 - 0.04, z: FRONT + 0.015 },
      DARK_WOOD,
      1.8,
    ),
  );
}

/** One beam inside an arch (each a step higher) on two corbels, and its board's chains down from it. */
function addBeamAndChains(l: StallBuckets, i: number, lite: boolean): void {
  const b = MARKET_LAYOUT.boards[i]!;
  // Wall to wall across the arch's opening at the beam's height (the chord, above the springing).
  const rise = Math.max(0, b.beam + BEAM.h - SPRING);
  const span = 2 * Math.sqrt(R_IN * R_IN - rise * rise) + 0.06;
  l.wood.push(plank(span, BEAM.h, BEAM.d, { x: b.x, y: b.beam, z: BEAM.z }, WOOD, TRIM.dark, 0.5));
  for (const s of [-1, 1])
    l.wood.push(
      box(
        0.12,
        0.26,
        BEAM.d - 0.04,
        { x: b.x + s * (span / 2 - 0.1), y: b.beam - 0.26, z: BEAM.z },
        DARK_WOOD,
        1.8,
      ),
    );
  addBoardChains(l, b, MARKET_LAYOUT.boardZ, { y: b.beam, z: BEAM.z }, lite, IRON);
}

/** Dressing: the barrel, potted palms and geraniums at the counter's ends, and a planted stone planter. */
function addOutside(l: StallBuckets, lite: boolean): void {
  const barrel = [
    [0, 0],
    [0.27, 0],
    [0.32, 0.2],
    [0.33, 0.38],
    [0.32, 0.56],
    [0.27, 0.76],
    [0, 0.76],
  ] as const;
  const bx = -4.55,
    bz = 0.95;
  l.wood.push(turned(barrel, lite ? 10 : 14, bx, 0, bz, 0x7a4c2b));
  for (const hy of [0.12, 0.62])
    l.metal.push(cylinder(0.318, 0.318, 0.04, { x: bx, y: hy, z: bz }, IRON, lite ? 10 : 14));
  // The plaza's planting kit in Meridian's colours: a fan palm in a big terracotta pot at each end of
  // the counter with a pot of geraniums before it, and a fan palm in a mound of geraniums in the
  // planter by the passage.
  const plants = makeBuckets();
  const detail = lite ? 'lite' : 'full';
  addPottedPlant(plants, -4.45, 0, -1.25, 1.2, 'fan', detail, 11);
  addPottedPlant(plants, 4.5, 0, -1.25, 1.1, 'fan', detail, 23);
  addPottedPlant(plants, -4.3, 0, -0.35, 0.62, 'flowers', detail, 5);
  addPottedPlant(plants, 4.35, 0, -0.35, 0.62, 'flowers', detail, 8);
  for (const key of Object.keys(plants) as MaterialKey[]) l[key].push(...plants[key]);
  // The stone planter before the pier between the stall and the passage.
  const pl = { x: PIERS[3], z: 1.3 };
  l.plaster.push(box(1.0, 0.66, 1.0, { x: pl.x, z: pl.z }, SAND[0], 1.8));
  l.plaster.push(box(1.12, 0.08, 1.12, { x: pl.x, y: 0.66, z: pl.z }, SAND_EDGE, 1.8));
  const tree = makeBuckets();
  addPlantOn(tree, pl.x, 0.74, pl.z, 1.5, 'fan', detail, 3);
  addPlantOn(tree, pl.x, 0.74, pl.z, 1.05, 'flowers', detail, 6);
  for (const key of Object.keys(tree) as MaterialKey[]) l[key].push(...tree[key]);
}

/**
 * Soft ambient occlusion in the vertex colours (stall frame): darker toward the floor, deeper into
 * the walkway under the arches, and up into the ceiling's corners.
 */
function occlude(g: BufferGeometry): void {
  const p = g.getAttribute('position');
  const c = g.getAttribute('color');
  if (!c) return;
  for (let i = 0; i < p.count; i += 1) {
    const y = p.getY(i),
      z = p.getZ(i);
    const inside = clamp01((-FRONT + 0.05 - z) / 0.6);
    const depth = clamp01((-FRONT - z) / (FRONT - BACK));
    const k =
      (0.8 + 0.2 * smoothstep(0, 0.75, y)) *
      (1 - 0.22 * depth) *
      (1 - 0.2 * inside * smoothstep(CEILING - 1.6, CEILING, y));
    // Shade stays warm (orange bounce off the sandstone): red dims least, blue most.
    c.setXYZ(i, c.getX(i) * k ** 0.45, c.getY(i) * k ** 0.85, c.getZ(i) * k * k);
  }
}

/**
 * Adds the stall's geometry to the town's buckets (in world space), and its colliders: walls, piers,
 * the counter, the barrel, pots and planter stop the walker; the camera also keeps out of the arcade's
 * wall and upper storey, the counter and the shelves. `lite` builds the small dressing cheaper.
 */
export function addModelMarketStall(
  buckets: Buckets,
  colliders: MarketColliders,
  y: number,
  lite: boolean,
): void {
  const local = makeBuckets();
  addShell(local, lite);
  MARKET_LAYOUT.boards.forEach((_, i) => {
    addBeamAndChains(local, i, lite);
    addHangingBoard(local, MARKET_LAYOUT, i, STYLE);
  });
  addStallCounter(local, COUNTER, MARKET_LAYOUT.plaque, STYLE);
  addTill(local, MARKET_LAYOUT.jar, COUNTER.h, { x: -0.35, z: COUNTER.z + 0.05 }, lite, STYLE);
  addStallAwning(local, AWNING, STYLE);
  addStallShelves(
    local,
    {
      back: BACK,
      units: [
        [-4.6, -0.85],
        [1.25, 4.6],
      ],
      curtain: { x: 0.2, w: 1.5, h: 2.45 },
    },
    lite,
    STYLE,
  );
  addJobsBoard(local, MARKET_LAYOUT.cork, STYLE);
  for (const px of [PIERS[0], PIERS[4]]) addStallLantern(local, px, FRONT, 3.2, IRON);
  addOutside(local, lite);

  for (const key of ['plaster', 'wood'] as const) for (const g of local[key]) occlude(g);
  placeStall(local, buckets, MODEL_MARKET, y);

  const at = stallBox(MODEL_MARKET, y);
  const walk = walkBox;
  const backZ = (BACK - 0.15 + FRONT) / 2;
  const backHalf = (FRONT - BACK + 0.15) / 2;
  const walls = [
    at(0, BACK - 0.075, OUTER, 0.075, 0, EAVE),
    at(-(OUTER + INNER) / 2, backZ, (OUTER - INNER) / 2, backHalf, 0, EAVE),
    at((OUTER + INNER) / 2, backZ, (OUTER - INNER) / 2, backHalf, 0, EAVE),
    at(PIERS[4], backZ, (OUTER - INNER) / 2, backHalf, 0, EAVE),
    ...PIERS.slice(1, 3).map((x) => at(x, 0, PIER.w / 2 + 0.05, PIER.d / 2 + 0.05, 0, SPRING)),
  ];
  const cx = (COUNTER.x0 + COUNTER.x1) / 2;
  const cw = COUNTER.x1 - COUNTER.x0;
  colliders.boxes.push(
    ...walls.map((w) => walk(w, EAVE)),
    walk(at(cx, COUNTER.z, cw / 2, COUNTER.d / 2 + 0.04, 0, COUNTER.h), COUNTER.h),
    walk(at(-4.55, 0.95, 0.36, 0.36, 0, 0.8), 0.8),
    walk(at(-4.4, -0.85, 0.45, 0.85, 0, 0.7), 0.7),
    walk(at(4.45, -0.85, 0.45, 0.85, 0, 0.7), 0.7),
    walk(at(PIERS[3], 1.3, 0.56, 0.56, 0, 1.2), 1.2),
  );
  colliders.camera.push(
    ...walls,
    // The arcade's wall over the arches, the cornice and the upper storey.
    at(
      XC,
      (BACK - 0.15 + FRONT + 0.3) / 2,
      XW / 2 + 0.2,
      (FRONT + 0.3 - BACK + 0.15) / 2,
      WALL_TOP - 0.25,
      EAVE + 1.5,
    ),
    at(XC, 0, XW / 2, FRONT, SPRING + R_MOULD - 0.45, WALL_TOP),
    // The passage's lintel and the wall over it at the back.
    at((PASS.x0 + PASS.x1) / 2, BACK + 0.05, (PASS.x1 - PASS.x0) / 2, 0.2, SPRING - 0.4, WALL_TOP),
    at(cx, COUNTER.z, cw / 2, COUNTER.d / 2, 0, COUNTER.h + 0.1),
    at(0, BACK + 0.2, INNER, 0.22, 1.2, 2.8),
    at(PIERS[3], 1.3, 0.6, 0.6, 0, 3.0),
  );
}
