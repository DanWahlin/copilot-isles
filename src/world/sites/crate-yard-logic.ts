/**
 * P1.1 The Crate Yard (Anders), a classify puzzle: push each crate onto a plate of its kind. The crates
 * (their stencils, kinds and the reasons) and the plates' signs are the course pack's
 * (`puzzles/crate-yard.json`; for the Copilot app course, 01 §Chats, Project Sessions, and Modes: a
 * chat for questions on the tavern side, a project session when the agent needs your repository on
 * the slipway). The grid, the plates
 * and the crates' starting cells are the game's. Pure grid logic; the site draws it and the puzzle
 * drives it.
 *
 * The yard is a grid of cells, x across (0 = the tavern side) and z deep. You push a crate one cell
 * by standing next to it and pressing E toward it. Crates can't be pulled, but a push can be undone.
 * A plate only takes the right kind of crate: push the wrong one on and it's refused (it stays where
 * it was), with the reason, so the yard never jams on a wrong answer.
 */
import { onCourse } from '../../course/active';
import type { PuzzleFile } from '../../course/pack';
import { puzzleContent, puzzleMaybe } from '../../course/puzzles';
import type { SourceRef } from '../../learn/types';

/**
 * The yard's two kinds of plate (the tavern side and the slipway): a course binds each of its bins to
 * one (`acts`) and says what it means.
 */
export const CRATE_KINDS = ['tavern', 'slipway'] as const;
export type CrateKind = (typeof CRATE_KINDS)[number];

export interface CrateDef {
  id: string;
  kind: CrateKind;
  /** The task stencilled on the crate (two or three short lines). */
  label: readonly string[];
  /** Why it belongs where it does, said when it's pushed onto the wrong plate. */
  why: string;
  /** The course section `why` paraphrases. */
  source: SourceRef;
}

export interface YardLayout {
  cols: number;
  rows: number;
  /** Plate cells: [x, z]. */
  tavernPlates: readonly (readonly [number, number])[];
  slipwayPlates: readonly (readonly [number, number])[];
  crates: readonly (CrateDef & { at: readonly [number, number] })[];
  /** Where you walk in (a cell that's always free at the start). */
  entry: readonly [number, number];
}

export interface YardState {
  /** Crate positions by index, [x, z]. */
  at: [number, number][];
}

export type Dir = 'n' | 's' | 'e' | 'w';
export const DIRS: Readonly<Record<Dir, readonly [number, number]>> = {
  n: [0, -1],
  s: [0, 1],
  e: [1, 0],
  w: [-1, 0],
};

/**
 * The tavern plates are on the west side (x = 0) and the slipway plates on the east. Each trick crate
 * starts a push from the wrong plate: the book-app tour (it changes no files, but it needs your
 * repository) beside the tavern, and the general worktree question beside the slipway. Solvable in
 * 15 pushes (the solver test checks it).
 */
/** `puzzles/crate-yard.json`: classify each crate onto its kind's plates. */
export interface CrateYardFile extends PuzzleFile {
  /** The plates' signs, by the course's bin ids, each bound to a kind of plate. */
  bins: Readonly<Record<string, { acts: CrateKind; sign: string; sub: string }>>;
  /** The crates, in the yard's slot order (`SLOTS`); each one's `kind` is a bin of the file. */
  items: readonly (Omit<CrateDef, 'kind'> & { kind: string })[];
}

export const crateYardContent = () => puzzleContent<CrateYardFile>('crate-yard');

/** Where each crate starts, by slot (the pack's crates fill them in order). */
const SLOTS: readonly (readonly [number, number])[] = [
  [2, 3],
  [2, 0],
  [1, 3],
  [3, 3],
  [3, 1],
  [3, 2],
  [1, 2],
];

/** The yard as the course fills it (empty until a voyage loads the course pack). */
export let MERIDIAN_YARD: YardLayout = {
  cols: 5,
  rows: 5,
  tavernPlates: [],
  slipwayPlates: [],
  crates: [],
  entry: [2, 4],
};

onCourse(() => {
  // A course without Port Meridian has no crate yard: an empty yard.
  const file = puzzleMaybe<CrateYardFile>('crate-yard');
  const items = file?.items ?? [];
  if (items.length > SLOTS.length)
    throw new Error(`The crate yard has ${SLOTS.length} slots, not ${items.length}`);
  MERIDIAN_YARD = {
    cols: 5,
    rows: 5,
    tavernPlates: [
      [0, 1],
      [0, 2],
      [0, 3],
    ],
    slipwayPlates: [
      [4, 0],
      [4, 1],
      [4, 2],
      [4, 3],
    ],
    crates: items.map((c, i) => ({ ...c, kind: file!.bins[c.kind]!.acts, at: SLOTS[i]! })),
    entry: [2, 4],
  };
});

