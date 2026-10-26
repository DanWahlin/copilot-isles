import { Group, type Mesh } from 'three/webgpu';
import type { TierSettings } from '../../../engine/quality';
import type { VillageKit } from '../../village/kit';
import { cone, makeBuckets, meshesFromBuckets, rod, rope, type Buckets } from '../../village/pieces';
import type { SignSet } from '../../sites/sign';
import { islandSign } from '../../../course/active';
import { toWorld } from './layout';
import { headingUv } from './anchors';
import { LAMP_PLATE_OFF, YARD_PAINT, at, ground, signBoard, ubox, YAW_U, type ShipyardOut } from './shipyard';
import { CANAL, CHAMBERS, DOCKS, GATES, PADS, SLIPWAY, WALL } from './works';

/**
 * Keelhaven's set pieces for the chapter's stops (spec §7, in the as-built frame): the course's words
 * on the drydocks' boards, the slipway's board and the lock lamps' plates; Stroud's two ledgers and
 * their port dials; the strata cut's four bands; Dory's sounding planks, bell cord and winch; the
 * practice hulls' name boards by the basin; and the tool chest that moves from Dory's dock to
 * Drydock 2's rack (two small meshes, so it moves without a rebuild). All in the village kit's
 * materials; every word is the course pack's (`quests/keelhaven.json` → `signs`).
 */

// Cream lettering on the sign set's own painted board (it covers the timber face it hangs on).
const SIGN_COLOUR = ['#f6e7c8'];
/** The lecterns' slope: tilted up toward the reader on the yard side (+v). */
const LECTERN_TILT = 0.32;
/** The ledgers' name posts and boards (m). */
const NAME_POST_R = 0.07;
const NAME_BOARD_T = 0.04;
const yard = PADS.yard.y;
const face = (du: number, dv: number) => headingUv(du, dv);

/** Where the set pieces stand (cove frame), for the content's interactions. */
export const KEELHAVEN_SET = {
  /** The four planks Dory has you sound, along Drydock 1's head (u, v each). */
  planks: [0, 1, 2, 3].map((i) => ({ u: 173.4, v: DOCKS.v[0] - 6 + i * 1.9 })),
  /** The sluice lever that floods Drydock 1 once the planks ring true. */
  sluice: { u: 167.2, v: DOCKS.v[0] - 6.6 },
  bell: { u: 173.4, v: DOCKS.v[0] + 5.6 },
  winch: { u: 173.4, v: DOCKS.v[0] + 8.4 },
  /** The tool chest at Dory's side, and Drydock 2's empty rack. */
  chestFrom: { u: 171.6, v: DOCKS.v[0] + 2.2 },
  chestTo: { u: 172.8, v: DOCKS.v[1] - 3.2 },
  /** Stroud's two ledgers, Issues then Pull requests, facing the yard. */
  ledgers: [
    { u: 57.6, v: -49.4, sign: 'ledgerIssues', dial: 'ledgerFork' },
    { u: 62.4, v: -49.4, sign: 'ledgerPulls', dial: 'ledgerAll' },
  ],
  /** The strata cut by the yard path, its face to the path. */
  strata: { u: 105.2, v: -14.6 },
  /** The practice hulls' name boards on the basin's south quay. */
  hulls: [
    { u: 82, v: -31.2, sign: 'hullSearch' },
    { u: 92, v: -31.2, sign: 'hullNote' },
    { u: 102, v: -31.2, sign: 'hullLamp' },
  ],
} as const;

/** The tool chest's two places: at Dory's side until you carry it, then on Drydock 2's rack. */
export interface ToolChest {
  /** Shows it on the rack (true) or at Dory's side. */
  set(onRack: boolean): void;
  readonly group: Group;
  dispose(): void;
}

/** A sign with the pack's words for `name`, on a board at cove frame (u, y, v) facing (du, dv). */
function lettering(
  signs: SignSet | null,
  name: string,
  u: number,
  y: number,
  v: number,
  du: number,
  dv: number,
  w: number,
  h: number,
  twoSided = true,
): void {
  const words = signs ? islandSign('keelhaven', name) : '';
  if (!signs || !words) return;
  const s = signs.add([words], w, h, { twoSided, colors: SIGN_COLOUR });
  const p = toWorld(u, v);
  s.object.position.set(p.x, y, p.z);
  s.object.rotation.y = face(du, dv);
}

