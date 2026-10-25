import { ISLAND_LIST } from '../islands/registry';
import type { PuzzleMechanic } from './pack';

/*
 * The game's puzzles and their islands, from the island registry (each entry's `puzzles`). The
 * registry and its entries hold only data (no three.js, no world code), so the course pack split
 * (src/course/split.ts) can use this in Node and in the Vite config.
 */

/**
 * The puzzles the game plays, by file name, and the mechanic each one's module runs. A pack has a file
 * for each puzzle on its islands (`"disabled": true` turns one off: its site stays as scenery).
 */
export const GAME_PUZZLES: Readonly<Record<string, PuzzleMechanic>> = Object.fromEntries(
  ISLAND_LIST.flatMap((e) => Object.entries(e.puzzles)),
);

/** The island each puzzle is on: a course has a file for each puzzle on the islands it uses. */
export const PUZZLE_ISLANDS: Readonly<Record<string, string>> = Object.fromEntries(
  ISLAND_LIST.flatMap((e) => Object.keys(e.puzzles).map((name) => [name, e.id])),
);

/**
 * Puzzles the game runs on more than one island (the Model Market has a stall on each island): their
 * content loads with the course's core, not with one chapter's part (src/course/split.ts).
 */
export const SHARED_PUZZLES: ReadonlySet<string> = new Set(['market']);
