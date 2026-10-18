import { describe, expect, it } from 'vitest';
import type { HeightField } from '../contracts';
import type { VegetationMasks } from '../vegetation/types';
import { ISLAND_FLORA_PALETTES } from '../islands/flora-palettes';
import { ANCHORAGE_FLORA } from '../islands/anchorage/flora';
import { MERIDIAN_FLORA } from '../islands/meridian-flora';
import { THOUSAND_BOUGH_FLORA } from '../islands/thousand-bough/flora';
import { THOUSAND_BOUGH as TB } from '../islands/thousand-bough/layout';
import { DRIFT, DRIFT_BINS, driftAt, driftLead, driftLeads, pickSpecies, type DriftSample } from './drift';
import { Object3D, Scene } from 'three/webgpu';
import {
  FLORA_PUSHERS,
  FLORA_SPECIES_MAX,
  floraPushers,
  floraSpeciesIndex,
  updateFloraPushers,
} from './nodes';
import { floraFeet } from './feet';
import { createFlowerGeometry } from './heads';
import { floraDriftRows } from './ground-nodes';
import { scatterFlora, type FloraCell } from './scatter';
import type { FloraPalette, FloraRules, FloraSpot, HeadForm } from './types';

/** A gentle grassy hill with a sandy strip along its south and a rocky patch to the east. */
class TestField implements HeightField {
  heightAt(x: number, z: number): number {
    if (z > 60) return 1.2;
    return 6 + 8 * Math.exp(-(x * x + z * z) / 9000);
  }

  normalAt(_x: number, _z: number, out: Float32Array | number[]): Float32Array | number[] {
    out[0] = 0;
    out[1] = 1;
    out[2] = 0;
    return out;
  }

  masksAt(x: number, z: number): VegetationMasks {
    const sand = z > 50 ? 1 : 0;
    return { sand, grass: sand ? 0.2 : 0.9, rock: x > 70 ? 0.8 : 0, cliff: 0 };
  }
}

/** Plain rules over the test field: meadow everywhere on grass, nothing on rock. */
function testRules(palette: FloraPalette): FloraRules {
  return {
    palette,
    bounds: { minX: -96, maxX: 96, minZ: -96, maxZ: 40 },
    flowersPerCell: 80,
    bladeDensity: 1,
    habitatAt(_x, _z, _y, masks, _field, out) {
      if (masks.rock > 0.5) return null;
      out.habitat = 'meadow';
      out.weight = masks.grass;
      out.kind = 'meadow';
      out.ramp = 0.45;
      return out;
    },
  };
}

function scatter(
  rules: FloraRules,
  opts: { blades?: number; flowers?: number; seed?: number } = {},
): FloraCell[] {
  const cells: FloraCell[] = [];
  const steps = scatterFlora(
    {
      rules,
      heightField: new TestField(),
      seed: opts.seed ?? 42,
      bladeDensity: opts.blades ?? 1,
      flowerDensity: opts.flowers ?? 1,
    },
    cells,
  );
  while (!steps.next().done);
  return cells;
}

/** FNV-1a over the scatter, rounded to a millimetre and a few decimals of colour. */
function fingerprint(cells: readonly FloraCell[]): string {
  let h = 0x811c9dc5;
  const mix = (v: number) => {
    h ^= Math.round(v * 1000) | 0;
    h = Math.imul(h, 0x01000193) >>> 0;
  };
  for (const c of cells)
    for (const list of [c.blades, c.flowers, c.seeds])
      for (const k of list) {
        mix(k.x);
        mix(k.z);
        mix(k.scale);
        mix(k.rotation);
        mix(k.r + k.g * 3 + k.b * 7);
        mix(k.stem ?? 0);
        mix(k.species ? floraSpeciesIndex(k.species) : -1);
      }
  return h.toString(16);
}

