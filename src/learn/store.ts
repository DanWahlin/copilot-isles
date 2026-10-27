import {
  CHAPTER_INDEX,
  CHAPTERS,
  CHESTS,
  GLOSSARY,
  PAGE_INDEX,
  PAGES,
  QUIZ_INDEX,
  QUIZZES,
  TRIALS,
} from './content/index';
import { loadPageParts, loadQuizParts } from '../course/load';
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
import type { Page, Quiz } from './types';
import type { SourceAnchor } from '../course/pack';
import { coveredTopics } from './course-board';
import type { ChapterId } from './course/chapters';
import { COURSE } from '../course/catalog';
import { APP_TASKS, questLogLine, REFLECTIONS, type AppTask, type Reflection } from './learning';
import type { AppTaskRecord } from './progress';
import { pickRecap, recapCandidates, recapGapOk } from './recap';
import { runCheck, type CheckResult } from './github-check';
import { badgeData, courseComplete, type BadgeData } from './badge';
import { resumeSummary, type ResumeSummary } from './resume';
import { setVoyageSeed } from './option-order';

export type LogbookTab = 'pages' | 'glossary' | 'quests' | 'map' | 'app' | 'starfish';

/** A GitHub check's state for a task: not run, running, or its last result. */
export type CheckState = { status: 'running' } | CheckResult;

/**
 * A script step's condition: the player's setup (`model:auto`, `branch:given`…), or `app:<task>`, a
 * real-app task they've confirmed (learning.json).
 */
export type StepWhen = SetupWhen | `app:${string}`;

/** How a real-app task card ended: confirmed, put off, or closed without either (the Logbook's Cancel). */
export type AppTaskOutcome = 'done' | 'later' | 'closed';

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
  /** Set while Wingman's recap runs: its question number, and how many it asks. */
  recap: { index: number; total: number } | null;
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
  /**
   * A "Do this in the app" card (src/learn/learning.ts): the task, who opened it (a quest beat or the
   * Logbook's checklist), and where it's got to (`ask`: I did it or Later; `seen`: what did you see?;
   * `answered`: the answer's feedback).
   */
  appTask: {
    task: AppTask;
    from: 'script' | 'logbook';
    phase: 'ask' | 'seen' | 'answered';
    answer: string | null;
  } | null;
  /** What the player said about each real-app task (the checklist's ticks). */
  appTasks: Readonly<Record<string, AppTaskRecord>>;
  /** The opt-in GitHub checks are on (Settings). */
  githubChecks: boolean;
  /** Each task's GitHub check, while running or once run this session. */
  checks: Readonly<Record<string, CheckState>>;
  /** The reflection before a chapter's Seal, while it's open. */
  reflection: Reflection | null;
  /** Chapter → the takeaway picked before its Seal (null: skipped). */
  reflections: Readonly<Record<string, { choice: string | null; at: number }>>;
  /** A Seal card or the course certificate, while it's open. */
  badge: BadgeData | null;
  /** The "where you left off" card on Continue, while it's open. */
  resume: ResumeSummary | null;
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

/**
 * The course's charted islands (a chapter with content in the pack) in voyage order, each with the
 * Seal its Trial awards: the Course map's chapters and the certificate's list.
 */
export function chartedIslands(): { island: string; chapter: string; label: string; seal: string | null }[] {
  return COURSE.islands.flatMap((i) => {
    const c = CHAPTERS.find((ch) => ch.chapter === i.chapter);
    return c
      ? [{ island: i.island, chapter: i.chapter, label: i.label, seal: c.trials[0]?.reward.seal ?? null }]
      : [];
  });
}

