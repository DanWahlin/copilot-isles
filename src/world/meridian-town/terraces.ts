import type { Tier } from '../contracts';
import { MERIDIAN } from '../islands/meridian';

/**
 * Port Meridian's terraced streets and the houses along them (pure data and layout, shared by the
 * town and the opening chart's miniature, so the chart's houses stand where the town's do).
 */
export const TERRACOTTA = 0xffa040;
export const TERRACOTTA_DARK = 0xe58e42;
export const TERRACOTTA_WARM = 0xffad48;
export const LIMESTONE_LIGHT = 0xf0d7aa;
export const OCHRE = 0xc07b35;
export const CREAM = 0xe0bc7a;
export const ROSE = 0xc06a69;
export const APRICOT = 0xd99a5f;
export const WHITEWASH = 0xf3e4be;
export const SAFFRON = 0xd28a32;

export interface TerraceRowSpec {
  id: string;
  x0: number;
  x1: number;
  houseZ: number;
  laneZ: number;
  height: number;
  laneWidth: number;
  seed: number;
  gaps?: readonly { x0: number; x1: number }[];
}

export const HARBOUR_FRONT_ROW: TerraceRowSpec = {
  id: 'harbour-front',
  x0: 594,
  x1: 758,
  houseZ: -786.2,
  laneZ: -778.8,
  height: MERIDIAN.pads.plaza.height,
  laneWidth: 4.2,
  seed: 520,
  gaps: [
    { x0: 607, x1: 631 },
    { x0: 638, x1: 682 },
  ],
} as const;

export const TERRACE_ROWS: readonly TerraceRowSpec[] = [
  {
    id: 'plaza-upper',
    x0: 586,
    x1: 756,
    houseZ: -848,
    laneZ: -839.8,
    height: 10.8,
    laneWidth: 3.8,
    seed: 620,
    gaps: [
      { x0: 640, x1: 699 },
      { x0: 607, x1: 615 },
      { x0: 727, x1: 735 },
    ],
  },
  {
    id: 'lower-ochre',
    x0: 592,
    x1: 780,
    houseZ: -870,
    laneZ: -861.8,
    height: 14.2,
    laneWidth: 3.7,
    seed: 700,
    gaps: [
      { x0: 606, x1: 614 },
      { x0: 664, x1: 672 },
      { x0: 728, x1: 736 },
    ],
  },
  {
    id: 'middle-salmon',
    x0: 604,
    x1: 792,
    houseZ: -892,
    laneZ: -883.8,
    height: 17.8,
    laneWidth: 3.7,
    seed: 780,
    gaps: [
      { x0: 606, x1: 614 },
      { x0: 664, x1: 672 },
      { x0: 728, x1: 736 },
      { x0: 782, x1: 790 },
    ],
  },
  {
    id: 'upper-cream',
    x0: 620,
    x1: 804,
    houseZ: -914,
    laneZ: -905.8,
    height: 21.4,
    laneWidth: 3.8,
    seed: 860,
    gaps: [
      { x0: 606, x1: 614 },
      { x0: 664, x1: 672 },
      { x0: 728, x1: 736 },
      { x0: 782, x1: 790 },
    ],
  },
  {
    id: 'citadel-foot',
    x0: 650,
    x1: 812,
    houseZ: -936,
    laneZ: -927.8,
    height: 25.0,
    laneWidth: 3.6,
    seed: 940,
    gaps: [
      { x0: 664, x1: 672 },
      { x0: 728, x1: 736 },
      { x0: 782, x1: 790 },
    ],
  },
  {
    id: 'top-whitewash',
    x0: 700,
    x1: 812,
    houseZ: -956,
    laneZ: -947.8,
    height: 28.6,
    laneWidth: 3.5,
    seed: 1020,
    gaps: [{ x0: 782, x1: 790 }],
  },
] as const;

