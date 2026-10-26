import type { BufferGeometry } from 'three/webgpu';
import type { BoxCollider } from '../../../game/collision';
import type { CircleObstacle } from '../../contracts';
import type { CameraBlockerBox } from '../../terrain/camera-blockers';
import type { MaterialKey, VillageKit } from '../../village/kit';
import { beam, box, cone, lanternPaint, makeBuckets, rod, rope, type Buckets } from '../../village/pieces';
import { BRIGANTINE_HALF_LENGTH, halfBeamAt, keelHeightAt, sheerHeightAt } from '../../ship/lines';
import { mulberry32 } from '../../../util/math';
import { addVerandaHouse, type VerandaHouseInfo } from '../../village/veranda-house';
import { FRAME, toWorld } from './layout';
import { keelhavenHeight } from './height';
import {
  BERTH,
  CANAL,
  CHAMBERS,
  DOCKS,
  GATES,
  PADS,
  QUAY,
  SEA_GATE_U,
  SLIPWAY,
  WALL,
  padFlatAt,
  worksApronSteps,
  type Chamber,
} from './works';
import { APRON_LIFT } from './apron';
import { lineDeck, uvDeck, type WalkDeck } from './decks';
import { LAMP_LOOKS, lampHead, type LampLook, type LampPiece } from './lamps';

/**
 * Keelhaven's shipyard and harbour (spec §3.4-§3.7, in the merged cove frame): the stone-walled
 * Fitting Basin and three drydocks with their caissons (a hull on keel blocks in Dock 2, a new hull's
 * frames in Dock 3, Dock 1 flooded), the Lock Flight (two locks with mitre gates and balance beams,
 * the gatehouse, the lock lamps), the sheerlegs over the dock heads, jib cranes, the main slipway with
 * a small hull on its ways, workshops, timber stacks, rope, sails drying, and the Old Town quay (a stone
 * mole with fenders and bollards) where the ship berths. Old, weathered Caribbean timber and coral
 * stone, all in the village kit's materials (no new shader). Signs are blank boards (the course's words
 * come from its pack later).
 */

/** The shipyard's colours (spec §2.3), as vertex paint over the kit's materials. */
export const YARD_PAINT = {
  /** Sun-bleached, salt-grey timber. */
  silver: 0xcfc4b2,
  /** Weathered timber, warmer. */
  weathered: 0xc29a6c,
  /** Oak, newly worked. */
  oak: 0xe2b57e,
  /** Tarred timber and pitch. */
  tar: 0x5e4c3e,
  /** Coral stone, dock walls. */
  stone: 0xe8dcc0,
  /** Darker, wet stone low in a chamber. */
  wetStone: 0x9d927c,
  paving: 0xd6cbb2,
  iron: 0x4a4744,
  rope: 0xd8c49a,
  /** Canvas: new, and old and stained. */
  canvas: 0xf1e8d4,
  canvasOld: 0xd8c8a6,
  ochre: 0xb85a3c,
  limewash: 0xefe6d2,
  slate: 0x6a7078,
  red: 0xd9452b,
  green: 0x3fa34d,
} as const;

/** What the works add besides geometry (for the island's wiring later): fences, camera boxes, ship circles. */
export interface ShipyardOut {
  colliders: BoxCollider[];
  circles: CircleObstacle[];
  cameraBoxes: CameraBlockerBox[];
  shipObstacles: CircleObstacle[];
  /** Where the hull in Dock 2 lies: its origin (waterline, middle) and heading (bow along +u). */
  dockHull: { x: number; y: number; z: number; heading: number };
  /** The ship's berth along the quay (world), its heading (bow to the cove's mouth). */
  berth: { x: number; z: number; heading: number };
  /** The walk surfaces over the ground: copings, caissons, gate walkways, the quay, steps and stairs. */
  decks: WalkDeck[];
  /** The glass of the lamps that change (lamps.ts `LampSet`): out of the buckets, by lamp. */
  lamps: LampPiece[];
}

/** A lamp's glass for `out.lamps` under `key`: `make` builds it with the pieces into a scratch bucket. */
export function lampGlass(
  out: ShipyardOut,
  key: string,
  look: LampLook,
  make: (b: Buckets) => BufferGeometry,
): void {
  const scratch = makeBuckets();
  const geo = make(scratch);
  const c = geo.getAttribute('color');
  const p = LAMP_LOOKS[look];
  for (let i = 0; i < c.count; i++) c.setXYZ(i, p[0], p[1], p[2]);
  out.lamps.push({ key, geo });
}

/** The frame's axes as a yaw: a box's local x along u, its local z along v. */
export const YAW_U = Math.atan2(-FRAME.axis.z, FRAME.axis.x);
/** A heading whose local +z runs along +u (a hull's bow inland). */
export const HEADING_U = Math.atan2(FRAME.axis.x, FRAME.axis.z);

type P3 = { x: number; y: number; z: number };

/** A point in the cove frame (u, v) at height y, in world space. */
export function at(u: number, y: number, v: number): P3 {
  const p = toWorld(u, v);
  return { x: p.x, y, z: p.z };
}

/** A box in the cove frame: centred at (u, y, v), `su` along u, `sv` along v, turned `yaw` more. */
export function ubox(
  b: Buckets,
  key: MaterialKey,
  u: number,
  y: number,
  v: number,
  su: number,
  sy: number,
  sv: number,
  colour: number,
  yaw = 0,
  pitch = 0,
  roll = 0,
): BufferGeometry {
  const p = toWorld(u, v);
  const g = box(b, key, p.x, y, p.z, su, sy, sv, YAW_U + yaw, colour, pitch, roll);
  if (key === 'stone' || key === 'paving') stoneUv(g, key === 'paving' ? 2.2 : 1.6);
  return g;
}

/**
 * Masonry's texture laid in world space (a box's own UVs stretch it along a long wall into streaks):
 * on top faces from x and z, on walls along the wall and up, `metres` a repeat.
 */
function stoneUv(g: BufferGeometry, metres: number): void {
  const pos = g.getAttribute('position');
  const nrm = g.getAttribute('normal');
  const uv = g.getAttribute('uv');
  const k = 1 / metres;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const nx = Math.abs(nrm.getX(i));
    const ny = Math.abs(nrm.getY(i));
    if (ny > 0.6) uv.setXY(i, x * k, z * k);
    else if (nx > Math.abs(nrm.getZ(i))) uv.setXY(i, z * k, y * k);
    else uv.setXY(i, x * k, y * k);
  }
  uv.needsUpdate = true;
}

export const ground = (u: number, v: number) => {
  const p = toWorld(u, v);
  return keelhavenHeight(p.x, p.z);
};

/** Whether the point (u, v) lies inside a chamber other than `self`, or out in the cove. */
function openTo(self: Chamber, u: number, v: number): boolean {
  if (self.name === 'cut' && u < self.u0) return true;
  for (const c of CHAMBERS) if (c !== self && u > c.u0 && u < c.u1 && v > c.v0 && v < c.v1) return true;
  return false;
}

/**
 * A chamber's walls: thick coral-stone walls round each closed side (open where it runs into another
 * chamber or the cove), wet and darker low down, a dressed coping on top (each chamber's a centimetre
 * apart from the next's, so overlapping copings never fight), stepped altars down the docks' sides,
 * and a rail of posts and a top rail along every walkable edge over water or a drop.
 */
