import { describe, expect, it } from 'vitest';
import { COVE } from '../../layout';
import { coveHeight } from '../../terrain/cove-height';
import { BRIGANTINE_HALF_LENGTH, keelHeightAt } from '../../ship/lines';
import { createWreck } from './wreck';
import { WRECK_BAR_TOP, wreckPlan, wreckShipObstacles, wreckToWorld } from './wreck-pose';

const W = COVE.wreck;
const p = { x: 0, y: 0, z: 0 };

describe('Anchorage wreck', () => {
  it('lies bedded in its sand bar along the whole keel, neither floating nor sunk out of sight', () => {
    for (let z = -BRIGANTINE_HALF_LENGTH + 0.5; z <= BRIGANTINE_HALF_LENGTH; z += 0.5) {
      wreckToWorld(0, keelHeightAt(z), z, p);
      const gap = p.y - coveHeight(p.x, p.z);
      expect(gap, `keel at z ${z}`).toBeLessThan(0.15);
      expect(gap, `keel at z ${z}`).toBeGreaterThan(-1);
    }
  });

  it('shows her hull above the water: the bow up, the stern low, the port side high', () => {
    const bowRail = wreckToWorld(0, 3.2, 12, { x: 0, y: 0, z: 0 }).y;
    const sternDeck = wreckToWorld(0, 3.1, -11, { x: 0, y: 0, z: 0 }).y;
    const portRail = wreckToWorld(3.2, 2.6, 0, { x: 0, y: 0, z: 0 }).y;
    const starboardRail = wreckToWorld(-3.2, 2.6, 0, { x: 0, y: 0, z: 0 }).y;
    expect(bowRail).toBeGreaterThan(sternDeck + 2.5);
    expect(sternDeck).toBeGreaterThan(-0.5);
    expect(portRail).toBeGreaterThan(starboardRail + 1.5);
    expect(starboardRail).toBeGreaterThan(0);
  });

  it('keeps her sand bar under the water (no islet), apart from the knoll', () => {
    const plan = { a: 0, c: 0 };
    const L = COVE.lighthouse;
    for (let x = W.x - 35; x <= W.x + 35; x += 0.75)
      for (let z = W.z - 35; z <= W.z + 35; z += 0.75) {
        if (Math.hypot(x - L.x, z - L.z) < L.radius + 18) continue;
        wreckPlan(x, z, plan);
        if (Math.abs(plan.a) > 26 || Math.abs(plan.c) > 22) continue;
        expect(coveHeight(x, z), `${x}, ${z}`).toBeLessThan(WRECK_BAR_TOP + 0.33);
      }
  });

  it("can't be reached on foot from the lighthouse knoll (wading stops at 1.05 m)", () => {
    const x0 = W.x - 45,
      z0 = W.z - 45,
      step = 0.75,
      n = Math.round(90 / step);
    const seen = new Uint8Array(n * n);
    const stack: number[] = [];
    const si = Math.round((COVE.lighthouse.x - x0) / step),
      sj = Math.round((COVE.lighthouse.z - z0) / step);
    seen[sj * n + si] = 1;
    stack.push(si, sj);
    let nearest = Infinity;
    while (stack.length) {
      const j = stack.pop()!,
        i = stack.pop()!;
      const x = x0 + i * step,
        z = z0 + j * step;
      for (const o of wreckShipObstacles()) nearest = Math.min(nearest, Math.hypot(x - o.x, z - o.z) - o.r);
      for (const [di, dj] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const a = i + di,
          b = j + dj;
        if (a < 0 || b < 0 || a >= n || b >= n || seen[b * n + a]) continue;
        if (coveHeight(x0 + a * step, z0 + b * step) <= -1.05) continue;
        seen[b * n + a] = 1;
        stack.push(a, b);
      }
    }
    expect(nearest).toBeGreaterThan(2);
  });

  it("keeps clear of the ship's berth and way out, the crane's sloops and the fishing boat", () => {
    const obstacles = wreckShipObstacles();
    for (const o of obstacles) {
      // The brigantine leaves her berth bow-north up the east side of the basin.
      expect(o.x + o.r, 'departure lane').toBeLessThan(COVE.mooring.x - 18);
      for (const s of COVE.crane.sloops) expect(Math.hypot(o.x - s.x, o.z - s.z) - o.r).toBeGreaterThan(15);
      expect(Math.hypot(o.x - COVE.lighthouse.x, o.z - COVE.lighthouse.z)).toBeGreaterThan(14);
    }
    // Her hull, her bowsprit and her masts' overhang all have one.
    expect(obstacles.length).toBeGreaterThanOrEqual(8);
  });

  it('is one cheap mesh with the ship material, and nothing on her lights up at night', () => {
    const lite = createWreck('lite');
    const high = createWreck('high');
    expect(lite.triangleCount).toBeLessThan(6000);
    expect(high.triangleCount).toBeLessThan(60000);
    // Timber and ironwork draw from her atlas (region 7); ropes, the holes' backing (iron, 4) and
    // rags (canvas, 5) keep theirs. No region 6 (the lanterns' night glow).
    const regions = high.mesh.geometry.getAttribute('shipRegion');
    for (let i = 0; i < regions.count; i++) expect([4, 5, 7]).toContain(regions.getX(i));
    expect(lite.cameraBlockers.length).toBeGreaterThan(0);
    expect(lite.perches.length).toBe(3);
    lite.dispose();
    high.dispose();
  });
});
