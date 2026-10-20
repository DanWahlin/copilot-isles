import { smoothstep } from '../../util/math';
import type { FloraRules } from '../flora/types';
import { MERIDIAN_FLORA_PALETTE } from './meridian-flora-palette';
import { meridianPlantExcluded } from './meridian-plants';

/** The town's walls, which the bougainvillea hedges hug from outside. */
const TOWN = { x0: 552, x1: 852, z0: -992, z1: -738 } as const;

/** Distance (m) outside the town's walls (0 inside). */
function outsideTown(x: number, z: number): number {
  const dx = Math.max(TOWN.x0 - x, 0, x - TOWN.x1);
  const dz = Math.max(TOWN.z0 - z, 0, z - TOWN.z1);
  return Math.hypot(dx, dz);
}

/**
 * Where Meridian's flora grows: the hills round the town where you walk (the dry meadow, a sparse
 * golden sward), with the bougainvillea in a band just outside the town's walls. The town, the
 * citadel, the harbour works, the caves and the fresh water stay clear (`meridianPlantExcluded`).
 */
export const MERIDIAN_FLORA: FloraRules = {
  palette: MERIDIAN_FLORA_PALETTE,
  bounds: { minX: 470, maxX: 1060, minZ: -1090, maxZ: -600 },
  flowersPerCell: 110,
  bladeDensity: 0.75,
  habitatAt(x, z, y, masks, _field, out) {
    if (y < 2.4) return null;
    if (masks.cliff > 0.3 || masks.sand > 0.55 || masks.rock > 0.7) return null;
    if (meridianPlantExcluded(x, z)) return null;
    const hedge = outsideTown(x, z) < 14;
    out.habitat = hedge ? 'village' : 'meadow';
    out.kind = 'meadow';
    // Thinner on rocky ground and up high, where the maquis takes over.
    out.weight = masks.grass * (1 - masks.rock * 0.8) * (1 - smoothstep(60, 110, y)) * 1.1;
    // Greener in the low hollows by the water, gold on the open hills.
    out.ramp = 0.6 + smoothstep(8, 40, y) * 0.28;
    return out;
  },
};
