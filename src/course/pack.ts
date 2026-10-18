import type { MarketData } from '../content/market';
import type { CourseBoardsData } from '../content/course-boards';
import type { Beat } from '../game/beats';
import type { ScriptStep } from '../game/script';
import type { ModelsFile } from '../game/market/catalog';
import type { ChartLabelText } from '../learn/content/labels';
import type { CourseLock } from '../learn/course/lock';
import type { ChapterContent } from '../learn/types';
import type { CourseMeta } from './catalog';

/**
 * A course pack, assembled (docs/specs/COURSE-PACKS.md §2): `courses/<id>/` less its served files
 * (`public/`) and its voice lines' source (`voice/`). The game reads it through `src/course/active.ts`
 * once a voyage has loaded it.
 */

/** A quest's text: its title, the tracker's task, and what each step says to do. */
export interface QuestDef {
  id: string;
  /** The island's name for the step (pirate flavour). */
  title: string;
  /** What you're doing in the app, in plain words, for the tracker. */
  task: string;
  /** Step id → what the Logbook and tracker say to do next. `done` marks completion. */
  steps: Record<string, string>;
  /** Off the main line: it shows once started and never holds up the Seal. */
  optional?: boolean;
  /** A link the tracker keeps under this task (e.g. where to download the app). */
  link?: { label: string; url: string };
}

/** Where the compass points for a quest step: interaction ids (a trailing `*` matches a prefix) and the label. */
export interface QuestTarget {
  ids: readonly string[];
  label: string;
  /** A label per interaction id, where it differs. */
  labels?: Readonly<Record<string, string>>;
}

/** A script step in a pack file: a game step, or another named script of the same island, spliced in. */
export type PackScriptStep = ScriptStep | { script: string };

/** `quests/<island>.json`, as written. */
export interface IslandQuestsFile {
  island: string;
  /** The tracker's header (the island's name is the game's). */
  tracker: { chapter: string; goal: string; next: string };
  quests: readonly QuestDef[];
  /** `<quest>:<step>` → where the compass points. */
  targets: Readonly<Record<string, QuestTarget>>;
  /** Which script or line each NPC offers for the quest state; the first row that fits wins. */
  beats: readonly Beat[];
  /** Named scripts the island's NPCs and puzzles play (src/game/script.ts). */
  scripts: Readonly<Record<string, readonly PackScriptStep[]>>;
  /** What each script is for (for authors; the game ignores it). */
  notes?: Readonly<Record<string, string>>;
  /** NPC id → the unvoiced lines they say when there's no script for them. */
  barks: Readonly<Record<string, readonly string[]>>;
}

/** An island's quests with every `{ script }` step spliced in. */
export interface IslandQuests extends Omit<IslandQuestsFile, 'scripts'> {
  scripts: Readonly<Record<string, readonly ScriptStep[]>>;
}

/** The kinds of puzzle the game can run (COURSE-PACKS.md §4): a puzzle file names its mechanic. */
export const PUZZLE_MECHANICS = [
  'classify',
  'choose-tool',
  'route',
  'match',
  'procedure',
  'checklist',
  'budget',
  'ceremony',
] as const;
export type PuzzleMechanic = (typeof PUZZLE_MECHANICS)[number];

/** `puzzles/<name>.json`: a puzzle's content. Its other fields depend on its mechanic. */
export interface PuzzleFile {
  /** The puzzle's name in the course (`P0.2`, `P1.3`): for people and messages; saves keep the game's keys. */
  id: string;
  mechanic: PuzzleMechanic;
  /** The chapter its `cites` (or its items' `section` anchors) are in. */
  chapter?: string;
  /** Off for this course: its site stays as scenery and the game doesn't create the puzzle. */
  disabled?: boolean;
  /** Its words (labels, hints, readouts), by key; `{name}` marks a value the game fills in. */
  text?: Readonly<Record<string, string>>;
  /** Its voiced lines, by what they're for. */
  lines?: Readonly<Record<string, string>>;
}

