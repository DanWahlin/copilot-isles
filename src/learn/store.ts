import { CHESTS, GLOSSARY, PAGES, QUIZZES, TRIALS } from './content/index';
import type { ForkRef } from './fork';
import { grade, type Answer, type Grade } from './grade';
import { Progress } from './progress';
import {
  detectOs,
  EMPTY_SETUP,
  setupMatches,
  type OsId,
  type SetupData,
  type SetupKind,
  type SetupWhen,
} from './setup';
import {
  STARFISH_REWARD,
  STARFISH_SET_REWARD,
  starfishCount,
  type StarfishIsland,
} from '../world/starfish/spots';
import type { Page, Quiz, SourceRef } from './types';
import { coveredTopics } from './course-board';
import type { ChapterId } from './course/chapters';

export type LogbookTab = 'pages' | 'glossary' | 'quests' | 'starfish';

export interface Tracker {
  island: string;
  chapter: string;
  goal: string;
  /** What comes after the island, shown once every task's done. */
  next?: string;
  tasks: readonly {
    id: string;
    title: string;
    task: string;
    detail: string;
    status: 'done' | 'active' | 'upcoming';
    optional?: boolean;
    link?: { label: string; url: string };
  }[];
}
export type RevealFrom = 'page' | 'chest' | 'bottle';
/** Who's asking for the player's fork: Ezra's register, the crane's sign, or the Logbook. */
export type ForkFrom = 'ezra' | 'crane' | 'logbook';
/** Who's asking for a setup value: a quest beat, or the Logbook's Your setup card (to change it). */
export type SetupFrom = 'script' | 'logbook';

export interface ActiveQuiz {
  quiz: Quiz;
  /** Set while running a Trial: item position and whether hint tier 3 is locked. */
  trial: { id: string; title: string; index: number; total: number } | null;
  attempts: number;
  hintTier: number;
  hint: string | null;
  last: Grade | null;
  /** Shuffle seed for ordering/matching, stable for the quiz instance. */
  seed: number;
  earned: number;
}

export interface LearnState {
  quiz: ActiveQuiz | null;
  /** Spyglass: a course image framed above the dialogue; `full` opens pan/zoom. */
  spyglass: { image: string; caption: string | null; full: boolean; transient: boolean } | null;
  /** A page granted by a chest or an NPC. */
  /** `from` styles the card: a treasure chest, a message bottle, or a plain new page. */
  reveal: { page: Page; doubloons: number; from: RevealFrom } | null;
  logbook: { open: boolean; tab: LogbookTab; page: string | null };
  /** Whether the player has opened the Logbook yet; until then, new pages say where they're kept. */
  logbookOpened: boolean;
  /** A short line of trial feedback ("Seal of Anchorage earned!"). */
  banner: { title: string; body: string } | null;
  doubloons: number;
  pages: readonly string[];
  glossary: readonly string[];
  /** Quest log lines for the Logbook: [title, detail, done]. */
  quests: readonly { id: string; title: string; detail: string; done: boolean }[];
  /** The on-screen task tracker (island goal + key tasks), or null when there's no quest line. */
  tracker: Tracker | null;
  /** Starfish found anywhere, and the island you're on (for the purse's counter), or null at sea. */
  starfish: readonly string[];
  starfishIsland: { id: StarfishIsland; name: string } | null;
  /** Starfish to spend at the Model Market (the purse shows it beside the island's count). */
  starfishPurse: number;
  /** The saved sail palette (Paint Your Sails), or null for the default. */
  sails: string | null;
  /** The palette stand's theme picker while it's open; `selected` previews on the sails. */
  palette: { selected: string } | null;
  /** The player's fork (`owner/repo` on GitHub), or null if they haven't given it. */
  fork: ForkRef | null;
  /** The fork form while it's open. */
  forkForm: { from: ForkFrom } | null;
  /** Your setup: the computer, practice issue, session branch, and model (each null until given). */
  setup: SetupData;
  /** The browser's system, used for shortcuts until the player picks one. */
  osDetected: OsId;
  /** A setup form while it's open. */
  setupForm: { kind: SetupKind; from: SetupFrom } | null;
  /**
   * An island's course notice board while it's open (docs/specs/COURSE-BOARDS.md): its chapter, and
   * the topics the player has met in the game (a held page or a passed quiz cites them).
   */
  courseBoard: { chapter: ChapterId; covered: readonly string[] } | null;
  /** An arrival flyover is playing: the purse and task list step aside for the view. */
  cinematic: boolean;
  /** A conversation or framed shot is on: the task list fades so the scene has the screen. */
  calm: boolean;
  /** What Wingman's pointing out right now (the task list, the starfish count), lit on screen. */
  spotlight: { tracker: boolean; starfish: boolean };
}

