/**
 * P0.1 Sluice & Waterwheel (POC §4.5): a grid of rotatable channel tiles between the Actions spring
 * and the waterwheel. Pure logic (no three.js) so the flow and the single solution are unit-tested.
 *
 * Grid coordinates: row 0 is at the spring, the last row is at the wheel. Directions are sides of a
 * cell: N (toward the wheel, row + 1), E (col + 1), S (toward the spring, row − 1), W (col − 1).
 */
export const N = 0;
export const E = 1;
export const S = 2;
export const W = 3;
export type Dir = 0 | 1 | 2 | 3;

export type TileKind = 'straight' | 'corner' | 'cap' | 'blank';

/** Openings at rotation 0, one bit per side (bit d = side d is open). */
const BASE: Record<TileKind, number> = {
  straight: (1 << N) | (1 << S),
  corner: (1 << N) | (1 << E),
  cap: 1 << N,
  blank: 0,
};

export interface SluiceTile {
  kind: TileKind;
  /** Quarter turns clockwise (seen from above) that solve the puzzle; ignored for caps and blanks. */
  solution: number;
  /** Starting quarter turns. */
  start: number;
}

export interface SluiceLayout {
  rows: number;
  cols: number;
  /** Row-major, `rows × cols`. */
  tiles: readonly SluiceTile[];
  /** The spring feeds this cell through its `side`. */
  source: { row: number; col: number; side: Dir };
  /** Water leaving this cell through `side` reaches the wheel. */
  outlet: { row: number; col: number; side: Dir };
}

export const opposite = (d: Dir): Dir => ((d + 2) % 4) as Dir;
export const ROW_STEP = [1, 0, -1, 0] as const;
export const COL_STEP = [0, 1, 0, -1] as const;

/** Open sides of a tile turned `rot` quarter turns clockwise (N → E → S → W). */
export function openings(kind: TileKind, rot: number): number {
  const b = BASE[kind];
  const r = ((rot % 4) + 4) % 4;
  return ((b << r) | (b >> (4 - r))) & 0b1111;
}

export const isOpen = (mask: number, d: Dir): boolean => (mask & (1 << d)) !== 0;

export interface CellFlow {
  wet: boolean;
  /** Side the water came in through, or null when dry. */
  entry: Dir | null;
  /** Metres of channel from the spring to where the water enters this cell (stripes and timing). */
  distance: number;
  /** Open sides whose water carries on into a wet neighbour or the outlet. */
  through: number;
  /** Open sides that end against stone, the grid edge, or a neighbour facing away: water pools there. */
  pooled: number;
}

export interface FlowResult {
  cells: CellFlow[];
  solved: boolean;
  /** Cells on the path from the spring to the wheel when solved (in order), else []. */
  path: number[];
}

/**
 * Floods the grid from the spring. With `gateOpen` false everything is dry. A cell is wet when a
 * wet neighbour's opening meets one of its own; the outlet cell must open toward the wheel.
 */
