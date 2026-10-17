import { courseRefs } from '../../learn/course/refs';
import type { SourceRef } from '../../learn/types';
import type { ModelCategory } from './catalog';

/**
 * The Model Market's rules (docs/specs/MODEL-MARKET.md §3, §5): the jobs on Gilda's board, what a
 * hire costs in starfish, and how it's graded against Chapter 01's guidance on models and reasoning
 * effort. Pure data and functions: the puzzle (src/game/puzzles/model-market.ts) and the overlay
 * (src/ui/puzzles/ModelMarket.tsx) play them.
 */

const src = courseRefs('01-tour-the-app');

/** A course sentence, word for word (a test finds each in the bundled README), and where it's from. */
export interface CourseQuote {
  /** Exactly as the course writes it, `**bold**` included. */
  text: string;
  /** Shown as 'Course Chapter 01 · <section>'. */
  section: string;
  source: SourceRef;
}

const MODELS = {
  section: 'Models and Reasoning Effort',
  source: src('models-and-reasoning-effort', '84d625491118'),
};
const TRY = { section: 'Try the Controls', source: src('try-the-controls', '1a9a4b2f69f1') };
const RETRY = {
  section: 'Try Again with a Different Model',
  source: src('try-again-with-a-different-model', 'b0031ded9c4d'),
};

export const QUOTES = {
  cost: { text: 'Models differ in capabilities, speed, and usage cost.', ...MODELS },
  effort: { text: 'Higher effort can help with complex problems, but can take longer.', ...MODELS },
  quick: {
    text: 'For a repository tour or a short explanation, keep **Auto** or the current model and its default reasoning effort.',
    ...MODELS,
  },
  hard: {
    text: 'For a difficult bug or a change across several files, consider a model suited to complex coding and a higher effort level.',
    ...MODELS,
  },
  noGuarantee: { text: 'Higher effort does not guarantee a correct answer.', ...MODELS },
  auto: {
    text: 'With **Auto**, the Copilot app chooses a model for your task and shows which model it selected in the conversation, alongside a short explanation of why it made that choice.',
    ...MODELS,
  },
  autopilot: {
    text: 'This is different from **Autopilot**, which controls how independently the agent works.',
    ...MODELS,
  },
  autoHidden: {
    text: 'If the **Auto** switch is on, these settings are hidden. Turn it off to see them.',
    ...MODELS,
  },
  vary: { text: 'Available models, effort levels, and context window sizes vary.', ...MODELS },
  simple: { text: 'Keep the default for this simple question.', ...TRY },
  retry: {
    text: "If the agent's response doesn't work for you, you can retry it with a different model or reasoning effort without re-typing your prompt.",
    ...RETRY,
  },
} as const satisfies Record<string, CourseQuote>;

export type JobId = 'tour' | 'explain' | 'bug' | 'files';
export type JobSize = 'quick' | 'hard';

export interface MarketJob {
  id: JobId;
  /** The work order's heading. */
  title: string;
  /** The note pinned on the cork board (short). */
  note: string;
  size: JobSize;
  /** One line about the job, from the course's own tasks. */
  brief: string;
  /** What the course says about a job like this. */
  why: CourseQuote;
}

/** Gilda's jobs board, in order: two quick looks, then two hard jobs (keys 1-4). */
export const JOBS: readonly MarketJob[] = [
  {
    id: 'tour',
    title: 'Give the new deckhand a tour of the repo',
    note: 'Tour the repo',
    size: 'quick',
    brief:
      'A beginner-friendly tour of samples/book-app-web: what it does, how its files are organized, and what its tests cover. No files change.',
    why: QUOTES.quick,
  },
  {
    id: 'explain',
    title: 'Explain how filterBooks searches',
    note: 'Explain filterBooks',
    size: 'quick',
    brief: 'Does letter case affect the book app’s search? Refer to the file, and don’t change anything.',
    why: QUOTES.simple,
  },
  {
    id: 'bug',
    title: 'Track down a difficult bug in the book app',
    note: 'Track down a bug',
    size: 'hard',
    brief: 'Something in the book app breaks, and it isn’t obvious why.',
    why: QUOTES.hard,
  },
  {
    id: 'files',
    title: 'Change the book app across several files',
    note: 'Change many files',
    size: 'hard',
    brief: 'One change that reaches across several of the book app’s files.',
    why: QUOTES.hard,
  },
];

export const jobById = (id: string): MarketJob | null => JOBS.find((j) => j.id === id) ?? null;

