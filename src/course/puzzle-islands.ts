import type { PuzzleMechanic } from './pack';

/*
 * The game's puzzles and their islands. This file has no imports with side effects, so the course
 * pack split (src/course/split.ts) can use it in Node and in the Vite config.
 */

/**
 * The puzzles the game plays, by file name, and the mechanic each one's module runs. A pack has a file
 * for each puzzle on its islands (`"disabled": true` turns one off: its site stays as scenery).
 */
export const GAME_PUZZLES: Readonly<Record<string, PuzzleMechanic>> = {
  'gear-rack': 'checklist',
  palette: 'ceremony',
  bard: 'ceremony',
  christening: 'ceremony',
  sluice: 'route',
  crane: 'procedure',
  'first-words': 'choose-tool',
  'crate-yard': 'classify',
  'three-helms': 'choose-tool',
  'lost-letters': 'classify',
  market: 'budget',
  'channel-routing': 'route',
  workspaces: 'match',
  'flag-hoist': 'classify',
  'practice-session': 'checklist',
};

/** The island each puzzle is on: a course has a file for each puzzle on the islands it uses. */
export const PUZZLE_ISLANDS: Readonly<Record<string, string>> = {
  'gear-rack': 'anchorage',
  palette: 'anchorage',
  bard: 'anchorage',
  christening: 'anchorage',
  sluice: 'anchorage',
  crane: 'anchorage',
  'first-words': 'anchorage',
  'crate-yard': 'meridian',
  'three-helms': 'meridian',
  'lost-letters': 'meridian',
  market: 'meridian',
  'channel-routing': 'thousand-bough',
  workspaces: 'thousand-bough',
  'flag-hoist': 'thousand-bough',
  'practice-session': 'thousand-bough',
};

/**
 * Puzzles the game runs on more than one island (the Model Market has a stall on each island): their
 * content loads with the course's core, not with one chapter's part (src/course/split.ts).
 */
export const SHARED_PUZZLES: ReadonlySet<string> = new Set(['market']);
