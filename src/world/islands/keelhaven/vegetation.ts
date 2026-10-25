import { Color } from 'three/webgpu';
import type { HeightField, Tier } from '../../contracts';
import type { PlantInstance, PlantPatchLook, PlantSpecies } from '../../vegetation/types';
import { fbm2 } from '../../terrain/cove-height';
import { lowestOnRing } from '../../vegetation/scatter';
import { sinHash, smoothstep } from '../../../util/math';
import { FRAME as COVE_FRAME, KEELHAVEN as K, toFrame, toWorld } from './layout';
import { inTown, onHouse, SQUARE_TREE, STREET_HALF, streetDistance } from './town';
import { inWorks } from './works';
import { keelhavenHeight, keelhavenMasks, keelhavenNormal, keelhavenWater } from './height';

/**
 * Keelhaven's plants (napali-look §2.9): a closed forest of broadleaf trees, bananas and palms on the
 * valley floors and the lower slopes, shrubs, ferns and brush up the steeper slopes and on the ledges,
 * palms and leaning pandanus-like young palms along the back of the beach, and ferns and bananas thick
 * along the Keel River and round the Falls Pool. Nothing grows on faces over 50° (the walls' green is
 * the terrain's) and no tree stands high on a crest (the skyline is ridge, not trees). The town shelf
 * stays clear for the town and the shipyard. Seeded and pure.
 *
 * So the forest doesn't read as rows of one tree: each cell offers a few spots anywhere in it, broad
 * noises gather the trees into groves and thickets with glades between, sizes spread wide (a few big
 * crowns stand over the rest), and neighbouring trees share a tone in patches, as a real canopy does.
 */

const CELL = 7;
const SPOTS = 3;
const KEEP: Record<Tier, number> = { lite: 0.2, low: 0.4, medium: 0.68, high: 1, ultra: 1 };

/** How tall each species stands (m, at scale 1), and how wide it spreads. */
const SIZE: Partial<Record<PlantSpecies, { h: number; r: number }>> = {
  broadleafTree: { h: 9.4, r: 3.4 },
  palmTall: { h: 12.4, r: 3.2 },
  palmCluster: { h: 7.8, r: 2.8 },
  palmYoung: { h: 4.8, r: 1.8 },
  banana: { h: 3.4, r: 1.6 },
  fern: { h: 1.25, r: 0.9 },
  shrub: { h: 1.65, r: 1.0 },
  flowerBush: { h: 0.85, r: 0.7 },
  brush: { h: 1.45, r: 0.9 },
};

/** The island's own functions as a height field (for the tests; the game passes its baked one). */
export const KEELHAVEN_HEIGHT_FIELD: HeightField = {
  heightAt: keelhavenHeight,
  normalAt: (x, z, out) => keelhavenNormal(x, z, out),
  masksAt: (x, z) => keelhavenMasks(x, z),
};

/** No tree stands over this height (m): the crests and the high ridges keep brush and ferns. */
const TREE_LINE = 105;
/** Faces steeper than this (degrees) carry no plants (the terrain's canopy look holds them). */
const MAX_SLOPE = 50;
/** Trees only up to this slope (degrees). */
const TREE_SLOPE = 36;

/**
 * Where nothing is planted (cove frame): the town shelf (the town, the shipyard and the locks build
 * there) and the open beach in front of it (the berm and the sand).
 */
function cleared(u: number, v: number, r: number, x: number, z: number): boolean {
  const shelf = K.townShelf;
  if (inWorks(u, v, r + 1) || inTown(u, v, r + 0.6)) return true;
  // The town's half of the shelf (south of the river) waits for the town.
  if (u > shelf.u0 - 4 - r && u < shelf.u1 + 8 + r && v > -14 - r && v < shelf.halfWidth + 10 + r)
    return true;
  // The open sand: plants keep to the back of the beach (its edge wanders: no row along it).
  const edge = 16 + 14 * fbm2(x / 40, z / 40, 2, 0x6ee16);
  if (u > -60 && u < edge && Math.abs(v) < 70) return true;
  return false;
}

/** Where a broadleaf tree's crown starts (m, at scale 1), and the room kept under it for a walker. */
const CROWN_BASE = 3.35;
const CROWN_CLEAR = 3.6;

