import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { NAME_MAX, cleanName, defaultShipName } from '../learn/progress';
import { DEFAULT_SAIL_PALETTE, SAIL_PALETTES } from '../world/ship/sail-palettes';
import type {
  CaptainBody,
  ChartData,
  ChartIsland,
  ChartPoint,
  GameBridge,
  QualitySetting,
  SubtitleSize,
  UiState,
} from './bridge';
import { ARCH_H, ARCH_W, ARCHIPELAGO } from './chart/archipelago';
import { ArchipelagoMap, CompassRose, Parchment } from './chart/ArchipelagoMap';
import { IslandCard } from './chart/IslandCard';

interface TitleMenuProps {
  bridge: GameBridge;
}

type ChartMode = 'archipelago' | 'island';

const FALLBACK_CHART: ChartData = {
  islands: ARCHIPELAGO,
  island: {
    id: 'anchorage',
    name: 'Anchorage Cay',
    coast: [
      [
        [0.2, 0.58],
        [0.25, 0.41],
        [0.39, 0.28],
        [0.61, 0.26],
        [0.78, 0.39],
        [0.73, 0.61],
        [0.55, 0.73],
        [0.34, 0.72],
      ],
      [
        [0.36, 0.55],
        [0.42, 0.45],
        [0.57, 0.43],
        [0.63, 0.53],
        [0.56, 0.61],
        [0.43, 0.62],
      ],
    ],
    reef: [
      [
        [0.12, 0.63],
        [0.21, 0.34],
        [0.47, 0.16],
        [0.82, 0.31],
        [0.85, 0.66],
        [0.55, 0.84],
        [0.24, 0.78],
      ],
    ],
    points: [
      { id: 'harbor', label: 'Driftwood Landing', x: 0.27, y: 0.54, kind: 'harbor' },
      { id: 'lighthouse', label: 'Point Lighthouse', x: 0.75, y: 0.36, kind: 'landmark' },
      { id: 'beach', label: 'Lagoon Beach', x: 0.46, y: 0.72, kind: 'beach' },
      { id: 'village', label: 'Harbormaster Nell', x: 0.35, y: 0.48, kind: 'quest' },
    ],
  },
  player: { x: 0.29, y: 0.55, heading: Math.PI * 0.82, onShip: false },
};

export function TitleMenu({ bridge }: TitleMenuProps) {
  const state = useBridgeState(bridge);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const id = window.setTimeout(() => initialFocusable(root)?.focus(), 60);
    return () => window.clearTimeout(id);
  }, [state.screen]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      // While playing, the game's input layer owns Esc (pause) and M (chart).
      if (state.screen === 'playing') return;
      if (event.key === 'Escape') {
        if (state.screen === 'paused') bridge.resume();
        else if (state.screen !== 'title' && state.screen !== 'captain' && state.screen !== 'voyage-loading')
          bridge.back();
      }
      if (event.key.toLowerCase() === 'm') {
        if (state.screen === 'chart') bridge.back();
        else if (state.screen === 'paused') bridge.openChart();
      }
      const target = event.target instanceof HTMLElement ? event.target : null;
      const editing = target?.matches('input, select, textarea') ?? false;
      if (!editing && (event.key === 'ArrowDown' || event.key === 'ArrowUp') && rootRef.current) {
        const focusables = focusable(rootRef.current);
        if (focusables.length === 0) return;
        event.preventDefault();
        const current =
          document.activeElement instanceof HTMLElement ? focusables.indexOf(document.activeElement) : -1;
        const delta = event.key === 'ArrowDown' ? 1 : -1;
        focusables[(current + delta + focusables.length) % focusables.length].focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [bridge, state.screen]);

  return (
    <div ref={rootRef} className={`ci-ui ci-screen-${state.screen}`} aria-live="polite">
      {state.screen === 'title' && <TitleScreen state={state} bridge={bridge} />}
      {state.screen === 'title' && <TitleHint />}
      {state.screen === 'captain' && <CaptainSelect bridge={bridge} current={state.captain} />}
      {state.screen === 'voyage-loading' && <VoyageLoading state={state} />}
      {state.screen === 'paused' && <PausedScreen state={state} bridge={bridge} />}
      {state.screen === 'chart' && <ChartScreen state={state} bridge={bridge} />}
      {state.screen === 'settings' && <SettingsScreen state={state} bridge={bridge} />}
      {state.screen === 'controls' && <ControlsScreen bridge={bridge} />}
      {state.screen === 'credits' && <CreditsScreen bridge={bridge} />}
    </div>
  );
}