export interface CoursePack {
  id: string;
  meta: CourseMeta;
  /** In the course's order. */
  chapters: readonly ChapterContent[];
  /** Island id → its quests. */
  quests: Readonly<Record<string, IslandQuests>>;
  labels: Readonly<Record<string, ChartLabelText>>;
  /** File name (`crane`) → the puzzle's content. */
  puzzles: Readonly<Record<string, PuzzleFile>>;
  boards: CourseBoardsData;
  market: MarketData;
  models: ModelsFile;
  lock: CourseLock;
}

/** A course without the Model Market: nothing on its boards, no jobs. */
const NO_MARKET: MarketData = {
  categories: [],
  efforts: [],
  autoPrice: 0,
  maxPrice: 0,
  sizes: {
    quick: { label: '', refund: 0, doubloons: 0 },
    hard: { label: '', refund: 0, doubloons: 0 },
  },
  board: { size: 0, perFamily: 0 },
  stamps: { right: '', over: '', short: '' },
  quotes: {} as MarketData['quotes'],
  jobs: [],
  gilda: {} as MarketData['gilda'],
};
const NO_MODELS: ModelsFile = { source: { repo: '', path: '', commit: '', fetchedAt: '' }, models: [] };

/** The pack's files the game reads, by path in the pack ("chapters/00-setup.json"). */
type PackFiles = Readonly<Record<string, unknown>>;

/** A pack file less its `$schema` and `$comment` (they're for editors, not the game). */
export function withoutMeta<T extends object>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([k]) => k !== '$schema' && k !== '$comment')) as T;
}

/** Splices `{ script: name }` steps in, depth first; a loop or an unknown name throws. */
function expandScripts(
  island: string,
  scripts: Readonly<Record<string, readonly PackScriptStep[]>>,
): Record<string, readonly ScriptStep[]> {
  const out: Record<string, readonly ScriptStep[]> = {};
  const expand = (name: string, seen: readonly string[]): readonly ScriptStep[] => {
    if (out[name]) return out[name]!;
    const steps = scripts[name];
    if (!steps) throw new Error(`${island}: no script "${name}" (from ${seen.join(' → ') || 'the game'})`);
    if (seen.includes(name)) throw new Error(`${island}: script "${name}" includes itself`);
    const flat: ScriptStep[] = [];
    for (const s of steps) {
      if ('script' in s) flat.push(...expand(s.script, [...seen, name]));
      else flat.push(s);
    }
    return (out[name] = flat);
  };
  for (const name of Object.keys(scripts)) expand(name, []);
  return out;
}

function need<T>(files: PackFiles, path: string, id: string): T {
  const f = files[path];
  if (f === undefined) throw new Error(`Course pack "${id}" has no ${path}`);
  return f as T;
}

/** Builds a pack from its files (the browser's lazy chunk, or the tools' reads from disk). */
export function assemblePack(meta: CourseMeta, files: PackFiles): CoursePack {
  const id = meta.id;
  const chapters = Object.keys(files)
    .filter((p) => /^chapters\/[^/]+\.json$/.test(p))
    .sort()
    .map((p) => withoutMeta(files[p] as ChapterContent));
  const quests: Record<string, IslandQuests> = {};
  for (const p of Object.keys(files).sort()) {
    const m = /^quests\/([^/]+)\.json$/.exec(p);
    if (!m) continue;
    const file = withoutMeta(files[p] as IslandQuestsFile);
    quests[file.island] = { ...file, scripts: expandScripts(file.island, file.scripts) };
  }
  const puzzles: Record<string, PuzzleFile> = {};
  for (const p of Object.keys(files).sort()) {
    const m = /^puzzles\/([^/]+)\.json$/.exec(p);
    if (m) puzzles[m[1]!] = withoutMeta(files[p] as PuzzleFile);
  }
  return {
    id,
    meta,
    chapters,
    quests,
    puzzles,
    labels: need<{ labels: Record<string, ChartLabelText> }>(files, 'labels.json', id).labels,
    boards: withoutMeta(need<CourseBoardsData>(files, 'boards.json', id)),
    // The Model Market teaches the Copilot app's models: a course without one has neither file.
    market: files['market.json'] ? withoutMeta(files['market.json'] as MarketData) : NO_MARKET,
    models: (files['models.json'] as ModelsFile | undefined) ?? NO_MODELS,
    lock: need<CourseLock>(files, 'lock.json', id),
  };
}