/** The highest ground on a ring `r` m round (x, z) (and at it). */
function highestOnRing(
  heightAt: (x: number, z: number) => number,
  x: number,
  z: number,
  h: number,
  r: number,
  samples: number,
): number {
  let y = h;
  for (let i = 0; i < samples; i++) {
    const a = (i / samples) * Math.PI * 2;
    y = Math.max(y, heightAt(x + Math.cos(a) * r, z + Math.sin(a) * r));
  }
  return y;
}

const NORMAL = [0, 0, 0];
const FRAME = { u: 0, v: 0 };
const FRAME_AXIS = COVE_FRAME.axis;

/**
 * The plants, a row of candidates per step (so the caller can spread the work over frames). Each cell
 * offers a few spots anywhere inside it; broad noises set the groves, the thickets and the glades.
 */
export function* keelhavenPlantsSliced(
  tier: Tier,
  field: HeightField = KEELHAVEN_HEIGHT_FIELD,
): Generator<void, PlantInstance[], void> {
  const out: PlantInstance[] = [];
  const keep = KEEP[tier];
  const water = keelhavenWater();
  const heightAt = (x: number, z: number) => field.heightAt(x, z);
  const { minX, maxX, minZ, maxZ } = K.bounds;
  for (let cz = Math.ceil((minZ + 60) / CELL); cz * CELL < maxZ - 60; cz++) {
    for (let cx = Math.ceil((minX + 60) / CELL); cx * CELL < maxX - 60; cx++) {
      for (let k = 0; k < SPOTS; k++) {
        const s = k * 16;
        const x = (cx + sinHash(cx, cz, s + 2)) * CELL;
        const z = (cz + sinHash(cx, cz, s + 3)) * CELL;
        const h = field.heightAt(x, z);
        if (h < 1.4) continue;
        const grove = fbm2(x * 0.011, z * 0.011, 3, 0x6ee11) * 0.5 + 0.5;
        const thicket = fbm2(x * 0.032 + 3.1, z * 0.032 - 7.7, 2, 0x6ee12) * 0.5 + 0.5;
        // Stands of a few big trees together, with understory between (a forest, not an orchard).
        const stand = fbm2(x * 0.05 - 9.1, z * 0.05 + 4.3, 2, 0x6ee15) * 0.5 + 0.5;
        // Clumps of a few crowns (about 12 m), so no two neighbours are spaced alike.
        const clump = fbm2(x * 0.085 + 2.3, z * 0.085 - 6.1, 2, 0x6ee17) * 0.5 + 0.5;
        const shore = water.shoreDistance(x, z, 20);
        const bank = 1 - smoothstep(2, 12, shore);
        field.normalAt(x, z, NORMAL);
        const slopeDeg = (Math.acos(Math.min(1, NORMAL[1]!)) * 180) / Math.PI;
        if (slopeDeg > MAX_SLOPE) continue;
        toFrame(x, z, FRAME);
        const canopy = closedCanopy(FRAME.u, FRAME.v, h, slopeDeg, bank);
        // Groves and thickets, glades between them (not an even carpet); a closed canopy in the valley.
        const density = Math.min(
          1,
          0.3 +
            smoothstep(0.4, 0.56, grove) * 0.7 +
            smoothstep(0.45, 0.7, thicket) * 0.2 +
            bank * 0.4 +
            canopy * 0.6,
        );
        if (sinHash(cx, cz, s + 1) > keep * density) continue;
        const m = field.masksAt(x, z);
        if (m.cliff > 0.3 || m.rock > 0.6) continue;
        const pick = sinHash(cx, cz, s + 4);
        const species =
          canopy > 0.5 && m.sand < 0.45 && h <= TREE_LINE
            ? canopySpecies(pick, stand, clump, thicket)
            : speciesFor(h, slopeDeg, m.sand, bank, grove, thicket, stand, FRAME.u, FRAME.v, pick);
        if (!species) continue;
        const scale = scaleFor(species, sinHash(cx, cz, s + 5), grove, canopy);
        const size = SIZE[species] ?? { h: 2, r: 1 };
        const r = size.r * scale;
        if (shore < r * 0.6 + 1.4) continue;
        if (cleared(FRAME.u, FRAME.v, r, x, z)) continue;
        let y = lowestOnRing(heightAt, x, z, h, Math.min(1.2, r * 0.35), 4);
        // Under a closed canopy a tree stands a little deep in the understory (its lower trunk hidden),
        // but its crown's lowest leaves stay clear over a walker's head on the highest ground under it.
        if (species === 'broadleafTree' && canopy > 0) {
          const under = highestOnRing(heightAt, x, z, h, r * 0.7, 8);
          const sink = Math.min(canopy * scale * 0.8, y + scale * CROWN_BASE - (under + CROWN_CLEAR));
          if (sink > 0) y -= sink;
        }
        const palm = species.startsWith('palm');
        // Young palms by the sea lean out like pandanus; tall palms lean a little.
        const lean = species === 'palmYoung' && h < 7 ? 0.5 : palm ? (h < 7 ? 0.42 : 0.16) : 0;
        // Patches of one tone (a grove shares its shade of green), and a little of each tree's own.
        const tone = smoothstep(0.3, 0.7, fbm2(x * 0.02 - 5.3, z * 0.02 + 1.7, 2, 0x6ee13) * 0.5 + 0.5);
        out.push({
          species,
          x,
          y: y - 0.12,
          z,
          scale,
          rotation: sinHash(cx, cz, s + 6) * Math.PI * 2,
          // By the sea they lean out over the sand toward the cove (the trade wind's lean), each its own way.
          leanX: (sinHash(cx, cz, s + 7) - 0.5) * lean - (h < 7 && palm ? FRAME_AXIS.x * lean * 0.5 : 0),
          leanZ: (sinHash(cx, cz, s + 8) - 0.5) * lean - (h < 7 && palm ? FRAME_AXIS.z * lean * 0.5 : 0),
          colorSeed: Math.min(1, Math.max(0, tone * 0.7 + sinHash(cx, cz, s + 9) * 0.3)),
          lodSeed: sinHash(cx, cz, s + 10),
          slopeDeg,
        });
      }
    }
    yield;
  }
  out.push(...townPlants(field));
  return out;
}

