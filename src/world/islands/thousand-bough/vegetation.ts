import type { HeightField, Tier } from '../../contracts';
import type { PlantInstance, PlantSpecies } from '../../vegetation/types';
import { fbm2 } from '../../terrain/cove-height';
import { lowestOnRing } from '../../vegetation/scatter';
import { sinHash, smoothstep } from '../../../util/math';
import { THOUSAND_BOUGH as TB, TREE } from './layout';
import { thousandBoughHeight, thousandBoughMasks, thousandBoughNormal, thousandBoughWater } from './height';
import type { WalkClearance } from './village/clearance';
import type { PropRoot } from './tree/shape';

/**
 * Thousand-Bough's jungle (spec §2.2, §9.8): a dense jade valley of broadleaf trees, bananas, ferns
 * and shrubs with heliconia-red flowering bushes as accents, palms on the beaches and by the cove,
 * ferns and bananas thick along the streams, and scrub up the ridge's outer slopes. Seeded and pure.
 * Nothing grows on a path, a deck's footprint below its height, a pool's wading ring, the Flume
 * Terrace or within a stop's 4 m clearing; trees keep out from under the banyan's canopy.
 */

const CELL = 8;
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
  log: { h: 0.9, r: 1.6 },
};

/** The island's own functions as a height field (for the tests; the game passes its baked one). */
export const THOUSAND_BOUGH_HEIGHT_FIELD: HeightField = {
  heightAt: thousandBoughHeight,
  normalAt: thousandBoughNormal,
  masksAt: thousandBoughMasks,
};

/** Clearings: the stops (4 m), the collectibles (2 m), the Flume Terrace, the Spire and the cave. */
function cleared(x: number, z: number, r: number): boolean {
  for (const a of Object.values(TB.anchors)) if (Math.hypot(x - a.x, z - a.z) < 4.2 + r) return true;
  for (const s of TB.starfish) if (Math.hypot(x - s.x, z - s.z) < 2 + r) return true;
  for (const c of TB.chests) if (Math.hypot(x - c.x, z - c.z) < 2.4 + r) return true;
  for (const b of TB.bottles) if (Math.hypot(x - b.x, z - b.z) < 2.2 + r) return true;
  // The Flume Terrace and its header, gates and sluice (plants grow right up to its walls).
  if (x > 1997 - r && x < 2019.5 + r && z > -1633 - r && z < -1611 + r) return true;
  if (Math.hypot(x - TB.spire.x, z - TB.spire.z) < 10 + r) return true;
  const c = TB.cave.mouth;
  if (Math.hypot(x - c.x, z - c.z) < 12 + r) return true;
  for (const w of TB.water.wheels) {
    const a = (w.bearing * Math.PI) / 180;
    if (Math.hypot(x - (TREE.x + Math.sin(a) * w.r), z - (TREE.z - Math.cos(a) * w.r)) < 4.5 + r) return true;
  }
  // The Root Hall ring, and the Fern Walk's last stretch (the colonnade of roots frames it).
  if (Math.hypot(x - TREE.x, z - TREE.z) < TB.rootHall.rOuter + 2 + r) return true;
  return false;
}

/** How far a plant keeps from a walk beside it, over it and under it. */
const WALK_MARGINS = { beside: 1.2, above: 1.5, below: 1.5 };

/**
 * Whether a plant `height` m tall and `r` m across fits at (x, z) on ground `h`: off the clearings and
 * the banyan's roots, not on a path, nor reaching up into a deck, a stair or a bridge.
 */
function hasRoom(
  x: number,
  z: number,
  h: number,
  height: number,
  r: number,
  clearance: WalkClearance,
  roots: readonly PropRoot[],
): boolean {
  if (cleared(x, z, r)) return false;
  for (const root of roots) if (Math.hypot(x - root.foot.x, z - root.foot.z) < root.r + r + 0.4) return false;
  return !clearance.conflict(x, h + height / 2, z, Math.max(r * 0.8, height / 2), WALK_MARGINS);
}

const NORMAL = [0, 0, 0];

/**
 * The plants, a row of candidates per step (so the caller can spread the work over frames). Each cell
 * offers a few spots anywhere inside it, and broad noises set the groves, the thickets and the glades.
 */
