import type {
  ChapterContent,
  Chest,
  CourseImage,
  GlossaryTerm,
  Page,
  Quiz,
  Rect,
  SourceRef,
  Trial,
} from '../types';
import { everyCoursePart, onCourse } from '../../course/active';
import type { ChapterIndex, PageIndex, QuizIndex } from '../../course/pack';
import { courseAssetBase } from '../../course/catalog';
import { COURSE_BLOB } from '../course/chapters';

/**
 * The active course's teaching content (docs/specs/COURSE-PACKS.md): its chapters
 * (`courses/<id>/chapters/*.json`, in the course's order) and an index of each kind by id. They're
 * empty until a voyage loads the course pack, then filled in place. A chapter's quizzes and pages
 * are here once its part has loaded (src/course/load.ts); the index maps (`CHAPTER_INDEX`,
 * `QUIZ_INDEX`, `PAGE_INDEX`) list every chapter's from the start, for the recap, the Logbook's tiles,
 * the course boards and the Continue card.
 */
export const CHAPTERS: ChapterContent[] = [];

export const IMAGES = new Map<string, CourseImage>();
export const QUIZZES = new Map<string, Quiz>();
export const PAGES = new Map<string, Page>();
export const CHESTS = new Map<string, Chest>();
export const GLOSSARY = new Map<string, GlossaryTerm>();
export const TRIALS = new Map<string, Trial>();

/** Every chapter's index, in the course's order. */
export const CHAPTER_INDEX: ChapterIndex[] = [];
/** Every quiz's id, kind and section, with its chapter, whether or not its part has loaded. */
export const QUIZ_INDEX = new Map<string, QuizIndex & { chapter: string }>();
/** Every page's title, picture and section, with its chapter, whether or not its part has loaded. */
export const PAGE_INDEX = new Map<string, PageIndex & { chapter: string }>();

function index<T extends { id: string }>(m: Map<string, T>, pick: (c: ChapterContent) => readonly T[]): void {
  m.clear();
  for (const c of CHAPTERS) for (const item of pick(c)) m.set(item.id, item);
}

onCourse((p) => {
  // Runs again as each chapter's part arrives.
  everyCoursePart();
  CHAPTERS.length = 0;
  CHAPTERS.push(...p.chapters);
  index(IMAGES, (c) => c.images);
  index(QUIZZES, (c) => c.quizzes);
  index(PAGES, (c) => c.pages);
  index(CHESTS, (c) => c.chests);
  index(GLOSSARY, (c) => c.glossary);
  index(TRIALS, (c) => c.trials);
  CHAPTER_INDEX.length = 0;
  CHAPTER_INDEX.push(...p.index);
  QUIZ_INDEX.clear();
  PAGE_INDEX.clear();
  for (const c of p.index) {
    for (const q of c.quizzes) QUIZ_INDEX.set(q.id, { ...q, chapter: c.chapter });
    for (const pg of c.pages) PAGE_INDEX.set(pg.id, { ...pg, chapter: c.chapter });
  }
});

/** "Open in the course ↗" link for a source ref. */
export function courseUrl(s: SourceRef): string {
  return `${COURSE_BLOB}/${s.chapter}/README.md#${s.anchor}`;
}

/** URL for a course image id: the pack's snapshot, through BASE_URL (a sub-path deploy works too). */
export function imageUrl(id: string): string {
  const img = IMAGES.get(id);
  return img ? `${courseAssetBase()}${img.src}` : '';
}

export function rectArea(r: Rect): number {
  return r[2] * r[3];
}

export function rectOverlap(a: Rect, b: Rect): number {
  const w = Math.min(a[0] + a[2], b[0] + b[2]) - Math.max(a[0], b[0]);
  const h = Math.min(a[1] + a[3], b[1] + b[3]) - Math.max(a[1], b[1]);
  return w > 0 && h > 0 ? w * h : 0;
}

export function inRect(r: Rect, x: number, y: number): boolean {
  return x >= r[0] && x <= r[0] + r[2] && y >= r[1] && y <= r[1] + r[3];
}
