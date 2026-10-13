import {
  useEffect,
  useRef,
  useSyncExternalStore,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { createRoot } from 'react-dom/client';
import { COLS, CREW_LOOK, CREWS, GATE_COL, ROWS, WHEEL_AT } from '../../game/puzzles/channel-routing/boards';
import { ports, tileLabel } from '../../game/puzzles/channel-routing/logic';
import type { Crew, Flow, Tile } from '../../game/puzzles/channel-routing/types';
import type { ChannelRoutingStore, ChannelRoutingView } from '../../game/puzzles/channel-routing/view';
import './channel-routing.css';

/**
 * P2.1 Channel Routing's overlay (docs/specs/ISLAND-02-thousand-bough.md §5.5): the Gate Board as a
 * schematic you can play with keyboard, mouse, touch or gamepad (the puzzle feeds the pad), invisible
 * hit areas over the 3D tiles, the result in words (never colour alone), and the Spire twist's choice.
 */
const SIDE_XY = [
  [0.5, 0],
  [1, 0.5],
  [0.5, 1],
  [0, 0.5],
] as const;

/** The channel's centre line through a tile, from one open side to the other. */
function channelPath(t: Tile): string | null {
  const p = ports(t);
  if (!p) return null;
  const [a, b] = [0, 1, 2, 3].filter((s) => p & (1 << s)).map((s) => SIDE_XY[s]!);
  if (!a || !b) return null;
  if (t.kind === 'straight') return `M${a[0]} ${a[1]}L${b[0]} ${b[1]}`;
  return `M${a[0]} ${a[1]}Q.5 .5 ${b[0]} ${b[1]}`;
}

interface CellWater {
  crew: Crew | 'mixed';
  /** Order along its flow (for the flowing animation's delay). */
  step: number;
}

function waterMap(flows: readonly Flow[]): Map<string, CellWater> {
  const m = new Map<string, CellWater>();
  for (const f of flows)
    f.cells.forEach(([r, c], i) => {
      const k = `${r},${c}`;
      const mixedHere = f.end === 'mixed' && !!f.at && f.at[0] === r && f.at[1] === c;
      const had = m.get(k);
      m.set(k, { crew: mixedHere || (had && had.crew !== f.crew) ? 'mixed' : f.crew, step: i });
    });
  return m;
}

function TileSvg({ tile, water }: { tile: Tile; water: CellWater | undefined }) {
  const d = channelPath(tile);
  const colour = water ? (water.crew === 'mixed' ? '#7a5a34' : CREW_LOOK[water.crew].colour) : null;
  return (
    <svg className="ci-cr-tile-art" viewBox="0 0 1 1" aria-hidden="true">
      <rect x="0.04" y="0.04" width="0.92" height="0.92" rx="0.1" className="ci-cr-plank" />
      {tile.kind === 'rock' ? (
        <g className="ci-cr-rock">
          <ellipse cx="0.5" cy="0.56" rx="0.34" ry="0.28" />
          <ellipse cx="0.42" cy="0.46" rx="0.15" ry="0.09" className="ci-cr-rock-hi" />
        </g>
      ) : (
        d && (
          <>
            <path d={d} className="ci-cr-trough" />
            <path d={d} className="ci-cr-channel" />
            {colour && (
              <path
                d={d}
                className={`ci-cr-water${water?.crew === 'mixed' ? ' is-mixed' : ''}`}
                style={{ stroke: colour, animationDelay: `${(water?.step ?? 0) * 0.22}s` }}
                pathLength={1}
              />
            )}
          </>
        )
      )}
    </svg>
  );
}

function crewOf(col: number): Crew | null {
  for (const c of CREWS) if (GATE_COL[c] === col) return c;
  return null;
}

function ChannelRouting({ store }: { store: ChannelRoutingStore }) {
  const v: ChannelRoutingView = useSyncExternalStore(store.subscribe, store.get);
  const a = store.actions;
  const press = useRef<{ timer: number; long: boolean } | null>(null);
  const tileRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Keyboard while the board is open: captured before the game's own keys (§5.5).
  useEffect(() => {
    if (!v.open) return;
    const key = (e: KeyboardEvent) => {
      const s = store.get();
      if (!s.open || e.target instanceof HTMLInputElement) return;
      const handled = () => {
        e.preventDefault();
        e.stopImmediatePropagation();
      };
      if (e.code === 'Escape') {
        handled();
        if (!e.repeat) a.leave();
        return;
      }
      if (s.twist) {
        const n = /^Digit\d$/.test(e.code) ? Number(e.code.slice(5)) : Number(e.key);
        if (n >= 1 && n <= s.twist.choices.length) {
          handled();
          if (!e.repeat && !s.busy) a.choose(s.twist.choices[n - 1]!.id);
        } else if (e.code !== 'Tab') handled();
        return;
      }
      if (e.code === 'Tab') return;
      handled();
      if (e.repeat && !/Arrow|Key[WASD]/.test(e.code)) return;
      const cur = s.cursor ?? [0, 1];
      switch (e.code) {
        case 'ArrowUp':
        case 'KeyW':
          return a.move(-1, 0);
        case 'ArrowDown':
        case 'KeyS':
          return a.move(1, 0);
        case 'ArrowLeft':
        case 'KeyA':
          return a.move(0, -1);
        case 'ArrowRight':
        case 'KeyD':
          return a.move(0, 1);
        case 'KeyE':
        case 'Space':
          return a.turn(cur[0], cur[1], e.shiftKey ? -1 : 1);
        case 'KeyF':
        case 'Enter':
          return a.openGates();
        case 'KeyZ':
          return a.undo();
        case 'KeyR':
          return a.reset();
        case 'KeyQ':
          return a.hint();
      }
    };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  }, [v.open, store, a]);

  // Keyboard focus follows the cursor once you're in the grid.
  useEffect(() => {
    if (!v.open || !v.cursor || v.twist) return;
    const el = tileRefs.current[v.cursor[0] * COLS + v.cursor[1]];
    if (el && document.activeElement !== el && document.activeElement?.closest('.ci-cr-grid')) el.focus();
  }, [v.open, v.cursor, v.twist]);

  useEffect(() => {
    document.body.classList.toggle('ci-cr-open', v.open);
    return () => document.body.classList.remove('ci-cr-open');
  }, [v.open]);
  if (!v.open) return null;
  const water = waterMap(v.flows);
  const reached = new Set(v.flows.filter((f) => f.end === 'wheel').map((f) => f.crew));
  const wrongWheel = new Set(v.flows.filter((f) => f.end === 'wrongWheel').map((f) => f.wheel));
  const hall = v.flows.some((f) => f.end === 'mainHall');

  const down = (r: number, c: number) => (e: ReactPointerEvent) => {
    if (e.pointerType !== 'touch') return;
    const p = { timer: 0, long: false };
    p.timer = window.setTimeout(() => {
      p.long = true;
      a.turn(r, c, -1);
    }, 450);
    press.current = p;
  };
  const up = () => {
    if (press.current) window.clearTimeout(press.current.timer);
  };
  const click = (r: number, c: number) => {
    const p = press.current;
    press.current = null;
    if (p?.long) return;
    a.turn(r, c, 1);
  };
  const tileButton = (r: number, c: number, cls: string, style?: CSSProperties) => {
    const t = v.board[r]![c]!;
    const sel = v.cursor?.[0] === r && v.cursor?.[1] === c;
    const pulse = v.pulse?.[0] === r && v.pulse?.[1] === c;
    const main = cls === 'ci-cr-tile';
    return (
      <button
        key={`${cls}-${r}-${c}`}
        ref={main ? (el) => void (tileRefs.current[r * COLS + c] = el) : undefined}
        type="button"
        role={main ? 'gridcell' : undefined}
        tabIndex={main ? 0 : -1}
        className={`${cls}${sel ? ' is-selected' : ''}${pulse ? ' is-pulse' : ''}${t.kind === 'rock' ? ' is-rock' : ''}`}
        style={style}
        aria-label={tileLabel(t, r, c)}
        aria-selected={main ? sel : undefined}
        aria-disabled={v.busy || t.kind === 'rock'}
        data-cell={`${r},${c}`}
        onFocus={main && !sel ? () => a.select(r, c) : undefined}
        onPointerDown={down(r, c)}
        onPointerUp={up}
        onPointerLeave={up}
        onClick={() => click(r, c)}
        onContextMenu={(e) => {
          e.preventDefault();
          a.turn(r, c, -1);
        }}
      >
        {main && <TileSvg tile={t} water={water.get(`${r},${c}`)} />}
      </button>
    );
  };

  return (
    <div className="ci-cr" role="dialog" aria-label="Channel Routing: the Gate Board">
      {v.hits && !v.twist && (
        <div className="ci-cr-hits" aria-hidden="true">
          {v.hits.map((h, i) =>
            h
              ? tileButton(Math.floor(i / COLS), i % COLS, 'ci-cr-hit', {
                  left: h.x - h.size / 2,
                  top: h.y - h.size / 2,
                  width: h.size,
                  height: h.size,
                })
              : null,
          )}
        </div>
      )}
      <section className={`ci-cr-panel${v.twist ? ' is-twist' : ''}`}>
        <header className="ci-cr-head">
          <p className="ci-cr-eyebrow">{v.twist ? 'The Spire' : `Channel Routing · Round ${v.round} of 3`}</p>
          <h2>{v.twist ? 'Why are they stuck?' : 'Give every crew its own channel'}</h2>
        </header>

        {v.twist ? (
          <div className="ci-cr-twist">
            <p className="ci-cr-question">{v.twist.question}</p>
            <ol className="ci-cr-choices">
              {v.twist.choices.map((c, i) => (
                <li key={c.id}>
                  <button
                    type="button"
                    disabled={v.busy}
                    onClick={() => a.choose(c.id)}
                    data-choice={c.id}
                    className={
                      v.twist?.picked?.id === c.id
                        ? v.twist.picked.right
                          ? 'is-right'
                          : 'is-wrong'
                        : undefined
                    }
                  >
                    <kbd>{i + 1}</kbd>
                    <span>{c.text}</span>
                  </button>
                </li>
              ))}
            </ol>
          </div>
        ) : (
          <div className="ci-cr-board">
            <div className="ci-cr-gates" aria-hidden="true">
              {Array.from({ length: COLS }, (_, c) => {
                const crew = crewOf(c);
                if (!crew) return <span key={c} />;
                const look = CREW_LOOK[crew];
                return (
                  <span
                    key={c}
                    className={`ci-cr-gate${v.live[crew] ? '' : ' is-shut'}`}
                    style={{ '--crew': look.colour } as CSSProperties}
                  >
                    <b>{look.icon}</b>
                    <span>{look.name}</span>
                  </span>
                );
              })}
            </div>
            <div className="ci-cr-grid" role="grid" aria-label="Flume tiles, 4 rows by 5 columns">
              {Array.from({ length: ROWS }, (_, r) => (
                <div key={r} role="row" className="ci-cr-row">
                  {Array.from({ length: COLS }, (_, c) => tileButton(r, c, 'ci-cr-tile'))}
                </div>
              ))}
            </div>
            <div className="ci-cr-wheels" aria-hidden="true">
              {WHEEL_AT.map((crew, c) => {
                if (!crew)
                  return (
                    <span key={c} className={`ci-cr-hall${hall ? ' is-wet' : ''}`}>
                      Great Hall
                      <small>main</small>
                    </span>
                  );
                const look = CREW_LOOK[crew];
                return (
                  <span
                    key={c}
                    className={`ci-cr-wheel${reached.has(crew) ? ' is-turning' : ''}${wrongWheel.has(crew) ? ' is-wrong' : ''}`}
                    style={{ '--crew': look.colour } as CSSProperties}
                  >
                    <i className="ci-cr-wheel-icon">☸</i>
                    <b>{look.icon}</b>
                    <span>{look.name}</span>
                  </span>
                );
              })}
            </div>
          </div>
        )}

        {(v.message || !v.twist) && (
          <p className={`ci-cr-message is-${v.message?.tone ?? 'info'}`}>
            {v.message ? (
              <>
                {v.message.crew && <b className="ci-cr-msg-icon">{CREW_LOOK[v.message.crew].icon}</b>}
                {v.message.text}
              </>
            ) : (
              'Turn the tiles so each crew’s water reaches its own wheel, then open the gates.'
            )}
          </p>
        )}

        {!v.twist && (
          <div className="ci-cr-actions">
            <button
              type="button"
              className="ci-cr-go"
              disabled={v.busy || v.phase !== 'routing'}
              onClick={() => a.openGates()}
            >
              Open the gates <kbd>F</kbd>
            </button>
            <div className="ci-cr-small">
              <button
                type="button"
                disabled={v.busy || !v.cursor}
                onClick={() => v.cursor && a.turn(v.cursor[0], v.cursor[1], -1)}
                aria-label="Turn the selected tile anticlockwise"
              >
                ↺
              </button>
              <button
                type="button"
                disabled={v.busy || !v.cursor}
                onClick={() => v.cursor && a.turn(v.cursor[0], v.cursor[1], 1)}
                aria-label="Turn the selected tile clockwise"
              >
                ↻
              </button>
              <button type="button" disabled={v.busy} onClick={() => a.undo()}>
                Undo <kbd>Z</kbd>
              </button>
              <button type="button" disabled={v.busy} onClick={() => a.reset()}>
                Reset <kbd>R</kbd>
              </button>
              <button type="button" onClick={() => a.hint()} aria-label="Ask Wingman for a hint">
                🦜 Hint <kbd>Q</kbd>
              </button>
              <button type="button" onClick={() => a.leave()}>
                Leave <kbd>Esc</kbd>
              </button>
            </div>
          </div>
        )}
        <p className="ci-cr-help" aria-hidden="true">
          {v.twist ? (
            <>
              Press <kbd>1</kbd>–<kbd>{v.twist.choices.length}</kbd> or tap an answer
            </>
          ) : (
            <>
              <kbd>W</kbd>
              <kbd>A</kbd>
              <kbd>S</kbd>
              <kbd>D</kbd> move · <kbd>E</kbd> turn · <kbd>Shift</kbd>+<kbd>E</kbd> turn back · long-press a
              tile to turn it back
            </>
          )}
        </p>
        <div className="ci-cr-live" role="status" aria-live="polite">
          {v.announce}
        </div>
      </section>
    </div>
  );
}

/** Mounts the overlay over the game; returns its unmount. */
export function mountChannelRouting(store: ChannelRoutingStore): () => void {
  const el = document.createElement('div');
  el.className = 'ci-cr-root';
  document.body.appendChild(el);
  const root = createRoot(el);
  root.render(<ChannelRouting store={store} />);
  return () => {
    root.unmount();
    el.remove();
  };
}
