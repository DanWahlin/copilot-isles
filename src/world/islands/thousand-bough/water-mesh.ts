import { createMeridianWaterMesh } from '../meridian-water-mesh';
import type { WaterStrips } from '../../sites/water';
import { thousandBoughHeight, thousandBoughWater } from './height';
import { keptStreamStones } from './stream-stones';
import { GREAT_FALLS_CURTAIN } from './water';
import { THOUSAND_BOUGH as TB } from './layout';

/** Rows down the curtain and columns across it. */
const ROWS = 24;
const COLS = 8;

/** Where the curtain hangs at height y: out from the lip like water leaving it, landing at its foot. */
export function curtainZ(y: number): number {
  const c = GREAT_FALLS_CURTAIN;
  const drop = c.lip.y - y;
  const k = (c.footZ - c.lip.z) / Math.sqrt(c.lip.y - CURTAIN_FOOT_Y);
  return c.lip.z + k * Math.sqrt(Math.max(0, drop));
}

/** The curtain lands just under the Mirror Pool's surface. */
export const CURTAIN_FOOT_Y = 14.8;

/**
 * Thousand-Bough's fresh water as one static mesh in the shared flowing-water material (no new
 * program): the pools and the streams as natural water (its depth taken from `ground`, the drawn
 * ground), white water round the streams' stones and spreading under each fall, the Veil and Silver
 * Thread down their cliffs, and Great Falls' curtain hanging clear of its cliff (white, streaked,
 * fast), so there's room to walk behind it.
 */
export function createThousandBoughWaterMesh(
  ground: (x: number, z: number) => number = thousandBoughHeight,
  /** The share of the streams' stones the tier keeps (the rocks draw the same ones). */
  stoneShare = 1,
): WaterStrips {
  const falls = TB.water.falls;
  return createMeridianWaterMesh(thousandBoughWater(), {
    name: 'thousand-bough fresh water',
    maxQuads: 3800,
    natural: {
      ground,
      plunges: [
        { x: falls[0]!.foot.x, z: falls[0]!.foot.z, r: falls[0]!.width * 0.6 + 3 },
        { x: falls[1]!.foot.x, z: falls[1]!.foot.z, r: falls[1]!.width + 3 },
        { x: GREAT_FALLS_CURTAIN.lip.x, z: GREAT_FALLS_CURTAIN.footZ + 2, r: falls[2]!.width * 0.62 + 2 },
      ],
      stones: keptStreamStones(stoneShare).filter((s) => s.inBed),
    },
    extra: (strips) => {
      const c = GREAT_FALLS_CURTAIN;
      for (let r = 0; r < ROWS; r++) {
        const ya = c.lip.y - ((c.lip.y - CURTAIN_FOOT_Y) * r) / ROWS;
        const yb = c.lip.y - ((c.lip.y - CURTAIN_FOOT_Y) * (r + 1)) / ROWS;
        // It fans out a little as it falls.
        const wa = 1 + (r / ROWS) * 0.14;
        const wb = 1 + ((r + 1) / ROWS) * 0.14;
        for (let k = 0; k < COLS; k++) {
          const ua = (k / COLS - 0.5) * c.width;
          const ub = ((k + 1) / COLS - 0.5) * c.width;
          const bulge = (u: number) => Math.cos((u / c.width) * Math.PI) * 0.8;
          strips.quad(
            [c.lip.x + ua * wa, ya, curtainZ(ya) + bulge(ua)],
            [c.lip.x + ub * wa, ya, curtainZ(ya) + bulge(ub)],
            [c.lip.x + ua * wb, yb, curtainZ(yb) + bulge(ua)],
            [c.lip.x + ub * wb, yb, curtainZ(yb) + bulge(ub)],
            c.lip.y - ya,
            c.lip.y - yb,
            // White at the lip and in the churn where it lands.
            { fill: 1, speed: 3.4, foam: r < 2 ? 1 : r >= ROWS - 3 ? 0.9 : 0.35, kind: -1 },
            // Across the whole sheet 0 → 1 (its streaks and ragged edges run on it).
            k / COLS,
            (k + 1) / COLS,
          );
        }
      }
      // Water running down the Header Race from the Upper Pool into the Flume Terrace's header trough.
      {
        const F = TB.flume;
        const race = TB.water.headerRace;
        const top = TB.pools.upper.level + 0.1;
        const hy = F.rowY[0]! + 0.2;
        const hz = F.rows[0]! - F.tile / 2 - 1.3;
        const end = { x: race.to.x, y: hy + 0.15, z: hz - 0.9 };
        const n = 8;
        const len = Math.hypot(end.x - race.from.x, end.z - race.from.z);
        const ux = (end.x - race.from.x) / len;
        const uz = (end.z - race.from.z) / len;
        const w = race.width * 0.4;
        for (let k = 0; k < n; k++) {
          const p = (t: number, side: number): [number, number, number] => [
            race.from.x + (end.x - race.from.x) * t - uz * w * side,
            top + (end.y - top) * t + 0.13,
            race.from.z + (end.z - race.from.z) * t + ux * w * side,
          ];
          strips.quad(
            p(k / n, -1),
            p(k / n, 1),
            p((k + 1) / n, -1),
            p((k + 1) / n, 1),
            (len * k) / n,
            (len * (k + 1)) / n,
            { fill: 0.9, speed: 2.4, foam: 0.15, kind: 0 },
            0,
            1,
          );
        }
      }
    },
  });
}
