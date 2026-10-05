/**
 * Learning progress (POC §3.9 subset): pages, chests, glossary, quiz attempts, quests, trials, seals,
 * and doubloons, saved to localStorage under a versioned key. Position/captain stay in GameFlow's save.
 */
const PROGRESS_KEY = 'copilot-isles.progress.v1';

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
  /** Puzzle id → saved state. */
  puzzles: Record<string, PuzzleSave>;
  /** Whether the player has opened the Logbook yet (until then, new pages say where they went). */
  logbookOpened: boolean;
  /** Islands whose arrival flyover has played (it plays once per island). */
  arrivals: string[];
  /** Starfish found (ids from src/world/starfish/spots.ts). */
  starfish: string[];
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
    puzzles: {},
    logbookOpened: false,
    arrivals: [],
    starfish: [],
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

/**
 * Logbook ids the course renamed or split (app 1.1.26: Local repository became Current checkout, and
 * My work became the Pull requests and Issues views). Old saves move to today's ids when they load.
 */
const RENAMED: Readonly<Record<string, readonly string[]>> = {
  'local-repository': ['current-checkout'],
  'my-work': ['pull-requests', 'issues'],
  'pg1.my-work': ['pg1.pull-requests', 'pg1.issues', 'pg1.more'],
};

const renamed = (ids: string[]): string[] => [...new Set(ids.flatMap((s) => RENAMED[s] ?? [s]))];

/**
 * Glossary terms a finished quest teaches that older saves never got (the 2026-10-02 course sync added
 * Tool permissions to Rhea's debrief and Context window to Oren's talk).
 */
const TAUGHT_BY: Readonly<Record<string, readonly string[]>> = {
  'Q1.5': ['tool-permissions'],
  'Q1.6': ['context-window'],
};

const withTaught = (glossary: string[], quests: Record<string, string>): string[] => [
  ...new Set([
    ...glossary,
    ...Object.entries(TAUGHT_BY).flatMap(([q, terms]) => (quests[q] === 'done' ? terms : [])),
  ]),
];

/** Parses a stored value, dropping anything malformed instead of throwing (old or hand-edited saves). */
export function parseProgress(raw: string | null): ProgressData {
  if (!raw) return emptyProgress();
  try {
    const d = JSON.parse(raw) as Partial<ProgressData>;
    if (d?.v !== 1) return emptyProgress();
    const base = emptyProgress(typeof d.created === 'number' ? d.created : Date.now());
    const strings = (v: unknown) =>
      Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string') : [];
    const quests = d.quests && typeof d.quests === 'object' ? d.quests : {};
    return {
      ...base,
      pages: renamed(strings(d.pages)),
      chests: strings(d.chests),
      glossary: withTaught(renamed(strings(d.glossary)), quests),
      seals: strings(d.seals),
      quizzes: d.quizzes && typeof d.quizzes === 'object' ? d.quizzes : {},
      quests,
      trials: d.trials && typeof d.trials === 'object' ? d.trials : {},
      doubloons: typeof d.doubloons === 'number' && d.doubloons >= 0 ? Math.floor(d.doubloons) : 0,
      sails: typeof d.sails === 'string' ? d.sails : null,
      captainName: cleanName(d.captainName),
      shipName: cleanName(d.shipName),
      puzzles: parsePuzzles(d.puzzles),
      logbookOpened: d.logbookOpened === true,
      arrivals: strings(d.arrivals),
      starfish: strings(d.starfish),
    };
  } catch {
    return emptyProgress();
  }
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

/** Export/import as a copyable base64 code (POC §3.9). */
export function exportCode(p: ProgressData): string {
  const bytes = new TextEncoder().encode(JSON.stringify(p));
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

export function importCode(code: string): ProgressData | null {
  try {
    const bytes = Uint8Array.from(atob(code.trim()), (c) => c.charCodeAt(0));
    const raw = new TextDecoder().decode(bytes);
    const parsed = JSON.parse(raw) as { v?: unknown };
    return parsed?.v === 1 ? parseProgress(raw) : null;
  } catch {
    return null;
  }
}

export interface ProgressStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** The id lists in progress: pages, chests, glossary terms, seals, islands arrived at, and starfish. */
export type SetKind = 'pages' | 'chests' | 'glossary' | 'seals' | 'arrivals' | 'starfish';

export class Progress {
  data: ProgressData;

  constructor(private readonly storage: ProgressStorage | null = safeLocalStorage()) {
    this.data = parseProgress(storage?.getItem(PROGRESS_KEY) ?? null);
  }

  save(): void {
    try {
      this.storage?.setItem(PROGRESS_KEY, JSON.stringify(this.data));
    } catch {
      // Private mode or full storage: progress stays in memory for this session.
    }
  }

  reset(): void {
    this.data = emptyProgress();
    this.storage?.removeItem(PROGRESS_KEY);
  }

  has(kind: SetKind, id: string): boolean {
    return this.data[kind].includes(id);
  }

  /** Adds an id to a set; returns false if it was already there. */
  add(kind: SetKind, id: string): boolean {
    if (this.data[kind].includes(id)) return false;
    this.data[kind].push(id);
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
    const earned = correct && !wasPassed ? (r.firstTry ? 5 : 2) : 0;
    this.data.doubloons += earned;
    this.save();
    return earned;
  }

  setQuest(id: string, step: string): void {
    this.data.quests[id] = step;
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

  /** The ship's name, falling back to the captain's default. */
  get shipName(): string {
    return this.data.shipName ?? defaultShipName(this.data.captainName);
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
