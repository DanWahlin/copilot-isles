import { useEffect, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import { FLAGS, type FlagSymbol } from '../../game/puzzles/flag-hoist';
import './channel-routing.css';

/** What the Flag Hoist overlay shows (P2.3, docs/specs/ISLAND-02-thousand-bough.md §7). */
export interface FlagHoistView {
  open: boolean;
  step: number;
  of: number;
  order: string;
  message: { text: string; tone: 'good' | 'bad' } | null;
  /** The flag the gamepad's on. */
  focus: number;
  busy: boolean;
}

export interface FlagHoistStore {
  get(): FlagHoistView;
  subscribe(fn: () => void): () => void;
  hoist(symbol: FlagSymbol): void;
}

/** `code` spans in a line (backticks), the rest as text. */
function Code({ text }: { text: string }) {
  return (
    <>
      {text
        .split(/(`[^`]+`)/)
        .map((part, i) =>
          part.startsWith('`') ? <code key={i}>{part.slice(1, -1)}</code> : <span key={i}>{part}</span>,
        )}
    </>
  );
}

function FlagHoist({ store }: { store: FlagHoistStore }) {
  const v = useSyncExternalStore(store.subscribe, store.get);
  useEffect(() => {
    if (!v.open) return;
    const key = (e: KeyboardEvent) => {
      const n = /^Digit\d$/.test(e.code) ? Number(e.code.slice(5)) : Number(e.key);
      if (n >= 1 && n <= FLAGS.length) {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (!e.repeat && !store.get().busy) store.hoist(FLAGS[n - 1]!.symbol);
      }
    };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  }, [v.open, store]);
  useEffect(() => {
    document.body.classList.toggle('ci-cr-open', v.open);
    return () => document.body.classList.remove('ci-cr-open');
  }, [v.open]);
  if (!v.open) return null;
  return (
    <div className="ci-cr" role="dialog" aria-label="Flag Hoist">
      <section className="ci-cr-panel ci-fh">
        <header className="ci-cr-head">
          <p className="ci-cr-eyebrow">
            Flag Hoist · Order {Math.min(v.step + 1, v.of)} of {v.of}
          </p>
          <h2 className="ci-fh-order">
            <Code text={v.order} />
          </h2>
        </header>
        <ol className="ci-fh-flags">
          {FLAGS.map((f, i) => (
            <li key={f.symbol}>
              <button
                type="button"
                className={i === v.focus ? 'is-focus' : undefined}
                disabled={v.busy}
                data-flag={f.symbol}
                aria-label={`${f.symbol}: ${f.picture}, brings ${f.brings.toLowerCase()}`}
                onClick={() => store.hoist(f.symbol)}
              >
                <span className="ci-fh-pennant" aria-hidden="true">
                  <span className="ci-fh-icon">{f.icon}</span>
                  <span className="ci-fh-symbol">{f.symbol}</span>
                </span>
                <span className="ci-fh-text">
                  <b>{f.picture}</b>
                  <small>{f.brings}</small>
                </span>
                <kbd>{i + 1}</kbd>
              </button>
            </li>
          ))}
        </ol>
        <p className={`ci-cr-message is-${v.message?.tone ?? 'info'}`}>
          {v.message ? <Code text={v.message.text} /> : 'Hoist the flag that brings what Ines asks for.'}
        </p>
        <p className="ci-cr-help" aria-hidden="true">
          Press <kbd>1</kbd>–<kbd>4</kbd> or tap a flag
        </p>
        <div className="ci-cr-live" role="status" aria-live="polite">
          {v.message?.text ?? v.order}
        </div>
      </section>
    </div>
  );
}

export function mountFlagHoist(store: FlagHoistStore): () => void {
  const el = document.createElement('div');
  el.className = 'ci-cr-root';
  document.body.appendChild(el);
  const root = createRoot(el);
  root.render(<FlagHoist store={store} />);
  return () => {
    root.unmount();
    el.remove();
  };
}
