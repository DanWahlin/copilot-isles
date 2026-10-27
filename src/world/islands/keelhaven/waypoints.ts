import type { WayLeg, WayPoint } from '../../../game/wayfinding/walk-graph';
import type { IslandWays } from '../waypoints';
import { KEELHAVEN_HARBOR as H } from './harbor';
import { keelhavenHeight } from './height';
import { toWorld } from './layout';
import { BEACH_BRIDGE, STREET } from './town';
import { GATE_PATH } from './works';
import { gateStairY } from './gate-stair';

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

// The quay, from Bram's stall at its head past the gangway to its root and down its steps to the street.
at('quay.head', -84, 60, H.deck);
at('quay.gangway', -62, 58.7, H.deck);
at('quay.board', -24, 60, H.deck);
at('quay.root', 5, 60, H.deck);
path('quay.head', 'quay.gangway', 'quay.board', 'quay.root');
// The main street up the town flat to the square.
STREET.forEach((p, i) => at(`street.${i}`, p.u, p.v));
path('quay.root', ...STREET.map((_, i) => `street.${i}`));
// The square and the Evidence Board, then the footbridge over the river to the yard's gate.
// The tavern's porch steps (Lyra), off the street's start.
at('tavern', 13.5, 69.5);
path('street.0', 'tavern');
at('square', 111, 26);
// Round the Evidence Board, which stands on the bridge's line.
at('square.board', 117.5, 17);
at('bridge.s', 112, 11);
at('bridge.n', 112, -5.5);
at('yard.gate', 112, -21);
path(`street.${STREET.length - 1}`, 'square', 'square.board', 'bridge.s', 'bridge.n', 'yard.gate');
// The yard: down to the Fitting Basin's coping, then east past Drydock 3 to the dock heads, and west
// past the hull boards (clear of the sheds and the timber stacks) to the lock terrace.
at('yard.basin', 113, -33.2, 5.2);
at('docks.head', 168.5, -34);
// Down the dock heads, between their rails and the bollards: Drydock 2 (Cass) and Drydock 1 (Dory).
at('docks.d2', 168.5, -58.5);
at('docks.d1', 168.5, -73);
// The Drydock Ring round Drydock 2 (circuit.ts): out along the coping between Docks 2 and 3, past the
// plank stack and the slate, across the caisson at its mouth, and back along the coping between Docks
// 1 and 2 by the lookout, each lane clear of the stations' posts.
at('ring.n.head', 168.6, -53.3, 5.2);
at('ring.n.mouth', 125.2, -53.3, 5.2);
at('ring.caisson', 125.1, -61, 5.19);
at('ring.s.mouth', 125.2, -69.1, 5.2);
at('ring.s.head', 168.6, -69.1, 5.2);
path('yard.gate', 'yard.basin', 'docks.head', 'ring.n.head', 'docks.d2', 'ring.s.head', 'docks.d1');
path('ring.n.head', 'ring.n.mouth', 'ring.caisson', 'ring.s.mouth', 'ring.s.head');
at('yard.west', 98, -34.6, 5.2);
at('yard.corner', 58, -33);
at('locks.top', 50, -45);
at('locks.near', 38, -47);
path('yard.basin', 'yard.west', 'yard.corner', 'locks.top', 'locks.near');
// Over Lock 2's upper gate (its two leaves meet in a V upstream) to the far towpath.
// Each end has a point a step out past the rails' gap, so the compass turns only once you're through.
at('gate.in', 36.3, -51.5);
at('gate.near', 36.2, -54.5, 3.6);
at('gate.mitre', 37.4, -60, 4.02);
at('gate.far', 36.2, -65.5, 3.6);
at('gate.out', 36.3, -68.5);
at('locks.far', 30, -70);
path('locks.near', 'gate.in', 'gate.near', 'gate.mitre', 'gate.far', 'gate.out', 'locks.far');
// The near towpath on down past Lock 2's stations to the cut's coping and the Sea Gate, whose walkway
// crosses to the far coping and on to the stair's foot (the Lock Flight runs downstream, then the Gate
// Light is straight on).
at('tow.l2', 22, -49, 3.4);
at('tow.cut', 4, -53.6, 3.6);
at('tow.sea', -18, -53.6, 3.6);
at('sea.near', -24, -54, 3.6);
at('sea.mitre', -22.6, -60, 4.02);
at('sea.far', -24, -66, 3.6);
// Along the far coping until the bank's behind it (west of there the walls stand in the sea), then
// over the bank to the stair's foot, out past its first tread so the stair is walked onto end on.
at('cut.far', -10, -66.2, 3.6);
at('cut.bank', -5, -71);
at('stair.foot', 13, -76.5);
path('locks.near', 'tow.l2', 'tow.cut', 'tow.sea', 'sea.near', 'sea.mitre', 'sea.far', 'cut.far', 'cut.bank');
path('cut.bank', 'stair.foot', 'stair.0');
path('locks.far', 'stair.foot');
// The beach: from the lock terrace down the sand, over the beach footbridge, to the quay's root (the
// short way back to the ship).
at('beach.slip', 18, -20);
at('beach.bridge.n', BEACH_BRIDGE.u, BEACH_BRIDGE.v1 - 1.5);
at('beach.bridge.s', BEACH_BRIDGE.u, BEACH_BRIDGE.v0 + 1.5);
at('beach.town', 6, 36);
path('tow.l2', 'beach.slip', 'beach.bridge.n', 'beach.bridge.s', 'beach.town', 'quay.root');
// The stair up the North Head to the Gate Light.
GATE_PATH.forEach((p, i) => at(`stair.${i}`, p[0], p[1], gateStairY(p[0], p[1])));
path(...GATE_PATH.map((_, i) => `stair.${i}`));
at('light', -224, -150, 44);
path(`stair.${GATE_PATH.length - 1}`, 'light');

