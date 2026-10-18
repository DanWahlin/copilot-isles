import { CREWS, COLS, GATE_COL, ROWS, WHEEL_AT } from './boards';
import type { Crew, Flow, FlowEnd, Rot, Tile } from './types';

/**
 * Channel Routing's rules (docs/specs/ISLAND-02-thousand-bough.md §5.4), pure and allocation-free
 * where it runs often: `openGates` fills pooled flows. Sides are N 0, E 1, S 2, W 3.
 */
const DR = [-1, 0, 1, 0] as const;
const DC = [0, 1, 0, -1] as const;

/** A tile's open sides as a bitmask (bit n = side n). */
export function ports(t: Tile): number {
  if (t.kind === 'rock') return 0;
  if (t.kind === 'straight') return t.rot % 2 === 0 ? 0b0101 : 0b1010;
  const a = t.rot;
  const b = (t.rot + 1) % 4;
  return (1 << a) | (1 << b);
}

/** The board with one tile turned 90° (clockwise by default); rocks don't turn. */
export function rotate(
  board: readonly (readonly Tile[])[],
  row: number,
  col: number,
  dir: 1 | -1 = 1,
): Tile[][] {
  return board.map((r, ri) =>
    r.map((t, ci) =>
      ri === row && ci === col && t.kind !== 'rock'
        ? { kind: t.kind, rot: ((t.rot + dir + 4) % 4) as Rot }
        : t,
    ),
  );
}

/** Shared cell tuples, so flows never allocate one. */
const CELL: readonly (readonly (readonly [number, number])[])[] = Array.from({ length: ROWS }, (_, r) =>
  Array.from({ length: COLS }, (_, c) => [r, c] as const),
);

interface Trace {
  crew: Crew;
  /** Cells the water passes through, in order. */
  cells: (readonly [number, number])[];
  /** The cell it reached last but couldn't enter (a dead end), if any. */
  blocked: readonly [number, number] | null;
  end: FlowEnd;
  wheel: Crew | undefined;
}
const traces: Record<Crew, Trace> = {
  blue: { crew: 'blue', cells: [], blocked: null, end: 'deadEnd', wheel: undefined },
  green: { crew: 'green', cells: [], blocked: null, end: 'deadEnd', wheel: undefined },
  teal: { crew: 'teal', cells: [], blocked: null, end: 'deadEnd', wheel: undefined },
};
const flows: Record<Crew, Flow & { cells: (readonly [number, number])[] }> = {
  blue: { crew: 'blue', cells: [], end: 'deadEnd' },
  green: { crew: 'green', cells: [], end: 'deadEnd' },
  teal: { crew: 'teal', cells: [], end: 'deadEnd' },
};
const out: Flow[] = [];
const seen = new Uint8Array(ROWS * COLS);

/** Follows one crew's water from its gate on its own, as if no one else were flowing. */
function trace(board: readonly (readonly Tile[])[], crew: Crew, t: Trace): void {
  t.cells.length = 0;
  t.blocked = null;
  t.wheel = undefined;
  seen.fill(0);
  let r = 0;
  let c = GATE_COL[crew];
  // Moving south into the first tile, so it enters through its north side.
  let move = 2;
  for (;;) {
    if (r === ROWS) {
      const w = WHEEL_AT[c] ?? null;
      t.end = w === null ? 'mainHall' : w === crew ? 'wheel' : 'wrongWheel';
      t.wheel = w ?? undefined;
      return;
    }
    if (r < 0 || c < 0 || c >= COLS) {
      t.end = 'mainHall';
      return;
    }
    const from = (move + 2) % 4;
    const p = ports(board[r]![c]!);
    if (!(p & (1 << from)) || seen[r * COLS + c]) {
      t.blocked = CELL[r]![c]!;
      t.end = 'deadEnd';
      return;
    }
    seen[r * COLS + c] = 1;
    t.cells.push(CELL[r]![c]!);
    move = p & ~(1 << from) ? 31 - Math.clz32(p & ~(1 << from)) : from;
    r += DR[move]!;
    c += DC[move]!;
  }
}

/**
 * Opens every live gate at once (§5.4). A colour mixes when its water reaches a tile that another
 * colour's water passes through; otherwise its first problem decides its end. The returned array and
 * flows are reused by the next call.
 */
