import { cleanFork, type ForkRef } from './fork';
import { cleanSetup, EMPTY_SETUP, type SetupData } from './setup';
import { courseMeta, DEFAULT_COURSE_ID, LEGACY_COURSE } from '../course/catalog';
import { courseKey, writeCourseKey } from '../game/save-keys';

/**
 * Learning progress (POC §3.9 subset): pages, chests, glossary, quiz attempts, quests, trials, seals,
 * and doubloons, saved to localStorage under a versioned key. Position/captain stay in GameFlow's save.
 */
// Per course: `kraken-isles.<course>.progress.v1` (src/game/save-keys.ts, COURSE-PACKS.md §6).

interface QuizRecord {
  attempts: number;
  /** True when the first attempt was correct (earns the bonus). */
  firstTry: boolean;
  passed: boolean;
}

/** A puzzle's saved state (POC §3.9): solved, plus whatever the puzzle needs to resume (tile turns, levers). */
export interface PuzzleSave {
  solved: boolean;
  state?: number[];
  flags?: string[];
}

/** The category a saved Auto hire has (a save value, not a word to show). */
export const AUTO_HIRE = 'Auto';

/** One hire at the Model Market, as saved: a model that leaves the board later still loads. */
export interface MarketHire {
  outcome: 'right' | 'over' | 'short';
  /** `AUTO_HIRE`, or the model's category on the day you hired it. */
  category: string;
  /** The model's name (null for Auto). */
  model: string | null;
  effort: 'low' | 'default' | 'high' | null;
  /** The house special's effort level (its id in the pack), for an `AUTO_HIRE` (older saves: none). */
  level?: string | null;
  paid: number;
}

export interface MarketSave {
  /** Job id → whether it's been done right-sized, and the last hire for it. */
  jobs: Record<string, { done: boolean; last: MarketHire | null }>;
  /** The stallholder has said hello (once per save). */
  greeted: boolean;
}

/** What the player said about a real-app task (src/learn/learning.ts): done, or later. */
export interface AppTaskRecord {
  status: 'done' | 'later';
  /** When they last said so (ms since 1970). */
  at: number;
  /** GitHub's public API showed the task's evidence (an opt-in check). */
  verified?: boolean;
  /** Their answer to the task's "What did you see?", right or not. */
  seen?: 'right' | 'wrong';
}

/** A quiz in Wingman's recap schedule (src/learn/recap.ts). */
export interface RecapItem {
  /** Its spacing box: 0 is due at once, each right answer moves it up one, a wrong one back to 0. */
  box: number;
  /** When it was last answered (ms since 1970). */
  seen: number;
  right: number;
  wrong: number;
}

export interface RecapSave {
  items: Record<string, RecapItem>;
  /** When the last recap ran (0: never). */
  last: number;
  /** How many recaps have run (the scheduler's seed). */
  runs: number;
}

/** The last thing the player learned, for the "where you left off" card. */
export interface LastLearned {
  kind: 'page' | 'quest';
  id: string;
  at: number;
}

export interface ProgressData {
  v: 1;
  created: number;
  pages: string[];
  chests: string[];
  glossary: string[];
  quizzes: Record<string, QuizRecord>;
  /** Quest id → step reached (quests define their own step names). */
  quests: Record<string, string>;
  trials: Record<string, { passed: boolean; stars: number }>;
  seals: string[];
  doubloons: number;
  /** Sail colour picked at the palette stand (Paint Your Sails). */
  sails: string | null;
  /** Typed at captain select; the ship's name defaults to "<captain>’s Brigantine" (POC §4.8). */
  captainName: string | null;
  shipName: string | null;
  /**
   * The player's fork of the course, typed at Ezra's register or the crane (null until then, or if
   * they skipped). Local only: the game never looks it up on GitHub.
   */
  fork: ForkRef | null;
  /**
   * Your setup (src/learn/setup.ts): the computer, practice issue number, session branch, and model the
   * player told the game about. Each is null until given (or if skipped). Local only.
   */
  setup: SetupData;
  /** Puzzle id → saved state. */
  puzzles: Record<string, PuzzleSave>;
  /** Whether the player has opened the Logbook yet (until then, new pages say where they went). */
  logbookOpened: boolean;
  /** Islands whose arrival flyover has played (it plays once per island). */
  arrivals: string[];
  /** Starfish found (ids from src/world/starfish/spots.ts). */
  starfish: string[];
  /**
   * Starfish to spend at the Model Market (docs/specs/MODEL-MARKET.md §3): one for each starfish
   * picked up, less what the market took. Never below 0. Saves from before the market start with one
   * for each starfish they'd found.
   */
  starfishPurse: number;
  /** The Model Market's jobs (src/game/market/jobs.ts): what you last hired for each, and if it's done. */
  market: MarketSave;
  /** Chart labels already shown (ids from the course pack's labels.json): a puzzle's label shows once per save. */
  labels: string[];
  /** Real-app tasks the player answered (learning.json ids). Not answered yet: not reached. */
  appTasks: Record<string, AppTaskRecord>;
  /** Wingman's spaced recap. */
  recap: RecapSave;
  /** Chapter → the takeaway picked before its Seal (null: skipped). */
  reflections: Record<string, { choice: string | null; at: number }>;
  lastLearned: LastLearned | null;
  /** When this progress was last saved (0: never). */
  updated: number;
}