function useBridgeState(bridge: GameBridge): UiState {
  return useSyncExternalStore(bridge.subscribe, bridge.getState, bridge.getState);
}

function TitleScreen({ state, bridge }: { state: UiState; bridge: GameBridge }) {
  return (
    <main className="ci-title-shell" aria-labelledby="title-wordmark">
      <div className="ci-wordmark-block">
        <p className="ci-kicker">A browser island adventure</p>
        <h1 id="title-wordmark">COPILOT ISLES</h1>
        <p className="ci-subtitle">Learn the GitHub Copilot app, one island at a time</p>
      </div>
      <nav className="ci-menu-list" aria-label="Main menu">
        <MenuButton onClick={bridge.chooseCaptain} initial={!state.hasSave}>
          New Voyage
        </MenuButton>
        {state.hasSave && (
          <MenuButton
            onClick={bridge.continueVoyage}
            detail={`${state.save?.questsDone ?? 0} quests done`}
            initial
          >
            Continue · {state.save?.location ?? 'Anchorage Cay'}
          </MenuButton>
        )}
        <MenuButton onClick={bridge.openChart}>Chart</MenuButton>
        <MenuButton onClick={bridge.openSettings}>Settings</MenuButton>
        <MenuButton onClick={bridge.openControls}>Controls</MenuButton>
        <MenuButton onClick={bridge.openCredits}>Credits</MenuButton>
      </nav>
    </main>
  );
}

function TitleHint() {
  return (
    <p className="ci-title-hint" aria-hidden="true">
      <svg viewBox="0 0 24 24">
        <path d="M8 13V6.5a1.5 1.5 0 0 1 3 0V12m0-1.5v-6a1.5 1.5 0 0 1 3 0V12m0-5.5a1.5 1.5 0 0 1 3 0V13m0-3a1.5 1.5 0 0 1 3 0v5a6 6 0 0 1-6 6h-1.2a6 6 0 0 1-4.9-2.5L5 15.5a1.6 1.6 0 0 1 2.6-1.9L8 14" />
      </svg>
      Drag the sea to look around · scroll to zoom
    </p>
  );
}

function CaptainSelect({ bridge, current }: { bridge: GameBridge; current: CaptainBody }) {
  const [captain, setCaptain] = useState<CaptainBody>(current);
  const [name, setName] = useState('');
  const [ship, setShip] = useState<string | null>(null);
  const shipShown = ship ?? defaultShipName(cleanName(name));
  const start = () => bridge.newVoyage(captain, { captain: name, ship: shipShown });
  return (
    <OverlayShell title="Choose your captain" eyebrow="New voyage" onBack={bridge.back}>
      <div className="ci-captain-grid" role="radiogroup" aria-label="Captain body">
        <CaptainCard id="man" title="Captain" selected={captain === 'man'} onSelect={setCaptain} />
        <CaptainCard id="woman" title="Captain Anne" selected={captain === 'woman'} onSelect={setCaptain} />
      </div>
      <form
        className="ci-name-fields"
        onSubmit={(e) => {
          e.preventDefault();
          start();
        }}
      >
        <label className="ci-name-field">
          <span>Your name</span>
          <input
            type="text"
            value={name}
            maxLength={NAME_MAX}
            placeholder="What should the crew call you?"
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => setName(e.currentTarget.value)}
          />
        </label>
        <label className="ci-name-field">
          <span>Your ship</span>
          <input
            type="text"
            value={shipShown}
            maxLength={NAME_MAX}
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => setShip(e.currentTarget.value)}
          />
          <small>Nell christens her with this name before you sail.</small>
        </label>
        <button type="submit" hidden aria-hidden tabIndex={-1} />
      </form>
      <div className="ci-panel-actions">
        <button className="ci-primary" onClick={start}>
          Set sail
        </button>
        <button className="ci-secondary" onClick={bridge.back}>
          Back
        </button>
      </div>
    </OverlayShell>
  );
}