function chamberWalls(b: Buckets, out: ShipyardOut, c: Chamber, index: number): void {
  const top = c.top + index * 0.012;
  const low = c.floor - 0.4;
  const sides = [
    { along: 'v', u: c.u0, out: -1, from: c.v0, to: c.v1 },
    { along: 'v', u: c.u1, out: 1, from: c.v0, to: c.v1 },
    { along: 'u', v: c.v0, out: -1, from: c.u0, to: c.u1 },
    { along: 'u', v: c.v1, out: 1, from: c.u0, to: c.u1 },
  ] as const;
  for (const s of sides) {
    // Closed runs along the side (open where 1.5 m outside lies in another chamber or the sea).
    const runs: [number, number][] = [];
    let start: number | null = null;
    const step = 0.5;
    for (let t = s.from; t <= s.to + 1e-6; t += step) {
      const u = s.along === 'v' ? s.u + s.out * 1.5 : t;
      const v = s.along === 'v' ? t : s.v + s.out * 1.5;
      const open = openTo(c, u, v);
      if (!open && start === null) start = t;
      if ((open || t + step > s.to + 1e-6) && start !== null) {
        runs.push([start, open ? t : s.to]);
        start = null;
      }
    }
    for (const [r0, r1raw] of runs) {
      let r0e = r0;
      let r1 = r1raw;
      // The u-running walls take the corners (where the side across is closed there too).
      if (s.along === 'u') {
        if (r0 <= s.from + 0.01 && !openTo(c, c.u0 - 1.5, s.v - s.out * 1)) r0e -= WALL;
        if (r1 >= s.to - 0.01 && !openTo(c, c.u1 + 1.5, s.v - s.out * 1)) r1 += WALL;
      }
      const len = r1 - r0e;
      // An end wall's run can be one sample at a corner shared with the next chamber: no stub there.
      if (len < (s.along === 'v' ? 1 : 0.3)) continue;
      const mid = (r0e + r1) / 2;
      const off = (s.out * WALL) / 2;
      const u = s.along === 'v' ? s.u + off : mid;
      const v = s.along === 'v' ? mid : s.v + off;
      const su = s.along === 'v' ? WALL : len;
      const sv = s.along === 'v' ? len : WALL;
      // The wall in two courses: wet, darker stone to the waterline (or a metre up a dry floor), then
      // the dry wall to the coping.
      const wet = (c.water ?? c.floor + 1) + 0.25;
      ubox(b, 'stone', u, (low + wet) / 2, v, su, wet - low, sv, YARD_PAINT.wetStone);
      ubox(b, 'stone', u, (wet + top - 0.25) / 2, v, su, top - 0.25 - wet, sv, YARD_PAINT.stone);
      // The coping: dressed stone, a little proud of the wall's face.
      const cu = s.along === 'v' ? s.u + s.out * (WALL / 2 - 0.08) : mid;
      const cv = s.along === 'v' ? mid : s.v + s.out * (WALL / 2 - 0.08);
      ubox(
        b,
        'paving',
        cu,
        top - 0.125,
        cv,
        s.along === 'v' ? WALL + 0.16 : len,
        0.25,
        s.along === 'v' ? len : WALL + 0.16,
        YARD_PAINT.paving,
      );
      // Walked over its width, and over a strip outside it where no works apron is (the ground off a
      // pad can dip at the wall's back on a coarse tier's grid).
      const back = s.along === 'v' ? [s.u + s.out * (WALL + 0.7), mid] : [mid, s.v + s.out * (WALL + 0.7)];
      const apron = padFlatAt(back[0]!, back[1]!) === null ? APRON : 0;
      const du = s.along === 'v' ? (s.out * apron) / 2 : 0;
      const dv = s.along === 'v' ? 0 : (s.out * apron) / 2;
      const hu = (s.along === 'v' ? WALL + 0.16 + apron : len) / 2;
      const hv = (s.along === 'v' ? len : WALL + 0.16 + apron) / 2;
      out.decks.push(uvDeck(cu + du - hu, cu + du + hu, cv + dv - hv, cv + dv + hv, top, false));
      // A rail along the inner edge, posts every 2.4 m (not on the cut's low quay walls, nor the basin's
      // quay faces, where boats tie up).
      // The canal's rails leave a gap at each gate's hinge, where you step onto its walkway.
      if (c.name !== 'basin' && c.name !== 'cut')
        for (const [a, e] of railRuns(c, s.along, r0, r1raw)) railAlong(b, out, c, s, a, e, top);
    }
  }
  // The docks' altars: three steps down each side, for the shores and the shipwrights.
  if (c.name.startsWith('dock'))
    for (const side of [-1, 1])
      for (let k = 0; k < 3; k++) {
        const y = c.floor + 0.9 + k * 0.9;
        const v = (side < 0 ? c.v0 : c.v1) - side * (0.35 + (2 - k) * 0.55);
        ubox(
          b,
          'stone',
          (c.u0 + c.u1) / 2 + 0.6,
          y - 0.45,
          v,
          c.u1 - c.u0 - 1.2,
          0.9,
          0.55 + 0.02 * k,
          YARD_PAINT.stone,
        );
        // The camera keeps out of each step, from its face back to the wall.
        const depth = 0.35 + (2 - k) * 0.55 + 0.3;
        out.cameraBoxes.push({
          ...xzOf((c.u0 + c.u1) / 2 + 0.6, (side < 0 ? c.v0 : c.v1) - (side * depth) / 2),
          hx: (c.u1 - c.u0 - 1.2) / 2,
          hz: depth / 2,
          rot: YAW_U,
          y0: c.floor - 0.3,
          y1: y,
        });
      }
}

/** How far (m) a chamber wall's walk surface reaches past its back. */
const APRON = 1.4;

/** Where a gate's walkway meets a canal wall (u): a gap in the wall's rail from `GATE_GAP[0]` to `[1]` m past it. */
const GATE_GAP = [-0.45, 0.95] as const;
/** The gates in order along u (`railRuns` walks them so). */
const GATES_UP = [...GATES].sort((x, y) => x - y);

/** A side's rail runs, `r0` to `r1`, split round the canal gates' hinges (the docks' sides are whole). */
function railRuns(c: Chamber, along: 'u' | 'v', r0: number, r1: number): [number, number][] {
  if (along !== 'u' || c.name.startsWith('dock')) return [[r0, r1]];
  const runs: [number, number][] = [];
  let a = r0;
  for (const g of GATES_UP) {
    const g0 = g + GATE_GAP[0];
    const g1 = g + GATE_GAP[1];
    if (g1 <= a || g0 >= r1) continue;
    if (g0 - a > 0.3) runs.push([a, g0]);
    a = Math.max(a, g1);
  }
  if (r1 - a > 0.3) runs.push([a, r1]);
  return runs;
}

/** A rail of posts and a top rail along a wall's inner edge, and the walker's fence along it. */
function railAlong(
  b: Buckets,
  out: ShipyardOut,
  c: Chamber,
  s: { along: 'u' | 'v'; out: number; u?: number; v?: number },
  r0: number,
  r1: number,
  top: number,
): void {
  const inset = 0.35;
  const line = s.along === 'v' ? s.u! + s.out * inset : s.v! + s.out * inset;
  const len = r1 - r0;
  const n = Math.max(1, Math.round(len / 2.4));
  const H = 1.05;
  for (let k = 0; k <= n; k++) {
    const t = r0 + (len * k) / n;
    const u = s.along === 'v' ? line : t;
    const v = s.along === 'v' ? t : line;
    ubox(b, 'wood', u, top + H / 2, v, 0.14, H, 0.14, YARD_PAINT.silver);
  }
  const a = s.along === 'v' ? at(line, top + H, r0) : at(r0, top + H, line);
  const e = s.along === 'v' ? at(line, top + H, r1) : at(r1, top + H, line);
  beam(b, 'wood', a, e, 0.12, 0.09, YARD_PAINT.weathered);
  const m = s.along === 'v' ? at(line, top, (r0 + r1) / 2) : at((r0 + r1) / 2, top, line);
  out.colliders.push({
    x: m.x,
    z: m.z,
    hx: len / 2,
    hz: 0.12,
    rot: s.along === 'v' ? YAW_U + Math.PI / 2 : YAW_U,
    y0: top - 0.45,
    y1: top + 1.3,
    // The camera passes over the rail itself (its pad still keeps the near plane off it).
    eyeTop: top + H + 0.05,
    height: H,
  });
  void c;
}

/**
 * A lock's mitre gates at u (two timber leaves meeting in a shallow V pointing upstream, iron-strapped,
 * a walkway on top), their balance beams over the coping, the sluice paddles' posts, and a blank
 * board for the lock's sign on the upstream gate.
 */
function mitreGate(
  b: Buckets,
  out: ShipyardOut,
  u: number,
  floor: number,
  top: number,
  upstreamTop: number,
): void {
  const half = CANAL.half;
  const point = 1.6;
  const leafLen = Math.hypot(half, point);
  // Each leaf turns by −side × tilt: from its hinge on the wall at u to the mitre at u + point.
  const tilt = Math.atan2(point, half);
  const h = Math.min(top, upstreamTop) + 0.3 - floor;
  for (const side of [-1, 1]) {
    const v = CANAL.v + (side * half) / 2;
    const uc = u + point / 2;
    // A leaf, turned so it runs from its hinge at the wall to the mitre in the middle: tarred and wet
    // low down, weathered silver timber over the water, so it reads against the dark chamber.
    const wet = Math.min(h - 0.4, 1.6);
    ubox(b, 'wood', uc, floor + wet / 2, v, 0.5, wet, leafLen, YARD_PAINT.tar, -side * tilt);
    ubox(
      b,
      'wood',
      uc,
      floor + wet + (h - wet) / 2,
      v,
      0.52,
      h - wet,
      leafLen,
      YARD_PAINT.silver,
      -side * tilt,
    );
    // Its cross-planks on the downstream face (the timber's ribs, a pale line every 0.9 m).
    for (let y = floor + wet + 0.4; y < floor + h - 0.2; y += 0.9)
      ubox(b, 'wood', uc - 0.3, y, v, 0.08, 0.22, leafLen * 0.98, YARD_PAINT.oak, -side * tilt);
    for (let k = 0; k < 4; k++)
      ubox(
        b,
        'metal',
        uc - 0.27,
        floor + 0.6 + (k * (h - 1.2)) / 3,
        v,
        0.06,
        0.16,
        leafLen * 0.96,
        YARD_PAINT.iron,
        -side * tilt,
      );
    // The walkway plank on top of the leaf.
    ubox(b, 'wood', uc, floor + h + 0.06, v, 0.8, 0.12, leafLen, YARD_PAINT.silver, -side * tilt);
    const walk = floor + h + 0.12;
    out.decks.push(lineDeck([u, CANAL.v + side * half, walk], [u + point, CANAL.v, walk], 0.5, true));
    // The walker's fences down both edges of the walkway (the hand rail and the drop), a body's width
    // out so the walker's middle stays on the plank, stopping short of the mitre so you can turn onto
    // the other leaf.
    for (const edge of [-0.8, 0.8]) {
      const nu = (half / leafLen) * side * edge;
      const nv = (point / leafLen) * edge;
      const m = at(
        uc + nu - (point / leafLen) * 0.3,
        0,
        CANAL.v + (side * half) / 2 + nv + side * (half / leafLen) * 0.3,
      );
      out.colliders.push({
        x: m.x,
        z: m.z,
        hx: 0.05,
        hz: leafLen / 2 - 0.35,
        rot: YAW_U - side * tilt,
        y0: walk - 0.6,
        y1: walk + 1.2,
        eyeTop: walk + 1.1,
        height: 1.1,
      });
    }
    // The balance beam: from the leaf's hinge back over the coping, at hand height.
    const hinge = at(u, floor + h + 0.7, CANAL.v + side * half);
    const end = at(u + 5.5, floor + h + 0.75, CANAL.v + side * (half + 2.2));
    beam(b, 'wood', hinge, end, 0.36, 0.42, YARD_PAINT.weathered);
    out.cameraBoxes.push({
      x: (hinge.x + end.x) / 2,
      z: (hinge.z + end.z) / 2,
      hx: Math.hypot(end.x - hinge.x, end.z - hinge.z) / 2 + 0.3,
      hz: 0.4,
      rot: Math.atan2(-(end.z - hinge.z), end.x - hinge.x),
      y0: hinge.y - 0.45,
      y1: end.y + 0.45,
    });
    // Its end painted white (seen down the flight), and a hand rail along the leaf's walkway.
    const tip = at(u + 5.2, floor + h + 0.75, CANAL.v + side * (half + 2.08));
    box(b, 'wood', tip.x, tip.y, tip.z, 0.42, 0.48, 0.42, YAW_U, YARD_PAINT.limewash);
    const r0 = at(u + 0.2, floor + h + 1.1, CANAL.v + side * (half - 0.2));
    const r1 = at(u + point - 0.1, floor + h + 1.1, CANAL.v + side * 0.2);
    beam(b, 'wood', r0, r1, 0.07, 0.07, YARD_PAINT.limewash);
    for (const p0 of [r0, r1])
      rod(b, 'wood', { x: p0.x, y: floor + h, z: p0.z }, p0, 0.04, 4, YARD_PAINT.weathered);
    // A paddle post (the sluice's rack) by the hinge.
    const p = at(u + 1.2, 0, CANAL.v + side * (half + 0.9));
    rod(b, 'wood', { x: p.x, y: top, z: p.z }, { x: p.x, y: top + 1.1, z: p.z }, 0.14, 6, YARD_PAINT.tar);
    box(b, 'metal', p.x, top + 1.12, p.z, 0.36, 0.1, 0.36, YAW_U, YARD_PAINT.iron);
  }
}

