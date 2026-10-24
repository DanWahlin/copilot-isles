import type { BoxCollider } from '../../../../game/collision';
import type { CameraBlockerBox } from '../../../terrain/camera-blockers';
import type { PaintedSign, SignSet } from '../../../sites/sign';
import { THOUSAND_BOUGH as TB, TREE, atBearing } from '../layout';
import { thousandBoughHeight, thousandBoughWater } from '../height';

const WATER = thousandBoughWater();
import { CREW_HOUSES, SCAFFOLD, coreSurface } from '../tree/shape';
import { PAINT, beam, box, cone, gridSurface, lanternPaint, rod, rope, type Buckets } from './pieces';
import {
  BOOTHS,
  BRIDGES,
  DECKS,
  FALLS_LEDGE,
  DECK_HOUSES,
  LANDING_DECK,
  deckHouseU,
  rectWorld,
  villageWalkable,
  type Rect,
} from './surfaces';
import type { StructureOut } from './structure';
import { branchSignLines } from './branch-sign';
import { hasActiveCourse, islandSign } from '../../../../course/active';
import { byActs, puzzleMaybe } from '../../../../course/puzzles';
import type { PuzzleFile } from '../../../../course/pack';
import type { Crew } from '../contract';

/**
 * The island's lettering that's the course's (`puzzles/channel-routing.json`): each crew's
 * treehouse sign (`crews.<id>.sign`), the Great Hall's arch (`text.hallSign`), the scaffold's board
 * (`text.scaffoldSign`) and the Spire's two lookouts (`text.lookout1`, `text.lookout2`), blank in a
 * course without the puzzle (its site is scenery); and the top deck's house board, the island's
 * `loft` sign (`quests/thousand-bough.json` → `signs`).
 */
function courseSigns(): CourseSigns {
  const c = hasActiveCourse()
    ? puzzleMaybe<PuzzleFile & { crews: Record<string, { acts: Crew; sign: string }> }>('channel-routing')
    : null;
  const crews = c ? byActs(c.crews) : null;
  const text = (key: string) => c?.text?.[key] ?? '';
  return {
    crew: (k) => crews?.[k]?.sign ?? '',
    hall: text('hallSign'),
    scaffold: text('scaffoldSign'),
    lookouts: [text('lookout1'), text('lookout2')],
    loft: islandSign('thousand-bough', 'loft'),
  };
}

interface CourseSigns {
  crew(k: Crew): string;
  hall: string;
  scaffold: string;
  lookouts: readonly [string, string];
  loft: string;
}

/**
 * The tree village's houses and set pieces: the three crews' round treehouses (each its own: blue's
 * star window and sails, green's beetle weathervane and shutters, teal's scroll racks and paper-boat
 * garlands), the Practice Bough's cottage, the two-storey loft on the top deck, the Three Landings'
 * scaffold, the boathouse, the reed booths, the wheel-lifts' frames, the Great Hall's arch and the
 * Fern Walk's lanterns and flowers. The signs with course words read the course pack (`courseSigns`).
 */

const TAU = Math.PI * 2;

interface HutStyle {
  crew: 'blue' | 'green' | 'teal';
  trim: number;
  /** Wall sides. */
  sides: number;
}

function addBox(
  out: { colliders: BoxCollider[]; cameraBoxes: CameraBlockerBox[] },
  x: number,
  z: number,
  half: number,
  rot: number,
  y0: number,
  y1: number,
): void {
  out.colliders.push({ x, z, hx: half, hz: half, rot, y0, y1, height: y1 - y0 });
  out.cameraBoxes.push({ x, z, hx: half, hz: half, rot, y0, y1 });
}

/** A glowing window (lit from inside at dusk) with a frame in the crew's trim. */
function windowAt(
  buckets: Buckets,
  x: number,
  y: number,
  z: number,
  yaw: number,
  w: number,
  h: number,
  trim: number,
  shutters: boolean,
): void {
  const g = box(buckets, 'glow', x, y, z, w, h, 0.05, yaw, 0xffffff);
  lanternPaint(g, 4.2);
  const fx = Math.cos(yaw);
  const fz = -Math.sin(yaw);
  const nx = Math.sin(yaw);
  const nz = Math.cos(yaw);
  for (const s of [-1, 1]) {
    box(
      buckets,
      'wood',
      x + fx * s * (w / 2 + 0.06) + nx * 0.04,
      y,
      z + fz * s * (w / 2 + 0.06) + nz * 0.04,
      0.1,
      h + 0.2,
      0.1,
      yaw,
      trim,
    );
    if (shutters)
      box(
        buckets,
        'wood',
        x + fx * s * (w * 0.75 + 0.14) + nx * 0.08,
        y,
        z + fz * s * (w * 0.75 + 0.14) + nz * 0.08,
        w * 0.5,
        h,
        0.05,
        yaw,
        trim,
      );
  }
  box(buckets, 'wood', x + nx * 0.06, y - h / 2 - 0.06, z + nz * 0.06, w + 0.3, 0.1, 0.22, yaw, trim);
  box(buckets, 'wood', x + nx * 0.04, y + h / 2 + 0.06, z + nz * 0.04, w + 0.2, 0.1, 0.12, yaw, trim);
}