function CaptainCard({
  id,
  title,
  selected,
  onSelect,
}: {
  id: CaptainBody;
  title: string;
  selected: boolean;
  onSelect: (id: CaptainBody) => void;
}) {
  return (
    <button
      className={`ci-captain-card ${selected ? 'selected' : ''}`}
      role="radio"
      aria-checked={selected}
      onClick={() => onSelect(id)}
    >
      <CaptainPortrait body={id} />
      <span>{title}</span>
      <small>{id === 'man' ? 'Tricorn, blue coat, steady hand' : 'Bandana, sharp eyes, quick smile'}</small>
    </button>
  );
}

function CaptainPortrait({ body }: { body: CaptainBody }) {
  const hair = body === 'man' ? '#2a1d17' : '#6a2a1f';
  return (
    <svg className="ci-portrait" viewBox="0 0 180 180" aria-hidden="true">
      <defs>
        <linearGradient id={`coat-${body}`} x1="0" x2="1">
          <stop offset="0" stopColor={body === 'man' ? '#123656' : '#11474f'} />
          <stop offset="1" stopColor={body === 'man' ? '#245d7d' : '#1a6a65'} />
        </linearGradient>
      </defs>
      <circle cx="90" cy="90" r="78" fill="rgba(232,200,138,.13)" />
      <path d="M48 150c9-35 74-35 84 0" fill={`url(#coat-${body})`} />
      <circle cx="90" cy="72" r="31" fill="#c88a62" />
      <path d="M62 67c12-23 48-25 61-1-12-8-48-8-61 1z" fill={hair} />
      <path d="M55 51h70l10 12H45z" fill={body === 'man' ? '#111a22' : '#8a1f2d'} />
      <path d="M73 85c10 8 25 8 35 0" fill="none" stroke="#4b2118" strokeWidth="4" strokeLinecap="round" />
      <path d="M75 73h1M105 73h1" stroke="#10151b" strokeWidth="7" strokeLinecap="round" />
    </svg>
  );
}

function VoyageLoading({ state }: { state: UiState }) {
  const [shown, setShown] = useState(state.progress.value);
  useEffect(() => {
    const id = window.setInterval(() => {
      setShown((value) => {
        const target = state.progress.value >= 1 ? 1 : Math.min(0.985, state.progress.value + 0.045);
        return value >= target ? value : Math.min(target, value + 0.012);
      });
    }, 80);
    return () => window.clearInterval(id);
  }, [state.progress.value]);
  const pct = Math.round(shown * 100);
  return (
    <main className="ci-loading" role="status" aria-label="Loading voyage">
      <ChartMedallion progress={shown} />
      <h2>{state.progress.message}</h2>
      <div className="ci-progress" aria-label={`Loading ${pct}%`}>
        <span style={{ transform: `scaleX(${shown})` }} />
      </div>
      <p>{pct}%</p>
    </main>
  );
}

function PausedScreen({ state, bridge }: { state: UiState; bridge: GameBridge }) {
  const seals = state.learn.seals.length ? state.learn.seals.join(' · ') : 'No seal yet';
  const who = [state.learn.captainName && `Captain ${state.learn.captainName}`, state.learn.shipName]
    .filter(Boolean)
    .join(' · ');
  return (
    <OverlayShell title="Paused" eyebrow={who || 'Voyage menu'} className="ci-pause" hideBack>
      <p className="ci-pause-progress">
        {state.learn.doubloons} doubloons · {seals}
      </p>
      <nav className="ci-menu-list compact" aria-label="Pause menu">
        <MenuButton onClick={bridge.resume}>Resume</MenuButton>
        <MenuButton onClick={bridge.openChart}>Chart</MenuButton>
        <MenuButton onClick={bridge.openLogbook}>Logbook</MenuButton>
        <MenuButton onClick={bridge.openSettings}>Settings</MenuButton>
        <MenuButton onClick={bridge.openControls}>Controls</MenuButton>
        <MenuButton onClick={bridge.quitToTitle}>Quit to title</MenuButton>
      </nav>
    </OverlayShell>
  );
}