/**
 * The town's own trees, placed by hand: a big shade tree in the square's corner, palms by the tavern
 * and the quay's root, and a few in the gaps between the houses (each off the street and the houses).
 */
function townPlants(field: HeightField): PlantInstance[] {
  const spots: { u: number; v: number; species: PlantSpecies; scale: number }[] = [
    { u: SQUARE_TREE.u, v: SQUARE_TREE.v, species: 'broadleafTree', scale: 1.3 },
    { u: 10, v: 82, species: 'palmTall', scale: 1.1 },
    { u: 12, v: 71, species: 'palmCluster', scale: 1 },
    { u: 30, v: 80, species: 'palmTall', scale: 0.95 },
    { u: 60, v: 70, species: 'palmTall', scale: 1.15 },
    { u: 48, v: 68, species: 'banana', scale: 1.1 },
    { u: 104, v: 60, species: 'palmTall', scale: 1.05 },
    { u: 140, v: 46, species: 'broadleafTree', scale: 1.25 },
    { u: 9, v: 30, species: 'palmCluster', scale: 0.9 },
    { u: 92, v: 66, species: 'banana', scale: 1 },
  ];
  const out: PlantInstance[] = [];
  spots.forEach((s, i) => {
    if (onHouse(s.u, s.v, 2.5) || inWorks(s.u, s.v, 1) || streetDistance(s.u, s.v) < STREET_HALF + 1.5)
      return;
    const p = toWorld(s.u, s.v);
    const h = field.heightAt(p.x, p.z);
    const palm = s.species.startsWith('palm');
    out.push({
      species: s.species,
      x: p.x,
      y: h - 0.12,
      z: p.z,
      scale: s.scale,
      rotation: i * 2.3,
      leanX: palm ? 0.12 * Math.sin(i * 1.7) : 0,
      leanZ: palm ? 0.12 * Math.cos(i * 1.3) : 0,
      colorSeed: (i * 0.37) % 1,
      lodSeed: (i * 0.61) % 1,
      slopeDeg: 0,
    });
  });
  return out;
}

/**
 * How Keelhaven's plants are drawn (`VegetationSystem.addPlants`): a closed canopy is many big trees
 * close to the camera, so their bark (4k triangles a tree at full detail, mostly hidden in the crown)
 * is simplified (up to 12 cm off its shape at scale 1), and they hand off to their impostors at 0.65 of
 * the tier's distance, whose cards are shaded like round crowns.
 */
export const KEELHAVEN_PLANT_LOOK: PlantPatchLook = {
  simplify: { broadleafTree: 0.12 },
  handoff: 0.65,
  tint: (p) => plantTint(p, 0),
  farTint: (p) => plantTint(p, FAR_TINT),
  cardShade: true,
};

