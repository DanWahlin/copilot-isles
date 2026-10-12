import { describe, expect, it } from 'vitest';
import { TIERS } from './quality';
import { oceanGrid } from '../world/ocean/ocean';
import { createPolarGrid } from '../world/ocean/polar-grid';

function oceanTriangles(tier: keyof typeof TIERS): number {
  const g = createPolarGrid(oceanGrid(TIERS[tier]));
  return g.index!.count / 3;
}

describe('tier settings (PLAN §12.1 budget cuts)', () => {
  it('culls small detail by size on Lite and Low only, Lite sooner', () => {
    expect(TIERS.lite.detailCullRatio).toBeGreaterThan(0);
    expect(TIERS.low.detailCullRatio).toBeGreaterThan(TIERS.lite.detailCullRatio);
    for (const tier of ['medium', 'high', 'ultra'] as const) expect(TIERS[tier].detailCullRatio).toBe(0);
  });

  it('hands trees to impostors soonest on Lite (impostor-heavy)', () => {
    expect(TIERS.lite.treeNear).toBeLessThan(TIERS.low.treeNear);
    expect(TIERS.low.treeNear).toBeLessThan(TIERS.medium.treeNear);
  });

  it("gives Lite the coarsest ocean grid and keeps the others' as they were", () => {
    expect(oceanTriangles('lite')).toBeLessThan(30_000);
    expect(oceanTriangles('lite')).toBeLessThan(oceanTriangles('low'));
    expect(oceanGrid(TIERS.low)).toEqual({ dr0: 0.7, growth: 1.05, radius: 18000, segments: 192 });
    expect(oceanGrid(TIERS.medium)).toEqual({ dr0: 0.5, growth: 1.035, radius: 18000, segments: 288 });
    expect(oceanGrid(TIERS.high)).toEqual({ dr0: 0.35, growth: 1.035, radius: 18000, segments: 384 });
  });
});