/** A round treehouse on its bough: a ring platform, plank walls, a layered thatch cone and the crew's touches. */
function crewHut(
  buckets: Buckets,
  signs: SignSet,
  out: StructureOut,
  h: (typeof CREW_HOUSES)[number],
  style: HutStyle,
  sign: string,
): void {
  const scale = 0.9;
  const R = h.half * scale;
  const y = h.floor;
  const face = Math.atan2(TREE.x - h.x, TREE.z - h.z);
  // The platform: a ring of boards round the hut, its rail, and the bracket posts down to the bough.
  const plat = R * 1.5;
  for (let k = 0; k < 16; k++) {
    const a0 = (k / 16) * TAU;
    const a1 = ((k + 1) / 16) * TAU;
    gridSurface(
      buckets,
      'wood',
      [
        { x: h.x + Math.sin(a0) * 0.2, y, z: h.z + Math.cos(a0) * 0.2 },
        { x: h.x + Math.sin(a1) * 0.2, y, z: h.z + Math.cos(a1) * 0.2 },
        { x: h.x + Math.sin(a0) * plat, y, z: h.z + Math.cos(a0) * plat },
        { x: h.x + Math.sin(a1) * plat, y, z: h.z + Math.cos(a1) * plat },
      ],
      2,
      2,
      k % 3 === 0 ? PAINT.teak : PAINT.plank,
    );
  }
  for (let k = 0; k < 16; k++) {
    const a0 = (k / 16) * TAU;
    const a1 = ((k + 1) / 16) * TAU;
    const p0 = { x: h.x + Math.sin(a0) * (plat - 0.1), y: y - 0.15, z: h.z + Math.cos(a0) * (plat - 0.1) };
    const p1 = { x: h.x + Math.sin(a1) * (plat - 0.1), y: y - 0.15, z: h.z + Math.cos(a1) * (plat - 0.1) };
    beam(buckets, 'wood', p0, p1, 0.12, 0.3, PAINT.weathered);
    box(buckets, 'wood', p0.x, y + 0.5, p0.z, 0.1, 1, 0.1, 0, PAINT.weathered);
    beam(buckets, 'wood', { ...p0, y: y + 1 }, { ...p1, y: y + 1 }, 0.09, 0.08, style.trim);
  }
  // Walls: vertical planks, a trim band in the crew's colour, the door facing the trunk.
  const sides = style.sides;
  const wallH = 2.7 * scale;
  for (let k = 0; k < sides; k++) {
    const a = ((k + 0.5) / sides) * TAU + face;
    const wx = h.x + Math.sin(a) * R;
    const wz = h.z + Math.cos(a) * R;
    const facet = 2 * R * Math.sin(Math.PI / sides);
    box(
      buckets,
      'wood',
      wx,
      y + wallH / 2,
      wz,
      facet + 0.06,
      wallH,
      0.14,
      a,
      k % 2 ? PAINT.teak : PAINT.plank,
    );
    box(
      buckets,
      'wood',
      wx + Math.sin(a) * 0.06,
      y + wallH - 0.25,
      wz + Math.cos(a) * 0.06,
      facet + 0.08,
      0.22,
      0.06,
      a,
      style.trim,
    );
    if (k === 0) {
      box(
        buckets,
        'wood',
        wx + Math.sin(a) * 0.08,
        y + 1.05,
        wz + Math.cos(a) * 0.08,
        0.9,
        2.0,
        0.06,
        a,
        PAINT.weathered,
      );
      box(
        buckets,
        'metal',
        wx + Math.sin(a) * 0.13 + Math.cos(a) * 0.3,
        y + 1.0,
        wz + Math.cos(a) * 0.13 - Math.sin(a) * 0.3,
        0.06,
        0.06,
        0.06,
        a,
        PAINT.brass,
      );
    } else if (k === Math.floor(sides / 3) || k === sides - Math.floor(sides / 3)) {
      windowAt(
        buckets,
        wx + Math.sin(a) * 0.08,
        y + 1.55,
        wz + Math.cos(a) * 0.08,
        a,
        0.75,
        0.85,
        style.trim,
        style.crew === 'green',
      );
    }
  }
  // A thatch cone with a second layer, a ridge collar and a finial.
  const roofR = R * 1.42;
  cone(buckets, 'thatch', h.x, y + wallH - 0.05, h.z, roofR, 2.9 * scale, 14, PAINT.thatch);
  cone(buckets, 'thatch', h.x, y + wallH + 1.25 * scale, h.z, roofR * 0.55, 2.2 * scale, 12, 0xb89558);
  const top = y + wallH + 3.4 * scale;
  rod(
    buckets,
    'wood',
    { x: h.x, y: top - 0.2, z: h.z },
    { x: h.x, y: top + 0.9, z: h.z },
    0.06,
    5,
    PAINT.weathered,
  );
  // Each crew's own touches.
  const fx = Math.sin(face);
  const fz = Math.cos(face);
  if (style.crew === 'blue') {
    // A star-shaped window over the door, and two blue sails on spars.
    const sx = h.x + fx * (R + 0.1);
    const sz = h.z + fz * (R + 0.1);
    for (let i = 0; i < 5; i++) {
      const g = box(
        buckets,
        'glow',
        sx,
        y + wallH + 0.55,
        sz,
        0.16,
        0.62,
        0.05,
        face,
        0xffffff,
        0,
        (i / 5) * Math.PI,
      );
      lanternPaint(g, 4.6);
    }
    for (const s of [-1, 1]) {
      const base = {
        x: h.x + Math.cos(face) * s * R * 1.25,
        y: y + 0.2,
        z: h.z - Math.sin(face) * s * R * 1.25,
      };
      rod(buckets, 'wood', base, { ...base, y: y + 5.4 }, 0.06, 5, PAINT.weathered);
      gridSurface(
        buckets,
        'cloth',
        [
          { ...base, y: y + 5.2 },
          { x: base.x + fx * 1.6, y: y + 3.4, z: base.z + fz * 1.6 },
          { ...base, y: y + 2.4 },
          { x: base.x + fx * 0.2, y: y + 2.4, z: base.z + fz * 0.2 },
        ],
        2,
        2,
        PAINT.blue,
      );
    }
  } else if (style.crew === 'green') {
    // A beetle weathervane on the finial.
    box(buckets, 'metal', h.x, top + 0.95, h.z, 0.32, 0.12, 0.5, face, PAINT.iron);
    box(buckets, 'metal', h.x, top + 1.0, h.z, 0.36, 0.08, 0.28, face, PAINT.green);
    for (const s of [-1, 1])
      for (const o of [-0.15, 0, 0.15])
        beam(
          buckets,
          'metal',
          {
            x: h.x + Math.cos(face) * 0.12 * s + fx * o,
            y: top + 0.95,
            z: h.z - Math.sin(face) * 0.12 * s + fz * o,
          },
          {
            x: h.x + Math.cos(face) * 0.32 * s + fx * o,
            y: top + 0.85,
            z: h.z - Math.sin(face) * 0.32 * s + fz * o,
          },
          0.03,
          0.03,
          PAINT.iron,
        );
  } else {
    // Scroll racks by the door and paper-boat garlands from the roof's edge.
    for (const s of [-1, 1]) {
      const rx = h.x + fx * (R + 0.4) + Math.cos(face) * s * 1.1;
      const rz = h.z + fz * (R + 0.4) - Math.sin(face) * s * 1.1;
      box(buckets, 'wood', rx, y + 0.6, rz, 0.8, 1.2, 0.35, face, PAINT.teakDark);
      for (let i = 0; i < 6; i++)
        rod(
          buckets,
          'cloth',
          {
            x: rx - Math.cos(face) * 0.3 + Math.cos(face) * (i % 3) * 0.3,
            y: y + 0.3 + Math.floor(i / 3) * 0.5,
            z: rz + Math.sin(face) * 0.3 - Math.sin(face) * (i % 3) * 0.3,
          },
          {
            x: rx - Math.cos(face) * 0.3 + Math.cos(face) * (i % 3) * 0.3 + fx * 0.3,
            y: y + 0.3 + Math.floor(i / 3) * 0.5,
            z: rz + Math.sin(face) * 0.3 - Math.sin(face) * (i % 3) * 0.3 + fz * 0.3,
          },
          0.07,
          6,
          PAINT.cream,
        );
    }
    for (let i = 0; i < 10; i++) {
      const a0 = face + (i / 10) * TAU;
      const a1 = face + ((i + 1) / 10) * TAU;
      const p0 = {
        x: h.x + Math.sin(a0) * roofR * 0.98,
        y: y + wallH - 0.1,
        z: h.z + Math.cos(a0) * roofR * 0.98,
      };
      const p1 = {
        x: h.x + Math.sin(a1) * roofR * 0.98,
        y: y + wallH - 0.1,
        z: h.z + Math.cos(a1) * roofR * 0.98,
      };
      rope(buckets, p0, p1, 0.35, 0.015, PAINT.rope, 3);
      const mid = { x: (p0.x + p1.x) / 2, y: y + wallH - 0.55, z: (p0.z + p1.z) / 2 };
      cone(buckets, 'cloth', mid.x, mid.y - 0.12, mid.z, 0.16, 0.18, 3, i % 2 ? PAINT.cream : PAINT.teal);
    }
  }
  // The crew's sign: a folder-tab board on the platform's front rail.
  const board = signs.add([sign], 1.5, 0.42, { twoSided: true, colors: ['#f6e7c8'] });
  board.object.position.set(h.x + fx * (plat - 0.05), y + 1.35, h.z + fz * (plat - 0.05));
  board.object.rotation.y = face;
  // The basket lift's rope from the platform's edge down to its wheel at the trunk's foot.
  const wheel = TB.water.wheels.find((w) => w.crew === h.crew)!;
  const wp = atBearing(wheel.bearing, wheel.r);
  const wheelY = thousandBoughHeight(wp.x, wp.z) + 2.6;
  const edge = { x: h.x + fx * plat * 0.8, y: y - 0.2, z: h.z + fz * plat * 0.8 };
  rod(buckets, 'rope', { x: wp.x, y: wheelY, z: wp.z }, edge, 0.03, 4, PAINT.rope);
  // Lanterns at the door.
  out.lanterns.push({
    x: h.x + fx * (R + 0.35) + Math.cos(face) * 0.9,
    y: y + 2.1,
    z: h.z + fz * (R + 0.35) - Math.sin(face) * 0.9,
    hang: true,
  });
  addBox(out, h.x, h.z, R * 1.05, 0, y - 0.5, y + wallH + 3.2);
  // The roof's overhang (past the walls' box).
  out.cameraBoxes.push({
    x: h.x,
    z: h.z,
    hx: roofR * 0.82,
    hz: roofR * 0.82,
    rot: 0.39,
    y0: y + wallH - 0.1,
    y1: y + wallH + 1.4 * scale,
  });
}