function ChartScreen({ state, bridge }: { state: UiState; bridge: GameBridge }) {
  const chart = state.chart ?? FALLBACK_CHART;
  const islands = chart.islands.length ? chart.islands : ARCHIPELAGO;
  const [mode, setMode] = useState<ChartMode>('archipelago');
  const [selectedPoint, setSelectedPoint] = useState<ChartPoint | null>(null);
  const [selectedIsland, setSelectedIsland] = useState<ChartIsland | null>(
    islands.find((island) => island.status === 'current') ?? islands[0] ?? null,
  );

  return (
    <OverlayShell
      title="Captain’s Chart"
      eyebrow={mode === 'archipelago' ? 'Archipelago' : chart.island.name}
      onBack={bridge.back}
      wide
      className="ci-chart-panel"
    >
      <div className="ci-chart-toolbar">
        <button className={mode === 'archipelago' ? 'active' : ''} onClick={() => setMode('archipelago')}>
          Archipelago
        </button>
        <button className={mode === 'island' ? 'active' : ''} onClick={() => setMode('island')}>
          Island detail
        </button>
      </div>
      <div className={`ci-chart ${mode === 'island' ? 'zoomed' : 'archipelago'}`}>
        <div className="ci-chart-map">
          <svg
            viewBox={`0 0 ${ARCH_W} ${ARCH_H}`}
            preserveAspectRatio="xMidYMid meet"
            role="group"
            aria-label={
              mode === 'archipelago' ? 'Chart of the Copilot Isles' : `Chart of ${chart.island.name}`
            }
          >
            <Parchment w={ARCH_W} h={ARCH_H} />
            {mode === 'archipelago' ? (
              <ArchipelagoMap
                islands={islands}
                selected={selectedIsland}
                onSelect={setSelectedIsland}
                onOpen={() => setMode('island')}
              />
            ) : (
              <IslandSvg chart={chart} selectedPoint={selectedPoint} onSelectPoint={setSelectedPoint} />
            )}
          </svg>
        </div>
        <div className="ci-chart-side" aria-live="polite">
          {mode === 'archipelago' && selectedIsland && (
            <IslandCard island={selectedIsland} islands={islands} onOpen={() => setMode('island')} />
          )}
          {mode === 'island' && (
            <IslandDetailSide
              points={chart.island.points}
              selectedPoint={selectedPoint}
              onSelectPoint={setSelectedPoint}
              onTravel={(point) => bridge.travelTo(point.id)}
            />
          )}
        </div>
      </div>
    </OverlayShell>
  );
}

interface IslandFrame {
  minX: number;
  minY: number;
  spanX: number;
  spanY: number;
}

function IslandSvg({
  chart,
  selectedPoint,
  onSelectPoint,
}: {
  chart: ChartData;
  selectedPoint: ChartPoint | null;
  onSelectPoint: (point: ChartPoint) => void;
}) {
  const frame = islandFrame(chart);
  const project = (x: number, y: number) => projectIslandPoint(frame, x, y);
  return (
    <g className="ci-island-detail">
      <CompassRose x={ARCH_W - 110} y={118} r={48} />
      {chart.island.reef.map((ring, index) => (
        <path key={`reef-${index}`} className="reef" d={ringPath(ring, frame)} />
      ))}
      {chart.island.coast.map((ring, index) => (
        <path key={`coast-${index}`} className="coast" d={ringPath(ring, frame)} />
      ))}
      {chart.island.points.map((point) => {
        const pos = project(point.x, point.y);
        const offset = pointLabelOffset(point.id);
        return (
          <g
            key={point.id}
            tabIndex={0}
            role="button"
            className={`ci-chart-point ${point.kind} ${selectedPoint?.id === point.id ? 'selected' : ''}`}
            onClick={() => onSelectPoint(point)}
            onKeyDown={(event) => event.key === 'Enter' && onSelectPoint(point)}
            aria-label={point.label}
          >
            <line
              className="leader"
              x1={pos.x}
              y1={pos.y}
              x2={pos.x + offset.x * 0.82}
              y2={pos.y + offset.y * 0.82}
            />
            <circle cx={pos.x} cy={pos.y} r="8" />
            <text x={pos.x + offset.x} y={pos.y + offset.y} textAnchor={offset.anchor ?? 'start'}>
              {point.label}
            </text>
          </g>
        );
      })}
      {chart.player && (
        <g
          transform={`translate(${project(chart.player.x, chart.player.y).x} ${project(chart.player.x, chart.player.y).y}) rotate(${(chart.player.heading * 180) / Math.PI})`}
          className="ci-player-marker"
        >
          <path d="M0 -17l8 24-8-5-8 5z" />
          <circle r="3" />
        </g>
      )}
    </g>
  );
}

