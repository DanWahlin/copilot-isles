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
 * The quest steps each puzzle's mechanic sets or waits on (the game's words, docs/specs/COURSE-PACKS.md
 * step 4). A pack names the quest the puzzle plays in (`"quest"` in its file), and that quest has
 * each of these steps, under the same name or the one its file maps it to (`"steps"`: the crane's
 * `gate`, the step the mill's gate lever ends, is the Copilot app course's `actions`). The crane also
 * reads the gear rack's quest (`done`), the mill race the crane's.
 */
export const PUZZLE_STEPS: Readonly<Record<string, readonly string[]>> = {
  'gear-rack': ['done'],
  palette: ['palette'],
  bard: ['start'],
  christening: ['start', 'sail', 'done'],
  sluice: ['sluice', 'solved', 'done'],
  crane: ['gate', 'crane', 'solved', 'done'],
  'first-words': ['pipes', 'done'],
  'crate-yard': ['crates', 'solved', 'done'],
  'three-helms': ['helms', 'solved'],
  'lost-letters': ['letters', 'solved', 'done'],
  market: ['start', 'done'],
  'channel-routing': ['start', 'channels', 'twist', 'solved'],
};

/** The quest step a puzzle's mechanic step is in the course (its file's `"steps"`, else the same name). */
export function puzzleStep(name: string, step: string): string {
  return coursePack().puzzles[name]?.steps?.[step] ?? step;
}

/** The quest a puzzle plays in (its file's `"quest"`), or '' when it plays in none. */
export function puzzleQuest(name: string): string {
  return coursePack().puzzles[name]?.quest ?? '';
}

/**
 * A pack's entries keyed by the game ids they bind to (`"acts"`), each keeping its own id as `id`: a
 * course names its modes, crews or places as it likes, and binds each to one the game acts out.
 */
export function byActs<T extends { acts: string }>(
  r: Readonly<Record<string, T>>,
): Record<T['acts'], T & { id: string }> {
  return Object.fromEntries(Object.entries(r).map(([id, v]) => [v.acts, { ...v, id }])) as Record<
    T['acts'],
    T & { id: string }
  >;
}

/** A record keyed by a pack's ids (`binds`' keys) re-keyed by the game ids those bind to. */
export function rekey<A extends string, T>(
  binds: Readonly<Record<string, { acts: A }>>,
  r: Readonly<Record<string, T>>,
): Record<A, T> {
  return Object.fromEntries(
    Object.entries(r).flatMap(([id, v]) => (binds[id] ? [[binds[id].acts, v]] : [])),
  ) as Record<A, T>;
}

/** A puzzle's content (typed by the mechanic's module); throws if the course hasn't got it. */
export function puzzleContent<T extends PuzzleFile = PuzzleFile>(name: string): T {
  const p = coursePack().puzzles[name];
  if (!p) throw new Error(`The course "${coursePack().id}" has no puzzle "${name}" (puzzles/${name}.json)`);
  return p as T;
}

/**
 * A puzzle's content if the course has its file (a course without the puzzle's island has none), for
 * data a module keeps whether or not the puzzle runs.
 */
export function puzzleMaybe<T extends PuzzleFile = PuzzleFile>(name: string): T | null {
  return (coursePack().puzzles[name] as T | undefined) ?? null;
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
  // A disabled puzzle's site is scenery: a word it hasn't got leaves its board blank.
  if (t === undefined && p.disabled) return '';
  if (t === undefined) throw new Error(`puzzles: "${p.id}" has no text "${key}"`);
  return values ? fill(t, values) : t;
}

/** Every voice line a puzzle plays: its `lines`, and any `line` in its content (orders, answers). */
export function voiceLinesOf(p: PuzzleFile): string[] {
  const out: string[] = Object.values(p.lines ?? {});
  const walk = (v: unknown, key: string): void => {
    if (typeof v === 'string') {
      if (key === 'line') out.push(v);
    } else if (Array.isArray(v)) for (const x of v) walk(x, key);
    else if (v && typeof v === 'object')
      for (const [k, x] of Object.entries(v)) if (k !== 'lines' && k !== 'text') walk(x, k);
  };
  walk(p, '');
  return out;
}

/** A puzzle's voiced line by what it's for. */
export function lineOf(p: PuzzleFile, key: string): string {
  const l = p.lines?.[key];
  if (l === undefined) throw new Error(`puzzles: "${p.id}" has no line "${key}"`);
  return l;
}