/**
 * A post with a lamp (red, or green for the open way), its glass glowing at night. The glass is a
 * lamp of the island's lamp set (`lock:<i>`, upstream first): the circuits run it, and the Seal turns
 * every one green.
 */
function lockLamp(
  b: Buckets,
  out: ShipyardOut,
  key: string,
  u: number,
  v: number,
  y: number,
  colour: 'red' | 'green',
): void {
  const p = at(u, y, v);
  rod(b, 'wood', p, { x: p.x, y: y + 3.2, z: p.z }, 0.11, 6, YARD_PAINT.tar);
  box(b, 'wood', p.x, y + 3.25, p.z, 0.6, 0.1, 0.12, YAW_U + Math.PI / 2, YARD_PAINT.tar);
  lampGlass(
    out,
    key,
    colour === 'red' ? 'notReady' : 'ready',
    (s) =>
      lampHead(b, s, {
        x: p.x,
        y: y + 3.0,
        z: p.z,
        w: 0.26,
        h: 0.34,
        yaw: YAW_U,
        capR: 0.24,
        capH: 0.2,
        capColour: YARD_PAINT.iron,
      }).glass,
  );
  // A brass plate each side of the post, clear of it (props.ts letters both from the course pack).
  for (const side of [1, -1]) {
    const q = at(u + side * LAMP_PLATE_OFF, y, v);
    box(b, 'metal', q.x, y + 1.5, q.z, 0.04, 0.28, 0.42, YAW_U, 0xb8923e);
  }
}

/** How far (u) a lock lamp's plates stand off its post's middle: post 0.11, a gap, half a plate. */
export const LAMP_PLATE_OFF = 0.11 + 0.012 + 0.02;

/** A gabled, open-sided shed (posts, a ridge, two roof slopes of planks), long along u. */
export function shed(
  b: Buckets,
  out: ShipyardOut,
  u: number,
  v: number,
  y: number,
  lu: number,
  lv: number,
  h: number,
  roof: number,
): void {
  for (const du of [-lu / 2, 0, lu / 2])
    for (const dv of [-lv / 2, lv / 2]) {
      const p = at(u + du, y, v + dv);
      rod(
        b,
        'wood',
        { x: p.x, y: y - 0.2, z: p.z },
        { x: p.x, y: y + h, z: p.z },
        0.15,
        6,
        YARD_PAINT.weathered,
      );
      out.circles.push({ x: p.x, z: p.z, r: 0.25, y0: y - 0.5, y1: y + h, height: h });
    }
  const pitch = 0.42;
  const slope = lv / 2 / Math.cos(pitch) + 0.6;
  for (const side of [-1, 1]) {
    const rise = Math.sin(pitch) * (slope / 2);
    ubox(
      b,
      'wood',
      u,
      y + h + rise + 0.1,
      v + side * (lv / 4 + 0.15),
      lu + 1.2,
      0.12,
      slope,
      roof,
      0,
      side * pitch,
    );
  }
  ubox(b, 'wood', u, y + h + Math.sin(pitch) * slope * 0.5 + 0.14, v, lu + 1.3, 0.22, 0.22, YARD_PAINT.tar);
  for (const dv of [-lv / 2, lv / 2]) ubox(b, 'wood', u, y + h, v + dv, lu, 0.22, 0.2, YARD_PAINT.tar);
  // The roof keeps the follow camera out (from its plates to its ridge).
  out.cameraBoxes.push({
    ...toWorld(u, v),
    hx: (lu + 1.3) / 2,
    hz: lv / 2 + 0.7,
    rot: YAW_U,
    y0: y + h - 0.2,
    y1: y + h + Math.sin(pitch) * slope + 0.4,
  });
}

/** A stack of sawn planks (crosswise courses on bearers) or logs, on the ground at (u, v). */
export function timberStack(
  b: Buckets,
  u: number,
  v: number,
  y: number,
  lu: number,
  courses: number,
  seed: number,
): void {
  const rand = mulberry32(seed);
  for (const du of [-lu / 2 + 0.4, 0, lu / 2 - 0.4])
    ubox(b, 'wood', u + du, y + 0.1, v, 0.2, 0.2, 2.6, YARD_PAINT.tar);
  for (let k = 0; k < courses; k++) {
    const yy = y + 0.27 + k * 0.17;
    const boards = 7 - (k % 2);
    for (let i = 0; i < boards; i++) {
      const dv = (i - (boards - 1) / 2) * 0.34 + (rand() - 0.5) * 0.04;
      const len = lu - rand() * 0.8;
      ubox(
        b,
        'wood',
        u + (rand() - 0.5) * 0.4,
        yy,
        v + dv,
        len,
        0.12,
        0.3,
        k % 3 === 2 ? YARD_PAINT.silver : YARD_PAINT.oak,
      );
    }
    ubox(b, 'wood', u, yy + 0.085, v, 0.08, 0.05, 2.4, YARD_PAINT.tar);
  }
}

/** A pile of logs (round trunks along u) chocked on the ground. */
export function logPile(b: Buckets, u: number, v: number, y: number, len: number, seed: number): void {
  const rand = mulberry32(seed);
  const rows = [5, 4, 3];
  rows.forEach((n, row) => {
    for (let i = 0; i < n; i++) {
      const r = 0.3 + rand() * 0.08;
      const dv = (i - (n - 1) / 2) * 0.68;
      const yy = y + 0.32 + row * 0.56;
      const a = at(u - len / 2 + rand() * 0.4, yy, v + dv);
      const e = at(u + len / 2 - rand() * 0.4, yy, v + dv);
      rod(b, 'wood', a, e, r, 7, row === 2 && i === 1 ? YARD_PAINT.oak : YARD_PAINT.weathered);
    }
  });
}

/** A coil of rope lying on the ground (a short wide cylinder). */
export function ropeCoil(b: Buckets, u: number, v: number, y: number, r = 0.42): void {
  const p = at(u, y, v);
  rod(b, 'rope', p, { x: p.x, y: y + 0.18, z: p.z }, r, 10, YARD_PAINT.rope);
  rod(
    b,
    'rope',
    { x: p.x, y: y + 0.18, z: p.z },
    { x: p.x, y: y + 0.3, z: p.z },
    r * 0.7,
    10,
    YARD_PAINT.rope,
  );
}

/** A camera blocker round each propped shutter of a veranda house (they stand out up to a metre). */
export function shadeBlockers(info: VerandaHouseInfo, cams: CameraBlockerBox[]): void {
  for (const h of info.shades)
    cams.push({
      x: h.x,
      z: h.z,
      hx: h.half,
      hz: h.depth + 0.05,
      rot: Math.atan2(-h.az, h.ax),
      y0: h.y0 - 0.1,
      y1: h.y1 + 0.1,
    });
}

