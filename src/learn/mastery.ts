import type { Objective } from './learning';

/**
 * The mastery map (the Logbook's Course map): for each of a chapter's learning objectives, how far
 * the player has got with what covers it. It's a map, not a grade: three plain marks, each shown with
 * a word as well as a symbol.
 *
 * - **Practised:** a quest or puzzle that acts it out is done.
 * - **Quizzed:** the quizzes that check it are passed (a recap answer counts too).
 * - **Done in the app:** the player confirmed its real-app tasks (never needed to finish).
 */

export type MarkState = 'none' | 'some' | 'all' | 'na';

export interface ObjectiveProgress {
  id: string;
  practised: MarkState;
  quizzed: MarkState;
  app: MarkState;
  /** Counts behind the marks, for the screen reader's words. */
  counts: {
    practised: [number, number];
    quizzed: [number, number];
    app: [number, number];
  };
  /** Practised and quizzed (the app's optional): what "met" means on the map. */
  met: boolean;
  /** Something's begun. */
  started: boolean;
}

/** What the map reads from a save. */
export interface MasteryProgress {
  quests: Readonly<Record<string, string>>;
  quizzes: Readonly<Record<string, { passed: boolean }>>;
  appTasks: Readonly<Record<string, { status: 'done' | 'later' }>>;
}

const mark = (done: number, total: number): MarkState =>
  total === 0 ? 'na' : done === 0 ? 'none' : done === total ? 'all' : 'some';

/** One objective's marks. `puzzleQuest` names the quest a puzzle plays in. */
export function objectiveProgress(
  o: Objective,
  p: MasteryProgress,
  puzzleQuest: (name: string) => string | undefined,
): ObjectiveProgress {
  const quests = [
    ...(o.covers.quests ?? []),
    ...(o.covers.puzzles ?? []).flatMap((n) => {
      const q = puzzleQuest(n);
      return q ? [q] : [];
    }),
  ];
  const uniqueQuests = [...new Set(quests)];
  const practised = uniqueQuests.filter((q) => p.quests[q] === 'done').length;
  const quizzes = o.covers.quizzes ?? [];
  const quizzed = quizzes.filter((q) => p.quizzes[q]?.passed).length;
  const tasks = o.covers.appTasks ?? [];
  const app = tasks.filter((t) => p.appTasks[t]?.status === 'done').length;
  const out: ObjectiveProgress = {
    id: o.id,
    practised: mark(practised, uniqueQuests.length),
    quizzed: mark(quizzed, quizzes.length),
    app: mark(app, tasks.length),
    counts: {
      practised: [practised, uniqueQuests.length],
      quizzed: [quizzed, quizzes.length],
      app: [app, tasks.length],
    },
    met: false,
    started: practised + quizzed + app > 0 || uniqueQuests.some((q) => !!p.quests[q]),
  };
  out.met =
    (out.practised === 'all' || out.practised === 'na') &&
    (out.quizzed === 'all' || out.quizzed === 'na') &&
    !(out.practised === 'na' && out.quizzed === 'na' && out.app !== 'all');
  return out;
}

/** A chapter's objectives with their marks, how many are met, and the first that isn't (what's next). */
export function chapterMastery(
  objectives: readonly Objective[],
  p: MasteryProgress,
  puzzleQuest: (name: string) => string | undefined,
): { rows: ObjectiveProgress[]; met: number; next: Objective | null } {
  const rows = objectives.map((o) => objectiveProgress(o, p, puzzleQuest));
  const firstOpen = rows.findIndex((r) => !r.met);
  return {
    rows,
    met: rows.filter((r) => r.met).length,
    next: firstOpen >= 0 ? objectives[firstOpen]! : null,
  };
}

/**
 * The first quest that would move an objective on: a covering quest that isn't done (the one in
 * progress first), so the map can say where to go.
 */
export function nextQuestFor(
  o: Objective,
  p: MasteryProgress,
  puzzleQuest: (name: string) => string | undefined,
): string | null {
  const quests = [
    ...(o.covers.quests ?? []),
    ...(o.covers.puzzles ?? []).flatMap((n) => {
      const q = puzzleQuest(n);
      return q ? [q] : [];
    }),
  ].filter((q) => p.quests[q] !== 'done');
  return quests.find((q) => !!p.quests[q]) ?? quests[0] ?? null;
}
