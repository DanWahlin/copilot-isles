/**
 * The "where you left off" card on Continue (no streaks: nothing is lost by being away). Pure: it
 * reads the tracker, the last thing learned and when the voyage was last saved.
 */

export interface ResumeTracker {
  island: string;
  chapter: string;
  next?: string;
  tasks: readonly { title: string; task: string; detail: string; status: string; optional?: boolean }[];
}

export interface ResumeSummary {
  island: string;
  chapter: string;
  /** The task on now (the first active main task, else an active optional one). */
  task: { title: string; task: string } | null;
  /** What to do next: the active step's line, or what comes after the island. */
  next: string | null;
  /** The last thing learned: a page's title or a quest's line. */
  learned: string | null;
  /** "Earlier today", "Yesterday", "3 days ago"… or null on a fresh voyage. */
  ago: string | null;
  /** Real-app tasks put off with Later. */
  later: number;
}

const DAY = 24 * 60 * 60 * 1000;

/** How long ago a time was, in words, by calendar day. */
export function agoText(then: number, now: number): string | null {
  if (!(then > 0) || then > now) return null;
  const a = new Date(then);
  const b = new Date(now);
  const days = Math.round(
    (Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) -
      Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) /
      DAY,
  );
  if (days <= 0) return 'Earlier today';
  if (days === 1) return 'Yesterday';
  if (days < 14) return `${days} days ago`;
  const weeks = Math.round(days / 7);
  return weeks < 9 ? `${weeks} weeks ago` : 'A while ago';
}

export function resumeSummary(
  tracker: ResumeTracker | null,
  learned: string | null,
  { previousSave, now, later }: { previousSave: number; now: number; later: number },
): ResumeSummary | null {
  if (!tracker) return null;
  const active =
    tracker.tasks.find((t) => t.status === 'active' && !t.optional) ??
    tracker.tasks.find((t) => t.status === 'active') ??
    null;
  return {
    island: tracker.island,
    chapter: tracker.chapter,
    task: active ? { title: active.title, task: active.task } : null,
    next: active?.detail || (active ? null : (tracker.next ?? null)),
    learned,
    ago: agoText(previousSave, now),
    later,
  };
}