/** Casks and crates in a loose group (each keeps the camera out when `cams` is given). */
export function stores(
  b: Buckets,
  u: number,
  v: number,
  y: number,
  seed: number,
  cams?: CameraBlockerBox[],
): void {
  const rand = mulberry32(seed);
  for (let i = 0; i < 6; i++) {
    const du = (rand() - 0.5) * 3.2;
    const dv = (rand() - 0.5) * 2.4;
    if (rand() < 0.55) {
      const p = at(u + du, y, v + dv);
      cams?.push({ x: p.x, z: p.z, hx: 0.38, hz: 0.38, rot: 0, y0: y - 0.3, y1: y + 0.95 });
      rod(b, 'wood', p, { x: p.x, y: y + 0.9, z: p.z }, 0.34, 8, YARD_PAINT.weathered, 0.3);
      rod(
        b,
        'metal',
        { x: p.x, y: y + 0.2, z: p.z },
        { x: p.x, y: y + 0.26, z: p.z },
        0.345,
        8,
        YARD_PAINT.iron,
      );
      rod(
        b,
        'metal',
        { x: p.x, y: y + 0.66, z: p.z },
        { x: p.x, y: y + 0.72, z: p.z },
        0.33,
        8,
        YARD_PAINT.iron,
      );
    } else {
      const s = 0.7 + rand() * 0.4;
      ubox(b, 'wood', u + du, y + s / 2, v + dv, s, s, s, YARD_PAINT.silver, rand() * 0.8);
      // A box round the crate at any turn (half its diagonal).
      const q = at(u + du, y, v + dv);
      cams?.push({ x: q.x, z: q.z, hx: s * 0.71, hz: s * 0.71, rot: 0, y0: y - 0.3, y1: y + s + 0.05 });
    }
  }
}

/** Sails drying: canvas hung over a rope between two poles, sagging, and one spread on trestles. */
export function sailsDrying(
  b: Buckets,
  u: number,
  v: number,
  y: number,
  len: number,
  cams?: CameraBlockerBox[],
): void {
  // The camera keeps out of the sheets (from their lowest hem to the line's posts' tops).
  cams?.push({ ...at(u, y, v), hx: len / 2 + 0.15, hz: 0.25, rot: YAW_U, y0: y + 1, y1: y + 4.25 });
  const a = at(u - len / 2, y, v);
  const e = at(u + len / 2, y, v);
  for (const p of [a, e]) rod(b, 'wood', p, { x: p.x, y: y + 4.2, z: p.z }, 0.12, 6, YARD_PAINT.weathered);
  rope(b, { x: a.x, y: y + 4.0, z: a.z }, { x: e.x, y: y + 4.0, z: e.z }, 0.35, 0.025, YARD_PAINT.rope, 6);
  const n = 3;
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const sag = 0.35 * 4 * t * (1 - t);
    const w = (len / n) * 0.86;
    const hang = 2.6 - i * 0.4;
    const yy = y + 4.0 - sag - hang / 2;
    // Two sheets back to back over the line (a sail folded over it), a hand apart.
    for (const side of [-1, 1])
      ubox(
        b,
        'cloth',
        u - len / 2 + t * len,
        yy,
        v + side * 0.06,
        w,
        hang,
        0.03,
        i === 1 ? YARD_PAINT.canvasOld : YARD_PAINT.canvas,
        0,
        side * 0.05,
      );
  }
}

/** A camera blocker round a hull (or its frames) at `scale`, its waterline middle at `o`, keel along u. */
function hullBlocker(cams: CameraBlockerBox[], o: { u: number; y: number; v: number }, scale: number): void {
  cams.push({
    ...at(o.u, o.y, o.v),
    hx: (BRIGANTINE_HALF_LENGTH + 0.4) * scale,
    hz: halfBeamAt(0, 0.4) * 1.1 * scale,
    rot: YAW_U,
    y0: o.y + keelHeightAt(0) * scale - 0.2,
    y1: o.y + sheerHeightAt(BRIGANTINE_HALF_LENGTH) * scale + 0.2,
  });
}

/**
 * A ship's frames (keel, stem, sternpost and ribs, a few strakes low down) from the brigantine's
 * lines at `scale`, its origin (waterline, middle) at `o`, bow along +u (or −u with `flip`).
 */
function hullFrames(
  b: Buckets,
  o: { u: number; y: number; v: number },
  scale: number,
  flip: boolean,
  strakes: number,
  cams: CameraBlockerBox[],
): void {
  hullBlocker(cams, o, scale);
  const dir = flip ? -1 : 1;
  const pu = (z: number) => o.u + dir * z * scale;
  const L = 11.4;
  // The keel and its blocks.
  ubox(
    b,
    'wood',
    o.u,
    o.y + keelHeightAt(0) * scale,
    o.v,
    L * 2 * scale,
    0.36 * scale,
    0.36 * scale,
    YARD_PAINT.oak,
  );
  for (let z = -L + 0.6; z <= L - 0.6; z += 1.2) {
    const x = (z: number, y: number) => halfBeamAt(z, y) * scale;
    const keel = keelHeightAt(z);
    const sheer = sheerHeightAt(z);
    const n = 6;
    let prev: { y: number; x: number } | null = null;
    for (let k = 0; k <= n; k++) {
      const yl = keel + ((sheer - keel) * k) / n;
      const p = { y: o.y + yl * scale, x: x(z, yl) };
      if (prev)
        for (const side of [-1, 1])
          beam(
            b,
            'wood',
            at(pu(z), prev.y, o.v + side * prev.x),
            at(pu(z), p.y, o.v + side * p.x),
            0.2 * scale + 0.04,
            0.24 * scale + 0.04,
            YARD_PAINT.oak,
          );
      prev = p;
    }
  }
  // Strakes: the first planks up from the keel, along the frames.
  for (let k = 1; k <= strakes; k++) {
    const t = k / 7;
    for (const side of [-1, 1]) {
      let prev: P3 | null = null;
      for (let z = -L + 0.2; z <= L - 0.2; z += 1.1) {
        const yl = keelHeightAt(z) + (sheerHeightAt(z) - keelHeightAt(z)) * t;
        const p = at(pu(z), o.y + yl * scale, o.v + side * (halfBeamAt(z, yl) * scale + 0.06));
        if (prev)
          beam(b, 'wood', prev, p, 0.06, 0.3 * scale + 0.05, k % 2 ? YARD_PAINT.oak : YARD_PAINT.weathered);
        prev = p;
      }
    }
  }
  // The stem and sternpost.
  for (const z of [-L - 0.1, L + 0.1]) {
    const a = at(pu(z), o.y + keelHeightAt(z) * scale, o.v);
    const e = at(pu(z + Math.sign(z) * 0.8), o.y + (sheerHeightAt(z) + 0.6) * scale, o.v);
    beam(b, 'wood', a, e, 0.3 * scale, 0.36 * scale, YARD_PAINT.oak);
  }
}

/** Keel blocks along a dock's middle: stacked timber blocks under where a keel lies. */
function keelBlocks(b: Buckets, u0: number, u1: number, v: number, floor: number, h: number): void {
  for (let u = u0; u <= u1; u += 1.8) {
    for (let k = 0; k < 3; k++) {
      const s = h / 3;
      ubox(
        b,
        'wood',
        u,
        floor + s * (k + 0.5),
        v,
        0.6,
        s - 0.02,
        1.2 - k * 0.15,
        k === 1 ? YARD_PAINT.tar : YARD_PAINT.weathered,
        k % 2 ? 0.04 : -0.03,
      );
    }
  }
}

/** Shores: raking props from a dock's altars to a hull's sides, and scaffold staging along them. */
function shoresAndStaging(b: Buckets, c: Chamber, hullY: number): void {
  const mid = (c.v0 + c.v1) / 2;
  for (let z = -9; z <= 9; z += 3) {
    for (const side of [-1, 1]) {
      const hx = halfBeamAt(z, -0.4);
      const foot = at(DOCKS.u0 + 20 + z, c.floor + 2.7, side < 0 ? c.v0 + 1.0 : c.v1 - 1.0);
      const head = at(DOCKS.u0 + 20 + z, hullY - 0.4, mid + side * (hx + 0.1));
      beam(b, 'wood', foot, head, 0.22, 0.22, YARD_PAINT.weathered);
    }
  }
  // Staging: two levels of planks on poles along the hull's port side.
  for (let z = -8; z <= 8; z += 4) {
    const p = at(DOCKS.u0 + 20 + z, c.floor, c.v0 + 1.2);
    rod(b, 'wood', p, { x: p.x, y: c.top + 1.8, z: p.z }, 0.09, 5, YARD_PAINT.silver);
  }
  for (const y of [c.floor + 2.6, c.top - 0.2])
    ubox(b, 'wood', DOCKS.u0 + 20, y, c.v0 + 1.6, 17, 0.08, 0.9, YARD_PAINT.silver);
}

/** A caisson: the floating timber-and-iron gate across a dock's mouth, its top a walkway. */
function caisson(b: Buckets, out: ShipyardOut, c: Chamber): void {
  const w = c.v1 - c.v0;
  const h = c.top - c.floor;
  ubox(
    b,
    'wood',
    c.u0 + 1.0,
    c.floor + h / 2 - 0.15,
    (c.v0 + c.v1) / 2,
    1.9,
    h - 0.3,
    w + 0.2,
    YARD_PAINT.tar,
  );
  for (let k = 0; k < 5; k++)
    ubox(
      b,
      'metal',
      c.u0 + 0.02,
      c.floor + 0.6 + (k * (h - 1.2)) / 4,
      (c.v0 + c.v1) / 2,
      0.05,
      0.14,
      w,
      YARD_PAINT.iron,
    );
  ubox(b, 'wood', c.u0 + 1.0, c.top - 0.08, (c.v0 + c.v1) / 2, 2.1, 0.14, w + 0.3, YARD_PAINT.silver);
  out.decks.push(uvDeck(c.u0 - 0.05, c.u0 + 2.05, c.v0 - 0.15, c.v1 + 0.15, c.top - 0.01, true));
}