/** A rectangular cottage on a deck's outer end (the Practice Bough's, the top deck's loft). */
function deckHouse(
  buckets: Buckets,
  signs: SignSet,
  out: StructureOut,
  id: 'L2S' | 'L3SE',
  loft = '',
): PaintedSign {
  const d = DECKS[id];
  const r = d.rect;
  const spec = DECK_HOUSES[id];
  const u = deckHouseU(id);
  const c = rectWorld(r, u, 0);
  const yaw = Math.atan2(r.ux, r.uz);
  const y = d.y;
  const storeyH = 2.9;
  const H = storeyH * spec.storeys;
  const hd = spec.depth / 2;
  const hw = spec.width / 2;
  const trim = id === 'L2S' ? PAINT.teakDark : 0x8c6a3c;
  // Each house its own look: weathered lower storey, a paler upper one, painted shutters.
  const look =
    id === 'L2S'
      ? { lower: PAINT.weathered, upper: PAINT.cream, shutter: 0x4f7d4a, flowers: PAINT.heliconia }
      : { lower: PAINT.teak, upper: 0xd9c8a6, shutter: 0x5f7f99, flowers: PAINT.orchid };
  // Walls: planks, with windows; the door on the deck side (toward the tree).
  const walls: [number, number, number, number][] = [
    [-hd, -hw, -hd, hw],
    [hd, -hw, hd, hw],
    [-hd, -hw, hd, -hw],
    [-hd, hw, hd, hw],
  ];
  walls.forEach(([u0, v0, u1, v1], wi) => {
    const a = rectWorld(r, u + u0, v0);
    const b = rectWorld(r, u + u1, v1);
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    const wy = Math.atan2(b.z - a.z, -(b.x - a.x)) + Math.PI / 2;
    for (let s = 0; s < spec.storeys; s++)
      box(
        buckets,
        'wood',
        (a.x + b.x) / 2,
        y + s * storeyH + storeyH / 2,
        (a.z + b.z) / 2,
        len + 0.14,
        storeyH,
        0.16,
        wy - Math.PI / 2,
        s === 0 ? look.lower : look.upper,
      );
    // Windows: two on each side wall per storey, one on the back (outward from the house's centre).
    const mx = (a.x + b.x) / 2;
    const mz = (a.z + b.z) / 2;
    const ol = Math.hypot(mx - c.x, mz - c.z) || 1;
    const ox = (mx - c.x) / ol;
    const oz = (mz - c.z) / ol;
    const count = wi >= 2 ? 2 : wi === 1 ? 1 : 0;
    for (let s = 0; s < spec.storeys; s++)
      for (let k = 0; k < count; k++) {
        const t = (k + 1) / (count + 1);
        const p = { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
        windowAt(
          buckets,
          p.x + ox * 0.1,
          y + s * storeyH + 1.6,
          p.z + oz * 0.1,
          Math.atan2(ox, oz),
          0.8,
          0.9,
          look.shutter,
          true,
        );
        // A window box of flowers under each lower window.
        if (s === 0) {
          const bx = p.x + ox * 0.28;
          const bz = p.z + oz * 0.28;
          box(buckets, 'wood', bx, y + 1.02, bz, 0.95, 0.18, 0.24, Math.atan2(ox, oz), trim);
          for (let f = -1; f <= 1; f++)
            cone(
              buckets,
              'cloth',
              bx + Math.cos(Math.atan2(ox, oz)) * f * 0.3,
              y + 1.1,
              bz - Math.sin(Math.atan2(ox, oz)) * f * 0.3,
              0.13,
              0.2,
              5,
              f === 0 ? PAINT.lantern : look.flowers,
            );
        }
      }
  });
  // The door, toward the tree.
  const door = rectWorld(r, u - hd - 0.09, 0);
  box(buckets, 'wood', door.x, y + 1.05, door.z, 1.0, 2.1, 0.06, yaw, PAINT.weathered);
  // The timber frame: dark corner posts, a belt between the storeys, and a sill on the deck.
  for (const [cu, cv] of [
    [-hd, -hw],
    [hd, -hw],
    [-hd, hw],
    [hd, hw],
  ] as const) {
    const p = rectWorld(r, u + cu, cv);
    box(buckets, 'wood', p.x, y + H / 2, p.z, 0.26, H + 0.05, 0.26, yaw, PAINT.teakDark);
  }
  for (let s = 0; s <= spec.storeys; s++) {
    const by = s === 0 ? y + 0.12 : y + s * storeyH - (s === spec.storeys ? 0.12 : 0);
    box(
      buckets,
      'wood',
      c.x,
      by,
      c.z,
      (s === 0 ? 0.3 : 0.2) + hd * 2,
      0.2,
      (s === 0 ? 0.3 : 0.2) + hw * 2,
      yaw,
      PAINT.teakDark,
    );
  }
  // A little roof over the door on two braces from the wall (nothing standing on the deck), on the
  // two-storey house (the one-storey house's eave is low, and its sign is there).
  if (spec.storeys > 1) {
    const door0 = rectWorld(r, u - hd - 0.75, 0);
    box(buckets, 'thatch', door0.x, y + 3.0, door0.z, 1.5, 0.14, 2.3, yaw, PAINT.thatch, -0.22);
    for (const sv of [-1.25, 1.25]) {
      const w0 = rectWorld(r, u - hd, sv);
      const w1 = rectWorld(r, u - hd - 1.2, sv);
      beam(
        buckets,
        'wood',
        { x: w0.x, y: y + 2.3, z: w0.z },
        { x: w1.x, y: y + 2.88, z: w1.z },
        0.09,
        0.09,
        PAINT.teakDark,
      );
    }
  }
  // A hipped thatch roof (a four-sided cone) with overhang, its rafters' ends showing under the eaves.
  const roofR = Math.hypot(hd, hw) * 1.25;
  for (let k = -3; k <= 3; k++)
    for (const side of [-1, 1]) {
      const a = rectWorld(r, u + (k / 3.4) * hd, side * hw);
      const b = rectWorld(r, u + (k / 3.4) * hd, side * (hw + 0.75));
      beam(
        buckets,
        'wood',
        { x: a.x, y: y + H - 0.02, z: a.z },
        { x: b.x, y: y + H - 0.3, z: b.z },
        0.08,
        0.1,
        PAINT.teakDark,
      );
    }
  cone(buckets, 'thatch', c.x, y + H - 0.05, c.z, roofR, 3.4, 4, PAINT.thatch, 0, (g) => {
    g.rotateY(Math.PI / 4);
    g.scale(hd / Math.max(hd, hw), 1, hw / Math.max(hd, hw));
    g.rotateY(yaw);
  });
  // The practice session's branch (the course's until the player gives theirs), on two lines broken
  // after a hyphen, so all of it fits over the door.
  const sign = signs.add(
    id === 'L2S' ? branchSignLines(null) : [loft],
    id === 'L2S' ? 2.3 : 2.0,
    id === 'L2S' ? 0.6 : 0.42,
    {
      twoSided: false,
      colors: ['#f6e7c8'],
    },
  );
  const sp = rectWorld(r, u - hd - 0.12, 0);
  sign.object.position.set(sp.x, y + 2.45, sp.z);
  sign.object.rotation.y = yaw + Math.PI;
  addBox(out, c.x, c.z, Math.max(hd, hw) + 0.1, -yaw + Math.PI / 2, y - 0.4, y + H + 3);
  out.cameraBoxes.push({
    x: c.x,
    z: c.z,
    hx: Math.max(hd, hw) * 1.25,
    hz: Math.max(hd, hw) * 1.25,
    rot: -yaw + Math.PI / 2,
    y0: y + H - 0.1,
    y1: y + H + 1.5,
  });
  // A lantern either side of the door (the Practice Bough's clear of its sign's ends: a long branch
  // name fills the board).
  for (const s of [-1, 1]) {
    const p = rectWorld(r, u - hd - 0.3, s * (id === 'L2S' ? 1.45 : 0.9));
    out.lanterns.push({ x: p.x, y: y + 2.2, z: p.z, hang: true });
  }
  // A string of pennants along each long eave, the crews' three colours in turn.
  const crews = [PAINT.blue, PAINT.green, PAINT.teal];
  for (const side of [-1, 1]) {
    const a = rectWorld(r, u - hd - 0.4, side * (hw + 0.55));
    const b = rectWorld(r, u + hd + 0.4, side * (hw + 0.55));
    const ya = y + H - 0.35;
    rope(buckets, { x: a.x, y: ya, z: a.z }, { x: b.x, y: ya, z: b.z }, 0.35, 0.015, PAINT.rope, 6);
    const n = 9;
    for (let k = 1; k < n; k++) {
      const t = k / n;
      const px = a.x + (b.x - a.x) * t;
      const pz = a.z + (b.z - a.z) * t;
      const py = ya - 0.35 * 4 * t * (1 - t) - 0.05;
      cone(buckets, 'cloth', px, py - 0.3, pz, 0.15, 0.3, 3, crews[k % 3]!, 0, (g) => {
        g.rotateX(Math.PI);
        g.translate(0, 0.3, 0);
        g.scale(1, 1, 0.25);
        g.rotateY(yaw);
      });
    }
  }
  return sign;
}

/** The Three Landings' scaffold on its fresh bough: a timber frame with the course's board. */
function scaffold(buckets: Buckets, signs: SignSet, out: StructureOut, words: string): void {
  const s = SCAFFOLD;
  const y = s.y;
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + Math.PI / 4;
    const x = s.x + Math.sin(a) * s.half;
    const z = s.z + Math.cos(a) * s.half;
    rod(buckets, 'wood', { x, y, z }, { x, y: y + 3.4, z }, 0.1, 5, PAINT.plank);
    const a2 = ((i + 1) / 4) * TAU + Math.PI / 4;
    const x2 = s.x + Math.sin(a2) * s.half;
    const z2 = s.z + Math.cos(a2) * s.half;
    beam(buckets, 'wood', { x, y: y + 3.4, z }, { x: x2, y: y + 3.4, z: z2 }, 0.12, 0.14, PAINT.plank);
    beam(buckets, 'wood', { x, y: y + 0.1, z }, { x: x2, y: y + 0.1, z: z2 }, 0.14, 0.18, PAINT.teakDark);
    beam(buckets, 'wood', { x, y: y + 0.2, z }, { x: x2, y: y + 3.2, z: z2 }, 0.06, 0.06, PAINT.plank);
  }
  // Fresh boards on the floor, half laid.
  for (let k = 0; k < 6; k++)
    box(
      buckets,
      'wood',
      s.x - s.half + 0.5 + k * 0.62,
      y + 0.25,
      s.z,
      0.55,
      0.06,
      s.half * 1.6,
      0,
      PAINT.plank,
    );
  const sign = signs.add([words], 2.1, 0.5, { twoSided: true, colors: ['#f6e7c8'] });
  // Facing the Three Landings (north).
  sign.object.position.set(s.x, y + 2.3, s.z - s.half * 0.95);
  sign.object.rotation.y = Math.PI;
  addBox(out, s.x, s.z, s.half + 0.2, 0, y - 0.5, y + 3.8);
}

