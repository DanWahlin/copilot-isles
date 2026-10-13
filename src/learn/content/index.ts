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
import { CH00 } from './ch00';
import { CH01 } from './ch01';
import { CH02 } from './ch02';

export const CHAPTERS: readonly ChapterContent[] = [CH00, CH01, CH02];

const index = <T extends { id: string }>(pick: (c: ChapterContent) => readonly T[]) => {
  const m = new Map<string, T>();
  for (const c of CHAPTERS) for (const item of pick(c)) m.set(item.id, item);
  return m;
};

export const IMAGES = index<CourseImage>((c) => c.images);
export const QUIZZES = index<Quiz>((c) => c.quizzes);
export const PAGES = index<Page>((c) => c.pages);
export const CHESTS = index<Chest>((c) => c.chests);
export const GLOSSARY = index<GlossaryTerm>((c) => c.glossary);
export const TRIALS = index<Trial>((c) => c.trials);

const COURSE_REPO = 'https://github.com/github/copilot-app-for-beginners/blob/main';

/** "Open in the course ↗" link for a source ref. */
export function courseUrl(s: SourceRef): string {
  return `${COURSE_REPO}/${s.chapter}/README.md#${s.anchor}`;
}

/** Public URL for a course image id (via BASE_URL: '/' in dev pages, './' in the relative-base build). */
export function imageUrl(id: string): string {
  const img = IMAGES.get(id);
  return img ? `${import.meta.env.BASE_URL || '/'}${img.src}` : '';
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
