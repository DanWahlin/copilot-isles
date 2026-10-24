import type { ReactNode } from 'react';
import { hasActiveCourse, coursePack } from '../../course/active';
import { courseUrl } from '../../learn/content/index';
import { chapterUrl } from '../../learn/course/chapters';
import { LEARNING, REFLECTIONS, objectivesOf, type AppTask } from '../../learn/learning';
import { chapterMastery, nextQuestFor, type MarkState, type ObjectiveProgress } from '../../learn/mastery';
import { chartedIslands, type LearnState, type LearnStore } from '../../learn/store';
import { CheckButton } from './LearningCards';
import { CourseLink } from './CourseMarkdown';
import { Rich } from './Rich';

/**
 * The Logbook's learning views: the Course map (each chapter's learning objectives with what the
 * player has practised, been quizzed on and done in the real app; the reflection they picked; the
 * chapter's Seal and its card) and the App checklist (every real-app task, done, later or not
 * reached, with a way to do it now or check it on GitHub). Marks are words and symbols, never colour
 * alone.
 */

/** A puzzle's quest (a disabled puzzle covers nothing). */
const puzzleQuestOf = (name: string): string | undefined => {
  const p = hasActiveCourse() ? coursePack().puzzles[name] : undefined;
  return p && !p.disabled ? p.quest || undefined : undefined;
};

function questTitle(id: string): string | null {
  if (!hasActiveCourse()) return null;
  for (const q of Object.values(coursePack().quests)) {
    const d = q.quests.find((x) => x.id === id);
    if (d) return `${d.title}: ${d.task}`;
  }
  return null;
}

const MARK: Record<MarkState, { sym: string; word: string }> = {
  all: { sym: '✓', word: 'done' },
  some: { sym: '◐', word: 'started' },
  none: { sym: '○', word: 'not yet' },
  na: { sym: '', word: '' },
};

function Mark({ label, state, count }: { label: string; state: MarkState; count: [number, number] }) {
  if (state === 'na') return null;
  return (
    <span
      className={`ci-lj-mark ${state}`}
      aria-label={`${label}: ${count[0]} of ${count[1]}, ${MARK[state].word}`}
    >
      <b aria-hidden>{MARK[state].sym}</b> {label}{' '}
      <small aria-hidden>
        {count[0]}/{count[1]}
      </small>
    </span>
  );
}

function ObjectiveRow({
  text,
  p,
  course,
  next,
}: {
  text: string;
  p: ObjectiveProgress;
  course: boolean;
  next: ReactNode;
}) {
  return (
    <li className={`ci-lj-objective${p.met ? ' met' : ''}`}>
      <span className="ci-lj-objective-state" aria-hidden>
        {course ? '·' : p.met ? '✓' : p.started ? '◐' : '○'}
      </span>
      <div>
        <p>
          <Rich text={text} />
          <span className="ci-lj-sr">
            {course
              ? ' (in the course only)'
              : p.met
                ? ' (met)'
                : p.started
                  ? ' (under way)'
                  : ' (not started)'}
          </span>
        </p>
        {course ? (
          <p className="ci-lj-marks">
            <span className="ci-lj-mark na">In the course only</span>
          </p>
        ) : (
          <p className="ci-lj-marks">
            <Mark label="Practised" state={p.practised} count={p.counts.practised} />
            <Mark label="Quizzed" state={p.quizzed} count={p.counts.quizzed} />
            <Mark label="Done in the app" state={p.app} count={p.counts.app} />
          </p>
        )}
        {next}
      </div>
    </li>
  );
}

