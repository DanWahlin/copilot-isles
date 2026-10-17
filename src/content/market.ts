import { onCourse } from '../course/active';
import type { ChapterId } from '../learn/course/chapters';
import type { SourceRef } from '../learn/types';

/**
 * The typed view of a course pack's `market.json` (docs/content-data.md): the Model Market's prices,
 * refunds, board numbers, stamps, course quotes, jobs and Gilda's lines. It's part of the build, so a
 * merged edit ships with the next deploy. `src/content/content.test.ts` validates the file against
 * `courses/schemas/market.schema.json` and checks the quotes, anchors and voice lines. The Model
 * Market teaches the Copilot app's models, so only that course has one (COURSE-PACKS.md §4); its
 * quote and line keys are typed from that pack's file.
 */
type MarketFile = typeof import('../../courses/copilot-app/market.json');

export type ModelCategoryId = 'Lightweight' | 'Versatile' | 'Powerful';
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

export type QuoteKey = keyof MarketFile['quotes'];
export type GildaKey = keyof MarketFile['gilda'];

export interface MarketJobData {
  id: string;
  title: string;
  note: string;
  size: JobSizeId;
  brief: string;
  /** A key of `quotes`: what the course says about a job like this. */
  why: QuoteKey;
}

export interface GildaLineData {
  /** The voice line's id in the pack's voice/lines.json. */
  voice: string;
  /** The caption: the voice line's text, word for word. */
  text: string;
  /** The course section a teaching line paraphrases (left out for banter and directions). */
  source?: CourseCite;
}

export interface MarketData {
  categories: readonly { id: ModelCategoryId; price: number; size: string; tagline: string }[];
  efforts: readonly { id: EffortId; label: string; price: number }[];
  autoPrice: number;
  maxPrice: number;
  sizes: Readonly<Record<JobSizeId, { label: string; refund: number; doubloons: number }>>;
  board: { size: number; perFamily: number };
  stamps: Readonly<Record<OutcomeId, string>>;
  quotes: Readonly<Record<QuoteKey, MarketQuoteData>>;
  jobs: readonly MarketJobData[];
  gilda: Readonly<Record<GildaKey, GildaLineData>>;
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