export function* thousandBoughPlantsSliced(
  tier: Tier,
  clearance: WalkClearance,
  roots: readonly PropRoot[] = [],
  field: HeightField = THOUSAND_BOUGH_HEIGHT_FIELD,
): Generator<void, PlantInstance[], void> {
  const out: PlantInstance[] = [];
  const keep = KEEP[tier];
  const water = thousandBoughWater();
  const heightAt = (x: number, z: number) => field.heightAt(x, z);
  const { minX, maxX, minZ, maxZ } = TB.bounds;
  for (let cz = Math.ceil((minZ + 40) / CELL); cz * CELL < maxZ - 40; cz++) {
    for (let cx = Math.ceil((minX + 40) / CELL); cx * CELL < maxX - 40; cx++) {
      for (let k = 0; k < SPOTS; k++) {
        const s = k * 16;
        const x = (cx + sinHash(cx, cz, s + 2)) * CELL;
        const z = (cz + sinHash(cx, cz, s + 3)) * CELL;
        const grove = fbm2(x * 0.012, z * 0.012, 3, 0x7a11) * 0.5 + 0.5;
        const thicket = fbm2(x * 0.035 + 3.1, z * 0.035 - 7.7, 2, 0x7a12) * 0.5 + 0.5;
        const shore = water.shoreDistance(x, z, 20);
        const bank = 1 - smoothstep(2, 14, shore);
        const density = Math.min(
          1,
          0.42 + smoothstep(0.4, 0.62, grove) * 0.5 + smoothstep(0.45, 0.7, thicket) * 0.3 + bank * 0.5,
        );
        if (sinHash(cx, cz, s + 1) > keep * density) continue;
        const h = field.heightAt(x, z);
        if (h < 1.2) continue;
        field.normalAt(x, z, NORMAL);
        const slopeDeg = (Math.acos(Math.min(1, NORMAL[1]!)) * 180) / Math.PI;
        if (slopeDeg > 36) continue;
        const m = field.masksAt(x, z);
        if (m.cliff > 0.35) continue;
        const pick = sinHash(cx, cz, s + 4);
        const toTree = Math.hypot(x - TREE.x, z - TREE.z);
        const species = speciesFor(h, slopeDeg, m.sand, bank, grove, thicket, toTree, pick);
        if (!species) continue;
        const scale = scaleFor(species, sinHash(cx, cz, s + 5));
        const size = SIZE[species] ?? { h: 2, r: 1 };
        const r = size.r * scale;
        if (shore < r * 0.6 + 1.6) continue;
        if (!hasRoom(x, z, h, size.h * scale, r, clearance, roots)) continue;
        const y = lowestOnRing(heightAt, x, z, h, 0.7, 4);
        const palm = species.startsWith('palm');
        out.push({
          species,
          x,
          y: y - 0.12,
          z,
          scale,
          rotation: sinHash(cx, cz, s + 6) * Math.PI * 2,
          leanX: palm ? (sinHash(cx, cz, s + 7) - 0.5) * 0.16 : 0,
          leanZ: palm ? (sinHash(cx, cz, s + 8) - 0.5) * 0.16 : 0,
          colorSeed: sinHash(cx, cz, s + 9),
          lodSeed: sinHash(cx, cz, s + 10),
          slopeDeg,
        });
      }
    }
    yield;
  }
  // The understory round the banyan: ferns and shrubs thick on the knoll between its roots (the
  // ground there was bare), on a finer grid, still off every path, root, clearing and walk.
  const T = TB.tree;
  for (let gz = -70; gz <= 70; gz += 3)
    for (let gx = -70; gx <= 70; gx += 3) {
      const x = T.x + gx + (sinHash(gx, gz, 91) - 0.5) * 2.6;
      const z = T.z + gz + (sinHash(gx, gz, 92) - 0.5) * 2.6;
      const d = Math.hypot(x - T.x, z - T.z);
      if (d < TB.rootHall.rOuter + 2.5 || d > 70) continue;
      if (sinHash(gx, gz, 93) > keep * (d < 45 ? 0.85 : 0.55)) continue;
      const h = field.heightAt(x, z);
      if (h < 4) continue;
      if (water.shoreDistance(x, z, 6) < 1.8) continue;
      const species: PlantSpecies = sinHash(gx, gz, 94) < 0.72 ? 'fern' : 'shrub';
      const scale = scaleFor(species, sinHash(gx, gz, 95));
      const size = SIZE[species] ?? { h: 2, r: 1 };
      if (!hasRoom(x, z, h, size.h * scale, size.r * scale, clearance, roots)) continue;
      field.normalAt(x, z, NORMAL);
      out.push({
        species,
        x,
        y: h - 0.12,
        z,
        scale,
        rotation: sinHash(gx, gz, 96) * Math.PI * 2,
        leanX: 0,
        leanZ: 0,
        colorSeed: sinHash(gx, gz, 97),
        lodSeed: sinHash(gx, gz, 98),
        slopeDeg: (Math.acos(Math.min(1, NORMAL[1]!)) * 180) / Math.PI,
      });
    }
  return out;
}

