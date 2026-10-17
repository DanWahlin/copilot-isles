import type { MarketData } from '../content/market';
import type { CourseBoardsData } from '../content/course-boards';
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

export interface CoursePack {
  id: string;
  meta: CourseMeta;
  /** In the course's order. */
  chapters: readonly ChapterContent[];
  /** Island id → its quests. */
  quests: Readonly<Record<string, IslandQuests>>;
  labels: Readonly<Record<string, ChartLabelText>>;
  boards: CourseBoardsData;
  market: MarketData;
  models: ModelsFile;
  lock: CourseLock;
}

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
  return {
    id,
    meta,
    chapters,
    quests,
    labels: need<{ labels: Record<string, ChartLabelText> }>(files, 'labels.json', id).labels,
    boards: withoutMeta(need<CourseBoardsData>(files, 'boards.json', id)),
    market: withoutMeta(need<MarketData>(files, 'market.json', id)),
    models: need<ModelsFile>(files, 'models.json', id),
    lock: need<CourseLock>(files, 'lock.json', id),
  };
}
