import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
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

interface TitleMenuProps {
  bridge: GameBridge;
}

type ChartMode = 'archipelago' | 'island';

const FALLBACK_ISLANDS: ChartIsland[] = [
  {
    id: 'anchorage',
    name: 'Anchorage Cay',
    chapter: '00 · Setup',
    x: 0.18,
    y: 0.62,
    status: 'current',
    blurb: 'Captain’s papers, gear checks, and your first seal.',
  },
  {
    id: 'meridian',
    name: 'Port Meridian',
    chapter: '01 · Tour the App',
    x: 0.3,
    y: 0.42,
    status: 'locked',
    blurb: 'The city of districts and the app tour.',
  },
  {
    id: 'bough',
    name: 'Thousand-Bough Isle',
    chapter: '02 · Sessions, Worktrees & Context',
    x: 0.44,
    y: 0.58,
    status: 'locked',
    blurb: 'Treehouses, signal flags, and context routes.',
  },
  {
    id: 'keelhaven',
    name: 'Keelhaven',
    chapter: '03 · Dev & GitHub Workflows',
    x: 0.55,
    y: 0.34,
    status: 'locked',
    blurb: 'Sea trials, PR gates, and reviews.',
  },
  {
    id: 'guildcrest',
    name: 'Guildcrest',
    chapter: '04 · Skills & Custom Agents',
    x: 0.66,
    y: 0.51,
    status: 'locked',
    blurb: 'Shanty scrolls and specialist crews.',
  },
  {
    id: 'sunspire',
    name: 'Sunspire Sands',
    chapter: '05 · MCP Servers & Plugins',
    x: 0.74,
    y: 0.27,
    status: 'locked',
    blurb: 'Signal towers and supply crates.',
  },
  {
    id: 'inkwell',
    name: 'Inkwell Bluffs',
    chapter: '06 · Canvases',
    x: 0.83,
    y: 0.47,
    status: 'locked',
    blurb: 'Shared chart tables and plans.',
  },
  {
    id: 'tidewheel',
    name: 'Tidewheel Caldera',
    chapter: '07 · Automations',
    x: 0.91,
    y: 0.22,
    status: 'locked',
    blurb: 'Clockwork lighthouses and routines.',
  },
];

const FALLBACK_CHART: ChartData = {
  islands: FALLBACK_ISLANDS,
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
    const id = window.setTimeout(() => firstFocusable(root)?.focus(), 60);
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
      {state.screen === 'captain' && <CaptainSelect bridge={bridge} current={state.captain} />}
      {state.screen === 'voyage-loading' && <VoyageLoading state={state} />}
      {state.screen === 'paused' && <PausedScreen bridge={bridge} />}
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
        <MenuButton onClick={bridge.chooseCaptain}>New Voyage</MenuButton>
        {state.hasSave && <MenuButton onClick={bridge.continueVoyage}>Continue</MenuButton>}
        <MenuButton onClick={bridge.openChart}>Chart</MenuButton>
        <MenuButton onClick={bridge.openSettings}>Settings</MenuButton>
        <MenuButton onClick={bridge.openControls}>Controls</MenuButton>
        <MenuButton onClick={bridge.openCredits}>Credits</MenuButton>
      </nav>
    </main>
  );
}

