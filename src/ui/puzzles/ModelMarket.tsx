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
  JOBS,
  QUOTES,
  TIER_OF,
  SIZE_LABEL,
  effortLastTime,
  jobById,
  marketText as T,
  price,
  usedLastTime,
  type CourseQuote,
  type Effort,
  type Feedback,
  type Hire,
  type JobId,
  type RetryPlan,
} from '../../game/market/jobs';
import { boardOf, modelsIn } from '../../game/market/models';
import { MARKET, type GildaKey } from '../../content/market';
import { Bold } from '../components/Bold';
import { isTyping } from '../typing';
import './model-market.css';

/** The hire being filled in on the work order: Auto, or a model of a category with an effort. */
export interface MarketDraft {
  auto: boolean;
  category: ModelCategory;
  model: string;
  effort: Effort;
  /**
   * A Retry's picker with nothing chosen in it yet (the models', or the effort dial's): you choose
   * before you can sign. Null once chosen (or on a new work order).
   */
  pending: 'model' | 'effort' | null;
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
  /** Who keeps this stall (the work order's name, and who "says"). */
  keeper: string;
  /** What this stall's keeper says at each moment (their own words). */
  lines: Readonly<Record<GildaKey, string>>;
  screen: 'board' | 'hire' | 'result';
  /** Starfish to spend. */
  purse: number;
  /** Each job on the board: done right-sized, and the last hire for it (as it reads now). */
  jobs: readonly { id: JobId; done: boolean; last: string | null }[];
  job: JobId | null;
  draft: MarketDraft;
  /** This hire is a Retry of the last one (same job, no new prompt), and what it's about. */
  retry: RetryPlan | null;
  result: MarketResult | null;
  /** The board's job the keys and the pad are on. */
  focus: number;
  /** A category whose "+N more" is open on the board. */
  more: ModelCategory | null;
  /** Wingman's second hint: the pick (and effort) that fits the job. */
  hint: { pick: 'auto' | ModelCategory; effort: Effort | null } | null;
  /** A short line under the work order (not enough starfish, a Retry). */
  notice: string | null;
  /** The keeper's last line, written on the work order while they say it (the HUD captions step aside). */
  says: string | null;
  reduced: boolean;
  /**
   * The course's model lesson's practice at this stall (the quest's), while it runs: a quick look
   * right-sized, and a Retry of a hard job. Null otherwise.
   */
  practice: { quick: boolean; retry: boolean } | null;
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
const categoryData = (c: ModelCategory) => MARKET.categories.find((x) => x.id === c)!;

const plain = (s: string) => s.replace(/\*\*/g, '');

function Star({ n }: { n: number }) {
  return (
    <span className="ci-mm-price" aria-label={T('starfish', { n })}>
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
      <cite>{T('cite', { chapter: q.source.chapter.slice(0, 2), section: q.section })}</cite>
    </blockquote>
  );
}

/** Stars for a category's size (one, two or three), so colour isn't the only cue. */
function SizeStars({ c }: { c: ModelCategory }) {
  const n = CATEGORIES.indexOf(c) + 1;
  return (
    <span className="ci-mm-size" aria-label={T('sizeModel', { size: categoryData(c).size })}>
      <span aria-hidden="true">
        {'■'.repeat(n)}
        {'□'.repeat(3 - n)}
      </span>
    </span>
  );
}

function Says({ text, keeper }: { text: string | null; keeper: string }) {
  if (!text) return null;
  return (
    <p className="ci-mm-gilda">
      <b>{T('speaker', { keeper })}</b> {T('says', { text })}
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
      <span className="ci-mm-purse" aria-label={T('purseLabel', { n: v.purse })}>
        <span aria-hidden="true">★</span> {T('purse', { n: v.purse })}
      </span>
      <button type="button" className="ci-mm-close" aria-label={T('close')} onClick={onClose}>
        ✕
      </button>
    </header>
  );
}

function Board({ v, a }: { v: MarketView; a: MarketActions }) {
  return (
    <>
      <Header v={v} title={T('title', { keeper: v.keeper })} sub={T('sub')} onClose={a.close} />
      <p className="ci-mm-special">
        <b>{T('special')}</b> · <Star n={AUTO_PRICE} /> · {T('specialText')}
      </p>
      <div className="ci-mm-boards">
        {CATEGORIES.map((c) => {
          const b = boardOf(c);
          const open = v.more === c;
          return (
            <section key={c} className={`ci-mm-board is-${TIER_OF[c]}`} aria-labelledby={`ci-mm-b-${c}`}>
              <h3 id={`ci-mm-b-${c}`}>
                {c} <SizeStars c={c} />
              </h3>
              <p className="ci-mm-tag">
                {categoryData(c).tagline} · <Star n={CATEGORY_PRICE[c]} />
              </p>
              <ul>
                {(open ? [...b.shown, ...b.more] : b.shown).map((m) => (
                  <li key={m.name}>
                    {m.name}
                    {!m.ga && <span className="ci-mm-preview">{T('preview')}</span>}
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
                  {open ? T('fewer') : T('more', { n: b.more.length })}
                </button>
              )}
            </section>
          );
        })}
      </div>
      <section className="ci-mm-jobs" aria-labelledby="ci-mm-jobs-title">
        <h3 id="ci-mm-jobs-title">{T('jobs')}</h3>
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
                    {s?.done && <span className="ci-mm-job-done">{T('doneRight')}</span>}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </section>
      {v.practice && <Practice p={v.practice} />}
      <Says text={v.says} keeper={v.keeper} />
      {v.notice && <p className="ci-mm-notice">{v.notice}</p>}
      {v.purse === 0 && v.says !== v.lines.broke && <p className="ci-mm-notice">{v.lines.broke}</p>}
      <footer className="ci-mm-foot">
        <Quote q={QUOTES.cost} />
        <p className="ci-mm-help" aria-hidden="true">
          <kbd>1</kbd>–<kbd>4</kbd> pick a job · <kbd>Esc</kbd> step away
        </p>
      </footer>
    </>
  );
}

/** The lesson's practice: what's left to do at this stall (a tick and the words, never colour alone). */
function Practice({ p }: { p: { quick: boolean; retry: boolean } }) {
  const item = (done: boolean, text: string) => (
    <li className={done ? 'is-done' : undefined}>
      <span aria-hidden="true">{done ? '✓' : '○'}</span> {text}
      {done && <span className="ci-sr">{T('practiceDone')}</span>}
    </li>
  );
  return (
    <section className="ci-mm-practice" aria-labelledby="ci-mm-practice-title">
      <h3 id="ci-mm-practice-title">{T('practiceHead')}</h3>
      <ul>
        {item(p.quick, T('practiceQuick'))}
        {item(p.retry, T('practiceRetry'))}
      </ul>
    </section>
  );
}

/** The effort dial: a gauge whose needle points at the level (the buttons beside it set it). */
function Dial({ effort, off }: { effort: Effort; off: boolean }) {
  // Off (Auto, or a Retry's dial with nothing chosen): the needle rests upright, the gauge greyed.
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
  const plan = v.retry;
  const noModel = d.pending === 'model';
  const noEffort = d.pending === 'effort';
  const hire = draftHire(d);
  const cost = d.pending ? 0 : price(hire);
  const short = !d.pending && cost > v.purse;
  const models = noModel ? [] : modelsIn(d.category);
  const pickPrice = (p: 'auto' | ModelCategory) => (p === 'auto' ? AUTO_PRICE : CATEGORY_PRICE[p]);
  const isHint = (p: 'auto' | ModelCategory) => v.hint?.pick === p;
  const lastModel = plan && !plan.last.auto ? plan.last.model : null;
  return (
    <>
      <Header v={v} title={T('hireTitle')} onClose={a.close} />
      <div className="ci-mm-hire">
        <div className="ci-mm-order">
          <article className="ci-mm-ticket">
            <p className="ci-mm-eyebrow">
              {T('workOrder', { size: SIZE_LABEL[job.size] })}
              {plan && T('retryTag')}
            </p>
            <p className="ci-mm-ticket-title">{job.title}</p>
            <p className="ci-mm-ticket-brief">{job.brief}</p>
          </article>
          <h3 className="ci-mm-step">{T('courseSays')}</h3>
          <Quote q={job.why} />
          {job.also.map((q) => (
            <Quote key={q.text} q={q} />
          ))}
          <dl className="ci-mm-tally">
            <dt>{d.auto ? T('auto') : noModel ? T('chooseModel') : d.model}</dt>
            <dd>{noModel ? '—' : <Star n={d.auto ? AUTO_PRICE : CATEGORY_PRICE[d.category]} />}</dd>
            <dt>
              {d.auto
                ? T('effortHidden')
                : noEffort
                  ? T('chooseEffort')
                  : T('effort', { effort: EFFORT_LABEL[d.effort] })}
            </dt>
            <dd>
              {d.auto
                ? '+0'
                : d.pending
                  ? '—'
                  : `+${Math.min(EFFORT_PRICE[d.effort], cost - CATEGORY_PRICE[d.category])}`}
            </dd>
            <dt className="total">{T('total')}</dt>
            <dd className="total">{d.pending ? '—' : <Star n={cost} />}</dd>
          </dl>
          <p className="ci-mm-left">
            {d.pending
              ? T('leftPending', { n: v.purse })
              : T('left', {
                  n: v.purse,
                  rest: short ? T('notEnough') : T('leftOver', { n: v.purse - cost }),
                })}
          </p>
          {v.notice && <p className="ci-mm-notice">{v.notice}</p>}
          <Says text={v.says} keeper={v.keeper} />
        </div>
        <div className="ci-mm-controls">
          <h3 className="ci-mm-step">{T('step1')}</h3>
          <div
            className={`ci-mm-picks${noModel ? ' is-live' : ''}`}
            role="radiogroup"
            aria-label={T('modelGroup')}
            data-live={noModel || undefined}
          >
            {PICKS.map((p, i) => {
              const on = !noModel && (p === 'auto' ? d.auto : !d.auto && d.category === p);
              const used = !!plan && p === 'auto' && usedLastTime(plan, 'auto');
              return (
                <button
                  key={p}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  aria-disabled={used || undefined}
                  aria-label={used ? T('usedLabel', { name: T('auto') }) : undefined}
                  data-pick={p}
                  className={`ci-mm-pick is-${p === 'auto' ? 'auto' : TIER_OF[p]}${on ? ' is-on' : ''}${isHint(p) ? ' is-hint' : ''}${used ? ' is-used' : ''}`}
                  onClick={() => a.pick(p)}
                >
                  <kbd aria-hidden="true">{i + 1}</kbd>
                  <span>{p === 'auto' ? T('auto') : p}</span>
                  {used ? <span className="ci-mm-last">{T('lastTime')}</span> : <Star n={pickPrice(p)} />}
                </button>
              );
            })}
          </div>
          {noModel ? (
            <p className="ci-mm-choose">
              {lastModel ? T('retryPickModel', { model: lastModel }) : T('retryPickAfterAuto')}
            </p>
          ) : d.auto ? (
            <div className="ci-mm-auto">
              <Quote q={QUOTES.auto} />
              <Quote q={QUOTES.autoAside} />
            </div>
          ) : (
            <ul
              className="ci-mm-models"
              role="radiogroup"
              aria-label={T('categoryModels', { category: d.category })}
            >
              {models.map((m) => {
                const used = !!plan && usedLastTime(plan, d.category, m.name);
                return (
                  <li key={m.name}>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={m.name === d.model}
                      aria-disabled={used || undefined}
                      aria-label={used ? T('usedLabel', { name: m.name }) : undefined}
                      className={`${m.name === d.model ? 'is-on' : ''}${used ? ' is-used' : ''}`}
                      onClick={() => a.model(m.name)}
                    >
                      <span className="name">
                        {m.name}
                        {!m.ga && T('preview')}
                      </span>
                      {used ? (
                        <span className="area">{T('lastTime')}</span>
                      ) : (
                        m.taskArea && <span className="area">{m.taskArea}</span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <h3 className="ci-mm-step">{T('step2')}</h3>
          <div className={`ci-mm-effort${noEffort ? ' is-live' : ''}`}>
            <Dial effort={d.effort} off={d.auto || noEffort} />
            <div
              className="ci-mm-levels"
              role="radiogroup"
              aria-label={T('effortGroup')}
              data-live={noEffort || undefined}
            >
              {EFFORTS.map((e) => {
                const on = !d.auto && !noEffort && d.effort === e;
                const used = !!plan && !d.auto && effortLastTime(plan, d.model, e);
                return (
                  <button
                    key={e}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    aria-disabled={used || undefined}
                    aria-label={used ? T('usedLabel', { name: EFFORT_LABEL[e] }) : undefined}
                    disabled={d.auto}
                    data-effort={e}
                    className={`${on ? 'is-on' : ''}${v.hint?.effort === e ? ' is-hint' : ''}${used ? ' is-used' : ''}`}
                    onClick={() => a.effort(e)}
                  >
                    <span>{EFFORT_LABEL[e]}</span>
                    <span className="cost">{used ? T('lastTime') : `+${EFFORT_PRICE[e]} ★`}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <Quote q={d.auto ? QUOTES.autoHidden : QUOTES.effort} />
          <div className="ci-mm-actions">
            <button type="button" className="ci-mm-btn" onClick={a.back}>
              <kbd aria-hidden="true">Esc</kbd> {T('back')}
            </button>
            <button
              type="button"
              className="ci-mm-btn primary"
              data-primary
              aria-disabled={short || !!d.pending}
              onClick={a.pay}
            >
              {noModel
                ? T('chooseModelFirst')
                : noEffort
                  ? T('chooseEffortFirst')
                  : short
                    ? T('need', { n: cost })
                    : T('pay', { n: cost })}
            </button>
          </div>
          {short && <p className="ci-mm-notice">{T('short', { n: v.purse, price: AUTO_PRICE })}</p>}
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
  const who = r.hire.auto
    ? T('auto')
    : T('hired.who', { model: r.hire.model, effort: EFFORT_LABEL[r.hire.effort] });
  return (
    <>
      <Header
        v={v}
        title={job.title}
        onClose={a.close}
        sub={T('workOrder', { size: SIZE_LABEL[job.size] })}
      />
      <div className="ci-mm-result">
        <p className={`ci-mm-stamp is-${f.outcome}`} aria-hidden="true">
          {f.stamp}
        </p>
        <p className="ci-mm-hired">
          {T('hired', { who })} <Star n={r.paid} />
        </p>
        <p className="ci-mm-summary">{f.summary}</p>
        <h3 className="ci-mm-step">{T('keeperSays', { keeper: v.keeper })}</h3>
        <p className="ci-mm-says">{T('says', { text: v.says ?? v.lines[f.key] })}</p>
        {f.quotes.map((q) => (
          <Quote key={q.text} q={q} />
        ))}
        <p className="ci-mm-reward">
          {r.refund > 0
            ? T('refund', { n: r.refund, doubloons: r.doubloons ? T('doubloons', { n: r.doubloons }) : '' })
            : f.key === 'keep'
              ? T('keepPaid', { doubloons: r.doubloons ? T('fairDoubloons', { n: r.doubloons }) : '' })
              : f.outcome === 'right'
                ? T('fair', { doubloons: r.doubloons ? T('fairDoubloons', { n: r.doubloons }) : '' })
                : f.outcome === 'over'
                  ? T('noRefundOver')
                  : T('noRefundShort')}
        </p>
        <div className="ci-mm-actions">
          {f.retry === 'short' ? (
            <>
              <button type="button" className="ci-mm-btn" data-retry="model" onClick={() => a.retry('model')}>
                <kbd aria-hidden="true">R</kbd> {T('retryModel')}
              </button>
              <button
                type="button"
                className="ci-mm-btn primary"
                data-primary
                data-retry="effort"
                onClick={() => a.retry('effort')}
              >
                <kbd aria-hidden="true">E</kbd> {T('retryEffort')}
              </button>
            </>
          ) : (
            <>
              {f.retry === 'again' && (
                <button
                  type="button"
                  className="ci-mm-btn"
                  data-retry="model"
                  onClick={() => a.retry('model')}
                >
                  <kbd aria-hidden="true">R</kbd> {T('retryAgain')}
                </button>
              )}
              <button type="button" className="ci-mm-btn primary" data-primary onClick={a.back}>
                <kbd aria-hidden="true">E</kbd> {T('gotIt')}
              </button>
            </>
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
    return T('announceResult', {
      stamp: plain(f.stamp.replace(/^\W+\s*/, '')),
      summary: f.summary,
      keeper: v.keeper,
      says: v.says ?? v.lines[f.key],
    });
  }
  if (v.screen === 'hire' && v.job) {
    if (v.draft.pending) {
      const title = jobById(v.job)!.title;
      return `${v.notice ? `${v.notice} ` : ''}${T(v.draft.pending === 'model' ? 'announceRetryModel' : 'announceRetryEffort', { title, purse: v.purse })}`;
    }
    const cost = price(draftHire(v.draft));
    const pick = v.draft.auto
      ? T('auto')
      : T('announcePick', { model: v.draft.model, effort: EFFORT_LABEL[v.draft.effort] });
    return `${v.notice ? `${v.notice} ` : ''}${T('announceHire', { title: jobById(v.job)!.title, pick, n: cost, purse: v.purse })}`;
  }
  return `${T('announceBoard', { n: v.purse, keeper: v.keeper })}${v.says ? T('announceSays', { says: v.says, keeper: v.keeper }) : ''}`;
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
        if (e.code === 'KeyR' && s.result?.feedback.retry) a.retry('model');
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
    // A Retry's live picker has the focus until you've chosen (its first pick you can take).
    const live =
      v.screen === 'hire' && v.draft.pending
        ? panel.current.querySelector<HTMLButtonElement>(
            '[data-live] button:not([aria-disabled="true"]):not([disabled])',
          )
        : null;
    const el =
      v.screen === 'board'
        ? panel.current.querySelector<HTMLButtonElement>(`[data-job="${JOBS[v.focus]?.id}"]`)
        : (live ?? panel.current.querySelector<HTMLButtonElement>('[data-primary]'));
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
