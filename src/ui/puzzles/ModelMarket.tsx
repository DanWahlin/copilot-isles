import { useEffect, useRef, useSyncExternalStore, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import paperUrl from '../../game/chart-label/paper.webp';
import { CATEGORIES, type ModelCategory } from '../../game/market/catalog';
import {
  AUTO_PRICE,
  CATEGORY_PRICE,
  EFFORTS,
  EFFORT_LABEL,
  EFFORT_PRICE,
  GILDA_TEXT,
  JOBS,
  QUOTES,
  jobById,
  price,
  type CourseQuote,
  type Effort,
  type Feedback,
  type Hire,
  type JobId,
} from '../../game/market/jobs';
import { boardOf, modelsIn } from '../../game/market/models';
import { isTyping } from '../typing';
import './model-market.css';

/** The hire being filled in on the work order: Auto, or a model of a category with an effort. */
export interface MarketDraft {
  auto: boolean;
  category: ModelCategory;
  model: string;
  effort: Effort;
}

export interface MarketResult {
  job: JobId;
  hire: Hire;
  feedback: Feedback;
  paid: number;
  refund: number;
  doubloons: number;
}

/** What the Model Market overlay shows (docs/specs/MODEL-MARKET.md §6). */
export interface MarketView {
  open: boolean;
  screen: 'board' | 'hire' | 'result';
  /** Starfish to spend. */
  purse: number;
  /** Each job on the board: done right-sized, and the last hire for it (as it reads now). */
  jobs: readonly { id: JobId; done: boolean; last: string | null }[];
  job: JobId | null;
  draft: MarketDraft;
  /** This hire is a Retry of the last one (same job, no new prompt). */
  retry: boolean;
  result: MarketResult | null;
  /** The board's job the keys and the pad are on. */
  focus: number;
  /** A category whose "+N more" is open on the board. */
  more: ModelCategory | null;
  /** Wingman's second hint: the pick (and effort) that fits the job. */
  hint: { pick: 'auto' | ModelCategory; effort: Effort | null } | null;
  /** A short line under the work order (not enough starfish, a Retry). */
  notice: string | null;
  /** Gilda's last line, written on the work order while she says it (the HUD captions step aside). */
  says: string | null;
  reduced: boolean;
}

export interface MarketActions {
  pickJob(id: JobId): void;
  focusJob(i: number): void;
  pick(p: 'auto' | ModelCategory): void;
  /** Steps through the category's models (or sets one). */
  model(step: number | string): void;
  /** Steps the effort dial (or sets it). */
  effort(step: number | Effort): void;
  pay(): void;
  retry(kind: 'model' | 'effort'): void;
  more(c: ModelCategory | null): void;
  back(): void;
  close(): void;
}

export interface MarketStore {
  get(): MarketView;
  subscribe(fn: () => void): () => void;
  actions: MarketActions;
  /** A learning overlay (the Logbook, a quiz, the fork form) is up: it has the keys and the pad. */
  blocked(): boolean;
}

/** The hire a draft stands for. */
export const draftHire = (d: MarketDraft): Hire =>
  d.auto ? { auto: true } : { auto: false, category: d.category, model: d.model, effort: d.effort };

const PICKS: readonly ('auto' | ModelCategory)[] = ['auto', ...CATEGORIES];
const SIZE_WORD: Readonly<Record<ModelCategory, string>> = {
  Lightweight: 'Small',
  Versatile: 'Medium',
  Powerful: 'Large',
};
const TAGLINE: Readonly<Record<ModelCategory, string>> = {
  Lightweight: 'Quick looks and short answers',
  Versatile: 'Everyday coding and agent work',
  Powerful: 'Hard bugs and big changes',
};
const SIZE_LABEL = { quick: 'Quick look', hard: 'Hard job' } as const;

/** `**bold**` spans as <b>. */
function Bold({ text }: { text: string }) {
  return (
    <>
      {text
        .split(/(\*\*[^*]+\*\*)/)
        .map((part, i) =>
          part.startsWith('**') ? <b key={i}>{part.slice(2, -2)}</b> : <span key={i}>{part}</span>,
        )}
    </>
  );
}

const plain = (s: string) => s.replace(/\*\*/g, '');

function Star({ n }: { n: number }) {
  return (
    <span className="ci-mm-price" aria-label={`${n} starfish`}>
      {n}
      <span aria-hidden="true"> ★</span>
    </span>
  );
}

function Quote({ q }: { q: CourseQuote }) {
  return (
    <blockquote className="ci-mm-quote">
      <p>
        “<Bold text={q.text} />”
      </p>
      <cite>Course Chapter 01 · {q.section}</cite>
    </blockquote>
  );
}

/** Stars for a category's size (one, two or three), so colour isn't the only cue. */
function SizeStars({ c }: { c: ModelCategory }) {
  const n = CATEGORIES.indexOf(c) + 1;
  return (
    <span className="ci-mm-size" aria-label={`${SIZE_WORD[c]} model`}>
      <span aria-hidden="true">
        {'■'.repeat(n)}
        {'□'.repeat(3 - n)}
      </span>
    </span>
  );
}

function Says({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <p className="ci-mm-gilda">
      <b>Gilda:</b> “{text}”
    </p>
  );
}

function Header({
  v,
  title,
  onClose,
  sub,
}: {
  v: MarketView;
  title: string;
  onClose: () => void;
  sub?: ReactNode;
}) {
  return (
    <header className="ci-mm-head">
      <div>
        <h2 id="ci-mm-title">{title}</h2>
        {sub && <p className="ci-mm-sub">{sub}</p>}
      </div>
      <span className="ci-mm-purse" aria-label={`${v.purse} starfish to spend`}>
        <span aria-hidden="true">★</span> {v.purse} to spend
      </span>
      <button
        type="button"
        className="ci-mm-close"
        aria-label="Step away from the stall (Esc)"
        onClick={onClose}
      >
        ✕
      </button>
    </header>
  );
}

function Board({ v, a }: { v: MarketView; a: MarketActions }) {
  return (
    <>
      <Header
        v={v}
        title="Gilda’s Model Market"
        sub="Hire a model for the job. Bigger models cost more starfish."
        onClose={a.close}
      />
      <p className="ci-mm-special">
        <b>House special: Auto</b> · <Star n={AUTO_PRICE} /> · the app chooses a model for your task.
      </p>
      <div className="ci-mm-boards">
        {CATEGORIES.map((c) => {
          const b = boardOf(c);
          const open = v.more === c;
          return (
            <section key={c} className={`ci-mm-board is-${c.toLowerCase()}`} aria-labelledby={`ci-mm-b-${c}`}>
              <h3 id={`ci-mm-b-${c}`}>
                {c} <SizeStars c={c} />
              </h3>
              <p className="ci-mm-tag">
                {TAGLINE[c]} · <Star n={CATEGORY_PRICE[c]} />
              </p>
              <ul>
                {(open ? [...b.shown, ...b.more] : b.shown).map((m) => (
                  <li key={m.name}>
                    {m.name}
                    {!m.ga && <span className="ci-mm-preview"> (preview)</span>}
                  </li>
                ))}
              </ul>
              {b.more.length > 0 && (
                <button
                  type="button"
                  className="ci-mm-more"
                  aria-expanded={open}
                  onClick={() => a.more(open ? null : c)}
                >
                  {open ? 'Show fewer' : `+${b.more.length} more`}
                </button>
              )}
            </section>
          );
        })}
      </div>
      <section className="ci-mm-jobs" aria-labelledby="ci-mm-jobs-title">
        <h3 id="ci-mm-jobs-title">Jobs board: pick one</h3>
        <ol>
          {JOBS.map((j, i) => {
            const s = v.jobs.find((x) => x.id === j.id);
            return (
              <li key={j.id}>
                <button
                  type="button"
                  data-job={j.id}
                  className={`ci-mm-job${i === v.focus ? ' is-focus' : ''}${s?.done ? ' is-done' : ''}`}
                  onFocus={() => i !== v.focus && a.focusJob(i)}
                  onClick={() => a.pickJob(j.id)}
                >
                  <kbd aria-hidden="true">{i + 1}</kbd>
                  <span className="ci-mm-job-text">
                    <span className="ci-mm-job-size">{SIZE_LABEL[j.size]}</span>
                    <span className="ci-mm-job-title">{j.title}</span>
                    {s?.done && <span className="ci-mm-job-done">✓ Done right-sized</span>}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </section>
      <Says text={v.says} />
      {v.purse === 0 && v.says !== GILDA_TEXT['mer.market.broke'] && (
        <p className="ci-mm-notice">{GILDA_TEXT['mer.market.broke']}</p>
      )}
      <footer className="ci-mm-foot">
        <Quote q={QUOTES.cost} />
        <p className="ci-mm-help" aria-hidden="true">
          <kbd>1</kbd>–<kbd>4</kbd> pick a job · <kbd>Esc</kbd> step away
        </p>
      </footer>
    </>
  );
}

/** The effort dial: a gauge whose needle points at the level (the buttons beside it set it). */
function Dial({ effort, off }: { effort: Effort; off: boolean }) {
  const angle = off ? 0 : [-55, 0, 55][EFFORTS.indexOf(effort)]!;
  return (
    <svg className={`ci-mm-dial${off ? ' is-off' : ''}`} viewBox="-60 -56 120 66" aria-hidden="true">
      <path d="M-46 0 A46 46 0 0 1 -26.4 -37.7" className="seg low" />
      <path d="M-23 -39.8 A46 46 0 0 1 23 -39.8" className="seg mid" />
      <path d="M26.4 -37.7 A46 46 0 0 1 46 0" className="seg high" />
      <g style={{ transform: `rotate(${angle}deg)` }} className="needle">
        <line x1="0" y1="0" x2="0" y2="-38" />
      </g>
      <circle r="6" />
    </svg>
  );
}

function HireStep({ v, a }: { v: MarketView; a: MarketActions }) {
  const job = jobById(v.job ?? '')!;
  const d = v.draft;
  const hire = draftHire(d);
  const cost = price(hire);
  const short = cost > v.purse;
  const models = modelsIn(d.category);
  const pickPrice = (p: 'auto' | ModelCategory) => (p === 'auto' ? AUTO_PRICE : CATEGORY_PRICE[p]);
  const isHint = (p: 'auto' | ModelCategory) => v.hint?.pick === p;
  return (
    <>
      <Header v={v} title="Who’ll take the job?" onClose={a.close} />
      <div className="ci-mm-hire">
        <div className="ci-mm-order">
          <article className="ci-mm-ticket">
            <p className="ci-mm-eyebrow">
              Work order · {SIZE_LABEL[job.size]}
              {v.retry && ' · Retry'}
            </p>
            <p className="ci-mm-ticket-title">{job.title}</p>
            <p className="ci-mm-ticket-brief">{job.brief}</p>
          </article>
          <h3 className="ci-mm-step">What the course says</h3>
          <Quote q={job.why} />
          <dl className="ci-mm-tally">
            <dt>{d.auto ? 'Auto' : d.model}</dt>
            <dd>
              <Star n={d.auto ? AUTO_PRICE : CATEGORY_PRICE[d.category]} />
            </dd>
            <dt>{d.auto ? 'Effort (hidden with Auto)' : `${EFFORT_LABEL[d.effort]} effort`}</dt>
            <dd>
              {d.auto ? '+0' : `+${Math.min(EFFORT_PRICE[d.effort], cost - CATEGORY_PRICE[d.category])}`}
            </dd>
            <dt className="total">Total</dt>
            <dd className="total">
              <Star n={cost} />
            </dd>
          </dl>
          <p className="ci-mm-left">
            Your purse: {v.purse} starfish → {short ? 'not enough' : `${v.purse - cost} left`}
          </p>
          {v.notice && <p className="ci-mm-notice">{v.notice}</p>}
          <Says text={v.says} />
        </div>
        <div className="ci-mm-controls">
          <h3 className="ci-mm-step">1 · Pick a model</h3>
          <div className="ci-mm-picks" role="radiogroup" aria-label="Model">
            {PICKS.map((p, i) => {
              const on = p === 'auto' ? d.auto : !d.auto && d.category === p;
              return (
                <button
                  key={p}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  data-pick={p}
                  className={`ci-mm-pick is-${p.toLowerCase()}${on ? ' is-on' : ''}${isHint(p) ? ' is-hint' : ''}`}
                  onClick={() => a.pick(p)}
                >
                  <kbd aria-hidden="true">{i + 1}</kbd>
                  <span>{p === 'auto' ? 'Auto' : p}</span>
                  <Star n={pickPrice(p)} />
                </button>
              );
            })}
          </div>
          {d.auto ? (
            <div className="ci-mm-auto">
              <Quote q={QUOTES.auto} />
              <Quote q={QUOTES.autopilot} />
            </div>
          ) : (
            <ul className="ci-mm-models" role="radiogroup" aria-label={`${d.category} models`}>
              {models.map((m) => (
                <li key={m.name}>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={m.name === d.model}
                    className={m.name === d.model ? 'is-on' : ''}
                    onClick={() => a.model(m.name)}
                  >
                    <span className="name">
                      {m.name}
                      {!m.ga && ' (preview)'}
                    </span>
                    {m.taskArea && <span className="area">{m.taskArea}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <h3 className="ci-mm-step">2 · Set the effort dial</h3>
          <div className="ci-mm-effort">
            <Dial effort={d.effort} off={d.auto} />
            <div className="ci-mm-levels" role="radiogroup" aria-label="Reasoning effort">
              {EFFORTS.map((e) => (
                <button
                  key={e}
                  type="button"
                  role="radio"
                  aria-checked={!d.auto && d.effort === e}
                  disabled={d.auto}
                  data-effort={e}
                  className={`${!d.auto && d.effort === e ? 'is-on' : ''}${v.hint?.effort === e ? ' is-hint' : ''}`}
                  onClick={() => a.effort(e)}
                >
                  <span>{EFFORT_LABEL[e]}</span>
                  <span className="cost">+{EFFORT_PRICE[e]} ★</span>
                </button>
              ))}
            </div>
          </div>
          <Quote q={d.auto ? QUOTES.autoHidden : QUOTES.effort} />
          <div className="ci-mm-actions">
            <button type="button" className="ci-mm-btn" onClick={a.back}>
              <kbd aria-hidden="true">Esc</kbd> Back to the board
            </button>
            <button
              type="button"
              className="ci-mm-btn primary"
              data-primary
              aria-disabled={short}
              onClick={a.pay}
            >
              {short ? `You need ${cost} starfish` : `Sign & pay ${cost} ★`}
            </button>
          </div>
          {short && (
            <p className="ci-mm-notice">
              You’ve got {v.purse}. Auto and Lightweight cost {AUTO_PRICE}, or find more starfish round the
              islands.
            </p>
          )}
          <p className="ci-mm-help" aria-hidden="true">
            <kbd>1</kbd>–<kbd>4</kbd> model · <kbd>↑</kbd>
            <kbd>↓</kbd> name · <kbd>←</kbd>
            <kbd>→</kbd> effort · <kbd>E</kbd> sign &amp; pay
          </p>
        </div>
      </div>
    </>
  );
}

function Result({ v, a }: { v: MarketView; a: MarketActions }) {
  const r = v.result!;
  const job = jobById(r.job)!;
  const f = r.feedback;
  const who = r.hire.auto ? 'Auto' : `${r.hire.model} · ${EFFORT_LABEL[r.hire.effort]} effort`;
  return (
    <>
      <Header v={v} title={job.title} onClose={a.close} sub={`Work order · ${SIZE_LABEL[job.size]}`} />
      <div className="ci-mm-result">
        <p className={`ci-mm-stamp is-${f.outcome}`} aria-hidden="true">
          {f.stamp}
        </p>
        <p className="ci-mm-hired">
          Hired {who} · paid <Star n={r.paid} />
        </p>
        <p className="ci-mm-summary">{f.summary}</p>
        <h3 className="ci-mm-step">Gilda says</h3>
        <p className="ci-mm-says">“{v.says ?? GILDA_TEXT[f.line]}”</p>
        {f.quotes.map((q) => (
          <Quote key={q.text} q={q} />
        ))}
        <p className="ci-mm-reward">
          {r.refund > 0
            ? `Right-sized: ${r.refund} starfish back${r.doubloons ? ` and ${r.doubloons} doubloons` : ''}.`
            : f.outcome === 'over'
              ? 'Job done, no refund: you paid for more than it needed.'
              : 'No refund. Retry costs a new hire, but you won’t write the job again.'}
        </p>
        <div className="ci-mm-actions">
          {f.outcome === 'short' ? (
            <>
              <button type="button" className="ci-mm-btn" data-retry="model" onClick={() => a.retry('model')}>
                <kbd aria-hidden="true">R</kbd> Retry: a different model
              </button>
              <button
                type="button"
                className="ci-mm-btn primary"
                data-primary
                data-retry="effort"
                onClick={() => a.retry('effort')}
              >
                <kbd aria-hidden="true">E</kbd> Retry: more effort
              </button>
            </>
          ) : (
            <button type="button" className="ci-mm-btn primary" data-primary onClick={a.back}>
              <kbd aria-hidden="true">E</kbd> Got it
            </button>
          )}
        </div>
      </div>
    </>
  );
}

/** What a screen reader hears on each screen (and on each outcome). */
function announce(v: MarketView): string {
  if (v.screen === 'result' && v.result) {
    const f = v.result.feedback;
    return `${plain(f.stamp.replace(/^\W+\s*/, ''))}. ${f.summary} Gilda says: ${v.says ?? GILDA_TEXT[f.line]}`;
  }
  if (v.screen === 'hire' && v.job) {
    const cost = price(draftHire(v.draft));
    const pick = v.draft.auto ? 'Auto' : `${v.draft.model}, ${EFFORT_LABEL[v.draft.effort]} effort`;
    return `${v.notice ? `${v.notice} ` : ''}${jobById(v.job)!.title}. ${pick}: ${cost} starfish. You have ${v.purse}.`;
  }
  return `Gilda’s Model Market. You have ${v.purse} starfish to spend. Pick a job, 1 to 4.${v.says ? ` Gilda says: ${v.says}` : ''}`;
}

const UP = new Set(['ArrowUp', 'KeyW']);
const DOWN = new Set(['ArrowDown', 'KeyS']);
const LEFT = new Set(['ArrowLeft', 'KeyA']);
const RIGHT = new Set(['ArrowRight', 'KeyD']);

function Market({ store }: { store: MarketStore }) {
  const v = useSyncExternalStore(store.subscribe, store.get);
  const panel = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!v.open) return;
    const key = (e: KeyboardEvent) => {
      if (isTyping(e) || store.blocked()) return;
      // A held key acts once (the dial and the names step on with arrow repeats).
      if (e.repeat && !UP.has(e.code) && !DOWN.has(e.code) && !LEFT.has(e.code) && !RIGHT.has(e.code)) {
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }
      const s = store.get();
      const a = store.actions;
      let handled = true;
      const digit = /^(?:Digit|Numpad)([1-4])$/.exec(e.code);
      const activate = () => {
        // E, Enter and Space press the button that has focus, or the screen's main one.
        const el = document.activeElement;
        const target =
          el instanceof HTMLButtonElement && panel.current?.contains(el)
            ? el
            : panel.current?.querySelector<HTMLButtonElement>('[data-primary]');
        target?.click();
      };
      if (e.code === 'Escape' || (e.code === 'Backspace' && s.screen !== 'board')) {
        if (s.screen === 'board') a.close();
        else a.back();
      } else if (e.code === 'KeyJ') {
        // The Logbook waits until you step away (it'd open under the stall's work order).
      } else if (s.screen === 'board') {
        if (digit) a.pickJob(JOBS[Number(digit[1]) - 1]!.id);
        else if (UP.has(e.code) || LEFT.has(e.code)) a.focusJob((s.focus + JOBS.length - 1) % JOBS.length);
        else if (DOWN.has(e.code) || RIGHT.has(e.code)) a.focusJob((s.focus + 1) % JOBS.length);
        else if (e.code === 'Enter' || e.code === 'Space' || e.code === 'KeyE') {
          const el = document.activeElement;
          if (el instanceof HTMLButtonElement && panel.current?.contains(el) && !el.dataset.job) el.click();
          else a.pickJob(JOBS[s.focus]!.id);
        } else handled = false;
      } else if (s.screen === 'hire') {
        if (digit) a.pick(PICKS[Number(digit[1]) - 1]!);
        else if (UP.has(e.code)) a.model(-1);
        else if (DOWN.has(e.code)) a.model(1);
        else if (LEFT.has(e.code)) a.effort(-1);
        else if (RIGHT.has(e.code)) a.effort(1);
        else if (e.code === 'Enter' || e.code === 'Space' || e.code === 'KeyE') activate();
        else handled = false;
      } else if (s.screen === 'result') {
        if (e.code === 'KeyR' && s.result?.feedback.outcome === 'short') a.retry('model');
        else if (e.code === 'Enter' || e.code === 'Space' || e.code === 'KeyE') activate();
        else handled = false;
      }
      if (!handled) return;
      e.preventDefault();
      e.stopImmediatePropagation();
    };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  }, [v.open, store]);
  useEffect(() => {
    document.body.classList.toggle('ci-cr-open', v.open);
    document.body.classList.toggle('ci-mm-open', v.open);
    if (!v.open && document.activeElement instanceof HTMLElement) document.activeElement.blur();
    return () => document.body.classList.remove('ci-cr-open', 'ci-mm-open');
  }, [v.open]);
  // Keyboard and pad focus follow each other: the board's job, or the screen's main button.
  useEffect(() => {
    if (!v.open || !panel.current) return;
    const el =
      v.screen === 'board'
        ? panel.current.querySelector<HTMLButtonElement>(`[data-job="${JOBS[v.focus]?.id}"]`)
        : panel.current.querySelector<HTMLButtonElement>('[data-primary]');
    if (el && document.activeElement !== el) el.focus({ preventScroll: true });
  }, [v.open, v.screen, v.focus, v.draft, v.result]);
  if (!v.open) return null;
  const a = store.actions;
  return (
    <div
      className={`ci-mm${v.reduced ? ' is-reduced' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="ci-mm-title"
      style={{ ['--mm-paper' as string]: `url(${paperUrl})` }}
    >
      <section ref={panel} className={`ci-mm-panel is-${v.screen}`}>
        {v.screen === 'board' && <Board v={v} a={a} />}
        {v.screen === 'hire' && <HireStep v={v} a={a} />}
        {v.screen === 'result' && <Result v={v} a={a} />}
        <div className="ci-mm-live" role="status" aria-live="polite">
          {announce(v)}
        </div>
      </section>
    </div>
  );
}

export function mountModelMarket(store: MarketStore): () => void {
  const el = document.createElement('div');
  el.className = 'ci-cr-root ci-mm-root';
  document.body.appendChild(el);
  const root = createRoot(el);
  root.render(<Market store={store} />);
  return () => {
    root.unmount();
    el.remove();
  };
}
