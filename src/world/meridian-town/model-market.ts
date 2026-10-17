import { BufferGeometry, CylinderGeometry, Matrix4, SphereGeometry } from 'three/webgpu';
import { box, cylinder, paint, plank, TRIM, tubeBetween, worldUv } from '../sites/geo';
import { makeBuckets, type MaterialKey, type VillageBoxCollider } from '../village/kit';
import {
  archBand,
  archStones,
  boardOutline,
  finish,
  frameRing,
  prismZ,
  spandrel,
  turned,
} from './market-shapes';
import { addPottedPlant } from './plaza-plants';
import { addTiledRoof } from './plaza-roofs';
import { starGeometry } from '../starfish';
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
 * jar of starfish, a brass bell, the cork jobs board, iron lanterns, a draped cloth, pot plants, a
 * cypress and a barrel. All of it goes into the town's material buckets (no new draw or shader); the
 * boards' lettering is one sign atlas (src/world/sites/model-market.ts).
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
const COUNTER = { x0: -INNER, x1: INNER, z: -2.15, d: 0.7, h: 1.0 } as const;
/** The stallholder's step behind the counter (the middle bay), so she's seen over it. */
const STEP = { x0: -1.6, x1: 1.6, z0: -2.55, z1: -4.0, h: 0.3 } as const;
/** The counter body's front face (its top overhangs it by 7 cm). */
const COUNTER_FRONT = COUNTER.z + (COUNTER.d - 0.1) / 2;
const BEAM = { h: 0.24, z: 0.1, d: 0.2 } as const;
const AWNING = { x0: -INNER, x1: INNER, zFront: -1.72, zBack: -3.3, yFront: 2.6, yBack: 3.0 } as const;

