import type { Tier } from '../../contracts';
import type { PlantInstance, PlantSpecies } from '../../vegetation/types';

/**
 * Anchorage's hand-placed village planting (Dan: "place some palm trees in the village"). The
 * scatter keeps off the whole village (walkways, doors, colliders), so the village plants its own:
 * singles and pairs on the quay ends, between the houses and round the plaza, and palms that lean out
 * over the water at both ends of the quay. They go into the vegetation's existing instanced batches
 * (`extraPlants`), so they share its materials and impostors and add no programs.
 *
 * `rank` sets the tier: 0 on every tier, 1 from Medium, 2 from High. `planter` palms stand on paving
 * in a low stone ring; `lean` is the world direction and strength (metres across per metre up).
 */
export interface VillagePlantSpot {
  species: PlantSpecies;
  x: number;
  z: number;
  scale: number;
  rotation: number;
  rank: 0 | 1 | 2;
  planter?: boolean;
  lean?: { x: number; z: number };
}

export const VILLAGE_PALMS: readonly VillagePlantSpot[] = [
  // The quay's east end, where the old lighthouse stood: a pair, one leaning out over the water.
  {
    species: 'palmTall',
    x: -72.6,
    z: -71.6,
    scale: 1.02,
    rotation: 0.9,
    rank: 0,
    planter: true,
    lean: { x: 0.12, z: -0.3 },
  },
  {
    species: 'palmTall',
    x: -76.4,
    z: -66.6,
    scale: 0.86,
    rotation: 2.6,
    rank: 1,
    planter: true,
    lean: { x: 0.05, z: -0.08 },
  },
  // The quay's west end at the lighthouse path's foot, leaning out over the harbour.
  {
    species: 'palmTall',
    x: -148.6,
    z: -73.9,
    scale: 0.98,
    rotation: -0.6,
    rank: 0,
    lean: { x: -0.16, z: -0.32 },
  },
  { species: 'palmCluster', x: -155.5, z: -65.5, scale: 0.82, rotation: 1.2, rank: 0 },
  // Along the west beach behind the fish market.
  { species: 'palmYoung', x: -158, z: -55, scale: 0.7, rotation: 0.4, rank: 1, lean: { x: -0.12, z: 0 } },
  { species: 'palmTall', x: -157, z: -47, scale: 1.06, rotation: -1.8, rank: 2, lean: { x: -0.18, z: 0.04 } },
  // Between the chandlery and the fish market, and beside the harbourmaster's house.
  { species: 'palmTall', x: -146.5, z: -62.5, scale: 0.9, rotation: 2.2, rank: 0, planter: true },
  { species: 'palmTall', x: -87.5, z: -58.5, scale: 0.94, rotation: -0.4, rank: 0, planter: true },
  // Round the plaza: one in a planter on the quay apron, the rest in the grass at its edge.
  { species: 'palmTall', x: -125, z: -37.5, scale: 0.96, rotation: 1.5, rank: 0 },
  { species: 'palmTall', x: -100, z: -42.6, scale: 1.0, rotation: -2.4, rank: 0 },
  { species: 'palmTall', x: -104, z: -52, scale: 0.88, rotation: 0.3, rank: 1, planter: true },
  { species: 'palmTall', x: -104.5, z: -38, scale: 0.84, rotation: 2.9, rank: 2 },
  // Cottage gardens and the slopes south of the plaza.
  { species: 'palmTall', x: -141.5, z: -38.5, scale: 1.08, rotation: 0.7, rank: 0 },
  { species: 'palmYoung', x: -143.6, z: -35.8, scale: 0.66, rotation: -1.1, rank: 1 },
  { species: 'palmTall', x: -120, z: -30, scale: 0.92, rotation: -0.9, rank: 1 },
  { species: 'palmTall', x: -100, z: -30, scale: 1.0, rotation: 1.9, rank: 1 },
  { species: 'palmCluster', x: -88.5, z: -40, scale: 0.86, rotation: -2.1, rank: 1 },
  { species: 'palmTall', x: -126, z: -26, scale: 1.04, rotation: 2.5, rank: 2 },
];

/** Which village plants a tier keeps (fewer on Lite and Low, PLAN §12.1). */
export function villagePlantRank(tier: Tier): number {
  if (tier === 'lite' || tier === 'low') return 0;
  if (tier === 'medium') return 1;
  return 2;
}

/** The planter's stone ring radius and height above the paving. */
export const PLANTER = { radius: 0.9, height: 0.38 } as const;

/** Trunk collider radius for a palm on open ground (planters use their ring). */
export const PALM_TRUNK_RADIUS = 0.45;