function emptyProgress(now = Date.now()): ProgressData {
  return {
    v: 1,
    created: now,
    pages: [],
    chests: [],
    glossary: [],
    quizzes: {},
    quests: {},
    trials: {},
    seals: [],
    doubloons: 0,
    sails: null,
    captainName: null,
    shipName: null,
    fork: null,
    setup: { ...EMPTY_SETUP },
    puzzles: {},
    logbookOpened: false,
    arrivals: [],
    starfish: [],
    starfishPurse: 0,
    market: { jobs: {}, greeted: false },
    labels: [],
    appTasks: {},
    recap: { items: {}, last: 0, runs: 0 },
    reflections: {},
    lastLearned: null,
    updated: 0,
  };
}

export const NAME_MAX = 24;

/** Trims a typed name to one clean line (no control characters), or null if nothing's left. */
export function cleanName(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v
    .replace(/\s+/g, ' ')
    .replace(/\p{Cc}/gu, '')
    .trim();
  return s ? Array.from(s).slice(0, NAME_MAX).join('').trim() : null;
}

/** The ship's default name for a captain (POC §4.8): "<name>’s Brigantine". */
export function defaultShipName(captain: string | null): string {
  return captain ? `${captain}’s Brigantine` : 'The Wayfinder';
}

/** Old ids moved to today's: the course's `migrations.renamed` (a Logbook id renamed or split). */
const renamed = (ids: string[], to: Readonly<Record<string, readonly string[]>> = {}): string[] => [
  ...new Set(ids.flatMap((s) => (Object.hasOwn(to, s) ? to[s]! : [s]))),
];

/** Glossary terms a finished quest teaches that older saves never got (`migrations.taught`). */
const withTaught = (
  glossary: string[],
  quests: Record<string, string>,
  taught: Readonly<Record<string, readonly string[]>> = {},
): string[] => [
  ...new Set([
    ...glossary,
    ...Object.entries(taught).flatMap(([q, terms]) => (quests[q] === 'done' ? terms : [])),
  ]),
];

/**
 * Parses a stored value, dropping anything malformed instead of throwing (old or hand-edited saves),
 * and moves old ids on with the course's `migrations`.
 */
