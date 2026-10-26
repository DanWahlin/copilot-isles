import { useEffect, useRef, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import { PadEdges, standardPad } from '../../game/puzzles/pad-edges';
import { isTyping } from '../typing';
import './sea-choice.css';

/** One choice on the card. `tried` marks a wrong pick already made (it stays, dimmed). */
export interface SeaChoiceOption {
  id: string;
  label: string;
  /** A second, smaller line (the course's own words for a mode, say). */
  sub?: string;
  tried?: boolean;
}

/**
 * What the at-sea choice card shows (P1.2 The Three Helms): Rhea's order cards, the next heading at
 * an Interactive mark, and the Plan review's options. It sits beside the session panel and never
 * covers the sea ahead.
 */
export interface SeaChoiceView {
  open: boolean;
  eyebrow: string;
  title: string;
  /** The order or question. */
  prompt: string;
  /** Lines listed under the prompt (the plan under review). */
  detail: readonly string[];
  options: readonly SeaChoiceOption[];
  message: { text: string; tone: 'good' | 'bad' | 'info' } | null;
  /** The option the gamepad's on. */
  focus: number;
  /** Rhea's talking: the buttons wait. */
  busy: boolean;
  /** The game's reduced-motion setting: the card doesn't rise in. */
  reduced: boolean;
}

export interface SeaChoiceStore {
  get(): SeaChoiceView;
  subscribe(fn: () => void): () => void;
  choose(id: string): void;
  setFocus(i: number): void;
  /** A learning overlay (the Logbook, the fork form) is up: it has the keys and the pad. */
  blocked(): boolean;
}

function SeaChoice({ store }: { store: SeaChoiceStore }) {
  const v = useSyncExternalStore(store.subscribe, store.get);
  const pad = useRef(new PadEdges());
  // Number keys pick an option (the walker's keys stay with the ship, which the crew has).
  useEffect(() => {
    if (!v.open) return;
    const key = (e: KeyboardEvent) => {
      // A digit typed in the fork form (or pressed in the Logbook) isn't a pick.
      if (isTyping(e) || store.blocked()) return;
      const n = /^Digit\d$/.test(e.code) ? Number(e.code.slice(5)) : Number(e.key);
      const s = store.get();
      if (n >= 1 && n <= s.options.length) {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (!e.repeat && !s.busy) store.choose(s.options[n - 1]!.id);
      }
    };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  }, [v.open, store]);
  // The gamepad: the d-pad moves between options and A picks one.
  useEffect(() => {
    if (!v.open) return;
    let raf = 0;
    // The press that opened the card mustn't also pick: the first look only notes what's held.
    const edges = pad.current;
    edges.arm();
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const gp = standardPad();
      if (!gp || !edges.look(gp, store.blocked())) return;
      const edge = (i: number) => edges.edge(gp, i);
      const s = store.get();
      const n = s.options.length;
      if (edge(13) || edge(15)) store.setFocus((s.focus + 1) % n);
      if (edge(12) || edge(14)) store.setFocus((s.focus + n - 1) % n);
      if (edge(0) && !s.busy) store.choose(s.options[s.focus]!.id);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [v.open, store]);
  useEffect(() => {
    document.body.classList.toggle('ci-sc-open', v.open);
    return () => document.body.classList.remove('ci-sc-open');
  }, [v.open]);
  if (!v.open) return null;
  return (
    <div className={`ci-sc${v.reduced ? ' is-reduced' : ''}`} role="dialog" aria-label={v.title}>
      <section className="ci-sc-panel">
        <header className="ci-sc-head">
          <p className="ci-sc-eyebrow">{v.eyebrow}</p>
          <h2>{v.title}</h2>
        </header>
        {v.prompt ? <p className="ci-sc-prompt">{v.prompt}</p> : null}
        {v.detail.length ? (
          <ol className="ci-sc-detail">
            {v.detail.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ol>
        ) : null}
        <ol className="ci-sc-options">
          {v.options.map((o, i) => (
            <li key={o.id}>
              <button
                type="button"
                className={`${i === v.focus ? 'is-focus' : ''}${o.tried ? ' is-tried' : ''}`}
                disabled={v.busy}
                data-choice={o.id}
                aria-label={`${o.label}${o.sub ? `: ${o.sub}` : ''}${o.tried ? ' (tried)' : ''}`}
                onClick={() => store.choose(o.id)}
                onFocus={() => store.setFocus(i)}
              >
                <kbd aria-hidden="true">{i + 1}</kbd>
                <span className="ci-sc-text">
                  <b>{o.label}</b>
                  {o.sub ? <small>{o.sub}</small> : null}
                </span>
              </button>
            </li>
          ))}
        </ol>
        <p className={`ci-sc-message is-${v.message?.tone ?? 'info'}`}>{v.message?.text ?? ''}</p>
        {v.options.length ? (
          <p className="ci-sc-help" aria-hidden="true">
            Press <kbd>1</kbd>–<kbd>{v.options.length}</kbd> or tap a choice
          </p>
        ) : null}
        <div className="ci-sc-live" role="status" aria-live="polite">
          {v.message?.text ?? v.prompt}
        </div>
      </section>
    </div>
  );
}

export function mountSeaChoice(store: SeaChoiceStore): () => void {
  const el = document.createElement('div');
  el.className = 'ci-sc-root';
  document.body.appendChild(el);
  const root = createRoot(el);
  root.render(<SeaChoice store={store} />);
  return () => {
    root.unmount();
    el.remove();
  };
}
