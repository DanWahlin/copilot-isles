import { describe, expect, it } from 'vitest';
import { makeBuckets } from '../../village/pieces';
import type { VillageKit } from '../../village/kit';
import { keelhavenHeight, keelhavenTerrainWater } from './height';
import { toWorld } from './layout';
import { buildShipyard } from './shipyard';
import { BERTH, CHAMBERS, PADS, QUAY, inWorks } from './works';

const groundAt = (u: number, v: number) => {
  const p = toWorld(u, v);
  return keelhavenHeight(p.x, p.z);
};

describe("Keelhaven's harbour works", () => {
  it('levels the yard and the lock terrace to their pads', () => {
    for (const p of Object.values(PADS))
      for (let u = p.u0 + 3; u <= p.u1 - 3; u += 7)
        for (let v = p.v0 + 3; v <= p.v1 - 3; v += 7) {
          if (CHAMBERS.some((c) => u > c.u0 - 3 && u < c.u1 + 3 && v > c.v0 - 3 && v < c.v1 + 3)) continue;
          // Where the two pads meet, the lower eases up to the upper (the towpath's steps).
          const near = (o: typeof p) =>
            u > o.u0 - o.blend && u < o.u1 + o.blend && v > o.v0 - o.blend && v < o.v1 + o.blend;
          if (Object.values(PADS).some((o) => o !== p && o.y > p.y && near(o))) continue;
          expect(Math.abs(groundAt(u, v) - p.y), `${u}, ${v}`).toBeLessThan(0.05);
        }
  });

  it('cuts each chamber down to its floor, under its water', () => {
    for (const c of CHAMBERS) {
      const u = (c.u0 + c.u1) / 2;
      const v = (c.v0 + c.v1) / 2;
      expect(groundAt(u, v), c.name).toBeLessThanOrEqual(c.floor + 0.01);
      if (c.water !== null) expect(c.water, c.name).toBeGreaterThan(c.floor + 1);
      expect(c.top, c.name).toBeGreaterThan(c.water ?? c.floor);
    }
  });

  it('steps the lock flight down toward the sea', () => {
    const flight = ['basin', 'lock1', 'pound', 'lock2'].map((n) => CHAMBERS.find((c) => c.name === n)!);
    for (let i = 1; i < flight.length; i++) expect(flight[i]!.water!).toBeLessThan(flight[i - 1]!.water!);
  });

  it('keeps the coarse terrain levels under the works water', () => {
    const w = keelhavenTerrainWater();
    const basin = CHAMBERS.find((c) => c.name === 'basin')!;
    const p = toWorld((basin.u0 + basin.u1) / 2, (basin.v0 + basin.v1) / 2);
    expect(w.levelAt(p.x, p.z)).toBe(basin.water);
  });

  it('berths the ship in deep water along the quay', () => {
    expect(QUAY.top).toBeGreaterThan(2);
    for (const du of [-12, 0, 12]) expect(groundAt(BERTH.u + du, BERTH.v)).toBeLessThan(-4);
  });

  it('builds without a kit, and keeps every fence and ship circle in the works', () => {
    const kit = { pieces: new Map(), materials: {}, dispose() {} } as unknown as VillageKit;
    const steps = buildShipyard(makeBuckets(), kit, false);
    let r = steps.next();
    while (!r.done) r = steps.next();
    const out = r.value;
    expect(out.colliders.length).toBeGreaterThan(20);
    expect(out.shipObstacles.length).toBeGreaterThan(10);
    expect(Number.isFinite(out.dockHull.y)).toBe(true);
    expect(inWorks(BERTH.u, BERTH.v)).toBe(false);
  });
});