export function parseProgress(raw: string | null, course: string = DEFAULT_COURSE_ID): ProgressData {
  if (!raw) return emptyProgress();
  const m = courseMeta(course)?.migrations;
  try {
    const d = JSON.parse(raw) as Partial<ProgressData>;
    if (d?.v !== 1) return emptyProgress();
    const base = emptyProgress(typeof d.created === 'number' ? d.created : Date.now());
    const strings = (v: unknown) =>
      Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string') : [];
    const quests = d.quests && typeof d.quests === 'object' ? d.quests : {};
    return {
      ...base,
      pages: renamed(strings(d.pages), m?.renamed),
      chests: strings(d.chests),
      glossary: withTaught(renamed(strings(d.glossary), m?.renamed), quests, m?.taught),
      seals: strings(d.seals),
      quizzes: d.quizzes && typeof d.quizzes === 'object' ? d.quizzes : {},
      quests,
      trials: d.trials && typeof d.trials === 'object' ? d.trials : {},
      doubloons: typeof d.doubloons === 'number' && d.doubloons >= 0 ? Math.floor(d.doubloons) : 0,
      sails: typeof d.sails === 'string' ? d.sails : null,
      captainName: cleanName(d.captainName),
      shipName: cleanName(d.shipName),
      fork: cleanFork(d.fork),
      setup: cleanSetup(d.setup),
      puzzles: parsePuzzles(d.puzzles),
      logbookOpened: d.logbookOpened === true,
      arrivals: strings(d.arrivals),
      starfish: strings(d.starfish),
      // A save from before the market: every starfish found so far is there to spend.
      starfishPurse:
        typeof d.starfishPurse === 'number' && Number.isFinite(d.starfishPurse)
          ? Math.max(0, Math.floor(d.starfishPurse))
          : new Set(strings(d.starfish)).size,
      market: parseMarket(d.market),
      labels: strings(d.labels),
      appTasks: parseAppTasks(d.appTasks),
      recap: parseRecap(d.recap),
      reflections: parseReflections(d.reflections),
      lastLearned: parseLastLearned(d.lastLearned),
      updated: time(d.updated),
    };
  } catch {
    return emptyProgress();
  }
}

/** A time in a save: a finite, non-negative number of ms, or 0. */
const time = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0);
const count = (v: unknown): number =>
  typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
const record = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

function parseAppTasks(v: unknown): Record<string, AppTaskRecord> {
  const out: Record<string, AppTaskRecord> = {};
  for (const [id, raw] of Object.entries(record(v))) {
    const r = record(raw);
    if (r.status !== 'done' && r.status !== 'later') continue;
    const rec: AppTaskRecord = { status: r.status, at: time(r.at) };
    if (r.verified === true) rec.verified = true;
    if (r.seen === 'right' || r.seen === 'wrong') rec.seen = r.seen;
    out[id] = rec;
  }
  return out;
}

function parseRecap(v: unknown): RecapSave {
  const r = record(v);
  const items: Record<string, RecapItem> = {};
  for (const [id, raw] of Object.entries(record(r.items))) {
    const i = record(raw);
    items[id] = {
      box: Math.min(count(i.box), 9),
      seen: time(i.seen),
      right: count(i.right),
      wrong: count(i.wrong),
    };
  }
  return { items, last: time(r.last), runs: count(r.runs) };
}

function parseReflections(v: unknown): Record<string, { choice: string | null; at: number }> {
  const out: Record<string, { choice: string | null; at: number }> = {};
  for (const [ch, raw] of Object.entries(record(v))) {
    const r = record(raw);
    out[ch] = { choice: typeof r.choice === 'string' ? r.choice : null, at: time(r.at) };
  }
  return out;
}

function parseLastLearned(v: unknown): LastLearned | null {
  const r = record(v);
  if ((r.kind !== 'page' && r.kind !== 'quest') || typeof r.id !== 'string') return null;
  return { kind: r.kind, id: r.id, at: time(r.at) };
}

const OUTCOMES = ['right', 'over', 'short'] as const;
const EFFORTS = ['low', 'default', 'high'] as const;

function parseHire(v: unknown): MarketHire | null {
  if (!v || typeof v !== 'object') return null;
  const h = v as Partial<MarketHire>;
  if (!OUTCOMES.includes(h.outcome as MarketHire['outcome']) || typeof h.category !== 'string') return null;
  return {
    outcome: h.outcome as MarketHire['outcome'],
    category: h.category,
    model: typeof h.model === 'string' ? h.model : null,
    effort: EFFORTS.includes(h.effort as 'low') ? (h.effort as MarketHire['effort']) : null,
    level: typeof h.level === 'string' ? h.level : null,
    paid: typeof h.paid === 'number' && h.paid >= 0 ? Math.floor(h.paid) : 0,
  };
}

function parseMarket(v: unknown): MarketSave {
  const out: MarketSave = { jobs: {}, greeted: false };
  if (!v || typeof v !== 'object') return out;
  const m = v as { jobs?: unknown; greeted?: unknown };
  out.greeted = m.greeted === true;
  if (m.jobs && typeof m.jobs === 'object')
    for (const [id, raw] of Object.entries(m.jobs as Record<string, unknown>)) {
      if (!raw || typeof raw !== 'object') continue;
      const j = raw as { done?: unknown; last?: unknown };
      out.jobs[id] = { done: j.done === true, last: parseHire(j.last) };
    }
  return out;
}