/**
 * The far cards multiply their baked colour by `tint × 0.16 + 0.84` (the shared impostor look), so
 * they barely vary. Their tint is solved so that factor is the plant's tint over a mean canopy green:
 * a far tree reads as dark or as yellow as a near one.
 */
const FAR_TINT = 1;
const MEAN_GREEN = new Color().setHSL(0.29, 0.42, 0.36);
const TINT = new Color();

/**
 * Keelhaven's greens: the broadleaf canopy spread from deep blue-green through jade to a sunlit
 * yellow-green, by its grove's tone (`colorSeed`) and each tree's own (`lodSeed`); the palms a little
 * yellower and paler; null (the shared greens) for the rest. `k` 1 gives the far cards' tint.
 */
function plantTint(p: PlantInstance, k: number): Color | null {
  if (p.species === 'broadleafTree') {
    const t = p.colorSeed;
    const own = p.lodSeed - 0.5;
    TINT.setHSL(0.38 - t * 0.18 + own * 0.05, 0.28 + t * 0.3, 0.2 + t * 0.3 + own * 0.1);
  } else if (p.species.startsWith('palm')) {
    TINT.setHSL(0.24 + p.colorSeed * 0.05, 0.5, 0.4 + p.colorSeed * 0.12);
  } else return null;
  return farTintOf(TINT, k);
}

/** The tint as drawn: near plants take it as it is; far cards (`far`) take the one solved for them. */
function farTintOf(c: Color, far: number): Color {
  if (!far) return c.clone();
  const solve = (v: number, mean: number) => Math.max(-2, Math.min(4, (v / mean - 0.84) / 0.16));
  return new Color(solve(c.r, MEAN_GREEN.r), solve(c.g, MEAN_GREEN.g), solve(c.b, MEAN_GREEN.b));
}
export function keelhavenPlants(tier: Tier, field: HeightField = KEELHAVEN_HEIGHT_FIELD): PlantInstance[] {
  const steps = keelhavenPlantsSliced(tier, field);
  for (;;) {
    const r = steps.next();
    if (r.done) return r.value;
  }
}

/**
 * Where the forest closes over (0-1): the cove valley's floor inland of the town, its river's banks
 * and the toe slopes at the foot of its walls (the forest's edge thickens against them).
 */
function closedCanopy(u: number, v: number, h: number, slope: number, bank: number): number {
  if (h > TREE_LINE || slope > TREE_SLOPE) return 0;
  const inCove = smoothstep(120, 160, u) * (1 - smoothstep(170, 210, Math.abs(v)));
  if (inCove <= 0) return 0;
  const floor = smoothstep(176, 200, u);
  const toe = smoothstep(10, 18, slope) * (1 - smoothstep(55, 80, h));
  return inCove * Math.max(floor, toe, bank * smoothstep(150, 185, u));
}

/**
 * A closed canopy: big broadleaf crowns touching over an understory of bananas, ferns and shrubs, and
 * tall palms standing through it. The trees bunch in clumps (few in a clump's gap: light wells);
 * palms stand in the gaps and through the crowns.
 */
function canopySpecies(pick: number, stand: number, clump: number, thicket: number): PlantSpecies | null {
  const trees = (0.2 + 0.2 * smoothstep(0.35, 0.6, stand)) * (0.35 + 1.4 * smoothstep(0.38, 0.62, clump));
  if (pick < trees) return 'broadleafTree';
  const palms = 0.08 + 0.1 * (1 - smoothstep(0.3, 0.55, clump));
  if (pick < trees + palms) return pick < trees + palms * 0.75 ? 'palmTall' : 'palmCluster';
  if (pick < trees + palms + 0.1) return 'banana';
  if (pick < trees + palms + 0.28) return 'fern';
  if (pick < trees + palms + 0.4) return 'shrub';
  if (pick < trees + palms + 0.44 && thicket > 0.5) return 'flowerBush';
  return null;
}

/**
 * What grows where: palms and leaning young palms (pandanus-like) at the back of the beach and on the
 * low ground by the sea, ferns and bananas along the river, a closed forest of broadleaf trees with
 * bananas and palms on the valley floors, shrubs and brush up the steeper slopes and over the tree
 * line.
 */
