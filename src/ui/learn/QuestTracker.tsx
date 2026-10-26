import { useEffect, useState } from 'react';
import type { Tracker } from '../../learn/store';
import { useSetupText } from './Rich';

// Set only while the player wants the whole list. The old `tracker.collapsed` key was written on
// every mount, so reading it would keep the full list open for everyone who has played before.
const FULL_LIST_KEY = 'copilot-isles.tracker.full';

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(FULL_LIST_KEY) !== '1';
  } catch {
    return true;
  }
}

/**
 * The island's goal and key tasks, top left while playing. It shows just the current task by
 * default; T (or the header button) opens the whole list of what's done and what's next. It fades
 * out while a conversation or framed shot has the screen (`calm`).
 */
export function QuestTracker({
  tracker,
  calm = false,
  spot = false,
}: {
  tracker: Tracker;
  calm?: boolean;
  /** Lit while Wingman points it out. */
  spot?: boolean;
}) {
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const fill = useSetupText();

  useEffect(() => {
    try {
      if (collapsed) localStorage.removeItem(FULL_LIST_KEY);
      else localStorage.setItem(FULL_LIST_KEY, '1');
    } catch {
      // Private mode: the choice just won't persist.
    }
  }, [collapsed]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.code !== 'KeyT' || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
      setCollapsed((c) => !c);
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);

  const required = tracker.tasks.filter((t) => !t.optional);
  const total = required.length;
  const done = required.filter((t) => t.status === 'done').length;
  const complete = done === total;
  // Collapsed, the main task leads (the compass's gold marker is on it) and optional ones follow.
  const shown = collapsed
    ? [
        ...tracker.tasks.filter((t) => t.status === 'active' && !t.optional),
        ...tracker.tasks.filter((t) => t.status === 'active' && t.optional),
      ]
    : tracker.tasks;

  return (
    <section
      className={`ci-tracker${collapsed ? ' collapsed' : ''}${calm ? ' calm' : ''}${spot ? ' spot' : ''}`}
      aria-label="Island tasks"
      aria-hidden={calm || undefined}
    >
      <button
        type="button"
        className="ci-tracker-head"
        onClick={() => setCollapsed((c) => !c)}
        aria-expanded={!collapsed}
        title={collapsed ? 'Show all tasks (T)' : 'Show only the current task (T)'}
      >
        <span className="ci-tracker-eyebrow">
          {tracker.island} · {tracker.chapter}
        </span>
        <span className="ci-tracker-goal">{tracker.goal}</span>
        <span className="ci-tracker-progress" aria-label={`${done} of ${total} tasks done`}>
          <span className="bar">
            <span style={{ width: `${(done / Math.max(1, total)) * 100}%` }} />
          </span>
          <span className="count">
            {done}/{total}
          </span>
        </span>
      </button>
      {complete ? (
        <div className="ci-tracker-complete">
          <p>Every task’s done. {tracker.island} is yours, Captain.</p>
          {tracker.next && <p className="next">{tracker.next}</p>}
        </div>
      ) : (
        <ol className="ci-tracker-list">
          {shown.map((t) => (
            <li key={`${t.id}:${t.status}`} className={t.status}>
              <span className="mark" aria-hidden />
              <span className="text">
                <span className="task">
                  {t.task}
                  {t.optional && <span className="optional">optional</span>}
                </span>
                {t.status === 'active' && t.detail && <span className="detail">{fill(t.detail)}</span>}
                {t.link && (
                  <a className="link" href={t.link.url} target="_blank" rel="noopener noreferrer">
                    {/* A pack's label may carry its own arrow. */}
                    {t.link.label.replace(/\s*↗$/, '')} ↗
                  </a>
                )}
              </span>
              <span className="sr-only">
                {t.status === 'done' ? ' (done)' : t.status === 'active' ? ' (current)' : ''}
              </span>
            </li>
          ))}
        </ol>
      )}
      <p className="ci-tracker-hint">
        <kbd>T</kbd> {collapsed ? 'All tasks' : 'Current task only'} · <kbd>J</kbd> Logbook
      </p>
    </section>
  );
}
