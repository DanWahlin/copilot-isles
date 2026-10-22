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
import { onCourse } from '../../course/active';
import type { SourceRef } from '../../learn/types';
import type { ModelCategory } from './catalog';
import type { ModelTier } from '../../content/market';
import type { PuzzleFile } from '../../course/pack';
import { puzzleContent, textOf } from '../../course/puzzles';

/**
 * The Model Market's rules (docs/specs/MODEL-MARKET.md §3, §5): the jobs on Gilda's board, what a
 * hire costs in starfish, and how it's graded against Chapter 01's guidance on models and reasoning
 * effort. The data (jobs, prices, refunds, stamps, quotes, Gilda's lines) is the course pack's
 * `market.json` (docs/content-data.md); the grading is here. The values below are the active
 * course's, set when a voyage loads it (src/course/active.ts). Pure data and functions: the puzzle
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

/** The market's words (`puzzles/market.json`): the overlay, the hire's name, the summaries, the signs. */
export const marketText = (key: string, v?: Readonly<Record<string, string | number>>) =>
  textOf(puzzleContent<PuzzleFile>('market'), key, v);
const T = marketText;

export let QUOTES = {} as Readonly<Record<QuoteKey, CourseQuote> & Record<string, CourseQuote>>;

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
export let JOBS: readonly MarketJob[] = [];

export const jobById = (id: string): MarketJob | null => JOBS.find((j) => j.id === id) ?? null;

export type Effort = EffortId;
/** The effort dial, low to high (the grading reads them in this order). */
export const EFFORTS: readonly Effort[] = ['low', 'default', 'high'];
const effortData = (m: MarketData, e: Effort) => m.efforts.find((x) => x.id === e);
export let EFFORT_LABEL = {} as Readonly<Record<Effort, string>>;

/** A hire: Auto (the app picks, and Effort is hidden), or a model of a category with an effort. */
export type Hire = { auto: true } | { auto: false; category: ModelCategory; model: string; effort: Effort };

/** Each category's size (the grading reads sizes, never a course's category names). */
export let TIER_OF = {} as Readonly<Record<ModelCategory, ModelTier>>;
/** The course's category for each size. */
export let CATEGORY_OF = {} as Readonly<Record<ModelTier, ModelCategory>>;

/** Starfish per hire (docs/specs/MODEL-MARKET.md §3): bigger models cost more. */
export let AUTO_PRICE = 0;
export let CATEGORY_PRICE = {} as Readonly<Record<ModelCategory, number>>;
export let EFFORT_PRICE = {} as Readonly<Record<Effort, number>>;
export let MAX_PRICE = 0;

export const price = (h: Hire): number => priceIn(MARKET, h);

/** A hire's price with a market file's prices (the content check reads the file on disk). */
export function priceIn(m: MarketData, h: Hire): number {
  if (h.auto) return m.autoPrice;
  const model = m.categories.find((c) => c.id === h.category)?.price ?? 0;
  return Math.min(m.maxPrice, model + (effortData(m, h.effort)?.price ?? 0));
}

/** Starfish back for a right-sized hire, by job size (none for a quick look, two for a hard job). */
export let REFUND = {} as Readonly<Record<JobSize, number>>;

/**
 * What a right-sized hire gets back: its size's refund, but always less than the hire cost, so a
 * right-sized job costs at least one starfish (docs/specs/MODEL-MARKET.md §3).
 */
export const refundFor = (job: Pick<MarketJob, 'size'>, h: Hire): number => refundIn(REFUND, job, h, price);

/** `refundFor` with a market file's refunds and prices (the content check reads the file on disk). */
export function refundIn(
  refunds: Readonly<Record<JobSize, number>>,
  job: Pick<MarketJob, 'size'>,
  h: Hire,
  priceOf: (h: Hire) => number,
): number {
  return Math.max(0, Math.min(refunds[job.size], priceOf(h) - 1));
}
/** Doubloons the first time each job's done right-sized. */
export let JOB_DOUBLOONS = {} as Readonly<Record<JobSize, number>>;
/** "Quick look", "Hard job". */
export let SIZE_LABEL = {} as Readonly<Record<JobSize, string>>;

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
 * Grades a hire for a job by its model's size and the effort (for the Copilot app course, Models and
 * Reasoning Effort; Lightweight, Versatile and Powerful are small, medium and large):
 * - A quick look (a tour, a short explanation): Auto, or a small model on its default (or low)
 *   effort, is right-sized. A bigger model, or high effort, overspends. Nothing falls short.
 * - A hard job (a difficult bug, a change across several files): a large model on default or high,
 *   or a medium one on high, is right-sized. Auto (it hides the effort), a small model, a medium one
 *   below high or a large one on low falls short.
 */