/**
 * The sheerlegs: two raking timber legs (about 30 m) over the dock heads, lashed at the top, held by a
 * back stay to a ground anchor; a block and tackle hangs from the head over Dock 2.
 */
function sheerlegs(b: Buckets, out: ShipyardOut, y: number): void {
  const feet = [at(171, y, DOCKS.v[1] - 9), at(171, y, DOCKS.v[1] + 9)];
  const head = at(160, y + 29, DOCKS.v[1]);
  for (const f of feet) {
    rod(b, 'wood', f, head, 0.42, 8, YARD_PAINT.weathered, 0.3);
    box(b, 'stone', f.x, y + 0.3, f.z, 1.6, 0.6, 1.6, YAW_U, YARD_PAINT.stone);
    out.circles.push({ x: f.x, z: f.z, r: 0.9, y0: y - 0.5, y1: y + 4, height: 4 });
    // The camera keeps out of the leg: a short box for each stretch of it, up to the head.
    const n = 10;
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n;
      const y0 = f.y + (head.y - f.y) * (k / n);
      const y1 = f.y + (head.y - f.y) * ((k + 1) / n);
      out.cameraBoxes.push({
        x: f.x + (head.x - f.x) * t,
        z: f.z + (head.z - f.z) * t,
        hx: 0.45 + Math.hypot(head.x - f.x, head.z - f.z) / n / 2,
        hz: 0.45 + Math.hypot(head.x - f.x, head.z - f.z) / n / 2,
        rot: 0,
        y0: y0 - 0.45,
        y1: y1 + 0.45,
      });
    }
  }
  const anchor = at(186, ground(186, DOCKS.v[1]) + 0.4, DOCKS.v[1]);
  rope(b, { x: head.x, y: head.y + 0.3, z: head.z }, anchor, 0.8, 0.06, YARD_PAINT.rope, 8);
  box(b, 'stone', anchor.x, anchor.y, anchor.z, 1.4, 1, 1.4, YAW_U, YARD_PAINT.stone);
  // The lashing at the head, the block and its falls, the hook hanging over the dock.
  rod(
    b,
    'rope',
    { x: head.x, y: head.y - 0.5, z: head.z },
    { x: head.x, y: head.y + 0.4, z: head.z },
    0.6,
    8,
    YARD_PAINT.rope,
  );
  const hook = { x: head.x, y: y + 9, z: head.z };
  rod(
    b,
    'rope',
    { x: head.x + 0.12, y: head.y - 0.6, z: head.z },
    { x: hook.x + 0.12, y: hook.y + 0.8, z: hook.z },
    0.04,
    4,
    YARD_PAINT.rope,
  );
  rod(
    b,
    'rope',
    { x: head.x - 0.12, y: head.y - 0.6, z: head.z },
    { x: hook.x - 0.12, y: hook.y + 0.8, z: hook.z },
    0.04,
    4,
    YARD_PAINT.rope,
  );
  box(b, 'wood', hook.x, hook.y + 0.6, hook.z, 0.5, 0.8, 0.3, YAW_U, YARD_PAINT.tar);
  box(b, 'metal', hook.x, hook.y, hook.z, 0.12, 0.6, 0.12, YAW_U, YARD_PAINT.iron);
  // The capstan that hauls the falls, between the legs' feet: a waisted drum with the fall's turns
  // on it, a round head with four bars standing out of it, on a low timber base.
  const cap = at(174, y, DOCKS.v[1]);
  rod(
    b,
    'wood',
    { x: cap.x, y, z: cap.z },
    { x: cap.x, y: y + 0.12, z: cap.z },
    0.75,
    10,
    YARD_PAINT.weathered,
  );
  rod(
    b,
    'wood',
    { x: cap.x, y: y + 0.12, z: cap.z },
    { x: cap.x, y: y + 0.6, z: cap.z },
    0.42,
    10,
    YARD_PAINT.tar,
    0.32,
  );
  rod(
    b,
    'wood',
    { x: cap.x, y: y + 0.6, z: cap.z },
    { x: cap.x, y: y + 0.92, z: cap.z },
    0.32,
    10,
    YARD_PAINT.tar,
    0.4,
  );
  rod(
    b,
    'wood',
    { x: cap.x, y: y + 0.92, z: cap.z },
    { x: cap.x, y: y + 1.12, z: cap.z },
    0.5,
    10,
    YARD_PAINT.weathered,
  );
  rod(
    b,
    'rope',
    { x: cap.x, y: y + 0.4, z: cap.z },
    { x: cap.x, y: y + 0.66, z: cap.z },
    0.38,
    10,
    YARD_PAINT.rope,
  );
  for (let k = 0; k < 4; k++) {
    const a = YAW_U + (k * Math.PI) / 2 + Math.PI / 4;
    const r0 = 0.45;
    const r1 = 1.5;
    rod(
      b,
      'wood',
      { x: cap.x + Math.cos(a) * r0, y: y + 1.02, z: cap.z - Math.sin(a) * r0 },
      { x: cap.x + Math.cos(a) * r1, y: y + 1.0, z: cap.z - Math.sin(a) * r1 },
      0.045,
      5,
      YARD_PAINT.oak,
    );
  }
  out.circles.push({ x: cap.x, z: cap.z, r: 0.8, y0: y - 0.5, y1: y + 1.2, height: 1.2 });
}

/** A timber jib crane on a post: a braced jib, its fall and hook, a winch at its foot. */
function jibCrane(
  b: Buckets,
  out: ShipyardOut,
  u: number,
  v: number,
  y: number,
  toward: number,
  h = 8,
): void {
  const p = at(u, y, v);
  rod(b, 'wood', p, { x: p.x, y: y + h, z: p.z }, 0.3, 8, YARD_PAINT.weathered, 0.24);
  box(b, 'stone', p.x, y + 0.25, p.z, 1.4, 0.5, 1.4, YAW_U, YARD_PAINT.stone);
  const jibEnd = at(u + Math.cos(toward) * 6.5, y + h - 0.6, v + Math.sin(toward) * 6.5);
  beam(b, 'wood', { x: p.x, y: y + h - 0.3, z: p.z }, jibEnd, 0.26, 0.3, YARD_PAINT.weathered);
  const braceFoot = { x: p.x, y: y + h - 3.4, z: p.z };
  const braceHead = at(u + Math.cos(toward) * 3.6, y + h - 0.5, v + Math.sin(toward) * 3.6);
  beam(b, 'wood', braceFoot, braceHead, 0.2, 0.2, YARD_PAINT.tar);
  rod(b, 'rope', jibEnd, { x: jibEnd.x, y: y + 2.4, z: jibEnd.z }, 0.035, 4, YARD_PAINT.rope);
  box(b, 'metal', jibEnd.x, y + 2.2, jibEnd.z, 0.1, 0.45, 0.1, YAW_U, YARD_PAINT.iron);
  const w = at(u + 0.9, y + 0.8, v);
  box(b, 'wood', w.x, w.y, w.z, 0.6, 0.8, 1.2, YAW_U, YARD_PAINT.tar);
  rod(
    b,
    'rope',
    { x: w.x - 0.1, y: w.y + 0.15, z: w.z },
    { x: w.x + 0.1, y: w.y + 0.15, z: w.z },
    0.3,
    8,
    YARD_PAINT.rope,
  );
  out.circles.push({ x: p.x, z: p.z, r: 0.8, y0: y - 0.5, y1: y + 2, height: 2 });
  // The camera keeps out of the post to its top, the jib and its brace.
  const dx = jibEnd.x - p.x;
  const dz = jibEnd.z - p.z;
  const len = Math.hypot(dx, dz);
  const rot = Math.atan2(-dz, dx);
  out.cameraBoxes.push({ x: p.x, z: p.z, hx: 0.45, hz: 0.45, rot: 0, y0: y - 0.3, y1: y + h + 0.1 });
  out.cameraBoxes.push({
    x: p.x + dx * 0.5,
    z: p.z + dz * 0.5,
    hx: len / 2 + 0.2,
    hz: 0.25,
    rot,
    y0: y + h - 1,
    y1: y + h + 0.05,
  });
  out.cameraBoxes.push({
    x: p.x + dx * 0.28,
    z: p.z + dz * 0.28,
    hx: len * 0.28,
    hz: 0.2,
    rot,
    y0: y + h - 3.5,
    y1: y + h - 0.4,
  });
}

/** A bollard on a quay's edge. */
export function bollard(b: Buckets, out: ShipyardOut, u: number, v: number, y: number): void {
  const p = at(u, y, v);
  rod(b, 'metal', p, { x: p.x, y: y + 0.6, z: p.z }, 0.2, 8, YARD_PAINT.iron, 0.24);
  out.circles.push({ x: p.x, z: p.z, r: 0.3, y0: y - 0.5, y1: y + 0.7, height: 0.7 });
}

/**
 * The Old Town quay: a coral-stone mole from the beach into the cove, paved on top, timber fenders
 * down its north face (where the ship lies), bollards, a jib crane and stores at its root, a lamp at
 * its head. Its sides go down to the sea floor; the ship's obstacles run along its face.
 */
