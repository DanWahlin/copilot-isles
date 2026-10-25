import type { TierSettings } from '../../../engine/quality';
import { mulberry32 } from '../../../util/math';
import { createMistCards, type MistCards } from '../../mist/mist-cards';
import { THOUSAND_BOUGH as TB, TREE } from './layout';
import { thousandBoughHeight } from './height';
import { GREAT_FALLS_CURTAIN } from './water';
import { CURTAIN_FOOT_Y as GREAT_FALLS_FOOT_Y } from './water-mesh';
import type { WalkClearance } from './village/clearance';

/** Mist cards per tier (spec §9.8): none on Lite (the haze carries it), 20 / 40 / 60. */
const COUNT: Record<TierSettings['tier'], number> = { lite: 0, low: 20, medium: 40, high: 60, ultra: 60 };

/** The valley's mist (the Seal thins it to 0.7). */
export type Mist = MistCards;

/** A card's spot: centre and size, kept clear of the ground, the trunk, the decks and every walk. */
export function mistCards(
  count: number,
  clearance: WalkClearance,
): { x: number; y: number; z: number; s: number }[] {
  const rand = mulberry32(0x3157);
  const out: { x: number; y: number; z: number; s: number }[] = [];
  const top = TB.mood.mistTop;
  // Spray where the two big falls land: a bank across each foot, low over its pool.
  const [veil, , great] = TB.water.falls;
  out.push({ x: great!.lip.x, y: GREAT_FALLS_FOOT_Y + 4.2, z: GREAT_FALLS_CURTAIN.footZ + 2.5, s: 13 });
  out.push({ x: veil!.foot.x, y: veil!.lip.y - veil!.drop + 4, z: veil!.foot.z + 2, s: 11 });
  // Over the valley floor, the pools and the cove's inner edge; thickest low in the shade.
  for (let tries = 0; tries < count * 40 && out.length < count; tries++) {
    const a = rand() * Math.PI * 2;
    const r = Math.sqrt(rand()) * 170;
    const x = 1995 + Math.cos(a) * r * 1.15;
    const z = -1505 + Math.sin(a) * r;
    const ground = thousandBoughHeight(x, z);
    if (ground < 2 || ground > 26) continue;
    const s = 14 + rand() * 14;
    // Low in the valley: lying on the ground's hollows, not floating at the trees' tops.
    const y = Math.max(6, ground + s * 0.22 + 2) + rand() * 3;
    if (y > top - 2) continue;
    // A bank is 1.7 × its size wide and 0.72 × tall (its soft middle about 60% of that).
    const half = s * 0.36;
    const wide = s * 0.6;
    // Clear of the ground under it and round it (the cards are soft; their middles stay in the air).
    let low = Infinity;
    for (let k = 0; k < 8; k++) {
      const b = (k / 8) * Math.PI * 2;
      low = Math.min(low, y - thousandBoughHeight(x + Math.cos(b) * wide, z + Math.sin(b) * wide));
    }
    if (low < half * 0.55 + 3) continue;
    if (Math.hypot(x - TREE.x, z - TREE.z) < 30 + wide) continue;
    // Off the sightline from where you land to the trunk (the first look at the tree stays clear).
    const L = TB.harbor.landingShot;
    if (sightDistance(x, y, z, L.x, L.y, L.z, L.tx, L.ty, L.tz) < wide * 0.7 + 4) continue;
    // Nor in the landing's view toward the tree (a 25° cone short of the trunk): the first look is clear.
    {
      const vx = TREE.x - L.x;
      const vz = TREE.z - L.z;
      const px = x - L.x;
      const pz = z - L.z;
      const along = (px * vx + pz * vz) / Math.hypot(vx, vz);
      const cos = along / (Math.hypot(px, pz) || 1);
      if (along > 0 && along < Math.hypot(vx, vz) - 20 && cos > Math.cos((40 * Math.PI) / 180)) continue;
    }
    // Nor across the hero views of the tree (from the sea, the decks, the Root Gate).
    {
      const T = { x: TREE.x, y: 35, z: TREE.z };
      let across = false;
      for (const [cx, cy, cz] of HERO_EYES)
        if (sightDistance(x, y, z, cx, cy, cz, T.x, T.y, T.z) < wide * 0.7 + 4) across = true;
      if (across) continue;
    }
    if (clearance.conflict(x, y, z, wide * 0.6, { beside: 3, above: 3, below: 3 })) continue;
    if (out.some((c) => Math.hypot(c.x - x, c.z - z) < (c.s + s) * 0.3)) continue;
    out.push({ x, y, z, s });
  }
  return out;
}

/** Where the hero shots look at the tree from (spec §2.8): no bank sits across those views. */
const HERO_EYES: readonly (readonly [number, number, number])[] = [
  [1700, 12, -1020],
  [1820, 10, -1180],
  [1932.5, 6.4, -1362],
  [1955, 40, -1500],
  [1980, 16.5, -1532],
  [1972, 20.5, -1522],
];

/** How far (x, y, z) is from the segment a → b (3D). */
function sightDistance(
  x: number,
  y: number,
  z: number,
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const dz = bz - az;
  const t = Math.max(
    0,
    Math.min(1, ((x - ax) * dx + (y - ay) * dy + (z - az) * dz) / (dx * dx + dy * dy + dz * dz)),
  );
  return Math.hypot(x - ax - dx * t, y - ay - dy * t, z - az - dz * t);
}

/**
 * The valley's mist (spec §2.4): big soft cards drifting slowly between 8 m and the mist's top in the
 * shared mist look (`createMistCards`), none on Lite (the haze carries it).
 */
export function createMist(tier: TierSettings, clearance: WalkClearance): Mist | null {
  const n = COUNT[tier.tier];
  if (n === 0) return null;
  const cards = mistCards(n, clearance);
  if (cards.length === 0) return null;
  return createMistCards(cards, {
    name: 'thousand-bough-mist',
    shade: TB.mood.mistShade,
    sun: TB.mood.mistSun,
    top: TB.mood.mistTop,
  });
}