/** The boathouse at Bough Landing: an open thatched shelter on posts, with oars and a coil of rope. */
function boathouse(buckets: Buckets, out: StructureOut): void {
  const L = LANDING_DECK;
  const y = TB.harbor.boughLanding.y;
  const cx = L.x - L.hu + 3.2;
  const cz = L.z - L.hv + 2.8;
  for (const [dx, dz] of [
    [-2.4, -2],
    [2.4, -2],
    [-2.4, 2],
    [2.4, 2],
  ] as const) {
    rod(
      buckets,
      'wood',
      { x: cx + dx, y, z: cz + dz },
      { x: cx + dx, y: y + 2.9, z: cz + dz },
      0.13,
      6,
      PAINT.weathered,
    );
    out.circles.push({ x: cx + dx, z: cz + dz, r: 0.25, y0: y - 0.5, y1: y + 3, height: 3 });
  }
  cone(buckets, 'thatch', cx, y + 2.8, cz, 4.4, 2.4, 4, PAINT.thatch, 0, (g) => {
    g.rotateY(Math.PI / 4);
    g.scale(1, 1, 0.82);
  });
  for (let k = 0; k < 3; k++)
    beam(
      buckets,
      'wood',
      { x: cx - 1.8, y: y + 0.6 + k * 0.05, z: cz - 1.6 + k * 0.3 },
      { x: cx + 1.2, y: y + 1.6 + k * 0.05, z: cz - 1.7 + k * 0.3 },
      0.07,
      0.04,
      PAINT.teak,
    );
  for (let k = 0; k < 4; k++)
    rod(
      buckets,
      'rope',
      { x: cx + 1.6, y: y + 0.05 + k * 0.07, z: cz + 1.2 },
      { x: cx + 1.6, y: y + 0.12 + k * 0.07, z: cz + 1.2 },
      0.45 - k * 0.06,
      10,
      PAINT.rope,
    );
  out.lanterns.push({ x: cx + 2.4, y: y + 2.3, z: cz + 2.0, hang: true });
  // The roof keeps the camera out (you stand under it; it can't swing up through the thatch).
  out.cameraBoxes.push({ x: cx, z: cz, hx: 3.1, hz: 2.6, rot: 0, y0: y + 2.7, y1: y + 5.2 });
}

