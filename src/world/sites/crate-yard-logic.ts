/**
 * P1.1 The Crate Yard (Chapter 01, Anders): push each crate onto its plate. Chat work (questions,
 * brainstorming, summaries) goes to the tavern plate; project work (changing code, tests, pull
 * requests) to the slipway plate. Pure grid logic; the site draws it and the puzzle drives it.
 *
 * The yard is a grid of cells, x across (0 = the tavern side) and z deep. You push a crate one cell
 * by standing next to it and pressing E toward it. Crates can't be pulled. A plate only takes the
 * right kind of crate: push the wrong one on and it's refused (it stays where it was), with the
 * reason, so the yard never jams on a wrong answer.
 */

export type CrateKind = 'chat' | 'project';

export interface CrateDef {
  id: string;
  kind: CrateKind;
  /** The task stencilled on the crate (two short lines). */
  label: readonly [string, string];
  /** Why it belongs where it does, said when it's pushed onto the wrong plate. */
  why: string;
}

export interface YardLayout {
  cols: number;
  rows: number;
  /** Plate cells: [x, z]. */
  chatPlates: readonly (readonly [number, number])[];
  projectPlates: readonly (readonly [number, number])[];
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
 * The tavern plates are on the west side (x = 0) and the slipway plates on the east. Four crates are
 * a push from home; "Fix a bug" and "Brainstorm ideas" start on the wrong side and have to be walked
 * round. Solvable in 13 pushes (the solver test checks it).
 */
export const MERIDIAN_YARD: YardLayout = {
  cols: 6,
  rows: 5,
  chatPlates: [
    [0, 1],
    [0, 2],
    [0, 3],
  ],
  projectPlates: [
    [5, 1],
    [5, 2],
    [5, 3],
  ],
  crates: [
    {
      id: 'question',
      kind: 'chat',
      label: ['Ask a quick', 'question'],
      at: [1, 2],
      why: 'A quick question doesn’t need your repository. That’s a chat.',
    },
    {
      id: 'bug',
      kind: 'project',
      label: ['Fix a bug', 'in the repo'],
      at: [2, 3],
      why: 'Fixing a bug changes files, so it needs a project session.',
    },
    {
      id: 'brainstorm',
      kind: 'chat',
      label: ['Brainstorm', 'ideas'],
      at: [3, 2],
      why: 'Brainstorming is exploring. No branch needed, so it’s a chat.',
    },
    {
      id: 'test',
      kind: 'project',
      label: ['Add a test', 'for search'],
      at: [4, 1],
      why: 'Adding a test changes your repository. That’s project work.',
    },
    {
      id: 'summary',
      kind: 'chat',
      label: ['Summarize', 'a chapter'],
      at: [1, 3],
      why: 'Summarizing just needs an answer, so it’s a chat.',
    },
    {
      id: 'pr',
      kind: 'project',
      label: ['Open a', 'pull request'],
      at: [4, 2],
      why: 'A pull request is repository work. Start a project session.',
    },
  ],
  entry: [2, 4],
};

export function initialState(layout: YardLayout): YardState {
  return { at: layout.crates.map((c) => [c.at[0], c.at[1]]) };
}

const key = (x: number, z: number) => `${x},${z}`;

export function plateAt(layout: YardLayout, x: number, z: number): CrateKind | null {
  if (layout.chatPlates.some(([px, pz]) => px === x && pz === z)) return 'chat';
  if (layout.projectPlates.some(([px, pz]) => px === x && pz === z)) return 'project';
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
  const plates = kind === 'chat' ? layout.chatPlates : layout.projectPlates;
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
    const plates = layout.crates[i]!.kind === 'chat' ? layout.chatPlates : layout.projectPlates;
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
