import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { COURSE } from '../../course/catalog';
import { courseUrl } from '../../learn/content/index';
import { LEARNING } from '../../learn/learning';
import type { BadgeData } from '../../learn/badge';
import type { CheckState, LearnState, LearnStore } from '../../learn/store';
import type { ResumeSummary } from '../../learn/resume';
import { usePadFocus } from '../hooks/pad-focus';
import { CourseLink } from './CourseMarkdown';
import { Rich } from './Rich';
import './learning.css';

/**
 * The learning systems' cards (src/learn/learning.ts): "Do this in the app", the reflection before a
 * Seal, the Seal card and course certificate, and "where you left off". Each works with a mouse, a
 * tap, the keyboard (E or Enter for the main button, Esc to go back, arrows or Tab to move) and a
 * gamepad (the d-pad moves, A presses, B goes back); every target is at least 44 px.
 */

/** E (or Enter off a button) for the main action, Esc to go back. Key repeats don't count. */
function useCardKeys(primary: (() => void) | null, back: () => void): void {
  const ref = useRef({ primary, back });
  ref.current = { primary, back };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopImmediatePropagation();
        ref.current.back();
      } else if (e.code === 'KeyE' || (e.key === 'Enter' && tag !== 'BUTTON' && tag !== 'A')) {
        if (!ref.current.primary) return;
        e.preventDefault();
        ref.current.primary();
      }
    };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  }, []);
}

/** A card's focus on open: its main button (the keyboard and the pad start there). */
function useInitialFocus(root: React.RefObject<HTMLElement | null>, key: unknown): void {
  useEffect(() => {
    const el = root.current?.querySelector<HTMLElement>('[data-initial-focus="true"]');
    el?.focus({ preventScroll: true });
  }, [root, key]);
}

const timeOf = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

/** What a GitHub check found, in words (the player's own word stands whatever it says). */
export function CheckLine({ state }: { state: CheckState | undefined }): ReactNode {
  if (!state) return null;
  const text =
    state.status === 'running'
      ? 'Asking GitHub…'
      : state.status === 'found'
        ? '✓ GitHub shows it, so it’s ticked.'
        : state.status === 'missing'
          ? state.reason === 'notFork' || state.reason === 'otherParent'
            ? 'GitHub shows that repository, but it isn’t a fork of the course. Check the address in Your setup, or tick it yourself.'
            : 'GitHub doesn’t show it yet. If you’ve just done it, try again in a minute, or tick it yourself.'
          : state.status === 'limited'
            ? `GitHub’s limit for checks without signing in is used up until ${timeOf(state.resetAt ?? Date.now())}. Tick it yourself, or check again then.`
            : state.status === 'unsupported'
              ? 'Checks only work for forks on github.com. Tick it yourself.'
              : 'GitHub couldn’t be reached. Tick it yourself, or check again later.';
  return (
    <p className={`ci-lj-check ${state.status}`} role="status" aria-live="polite">
      {text}
    </p>
  );
}

/** The "Check on GitHub" button and its result, when the player turned the checks on and gave their fork. */
export function CheckButton({ store, id, state }: { store: LearnStore; id: string; state: LearnState }) {
  if (!state.githubChecks || !LEARNING.file.appTasks.find((t) => t.id === id)?.check) return null;
  if (!state.fork)
    return <p className="ci-lj-note">Add your fork in the Logbook’s Your setup to check this on GitHub.</p>;
  const running = state.checks[id]?.status === 'running';
  return (
    <div className="ci-lj-checkrow">
      <button
        type="button"
        className="ci-btn ghost ci-lj-btn"
        disabled={running}
        onClick={() => void store.checkAppTask(id)}
      >
        Check on GitHub
      </button>
      <CheckLine state={state.checks[id]} />
    </div>
  );
}

// ---- "Do this in the app" ----

