import type { TierSettings } from '../../../engine/quality';
import { mulberry32 } from '../../../util/math';
import { createMistCards, type MistCard, type MistCards } from '../../mist/mist-cards';
import { KEELHAVEN as K, toWorld } from './layout';
import { keelhavenHeight, keelhavenWater } from './height';
import { seaFallCurtain } from './water-mesh';

/**
 * Valley mist per tier: none on Lite and Low (the haze carries the depth), then spray at the falls'
 * feet and a few soft banks lying on the forest under the valley's head wall.
 */
const COUNT: Record<TierSettings['tier'], number> = { lite: 0, low: 0, medium: 14, high: 22, ultra: 22 };

/**
 * The mist's look: thin, wide layers (a third as tall as wide), white toward the sun and on their
 * sunlit tops, and the falls' spray small, round and brighter.
 */
const LOOK = {
  name: 'keelhaven-mist',
  shade: 0xe4ebf1,
  sun: 0xffffff,
  top: 200,
  density: 0.55,
  aspect: 0.32,
  bright: 2.3,
  topLight: 0.5,
  spray: true,
  soft: 1,
};

/**
 * Where the cards go: spray at Ribbon Falls' foot and at each sea fall's, then long, low banks lying
 * on the forest of the upper valley under the head wall, each kept clear of the ground under and round
 * it.
 */
export function keelhavenMistCards(count: number): MistCard[] {
  const out: MistCard[] = [];
  if (count === 0) return out;
  const water = keelhavenWater();
  const line = K.water.ribbon.line;
  const foot = toWorld(line[line.length - 1]![0], line[line.length - 1]![1]);
  const pool = water.basins.fallsPool;
  out.push({ x: foot.x, y: pool.level + 4, z: foot.z, s: 10 });
  K.water.seaFalls.forEach((f, i) => {
    if (!f.curtain) return;
    const c = seaFallCurtain(water.streams[2 + i]!);
    const out2 = c.reach * Math.sqrt(c.y);
    out.push({ x: c.x + c.ox * (out2 + 2), y: 5, z: c.z + c.oz * (out2 + 2), s: 9 });
  });
  const rand = mulberry32(0x6ee14);
  for (let tries = 0; tries < count * 60 && out.length < count; tries++) {
    const u = 250 + rand() * 170;
    const v = (rand() - 0.5) * 200;
    const { x, z } = toWorld(u, v);
    const ground = keelhavenHeight(x, z);
    if (ground > 90) continue;
    const s = 90 + rand() * 60;
    // A thin layer hanging just over the canopy (the trees stand 12-25 m): through its crowns, a
    // card's edge would cut a hard line.
    const y = ground + 26 + rand() * 22;
    const half = s * 0.36 * LOOK.aspect;
    const wide = s * 0.6;
    let low = Infinity;
    for (let k = 0; k < 8; k++) {
      const b = (k / 8) * Math.PI * 2;
      low = Math.min(low, y - keelhavenHeight(x + Math.cos(b) * wide, z + Math.sin(b) * wide));
    }
    if (low < half * 0.55 + 3) continue;
    if (out.some((c) => Math.hypot(c.x - x, c.z - z) < (c.s + s) * 0.22 && Math.abs(c.y - y) < 30)) continue;
    out.push({ x, y, z, s });
  }
  return out;
}

/** Keelhaven's mist (Medium and up), or null. */
export function createKeelhavenMist(tier: TierSettings): MistCards | null {
  const cards = keelhavenMistCards(COUNT[tier.tier]);
  return cards.length > 0 ? createMistCards(cards, LOOK) : null;
}