/** The reed booths over the Booth Pools: open to the east (the path), log floor, a reed cone roof. */
function booths(buckets: Buckets, out: StructureOut): void {
  for (const b of BOOTHS) {
    const y = b.y;
    // Log floor (the walk surface) and the posts into the pool.
    for (let k = 0; k < 7; k++) {
      const v = -b.r + 0.3 + k * ((b.r * 2 - 0.6) / 6);
      const half = Math.sqrt(Math.max(0.1, b.r * b.r - v * v));
      rod(
        buckets,
        'wood',
        { x: b.x - half, y: y - 0.12, z: b.z + v },
        { x: b.x + half, y: y - 0.12, z: b.z + v },
        0.13,
        6,
        k % 2 ? PAINT.teak : PAINT.weathered,
      );
    }
    for (const a of [0.6, 2.2, 3.8, 5.4]) {
      const px = b.x + Math.sin(a) * (b.r - 0.4);
      const pz = b.z + Math.cos(a) * (b.r - 0.4);
      rod(
        buckets,
        'wood',
        { x: px, y: b.pool.level - 1.2, z: pz },
        { x: px, y: y - 0.2, z: pz },
        0.12,
        5,
        PAINT.weathered,
      );
    }
    // Reed walls: three-quarters round, open toward the path (east).
    const wallR = b.r - 0.15;
    const open = Math.PI / 2;
    const n = 9;
    for (let k = 0; k < n; k++) {
      const a0 = open + 0.85 + (k / n) * (TAU - 1.7);
      const a1 = open + 0.85 + ((k + 1) / n) * (TAU - 1.7);
      const quad = [
        { x: b.x + Math.sin(a0) * wallR, y: y + 2.3, z: b.z + Math.cos(a0) * wallR },
        { x: b.x + Math.sin(a1) * wallR, y: y + 2.3, z: b.z + Math.cos(a1) * wallR },
        { x: b.x + Math.sin(a0) * wallR, y: y - 0.05, z: b.z + Math.cos(a0) * wallR },
        { x: b.x + Math.sin(a1) * wallR, y: y - 0.05, z: b.z + Math.cos(a1) * wallR },
      ];
      // Both faces: you see the reeds from inside the booth too.
      gridSurface(buckets, 'thatch', quad, 2, 2, 0xb39a62);
      gridSurface(buckets, 'thatch', [quad[1]!, quad[0]!, quad[3]!, quad[2]!], 2, 2, 0xa48c57);
      const mid = (a0 + a1) / 2;
      const mx = b.x + Math.sin(mid) * wallR;
      const mz = b.z + Math.cos(mid) * wallR;
      out.colliders.push({
        x: mx,
        z: mz,
        hx: wallR * Math.sin((a1 - a0) / 2) + 0.05,
        hz: 0.15,
        rot: mid,
        y0: y - 0.5,
        y1: y + 2.4,
        height: 2.4,
      });
    }
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * TAU;
      rod(
        buckets,
        'wood',
        { x: b.x + Math.sin(a) * wallR, y: y - 0.1, z: b.z + Math.cos(a) * wallR },
        { x: b.x + Math.sin(a) * wallR, y: y + 2.5, z: b.z + Math.cos(a) * wallR },
        0.07,
        5,
        PAINT.weathered,
      );
      // The wall colliders hold the posts in the wall. The posts at the opening stand free: give them
      // their own colliders, so the camera can't go through them.
      if (Math.abs(a - open) < 0.85)
        out.circles.push({
          x: b.x + Math.sin(a) * wallR,
          z: b.z + Math.cos(a) * wallR,
          r: 0.15,
          y0: y - 0.5,
          y1: y + 2.6,
          height: 2.6,
        });
    }
    cone(buckets, 'thatch', b.x, y + 2.35, b.z, b.r * 1.3, 1.9, 10, PAINT.thatch);
    out.cameraBoxes.push({
      x: b.x,
      z: b.z,
      hx: b.r * 1.15,
      hz: b.r * 1.15,
      rot: 0.4,
      y0: y + 2.25,
      y1: y + 4.3,
    });
    out.lanterns.push({ x: b.x + b.r + 0.1, y: y + 2.1, z: b.z, hang: true });
  }
}