function quay(b: Buckets, out: ShipyardOut): void {
  const q = QUAY;
  const seg = 6;
  for (let u = q.u0; u < q.u1; u += seg) {
    const u1 = Math.min(q.u1, u + seg);
    const mid = (u + u1) / 2;
    const bed = Math.min(ground(mid, q.v - q.half), ground(mid, q.v + q.half), ground(mid, q.v)) - 0.6;
    const wet = 0.5;
    ubox(b, 'stone', mid, (bed + wet) / 2, q.v, u1 - u, wet - bed, q.half * 2, YARD_PAINT.wetStone);
    ubox(
      b,
      'stone',
      mid,
      (wet + q.top - 0.2) / 2,
      q.v,
      u1 - u,
      q.top - 0.2 - wet,
      q.half * 2,
      YARD_PAINT.stone,
    );
  }
  // The head: a round-ended pier head, two courses.
  const len = q.u1 - q.u0;
  ubox(b, 'paving', (q.u0 + q.u1) / 2, q.top - 0.1, q.v, len + 0.2, 0.2, q.half * 2 + 0.2, YARD_PAINT.paving);
  out.decks.push(uvDeck(q.u0 - 0.1, q.u1 + 0.1, q.v - q.half - 0.1, q.v + q.half + 0.1, q.top, false));
  // Fenders down the north face every 6 m, and a rubbing timber along it.
  const face = q.v - q.half - 0.18;
  ubox(b, 'wood', (q.u0 + q.u1) / 2 - 10, q.top - 0.55, face, len - 30, 0.32, 0.3, YARD_PAINT.tar);
  for (let u = q.u0 + 4; u <= q.u1 - 26; u += 6)
    ubox(b, 'wood', u, q.top - 1.6, face - 0.1, 0.32, 2.6, 0.24, YARD_PAINT.tar);
  for (let u = q.u0 + 3; u <= q.u1 - 20; u += 12) {
    bollard(b, out, u, face + 0.7, q.top);
    bollard(b, out, u + 1, q.v + q.half - 0.6, q.top);
  }
  // Ship obstacles along the face and round the head.
  for (let u = q.u0 + 2; u <= q.u1 - 10; u += 3) {
    const p = at(u, 0, q.v - q.half + 1.4);
    out.shipObstacles.push({ x: p.x, z: p.z, r: 1.6 });
  }
  const head = at(q.u0 - 1, 0, q.v);
  out.shipObstacles.push({ x: head.x, z: head.z, r: q.half + 1 });
  // A lamp at the head, a crane and stores at the root.
  const lamp = at(q.u0 + 1.5, q.top, q.v);
  rod(b, 'wood', lamp, { x: lamp.x, y: q.top + 4.2, z: lamp.z }, 0.14, 6, YARD_PAINT.tar);
  const lampTop = lampHead(b, b, {
    x: lamp.x,
    y: q.top + 4.0,
    z: lamp.z,
    w: 0.3,
    h: 0.4,
    yaw: YAW_U,
    capR: 0.27,
    capH: 0.22,
    capColour: YARD_PAINT.iron,
  });
  lanternPaint(lampTop.glass);
  jibCrane(b, out, q.u1 - 16, q.v + 2, q.top, -Math.PI / 2 - 0.4, 7);
  stores(b, q.u1 - 10, q.v + 1.5, q.top, 0x51, out.cameraBoxes);
  ropeCoil(b, q.u0 + 18, q.v - 2.6, q.top);
  ropeCoil(b, q.u0 + 42, q.v - 2.6, q.top, 0.36);
  // Steps down to the beach at its root (walked as a ramp to the sand).
  const sand = ground(q.u1 + 2.6, q.v);
  out.decks.push(
    uvDeck(q.u1, q.u1 + 2.6, q.v - q.half, q.v + q.half, q.top, false, Math.min(q.top, sand + 0.05)),
  );
  for (let k = 0; k < 4; k++) {
    const y = q.top - 0.25 - k * 0.38;
    const g0 = ground(q.u1 + 1 + k * 0.6, q.v);
    if (y < g0) break;
    ubox(
      b,
      'stone',
      q.u1 + 0.3 + k * 0.6,
      (y + g0 - 0.3) / 2,
      q.v,
      0.6,
      y - g0 + 0.3,
      q.half * 2,
      YARD_PAINT.stone,
    );
  }
}

/** Two breakwater arms flanking the cut's mouth into the cove. */
function cutMouth(b: Buckets, out: ShipyardOut): void {
  for (const side of [-1, 1]) {
    const v = CANAL.v + side * (CANAL.half + WALL + 1.2);
    for (let u = -40; u < -26; u += 7) {
      const bed = ground(u + 3.5, v) - 0.5;
      ubox(b, 'stone', u + 3.5, (bed + 2.0) / 2, v, 7, 2.0 - bed, 3, YARD_PAINT.stone);
    }
    ubox(b, 'paving', -33, 2.1, v, 14.2, 0.2, 3.2, YARD_PAINT.paving);
    out.decks.push(uvDeck(-40.1, -25.9, v - 1.6, v + 1.6, 2.2, false));
  }
}

/** Stone steps up a towpath where the copings step down (u: the step's foot, rising toward +u). */
function steps(
  b: Buckets,
  out: ShipyardOut,
  u: number,
  v: number,
  y0: number,
  y1: number,
  width: number,
): void {
  const n = Math.max(1, Math.round((y1 - y0) / 0.3));
  const rise = (y1 - y0) / n;
  // Walked as a ramp from the step's foot to its top tread.
  out.decks.push(uvDeck(u, u + n * 0.36, v - width / 2, v + width / 2, y0, false, y1));
  for (let k = 0; k < n; k++) {
    const y = y0 + rise * (k + 1);
    ubox(
      b,
      'stone',
      u + k * 0.36 + 0.18,
      (y + y0 - 0.4) / 2,
      v,
      0.36 + 0.01 * k,
      y - y0 + 0.4,
      width,
      YARD_PAINT.stone,
    );
  }
}

/**
 * Builds the shipyard and the harbour into `b` (the kit's material buckets), a part at a step.
 * Returns what gameplay needs later.
 */
