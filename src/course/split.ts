import type { CourseLock } from '../learn/course/lock';
import type { ChapterContent } from '../learn/types';
import type { CourseMeta } from './catalog';
import { chapterIndex, type IslandQuestsFile, type PackFiles, type PuzzleFile } from './pack';
import { PUZZLE_ISLANDS } from './puzzle-islands';

/**
 * How a course pack loads in parts (docs/specs/COURSE-PACKS.md §2). The voyage loads the **core**:
 * every file the game reads everywhere (labels, boards, market, models, learning, the lock's
 * section titles), each chapter's index, images (a script on one island can show another chapter's
 * picture), chests, glossary and Trials, each island's tracker, quests, story and signs, and each
 * puzzle's mechanic, quest and steps. Each chapter has a **part** with the rest: the chapter's
 * quizzes, pages and voiced and cited lines, and its island's compass targets, beats, scripts and
 * barks and its puzzles' content. A part loads when its island streams in, or when something asks for it
 * (src/course/load.ts).
 *
 * Both work on the pack's files by path, so a part merges into the core file by file
 * (`mergePackPart`) and `assemblePack` builds the pack from the result. The Vite plugin
 * (tools/course-pack/vite-plugin.mjs) splits each pack at build time; the tests check that the core
 * with every part merged in assembles to the same pack as the files on disk.
 */

/** The chapter whose island this is (`course.json` → `islands`), or null. */
export function islandChapter(meta: Pick<CourseMeta, 'islands'>, island: string): string | null {
  return meta.islands.find((i) => i.island === island)?.chapter ?? null;
}

/** The chapter a puzzle's part goes with (its island's), or null for a puzzle on no course island. */
export function puzzleChapter(meta: Pick<CourseMeta, 'islands'>, name: string): string | null {
  const island = PUZZLE_ISLANDS[name];
  return island ? islandChapter(meta, island) : null;
}

/** A pack split into its core and its chapters' parts (each by path in the pack). */
export interface PackSplit {
  core: Record<string, unknown>;
  /** Chapter id → the rest of each file it owns, by the same path as in the core. */
  parts: Record<string, Record<string, unknown>>;
}

export interface SplitOptions {
  /**
   * For the browser: leave out what the game never reads (the scripts' `notes`, the lock's hashes,
   * terms and images, each file's `$schema` and `$comment`). Off, the core and parts together hold
   * every field (for the tests).
   */
  trim?: boolean;
}

/** The fields of a chapter file that stay in the core (the rest goes to the chapter's part). */
const CHAPTER_CORE = ['chapter', 'images', 'chests', 'glossary', 'trials'] as const;
/** The fields of a quests file that stay in the core. */
const QUESTS_CORE = ['island', 'tracker', 'quests', 'story', 'signs'] as const;
/** The fields of a puzzle file that stay in the core. */
const PUZZLE_CORE = ['id', 'mechanic', 'chapter', 'disabled', 'quest', 'steps'] as const;

/** `o`'s fields split into those named and the rest, without `$schema` and `$comment`. */
function divide(o: object, keep: readonly string[]): [Record<string, unknown>, Record<string, unknown>] {
  const a: Record<string, unknown> = {};
  const b: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) {
    if (k === '$schema' || k === '$comment') continue;
    (keep.includes(k) ? a : b)[k] = v;
  }
  return [a, b];
}

/** The lock as the game reads it: each chapter's title and its sections' titles and levels. */
export function trimLock(lock: CourseLock): CourseLock {
  return {
    chapters: Object.fromEntries(
      Object.entries(lock.chapters).map(([id, c]) => [
        id,
        {
          short: c!.short,
          title: c!.title,
          sections: Object.fromEntries(
            Object.entries(c!.sections).map(([a, s]) => [a, { title: s.title, level: s.level }]),
          ),
        },
      ]),
    ),
  } as unknown as CourseLock;
}

/** Splits a pack's files (all but `course.json`) into the core and one part per chapter. */
export function splitPack(meta: CourseMeta, files: PackFiles, o: SplitOptions = {}): PackSplit {
  const core: Record<string, unknown> = {};
  const parts: Record<string, Record<string, unknown>> = {};
  const toPart = (chapter: string, path: string, rest: Record<string, unknown>) => {
    if (Object.keys(rest).length) (parts[chapter] ??= {})[path] = rest;
  };
  for (const path of Object.keys(files).sort()) {
    const file = files[path] as object;
    const chapterFile = /^chapters\/[^/]+\.json$/.test(path);
    const questsFile = /^quests\/[^/]+\.json$/.test(path);
    const puzzle = /^puzzles\/([^/]+)\.json$/.exec(path)?.[1];
    const chapter = chapterFile
      ? (file as ChapterContent).chapter
      : questsFile
        ? islandChapter(meta, (file as IslandQuestsFile).island)
        : puzzle
          ? puzzleChapter(meta, puzzle)
          : null;
    if (!chapter) {
      core[path] = !o.trim ? file : path === 'lock.json' ? trimLock(file as CourseLock) : divide(file, [])[1];
      continue;
    }
    if (chapterFile) {
      const [keep, rest] = divide(file, CHAPTER_CORE);
      core[path] = { ...keep, index: chapterIndex(file as ChapterContent) };
      toPart(chapter, path, rest);
    } else if (questsFile) {
      const [keep, rest] = divide(file, QUESTS_CORE);
      if (o.trim) delete rest.notes;
      core[path] = keep;
      toPart(chapter, path, rest);
    } else {
      const [keep, rest] = divide(file as PuzzleFile, PUZZLE_CORE);
      core[path] = keep;
      toPart(chapter, path, rest);
    }
  }
  return { core, parts };
}

/** Merges a chapter's part into the pack's files (a new record; the files it had stay as they were). */
export function mergePackPart(files: PackFiles, part: PackFiles): Record<string, unknown> {
  const out: Record<string, unknown> = { ...files };
  for (const [path, rest] of Object.entries(part))
    out[path] = { ...(files[path] as object), ...(rest as object) };
  return out;
}