function CaptainSelect({ bridge, current }: { bridge: GameBridge; current: CaptainBody }) {
  const [captain, setCaptain] = useState<CaptainBody>(current);
  return (
    <OverlayShell title="Choose your captain" eyebrow="New voyage" onBack={bridge.back}>
      <div className="ci-captain-grid" role="radiogroup" aria-label="Captain body">
        <CaptainCard id="man" title="Captain" selected={captain === 'man'} onSelect={setCaptain} />
        <CaptainCard id="woman" title="Captain Anne" selected={captain === 'woman'} onSelect={setCaptain} />
      </div>
      <div className="ci-panel-actions">
        <button className="ci-primary" onClick={() => bridge.newVoyage(captain)}>
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
  const pct = Math.round(state.progress.value * 100);
  return (
    <main className="ci-loading" role="status" aria-label="Loading voyage">
      <ChartMedallion progress={state.progress.value} />
      <h2>{state.progress.message}</h2>
      <div className="ci-progress" aria-label={`Loading ${pct}%`}>
        <span style={{ transform: `scaleX(${state.progress.value})` }} />
      </div>
      <p>{pct}%</p>
    </main>
  );
}

function PausedScreen({ bridge }: { bridge: GameBridge }) {
  return (
    <OverlayShell title="Paused" eyebrow="Voyage menu" className="ci-pause" hideBack>
      <nav className="ci-menu-list compact" aria-label="Pause menu">
        <MenuButton onClick={bridge.resume}>Resume</MenuButton>
        <MenuButton onClick={bridge.openChart}>Chart</MenuButton>
        <MenuButton onClick={bridge.openSettings}>Settings</MenuButton>
        <MenuButton onClick={bridge.openControls}>Controls</MenuButton>
        <MenuButton onClick={bridge.quitToTitle}>Quit to title</MenuButton>
      </nav>
    </OverlayShell>
  );
}

function ChartScreen({ state, bridge }: { state: UiState; bridge: GameBridge }) {
  const chart = state.chart ?? FALLBACK_CHART;
  const [mode, setMode] = useState<ChartMode>('archipelago');
  const [selectedPoint, setSelectedPoint] = useState<ChartPoint | null>(null);
  const [selectedIsland, setSelectedIsland] = useState<ChartIsland | null>(
    chart.islands.find((island) => island.status === 'current') ?? chart.islands[0],
  );

  return (
    <OverlayShell
      title="Captain’s Chart"
      eyebrow={mode === 'archipelago' ? 'Archipelago' : chart.island.name}
      onBack={bridge.back}
      wide
    >
      <div className="ci-chart-toolbar">
        <button className={mode === 'archipelago' ? 'active' : ''} onClick={() => setMode('archipelago')}>
          Archipelago
        </button>
        <button className={mode === 'island' ? 'active' : ''} onClick={() => setMode('island')}>
          Island detail
        </button>
      </div>
      <div className={`ci-chart ${mode === 'island' ? 'zoomed' : ''}`}>
        <svg viewBox="0 0 1000 620" role="img" aria-label="Parchment nautical chart">
          <defs>
            <filter id="paper-noise">
              <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="3" seed="7" />
              <feColorMatrix type="saturate" values="0" />
              <feComponentTransfer>
                <feFuncA type="table" tableValues="0 .13" />
              </feComponentTransfer>
            </filter>
            <pattern id="wave-lines" width="58" height="34" patternUnits="userSpaceOnUse">
              <path
                d="M4 18c12-9 24 9 36 0 7-5 11-5 18-1"
                fill="none"
                stroke="#3e6f86"
                strokeOpacity=".18"
                strokeWidth="1.5"
              />
            </pattern>
          </defs>
          <rect width="1000" height="620" rx="26" fill="#ead9ad" />
          <rect width="1000" height="620" rx="26" filter="url(#paper-noise)" />
          <rect
            x="24"
            y="24"
            width="952"
            height="572"
            rx="18"
            fill="url(#wave-lines)"
            stroke="#6d4b25"
            strokeOpacity=".25"
          />
          {mode === 'archipelago' ? (
            <ArchipelagoSvg
              islands={chart.islands.length ? chart.islands : FALLBACK_ISLANDS}
              selected={selectedIsland}
              onSelect={setSelectedIsland}
              onOpenDetail={() => setMode('island')}
            />
          ) : (
            <IslandSvg chart={chart} selectedPoint={selectedPoint} onSelectPoint={setSelectedPoint} />
          )}
        </svg>
        {mode === 'archipelago' && selectedIsland && (
          <IslandCard island={selectedIsland} onDetail={() => setMode('island')} />
        )}
        {mode === 'island' && selectedPoint && (
          <PointCard point={selectedPoint} onTravel={() => bridge.travelTo(selectedPoint.id)} />
        )}
      </div>
    </OverlayShell>
  );
}

function ArchipelagoSvg({
  islands,
  selected,
  onSelect,
  onOpenDetail,
}: {
  islands: readonly ChartIsland[];
  selected: ChartIsland | null;
  onSelect: (island: ChartIsland) => void;
  onOpenDetail: () => void;
}) {
  const path = islands.map((island) => `${island.x * 880 + 60},${island.y * 500 + 60}`).join(' ');
  return (
    <g className="ci-archipelago">
      <path
        d="M148 496C282 330 476 434 604 262S803 230 885 135"
        fill="none"
        stroke="#714e28"
        strokeWidth="1.2"
        strokeDasharray="9 8"
        opacity=".42"
      />
      <polyline points={path} fill="none" stroke="#263e4a" strokeOpacity=".2" strokeWidth="2" />
      <CompassRose x={122} y={126} />
      {islands.map((island, index) => {
        const x = island.x * 880 + 60;
        const y = island.y * 500 + 60;
        const locked = island.status === 'locked';
        return (
          <g
            key={island.id}
            className={`ci-island-node ${island.status} ${selected?.id === island.id ? 'selected' : ''}`}
            tabIndex={0}
            role="button"
            aria-label={`${island.chapter} ${island.name}`}
            onClick={() => (onSelect(island), !locked && onOpenDetail())}
            onKeyDown={(event) => event.key === 'Enter' && (onSelect(island), !locked && onOpenDetail())}
          >
            <path d={islandSilhouette(index, x, y)} />
            <circle cx={x} cy={y} r={locked ? 5 : 7} />
            {locked && <path d={`M${x - 7} ${y - 12}h14v15h-14zM${x - 4} ${y - 12}a4 4 0 0 1 8 0`} />}
            <text x={x + 18} y={y - 2}>
              {island.chapter.split('·')[0].trim()}
            </text>
            <text x={x + 18} y={y + 14}>
              {island.name}
            </text>
          </g>
        );
      })}
    </g>
  );
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
  return (
    <g className="ci-island-detail">
      <rect x="76" y="58" width="850" height="500" rx="220" fill="#7db4bc" opacity=".22" />
      {chart.island.reef.map((ring, index) => (
        <path key={`reef-${index}`} className="reef" d={ringPath(ring)} />
      ))}
      {chart.island.coast.map((ring, index) => (
        <path key={`coast-${index}`} className="coast" d={ringPath(ring)} />
      ))}
      {chart.island.points.map((point) => (
        <g
          key={point.id}
          tabIndex={0}
          role="button"
          className={`ci-chart-point ${point.kind} ${selectedPoint?.id === point.id ? 'selected' : ''}`}
          onClick={() => onSelectPoint(point)}
          onKeyDown={(event) => event.key === 'Enter' && onSelectPoint(point)}
          aria-label={point.label}
        >
          <circle cx={point.x * 760 + 120} cy={point.y * 430 + 92} r="8" />
          <text x={point.x * 760 + 134} y={point.y * 430 + 96}>
            {point.label}
          </text>
        </g>
      ))}
      {chart.player && (
        <g
          transform={`translate(${chart.player.x * 760 + 120} ${chart.player.y * 430 + 92}) rotate(${(chart.player.heading * 180) / Math.PI})`}
          className="ci-player-marker"
        >
          <path d="M0 -17l8 24-8-5-8 5z" />
          <circle r="3" />
        </g>
      )}
    </g>
  );
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
            onChange={(subtitleSize) => bridge.updateSettings({ subtitleSize: subtitleSize as SubtitleSize })}
          />
        </SettingsGroup>
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

function MenuButton({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button className="ci-menu-button" onClick={onClick}>
      {children}
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

function SettingsGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="ci-settings-group">
      <legend>{title}</legend>
      {children}
    </fieldset>
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
  onChange,
}: {
  label: string;
  value: string;
  options: readonly string[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="ci-setting-row">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.currentTarget.value)}>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
      <em />{' '}
    </label>
  );
}

function ControlColumn({ title, rows }: { title: string; rows: readonly [readonly string[], string][] }) {
  return (
    <section className="ci-control-column">
      <h3>{title}</h3>
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
    </section>
  );
}

function IslandCard({ island, onDetail }: { island: ChartIsland; onDetail: () => void }) {
  return (
    <aside className="ci-map-card">
      <p>{island.chapter}</p>
      <h3>{island.name}</h3>
      <span className={`status ${island.status}`}>{island.status}</span>
      <small>{island.blurb}</small>
      {island.status !== 'locked' && <button onClick={onDetail}>Open island chart</button>}
    </aside>
  );
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

function CompassRose({ x, y }: { x: number; y: number }) {
  return (
    <g className="ci-compass" transform={`translate(${x} ${y})`}>
      <circle r="54" />
      <path d="M0-49l10 39 39 10-39 10-10 39-10-39-39-10 39-10z" />
      <text y="-63">N</text>
    </g>
  );
}

function ringPath(ring: [number, number][]): string {
  return `${ring.map(([x, y], index) => `${index === 0 ? 'M' : 'L'}${x * 760 + 120} ${y * 430 + 92}`).join(' ')} Z`;
}

function islandSilhouette(index: number, x: number, y: number): string {
  const r = 17 + (index % 3) * 4;
  return `M${x - r} ${y + 2}c${r * 0.2}-${r * 0.9} ${r * 0.8}-${r * 1.1} ${r * 1.2}-${r * 0.45}c${r * 0.9}-${r * 0.2} ${r * 1.25} ${r * 0.75} ${r * 0.34} ${r * 1.12}c-${r * 0.72} ${r * 0.48}-${r * 1.35} ${r * 0.4}-${r * 1.88} ${r * 0.25}c-${r * 0.45} ${r * 0.24}-${r * 0.9} ${r * 0.06}-${r * 0.98}-${r * 0.92}z`;
}

function focusable(root: HTMLElement): HTMLElement[] {
  return Array.from(
    root.querySelectorAll<HTMLElement>(
      'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), [tabindex="0"]',
    ),
  ).filter((el) => el.offsetParent !== null);
}

function firstFocusable(root: HTMLElement): HTMLElement | null {
  return focusable(root)[0] ?? null;
}
