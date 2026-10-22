import { onCourse } from '../course/active';
import type { ChapterId } from '../learn/course/chapters';
import type { SourceRef } from '../learn/types';

/**
 * The typed view of a course pack's `market.json` (docs/content-data.md): the Model Market's prices,
 * refunds, board numbers, stamps, course quotes, jobs, Gilda's lines and the other keepers'. It's part of the build, so a
 * merged edit ships with the next deploy. `src/content/content.test.ts` validates the file against
 * `courses/schemas/market.schema.json` and checks the quotes, anchors and voice lines. A course that
 * teaches models has one (COURSE-PACKS.md §4); the keys below are the ones the game asks for.
 */

/** A model category: the course's id for it (its models in models.json name it). */
export type ModelCategoryId = string;
/** The game's model sizes: what the grading reads (each category is bound to one, `acts`). */
export const MODEL_TIERS = ['small', 'medium', 'large'] as const;
export type ModelTier = (typeof MODEL_TIERS)[number];
export type EffortId = 'low' | 'default' | 'high';
export type JobSizeId = 'quick' | 'hard';
export type OutcomeId = 'right' | 'over' | 'short';

/** Where a course sentence is from (`hash` is the section's hash in the pack's lock.json). */
export interface CourseCite {
  chapter: ChapterId;
  anchor: string;
  hash: string;
}

export interface MarketQuoteData extends CourseCite {
  /** Exactly as the course writes it, `**bold**` included. */
  text: string;
}

/** The course sentences the grading and the overlay show, by what they're for. */
export const QUOTE_KEYS = [
  'cost',
  'effort',
  'hard',
  'noGuarantee',
  'auto',
  'autoAside',
  'autoHidden',
  'retry',
] as const;
export type QuoteKey = (typeof QUOTE_KEYS)[number];
/** The stallholder's lines the game plays, by what they're for. */
export const GILDA_KEYS = [
  'hello',
  'open',
  'auto',
  'right',
  'fair',
  'over',
  'overEffort',
  'short',
  'shortAuto',
  'done',
  'broke',
] as const;
export type GildaKey = (typeof GILDA_KEYS)[number];

export interface MarketJobData {
  id: string;
  title: string;
  note: string;
  size: JobSizeId;
  brief: string;
  /** A key of `quotes`: what the course says about a job like this. */
  why: string;
}

export interface GildaLineData {
  /** The voice line's id in the pack's voice/lines.json. */
  voice: string;
  /** The caption: the voice line's text, word for word. */
  text: string;
  /** The course section a teaching line paraphrases (left out for banter and directions). */
  source?: CourseCite;
}

/**
 * Another stall's keeper's own voiced lines, by the stall's island: their version of every line Gilda
 * says (the same teaching, in their words), and a goodbye.
 */
export type KeeperLinesData = Readonly<Record<GildaKey | 'bye', GildaLineData>>;

export interface MarketData {
  categories: readonly {
    id: ModelCategoryId;
    acts: ModelTier;
    price: number;
    size: string;
    tagline: string;
  }[];
  efforts: readonly { id: EffortId; label: string; price: number }[];
  autoPrice: number;
  maxPrice: number;
  sizes: Readonly<Record<JobSizeId, { label: string; refund: number; doubloons: number }>>;
  board: { size: number; perFamily: number };
  stamps: Readonly<Record<OutcomeId, string>>;
  /** The keys the game asks for, and any a job's `why` names. */
  quotes: Readonly<Record<QuoteKey, MarketQuoteData> & Record<string, MarketQuoteData>>;
  jobs: readonly MarketJobData[];
  gilda: Readonly<Record<GildaKey, GildaLineData>>;
  /**
   * The keepers of the stalls other than Gilda's (each island's; the game's MARKET_STALLS): every line
   * in their own voice, so a stall never plays Gilda's.
   */
  keepers?: Readonly<Record<string, KeeperLinesData>>;
}

/** The active course's market (empty until a voyage loads the course pack). */
export let MARKET: MarketData = {} as MarketData;

let locked: Partial<Record<ChapterId, { sections: Record<string, { title: string }> }>> = {};

onCourse((p) => {
  MARKET = p.market;
  locked = p.lock.chapters;
});

/** A cited section's title in the course lock ("Models and Reasoning Effort"), or its anchor. */
export function sectionTitle(c: CourseCite): string {
  return locked[c.chapter]?.sections[c.anchor]?.title ?? c.anchor;
}

export const sourceOf = (c: CourseCite): SourceRef => ({
  chapter: c.chapter,
  anchor: c.anchor,
  hash: c.hash,
});
