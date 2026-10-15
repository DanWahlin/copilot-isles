import { useEffect, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import { FLAGS } from '../../game/puzzles/flag-hoist';
import './channel-routing.css';

/** What the Flag Hoist overlay shows (P2.3, docs/specs/ISLAND-02-thousand-bough.md §7). */
export interface FlagHoistView {
  open: boolean;
  step: number;
  of: number;
  /** A name for a choice order ("Pack light"); none for a flag order. */
  title: string | null;
  order: string;
  /** A choice order's picks (keys 1-4); null: hoist one of the four flags. */
  choices: readonly { id: string; icon: string; text: string }[] | null;
  message: { text: string; tone: 'good' | 'bad' } | null;
  /** The pick the gamepad's on. */
  focus: number;
  busy: boolean;
}

export interface FlagHoistStore {
  get(): FlagHoistView;
  subscribe(fn: () => void): () => void;
  /** A flag's symbol, or a choice's id. */
  hoist(pick: string): void;
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

const plain = (s: string) => s.replace(/`([^`]+)`/g, '$1');

function FlagHoist({ store }: { store: FlagHoistStore }) {
  const v = useSyncExternalStore(store.subscribe, store.get);
  useEffect(() => {
    if (!v.open) return;
    const key = (e: KeyboardEvent) => {
      const s = store.get();
      const picks = s.choices ? s.choices.map((c) => c.id) : FLAGS.map((f) => f.symbol);
      const n = /^Digit\d$/.test(e.code) ? Number(e.code.slice(5)) : Number(e.key);
      if (n >= 1 && n <= picks.length) {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (!e.repeat && !s.busy) store.hoist(picks[n - 1]!);
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
  const n = v.choices ? v.choices.length : FLAGS.length;
  return (
    <div className="ci-cr" role="dialog" aria-label="Flag Hoist">
      <section className="ci-cr-panel ci-cr-two ci-fh">
        <header className="ci-cr-head">
          <p className="ci-cr-eyebrow">
            Flag Hoist · Order {Math.min(v.step + 1, v.of)} of {v.of}
            {v.title ? ` · ${v.title}` : ''}
          </p>
          <h2 className="ci-fh-order">
            <Code text={v.order} />
          </h2>
        </header>
        {v.choices ? (
          <ol className="ci-fh-flags ci-fh-choices">
            {v.choices.map((c, i) => (
              <li key={c.id}>
                <button
                  type="button"
                  className={i === v.focus ? 'is-focus' : undefined}
                  disabled={v.busy}
                  data-pick={c.id}
                  aria-label={plain(c.text)}
                  onClick={() => store.hoist(c.id)}
                >
                  <span className="ci-fh-cargo" aria-hidden="true">
                    {c.icon}
                  </span>
                  <span className="ci-fh-text">
                    <b>
                      <Code text={c.text} />
                    </b>
                  </span>
                  <kbd>{i + 1}</kbd>
                </button>
              </li>
            ))}
          </ol>
        ) : (
          <ol className="ci-fh-flags">
            {FLAGS.map((f, i) => (
              <li key={f.symbol}>
                <button
                  type="button"
                  className={i === v.focus ? 'is-focus' : undefined}
                  disabled={v.busy}
                  data-flag={f.symbol}
                  data-pick={f.symbol}
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
        )}
        <div className="ci-cr-side">
          <p className={`ci-cr-message is-${v.message?.tone ?? 'info'}`}>
            {v.message ? (
              <Code text={v.message.text} />
            ) : v.choices ? (
              'Pick what Ines asks for.'
            ) : (
              'Hoist the flag that brings what Ines asks for.'
            )}
          </p>
          <p className="ci-cr-help" aria-hidden="true">
            Press <kbd>1</kbd>–<kbd>{n}</kbd> or tap {v.choices ? 'a choice' : 'a flag'}
          </p>
        </div>
        <div className="ci-cr-live" role="status" aria-live="polite">
          {plain(v.message?.text ?? v.order)}
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
