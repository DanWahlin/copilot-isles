import {
  MARKET,
  sectionTitle,
  sourceOf,
  type EffortId,
  type GildaKey,
  type JobSizeId,
  type MarketData,
  type MarketQuoteData,
  type OutcomeId,
  type QuoteKey,
} from '../../content/market';
import type { SourceRef } from '../../learn/types';
import type { ModelCategory } from './catalog';

/**
 * The Model Market's rules (docs/specs/MODEL-MARKET.md §3, §5): the jobs on Gilda's board, what a
 * hire costs in starfish, and how it's graded against Chapter 01's guidance on models and reasoning
 * effort. The data (jobs, prices, refunds, stamps, quotes, Gilda's lines) is `content/market.json`
 * (docs/content-data.md); the grading is here. Pure data and functions: the puzzle
 * (src/game/puzzles/model-market.ts) and the overlay (src/ui/puzzles/ModelMarket.tsx) play them.
 */

/** A course sentence, word for word (a test finds each in the bundled README), and where it's from. */
export interface CourseQuote {
  /** Exactly as the course writes it, `**bold**` included. */
  text: string;
  /** Shown as 'Course Chapter <NN> · <section>': the section's title in the course lock. */
  section: string;
  source: SourceRef;
}

const quote = (q: MarketQuoteData): CourseQuote => ({
  text: q.text,
  section: sectionTitle(q),
  source: sourceOf(q),
});

export const QUOTES = Object.fromEntries(
  Object.entries(MARKET.quotes).map(([k, q]) => [k, quote(q)]),
) as Readonly<Record<QuoteKey, CourseQuote>>;

export type JobId = string;
export type JobSize = JobSizeId;

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
export const JOBS: readonly MarketJob[] = MARKET.jobs.map((j) => ({
  id: j.id,
  title: j.title,
  note: j.note,
  size: j.size,
  brief: j.brief,
  why: QUOTES[j.why],
}));

export const jobById = (id: string): MarketJob | null => JOBS.find((j) => j.id === id) ?? null;

export type Effort = EffortId;
/** The effort dial, low to high (the grading reads them in this order). */
export const EFFORTS: readonly Effort[] = ['low', 'default', 'high'];
const effortData = (m: MarketData, e: Effort) => m.efforts.find((x) => x.id === e);
export const EFFORT_LABEL: Readonly<Record<Effort, string>> = Object.fromEntries(
  EFFORTS.map((e) => [e, effortData(MARKET, e)?.label ?? e]),
) as Record<Effort, string>;

/** A hire: Auto (the app picks, and Effort is hidden), or a model of a category with an effort. */
export type Hire = { auto: true } | { auto: false; category: ModelCategory; model: string; effort: Effort };

/** Starfish per hire (docs/specs/MODEL-MARKET.md §3): bigger models cost more. */
export const AUTO_PRICE = MARKET.autoPrice;
export const CATEGORY_PRICE: Readonly<Record<ModelCategory, number>> = Object.fromEntries(
  MARKET.categories.map((c) => [c.id, c.price]),
) as Record<ModelCategory, number>;
export const EFFORT_PRICE: Readonly<Record<Effort, number>> = Object.fromEntries(
  EFFORTS.map((e) => [e, effortData(MARKET, e)?.price ?? 0]),
) as Record<Effort, number>;
export const MAX_PRICE = MARKET.maxPrice;

export const price = (h: Hire): number => priceIn(MARKET, h);

/** A hire's price with a market file's prices (the content check reads the file on disk). */
export function priceIn(m: MarketData, h: Hire): number {
  if (h.auto) return m.autoPrice;
  const model = m.categories.find((c) => c.id === h.category)?.price ?? 0;
  return Math.min(m.maxPrice, model + (effortData(m, h.effort)?.price ?? 0));
}

/** Starfish back for a right-sized hire: one for a quick look, two for a hard job done right. */
export const REFUND: Readonly<Record<JobSize, number>> = {
  quick: MARKET.sizes.quick.refund,
  hard: MARKET.sizes.hard.refund,
};
/** Doubloons the first time each job's done right-sized. */
export const JOB_DOUBLOONS: Readonly<Record<JobSize, number>> = {
  quick: MARKET.sizes.quick.doubloons,
  hard: MARKET.sizes.hard.doubloons,
};
/** "Quick look", "Hard job". */
export const SIZE_LABEL: Readonly<Record<JobSize, string>> = {
  quick: MARKET.sizes.quick.label,
  hard: MARKET.sizes.hard.label,
};

export type Outcome = OutcomeId;
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

/** Every hire the market sells (each category at each effort, and Auto), for the economy's sums. */
function everyHire(): Hire[] {
  const out: Hire[] = [{ auto: true }];
  for (const c of MARKET.categories)
    for (const effort of EFFORTS) out.push({ auto: false, category: c.id, model: c.id, effort });
  return out;
}

/** The cheapest right-sized hire for a job, in starfish ("it cost 4 for a 1-starfish job"). */
export function fairPrice(job: MarketJob): number {
  let best = Infinity;
  for (const h of everyHire()) if (grade(job, h).outcome === 'right') best = Math.min(best, price(h));
  return best;
}

/** What the stallholder says: voice line ids (tools/voice/lines.testcove.json) by what they're for. */
export const GILDA = Object.fromEntries(
  Object.entries(MARKET.gilda).map(([k, l]) => [k, l.voice]),
) as Readonly<Record<GildaKey, string>>;

/** Each of Gilda's voice lines' text (the caption), by voice line id. */
export const GILDA_TEXT: Readonly<Record<string, string>> = Object.fromEntries(
  Object.values(MARKET.gilda).map((l) => [l.voice, l.text]),
);

/** The course sections Gilda's teaching lines paraphrase, by voice line id (Chapter 01's `voiced`). */
export const GILDA_SOURCES: Readonly<Record<string, SourceRef>> = Object.fromEntries(
  Object.values(MARKET.gilda).flatMap((l) => (l.source ? [[l.voice, sourceOf(l.source)] as const] : [])),
);

export interface Feedback {
  outcome: Outcome;
  reason: Reason;
  /** The stamp on the work order. */
  stamp: string;
  /** Gilda's voiced line (its id). */
  line: string;
  /** What happened, in one sentence. */
  summary: string;
  /** The course sentences behind the grade (the Retry one too when it fell short). */
  quotes: readonly CourseQuote[];
}

export const STAMP: Readonly<Record<Outcome, string>> = MARKET.stamps;

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
