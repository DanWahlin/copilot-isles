import type { ChannelRoutingState, Crew, Flow, Tile } from './types';
import type { Workspace } from './workspaces';

/**
 * What the Channel Routing overlay (src/ui/puzzles/ChannelRouting.tsx) shows and what it can do.
 * The puzzle owns the state; the overlay renders it and calls the actions.
 */
export interface ChannelRoutingView {
  open: boolean;
  round: 1 | 2 | 3;
  phase: ChannelRoutingState['phase'];
  board: readonly (readonly Tile[])[];
  live: Readonly<Record<Crew, boolean>>;
  cursor: readonly [number, number] | null;
  flows: readonly Flow[];
  /** Fen's last word (also spoken), with the crew it's about. */
  message: { text: string; crew?: Crew; tone: 'info' | 'bad' | 'good' } | null;
  /** A tile to pulse: the first problem after a run, or Wingman's tier-2 hint. */
  pulse: readonly [number, number] | null;
  /** Water's running or a beat's playing: the controls wait. */
  busy: boolean;
  /** The Spire twist's question and answers, when it's asked (keys 1-4). */
  twist: {
    question: string;
    choices: readonly { id: string; text: string }[];
    /** The last answer picked, and whether it was right. */
    picked?: { id: string; right: boolean };
  } | null;
  /** Read out by screen readers (aria-live). */
  announce: string;
  /** A title card over Fen's demo (the old way, then the new way), while the board's closed. */
  card: { kicker: string; title: string; text: string } | null;
  /** Screen-space hit areas over the 3D tiles (CSS px), when the puzzle camera shows them. */
  hits: readonly ({ x: number; y: number; size: number } | null)[] | null;
  /** Round 3: where each crew works (null until picked). */
  picks: Readonly<Record<Crew, Workspace | null>>;
  /** Round 3: the crew the keys and the pad are on (0-2, gate order). */
  crewFocus: number;
  /** Round 3: after a run, whether each crew's place suits its order, and why not. */
  verdicts: Readonly<Record<Crew, { right: boolean; text: string }>> | null;
}

export interface ChannelRoutingActions {
  select(row: number, col: number): void;
  turn(row: number, col: number, dir: 1 | -1): void;
  move(dr: number, dc: number): void;
  openGates(): void;
  undo(): void;
  reset(): void;
  hint(): void;
  leave(): void;
  choose(id: string): void;
  /** Round 3: where a crew works. */
  pick(crew: Crew, w: Workspace): void;
  /** Round 3: moves the keys' crew (or sets it, with `to`). */
  focusCrew(d: number, to?: number): void;
}

export interface ChannelRoutingStore {
  get(): ChannelRoutingView;
  subscribe(fn: () => void): () => void;
  actions: ChannelRoutingActions;
}

/** A minimal external store for an overlay (useSyncExternalStore). */
export function createViewStore<T>(initial: T): {
  get(): T;
  set(patch: Partial<T>): void;
  subscribe(fn: () => void): () => void;
} {
  let state = initial;
  const fns = new Set<() => void>();
  return {
    get: () => state,
    set(patch) {
      state = { ...state, ...patch };
      for (const fn of fns) fn();
    },
    subscribe(fn) {
      fns.add(fn);
      return () => fns.delete(fn);
    },
  };
}
