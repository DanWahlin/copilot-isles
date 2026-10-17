import { coursePack } from './active';
import { fill } from './fill';
import type { PuzzleFile, PuzzleMechanic } from './pack';

export { fill };

/**
 * Puzzle content from the active course pack (`puzzles/<name>.json`, docs/specs/COURSE-PACKS.md §4).
 * The game owns each puzzle's mechanic (its rules, sites and UI); the pack says what's in it.
 */

/**
 * The puzzles the game plays, by file name, and the mechanic each one's module runs. A pack has a file
 * for each (the sites read their words even when it's `"disabled": true`).
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

/** A puzzle's content (typed by the mechanic's module); throws if the course hasn't got it. */
export function puzzleContent<T extends PuzzleFile = PuzzleFile>(name: string): T {
  const p = coursePack().puzzles[name];
  if (!p) throw new Error(`The course "${coursePack().id}" has no puzzle "${name}" (puzzles/${name}.json)`);
  return p as T;
}

/** Whether the course runs this puzzle (it has the file and hasn't `"disabled": true`). */
export function puzzleOn(name: string): boolean {
  const p = coursePack().puzzles[name];
  return !!p && !p.disabled;
}

/** A puzzle's text by key; throws on a missing key, so a typo can't show an empty label. */
export function textOf(
  p: PuzzleFile,
  key: string,
  values?: Readonly<Record<string, string | number>>,
): string {
  const t = p.text?.[key];
  if (t === undefined) throw new Error(`puzzles: "${p.id}" has no text "${key}"`);
  return values ? fill(t, values) : t;
}

/** A puzzle's voiced line by what it's for. */
export function lineOf(p: PuzzleFile, key: string): string {
  const l = p.lines?.[key];
  if (l === undefined) throw new Error(`puzzles: "${p.id}" has no line "${key}"`);
  return l;
}
