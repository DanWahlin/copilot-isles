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
  sail: { line: string; meridianOpen: string };
  /** NPC id → the voiced lines they say when they've no script (instead of a bark). */
  npcVoiced: Readonly<Record<string, readonly string[]>>;
  /** Set pieces' lines by name (the gondola ride's). */
  setPieces: Readonly<Record<string, string>>;
  /** Battle plan id → its course part. */
  battles: Readonly<Record<string, BattleHooks>>;
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
  /** The "Your setup" forms' words (src/ui/learn/SetupForm.tsx). */
  setup: SetupCopy;
  hooks: CourseHooks;
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
