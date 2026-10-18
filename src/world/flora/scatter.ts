import { Color } from 'three/webgpu';
import type { HeightField } from '../contracts';
import type { GrassKind } from '../vegetation/types';
import { EXCLUSION_SOFT_MARGIN, exclusionWeight, type VegetationExclude } from '../vegetation/exclusions';
import { SeededRandom, hash2, valueNoise } from '../vegetation/random';
import { driftAt, driftLead, driftLeads, pickSpecies, type DriftSample } from './drift';
import {
  DRIFT_HABITATS,
  FLORA_HABITATS,
  type FloraHabitat,
  type FloraRules,
  type FloraSpecies,
  type FloraSpot,
} from './types';

/** The scatter's cell (m): each holds its tussocks, flowers and seed heads, culled together. */
export const FLORA_CELL = 8;

/** One tussock, flower plant or seed head. Colours are linear rgb. */
export interface FloraClump {
  x: number;
  z: number;
  scale: number;
  rotation: number;
  kind: GrassKind;
  r: number;
  g: number;
  b: number;
  /** 0-1: how far it is inside the island's exclusions' soft edge (it shrinks toward them). */
  edgeWeight: number;
  /** Its thinning rank (0-1): far off, the grass keeps the clumps under the tier's keep share. */
  lod: number;
  /** A flower plant: its species and its stem height (m); `scale` is its head radius (m). */
  species?: FloraSpecies;
  stem?: number;
}

export interface FloraCell {
  x: number;
  z: number;
  blades: FloraClump[];
  flowers: FloraClump[];
  seeds: FloraClump[];
}

export interface FloraScatterOptions {
  rules: FloraRules;
  heightField: HeightField;
  seed: number;
  /** The tier's blade density (0 none, 1 the island's full meadow). */
  bladeDensity: number;
  /** The tier's flower density (0 none, 1 every plant). */
  flowerDensity: number;
  exclude?: VegetationExclude;
}

/** Flower plants outside any drift in a drift habitat (a light sprinkle), against a drift's heart (1). */
const SPRINKLE = 0.16;
/** Other habitats' flowers (banks, dunes, lawns, spray), against a drift's heart, unless the rules say. */
const HABITAT_FILL = 0.45;
/** Tussocks per cell: this many on bare grass, plus `BLADES_LUSH` at a weight of 1. */
const BLADES_BASE = 54;
const BLADES_LUSH = 132;
/** The seed heads' colour (sRGB). */
const SEED_HEAD = 0xc9b77a;
/** Stands (m): a sparse sward gathers into bunches about this wide, with bare ground between. */
const STAND = 3.4;

/** A clump's linear colour along a palette's four-stop ramp (0 moss … 1 straw), into `out`. */
function rampColour(ramp: readonly (readonly [number, number, number])[], t: number, out: FloraClump): void {
  const x = Math.min(0.999, Math.max(0, t)) * (ramp.length - 1);
  const i = Math.floor(x);
  const f = x - i;
  const a = ramp[i]!;
  const b = ramp[i + 1]!;
  out.r = a[0] + (b[0] - a[0]) * f;
  out.g = a[1] + (b[1] - a[1]) * f;
  out.b = a[2] + (b[2] - a[2]) * f;
}

const scratchColour = new Color();

/** sRGB hex to linear rgb (three's conversion, as the terrain's drift colours use). */
export function linearRgb(hex: number): [number, number, number] {
  const c = scratchColour.set(hex);
  return [c.r, c.g, c.b];
}

/** A palette's species by habitat, and the drifts' leads. */
function speciesLists(rules: FloraRules): {
  pools: Map<FloraHabitat, FloraSpecies[]>;
  leads: readonly FloraSpecies[];
} {
  const pools = new Map<FloraHabitat, FloraSpecies[]>();
  for (const h of FLORA_HABITATS) pools.set(h, []);
  for (const s of rules.palette.species) for (const h of s.habitats) pools.get(h)!.push(s);
  return { pools, leads: driftLeads(rules.palette) };
}

/** Whether any of the cell's middle and corners grows anything (cells wholly off the flora are skipped). */
function cellGrows(
  rules: FloraRules,
  field: HeightField,
  cx: number,
  cz: number,
  spot: FloraSpot,
): FloraSpot | null {
  const h = FLORA_CELL * 0.5;
  for (const [dx, dz] of CELL_PROBES) {
    const x = cx + dx * h;
    const z = cz + dz * h;
    const at = rules.habitatAt(x, z, field.heightAt(x, z), field.masksAt(x, z), field, spot);
    if (at) return at;
  }
  return null;
}

