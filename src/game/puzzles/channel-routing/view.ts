import type { ChannelRoutingState, Crew, Flow, Tile } from './types';

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
  /** Screen-space hit areas over the 3D tiles (CSS px), when the puzzle camera shows them. */
  hits: readonly ({ x: number; y: number; size: number } | null)[] | null;
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
