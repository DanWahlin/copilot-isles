/**
 * Learning content (POC §3.4-3.6): course images, quizzes, Logbook pages, chests, glossary terms,
 * and Trials. Content lives in typed modules (src/learn/content/*) rather than YAML so the compiler
 * checks every id and the tests can validate rects against the images.
 */

/** Normalized image rect: x, y, width, height, all 0-1 of the image size. */
export type Rect = readonly [x: number, y: number, w: number, h: number];

export type ChapterId = '00-setup' | '01-tour-the-app';

/** A link back to the exact course section ("Open in the course ↗"). */
export interface SourceRef {
  chapter: ChapterId;
  /** README heading anchor, e.g. "connect-to-your-repository". */
  anchor: string;
}

/** A screenshot or illustration from the course (MIT, github/copilot-app-for-beginners). */
export interface CourseImage {
  id: string;
  /** Path under public/, e.g. "course/ch00/sign-in-to-app.webp". */
  src: string;
  width: number;
  height: number;
  alt: string;
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

export interface HotspotTarget {
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
export type QuizType = Quiz['type'];

export interface Page {
  id: string;
  title: string;
  image?: string;
  /** 1-3 plain sentences. `**bold**` marks UI labels. */
  caption: string;
  /** Optional code block (e.g. the setup commands page). */
  code?: string;
  source: SourceRef;
}

export interface Chest {
  id: string;
  page: string;
  doubloons: number;
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
}
