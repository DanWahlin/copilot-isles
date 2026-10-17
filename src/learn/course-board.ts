import { chapters as LOCKED } from '../../content/course.lock.json';
import { COURSE_BOARDS_DATA } from '../content/course-boards';
import { COURSE_CHAPTERS, COURSE_REPO, chapterUrl, type ChapterId } from './course/chapters';
import type { ChapterLock } from './course/lock';
import type { SourceRef } from './types';

/**
 * The course notice boards (docs/specs/COURSE-BOARDS.md): one on each island, with its chapter's
 * topics pinned up. The topics come from the bundled course lock (`content/course.lock.json`), so the
 * weekly course sync keeps the boards current: each is one of the chapter's `##` sections, with the
 * course's exact title, linked to its anchor in the chapter's README (the same link as `courseUrl`
 * gives a `SourceRef` there; this module doesn't import the authored content, so the islands' builds
 * can paint the notes without it). Which chapter each island shows, the skip lists, and the header and
 * pin text are in `content/course-boards.json` (docs/content-data.md).
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
export const COURSE_BOARD_SKIP_ANCHORS: readonly string[] = COURSE_BOARDS_DATA.skip.anchors;

/**
 * The chapter's story frame (the course's recording-studio theme) isn't a topic either. Matched by
 * the start of the heading, so a new chapter's "From the Studio: …" section stays off its board.
 */
export const COURSE_BOARD_SKIP_TITLES: readonly string[] = COURSE_BOARDS_DATA.skip.titlePrefixes;

export const COURSE_HOME_URL = `https://github.com/${COURSE_REPO}`;

const locked = LOCKED as Partial<Record<ChapterId, ChapterLock>>;

/** Whether a `##` section is listed on its chapter's board. */
function isBoardTopic(anchor: string, title: string): boolean {
  return (
    !COURSE_BOARD_SKIP_ANCHORS.includes(anchor) && !COURSE_BOARD_SKIP_TITLES.some((t) => title.startsWith(t))
  );
}

/**
 * A chapter's topics from a course lock's chapter: its `##` sections in order, less the skipped ones.
 * The game reads the bundled lock; `npm run content:check` also reads the previous one, to list what
 * a course sync changed on the boards.
 */
export function boardTopics(chapter: ChapterId, lock: Pick<ChapterLock, 'sections'>): CourseBoardTopic[] {
  const topics: CourseBoardTopic[] = [];
  for (const [anchor, s] of Object.entries(lock.sections)) {
    if (s.level !== 2 || !isBoardTopic(anchor, s.title)) continue;
    topics.push({ anchor, title: s.title, url: chapterUrl(chapter, anchor) });
  }
  return topics;
}

const boards = new Map<ChapterId, CourseBoard>();

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
export function coveredTopics(chapter: ChapterId, sources: Iterable<SourceRef>): Set<string> {
  const out = new Set<string>();
  for (const s of sources) {
    if (s.chapter !== chapter) continue;
    const t = topicOf(chapter, s.anchor);
    if (t) out.add(t);
  }
  return out;
}

/** An island's chapter (content/course-boards.json), or null for an island without a board. */
export function islandChapter(island: string): ChapterId | null {
  const islands: Readonly<Record<string, { chapter: ChapterId }>> = COURSE_BOARDS_DATA.islands;
  return Object.hasOwn(islands, island) ? islands[island]!.chapter : null;
}

/** An island's board (its chapter's), or null. */
export function islandCourseBoard(island: string): CourseBoard | null {
  const chapter = islandChapter(island);
  return chapter ? courseBoard(chapter) : null;
}
