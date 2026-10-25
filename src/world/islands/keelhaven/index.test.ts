import { describe, expect, it } from 'vitest';
import { ISLAND_FLORA_PALETTES } from '../flora-palettes';
import { KEELHAVEN_FLORA_PALETTE } from './flora-palette';
import { keelhavenHeight, keelhavenHeightDry, keelhavenNormal, keelhavenWater } from './height';
import { KEELHAVEN as K, toFrame, toWorld } from './layout';
import { keelhavenMistCards } from './mist';
import { keelhavenPlants } from './vegetation';
import { seaFallCurtain } from './water-mesh';
import { onHouse, STREET_HALF, streetDistance } from './town';
import { inWorks } from './works';

const water = keelhavenWater();
const [ribbon, river, ...seaFalls] = water.streams;

describe("Keelhaven's fresh water", () => {
  it('drops Ribbon Falls down the head wall into the Falls Pool', () => {
    const s = ribbon!;
    expect(s.spec.to).toBe('fallsPool');
    expect(s.surface[0]! - s.surface[s.count - 1]!).toBeGreaterThan(80);
  });

  it('runs the Keel River from the Falls Pool down the valley to the sea, never rising', () => {
    const s = river!;
    expect(s.spec.from).toBe('fallsPool');
    expect(s.spec.to).toBe('sea');
    for (let i = 1; i < s.count; i++) expect(s.surface[i]!).toBeLessThanOrEqual(s.surface[i - 1]! + 1e-9);
    // It reaches the beach (the cove frame's origin) at about sea level.
    const f = { u: 0, v: 0 };
    toFrame(s.x[s.count - 1]!, s.z[s.count - 1]!, f);
    expect(f.u).toBeLessThan(0);
    expect(s.surface[s.count - 1]!).toBeLessThan(1);
  });

  it('crosses the middle of the town shelf (the town and the shipyard keep either side of it)', () => {
    const s = river!;
    const f = { u: 0, v: 0 };
    const shelf = K.townShelf;
    for (let i = 0; i < s.count; i++) {
      toFrame(s.x[i]!, s.z[i]!, f);
      if (f.u > shelf.u0 && f.u < shelf.u1) expect(Math.abs(f.v)).toBeLessThan(10);
    }
  });

  it('carves each channel into the ground (the water lies in its bed)', () => {
    for (const s of water.streams)
      for (let i = 0; i < s.count; i += 4) {
        const ground = keelhavenHeight(s.x[i]!, s.z[i]!);
        expect(ground, `${s.spec.from} at ${i}`).toBeLessThan(s.surface[i]! + 0.05);
      }
  });

  it('hangs each sea fall clear of its cliff, from its lip into the sea', () => {
    expect(seaFalls.length).toBe(K.water.seaFalls.length);
    K.water.seaFalls.forEach((spec, i) => {
      const s = seaFalls[i]!;
      if (!spec.curtain) {
        expect(s.surface[s.count - 1]!).toBeLessThan(1);
        return;
      }
      const c = seaFallCurtain(s);
      expect(c.y, spec.name).toBeGreaterThan(15);
      for (let k = 1; k <= 20; k++) {
        const d = (c.y * k) / 20;
        const out = c.reach * Math.sqrt(d);
        const ground = keelhavenHeight(c.x + c.ox * out, c.z + c.oz * out);
        expect(ground, `${spec.name} at ${d.toFixed(0)} m down`).toBeLessThan(c.y - d - 1);
      }
    });
  });

  it('leaves the uncarved ground alone away from the water', () => {
    const p = toWorld(100, 160);
    expect(keelhavenHeight(p.x, p.z)).toBe(keelhavenHeightDry(p.x, p.z));
  });
});

describe("Keelhaven's plants", () => {
  const plants = keelhavenPlants('lite');
  const normal = [0, 1, 0];

  it('plants a forest, palms by the sea and an understory', () => {
    const count = (species: string) => plants.filter((p) => p.species === species).length;
    expect(count('broadleafTree')).toBeGreaterThan(80);
    expect(count('palmTall') + count('palmYoung')).toBeGreaterThan(30);
    expect(count('fern') + count('shrub')).toBeGreaterThan(300);
  });

  it('keeps every plant off the sheer walls, the water, the works, the houses and the street', () => {
    const f = { u: 0, v: 0 };
    for (const p of plants) {
      keelhavenNormal(p.x, p.z, normal);
      expect((Math.acos(normal[1]!) * 180) / Math.PI).toBeLessThan(52);
      expect(water.shoreDistance(p.x, p.z, 4)).toBeGreaterThan(0.5);
      toFrame(p.x, p.z, f);
      const where = `${p.species} at ${f.u.toFixed(0)}, ${f.v.toFixed(0)}`;
      expect(inWorks(f.u, f.v), where).toBe(false);
      expect(onHouse(f.u, f.v, 1), where).toBe(false);
      expect(streetDistance(f.u, f.v), where).toBeGreaterThan(STREET_HALF);
    }
  });

  it('leaves the town flat open but for its own trees (a few, placed by hand)', () => {
    const f = { u: 0, v: 0 };
    const shelf = K.townShelf;
    const onFlat = plants.filter((p) => {
      toFrame(p.x, p.z, f);
      return f.u > shelf.u0 && f.u < shelf.u1 && f.v > 6 && f.v < shelf.halfWidth;
    });
    expect(onFlat.length).toBeLessThan(12);
  });

  it('stands no tree high on a crest (the skyline is ridge, not trees)', () => {
    for (const p of plants)
      if (p.species === 'broadleafTree' || p.species.startsWith('palm')) expect(p.y).toBeLessThan(108);
  });

  it('spreads the trees over a wide range of sizes and tones', () => {
    const trees = plants.filter((p) => p.species === 'broadleafTree');
    const scales = trees.map((p) => p.scale);
    expect(Math.max(...scales) / Math.min(...scales)).toBeGreaterThan(1.6);
    const tones = trees.map((p) => p.colorSeed);
    expect(Math.max(...tones) - Math.min(...tones)).toBeGreaterThan(0.5);
  });
});

describe("Keelhaven's flora and mist", () => {
  it('registers its palette with the shared species table', () => {
    expect(ISLAND_FLORA_PALETTES).toContain(KEELHAVEN_FLORA_PALETTE);
    const ids = ISLAND_FLORA_PALETTES.flatMap((p) => p.species.map((s) => s.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('draws no mist cards on Lite and Low, and keeps each card clear of the ground', () => {
    expect(keelhavenMistCards(0)).toEqual([]);
    const cards = keelhavenMistCards(16);
    expect(cards.length).toBeGreaterThan(6);
    for (const c of cards) expect(c.y - keelhavenHeight(c.x, c.z)).toBeGreaterThan(3);
  });
});