/** The wheel-lifts' frames at the trunk's foot (the wheels themselves turn: see the flume view). */
export function wheelFrames(
  buckets: Buckets,
  out: StructureOut,
): { x: number; y: number; z: number; yaw: number; crew: string }[] {
  const wheels: { x: number; y: number; z: number; yaw: number; crew: string }[] = [];
  const F = TB.flume;
  for (const w of TB.water.wheels) {
    const p = atBearing(w.bearing, w.r);
    const ground = thousandBoughHeight(p.x, p.z);
    // The axle lies across the chute that feeds it (from its outlet on the board's south edge).
    const ox = F.cols[F.outlets[w.crew as 'blue' | 'green' | 'teal']]!;
    const oz = F.rows[F.rows.length - 1]! + F.tile / 2 + 1.9;
    const dl = Math.hypot(p.x - ox, p.z - oz);
    const dx = (p.x - ox) / dl;
    const dz = (p.z - oz) / dl;
    const ax = -dz;
    const az = dx;
    const yaw = Math.atan2(-az, ax);
    const axleY = ground + 2.6;
    for (const s of [-1, 1]) {
      const fx = p.x + ax * s * 0.75;
      const fz = p.z + az * s * 0.75;
      beam(
        buckets,
        'wood',
        { x: fx - dx * 1.6, y: ground - 0.3, z: fz - dz * 1.6 },
        { x: fx, y: axleY + 0.2, z: fz },
        0.2,
        0.2,
        PAINT.teakDark,
      );
      beam(
        buckets,
        'wood',
        { x: fx + dx * 1.6, y: ground - 0.3, z: fz + dz * 1.6 },
        { x: fx, y: axleY + 0.2, z: fz },
        0.2,
        0.2,
        PAINT.teakDark,
      );
    }
    out.circles.push({ x: p.x, z: p.z, r: 2.6, y0: ground - 1, y1: ground + 5.4, height: 5.4 });
    wheels.push({ x: p.x, y: axleY, z: p.z, yaw, crew: w.crew });
  }
  return wheels;
}

