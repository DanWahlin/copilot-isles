import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import {
  FORK_INPUT_MAX,
  FORK_PLACEHOLDER,
  forkName,
  forkUrl,
  parseFork,
  type ForkRef,
} from '../../learn/fork';
import type { ForkFrom, LearnStore } from '../../learn/store';

const KICKER: Record<ForkFrom, string> = {
  ezra: 'Ezra’s register',
  crane: 'The crane’s sign',
  logbook: 'Your fork',
};

/**
 * Asks for the player's fork (Chapter 00 · Connect to Your Repository has them fork the course), so the
 * crane's `Repository:` sign, Bo's rack, and links into the fork use their real `owner/repo`. Parsed on
 * the device only: nothing is sent to GitHub. "Skip for now" is always there, and the game works
 * without it.
 */
export function ForkForm({ store, from, fork }: { store: LearnStore; from: ForkFrom; fork: ForkRef | null }) {
  const [text, setText] = useState(fork ? forkUrl(fork) : '');
  const [tried, setTried] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const ids = useId();
  const parsed = text.trim() ? parseFork(text) : null;
  const ok = parsed?.ok ? parsed : null;
  const error = parsed && !parsed.ok && tried ? parsed.error : null;
  const changing = from === 'logbook' && !!fork;

  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, []);

  const save = () => {
    setTried(true);
    if (ok) store.saveFork(ok.fork);
    else input.current?.focus();
  };
  const skip = () => store.skipFork();

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopImmediatePropagation();
      store.skipFork();
    };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  }, [store]);

  // Gamepad: A saves (once the address reads as a fork), B skips. Buttons already held when the form
  // opens (the A that finished the line before it) don't count until they're let go.
  const saveRef = useRef(save);
  saveRef.current = save;
  useEffect(() => {
    let held: boolean[] | null = null;
    let raf = 0;
    const poll = () => {
      raf = requestAnimationFrame(poll);
      const pad = navigator.getGamepads?.().find((p) => p && p.connected && p.mapping === 'standard');
      if (!pad) return;
      const now = pad.buttons.map((b) => b.pressed);
      const was = held ?? now;
      held = now;
      if (now[0] && !was[0]) saveRef.current();
      else if (now[1] && !was[1]) store.skipFork();
    };
    raf = requestAnimationFrame(poll);
    return () => cancelAnimationFrame(raf);
  }, [store]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    save();
  };

  return (
    <div className="ci-learn-backdrop">
      <form
        className="ci-fork"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${ids}-title`}
        aria-describedby={`${ids}-intro`}
        onSubmit={submit}
        noValidate
      >
        <p className="ci-page-kicker">{KICKER[from]}</p>
        <h2 id={`${ids}-title`}>
          {changing ? (
            'Change your fork'
          ) : (
            <>
              Where’s your <strong>fork</strong>?
            </>
          )}
        </h2>
        <p id={`${ids}-intro`} className="ci-fork-intro">
          Paste your fork’s address from your browser. You’ll see it on GitHub.com right after you fork the
          course.
        </p>
        <label className="ci-fork-label" htmlFor={`${ids}-input`}>
          Your fork’s address, or <code>owner/name</code>
        </label>
        <input
          id={`${ids}-input`}
          ref={input}
          className="ci-fork-input"
          type="text"
          inputMode="url"
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          maxLength={FORK_INPUT_MAX}
          placeholder={`https://github.com/${FORK_PLACEHOLDER}`}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => text.trim() && setTried(true)}
          aria-invalid={!!error}
          aria-describedby={`${ids}-status ${ids}-privacy`}
        />
        <div id={`${ids}-status`} className="ci-fork-status" aria-live="polite">
          {ok && (
            <>
              <p className="ci-fork-read">
                <span aria-hidden>✓</span> Your fork: <strong>{forkName(ok.fork)}</strong>
                {ok.fork.host !== 'github.com' && <small> on {ok.fork.host}</small>}
              </p>
              {ok.warning && <p className="ci-fork-warn">{ok.warning}</p>}
            </>
          )}
          {error && <p className="ci-fork-error">{error}</p>}
          {!parsed && (
            <p className="ci-fork-hint">
              Or just the owner and name, like <code>{FORK_PLACEHOLDER}</code>
            </p>
          )}
        </div>
        <p className="ci-fork-uses">
          The crane’s <code>Repository:</code> sign will show it, and your Logbook will link to your fork’s{' '}
          <strong>Actions</strong> tab, issues, and pull requests.
        </p>
        <p id={`${ids}-privacy`} className="ci-fork-privacy">
          It stays on this device, in your save. The game doesn’t contact GitHub to check it.
        </p>
        <div className="ci-fork-actions">
          <button type="submit" className="ci-btn primary" aria-disabled={!ok}>
            {changing ? 'Save' : 'Save my fork'} <kbd>↵</kbd>
          </button>
          <button type="button" className="ci-btn ghost" onClick={skip}>
            {from === 'logbook' ? 'Cancel' : 'Skip for now'} <kbd>Esc</kbd>
          </button>
          {changing && (
            <button type="button" className="ci-btn ghost" onClick={() => store.saveFork(null)}>
              Forget my fork
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
