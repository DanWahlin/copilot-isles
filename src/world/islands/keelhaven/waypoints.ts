import type { WayLeg, WayPoint } from '../../../game/wayfinding/walk-graph';
import type { IslandWays } from '../waypoints';
import { KEELHAVEN_HARBOR as H } from './harbor';
import { keelhavenHeight } from './height';
import { toWorld } from './layout';
import { STREET } from './town';
import { GATE_PATH } from './works';

/**
 * Keelhaven's routes for the compass (src/game/wayfinding/), in the as-built cove frame: the Old Town
 * quay from the gangway to its root, the main street up to the Evidence Board's square, the footbridge
 * over the Keel River to the shipyard, round the Fitting Basin to the dock heads, down the yard to the
 * lock terrace, over Lock 2's upper gate to the far towpath, and up the stair on the North Head to the
 * Gate Light. At sea: the island's coast with the cove open to the north-west, and its lane in through
 * the mouth to the quay.
 */
const nodes: WayPoint[] = [];
const legs: WayLeg[] = [];
/** A waypoint at cove frame (u, v), on the ground there or at `y` (a deck). */
const at = (id: string, u: number, v: number, y?: number) => {
  const p = toWorld(u, v);
  nodes.push({ id, x: p.x, y: y ?? keelhavenHeight(p.x, p.z), z: p.z });
};
const path = (...ids: string[]) => {
  for (let i = 1; i < ids.length; i++) legs.push([ids[i - 1]!, ids[i]!]);
};

// The quay, from its head past the gangway to its root and down its steps to the street.
at('quay.head', -92, 60, H.deck);
at('quay.gangway', -62, 58.7, H.deck);
at('quay.board', -24, 60, H.deck);
at('quay.root', 5, 60, H.deck);
path('quay.head', 'quay.gangway', 'quay.board', 'quay.root');
// The main street up the town flat to the square.
STREET.forEach((p, i) => at(`street.${i}`, p.u, p.v));
path('quay.root', ...STREET.map((_, i) => `street.${i}`));
// The square and the Evidence Board, then the footbridge over the river to the yard's gate.
at('square', 111, 26);
at('bridge.s', 112, 11);
at('bridge.n', 112, -5.5);
at('yard.gate', 112, -21);
path(`street.${STREET.length - 1}`, 'square', 'bridge.s', 'bridge.n', 'yard.gate');
// The yard: along the basin's south side to the dock heads, and west to the lock terrace.
at('yard.south', 128, -29);
at('docks.head', 171, -50);
path('yard.gate', 'yard.south', 'docks.head');
at('yard.west', 90, -28);
at('locks.top', 50, -45);
at('locks.near', 38, -47);
path('yard.gate', 'yard.west', 'locks.top', 'locks.near');
// Over Lock 2's upper gate (its two leaves meet in a V upstream) to the far towpath.
at('gate.near', 36.3, -54.6, 4.02);
at('gate.mitre', 37.4, -60, 4.02);
at('gate.far', 36.3, -65.4, 4.02);
at('locks.far', 30, -70);
path('locks.near', 'gate.near', 'gate.mitre', 'gate.far', 'locks.far');
// The stair up the North Head to the Gate Light.
GATE_PATH.forEach((p, i) => at(`stair.${i}`, p[0], p[1], p[2] + 0.2));
path('locks.far', ...GATE_PATH.map((_, i) => `stair.${i}`));
at('light', -224, -150, 44);
path(`stair.${GATE_PATH.length - 1}`, 'light');

/** A closed coast in the cove frame (u, v), in world points. */
const coast = (pts: readonly (readonly [number, number])[]) =>
  pts.map(([u, v]) => {
    const p = toWorld(u, v);
    return { x: Math.round(p.x), z: Math.round(p.z) };
  });

export const KEELHAVEN_WAYS: IslandWays = {
  walk: { nodes, legs },
  sea: {
    coasts: [
      // The −3.5 m line round the island (traced from its height, 14 m tolerance), with the cove's
      // shore drawn in by hand: the north shore in to the beach, the quay as a jetty to its head, and
      // out along the south shore.
      [
        { x: 3860, z: -2354 },
        { x: 3806, z: -2308 },
        { x: 3700, z: -2139 },
        { x: 3644, z: -2197 },
        { x: 3586, z: -2188 },
        { x: 3612, z: -2133 },
        { x: 3684, z: -2111 },
        { x: 3685, z: -2060 },
        ...coast([
          [-120, -112],
          [-61, -98],
          [-30, -70],
          [-12, -40],
          [-8, 0],
          [-12, 46],
          [-100, 54.5],
          [-106, 60],
          [-100, 66],
          [-60, 84],
          [-136, 116],
        ]),
        { x: 3595, z: -1764 },
        { x: 3574, z: -1484 },
        { x: 3660, z: -1372 },
        { x: 3629, z: -1196 },
        { x: 3680, z: -1100 },
        { x: 3756, z: -1070 },
        { x: 3847, z: -1084 },
        { x: 4004, z: -954 },
        { x: 4108, z: -1014 },
        { x: 4212, z: -1010 },
        { x: 4321, z: -1076 },
        { x: 4356, z: -1244 },
        { x: 4348, z: -1393 },
        { x: 4434, z: -1580 },
        { x: 4381, z: -1716 },
        { x: 4313, z: -1796 },
        { x: 4375, z: -1948 },
        { x: 4390, z: -2076 },
        { x: 4364, z: -2137 },
        { x: 4304, z: -2164 },
        { x: 4244, z: -2227 },
        { x: 4175, z: -2220 },
        { x: 4092, z: -2313 },
      ],
      // The sea stack off the north-west point.
      [
        { x: 3524, z: -1133 },
        { x: 3524, z: -1108 },
        { x: 3548, z: -1101 },
        { x: 3559, z: -1124 },
        { x: 3532, z: -1138 },
      ],
      // The reef flat off the cove's south headland.
      [
        { x: 3388, z: -1926 },
        { x: 3377, z: -1892 },
        { x: 3396, z: -1863 },
        { x: 3476, z: -1830 },
        { x: 3494, z: -1844 },
        { x: 3484, z: -1885 },
        { x: 3396, z: -1928 },
      ],
    ],
    lanes: H.lane.slice(0, 3),
  },
};