/** The Great Hall's arch on the trunk (bearing 180): a glowing woven screen in a timber arch, the course's word. */
function greatHallArch(buckets: Buckets, signs: SignSet, words: string): void {
  const b = TB.rootHall.hallArchBearing;
  const y = TB.rootHall.y;
  const r = coreSurface(b, y + 2) * 1.0 + 0.25;
  const c = atBearing(b, r);
  const yaw = (b * Math.PI) / 180;
  const fx = Math.cos(yaw);
  const fz = Math.sin(yaw);
  const ox = Math.sin(yaw);
  const oz = -Math.cos(yaw);
  // The screen: glowing panels in an arch.
  const W = 3.6;
  const H = 4.6;
  for (let i = 0; i < 6; i++) {
    const u = -W / 2 + (i + 0.5) * (W / 6);
    const top = H - 0.8 * ((2 * u) / W) ** 2 * 1.2;
    const g = box(
      buckets,
      'glow',
      c.x + fx * u,
      y + top / 2,
      c.z + fz * u,
      W / 6 - 0.04,
      top,
      0.05,
      Math.PI - yaw,
      0xffffff,
    );
    lanternPaint(g, 3.8);
  }
  // The weave over it (thin slats), the arch's timbers and its posts.
  for (let k = 0; k < 9; k++) {
    const yy = y + 0.3 + k * 0.48;
    beam(
      buckets,
      'wood',
      { x: c.x - fx * W * 0.48 + ox * 0.06, y: yy, z: c.z - fz * W * 0.48 + oz * 0.06 },
      { x: c.x + fx * W * 0.48 + ox * 0.06, y: yy, z: c.z + fz * W * 0.48 + oz * 0.06 },
      0.04,
      0.05,
      PAINT.teakDark,
    );
  }
  let prev: { x: number; y: number; z: number } | null = null;
  for (let k = 0; k <= 12; k++) {
    const a = Math.PI - (k / 12) * Math.PI;
    const u = Math.cos(a) * (W / 2 + 0.25);
    const v = Math.sin(a) * 1.4 + H - 1.2;
    const p = { x: c.x + fx * u + ox * 0.12, y: y + Math.max(0, v), z: c.z + fz * u + oz * 0.12 };
    if (prev) beam(buckets, 'wood', prev, p, 0.34, 0.34, PAINT.teakDark);
    prev = p;
  }
  for (const s of [-1, 1]) {
    const px = c.x + fx * s * (W / 2 + 0.25) + ox * 0.12;
    const pz = c.z + fz * s * (W / 2 + 0.25) + oz * 0.12;
    rod(
      buckets,
      'wood',
      { x: px, y: y - 0.1, z: pz },
      { x: px, y: y + H - 1.2, z: pz },
      0.2,
      6,
      PAINT.teakDark,
    );
  }
  // The branch's name, big and carved over the arch (readable from the Root Gate).
  const sign = signs.add([words], 2.6, 0.8, { colors: ['#f8e6b8'] });
  sign.object.position.set(c.x + ox * 0.32, y + H + 0.7, c.z + oz * 0.32);
  sign.object.rotation.y = Math.atan2(ox, oz);
}

/** The Fern Walk's lantern posts (every 12 m, alternating sides) and wienie flowers at its turns. */
function fernWalkLanterns(
  buckets: Buckets,
  out: StructureOut,
  pts: readonly { x: number; z: number }[] = TB.fernWalk.points,
  width: number = TB.fernWalk.width,
  every: number = TB.fernWalk.lanternEvery,
): void {
  let along = 14;
  let side = 1;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]!;
    const b = pts[i + 1]!;
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    const ux = (b.x - a.x) / len;
    const uz = (b.z - a.z) / len;
    for (; along < len; along += every) {
      const off = width / 2 + 0.9;
      const x = a.x + ux * along - uz * side * off;
      const z = a.z + uz * along + ux * side * off;
      // Not on a deck or by a stop.
      if (
        villageWalkable(x, z) !== null ||
        WATER.levelAt(x, z) !== null ||
        Object.values(TB.anchors).some((a) => Math.hypot(a.x - x, a.z - z) < 4.6)
      ) {
        side = -side;
        continue;
      }
      const ground = thousandBoughHeight(x, z);
      rod(buckets, 'wood', { x, y: ground - 0.4, z }, { x, y: ground + 2.5, z }, 0.09, 6, PAINT.weathered);
      const arm = { x: x + uz * side * 0.55, y: ground + 2.4, z: z - ux * side * 0.55 };
      beam(buckets, 'wood', { x, y: ground + 2.4, z }, arm, 0.06, 0.06, PAINT.weathered);
      out.lanterns.push({ x: arm.x, y: arm.y - 0.42, z: arm.z, hang: true });
      out.circles.push({ x, z, r: 0.18, y0: ground - 1, y1: ground + 2.6, height: 2.6 });
      side = -side;
    }
    along -= len;
  }
}

