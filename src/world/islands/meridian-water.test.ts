import { describe, expect, it } from 'vitest';
import { meridianHeight, meridianWater } from './meridian';
import { meridianPlants } from './meridian-plants';

describe('Port Meridian fresh water', () => {
  const water = meridianWater();

  it('fills the tarn high on the ridge, the plunge pool below it, and the lake on the east slopes', () => {
    const { tarn, pool, lake } = water.basins;
    expect(tarn.level).toBeGreaterThan(120);
    expect(pool.level).toBeLessThan(tarn.level - 80);
    expect(lake.level).toBeLessThan(pool.level);
    for (const b of [tarn, pool, lake]) {
      expect(water.levelAt(b.x, b.z)).toBe(b.level);
      // The bed lies under the water, deepest in the middle.
      expect(meridianHeight(b.x, b.z)).toBeLessThan(b.level - 0.4);
    }
  });

  it('runs every stream downhill, with a tall waterfall off the ridge', () => {
    for (const s of water.streams) {
      for (let i = 1; i < s.count; i++) expect(s.surface[i]!).toBeLessThanOrEqual(s.surface[i - 1]! + 1e-9);
    }
    const cascade = water.streams[0]!;
    expect(cascade.surface[0]! - cascade.surface[cascade.count - 1]!).toBeGreaterThan(80);
    const outflow = water.streams[water.streams.length - 1]!;
    expect(outflow.surface[outflow.count - 1]!).toBeLessThan(0.5);
  });

  it('keeps the stream beds under their water', () => {
    for (const s of water.streams) {
      for (let i = 0; i < s.count; i += 3) {
        expect(meridianHeight(s.x[i]!, s.z[i]!)).toBeLessThan(s.surface[i]! + 0.05);
      }
    }
  });

  it('leaves the town, harbour and sea alone', () => {
    expect(water.levelAt(668, -796)).toBeNull();
    expect(water.levelAt(747, -700)).toBeNull();
    expect(water.shoreDistance(700, -850, 40)).toBe(40);
  });

  it('keeps plants out of the water', () => {
    for (const p of meridianPlants('high')) expect(water.shoreDistance(p.x, p.z, 3)).toBeGreaterThan(2);
  });
});
