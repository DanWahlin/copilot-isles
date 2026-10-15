import type { Crew, Rot, Tile, TileKind } from './types';

/**
 * Channel Routing's board (docs/specs/ISLAND-02-thousand-bough.md §5.2-5.3; drawn and solved by
 * `docs/specs/island-02/draw.py`). Rows run north → south, columns west → east.
 */
export const ROWS = 4;
export const COLS = 5;

export const CREWS: readonly Crew[] = ['feature', 'bugfix', 'docs'];

/** Each crew's gate, above a column of the north edge. */
export const GATE_COL: Readonly<Record<Crew, number>> = { feature: 1, bugfix: 2, docs: 3 };

/** The south edge's outlets: c0, c2 and c4 turn a crew's wheel; c1 and c3 spill into the Great Hall. */
export const WHEEL_AT: readonly (Crew | null)[] = ['feature', null, 'bugfix', null, 'docs'];

/** What each crew's water carries and its icon (colourblind-safe: never colour alone). */
export const CREW_LOOK: Readonly<
  Record<Crew, { name: string; colour: string; float: string; icon: string; iconName: string }>
> = {
  feature: { name: 'Feature', colour: '#3B82F6', float: 'blue blossoms', icon: '★', iconName: 'star' },
  bugfix: { name: 'Bug Fix', colour: '#3FA34D', float: 'leaves', icon: '🐞', iconName: 'beetle' },
  docs: { name: 'Docs', colour: '#1EA7A7', float: 'paper boats', icon: '📜', iconName: 'scroll' },
};

const KIND: Readonly<Record<string, TileKind>> = { S: 'straight', L: 'elbow', R: 'rock' };

/** Board A, for all three rounds. */
export const BOARD_A_KINDS = ['LLSLL', 'SRSRS', 'SLSLS', 'SSSSS'] as const;

/** Board A's start: Feature's water runs east into Bug Fix's column, so opening the gates shows the problem. */
export const START_A: readonly (readonly Rot[])[] = [
  [3, 0, 0, 3, 0],
  [1, 0, 0, 0, 1],
  [0, 0, 0, 3, 0],
  [0, 0, 0, 0, 0],
];

/**
 * The rotations every crew's path needs (null: the tile isn't on a path, so any rotation will do).
 * Round 1 needs only Feature's three tiles; rounds 2 and 3 all three crews'.
 */
export const SOLUTION_A: readonly (readonly (Rot | null)[])[] = [
  [1, 3, 0, 0, 2],
  [0, null, 0, null, 0],
  [0, null, 0, null, 0],
  [0, null, 0, null, 0],
];

/** Board A routed: every crew has its own channel (round 3 starts here; the tiles don't turn). */
const ROUTED_A: readonly (readonly Rot[])[] = SOLUTION_A.map((row, r) =>
  row.map((rot, c) => rot ?? START_A[r]![c]!),
);

export function makeBoard(kinds: readonly string[], rots: readonly (readonly Rot[])[]): Tile[][] {
  return kinds.map((row, r) =>
    [...row].map((k, c) => ({ kind: KIND[k] ?? 'rock', rot: k === 'R' ? 0 : rots[r]![c]! })),
  );
}

/** The board a round starts on. */
export function roundBoard(round: 1 | 2 | 3): Tile[][] {
  return makeBoard(BOARD_A_KINDS, round === 3 ? ROUTED_A : START_A);
}

/** Which crews' gates are open in a round. */
export function roundLive(round: 1 | 2 | 3): Readonly<Record<Crew, boolean>> {
  return round === 1 ? ROUND1_LIVE : ALL_LIVE;
}
const ROUND1_LIVE = { feature: true, bugfix: false, docs: false } as const;
const ALL_LIVE = { feature: true, bugfix: true, docs: true } as const;

/** The rotation each tile needs this round (null where it doesn't matter). */
export function roundSolution(round: 1 | 2 | 3): readonly (readonly (Rot | null)[])[] {
  return round === 1 ? ROUND1_SOLUTION : SOLUTION_A;
}
const ROUND1_SOLUTION: readonly (readonly (Rot | null)[])[] = [
  [1, 3, null, null, null],
  [0, null, null, null, null],
  [0, null, null, null, null],
  [0, null, null, null, null],
];
