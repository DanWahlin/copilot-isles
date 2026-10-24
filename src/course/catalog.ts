import COPILOT_APP from '../../courses/copilot-app/course.json';
import COPILOT_CLI from '../../courses/copilot-cli/course.json';
import type { StoryRule } from '../game/story';

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

/** An island's lines the game asks for by id (COURSE-PACKS.md §5). */
export interface IslandHooks {
  /** Played over the landing shot before Wingman flies up (Juno's first look at an island). */
  landing?: readonly string[];
  /** Wingman's welcome, the first landfall; `@nav` and `@starfish` stand for the island's tips. */
  welcome: readonly string[];
  /** Wingman's welcome on a later landfall (Anchorage). */
  welcomeBack?: readonly string[];
  /** The tips the welcome points out: the task list and compass, then the island's starfish. */
  tips: { nav: string; starfish: string };
}

/** The battle's course part: what its waves are called, the question after each, and the win line. */
export interface BattleHooks {
  /** The course chapter it recaps ("00"). */
  chapter: string;
  won: string;
  waves: readonly { quiz: string; raiders: readonly string[] }[];
}

/** Everything the game asks a course for by id rather than finding it in a script. */
export interface CourseHooks {
  /** Juno's briefing in the cabin, then her line once the chest is ready. */
  briefing: { lines: readonly string[]; chest: string };
  islands: Readonly<Record<string, IslandHooks>>;
  /** Wingman's last sailing line at the christening, and the one while Port Meridian is open. */
  sail: { line: string; meridianOpen?: string };
  /** NPC id → the voiced lines they say when they've no script (instead of a bark). */
  npcVoiced: Readonly<Record<string, readonly string[]>>;
  /** Set pieces' lines by name (the gondola ride's). */
  setPieces: Readonly<Record<string, string>>;
  /** Battle plan id → its course part. */
  battles: Readonly<Record<string, BattleHooks>>;
}

/** How a course brings older saves in line with today's ids (src/game/story.ts, src/learn/progress.ts). */
export interface CourseMigrations {
  /** Rules for an older save's quests, applied in order when a session starts. */
  quests?: readonly StoryRule[];
  /** Logbook ids (pages, glossary terms) the course renamed or split: old id → today's. */
  renamed?: Readonly<Record<string, readonly string[]>>;
  /** Quest id → the glossary terms it teaches that saves which finished it before never got. */
  taught?: Readonly<Record<string, readonly string[]>>;
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
  /**
   * Whether the course's lines have voices (default true). A text-only course (`false`) shows each
   * line's caption for its reading time, and a press moves it on (COURSE-PACKS.md §5).
   */
  voice?: boolean;
  /**
   * The course's practice values (the player's own replace them once given: src/learn/setup.ts). A
   * course without a practice repository leaves them out.
   */
  practice?: { issue: number; issueTitle: string; branch: string; repoName: string };
  /** The "Your setup" forms' words (src/ui/learn/SetupForm.tsx), for a course that asks for them. */
  setup?: SetupCopy;
  hooks: CourseHooks;
  /**
   * Saves from before course packs (keys without a course) are this course's: copied to its keys
   * once, mirrored for a release, and an export code without a course is its (src/game/save-keys.ts).
   */
  legacySaves?: boolean;
  migrations?: CourseMigrations;
  /** Whether players can choose it (default true); an unlisted course is still being written. */
  listed?: boolean;
  /**
   * Wingman's spaced recap (src/learn/recap.ts): short questions from quizzes the player has already
   * met, when they land on an island or come back to the voyage. Left out, there's no recap.
   */
  recap?: RecapSettings;
}

/** The quiz kinds a recap can ask: the short ones. */
export type RecapQuizType = 'mc' | 'scenario' | 'multi';

export interface RecapSettings {
  /** How many questions a recap asks (1-3). */
  questions: number;
  /** Which quiz kinds it may ask (default: all three). */
  types?: readonly RecapQuizType[];
  /** Quizzes it never asks (one that only makes sense where it's set). */
  exclude?: readonly string[];
  /** The least time between two recaps, in minutes (default 20). */
  minGapMinutes?: number;
  /** Doubloons for each question answered right first time; starfish for a recap with every answer right. */
  reward?: { doubloons?: number; starfish?: number };
}