export function CourseMapView({ store, state }: { store: LearnStore; state: LearnState }) {
  const d = store.progress.data;
  const p = { quests: d.quests, quizzes: d.quizzes, appTasks: state.appTasks };
  const complete = store.courseComplete();
  return (
    <div className="ci-lj-map">
      <p className="ci-lj-intro">
        Each chapter’s learning objectives, and how far you’ve got with each. It’s a map, not a grade:{' '}
        <b aria-hidden>✓</b> done, <b aria-hidden>◐</b> started, <b aria-hidden>○</b> not yet.
      </p>
      {complete && (
        <p className="ci-lj-complete">
          <span aria-hidden>⚓</span> Every charted chapter is done.{' '}
          <button
            type="button"
            className="ci-btn primary ci-lj-btn"
            onClick={() => store.openBadge('course')}
          >
            Your certificate
          </button>
        </p>
      )}
      {chartedIslands().map((isl) => {
        const objectives = objectivesOf(isl.chapter);
        const reflection = REFLECTIONS.get(isl.chapter);
        const picked = state.reflections[isl.chapter];
        const sealed = !!isl.seal && d.seals.includes(isl.seal);
        if (!objectives.length && !reflection && !isl.seal) return null;
        const counted = objectives.filter((o) =>
          Object.keys(o.covers).some((k) => (o.covers as Record<string, unknown[]>)[k]?.length),
        );
        const m = chapterMastery(counted, p, puzzleQuestOf);
        const nextQuest = m.next ? nextQuestFor(m.next, p, puzzleQuestOf) : null;
        const pct = counted.length ? Math.round((m.met / counted.length) * 100) : 0;
        return (
          <section key={isl.chapter} className="ci-lj-chapter" aria-labelledby={`ci-lj-ch-${isl.chapter}`}>
            <header>
              <h3 id={`ci-lj-ch-${isl.chapter}`}>{isl.label}</h3>
              {counted.length > 0 && (
                <span className="ci-lj-progress">
                  <span
                    className="ci-lj-bar"
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={counted.length}
                    aria-valuenow={m.met}
                    aria-label={`${m.met} of ${counted.length} objectives met`}
                  >
                    <i style={{ width: `${pct}%` }} />
                  </span>
                  <small>
                    {m.met} of {counted.length} met
                  </small>
                </span>
              )}
              <a
                className="ci-course-link"
                href={chapterUrl(isl.chapter, 'learning-objectives')}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`${isl.label} in the course (opens in a new tab)`}
              >
                Open in the course ↗
              </a>
            </header>
            {objectives.length > 0 && (
              <ul className="ci-lj-objectives">
                {objectives.map((o) => {
                  const course = !counted.includes(o);
                  const row = m.rows[counted.indexOf(o)] ?? {
                    id: o.id,
                    practised: 'na',
                    quizzed: 'na',
                    app: 'na',
                    counts: { practised: [0, 0], quizzed: [0, 0], app: [0, 0] },
                    met: false,
                    started: false,
                  };
                  const next =
                    o === m.next && nextQuest ? (
                      <p className="ci-lj-next">
                        <span className="ci-course-kicker">Next</span> {questTitle(nextQuest)}
                      </p>
                    ) : null;
                  return (
                    <ObjectiveRow
                      key={o.id}
                      text={o.text}
                      p={row as ObjectiveProgress}
                      course={course}
                      next={next}
                    />
                  );
                })}
              </ul>
            )}
            {reflection && picked && (
              <p className="ci-lj-reflected">
                <span className="ci-course-kicker">You chose to use first</span>{' '}
                {picked.choice ? (
                  <Rich text={reflection.choices.find((c) => c.id === picked.choice)?.text ?? ''} />
                ) : (
                  'You skipped this one.'
                )}
              </p>
            )}
            {isl.seal && (
              <p className="ci-lj-sealrow">
                <span className={sealed ? 'held' : ''}>
                  <b aria-hidden>{sealed ? '⚓' : '○'}</b> {isl.seal}
                  {sealed ? '' : ': not yet'}
                </span>
                {sealed && (
                  <button
                    type="button"
                    className="ci-btn ghost ci-lj-btn"
                    onClick={() => store.openBadge('seal', isl.seal ?? undefined)}
                  >
                    Seal card
                  </button>
                )}
              </p>
            )}
          </section>
        );
      })}
    </div>
  );
}

function taskStatus(t: AppTask, state: LearnState): { cls: string; sym: string; word: string } {
  const r = state.appTasks[t.id];
  if (r?.status === 'done')
    return r.verified
      ? { cls: 'done', sym: '✓', word: 'Done, and GitHub shows it' }
      : { cls: 'done', sym: '✓', word: 'Done in the app' };
  if (r?.status === 'later') return { cls: 'later', sym: '◷', word: 'Later' };
  return { cls: 'unreached', sym: '·', word: 'Not reached yet' };
}

export function AppChecklistView({ store, state }: { store: LearnStore; state: LearnState }) {
  const tasks = LEARNING.file.appTasks;
  const done = tasks.filter((t) => state.appTasks[t.id]?.status === 'done').length;
  return (
    <div className="ci-lj-checklist">
      <p className="ci-lj-intro">
        What the course has you do in {LEARNING.file.labels.tool}, chapter by chapter. Ticks are yours: the
        game only knows what you tell it
        {state.githubChecks ? ', or what GitHub shows when you ask it to check' : ''}.{' '}
        <strong>
          {done} of {tasks.length}
        </strong>{' '}
        done.
      </p>
      {chartedIslands().map((isl) => {
        const list = tasks.filter((t) => t.chapter === isl.chapter);
        if (!list.length) return null;
        return (
          <section key={isl.chapter} className="ci-lj-chapter" aria-label={isl.label}>
            <header>
              <h3>{isl.label}</h3>
            </header>
            <ul className="ci-lj-tasks">
              {list.map((t) => {
                const s = taskStatus(t, state);
                const reached = s.cls !== 'unreached';
                return (
                  <li key={t.id} className={`ci-lj-task ${s.cls}`} data-task={t.id}>
                    <span className="ci-lj-task-state">
                      <b aria-hidden>{s.sym}</b> {s.word}
                    </span>
                    <span className="ci-lj-task-title">{t.title}</span>
                    <span className="ci-lj-task-actions">
                      {reached && (
                        <button
                          type="button"
                          className="ci-btn ghost ci-lj-btn"
                          aria-label={`${t.title}: open the steps`}
                          onClick={() => void store.askAppTask(t.id, 'logbook')}
                        >
                          Steps
                        </button>
                      )}
                      {reached && state.appTasks[t.id]?.status !== 'done' && (
                        <button
                          type="button"
                          className="ci-btn ghost ci-lj-btn"
                          aria-label={`${t.title}: I did it`}
                          onClick={() => store.setAppTaskDone(t.id, true)}
                        >
                          I did it
                        </button>
                      )}
                      {!reached && <CourseLink source={t.source} fallback={courseUrl(t.source)} />}
                    </span>
                    {reached && <CheckButton store={store} id={t.id} state={state} />}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