describe('flora drifts', () => {
  it('are deterministic, 0-1, and none without coverage', () => {
    const a: DriftSample = { strength: 0, lead: 0 };
    const b: DriftSample = { strength: 0, lead: 0 };
    for (let i = 0; i < 400; i++) {
      const x = (i * 37.3) % 500;
      const z = (i * 91.7) % 500;
      driftAt(x, z, 3.1, 0.4, a);
      driftAt(x, z, 3.1, 0.4, b);
      expect(a).toEqual(b);
      expect(a.strength).toBeGreaterThanOrEqual(0);
      expect(a.strength).toBeLessThanOrEqual(1);
      expect(a.lead).toBeGreaterThanOrEqual(0);
      expect(a.lead).toBeLessThan(1);
      expect(driftAt(x, z, 3.1, 0, b).strength).toBe(0);
    }
  });

  it('cover about their share of the cells, each with one lead', () => {
    const s: DriftSample = { strength: 0, lead: 0 };
    let held = 0;
    let cells = 0;
    for (let cx = 0; cx < 40; cx++)
      for (let cz = 0; cz < 40; cz++) {
        cells++;
        // The middle of cell (cx, cz): undo the warp at the point we sample.
        let x = (cx + 0.5) * DRIFT.cell;
        let z = (cz + 0.5) * DRIFT.cell;
        for (let k = 0; k < 6; k++) {
          const wx = DRIFT.warp * Math.sin(z * DRIFT.warpFreq + 1.3);
          const wz = DRIFT.warp * Math.sin(x * DRIFT.warpFreq + 4.1);
          x = (cx + 0.5) * DRIFT.cell - wx;
          z = (cz + 0.5) * DRIFT.cell - wz;
        }
        if (driftAt(x, z, 7.7, 0.45, s).strength > 0.9) held++;
      }
    expect(held / cells).toBeGreaterThan(0.33);
    expect(held / cells).toBeLessThan(0.57);
    // Two points in the same drift's heart share its lead.
    const a = driftAt(9, 9, 7.7, 1, { strength: 0, lead: 0 }).lead;
    const b = driftAt(9.4, 8.6, 7.7, 1, { strength: 0, lead: 0 }).lead;
    expect(a).toBe(b);
  });

  it('pick species by weight', () => {
    const list = [
      { id: 'a', weight: 3 },
      { id: 'b', weight: 1 },
    ];
    let a = 0;
    for (let i = 0; i < 1000; i++) if (pickSpecies(list, (i + 0.5) / 1000).id === 'a') a++;
    expect(a).toBe(750);
    expect(pickSpecies(list, 0.9999).id).toBe('b');
  });

  it('are led by the blooms and spikes of open ground, unless a species says', () => {
    for (const palette of ISLAND_FLORA_PALETTES) {
      const leads = driftLeads(palette);
      expect(leads.length, palette.id).toBeGreaterThan(0);
      for (const s of leads) {
        if (s.drifts !== undefined) continue;
        expect(['bloom', 'spike']).toContain(s.form);
        expect(s.habitats.some((h) => h === 'meadow' || h === 'forest')).toBe(true);
      }
    }
    const tb = driftLeads(ISLAND_FLORA_PALETTES.find((p) => p.id === 'thousand-bough')!).map((s) => s.id);
    expect(tb).toEqual(['orchid']);
    const meridian = driftLeads(ISLAND_FLORA_PALETTES.find((p) => p.id === 'meridian')!).map((s) => s.id);
    expect(meridian).not.toContain('rosemary');
  });
});

describe('flora palettes', () => {
  it('are well formed and fit the shared species table', () => {
    let rows = 0;
    const ids = new Set<string>();
    for (const p of ISLAND_FLORA_PALETTES) {
      expect(ids.has(p.id)).toBe(false);
      ids.add(p.id);
      expect(p.grass.ramp).toHaveLength(4);
      expect(p.bounds.minX).toBeLessThan(p.bounds.maxX);
      expect(p.bounds.minZ).toBeLessThan(p.bounds.maxZ);
      const species = new Set<string>();
      for (const s of p.species) {
        expect(species.has(s.id), `${p.id}/${s.id}`).toBe(false);
        species.add(s.id);
        expect(s.habitats.length).toBeGreaterThan(0);
        expect(s.size[0]).toBeLessThanOrEqual(s.size[1]);
        expect(s.stem[0]).toBeLessThanOrEqual(s.stem[1]);
        expect(s.weight).toBeGreaterThan(0);
        for (const c of [...s.colours, s.eye]) expect(c).toBeGreaterThanOrEqual(0);
        expect(floraSpeciesIndex(s)).toBe(rows++);
      }
    }
    expect(rows).toBeLessThanOrEqual(FLORA_SPECIES_MAX);
  });

  it("don't overlap (the terrain picks an island's palette by its rectangle)", () => {
    const list = ISLAND_FLORA_PALETTES;
    for (let i = 0; i < list.length; i++)
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i]!.bounds;
        const b = list[j]!.bounds;
        const apart =
          a.maxX + 60 < b.minX || b.maxX + 60 < a.minX || a.maxZ + 60 < b.minZ || b.maxZ + 60 < a.minZ;
        expect(apart, `${list[i]!.id} / ${list[j]!.id}`).toBe(true);
      }
  });

  it("hold each island's rules' bounds", () => {
    for (const rules of [ANCHORAGE_FLORA, MERIDIAN_FLORA, THOUSAND_BOUGH_FLORA]) {
      const p = rules.palette.bounds;
      const b = rules.bounds;
      expect(b.minX).toBeGreaterThanOrEqual(p.minX);
      expect(b.maxX).toBeLessThanOrEqual(p.maxX);
      expect(b.minZ).toBeGreaterThanOrEqual(p.minZ);
      expect(b.maxZ).toBeLessThanOrEqual(p.maxZ);
    }
  });
});

