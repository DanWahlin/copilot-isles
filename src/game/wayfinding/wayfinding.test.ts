import { describe, expect, it } from 'vitest';
import { ISLAND_WAYS } from '../../world/islands/waypoints';
import { SeaChart, cornerWaypoints, type SeaRoute } from './sea-chart';
import { WalkGraph, type WalkRoute } from './walk-graph';

const route = (): WalkRoute => ({ x: 0, y: 0, z: 0, length: 0, node: -1 });

describe('WalkGraph', () => {
  // An L: a quay along x, then a pier north along z; and a stair up to a deck above the quay's end.
  const g = new WalkGraph({
    nodes: [
      { id: 'a', x: 0, y: 0, z: 0 },
      { id: 'b', x: 40, y: 0, z: 0 },
      { id: 'c', x: 40, y: 0, z: -40 },
      { id: 'up', x: 0, y: 10, z: 10 },
    ],
    legs: [
      ['a', 'b'],
      ['b', 'c'],
      ['a', 'up'],
    ],
  });

  it('aims at the corner, not across the water, and measures the way round', () => {
    const r = route();
    expect(g.route(2, 0, 1, 39, 0, -38, r)).toBe(true);
    expect(r.node).toBe(1);
    expect([r.x, r.z]).toEqual([40, 0]);
    expect(r.length).toBeCloseTo(38 + 38 + 1, 0);
  });

  it('goes straight at a near target on the same level', () => {
    const r = route();
    g.route(10, 0, 0, 14, 0, 1, r);
    expect(r.node).toBe(-1);
    expect([r.x, r.z]).toEqual([14, 1]);
  });

  it('a target a level up is reached by the stair, however close it is on the map', () => {
    // Right under the deck, a metre off on the map: to the stair's foot first, and the way up counts.
    const r = route();
    g.route(1, 0, 9, 0, 10, 10, r);
    expect(r.node).toBe(0);
    expect(r.length).toBeGreaterThan(9 + 14);
    // Out along the quay: back along it to the stair.
    const under = route();
    g.route(30, 0, 0, 0, 10, 10, under);
    expect(under.node).toBe(0);
    expect(under.length).toBeGreaterThan(30 + 14);
  });

  it('passes a waypoint you are standing on and aims at the next', () => {
    const r = route();
    g.route(40, 0, -1, 39, 0, -38, r);
    expect(r.node).toBe(-1);
  });

  it('every island’s walking graph is connected, rides included', () => {
    for (const [id, ways] of Object.entries(ISLAND_WAYS)) {
      const w = new WalkGraph(ways.walk);
      const first = ways.walk.nodes[0]!;
      for (const n of ways.walk.nodes) {
        const r = route();
        expect(w.route(first.x, first.y, first.z, n.x, n.y, n.z, r), `${id}: ${n.id}`).toBe(true);
      }
    }
  });

  it('climbs the Great Stair to the crown: the route is the stair, not the straight line', () => {
    const r = route();
    const w = new WalkGraph(ISLAND_WAYS['thousand-bough']!.walk);
    w.route(2010, 18.5, -1545, 2010, 50.5, -1549.5, r);
    expect(r.length).toBeGreaterThan(250);
    expect(r.y).toBeLessThan(25);
  });
});

describe('SeaChart', () => {
  const box = [
    { x: 0, z: 0 },
    { x: 100, z: 0 },
    { x: 100, z: 100 },
    { x: 0, z: 100 },
  ];

  it('pushes a square island’s four corners out to sea', () => {
    const c = cornerWaypoints(box);
    expect(c).toHaveLength(4);
    for (const p of c) expect(p.x < 0 || p.x > 100).toBe(true);
    // Either winding.
    expect(cornerWaypoints([...box].reverse())).toHaveLength(4);
  });

  it('routes round an island instead of over it', () => {
    const chart = new SeaChart([{ coasts: [box], lanes: [] }]);
    const r: SeaRoute = { x: 0, z: 0, length: 0, node: -1 };
    expect(chart.route(-50, 50, 150, 50, r)).toBe(true);
    expect(r.node).toBeGreaterThanOrEqual(0);
    expect(r.length).toBeGreaterThan(200);
    expect(Math.abs(r.z - 50)).toBeGreaterThan(50);
    // In clear water it's straight.
    chart.route(-50, -50, 150, -50, r);
    expect(r.node).toBe(-1);
    const path = chart.path(-50, 50, 150, 50);
    expect(path.at(-1)).toEqual({ x: 150, z: 50 });
    expect(path.length).toBeGreaterThan(2);
  });

  it('every berth is reachable from every other, and no berth or lane is on land', async () => {
    const { ISLANDS } = await import('../islands');
    const chart = new SeaChart(Object.values(ISLAND_WAYS).map((w) => w.sea));
    const berths = Object.values(ISLANDS).map((b) => b.mooring);
    for (const b of berths) expect(chart.inside(b.x, b.z)).toBe(false);
    for (const w of Object.values(ISLAND_WAYS))
      for (const l of w.sea.lanes) expect(chart.inside(l.x, l.z)).toBe(false);
    for (const a of berths)
      for (const b of berths) {
        if (a === b) continue;
        const path = chart.path(a.x, a.z, b.x, b.z);
        let prev = { x: a.x, z: a.z };
        for (const p of path) {
          expect(chart.clear(prev.x, prev.z, p.x, p.z)).toBe(true);
          prev = p;
        }
      }
  });
});
