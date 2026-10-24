import type { Platform } from '../engine/capability';
import type { Backend, Tier } from '../world/contracts';
import type { OsId } from '../learn/setup';
import type { SeaStateId } from '../world/ocean/sea-state';

/**
 * The contract between the React UI (menus, chart, settings) and the game (PLAN §5, POC §3.1).
 * The game owns the state and implements `GameBridge`; the UI renders `UiState` and calls actions.
 * The HUD (prompts, subtitles, sail gauge) stays plain DOM in src/game/hud.ts.
 */
export type Screen =
  | 'title'
  | 'course'
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
/** 'auto' is adaptive resolution; a number is a fixed fraction of the tier's full resolution. */
export type RenderScaleSetting = 'auto' | number;
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
  renderScale: RenderScaleSetting;
  mouseSensitivity: number;
  invertY: boolean;
  subtitles: boolean;
  subtitleSize: SubtitleSize;
  reducedMotion: boolean;
  /** Settings → Sea state: the waves, wind, foam and sailing at sea (battles and puzzle courses keep their own). */
  seaState: SeaStateId;
  /**
   * Opt-in: the App checklist may ask GitHub's public API (no sign-in) whether a task left public
   * evidence in the player's fork (src/learn/github-check.ts). Off by default.
   */
  githubChecks: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  muted: false,
  master: 0.85,
  music: 0.75,
  ambience: 0.8,
  sfx: 0.85,
  voice: 1,
  quality: 'auto',
  renderScale: 'auto',
  mouseSensitivity: 1,
  invertY: false,
  subtitles: true,
  subtitleSize: 'm',
  reducedMotion: false,
  seaState: 'breeze',
  githubChecks: false,
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
  /** The computer the player picked for the course's shortcuts (null: the browser's guess). */
  os?: OsId | null;
  /** The browser's guess. */
  osDetected?: OsId;
}

export interface VoyageNames {
  captain: string;
  ship: string;
}

/** What the renderer was built with and what Auto would pick, for the Graphics settings. */
export interface GraphicsInfo {
  backend: Backend;
  /** Device family, so each tier names examples the player will recognise. */
  platform: Platform;
  /** A short GPU name ("Apple M3 Max", "NVIDIA GeForce RTX 3060"), or '' when the browser hides it. */
  gpu: string;
  /** The tier the renderer is running. */
  tier: Tier;
  /** The tier Auto picks on this device (the startup benchmark can change it after boot). */
  autoTier: Tier;
  /** A `?tier=` link override, which wins over the setting until Apply clears it. */
  urlTier: Tier | null;
  /** Highest manual render scale on this tier (1, or 1.25 on Ultra). */
  maxRenderScale: number;
}

/** The live render size for the settings readout. */
export interface RenderResolution {
  /** Fraction of the tier's full resolution. */
  scale: number;
  width: number;
  height: number;
}

/** Shown in Graphics settings after Apply reloads the game. */
export type QualityNotice = { kind: 'applied'; tier: Tier } | { kind: 'applying' } | null;

export interface UiState {
  screen: Screen;
  /** The screen to return to when closing settings/controls/credits/chart. */
  returnTo: Screen;
  progress: VoyageProgress;
  /** The current course's id (the course list's pick, or the last one played). */
  course: string;
  /** The courses with a saved voyage (the course list marks them). */
  savedCourses?: readonly string[];
  /** A save of the current course to continue. */
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
  graphics: GraphicsInfo;
  qualityNotice: QualityNotice;
  /** A sea battle is on (the pause menu offers Skip battle). */
  battle?: boolean;
}

export interface GameBridge {
  getState(): UiState;
  subscribe(listener: (state: UiState) => void): () => void;
  newVoyage(captain: CaptainBody, names?: VoyageNames): void;
  continueVoyage(): void;
  /** Title's New Voyage → the course list (more than one course), else captain select. */
  chooseCourse(): void;
  /** The course list's pick → captain select for that course. */
  pickCourse(id: string): void;
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
  /** The chart's picked island (a likely jump): it starts streaming in at low priority. */
  chartSelect?(islandId: string): void;
  quitToTitle(): void;
  /**
   * Erases the voyage and its learning progress (quests, pages, doubloons, names, sails), keeps the
   * settings, and goes to captain select so the whole opening plays again.
   */
  startOver(): void;
  updateSettings(patch: Partial<Settings>): void;
  /** Saves progress and reloads with the chosen quality, back into the same place. */
  applyQuality(): void;
  /** The live render scale and canvas size (polled by the settings readout). */
  renderResolution(): RenderResolution;
  /** Repaints the sails (the palette stand's choice, changed from Settings). */
  setSails(paletteId: string): void;
  /** Sets the computer whose keys the game shows for the course's shortcuts (null: the browser's guess). */
  setOs?(os: OsId | null): void;
  /** Skips ahead in the opening (the cabin and living chart): Esc and the Skip button. */
  skipOpening(): void;
  /** A click or tap in the opening: opens the chest when it's waiting, otherwise skips ahead. */
  pressOpening(): void;
  /** Skip battle (the pause menu): the sea battle counts as done, and play resumes. */
  skipBattle?(): void;
  /** Unstuck (the pause menu): play resumes with the captain back on the path, or the ship in open water. */
  unstuck?(): void;
}
