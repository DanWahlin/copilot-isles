import { box, cone, rod, rope, type Buckets } from '../../village/pieces';
import { toWorld } from './layout';
import { YARD_PAINT, at, ground, lampGlass, ubox, YAW_U, type ShipyardOut } from './shipyard';
import { CANAL, CHAMBERS, DOCKS, PADS, SEA_GATE_U, WALL } from './works';

/**
 * The Two Circuits' stations in the world (docs/specs/ISLAND-03-keelhaven.md §5, W.5; as built): where
 * the player stands to use each one, its lamp post (the lamp is a lamp of the island's lamp set,
 * `ring:<place>` / `flight:<place>`), and its set piece. The Drydock Ring runs anticlockwise round
 * Drydock 2 (the work-order post at its head, the plank stack and the slate along the copings toward
 * the basin, the caisson across its mouth, the lookout on the far side); the Lock Flight runs from
 * Stroud's ledgers and the slipway's bell down the locks to the Sea Gate at the cut's mouth. The
 * words are the course pack's (`puzzles/drydock-ring.json`, `lock-flight.json`).
 */

export interface StationSpot {
  /** Where the player stands to use it (cove frame). */
  u: number;
  v: number;
  /** The lamp that answers for it, in the island's lamp set. */
  lamp: string;
  /** What the camera looks at while it's open (cove frame, y). */
  look: { u: number; y: number; v: number };
}

const yard = PADS.yard.y;
const terrace = PADS.locks.y;
const top = (name: string) => CHAMBERS.find((c) => c.name === name)!.top;
/** The near side's coping middle along the canal (toward the yard). */
const NEAR = CANAL.v + CANAL.half + WALL / 2;
const dockTop = top('dock2');
const D2 = DOCKS.v[1];

/** The flight's three hulls: your hull and the two seeded pull requests (their names are the signs'). */
export const FLIGHT_HULLS = ['search', 'note', 'stats'] as const;
export type FlightHull = (typeof FLIGHT_HULLS)[number];

/** Where the hulls lie (cove frame, heading as a direction) when nothing moves them. */
export const HULL_REST: Readonly<Record<FlightHull, { u: number; v: number; du: number; dv: number }>> = {
  // Your hull in the basin, bow to the canal's mouth, until Stroud's order.
  search: { u: 86, v: -54, du: -1, dv: 0 },
  // The two pull requests already in the flight, side by side in Lock 2.
  note: { u: 26, v: CANAL.v + 2.3, du: -1, dv: 0 },
  stats: { u: 26, v: CANAL.v - 2.3, du: -1, dv: 0 },
};
/** Where your hull waits after part 1: in the cut, above the shut Sea Gate. */
export const HULL_WAIT = { u: -10, v: CANAL.v, du: -1, dv: 0 } as const;
/** The repair barge's mooring in the cut (near side). */
const BARGE = { u: 4, v: CANAL.v + 2.4 } as const;

