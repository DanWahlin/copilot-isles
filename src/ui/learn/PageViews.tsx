import {
  useContext,
  useEffect,
  useRef,
  useState,
  type PointerEvent,
  type ReactNode,
  type WheelEvent,
} from 'react';
import { STARFISH } from '../../world/starfish/spots';
import { COURSE } from '../../course/catalog';
import { StarfishLog } from './Starfish';
import { CHAPTERS, GLOSSARY, IMAGES, PAGES, courseUrl, imageUrl } from '../../learn/content/index';
import { chapterUrl } from '../../learn/course/chapters';
import { forkName, forkSignLabel, forkUrl, PLACE_LABEL, type ForkPlace } from '../../learn/fork';
import {
  COURSE_BRANCH,
  COURSE_ISSUE,
  COURSE_ISSUE_TITLE,
  modelLabel,
  OS_NAMES,
  type SetupKind,
} from '../../learn/setup';
import {
  chartedIslands,
  type LearnState,
  type LearnStore,
  type LogbookTab,
  type RevealFrom,
} from '../../learn/store';
import type { Page } from '../../learn/types';
import { CourseGlossaryEntry, CourseImg, CourseLink, FromTheCourse, useCourseImage } from './CourseMarkdown';
import { LEARNING, questLogLine } from '../../learn/learning';
import { AppChecklistView, CourseMapView } from './LogbookLearning';
import { ForkContext, Rich, SetupContext, useSetupText } from './Rich';

/** Chapters to look in for a course picture (the one whose folder holds it is tried first). */
const CHAPTER_IDS = CHAPTERS.map((c) => c.chapter);

function useKeys(handler: (e: KeyboardEvent) => void) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    const fn = (e: KeyboardEvent) => ref.current(e);
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, []);
}

const KICKER: Record<RevealFrom, string> = {
  page: 'New Logbook page',
  chest: 'Treasure! A Logbook page',
  bottle: 'A message in a bottle',
};

/**
 * A Logbook page: its picture (live from the course when it still shows it, PLAN §8.3), the
 * authored caption, a live "From the course" excerpt of its section, and the course link.
 */
function PageBody({ page, onImage }: { page: Page; onImage?: (id: string) => void }) {
  const img = page.image ? IMAGES.get(page.image) : undefined;
  const shown = useCourseImage(img, [page.source.chapter, ...CHAPTER_IDS]);
  return (
    <>
      {img && (
        <button
          type="button"
          className="ci-page-image"
          onClick={() => onImage?.(img.id)}
          aria-label={`Enlarge: ${shown?.origin === 'live' && shown.alt ? shown.alt : img.alt}`}
        >
          <CourseImg img={img} resolved={shown} />
        </button>
      )}
      <p className="ci-page-caption">
        <Rich text={page.caption} />
      </p>
      {page.code && (
        <pre className="ci-page-code">
          <code>{page.code}</code>
        </pre>
      )}
      <ForkLinks places={page.fork} />
      <SetupNotes kinds={page.setup} />
      <FromTheCourse source={page.source} />
      <CourseLink source={page.source} fallback={courseUrl(page.source)} />
    </>
  );
}

/** Links into the player's fork for the places this page's course section sends them (once given). */
function ForkLinks({ places }: { places?: readonly ForkPlace[] }) {
  const fork = useContext(ForkContext);
  if (!fork || !places?.length) return null;
  const name = forkName(fork);
  return (
    <p className="ci-fork-links">
      <span className="ci-course-kicker">Open in your fork</span>
      {places.map((p) => (
        <a
          key={p}
          className="ci-fork-link"
          href={forkUrl(fork, p)}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`${p === 'repo' ? name : `${PLACE_LABEL[p]} in ${name}`} on GitHub (opens in a new tab)`}
        >
          {p === 'repo' ? name : PLACE_LABEL[p]} ↗
        </a>
      ))}
    </p>
  );
}