/** Where things are in the stall's frame (shared by the town, the signs and the puzzle). */
export const MARKET_LAYOUT = {
  /**
   * The three boards, smallest first: arch centre x, face size (bigger model, bigger board), the
   * face's top, its outline's top (a scalloped edge, or the Powerful board's crest), and the foot of
   * the carved beam it hangs from inside its arch (each a step higher, like the boards).
   */
  boards: [
    { x: -3.85, w: 1.32, h: 0.74, top: 3.5, shape: 'scallop' as const, beam: 3.78 },
    { x: 0, w: 1.86, h: 1.0, top: 3.98, shape: 'scallop' as const, beam: 4.3 },
    { x: 3.7, w: 2.6, h: 1.42, top: 4.42, shape: 'crest' as const, beam: 4.92 },
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
  vendor: { x: 0.25, z: -3.0, y: STEP.h },
  stand: { x: 0.1, z: -0.9 },
  /** The counter's front, where E works from. */
  counter: { x: 0.1, z: -1.75 },
  /** The starfish jar, at the counter's front edge, front left of Gilda. */
  jar: { x: -0.95, y: COUNTER.h, z: COUNTER_FRONT - 0.2 },
} as const;

/** A point in the stall's frame, in the world. */
export function marketToWorld(lx: number, lz: number): { x: number; z: number } {
  const c = Math.cos(MODEL_MARKET.heading);
  const s = Math.sin(MODEL_MARKET.heading);
  return { x: MODEL_MARKET.x + lx * c + lz * s, z: MODEL_MARKET.z - lx * s + lz * c };
}

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
const PLANK = [0x8e5b33, 0x82522e] as const;
const BRASS = 0xe9b54a;
const IRON = 0x2b2d2c;
const RED = 0xc8302a;
const WHITE = 0xf5efe2;
const CLOTH_BLUE = 0x2f64aa;
const CORK = 0xb07a45;
const SHUTTER = 0x2f6b4d;
const GLASS = 0x1b2528;
const CYPRESS = 0x1e4a2a;
/** The boards' faces and frames: sage, sky blue, and red framed in gold. */
const BOARD_FACE = [0x8fae74, 0x3e7fc6, 0xb3302a] as const;
const BOARD_FRAME = [0x5b3a20, 0x5b3a20, 0xe6b44c] as const;
/**
 * The lantern glass is the town's glow material. It mixes its vertex colour × 0.18 by day with an
 * orange glow by night, so a colour over 1 keeps the glass warm and bright in the afternoon too.
 */
const LANTERN_GLASS: readonly [number, number, number] = [5.5, 3.9, 1.4];
/** The jar's highlights: white on the glow material by day. */
const GLASS_SHINE: readonly [number, number, number] = [4.3, 5.0, 5.1];
/** The collectible starfish's shape and colours, 0.55 m in radius. */
const starShape = starGeometry();

type Buckets = Record<MaterialKey, BufferGeometry[]>;

interface MarketColliders {
  boxes: VillageBoxCollider[];
  camera: VillageBoxCollider[];
}

interface Local {
  stone: BufferGeometry[];
  plaster: BufferGeometry[];
  wood: BufferGeometry[];
  cloth: BufferGeometry[];
  metal: BufferGeometry[];
  glow: BufferGeometry[];
  roofTile: BufferGeometry[];
}

/** A sphere (a blob of leaves or flowers, a knob), squashed by sy. */
function blob(
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

/** The loggia: piers, arches, spandrels, cornice, upper storey, eave and roof, and the inside's shell. */
function addShell(l: Local, lite: boolean): void {
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

/** One beam inside an arch (each a step higher), on two corbels, and two chains down to the board. */
function addBeamAndChains(l: Local, i: number, lite: boolean): void {
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
  // The chains: iron links, alternately turned.
  const top = b.top + (b.shape === 'crest' ? 0.07 : 0.05);
  for (const s of [-1, 1]) {
    const x = b.x + s * Math.min(b.w / 2 - 0.18, 0.75);
    const y0 = b.beam;
    if (lite) {
      l.metal.push(
        tubeBetween(0.014, { x, y: top, z: MARKET_LAYOUT.boardZ - 0.02 }, { x, y: y0, z: BEAM.z }, IRON, 4),
      );
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
          { x, y: top + k * lh - 0.006, z: MARKET_LAYOUT.boardZ - 0.02 },
          IRON,
          1.8,
        ),
      );
  }
}

/**
 * A board: its shaped backing, the painted face over it, and a chunky carved frame that follows the
 * outline all round, scalloped top or crest included (gilded on the Powerful board).
 */
function addBoard(l: Local, i: number): void {
  const b = MARKET_LAYOUT.boards[i]!;
  const z = MARKET_LAYOUT.boardZ;
  const rim = i === 2 ? 0.11 : 0.08;
  const y0 = b.top - b.h;
  const at = (pts: [number, number][], dy: number) =>
    pts.map(([x, y]) => [b.x + x, dy + y] as [number, number]);
  const outer = at(boardOutline(b.w + rim * 2, b.h + rim * 2, b.shape), y0 - rim);
  const inner = at(boardOutline(b.w, b.h, b.shape), y0);
  const frame = i === 2 ? l.plaster : l.wood;
  frame.push(prismZ(outer, z - 0.07, z - 0.03, BOARD_FRAME[i]!));
  l.cloth.push(prismZ(inner, z - 0.03, z - 0.004, BOARD_FACE[i]!));
  frame.push(frameRing(outer, inner, z - 0.03, z + 0.035, BOARD_FRAME[i]!));
}

/** The counter: a dark body, a light top with an overhang, a plank front between posts, and a kick rail. */
function addCounter(l: Local): void {
  const cx = (COUNTER.x0 + COUNTER.x1) / 2;
  const cw = COUNTER.x1 - COUNTER.x0;
  l.wood.push(box(cw, COUNTER.h - 0.06, COUNTER.d - 0.1, { x: cx, z: COUNTER.z }, WOOD, 1.8));
  l.wood.push(
    plank(
      cw + 0.06,
      0.07,
      COUNTER.d + 0.04,
      { x: cx, y: COUNTER.h - 0.07, z: COUNTER.z + 0.02 },
      WOOD_LIGHT,
      TRIM.light,
      0.5,
    ),
  );
  const front = COUNTER_FRONT;
  const pq = MARKET_LAYOUT.plaque;
  const posts = [-5.08, -3.7, -2.1, -0.92, 0.92, 2.1, 3.7, 5.08];
  for (const x of posts)
    l.wood.push(box(0.1, COUNTER.h - 0.1, 0.05, { x, y: 0.02, z: front + 0.025 }, DARK_WOOD, 1.8));
  // Vertical planks between the posts, 1.5 cm proud of the body.
  let k = 0;
  for (let x = COUNTER.x0 + 0.12; x < COUNTER.x1 - 0.1; x += 0.2, k += 1) {
    if (posts.some((p) => Math.abs(p - x) < 0.11)) continue;
    if (Math.abs(x - pq.x) < pq.w / 2 + 0.02) continue;
    l.wood.push(
      plank(
        0.185,
        COUNTER.h - 0.24,
        0.015,
        { x, y: 0.12, z: front + 0.0075 },
        PLANK[k % 2]!,
        TRIM.light,
        0.5,
        0.2,
      ),
    );
  }
  l.wood.push(box(cw, 0.1, 0.04, { x: cx, y: 0.02, z: front + 0.02 }, DARK_WOOD, 1.8));
  l.wood.push(box(cw, 0.08, 0.035, { x: cx, y: COUNTER.h - 0.16, z: front + 0.0175 }, DARK_WOOD, 1.8));
  // The House special plaque's carved frame (its lettering is a sign).
  l.wood.push(
    box(
      pq.w + 0.12,
      pq.h + 0.12,
      0.03,
      { x: pq.x, y: pq.y - pq.h / 2 - 0.06, z: front + 0.015 },
      DARK_WOOD,
      1.8,
    ),
  );
  // Gilda's step.
  l.wood.push(
    box(
      STEP.x1 - STEP.x0,
      STEP.h,
      STEP.z0 - STEP.z1,
      { x: (STEP.x0 + STEP.x1) / 2, z: (STEP.z0 + STEP.z1) / 2 },
      WOOD_LIGHT,
      1.8,
    ),
  );
  // The blue-and-white cloth over the counter's right end: across the top and down the front.
  const c0 = 4.05;
  const stripes = 6;
  const sw = 0.17;
  for (let s = 0; s < stripes; s += 1) {
    const x = c0 + (s + 0.5) * sw;
    const hex = s % 2 ? WHITE : CLOTH_BLUE;
    l.cloth.push(box(sw, 0.012, COUNTER.d + 0.08, { x, y: COUNTER.h, z: COUNTER.z + 0.04 }, hex, 1.8));
    l.cloth.push(
      box(sw, COUNTER.h - 0.12, 0.012, { x, y: 0.12, z: COUNTER.z + COUNTER.d / 2 + 0.085 }, hex, 1.8),
    );
  }
}

/**
 * The till: a big glass jar at the counter's front edge holding Gilda's starfish, the game's own
 * collectible shape in its coral and gold. The glass is all but invisible (no see-through material
 * for it): a base, a rim at the foot and a rounded shoulder, a brass lid with a knob, and two bright
 * streaks of highlight down the front (unlit glow, like the lanterns' glass). And the brass bell.
 */
function addTill(l: Local, lite: boolean): void {
  const j = MARKET_LAYOUT.jar;
  const r = 0.25;
  const h = 0.5;
  l.plaster.push(cylinder(r + 0.01, r + 0.01, 0.03, { x: j.x, y: j.y, z: j.z }, 0xc9e7e3, 16));
  l.plaster.push(turnedRing(r, 0.022, j.x, j.y + 0.03, j.z, 0xd8f0ec, lite));
  l.plaster.push(turnedRing(r * 0.86, 0.02, j.x, j.y + h + 0.02, j.z, 0xd8f0ec, lite));
  l.plaster.push(cylinder(r * 0.8, r * 0.8, 0.06, { x: j.x, y: j.y + h + 0.07, z: j.z }, BRASS, 16));
  l.plaster.push(cylinder(r * 0.84, r * 0.84, 0.02, { x: j.x, y: j.y + h + 0.07, z: j.z }, 0xc8902e, 16));
  l.plaster.push(blob(j.x, j.y + h + 0.16, j.z, 0.045, 1, BRASS, 8, 5));
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
  // The starfish: 0.2 m across, heaped and tilted toward the plaza, a shade brighter than in the wild.
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
  const bx = -0.35,
    bz = COUNTER.z + 0.05;
  l.wood.push(cylinder(0.12, 0.13, 0.035, { x: bx, y: COUNTER.h, z: bz }, DARK_WOOD, 12));
  l.plaster.push(blob(bx, COUNTER.h + 0.035, bz, 0.1, 0.85, BRASS, 12, 6));
  l.plaster.push(cylinder(0.012, 0.012, 0.06, { x: bx, y: COUNTER.h + 0.11, z: bz }, BRASS, 6));
  l.plaster.push(blob(bx, COUNTER.h + 0.18, bz, 0.022, 1, BRASS, 6, 4));
}

/** A round rim (a torus-like ring of radius r, tube t) lying flat at (x, y, z). */
function turnedRing(
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

/** The striped awning over the counter, sloping down to the front, with a scalloped valance. */
function addAwning(l: Local): void {
  const aw = AWNING;
  const stripes = 12;
  const sw = (aw.x1 - aw.x0) / stripes;
  const depth = Math.hypot(aw.zFront - aw.zBack, aw.yBack - aw.yFront);
  const tilt = Math.atan2(aw.yBack - aw.yFront, aw.zFront - aw.zBack);
  for (let i = 0; i < stripes; i += 1) {
    const x = aw.x0 + (i + 0.5) * sw;
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
        i % 2 ? WHITE : RED,
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
      prismZ(
        tongue,
        aw.zFront + 0.005 + (i % 2) * 0.006,
        aw.zFront + 0.02 + (i % 2) * 0.006,
        i % 2 ? WHITE : RED,
      ),
    );
  }
  l.wood.push(
    tubeBetween(
      0.035,
      { x: aw.x0, y: aw.yFront + 0.01, z: aw.zFront - 0.02 },
      { x: aw.x1, y: aw.yFront + 0.01, z: aw.zFront - 0.02 },
      DARK_WOOD,
      6,
    ),
  );
}

/** Shelves of bottles, jars and pots against the back wall, either side of the blue curtained door. */
function addShelves(l: Local, lite: boolean): void {
  const zs = BACK + 0.2;
  const units: readonly [number, number][] = [
    [-4.6, -0.85],
    [1.25, 4.6],
  ];
  const tints = [0x2f5fa8, 0x3d8a4f, 0xb03a2e, 0xc8873a, 0x2a4f8f, 0x6a8f3a] as const;
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
  for (const [x0, x1] of units) {
    for (const x of [x0 + 0.04, x1 - 0.04]) l.wood.push(box(0.06, 2.75, 0.36, { x, z: zs }, DARK_WOOD, 1.8));
    [1.3, 1.95, 2.6].forEach((sy, row) => {
      l.wood.push(box(x1 - x0, 0.05, 0.38, { x: (x0 + x1) / 2, y: sy, z: zs }, WOOD_LIGHT, 1.8));
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
  l.cloth.push(box(1.5, 2.45, 0.03, { x: 0.2, z: BACK + 0.03 }, 0x23558a, 1.8));
  l.wood.push(
    tubeBetween(
      0.025,
      { x: -0.65, y: 2.48, z: BACK + 0.08 },
      { x: 1.05, y: 2.48, z: BACK + 0.08 },
      DARK_WOOD,
      5,
    ),
  );
}

/** The cork jobs board on two posts behind the counter's right end. */
function addJobsBoard(l: Local): void {
  const ck = MARKET_LAYOUT.cork;
  for (const dx of [-ck.w / 2 - 0.05, ck.w / 2 + 0.05])
    l.wood.push(box(0.08, ck.y + 0.12, 0.08, { x: ck.x + dx, z: ck.z - 0.06 }, DARK_WOOD, 1.8));
  l.wood.push(
    box(ck.w + 0.16, ck.h + 0.16, 0.05, { x: ck.x, y: ck.y - ck.h - 0.08, z: ck.z - 0.07 }, WOOD, 1.8),
  );
  l.cloth.push(box(ck.w, ck.h, 0.02, { x: ck.x, y: ck.y - ck.h, z: ck.z - 0.03 }, CORK, 1.8));
}

/** An iron lantern on a bracket from an end pier's front, its glass lit warm. */
function addLantern(l: Local, px: number): void {
  const lz = FRONT + 0.42;
  const top = 3.2;
  l.metal.push(tubeBetween(0.028, { x: px, y: 3.4, z: FRONT }, { x: px, y: 3.4, z: lz + 0.04 }, IRON, 5));
  l.metal.push(tubeBetween(0.016, { x: px, y: 3.4, z: FRONT + 0.02 }, { x: px, y: 3.17, z: FRONT }, IRON, 4));
  l.metal.push(tubeBetween(0.012, { x: px, y: top + 0.12, z: lz }, { x: px, y: 3.4, z: lz }, IRON, 4));
  const cap = new CylinderGeometry(0.03, 0.17, 0.14, 4, 1);
  cap.rotateY(Math.PI / 4);
  cap.translate(px, top + 0.06, lz);
  l.metal.push(finish(cap, IRON));
  l.metal.push(box(0.22, 0.04, 0.22, { x: px, y: top - 0.02, z: lz }, IRON, 1.8));
  l.metal.push(box(0.18, 0.05, 0.18, { x: px, y: top - 0.42, z: lz }, IRON, 1.8));
  for (const [dx, dz] of [
    [-0.085, -0.085],
    [0.085, -0.085],
    [-0.085, 0.085],
    [0.085, 0.085],
  ] as const)
    l.metal.push(box(0.022, 0.38, 0.022, { x: px + dx, y: top - 0.39, z: lz + dz }, IRON, 1.8));
  const glass = box(0.15, 0.33, 0.15, { x: px, y: top - 0.37, z: lz }, 0xffffff, 1.8);
  const c = glass.getAttribute('color');
  for (let i = 0; i < c.count; i += 1) c.setXYZ(i, ...LANTERN_GLASS);
  l.glow.push(glass);
}

/** Dressing: the barrel, two potted palms at the counter's ends, and a cypress in a stone planter. */
function addOutside(l: Local, lite: boolean): void {
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
  // The concept's two potted palms, either end of the counter, from the plaza's planting kit.
  const plants = makeBuckets();
  const detail = lite ? 'lite' : 'full';
  addPottedPlant(plants, -4.45, 0, -1.15, 1.25, 'leafy', detail, 11);
  addPottedPlant(plants, 4.5, 0, -1.15, 1.15, 'leafy', detail, 23);
  for (const key of Object.keys(plants) as MaterialKey[])
    if (key in l) l[key as keyof Local].push(...plants[key]);
  // A tall cypress in a stone planter before the pier between the stall and the passage.
  const pl = { x: PIERS[3], z: 1.3 };
  l.plaster.push(box(1.0, 0.66, 1.0, { x: pl.x, z: pl.z }, SAND[0], 1.8));
  l.plaster.push(box(1.12, 0.08, 1.12, { x: pl.x, y: 0.66, z: pl.z }, SAND_EDGE, 1.8));
  l.wood.push(cylinder(0.09, 0.11, 0.8, { x: pl.x, y: 0.66, z: pl.z }, 0x5a3924, 6));
  const sides = lite ? 6 : 8;
  for (const [y0, r, h, hex] of [
    [1.05, 0.62, 2.5, CYPRESS],
    [1.95, 0.48, 2.1, 0x173d22],
    [2.85, 0.33, 1.65, 0x21522f],
  ] as const) {
    const cone = new CylinderGeometry(0, r, h, sides, 1);
    cone.translate(pl.x, y0 + h / 2, pl.z);
    l.cloth.push(finish(cone, hex));
  }
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
  const local: Local = { stone: [], plaster: [], wood: [], cloth: [], metal: [], glow: [], roofTile: [] };
  addShell(local, lite);
  MARKET_LAYOUT.boards.forEach((_, i) => {
    addBeamAndChains(local, i, lite);
    addBoard(local, i);
  });
  addCounter(local);
  addTill(local, lite);
  addAwning(local);
  addShelves(local, lite);
  addJobsBoard(local);
  for (const px of [PIERS[0], PIERS[4]]) addLantern(local, px);
  addOutside(local, lite);

  for (const key of ['plaster', 'wood'] as const) for (const g of local[key]) occlude(g);
  const m = new Matrix4().makeRotationY(MODEL_MARKET.heading).setPosition(MODEL_MARKET.x, y, MODEL_MARKET.z);
  for (const key of Object.keys(local) as (keyof Local)[])
    for (const g of local[key]) buckets[key].push(g.applyMatrix4(m));

  const at = (lx: number, lz: number, hx: number, hz: number, y0: number, y1: number): VillageBoxCollider => {
    const p = marketToWorld(lx, lz);
    return { x: p.x, z: p.z, hx, hz, rot: MODEL_MARKET.heading, y0: y + y0, y1: y + y1 };
  };
  const walk = (cl: VillageBoxCollider, h: number): VillageBoxCollider => ({
    x: cl.x,
    z: cl.z,
    hx: cl.hx,
    hz: cl.hz,
    rot: cl.rot,
    height: h,
  });
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
    walk(at(-4.45, -1.15, 0.45, 0.45, 0, 0.7), 0.7),
    walk(at(4.5, -1.15, 0.45, 0.45, 0, 0.7), 0.7),
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
    at(PIERS[3], 1.3, 0.6, 0.6, 0, 5.5),
  );
}
