import type { ChartData, ChartPoint } from '../ui/bridge';
import { ARCHIPELAGO } from '../ui/chart/archipelago';
import { meridianOpen } from './meridian-open';
import { COVE } from '../world/layout';
import { extractShoreline } from '../world/terrain/bake';
import { coveHeight } from '../world/terrain/cove-height';

/** The island chart frame: a square around Anchorage Cay (x → east, z → south). */
const CHART_FRAME = { cx: 0, cz: 17.5, half: 330 };

const toChart = (x: number, z: number): [number, number] => [
  (x - CHART_FRAME.cx + CHART_FRAME.half) / (CHART_FRAME.half * 2),
  (z - CHART_FRAME.cz + CHART_FRAME.half) / (CHART_FRAME.half * 2),
];

export interface TravelPoint extends ChartPoint {
  wx: number;
  wz: number;
  heading: number;
}

/** Fast-travel points on Anchorage Cay (world positions → chart). */
export function coveTravelPoints(
  anchors: Record<string, { x: number; z: number; heading: number }>,
): TravelPoint[] {
  const pts: Omit<TravelPoint, 'x' | 'y'>[] = [
    {
      id: 'harbor',
      label: 'Harbor quay',
      kind: 'harbor',
      wx: COVE.spawn.x,
      wz: COVE.spawn.z,
      heading: Math.PI,
    },
    {
      id: 'pier',
      label: 'Brigantine berth',
      kind: 'harbor',
      wx: COVE.pier.x + 0.9,
      wz: -111.8,
      heading: Math.PI / 2,
    },
    {
      id: 'plaza',
      label: 'Village plaza',
      kind: 'landmark',
      wx: COVE.village.center.x + 4,
      wz: COVE.village.center.z + 4,
      heading: 0,
    },
    { id: 'beach', label: 'Lagoon beach', kind: 'beach', wx: 10, wz: 96, heading: 0 },
    {
      id: 'hill',
      label: 'Hilltop',
      kind: 'landmark',
      wx: COVE.hill.center.x,
      wz: COVE.hill.center.z,
      heading: 0.6,
    },
  ];
  const lh = anchors.lighthouseDoor;
  // Door anchors face outward: stand a few metres out, facing the door, so the camera stays outside.
  if (lh)
    pts.splice(2, 0, {
      id: 'lighthouse',
      label: 'Point lighthouse',
      kind: 'landmark',
      wx: lh.x + Math.sin(lh.heading) * 3.6,
      wz: lh.z + Math.cos(lh.heading) * 3.6,
      heading: lh.heading + Math.PI,
    });
  const nell = anchors.harbourmasterDoor;
  if (nell)
    pts.push({
      id: 'nell',
      label: "Harbormaster's house",
      kind: 'quest',
      wx: nell.x + Math.sin(nell.heading) * 3.4,
      wz: nell.z + Math.cos(nell.heading) * 3.4,
      heading: nell.heading + Math.PI,
    });
  const bard = anchors.bardHammock;
  if (bard)
    pts.push({
      id: 'bard',
      label: 'Bard’s hammock',
      kind: 'quest',
      wx: bard.x,
      wz: bard.z,
      heading: bard.heading,
    });
  return pts.map((p) => {
    const [x, y] = toChart(p.wx, p.wz);
    return { ...p, x, y };
  });
}

let cachedCoast: { coast: [number, number][][]; reef: [number, number][][] } | null = null;

/** Coast (h = 0) and shallows (h = −2.5) contours from the analytic cove height, in chart space. */
function coveCoast(cell = 4): { coast: [number, number][][]; reef: [number, number][][] } {
  if (cachedCoast) return cachedCoast;
  const { cx, cz, half } = CHART_FRAME;
  const minX = cx - half,
    minZ = cz - half;
  const n = Math.ceil((half * 2) / cell) + 1;
  const heights = new Float32Array(n * n);
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) heights[j * n + i] = coveHeight(minX + i * cell, minZ + j * cell);
  const ring = (level: number) => {
    const shifted = level === 0 ? heights : heights.map((h) => h - level);
    return extractShoreline(shifted, n, n, minX, minZ, cell)
      .filter((c) => c.length > cell * 6)
      .map((c) =>
        simplify(
          c.points.map((p) => toChart(p.x, p.z)),
          0.0012,
        ),
      );
  };
  cachedCoast = { coast: ring(0), reef: ring(-2.5) };
  return cachedCoast;
}

/** Works out the Chart's coastlines ahead (the title does, while idle), so the Chart opens at once. */
export function prewarmChart(): void {
  coveCoast();
}

export function buildChart(
  anchors: Record<string, { x: number; z: number; heading: number }>,
  player: { x: number; z: number; heading: number; onShip: boolean } | null,
  here: string = 'anchorage',
): ChartData {
  const { coast, reef } = coveCoast();
  const points = coveTravelPoints(anchors).map(({ id, label, kind, x, y }) => ({ id, label, kind, x, y }));
  // The island you're on is current; the others you can reach are charted.
  const open = new Set(['anchorage', ...(meridianOpen() ? ['meridian'] : [])]);
  const islands = ARCHIPELAGO.map((i) =>
    open.has(i.id) ? { ...i, status: i.id === here ? ('current' as const) : ('visited' as const) } : i,
  );
  let p: ChartData['player'] = null;
  // The island detail is Anchorage's chart, so only mark the player there.
  if (player && here === 'anchorage') {
    const [x, y] = toChart(player.x, player.z);
    // World heading: forward = (sin h, cos h) with +z south, so clockwise-from-north = π − h.
    p = { x, y, heading: wrap(Math.PI - player.heading), onShip: player.onShip };
  }
  return {
    islands,
    island: { id: 'anchorage', name: 'Anchorage Cay', coast, reef, points },
    player: p,
  };
}

function wrap(a: number): number {
  const t = Math.PI * 2;
  return ((a % t) + t) % t;
}

/** Radial-distance polyline simplification (cheap, good enough for ink lines). */
function simplify(pts: [number, number][], eps: number): [number, number][] {
  if (pts.length < 3) return pts;
  const out: [number, number][] = [pts[0]!];
  let last = pts[0]!;
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i]!;
    if (Math.hypot(p[0] - last[0], p[1] - last[1]) >= eps) {
      out.push(p);
      last = p;
    }
  }
  out.push(pts[pts.length - 1]!);
  return out;
}