export const MEDITERRANEAN_TINTS = [
  WHITEWASH,
  LIMESTONE_LIGHT,
  CREAM,
  OCHRE,
  SAFFRON,
  APRICOT,
  ROSE,
  0xd7a66f,
] as const;
export const ROOF_TINTS = [
  TERRACOTTA_WARM,
  TERRACOTTA,
  TERRACOTTA_DARK,
  0xf49a46,
  0xffb24d,
  0xef9650,
] as const;

export function rowGapContaining(row: TerraceRowSpec, x: number): { x0: number; x1: number } | null {
  return row.gaps?.find((gap) => x >= gap.x0 && x < gap.x1) ?? null;
}

function nextRowGapStart(row: TerraceRowSpec, x: number): number | null {
  const next = row.gaps?.filter((gap) => gap.x0 > x).sort((a, b) => a.x0 - b.x0)[0];
  return next?.x0 ?? null;
}

function houseWidthForAvailable(preferred: 4 | 6 | 8, available: number): 4 | 6 | 8 | null {
  if (available >= preferred) return preferred;
  if (available >= 8) return 8;
  if (available >= 6) return 6;
  if (available >= 4) return 4;
  return null;
}

/**
 * Whether a terrace keeps its back row of houses (they face uphill, mostly hidden). Alternate
 * terraces drop theirs for back gardens, which also saves triangles; Lite and Low keep only the
 * skyline's top row.
 */
export function terraceHasBackRow(row: TerraceRowSpec, tier: Tier): boolean {
  if (row === HARBOUR_FRONT_ROW) return false;
  if (tier === 'lite' || tier === 'low') return row.id === 'top-whitewash';
  return row.id === 'lower-ochre' || row.id === 'upper-cream' || row.id === 'top-whitewash';
}

export interface TerraceHouse {
  x: number;
  z: number;
  rotY: number;
  w: 4 | 6 | 8;
  d: 6 | 8;
  storeys: 2 | 3;
  tint: number;
  roofTint: number;
  roof: 'flat' | 'gable';
  seed: number;
}

/**
 * A row's run of houses (front or back), skipping its gaps (the stair streets), and the gaps it
 * crossed (the harbour front bridges them with arcades).
 */
export function terraceRun(
  row: TerraceRowSpec,
  backRow: boolean,
): { houses: TerraceHouse[]; gaps: { x0: number; x1: number }[] } {
  const widths: readonly (4 | 6 | 8)[] = [6, 4, 6, 8, 4, 6, 6, 8, 4, 6];
  const houses: TerraceHouse[] = [];
  const gaps: { x0: number; x1: number }[] = [];
  let x = row.x0 + (backRow ? 2.2 : 0);
  let index = 0;
  const stopX = row.x1 - (backRow ? 2.2 : 0);
  while (x < stopX - 3.8) {
    const containing = rowGapContaining(row, x + 0.1);
    if (containing) {
      gaps.push(containing);
      x = containing.x1;
      continue;
    }
    const nextGap = nextRowGapStart(row, x);
    const runEnd = Math.min(stopX, nextGap ?? stopX);
    const available = runEnd - x;
    const width = houseWidthForAvailable(widths[(row.seed + index) % widths.length]!, available);
    if (width === null) {
      x = runEnd + 0.01;
      continue;
    }
    const seed = row.seed + index;
    const depth: 6 | 8 = seed % 4 === 0 || width === 8 ? 8 : 6;
    const setback = ((seed % 4) - 1.5) * 0.12;
    houses.push({
      x: x + width * 0.5,
      z: backRow ? row.houseZ - 7.1 - setback : row.houseZ + setback,
      rotY: backRow ? 0 : Math.PI,
      w: width,
      d: depth,
      storeys: seed % 5 === 0 || row.height < 12 ? 3 : 2,
      tint: MEDITERRANEAN_TINTS[seed % MEDITERRANEAN_TINTS.length]!,
      roofTint: ROOF_TINTS[seed % ROOF_TINTS.length]!,
      roof: seed % 6 === 0 ? 'flat' : 'gable',
      seed,
    });
    x += width + (seed % 3 === 0 ? 0.16 : 0.04);
    index += 1;
  }
  return { houses, gaps };
}