export function AppTaskCard({ store, state }: { store: LearnStore; state: LearnState }) {
  const a = state.appTask!;
  const { task, phase, from } = a;
  const root = useRef<HTMLElement>(null);
  const ids = useId();
  const labels = LEARNING.file.labels;
  const rec = state.appTasks[task.id];
  const primary = phase === 'ask' ? store.appTaskDid : phase === 'answered' ? store.appTaskContinue : null;
  const back = phase === 'ask' ? store.appTaskLater : store.appTaskContinue;
  useCardKeys(primary, back);
  usePadFocus(root, back);
  useInitialFocus(root, phase);
  useEffect(() => {
    if (phase !== 'seen' || !task.seen) return;
    const key = (e: KeyboardEvent) => {
      const n = Number(e.key);
      const opt = n >= 1 ? task.seen!.options[n - 1] : undefined;
      if (opt && !e.repeat) store.appTaskSeen(opt.id);
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [phase, task, store]);
  const right = a.answer !== null && a.answer === task.seen?.answer;
  return (
    <div className="ci-learn-backdrop">
      <section
        ref={root}
        className="ci-lj-card ci-lj-apptask"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${ids}-title`}
        aria-describedby={`${ids}-body`}
        data-task={task.id}
        data-phase={phase}
      >
        <p className="ci-page-kicker">
          <span aria-hidden>🧭</span> {labels.kicker}
        </p>
        <h2 id={`${ids}-title`}>{task.title}</h2>
        <div id={`${ids}-body`}>
          {phase === 'ask' && (
            <>
              <ol className="ci-lj-steps">
                {task.steps.map((s, i) => (
                  <li key={i}>
                    <Rich text={s} />
                  </li>
                ))}
              </ol>
              <p className="ci-lj-why">
                <span className="ci-course-kicker">Why</span> <Rich text={task.why} />
              </p>
              <p className="ci-lj-links">
                <CourseLink source={task.source} fallback={courseUrl(task.source)} />
                {task.link && (
                  <a
                    className="ci-course-link"
                    href={task.link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`${task.link.label} (opens in a new tab)`}
                  >
                    {task.link.label} ↗
                  </a>
                )}
              </p>
              <CheckButton store={store} id={task.id} state={state} />
              {rec?.status === 'done' ? (
                <p className="ci-lj-note">
                  <span aria-hidden>✓</span> You’ve ticked this one
                  {rec.verified ? ', and GitHub shows it' : ''}.
                </p>
              ) : (
                from === 'script' && (
                  <p className="ci-lj-note">
                    Not at {labels.tool} right now? Choose Later: it waits in your Logbook’s{' '}
                    {labels.checklist}, and the voyage goes on.
                  </p>
                )
              )}
            </>
          )}
          {phase === 'seen' && task.seen && (
            <>
              <p className="ci-lj-question">
                <span className="ci-course-kicker">What did you see?</span> <Rich text={task.seen.prompt} />
              </p>
              <div className="ci-lj-options" role="group" aria-label={task.seen.prompt}>
                {task.seen.options.map((o, i) => (
                  <button
                    key={o.id}
                    type="button"
                    className="ci-lj-option"
                    data-initial-focus={i === 0 ? 'true' : undefined}
                    onClick={() => store.appTaskSeen(o.id)}
                  >
                    <kbd>{i + 1}</kbd>
                    <span>
                      <Rich text={o.text} />
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}
          {phase === 'answered' && task.seen && (
            <div className={`ci-quiz-feedback ${right ? 'good' : 'bad'}`} role="status" aria-live="polite">
              <span className="ci-quiz-verdict">
                <b aria-hidden>{right ? '✓' : '↺'}</b>
                {right ? 'That’s it' : 'Here’s what the course says'}
              </span>
              <p>
                <Rich text={task.seen.explain} />
              </p>
            </div>
          )}
        </div>
        <footer className="ci-lj-actions">
          {phase === 'ask' && (
            <>
              <button
                type="button"
                className="ci-btn primary ci-lj-btn"
                data-initial-focus="true"
                onClick={store.appTaskDid}
              >
                <kbd>E</kbd> {rec?.status === 'done' ? 'Done' : 'I did it'}
              </button>
              <button type="button" className="ci-btn ghost ci-lj-btn" onClick={store.appTaskLater}>
                <kbd>Esc</kbd> {from === 'logbook' ? 'Close' : 'Later'}
              </button>
            </>
          )}
          {phase === 'seen' && (
            <button type="button" className="ci-btn ghost ci-lj-btn" onClick={store.appTaskContinue}>
              <kbd>Esc</kbd> Skip the question
            </button>
          )}
          {phase === 'answered' && (
            <button
              type="button"
              className="ci-btn primary ci-lj-btn"
              data-initial-focus="true"
              onClick={store.appTaskContinue}
            >
              <kbd>E</kbd> Continue
            </button>
          )}
        </footer>
      </section>
    </div>
  );
}

// ---- The reflection before a Seal ----

export function ReflectionCard({ store, state }: { store: LearnStore; state: LearnState }) {
  const r = state.reflection!;
  const root = useRef<HTMLElement>(null);
  const ids = useId();
  const skip = () => store.chooseReflection(null);
  useCardKeys(null, skip);
  usePadFocus(root, skip);
  useInitialFocus(root, r.chapter);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const n = Number(e.key);
      const c = n >= 1 ? r.choices[n - 1] : undefined;
      if (c && !e.repeat) store.chooseReflection(c.id);
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [r, store]);
  return (
    <div className="ci-learn-backdrop">
      <section
        ref={root}
        className="ci-lj-card ci-lj-reflection"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${ids}-title`}
      >
        <p className="ci-page-kicker">
          <span aria-hidden>🦜</span> A moment before your Seal
        </p>
        <h2 id={`${ids}-title`}>
          <Rich text={r.prompt} />
        </h2>
        <p className="ci-lj-note">
          Pick one. It isn’t graded: it goes in your Logbook’s Course map, and you can skip it.
        </p>
        <div className="ci-lj-options" role="group" aria-labelledby={`${ids}-title`}>
          {r.choices.map((c, i) => (
            <button
              key={c.id}
              type="button"
              className="ci-lj-option"
              data-initial-focus={i === 0 ? 'true' : undefined}
              onClick={() => store.chooseReflection(c.id)}
            >
              <kbd>{i + 1}</kbd>
              <span>
                <Rich text={c.text} />
              </span>
            </button>
          ))}
        </div>
        <footer className="ci-lj-actions">
          <CourseLink source={r.source} fallback={courseUrl(r.source)} />
          <button type="button" className="ci-btn ghost ci-lj-btn" onClick={skip}>
            <kbd>Esc</kbd> Skip
          </button>
        </footer>
      </section>
    </div>
  );
}

// ---- The Seal card and the course certificate ----

const W = 1200;
const H = 630;

/** Draws the card (no network: system fonts, shapes, the course's words). */
export function drawBadge(ctx: CanvasRenderingContext2D, b: BadgeData): void {
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, '#0f1d2a');
  g.addColorStop(1, '#173a45');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(232, 200, 138, 0.7)';
  ctx.lineWidth = 4;
  ctx.strokeRect(28, 28, W - 56, H - 56);
  ctx.strokeStyle = 'rgba(232, 200, 138, 0.3)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(42, 42, W - 84, H - 84);
  // The medal.
  const mx = 190;
  const my = 250;
  ctx.fillStyle = '#d9b271';
  ctx.beginPath();
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const r = i % 2 ? 92 : 104;
    ctx.lineTo(mx + Math.cos(a) * r, my + Math.sin(a) * r);
  }
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#1d160a';
  ctx.beginPath();
  ctx.arc(mx, my, 74, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#f1d49b';
  ctx.font = '700 86px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('⚓', mx, my + 4);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  const x = 340;
  const wrap = (text: string, y: number, font: string, color: string, max: number, lh: number): number => {
    ctx.font = font;
    ctx.fillStyle = color;
    let line = '';
    for (const word of text.split(' ')) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > max && line) {
        ctx.fillText(line, x, y);
        line = word;
        y += lh;
      } else line = test;
    }
    if (line) ctx.fillText(line, x, y);
    return y + lh;
  };
  ctx.font = '700 22px system-ui, sans-serif';
  ctx.fillStyle = '#e8c88a';
  ctx.fillText('KRAKEN ISLES', x, 120);
  let y = wrap(b.heading, 190, '600 56px Georgia, serif', '#fff6de', W - x - 80, 62);
  y = wrap(`${b.who} ${b.what}.`, y + 8, '400 28px system-ui, sans-serif', '#fbefd6', W - x - 80, 38);
  y += 6;
  ctx.font = '600 22px system-ui, sans-serif';
  for (const s of b.seals) {
    ctx.fillStyle = s.held ? '#3fd0c9' : 'rgba(251, 239, 214, 0.45)';
    ctx.fillText(`${s.held ? '✓' : '○'}  ${s.label} · ${s.seal}`, x, y);
    y += 34;
  }
  ctx.font = '500 20px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(251, 239, 214, 0.75)';
  ctx.fillText(`${b.courseUrl.replace(/^https:\/\//, '')} · ${b.date}`, x, H - 70);
}