function badgeIslands(): { label: string; seal: string }[] {
  return chartedIslands().flatMap((i) => (i.seal ? [{ label: i.label, seal: i.seal }] : []));
}

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
  private appTaskDone: ((o: AppTaskOutcome) => void) | null = null;
  private reflectionDone: (() => void) | null = null;
  private badgeDone: (() => void) | null = null;
  private resumeDone: (() => void) | null = null;
  private seed = 1;
  /** Tests: GitHub's API (a stand-in fetch) and the clock. */
  fetchFn: ((url: string, init?: RequestInit) => Promise<Response>) | undefined = undefined;
  now: () => number = () => Date.now();

  constructor(progress = new Progress()) {
    this.progress = progress;
    // Answer options shuffle per voyage (src/learn/option-order.ts): the save's creation time seeds it.
    setVoyageSeed(() => this.progress.data.created);
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
      appTask: null,
      appTasks: { ...progress.data.appTasks },
      githubChecks: false,
      checks: {},
      reflection: null,
      reflections: { ...progress.data.reflections },
      badge: null,
      resume: null,
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
      s.spyglass?.full ||
      s.appTask ||
      s.reflection ||
      s.badge ||
      s.resume
    );
  }

  // ---- Quizzes ----

  /** Asks a quiz and resolves once the player gets it right (unlimited retries) or closes it. */
  ask = (
    quizId: string,
    trial: ActiveQuiz['trial'] = null,
    recap: ActiveQuiz['recap'] = null,
  ): Promise<QuizOutcome> => {
    // A quiz from a chapter whose part isn't in yet (a recap's, from an island you haven't been to
    // this voyage): its part loads first. If it can't (offline), the quiz counts as closed.
    if (!QUIZZES.has(quizId) && QUIZ_INDEX.has(quizId))
      return loadQuizParts([quizId]).then(
        () => this.askNow(quizId, trial, recap),
        () => ({ correct: false, attempts: 0, completed: false }),
      );
    return this.askNow(quizId, trial, recap);
  };

  private askNow(
    quizId: string,
    trial: ActiveQuiz['trial'],
    recap: ActiveQuiz['recap'],
  ): Promise<QuizOutcome> {
    const quiz = QUIZZES.get(quizId);
    if (!quiz) return Promise.reject(new Error(`unknown quiz ${quizId}`));
    this.quizDone?.({ correct: false, attempts: 0, completed: false });
    this.set({
      quiz: {
        quiz,
        trial,
        attempts: 0,
        hintTier: 0,
        hint: null,
        last: null,
        seed: this.seed++,
        earned: 0,
        recap,
      },
    });
    return new Promise((resolve) => (this.quizDone = resolve));
  }

  submit = (answer: Answer): Grade | null => {
    const a = this.state.quiz;
    if (!a || a.last?.correct) return null;
    const g = grade(a.quiz, answer);
    // A recap answer moves the quiz in Wingman's schedule (its first try only) and leaves its record be.
    let earned = 0;
    if (a.recap) {
      if (a.attempts === 0) {
        this.progress.recordRecap(a.quiz.id, g.correct, this.now());
        earned = g.correct ? (COURSE.recap?.reward?.doubloons ?? 0) : 0;
        if (earned) this.progress.addDoubloons(earned);
      }
    } else earned = this.progress.recordQuiz(a.quiz.id, g.correct);
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
    // A moment to reflect before the Seal (once per chapter, skippable).
    const chapter = CHAPTERS.find((c) => c.trials.some((x) => x.id === t.id))?.chapter;
    if (chapter) await this.askReflection(chapter);
    const wasComplete = this.courseComplete();
    this.progress.data.trials[t.id] = { passed: true, stars };
    this.progress.add('seals', t.reward.seal);
    this.progress.addDoubloons(t.reward.doubloons);
    this.set({ doubloons: this.progress.data.doubloons });
    await this.showBanner(
      t.reward.seal,
      `${'★'.repeat(stars)}${'☆'.repeat(3 - stars)} · +${t.reward.doubloons} doubloons`,
    );
    await this.badgeClosed();
    // The last charted chapter's Seal: the course certificate.
    if (!wasComplete && this.courseComplete()) {
      this.openBadge('course');
      await this.badgeClosed();
    }
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
    // A page from a chapter whose part isn't in yet: it loads first. If it can't (offline), the page
    // goes in the Logbook without its card.
    if (!PAGES.has(pageId) && PAGE_INDEX.has(pageId))
      return loadPageParts([pageId]).then(
        () => this.grantPage(pageId, doubloons, from),
        () => void this.filePage(pageId, doubloons),
      );
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
    if (!PAGE_INDEX.has(pageId)) throw new Error(`unknown page ${pageId}`);
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
    const sources: SourceAnchor[] = [];
    for (const id of this.state.pages) {
      const page = PAGE_INDEX.get(id);
      if (page) sources.push(page.source);
    }
    for (const [id, r] of Object.entries(this.progress.data.quizzes)) {
      const quiz = r.passed ? QUIZ_INDEX.get(id) : undefined;
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
  setupIs = (when: StepWhen): boolean =>
    when.startsWith('app:')
      ? this.progress.data.appTasks[when.slice(4)]?.status === 'done'
      : setupMatches(this.state.setup, when as SetupWhen);

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

  // ---- "Do this in the app" (src/learn/learning.ts) ----

  /**
   * Hands a real-app task to the player: a card with its steps, I did it and Later. From a quest beat
   * it's skipped once the task's done (Later brings it back next time); it never holds the story up.
   */
  askAppTask = (id: string, from: 'script' | 'logbook' = 'script'): Promise<AppTaskOutcome> => {
    const task = APP_TASKS.get(id);
    if (!task) return Promise.reject(new Error(`unknown app task ${id}`));
    if (from === 'script' && this.progress.data.appTasks[id]?.status === 'done')
      return Promise.resolve('done');
    this.appTaskDone?.('closed');
    this.set({ appTask: { task, from, phase: 'ask', answer: null } });
    return new Promise((resolve) => (this.appTaskDone = resolve));
  };

  /**
   * Hands a task off with no card (the NPC sends you off to do it, and asks when you're back): it joins
   * the App checklist as Later, unless it's done already.
   */
  noteAppTask = (id: string): void => {
    if (!APP_TASKS.has(id) || this.progress.data.appTasks[id]) return;
    this.progress.setAppTask(id, { status: 'later' });
    this.set({ appTasks: { ...this.progress.data.appTasks } });
  };

  /** I did it: saved as done, then "What did you see?" if the task asks. */
  appTaskDid = (): void => {
    const a = this.state.appTask;
    if (!a || a.phase !== 'ask') return;
    this.markAppTaskDone(a.task);
    if (a.task.seen && this.progress.data.appTasks[a.task.id]?.seen === undefined)
      this.set({ appTask: { ...a, phase: 'seen' } });
    else this.finishAppTask('done');
  };

  /** The answer to "What did you see?" (any answer is fine: it shows what the course says you'll see). */
  appTaskSeen = (option: string): void => {
    const a = this.state.appTask;
    if (!a?.task.seen || a.phase !== 'seen') return;
    const right = option === a.task.seen.answer;
    this.progress.setAppTask(a.task.id, { seen: right ? 'right' : 'wrong' });
    this.set({
      appTask: { ...a, phase: 'answered', answer: option },
      appTasks: { ...this.progress.data.appTasks },
    });
  };

  /** Continue after the answer, or skip the question. */
  appTaskContinue = (): void => {
    const a = this.state.appTask;
    if (!a) return;
    if (a.phase === 'ask') return this.appTaskLater();
    this.finishAppTask('done');
  };

  /** Later (Esc, or B): the story goes on, and the checklist keeps it for later. */
  appTaskLater = (): void => {
    const a = this.state.appTask;
    if (!a) return;
    if (a.from === 'logbook') return this.finishAppTask('closed');
    if (this.progress.data.appTasks[a.task.id]?.status !== 'done')
      this.progress.setAppTask(a.task.id, { status: 'later' });
    this.finishAppTask('later');
  };

  /** Ticks a task from the Logbook's checklist (no card), or takes the tick back. */
  setAppTaskDone = (id: string, done: boolean): void => {
    const task = APP_TASKS.get(id);
    if (!task) return;
    if (done) this.markAppTaskDone(task);
    else {
      this.progress.data.appTasks[id] = { status: 'later', at: this.now() };
      this.progress.save();
      this.set({ appTasks: { ...this.progress.data.appTasks } });
    }
  };

  private markAppTaskDone(task: AppTask, verified = false): void {
    this.progress.setAppTask(task.id, verified ? { status: 'done', verified } : { status: 'done' });
    this.set({ appTasks: { ...this.progress.data.appTasks } });
  }

  private finishAppTask(outcome: AppTaskOutcome): void {
    const done = this.appTaskDone;
    this.appTaskDone = null;
    this.set({ appTask: null, appTasks: { ...this.progress.data.appTasks } });
    done?.(outcome);
  }

  /** Settings → GitHub checks. */
  setGithubChecks = (on: boolean): void => {
    if (this.state.githubChecks !== on) this.set({ githubChecks: on });
  };

  /** Whether a task can be checked on GitHub now: the checks are on, it has one, and the fork's given. */
  canCheck = (id: string): boolean => {
    const t = APP_TASKS.get(id);
    return !!(t?.check && this.state.githubChecks && this.state.fork);
  };

  /**
   * Asks GitHub's public API whether the task's evidence is there (opt-in, read-only, no token). Found
   * ticks it (checked); anything else leaves the player's own word as it was.
   */
  checkAppTask = async (id: string): Promise<CheckState> => {
    const t = APP_TASKS.get(id);
    const fork = this.state.fork;
    if (!t?.check || !fork || !this.state.githubChecks) return { status: 'unsupported' };
    if (this.state.checks[id]?.status === 'running') return this.state.checks[id]!;
    this.set({ checks: { ...this.state.checks, [id]: { status: 'running' } } });
    const result = await runCheck(
      t.check,
      { fork, upstream: COURSE.source.repo, practiceBranch: COURSE.practice?.branch ?? '' },
      this.fetchFn,
      this.now(),
    );
    if (result.status === 'found') this.markAppTaskDone(t, true);
    this.set({ checks: { ...this.state.checks, [id]: result } });
    return result;
  };

  // ---- Wingman's recap (src/learn/recap.ts) ----

  /**
   * The quizzes a recap would ask now (none when the course has no recap, it's too soon since the
   * last, or nothing's due). `exceptChapter` leaves out a chapter (the island you just landed on).
   */
  recapDue = (exceptChapter: string | null = null): string[] => {
    const r = COURSE.recap;
    if (!r || r.questions <= 0) return [];
    const now = this.now();
    const d = this.progress.data;
    if (!recapGapOk(d.recap.last, now, r.minGapMinutes ?? 20)) return [];
    const chapters = exceptChapter
      ? new Set(CHAPTER_INDEX.map((c) => c.chapter).filter((c) => c !== exceptChapter))
      : null;
    const candidates = recapCandidates(CHAPTER_INDEX, d, {
      types: r.types ?? ['mc', 'scenario', 'multi'],
      exclude: r.exclude ?? [],
      chapters,
    });
    const ids = pickRecap(candidates, { now, count: Math.min(3, r.questions), seed: d.recap.runs + 1 });
    // Their chapters' parts start loading now, so the questions are in by the time Wingman asks.
    void loadQuizParts(ids).catch(() => undefined);
    return ids;
  };

  /**
   * Asks a recap's questions in turn. Closing one before answering (Esc, ×, Skip) ends the recap;
   * after a wrong answer it moves on. There's no fail state.
   * Returns how many were asked and answered right first time.
   */
  runRecap = async (ids: readonly string[]): Promise<{ asked: number; right: number }> => {
    if (!ids.length) return { asked: 0, right: 0 };
    this.progress.markRecap(this.now());
    let asked = 0;
    let right = 0;
    for (let i = 0; i < ids.length; i++) {
      const out = await this.ask(ids[i]!, null, { index: i, total: ids.length });
      if (out.attempts === 0) break;
      asked++;
      if (out.correct && out.attempts === 1) right++;
    }
    const starfish = COURSE.recap?.reward?.starfish ?? 0;
    if (asked === ids.length && right === asked && starfish > 0) {
      this.progress.earnStarfish(starfish);
      this.set({ starfishPurse: this.progress.data.starfishPurse });
    }
    this.set({ doubloons: this.progress.data.doubloons });
    return { asked, right };
  };

  // ---- The reflection before a Seal ----

  /** The chapter's reflection, once (skipping counts): resolves when the player picks or skips. */
  askReflection = (chapter: string): Promise<void> => {
    const r = REFLECTIONS.get(chapter);
    if (!r || this.progress.data.reflections[chapter]) return Promise.resolve();
    this.reflectionDone?.();
    this.set({ reflection: r });
    return new Promise((resolve) => (this.reflectionDone = resolve));
  };

  /** The takeaway picked (null: skipped). */
  chooseReflection = (choice: string | null): void => {
    const r = this.state.reflection;
    if (!r) return;
    this.progress.setReflection(r.chapter, choice);
    const done = this.reflectionDone;
    this.reflectionDone = null;
    this.set({ reflection: null, reflections: { ...this.progress.data.reflections } });
    done?.();
  };

  // ---- Seal cards and the course certificate ----

  /** Every charted chapter's Seal is held. */
  courseComplete = (): boolean => courseComplete(badgeIslands(), this.progress.data.seals);

  /** Opens a Seal card (the seal given, or the last one earned) or the course certificate. */
  openBadge = (kind: 'seal' | 'course', seal?: string): void => {
    const d = this.progress.data;
    this.set({
      badge: badgeData({
        kind,
        seal: seal ?? d.seals[d.seals.length - 1],
        captain: d.captainName,
        ship: this.progress.shipName,
        courseTitle: COURSE.title,
        courseUrl: `https://github.com/${COURSE.source.repo}`,
        islands: badgeIslands(),
        earned: d.seals,
        date: new Date(this.now()),
      }),
    });
  };

  /** The Seal banner's "Seal card": the card opens as the banner closes. */
  sealCard = (): void => {
    const b = this.state.banner;
    if (!b) return;
    this.openBadge('seal', b.title);
    this.closeBanner();
  };

  closeBadge = (): void => {
    const done = this.badgeDone;
    this.badgeDone = null;
    this.set({ badge: null });
    done?.();
  };

  /** Resolves once the badge card is closed, or at once if none is open. */
  badgeClosed = (): Promise<void> => {
    if (!this.state.badge) return Promise.resolve();
    return new Promise((resolve) => {
      const prev = this.badgeDone;
      this.badgeDone = () => {
        prev?.();
        resolve();
      };
    });
  };

  // ---- Where you left off (Continue) ----

  /** The "where you left off" card's summary, from the tracker and the last thing learned. */
  resumeSummary = (): ResumeSummary | null =>
    resumeSummary(this.state.tracker, this.lastLearnedText(), {
      previousSave: this.progress.previousSave,
      now: this.now(),
      later: Object.values(this.progress.data.appTasks).filter((r) => r.status === 'later').length,
    });

  /** Shows the "where you left off" card; resolves when the player moves on. */
  showResume = (summary: ResumeSummary): Promise<void> => {
    this.resumeDone?.();
    this.set({ resume: summary });
    return new Promise((resolve) => (this.resumeDone = resolve));
  };

  closeResume = (): void => {
    const done = this.resumeDone;
    this.resumeDone = null;
    this.set({ resume: null });
    done?.();
  };

  /** The last thing learned, in words: a page's title, or a finished quest's honest line. */
  private lastLearnedText(): string | null {
    const l = this.progress.data.lastLearned;
    if (!l) return null;
    if (l.kind === 'page') return PAGE_INDEX.get(l.id)?.title ?? null;
    const q = this.state.quests.find((x) => x.id === l.id);
    return q ? `${q.title}: ${questLogLine(q.id, q.detail, this.progress.data.appTasks).line}` : null;
  }

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
    this.appTaskDone?.('closed');
    this.reflectionDone?.();
    this.badgeDone?.();
    this.resumeDone?.();
    this.quizDone = this.revealDone = this.bannerDone = this.paletteDone = this.forkDone = null;
    this.setupDone = null;
    this.appTaskDone = null;
    this.reflectionDone = this.badgeDone = this.resumeDone = null;
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
      appTask: null,
      reflection: null,
      badge: null,
      resume: null,
      checks: {},
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
      appTasks: { ...d.appTasks },
      reflections: { ...d.reflections },
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
      appTasks: {},
      reflections: {},
    });
  };

  private set(patch: Partial<LearnState>): void {
    this.state = { ...this.state, ...patch };
    for (const fn of this.listeners) fn(this.state);
  }
}