export const KEELHAVEN_WAYS: IslandWays = {
  walk: { nodes, legs },
  sea: {
    coasts: [
      // Where the island is too shallow for the ship (under 3.1 m), 18 m wider, traced from its height
      // (8 m tolerance). The cove stays open from its mouth to the quay's face, and the quay is land.
      [
        { x: 3856, z: -2374 },
        { x: 3786, z: -2316 },
        { x: 3700, z: -2182 },
        { x: 3632, z: -2222 },
        { x: 3588, z: -2218 },
        { x: 3570, z: -2200 },
        { x: 3566, z: -2168 },
        { x: 3582, z: -2136 },
        { x: 3620, z: -2102 },
        { x: 3666, z: -2088 },
        { x: 3666, z: -2052 },
        { x: 3778, z: -1952 },
        { x: 3770, z: -1924 },
        { x: 3802, z: -1896 },
        { x: 3744, z: -1814 },
        { x: 3696, z: -1846 },
        { x: 3682, z: -1836 },
        { x: 3688, z: -1822 },
        { x: 3636, z: -1842 },
        { x: 3610, z: -1832 },
        { x: 3566, z: -1728 },
        { x: 3574, z: -1640 },
        { x: 3554, z: -1484 },
        { x: 3570, z: -1444 },
        { x: 3642, z: -1368 },
        { x: 3638, z: -1320 },
        { x: 3610, z: -1244 },
        { x: 3610, z: -1192 },
        { x: 3622, z: -1152 },
        { x: 3670, z: -1080 },
        { x: 3700, z: -1058 },
        { x: 3752, z: -1050 },
        { x: 3792, z: -1050 },
        { x: 3836, z: -1070 },
        { x: 3880, z: -1038 },
        { x: 3948, z: -958 },
        { x: 4004, z: -934 },
        { x: 4080, z: -962 },
        { x: 4116, z: -994 },
        { x: 4224, z: -994 },
        { x: 4268, z: -1022 },
        { x: 4316, z: -1034 },
        { x: 4338, z: -1068 },
        { x: 4378, z: -1248 },
        { x: 4366, z: -1392 },
        { x: 4454, z: -1580 },
        { x: 4398, z: -1728 },
        { x: 4330, z: -1796 },
        { x: 4394, z: -1944 },
        { x: 4410, z: -2012 },
        { x: 4402, z: -2100 },
        { x: 4430, z: -2132 },
        { x: 4416, z: -2154 },
        { x: 4380, z: -2150 },
        { x: 4316, z: -2178 },
        { x: 4260, z: -2242 },
        { x: 4224, z: -2250 },
        { x: 4184, z: -2238 },
        { x: 4104, z: -2330 },
        { x: 4036, z: -2338 },
        { x: 3964, z: -2366 },
      ],
      // The reef flat off the cove's south headland.
      [
        { x: 3400, z: -1950 },
        { x: 3362, z: -1928 },
        { x: 3354, z: -1904 },
        { x: 3366, z: -1868 },
        { x: 3424, z: -1818 },
        { x: 3500, z: -1818 },
        { x: 3514, z: -1844 },
        { x: 3502, z: -1896 },
        { x: 3452, z: -1938 },
      ],
      // The sea stack off the north-west point.
      [
        { x: 3536, z: -1162 },
        { x: 3506, z: -1144 },
        { x: 3498, z: -1120 },
        { x: 3536, z: -1078 },
        { x: 3560, z: -1086 },
        { x: 3582, z: -1116 },
        { x: 3570, z: -1144 },
      ],
      // Rocks and reefs offshore.
      [
        { x: 4504, z: -1650 },
        { x: 4478, z: -1624 },
        { x: 4490, z: -1588 },
        { x: 4520, z: -1574 },
        { x: 4538, z: -1584 },
        { x: 4542, z: -1604 },
        { x: 4526, z: -1640 },
      ],
      [
        { x: 4416, z: -1046 },
        { x: 4390, z: -1028 },
        { x: 4386, z: -1004 },
        { x: 4400, z: -982 },
        { x: 4424, z: -978 },
        { x: 4450, z: -992 },
        { x: 4454, z: -1016 },
        { x: 4440, z: -1038 },
      ],
      [
        { x: 3880, z: -2442 },
        { x: 3850, z: -2408 },
        { x: 3884, z: -2378 },
        { x: 3902, z: -2388 },
        { x: 3910, z: -2416 },
      ],
      [
        { x: 3520, z: -1514 },
        { x: 3498, z: -1488 },
        { x: 3524, z: -1462 },
        { x: 3550, z: -1492 },
        { x: 3540, z: -1510 },
      ],
    ],
    lanes: H.lane.slice(0, 3),
  },
};