export function BadgeCard({ store, badge }: { store: LearnStore; badge: BadgeData }) {
  const root = useRef<HTMLElement>(null);
  const ids = useId();
  const [img, setImg] = useState<string | null>(null);
  const [copied, setCopied] = useState<'ok' | 'select' | null>(null);
  const text = useRef<HTMLTextAreaElement>(null);
  useCardKeys(store.closeBadge, store.closeBadge);
  usePadFocus(root, store.closeBadge);
  useInitialFocus(root, badge.heading);
  useEffect(() => {
    try {
      const c = document.createElement('canvas');
      c.width = W;
      c.height = H;
      const ctx = c.getContext('2d');
      if (!ctx) return;
      drawBadge(ctx, badge);
      setImg(c.toDataURL('image/png'));
    } catch {
      setImg(null);
    }
  }, [badge]);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(badge.text);
      setCopied('ok');
    } catch {
      text.current?.select();
      setCopied('select');
    }
  };
  const file = `kraken-isles-${COURSE.id}-${badge.kind === 'course' ? 'voyage' : 'seal'}.png`;
  return (
    <div className="ci-learn-backdrop">
      <section
        ref={root}
        className="ci-lj-card ci-lj-badge"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${ids}-title`}
        data-kind={badge.kind}
      >
        <p className="ci-page-kicker">{badge.kind === 'course' ? 'Your certificate' : 'Your Seal card'}</p>
        <h2 id={`${ids}-title`}>{badge.heading}</h2>
        {img ? (
          <img className="ci-lj-badge-img" src={img} width={W} height={H} alt={badge.text} />
        ) : (
          <p className="ci-lj-badge-text">{badge.text}</p>
        )}
        <label className="ci-course-kicker" htmlFor={`${ids}-text`}>
          The words to post with it
        </label>
        <textarea
          id={`${ids}-text`}
          ref={text}
          className="ci-lj-badge-copy"
          readOnly
          rows={3}
          value={badge.text}
        />
        <p className="ci-lj-note" role="status" aria-live="polite">
          {copied === 'ok'
            ? '✓ Copied.'
            : copied === 'select'
              ? 'Selected: press Ctrl+C (or Cmd+C) to copy it.'
              : 'Made on this device. Nothing is uploaded: save the picture or copy the words, and post them where you like.'}
        </p>
        <footer className="ci-lj-actions">
          {img && (
            <a className="ci-btn ghost ci-lj-btn" href={img} download={file}>
              Save the picture
            </a>
          )}
          <button type="button" className="ci-btn ghost ci-lj-btn" onClick={() => void copy()}>
            Copy the words
          </button>
          <button
            type="button"
            className="ci-btn primary ci-lj-btn"
            data-initial-focus="true"
            onClick={store.closeBadge}
          >
            <kbd>E</kbd> Onward
          </button>
        </footer>
      </section>
    </div>
  );
}

// ---- Where you left off ----

export function ResumeCard({ store, resume }: { store: LearnStore; resume: ResumeSummary }) {
  const root = useRef<HTMLElement>(null);
  const ids = useId();
  useCardKeys(store.closeResume, store.closeResume);
  usePadFocus(root, store.closeResume);
  useInitialFocus(root, resume.island);
  const openApp = () => {
    store.closeResume();
    store.openLogbook('app');
  };
  return (
    <div className="ci-learn-backdrop">
      <section
        ref={root}
        className="ci-lj-card ci-lj-resume"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${ids}-title`}
      >
        <p className="ci-page-kicker">
          <span aria-hidden>🦜</span> Welcome back{resume.ago ? ` · ${resume.ago}` : ''}
        </p>
        <h2 id={`${ids}-title`}>Where you left off</h2>
        <dl className="ci-lj-rows">
          <div>
            <dt>Where</dt>
            <dd>
              {resume.island} · {resume.chapter}
            </dd>
          </div>
          {resume.task && (
            <div>
              <dt>Your task</dt>
              <dd>
                <strong>{resume.task.title}</strong>: <Rich text={resume.task.task} />
              </dd>
            </div>
          )}
          {resume.learned && (
            <div>
              <dt>Last thing you learned</dt>
              <dd>
                <Rich text={resume.learned} />
              </dd>
            </div>
          )}
          {resume.next && (
            <div>
              <dt>Next</dt>
              <dd>
                <Rich text={resume.next} />
              </dd>
            </div>
          )}
        </dl>
        {resume.later > 0 && (
          <p className="ci-lj-note">
            {resume.later === 1 ? 'One step' : `${resume.later} steps`} for{' '}
            {LEARNING.file.labels.tool || 'the app'} {resume.later === 1 ? 'waits' : 'wait'} in your{' '}
            {LEARNING.file.labels.checklist || 'checklist'}, whenever you’re ready.
          </p>
        )}
        <footer className="ci-lj-actions">
          {resume.later > 0 && (
            <button type="button" className="ci-btn ghost ci-lj-btn" onClick={openApp}>
              Open the {LEARNING.file.labels.checklist || 'checklist'}
            </button>
          )}
          <button
            type="button"
            className="ci-btn primary ci-lj-btn"
            data-initial-focus="true"
            onClick={store.closeResume}
          >
            <kbd>E</kbd> Onward
          </button>
        </footer>
      </section>
    </div>
  );
}
