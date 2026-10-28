import type { VillageAnchor } from '../../village/kit';
import { BOOTH_LAYOUT } from '../../market-stall/booth';
import { stallToWorld, type StallPlace } from '../../market-stall/layout';
import { keelhavenHeight } from './height';
import { SIT } from '../../characters/seat-fit';
import { toWorld } from './layout';
import { CANAL, DOCKS, PADS, QUAY, WALL } from './works';
import { BOARD, GATE_LIGHT } from './town';

/**
 * Keelhaven's anchors (spec §3.11, moved to the as-built cove frame, §15): where each of the cast and
 * the islanders stand, the stations and set pieces the content builds, and the market stall. Each is
 * on its ground or deck; the cast snaps to the walk surfaces when it's placed. Plain data (no
 * three.js).
 */

/** A heading toward cove frame direction (du, dv) (a heading h faces (sin h, cos h)). */
export function headingUv(du: number, dv: number): number {
  const o = toWorld(0, 0);
  const p = toWorld(du, dv);
  return Math.atan2(p.x - o.x, p.z - o.z);
}

/** An anchor at cove frame (u, v), on the ground there or at `y`, facing (du, dv). */
function anchor(u: number, v: number, du: number, dv: number, y?: number): VillageAnchor {
  const p = toWorld(u, v);
  return { x: p.x, y: y ?? keelhavenHeight(p.x, p.z), z: p.z, heading: headingUv(du, dv) };
}

/** An anchor raised to the top of a seat block on its ground (seat-fit.ts `SIT.height`). */
function seated(a: VillageAnchor): VillageAnchor {
  return { ...a, y: a.y + SIT.height };
}

/** Bram's booth on the Old Town quay, west of the landing, its front to the landing (MODEL-MARKET §2). */
const BOOTH_UV = { u: -88, v: QUAY.v };
const booth = toWorld(BOOTH_UV.u, BOOTH_UV.v);
export const KEELHAVEN_BOOTH: StallPlace & { y: number } = {
  x: booth.x,
  z: booth.z,
  y: QUAY.top,
  heading: headingUv(1, 0),
};
const vendor = stallToWorld(KEELHAVEN_BOOTH, BOOTH_LAYOUT.vendor.x, BOOTH_LAYOUT.vendor.z);

/** The head of each drydock (the inland end), on the yard by its sign board. */
const HEAD_U = DOCKS.u1 + WALL + 1.6;

export const KEELHAVEN_ANCHORS = {
  // The stops, in the course's order (spec §4.1).
  lyra: anchor(16.6, 73, -1, 0),
  hester: anchor(BOARD.u - 4, BOARD.v + 3.2, -1, 0.6),
  dory: anchor(HEAD_U, DOCKS.v[0] + 3, -1, 0.4),
  cass: anchor(HEAD_U, DOCKS.v[1] + 3, -1, 0.4),
  barty: anchor(92, -21.5, 1, -0.6),
  stroud: anchor(60, -46, -0.2, 1),
  arlo: anchor(26, -47.5, 0.4, 1),
  ottoline: anchor(GATE_LIGHT.u + 9, GATE_LIGHT.v + 6, 1, 0.6, PADS.light.y),
  // The Model Market's keeper behind the counter (the booth builds from `KEELHAVEN_BOOTH`).
  marketKeeper: {
    x: vendor.x,
    y: QUAY.top + BOOTH_LAYOUT.vendor.y,
    z: vendor.z,
    heading: KEELHAVEN_BOOTH.heading,
  },
  // The islanders.
  extraKids: anchor(36, -21, 0, 1),
  extraCaulker: anchor(150, -32, 0, -1),
  // Old Salter sits on a seat block (town-build.ts) whose top is his anchor (seat-fit.ts): on the dry
  // sand at the back of the beach north of the footbridge (1.8 m over the sea), a few metres landward
  // of the beach path, clear of the houses and palms, looking out over the cove. At (-6, 34) his block
  // stood in the surf (issue 363).
  extraFisher: seated(anchor(18, 16, -1, 0)),
  extraLamplighter: anchor(40, CANAL.v + CANAL.half + WALL + 1.4, 0, 1),
  // The barge's skipper on the cut's near coping by her mooring (circuit.ts `BARGE`), off the towpath,
  // facing her over the wall: a captain on the coping can talk to him.
  extraTug: anchor(1.5, CANAL.v + CANAL.half + WALL + 1.3, 0, -1),
} as const satisfies Record<string, VillageAnchor>;

export type KeelhavenAnchor = keyof typeof KEELHAVEN_ANCHORS;