/** Builds the set pieces into `b` and their lettering into `signs`. */
export function buildKeelhavenProps(b: Buckets, signs: SignSet | null, out: ShipyardOut): void {
  // The drydocks' branch boards (shipyard.ts puts the blank boards up at each dock's head).
  DOCKS.v.forEach((v, i) =>
    lettering(signs, `dock${i + 1}`, DOCKS.u1 + 2.6 + 0.05, yard + 1.9, v + 4, 1, 0, 1.55, 0.5),
  );
  // The main slipway's board at its head, facing down the ways.
  const slipU = SLIPWAY.u1 + 1.8;
  const slipV = SLIPWAY.v - SLIPWAY.half - 1.4;
  const gs = ground(slipU, slipV);
  signBoard(b, slipU, slipV, gs, 1.8);
  out.colliders.push({ ...toWorld(slipU, slipV), hx: 0.2, hz: 1.2, rot: YAW_U, height: 2.4 });
  lettering(signs, 'slipway', slipU - 0.05, gs + 1.9, slipV, -1, 0, 1.75, 0.5);
  // The lock lamps' brass plates (shipyard.ts `lockLamp`, one each side of the post): "Book app web"
  // on each, read from either side.
  const tops = CHAMBERS.filter((c) => !c.name.startsWith('dock') && c.name !== 'basin');
  for (const u of GATES) {
    const down = tops.find((c) => Math.abs(c.u1 - u) < 0.01);
    if (!down) continue;
    for (const side of [1, -1])
      lettering(
        signs,
        'lampPlate',
        u + 3 + side * (LAMP_PLATE_OFF + 0.021),
        down.top + 1.5,
        CANAL.v - CANAL.half - WALL + 0.4,
        side,
        0,
        0.4,
        0.26,
        false,
      );
  }
  // Stroud's ledgers: a lectern each, its slope and the open book tilted toward you as you come from
  // the yard (+v), its name board over it and its port dial (a brass plate) on its front.
  for (const l of KEELHAVEN_SET.ledgers) {
    const y = ground(l.u, l.v);
    const p = at(l.u, y, l.v);
    rod(b, 'wood', p, { x: p.x, y: y + 1.0, z: p.z }, 0.1, 6, YARD_PAINT.tar);
    ubox(b, 'wood', l.u, y + 1.08, l.v, 1.1, 0.08, 0.7, YARD_PAINT.weathered, 0, LECTERN_TILT);
    ubox(b, 'cloth', l.u, y + 1.14, l.v, 0.9, 0.03, 0.56, YARD_PAINT.canvas, 0, LECTERN_TILT);
    ubox(b, 'wood', l.u, y + 1.155, l.v, 0.03, 0.02, 0.56, YARD_PAINT.tar, 0, LECTERN_TILT);
    // The name board on a post behind it: a board each side of the post, the words on both, so the
    // post never crosses them.
    const pv = l.v - 0.6;
    const post = at(l.u, y, pv);
    rod(b, 'wood', post, { x: post.x, y: y + 2.3, z: post.z }, NAME_POST_R, 6, YARD_PAINT.tar);
    for (const side of [1, -1]) {
      const bv = pv + side * (NAME_POST_R + 0.012 + NAME_BOARD_T / 2);
      ubox(b, 'wood', l.u, y + 2.05, bv, 1.3, 0.42, NAME_BOARD_T, YARD_PAINT.limewash);
      lettering(
        signs,
        l.sign,
        l.u,
        y + 2.05,
        bv + side * (NAME_BOARD_T / 2 + 0.001),
        0,
        side,
        1.2,
        0.36,
        false,
      );
    }
    // The dial: a round brass plate on the lectern's front, its setting lettered on it.
    ubox(b, 'metal', l.u, y + 0.62, l.v + 0.11, 0.64, 0.26, 0.03, 0xb8923e);
    lettering(signs, l.dial, l.u, y + 0.62, l.v + 0.135, 0, 1, 0.6, 0.22);
    out.colliders.push({ ...toWorld(l.u, l.v), hx: 0.6, hz: 0.45, rot: YAW_U, height: 1.2 });
  }
  // The strata cut: a low stone face of four bands (laterite to coral), each with its label.
  const s = KEELHAVEN_SET.strata;
  const sy = ground(s.u, s.v);
  const bands = [0x8f5a3c, 0xb8774c, 0xc9a77a, 0xe8dcc0];
  const names = ['strataRepo', 'strataInstructions', 'strataSettings', 'strataPrompt'];
  bands.forEach((c, i) => {
    ubox(b, 'stone', s.u, sy + 0.25 + i * 0.5, s.v, 1.4, 0.5, 3.2 - i * 0.25, c);
    lettering(signs, names[i]!, s.u + 0.72, sy + 0.25 + i * 0.5, s.v, 1, 0, 1.3, 0.3);
  });
  out.colliders.push({ ...toWorld(s.u, s.v), hx: 0.8, hz: 1.7, rot: YAW_U, height: 2.1 });
  // Dory's sounding planks on two trestles, and the sluice lever by the dock's wall.
  for (const p of KEELHAVEN_SET.planks) {
    ubox(b, 'wood', p.u, yard + 0.62, p.v, 3.2, 0.1, 0.32, YARD_PAINT.oak);
    for (const du of [-1.2, 1.2]) ubox(b, 'wood', p.u + du, yard + 0.3, p.v, 0.12, 0.6, 0.36, YARD_PAINT.tar);
  }
  out.colliders.push({
    ...toWorld(173.4, DOCKS.v[0] - 6 + 2.85),
    hx: 1.7,
    hz: 3.3,
    rot: YAW_U,
    height: 0.75,
  });
  const lever = at(KEELHAVEN_SET.sluice.u, yard, KEELHAVEN_SET.sluice.v);
  ubox(
    b,
    'metal',
    KEELHAVEN_SET.sluice.u,
    yard + 0.45,
    KEELHAVEN_SET.sluice.v,
    0.5,
    0.9,
    0.5,
    YARD_PAINT.iron,
  );
  rod(
    b,
    'wood',
    { x: lever.x, y: yard + 0.9, z: lever.z },
    { x: lever.x, y: yard + 1.8, z: lever.z },
    0.06,
    6,
    YARD_PAINT.red,
  );
  out.circles.push({ x: lever.x, z: lever.z, r: 0.4, y0: yard - 0.5, y1: yard + 1.8, height: 1.8 });
  // The bell cord: a post and a bell, its cord down to a work-order slip, and the winch beside it.
  const bell = at(KEELHAVEN_SET.bell.u, yard, KEELHAVEN_SET.bell.v);
  rod(b, 'wood', bell, { x: bell.x, y: yard + 3, z: bell.z }, 0.1, 6, YARD_PAINT.tar);
  ubox(
    b,
    'wood',
    KEELHAVEN_SET.bell.u - 0.35,
    yard + 2.95,
    KEELHAVEN_SET.bell.v,
    0.8,
    0.1,
    0.1,
    YARD_PAINT.tar,
  );
  const hang = at(KEELHAVEN_SET.bell.u - 0.7, yard + 2.9, KEELHAVEN_SET.bell.v);
  cone(b, 'metal', hang.x, yard + 2.45, hang.z, 0.24, 0.42, 8, 0xb8923e, 0.08);
  rope(
    b,
    { x: hang.x, y: yard + 2.45, z: hang.z },
    { x: hang.x, y: yard + 1.25, z: hang.z },
    0.02,
    0.015,
    YARD_PAINT.rope,
    2,
  );
  ubox(
    b,
    'wood',
    KEELHAVEN_SET.bell.u - 0.7,
    yard + 1.1,
    KEELHAVEN_SET.bell.v,
    0.04,
    0.3,
    0.42,
    YARD_PAINT.canvas,
  );
  lettering(
    signs,
    'bellCord',
    KEELHAVEN_SET.bell.u - 0.67,
    yard + 1.1,
    KEELHAVEN_SET.bell.v,
    1,
    0,
    0.4,
    0.24,
  );
  out.circles.push({ x: bell.x, z: bell.z, r: 0.25, y0: yard - 0.5, y1: yard + 3, height: 3 });
  const w = KEELHAVEN_SET.winch;
  for (const dv of [-0.7, 0.7]) ubox(b, 'wood', w.u, yard + 0.5, w.v + dv, 0.2, 1.0, 0.2, YARD_PAINT.tar);
  const d0 = at(w.u, yard + 0.95, w.v - 0.65);
  const d1 = at(w.u, yard + 0.95, w.v + 0.65);
  rod(b, 'metal', d0, d1, 0.22, 10, YARD_PAINT.iron);
  rope(
    b,
    { x: d0.x, y: yard + 0.95, z: d0.z },
    { x: d1.x, y: yard + 0.95, z: d1.z },
    0.24,
    0.03,
    YARD_PAINT.rope,
    3,
  );
  ubox(b, 'wood', w.u + 0.25, yard + 1.35, w.v, 0.04, 0.3, 0.9, YARD_PAINT.limewash);
  lettering(signs, 'winch', w.u + 0.28, yard + 1.35, w.v, 1, 0, 0.86, 0.26);
  out.colliders.push({ ...toWorld(w.u, w.v), hx: 0.3, hz: 0.9, rot: YAW_U, height: 1.2 });
  // The tool chest's rack at Drydock 2's head.
  const r = KEELHAVEN_SET.chestTo;
  ubox(b, 'wood', r.u, yard + 0.3, r.v, 1.2, 0.08, 1.6, YARD_PAINT.weathered);
  for (const dv of [-0.7, 0.7]) ubox(b, 'wood', r.u, yard + 0.15, r.v + dv, 1.2, 0.3, 0.1, YARD_PAINT.tar);
  out.colliders.push({ ...toWorld(r.u, r.v), hx: 0.7, hz: 0.9, rot: YAW_U, height: 0.9 });
  // The practice hulls' name boards on the basin's south quay, facing the yard.
  for (const h of KEELHAVEN_SET.hulls) {
    const y = ground(h.u, h.v);
    // Its posts stand just past the board's ends (never across its words).
    for (const du of [-1.39, 1.39]) {
      const p = at(h.u + du, y, h.v);
      rod(b, 'wood', p, { x: p.x, y: y + 2.4, z: p.z }, 0.08, 6, YARD_PAINT.tar);
    }
    ubox(b, 'wood', h.u, y + 1.9, h.v, 2.6, 0.7, 0.08, YARD_PAINT.limewash);
    lettering(signs, h.sign, h.u, y + 1.9, h.v + 0.05, 0, 1, 2.4, 0.5);
    out.colliders.push({ ...toWorld(h.u, h.v), hx: 1.5, hz: 0.2, rot: YAW_U, height: 2.4 });
  }
}