function islandFrame(chart: ChartData): IslandFrame {
  const points: [number, number][] = [];
  for (const ring of [...chart.island.coast, ...chart.island.reef]) points.push(...ring);
  for (const point of chart.island.points) points.push([point.x, point.y]);
  if (chart.player) points.push([chart.player.x, chart.player.y]);
  let minX = 1,
    maxX = 0,
    minY = 1,
    maxY = 0;
  for (const [x, y] of points) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  const padX = Math.max(0.025, (maxX - minX) * 0.035);
  const padY = Math.max(0.025, (maxY - minY) * 0.035);
  minX -= padX;
  maxX += padX;
  minY -= padY;
  maxY += padY;
  return { minX, minY, spanX: Math.max(0.001, maxX - minX), spanY: Math.max(0.001, maxY - minY) };
}

/** Chart → SVG, one scale for both axes (no stretching), centred in the parchment's inner frame. */
function projectIslandPoint(frame: IslandFrame, x: number, y: number): { x: number; y: number } {
  const box = { x: 90, y: 60, w: ARCH_W - 180, h: ARCH_H - 120 };
  const k = Math.min(box.w / frame.spanX, box.h / frame.spanY);
  return {
    x: box.x + (box.w - frame.spanX * k) / 2 + (x - frame.minX) * k,
    y: box.y + (box.h - frame.spanY * k) / 2 + (y - frame.minY) * k,
  };
}

function pointLabelOffset(id: string): { x: number; y: number; anchor?: 'start' | 'end' | 'middle' } {
  switch (id) {
    case 'pier':
      return { x: -82, y: -56, anchor: 'end' };
    case 'harbor':
      return { x: -96, y: -10, anchor: 'end' };
    case 'plaza':
    case 'village':
      return { x: -84, y: 56, anchor: 'end' };
    case 'nell':
      return { x: 108, y: 50 };
    case 'beach':
      return { x: 0, y: 70, anchor: 'middle' };
    case 'lighthouse':
      return { x: 94, y: -62 };
    case 'hill':
      return { x: 86, y: 34 };
    default:
      return { x: 18, y: 6 };
  }
}

