import { smoothstep } from '../../../util/math';
import type { FloraRules } from '../../flora/types';
import { KEELHAVEN_FLORA_PALETTE } from './flora-palette';
import { keelhavenWater } from './height';
import { KEELHAVEN as K, toFrame, toWorld } from './layout';
import { inTown } from './town';
import { inWorks } from './works';

/** Where the falls' spray wets the ground (m from a fall's foot). */
const SPRAY = 26;

const FRAME = { u: 0, v: 0 };
const ribbonFoot = (() => {
  const line = K.water.ribbon.line;
  const [u, v] = line[line.length - 1]!;
  return toWorld(u, v);
})();

/**
 * Where Keelhaven's flora grows: the cove you walk (the beach's back, the town shelf and the valley
 * floor). The shelf is open sward with drifts of plumeria and red ginger; the valley floor a forest
 * floor of ferns and ti; ginger and ti along the river's banks; ferns in Ribbon Falls' spray; naupaka
 * on the sand at the back of the beach. Nothing in the water or on the walls.
 */
export const KEELHAVEN_FLORA: FloraRules = {
  palette: KEELHAVEN_FLORA_PALETTE,
  bounds: { minX: 3690, maxX: 4230, minZ: -1970, maxZ: -1480 },
  flowersPerCell: 70,
  bladeDensity: 0.6,
  habitatFill: { forest: 0.35, bank: 0.6, spray: 0.7, dune: 0.4 },
  habitatAt(x, z, y, masks, field, out) {
    if (y < 0.9) return null;
    if (masks.cliff > 0.3 || masks.rock > 0.6) return null;
    const n = field.normalAt(x, z, NORMAL);
    if (n[1]! < 0.72) return null;
    toFrame(x, z, FRAME);
    if (inWorks(FRAME.u, FRAME.v) || inTown(FRAME.u, FRAME.v)) return null;
    const shore = keelhavenWater().shoreDistance(x, z, 8);
    if (shore < 0.7) return null;
    const shelf = K.townShelf;
    const onShelf =
      FRAME.u > shelf.u0 - 10 && FRAME.u < shelf.u1 + 6 && Math.abs(FRAME.v) < shelf.halfWidth + 6;
    if (masks.sand > 0.5) {
      // Only the back of the beach (the wet sand by the sea stays bare).
      if (y < 2.2) return null;
      out.habitat = 'dune';
      out.kind = 'creeper';
      out.weight = 0.5 * smoothstep(2.2, 3.2, y);
      out.ramp = 0.5;
      return out;
    }
    const spray = Math.hypot(x - ribbonFoot.x, z - ribbonFoot.z) < SPRAY;
    out.habitat = spray ? 'spray' : shore < 5 ? 'bank' : onShelf ? 'meadow' : 'forest';
    out.kind = onShelf ? 'meadow' : 'moss';
    out.weight = masks.grass * (1 - masks.rock * 0.7) * (onShelf ? 1.1 : 0.8);
    // Lush and green; a little paler on the open shelf in the sun.
    out.ramp = onShelf ? 0.42 + smoothstep(3, 8, y) * 0.12 : 0.18 + smoothstep(4, 30, shore) * 0.1;
    return out;
  },
};

const NORMAL = [0, 1, 0];