export const CIRCUIT_SPOTS: {
  ring: Readonly<Record<string, StationSpot>>;
  flight: Readonly<Record<string, StationSpot>>;
  /** The flight's lamps station is at the lock that runs: Lock 1 in part 1, Lock 2 in part 2. */
  flightLamps: readonly StationSpot[];
} = {
  ring: {
    post: { u: 168.6, v: D2 - 1.4, lamp: 'ring:post', look: { u: 160, y: yard + 1, v: D2 } },
    stack: { u: 150, v: D2 + 7, lamp: 'ring:stack', look: { u: 150, y: yard + 0.6, v: D2 + 9.2 } },
    slate: { u: 134, v: D2 + 7, lamp: 'ring:slate', look: { u: 134, y: yard + 1.2, v: D2 + 9.2 } },
    caisson: { u: 125, v: D2, lamp: 'ring:caisson', look: { u: 140, y: yard - 1, v: D2 } },
    lookout: { u: 146, v: D2 - 7.2, lamp: 'ring:lookout', look: { u: 146, y: yard - 1.5, v: D2 } },
  },
  flight: {
    ledger: { u: 57.6, v: -48, lamp: 'flight:ledger', look: { u: 57.6, y: yard + 1.2, v: -49.4 } },
    bell: { u: 49.6, v: -31.2, lamp: 'flight:bell', look: { u: 30, y: terrace, v: -28 } },
    slate: { u: 66, v: -50.8, lamp: 'flight:slate', look: { u: 66, y: yard + 1, v: -52 } },
    gate1: { u: 55.6, v: -50.8, lamp: 'flight:gate1', look: { u: 52, y: yard - 1, v: CANAL.v } },
    petition: { u: 44, v: -48.2, lamp: 'flight:petition', look: { u: 44, y: terrace + 3, v: -49.8 } },
    note: { u: 30, v: -50.4, lamp: 'flight:note', look: { u: 26, y: 1.5, v: HULL_REST.note.v } },
    redLamp: { u: 23, v: -50.4, lamp: 'flight:redLamp', look: { u: 26, y: 1.5, v: HULL_REST.stats.v } },
    barge: { u: 7, v: NEAR, lamp: 'flight:barge', look: { u: BARGE.u, y: 0.6, v: BARGE.v } },
    gate2: { u: 18.6, v: -50.4, lamp: 'flight:gate2', look: { u: 16, y: 2, v: CANAL.v } },
    seaGate: { u: -18, v: NEAR, lamp: 'flight:seaGate', look: { u: SEA_GATE_U, y: 1, v: CANAL.v } },
    // The lamps station's place moves with the lock that runs (`flightLamps`).
    lamps: { u: 58.5, v: -50.8, lamp: 'lock:1', look: { u: 55, y: yard + 2, v: -67 } },
  },
  flightLamps: [
    { u: 58.5, v: -50.8, lamp: 'lock:1', look: { u: 55, y: yard + 2, v: -67 } },
    { u: 21, v: -50.4, lamp: 'lock:3', look: { u: 19, y: terrace + 2, v: -67 } },
  ],
};

/** Gate 2's post carries a lamp for each of its four agreements (`gate2:0`..`gate2:3`). */
export const GATE2_LAMPS = 4;

/** A post with a station lamp on it (its glass is `key` in the lamp set). */
function stationPost(
  b: Buckets,
  out: ShipyardOut,
  key: string,
  u: number,
  v: number,
  y: number,
  h = 2.6,
): void {
  const p = at(u, y, v);
  rod(b, 'wood', p, { x: p.x, y: y + h, z: p.z }, 0.09, 6, YARD_PAINT.tar);
  cone(b, 'metal', p.x, y + h + 0.17, p.z, 0.2, 0.18, 6, YARD_PAINT.iron);
  lampGlass(out, key, 'dark', (s) =>
    box(s, 'glow', p.x, y + h - 0.12, p.z, 0.24, 0.3, 0.24, YAW_U, 0xffffff),
  );
  out.circles.push({ x: p.x, z: p.z, r: 0.18, y0: y - 0.5, y1: y + h + 0.3, height: h + 0.3 });
}

