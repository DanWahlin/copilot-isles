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
import { onCourse } from '../../course/active';
import { courseAssetBase } from '../../course/catalog';
import { COURSE_BLOB } from '../course/chapters';

/**
 * The active course's teaching content (docs/specs/COURSE-PACKS.md): its chapters
 * (`courses/<id>/chapters/*.json`, in the course's order) and an index of each kind by id. They're
 * empty until a voyage loads the course pack, then filled in place.
 */
export const CHAPTERS: ChapterContent[] = [];

export const IMAGES = new Map<string, CourseImage>();
export const QUIZZES = new Map<string, Quiz>();
export const PAGES = new Map<string, Page>();
export const CHESTS = new Map<string, Chest>();
export const GLOSSARY = new Map<string, GlossaryTerm>();
export const TRIALS = new Map<string, Trial>();

function index<T extends { id: string }>(m: Map<string, T>, pick: (c: ChapterContent) => readonly T[]): void {
  m.clear();
  for (const c of CHAPTERS) for (const item of pick(c)) m.set(item.id, item);
}

onCourse((p) => {
  CHAPTERS.length = 0;
  CHAPTERS.push(...p.chapters);
  index(IMAGES, (c) => c.images);
  index(QUIZZES, (c) => c.quizzes);
  index(PAGES, (c) => c.pages);
  index(CHESTS, (c) => c.chests);
  index(GLOSSARY, (c) => c.glossary);
  index(TRIALS, (c) => c.trials);
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
