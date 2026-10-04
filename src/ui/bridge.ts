import type { Tier } from '../world/contracts';

/**
 * The contract between the React UI (menus, chart, settings) and the game (PLAN §5, POC §3.1).
 * The game owns the state and implements `GameBridge`; the UI renders `UiState` and calls actions.
 * The HUD (prompts, subtitles, sail gauge) stays plain DOM in src/game/hud.ts.
 */
export type Screen =
  | 'title'
  | 'captain'
  | 'voyage-loading'
  | 'playing'
  | 'paused'
  | 'chart'
  | 'settings'
  | 'controls'
  | 'credits';

export type CaptainBody = 'man' | 'woman';
export type QualitySetting = 'auto' | Tier;
export type SubtitleSize = 's' | 'm' | 'l';

export interface Settings {
  /** Silences all audio (the levels below are kept for when you unmute). */
  muted: boolean;
  master: number;
  music: number;
  ambience: number;
  sfx: number;
  voice: number;
  quality: QualitySetting;
  mouseSensitivity: number;
  invertY: boolean;
  subtitles: boolean;
  subtitleSize: SubtitleSize;
  reducedMotion: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  muted: false,
  master: 0.85,
  music: 0.75,
  ambience: 0.8,
  sfx: 0.85,
  voice: 1,
  quality: 'auto',
  mouseSensitivity: 1,
  invertY: false,
  subtitles: true,
  subtitleSize: 'm',
  reducedMotion: false,
};

/** Chart coordinates are normalized 0-1 across the chart (x → east, y → south). */
export interface ChartIsland {
  id: string;
  name: string;
  /** Course chapter, e.g. "00 · Getting started". */
  chapter: string;
  x: number;
  y: number;
  status: 'current' | 'visited' | 'locked';
  blurb: string;
  /** What the chapter teaches (its learning objectives, shortened). */
  topics: readonly string[];
  /** The course's estimated time for the chapter. */
  minutes: number;
  /** The seal its Harbormaster's Trial awards, which opens the course to the next island. */
  seal?: string;
}

export interface ChartPoint {
  id: string;
  label: string;
  x: number;
  y: number;
  kind: 'harbor' | 'landmark' | 'beach' | 'quest';
}

export interface ChartData {
  /** The archipelago (world chart): every island in the course. */
  islands: readonly ChartIsland[];
  /** The current island's detail chart. */
  island: {
    id: string;
    name: string;
    /** Coastline rings in island-chart coordinates (0-1), outermost first. */
    coast: [number, number][][];
    /** Reef rings (shallow water edge) for a lighter tint. */
    reef: [number, number][][];
    points: ChartPoint[];
  };
  /** Player (or ship) on the island chart. `heading` is radians clockwise from north. */
  player: { x: number; y: number; heading: number; onShip: boolean } | null;
}

interface VoyageProgress {
  value: number;
  message: string;
  /** Where you're bound (the island's name), shown over the loading chart. */
  destination?: string;
  /** The opening plays over the load (the cabin and living chart), not the loading card. */
  cinematic?: boolean;
  /** The opening is holding on the living chart until the island is ready. */
  holding?: boolean;
}

interface SaveSummary {
  location: string;
  questsDone: number;
}

interface LearnSummary {
  doubloons: number;
  seals: readonly string[];
  /** The voyage's sail palette (Paint Your Sails), or null for the default. */
  sails: string | null;
  captainName: string | null;
  shipName: string | null;
}

export interface VoyageNames {
  captain: string;
  ship: string;
}

export interface UiState {
  screen: Screen;
  /** The screen to return to when closing settings/controls/credits/chart. */
  returnTo: Screen;
  progress: VoyageProgress;
  hasSave: boolean;
  save: SaveSummary | null;
  learn: LearnSummary;
  captain: CaptainBody;
  settings: Settings;
  chart: ChartData | null;
  /** The backend/tier line for the settings footer, e.g. "WebGPU · High". */
  renderInfo: string;
  /** The quality setting the renderer was built with; a different choice needs a reload. */
  bootQuality: QualitySetting;
}

export interface GameBridge {
  getState(): UiState;
  subscribe(listener: (state: UiState) => void): () => void;
  newVoyage(captain: CaptainBody, names?: VoyageNames): void;
  continueVoyage(): void;
  /** Title → captain select. */
  chooseCaptain(): void;
  resume(): void;
  pause(): void;
  openChart(): void;
  openSettings(): void;
  openControls(): void;
  openCredits(): void;
  /** Closes the pause menu and opens the learning Logbook overlay. */
  openLogbook(): void;
  /** Closes chart/settings/controls/credits back to `returnTo`. */
  back(): void;
  /** Fast travel to a chart point on the current island (docks the ship first if sailing). */
  travelTo(pointId: string): void;
  quitToTitle(): void;
  updateSettings(patch: Partial<Settings>): void;
  /** Repaints the sails (the palette stand's choice, changed from Settings). */
  setSails(paletteId: string): void;
  /** Skips ahead in the opening (the cabin and living chart). */
  skipOpening(): void;
}