export function grade(
  job: MarketJob,
  h: Hire,
  tiers: Readonly<Record<ModelCategory, ModelTier>> = TIER_OF,
): { outcome: Outcome; reason: Reason } {
  const tier = h.auto ? null : tiers[h.category];
  if (job.size === 'quick') {
    if (h.auto) return { outcome: 'right', reason: 'quick-right' };
    if (tier !== 'small') return { outcome: 'over', reason: 'quick-over-model' };
    return h.effort === 'high'
      ? { outcome: 'over', reason: 'quick-over-effort' }
      : { outcome: 'right', reason: 'quick-right' };
  }
  if (h.auto) return { outcome: 'short', reason: 'hard-short-auto' };
  if (tier === 'small') return { outcome: 'short', reason: 'hard-short-model' };
  const enough = tier === 'large' ? h.effort !== 'low' : h.effort === 'high';
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

/** What the stallholder says: voice line ids (the pack's voice/lines.json) by what they're for. */
export let GILDA = {} as Readonly<Record<GildaKey, string>>;

/** Each of Gilda's voice lines' text (the caption), by voice line id. */
export let GILDA_TEXT: Readonly<Record<string, string>> = {};

/** The course sections Gilda's teaching lines paraphrase, by voice line id (Chapter 01's `voiced`). */
export let GILDA_SOURCES: Readonly<Record<string, SourceRef>> = {};

export interface Feedback {
  outcome: Outcome;
  reason: Reason;
  /** The stamp on the work order. */
  stamp: string;
  /** What the keeper says to it (each stall's keeper has their own line for it). */
  key: GildaKey;
  /** What happened, in one sentence. */
  summary: string;
  /** The course sentences behind the grade (the Retry one too when it fell short). */
  quotes: readonly CourseQuote[];
}

export let STAMP = {} as Readonly<Record<Outcome, string>>;

onCourse(() => {
  const m = MARKET;
  QUOTES = Object.fromEntries(Object.entries(m.quotes).map(([k, q]) => [k, quote(q)])) as Record<
    QuoteKey,
    CourseQuote
  > &
    Record<string, CourseQuote>;
  JOBS = m.jobs.map((j) => ({
    id: j.id,
    title: j.title,
    note: j.note,
    size: j.size,
    brief: j.brief,
    why: QUOTES[j.why],
  }));
  EFFORT_LABEL = Object.fromEntries(EFFORTS.map((e) => [e, effortData(m, e)?.label ?? e])) as Record<
    Effort,
    string
  >;
  AUTO_PRICE = m.autoPrice;
  TIER_OF = Object.fromEntries(m.categories.map((c) => [c.id, c.acts])) as Record<ModelCategory, ModelTier>;
  CATEGORY_OF = Object.fromEntries(m.categories.map((c) => [c.acts, c.id])) as Record<
    ModelTier,
    ModelCategory
  >;
  CATEGORY_PRICE = Object.fromEntries(m.categories.map((c) => [c.id, c.price])) as Record<
    ModelCategory,
    number
  >;
  EFFORT_PRICE = Object.fromEntries(EFFORTS.map((e) => [e, effortData(m, e)?.price ?? 0])) as Record<
    Effort,
    number
  >;
  MAX_PRICE = m.maxPrice;
  REFUND = { quick: m.sizes.quick.refund, hard: m.sizes.hard.refund };
  JOB_DOUBLOONS = { quick: m.sizes.quick.doubloons, hard: m.sizes.hard.doubloons };
  SIZE_LABEL = { quick: m.sizes.quick.label, hard: m.sizes.hard.label };
  GILDA = Object.fromEntries(Object.entries(m.gilda).map(([k, l]) => [k, l.voice])) as Record<
    GildaKey,
    string
  >;
  GILDA_TEXT = Object.fromEntries(Object.values(m.gilda).map((l) => [l.voice, l.text]));
  GILDA_SOURCES = Object.fromEntries(
    Object.values(m.gilda).flatMap((l) => (l.source ? [[l.voice, sourceOf(l.source)] as const] : [])),
  );
  STAMP = m.stamps;
});

/** "Auto", or "Claude Haiku 5.5 on Default". */
export function hireName(h: Hire): string {
  return h.auto ? T('auto') : T('hireName', { model: h.model, effort: EFFORT_LABEL[h.effort] });
}

export function feedback(job: MarketJob, h: Hire): Feedback {
  const { outcome, reason } = grade(job, h);
  // Right-sized: some starfish back, or (when the hire was already the fair price) a fair price.
  const right: GildaKey = refundFor(job, h) > 0 ? 'right' : 'fair';
  const paid = price(h);
  const who = hireName(h);
  const fair = fairPrice(job);
  const base = { outcome, reason, stamp: STAMP[outcome] };
  const summary = T(`summary.${reason}`, { who, paid, fair });
  switch (reason) {
    case 'quick-right':
      return {
        ...base,
        key: right,
        summary,
        quotes: [job.why, ...(h.auto ? [QUOTES.auto] : [])],
      };
    case 'quick-over-model':
      return {
        ...base,
        key: 'over',
        summary,
        quotes: [QUOTES.cost, job.why],
      };
    case 'quick-over-effort':
      return {
        ...base,
        key: 'overEffort',
        summary,
        quotes: [QUOTES.effort, job.why],
      };
    case 'hard-right':
      return {
        ...base,
        key: right,
        summary,
        quotes: [QUOTES.hard, QUOTES.noGuarantee],
      };
    case 'hard-short-auto':
      return {
        ...base,
        key: 'shortAuto',
        summary,
        quotes: [QUOTES.autoHidden, QUOTES.hard, QUOTES.retry],
      };
    case 'hard-short-model':
      return {
        ...base,
        key: 'short',
        summary,
        quotes: [QUOTES.hard, QUOTES.retry],
      };
    case 'hard-short-effort':
      return {
        ...base,
        key: 'short',
        summary,
        quotes: [QUOTES.hard, QUOTES.effort, QUOTES.retry],
      };
  }
}

/**
 * A Retry (only after Fell short; the course's "retry it with a different model or reasoning effort
 * without re-typing your prompt"): the same job, and the work order opens with the picker it's about
 * live and nothing chosen in it, so you choose the different model or the effort yourself.
 */
export interface RetryPlan {
  kind: 'model' | 'effort';
  /** The hire that fell short (shown as last time's). */
  last: Hire;
  /**
   * The picker that's live, nothing chosen in it: the models' for "a different model", the effort
   * dial's for "more effort". After Auto it's always the models' (Auto's off: it hides the effort).
   */
  live: 'model' | 'effort';
}

export function retryPlan(last: Hire, kind: 'model' | 'effort'): RetryPlan {
  return { kind, last, live: last.auto ? 'model' : kind };
}

/** A pick a Retry won't take again: Auto after Auto, or the model you just used. */
export function usedLastTime(plan: RetryPlan, pick: 'auto' | ModelCategory, model?: string): boolean {
  if (plan.live !== 'model') return false;
  if (plan.last.auto) return pick === 'auto';
  return pick !== 'auto' && model !== undefined && model === plan.last.model;
}

/** An effort a Retry won't take again: the effort you just used, on the same model. */
export function effortLastTime(plan: RetryPlan, model: string, effort: Effort): boolean {
  return (
    plan.live === 'effort' && !plan.last.auto && plan.last.model === model && plan.last.effort === effort
  );
}

/** Whether a hire is a Retry's: it changes what the Retry is about (a different model, or the effort). */
export function retryChanges(plan: RetryPlan, h: Hire): boolean {
  if (h.auto) return !usedLastTime(plan, 'auto');
  return !usedLastTime(plan, h.category, h.model) && !effortLastTime(plan, h.model, h.effort);
}