function speciesFor(
  h: number,
  slope: number,
  sand: number,
  bank: number,
  grove: number,
  thicket: number,
  stand: number,
  u: number,
  v: number,
  pick: number,
): PlantSpecies | null {
  const inCove = u > -120 && u < 420 && Math.abs(v) < 220;
  // The back of the beach and the low ground by the sea: palms and pandanus.
  // (In groves with gaps between them, not a row along the beach.)
  if (sand > 0.45 || h < 4.5) {
    if (slope > 24) return pick < 0.5 ? 'fern' : null;
    // Groups of a few palms, wide gaps between them.
    if (stand < 0.62 && pick > 0.06) return null;
    if (pick < 0.3) return 'palmTall';
    if (pick < 0.46) return 'palmCluster';
    if (pick < 0.78) return 'palmYoung';
    if (pick < 0.88) return 'shrub';
    return null;
  }
  // Over the tree line and on the steep slopes: brush, ferns and a few shrubs (no tree on a crest).
  // (Sparse: they're seen from close only on a ledge, and the terrain's canopy carries the rest.)
  if (h > TREE_LINE || slope > TREE_SLOPE + 6) {
    // In clumps on the ledges, not a sprinkle of specks.
    if (thicket < 0.52) return null;
    if (pick < 0.2) return 'brush';
    if (pick < 0.36) return 'fern';
    if (pick < 0.44) return 'shrub';
    return null;
  }
  // The river's banks and round the Falls Pool.
  if (bank > 0.4 && slope < 24) {
    if (pick < 0.28) return 'fern';
    if (pick < 0.5) return 'banana';
    if (pick < 0.62) return 'palmYoung';
    if (pick < 0.7) return 'broadleafTree';
    if (pick < 0.86 && thicket > 0.5) return 'flowerBush';
    return 'shrub';
  }
  // Steeper lower slopes: shrubs and ferns, trees only in the groves (stands, not a sprinkle).
  if (slope > TREE_SLOPE - 8) {
    if (grove > 0.48 && pick < 0.36 * smoothstep(0.42, 0.62, stand)) return 'broadleafTree';
    if (pick < 0.5) return 'shrub';
    if (pick < 0.74) return 'fern';
    if (pick < 0.86) return 'brush';
    return null;
  }
  // The groves: a closed canopy of broadleaf trees, palms standing through it in the cove's valley.
  // (Big trees, few: their wide crowns close over an understory of bananas, ferns and shrubs.)
  if (grove > 0.45) {
    if (pick < 0.62 * smoothstep(0.36, 0.54, stand)) return 'broadleafTree';
    if (pick < 0.38) return 'banana';
    if (pick < (inCove ? 0.47 : 0.42)) return 'palmTall';
    if (pick < 0.7) return 'fern';
    if (pick < 0.86) return 'shrub';
    if (thicket > 0.55) return 'flowerBush';
    return 'fern';
  }
  // Between the groves: low cover (ferns, shrubs, bananas), a young palm here and there.
  if (pick < 0.16) return 'banana';
  if (pick < 0.44) return 'fern';
  if (pick < 0.62) return 'shrub';
  if (pick < 0.68) return 'palmYoung';
  if (pick < 0.72 && thicket > 0.6) return 'flowerBush';
  return null;
}

/** A wide spread of sizes: most trees in the middle, a few big crowns over the rest, more in the groves. */
function scaleFor(species: PlantSpecies, r: number, grove: number, canopy: number): number {
  switch (species) {
    case 'broadleafTree': {
      // Rainforest trees, 9-24 m (crowns wide enough to close over the floor, from understory trees
      // to big ones), and one in twelve an emergent, to ~34 m, standing over the canopy.
      const big = r > 0.8 ? 0.6 * smoothstep(0.8, 0.92, r) : 0;
      const emergent = r > 0.92 ? 1.0 * canopy * smoothstep(0.92, 1, r) : 0;
      return 0.95 + r * r * 1.1 + big + emergent + Math.max(grove, canopy) * 0.25;
    }
    case 'palmTall':
      // Through a canopy they stand tall (to ~20 m), to reach the light.
      return 0.7 + r * 0.8 + canopy * 0.45;
    case 'palmYoung':
      return 0.75 + r * 0.6;
    case 'banana':
      return 0.8 + r * 0.7;
    case 'fern':
      return 1.0 + r * 1.0;
    case 'shrub':
      return 0.8 + r * 0.9;
    case 'brush':
      return 0.8 + r * 0.7;
    default:
      return 0.85 + r * 0.35;
  }
}