const CELL_PROBES = [
  [0, 0],
  [-1, -1],
  [1, -1],
  [-1, 1],
  [1, 1],
] as const;

function cellExclusionWeight(exclude: VegetationExclude | undefined, x: number, z: number): number {
  if (!exclude) return 1;
  const h = FLORA_CELL * 0.5;
  let w = 0;
  for (const [dx, dz] of CELL_PROBES)
    w = Math.max(w, exclusionWeight(exclude, x + dx * h, z + dz * h, EXCLUSION_SOFT_MARGIN));
  return w;
}

/**
 * An island's grass and flowers (its `FloraRules`), cell by cell into `out`, yielding after each cell
 * so a build can run a few cells a frame. The same rules, seed and densities always give the same
 * scatter. Tussocks follow the rules' blade weight and ramp, gathered into stands where the sward is
 * sparse; flowers come in drifts (`driftAt`, ~18 m patches where one species leads) over the open
 * ground, and at the habitat's own fill elsewhere (banks, dunes, lawns, spray).
 */
export function* scatterFlora(o: FloraScatterOptions, out: FloraCell[]): Generator<void, void, void> {
  const { rules, heightField: field, seed, exclude } = o;
  const palette = rules.palette;
  const bounds = rules.bounds;
  const ramp = palette.grass.ramp.map(linearRgb);
  const rng = new SeededRandom(seed ^ 0x67a91f);
  const bladeDensity = Math.max(0, o.bladeDensity * rules.bladeDensity);
  // Sparse swards gather into stands: the fewer the blades, the barer the ground between them.
  const clumping = Math.min(0.75, Math.max(0, 1 - rules.bladeDensity) * 0.85);
  const flowerTry = rules.flowersPerCell * Math.max(0, o.flowerDensity);
  const { pools, leads } = speciesLists(rules);
  const colours = new Map(
    palette.species.map((s) => [s, [linearRgb(s.colours[0]), linearRgb(s.colours[1])]]),
  );
  const seedColour = linearRgb(SEED_HEAD);
  const spot: FloraSpot = { habitat: 'meadow', weight: 0, kind: 'meadow', ramp: 0 };
  const drift: DriftSample = { strength: 0, lead: 0 };
  const fillOf = (h: FloraHabitat) =>
    rules.habitatFill?.[h] ?? (DRIFT_HABITATS.includes(h) ? SPRINKLE : HABITAT_FILL);
  let maxFill = SPRINKLE;
  for (const h of FLORA_HABITATS) maxFill = Math.max(maxFill, fillOf(h));
  const flowerTries = Math.ceil(flowerTry * 1.5);

  for (let x = bounds.minX; x <= bounds.maxX; x += FLORA_CELL) {
    for (let z = bounds.minZ; z <= bounds.maxZ; z += FLORA_CELL) {
      const cx = x + FLORA_CELL * 0.5;
      const cz = z + FLORA_CELL * 0.5;
      const local = rng.fork(Math.floor((x + 300) * 17 + (z + 220) * 31));
      const probe = cellGrows(rules, field, cx, cz, spot);
      if (!probe) continue;
      const probeHabitat = probe.habitat;
      const probeKind = probe.kind;
      const probeWeight = probe.weight;
      const cellWeight = cellExclusionWeight(exclude, cx, cz);
      if (cellWeight <= 0.02) continue;
      const cell: FloraCell = { x: cx, z: cz, blades: [], flowers: [], seeds: [] };

      // Tussocks.
      const lush = Math.max(probeWeight, 0.3);
      const target = Math.floor(
        ((BLADES_BASE + lush * BLADES_LUSH) * bladeDensity * cellWeight) / (1 - clumping * 0.55),
      );
      for (let i = 0; i < target; i += 1) {
        const px = cx + local.range(-FLORA_CELL * 0.5, FLORA_CELL * 0.5);
        const pz = cz + local.range(-FLORA_CELL * 0.5, FLORA_CELL * 0.5);
        const keep = local.next();
        const gather = local.next();
        const jitter = local.next();
        const size = local.range(0.84, 1.22);
        const turn = local.range(-Math.PI, Math.PI);
        if (clumping > 0 && valueNoise(px, pz, STAND, seed ^ 0x3d1) < clumping * 0.55 + gather * 0.3 - 0.15)
          continue;
        const sample = rules.habitatAt(px, pz, field.heightAt(px, pz), field.masksAt(px, pz), field, spot);
        if (!sample || sample.weight <= 0) continue;
        const edgeWeight = exclusionWeight(exclude, px, pz, EXCLUSION_SOFT_MARGIN);
        if (edgeWeight <= 0.02 || keep > edgeWeight) continue;
        // The stand (~5 m) shifts its blades warmer or cooler together; each tussock its own way.
        const stand = hash2(Math.floor(px / 5.2), Math.floor(pz / 5.2), seed ^ 0x2b7) - 0.5;
        const clump: FloraClump = {
          x: px,
          z: pz,
          scale: (0.72 + Math.min(sample.weight, 1.3) * 0.34) * size,
          rotation: turn,
          kind: sample.kind,
          r: 0,
          g: 0,
          b: 0,
          edgeWeight,
          lod: hash2(Math.floor(px * 2.7), Math.floor(pz * 2.7), seed ^ 0x51f15e),
        };
        rampColour(ramp, sample.ramp + (jitter - 0.5) * 0.3 + stand * 0.14, clump);
        cell.blades.push(clump);
      }

      // Flower plants: densest at a drift's heart, a light sprinkle elsewhere on open ground, and the
      // habitat's own fill on banks, dunes, lawns and in the falls' spray.
      for (let k = 0; k < flowerTries; k++) {
        const fx = cx + local.range(-FLORA_CELL * 0.5, FLORA_CELL * 0.5);
        const fz = cz + local.range(-FLORA_CELL * 0.5, FLORA_CELL * 0.5);
        const roll = local.next();
        const pick = local.next();
        const leadRoll = local.next();
        const t = local.next();
        const sizeRoll = local.next();
        const stemRoll = local.next();
        const turn = local.range(-Math.PI, Math.PI);
        driftAt(fx, fz, palette.drifts.seed, palette.drifts.coverage, drift);
        const most = (Math.max(drift.strength, maxFill) * flowerTry) / flowerTries;
        if (roll > most) continue;
        const at = rules.habitatAt(fx, fz, field.heightAt(fx, fz), field.masksAt(fx, fz), field, spot);
        if (!at) continue;
        const open = DRIFT_HABITATS.includes(at.habitat);
        const strength = open ? Math.max(drift.strength, fillOf(at.habitat)) : fillOf(at.habitat);
        if (roll > (strength * flowerTry) / flowerTries) continue;
        const pool = pools.get(at.habitat)!;
        if (pool.length === 0) continue;
        const edgeWeight = exclusionWeight(exclude, fx, fz, EXCLUSION_SOFT_MARGIN);
        if (edgeWeight < 0.6) continue;
        const lead =
          open && drift.strength > 0 && leadRoll < palette.drifts.leadShare
            ? driftLead(leads, drift.lead)
            : null;
        const species = lead && lead.habitats.includes(at.habitat) ? lead : pickSpecies(pool, pick);
        const [[r0, g0, b0], [r1, g1, b1]] = colours.get(species)!;
        cell.flowers.push({
          x: fx,
          z: fz,
          scale: species.size[0] + (species.size[1] - species.size[0]) * sizeRoll,
          stem: species.stem[0] + (species.stem[1] - species.stem[0]) * stemRoll,
          rotation: turn,
          kind: 'meadow',
          r: r0 + (r1 - r0) * t,
          g: g0 + (g1 - g0) * t,
          b: b0 + (b1 - b0) * t,
          edgeWeight: 1,
          lod: leadRoll,
          species,
        });
      }

      // Seed heads over the lusher meadows.
      if (
        probeKind === 'meadow' &&
        probeHabitat === 'meadow' &&
        bladeDensity > 0.55 &&
        probeWeight > 0.38 &&
        local.next() < 0.14 * probeWeight
      ) {
        const sx = cx + local.range(-FLORA_CELL * 0.4, FLORA_CELL * 0.4);
        const sz = cz + local.range(-FLORA_CELL * 0.4, FLORA_CELL * 0.4);
        const edgeWeight = exclusionWeight(exclude, sx, sz, EXCLUSION_SOFT_MARGIN);
        const shade = 0.9 + local.next() * 0.2;
        if (
          edgeWeight > 0.5 &&
          rules.habitatAt(sx, sz, field.heightAt(sx, sz), field.masksAt(sx, sz), field, spot)
        ) {
          const [r, g, b] = seedColour;
          cell.seeds.push({
            x: sx,
            z: sz,
            scale: local.range(0.86, 1.22),
            rotation: local.range(-Math.PI, Math.PI),
            kind: 'seedHead',
            r: r * shade,
            g: g * shade,
            b: b * shade,
            edgeWeight,
            lod: local.next(),
          });
        }
      }
      if (cell.blades.length + cell.flowers.length + cell.seeds.length > 0) out.push(cell);
      yield;
    }
  }
}
