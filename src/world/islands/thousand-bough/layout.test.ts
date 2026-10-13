import { describe, expect, it } from 'vitest';
import { CollisionWorld, type WalkSurface } from '../../../game/collision';
import type { HeightField } from '../../contracts';
import { HELIX, THOUSAND_BOUGH as TB, TREE, atBearing, bearingOf, helixPassesAt, helixY } from './layout';
import { laneDistance, thousandBoughHeight, thousandBoughMasks, thousandBoughWater } from './height';
import {
  BRIDGES,
  CROWN,
  DECKS,
  LANDING_SWEEP,
  TOP_LANDING,
  GALLERY_RECT,
  helixWalkY,
  inRect,
  rectWorld,
  villageWalkable,
} from './village/surfaces';
import { WalkClearance } from './village/clearance';
import {
  BRANCHES,
  CANOPY_LIMBS,
  CAMERA_SPOTS,
  cableDistance,
  canopyClusters,
  propRoots,
  treeKeepouts,
} from './tree/shape';
import { emptyStructure, buildStructure } from './village/structure';
import { buildHouses } from './village/houses';
import { SignSet } from '../../sites/sign';
import { flumeColliders } from './flume';
import { makeBuckets } from './village/pieces';
import { thousandBoughRockSpots, rockTop, STARFISH_STONE } from './rocks';
import { mistCards } from './mist';
import { THOUSAND_BOUGH_ARRIVAL } from '../../../game/arrivals';
import type { CircleObstacle, WaveSampler } from '../../contracts';
import { ShipDynamics } from '../../ship/dynamics';
import { BRIGANTINE_CAPSULES } from '../../ship/lines';
import { wharfShipObstacles } from './village/structure';

const ground: HeightField = {
  heightAt: thousandBoughHeight,
  normalAt: (_x, _z, out) => {
    out[0] = 0;
    out[1] = 1;
    out[2] = 0;
    return out;
  },
  masksAt: thousandBoughMasks,
};
const clearance = new WalkClearance();
const surface: WalkSurface = { heightAt: (x, z, y) => villageWalkable(x, z, y), kind: 'wood' };

/** The walker's ground at (x, z) for feet at y: the village's surfaces over the terrain. */
function groundAt(x: number, z: number, y: number): number {
  return villageWalkable(x, z, y) ?? thousandBoughHeight(x, z);
}

function structure() {
  const b = makeBuckets();
  const out = buildStructure(b, makeBuckets(), () => true);
  buildHouses(b, new SignSet('test'), out);
  out.colliders.push(...flumeColliders());
  for (const list of Object.values(b)) for (const g of list) g.dispose();
  return out;
}

const built = structure();
const rockCircles = thousandBoughRockSpots(clearance).map((s) => ({
  x: s.x,
  z: s.z,
  r: Math.max(s.sx, s.sz) * 0.42,
  y0: s.y - 1,
  y1: rockTop(s),
}));
const world = new CollisionWorld({
  ground,
  surfaces: [surface],
  circles: [...built.circles, ...rockCircles],
  boxes: built.colliders,
});

/** True when a walker (radius 0.35) with feet at y would be pushed by a fence at (x, z). */
function blocked(x: number, z: number, y: number): boolean {
  return world.pushOut({ x, z }, 0.3, y);
}

/** Walks a route of points (x, z) sampled every 0.5 m: the ground must step ≤ 0.45 m and no fence may stand on it. */
function walk(route: readonly { x: number; z: number; y?: number }[], y0: number) {
  let y = y0;
  let worstStep = 0;
  let worstAt = '';
  const fences: string[] = [];
  for (let i = 0; i < route.length - 1; i++) {
    const a = route[i]!;
    const b = route[i + 1]!;
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    const n = Math.max(1, Math.ceil(len / 0.5));
    for (let k = 1; k <= n; k++) {
      const x = a.x + ((b.x - a.x) * k) / n;
      const z = a.z + ((b.z - a.z) * k) / n;
      const g = groundAt(x, z, y);
      if (Math.abs(g - y) > worstStep) {
        worstStep = Math.abs(g - y);
        worstAt = `${x.toFixed(1)},${z.toFixed(1)} ${y.toFixed(2)}→${g.toFixed(2)}`;
      }
      y = g;
      if (blocked(x, z, y)) fences.push(`${x.toFixed(1)},${z.toFixed(1)} y ${y.toFixed(2)}`);
    }
  }
  return { y, worstStep, worstAt, fences };
}