export type Effort = 'low' | 'default' | 'high';
export const EFFORTS: readonly Effort[] = ['low', 'default', 'high'];
export const EFFORT_LABEL: Readonly<Record<Effort, string>> = {
  low: 'Low',
  default: 'Default',
  high: 'High',
};

/** A hire: Auto (the app picks, and Effort is hidden), or a model of a category with an effort. */
export type Hire = { auto: true } | { auto: false; category: ModelCategory; model: string; effort: Effort };

/** Starfish per hire (docs/specs/MODEL-MARKET.md §3): bigger models cost more. */
export const AUTO_PRICE = 1;
export const CATEGORY_PRICE: Readonly<Record<ModelCategory, number>> = {
  Lightweight: 1,
  Versatile: 2,
  Powerful: 3,
};
export const EFFORT_PRICE: Readonly<Record<Effort, number>> = { low: 0, default: 0, high: 1 };
export const MAX_PRICE = 4;

export function price(h: Hire): number {
  if (h.auto) return AUTO_PRICE;
  return Math.min(MAX_PRICE, CATEGORY_PRICE[h.category] + EFFORT_PRICE[h.effort]);
}

/** Starfish back for a right-sized hire: one for a quick look, two for a hard job done right. */
export const REFUND: Readonly<Record<JobSize, number>> = { quick: 1, hard: 2 };
/** Doubloons the first time each job's done right-sized. */
export const JOB_DOUBLOONS: Readonly<Record<JobSize, number>> = { quick: 5, hard: 10 };

export type Outcome = 'right' | 'over' | 'short';
export type Reason =
  | 'quick-right'
  | 'quick-over-model'
  | 'quick-over-effort'
  | 'hard-right'
  | 'hard-short-auto'
  | 'hard-short-model'
  | 'hard-short-effort';

/**
 * Grades a hire for a job by the course's guidance (Models and Reasoning Effort):
 * - A quick look (a tour, a short explanation): Auto, or a Lightweight model on its default (or low)
 *   effort, is right-sized. A bigger model, or High effort, overspends. Nothing falls short.
 * - A hard job (a difficult bug, a change across several files): a Powerful model on Default or High,
 *   or a Versatile one on High, is right-sized. Auto (it hides Effort), a Lightweight model, a
 *   Versatile one below High or a Powerful one on Low falls short.
 */
export function grade(job: MarketJob, h: Hire): { outcome: Outcome; reason: Reason } {
  if (job.size === 'quick') {
    if (h.auto) return { outcome: 'right', reason: 'quick-right' };
    if (h.category !== 'Lightweight') return { outcome: 'over', reason: 'quick-over-model' };
    return h.effort === 'high'
      ? { outcome: 'over', reason: 'quick-over-effort' }
      : { outcome: 'right', reason: 'quick-right' };
  }
  if (h.auto) return { outcome: 'short', reason: 'hard-short-auto' };
  if (h.category === 'Lightweight') return { outcome: 'short', reason: 'hard-short-model' };
  const enough = h.category === 'Powerful' ? h.effort !== 'low' : h.effort === 'high';
  return enough
    ? { outcome: 'right', reason: 'hard-right' }
    : { outcome: 'short', reason: 'hard-short-effort' };
}

/** The cheapest right-sized hire for a job, in starfish ("it cost 4 for a 1-starfish job"). */
export function fairPrice(job: MarketJob): number {
  return job.size === 'quick' ? AUTO_PRICE : CATEGORY_PRICE.Versatile + EFFORT_PRICE.high;
}

/** What the stallholder says (voice line ids in tools/voice/lines.testcove.json, and their text). */
export const GILDA = {
  hello: 'mer.market.hello',
  open: 'mer.market.open',
  auto: 'mer.market.auto',
  right: 'mer.market.right',
  over: 'mer.market.over',
  overEffort: 'mer.market.over.effort',
  short: 'mer.market.short',
  shortAuto: 'mer.market.short.auto',
  broke: 'mer.market.broke',
  done: 'mer.market.done',
} as const;

export const GILDA_TEXT: Readonly<Record<(typeof GILDA)[keyof typeof GILDA], string>> = {
  'mer.market.hello':
    "Ahoy, Captain! Welcome to Gilda's Model Market. Trade your starfish for a model that fits the job. Bigger models cost more.",
  'mer.market.open': 'Pick a job from the board, then hire a model and set the effort dial.',
  'mer.market.auto':
    "Auto's the house special. The app chooses a model for you, then tells you which one and why. It isn't Autopilot, mind.",
  'mer.market.right': "Right-sized! Here's some starfish back for hiring smart.",
  'mer.market.over': "That's a lot of starfish for a quick look. Auto would've done it.",
  'mer.market.over.effort': "High effort for a quick look? The default would've done it.",
  'mer.market.short': 'Not quite. This job needs more muscle. Retry with a stronger model or more effort.',
  'mer.market.short.auto':
    "With Auto on, the effort setting's hidden. For a job this hard, turn Auto off, then pick a model and a higher effort.",
  'mer.market.broke': "No starfish? They hide all over the islands. Come back when you've found some.",
  'mer.market.done': "Every job on the board, right-sized. You've got an eye for models, Captain!",
};