export function thousandBoughPlants(
  tier: Tier,
  clearance: WalkClearance,
  roots: readonly PropRoot[] = [],
): PlantInstance[] {
  const steps = thousandBoughPlantsSliced(tier, clearance, roots);
  for (;;) {
    const r = steps.next();
    if (r.done) return r.value;
  }
}

/**
 * What grows here: palms on the beaches and the cove's shore, a jungle of broadleaf trees, bananas
 * and ferns in the valley (only the low layer under the banyan's canopy), scrub up the outer slopes,
 * and heliconia-red flowering bushes sparingly in the thickets.
 */
function speciesFor(
  h: number,
  slope: number,
  sand: number,
  bank: number,
  grove: number,
  thicket: number,
  toTree: number,
  pick: number,
): PlantSpecies | null {
  const underCanopy = toTree < 66;
  if (sand > 0.5 || h < 4.5) {
    if (pick < 0.42) return 'palmTall';
    if (pick < 0.62) return 'palmCluster';
    if (pick < 0.78) return 'palmYoung';
    if (pick < 0.86) return 'fern';
    return null;
  }
  if (bank > 0.4 && slope < 24) {
    if (pick < 0.3) return 'fern';
    if (pick < 0.52) return 'banana';
    if (pick < 0.64 && !underCanopy) return 'palmYoung';
    if (pick < 0.74 && !underCanopy) return 'broadleafTree';
    if (pick < 0.84) return 'shrub';
    return 'fern';
  }
  if (underCanopy) {
    if (pick < 0.5) return 'fern';
    if (pick < 0.7) return 'banana';
    if (pick < 0.82) return 'shrub';
    if (pick < 0.86 && thicket > 0.5) return 'flowerBush';
    return 'fern';
  }
  // The ridge's crests: low scrub only, so no lone tree stands on the skyline.
  if (h > 44) {
    if (pick < 0.5) return 'brush';
    if (pick < 0.68) return 'fern';
    return null;
  }
  if (h > 34 || slope > 26) {
    if (pick < 0.35) return 'brush';
    if (pick < 0.6) return 'broadleafTree';
    if (pick < 0.75) return 'fern';
    return null;
  }
  if (grove > 0.5) {
    if (pick < 0.48) return 'broadleafTree';
    if (pick < 0.6) return 'banana';
    if (pick < 0.72) return 'fern';
    if (pick < 0.78) return 'palmTall';
    if (pick < 0.86) return 'shrub';
    if (pick < 0.9 && thicket > 0.55) return 'flowerBush';
    return 'fern';
  }
  if (pick < 0.3) return 'fern';
  if (pick < 0.46) return 'banana';
  if (pick < 0.6) return 'broadleafTree';
  if (pick < 0.68) return 'shrub';
  if (pick < 0.72) return 'palmYoung';
  if (pick < 0.75 && thicket > 0.6) return 'flowerBush';
  return null;
}

function scaleFor(species: PlantSpecies, r: number): number {
  switch (species) {
    case 'palmTall':
      return 0.85 + r * 0.4;
    case 'broadleafTree':
      return 0.85 + r * 0.6;
    case 'banana':
      return 0.9 + r * 0.6;
    case 'fern':
      return 1.0 + r * 0.9;
    case 'shrub':
      return 0.9 + r * 0.8;
    default:
      return 0.85 + r * 0.35;
  }
}
