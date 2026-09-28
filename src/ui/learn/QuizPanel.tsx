import { useEffect, useMemo, useState, type DragEvent } from 'react';
import { courseUrl } from '../../learn/content/index';
import { shuffled, type Answer } from '../../learn/grade';
import type { ActiveQuiz, LearnStore } from '../../learn/store';
import type { ChoiceQuiz, MatchingQuiz, MultiQuiz, Option, OrderingQuiz } from '../../learn/types';
import { Hotspot } from './Hotspot';
import { Rich } from './Rich';

const TYPE_LABEL = {
  mc: 'Choose one',
  scenario: 'Scenario',
  multi: 'Choose all that apply',
  hotspot: 'Find it on the screen',
  ordering: 'Put in order',
  matching: 'Match them up',
} as const;

export function QuizPanel({ store, active }: { store: LearnStore; active: ActiveQuiz }) {
  const { quiz, last, trial } = active;
  // The panel is keyed per quiz instance (LearnLayer), so pending starts fresh for each quiz, and it
  // survives a retry so an unchanged ordering/matching answer can be checked again after edits.
  const [pending, setPending] = useState<Answer | null>(null);
  const answer = (a: Answer) => store.submit(a);

  const needsCheck = quiz.type === 'multi' || quiz.type === 'ordering' || quiz.type === 'matching';
  const primary = () => {
    if (last?.correct) store.closeQuiz();
    else if (last) store.retry();
    else if (needsCheck && pending) answer(pending);
  };

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.repeat || store.getState().spyglass?.full) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (e.key === 'Escape') {
        e.preventDefault();
        store.closeQuiz();
      } else if (e.key === 'Enter' || e.code === 'KeyE') {
        if (tag === 'BUTTON' && e.key === 'Enter' && !last) return; // let focused option buttons act
        e.preventDefault();
        primary();
      } else if (e.code === 'KeyQ') {
        store.hint();
      } else if (!last && (quiz.type === 'mc' || quiz.type === 'scenario')) {
        const n = Number(e.key);
        const opt = n >= 1 ? quiz.options[n - 1] : undefined;
        if (opt) answer({ type: quiz.type, option: opt.id });
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  });

  const canHint = !!quiz.hints && active.hintTier < (trial ? 2 : 3);

  return (
    <div className="ci-quiz-backdrop">
      <section
        className={`ci-quiz ci-quiz-${quiz.type}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="ci-quiz-prompt"
      >
        <header className="ci-quiz-head">
          <span className="ci-quiz-kicker">
            {trial ? `${trial.title} · ${trial.index + 1} of ${trial.total}` : TYPE_LABEL[quiz.type]}
          </span>
          {trial && (
            <span className="ci-quiz-dots" aria-hidden>
              {Array.from({ length: trial.total }, (_, i) => (
                <i key={i} className={i < trial.index ? 'done' : i === trial.index ? 'now' : ''} />
              ))}
            </span>
          )}
          <button type="button" className="ci-quiz-close" onClick={store.closeQuiz} aria-label="Close (Esc)">
            ×
          </button>
        </header>

        {quiz.type === 'scenario' && quiz.situation && (
          <p className="ci-quiz-situation">
            <Rich text={quiz.situation} />
          </p>
        )}
        <h2 id="ci-quiz-prompt" className="ci-quiz-prompt">
          <Rich text={quiz.prompt} />
        </h2>

        <div className="ci-quiz-body">
          {(quiz.type === 'mc' || quiz.type === 'scenario') && (
            <ChoiceBody quiz={quiz} active={active} onAnswer={answer} />
          )}
          {quiz.type === 'multi' && <MultiBody quiz={quiz} active={active} onChange={setPending} />}
          {quiz.type === 'hotspot' && <Hotspot quiz={quiz} last={last} onAnswer={answer} />}
          {quiz.type === 'ordering' && <OrderingBody quiz={quiz} active={active} onChange={setPending} />}
          {quiz.type === 'matching' && <MatchingBody quiz={quiz} active={active} onChange={setPending} />}
        </div>

        {active.hint && !last?.correct && (
          <p className="ci-quiz-hint" role="status">
            <span className="ci-quiz-parrot" aria-hidden>
              🦜
            </span>
            <Rich text={active.hint} />
          </p>
        )}

        {last && (
          <div
            className={`ci-quiz-feedback ${last.correct ? 'good' : 'bad'}`}
            role="status"
            aria-live="polite"
          >
            <span className="ci-quiz-verdict">
              <b aria-hidden>{last.correct ? '✓' : '✕'}</b>
              {last.correct ? (active.attempts === 1 ? 'First try!' : 'Correct') : 'Not quite'}
              {last.correct && active.earned > 0 && <em className="ci-coin">+{active.earned}</em>}
            </span>
            <p>
              <Rich text={last.feedback} />
            </p>
          </div>
        )}

        <footer className="ci-quiz-foot">
          <a
            className="ci-course-link"
            href={courseUrl(quiz.source)}
            target="_blank"
            rel="noopener noreferrer"
          >
            Open in the course ↗
          </a>
          <span className="ci-quiz-actions">
            {canHint && !last?.correct && (
              <button type="button" className="ci-btn ghost" onClick={store.hint}>
                <kbd>Q</kbd> Ask Wingman
              </button>
            )}
            {(needsCheck || last) && (
              <button type="button" className="ci-btn primary" onClick={primary} disabled={!last && !pending}>
                <kbd>E</kbd> {last?.correct ? 'Continue' : last ? 'Try again' : 'Check'}
              </button>
            )}
          </span>
        </footer>
      </section>
    </div>
  );
}

function ChoiceBody({
  quiz,
  active,
  onAnswer,
}: {
  quiz: ChoiceQuiz;
  active: ActiveQuiz;
  onAnswer: (a: Answer) => void;
}) {
  const [picked, setPicked] = useState<string | null>(null);
  useEffect(() => {
    if (!active.last) setPicked(null);
  }, [active.last]);
  return (
    <ol className="ci-options">
      {quiz.options.map((o, i) => {
        const state =
          active.last && picked === o.id
            ? active.last.correct
              ? 'good'
              : 'bad'
            : active.last?.correct && o.id === quiz.answer
              ? 'good'
              : '';
        return (
          <li key={o.id}>
            <button
              type="button"
              className={`ci-option ${state}`}
              disabled={!!active.last}
              onClick={() => {
                setPicked(o.id);
                onAnswer({ type: quiz.type, option: o.id });
              }}
            >
              <kbd>{i + 1}</kbd>
              <span>
                <Rich text={o.text} />
              </span>
              {state && <b className="ci-mark">{state === 'good' ? '✓' : '✕'}</b>}
            </button>
          </li>
        );
      })}
    </ol>
  );
}

function MultiBody({
  quiz,
  active,
  onChange,
}: {
  quiz: MultiQuiz;
  active: ActiveQuiz;
  onChange: (a: Answer | null) => void;
}) {
  const [sel, setSel] = useState<Set<string>>(new Set());
  useEffect(() => setSel(new Set()), [quiz.id]);
  const marks = active.last?.marks;
  const toggle = (id: string) => {
    if (active.last) return;
    const next = new Set(sel);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSel(next);
    onChange(next.size ? { type: 'multi', options: [...next] } : null);
  };
  return (
    <ul className="ci-options">
      {quiz.options.map((o) => {
        const on = sel.has(o.id);
        const mark = marks ? (marks[o.id] ? (on ? 'good' : '') : 'bad') : '';
        return (
          <li key={o.id}>
            <button
              type="button"
              role="checkbox"
              aria-checked={on}
              className={`ci-option check ${on ? 'on' : ''} ${mark}`}
              disabled={!!active.last}
              onClick={() => toggle(o.id)}
            >
              <span className="ci-box" aria-hidden>
                {on ? '✓' : ''}
              </span>
              <span>
                <Rich text={o.text} />
              </span>
              {mark === 'bad' && <b className="ci-mark">{on ? '✕' : '!'}</b>}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function OrderingBody({
  quiz,
  active,
  onChange,
}: {
  quiz: OrderingQuiz;
  active: ActiveQuiz;
  onChange: (a: Answer | null) => void;
}) {
  const initial = useMemo(() => shuffled(quiz.items, active.seed), [quiz.items, active.seed]);
  const [order, setOrder] = useState<Option[]>(initial);
  const [drag, setDrag] = useState<number | null>(null);
  useEffect(() => setOrder(initial), [initial]);
  useEffect(() => onChange({ type: 'ordering', order: order.map((o) => o.id) }), [order, onChange]);
  const marks = active.last?.marks;
  const move = (from: number, to: number) => {
    if (active.last || to < 0 || to >= order.length || from === to) return;
    const next = order.slice();
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item!);
    setOrder(next);
  };
  return (
    <ol className="ci-order">
      {order.map((o, i) => {
        const mark = marks ? (marks[o.id] ? 'good' : 'bad') : '';
        return (
          <li
            key={o.id}
            className={`ci-order-item ${mark} ${drag === i ? 'dragging' : ''}`}
            draggable={!active.last}
            onDragStart={(e: DragEvent) => {
              setDrag(i);
              e.dataTransfer.effectAllowed = 'move';
            }}
            onDragOver={(e) => {
              e.preventDefault();
              if (drag !== null && drag !== i) {
                move(drag, i);
                setDrag(i);
              }
            }}
            onDragEnd={() => setDrag(null)}
          >
            <span className="ci-order-n">{i + 1}</span>
            <span className="ci-order-grip" aria-hidden>
              ⋮⋮
            </span>
            <span className="ci-order-text">
              <Rich text={o.text} />
            </span>
            {mark && <b className="ci-mark">{mark === 'good' ? '✓' : '✕'}</b>}
            <span className="ci-order-btns">
              <button
                type="button"
                aria-label={`Move “${o.text}” up`}
                disabled={!!active.last || i === 0}
                onClick={() => move(i, i - 1)}
              >
                ▲
              </button>
              <button
                type="button"
                aria-label={`Move “${o.text}” down`}
                disabled={!!active.last || i === order.length - 1}
                onClick={() => move(i, i + 1)}
              >
                ▼
              </button>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

const PAIR_COLOURS = ['#3fd0c9', '#e8c88a', '#ff9d7a', '#a8b8ff', '#9be28f'];

function MatchingBody({
  quiz,
  active,
  onChange,
}: {
  quiz: MatchingQuiz;
  active: ActiveQuiz;
  onChange: (a: Answer | null) => void;
}) {
  const rights = useMemo(
    () =>
      shuffled(
        quiz.pairs.map((p) => p.right),
        active.seed,
      ),
    [quiz.pairs, active.seed],
  );
  const [pairs, setPairs] = useState<Record<string, string>>({});
  const [focus, setFocus] = useState<string | null>(quiz.pairs[0]?.left.id ?? null);
  useEffect(() => {
    setPairs({});
    setFocus(quiz.pairs[0]?.left.id ?? null);
  }, [quiz, active.seed]);
  useEffect(() => {
    onChange(Object.keys(pairs).length === quiz.pairs.length ? { type: 'matching', pairs } : null);
  }, [pairs, quiz.pairs.length, onChange]);

  const marks = active.last?.marks;
  const leftIndex = (id: string) => quiz.pairs.findIndex((p) => p.left.id === id);
  const pairOf = (rightId: string) => Object.entries(pairs).find(([, r]) => r === rightId)?.[0];
  const assign = (rightId: string) => {
    if (active.last || !focus) return;
    const next = { ...pairs };
    for (const [l, r] of Object.entries(next)) if (r === rightId) delete next[l];
    next[focus] = rightId;
    setPairs(next);
    const nextLeft = quiz.pairs.find((p) => !next[p.left.id])?.left.id ?? null;
    setFocus(nextLeft);
  };

  return (
    <div className="ci-match">
      <ul className="ci-match-col">
        {quiz.pairs.map((p, i) => {
          const r = pairs[p.left.id];
          const mark = marks ? (marks[p.left.id] ? 'good' : 'bad') : '';
          return (
            <li key={p.left.id}>
              <button
                type="button"
                className={`ci-match-left ${focus === p.left.id && !active.last ? 'focus' : ''} ${mark}`}
                style={r ? { borderColor: PAIR_COLOURS[i % PAIR_COLOURS.length] } : undefined}
                onClick={() => !active.last && setFocus(p.left.id)}
                disabled={!!active.last}
              >
                <span>
                  <Rich text={p.left.text} />
                </span>
                {r && (
                  <span
                    className="ci-match-chip"
                    style={{ background: PAIR_COLOURS[i % PAIR_COLOURS.length] }}
                  >
                    <Rich text={rights.find((x) => x.id === r)?.text ?? ''} />
                  </span>
                )}
                {mark && <b className="ci-mark">{mark === 'good' ? '✓' : '✕'}</b>}
              </button>
            </li>
          );
        })}
      </ul>
      <ul className="ci-match-col right">
        {rights.map((o) => {
          const owner = pairOf(o.id);
          const colour = owner ? PAIR_COLOURS[leftIndex(owner) % PAIR_COLOURS.length] : undefined;
          return (
            <li key={o.id}>
              <button
                type="button"
                className={`ci-match-right ${owner ? 'used' : ''}`}
                style={colour ? { borderColor: colour, boxShadow: `inset 4px 0 0 ${colour}` } : undefined}
                onClick={() => assign(o.id)}
                disabled={!!active.last}
              >
                <span>
                  <Rich text={o.text} />
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {!active.last && (
        <p className="ci-match-help">Pick an item on the left, then its match on the right.</p>
      )}
    </div>
  );
}