/** The player's own values a page notes under its caption (only the ones they've given). */
function SetupNotes({ kinds }: { kinds?: readonly SetupKind[] }) {
  const { setup, detected } = useContext(SetupContext);
  const notes = (kinds ?? []).flatMap((k): { k: SetupKind; label: string; value: ReactNode }[] => {
    if (k === 'os')
      return [{ k, label: COURSE.setup?.os.label ?? '', value: OS_NAMES[setup.os ?? detected] }];
    if (k === 'issue' && setup.issue !== null)
      return [{ k, label: COURSE.setup?.issue.label ?? '', value: `#${setup.issue} ${COURSE_ISSUE_TITLE}` }];
    if (k === 'branch' && setup.branch !== null)
      return [{ k, label: COURSE.setup?.branch.label ?? '', value: <code>{setup.branch}</code> }];
    if (k === 'model' && setup.model !== null)
      return [{ k, label: COURSE.setup?.model.label ?? '', value: modelLabel(setup.model) }];
    return [];
  });
  if (!notes.length) return null;
  return (
    <ul className="ci-setup-notes">
      {notes.map((n) => (
        <li key={n.k}>
          <span className="ci-course-kicker">{n.label}</span> {n.value}
        </li>
      ))}
    </ul>
  );
}

/**
 * The Logbook's Your setup card: the player's fork, computer, practice issue, session branch, and
 * model, each with a way to add or change it. The one place to change them all later. Its labels are
 * the course's (`setup` in its course.json); a course that asks for none has no card, and one without
 * a practice repository (`practice`) has no fork, issue or branch to note.
 */
export function SetupCard({ store }: { store: LearnStore }) {
  const { setup, detected } = useContext(SetupContext);
  const copy = COURSE.setup;
  if (!copy) return null;
  const practice = !!COURSE.practice;
  const rows: { kind: SetupKind; label: string; value: ReactNode; has: boolean }[] = [
    {
      kind: 'os',
      label: copy.os.label,
      value: setup.os ? OS_NAMES[setup.os] : `${OS_NAMES[detected]} (your browser’s guess)`,
      has: true,
    },
    ...(practice
      ? [
          {
            kind: 'issue' as const,
            label: copy.issue.label,
            value:
              setup.issue !== null ? (
                `#${setup.issue} ${COURSE_ISSUE_TITLE}`
              ) : (
                <>Not added yet. The game uses the course’s #{COURSE_ISSUE} issue by default.</>
              ),
            has: setup.issue !== null,
          },
          {
            kind: 'branch' as const,
            label: copy.branch.label,
            value:
              setup.branch !== null ? (
                <code>{setup.branch}</code>
              ) : (
                <>
                  Not added yet. The game uses <code>{COURSE_BRANCH}</code> by default.
                </>
              ),
            has: setup.branch !== null,
          },
        ]
      : []),
    {
      kind: 'model',
      label: copy.model.label,
      value: setup.model ? modelLabel(setup.model) : 'Not added yet.',
      has: setup.model !== null,
    },
  ];
  return (
    <section className="ci-setup-card" aria-labelledby="ci-setup-card-title">
      <h3 id="ci-setup-card-title">Your setup</h3>
      <p className="ci-setup-card-note">
        All optional. It stays on this device, in your save, and you can change it here any time.
      </p>
      {practice && <ForkCard store={store} />}
      {rows.map((r) => (
        <div key={r.kind} className="ci-fork-card ci-setup-row" data-kind={r.kind}>
          <p>
            <span className="ci-course-kicker">{r.label}</span> {r.value}
          </p>
          <button
            type="button"
            className="ci-btn ghost"
            aria-label={`${r.has ? 'Change' : 'Add'} ${r.label.toLowerCase()}`}
            onClick={() => void store.askSetup(r.kind, 'logbook')}
          >
            {r.has ? 'Change' : 'Add'}
          </button>
        </div>
      ))}
    </section>
  );
}