export function* buildShipyard(
  b: Buckets,
  kit: VillageKit,
  lite: boolean,
): Generator<void, ShipyardOut, void> {
  const berth = at(BERTH.u, 0, BERTH.v);
  const out: ShipyardOut = {
    colliders: [],
    circles: [],
    cameraBoxes: [],
    shipObstacles: [],
    dockHull: { ...at(DOCKS.u0 + 20, DOCKS.floor + DOCKS.blocks + 2.75, DOCKS.v[1]), heading: HEADING_U },
    berth: { x: berth.x, z: berth.z, heading: HEADING_U + Math.PI },
    decks: [],
    lamps: [],
  };
  CHAMBERS.forEach((c, i) => chamberWalls(b, out, c, i));
  yield;
  // The works' apron (the terrain's skin over the pads, apron.ts) is walked as it's drawn.
  for (const r of yield* worksApronSteps())
    out.decks.push(uvDeck(r.u0, r.u1, r.v0, r.v1, r.y + APRON_LIFT, false));
  const yard = PADS.yard.y;
  // The lock flight's gates (upstream first), its lamps and its towpath steps.
  const tops = CHAMBERS.filter((c) => !c.name.startsWith('dock') && c.name !== 'basin');
  GATES.forEach((u, i) => {
    const down = tops.find((c) => Math.abs(c.u1 - u) < 0.01);
    const up = CHAMBERS.find((c) => Math.abs(c.u0 - u) < 0.01 && !c.name.startsWith('dock'));
    if (!down) return;
    mitreGate(b, out, u, down.floor, down.top, up?.top ?? down.top);
    lockLamp(
      b,
      out,
      `lock:${i}`,
      u + 3,
      CANAL.v - CANAL.half - WALL + 0.4,
      down.top,
      i % 2 ? 'green' : 'red',
    );
  });
  // The Sea Gate across the cut's mouth, shut, and steps down from Lock 2's copings to the cut's.
  const cutIndex = CHAMBERS.findIndex((c) => c.name === 'cut');
  const cut = CHAMBERS[cutIndex]!;
  const lock2Index = CHAMBERS.findIndex((c) => c.name === 'lock2');
  mitreGate(b, out, SEA_GATE_U, cut.floor, cut.top, cut.top);
  // (Only if the cut's copings are lower than Lock 2's.)
  for (const side of CHAMBERS[lock2Index]!.top - cut.top > 0.1 ? [1, -1] : [])
    steps(
      b,
      out,
      cut.u1 - 1.8,
      CANAL.v + side * (CANAL.half + WALL / 2),
      cut.top + cutIndex * 0.012,
      CHAMBERS[lock2Index]!.top + lock2Index * 0.012,
      WALL - 0.2,
    );
  steps(b, out, 50.2, CANAL.v + CANAL.half + WALL / 2, PADS.locks.y + 0.2, yard + 0.2, WALL - 0.2);
  steps(b, out, 50.2, CANAL.v - CANAL.half - WALL / 2, PADS.locks.y + 0.2, yard + 0.2, WALL - 0.2);
  yield;
  // The docks: caissons, keel blocks, the hull's shores and staging in Dock 2, frames in Dock 3.
  const docks = CHAMBERS.filter((c) => c.name.startsWith('dock'));
  for (const c of docks) {
    caisson(b, out, c);
    // The camera keeps out of the dry docks' side and head walls (you walk their floors too).
    const len = c.u1 - c.u0;
    for (const v of [c.v0 - WALL / 2, c.v1 + WALL / 2])
      out.cameraBoxes.push({
        ...xzOf(c.u0 + len / 2, v),
        hx: len / 2 + WALL,
        hz: WALL / 2,
        rot: YAW_U,
        y0: c.floor - 0.5,
        y1: c.top,
      });
    out.cameraBoxes.push({
      ...xzOf(c.u1 + WALL / 2, (c.v0 + c.v1) / 2),
      hx: WALL / 2,
      hz: (c.v1 - c.v0) / 2,
      rot: YAW_U,
      y0: c.floor - 0.5,
      y1: c.top,
    });
  }
  keelBlocks(b, DOCKS.u0 + 9, DOCKS.u1 - 9, DOCKS.v[1], DOCKS.floor, DOCKS.blocks);
  keelBlocks(b, DOCKS.u0 + 9, DOCKS.u1 - 9, DOCKS.v[2], DOCKS.floor, DOCKS.blocks);
  shoresAndStaging(b, docks[1]!, out.dockHull.y);
  yield;
  hullFrames(
    b,
    { u: DOCKS.u0 + 20, y: DOCKS.floor + DOCKS.blocks + 2.75, v: DOCKS.v[2] },
    1,
    false,
    lite ? 1 : 3,
    out.cameraBoxes,
  );
  // The hull in Dock 2 (index.ts draws it at `dockHull`).
  hullBlocker(out.cameraBoxes, { u: DOCKS.u0 + 20, y: out.dockHull.y, v: DOCKS.v[1] }, 1);
  yield;
  // The sheerlegs over the dock heads, cranes on the basin's quays.
  sheerlegs(b, out, yard);
  jibCrane(b, out, 98, -32.4, yard, -Math.PI / 2 + 0.3);
  jibCrane(b, out, 76, -88.6, yard, Math.PI / 2 - 0.2, 7);
  yield;
  // The main slipway: its timber ways down the ramp, a small hull's frames on its cradle.
  const s = SLIPWAY;
  for (const side of [-1, 1]) {
    const a = at(s.u0, s.topY - (s.u1 - s.u0) / 12 + 0.15, s.v + side * 1.6);
    const e = at(s.u1, s.topY + 0.15, s.v + side * 1.6);
    beam(b, 'wood', a, e, 0.45, 0.3, YARD_PAINT.tar);
  }
  for (let u = s.u0 + 2; u < s.u1; u += 2.5) {
    const y = s.topY - (s.u1 - u) / 12;
    ubox(b, 'wood', u, y + 0.02, s.v, 0.3, 0.16, 4.6, YARD_PAINT.weathered);
  }
  const slipKeel = s.topY - (s.u1 - (s.u1 - 14)) / 12 + 0.8;
  hullFrames(
    b,
    { u: s.u1 - 14, y: slipKeel + 1.6 * 0.55, v: s.v },
    0.55,
    true,
    lite ? 1 : 5,
    out.cameraBoxes,
  );
  // The cradle's poppets under it.
  for (let u = s.u1 - 20; u <= s.u1 - 8; u += 3)
    ubox(b, 'wood', u, s.topY - (s.u1 - u) / 12 + 0.5, s.v, 0.4, 0.8, 3.4, YARD_PAINT.tar);
  yield;
  // Workshops along the yard's south edge: the saw shed, the steam box, the forge; the mould loft.
  shed(b, out, 66, -28, yard, 12, 7, 3.6, YARD_PAINT.silver);
  shed(b, out, 132, -26, yard, 14, 6, 3.4, YARD_PAINT.weathered);
  // The forge: a stone hut with its chimney.
  ubox(b, 'stone', 152, yard + 1.6, -27, 6, 3.2, 5, YARD_PAINT.stone);
  ubox(b, 'wood', 152, yard + 3.35, -27, 6.6, 0.3, 5.6, YARD_PAINT.tar);
  ubox(b, 'stone', 154, yard + 4.6, -28.5, 1.2, 3.2, 1.2, YARD_PAINT.wetStone);
  // The steam box: a long timber box on trestles by the saw shed, its boiler at one end.
  ubox(b, 'wood', 66, yard + 1.2, -36, 10, 0.8, 0.9, YARD_PAINT.tar);
  const boiler = at(60, yard, -36);
  rod(b, 'metal', boiler, { x: boiler.x, y: yard + 1.8, z: boiler.z }, 0.6, 10, YARD_PAINT.iron);
  out.colliders.push({ ...xzOf(66, -36), hx: 5, hz: 0.5, rot: YAW_U, height: 1.6 });
  yield;
  // Timber stacks, logs, rope, stores and sails drying round the yard.
  timberStack(b, 84, -26, yard, 7, 6, 11);
  timberStack(b, 108, -27, yard, 6, 4, 12);
  logPile(b, 118, -24, yard, 9, 13);
  logPile(b, 172, -38, yard, 8, 14);
  timberStack(b, 172, -84, yard, 6, 5, 15);
  // The camera keeps out of the stacks and piles as drawn (the logs run past the walker's boxes).
  for (const [u, v, lu, hz, top] of [
    [84, -26, 7, 1.35, 0.27 + 6 * 0.17],
    [108, -27, 6, 1.35, 0.27 + 4 * 0.17],
    [118, -24, 9, 1.75, 1.8],
    [172, -38, 8, 1.75, 1.8],
    [172, -84, 6, 1.35, 0.27 + 5 * 0.17],
  ] as const)
    out.cameraBoxes.push({
      ...xzOf(u, v),
      hx: lu / 2 + 0.1,
      hz,
      rot: YAW_U,
      y0: yard - 0.3,
      y1: yard + top + 0.05,
    });
  ropeCoil(b, 90, -33.5, yard);
  ropeCoil(b, 92, -33.2, yard, 0.36);
  ropeCoil(b, 140, -71, yard + 0.2);
  stores(b, 122, -31, yard, 16, out.cameraBoxes);
  stores(b, 60, -84, yard, 17, out.cameraBoxes);
  sailsDrying(b, 160, -22.5, yard, 13, out.cameraBoxes);
  if (!lite) sailsDrying(b, 34, -50, PADS.locks.y, 10, out.cameraBoxes);
  for (const [u, v] of [
    [84, -26],
    [108, -27],
    [118, -24],
  ])
    out.colliders.push({ ...xzOf(u!, v!), hx: 3.6, hz: 1.4, rot: YAW_U, height: 1.5 });
  yield;
  // The gatehouse by the lower lock (the lock keeper's: a stone ground floor, a timber upper storey).
  const gate = at(26, PADS.locks.y, -74.5);
  const gatehouse = addVerandaHouse(b, kit, {
    footprint: { w: 6, d: 4 },
    storeys: 2,
    origin: { x: gate.x, y: gate.y, z: gate.z },
    rotY: HEADING_U + Math.PI,
    seed: 3,
    walls: 'plaster',
    wall: 0xe9e3d3,
    trim: 0xf2efe6,
    shutter: 0x2e5d4b,
    door: 0x2e5d4b,
    roof: { shape: 'hip', cover: 'tin', colour: 0x9aa3a6, pitch: 0.7 },
    windows: 'sparse',
    weather: 0.75,
    lite,
    groundAt: (x, z) => keelhavenHeight(x, z),
  });
  out.colliders.push({ x: gate.x, z: gate.z, hx: 3.2, hz: 2.2, rot: YAW_U, height: 6 });
  out.cameraBoxes.push({
    x: gate.x,
    z: gate.z,
    hx: 3.3,
    hz: 2.3,
    rot: YAW_U,
    y0: gate.y - 0.5,
    y1: gate.y + 6.5,
  });
  shadeBlockers(gatehouse, out.cameraBoxes);
  // The mould loft at the yard's inland corner, where the hulls' lines are drawn out full size.
  const loft = at(169.5, yard, -28.5);
  const mouldLoft = addVerandaHouse(b, kit, {
    footprint: { w: 6, d: 8 },
    storeys: 2,
    origin: { x: loft.x, y: loft.y, z: loft.z },
    rotY: HEADING_U + Math.PI / 2,
    seed: 7,
    walls: 'boards',
    wall: 0xb9b2a4,
    trim: 0xe8dcc0,
    shutter: 0x6f5d48,
    door: 0x5e4c3e,
    roof: { shape: 'gable', ridge: 'along', cover: 'tin', colour: 0x8e5a3e, pitch: 0.66 },
    windows: 'busy',
    weather: 0.9,
    lite,
    groundAt: (x, z) => keelhavenHeight(x, z),
  });
  out.colliders.push({ x: loft.x, z: loft.z, hx: 3.2, hz: 4.2, rot: YAW_U, height: 7 });
  out.cameraBoxes.push({
    x: loft.x,
    z: loft.z,
    hx: 3.3,
    hz: 4.3,
    rot: YAW_U,
    y0: loft.y - 0.5,
    y1: loft.y + 7,
  });
  shadeBlockers(mouldLoft, out.cameraBoxes);
  // The yard's blank sign boards: over the yard gate, and at each dock's head.
  signBoard(b, 54, -24, yard, 2.6);
  for (const v of DOCKS.v) signBoard(b, DOCKS.u1 + 2.6, v + 4, yard, 1.6);
  yield;
  yardDressing(b, out, lite);
  yield;
  quay(b, out);
  cutMouth(b, out);
  return out;
}

