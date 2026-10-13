import { ARCHIPELAGO, ARCH_H, ARCH_W } from '../ui/chart/archipelago';
import { coveHeight, coveMasks } from '../world/terrain/cove-height';
import { meridianHeight, meridianMasks } from '../world/islands/meridian';
import { thousandBoughHeight, thousandBoughMasks } from '../world/islands/thousand-bough/height';
import { THOUSAND_BOUGH } from '../world/islands/thousand-bough/layout';

/**
 * The living chart's map (docs/specs/OPENING-living-chart.md): the parchment's size on the desk, and
 * where each real island sits on it. Paper-local coordinates are metres: x → east, z → south, y up,
 * centred on the sheet. Islands keep the archipelago chart's layout (src/ui/chart/archipelago.ts), and
 * each one is its real terrain at a small scale, so Anchorage's chart point lines up with the world
 * and the dive lands exactly where its arrival flyover starts.
 */
export const CHART_W = 1.0;
export const CHART_D = (CHART_W * ARCH_H) / ARCH_W;
/**
 * The miniatures stand a little taller than true scale (a relief model's usual exaggeration), so the
 * hills read from across the desk without turning into spikes.
 */
export const CHART_LIFT = 1.6;

export type ChartIslandId = 'anchorage' | 'meridian' | 'thousand-bough';

export interface ChartIslandSource {
  id: ChartIslandId;
  /** World point drawn at the island's archipelago position (the middle of its land). */
  cx: number;
  cz: number;
  /** Chart metres per world metre. */
  scale: number;
  /** The world box sampled for the miniature (land plus its shallows), and the sample spacing. */
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  cell: number;
  /** The island's baked terrain pack (under the packs base), resampled for the miniature. */
  pack: string;
  height(x: number, z: number): number;
  masks(x: number, z: number): { sand: number; grass: number; rock: number; cliff: number };
  /** Height added over the baked terrain for a landmark it doesn't hold (a raised canopy dome). */
  relief?(x: number, z: number): number;
}

export const CHART_ISLANDS: readonly ChartIslandSource[] = [
  {
    id: 'anchorage',
    cx: 58,
    cz: 54,
    scale: 1 / 2200,
    minX: -190,
    maxX: 300,
    minZ: -135,
    maxZ: 240,
    cell: 5,
    pack: 'testcove/terrain',
    height: coveHeight,
    masks: coveMasks,
  },
  {
    id: 'meridian',
    cx: 915,
    cz: -893,
    scale: 1 / 3400,
    minX: 480,
    maxX: 1350,
    minZ: -1200,
    maxZ: -585,
    cell: 8,
    pack: 'meridian/terrain',
    height: meridianHeight,
    masks: meridianMasks,
  },
  {
    id: 'thousand-bough',
    cx: 2050,
    cz: -1510,
    // A little smaller than true to its neighbours, so its outline stays clear of Port Meridian's.
    scale: 1 / 6000,
    minX: 1690,
    maxX: 2410,
    minZ: -1840,
    maxZ: -1180,
    cell: 8,
    pack: 'thousand-bough/terrain',
    height: thousandBoughHeight,
    masks: thousandBoughMasks,
    // The great banyan's crown, one raised dome over the valley (spec §2.6).
    relief: (x, z) => {
      const t = THOUSAND_BOUGH.tree;
      const d = Math.hypot(x - t.x, z - t.z) / 58;
      return d < 1 ? 46 * Math.sqrt(1 - d * d) : 0;
    },
  },
];

export function chartIsland(id: ChartIslandId): ChartIslandSource {
  return CHART_ISLANDS.find((i) => i.id === id)!;
}

/**
 * The 3D chart draws the archipelago's layout drawn in toward the middle, so the sea runs all the
 * way round every island and the parchment shows as a border (the cartouche sits on it).
 */
export const SHEET_INSET = 0.8;

/** A point on the archipelago chart (0-1 across and down) → where it sits on the 3D sheet (0-1). */
export function sheetUV(x: number, y: number): { u: number; v: number } {
  return { u: 0.5 + (x - 0.5) * SHEET_INSET, v: 0.5 + (y - 0.5) * SHEET_INSET };
}

/**
 * The cartouche (the chart's title) in the bottom-right corner of the parchment border: its centre
 * (0-1 on the sheet) and half-size in metres. The sea keeps clear of it.
 */
export const CARTOUCHE = { u: 0.79, v: 0.895, halfW: 0.15, halfD: 0.045 };

/** The sheet position (0-1 across and down) of a course island. */
export function artPoint(id: string): { u: number; v: number } {
  const i = ARCHIPELAGO.find((a) => a.id === id) ?? ARCHIPELAGO[0]!;
  return sheetUV(i.x, i.y);
}

/** A world point on `island` → paper-local metres (y is height above the paper). */
export function worldToPaper(
  island: ChartIslandSource,
  x: number,
  y: number,
  z: number,
  out: { x: number; y: number; z: number },
): void {
  const a = artPoint(island.id);
  out.x = (a.u - 0.5) * CHART_W + (x - island.cx) * island.scale;
  out.z = (a.v - 0.5) * CHART_D + (z - island.cz) * island.scale;
  out.y = y * island.scale * CHART_LIFT;
}
