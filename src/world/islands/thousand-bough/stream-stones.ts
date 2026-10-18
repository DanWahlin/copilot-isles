import { mulberry32, smoothstep } from '../../../util/math';
import { THOUSAND_BOUGH as TB } from './layout';
import { fernWalkAt, thousandBoughHeight, thousandBoughWater } from './height';
import { villageWalkable } from './village/surfaces';

/** A stone in or beside one of the island's natural streams. */
export interface StreamStone {
  x: number;
  z: number;
  /** Radius (m). */
  r: number;
  /** Where its top stands (a stone in the bed just breaks the surface; the water foams round it). */
  top: number;
  /** In the water (white water round it) rather than on the bank. */
  inBed: boolean;
}

let stones: StreamStone[] | null = null;

/**
 * Whether the `i`th stream stone stays on a tier that keeps `share` of the island's small stones
 * (an even, seeded thinning, so the rocks and the water's white water agree on which are there).
 */
export function streamStoneKept(i: number, share: number): boolean {
  return (i * 0.6180339887498949 + 0.31) % 1 < share;
}

/** The stream stones a tier keeps (`share` of them; see `SMALL_ROCKS`). */
export function keptStreamStones(share: number): StreamStone[] {
  return thousandBoughStreamStones().filter((_, i) => streamStoneKept(i, share));
}

/**
 * The stones of Silver Run, Fernrun and Thunder Run (seeded, pure): stones breaking the surface in
 * the bed, most in the narrow riffles, and a few along the banks. The rocks draw them (instanced, in
 * the island's rock material) and the water foams round the ones in the bed. None under the plank
 * bridge, on a walk, by a cast member's spot, a chest, a bottle or the starfish, or in a pool.
 */
export function thousandBoughStreamStones(): StreamStone[] {
  if (stones) return stones;
  const water = thousandBoughWater();
  const rand = mulberry32(0x57a7e5);
  const out: StreamStone[] = [];
  const b0 = TB.bridges.find((b) => b.id === 'B0')!;
  const keepClear = [
    ...Object.values(TB.anchors).map((a) => ({ x: a.x, z: a.z, r: 3 })),
    ...TB.chests.map((c) => ({ x: c.x, z: c.z, r: 2 })),
    ...TB.bottles.map((c) => ({ x: c.x, z: c.z, r: 2 })),
    ...TB.starfish.map((c) => ({ x: c.x, z: c.z, r: 3 })),
    { x: (b0.from.x + b0.to.x) / 2, z: (b0.from.z + b0.to.z) / 2, r: 7 },
  ];
  const place = (x: number, z: number, r: number, top: number, inBed: boolean) => {
    if (water.basinAt(x, z, 1.25)) return;
    if (keepClear.some((c) => Math.hypot(c.x - x, c.z - z) < c.r + r)) return;
    if (villageWalkable(x, z) !== null) return;
    const walk = fernWalkAt(x, z);
    if (walk && walk.d < TB.fernWalk.width / 2 + 1 + r) return;
    if (out.some((o) => Math.hypot(o.x - x, o.z - z) < o.r + r + 0.5)) return;
    out.push({ x, z, r, top, inBed });
  };
  for (const s of water.streams) {
    if (!s.spec.course) continue;
    let meanHalf = 0;
    for (let i = 0; i < s.count; i++) meanHalf += s.half[i]! / s.count;
    for (let i = 3; i < s.count - 3; i++) {
      const tx = s.x[i + 1]! - s.x[i - 1]!;
      const tz = s.z[i + 1]! - s.z[i - 1]!;
      const tl = Math.hypot(tx, tz) || 1;
      const half = s.half[i]!;
      // Riffles (narrow, fast) are stony; slow, wide reaches have the odd one.
      const narrow = smoothstep(1.02, 0.78, half / meanHalf);
      const at = (d: number): [number, number] => [s.x[i]! - (tz / tl) * d, s.z[i]! + (tx / tl) * d];
      if (rand() < 0.14 + narrow * 0.4) {
        const d = (rand() * 2 - 1) * 0.6 * half;
        const [x, z] = at(d);
        const r = 0.3 + rand() * 0.3 + narrow * 0.15;
        place(x, z, r, s.surface[i]! + 0.1 + rand() * 0.22, true);
      }
      if (rand() < 0.16) {
        const side = rand() < 0.5 ? -1 : 1;
        const d = side * (half * 1.04 + 0.15 + rand() * 0.6);
        const [x, z] = at(d);
        const r = 0.28 + rand() * 0.34;
        place(x, z, r, Math.max(s.surface[i]! + 0.1, thousandBoughHeight(x, z) + r * 0.7), false);
      }
    }
  }
  stones = out;
  return out;
}
