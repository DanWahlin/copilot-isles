import { segmentDistance, smoothstep } from '../../../util/math';
import type { FloraRules } from '../../flora/types';
import { THOUSAND_BOUGH_FLORA_PALETTE } from './flora-palette';
import { thousandBoughWater } from './height';
import { THOUSAND_BOUGH as TB, TREE, type Xz } from './layout';

/** Distance (m) to the nearest of a path's legs. */
function pathDistance(points: readonly Xz[], x: number, z: number): number {
  let d = Infinity;
  for (let i = 0; i < points.length - 1; i++)
    d = Math.min(d, segmentDistance(x, z, points[i]!.x, points[i]!.z, points[i + 1]!.x, points[i + 1]!.z));
  return d;
}

/** Off the paths, the stops' clearings, the Root Hall, the Flume Terrace, the Spire and the cave. */
function clear(x: number, z: number): boolean {
  if (pathDistance(TB.fernWalk.points, x, z) < TB.fernWalk.width / 2 + 0.4) return false;
  if (pathDistance(TB.sidePaths.mirror, x, z) < 1.6) return false;
  if (pathDistance(TB.sidePaths.westBeach, x, z) < 1.5) return false;
  if (pathDistance(TB.sidePaths.caveLedge, x, z) < 2) return false;
  for (const a of Object.values(TB.anchors)) if (Math.hypot(x - a.x, z - a.z) < 3) return false;
  if (Math.hypot(x - TREE.x, z - TREE.z) < TB.rootHall.rOuter + 1) return false;
  if (x > 1996 && x < 2021 && z > -1634 && z < -1610) return false;
  if (Math.hypot(x - TB.spire.x, z - TB.spire.z) < 9) return false;
  if (Math.hypot(x - TB.cave.mouth.x, z - TB.cave.mouth.z) < 11) return false;
  return true;
}

/** Where the falls' spray wets the ground (m from a fall's foot). */
const SPRAY = 24;

/** Distance (m) to the nearest fall's foot. */
function fallsDistance(x: number, z: number): number {
  let d = Infinity;
  for (const f of TB.water.falls) d = Math.min(d, Math.hypot(x - f.foot.x, z - f.foot.z));
  return d;
}

/**
 * Where Thousand-Bough's flora grows: moss cushions, ferns and the forest flowers across the valley
 * floor, the bank flowers within a few metres of its streams and pools, and the glowing mushrooms in
 * the falls' spray. Nothing in the water, on a path or in a stop's clearing.
 */
export const THOUSAND_BOUGH_FLORA: FloraRules = {
  palette: THOUSAND_BOUGH_FLORA_PALETTE,
  bounds: { minX: 1830, maxX: 2190, minZ: -1690, maxZ: -1400 },
  flowersPerCell: 50,
  bladeDensity: 0.3,
  habitatFill: { forest: 0.4, bank: 0.6, spray: 0.7 },
  habitatAt(x, z, y, masks, _field, out) {
    if (y < 1.5) return null;
    if (masks.cliff > 0.3 || masks.sand > 0.5) return null;
    const shore = thousandBoughWater().shoreDistance(x, z, 8);
    if (shore < 0.7) return null;
    if (!clear(x, z)) return null;
    out.habitat = fallsDistance(x, z) < SPRAY ? 'spray' : shore < 5 ? 'bank' : 'forest';
    out.kind = 'moss';
    out.weight = masks.grass * (1 - masks.rock * 0.7) * (0.7 + (1 - smoothstep(2, 8, shore)) * 0.5);
    out.ramp = 0.12 + smoothstep(4, 30, shore) * 0.12;
    return out;
  },
};