/** Builds the circuits' posts, lamps and set pieces into `b` (their glass into `out.lamps`). */
export function buildCircuitProps(b: Buckets, out: ShipyardOut, lite: boolean): void {
  // ---- The Drydock Ring round Drydock 2 ----
  const R = CIRCUIT_SPOTS.ring;
  stationPost(b, out, R.post!.lamp, R.post!.u + 1.8, R.post!.v - 0.6, yard);
  // The work-order post's board, under its lamp.
  ubox(b, 'wood', R.post!.u + 1.75, yard + 1.5, R.post!.v - 0.6, 0.06, 0.6, 0.9, YARD_PAINT.limewash);
  // The plank stack between Drydock 2 and Drydock 3, its lamp at its end.
  const sv = D2 + 9.2;
  for (let k = 0; k < 4; k++)
    ubox(b, 'wood', R.stack!.u, dockTop + 0.12 + k * 0.17, sv, 4.2 - k * 0.3, 0.15, 0.9, YARD_PAINT.oak);
  out.colliders.push({ ...toWorld(R.stack!.u, sv), hx: 2.2, hz: 0.55, rot: YAW_U, height: 0.9 });
  stationPost(b, out, R.stack!.lamp, R.stack!.u + 2.9, sv, dockTop);
  // The slate: a dark board on two legs, its chalk marks on it, facing the coping.
  const sl = R.slate!;
  for (const du of [-0.8, 0.8]) {
    const p = at(sl.u + du, dockTop, sv);
    rod(b, 'wood', p, { x: p.x, y: dockTop + 1.8, z: p.z }, 0.06, 5, YARD_PAINT.tar);
  }
  ubox(b, 'stone', sl.u, dockTop + 1.3, sv - 0.05, 1.9, 1.0, 0.06, YARD_PAINT.slate);
  for (let k = 0; k < 3; k++)
    ubox(
      b,
      'paving',
      sl.u - 0.5 + k * 0.5,
      dockTop + 1.3 + (k - 1) * 0.12,
      sv - 0.09,
      0.3,
      0.04,
      0.02,
      0xf2efe6,
    );
  out.colliders.push({ ...toWorld(sl.u, sv), hx: 1.0, hz: 0.25, rot: YAW_U, height: 1.8 });
  stationPost(b, out, sl.lamp, sl.u + 1.5, sv, dockTop);
  // The caisson's lamp on the coping at its end; the lookout's on the far side, with a rail.
  stationPost(b, out, R.caisson!.lamp, R.caisson!.u - 1.6, D2 + 7.4, dockTop);
  const lk = R.lookout!;
  stationPost(b, out, lk.lamp, lk.u, lk.v - 1.8, dockTop, 3.2);
  const r0 = at(lk.u - 1.2, dockTop + 1.0, lk.v - 1.7);
  const r1 = at(lk.u + 1.2, dockTop + 1.0, lk.v - 1.7);
  for (const r of [r0, r1]) rod(b, 'wood', { x: r.x, y: dockTop, z: r.z }, r, 0.05, 5, YARD_PAINT.weathered);
  rod(b, 'wood', r0, r1, 0.04, 5, YARD_PAINT.weathered);

  // ---- The Lock Flight ----
  const F = CIRCUIT_SPOTS.flight;
  stationPost(b, out, F.ledger!.lamp, F.ledger!.u - 1.8, F.ledger!.v - 1.2, ground(F.ledger!.u - 1.8, -49.2));
  // The slipway's bell at its head: a frame, a brass bell and its cord.
  const bu = F.bell!.u + 1.2;
  const bv = F.bell!.v - 1.8;
  const by = ground(bu, bv);
  stationPost(b, out, F.bell!.lamp, bu, bv, by, 3.0);
  ubox(b, 'wood', bu - 0.4, by + 2.75, bv, 0.9, 0.1, 0.1, YARD_PAINT.tar);
  const hang = at(bu - 0.8, by + 2.7, bv);
  cone(b, 'metal', hang.x, by + 2.3, hang.z, 0.26, 0.44, 8, 0xb8923e, 0.08);
  rope(
    b,
    { x: hang.x, y: by + 2.3, z: hang.z },
    { x: hang.x, y: by + 1.1, z: hang.z },
    0.02,
    0.015,
    YARD_PAINT.rope,
    2,
  );
  // Lock 1's slate (the diff) on the yard's edge by the coping, and Gate 1's post by its gate.
  const ls = F.slate!;
  for (const du of [-0.8, 0.8]) {
    const p = at(ls.u + du, yard, ls.v - 1.2);
    rod(b, 'wood', p, { x: p.x, y: yard + 1.8, z: p.z }, 0.06, 5, YARD_PAINT.tar);
  }
  ubox(b, 'stone', ls.u, yard + 1.3, ls.v - 1.25, 1.9, 1.0, 0.06, YARD_PAINT.slate);
  out.colliders.push({ ...toWorld(ls.u, ls.v - 1.2), hx: 1.0, hz: 0.25, rot: YAW_U, height: 1.8 });
  stationPost(b, out, ls.lamp, ls.u + 1.5, ls.v - 1.2, yard);
  stationPost(b, out, F.gate1!.lamp, F.gate1!.u - 1.4, F.gate1!.v - 1.2, yard, 2.2);
  // The petition mast on the terrace by the pound: a pole, a yard and the petition's sheet.
  const pm = at(F.petition!.u, terrace, F.petition!.v - 1.6);
  rod(b, 'wood', pm, { x: pm.x, y: terrace + 6.5, z: pm.z }, 0.12, 6, YARD_PAINT.tar);
  const yardA = at(F.petition!.u - 1.4, terrace + 5.9, F.petition!.v - 1.6);
  const yardB = at(F.petition!.u + 1.4, terrace + 5.9, F.petition!.v - 1.6);
  rod(b, 'wood', yardA, yardB, 0.05, 5, YARD_PAINT.tar);
  ubox(b, 'cloth', F.petition!.u, terrace + 4.9, F.petition!.v - 1.55, 2.4, 1.9, 0.04, YARD_PAINT.canvas);
  out.circles.push({ x: pm.x, z: pm.z, r: 0.2, y0: terrace - 0.5, y1: terrace + 6.5, height: 6.5 });
  stationPost(b, out, F.petition!.lamp, F.petition!.u + 1.6, F.petition!.v - 1.4, terrace, 2.2);
  // The two hulls' lamps in Lock 2, the barge's on the cut's coping, Gate 2's post and the Sea Gate's.
  stationPost(b, out, F.note!.lamp, F.note!.u, F.note!.v - 1.2, terrace, 2.2);
  stationPost(b, out, F.redLamp!.lamp, F.redLamp!.u, F.redLamp!.v - 1.2, terrace, 2.2);
  const cut = top('cut');
  stationPost(b, out, F.barge!.lamp, F.barge!.u + 1.6, NEAR + 0.9, cut, 2.2);
  stationPost(b, out, F.seaGate!.lamp, F.seaGate!.u - 1.6, NEAR + 0.9, cut, 2.6);
  // Gate 2's post: a crossbar with its four lamps (diff, local, checks, review), and its own lamp.
  const g2 = F.gate2!;
  const gu = g2.u - 1.6;
  const gv = g2.v - 1.2;
  stationPost(b, out, g2.lamp, gu, gv, terrace, 2.0);
  const ga = at(gu, terrace + 2.5, gv);
  const bar0 = at(gu - 1.0, terrace + 2.5, gv);
  const bar1 = at(gu + 1.0, terrace + 2.5, gv);
  rod(b, 'wood', { x: ga.x, y: terrace + 1.9, z: ga.z }, ga, 0.07, 5, YARD_PAINT.tar);
  rod(b, 'wood', bar0, bar1, 0.05, 5, YARD_PAINT.tar);
  for (let k = 0; k < GATE2_LAMPS; k++) {
    const q = at(gu - 0.75 + k * 0.5, terrace + 2.32, gv);
    lampGlass(out, `gate2:${k}`, 'dark', (s) =>
      box(s, 'glow', q.x, q.y, q.z, 0.2, 0.26, 0.2, YAW_U, 0xffffff),
    );
  }
  // The repair barge, moored in the cut: a flat hull, its deck, a little deckhouse and a stack.
  const bw = 0.15;
  ubox(b, 'wood', BARGE.u, bw - 0.25, BARGE.v, 7.2, 1.0, 2.8, YARD_PAINT.tar);
  ubox(b, 'wood', BARGE.u, bw + 0.3, BARGE.v, 7.0, 0.12, 2.6, YARD_PAINT.weathered);
  ubox(b, 'wood', BARGE.u + 1.8, bw + 1.05, BARGE.v, 2.0, 1.4, 1.8, YARD_PAINT.limewash);
  ubox(b, 'wood', BARGE.u + 1.8, bw + 1.8, BARGE.v, 2.3, 0.12, 2.1, YARD_PAINT.ochre);
  if (!lite) {
    const st = at(BARGE.u - 1.6, bw + 0.36, BARGE.v);
    rod(b, 'metal', st, { x: st.x, y: bw + 1.9, z: st.z }, 0.16, 6, YARD_PAINT.iron);
    // Its mooring lines to the coping.
    for (const du of [-3, 3]) {
      const a = at(BARGE.u + du, bw + 0.4, BARGE.v + 1.2);
      const c = at(BARGE.u + du * 1.3, cut + 0.1, NEAR - 0.6);
      rope(b, a, c, 0.3, 0.03, YARD_PAINT.rope, 4);
    }
  }
}