/** The Logbook's note of the player's fork, with a way to add or change it. */
function ForkCard({ store }: { store: LearnStore }) {
  const fork = useContext(ForkContext);
  const sign = forkSignLabel();
  return (
    <div className="ci-fork-card">
      {fork ? (
        <p>
          <span className="ci-course-kicker">Your fork</span>{' '}
          <a
            className="ci-rich-link"
            href={forkUrl(fork)}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`${forkName(fork)} on GitHub (opens in a new tab)`}
          >
            {forkName(fork)} ↗
          </a>
        </p>
      ) : (
        <p>
          <span className="ci-course-kicker">Your fork</span> Not added yet. Add it to see{' '}
          {sign && (
            <>
              your own <code>{sign}</code> line at the crane and{' '}
            </>
          )}
          links into your fork.
        </p>
      )}
      <button type="button" className="ci-btn ghost" onClick={() => void store.askFork('logbook')}>
        {fork ? 'Change' : 'Add your fork'}
      </button>
    </div>
  );
}

/** The course's own words for a spyglass picture: its alt text and the section that shows it. */
function SpyglassCourseNote({
  alt,
  chapter,
  anchor,
}: {
  alt: string | null;
  chapter: string;
  anchor: string;
}) {
  return (
    <span className="ci-spyglass-course">
      <span className="ci-course-kicker">From the course</span>
      {alt && <span> · {alt}</span>}{' '}
      <a
        className="ci-rich-link"
        href={chapterUrl(chapter, anchor)}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Open in the course (opens in a new tab)"
      >
        Open in the course ↗
      </a>
    </span>
  );
}

export function PageReveal({
  store,
  reveal,
  firstTime = false,
}: {
  store: LearnStore;
  reveal: NonNullable<LearnState['reveal']>;
  /** The player hasn't opened the Logbook yet, so say where the page goes and how to get back to it. */
  firstTime?: boolean;
}) {
  useKeys((e) => {
    if (e.repeat || store.getState().spyglass?.full) return;
    if (e.key === 'Enter' || e.key === 'Escape' || e.code === 'KeyE') {
      e.preventDefault();
      store.closeReveal();
    }
  });
  return (
    <div className="ci-learn-backdrop">
      <article
        className={`ci-page-card reveal from-${reveal.from}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="ci-page-title"
      >
        <p className="ci-page-kicker">{KICKER[reveal.from]}</p>
        <h2 id="ci-page-title">{reveal.page.title}</h2>
        <PageBody page={reveal.page} onImage={(id) => store.inspectImage(id, reveal.page.title)} />
        {firstTime && (
          <p className="ci-page-tip">
            Pages you collect are kept in your Logbook. Press <kbd>J</kbd> any time to read this one again.
          </p>
        )}
        <footer className="ci-page-foot">
          {reveal.doubloons > 0 && <span className="ci-coin big">+{reveal.doubloons} doubloons</span>}
          <button type="button" className="ci-btn primary" onClick={store.closeReveal} autoFocus>
            <kbd>E</kbd> Stow it in the Logbook
          </button>
        </footer>
      </article>
    </div>
  );
}

/** The spyglass: a framed course image above the dialogue, or full screen with pan and zoom. */
export function Spyglass({ store, spy }: { store: LearnStore; spy: NonNullable<LearnState['spyglass']> }) {
  const img = IMAGES.get(spy.image);
  const shown = useCourseImage(img, CHAPTER_IDS);
  const alt = shown?.origin === 'live' && shown.alt ? shown.alt : (img?.alt ?? '');
  const note = shown?.chapter && shown.anchor && (
    <SpyglassCourseNote alt={shown.alt} chapter={shown.chapter} anchor={shown.anchor} />
  );
  const [view, setView] = useState({ s: 1, x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null);
  useEffect(() => setView({ s: 1, x: 0, y: 0 }), [spy.image, spy.full]);
  useKeys((e) => {
    if (spy.full && e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      store.expandImage(false);
    }
  });
  if (!img) return null;
  if (!spy.full) {
    // The caption sits outside the enlarge button so its course links stay separately clickable.
    return (
      <div className="ci-spyglass">
        <button
          type="button"
          className="ci-spyglass-open"
          onClick={() => store.expandImage()}
          aria-label={`Enlarge: ${alt}`}
        >
          <CourseImg img={img} resolved={shown} />
        </button>
        {spy.caption && (
          <span className="ci-spyglass-caption">
            <Rich text={spy.caption} />
          </span>
        )}
        {note}
        <span className="ci-spyglass-hint">Click the picture to enlarge</span>
      </div>
    );
  }
  const wheel = (e: WheelEvent) => {
    const s = Math.min(4, Math.max(1, view.s * (e.deltaY < 0 ? 1.15 : 1 / 1.15)));
    setView(s === 1 ? { s, x: 0, y: 0 } : { ...view, s });
  };
  const down = (e: PointerEvent) => {
    (e.target as Element).setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y };
  };
  const move = (e: PointerEvent) => {
    const d = drag.current;
    if (!d || view.s === 1) return;
    setView({ ...view, x: d.vx + e.clientX - d.x, y: d.vy + e.clientY - d.y });
  };
  return (
    <div
      className="ci-learn-backdrop dark"
      onClick={(e) => e.target === e.currentTarget && store.expandImage(false)}
    >
      <figure className="ci-spyglass-full">
        <div
          className="ci-spyglass-stage"
          onWheel={wheel}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={() => (drag.current = null)}
          onDoubleClick={() => setView({ s: 1, x: 0, y: 0 })}
        >
          <CourseImg
            img={img}
            resolved={shown}
            draggable={false}
            style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.s})` }}
          />
        </div>
        <figcaption>
          {spy.caption && <Rich text={spy.caption} />}
          {note}
          <span className="ci-spyglass-hint">Wheel to zoom · drag to pan · Esc to close</span>
        </figcaption>
        <button
          type="button"
          className="ci-quiz-close"
          onClick={() => store.expandImage(false)}
          aria-label="Close (Esc)"
        >
          ×
        </button>
      </figure>
    </div>
  );
}

