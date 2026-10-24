import { coursePack, onCourse } from './active';
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
 * each of these steps, under the same name or the one its file maps it to (`"steps"`, game step →
 * quest step). Every quest also ends at `done`, the game's own step for a finished quest (the quest
 * list, the tracker and the content check know it), so a puzzle reads `done` as it is: it isn't a
 * mechanic step and can't be renamed. The gear rack waits on its quest's `checks` (the rack runs one
 * check per press then, and plays the course's `checked` script when every one passes), and the crane
 * reads its `done`. The crane's `gate` is the mill's gate lever (Actions first), which moves the job on
 * to `brief` (the crew's briefing at the crane; the crane runs from it), then `crane` and `solved`. The
 * mill race reads the crane's steps too.
 */
const STEPS = {
  'gear-rack': ['checks'],
  palette: ['palette'],
  bard: ['start'],
  christening: ['start', 'sail'],
  sluice: ['sluice', 'solved'],
  crane: ['gate', 'brief', 'crane', 'solved'],
  'first-words': ['pipes'],
  'crate-yard': ['crates', 'solved'],
  'three-helms': ['helms', 'solved'],
  'lost-letters': ['letters', 'solved'],
  market: ['start'],
  'channel-routing': ['start', 'channels', 'twist', 'solved'],
} as const;

export const PUZZLE_STEPS: Readonly<Record<string, readonly string[]>> = STEPS;

/** The puzzles whose mechanic sets or waits on quest steps. */
export type StepPuzzle = keyof typeof STEPS;

/** A puzzle's mechanic steps, each as the course's quest calls it. */
export type PuzzleSteps<N extends StepPuzzle> = { readonly [S in (typeof STEPS)[N][number]]: string };

/** Every puzzle's steps resolved through the active pack's `"steps"`, built once per activation. */
let resolved: { readonly [N in StepPuzzle]: PuzzleSteps<N> } | null = null;

onCourse((p) => {
  resolved = Object.fromEntries(
    Object.entries(STEPS).map(([name, steps]) => [
      name,
      Object.freeze(Object.fromEntries(steps.map((s: string) => [s, p.puzzles[name]?.steps?.[s] ?? s]))),
    ]),
  ) as unknown as typeof resolved;
});

/**
 * A puzzle's mechanic steps as the active course's quest calls them (its file's `"steps"`, else the
 * game's names): `puzzleSteps('crane').gate`. Resolved once per course, so a mechanic reads it once when
 * it's made and compares strings after.
 */
export function puzzleSteps<N extends StepPuzzle>(name: N): PuzzleSteps<N> {
  if (!resolved) throw new Error('No course pack is active yet (src/course/load.ts activates it)');
  return resolved[name];
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