/** A low coral-stone wall from (u0, v0) to (u1, v1) on the ground, in 4 m lengths, `gap`s left open. */
function lowWall(
  b: Buckets,
  out: ShipyardOut,
  u0: number,
  v0: number,
  u1: number,
  v1: number,
  gaps: readonly [number, number][] = [],
): void {
  const len = Math.hypot(u1 - u0, v1 - v0);
  const n = Math.ceil(len / 4);
  const along = Math.atan2(v1 - v0, u1 - u0);
  for (let k = 0; k < n; k++) {
    const t0 = k / n;
    const t1 = (k + 1) / n;
    const tm = (t0 + t1) / 2;
    const s = tm * len;
    if (gaps.some(([a, e]) => s > a && s < e)) continue;
    const u = u0 + (u1 - u0) * tm;
    const v = v0 + (v1 - v0) * tm;
    const g = Math.max(
      ground(u0 + (u1 - u0) * t0, v0 + (v1 - v0) * t0),
      ground(u0 + (u1 - u0) * t1, v0 + (v1 - v0) * t1),
    );
    const low = Math.min(
      ground(u0 + (u1 - u0) * t0, v0 + (v1 - v0) * t0),
      ground(u0 + (u1 - u0) * t1, v0 + (v1 - v0) * t1),
    );
    const seg = len / n + 0.02;
    ubox(
      b,
      'stone',
      u,
      (low - 0.4 + g + 0.85) / 2,
      v,
      seg,
      g + 0.85 - low + 0.4,
      0.55,
      YARD_PAINT.stone,
      -along,
    );
    ubox(b, 'paving', u, g + 0.9, v, seg + 0.01, 0.1, 0.65, YARD_PAINT.paving, -along);
    const m = at(u, 0, v);
    out.colliders.push({
      x: m.x,
      z: m.z,
      hx: seg / 2,
      hz: 0.3,
      rot: YAW_U - along,
      y0: low - 0.5,
      y1: g + 1.3,
      height: 1,
    });
  }
}

/** A plank walk on the ground from (u0, v) to (u1, v): boards across on two runners. */
function plankWalk(b: Buckets, u0: number, u1: number, v: number, width: number, y: number): void {
  const n = Math.round(Math.abs(u1 - u0) / 0.32);
  const rand = mulberry32(Math.round(u0 * 7 + v * 13));
  for (let k = 0; k < n; k++) {
    if (rand() < 0.04) continue;
    const u = u0 + ((k + 0.5) / n) * (u1 - u0);
    const r = rand();
    ubox(
      b,
      'wood',
      u,
      y + 0.1,
      v + (rand() - 0.5) * 0.12,
      0.28,
      0.05,
      width,
      r < 0.15 ? YARD_PAINT.oak : r < 0.3 ? YARD_PAINT.tar : YARD_PAINT.silver,
      (rand() - 0.5) * 0.06,
    );
  }
  for (const s of [-width / 2 + 0.3, width / 2 - 0.3])
    ubox(b, 'wood', (u0 + u1) / 2, y + 0.035, v + s, Math.abs(u1 - u0), 0.07, 0.14, YARD_PAINT.tar);
}

/** A pile of sawdust and shavings, low and pale, round (u, v). */
function sawdust(b: Buckets, u: number, v: number, y: number, r: number, seed: number): void {
  const rand = mulberry32(seed);
  const p = at(u, y, v);
  cone(b, 'wood', p.x, y - 0.05, p.z, r, 0.18 + r * 0.12, 9, 0xf0dcae);
  for (let k = 0; k < 4; k++) {
    const a = rand() * Math.PI * 2;
    const d = r * (0.8 + rand() * 0.7);
    const q = at(u + Math.cos(a) * d, y, v + Math.sin(a) * d);
    cone(b, 'wood', q.x, y - 0.04, q.z, r * (0.3 + rand() * 0.3), 0.1, 7, 0xe8cf98);
  }
}

/** Offcuts and odd planks lying about (u, v). */
function offcuts(b: Buckets, u: number, v: number, y: number, n: number, seed: number): void {
  const rand = mulberry32(seed);
  for (let k = 0; k < n; k++) {
    const du = (rand() - 0.5) * 4;
    const dv = (rand() - 0.5) * 3;
    const len = 0.5 + rand() * 1.6;
    ubox(
      b,
      'wood',
      u + du,
      y + 0.05 + (k % 3) * 0.06,
      v + dv,
      len,
      0.06,
      0.18 + rand() * 0.12,
      rand() < 0.5 ? YARD_PAINT.oak : YARD_PAINT.silver,
      rand() * Math.PI,
    );
  }
}

/** A pair of sawhorses with a plank across them, a workbench beside. */
function sawhorses(b: Buckets, out: ShipyardOut, u: number, v: number, y: number): void {
  for (const du of [-1.1, 1.1]) {
    ubox(b, 'wood', u + du, y + 0.8, v, 0.12, 0.1, 1.0, YARD_PAINT.weathered);
    for (const dv of [-0.45, 0.45])
      ubox(b, 'wood', u + du, y + 0.4, v + dv, 0.08, 0.82, 0.08, YARD_PAINT.weathered, 0, dv * 0.25);
  }
  ubox(b, 'wood', u, y + 0.9, v, 3.6, 0.08, 0.32, YARD_PAINT.oak);
  ubox(b, 'wood', u, y + 0.88, v + 2.2, 2.4, 0.1, 0.8, YARD_PAINT.weathered);
  for (const du of [-1.05, 1.05])
    for (const dv of [-0.3, 0.3])
      ubox(b, 'wood', u + du, y + 0.42, v + 2.2 + dv, 0.1, 0.84, 0.1, YARD_PAINT.tar);
  out.colliders.push({ ...toWorld(u, v + 1), hx: 1.9, hz: 1.7, rot: YAW_U, height: 1 });
}

/** A tar pot on a ring of fire stones. */
function tarPot(b: Buckets, u: number, v: number, y: number): void {
  const p = at(u, y, v);
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    box(
      b,
      'stone',
      p.x + Math.cos(a) * 0.55,
      y + 0.12,
      p.z + Math.sin(a) * 0.55,
      0.28,
      0.24,
      0.24,
      a,
      YARD_PAINT.wetStone,
    );
  }
  rod(b, 'metal', { x: p.x, y: y + 0.25, z: p.z }, { x: p.x, y: y + 0.85, z: p.z }, 0.4, 10, 0x2a2420, 0.46);
}

/**
 * The yard's working clutter, so it reads busy from the air and on foot: a low coral-stone wall round
 * its open sides (a gap for the path from the bridge), plank walks from the gate to the basin and
 * along the towpath, sawdust and offcuts round the saw shed and the stacks, sawhorses and a bench, a
 * tar pot, a boat shed and a rope store on the lock terrace's north strip, and another open shed.
 */
function yardDressing(b: Buckets, out: ShipyardOut, lite: boolean): void {
  const yard = PADS.yard;
  const y = yard.y;
  // The wall along its river side (open at the path from the bridge, u 108-116) and its inland end.
  lowWall(b, out, yard.u0 + 1, yard.v1 + 0.6, yard.u1 + 0.6, yard.v1 + 0.6, [[54, 62]]);
  lowWall(b, out, yard.u1 + 0.6, yard.v1 + 0.6, yard.u1 + 0.6, -48);
  // Plank walks: from the yard's gate to the basin's coping, and along the lock terrace's south side.
  for (let v = -20.5; v > -33; v -= 0.32) ubox(b, 'wood', 112, y + 0.08, v, 2, 0.05, 0.28, YARD_PAINT.silver);
  plankWalk(b, 12, 48, -45, 1.8, PADS.locks.y);
  // Sawdust, shavings and offcuts by the saw shed, the stacks and the steam box.
  sawdust(b, 66, -26.5, y, 1.1, 1);
  sawdust(b, 71, -30.5, y, 0.7, 2);
  sawdust(b, 88, -24, y, 0.8, 3);
  sawdust(b, 136, -24.5, y, 0.9, 4);
  sawdust(b, 140, -46, y, 0.6, 5);
  offcuts(b, 72, -25, y, lite ? 4 : 9, 6);
  offcuts(b, 100, -24, y, lite ? 3 : 7, 7);
  offcuts(b, 140, -30, y, lite ? 3 : 7, 8);
  sawhorses(b, out, 76, -30.5, y);
  sawhorses(b, out, 128, -31, y);
  tarPot(b, 146, -31.5, y);
  // Another open shed (the joiners'), a boat shed and a rope store on the lock terrace.
  shed(b, out, 96, -25.5, y, 8, 6, 3.2, YARD_PAINT.silver);
  // (On the terrace's north strip: the south strip is the towpath down to the beach, kept clear.)
  shed(b, out, 43, -73.5, PADS.locks.y, 9, 5.5, 3.4, YARD_PAINT.weathered);
  shed(b, out, 15.5, -73.5, PADS.locks.y, 5, 5, 3, YARD_PAINT.tar);
  stores(b, 15.5, -73.5, PADS.locks.y, 0x91, out.cameraBoxes);
  // A small boat on chocks in the boat shed.
  hullFrames(b, { u: 43, y: PADS.locks.y + 0.9, v: -73.5 }, 0.26, false, lite ? 1 : 7, out.cameraBoxes);
  if (!lite) {
    offcuts(b, 38, -75.5, PADS.locks.y, 5, 9);
    ropeCoil(b, 20, -70.5, PADS.locks.y, 0.5);
  }
}

function xzOf(u: number, v: number): { x: number; z: number } {
  return toWorld(u, v);
}

/** A blank board on two posts (its words are painted from the course pack later). */
export function signBoard(b: Buckets, u: number, v: number, y: number, w: number): void {
  // The posts stand just past the board's ends, so neither crosses its words on either face.
  for (const dv of [-(w / 2 + 0.19), w / 2 + 0.19]) {
    const p = at(u, y, v + dv);
    rod(b, 'wood', p, { x: p.x, y: y + 2.4, z: p.z }, 0.08, 6, YARD_PAINT.tar);
  }
  ubox(b, 'wood', u, y + 1.9, v, 0.08, 0.7, w + 0.2, YARD_PAINT.limewash);
}
