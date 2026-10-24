import type { RecapItem } from './progress';

/**
 * Wingman's spaced, interleaved recap ("the parrot remembers"): which quizzes the player has already
 * met come back, and when. Pure and deterministic (the seed is the save's recap count), so it's
 * tested without a game.
 *
 * - **Spacing:** each quiz sits in a box (Leitner): a quiz missed the first time starts in box 0
 *   (due at once), one answered right first time in box 1, and each right recap answer moves it up a
 *   box, each wrong one back to 0. A box's interval grows (`BOX_MINUTES`), and a quiz is due once
 *   that much time has passed since it was last answered.
 * - **Weighting:** the most overdue first (time since seen over the box's interval), then the most
 *   often missed, then a seeded shuffle.
 * - **Interleaving:** questions come from different chapters in turn (the most overdue chapter
 *   first), so a recap mixes islands instead of drilling one.
 */

/** Minutes until a quiz in each box is due again (box 0 is due at once). */
export const BOX_MINUTES: readonly number[] = [0, 15, 60, 6 * 60, 24 * 60, 3 * 24 * 60, 7 * 24 * 60];

export function boxMinutes(box: number): number {
  return BOX_MINUTES[Math.min(Math.max(0, box), BOX_MINUTES.length - 1)]!;
}

/** A quiz the recap may ask: its id, its chapter, and its place in the schedule. */
export interface RecapCandidate {
  id: string;
  chapter: string;
  item: RecapItem;
  /** Times the player answered it wrong (its quiz record, before any recap). */
  missed: number;
}

/** A deterministic 0-1 hash of a string and a seed (mulberry-style mixing, no allocation per call). */
export function seededUnit(s: string, seed: number): number {
  let h = (seed ^ 0x9e3779b9) >>> 0;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 0x85ebca6b) >>> 0;
    h ^= h >>> 13;
  }
  h = Math.imul(h ^ (h >>> 16), 0xc2b2ae35) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * How overdue a quiz is: time since seen over its box's interval (due at 1). A box-0 quiz (missed) is
 * always due, and ahead of a box-1 quiz of the same age: 2, plus 1 for each box-1 interval since.
 */
export function overdue(item: RecapItem, now: number): number {
  const mins = Math.max(0, now - item.seen) / 60000;
  const interval = boxMinutes(item.box);
  return interval === 0 ? 2 + mins / BOX_MINUTES[1]! : mins / interval;
}

/**
 * Picks up to `count` due quizzes, interleaved across chapters. Returns [] when nothing's due (no
 * recap: the player isn't nagged with questions they've just answered).
 */
export function pickRecap(
  candidates: readonly RecapCandidate[],
  { now, count, seed }: { now: number; count: number; seed: number },
): string[] {
  const due = candidates
    .map((c) => ({ c, o: overdue(c.item, now), r: seededUnit(c.id, seed) }))
    .filter((x) => x.o >= 1)
    .sort(
      (a, b) =>
        b.o - a.o ||
        b.c.missed + b.c.item.wrong - (a.c.missed + a.c.item.wrong) ||
        a.r - b.r ||
        (a.c.id < b.c.id ? -1 : 1),
    );
  // Chapters in the order of their most overdue quiz, then one from each in turn.
  const byChapter = new Map<string, typeof due>();
  for (const x of due) {
    const list = byChapter.get(x.c.chapter);
    if (list) list.push(x);
    else byChapter.set(x.c.chapter, [x]);
  }
  const lists = [...byChapter.values()];
  const out: string[] = [];
  for (let round = 0; out.length < count && lists.some((l) => l.length > round); round++)
    for (const l of lists) {
      if (out.length >= count) break;
      const x = l[round];
      if (x) out.push(x.c.id);
    }
  return out;
}

/** Whether enough time has passed since the last recap for another. */
export function recapGapOk(last: number, now: number, minGapMinutes: number): boolean {
  return last <= 0 || now - last >= minGapMinutes * 60000;
}

/** The quiz records a recap reads (src/learn/progress.ts). */
export interface RecapProgress {
  created: number;
  quizzes: Readonly<Record<string, { attempts: number; firstTry: boolean; passed: boolean }>>;
  recap: { items: Readonly<Record<string, RecapItem>> };
}

/**
 * The quizzes a recap may ask: those the player has met (answered at least once), of the kinds it
 * asks, not excluded, in the chapters given (all when `chapters` is null). A quiz met before the
 * recap existed starts in box 1 (or 0 if it was missed), seen when the voyage began.
 */
export function recapCandidates(
  chapters: readonly { chapter: string; quizzes: readonly { id: string; type: string }[] }[],
  data: RecapProgress,
  opts: { types: readonly string[]; exclude: readonly string[]; chapters: ReadonlySet<string> | null },
): RecapCandidate[] {
  const out: RecapCandidate[] = [];
  for (const c of chapters) {
    if (opts.chapters && !opts.chapters.has(c.chapter)) continue;
    for (const q of c.quizzes) {
      const r = data.quizzes[q.id];
      if (!r || r.attempts <= 0 || !opts.types.includes(q.type) || opts.exclude.includes(q.id)) continue;
      const item = data.recap.items[q.id] ?? {
        box: r.firstTry ? 1 : 0,
        seen: data.created,
        right: 0,
        wrong: 0,
      };
      out.push({ id: q.id, chapter: c.chapter, item, missed: Math.max(0, r.attempts - (r.passed ? 1 : 0)) });
    }
  }
  return out;
}
