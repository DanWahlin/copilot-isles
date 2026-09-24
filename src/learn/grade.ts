import type { ChoiceQuiz, HotspotQuiz, MatchingQuiz, MultiQuiz, OrderingQuiz, Quiz } from './types';
import { inRect } from './content/index';

/** A player's answer, shaped by quiz type. */
export type Answer =
  | { type: 'mc' | 'scenario'; option: string }
  | { type: 'multi'; options: readonly string[] }
  | { type: 'hotspot'; x: number; y: number }
  | { type: 'hotspot-target'; target: string }
  | { type: 'ordering'; order: readonly string[] }
  | { type: 'matching'; pairs: Readonly<Record<string, string>> };

export interface Grade {
  correct: boolean;
  /** Why, in plain words (the option's own feedback when there is one). */
  feedback: string;
  /** For hotspots: the target that was hit, if any. */
  hit?: string;
  /** For ordering/matching: which positions/pairs were right (for per-item marks). */
  marks?: Readonly<Record<string, boolean>>;
}

export function grade(quiz: Quiz, answer: Answer): Grade {
  switch (quiz.type) {
    case 'mc':
    case 'scenario':
      return gradeChoice(quiz, answer);
    case 'multi':
      return gradeMulti(quiz, answer);
    case 'hotspot':
      return gradeHotspot(quiz, answer);
    case 'ordering':
      return gradeOrdering(quiz, answer);
    case 'matching':
      return gradeMatching(quiz, answer);
  }
}

function gradeChoice(q: ChoiceQuiz, a: Answer): Grade {
  if (a.type !== 'mc' && a.type !== 'scenario') throw new Error(`answer type ${a.type} for ${q.id}`);
  const correct = a.option === q.answer;
  const opt = q.options.find((o) => o.id === a.option);
  return { correct, feedback: correct ? q.explain.correct : (opt?.feedback ?? q.explain.wrong) };
}

function gradeMulti(q: MultiQuiz, a: Answer): Grade {
  if (a.type !== 'multi') throw new Error(`answer type ${a.type} for ${q.id}`);
  const want = new Set(q.answers);
  const got = new Set(a.options);
  const marks: Record<string, boolean> = {};
  for (const o of q.options) marks[o.id] = want.has(o.id) === got.has(o.id);
  const correct = Object.values(marks).every(Boolean);
  if (correct) return { correct, feedback: q.explain.correct, marks };
  const wrongPick = q.options.find((o) => got.has(o.id) && !want.has(o.id) && o.feedback);
  return { correct, feedback: wrongPick?.feedback ?? q.explain.wrong, marks };
}

function gradeHotspot(q: HotspotQuiz, a: Answer): Grade {
  let target;
  if (a.type === 'hotspot') {
    // Smallest target containing the point wins (rows can nest inside larger panels).
    target = q.targets
      .filter((t) => inRect(t.rect, a.x, a.y))
      .sort((p, r) => p.rect[2] * p.rect[3] - r.rect[2] * r.rect[3])[0];
  } else if (a.type === 'hotspot-target') {
    target = q.targets.find((t) => t.id === a.target);
  } else {
    throw new Error(`answer type ${a.type} for ${q.id}`);
  }
  const correct = !!target?.correct;
  return {
    correct,
    hit: target?.id,
    feedback: correct ? q.explain.correct : (target?.feedback ?? q.explain.wrong),
  };
}

function gradeOrdering(q: OrderingQuiz, a: Answer): Grade {
  if (a.type !== 'ordering') throw new Error(`answer type ${a.type} for ${q.id}`);
  const marks: Record<string, boolean> = {};
  q.items.forEach((item, i) => (marks[item.id] = a.order[i] === item.id));
  const correct = a.order.length === q.items.length && Object.values(marks).every(Boolean);
  return { correct, feedback: correct ? q.explain.correct : q.explain.wrong, marks };
}

function gradeMatching(q: MatchingQuiz, a: Answer): Grade {
  if (a.type !== 'matching') throw new Error(`answer type ${a.type} for ${q.id}`);
  const marks: Record<string, boolean> = {};
  for (const p of q.pairs) marks[p.left.id] = a.pairs[p.left.id] === p.right.id;
  const correct = Object.values(marks).every(Boolean);
  return { correct, feedback: correct ? q.explain.correct : q.explain.wrong, marks };
}

/** Deterministic shuffle (so tests and replays are stable) that never returns the original order. */
export function shuffled<T>(items: readonly T[], seed: number): T[] {
  const out = items.slice();
  if (out.length < 2) return out;
  let s = seed >>> 0 || 1;
  const rnd = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
  for (let tries = 0; tries < 8; tries++) {
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [out[i], out[j]] = [out[j]!, out[i]!];
    }
    if (out.some((v, i) => v !== items[i])) return out;
  }
  [out[0], out[1]] = [out[1]!, out[0]!];
  return out;
}
