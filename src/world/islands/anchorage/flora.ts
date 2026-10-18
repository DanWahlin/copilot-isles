import { COVE } from '../../layout';
import { villageGroundWeight } from '../../terrain/cove-height';
import { smoothstep } from '../../../util/math';
import type { FloraRules } from '../../flora/types';
import { ANCHORAGE_FLORA_PALETTE } from './flora-palette';
import { ANCHORAGE_VEGETATION } from './vegetation-rules';

/** Where Anchorage's grass and flowers grow (the meadow, the dunes and the village lawns). */
export const ANCHORAGE_FLORA: FloraRules = {
  palette: ANCHORAGE_FLORA_PALETTE,
  bounds: ANCHORAGE_VEGETATION.grassBounds,
  flowersPerCell: 140,
  bladeDensity: 1,
  habitatAt(x, z, y, masks, _field, out) {
    if (y < 0.2) return null;
    if (masks.rock > 0.55 || masks.cliff > 0.2) return null;
    // Village lawns: short meadow tufts that thin out where the ground is worn (sand there is earth).
    if (villageGroundWeight(x, z, y) > 0.5) {
      const lawn = masks.grass * (1 - smoothstep(0.15, 0.5, masks.sand));
      out.habitat = 'village';
      out.weight = lawn * smoothstep(1, 8, y) * 1.25;
      out.kind = 'meadow';
      out.ramp = 0.48;
      return out;
    }
    const seaOats =
      masks.sand * smoothstep(0.38, 1.1, y) * (1 - smoothstep(3.6, 6.2, y)) * (0.72 + masks.grass * 0.42);
    if (seaOats > 0.16) {
      out.habitat = 'dune';
      out.weight = seaOats * 0.8;
      out.kind = 'seaOats';
      out.ramp = 0.82;
      return out;
    }
    if (masks.sand > 0.78) return null;
    const hill = masks.grass * smoothstep(1, 8, y) * (1 - masks.sand * 0.9) * (1 - masks.rock * 0.85);
    const creeper = masks.sand * (1 - smoothstep(1.2, 4, y));
    if (creeper > 0.2) {
      out.habitat = 'dune';
      out.weight = creeper * 0.35;
      out.kind = 'creeper';
      out.ramp = 0.3;
      return out;
    }
    out.habitat = 'meadow';
    out.weight = hill * 1.25;
    out.kind = 'meadow';
    // Lusher in the hollows, sun-bleached toward the hilltops and the headland's shoulders.
    out.ramp =
      0.42 + smoothstep(10, 34, y) * 0.2 + smoothstep(COVE.headland.x0 - 40, COVE.headland.x0, x) * 0.06;
    return out;
  },
};
