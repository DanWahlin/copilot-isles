import type { IslesAudio } from '../audio';
import type { Engine } from '../engine/engine';
import { packs, type PackProgress } from '../engine/packs';
import type { Input } from '../engine/input';
import { createTitleBackdrop, type TitleBackdrop } from '../title/title-scene';
import {
  DEFAULT_SETTINGS,
  type CaptainBody,
  type GameBridge,
  type Screen,
  type Settings,
  type UiState,
} from '../ui/bridge';
import type { CharacterLibrary } from '../world/characters';
import type { CoveScene } from '../world/cove-scene';
import { world } from '../world/uniforms';
import { buildChart, coveTravelPoints } from './chart';
import type { GameSession } from './session';
import { LearnStore } from '../learn/store';

const SETTINGS_KEY = 'copilot-isles.settings.v1';
const SAVE_KEY = 'copilot-isles.save.v1';

const BRIDGE_METHODS = [
  'getState',
  'subscribe',
  'newVoyage',
  'continueVoyage',
  'chooseCaptain',
  'resume',
  'pause',
  'openChart',
  'openSettings',
  'openControls',
  'openCredits',
  'back',
  'travelTo',
  'quitToTitle',
  'updateSettings',
] as const satisfies readonly (keyof GameBridge)[];

interface SaveData {
  captain: CaptainBody;
  x: number;
  z: number;
  heading: number;
  savedAt: number;
}

export interface GameFlowOptions {
  engine: Engine;
  input: Input;
  audio: IslesAudio;
  hudParent: HTMLElement;
  renderInfo: string;
  packBase?: string;
  /** Shows the post-load "ready" frame and hides the boot loader once the title is live. */
  onTitleReady?: () => void;
}

/**
 * The game flow (Phase 0 T3 + Phase 1 menus): title backdrop → captain select → stream Anchorage
 * Cay → play, with pause, chart, settings, controls, credits, fast travel, and a small save.
 * Implements the UI bridge; the React UI renders `UiState` and calls these actions.
 */
export class GameFlow implements GameBridge {
  private state: UiState;
  private readonly listeners = new Set<(s: UiState) => void>();
  private title: TitleBackdrop | null = null;
  private cove: CoveScene | null = null;
  private characters: CharacterLibrary | null = null;
  private session: GameSession | null = null;
  /** Quizzes, pages, chests, and the Logbook (rendered by src/ui/learn). */
  readonly learn = new LearnStore();
  private loading = false;
  private saveTimer = 0;
  private audioReady = false;
  private titlePrefetchStarted = false;

  constructor(private readonly o: GameFlowOptions) {
    const settings = { ...DEFAULT_SETTINGS, ...readJson<Partial<Settings>>(SETTINGS_KEY) };
    const save = readJson<SaveData>(SAVE_KEY);
    this.state = {
      screen: 'title',
      returnTo: 'title',
      progress: { value: 0, message: '' },
      hasSave: !!save,
      captain: save?.captain ?? 'man',
      settings,
      chart: null,
      renderInfo: o.renderInfo,
    };
    this.applySettings(settings);
    o.engine.add({ frame: (dt) => this.tick(dt) });
    // The UI passes bridge actions around as bare callbacks (onClick, useSyncExternalStore).
    for (const key of BRIDGE_METHODS) {
      const fn = this[key] as (...args: unknown[]) => unknown;
      (this as Record<string, unknown>)[key] = fn.bind(this);
    }
  }

  // ---- bridge ----
  getState(): UiState {
    return this.state;
  }