function parsePuzzles(v: unknown): Record<string, PuzzleSave> {
  const out: Record<string, PuzzleSave> = {};
  if (!v || typeof v !== 'object') return out;
  for (const [id, raw] of Object.entries(v as Record<string, unknown>)) {
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as Partial<PuzzleSave>;
    const save: PuzzleSave = { solved: r.solved === true };
    if (Array.isArray(r.state)) save.state = r.state.filter((n): n is number => Number.isFinite(n));
    if (Array.isArray(r.flags)) save.flags = r.flags.filter((f): f is string => typeof f === 'string');
    out[id] = save;
  }
  return out;
}

/**
 * Export/import as a copyable base64 code (POC §3.9). The code names its course (`c`); a code from
 * before course packs has none, and is the legacy course's (src/game/save-keys.ts).
 */
export function exportCode(p: ProgressData, course: string = DEFAULT_COURSE_ID): string {
  const bytes = new TextEncoder().encode(JSON.stringify({ ...p, c: course }));
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

export function importCode(code: string): { course: string; progress: ProgressData } | null {
  try {
    const bytes = Uint8Array.from(atob(code.trim()), (c) => c.charCodeAt(0));
    const raw = new TextDecoder().decode(bytes);
    const parsed = JSON.parse(raw) as { v?: unknown; c?: unknown };
    if (parsed?.v !== 1) return null;
    const course =
      typeof parsed.c === 'string' && /^[a-z0-9-]+$/.test(parsed.c)
        ? parsed.c
        : (LEGACY_COURSE ?? DEFAULT_COURSE_ID);
    return { course, progress: parseProgress(raw, course) };
  } catch {
    return null;
  }
}

export interface ProgressStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** The id lists in progress: pages, chests, glossary terms, seals, islands arrived at, starfish, and labels. */
export type SetKind = 'pages' | 'chests' | 'glossary' | 'seals' | 'arrivals' | 'starfish' | 'labels';

export class Progress {
  data: ProgressData;

  constructor(
    private readonly storage: ProgressStorage | null = safeLocalStorage(),
    private courseId: string = DEFAULT_COURSE_ID,
  ) {
    this.data = this.read();
  }

  /** The course this progress is for. */
  get course(): string {
    return this.courseId;
  }

  /** Switches to another course's progress (each course keeps its own). */
  useCourse(course: string): void {
    if (course === this.courseId) return;
    this.courseId = course;
    this.data = this.read();
  }

  private read(): ProgressData {
    const d = parseProgress(
      this.storage?.getItem(courseKey(this.courseId, 'progress')) ?? null,
      this.courseId,
    );
    this.previousSave = d.updated;
    return d;
  }

  /** When the progress was saved before this session read it (0: a fresh voyage). */
  previousSave = 0;

  save(): void {
    this.data.updated = Date.now();
    try {
      writeCourseKey(this.storage, this.courseId, 'progress', JSON.stringify(this.data));
    } catch {
      // Private mode or full storage: progress stays in memory for this session.
    }
  }

  reset(): void {
    this.data = emptyProgress();
    this.previousSave = 0;
    writeCourseKey(this.storage, this.courseId, 'progress', null);
  }

  has(kind: SetKind, id: string): boolean {
    return this.data[kind].includes(id);
  }

  /** Adds an id to a set; returns false if it was already there. */
  add(kind: SetKind, id: string): boolean {
    if (this.data[kind].includes(id)) return false;
    this.data[kind].push(id);
    if (kind === 'pages') this.data.lastLearned = { kind: 'page', id, at: Date.now() };
    this.save();
    return true;
  }

  /** Records a quiz attempt; returns the doubloons earned (first-try bonus on the first pass). */
  recordQuiz(id: string, correct: boolean): number {
    const r = this.data.quizzes[id] ?? { attempts: 0, firstTry: false, passed: false };
    const wasPassed = r.passed;
    r.attempts += 1;
    if (correct && !r.passed) {
      r.passed = true;
      r.firstTry = r.attempts === 1;
    }
    this.data.quizzes[id] = r;
    this.noteQuizMet(id, correct && r.attempts === 1);
    const earned = correct && !wasPassed ? (r.firstTry ? 5 : 2) : 0;
    this.data.doubloons += earned;
    this.save();
    return earned;
  }

  setQuest(id: string, step: string): void {
    if (step === 'done' && this.data.quests[id] !== 'done')
      this.data.lastLearned = { kind: 'quest', id, at: Date.now() };
    this.data.quests[id] = step;
    this.save();
  }

  /** Saves what the player said about a real-app task (a later "Later" never undoes a "done"). */
  setAppTask(
    id: string,
    patch: Partial<AppTaskRecord> & { status?: AppTaskRecord['status'] },
  ): AppTaskRecord {
    const prev = this.data.appTasks[id];
    const status = prev?.status === 'done' ? 'done' : (patch.status ?? prev?.status ?? 'later');
    const rec: AppTaskRecord = { ...prev, ...patch, status, at: Date.now() };
    this.data.appTasks[id] = rec;
    this.save();
    return rec;
  }

  /** Notes a quiz the player has met, so the recap can bring it back (first time only). */
  noteQuizMet(id: string, firstTry: boolean, now = Date.now()): void {
    if (this.data.recap.items[id]) return;
    this.data.recap.items[id] = { box: firstTry ? 1 : 0, seen: now, right: 0, wrong: 0 };
  }

  /** A recap answer: right moves the quiz up a box, wrong back to the first. */
  recordRecap(id: string, right: boolean, now = Date.now()): void {
    const i = this.data.recap.items[id] ?? { box: 0, seen: now, right: 0, wrong: 0 };
    i.box = right ? Math.min(i.box + 1, 9) : 0;
    i.seen = now;
    if (right) i.right++;
    else i.wrong++;
    this.data.recap.items[id] = i;
    this.save();
  }

  /** A recap ran (asked, answered or skipped). */
  markRecap(now = Date.now()): void {
    this.data.recap.last = now;
    this.data.recap.runs++;
    this.save();
  }

  setReflection(chapter: string, choice: string | null): void {
    this.data.reflections[chapter] = { choice, at: Date.now() };
    this.save();
  }

  setPuzzle(id: string, save: PuzzleSave): void {
    this.data.puzzles[id] = save;
    this.save();
  }

  setSails(id: string): void {
    this.data.sails = id;
    this.save();
  }

  setNames(captain: string | null, ship: string | null): void {
    this.data.captainName = cleanName(captain);
    this.data.shipName = cleanName(ship);
    this.save();
  }

  setFork(fork: ForkRef | null): void {
    this.data.fork = fork ? cleanFork(fork) : null;
    this.save();
  }

  /** Saves some of the player's setup (a null forgets that value). */
  setSetup(patch: Partial<SetupData>): void {
    this.data.setup = cleanSetup({ ...this.data.setup, ...patch });
    this.save();
  }

  /** The ship's name, falling back to the captain's default. */
  get shipName(): string {
    return this.data.shipName ?? defaultShipName(this.data.captainName);
  }

  /** Adds starfish to spend (one for each pickup, a market refund). */
  earnStarfish(n: number): void {
    this.data.starfishPurse += Math.max(0, Math.floor(n));
    this.save();
  }

  /** Spends starfish at the market; false (and nothing spent) if there aren't enough. */
  spendStarfish(n: number): boolean {
    const cost = Math.max(0, Math.floor(n));
    if (cost > this.data.starfishPurse) return false;
    this.data.starfishPurse -= cost;
    this.save();
    return true;
  }

  /** Saves a hire for a market job; a job done right-sized stays done. */
  recordHire(job: string, hire: MarketHire): void {
    const prev = this.data.market.jobs[job];
    this.data.market.jobs[job] = { done: !!prev?.done || hire.outcome === 'right', last: hire };
    this.save();
  }

  markMarketGreeted(): void {
    if (this.data.market.greeted) return;
    this.data.market.greeted = true;
    this.save();
  }

  addDoubloons(n: number): void {
    this.data.doubloons += Math.max(0, Math.floor(n));
    this.save();
  }

  markLogbookOpened(): void {
    if (this.data.logbookOpened) return;
    this.data.logbookOpened = true;
    this.save();
  }
}

function safeLocalStorage(): ProgressStorage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}
