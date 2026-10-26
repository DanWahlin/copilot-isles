import { useEffect, useState } from 'react';
import type { ChartData, ChartIsland, ChartPoint, GameBridge, UiState } from '../bridge';
import { ARCH_H, ARCH_W, ARCHIPELAGO } from '../chart/archipelago';
import { ArchipelagoMap, CompassRose, Parchment } from '../chart/ArchipelagoMap';
import { IslandCard } from '../chart/IslandCard';
import { UnchartedFog, useUnchartedChapters } from '../chart/UnchartedFog';
import { OverlayShell } from '../components/OverlayShell';

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

export function ChartScreen({ state, bridge }: { state: UiState; bridge: GameBridge }) {
  const chart = state.chart ?? FALLBACK_CHART;
  const islands = chart.islands.length ? chart.islands : ARCHIPELAGO;
  const [mode, setMode] = useState<ChartMode>('archipelago');
  const uncharted = useUnchartedChapters();
  const [selectedPoint, setSelectedPoint] = useState<ChartPoint | null>(null);
  const [selectedIsland, setSelectedIsland] = useState<ChartIsland | null>(
    islands.find((island) => island.status === 'current') ?? islands[0] ?? null,
  );
  // The island you point at is a likely jump: it starts streaming while you read its card.
  const selectedId = selectedIsland?.id ?? null;
  useEffect(() => {
    if (selectedId && state.returnTo !== 'title') bridge.chartSelect?.(selectedId);
  }, [selectedId, bridge, state.returnTo]);

  return (
    <OverlayShell
      title="Captain’s Chart"
      eyebrow={mode === 'archipelago' ? 'Archipelago' : chart.island.name}
      onBack={bridge.back}
      wide
      className="ci-chart-panel"
    >
      <div className={`ci-chart ${mode === 'island' ? 'zoomed' : 'archipelago'}`}>
        <div className="ci-chart-toolbar" role="tablist" aria-label="Chart view">
          <button
            role="tab"
            aria-selected={mode === 'archipelago'}
            className={mode === 'archipelago' ? 'active' : ''}
            onClick={() => setMode('archipelago')}
          >
            Archipelago
          </button>
          <button
            role="tab"
            aria-selected={mode === 'island'}
            className={mode === 'island' ? 'active' : ''}
            onClick={() => setMode('island')}
          >
            Island detail
          </button>
        </div>
        <div className="ci-chart-map">
          {/* The paper on a layer of its own, under the map: drawn once, so an island's hover
              animation doesn't redraw its noise and its shadow every frame (that held the Chart's
              frames for 200 ms or more while an island was pointed at). */}
          <svg
            className="ci-chart-paper"
            viewBox={`0 0 ${ARCH_W} ${ARCH_H}`}
            preserveAspectRatio="xMidYMid meet"
            aria-hidden="true"
          >
            <Parchment w={ARCH_W} h={ARCH_H} />
          </svg>
          <svg
            viewBox={`0 0 ${ARCH_W} ${ARCH_H}`}
            preserveAspectRatio="xMidYMid meet"
            role="group"
            aria-label={
              mode === 'archipelago' ? 'Chart of the Kraken Isles' : `Chart of ${chart.island.name}`
            }
          >
            {mode === 'archipelago' ? (
              <ArchipelagoMap
                islands={islands}
                selected={selectedIsland}
                onSelect={setSelectedIsland}
                // Only an island with a detail chart opens one; the others keep their card (and Travel).
                onOpen={(island) => island.id === chart.island.id && setMode('island')}
              />
            ) : (
              <IslandSvg chart={chart} selectedPoint={selectedPoint} onSelectPoint={setSelectedPoint} />
            )}
            {mode === 'archipelago' && <UnchartedFog chapters={uncharted} />}
          </svg>
        </div>
        <div className="ci-chart-side" aria-live="polite">
          {mode === 'archipelago' && selectedIsland && (
            <IslandCard
              island={selectedIsland}
              islands={islands}
              seals={state.learn.seals}
              onOpen={() => setMode('island')}
              onTravel={
                state.returnTo === 'title' ? null : () => bridge.travelTo(`island:${selectedIsland.id}`)
              }
            />
          )}
          {mode === 'island' && (
            <IslandDetailSide
              points={chart.island.points}
              selectedPoint={selectedPoint}
              onSelectPoint={setSelectedPoint}
              // From the title there's no voyage to move yet.
              onTravel={state.returnTo === 'title' ? null : (point) => bridge.travelTo(point.id)}
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

function IslandDetailSide({
  points,
  selectedPoint,
  onSelectPoint,
  onTravel,
}: {
  points: readonly ChartPoint[];
  selectedPoint: ChartPoint | null;
  onSelectPoint: (point: ChartPoint) => void;
  onTravel: ((point: ChartPoint) => void) | null;
}) {
  const active = selectedPoint ?? points[0] ?? null;
  return (
    <div className="ci-detail-side">
      {active ? (
        <PointCard point={active} onTravel={onTravel ? () => onTravel(active) : null} />
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

function PointCard({ point, onTravel }: { point: ChartPoint; onTravel: (() => void) | null }) {
  return (
    <aside className="ci-map-card point">
      <p>{point.kind}</p>
      <h3>{point.label}</h3>
      {onTravel ? (
        <>
          <small>Set a course to this marker.</small>
          <button onClick={onTravel}>Travel here</button>
        </>
      ) : (
        <small>Start or continue a voyage to travel here.</small>
      )}
    </aside>
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