export function initialState(layout: YardLayout): YardState {
  return { at: layout.crates.map((c) => [c.at[0], c.at[1]]) };
}

const key = (x: number, z: number) => `${x},${z}`;

export function plateAt(layout: YardLayout, x: number, z: number): CrateKind | null {
  if (layout.tavernPlates.some(([px, pz]) => px === x && pz === z)) return 'tavern';
  if (layout.slipwayPlates.some(([px, pz]) => px === x && pz === z)) return 'slipway';
  return null;
}

export function inYard(layout: YardLayout, x: number, z: number): boolean {
  return x >= 0 && z >= 0 && x < layout.cols && z < layout.rows;
}

export function crateAt(state: YardState, x: number, z: number): number {
  return state.at.findIndex(([cx, cz]) => cx === x && cz === z);
}

export type PushResult =
  | { ok: true; crate: number; to: [number, number]; placed: boolean }
  | { ok: false; reason: 'none' | 'blocked' | 'wrong-plate'; crate: number };

/**
 * Pushes the crate in front of `player` (a cell) in `dir`. Returns what happened; the state only
 * changes on success.
 */
export function push(
  layout: YardLayout,
  state: YardState,
  player: readonly [number, number],
  dir: Dir,
): PushResult {
  const [dx, dz] = DIRS[dir];
  const cx = player[0] + dx,
    cz = player[1] + dz;
  const crate = crateAt(state, cx, cz);
  if (crate < 0) return { ok: false, reason: 'none', crate: -1 };
  const tx = cx + dx,
    tz = cz + dz;
  if (!inYard(layout, tx, tz) || crateAt(state, tx, tz) >= 0) return { ok: false, reason: 'blocked', crate };
  const plate = plateAt(layout, tx, tz);
  if (plate && plate !== layout.crates[crate]!.kind) return { ok: false, reason: 'wrong-plate', crate };
  state.at[crate] = [tx, tz];
  return { ok: true, crate, to: [tx, tz], placed: plate !== null };
}

/** A push you can take back (Z): the crate and the cell it came from. */
export interface PushRecord {
  crate: number;
  from: [number, number];
}

/**
 * Takes back the last push in `history` (it slides back to where it was), unless something's in
 * that cell now (`blocked`: the captain's standing there, say). Returns the crate moved, or -1.
 */
export function undo(
  state: YardState,
  history: PushRecord[],
  blocked: (x: number, z: number) => boolean = () => false,
): number {
  const last = history[history.length - 1];
  if (!last) return -1;
  const [x, z] = last.from;
  if (crateAt(state, x, z) >= 0 || blocked(x, z)) return -1;
  history.pop();
  state.at[last.crate] = [x, z];
  return last.crate;
}

export function solved(layout: YardLayout, state: YardState): boolean {
  return state.at.every(([x, z], i) => plateAt(layout, x, z) === layout.crates[i]!.kind);
}

/** Cells the player can walk to without moving a crate (crates block; the yard's edge bounds it). */
export function reachable(
  layout: YardLayout,
  state: YardState,
  from: readonly [number, number],
): Set<string> {
  const seen = new Set<string>([key(from[0], from[1])]);
  const queue: [number, number][] = [[from[0], from[1]]];
  while (queue.length) {
    const [x, z] = queue.shift()!;
    for (const [dx, dz] of Object.values(DIRS)) {
      const nx = x + dx,
        nz = z + dz;
      const k = key(nx, nz);
      if (!inYard(layout, nx, nz) || seen.has(k) || crateAt(state, nx, nz) >= 0) continue;
      seen.add(k);
      queue.push([nx, nz]);
    }
  }
  return seen;
}

export interface SolveStep {
  /** Where to stand (a cell next to the crate) and which way to push. */
  from: [number, number];
  dir: Dir;
  crate: number;
}

/**
 * Whether a crate at (x, z) can never reach a plate of its kind: crates can't be pulled, so one
 * pushed against the yard's edge only slides along that edge from then on.
 */
