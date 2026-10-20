import type { ChapterId } from './course/chapters';
import type { ForkPlace } from './fork';
import type { SetupKind } from './setup';

export type { ChapterId };

/**
 * Learning content (POC §3.4-3.6): course images, quizzes, Logbook pages, chests, glossary terms,
 * and Trials. Content lives in a course pack's `chapters/<chapter>.json` (docs/specs/COURSE-PACKS.md);
 * these types are its contract. The JSON Schema (`courses/schemas/chapter.schema.json`), the content
 * check and the tests check every id, and validate rects against the images.
 */

/** Normalized image rect: x, y, width, height, all 0-1 of the image size. */
export type Rect = readonly [x: number, y: number, w: number, h: number];

/**
 * Where an authored item comes from in the course (PLAN §8.3, §8.5): the chapter, the README heading
 * anchor (its "Open in the course ↗" link), and the hash of that section in the course pack's `lock.json`
 * when the item was written. The drift report flags the item when the course section's hash moves
 * on. `npm run course:refs -- <nn>` prints them for a course pack's JSON.
 */
export interface SourceRef {
  chapter: ChapterId;
  /** README heading anchor, e.g. "connect-to-your-repository". */
  anchor: string;
  /** The section's lock hash (12 hex digits) when this item was written. */
  hash: string;
  /**
   * A course screenshot the item depends on (hotspot quizzes), as its snapshot path, e.g.
   * "course/ch01/app-new-page.webp", with the SHA-256 prefix of the bundled file it was measured on.
   */
  image?: { src: string; hash: string };
}

/** A screenshot or illustration from the course (its pack's snapshot, under the course's license). */
export interface CourseImage {
  id: string;
  /** Path under public/, e.g. "course/ch00/app-sign-in.webp". */
  src: string;
  width: number;
  height: number;
  alt: string;
  /**
   * The bundled file's SHA-256 (first 12 hex digits) that the alt text, captions, and any hotspot
   * rects were written against. Sync never overwrites it (it's pinned in the lock).
   */
  hash: string;
}

export interface Option {
  id: string;
  text: string;
  /** Shown after picking this option when it's wrong (falls back to `explain.wrong`). */
  feedback?: string;
}

interface QuizBase {
  id: string;
  prompt: string;
  explain: { correct: string; wrong: string };
  source: SourceRef;
  /** Wingman's three hint tiers: a nudge, a direction, then the answer (tier 3 is off in Trials). */
  hints?: readonly [string, string, string];
}

export interface ChoiceQuiz extends QuizBase {
  /** `scenario` shows `situation` above the prompt; otherwise it's plain multiple choice. */
  type: 'mc' | 'scenario';
  situation?: string;
  options: readonly Option[];
  answer: string;
}

export interface MultiQuiz extends QuizBase {
  type: 'multi';
  options: readonly Option[];
  answers: readonly string[];
}

interface HotspotTarget {
  id: string;
  rect: Rect;
  /** Read by screen readers and the Tab-cycling alternative. */
  label: string;
  correct?: boolean;
  feedback?: string;
}

export interface HotspotQuiz extends QuizBase {
  type: 'hotspot';
  image: string;
  /** Patches over the course's numbered callout badges so they don't give the answer away. */
  mask: readonly Rect[];
  targets: readonly HotspotTarget[];
}

export interface OrderingQuiz extends QuizBase {
  type: 'ordering';
  /** In the correct order; the UI shuffles them. */
  items: readonly Option[];
}

export interface MatchingQuiz extends QuizBase {
  type: 'matching';
  /** Each left item matches the right item at the same index; the UI shuffles the right column. */
  pairs: readonly { left: Option; right: Option }[];
}

export type Quiz = ChoiceQuiz | MultiQuiz | HotspotQuiz | OrderingQuiz | MatchingQuiz;

export interface Page {
  id: string;
  title: string;
  image?: string;
  /** 1-3 plain sentences. `**bold**` marks UI labels. */
  caption: string;
  /** Optional code block (e.g. the setup commands page). */
  code?: string;
  /**
   * Links into the player's fork, shown once they've given it: only the places the course section
   * sends them (its Actions tab, Issues, Settings…).
   */
  fork?: readonly ForkPlace[];
  /** The player's own values this page notes under its caption, once they've given them (Your setup). */
  setup?: readonly SetupKind[];
  source: SourceRef;
}

export interface Chest {
  id: string;
  page: string;
  doubloons: number;
  /** A treasure chest (default) or a message bottle; bottles style the reveal card differently. */
  kind?: 'chest' | 'bottle';
}

export interface GlossaryTerm {
  id: string;
  term: string;
  definition: string;
}

export interface Trial {
  id: string;
  title: string;
  /** Quiz ids, asked in order. You pass when every item is answered correctly (retries allowed). */
  items: readonly string[];
  reward: { seal: string; doubloons: number };
}

export interface ChapterContent {
  chapter: ChapterId;
  images: readonly CourseImage[];
  quizzes: readonly Quiz[];
  pages: readonly Page[];
  chests: readonly Chest[];
  glossary: readonly GlossaryTerm[];
  trials: readonly Trial[];
  /** The course section each voiced teaching line (tools/voice/lines.*.json id) paraphrases. */
  voiced?: Readonly<Record<string, SourceRef>>;
  /**
   * Unvoiced teaching text in a puzzle (a crate's reason for its plate, say), keyed `<puzzle>.<id>`,
   * with the course section it paraphrases. The drift report checks these like voiced lines.
   */
  cited?: Readonly<Record<string, { text: string; source: SourceRef }>>;
}