export function flow(layout: SluiceLayout, rots: readonly number[], gateOpen: boolean, tile = 1): FlowResult {
  const { rows, cols, tiles, source, outlet } = layout;
  const cells: CellFlow[] = tiles.map(() => ({
    wet: false,
    entry: null,
    distance: 0,
    through: 0,
    pooled: 0,
  }));
  const parent = new Int32Array(tiles.length).fill(-1);
  const masks = tiles.map((t, i) => openings(t.kind, rots[i] ?? 0));
  const idx = (r: number, c: number) => r * cols + c;
  const out = idx(outlet.row, outlet.col);
  let solved = false;

  const src = idx(source.row, source.col);
  if (gateOpen && isOpen(masks[src]!, source.side)) {
    cells[src] = { wet: true, entry: source.side, distance: 0, through: 0, pooled: 0 };
    const queue = [src];
    while (queue.length) {
      const i = queue.shift()!;
      const r = Math.floor(i / cols);
      const c = i % cols;
      const cell = cells[i]!;
      for (let d = 0 as Dir; d < 4; d = (d + 1) as Dir) {
        if (!isOpen(masks[i]!, d) || d === cell.entry) continue;
        if (i === out && d === outlet.side) {
          solved = true;
          cell.through |= 1 << d;
          continue;
        }
        const nr = r + ROW_STEP[d],
          nc = c + COL_STEP[d];
        if (nr < 0 || nc < 0 || nr >= rows || nc >= cols) {
          cell.pooled |= 1 << d;
          continue;
        }
        const j = idx(nr, nc);
        const back = opposite(d);
        if (!isOpen(masks[j]!, back)) {
          cell.pooled |= 1 << d;
          continue;
        }
        if (cells[j]!.wet) {
          // Two wet channels meeting head-on: a still join.
          cell.pooled |= 1 << d;
          continue;
        }
        cells[j] = { wet: true, entry: back, distance: cell.distance + tile, through: 0, pooled: 0 };
        parent[j] = i;
        cell.through |= 1 << d;
        queue.push(j);
      }
    }
  }

  const path: number[] = [];
  if (solved) for (let i = out; i >= 0; i = parent[i]!) path.unshift(i);
  return { cells, solved, path };
}

/** True when two rotations give the same openings (a straight tile turned twice looks the same). */
export function sameOpenings(kind: TileKind, a: number, b: number): boolean {
  return openings(kind, a) === openings(kind, b);
}

/**
 * The tile to point at for hint tier 2: the first wrong tile along the solution path, walking from
 * the spring. Returns -1 when every path tile is right.
 */
export function nearestBreak(
  layout: SluiceLayout,
  rots: readonly number[],
  solutionPath: readonly number[],
): number {
  for (const i of solutionPath) {
    const t = layout.tiles[i]!;
    if (!sameOpenings(t.kind, rots[i] ?? 0, t.solution)) return i;
  }
  return -1;
}

/** The solution path of a layout (cells from the spring to the wheel). */
export function solutionPath(layout: SluiceLayout): number[] {
  return flow(
    layout,
    layout.tiles.map((t) => t.solution),
    true,
  ).path;
}

/** Whether a tile can be turned (caps are dead-end distractors and turn; blanks are fixed stone). */
export const rotatable = (t: SluiceTile): boolean => t.kind !== 'blank';

/**
 * Anchorage Cay's layout: 4 rows × 3 columns. The spring feeds the east column from the south and
 * the wheel takes water off the west column's north side. The path snakes through 8 tiles; two caps
 * are the dead-end distractors and two cells are fixed stone. Corner turns: 0 = N+E, 1 = E+S,
 * 2 = S+W, 3 = W+N.
 *
 *   row 3 (wheel)   E+N   S+W   stone
 *   row 2           S+E   W+N   cap
 *   row 1           E+N   E–W   S+W
 *   row 0 (spring)  stone cap   N–S
 */
export const ANCHORAGE_SLUICE: SluiceLayout = {
  rows: 4,
  cols: 3,
  tiles: [
    { kind: 'blank', solution: 0, start: 0 },
    { kind: 'cap', solution: 0, start: 1 },
    { kind: 'straight', solution: 0, start: 0 },

    { kind: 'corner', solution: 0, start: 2 },
    { kind: 'straight', solution: 1, start: 0 },
    { kind: 'corner', solution: 2, start: 0 },

    { kind: 'corner', solution: 1, start: 3 },
    { kind: 'corner', solution: 3, start: 1 },
    { kind: 'cap', solution: 0, start: 3 },

    { kind: 'corner', solution: 0, start: 1 },
    { kind: 'corner', solution: 2, start: 1 },
    { kind: 'blank', solution: 0, start: 0 },
  ],
  source: { row: 0, col: 2, side: S },
  outlet: { row: 3, col: 0, side: N },
};