  subscribe(listener: (s: UiState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  showTitle(): void {
    this.title ??= createTitleBackdrop(this.o.engine);
    this.set({ screen: 'title', returnTo: 'title' });
    this.o.onTitleReady?.();
    this.prefetchTitlePacks();
  }

  chooseCaptain(): void {
    void this.unlockAudio();
    this.prefetchTitlePacks();
    this.set({ screen: 'captain', returnTo: 'title' });
  }

  newVoyage(captain: CaptainBody): void {
    writeJson(SAVE_KEY, null);
    this.learn.newGame();
    void this.voyage(captain, null);
  }

  continueVoyage(): void {
    const save = readJson<SaveData>(SAVE_KEY);
    void this.voyage(save?.captain ?? this.state.captain, save);
  }

  resume(): void {
    if (!this.session) return this.set({ screen: 'title' });
    this.session.setPaused(false);
    this.set({ screen: 'playing', returnTo: 'playing' });
    this.o.engine.renderer.domElement.focus();
  }

  pause(): void {
    if (!this.session || this.state.screen !== 'playing') return;
    this.session.setPaused(true);
    this.save();
    this.set({ screen: 'paused', returnTo: 'playing' });
  }

  openChart(): void {
    const from = this.state.screen;
    this.session?.setPaused(true);
    const anchors = this.cove?.village.anchors ?? {};
    this.set({
      screen: 'chart',
      returnTo: from === 'playing' ? 'playing' : from === 'paused' ? 'paused' : 'title',
      chart: buildChart(anchors, this.session?.where() ?? null),
    });
  }

  openSettings(): void {
    this.set({ screen: 'settings', returnTo: this.menuReturn() });
  }

  openControls(): void {
    this.set({ screen: 'controls', returnTo: this.menuReturn() });
  }

  openCredits(): void {
    this.set({ screen: 'credits', returnTo: this.menuReturn() });
  }

  back(): void {
    if (this.state.screen === 'playing' || this.state.screen === 'title') return;
    const to = this.state.returnTo;
    if (to === 'playing') return this.resume();
    this.set({ screen: to, returnTo: to === 'paused' ? 'playing' : 'title' });
  }

  travelTo(pointId: string): void {
    if (!this.session || !this.cove) return;
    const p = coveTravelPoints(this.cove.village.anchors).find((q) => q.id === pointId);
    if (!p) return;
    const session = this.session;
    void (async () => {
      await session.hud.fade(true, 260);
      await session.travel(p.wx, p.wz, p.heading);
      this.resume();
      await session.hud.fade(false, 420);
      session.hud.toast(p.label, 2.4);
    })();
  }

  quitToTitle(): void {
    this.save();
    this.endVoyage();
    this.set({ hasSave: !!readJson<SaveData>(SAVE_KEY) });
    this.showTitle();
  }

  updateSettings(patch: Partial<Settings>): void {
    const settings = { ...this.state.settings, ...patch };
    writeJson(SETTINGS_KEY, settings);
    this.applySettings(settings);
    this.set({ settings });
  }

  // ---- internals ----
  private menuReturn(): Screen {
    const s = this.state.screen;
    if (s === 'playing') this.session?.setPaused(true);
    return s === 'paused' || s === 'playing' ? 'paused' : 'title';
  }

  private set(patch: Partial<UiState>): void {
    this.state = { ...this.state, ...patch };
    for (const l of this.listeners) l(this.state);
  }

  private applySettings(s: Settings): void {
    const v = this.o.audio.volumes;
    v.master = s.master;
    v.music = s.music;
    v.ambience = s.ambience;
    v.sfx = s.sfx;
    v.voice = s.voice;
    this.o.input.mouseSensitivity = 0.0032 * s.mouseSensitivity;
    this.o.input.invertY = s.invertY;
    document.documentElement.dataset.subtitles = s.subtitles ? s.subtitleSize : 'off';
    document.documentElement.classList.toggle('reduced-motion', s.reducedMotion);
    world.reducedMotion.value = s.reducedMotion ? 1 : 0;
  }

  private prefetchTitlePacks(): void {
    if (this.titlePrefetchStarted) return;
    this.titlePrefetchStarted = true;
    const run = () => {
      void packs
        .loadManifest()
        .then(() => packs.prefetch('testcove/critical'))
        .catch(() => undefined);
    };
    const idle = (
      globalThis as { requestIdleCallback?: (cb: () => void, options?: { timeout: number }) => number }
    ).requestIdleCallback;
    if (idle) idle(run, { timeout: 2500 });
    else window.setTimeout(run, 1200);
  }

  private async unlockAudio(): Promise<void> {
    if (this.audioReady) return;
    const ok = await this.o.audio.unlock();
    if (!ok) return;
    this.audioReady = true;
    const a = this.o.audio;
    a.music.setIsland('anchorage');
    a.sfx.setBed('wind', 0.3);
    a.sfx.setBed('surf_far', 0.5);
  }

  private async voyage(captain: CaptainBody, save: SaveData | null): Promise<void> {
    if (this.loading) return;
    this.loading = true;
    void this.unlockAudio();
    const { engine } = this.o;
    this.set({ screen: 'voyage-loading', captain, progress: { value: 0.02, message: 'Weighing anchor' } });
    try {
      const report = (value: number, message: string) => this.set({ progress: { value, message } });
      const progress = (start: number, end: number, message: string) => (p: PackProgress) => {
        report(start + (end - start) * p.ratio, message);
      };
      const [{ createCove }, { loadCharacterLibrary }, { createSession }] = await Promise.all([
        import('../world/cove-scene'),
        import('../world/characters'),
        import('./session'),
      ]);
      // Let the loading screen fade in over the title before the heavy work starts.
      await new Promise((r) => setTimeout(r, 450));
      this.title?.dispose();
      this.title = null;
      const base = this.o.packBase ?? '/packs';
      await packs.loadManifest();
      report(0.06, 'Loading Test Cove essentials');
      await packs.prefetch('testcove/critical', progress(0.06, 0.24, 'Loading Test Cove essentials'));
      report(0.24, 'Streaming the harbor');
      await packs.streamZone('testcove/harbor', progress(0.24, 0.42, 'Streaming the harbor'));
      const [cove, characters] = await Promise.all([
        createCove(engine, { packBase: base, onProgress: (p, m) => report(0.42 + p * 0.34, m) }),
        loadCharacterLibrary(`${base}/testcove/characters`),
      ]);
      this.cove = cove;
      this.characters = characters;
      engine.camera.fov = 55;
      engine.camera.updateProjectionMatrix();
      engine.clock.set(16.2, 0);
      cove.sky.invalidate();
      report(0.8, 'Warming the harbor');
      await engine.renderer.compileAsync(cove.village.group, engine.camera);
      report(0.86, 'Waking the villagers');
      this.session = await createSession({
        engine,
        cove,
        characters,
        input: this.o.input,
        hudParent: this.o.hudParent,
        audio: this.audioReady ? this.o.audio : null,
        body: captain,
        quiet: !!save,
        start: save ? { x: save.x, z: save.z, heading: save.heading } : undefined,
        onMenu: () => this.pause(),
        onChart: () => this.openChart(),
        learn: this.learn,
      });
      if (this.audioReady) {
        this.o.audio.sfx.setBed('palms', 0.35);
        this.o.audio.sfx.setBed('birds_dawn', 0.3);
      }
      report(0.92, 'Lighting the lanterns');
      await engine.renderer.compileAsync(engine.scene, engine.camera);
      engine.renderNow();
      engine.counters.hitches.length = 0;
      engine.counters.arm();
      report(1, 'Landfall');
      this.save(captain);
      await new Promise((r) => setTimeout(r, 300));
      this.set({ screen: 'playing', returnTo: 'playing', hasSave: true });
      engine.renderer.domElement.focus();
    } catch (err) {
      console.error(err);
      this.set({ progress: { value: 1, message: 'The voyage hit a squall. Please reload.' } });
    } finally {
      this.loading = false;
    }
  }

  private endVoyage(): void {
    this.session?.dispose();
    this.session = null;
    this.cove?.dispose();
    this.cove = null;
    this.characters?.dispose();
    this.characters = null;
  }

  private save(captain = this.state.captain): void {
    if (!this.session) return;
    const w = this.session.where();
    if (w.onShip) return;
    writeJson(SAVE_KEY, {
      captain,
      x: w.x,
      z: w.z,
      heading: w.heading,
      savedAt: Date.now(),
    } satisfies SaveData);
  }

  private tick(dt: number): void {
    if (this.state.screen !== 'playing') return;
    this.saveTimer += dt;
    if (this.saveTimer > 5) {
      this.saveTimer = 0;
      this.save();
    }
  }

  /** Dev/test access. */
  get debugSession(): GameSession | null {
    return this.session;
  }
}

function readJson<T>(key: string): T | null {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private mode / storage full: settings and saves just don't persist.
  }
}
