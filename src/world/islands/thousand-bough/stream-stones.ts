import { THOUSAND_BOUGH as TB } from './layout';
import { fernWalkAt, thousandBoughHeight, thousandBoughWater } from './height';
import { villageWalkable } from './village/surfaces';
import { placeStreamStones, streamStoneKept, type StreamStone } from '../stream-stones';

let stones: StreamStone[] | null = null;

/** The stream stones a tier keeps (`share` of them; see `SMALL_ROCKS`). */
export function keptStreamStones(share: number): StreamStone[] {
  return thousandBoughStreamStones().filter((_, i) => streamStoneKept(i, share));
}

/**
 * The stones of Silver Run, Fernrun and Thunder Run (`placeStreamStones`). The rocks draw them
 * (instanced, in the island's rock material) and the water foams round the ones in the bed. None
 * under the plank bridge, on a walk, by a cast member's spot, a chest, a bottle or the starfish.
 */
export function thousandBoughStreamStones(): StreamStone[] {
  if (stones) return stones;
  const b0 = TB.bridges.find((b) => b.id === 'B0')!;
  const keepClear = [
    ...Object.values(TB.anchors).map((a) => ({ x: a.x, z: a.z, r: 3 })),
    ...TB.chests.map((c) => ({ x: c.x, z: c.z, r: 2 })),
    ...TB.bottles.map((c) => ({ x: c.x, z: c.z, r: 2 })),
    ...TB.starfish.map((c) => ({ x: c.x, z: c.z, r: 3 })),
    { x: (b0.from.x + b0.to.x) / 2, z: (b0.from.z + b0.to.z) / 2, r: 7 },
  ];
  stones = placeStreamStones(thousandBoughWater(), 0x57a7e5, thousandBoughHeight, (x, z, r) => {
    if (keepClear.some((c) => Math.hypot(c.x - x, c.z - z) < c.r + r)) return false;
    if (villageWalkable(x, z) !== null) return false;
    const walk = fernWalkAt(x, z);
    return !(walk && walk.d < TB.fernWalk.width / 2 + 1 + r);
  });
  return stones;
}
