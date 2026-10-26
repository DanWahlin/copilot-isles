import type { WayLeg, WayPoint } from '../../../game/wayfinding/walk-graph';
import type { IslandWays } from '../waypoints';
import { HELIX, THOUSAND_BOUGH, atBearing, helixBearing, helixY } from './layout';

/**
 * Thousand-Bough's routes for the compass (src/game/wayfinding/), built from the island's layout:
 * the Root Wharf and Bough Landing, the Fern Walk up to the Root Hall, the Great Stair round the trunk
 * (a waypoint every 30° of its helix) with its three decks, the Signal Bridge to the Practice Bough,
 * the boardwalk to the Flume Gallery, and the Crown Deck at the top. At sea: the coast round the
 * island with the cove open to the south, and its lane in to the wharf.
 */
const T = THOUSAND_BOUGH;
const STAIR_STEP = 30;

const nodes: WayPoint[] = [];
const legs: WayLeg[] = [];
const at = (id: string, x: number, y: number, z: number) => nodes.push({ id, x, y, z });
const join = (a: string, b: string) => legs.push([a, b]);

// The wharf and Bough Landing.
const jetty = T.harbor.jetty;
const wharfX = (jetty.x0 + jetty.x1) / 2;
at('wharf.n', wharfX, jetty.height, jetty.z1 - 4);
at('wharf.gangway', wharfX, jetty.height, T.harbor.landing.z);
at('wharf.s', wharfX, jetty.height, jetty.z0 + 4);
join('wharf.n', 'wharf.gangway');
join('wharf.gangway', 'wharf.s');

// The Fern Walk, wharf to the Root Hall.
T.fernWalk.points.forEach((p, i) => {
  at(`fern.${i}`, p.x, p.y, p.z);
  join(i === 0 ? 'wharf.s' : `fern.${i - 1}`, `fern.${i}`);
});
// The stair's foot is joined from the walk's last turn (its very end sits in a nook of the roots).
const hallGate = `fern.${T.fernWalk.points.length - 2}`;

// The Great Stair: a waypoint every STAIR_STEP degrees, and one at each deck's landing.
const stops = new Set<number>();
for (let th = 0; th <= HELIX.sweep; th += STAIR_STEP) stops.add(th);
for (const d of T.decks) if (d.theta !== null) stops.add(d.theta);
stops.add(HELIX.sweep);
const thetas = [...stops].sort((a, b) => a - b);
thetas.forEach((th, i) => {
  const p = atBearing(helixBearing(th), HELIX.rMid);
  at(`stair.${th}`, p.x, helixY(th), p.z);
  if (i > 0) join(`stair.${thetas[i - 1]}`, `stair.${th}`);
});
// Through the hall's arch, clear of the buttress roots, to the stair's foot.
at('hall.arch', 2002.3, T.rootHall.y, -1541);
join(hallGate, 'hall.arch');
join('hall.arch', 'stair.0');

// The decks off the stair.
for (const d of T.decks) {
  if (d.theta === null) continue;
  const p = atBearing(d.bearing, d.r);
  at(`deck.${d.id}`, p.x, d.y, p.z);
  join(`stair.${d.theta}`, `deck.${d.id}`);
}

// The Signal Bridge from the Signal Deck to the Practice Bough (its walkway's ends on the decks).
const signal = T.bridges.find((b) => b.id === 'R1')!;
const bough = T.decks.find((d) => d.id === 'L2S')!;
const boughAt = atBearing(bough.bearing, bough.r);
at('bridge.R1.a', 1996.5, signal.from.y, -1536.6);
at('bridge.R1.b', 2015, signal.to.y, -1529.2);
at('deck.L2S', boughAt.x, bough.y, boughAt.z);
join('deck.L2SW', 'bridge.R1.a');
join('bridge.R1.a', 'bridge.R1.b');
join('bridge.R1.b', 'deck.L2S');

// The boardwalk from the Three Landings to the Flume Gallery.
T.boardwalk.points.forEach((p, i) => {
  at(`boardwalk.${i}`, p.x, p.y, p.z);
  join(i === 0 ? 'deck.L1E' : `boardwalk.${i - 1}`, `boardwalk.${i}`);
});

// The Crown Deck: the stair's top landing, then the middle.
const crown = T.crown;
at('crown', crown.x, crown.y, crown.z + 6);
join(`stair.${HELIX.sweep}`, 'crown');

export const THOUSAND_BOUGH_WAYS: IslandWays = {
  walk: { nodes, legs },
  sea: {
    coasts: [
      [
        // The cove's east shore (the wharf's side), then round the island anticlockwise on the map.
        { x: 1935, z: -1420 },
        { x: 1935, z: -1330 },
        { x: 1952, z: -1268 },
        { x: 1935, z: -1192 },
        { x: 2020, z: -1172 },
        { x: 2215, z: -1212 },
        { x: 2325, z: -1280 },
        { x: 2385, z: -1450 },
        { x: 2398, z: -1605 },
        { x: 2340, z: -1735 },
        { x: 2210, z: -1826 },
        { x: 1990, z: -1840 },
        { x: 1790, z: -1825 },
        { x: 1712, z: -1745 },
        { x: 1690, z: -1600 },
        { x: 1705, z: -1385 },
        { x: 1790, z: -1278 },
        { x: 1850, z: -1235 },
        { x: 1866, z: -1290 },
        { x: 1862, z: -1400 },
        { x: 1885, z: -1425 },
      ],
    ],
    lanes: [{ x: 1912, z: -1330 }, ...T.harbor.lane.slice(1, 3)],
  },
};
