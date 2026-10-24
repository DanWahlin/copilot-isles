import { COURSE_BOARDS_DATA } from '../content/course-boards';
import { onCourse } from '../course/active';
import { onCourseSelected } from '../course/catalog';
import { COURSE_BOARDS } from '../world/islands/course-boards';
import { COURSE_CHAPTERS, COURSE_REPO, chapterUrl, type ChapterId } from './course/chapters';
import type { ChapterLock } from './course/lock';
import type { SourceRef } from './types';

/**
 * The course notice boards (docs/specs/COURSE-BOARDS.md): one on each island, with its chapter's
 * topics pinned up. The topics come from the course pack's lock (`courses/<id>/lock.json`), so the
 * weekly course sync keeps the boards current: each is one of the chapter's `##` sections, with the
 * course's exact title, linked to its anchor in the chapter's README (the same link as `courseUrl`
 * gives a `SourceRef` there; this module doesn't import the authored content, so the islands' builds
 * can paint the notes without it). Which chapter each island shows is in the pack's `course.json`; the
 * skip lists and the header and pin text are in its `boards.json` (docs/content-data.md).
 */
export interface CourseBoardTopic {
  /** The section's README anchor (GitHub's slug). */
  anchor: string;
  /** The course's own heading text. */
  title: string;
  url: string;
}

export interface CourseBoard {
  chapter: ChapterId;
  /** "00". */
  num: string;
  /** The chapter's title in the course ("Setup"). */
  title: string;
  topics: readonly CourseBoardTopic[];
  /** The chapter's README. */
  chapterUrl: string;
  /** The course's home page (the course repository's README). */
  homeUrl: string;
}

/**
 * Sections that aren't topics: what you need first, the hand-off to the next chapter, and the list
 * of sources. Matched by anchor.
 */
export let COURSE_BOARD_SKIP_ANCHORS: readonly string[] = [];

/**
 * The chapter's story frame (the course's recording-studio theme) isn't a topic either. Matched by
 * the start of the heading, so a new chapter's "From the Studio: …" section stays off its board.
 */
export let COURSE_BOARD_SKIP_TITLES: readonly string[] = [];

export let COURSE_HOME_URL = '';
onCourseSelected(() => {
  COURSE_HOME_URL = `https://github.com/${COURSE_REPO}`;
});

let locked: Partial<Record<ChapterId, ChapterLock>> = {};

const boards = new Map<ChapterId, CourseBoard>();

onCourse((p) => {
  COURSE_BOARD_SKIP_ANCHORS = COURSE_BOARDS_DATA.skip.anchors;
  COURSE_BOARD_SKIP_TITLES = COURSE_BOARDS_DATA.skip.titlePrefixes;
  locked = p.lock.chapters;
  boards.clear();
});

/** The `##` sections that aren't topics (a pack's `boards.json` → `skip`). */
export interface BoardSkip {
  anchors: readonly string[];
  titlePrefixes: readonly string[];
}

/** Whether a `##` section is listed on its chapter's board. */
function isBoardTopic(anchor: string, title: string, skip: BoardSkip): boolean {
  return !skip.anchors.includes(anchor) && !skip.titlePrefixes.some((t) => title.startsWith(t));
}

/**
 * A chapter's topics from a course lock's chapter: its `##` sections in order, less the skipped ones.
 * The game reads the course pack's lock with its own skip lists; `npm run content:check` passes the
 * pack's on disk, and also reads the previous lock, to list what a course sync changed on the boards.
 */
export function boardTopics(
  chapter: ChapterId,
  lock: Pick<ChapterLock, 'sections'>,
  skip: BoardSkip = { anchors: COURSE_BOARD_SKIP_ANCHORS, titlePrefixes: COURSE_BOARD_SKIP_TITLES },
): CourseBoardTopic[] {
  const topics: CourseBoardTopic[] = [];
  for (const [anchor, s] of Object.entries(lock.sections)) {
    if (s.level !== 2 || !isBoardTopic(anchor, s.title, skip)) continue;
    // A heading's leading emoji ("🎯 Learning Objectives") stays off the board.
    topics.push({
      anchor,
      title: s.title.replace(/^[^\p{L}\p{N}"'(]+/u, ''),
      url: chapterUrl(chapter, anchor),
    });
  }
  return topics;
}

/** A chapter's board, or null if the chapter isn't in the bundled snapshot yet. */
export function courseBoard(chapter: ChapterId): CourseBoard | null {
  const cached = boards.get(chapter);
  if (cached) return cached;
  const lock = locked[chapter];
  const info = COURSE_CHAPTERS.find((c) => c.id === chapter);
  if (!lock || !info) return null;
  const board: CourseBoard = {
    chapter,
    num: chapter.slice(0, 2),
    title: lock.title,
    topics: boardTopics(chapter, lock),
    chapterUrl: chapterUrl(chapter),
    homeUrl: COURSE_HOME_URL,
  };
  boards.set(chapter, board);
  return board;
}

/**
 * The board topic (`##` section) a course anchor sits in: the anchor itself for a `##`, or the
 * `##` above a deeper heading. Null if the anchor isn't in the chapter.
 */
export function topicOf(chapter: ChapterId, anchor: string): string | null {
  const lock = locked[chapter];
  if (!lock) return null;
  let top: string | null = null;
  for (const [a, s] of Object.entries(lock.sections)) {
    if (s.level <= 2) top = s.level === 2 ? a : null;
    if (a === anchor) return top;
  }
  return null;
}

/**
 * The board's topics the player has met in the game: a Logbook page they hold, or a quiz they've
 * passed, that cites the topic's section (or a heading inside it).
 */
export function coveredTopics(
  chapter: ChapterId,
  sources: Iterable<Pick<SourceRef, 'chapter' | 'anchor'>>,
): Set<string> {
  const out = new Set<string>();
  for (const s of sources) {
    if (s.chapter !== chapter) continue;
    const t = topicOf(chapter, s.anchor);
    if (t) out.add(t);
  }
  return out;
}

/** An island's chapter (the course's `course.json`), or null for an island without a board. */
export function islandChapter(island: string): ChapterId | null {
  const islands: Readonly<Record<string, { chapter: ChapterId }>> = COURSE_BOARDS;
  return Object.hasOwn(islands, island) ? islands[island]!.chapter || null : null;
}

/** An island's board (its chapter's), or null. */
export function islandCourseBoard(island: string): CourseBoard | null {
  const chapter = islandChapter(island);
  return chapter ? courseBoard(chapter) : null;
}
