import { onCourse } from '../../../course/active';
import type { PuzzleFile } from '../../../course/pack';
import { byActs, puzzleContent, puzzleMaybe } from '../../../course/puzzles';
import type { TwistAnswer } from './model';
import type { Crew, Rot, Tile, TileKind } from './types';

/**
 * Channel Routing's board (docs/specs/ISLAND-02-thousand-bough.md §5.2-5.3; drawn and solved by
 * `docs/specs/island-02/draw.py`). Rows run north → south, columns west → east.
 */
export const ROWS = 4;
export const COLS = 5;

/** The game's crews, by the colour of their water: a course binds each of its crews to one (`acts`). */
export const CREWS: readonly Crew[] = ['blue', 'green', 'teal'];

/** Each crew's gate, above a column of the north edge. */
export const GATE_COL: Readonly<Record<Crew, number>> = { blue: 1, green: 2, teal: 3 };

/** The south edge's outlets: c0, c2 and c4 turn a crew's wheel; c1 and c3 spill into the Great Hall. */
export const WHEEL_AT: readonly (Crew | null)[] = ['blue', null, 'green', null, 'teal'];

/** A crew as the course names it: what its water carries, and its icon (never colour alone). */
export interface CrewWords {
  name: string;
  float: string;
  icon: string;
  iconName: string;
}

/** `puzzles/channel-routing.json` (route: each crew's water to its own wheel). */
export interface ChannelRoutingFile extends PuzzleFile {
  /** Keyed by the course's crew ids, each bound to one of the game's crews. */
  crews: Readonly<Record<string, CrewWords & { acts: Crew; sign: string }>>;
  /** The cold open's title cards: the old way, then the new. */
  demo: Readonly<Record<'old' | 'new', { kicker: string; title: string; text: string }>>;
  twist: { question: string; choices: readonly TwistAnswer[] };
}

export const routingContent = () => puzzleContent<ChannelRoutingFile>('channel-routing');

/** Each crew's water colour (the game's; colourblind-safe with the icon beside it). */
const CREW_COLOUR: Readonly<Record<Crew, string>> = {
  blue: '#3B82F6',
  green: '#3FA34D',
  teal: '#1EA7A7',
};

/** What each crew's water carries and its icon (colourblind-safe: never colour alone). */
export let CREW_LOOK: Readonly<Record<Crew, CrewWords & { colour: string }>> = {} as Record<
  Crew,
  CrewWords & { colour: string }
>;
onCourse(() => {
  const none = { name: '', float: '', icon: '', iconName: '' };
  const c = puzzleMaybe<ChannelRoutingFile>('channel-routing');
  const crews: Partial<Record<Crew, CrewWords>> = c ? byActs(c.crews) : {};
  CREW_LOOK = Object.fromEntries(
    CREWS.map((k) => {
      const { name, float, icon, iconName } = crews[k] ?? none;
      return [k, { name, float, icon, iconName, colour: CREW_COLOUR[k] }];
    }),
  ) as Record<Crew, CrewWords & { colour: string }>;
});

const KIND: Readonly<Record<string, TileKind>> = { S: 'straight', L: 'elbow', R: 'rock' };

/** Board A, for all three rounds. */
export const BOARD_A_KINDS = ['LLSLL', 'SRSRS', 'SLSLS', 'SSSSS'] as const;

/** Board A's start: blue's water runs east into green's column, so opening the gates shows the problem. */
export const START_A: readonly (readonly Rot[])[] = [
  [3, 0, 0, 3, 0],
  [1, 0, 0, 0, 1],
  [0, 0, 0, 3, 0],
  [0, 0, 0, 0, 0],
];

/**
 * The rotations every crew's path needs (null: the tile isn't on a path, so any rotation will do).
 * Round 1 needs only blue's three tiles; rounds 2 and 3 all three crews'.
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
const ROUND1_LIVE = { blue: true, green: false, teal: false } as const;
const ALL_LIVE = { blue: true, green: true, teal: true } as const;

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
