import { useEffect, useRef, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import {
  ALCOVES,
  DESTINATIONS,
  TRAY,
  lettersContent,
  type Destination,
} from '../../game/puzzles/hall-letters';
import { textOf } from '../../course/puzzles';
import { Bold } from '../components/Bold';
import { isTyping } from '../typing';
import './channel-routing.css';
import './lost-letters.css';

/** What the Lost Letters overlay shows (P1.3, docs/specs/POC-islands-00-01.md §6.5). */
export interface LostLettersView {
  open: boolean;
  /** Letters filed so far. */
  step: number;
  of: number;
  letter: { from: string; text: string } | null;
  /** Pell's reason (or "Filed"), and the course section it comes from. */
  message: { text: string; tone: 'good' | 'bad'; cite: string | null } | null;
  /** The destination the keys and the pad are on (DESTINATIONS order). */
  focus: number;
  /** Wingman's second hint: the destination that glows, or -1. */
  hint: number;
  busy: boolean;
  reduced: boolean;
}

export interface LostLettersStore {
  get(): LostLettersView;
  subscribe(fn: () => void): () => void;
  file(d: Destination): void;
  focus(i: number): void;
  close(): void;
  /** A learning overlay (the Logbook, a quiz, the fork form) is up: it has the keys and the pad. */
  blocked(): boolean;
}

const T = (key: string, v?: Readonly<Record<string, string | number>>) => textOf(lettersContent(), key, v);

/** The key for each destination: 1-9 for the first nine areas, 0 for the tenth, N for the tray. */
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', 'N'];
const STEP: Readonly<Record<string, number>> = {
  ArrowDown: 1,
  ArrowRight: 1,
  KeyS: 1,
  KeyD: 1,
  ArrowUp: -1,
  ArrowLeft: -1,
  KeyW: -1,
  KeyA: -1,
};

function keyIndex(code: string): number {
  const digit = /^(?:Digit|Numpad)(\d)$/.exec(code);
  if (digit) return digit[1] === '0' ? 9 : Number(digit[1]) - 1;
  return code === 'KeyN' ? DESTINATIONS.length - 1 : -1;
}

function LostLetters({ store }: { store: LostLettersStore }) {
  const v = useSyncExternalStore(store.subscribe, store.get);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  useEffect(() => {
    if (!v.open) return;
    const n = DESTINATIONS.length;
    const key = (e: KeyboardEvent) => {
      if (isTyping(e) || store.blocked()) return;
      const s = store.get();
      const consume = () => {
        e.preventDefault();
        e.stopImmediatePropagation();
      };
      const i = keyIndex(e.code);
      if (i >= 0) {
        consume();
        if (!e.repeat && !s.busy) store.file(DESTINATIONS[i]!);
      } else if (e.code === 'Escape') {
        consume();
        store.close();
      } else if (STEP[e.code]) {
        consume();
        store.focus((s.focus + STEP[e.code]! + n) % n);
      } else if ((e.code === 'Enter' || e.code === 'Space' || e.code === 'KeyE') && !s.busy) {
        // While Pell's talking, E and Enter go on to the game (they skip his line).
        consume();
        if (!e.repeat) store.file(DESTINATIONS[s.focus]!);
      } else if (e.code === 'KeyJ') {
        // The Logbook waits until you step away from the desk (as at the Gate Board): it'd open under the letters.
        consume();
      }
    };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  }, [v.open, store]);
  useEffect(() => {
    document.body.classList.toggle('ci-cr-open', v.open);
    if (!v.open && document.activeElement instanceof HTMLElement) document.activeElement.blur();
    return () => document.body.classList.remove('ci-cr-open');
  }, [v.open]);
  // Keyboard and pad focus follow each other, so a screen reader hears the area you're on.
  useEffect(() => {
    const b = buttons.current[v.focus];
    if (v.open && !v.busy && b && document.activeElement !== b) b.focus({ preventScroll: true });
  }, [v.open, v.focus, v.busy]);
  if (!v.open) return null;
  const button = (d: Destination, i: number, label: string, extra = '') => (
    <button
      ref={(el) => {
        buttons.current[i] = el;
      }}
      type="button"
      className={[extra, i === v.focus ? 'is-focus' : '', i === v.hint ? 'is-hint' : '']
        .filter(Boolean)
        .join(' ')}
      disabled={v.busy}
      data-dest={d}
      onFocus={() => i !== store.get().focus && store.focus(i)}
      onClick={() => store.file(d)}
    >
      <kbd aria-hidden="true">{KEYS[i]}</kbd>
      <span>{label}</span>
    </button>
  );
  return (
    <div className={`ci-cr ci-ll${v.reduced ? ' is-reduced' : ''}`} role="dialog" aria-label={T('title')}>
      <section className="ci-cr-panel ci-ll-panel">
        <div className="ci-ll-side">
          <header className="ci-ll-head">
            <p className="ci-cr-eyebrow">{T('eyebrow', { n: Math.min(v.step + 1, v.of), of: v.of })}</p>
            <button
              type="button"
              className="ci-ll-close"
              aria-label={T('close')}
              disabled={v.busy}
              onClick={() => store.close()}
            >
              ✕
            </button>
          </header>
          {v.letter && (
            <article className="ci-ll-letter">
              <p className="ci-ll-from">{T('from', { from: v.letter.from })}</p>
              <p className="ci-ll-text">“{v.letter.text}”</p>
            </article>
          )}
          <p className={`ci-cr-message ci-ll-message is-${v.message?.tone ?? 'info'}`}>
            <span>
              {v.message ? <Bold text={v.message.text} /> : T('ask')}
              {v.message?.cite && (
                <small className="ci-ll-cite">{T('cite', { section: v.message.cite })}</small>
              )}
            </span>
          </p>
        </div>
        <div className="ci-ll-choices">
          <ol className="ci-ll-alcoves" aria-label={T('bins')}>
            {ALCOVES.map((a, i) => (
              <li key={a.id}>{button(a.id, i, a.name, a.apart ? 'is-apart' : '')}</li>
            ))}
          </ol>
          {button(TRAY.id, DESTINATIONS.length - 1, T('trayButton', { tray: TRAY.name }), 'ci-ll-tray')}
          <p className="ci-cr-help" aria-hidden="true">
            Press <kbd>1</kbd>–<kbd>9</kbd>, <kbd>0</kbd> or <kbd>N</kbd>, or tap an area · <kbd>Esc</kbd>{' '}
            steps away
          </p>
        </div>
        <div className="ci-cr-live" role="status" aria-live="polite">
          {v.message
            ? v.message.text.replace(/\*\*/g, '')
            : v.letter
              ? T('live', { from: v.letter.from, text: v.letter.text })
              : ''}
        </div>
      </section>
    </div>
  );
}

export function mountLostLetters(store: LostLettersStore): () => void {
  const el = document.createElement('div');
  el.className = 'ci-cr-root';
  document.body.appendChild(el);
  const root = createRoot(el);
  root.render(<LostLetters store={store} />);
  return () => {
    root.unmount();
    el.remove();
  };
}