/** One "Your setup" form: its kicker (and the Logbook's note), titles, intro, and what it's used for. */
export interface SetupFormCopy {
  label: string;
  /** The title from the Logbook (a change). */
  title: string;
  /** The title the first time it's asked. */
  ask: string;
  intro: string;
  uses: string;
  field?: string;
  read: string;
  hint?: string;
}

export interface SetupCopy {
  os: SetupFormCopy & { shortcut: string; note: string };
  issue: SetupFormCopy;
  branch: SetupFormCopy & { match: string };
  model: SetupFormCopy & {
    choices: Readonly<Record<'auto' | 'current' | 'other', { label: string; note: string }>>;
    name: string;
    /** How captions name the pick: none yet, Auto, your current one, or one you picked (unnamed). */
    names: Readonly<Record<'none' | 'auto' | 'current' | 'other', string>>;
  };
}

/** A pack's course.json, less its `$schema` (for editors). */
function meta(file: object): CourseMeta {
  return Object.fromEntries(Object.entries(file).filter(([k]) => k !== '$schema')) as unknown as CourseMeta;
}

/** Every course, in the picker's order. A new course adds one line here. */
export const COURSES: readonly CourseMeta[] = [meta(COPILOT_APP), meta(COPILOT_CLI)];

/**
 * The courses players can choose: the listed ones, or every course with `?courses=all` (for a course
 * still being written). The course list and Continue read this; Credits and tools read `COURSES`
 * (an unlisted course's snapshot still ships in the build, so it keeps its credit).
 */
export const PLAYABLE_COURSES: readonly CourseMeta[] =
  typeof location !== 'undefined' && new URLSearchParams(location.search).get('courses') === 'all'
    ? COURSES
    : COURSES.filter((c) => c.listed !== false);

export const PLAYABLE_IDS: readonly string[] = PLAYABLE_COURSES.map((c) => c.id);

/** The course to start with when none is chosen yet: the first players can choose. */
export const DEFAULT_COURSE_ID: string = (PLAYABLE_COURSES[0] ?? COURSES[0]!).id;

/** The course saves from before course packs belong to (`"legacySaves": true`), if any. */
export const LEGACY_COURSE: string | null = COURSES.find((c) => c.legacySaves)?.id ?? null;

/**
 * The course the player's in: the one picked at the title (or the last one played), set before its
 * pack loads, and kept by the pack's activation (src/course/active.ts). A live binding: read it when
 * you need it, not into a constant at module load.
 */
export let COURSE: CourseMeta = COURSES[0]!;

export function courseMeta(id: string): CourseMeta | null {
  return COURSES.find((c) => c.id === id) ?? null;
}

const selected: ((c: CourseMeta) => void)[] = [];

/**
 * Runs `build` with the current course now and whenever another is selected: for what a module keeps
 * from `course.json` (the chart's islands, the cabin's lines), so it follows the picker.
 */
export function onCourseSelected(build: (c: CourseMeta) => void): void {
  selected.push(build);
  build(COURSE);
}

/** Makes a course the current one (an unknown id keeps the default). */
export function selectCourse(id: string): CourseMeta {
  const next = courseMeta(id) ?? courseMeta(DEFAULT_COURSE_ID)!;
  if (next !== COURSE) {
    COURSE = next;
    for (const b of selected) b(next);
  }
  return COURSE;
}

/** Whether a course's lines have voices (a text-only course's don't). */
export const courseVoiced = (c: CourseMeta = COURSE): boolean => c.voice !== false;

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

/** An island's hooks (empty for an island the course doesn't voice). */
export function islandHooks(island: string, c: CourseMeta = COURSE): IslandHooks {
  return c.hooks.islands[island] ?? { welcome: [], tips: { nav: '', starfish: '' } };
}

/** A welcome with its `@nav` and `@starfish` tips put in (or left out, `withTips: false`). */
export function welcomeLines(island: string, withTips = true, c: CourseMeta = COURSE): string[] {
  const h = islandHooks(island, c);
  return h.welcome.flatMap((id) =>
    id === '@nav'
      ? withTips
        ? [h.tips.nav]
        : []
      : id === '@starfish'
        ? withTips
          ? [h.tips.starfish]
          : []
        : [id],
  );
}

/** The island's entry in the course, if the course uses it. */
export function courseIsland(island: string, c: CourseMeta = COURSE): CourseIslandMeta | null {
  return c.islands.find((i) => i.island === island) ?? null;
}