/**
 * Builds the houses and set pieces; returns the wheels' axles (the flume view turns them) and the
 * Practice Bough house's branch sign.
 */
export function buildHouses(
  buckets: Buckets,
  signs: SignSet,
  out: StructureOut,
): { wheels: ReturnType<typeof wheelFrames>; practiceSign: PaintedSign } {
  const styles: Record<string, HutStyle> = {
    blue: { crew: 'blue', trim: PAINT.blue, sides: 10 },
    green: { crew: 'green', trim: PAINT.green, sides: 8 },
    teal: { crew: 'teal', trim: PAINT.teal, sides: 12 },
  };
  const words = courseSigns();
  for (const h of CREW_HOUSES) crewHut(buckets, signs, out, h, styles[h.crew]!, words.crew(h.crew));
  const practiceSign = deckHouse(buckets, signs, out, 'L2S');
  deckHouse(buckets, signs, out, 'L3SE', words.loft);
  scaffold(buckets, signs, out, words.scaffold);
  boathouse(buckets, out);
  booths(buckets, out);
  greatHallArch(buckets, signs, words.hall);
  portSigns(buckets, signs, out, words.lookouts);
  pathMarkers(buckets, out);
  fernWalkLanterns(buckets, out);
  // The Mirror Pool path's lanterns lead on round the pool to the ledge's pair at the falls.
  fernWalkLanterns(buckets, out, TB.sidePaths.mirror, 2.4, 14);
  const wheels = wheelFrames(buckets, out);
  return { wheels, practiceSign };
}

export type { Rect };

/**
 * The twist's two lookouts, their course names carved on boards where the bridges land (spec §2.7):
 * the first on the Spire top and the second on the ledge, each on two posts beside the bridge's end,
 * facing back along it to L1E, with a lantern over it.
 */
function portSigns(
  buckets: Buckets,
  signs: SignSet,
  out: StructureOut,
  words: readonly [string, string],
): void {
  for (const [id, port] of [
    ['R2', words[0]],
    ['R3', words[1]],
  ] as const) {
    const b = BRIDGES.find((x) => x.id === id)!;
    const e = b.to;
    const dl = Math.hypot(b.from.x - e.x, b.from.z - e.z);
    const dx = (b.from.x - e.x) / dl;
    const dz = (b.from.z - e.z) / dl;
    // A gateway over the bridge's landing: two posts either side, the carved board across the top
    // (you walk under it), facing back along the bridge to L1E, with a lantern on each post.
    const sx = -dz;
    const sz = dx;
    const half = b.width / 2 + 0.35;
    const cx = e.x - dx * 0.5;
    const cz = e.z - dz * 0.5;
    for (const k of [-half, half]) {
      const x = cx + sx * k;
      const z = cz + sz * k;
      rod(buckets, 'wood', { x, y: e.y - 0.3, z }, { x, y: e.y + 3.3, z }, 0.11, 6, PAINT.teakDark);
      out.circles.push({ x, z, r: 0.18, y0: e.y - 0.5, y1: e.y + 3.4, height: 3.4 });
      out.lanterns.push({
        x: x + sx * Math.sign(k) * 0.25,
        y: e.y + 2.6,
        z: z + sz * Math.sign(k) * 0.25,
        hang: true,
      });
    }
    beam(
      buckets,
      'wood',
      { x: cx - sx * (half + 0.3), y: e.y + 3.25, z: cz - sz * (half + 0.3) },
      { x: cx + sx * (half + 0.3), y: e.y + 3.25, z: cz + sz * (half + 0.3) },
      0.22,
      0.22,
      PAINT.teakDark,
    );
    const sign = signs.add([port], 2.1, 0.78, { colors: ['#f8e6b8'], twoSided: true });
    sign.object.position.set(cx, e.y + 2.75, cz);
    sign.object.rotation.y = Math.atan2(dx, dz);
    // The board and the beam over you, for the camera (you walk under them: the pivot ducks).
    out.cameraBoxes.push({
      x: cx,
      z: cz,
      hx: half + 0.42,
      hz: 0.17,
      rot: Math.atan2(-sz, sx),
      y0: e.y + 2.3,
      y1: e.y + 3.4,
    });
  }
}

/**
 * Where the paths start: a pair of lantern posts at the falls ledge's foot (2114, −1606) and at the
 * Mirror Pool path's turn off the boardwalk, so you find them with the compass off.
 */
function pathMarkers(buckets: Buckets, out: StructureOut): void {
  const first = FALLS_LEDGE[0]!;
  const next = FALLS_LEDGE[1]!;
  const dl = Math.hypot(next.x - first.x, next.z - first.z);
  const dx = (next.x - first.x) / dl;
  const dz = (next.z - first.z) / dl;
  const half = TB.cave.ledgeWidth / 2 + 0.6;
  for (const s of [-1, 1]) {
    const x = first.x - dx * 1.2 - dz * s * half;
    const z = first.z - dz * 1.2 + dx * s * half;
    const ground = Math.min(thousandBoughHeight(x, z), first.y);
    rod(buckets, 'wood', { x, y: ground - 0.4, z }, { x, y: ground + 2.3, z }, 0.09, 6, PAINT.weathered);
    out.lanterns.push({ x, y: ground + 2.5, z, hang: false });
    out.circles.push({ x, z, r: 0.18, y0: ground - 1, y1: ground + 2.4, height: 2.4 });
  }
}
