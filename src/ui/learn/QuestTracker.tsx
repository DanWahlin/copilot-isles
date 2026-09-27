import { useEffect, useState } from 'react';
import type { Tracker } from '../../learn/store';

const COLLAPSED_KEY = 'copilot-isles.tracker.collapsed';

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * The island's goal and key tasks, top left while playing: what's done, what's next, and what to
 * do right now. T (or the header button) collapses it to just the current task.
 */
export function QuestTracker({ tracker }: { tracker: Tracker }) {
  const [collapsed, setCollapsed] = useState(readCollapsed);

  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSED_KEY, collapsed ? '1' : '0');
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
  const shown = collapsed ? tracker.tasks.filter((t) => t.status === 'active') : tracker.tasks;

  return (
    <section className={`ci-tracker${collapsed ? ' collapsed' : ''}`} aria-label="Island tasks">
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
                {t.status === 'active' && t.detail && <span className="detail">{t.detail}</span>}
                {t.link && (
                  <a className="link" href={t.link.url} target="_blank" rel="noopener noreferrer">
                    {t.link.label} ↗
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