export function deadCrate(layout: YardLayout, kind: CrateKind, x: number, z: number): boolean {
  const plates = kind === 'tavern' ? layout.tavernPlates : layout.slipwayPlates;
  const onEdgeX = x === 0 || x === layout.cols - 1;
  const onEdgeZ = z === 0 || z === layout.rows - 1;
  if (onEdgeX && onEdgeZ) return !plates.some(([px, pz]) => px === x && pz === z);
  if (onEdgeX) return !plates.some(([px]) => px === x);
  if (onEdgeZ) return !plates.some(([, pz]) => pz === z);
  return false;
}

/** Pushes still needed at least: each crate's distance to its nearest plate of the right kind. */
function estimate(layout: YardLayout, state: YardState): number {
  let sum = 0;
  state.at.forEach(([x, z], i) => {
    const plates = layout.crates[i]!.kind === 'tavern' ? layout.tavernPlates : layout.slipwayPlates;
    let best = Infinity;
    for (const [px, pz] of plates) best = Math.min(best, Math.abs(px - x) + Math.abs(pz - z));
    sum += best;
  });
  return sum;
}

/**
 * The fewest pushes from here to solved (A* over crate positions and the player's reachable
 * region, skipping crates stuck against an edge), or null if it can't be solved from here. Wingman's
 * tier-3 hint plays its first step.
 */
export function solve(
  layout: YardLayout,
  start: YardState,
  player: readonly [number, number],
  limit = 60_000,
): SolveStep[] | null {
  interface Node {
    at: [number, number][];
    player: [number, number];
    g: number;
    f: number;
    parent: Node | null;
    step: SolveStep | null;
  }
  const id = (at: readonly (readonly [number, number])[], reach: Set<string>) => {
    let min = '';
    for (const k of reach) if (!min || k < min) min = k;
    return `${at.map(([x, z]) => key(x, z)).join('|')}#${min}`;
  };
  // A small binary heap on f (then g, deeper first).
  const heap: Node[] = [];
  const less = (a: Node, b: Node) => a.f < b.f || (a.f === b.f && a.g > b.g);
  const pushHeap = (n: Node) => {
    heap.push(n);
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!less(heap[i]!, heap[p]!)) break;
      [heap[i], heap[p]] = [heap[p]!, heap[i]!];
      i = p;
    }
  };
  const popHeap = (): Node => {
    const top = heap[0]!;
    const last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1,
          r = l + 1;
        let m = i;
        if (l < heap.length && less(heap[l]!, heap[m]!)) m = l;
        if (r < heap.length && less(heap[r]!, heap[m]!)) m = r;
        if (m === i) break;
        [heap[i], heap[m]] = [heap[m]!, heap[i]!];
        i = m;
      }
    }
    return top;
  };
  const at0 = start.at.map(([x, z]) => [x, z] as [number, number]);
  const startNode: Node = { at: at0, player: [player[0], player[1]], g: 0, f: 0, parent: null, step: null };
  startNode.f = estimate(layout, { at: at0 });
  const best = new Map<string, number>([[id(at0, reachable(layout, { at: at0 }, player)), 0]]);
  pushHeap(startNode);
  let visited = 0;
  while (heap.length && visited++ < limit) {
    const node = popHeap();
    const state: YardState = { at: node.at };
    if (solved(layout, state)) {
      const path: SolveStep[] = [];
      for (let n: Node | null = node; n?.step; n = n.parent) path.unshift(n.step);
      return path;
    }
    const reach = reachable(layout, state, node.player);
    node.at.forEach(([cx, cz], crate) => {
      for (const dir of Object.keys(DIRS) as Dir[]) {
        const [dx, dz] = DIRS[dir];
        const from: [number, number] = [cx - dx, cz - dz];
        if (!reach.has(key(from[0], from[1]))) continue;
        const next: YardState = { at: node.at.map(([x, z]) => [x, z]) };
        const r = push(layout, next, from, dir);
        if (!r.ok) continue;
        if (deadCrate(layout, layout.crates[crate]!.kind, r.to[0], r.to[1])) continue;
        const g = node.g + 1;
        const k = id(next.at, reachable(layout, next, [cx, cz]));
        if ((best.get(k) ?? Infinity) <= g) continue;
        best.set(k, g);
        pushHeap({
          at: next.at,
          player: [cx, cz],
          g,
          f: g + estimate(layout, next),
          parent: node,
          step: { from, dir, crate },
        });
      }
    });
  }
  return null;
}