const TABS: { id: LogbookTab; label: string }[] = [
  { id: 'pages', label: 'Pages' },
  { id: 'glossary', label: 'Glossary' },
  { id: 'quests', label: 'Quests' },
  { id: 'map', label: 'Course map' },
  { id: 'app', label: 'App checklist' },
  { id: 'starfish', label: 'Starfish' },
];

/** The tabs this course has: the Course map needs objectives, a reflection or a Seal; the checklist app tasks. */
function logbookTabs(): { id: LogbookTab; label: string }[] {
  const l = LEARNING.file;
  return TABS.flatMap((t) => {
    if (t.id === 'app') return l.appTasks.length ? [{ ...t, label: l.labels.checklist || t.label }] : [];
    if (t.id === 'map')
      return l.objectives.length || l.reflections.length || chartedIslands().some((i) => i.seal) ? [t] : [];
    return [t];
  });
}

export function Logbook({ store, state }: { store: LearnStore; state: LearnState }) {
  const { tab, page } = state.logbook;
  const allPages = [...PAGES.values()];
  const open = page ? PAGES.get(page) : undefined;
  const fill = useSetupText();
  useKeys((e) => {
    const now = store.getState();
    if (e.repeat || state.spyglass?.full || now.forkForm || now.setupForm || now.appTask || now.badge) return;
    if (e.key === 'Escape' || e.code === 'KeyJ') {
      e.preventDefault();
      if (open) store.openLogbook(tab, null);
      else store.closeLogbook();
    }
  });
  return (
    <div className="ci-learn-backdrop">
      <section className="ci-logbook" role="dialog" aria-modal="true" aria-label="Logbook">
        <header className="ci-logbook-head">
          <h2>Captain’s Logbook</h2>
          <span className="ci-coin big" title="Doubloons">
            {state.doubloons}
          </span>
          <button
            type="button"
            className="ci-quiz-close"
            onClick={store.closeLogbook}
            aria-label="Close (J or Esc)"
          >
            ×
          </button>
        </header>
        <nav className="ci-logbook-tabs" role="tablist">
          {logbookTabs().map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              className={tab === t.id ? 'on' : ''}
              onClick={() => store.openLogbook(t.id)}
            >
              {t.label}
              {t.id === 'pages' && (
                <small>
                  {allPages.filter((p) => state.pages.includes(p.id)).length}/{allPages.length}
                </small>
              )}
              {t.id === 'glossary' && (
                <small>
                  {state.glossary.length}/{GLOSSARY.size}
                </small>
              )}
              {t.id === 'starfish' && (
                <small>
                  {STARFISH.filter((f) => state.starfish.includes(f.id)).length}/{STARFISH.length}
                </small>
              )}
              {t.id === 'app' && (
                <small>
                  {LEARNING.file.appTasks.filter((a) => state.appTasks[a.id]?.status === 'done').length}/
                  {LEARNING.file.appTasks.length}
                </small>
              )}
            </button>
          ))}
        </nav>
        <div className="ci-logbook-body">
          {tab === 'pages' && open && (
            <article className="ci-page-card inline">
              <button type="button" className="ci-btn ghost back" onClick={() => store.openLogbook('pages')}>
                ← All pages
              </button>
              <h2>{open.title}</h2>
              <PageBody page={open} onImage={(id) => store.inspectImage(id, open.title)} />
            </article>
          )}
          {tab === 'pages' && !open && (
            <ul className="ci-page-grid">
              {allPages.map((p) => {
                const have = state.pages.includes(p.id);
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      className={`ci-page-tile ${have ? '' : 'locked'}`}
                      disabled={!have}
                      onClick={() => store.openLogbook('pages', p.id)}
                    >
                      {have && p.image ? (
                        <img src={imageUrl(p.image)} alt="" />
                      ) : (
                        <span className="ci-page-glyph">{have ? '❦' : '?'}</span>
                      )}
                      <span>{have ? p.title : 'Undiscovered'}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {tab === 'glossary' && (
            <dl className="ci-glossary">
              {[...GLOSSARY.values()].map((g) =>
                state.glossary.includes(g.id) ? (
                  <div key={g.id}>
                    <dt>{g.term}</dt>
                    <dd>{g.definition}</dd>
                    <CourseGlossaryEntry term={g.term} />
                  </div>
                ) : (
                  <div key={g.id} className="locked">
                    <dt>? ? ?</dt>
                    <dd>Not learned yet.</dd>
                  </div>
                ),
              )}
            </dl>
          )}
          {tab === 'starfish' && (
            <StarfishLog found={state.starfish} here={state.starfishIsland?.id ?? null} />
          )}
          {tab === 'map' && <CourseMapView store={store} state={state} />}
          {tab === 'app' && <AppChecklistView store={store} state={state} />}
          {tab === 'quests' && <SetupCard store={store} />}
          {tab === 'quests' && (
            <ul className="ci-quests">
              {state.quests.length === 0 && (
                <li className="locked">No quests yet. Talk to the harbourmaster.</li>
              )}
              {state.quests.map((q) => {
                // A finished quest only claims its app work once the player's confirmed it.
                const log = q.done ? questLogLine(q.id, q.detail, state.appTasks) : null;
                return (
                  <li key={q.id} className={q.done ? 'done' : ''} data-quest={q.id}>
                    <b>{q.done ? '✓' : '◆'}</b>
                    <span>
                      <strong>{q.title}</strong>
                      <small>{fill(log?.line ?? q.detail)}</small>
                      {log?.app === 'done' && (
                        <small className="ci-lj-applabel done">
                          <span aria-hidden>✓</span> Done in the app
                        </small>
                      )}
                      {log?.app === 'open' && (
                        <button
                          type="button"
                          className="ci-lj-applabel open"
                          onClick={() => store.openLogbook('app')}
                        >
                          {`Not ticked in your ${LEARNING.file.labels.checklist || 'checklist'} yet`}
                        </button>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