function SettingsScreen({ state, bridge }: { state: UiState; bridge: GameBridge }) {
  const settings = state.settings;
  return (
    <OverlayShell title="Settings" eyebrow="Ship’s instruments" onBack={bridge.back} wide>
      <div className="ci-settings-grid">
        <SettingsGroup title="Audio">
          <Slider
            label="Master"
            value={settings.master}
            onChange={(master) => bridge.updateSettings({ master })}
          />
          <Slider
            label="Music"
            value={settings.music}
            onChange={(music) => bridge.updateSettings({ music })}
          />
          <Slider
            label="Ambience"
            value={settings.ambience}
            onChange={(ambience) => bridge.updateSettings({ ambience })}
          />
          <Slider label="SFX" value={settings.sfx} onChange={(sfx) => bridge.updateSettings({ sfx })} />
          <Slider
            label="Voice"
            value={settings.voice}
            onChange={(voice) => bridge.updateSettings({ voice })}
          />
        </SettingsGroup>
        <SettingsGroup title="Graphics">
          <Select
            label="Quality"
            value={settings.quality}
            options={['auto', 'lite', 'low', 'medium', 'high', 'ultra']}
            names={QUALITY_NAMES}
            onChange={(quality) => bridge.updateSettings({ quality: quality as QualitySetting })}
          />
          <Toggle
            label="Reduced motion"
            checked={settings.reducedMotion}
            onChange={(reducedMotion) => bridge.updateSettings({ reducedMotion })}
          />
        </SettingsGroup>
        <SettingsGroup title="Controls">
          <Slider
            label="Mouse sensitivity"
            value={settings.mouseSensitivity}
            min={0.4}
            max={2}
            step={0.05}
            onChange={(mouseSensitivity) => bridge.updateSettings({ mouseSensitivity })}
          />
          <Toggle
            label="Invert Y"
            checked={settings.invertY}
            onChange={(invertY) => bridge.updateSettings({ invertY })}
          />
        </SettingsGroup>
        <SettingsGroup title="Accessibility">
          <Toggle
            label="Subtitles"
            checked={settings.subtitles}
            onChange={(subtitles) => bridge.updateSettings({ subtitles })}
          />
          <Select
            label="Subtitle size"
            value={settings.subtitleSize}
            options={['s', 'm', 'l']}
            names={SUBTITLE_NAMES}
            onChange={(subtitleSize) => bridge.updateSettings({ subtitleSize: subtitleSize as SubtitleSize })}
          />
        </SettingsGroup>
        {(state.hasSave || state.returnTo === 'paused') && (
          <SettingsGroup title="Your sails" wide>
            <SailSwatches
              value={state.learn.sails ?? DEFAULT_SAIL_PALETTE}
              onChange={(id) => bridge.setSails(id)}
            />
          </SettingsGroup>
        )}
      </div>
      <footer className="ci-render-info">{state.renderInfo}</footer>
    </OverlayShell>
  );
}

function ControlsScreen({ bridge }: { bridge: GameBridge }) {
  return (
    <OverlayShell title="Controls" eyebrow="Captain’s reference" onBack={bridge.back} wide>
      <div className="ci-controls-grid">
        <ControlColumn
          title="On foot"
          rows={[
            [['W', 'A', 'S', 'D'], 'Walk'],
            [['Shift'], 'Run'],
            [['Space'], 'Hop'],
            [['Hold RMB'], 'Look'],
            [['Mouse wheel'], 'Zoom'],
            [['E'], 'Interact'],
            [['M'], 'Chart'],
            [['Esc'], 'Menu'],
          ]}
        />
        <ControlColumn
          title="Sailing"
          rows={[
            [['W', 'S'], 'Trim sails'],
            [['A', 'D'], 'Helm'],
            [['E'], 'Dock / leave helm'],
            [['C'], 'Helm camera'],
          ]}
        />
        <ControlColumn
          title="Gamepad"
          rows={[
            [['Left stick'], 'Move / helm'],
            [['Right stick'], 'Look'],
            [['A'], 'Interact'],
            [['Y'], 'Hop / hint'],
            [['Back'], 'Chart'],
            [['Start'], 'Menu'],
          ]}
        />
      </div>
    </OverlayShell>
  );
}