describe('flora habitats', () => {
  const field = new TestField();
  const spot = (): FloraSpot => ({ habitat: 'meadow', weight: 0, kind: 'meadow', ramp: 0 });
  const grass: VegetationMasks = { sand: 0, grass: 0.9, rock: 0, cliff: 0 };
  const sand: VegetationMasks = { sand: 1, grass: 0.1, rock: 0, cliff: 0 };

  it('Anchorage: meadows on the hill, sea oats on the dunes, nothing in the sea or on cliffs', () => {
    expect(ANCHORAGE_FLORA.habitatAt(-40, 20, 12, grass, field, spot())?.habitat).toBe('meadow');
    const dune = ANCHORAGE_FLORA.habitatAt(-20, 80, 2.2, sand, field, spot());
    expect(dune?.habitat).toBe('dune');
    expect(dune?.kind).toBe('seaOats');
    expect(ANCHORAGE_FLORA.habitatAt(-20, 120, 0.1, sand, field, spot())).toBeNull();
    expect(ANCHORAGE_FLORA.habitatAt(-40, 20, 12, { ...grass, cliff: 1 }, field, spot())).toBeNull();
  });

  it('Meridian: hedges round the walls, meadow on the hills, nothing in the town', () => {
    expect(MERIDIAN_FLORA.habitatAt(700, -860, 15, grass, field, spot())).toBeNull();
    expect(MERIDIAN_FLORA.habitatAt(860, -900, 30, grass, field, spot())?.habitat).toBe('village');
    expect(MERIDIAN_FLORA.habitatAt(940, -900, 30, grass, field, spot())?.habitat).toBe('meadow');
  });

  it('Thousand-Bough: spray by the falls, banks by the water, forest floor, never on the paths', () => {
    // Round each fall's foot: spray close in, never far off.
    let sprayed = 0;
    for (const f of TB.water.falls)
      for (let r = 6; r <= 40; r += 2)
        for (let k = 0; k < 16; k++) {
          const a = (k / 16) * Math.PI * 2;
          const at = THOUSAND_BOUGH_FLORA.habitatAt(
            f.foot.x + Math.cos(a) * r,
            f.foot.z + Math.sin(a) * r,
            20,
            grass,
            field,
            spot(),
          );
          if (at?.habitat !== 'spray') continue;
          sprayed++;
          expect(r).toBeLessThan(25);
        }
    expect(sprayed).toBeGreaterThan(10);
    expect(THOUSAND_BOUGH_FLORA.habitatAt(2080, -1500, 12, grass, field, spot())?.habitat).toBe('forest');
    const walk = TB.fernWalk.points[1]!;
    expect(THOUSAND_BOUGH_FLORA.habitatAt(walk.x, walk.z, 5, grass, field, spot())).toBeNull();
  });
});