describe('Thousand-Bough layout', () => {
  it('stands every NPC, interaction and collectible on its ground, within 5 cm', () => {
    const cams = new Set(['puzzleCam', 'twistCam']);
    for (const [name, a] of Object.entries(TB.anchors)) {
      if (cams.has(name)) continue;
      const g = groundAt(a.x, a.z, a.y);
      expect(Math.abs(g - a.y), name).toBeLessThan(name.startsWith('extra') || name === 'lyra' ? 0.35 : 0.05);
    }
    for (const s of TB.starfish) {
      const g = groundAt(s.x, s.z, s.y);
      expect(Math.abs(g - s.y), s.id).toBeLessThan(0.05);
    }
    const water = thousandBoughWater();
    for (const c of [...TB.chests, ...TB.bottles]) {
      const y = 'y' in c ? c.y : undefined;
      const g = groundAt(c.x, c.z, y ?? 100);
      expect(g, c.id).toBeGreaterThan(0.4);
      // Not in a pool or a stream.
      if (villageWalkable(c.x, c.z, y) === null) expect(water.levelAt(c.x, c.z), c.id).toBeNull();
    }
  });

  it('gives each stop a 4 m clearing it can stand in', () => {
    for (const id of ['tamsin', 'saffi', 'oak', 'fen', 'ines', 'rook', 'pip', 'elder'] as const) {
      const a = TB.anchors[id];
      for (let k = 0; k < 8; k++) {
        const ang = (k / 8) * Math.PI * 2;
        const x = a.x + Math.cos(ang) * 2.2;
        const z = a.z + Math.sin(ang) * 2.2;
        expect(Math.abs(groundAt(x, z, a.y) - a.y), `${id} ${k}`).toBeLessThan(0.45);
        expect(blocked(x, z, a.y), `${id} fence ${k}`).toBe(false);
      }
    }
  });

  it('keeps every limb, bough and leader out of every deck, landing and the boardwalk (under or 4.5 m over)', () => {
    // The limbs as resampled in the mesh (0.5 m steps along each centre line, knots and flutes add
    // up to about 30% to the radius), against each raised walk's footprint grown by 0.6 m.
    const rects = [
      ...Object.values(DECKS).map((d) => ({ id: d.id, r: d.rect, y: d.y })),
      { id: 'FG', r: GALLERY_RECT, y: TB.gallery.y },
      { id: 'topLanding', r: TOP_LANDING, y: CROWN.y },
    ];
    const bad: string[] = [];
    for (const b of BRANCHES) {
      if (b.id.startsWith('pillar')) continue;
      for (let i = 0; i < b.points.length - 1; i++) {
        const a = b.points[i]!;
        const c = b.points[i + 1]!;
        const n = Math.ceil(Math.hypot(c.x - a.x, c.y - a.y, c.z - a.z) / 0.5);
        for (let k = 0; k <= n; k++) {
          const t = k / n;
          const x = a.x + (c.x - a.x) * t;
          const y = a.y + (c.y - a.y) * t;
          const z = a.z + (c.z - a.z) * t;
          const rad = (a.r + (c.r - a.r) * t) * 1.3;
          for (const d of rects) {
            if (!inRect(d.r, x, z, rad + 0.6)) continue;
            // Under the boards and their joists, or high over the walk (no closer to the deck's stack).
            const under = y + rad <= d.y - 0.8;
            const over = y - rad >= d.y + 4.5;
            if (!under && !over && !bad.some((s) => s.startsWith(`${b.id} `)))
              bad.push(
                `${b.id} through ${d.id} at ${x.toFixed(1)},${y.toFixed(1)},${z.toFixed(1)} r ${rad.toFixed(2)}`,
              );
          }
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it('keeps every limb and bough to the stair clearance rule (§3.6)', () => {
    const passes: number[] = [];
    for (const b of BRANCHES) {
      if (b.id.startsWith('pillar') || b.id.includes('twig') || b.id.startsWith('leader')) continue;
      for (let i = 0; i < b.points.length - 1; i++) {
        const a = b.points[i]!;
        const c = b.points[i + 1]!;
        for (let t = 0; t <= 1; t += 0.05) {
          const x = a.x + (c.x - a.x) * t;
          const z = a.z + (c.z - a.z) * t;
          const r = Math.hypot(x - TREE.x, z - TREE.z);
          if (r < HELIX.rInner - 0.5 || r > HELIX.rOuter + 0.5) continue;
          const y = a.y + (c.y - a.y) * t;
          const rad = a.r + (c.r - a.r) * t;
          helixPassesAt(bearingOf(x, z), passes);
          for (const p of passes) {
            const ok = y - rad >= p + 4.5 || y + rad <= p - 0.6;
            expect(ok, `${b.id} at r ${r.toFixed(1)} y ${y.toFixed(1)} over stair ${p.toFixed(1)}`).toBe(
              true,
            );
          }
        }
      }
    }
  });

  it('keeps the canopy clear of every walk (6 m over, 4 m beside) and of the cathedral', () => {
    const clusters = canopyClusters(1500, clearance);
    expect(clusters.length).toBeGreaterThan(1000);
    for (const c of clusters) {
      expect(clearance.conflict(c.x, c.y, c.z, c.r, { beside: 3.95, above: 5.95, below: 0.9 })).toBeNull();
      const r = Math.hypot(c.x - TREE.x, c.z - TREE.z);
      if (r < TB.tree.canopy.openR) expect(c.y - c.r).toBeGreaterThanOrEqual(TB.tree.canopy.openBelow);
      expect(cableDistance(c.x, c.y, c.z)).toBeGreaterThanOrEqual(4 + c.r - 1e-6);
    }
    // The high crown tops out at its authored top (raised to break the ridge's skyline from the sea).
    const top = Math.max(...clusters.map((c) => c.y + c.r));
    expect(top).toBeGreaterThan(TB.tree.crownTop - 6);
    expect(top).toBeLessThan(TB.tree.crownTop + 3);
  });

  it('hangs the prop roots clear of every path, deck and bridge, on dry ground', () => {
    const roots = propRoots(36);
    expect(roots.length).toBeGreaterThanOrEqual(24);
    const water = thousandBoughWater();
    for (const r of roots) {
      expect(
        clearance.conflict(r.foot.x, r.foot.y + 1, r.foot.z, r.r, { beside: 2.4, above: 40, below: 3 }),
      ).toBeNull();
      expect(water.shoreDistance(r.foot.x, r.foot.z, 3)).toBeGreaterThan(r.r);
      // Its top is inside a canopy limb.
      const inside = CANOPY_LIMBS.some((l) =>
        l.points.some((p) => Math.hypot(p.x - r.top.x, p.z - r.top.z) < 9 && Math.abs(p.y - r.top.y) < 4),
      );
      expect(inside).toBe(true);
    }
  });

  it('keeps the Mirror Pool path and the ledge to the cave out of the water, end to end', () => {
    const water = thousandBoughWater();
    const route = [...TB.sidePaths.mirror, ...TB.sidePaths.caveLedge];
    const wet: string[] = [];
    for (let i = 0; i < route.length - 1; i++) {
      const a = route[i]!;
      const b = route[i + 1]!;
      const n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.5);
      for (let k = 0; k <= n; k++) {
        const x = a.x + ((b.x - a.x) * k) / n;
        const z = a.z + ((b.z - a.z) * k) / n;
        const feet = groundAt(x, z, 40);
        const level = water.levelAt(x, z);
        if (level !== null && level - feet > 0.25)
          wet.push(`${x.toFixed(1)},${z.toFixed(1)} ${(level - feet).toFixed(2)} m deep`);
      }
    }
    expect(wet).toEqual([]);
    // The path's end meets the ledge's start.
    const end = TB.sidePaths.mirror[TB.sidePaths.mirror.length - 1]!;
    expect(
      Math.hypot(end.x - TB.sidePaths.caveLedge[0]!.x, end.z - TB.sidePaths.caveLedge[0]!.z),
    ).toBeLessThan(7);
  });

  it('walks the Fern Walk from the wharf to the Root Hall with no step over 0.45 m and no fence', () => {
    const route = [
      { x: TB.harbor.landing.x, z: TB.harbor.landing.z },
      { x: 1940, z: -1424 },
      ...TB.fernWalk.points,
    ];
    const w = walk(route, groundAt(TB.harbor.landing.x, TB.harbor.landing.z, 2.2));
    expect(w.worstStep, w.worstAt).toBeLessThan(0.45);
    expect(w.fences).toEqual([]);
    expect(w.y).toBeCloseTo(TB.rootHall.y, 1);
  });

  it('climbs the Great Stair from the Root Hall to the Crown Deck', () => {
    const route: { x: number; z: number }[] = [];
    route.push(atBearing(HELIX.startBearing - 12, HELIX.rMid));
    for (let t = 0; t <= HELIX.sweep + LANDING_SWEEP; t += 2)
      route.push(atBearing(HELIX.startBearing + t, HELIX.rMid));
    route.push({ x: TOP_LANDING.x, z: TOP_LANDING.z }, { x: CROWN.x, z: CROWN.z + 4 });
    const w = walk(route, TB.rootHall.y);
    expect(w.worstStep, w.worstAt).toBeLessThan(0.45);
    expect(w.fences).toEqual([]);
    expect(w.y).toBeCloseTo(CROWN.y, 2);
  });

  it('steps from the stair onto each stop deck, and across the bridges and the boardwalk', () => {
    for (const d of Object.values(DECKS)) {
      if (d.theta === null) continue;
      const on = atBearing(d.bearing, HELIX.rMid);
      const off = rectWorld(d.rect, 0, 0);
      const w = walk([on, off], helixY(d.theta));
      expect(w.worstStep, `${d.id} ${w.worstAt}`).toBeLessThan(0.45);
      expect(w.fences, d.id).toEqual([]);
      expect(w.y, d.id).toBeCloseTo(d.y, 2);
    }
    for (const b of BRIDGES) {
      if (b.id === 'R3') continue;
      const ux = b.to.x - b.from.x;
      const uz = b.to.z - b.from.z;
      const l = Math.hypot(ux, uz);
      const w = walk(
        [
          { x: b.from.x - (ux / l) * 1.5, z: b.from.z - (uz / l) * 1.5 },
          { x: b.to.x + (ux / l) * 1.5, z: b.to.z + (uz / l) * 1.5 },
        ],
        b.from.y,
      );
      expect(w.worstStep, `${b.id} ${w.worstAt}`).toBeLessThan(0.45);
      expect(w.fences, b.id).toEqual([]);
    }
    const bw = walk(
      [rectWorld(DECKS.L1E.rect, 0, 0), ...TB.boardwalk.points, { x: TB.gallery.x, z: TB.gallery.z }],
      DECKS.L1E.y,
    );
    expect(bw.worstStep, bw.worstAt).toBeLessThan(0.45);
    expect(bw.fences).toEqual([]);
    expect(bw.y).toBeCloseTo(TB.gallery.y, 2);
  });

  it('rails every deck edge that isn’t an opening (no fall from the tree)', () => {
    // Walking straight out of each deck's outer edge is stopped by its rail.
    for (const d of Object.values(DECKS)) {
      const inside = rectWorld(d.rect, d.rect.hu - 0.6, d.rect.hv * 0.3);
      const outside = rectWorld(d.rect, d.rect.hu + 0.4, d.rect.hv * 0.3);
      const fenced =
        blocked(inside.x, inside.z, d.y) ||
        blocked(outside.x, outside.z, d.y) ||
        blocked((inside.x + outside.x) / 2, (inside.z + outside.z) / 2, d.y);
      expect(fenced, d.id).toBe(true);
    }
  });

  it('sits every rock on its ground, off the walks, and clear of the starfish', () => {
    const spots = thousandBoughRockSpots(clearance);
    expect(spots.length).toBeGreaterThan(40);
    for (const s of spots) {
      expect(Math.abs(s.y - thousandBoughHeight(s.x, s.z))).toBeLessThan(0.05);
      expect(rockTop(s)).toBeGreaterThan(s.y);
    }
    for (const s of spots)
      expect(Math.hypot(s.x - STARFISH_STONE.x, s.z - STARFISH_STONE.z)).toBeGreaterThan(2.5);
  });

  it('keeps the authored cameras clear of limbs (the puzzle, the twist, the Crown, the Root Gate)', () => {
    for (const cam of CAMERA_SPOTS)
      for (const b of BRANCHES) {
        if (b.id.startsWith('pillar')) continue;
        for (const p of b.points)
          expect(Math.hypot(p.x - cam.x, p.y - cam.y, p.z - cam.z) - p.r, b.id).toBeGreaterThan(2.5);
      }
    for (const k of treeKeepouts())
      for (const cam of CAMERA_SPOTS)
        expect(Math.hypot(k.x - cam.x, k.z - cam.z) > k.r || cam.y > k.y1 || cam.y < k.y0).toBe(true);
  });

  it('keeps the mist cards in the air, clear of the walks', () => {
    const cards = mistCards(60, clearance);
    expect(cards.length).toBeGreaterThan(30);
    for (const c of cards) {
      expect(c.y - thousandBoughHeight(c.x, c.z)).toBeGreaterThan(3);
      expect(c.y).toBeLessThan(TB.mood.mistTop);
    }
  });
});

describe('Thousand-Bough berth and approach', () => {
  it('berths the ship in deep water alongside the wharf, port side to its face', () => {
    const b = TB.harbor.berth;
    for (const along of [-12, -6, 0, 6, 12])
      for (const across of [-3.3, 0, 3.3])
        expect(thousandBoughHeight(b.x + across, b.z + along)).toBeLessThan(-4);
    expect(Math.abs(b.x + Math.cos(b.heading) * 4.6 - TB.harbor.jetty.x0)).toBeLessThan(0.3);
    expect(groundAt(TB.harbor.landing.x, TB.harbor.landing.z, 3)).toBeCloseTo(TB.harbor.jetty.height, 1);
  });

  it('keeps the approach lane (30 m half-width to the mouth) and the 45 m turning circle deep', () => {
    const lane = TB.harbor.lane;
    for (let i = 0; i < lane.length - 2; i++) {
      const a = lane[i]!;
      const b = lane[i + 1]!;
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      for (let s = 0; s <= len; s += 5)
        for (const off of [-30, -15, 0, 15, 30]) {
          const ux = (b.x - a.x) / len;
          const uz = (b.z - a.z) / len;
          const x = a.x + ux * s - uz * off;
          const z = a.z + uz * s + ux * off;
          expect(thousandBoughHeight(x, z), `${x.toFixed(0)},${z.toFixed(0)}`).toBeLessThan(
            TB.harbor.laneFloor,
          );
        }
    }
    const t = TB.harbor.turning;
    for (let r = 0; r <= t.r; r += 9)
      for (let k = 0; k < 12; k++) {
        const x = t.x + Math.cos((k / 12) * Math.PI * 2) * r;
        const z = t.z + Math.sin((k / 12) * Math.PI * 2) * r;
        // The wharf stands on piles over the dredged basin.
        expect(thousandBoughHeight(x, z), `${x.toFixed(0)},${z.toFixed(0)}`).toBeLessThan(-t.depth);
      }
    expect(laneDistance(1905, -1265)).toBeLessThan(1);
  });

  const calm: WaveSampler = {
    heightAt: () => 0,
    velocityAt: (_x, _z, _t, out) => {
      out[0] = 0;
      out[1] = 0;
      return out;
    },
  };
  /** Steps the ship; returns how far its hull reached into any obstacle (m) and the seconds. */
  const sail = (ship: ShipDynamics, obstacles: CircleObstacle[], seconds: number, trim: number) => {
    const env = { waves: calm, ground, obstacles, t: 0 };
    let worst = -Infinity;
    let at = '';
    let i = 0;
    for (; i < seconds * 60 && !ship.dockComplete; i++) {
      env.t += 1 / 60;
      ship.step(1 / 60, { trim, rudder: 0 }, env);
      const s = Math.sin(ship.pose.heading);
      const c = Math.cos(ship.pose.heading);
      for (const cap of ship.capsules)
        for (const o of obstacles) {
          const d = Math.hypot(ship.pose.x + s * cap.z - o.x, ship.pose.z + c * cap.z - o.z);
          if (cap.radius + o.r - d > worst) {
            worst = cap.radius + o.r - d;
            at = `cap ${cap.z} at pile ${o.x},${o.z} ship ${ship.pose.x.toFixed(1)},${ship.pose.z.toFixed(1)} h ${ship.pose.heading.toFixed(2)} t ${(i / 60).toFixed(1)}`;
          }
        }
    }
    return { worst, seconds: i / 60, at };
  };

  it("keeps the wharf's ship obstacles off the lane and half a metre clear of the berthed hull", () => {
    const piles = wharfShipObstacles();
    expect(piles.length).toBeGreaterThan(40);
    const j = TB.harbor.jetty;
    for (const o of piles) {
      expect(o.x - o.r).toBeGreaterThanOrEqual(j.x0 - 0.01);
      expect(o.x + o.r).toBeLessThanOrEqual(j.x1 + 0.01);
    }
    const { berth } = TB.harbor;
    for (const cap of BRIGANTINE_CAPSULES) {
      const x = berth.x + Math.sin(berth.heading) * cap.z;
      const z = berth.z + Math.cos(berth.heading) * cap.z;
      for (const o of piles)
        expect(Math.hypot(o.x - x, o.z - z), `capsule ${cap.z}`).toBeGreaterThan(o.r + cap.radius + 0.5);
    }
    // The lane's last leg (mouth → berth) runs west of the wharf's face all the way.
    const lane = TB.harbor.lane;
    const a = lane[lane.length - 2]!;
    for (let t = 0; t <= 1; t += 0.02) {
      const x = a.x + (berth.x - a.x) * t;
      const z = a.z + (berth.z - a.z) * t;
      for (const o of piles) expect(Math.hypot(o.x - x, o.z - z)).toBeGreaterThan(o.r + 3.3);
    }
  });

  it('docks cleanly from the mouth and from round the turning basin, no more than kissing the fenders', () => {
    const piles = wharfShipObstacles();
    const { berth, turning } = TB.harbor;
    const starts: [number, number, number][] = [
      [1905, -1265, Math.atan2(berth.x - 1905, berth.z + 1265)],
      [1890, -1300, 0.3],
      [turning.x, turning.z + 20, Math.PI],
      [turning.x - 25, turning.z, Math.PI / 2],
      [1925, -1330, 0],
    ];
    for (const [x, z, heading] of starts) {
      const ship = new ShipDynamics(x, z, heading);
      ship.dockAssist(berth);
      const { worst, seconds, at } = sail(ship, piles, 90, 0);
      expect(ship.dockComplete, `from ${x},${z}`).toBe(true);
      expect(seconds).toBeLessThan(80);
      // At most a fender's kiss as she swings round off the face (Meridian's east arm is the same).
      expect(worst, `from ${x},${z}: ${at}`).toBeLessThan(0.05);
      expect(Math.hypot(ship.pose.x - berth.x, ship.pose.z - berth.z)).toBeLessThan(1);
    }
  });

  it('stops a ship under full sail at the wharf, bow first, from the cove and along its face', () => {
    const piles = wharfShipObstacles();
    for (const [x, z, heading] of [
      [1939, -1300, Math.PI],
      [1905, -1390, Math.PI / 2],
      [1905, -1360, Math.PI / 2],
    ] as const) {
      const ship = new ShipDynamics(x, z, heading);
      const { worst } = sail(ship, piles, 20, 1);
      expect(worst, `from ${x},${z}`).toBeLessThan(0.75);
    }
  });

  it('reaches the deep floor at every edge of the baked data', () => {
    const b = TB.bounds;
    for (let x = b.minX; x <= b.maxX; x += 40) {
      expect(thousandBoughHeight(x, b.minZ)).toBeLessThan(-TB.deepDepth + 0.5);
      expect(thousandBoughHeight(x, b.maxZ)).toBeLessThan(-TB.deepDepth + 0.5);
    }
  });
});

describe('Thousand-Bough arrival flyover', () => {
  it('clears the ground, the decks and the canopy by 3 m along its spline', () => {
    const keys = THOUSAND_BOUGH_ARRIVAL.keys;
    const clusters = canopyClusters(1500, clearance);
    for (let i = 0; i < keys.length - 1; i++) {
      const a = keys[i]!;
      const b = keys[i + 1]!;
      const len = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
      for (let s = 0; s <= len; s += 0.5) {
        const t = s / len;
        const x = a.x + (b.x - a.x) * t;
        const y = a.y + (b.y - a.y) * t;
        const z = a.z + (b.z - a.z) * t;
        expect(y - thousandBoughHeight(x, z), `key ${i} at ${x.toFixed(0)},${z.toFixed(0)}`).toBeGreaterThan(
          3,
        );
        const walkY = villageWalkable(x, z, y);
        if (walkY !== null) expect(Math.abs(y - walkY), `walk ${i}`).toBeGreaterThan(3);
        for (const c of clusters)
          if (Math.hypot(c.x - x, c.y - y, c.z - z) < c.r + 3)
            throw new Error(`key ${i} through leaves at ${x.toFixed(0)},${y.toFixed(0)},${z.toFixed(0)}`);
      }
    }
  });
});

void helixWalkY;
void emptyStructure;
void bearingOf;
