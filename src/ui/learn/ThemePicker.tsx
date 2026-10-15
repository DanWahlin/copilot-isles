import { useEffect, useMemo, useRef, useState } from 'react';
import type { LearnStore } from '../../learn/store';
import { SAIL_PALETTES, type SailPalette } from '../../world/ship/sail-palettes';

const COLS = 3;
const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;

/**
 * Paint Your Sails (POC §4.4): the palette stand's picker. In the app, the theme lives in Settings →
 * Themes (Chapter 01 · Settings), where the course shows the GitHub theme; here, a palette paints your
 * sails. Only GitHub gets an app-style card: the other palettes are sail colours, with no app-theme
 * claim. Picking a card previews it; Finish keeps it.
 */
export function ThemePicker({ store, selected }: { store: LearnStore; selected: string }) {
  const [query, setQuery] = useState('');
  const grid = useRef<HTMLDivElement>(null);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? SAIL_PALETTES.filter((p) => p.name.toLowerCase().includes(q)) : SAIL_PALETTES;
  }, [query]);
  const current = SAIL_PALETTES.find((p) => p.id === selected) ?? SAIL_PALETTES[0]!;

  useEffect(() => {
    grid.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus();
  }, []);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement | null)?.tagName === 'INPUT';
      if (e.key === 'Escape') {
        e.preventDefault();
        store.closePalette();
      } else if (e.key === 'Enter' || (!typing && e.code === 'KeyE' && !e.repeat)) {
        e.preventDefault();
        store.finishPalette();
      } else if (!typing && e.key.startsWith('Arrow') && shown.length) {
        e.preventDefault();
        const i = Math.max(
          0,
          shown.findIndex((p) => p.id === selected),
        );
        const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -COLS, ArrowDown: COLS }[e.key] ?? 0;
        const next = shown[Math.min(shown.length - 1, Math.max(0, i + step))]!;
        store.previewPalette(next.id);
        grid.current?.querySelector<HTMLButtonElement>(`[data-id="${next.id}"]`)?.focus();
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [store, selected, shown]);

  return (
    <div className="ci-learn-backdrop">
      <div className="ci-palette" role="dialog" aria-modal="true" aria-labelledby="ci-palette-title">
        <div className="ci-palette-side">
          <p className="ci-page-kicker">Paint your sails</p>
          <h2 id="ci-palette-title">
            Pick{' '}
            <span className="ci-palette-glyph" aria-hidden>
              <SailGlyph palette={current} />
            </span>{' '}
            <strong>colours</strong> for your sails.
          </h2>
          <p className="ci-palette-note">
            In the app, select the gear at the bottom of the sidebar, then <strong>Themes</strong>. The course
            shows the <strong>GitHub</strong> theme there.
          </p>
          <p className="ci-palette-aside">
            Here, <strong>GitHub</strong> matches that theme, and the other colours are just for your ship.
            You can repaint any time, here or from the game’s <strong>Settings</strong>.
          </p>
          <div className="ci-palette-actions">
            <button type="button" className="ci-btn primary" onClick={store.finishPalette}>
              Finish <kbd>↵</kbd>
            </button>
            <button type="button" className="ci-btn ghost" onClick={store.closePalette}>
              Back <kbd>Esc</kbd>
            </button>
          </div>
        </div>
        <div className="ci-palette-main">
          <label className="ci-palette-search">
            <span aria-hidden>⌕</span>
            <input
              type="search"
              placeholder="Search palettes…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search palettes"
            />
          </label>
          <div className="ci-palette-grid" role="radiogroup" aria-label="Sail palettes" ref={grid}>
            {shown.map((p) => (
              <PaletteCard
                key={p.id}
                palette={p}
                checked={p.id === selected}
                onPick={() => store.previewPalette(p.id)}
                onFinish={store.finishPalette}
              />
            ))}
            {!shown.length && <p className="ci-palette-empty">No palettes match “{query}”.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

function PaletteCard({
  palette: p,
  checked,
  onPick,
  onFinish,
}: {
  palette: SailPalette;
  checked: boolean;
  onPick: () => void;
  onFinish: () => void;
}) {
  const c = p.card;
  const cloth = hex(p.cloth);
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      data-id={p.id}
      tabIndex={checked ? 0 : -1}
      className={`ci-palette-card${checked ? ' on' : ''}`}
      onClick={onPick}
      onDoubleClick={onFinish}
    >
      {c ? (
        <span className="ci-palette-mock" style={{ background: c.page }} aria-hidden>
          <span className="side" style={{ background: c.sidebar }}>
            <i className="dots" />
            <i style={{ background: c.ink, width: '70%' }} />
            <i style={{ background: c.ink, width: '55%' }} />
            <i style={{ background: c.ink, width: '62%' }} />
            <i className="sel" style={{ background: c.ink }} />
          </span>
          <span className="body">
            <span className="row">
              <i style={{ background: c.accents[0], width: '14%' }} />
              <i style={{ background: c.ink, width: '38%' }} />
              <i style={{ background: c.accents[1], width: '14%', marginLeft: 'auto' }} />
            </span>
            <i style={{ background: c.ink, width: '92%' }} />
            <i style={{ background: c.ink, width: '74%' }} />
            <span className="row">
              <i style={{ background: c.accents[2], width: '18%' }} />
              <i style={{ background: c.accents[2], width: '18%' }} />
            </span>
            <span className="row">
              <i style={{ background: c.accents[3], width: '14%' }} />
              <i style={{ background: c.accents[3], width: '26%' }} />
            </span>
            <i style={{ background: c.ink, width: '80%' }} />
          </span>
          <span className="sail">
            <SailGlyph palette={p} />
          </span>
          <span className="strip">
            {c.strip.map((s, i) => (
              <i key={i} style={{ background: s }} />
            ))}
          </span>
        </span>
      ) : (
        <span
          className="ci-palette-mock sails"
          style={{ background: `radial-gradient(circle at 50% 42%, ${cloth}55, ${cloth}22 70%), #f4efe4` }}
          aria-hidden
        >
          <span className="sail">
            <SailGlyph palette={p} />
          </span>
        </span>
      )}
      <span className="ci-palette-name">
        {p.name}
        {c && <small> · app theme</small>}
      </span>
    </button>
  );
}

/** A little square sail on a yard, in the palette's cloth with its band. */
function SailGlyph({ palette }: { palette: SailPalette }) {
  const cloth = hex(palette.cloth);
  const stripe = hex(palette.stripe);
  return (
    <svg viewBox="0 0 32 32" width="1em" height="1em">
      <path d="M16 2v28" stroke="#6b4a2b" strokeWidth="1.6" />
      <path d="M5 6h22" stroke="#6b4a2b" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M6 7h20q-1.6 8 0 17H6q1.6-9 0-17z" fill={cloth} stroke="rgba(0,0,0,0.35)" strokeWidth="0.8" />
      <path d="M6.3 19.2h19.4v2.6H6.3z" fill={stripe} />
    </svg>
  );
}