export interface QuizOutcome {
  correct: boolean;
  attempts: number;
  /** False if the player closed the quiz without passing. */
  completed: boolean;
}

/**
 * The learning layer's state and actions (quizzes, spyglass, chests, Logbook). React renders the
 * state (src/ui/learn); game scripts call the promise-returning actions and await the player.
 * All public methods are arrow properties so the UI can pass them around unbound.
 */
const NO_SPOTLIGHT = { tracker: false, starfish: false } as const;

export class LearnStore {
  readonly progress: Progress;
  private state: LearnState;
  private readonly listeners = new Set<(s: LearnState) => void>();
  private quizDone: ((o: QuizOutcome) => void) | null = null;
  private revealDone: (() => void) | null = null;
  private bannerDone: (() => void) | null = null;
  private paletteDone: ((id: string | null) => void) | null = null;
  private forkDone: ((fork: ForkRef | null) => void) | null = null;
  private setupDone: ((saved: boolean) => void) | null = null;
  private seed = 1;

  constructor(progress = new Progress()) {
    this.progress = progress;
    this.state = {
      quiz: null,
      spyglass: null,
      reveal: null,
      logbook: { open: false, tab: 'pages', page: null },
      logbookOpened: progress.data.logbookOpened,
      banner: null,
      doubloons: progress.data.doubloons,
      pages: progress.data.pages.slice(),
      glossary: progress.data.glossary.slice(),
      quests: [],
      tracker: null,
      starfish: progress.data.starfish.slice(),
      starfishIsland: null,
      starfishPurse: progress.data.starfishPurse,
      sails: progress.data.sails,
      palette: null,
      fork: progress.data.fork,
      forkForm: null,
      setup: progress.data.setup,
      osDetected: detectOs(),
      setupForm: null,
      courseBoard: null,
      cinematic: false,
      calm: false,
      spotlight: NO_SPOTLIGHT,
    };
  }

  getState = (): LearnState => this.state;

