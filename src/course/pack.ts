import type { MarketData } from '../content/market';
import type { CourseBoardsData } from '../content/course-boards';
import type { Beat } from '../game/beats';
import type { IslandStory } from '../game/story';
import type { ScriptStep } from '../game/script';
import type { ModelsFile } from '../game/market/catalog';
import type { ChartLabelText } from '../learn/content/labels';
import type { CourseLock } from '../learn/course/lock';
import type { ChapterContent, ChapterId, Quiz, SourceRef } from '../learn/types';
import type { LearningFile } from '../learn/learning';
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
  tracker: {
    chapter: string;
    goal: string;
    next: string;
    /** Anchorage and Thousand-Bough: what's next once the next island's open (it replaces `next`). */
    nextSail?: string;
  };
  quests: readonly QuestDef[];
  /** `<quest>:<step>` → where the compass points. */
  targets: Readonly<Record<string, QuestTarget>>;
  /** Which script or line each NPC offers for the quest state; the first row that fits wins. */
  beats: readonly Beat[];
  /** The conditions and events the game asks the island for, in this course's quests (src/game/story.ts). */
  story?: IslandStory;
  /** The island's signs with course words, by the names the game asks for (`ISLAND_SIGNS`). */
  signs?: Readonly<Record<string, string>>;
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

/** The course section an item cites, without the hash (what the game's boards and links read). */
export type SourceAnchor = Pick<SourceRef, 'chapter' | 'anchor'>;

/** A quiz in a chapter's index: enough for the recap to pick it and a board to tick its topic. */
export interface QuizIndex {
  id: string;
  type: Quiz['type'];
  source: SourceAnchor;
}

/** A page in a chapter's index: enough for the Logbook's tiles, the Continue card and the boards. */
export interface PageIndex {
  id: string;
  title: string;
  /** The page's picture (an image id; every chapter's images are in the core). */
  image?: string;
  source: SourceAnchor;
}

/**
 * A chapter's light index (docs/specs/COURSE-PACKS.md §2): it loads with the voyage, so the recap,
 * the Logbook and the course boards know every chapter's quizzes and pages before the chapter's
 * part (their full text) has loaded.
 */
export interface ChapterIndex {
  chapter: ChapterId;
  quizzes: readonly QuizIndex[];
  pages: readonly PageIndex[];
}

/** A chapter's index, from its full content. */
export function chapterIndex(c: Pick<ChapterContent, 'chapter' | 'quizzes' | 'pages'>): ChapterIndex {
  const anchor = (s: SourceRef): SourceAnchor => ({ chapter: s.chapter, anchor: s.anchor });
  return {
    chapter: c.chapter,
    quizzes: c.quizzes.map((q) => ({ id: q.id, type: q.type, source: anchor(q.source) })),
    pages: c.pages.map((p) => ({
      id: p.id,
      title: p.title,
      ...(p.image ? { image: p.image } : {}),
      source: anchor(p.source),
    })),
  };
}

/**
 * The signs each island's dressing asks the course for (`quests/<island>.json` → `signs`): Thousand-
 * Bough's `loft`, the board over the top deck's house. Blank without a course.
 */
export const ISLAND_SIGNS: Readonly<Record<string, readonly string[]>> = {
  'thousand-bough': ['loft'],
  // Keelhaven's boards, plates, ledgers, hull names, strata bands and Dory's two ways to run a snippet
  // (src/world/islands/keelhaven/props.ts).
  keelhaven: [
    'dock1',
    'dock2',
    'dock3',
    'slipway',
    'lampPlate',
    'ledgerIssues',
    'ledgerPulls',
    'ledgerAll',
    'ledgerFork',
    'hullSearch',
    'hullNote',
    'hullLamp',
    'strataPrompt',
    'strataSettings',
    'strataInstructions',
    'strataRepo',
    'bellCord',
    'winch',
  ],
};

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
  // Keelhaven's Two Circuits (src/game/puzzles/circuit/places.ts): its content is in the pack before
  // the island's wiring step adds the mechanic's module.
  'circuit',
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
  /**
   * The quest it plays in: the steps its mechanic sets and waits on (`PUZZLE_STEPS`,
   * src/course/puzzles.ts) are that quest's.
   */
  quest?: string;
  /** Its mechanic's steps (`PUZZLE_STEPS`) the quest calls something else: game step → quest step. */
  steps?: Readonly<Record<string, string>>;
  /** Its words (labels, hints, readouts), by key; `{name}` marks a value the game fills in. */
  text?: Readonly<Record<string, string>>;
  /** Its voiced lines, by what they're for. */
  lines?: Readonly<Record<string, string>>;
}

