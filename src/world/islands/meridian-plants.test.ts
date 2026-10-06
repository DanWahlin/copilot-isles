import { describe, expect, it } from 'vitest';
import { buildMaquisBush, buildPricklyPear } from '../vegetation/cactus';
import { meridianHeight } from './meridian';
import { meridianPlantExcluded, meridianPlants } from './meridian-plants';

describe('Port Meridian planting', () => {
  const high = meridianPlants('high');

  it('is seeded: the island and the chart plant the same spots', () => {
    const again = meridianPlants('high');
    expect(again.length).toBe(high.length);
    expect(again[17]).toEqual(high[17]);
  });

  it('plants fewer on the lower tiers (PLAN §12.1)', () => {
    const lite = meridianPlants('lite').length;
    const low = meridianPlants('low').length;
    const medium = meridianPlants('medium').length;
    expect(lite).toBeLessThan(low);
    expect(low).toBeLessThan(medium);
    expect(medium).toBeLessThan(high.length);
    expect(high.length).toBeLessThan(1400);
  });

  it('keeps the town, harbour works and sea clear', () => {
    for (const p of high) {
      expect(meridianPlantExcluded(p.x, p.z)).toBe(false);
      expect(meridianHeight(p.x, p.z)).toBeGreaterThan(2.4);
    }
  });

  it('grows palms, groves, brush and prickly pear, with red shrubs only as rare accents', () => {
    const count = (species: string) => high.filter((p) => p.species === species).length;
    expect(count('palmTall')).toBeGreaterThan(50);
    expect(count('broadleafTree')).toBeGreaterThan(50);
    expect(count('brush')).toBeGreaterThan(100);
    expect(count('cactus')).toBeGreaterThan(30);
    expect(count('shrub') + count('flowerBush')).toBeLessThan(high.length * 0.03);
  });

  it('builds the procedural plants with leaf tags and colours', () => {
    for (const g of [buildPricklyPear(), buildMaquisBush()]) {
      const n = g.getAttribute('position').count;
      expect(n).toBeGreaterThan(100);
      expect(g.getAttribute('color').count).toBe(n);
      expect(g.getAttribute('_part').count).toBe(n);
      expect(g.getAttribute('uv').count).toBe(n);
      g.dispose();
    }
  });
});