function CreditsScreen({ bridge }: { bridge: GameBridge }) {
  const [assetCredits, setAssetCredits] = useState<string[]>([
    'Quaternius',
    'Freesound CC0 recordists',
    'Tidewater audio sources',
  ]);
  useEffect(() => {
    let cancelled = false;
    fetch('/ASSETS.md')
      .then((response) => (response.ok ? response.text() : ''))
      .then((text) => {
        if (cancelled || !text) return;
        const names = Array.from(
          new Set([
            'Quaternius',
            ...Array.from(text.matchAll(/by ([^,|()]+)(?:,|\)| Freesound)/g)).map((match) => match[1].trim()),
          ]),
        ).slice(0, 14);
        setAssetCredits(names);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);
  return (
    <OverlayShell title="Credits" eyebrow="Made with care" onBack={bridge.back}>
      <div className="ci-credits">
        <p>
          <a href="https://github.com/github/copilot-app-for-beginners">GitHub Copilot app for Beginners</a>
        </p>
        <p>Built with three.js, React, TypeScript, and Web Audio.</p>
        <h3>Assets and audio</h3>
        <p>{assetCredits.join(' · ')}</p>
        <h3>Music and voice</h3>
        <p>
          Procedural score by the Copilot Isles audio engine. Synthetic voices generated offline with Azure AI
          Speech.
        </p>
      </div>
    </OverlayShell>
  );
}

function MenuButton({
  children,
  detail,
  initial = false,
  onClick,
}: {
  children: ReactNode;
  detail?: ReactNode;
  initial?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={`ci-menu-button ${detail ? 'has-detail' : ''}`}
      data-initial-focus={initial ? 'true' : undefined}
      onClick={onClick}
    >
      <span>{children}</span>
      {detail && <small>{detail}</small>}
    </button>
  );
}

function OverlayShell({
  title,
  eyebrow,
  children,
  onBack,
  wide = false,
  hideBack = false,
  className = '',
}: {
  title: string;
  eyebrow: string;
  children: ReactNode;
  onBack?: () => void;
  wide?: boolean;
  hideBack?: boolean;
  className?: string;
}) {
  return (
    <main
      className={`ci-overlay ${wide ? 'wide' : ''} ${className}`}
      aria-labelledby={`ci-${title.replaceAll(' ', '-').toLowerCase()}`}
    >
      <section className="ci-panel">
        {!hideBack && onBack && (
          <button className="ci-back" onClick={onBack} aria-label="Back">
            ← Back
          </button>
        )}
        <p className="ci-kicker">{eyebrow}</p>
        <h2 id={`ci-${title.replaceAll(' ', '-').toLowerCase()}`}>{title}</h2>
        {children}
      </section>
    </main>
  );
}

/** Paint Your Sails, from Settings ("Preferences can be changed anytime from settings"). */
function SailSwatches({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  return (
    <div className="ci-sail-swatches" role="radiogroup" aria-label="Sail palette">
      {SAIL_PALETTES.map((p) => (
        <button
          key={p.id}
          type="button"
          role="radio"
          aria-checked={p.id === value}
          className={`ci-sail-swatch${p.id === value ? ' on' : ''}`}
          onClick={() => onChange(p.id)}
        >
          <svg viewBox="0 0 32 32" aria-hidden>
            <path d="M16 2v28" stroke="#6b4a2b" strokeWidth="1.6" />
            <path d="M5 6h22" stroke="#6b4a2b" strokeWidth="1.8" strokeLinecap="round" />
            <path
              d="M6 7h20q-1.6 8 0 17H6q1.6-9 0-17z"
              fill={`#${p.cloth.toString(16).padStart(6, '0')}`}
              stroke="rgba(0,0,0,0.35)"
              strokeWidth="0.8"
            />
            <path d="M6.3 19.2h19.4v2.6H6.3z" fill={`#${p.stripe.toString(16).padStart(6, '0')}`} />
          </svg>
          <span>{p.name}</span>
        </button>
      ))}
    </div>
  );
}

const QUALITY_NAMES = {
  auto: 'Auto (recommended)',
  lite: 'Lite',
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  ultra: 'Ultra',
} as const;

const SUBTITLE_NAMES = { s: 'Small', m: 'Medium', l: 'Large' } as const;

function SettingsGroup({ title, children, wide }: { title: string; children: ReactNode; wide?: boolean }) {
  const id = `settings-${title.toLowerCase().replace(/[^a-z]+/g, '-')}`;
  return (
    <section className={`ci-settings-group${wide ? ' wide' : ''}`} role="group" aria-labelledby={id}>
      <h3 id={id} className="ci-settings-title">
        {title}
      </h3>
      <div className="ci-settings-body">{children}</div>
    </section>
  );
}

function Slider({
  label,
  value,
  onChange,
  min = 0,
  max = 1,
  step = 0.01,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <label className="ci-setting-row">
      <span>{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
      />
      <em>{value.toFixed(step < 0.1 ? 2 : 1)}</em>
    </label>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="ci-setting-row">
      <span>{label}</span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.currentTarget.checked)} />
      <em>{checked ? 'On' : 'Off'}</em>
    </label>
  );
}

function Select({
  label,
  value,
  options,
  names,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly string[];
  /** Display names for the option values (defaults to the values). */
  names?: Readonly<Record<string, string>>;
  onChange: (value: string) => void;
}) {
  return (
    <label className="ci-setting-row">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.currentTarget.value)}>
        {options.map((option) => (
          <option key={option} value={option}>
            {names?.[option] ?? option}
          </option>
        ))}
      </select>
      <em />
    </label>
  );
}