describe('flora scatter', () => {
  const anchorage = ISLAND_FLORA_PALETTES[0]!;

  it('is deterministic for the same rules, seed and densities (fingerprint)', () => {
    const a = scatter(testRules(anchorage));
    const b = scatter(testRules(anchorage));
    expect(fingerprint(a)).toBe(fingerprint(b));
    expect(fingerprint(scatter(testRules(anchorage), { seed: 43 }))).not.toBe(fingerprint(a));
    // Pinned: a change here moved the scatter; update it only for a deliberate change.
    expect(fingerprint(a)).toMatchInlineSnapshot(`"b9dfd2f8"`);
  });

  it('keeps off ground the rules refuse, and every flower in its own habitats', () => {
    const cells = scatter(testRules(anchorage));
    let blades = 0;
    let flowers = 0;
    for (const c of cells) {
      for (const k of [...c.blades, ...c.flowers, ...c.seeds]) expect(k.x).toBeLessThanOrEqual(74);
      blades += c.blades.length;
      flowers += c.flowers.length;
      for (const f of c.flowers) expect(f.species!.habitats).toContain('meadow');
    }
    expect(blades).toBeGreaterThan(1000);
    expect(flowers).toBeGreaterThan(200);
  });

  it('thins with the tier: no flowers or blades at density 0', () => {
    const none = scatter(testRules(anchorage), { flowers: 0 });
    expect(none.every((c) => c.flowers.length === 0)).toBe(true);
    const bare = scatter(testRules(anchorage), { blades: 0 });
    expect(bare.every((c) => c.blades.length === 0)).toBe(true);
    const half = scatter(testRules(anchorage), { flowers: 0.5 });
    const full = scatter(testRules(anchorage));
    const count = (cells: FloraCell[]) => cells.reduce((n, c) => n + c.flowers.length, 0);
    expect(count(half)).toBeLessThan(count(full) * 0.65);
  });

  it('crowds flowers into drifts, led by one species', () => {
    const cells = scatter(testRules(anchorage));
    const s: DriftSample = { strength: 0, lead: 0 };
    let inHeart = 0;
    let heartLed = 0;
    let outside = 0;
    for (const c of cells)
      for (const f of c.flowers) {
        driftAt(f.x, f.z, anchorage.drifts.seed, anchorage.drifts.coverage, s);
        if (s.strength > 0.6) {
          inHeart++;
          if (f.species === driftLead(driftLeads(anchorage), s.lead)) heartLed++;
        } else if (s.strength === 0) outside++;
      }
    expect(inHeart).toBeGreaterThan(outside * 0.5);
    expect(heartLed / inHeart).toBeGreaterThan(anchorage.drifts.leadShare * 0.8);
  });
});

describe('terrain drift colours', () => {
  it('fill every island row, and never read as white litter far off', () => {
    const rows = floraDriftRows();
    expect(rows).toHaveLength(ISLAND_FLORA_PALETTES.length * DRIFT_BINS);
    for (const r of rows) {
      expect(r.w).toBe(1);
      // Linear luma: frangipani's cream is dimmed toward its eye, so no row is near white.
      expect(r.x * 0.2126 + r.y * 0.7152 + r.z * 0.0722).toBeLessThan(0.62);
    }
  });
});

describe('flower plant geometries', () => {
  it('carry the grass attributes, heads up top, within budget', () => {
    for (const form of ['bloom', 'spike', 'cap', 'frond'] as HeadForm[]) {
      const g = createFlowerGeometry(form);
      const n = g.getAttribute('position').count;
      for (const name of ['normal', 'uv', 'vegPart', 'shade'])
        expect(g.getAttribute(name).count, name).toBe(n);
      expect(n % 3).toBe(0);
      expect(n / 3, form).toBeLessThanOrEqual(100);
      const part = g.getAttribute('vegPart');
      const pos = g.getAttribute('position');
      let top = 0;
      for (let i = 0; i < n; i++) {
        expect([3, 5]).toContain(part.getX(i));
        expect(pos.getY(i)).toBeGreaterThanOrEqual(-0.2);
        top = Math.max(top, pos.getY(i));
      }
      expect(top).toBeGreaterThan(0.9);
      expect(top).toBeLessThan(1.3);
      g.dispose();
    }
  });
});

describe('flora pushers', () => {
  it("follow the shown characters' feet nearest the camera", () => {
    const scene = new Scene();
    const feet = [3, 1, 40, 2, 5].map((x) => {
      const o = new Object3D();
      o.position.set(x, 0, 0);
      scene.add(o);
      floraFeet.add(o);
      return o;
    });
    feet[3]!.visible = false;
    const loose = new Object3D();
    floraFeet.add(loose);
    scene.updateMatrixWorld();
    updateFloraPushers(0, 0);
    expect(FLORA_PUSHERS).toBe(3);
    expect(floraPushers.map((p) => [p.value.x, p.value.w])).toEqual([
      [1, 1],
      [3, 1],
      [5, 1],
    ]);
    for (const o of feet) floraFeet.delete(o);
    floraFeet.delete(loose);
    updateFloraPushers(0, 0);
    expect(floraPushers.every((p) => p.value.w === 0)).toBe(true);
  });
});
