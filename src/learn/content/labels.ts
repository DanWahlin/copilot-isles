import { onCourse } from '../../course/active';
import type { SourceRef } from '../types';

/**
 * Chart labels (docs/specs/LOWER-THIRDS.md): the parchment label that says what you'll learn at an
 * island or a puzzle and why, with its course chapter. The text lives in the course pack's
 * `labels.json` so the highlight reel can read the same data; the keys match the reel's `lowerThird`.
 */
export interface ChartLabelText {
  /** Where the game shows it: over an island's arrival, when a puzzle opens, or when a battle starts. */
  game: 'arrival' | 'puzzle' | 'battle' | null;
  /** The small-caps label: place · activity. */
  k: string;
  /** The headline: what you learn. */
  t: string;
  /** One line: why it matters. */
  b: string;
  /** The course chapter on the seal ("02"). */
  ch: string;
  /** The course section after "Course Chapter <ch> · ". */
  c: string;
  /** Replaces "Course Chapter <ch>" (a battle: "Questions from Course Chapter 00"). */
  chLine?: string;
  /** The course section the text paraphrases (PLAN §8.3). */
  source: SourceRef;
}

/** A label's id: `arrival:<island>`, `puzzle:<id>`, `battle:<plan id>`. */
export type ChartLabelId = string;

/** The active course's labels (empty until a voyage loads the course pack). */
export let CHART_LABELS: Readonly<Record<ChartLabelId, ChartLabelText>> = {};
onCourse((p) => {
  CHART_LABELS = p.labels;
});

/** A label by a computed id (a puzzle's or a battle's), or null if it has none. */
export function chartLabel(id: string): ChartLabelText | null {
  return Object.hasOwn(CHART_LABELS, id) ? CHART_LABELS[id as ChartLabelId] : null;
}

/** The chapter line under the text: "Course Chapter 02 · Context syntax". */
export function chapterLine(l: ChartLabelText): string {
  const head = l.chLine || `Course Chapter ${l.ch}`;
  return l.c ? `${head} · ${l.c}` : head;
}

/** The whole label as one sentence for screen readers (announced once, politely). */
export function spokenLabel(l: ChartLabelText): string {
  return `${l.k}. ${l.t}. ${l.b} ${chapterLine(l)}.`.replaceAll(' · ', ', ');
}

/**
 * Whether a label shows now: the first time in this save (and records it), or, with no save (dev
 * pages), the first time in this session.
 */
export function firstShowing(
  progress: { add(kind: 'labels', id: string): boolean } | null,
  shown: Set<string>,
  id: string,
): boolean {
  if (progress) return progress.add('labels', id);
  if (shown.has(id)) return false;
  shown.add(id);
  return true;
}