function ControlColumn({ title, rows }: { title: string; rows: readonly [readonly string[], string][] }) {
  return (
    <section className="ci-control-column ci-settings-group">
      <h3 className="ci-settings-title">{title}</h3>
      <div className="ci-settings-body">
        {rows.map(([keys, action]) => (
          <div key={action} className="ci-control-row">
            <span>
              {keys.map((key) => (
                <kbd key={key}>{key}</kbd>
              ))}
            </span>
            <p>{action}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function IslandDetailSide({
  points,
  selectedPoint,
  onSelectPoint,
  onTravel,
}: {
  points: readonly ChartPoint[];
  selectedPoint: ChartPoint | null;
  onSelectPoint: (point: ChartPoint) => void;
  onTravel: (point: ChartPoint) => void;
}) {
  const active = selectedPoint ?? points[0] ?? null;
  return (
    <div className="ci-detail-side">
      {active ? (
        <PointCard point={active} onTravel={() => onTravel(active)} />
      ) : (
        <aside className="ci-map-card muted">
          <p>Anchorage Cay</p>
          <h3>Island detail</h3>
          <small>Select a harbor, landmark, beach, or quest marker to set a travel point.</small>
        </aside>
      )}
      <nav className="ci-travel-list" aria-label="Island travel points">
        {points.map((point) => (
          <button
            key={point.id}
            className={selectedPoint?.id === point.id ? 'selected' : ''}
            onClick={() => onSelectPoint(point)}
          >
            <span>{point.label}</span>
            <small>{travelHint(point)}</small>
          </button>
        ))}
      </nav>
    </div>
  );
}

function travelHint(point: ChartPoint): string {
  if (point.id === 'lighthouse') return 'Trial';
  if (point.id === 'pier') return 'Ship berth';
  if (point.id === 'harbor') return 'Spawn quay';
  if (point.id === 'nell') return 'Quest giver';
  if (point.id === 'bard') return 'Soundcheck';
  if (point.id === 'plaza') return 'Village hub';
  if (point.id === 'beach') return 'Lagoon shore';
  if (point.id === 'hill') return 'Lookout';
  return point.kind;
}

function PointCard({ point, onTravel }: { point: ChartPoint; onTravel: () => void }) {
  return (
    <aside className="ci-map-card point">
      <p>{point.kind}</p>
      <h3>{point.label}</h3>
      <small>Set a course to this marker.</small>
      <button onClick={onTravel}>Travel here</button>
    </aside>
  );
}

function ChartMedallion({ progress }: { progress: number }) {
  return (
    <svg className="ci-medallion" viewBox="0 0 180 180" aria-hidden="true">
      <circle cx="90" cy="90" r="76" />
      <path d="M90 24v132M24 90h132M43 43l94 94M137 43l-94 94" />
      <circle cx="90" cy="90" r={28 + progress * 28} />
    </svg>
  );
}

function ringPath(ring: [number, number][], frame: IslandFrame): string {
  return `${ring
    .map(([x, y], index) => {
      const p = projectIslandPoint(frame, x, y);
      return `${index === 0 ? 'M' : 'L'}${p.x} ${p.y}`;
    })
    .join(' ')} Z`;
}

function focusable(root: HTMLElement): HTMLElement[] {
  return Array.from(
    root.querySelectorAll<HTMLElement>(
      'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), [tabindex="0"]',
    ),
  ).filter((el) => el.offsetParent !== null);
}

function initialFocusable(root: HTMLElement): HTMLElement | null {
  return root.querySelector<HTMLElement>('[data-initial-focus="true"]') ?? focusable(root)[0] ?? null;
}