  subscribe = (fn: (s: LearnState) => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  /** True while a modal learning overlay owns input (the game pauses walking/interaction). */
  get busy(): boolean {
    const s = this.state;
    return !!(
      s.quiz ||
      s.reveal ||
      s.banner ||
      s.palette ||
      s.forkForm ||
      s.setupForm ||
      s.courseBoard ||
      s.logbook.open ||
      s.spyglass?.full
    );
  }

  // ---- Quizzes ----

  /** Asks a quiz and resolves once the player gets it right (unlimited retries) or closes it. */
  ask = (quizId: string, trial: ActiveQuiz['trial'] = null): Promise<QuizOutcome> => {
    const quiz = QUIZZES.get(quizId);
    if (!quiz) return Promise.reject(new Error(`unknown quiz ${quizId}`));
    this.quizDone?.({ correct: false, attempts: 0, completed: false });
    this.set({
      quiz: { quiz, trial, attempts: 0, hintTier: 0, hint: null, last: null, seed: this.seed++, earned: 0 },
    });
    return new Promise((resolve) => (this.quizDone = resolve));
  };

  submit = (answer: Answer): Grade | null => {
    const a = this.state.quiz;
    if (!a || a.last?.correct) return null;
    const g = grade(a.quiz, answer);
    const earned = this.progress.recordQuiz(a.quiz.id, g.correct);
    this.set({
      quiz: { ...a, attempts: a.attempts + 1, last: g, earned: a.earned + earned },
      doubloons: this.progress.data.doubloons,
    });
    return g;
  };

  /**
   * Grades a choice the player made in the world (the pipe they spoke into, say) against a quiz,
   * without opening the quiz card. It counts the same as answering it there.
   */
  answerInWorld = (quizId: string, answer: Answer): Grade => {
    const quiz = QUIZZES.get(quizId);
    if (!quiz) throw new Error(`unknown quiz ${quizId}`);
    const g = grade(quiz, answer);
    this.progress.recordQuiz(quizId, g.correct);
    this.set({ doubloons: this.progress.data.doubloons });
    return g;
  };

  /** Clears the last wrong answer so the player can try again. */
  retry = (): void => {
    const a = this.state.quiz;
    if (a && a.last && !a.last.correct) this.set({ quiz: { ...a, last: null } });
  };

  /** Wingman's next hint tier. Tier 3 (the answer) is locked inside Trials. */
  hint = (): string | null => {
    const a = this.state.quiz;
    const hints = a?.quiz.hints;
    if (!a || !hints) return null;
    const max = a.trial ? 2 : 3;
    if (a.hintTier >= max) return a.hint;
    const tier = a.hintTier + 1;
    const text = hints[tier - 1] ?? null;
    this.set({ quiz: { ...a, hintTier: tier, hint: text } });
    return text;
  };

  /** Continue after a correct answer, or give up (Esc) on a wrong/unanswered one. */
  closeQuiz = (): void => {
    const a = this.state.quiz;
    if (!a) return;
    const done = this.quizDone;
    this.quizDone = null;
    this.set({ quiz: null });
    done?.({ correct: !!a.last?.correct, attempts: a.attempts, completed: !!a.last?.correct });
  };

  /** Runs a Trial's items in order; every item must be passed. Returns first-try stars (0-3). */
  runTrial = async (trialId: string): Promise<{ passed: boolean; stars: number }> => {
    const t = TRIALS.get(trialId);
    if (!t) throw new Error(`unknown trial ${trialId}`);
    let firstTry = 0;
    for (let i = 0; i < t.items.length; i++) {
      const out = await this.ask(t.items[i]!, { id: t.id, title: t.title, index: i, total: t.items.length });
      if (!out.completed) return { passed: false, stars: 0 };
      if (out.attempts === 1) firstTry++;
    }
    const ratio = firstTry / t.items.length;
    const stars = ratio >= 1 ? 3 : ratio >= 0.75 ? 2 : 1;
    this.progress.data.trials[t.id] = { passed: true, stars };
    this.progress.add('seals', t.reward.seal);
    this.progress.addDoubloons(t.reward.doubloons);
    this.set({ doubloons: this.progress.data.doubloons });
    await this.showBanner(
      t.reward.seal,
      `${'★'.repeat(stars)}${'☆'.repeat(3 - stars)} · +${t.reward.doubloons} doubloons`,
    );
    return { passed: true, stars };
  };

  showBanner = (title: string, body: string): Promise<void> => {
    this.bannerDone?.();
    this.set({ banner: { title, body } });
    return new Promise((resolve) => (this.bannerDone = resolve));
  };

  closeBanner = (): void => {
    const done = this.bannerDone;
    this.bannerDone = null;
    this.set({ banner: null });
    done?.();
  };

  // ---- Spyglass ----

  showImage = (image: string, caption: string | null = null): void => {
    this.set({ spyglass: { image, caption, full: false, transient: false } });
  };

  /** Opens an image full screen just for a look (from a page); closing it hides it again. */
  inspectImage = (image: string, caption: string | null = null): void => {
    this.set({ spyglass: { image, caption, full: true, transient: true } });
  };

  expandImage = (full = true): void => {
    const s = this.state.spyglass;
    if (!s) return;
    if (!full && s.transient) this.set({ spyglass: null });
    else this.set({ spyglass: { ...s, full } });
  };

  hideImage = (): void => {
    if (this.state.spyglass) this.set({ spyglass: null });
  };

  // ---- Pages, chests, glossary ----

  /** Grants a page (from an NPC or a chest) and resolves when the reveal card is closed. */
  grantPage = (pageId: string, doubloons = 0, from: RevealFrom = 'page'): Promise<void> => {
    const page = PAGES.get(pageId);
    if (!page) return Promise.reject(new Error(`unknown page ${pageId}`));
    const fresh = this.progress.add('pages', pageId);
    if (fresh && doubloons) this.progress.addDoubloons(doubloons);
    this.revealDone?.();
    this.set({
      reveal: { page, doubloons: fresh ? doubloons : 0, from },
      pages: this.progress.data.pages.slice(),
      doubloons: this.progress.data.doubloons,
    });
    return new Promise((resolve) => (this.revealDone = resolve));
  };

  /**
   * Adds a page to the Logbook without a reveal card, with its doubloons the first time; returns
   * false if it was already there.
   */
  filePage = (pageId: string, doubloons = 0): boolean => {
    if (!PAGES.has(pageId)) throw new Error(`unknown page ${pageId}`);
    const fresh = this.progress.add('pages', pageId);
    if (fresh && doubloons) this.progress.addDoubloons(doubloons);
    if (fresh) this.set({ pages: this.progress.data.pages.slice(), doubloons: this.progress.data.doubloons });
    return fresh;
  };

  closeReveal = (): void => {
    const done = this.revealDone;
    this.revealDone = null;
    this.set({ reveal: null });
    done?.();
  };

  isChestOpen = (chestId: string): boolean => this.progress.has('chests', chestId);

  openChest = async (chestId: string): Promise<void> => {
    const c = CHESTS.get(chestId);
    if (!c) throw new Error(`unknown chest ${chestId}`);
    const fresh = this.progress.add('chests', chestId);
    await this.grantPage(c.page, fresh ? c.doubloons : 0, c.kind ?? 'chest');
  };

  learnTerm = (termId: string): boolean => {
    if (!GLOSSARY.has(termId)) return false;
    const fresh = this.progress.add('glossary', termId);
    if (fresh) this.set({ glossary: this.progress.data.glossary.slice() });
    return fresh;
  };

  setQuests = (quests: LearnState['quests'], tracker?: Tracker | null): void => {
    this.set(tracker === undefined ? { quests } : { quests, tracker });
  };

  // ---- Paint Your Sails ----

  /**
   * Opens the theme picker at the palette stand. Resolves with the palette you finished on, or null
   * if you went back without choosing (the sails return to the saved palette).
   */
  openPalette = (selected: string): Promise<string | null> => {
    this.paletteDone?.(null);
    this.set({ palette: { selected } });
    return new Promise((resolve) => (this.paletteDone = resolve));
  };

  previewPalette = (id: string): void => {
    if (this.state.palette) this.set({ palette: { selected: id } });
  };

  finishPalette = (): void => {
    const p = this.state.palette;
    if (!p) return;
    const done = this.paletteDone;
    this.paletteDone = null;
    this.progress.setSails(p.selected);
    this.set({ palette: null, sails: p.selected });
    done?.(p.selected);
  };

  closePalette = (): void => {
    if (!this.state.palette) return;
    const done = this.paletteDone;
    this.paletteDone = null;
    this.set({ palette: null });
    done?.(null);
  };

  /** Changes the sails outside the stand (the Settings menu). */
  setSails = (id: string): void => {
    this.progress.setSails(id);
    this.set({ sails: id });
  };

  // ---- Course notice boards ----

  /** Opens an island's course notice board, with ✓ on the topics the player has met in the game. */
  openCourseBoard = (chapter: ChapterId): void => {
    const sources: SourceRef[] = [];
    for (const id of this.state.pages) {
      const page = PAGES.get(id);
      if (page) sources.push(page.source);
    }
    for (const [id, r] of Object.entries(this.progress.data.quizzes)) {
      const quiz = r.passed ? QUIZZES.get(id) : undefined;
      if (quiz) sources.push(quiz.source);
    }
    this.set({ courseBoard: { chapter, covered: [...coveredTopics(chapter, sources)] } });
  };

  closeCourseBoard = (): void => {
    if (this.state.courseBoard) this.set({ courseBoard: null });
  };

  // ---- Your fork ----

  /**
   * Opens the fork form. Resolves with the fork the player saved, or null if they skipped (the game
   * keeps using the placeholder fork, and whatever was saved before stays).
   */
  askFork = (from: ForkFrom): Promise<ForkRef | null> => {
    this.forkDone?.(null);
    this.set({ forkForm: { from } });
    return new Promise((resolve) => (this.forkDone = resolve));
  };

  /** Saves the fork (null forgets it) and closes the form. */
  saveFork = (fork: ForkRef | null): void => {
    this.progress.setFork(fork);
    const saved = this.progress.data.fork;
    const done = this.forkDone;
    this.forkDone = null;
    this.set({ fork: saved, forkForm: null });
    done?.(saved);
  };

  /** Skip for now: closes the form and changes nothing. */
  skipFork = (): void => {
    if (!this.state.forkForm) return;
    const done = this.forkDone;
    this.forkDone = null;
    this.set({ forkForm: null });
    done?.(null);
  };

  // ---- Your setup ----

  /** The computer whose shortcuts the game shows: the player's pick, or the browser's. */
  get os(): OsId {
    return this.state.setup.os ?? this.state.osDetected;
  }

  /** Whether a step or quiz meant for some answers fits this player's (`model:auto`…). */
  setupIs = (when: SetupWhen): boolean => setupMatches(this.state.setup, when);

  /**
   * Opens a setup form. Resolves true once the player saves, or false if they skip (nothing changes:
   * the game keeps showing the course's own example).
   */
  askSetup = (kind: SetupKind, from: SetupFrom): Promise<boolean> => {
    this.setupDone?.(false);
    this.set({ setupForm: { kind, from } });
    return new Promise((resolve) => (this.setupDone = resolve));
  };

  /** Saves setup values (a null forgets one) and closes the form if one's open. */
  saveSetup = (patch: Partial<SetupData>): void => {
    this.progress.setSetup(patch);
    const done = this.setupDone;
    this.setupDone = null;
    this.set({ setup: this.progress.data.setup, setupForm: null });
    done?.(true);
  };

  /** Skip for now: closes the form and changes nothing. */
  skipSetup = (): void => {
    if (!this.state.setupForm) return;
    const done = this.setupDone;
    this.setupDone = null;
    this.set({ setupForm: null });
    done?.(false);
  };

  // ---- Starfish ----

  /** The island the purse counts starfish for (null hides the counter). */
  setStarfishIsland = (island: { id: StarfishIsland; name: string } | null): void => {
    const cur = this.state.starfishIsland;
    if (cur?.id === island?.id) return;
    this.set({ starfishIsland: island });
  };

  /**
   * Picks up a starfish: saves it and pays its doubloons, plus a bonus for the island's last one.
   * Returns the island's count after it, or null if it was already found.
   */
  collectStarfish = (
    id: string,
    island: StarfishIsland,
  ): { found: number; total: number; earned: number; complete: boolean } | null => {
    if (!this.progress.add('starfish', id)) return null;
    const count = starfishCount(island, this.progress.data.starfish);
    const complete = count.found === count.total;
    const earned = STARFISH_REWARD + (complete ? STARFISH_SET_REWARD : 0);
    this.progress.addDoubloons(earned);
    // Each starfish is also one to spend at the Model Market.
    this.progress.earnStarfish(1);
    this.set({
      starfish: this.progress.data.starfish.slice(),
      doubloons: this.progress.data.doubloons,
      starfishPurse: this.progress.data.starfishPurse,
    });
    return { ...count, earned, complete };
  };

  /** Pays the Model Market; false (and nothing spent) if the purse is short. */
  spendStarfish = (n: number): boolean => {
    if (!this.progress.spendStarfish(n)) return false;
    this.set({ starfishPurse: this.progress.data.starfishPurse });
    return true;
  };

  /** A market refund, plus any doubloons that come with it. */
  refundStarfish = (n: number, doubloons = 0): void => {
    this.progress.earnStarfish(n);
    if (doubloons) this.progress.addDoubloons(doubloons);
    this.set({ starfishPurse: this.progress.data.starfishPurse, doubloons: this.progress.data.doubloons });
  };

  // ---- Logbook ----

  openLogbook = (tab: LogbookTab = this.state.logbook.tab, page: string | null = null): void => {
    this.progress.markLogbookOpened();
    this.set({ logbook: { open: true, tab, page }, logbookOpened: true });
  };

  /** Resolves once the Logbook is closed, or at once if it isn't open. */
  logbookClosed = (): Promise<void> => {
    if (!this.state.logbook.open) return Promise.resolve();
    return new Promise((resolve) => {
      const off = this.subscribe((s) => {
        if (s.logbook.open) return;
        off();
        resolve();
      });
    });
  };

  closeLogbook = (): void => {
    this.set({ logbook: { ...this.state.logbook, open: false, page: null } });
  };

  toggleLogbook = (): void => {
    if (this.state.logbook.open) this.closeLogbook();
    else if (!this.busy) this.openLogbook();
  };

  /** Clears overlays without resolving as success (e.g. quitting to the title). */
  reset = (): void => {
    this.quizDone?.({ correct: false, attempts: 0, completed: false });
    this.revealDone?.();
    this.bannerDone?.();
    this.paletteDone?.(null);
    this.forkDone?.(null);
    this.setupDone?.(false);
    this.quizDone = this.revealDone = this.bannerDone = this.paletteDone = this.forkDone = null;
    this.setupDone = null;
    this.set({
      quiz: null,
      reveal: null,
      banner: null,
      palette: null,
      forkForm: null,
      setupForm: null,
      spyglass: null,
      logbook: { open: false, tab: 'pages', page: null },
      cinematic: false,
      calm: false,
    });
  };

  /** Hides the purse and task list while an arrival flyover plays. */
  setCinematic = (on: boolean): void => {
    if (this.state.cinematic !== on) this.set({ cinematic: on });
  };

  setCalm = (on: boolean): void => {
    if (this.state.calm !== on) this.set({ calm: on });
  };

  /** Lights the task list and/or the starfish count while Wingman points them out. */
  setSpotlight = (tracker: boolean, starfish: boolean): void => {
    const cur = this.state.spotlight;
    if (cur.tracker !== tracker || cur.starfish !== starfish) this.set({ spotlight: { tracker, starfish } });
  };

  /** A fresh voyage: wipes progress. */
  /** Switches to another course's progress (each course keeps its own) and shows it. */
  useCourse = (course: string): void => {
    if (course === this.progress.course) return;
    this.reset();
    this.progress.useCourse(course);
    const d = this.progress.data;
    this.set({
      doubloons: d.doubloons,
      pages: d.pages.slice(),
      glossary: d.glossary.slice(),
      quests: [],
      tracker: null,
      starfish: d.starfish.slice(),
      starfishPurse: d.starfishPurse,
      sails: d.sails,
      fork: d.fork,
      setup: d.setup,
      logbookOpened: d.logbookOpened,
    });
  };

  newGame = (): void => {
    this.reset();
    this.progress.reset();
    this.set({
      doubloons: 0,
      pages: [],
      glossary: [],
      quests: [],
      tracker: null,
      starfish: [],
      starfishPurse: 0,
      sails: null,
      fork: null,
      setup: { ...EMPTY_SETUP },
      logbookOpened: false,
    });
  };

  private set(patch: Partial<LearnState>): void {
    this.state = { ...this.state, ...patch };
    for (const fn of this.listeners) fn(this.state);
  }
}