/** A stable 0..1 hash so each spot keeps its tint and model variant. */
export function hash01(x: number, z: number, salt: number): number {
  const s = Math.sin(x * 12.9898 + z * 78.233 + salt * 37.719) * 43758.5453;
  return s - Math.floor(s);
}

/**
 * The village plant instances for a tier. `ground` is the walk height where there's paving or deck,
 * else the terrain; `terrain` is the bare terrain height (for the trunk's lowest root).
 */
export function villagePlantInstances(
  spots: readonly VillagePlantSpot[],
  tier: Tier,
  ground: (x: number, z: number) => number,
  terrain: (x: number, z: number) => number,
): PlantInstance[] {
  const maxRank = villagePlantRank(tier);
  const out: PlantInstance[] = [];
  for (const s of spots) {
    if (s.rank > maxRank) continue;
    let y: number;
    if (s.planter) {
      y = ground(s.x, s.z) + PLANTER.height - 0.06;
    } else {
      // Sit the base on the lowest ground under the trunk, a little sunk, as the scatter does.
      y = terrain(s.x, s.z);
      for (let i = 0; i < 6; i += 1) {
        const a = (i / 6) * Math.PI * 2;
        y = Math.min(y, terrain(s.x + Math.cos(a) * 0.6, s.z + Math.sin(a) * 0.6));
      }
      y -= 0.1;
    }
    // The vegetation shears in model space before it turns the plant, so turn the world lean back.
    const lx = s.lean ? s.lean.x * Math.cos(s.rotation) - s.lean.z * Math.sin(s.rotation) : 0;
    const lz = s.lean ? s.lean.x * Math.sin(s.rotation) + s.lean.z * Math.cos(s.rotation) : 0;
    out.push({
      species: s.species,
      x: s.x,
      y,
      z: s.z,
      scale: s.scale,
      rotation: s.rotation,
      leanX: lx,
      leanZ: lz,
      colorSeed: hash01(s.x, s.z, 1),
      // Below 0.6 picks palm model 'a' for every village palm. They all sit in the harbour's hero-LOD
      // zone, so they fill one new instanced batch; each batch compiles its own vertex program.
      lodSeed: hash01(s.x, s.z, 2) * 0.55,
      slopeDeg: 0,
    });
  }
  return out;
}

/** How many shrubs and flowering bushes each tier plants in the village (PLAN §12.1). */
export function villageShrubCap(tier: Tier): number {
  if (tier === 'lite') return 12;
  if (tier === 'low') return 18;
  if (tier === 'medium') return 32;
  return 48;
}

/** One candidate bed: against a wall (`wall`) or at a street's edge. */
export interface ShrubCandidate {
  x: number;
  z: number;
  wall: boolean;
}

/**
 * Picks shrubs from candidate beds: shuffled by a stable hash, spaced out, capped by tier. Walls get
 * flowering bushes, shrubs and the odd banana; street edges get flowering bushes, ferns and shrubs.
 */
export function pickVillageShrubs(
  candidates: readonly ShrubCandidate[],
  tier: Tier,
  terrain: (x: number, z: number) => number,
): PlantInstance[] {
  const order = candidates
    .map((c, i) => ({ c, k: hash01(c.x, c.z, 7 + i * 0.001) }))
    .sort((a, b) => a.k - b.k);
  const cap = villageShrubCap(tier);
  const out: PlantInstance[] = [];
  for (const { c } of order) {
    if (out.length >= cap) break;
    if (out.some((p) => (p.x - c.x) ** 2 + (p.z - c.z) ** 2 < 2.6 * 2.6)) continue;
    const roll = hash01(c.x, c.z, 3);
    let species: PlantSpecies;
    let scale: number;
    const size = hash01(c.x, c.z, 4);
    if (roll < 0.48) {
      species = 'flowerBush';
      scale = 1.6 + size * 0.7;
    } else if (c.wall && roll > 0.86) {
      species = 'banana';
      scale = 0.62 + size * 0.24;
    } else if (!c.wall && roll > 0.74) {
      species = 'fern';
      scale = 1.05 + size * 0.35;
    } else {
      species = 'shrub';
      scale = 0.8 + size * 0.35;
    }
    out.push({
      species,
      x: c.x,
      y: terrain(c.x, c.z) - 0.06,
      z: c.z,
      scale,
      rotation: hash01(c.x, c.z, 5) * Math.PI * 2,
      leanX: 0,
      leanZ: 0,
      colorSeed: hash01(c.x, c.z, 6),
      lodSeed: hash01(c.x, c.z, 8),
      slopeDeg: 0,
    });
  }
  return out;
}
