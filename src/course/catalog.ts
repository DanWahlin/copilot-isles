import COPILOT_APP from '../../courses/copilot-app/course.json';

/**
 * The course catalog (docs/specs/COURSE-PACKS.md §2): every course pack's `course.json`, read at build
 * time. This is all of a pack the title screen loads; the rest (chapters, quests, labels, boards,
 * market, lock) comes with the voyage (`src/course/load.ts`). A new course adds one line here.
 */

/** A chapter of the course's source (a folder in its repository). */
export interface CourseChapterMeta {
  /** The chapter's folder, e.g. "00-setup". */
  id: string;
  /** Its folder in the pack's snapshot (`public/course/<short>/`). */
  short: string;
  title: string;
}

/** An island this course uses: the chapter it teaches and what the chart and arrival say about it. */
export interface CourseIslandMeta {
  /** The game's island id (src/game/islands.ts, src/ui/chart/archipelago.ts). */
  island: string;
  chapter: string;
  /** The chart's chapter label: "00 · Setup". */
  label: string;
  /** The course's estimated minutes. */
  minutes: number;
  seal?: string;
  topics: readonly string[];
  /** The arrival card's lines over the island's name. */
  arrival?: { eyebrow: string; line: string };
}

export interface CourseMeta {
  id: string;
  version: number;
  title: string;
  /** The title screen's line under the game's name. */
  tagline: string;
  description: string;
  language: string;
  /** Where the course lives (the live course and its snapshot), and its license. */
  source: {
    kind: 'github';
    /** owner/name. */
    repo: string;
    ref: string;
    license: string;
    copyright: string;
    chapters: readonly CourseChapterMeta[];
  };
  islands: readonly CourseIslandMeta[];
  /** The course's practice values (the player's own replace them once given: src/learn/setup.ts). */
  practice: { issue: number; issueTitle: string; branch: string; repoName: string };
}

/** A pack's course.json, less its `$schema` (for editors). */
function meta(file: object): CourseMeta {
  return Object.fromEntries(Object.entries(file).filter(([k]) => k !== '$schema')) as unknown as CourseMeta;
}

export const COURSES: readonly CourseMeta[] = [meta(COPILOT_APP)];

/** The course every voyage uses until there's a picker (COURSE-PACKS.md §8). */
export const COURSE: CourseMeta = COURSES[0]!;

export function courseMeta(id: string): CourseMeta | null {
  return COURSES.find((c) => c.id === id) ?? null;
}

/**
 * Where a course's own files are served: its snapshot (`course/…`) and voice (`voice/…`), from the
 * pack's `public/` folder (`coursePackAssets` in vite.config.ts). Through `BASE_URL`, so it works from
 * a sub-path (GitHub Pages).
 */
export function courseAssetBase(id: string = COURSE.id): string {
  return `${import.meta.env?.BASE_URL || '/'}courses/${id}/`;
}

/** The course's voice lines (`<id>.webm`/`.m4a`, timings and `manifest.json`). */
export function courseVoiceBase(id: string = COURSE.id): string {
  return `${courseAssetBase(id)}voice/`;
}

/** The island's entry in the course, if the course uses it. */
export function courseIsland(island: string, c: CourseMeta = COURSE): CourseIslandMeta | null {
  return c.islands.find((i) => i.island === island) ?? null;
}
