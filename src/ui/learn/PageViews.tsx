import { useEffect, useRef, useState, type PointerEvent, type WheelEvent } from 'react';
import { GLOSSARY, IMAGES, PAGES, courseUrl, imageUrl } from '../../learn/content/index';
import type { LearnState, LearnStore, LogbookTab } from '../../learn/store';
import type { Page } from '../../learn/types';
import { Rich } from './Rich';

function useKeys(handler: (e: KeyboardEvent) => void) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    const fn = (e: KeyboardEvent) => ref.current(e);
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, []);
}

function PageBody({ page, onImage }: { page: Page; onImage?: (id: string) => void }) {
  const img = page.image ? IMAGES.get(page.image) : undefined;
  return (
    <>
      {img && (
        <button
          type="button"
          className="ci-page-image"
          onClick={() => onImage?.(img.id)}
          aria-label={`Enlarge: ${img.alt}`}
        >
          <img src={imageUrl(img.id)} alt={img.alt} />
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
      <a className="ci-course-link" href={courseUrl(page.source)} target="_blank" rel="noopener noreferrer">
        Open in the course ↗
      </a>
    </>
  );
}

export function PageReveal({
  store,
  reveal,
}: {
  store: LearnStore;
  reveal: NonNullable<LearnState['reveal']>;
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
        className="ci-page-card reveal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ci-page-title"
      >
        <p className="ci-page-kicker">{reveal.chest ? 'Treasure! A Logbook page' : 'New Logbook page'}</p>
        <h2 id="ci-page-title">{reveal.page.title}</h2>
        <PageBody page={reveal.page} onImage={(id) => store.inspectImage(id, reveal.page.title)} />
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
    return (
      <button
        type="button"
        className="ci-spyglass"
        onClick={() => store.expandImage()}
        aria-label={`Enlarge: ${img.alt}`}
      >
        <img src={imageUrl(img.id)} alt={img.alt} />
        {spy.caption && (
          <span className="ci-spyglass-caption">
            <Rich text={spy.caption} />
          </span>
        )}
        <span className="ci-spyglass-hint">Click to enlarge</span>
      </button>
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
          <img
            src={imageUrl(img.id)}
            alt={img.alt}
            draggable={false}
            style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.s})` }}
          />
        </div>
        <figcaption>
          {spy.caption && <Rich text={spy.caption} />}
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
];

export function Logbook({ store, state }: { store: LearnStore; state: LearnState }) {
  const { tab, page } = state.logbook;
  const allPages = [...PAGES.values()];
  const open = page ? PAGES.get(page) : undefined;
  useKeys((e) => {
    if (e.repeat || state.spyglass?.full) return;
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
          {TABS.map((t) => (
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
                  {state.pages.length}/{allPages.length}
                </small>
              )}
              {t.id === 'glossary' && (
                <small>
                  {state.glossary.length}/{GLOSSARY.size}
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
          {tab === 'quests' && (
            <ul className="ci-quests">
              {state.quests.length === 0 && (
                <li className="locked">No quests yet. Talk to the harbourmaster.</li>
              )}
              {state.quests.map((q) => (
                <li key={q.id} className={q.done ? 'done' : ''}>
                  <b>{q.done ? '✓' : '◆'}</b>
                  <span>
                    <strong>{q.title}</strong>
                    <small>{q.detail}</small>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
