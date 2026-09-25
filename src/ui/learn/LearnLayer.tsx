import { useEffect, useSyncExternalStore } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { LearnStore } from '../../learn/store';
import { SoundButton } from '../SoundButton';
import { Logbook, PageReveal, Spyglass } from './PageViews';
import { QuizPanel } from './QuizPanel';
import { ThemePicker } from './ThemePicker';
import './learn.css';

/**
 * The learning overlay (POC §3.4-3.6): quizzes, spyglass images, page reveals, the Logbook, trial
 * banners, and the doubloon purse. Rendered above the HUD and below the menus.
 */
/** Whether the game is in play (the purse shows and J opens the Logbook), as an external store. */
export interface PlayingSource {
  subscribe(fn: () => void): () => void;
  get(): boolean;
}

/** The mute switch for the purse's speaker button (settings live in the game flow). */
export interface SoundSource {
  subscribe(fn: () => void): () => void;
  muted(): boolean;
  toggle(): void;
}

const NO_SOUND: SoundSource = {
  subscribe: () => () => undefined,
  muted: () => false,
  toggle: () => undefined,
};

function LearnLayer({
  store,
  playing,
  sound = NO_SOUND,
}: {
  store: LearnStore;
  playing: PlayingSource;
  sound?: SoundSource;
}) {
  const s = useSyncExternalStore(store.subscribe, store.getState);
  const visible = useSyncExternalStore(playing.subscribe, playing.get);
  const muted = useSyncExternalStore(sound.subscribe, sound.muted);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const st0 = store.getState();
      if (st0.banner && !st0.quiz && (e.code === 'KeyE' || e.key === 'Enter' || e.key === 'Escape')) {
        e.preventDefault();
        store.closeBanner();
        return;
      }
      if (e.code !== 'KeyJ' || !playing.get()) return;
      const st = store.getState();
      if (!st.logbook.open && !store.busy) store.openLogbook();
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [store, playing]);

  return (
    <>
      {visible && (
        <div className="ci-purse">
          {sound !== NO_SOUND && <SoundButton muted={muted} onToggle={sound.toggle} className="in-purse" />}
          <span className="ci-coin" aria-label={`${s.doubloons} doubloons`}>
            {s.doubloons}
          </span>
          <span className="ci-purse-hint">
            <kbd>J</kbd> Logbook
          </span>
        </div>
      )}
      {s.spyglass && !s.spyglass.full && !s.quiz && <Spyglass store={store} spy={s.spyglass} />}
      {s.quiz && <QuizPanel key={`${s.quiz.quiz.id}:${s.quiz.seed}`} store={store} active={s.quiz} />}
      {s.palette && !s.quiz && !s.reveal && <ThemePicker store={store} selected={s.palette.selected} />}
      {s.reveal && !s.quiz && <PageReveal store={store} reveal={s.reveal} />}
      {s.logbook.open && !s.quiz && !s.reveal && <Logbook store={store} state={s} />}
      {s.banner && !s.quiz && (
        <div className="ci-learn-backdrop">
          <div className="ci-seal" role="dialog" aria-modal="true" aria-labelledby="ci-seal-title">
            <div className="ci-seal-medal" aria-hidden>
              ⚓
            </div>
            <h2 id="ci-seal-title">{s.banner.title}</h2>
            <p>{s.banner.body}</p>
            <button type="button" className="ci-btn primary" onClick={store.closeBanner} autoFocus>
              <kbd>E</kbd> Onward
            </button>
          </div>
        </div>
      )}
      {s.spyglass?.full && <Spyglass store={store} spy={s.spyglass} />}
    </>
  );
}

/** Mounts the learning overlay in its own root (so it can run with or without the menu UI). */
export function mountLearn(
  parent: HTMLElement,
  store: LearnStore,
  playing: PlayingSource,
  sound?: SoundSource,
): Root {
  const el = document.createElement('div');
  el.className = 'ci-learn';
  parent.append(el);
  const root = createRoot(el);
  root.render(<LearnLayer store={store} playing={playing} sound={sound} />);
  return root;
}
