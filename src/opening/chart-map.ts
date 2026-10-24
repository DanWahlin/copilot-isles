import { ISLAND_LIST, type IslandId } from '../islands/registry';
import type { IslandChart, IslandChartTerrain } from '../islands/types';
import { ARCHIPELAGO, ARCH_H, ARCH_W } from '../ui/chart/archipelago';

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

/** Every island in the registry has a miniature here (its terrain's height and masks). */
export type ChartIslandId = IslandId;

/** Where an island's miniature sits on the chart and what it samples (its registry entry's `chart`). */
export interface ChartIslandPlace extends Omit<IslandChart, 'terrain'> {
  id: ChartIslandId;
}

/** An island's miniature with its terrain functions, once they're loaded (`loadChartIslands`). */
export interface ChartIslandSource extends ChartIslandPlace, IslandChartTerrain {}

/** The 3D chart's islands, in voyage order: every island in the registry (its entry's `chart`). */
export const CHART_ISLANDS: readonly ChartIslandPlace[] = ISLAND_LIST.map((e) => {
  const { cx, cz, scale, minX, maxX, minZ, maxZ, cell, pack } = e.chart;
  return { id: e.id, cx, cz, scale, minX, maxX, minZ, maxZ, cell, pack };
});

export function chartIsland(id: ChartIslandId): ChartIslandPlace {
  return CHART_ISLANDS.find((i) => i.id === id)!;
}

/**
 * Every island's miniature with its terrain functions: each island's are a dynamic import of its
 * own (they're the world's height and masks), so the chart waits for them with the terrain packs.
 * Asked once (the opening asks as it's made, so the modules load where its chunk used to hold them).
 */
let chartIslands: Promise<ChartIslandSource[]> | null = null;
export function loadChartIslands(): Promise<ChartIslandSource[]> {
  chartIslands ??= Promise.all(
    ISLAND_LIST.map(async (e, i) => ({ ...CHART_ISLANDS[i]!, ...(await e.chart.terrain()) })),
  );
  chartIslands.catch(() => (chartIslands = null));
  return chartIslands;
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
  island: ChartIslandPlace,
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