export function openGates(
  board: readonly (readonly Tile[])[],
  live: Readonly<Record<Crew, boolean>>,
): readonly Flow[] {
  out.length = 0;
  for (const crew of CREWS) if (live[crew]) trace(board, crew, traces[crew]);
  for (const crew of CREWS) {
    if (!live[crew]) continue;
    const t = traces[crew];
    const f = flows[crew];
    f.cells.length = 0;
    f.end = t.end;
    f.at = undefined;
    f.wheel = t.wheel;
    let mixed = false;
    const n = t.cells.length + (t.blocked ? 1 : 0);
    for (let i = 0; i < n && !mixed; i++) {
      const cell = i < t.cells.length ? t.cells[i]! : t.blocked!;
      for (const other of CREWS)
        if (other !== crew && live[other] && traces[other].cells.includes(cell)) mixed = true;
      if (mixed) {
        f.end = 'mixed';
        f.at = cell;
        f.wheel = undefined;
      }
      if (i < t.cells.length || mixed) f.cells.push(cell);
    }
    if (!mixed) {
      if (t.end === 'deadEnd') f.at = t.blocked ?? undefined;
      else if (t.end === 'mainHall' || t.end === 'wrongWheel')
        f.at = t.cells.length ? t.cells[t.cells.length - 1] : undefined;
    }
    out.push(f);
  }
  return out;
}

/** Every live crew's water reached its own wheel. */
export function solved(fl: readonly Flow[], live: Readonly<Record<Crew, boolean>>): boolean {
  let n = 0;
  for (const f of fl) {
    if (f.end !== 'wheel') return false;
    n += 1;
  }
  return n === CREWS.filter((c) => live[c]).length;
}

/**
 * Every set of non-crossing paths, one per crew from its gate to its own wheel, on tiles of these
 * kinds (any rotation): the uniqueness check of `draw.py`, for tests and the hints.
 */
export function pathSets(kinds: readonly string[], crews: readonly Crew[]): string[][] {
  const paths = (crew: Crew): string[][] => {
    const found: string[][] = [];
    const goal = WHEEL_AT.indexOf(crew);
    const dfs = (r: number, c: number, move: number, cells: string[]) => {
      if (r === ROWS) {
        if (c === goal) found.push(cells);
        return;
      }
      if (r < 0 || c < 0 || c >= COLS) return;
      const k = kinds[r]![c]!;
      const key = `${r},${c}`;
      if (k === 'R' || cells.includes(key)) return;
      const nexts = k === 'S' ? [move] : [(move + 1) % 4, (move + 3) % 4];
      for (const m of nexts) dfs(r + DR[m]!, c + DC[m]!, m, [...cells, key]);
    };
    dfs(0, GATE_COL[crew], 2, []);
    return found;
  };
  const per = crews.map(paths);
  const sets: string[][] = [];
  const pick = (i: number, acc: string[][]) => {
    if (i === per.length) {
      const all = acc.flat();
      if (new Set(all).size === all.length) sets.push(acc.map((p) => p.join(' ')));
      return;
    }
    for (const p of per[i]!) pick(i + 1, [...acc, p]);
  };
  pick(0, []);
  return sets;
}

/** The first tile (reading order) that isn't turned the way this round's solution needs, or null. */
export function wrongTile(
  board: readonly (readonly Tile[])[],
  solution: readonly (readonly (Rot | null)[])[],
): readonly [number, number] | null {
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++) {
      const want = solution[r]![c];
      const t = board[r]![c]!;
      if (want === null || want === undefined || t.kind === 'rock') continue;
      // A straight looks the same turned half way round.
      const same = t.kind === 'straight' ? t.rot % 2 === want % 2 : t.rot === want;
      if (!same) return CELL[r]![c]!;
    }
  return null;
}

/** A tile's name for screen readers: "Row 2, column 3, elbow, north to east". */
export function tileLabel(t: Tile, row: number, col: number): string {
  const where = `Row ${row + 1}, column ${col + 1}`;
  if (t.kind === 'rock') return `${where}, rock`;
  const side = ['north', 'east', 'south', 'west'];
  if (t.kind === 'straight')
    return `${where}, straight, ${t.rot % 2 === 0 ? 'north to south' : 'east to west'}`;
  return `${where}, elbow, ${side[t.rot]} to ${side[(t.rot + 1) % 4]}`;
}
