import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { CHAPTERS } from '../../learn/content/index';
import { loadGlossary, prefetchChapter } from '../../learn/course/source';
import { chartedIslands, type LearnState, type LearnStore } from '../../learn/store';
import { usePadFocus } from '../hooks/pad-focus';
import { SoundButton } from '../SoundButton';
import { CourseBoardPanel } from './CourseBoard';
import { ForkForm } from './ForkForm';
import { Logbook, PageReveal, Spyglass } from './PageViews';
import { QuestTracker } from './QuestTracker';
import { QuizPanel } from './QuizPanel';
import { ForkContext, SetupContext } from './Rich';
import { SetupForm } from './SetupForm';
import { StarfishCount, StarfishPurse } from './Starfish';
import { ThemePicker } from './ThemePicker';
import { AppTaskCard, BadgeCard, ReflectionCard, ResumeCard } from './LearningCards';
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
  const setup = useMemo(() => ({ setup: s.setup, detected: s.osDetected }), [s.setup, s.osDetected]);

  // Fetch the course text once play starts (PLAN §8.2), so pages and excerpts open without a wait.
  useEffect(() => {
    if (!visible) return;
    const id = setTimeout(() => {
      for (const c of CHAPTERS) void prefetchChapter(c.chapter);
      void loadGlossary().catch(() => undefined);
    }, 1500);
    return () => clearTimeout(id);
  }, [visible]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const st0 = store.getState();
      const onButton = (e.target as HTMLElement | null)?.tagName === 'BUTTON';
      if (
        st0.banner &&
        !st0.quiz &&
        (e.code === 'KeyE' || (e.key === 'Enter' && !onButton) || e.key === 'Escape')
      ) {
        e.preventDefault();
        store.closeBanner();
        return;
      }
      if (e.code !== 'KeyJ' || !playing.get() || st0.cinematic) return;
      const st = store.getState();
      if (!st.logbook.open && !store.busy) store.openLogbook();
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [store, playing]);

  return (
    <ForkContext.Provider value={s.fork}>
      <SetupContext.Provider value={setup}>
        {visible && !s.cinematic && (
          <div className="ci-purse">
            {sound !== NO_SOUND && <SoundButton muted={muted} onToggle={sound.toggle} className="in-purse" />}
            <span className="ci-coin" aria-label={`${s.doubloons} doubloons`}>
              {s.doubloons}
            </span>
            {s.starfishIsland && (
              <StarfishCount island={s.starfishIsland} found={s.starfish} spot={s.spotlight.starfish} />
            )}
            {(s.starfishPurse > 0 || s.starfish.length > 0) && <StarfishPurse count={s.starfishPurse} />}
            {/* Glows from the first page until the player has opened the Logbook once. */}
            <span className={`ci-purse-hint${!s.logbookOpened && s.pages.length > 0 ? ' nudge' : ''}`}>
              <kbd>J</kbd> Logbook
            </span>
          </div>
        )}
        {visible &&
          !s.cinematic &&
          s.tracker &&
          !s.quiz &&
          !s.reveal &&
          !s.logbook.open &&
          !s.palette &&
          !s.forkForm &&
          !s.setupForm &&
          !s.courseBoard &&
          !s.banner &&
          !s.appTask &&
          !s.reflection &&
          !s.badge &&
          !s.resume &&
          !s.spyglass && <QuestTracker tracker={s.tracker} calm={s.calm} spot={s.spotlight.tracker} />}
        {s.spyglass && !s.spyglass.full && !s.quiz && !s.logbook.open && !s.appTask && (
          <Spyglass store={store} spy={s.spyglass} />
        )}
        {s.quiz && <QuizPanel key={`${s.quiz.quiz.id}:${s.quiz.seed}`} store={store} active={s.quiz} />}
        {s.palette && !s.quiz && !s.reveal && <ThemePicker store={store} selected={s.palette.selected} />}
        {s.reveal && !s.quiz && <PageReveal store={store} reveal={s.reveal} firstTime={!s.logbookOpened} />}
        {s.logbook.open && !s.quiz && !s.reveal && <Logbook store={store} state={s} />}
        {s.banner && !s.quiz && <SealBanner store={store} banner={s.banner} />}
        {s.forkForm && !s.quiz && !s.reveal && (
          <ForkForm store={store} from={s.forkForm.from} fork={s.fork} />
        )}
        {s.setupForm && !s.quiz && !s.reveal && (
          <SetupForm
            key={`${s.setupForm.kind}:${s.setupForm.from}`}
            store={store}
            kind={s.setupForm.kind}
            from={s.setupForm.from}
            setup={s.setup}
            detected={s.osDetected}
          />
        )}
        {s.courseBoard && !s.quiz && !s.reveal && !s.logbook.open && !s.forkForm && !s.setupForm && (
          <CourseBoardPanel
            key={s.courseBoard.chapter}
            store={store}
            chapter={s.courseBoard.chapter}
            covered={s.courseBoard.covered}
          />
        )}
        {s.appTask && !s.quiz && !s.reveal && !s.forkForm && !s.setupForm && (
          <AppTaskCard key={`${s.appTask.task.id}:${s.appTask.from}`} store={store} state={s} />
        )}
        {s.reflection && !s.quiz && <ReflectionCard store={store} state={s} />}
        {s.badge && !s.quiz && !s.banner && <BadgeCard key={s.badge.heading} store={store} badge={s.badge} />}
        {s.resume && !s.quiz && !s.appTask && <ResumeCard store={store} resume={s.resume} />}
        {s.spyglass?.full && <Spyglass store={store} spy={s.spyglass} />}
      </SetupContext.Provider>
    </ForkContext.Provider>
  );
}

/** The Seal banner (and other short banners): Onward, and a Seal card for one of the course's Seals. */
function SealBanner({ store, banner }: { store: LearnStore; banner: NonNullable<LearnState['banner']> }) {
  const root = useRef<HTMLDivElement>(null);
  usePadFocus(root, store.closeBanner);
  return (
    <div className="ci-learn-backdrop">
      <div ref={root} className="ci-seal" role="dialog" aria-modal="true" aria-labelledby="ci-seal-title">
        <div className="ci-seal-medal" aria-hidden>
          ⚓
        </div>
        <h2 id="ci-seal-title">{banner.title}</h2>
        <p>{banner.body}</p>
        <span className="ci-seal-actions">
          <button type="button" className="ci-btn primary" onClick={store.closeBanner} autoFocus>
            <kbd>E</kbd> Onward
          </button>
          {chartedIslands().some((i) => i.seal === banner.title) && (
            <button type="button" className="ci-btn ghost" onClick={store.sealCard}>
              Seal card
            </button>
          )}
        </span>
      </div>
    </div>
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
