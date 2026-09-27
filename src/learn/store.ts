import { CHESTS, GLOSSARY, PAGES, QUIZZES, TRIALS } from './content/index';
import { grade, type Answer, type Grade } from './grade';
import { Progress } from './progress';
import type { Page, Quiz } from './types';

export type LogbookTab = 'pages' | 'glossary' | 'quests';

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
  /** The saved sail palette (Paint Your Sails), or null for the default. */
  sails: string | null;
  /** The palette stand's theme picker while it's open; `selected` previews on the sails. */
  palette: { selected: string } | null;
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
export class LearnStore {
  readonly progress: Progress;
  private state: LearnState;
  private readonly listeners = new Set<(s: LearnState) => void>();
  private quizDone: ((o: QuizOutcome) => void) | null = null;
  private revealDone: (() => void) | null = null;
  private bannerDone: (() => void) | null = null;
  private paletteDone: ((id: string | null) => void) | null = null;
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
      sails: progress.data.sails,
      palette: null,
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
    return !!(s.quiz || s.reveal || s.banner || s.palette || s.logbook.open || s.spyglass?.full);
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
    this.quizDone = this.revealDone = this.bannerDone = this.paletteDone = null;
    this.set({
      quiz: null,
      reveal: null,
      banner: null,
      palette: null,
      spyglass: null,
      logbook: { open: false, tab: 'pages', page: null },
    });
  };

  /** A fresh voyage: wipes progress. */
  newGame = (): void => {
    this.reset();
    this.progress.reset();
    this.set({
      doubloons: 0,
      pages: [],
      glossary: [],
      quests: [],
      tracker: null,
      sails: null,
      logbookOpened: false,
    });
  };

  private set(patch: Partial<LearnState>): void {
    this.state = { ...this.state, ...patch };
    for (const fn of this.listeners) fn(this.state);
  }
}
