import type { QuestDef, QuestTarget } from '../course/pack';
import type { QuestState } from './story';

/** A task on the tracker: done, the one to do now, or still to come. */
export type TrackerStatus = 'done' | 'active' | 'upcoming';

/** What the on-screen tracker shows for an island: its chapter and goal, and its tasks in order. */
export interface QuestTracker {
  island: string;
  chapter: string;
  goal: string;
  next: string;
  tasks: readonly {
    id: string;
    title: string;
    task: string;
    detail: string;
    status: TrackerStatus;
    optional: boolean;
    link?: { label: string; url: string };
  }[];
}

/** The step you're on in an island's main quests (`main`, story order): the first unfinished one. */
export function firstOpenQuest(
  main: readonly QuestDef[],
  q: QuestState,
): { id: string; task: string; step: string } | null {
  const d = main.find((c) => q[c.id] !== 'done');
  return d ? { id: d.id, task: d.task, step: q[d.id] ?? 'start' } : null;
}

/**
 * An island's tasks for the tracker: its quests in story order (an optional one once started), the
 * current main quest and any started optional one active, with their step's line.
 */
export function islandTasks(
  quests: readonly QuestDef[],
  q: QuestState,
  current: { id: string; step: string } | null,
): QuestTracker['tasks'] {
  return quests
    .filter((d) => !d.optional || q[d.id])
    .map((d) => {
      const optionalStep = d.optional ? q[d.id] : undefined;
      const status: TrackerStatus =
        q[d.id] === 'done' ? 'done' : d.id === current?.id || optionalStep ? 'active' : 'upcoming';
      const step = d.optional ? optionalStep : current?.step;
      const detail = status === 'active' && step ? (d.steps[step] ?? '') : '';
      return { id: d.id, title: d.title, task: d.task, detail, status, optional: !!d.optional, link: d.link };
    });
}

/** A quest line's started quests for the Logbook's quest tab, in story order. */
export function startedQuests(
  quests: readonly QuestDef[],
  q: QuestState,
): { id: string; title: string; detail: string; done: boolean }[] {
  return quests
    .filter((d) => q[d.id])
    .map((d) => ({
      id: d.id,
      title: d.title,
      detail: d.steps[q[d.id]!] ?? '',
      done: q[d.id] === 'done',
    }));
}

/**
 * Where the compass's dimmer marker points for the optional quests you've started and not finished:
 * each one's step target (the course pack's `targets`), in story order. Steps with none are skipped.
 */
export function optionalTargets(
  quests: readonly QuestDef[],
  targets: Readonly<Record<string, QuestTarget>>,
  q: QuestState,
): QuestTarget[] {
  const out: QuestTarget[] = [];
  for (const d of quests) {
    const step = q[d.id];
    if (!d.optional || !step || step === 'done') continue;
    const t = targets[`${d.id}:${step}`];
    if (t) out.push(t);
  }
  return out;
}