export interface CoursePack {
  id: string;
  meta: CourseMeta;
  /**
   * In the course's order. A chapter whose part hasn't loaded yet (src/course/load.ts) has no
   * quizzes or pages here: its `index` entry lists them.
   */
  chapters: readonly ChapterContent[];
  /** Each chapter's index (same order as `chapters`), complete from the start. */
  index: readonly ChapterIndex[];
  /** Island id → its quests. */
  quests: Readonly<Record<string, IslandQuests>>;
  labels: Readonly<Record<string, ChartLabelText>>;
  /** File name (`crane`) → the puzzle's content. */
  puzzles: Readonly<Record<string, PuzzleFile>>;
  boards: CourseBoardsData;
  market: MarketData;
  models: ModelsFile;
  lock: CourseLock;
  /** The learning systems' data (`learning.json`, optional): app tasks, objectives, reflections. */
  learning: LearningFile;
}

/** A course without learning data: no app tasks, objectives or reflections. */
const NO_LEARNING: LearningFile = {
  labels: { kicker: '', checklist: '', tool: '' },
  appTasks: [],
  objectives: [],
  reflections: [],
  learned: {},
};

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
export type PackFiles = Readonly<Record<string, unknown>>;

/**
 * A chapter file as the voyage first has it: the core part of `chapters/<chapter>.json` (src/course/
 * split.ts), with its index and without the parts' fields. The whole file has no `index`.
 */
type ChapterFile = Partial<ChapterContent> & Pick<ChapterContent, 'chapter'> & { index?: ChapterIndex };

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
  const chapters: ChapterContent[] = [];
  const index: ChapterIndex[] = [];
  for (const p of Object.keys(files).sort()) {
    if (!/^chapters\/[^/]+\.json$/.test(p)) continue;
    // A chapter whose part isn't in yet has its index and no quizzes or pages.
    const { index: core, ...file } = withoutMeta(files[p] as ChapterFile);
    const c: ChapterContent = {
      chests: [],
      glossary: [],
      trials: [],
      ...file,
      images: file.images ?? [],
      quizzes: file.quizzes ?? [],
      pages: file.pages ?? [],
    };
    chapters.push(c);
    index.push(file.quizzes || !core ? chapterIndex(c) : core);
  }
  const quests: Record<string, IslandQuests> = {};
  for (const p of Object.keys(files).sort()) {
    const m = /^quests\/([^/]+)\.json$/.exec(p);
    if (!m) continue;
    // An island whose chapter part isn't in yet has its tracker, quests, story and signs only.
    const file = withoutMeta(files[p] as IslandQuestsFile);
    quests[file.island] = {
      ...file,
      targets: file.targets ?? {},
      beats: file.beats ?? [],
      barks: file.barks ?? {},
      scripts: expandScripts(file.island, file.scripts ?? {}),
    };
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
    index,
    quests,
    puzzles,
    labels: need<{ labels: Record<string, ChartLabelText> }>(files, 'labels.json', id).labels,
    boards: withoutMeta(need<CourseBoardsData>(files, 'boards.json', id)),
    // A course without the Model Market (it's optional) has neither file.
    market: files['market.json'] ? withoutMeta(files['market.json'] as MarketData) : NO_MARKET,
    models: (files['models.json'] as ModelsFile | undefined) ?? NO_MODELS,
    lock: need<CourseLock>(files, 'lock.json', id),
    learning: files['learning.json'] ? withoutMeta(files['learning.json'] as LearningFile) : NO_LEARNING,
  };
}