/** The tool chest at Dory's side and on Drydock 2's rack (one shows at a time). */
export async function createToolChest(
  kit: VillageKit,
  tier: TierSettings,
  breathe: () => Promise<void>,
): Promise<ToolChest> {
  const group = new Group();
  group.name = 'keelhaven-tool-chest';
  const meshes: Mesh[] = [];
  const make = async (u: number, v: number, y: number, name: string) => {
    const b = makeBuckets();
    ubox(b, 'wood', u, y + 0.28, v, 0.9, 0.5, 0.56, YARD_PAINT.tar);
    ubox(b, 'wood', u, y + 0.58, v, 0.94, 0.1, 0.6, YARD_PAINT.oak);
    for (const du of [-0.3, 0.3]) ubox(b, 'metal', u + du, y + 0.34, v, 0.05, 0.52, 0.6, YARD_PAINT.iron);
    const g = new Group();
    g.name = name;
    meshes.push(...(await meshesFromBuckets(b, kit, tier, name, g, breathe)));
    // Drawn by the world's warm whichever place it's in first.
    g.userData.prewarm = true;
    group.add(g);
    return g;
  };
  const from = await make(KEELHAVEN_SET.chestFrom.u, KEELHAVEN_SET.chestFrom.v, yard, 'kh-tool-chest-dory');
  const to = await make(KEELHAVEN_SET.chestTo.u, KEELHAVEN_SET.chestTo.v, yard + 0.34, 'kh-tool-chest-rack');
  to.visible = false;
  return {
    group,
    set(onRack) {
      from.visible = !onRack;
      to.visible = onRack;
    },
    dispose() {
      for (const m of meshes) m.geometry.dispose();
    },
  };
}