export interface Feedback {
  outcome: Outcome;
  reason: Reason;
  /** The stamp on the work order. */
  stamp: string;
  /** Gilda's voiced line. */
  line: (typeof GILDA)[keyof typeof GILDA];
  /** What happened, in one sentence. */
  summary: string;
  /** The course sentences behind the grade (the Retry one too when it fell short). */
  quotes: readonly CourseQuote[];
}

export const STAMP: Readonly<Record<Outcome, string>> = {
  right: '✓ Right-sized',
  over: '! Overspent',
  short: '↻ Fell short',
};

/** "Auto", or "Claude Haiku 5.5 on Default". */
export function hireName(h: Hire): string {
  return h.auto ? 'Auto' : `${h.model} on ${EFFORT_LABEL[h.effort]}`;
}

export function feedback(job: MarketJob, h: Hire): Feedback {
  const { outcome, reason } = grade(job, h);
  const paid = price(h);
  const who = hireName(h);
  const fair = fairPrice(job);
  const base = { outcome, reason, stamp: STAMP[outcome] };
  switch (reason) {
    case 'quick-right':
      return {
        ...base,
        line: GILDA.right,
        summary: `${who} did the job for ${paid} starfish: right-sized.`,
        quotes: [job.why, ...(h.auto ? [QUOTES.auto] : [])],
      };
    case 'quick-over-model':
      return {
        ...base,
        line: GILDA.over,
        summary: `${who} did the job, but it cost ${paid} starfish for a ${fair}-starfish job.`,
        quotes: [QUOTES.cost, job.why],
      };
    case 'quick-over-effort':
      return {
        ...base,
        line: GILDA.overEffort,
        summary: `${who} did the job, but High effort cost ${paid} starfish for a ${fair}-starfish job.`,
        quotes: [QUOTES.effort, job.why],
      };
    case 'hard-right':
      return {
        ...base,
        line: GILDA.right,
        summary: `${who} got it done: right-sized for a hard job.`,
        quotes: [QUOTES.hard, QUOTES.noGuarantee],
      };
    case 'hard-short-auto':
      return {
        ...base,
        line: GILDA.shortAuto,
        summary: 'Auto made a start, but with its effort hidden, the job isn’t done.',
        quotes: [QUOTES.autoHidden, QUOTES.hard, QUOTES.retry],
      };
    case 'hard-short-model':
      return {
        ...base,
        line: GILDA.short,
        summary: `${who} made a start, but a Lightweight model isn’t enough for this job.`,
        quotes: [QUOTES.hard, QUOTES.retry],
      };
    case 'hard-short-effort':
      return {
        ...base,
        line: GILDA.short,
        summary: `${who} made a start, but it needs more effort for this job.`,
        quotes: [QUOTES.hard, QUOTES.effort, QUOTES.retry],
      };
  }
}

/**
 * Where a Retry starts the hire (the player can still change it): "a different model" moves to a model
 * suited to complex coding (Powerful; Low becomes Default), and "more effort" keeps the model on High.
 */
export function retryHire(
  h: Hire,
  kind: 'model' | 'effort',
  firstOf: (c: ModelCategory) => string,
): Exclude<Hire, { auto: true }> {
  if (h.auto) {
    // Auto hides Effort: either way, turn it off and pick a model suited to complex coding.
    return kind === 'model'
      ? { auto: false, category: 'Powerful', model: firstOf('Powerful'), effort: 'default' }
      : { auto: false, category: 'Versatile', model: firstOf('Versatile'), effort: 'high' };
  }
  // "Higher effort" for a hard job: straight to High.
  if (kind === 'effort') return { ...h, effort: 'high' };
  const effort = h.effort === 'low' ? 'default' : h.effort;
  if (h.category === 'Powerful') {
    // Already the biggest: another Powerful model.
    const other = firstOf('Powerful') === h.model ? h.model : firstOf('Powerful');
    return { ...h, model: other, effort };
  }
  return { auto: false, category: 'Powerful', model: firstOf('Powerful'), effort };
}
