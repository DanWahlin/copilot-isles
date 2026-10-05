import type { Object3D } from 'three/webgpu';
import type { IslesAudio } from '../audio';
import { AMBIENT_BEDS } from '../audio/beds';
import { MUSIC_TRACKS, type IslandMusic } from '../audio/music/tracks';
import type { Engine } from '../engine/engine';
import { packs, type PackProgress } from '../engine/packs';
import type { Input } from '../engine/input';
import { createTitleBackdrop, type TitleBackdrop } from '../title/title-scene';
import {
  DEFAULT_SETTINGS,
  type CaptainBody,
  type GameBridge,
  type GraphicsInfo,
  type QualityNotice,
  type RenderResolution,
  type Screen,
  type Settings,
  type UiState,
  type VoyageNames,
} from '../ui/bridge';
import type { Tier } from '../world/contracts';
import type { CharacterLibrary } from '../world/characters';
import type { CoveScene } from '../world/cove-scene';
import { world } from '../world/uniforms';
import { buildChart, coveTravelPoints } from './chart';
import type { GameSession } from './session';
import { LearnStore } from '../learn/store';
import type { Opening } from '../opening/opening';
import { ANCHORAGE_ARRIVAL, arrivalFlight } from './arrivals';
import { compileProgressively, warmProgressively } from '../engine/warm';
import { buildSlice, installBuildSlicer } from '../engine/build-slice';

const SETTINGS_KEY = 'copilot-isles.settings.v1';
/** The crossfade (s) from the opening's song into the island's theme, at the song's phrase end. */
const SONG_TAIL = 2.4;
/** The island's theme comes in once the arrival is this close (s) to reaching the captain. */
const ARRIVAL_NEAR = 2.5;
/** The opening's pixel-ratio cap (device pixels per CSS pixel). */
const OPENING_PIXEL_CAP = 1.5;
/** Main-thread build work per frame while the island builds behind the opening (ms). */
const BUILD_SLICE_MS = 5;
const SAVE_KEY = 'copilot-isles.save.v1';
/** Session storage: where Apply's reload should land (the title, or back in the game). */
const RESUME_KEY = 'copilot-isles.apply-quality.v1';

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
  'openLogbook',
  'back',
  'travelTo',
  'quitToTitle',
  'startOver',
  'updateSettings',
  'applyQuality',
  'renderResolution',
  'setSails',
  'skipOpening',
  'pressOpening',
] as const satisfies readonly (keyof GameBridge)[];

interface SaveData {
  captain: CaptainBody;
  x: number;
  z: number;
  heading: number;
  savedAt: number;
  /** The island's name for the title's Continue card (older saves: Anchorage Cay). */
  place?: string;
}

export interface GameFlowOptions {
  engine: Engine;
  input: Input;
  audio: IslesAudio;
  hudParent: HTMLElement;
  renderInfo: string;
  graphics: GraphicsInfo;
  packBase?: string;
  /** Shows the post-load "ready" frame and hides the boot loader once the title is live. */
  onTitleReady?: () => void;
  /** Swaps the title's lean post stack for the richer island post after TTI or during voyage load. */
  /** Returns the post pipeline in use (its compileObject warms objects for its scene pass), if any. */
  upgradePost?: (
    cove?: CoveScene,
    opts?: { warm?: boolean },
  ) => Promise<{ compileObject(object: Object3D): Promise<void> } | null | undefined | void> | void;
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
  /** After Apply's reload into the game: reopen Graphics settings once you've landed. */
  private settingsOnLand: QualityNotice = null;
  /** The opening (the Captain's Chest and the living chart) while it plays over the load. */
  private opening: Opening | null = null;
  /** The next opening, building in the background on the title and captain screens. */
  private openingPrep: Promise<Opening> | null = null;
  private openingHold: (holding: boolean) => void = () => undefined;
  /** The island's theme, waiting for the opening's song to finish and the arrival to near the captain. */
  private islandMusicDue: IslandMusic | null = null;
  /** The opening's steady resolution is held until the arrival reaches the captain. */
  private resolutionHeld = false;
  /** Uninstalls the build slicer (the island builds a few ms per frame while the scene moves). */
  private unslice: (() => void) | null = null;

  constructor(private readonly o: GameFlowOptions) {
    const settings = sanitizeSettings({ ...DEFAULT_SETTINGS, ...readJson<Partial<Settings>>(SETTINGS_KEY) });
    const save = readJson<SaveData>(SAVE_KEY);
    this.state = {
      screen: 'title',
      returnTo: 'title',
      progress: { value: 0, message: '' },
      hasSave: !!save,
      save: save ? this.saveSummary() : null,
      learn: this.learnSummary(),
      captain: save?.captain ?? 'man',
      settings,
      chart: null,
      renderInfo: o.renderInfo,
      bootQuality: settings.quality,
      graphics: o.graphics,
      qualityNotice: null,
    };
    this.applySettings(settings);
    this.learn.subscribe((s) => {
      this.title?.setSails(s.sails);
      this.set({});
    });
    o.engine.add({ frame: (dt) => this.tick(dt), cutscene: true });
    o.engine.counters.stage = () =>
      this.opening ? `opening ${this.opening.time.toFixed(2)}` : this.state.screen;
    this.armAudioUnlock();
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

  /** Resolves once the title's sky is ready to show (the hitch guard arms after this). */
  titleReady(): Promise<void> {
    return this.title?.ready ?? Promise.resolve();
  }

  showTitle(): void {
    this.title ??= createTitleBackdrop(this.o.engine);
    this.title.setSails(this.learn.getState().sails);
    if (this.audioReady) this.o.audio.music.setIsland('harbour');
    this.set({ screen: 'title', returnTo: 'title', hasSave: !!readJson<SaveData>(SAVE_KEY) });
    this.o.onTitleReady?.();
    this.prefetchTitlePacks();
    // The opening's cabin and chart start building now (a few ms a frame), so Set sail never waits.
    window.setTimeout(() => {
      void this.prepareOpening();
      // The island's ocean-floor map bakes quietly too (it was a ~1 s freeze in the island build).
      void import('../world/ocean/water-depth-texture').then((m) => m.prewarmWaterDepthTexture());
    }, 1500);
  }

  chooseCaptain(): void {
    void this.unlockAudio();
    this.prefetchTitlePacks();
    // While the captain's named, the cabin and chart build and compile in the background (no dark
    // gap at Set sail); the menu covers the title, so the small extra frame time doesn't show.
    void this.prepareOpening().then((o) => o.warm());
    this.set({ screen: 'captain', returnTo: 'title' });
  }

  newVoyage(captain: CaptainBody, names?: VoyageNames): void {
    writeJson(SAVE_KEY, null);
    this.learn.newGame();
    if (names) this.learn.progress.setNames(names.captain, names.ship);
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
    const anchors = this.cove ? { ...this.cove.village.anchors, ...this.cove.sites.anchors } : {};
    this.set({
      screen: 'chart',
      returnTo: from === 'playing' ? 'playing' : from === 'paused' ? 'paused' : 'title',
      chart: buildChart(anchors, this.session?.where() ?? null, this.session?.island),
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

  openLogbook(): void {
    if (!this.session) return;
    this.learn.openLogbook();
    this.session.setPaused(false);
    this.set({ screen: 'playing', returnTo: 'playing' });
    this.o.engine.renderer.domElement.focus();
  }

  back(): void {
    if (this.state.screen === 'playing' || this.state.screen === 'title') return;
    if (this.state.qualityNotice?.kind === 'applying') return;
    if (this.state.qualityNotice) this.state = { ...this.state, qualityNotice: null };
    const to = this.state.returnTo;
    if (to === 'playing') return this.resume();
    this.set({ screen: to, returnTo: to === 'paused' ? 'playing' : 'title' });
  }

  /** Fast travel to a point on Anchorage's chart, or to another island's quay (`island:<id>`). */
  travelTo(pointId: string): void {
    if (!this.session || !this.cove) return;
    const session = this.session;
    const to = pointId.startsWith('island:')
      ? session.islandQuay(pointId.slice('island:'.length))
      : coveTravelPoints({ ...this.cove.village.anchors, ...this.cove.sites.anchors }).find(
          (q) => q.id === pointId,
        );
    if (!to) return;
    const p = { x: 'wx' in to ? to.wx : to.x, z: 'wz' in to ? to.wz : to.z, heading: to.heading };
    void (async () => {
      await session.hud.fade(true, 260);
      await session.travel(p.x, p.z, p.heading);
      this.resume();
      await session.hud.fade(false, 420);
      session.hud.toast(to.label, 2.4);
    })();
  }

  quitToTitle(): void {
    this.save();
    this.endVoyage();
    // Back to the open-sea title: just wind and surf, no island palms or birdsong.
    this.o.audio.sfx.setBed('palms', 0);
    this.o.audio.sfx.setBed('birds_dawn', 0);
    this.set({ hasSave: !!readJson<SaveData>(SAVE_KEY), save: this.saveSummary() });
    this.showTitle();
  }

  startOver(): void {
    writeJson(SAVE_KEY, null);
    this.learn.newGame();
    if (this.session) {
      this.endVoyage();
      this.o.audio.sfx.setBed('palms', 0);
      this.o.audio.sfx.setBed('birds_dawn', 0);
    }
    this.set({ hasSave: false, save: this.saveSummary() });
    this.showTitle();
    this.chooseCaptain();
  }

  updateSettings(patch: Partial<Settings>): void {
    const settings = sanitizeSettings({ ...this.state.settings, ...patch });
    writeJson(SETTINGS_KEY, settings);
    this.applySettings(settings);
    const qualityNotice = patch.quality !== undefined ? null : this.state.qualityNotice;
    this.set({ settings, qualityNotice });
  }

  applyQuality(): void {
    if (this.state.qualityNotice?.kind === 'applying') return;
    const inGame = !!this.session;
    if (inGame) this.save();
    writeSession(RESUME_KEY, { to: inGame && readJson<SaveData>(SAVE_KEY) ? 'game' : 'title' });
    this.set({ qualityNotice: { kind: 'applying' } });
    // The setting decides the tier after the reload, so a ?tier= link override goes.
    const url = new URL(location.href);
    url.searchParams.delete('tier');
    url.searchParams.delete('recovered');
    // Let the status line paint before the page goes.
    window.setTimeout(() => location.replace(url.toString()), 120);
  }

  renderResolution(): RenderResolution {
    const { engine } = this.o;
    const c = engine.renderer.domElement;
    return { scale: engine.renderScale(), width: c.width, height: c.height };
  }

  /** The startup benchmark finished: Auto now picks `tier` on this device. */
  setAutoTier(tier: Tier): void {
    if (tier !== this.state.graphics.autoTier)
      this.set({ graphics: { ...this.state.graphics, autoTier: tier } });
  }

  /**
   * After Apply's reload: reopen Graphics settings on the title with the new tier, or continue the
   * voyage and reopen them once you've landed. Call once the UI is mounted.
   */
  resumeAfterApply(): void {
    const r = readSession<{ to: 'game' | 'title' }>(RESUME_KEY);
    if (!r) return;
    writeSession(RESUME_KEY, null);
    const notice: QualityNotice = { kind: 'applied', tier: this.state.graphics.tier };
    if (r.to === 'game' && readJson<SaveData>(SAVE_KEY)) {
      this.settingsOnLand = notice;
      this.continueVoyage();
      return;
    }
    this.set({ qualityNotice: notice });
    this.openSettings();
  }

  setSails(paletteId: string): void {
    this.learn.setSails(paletteId);
  }

  skipOpening(): void {
    this.opening?.skip();
  }

  pressOpening(): void {
    this.opening?.press();
  }

  // ---- internals ----
  /** Creates the next opening and starts building it (a little each frame); once per voyage. */
  private prepareOpening(): Promise<Opening> {
    this.openingPrep ??= import('../opening/opening').then(({ createOpening }) => {
      const opening = createOpening({
        engine: this.o.engine,
        input: this.o.input,
        audio: () => (this.audioReady ? this.o.audio : null),
        onHold: (holding) => this.openingHold(holding),
      });
      void opening.prepare();
      return opening;
    });
    return this.openingPrep;
  }

  private menuReturn(): Screen {
    const s = this.state.screen;
    if (s === 'playing') this.session?.setPaused(true);
    return s === 'paused' || s === 'playing' ? 'paused' : 'title';
  }

  private set(patch: Partial<UiState>): void {
    const hasSave = patch.hasSave ?? this.state.hasSave;
    this.state = {
      ...this.state,
      save: hasSave ? this.saveSummary() : null,
      learn: this.learnSummary(),
      ...patch,
    };
    this.title?.setInteractive(this.state.screen === 'title');
    for (const l of this.listeners) l(this.state);
  }

  private saveSummary(): UiState['save'] {
    const save = readJson<SaveData>(SAVE_KEY);
    if (!save) return null;
    return { location: save.place ?? 'Anchorage Cay', questsDone: this.questsDoneCount() };
  }

  private learnSummary(): UiState['learn'] {
    return {
      doubloons: this.learn.progress.data.doubloons,
      seals: this.learn.progress.data.seals.slice(),
      sails: this.learn.progress.data.sails,
      captainName: this.learn.progress.data.captainName,
      shipName:
        this.learn.progress.data.captainName || this.learn.progress.data.shipName
          ? this.learn.progress.shipName
          : null,
    };
  }

  private questsDoneCount(): number {
    return Object.values(this.learn.progress.data.quests).filter((step) => step === 'done').length;
  }

  private applySettings(s: Settings): void {
    const v = this.o.audio.volumes;
    v.muted = s.muted;
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
    this.o.engine.setRenderScale(s.renderScale === 'auto' ? null : s.renderScale);
  }

  private prefetchTitlePacks(): void {
    if (this.titlePrefetchStarted) return;
    this.titlePrefetchStarted = true;
    const run = () => {
      void packs
        .loadManifest()
        .then(() => packs.prefetch('testcove/critical'))
        .catch(() => undefined);
      // The opening builds quietly too, so Continue (and a quick Set sail) fade straight into it.
      void this.prepareOpening();
    };
    const idle = (
      globalThis as { requestIdleCallback?: (cb: () => void, options?: { timeout: number }) => number }
    ).requestIdleCallback;
    if (idle) idle(run, { timeout: 2500 });
    else window.setTimeout(run, 1200);
  }

  /**
   * Browsers only allow sound after a click, tap, or key press, so the title's music and sea start on
   * the first one anywhere (not just New Voyage). Escape and bare modifier keys don't count as a
   * gesture, so they're skipped.
   */
  private armAudioUnlock(): void {
    if (typeof window === 'undefined') return;
    const events = ['pointerdown', 'keydown', 'touchend'] as const;
    const onGesture = (e: Event) => {
      if (
        e instanceof KeyboardEvent &&
        (e.key === 'Escape' || ['Shift', 'Control', 'Alt', 'Meta'].includes(e.key))
      )
        return;
      void this.unlockAudio().then(() => {
        if (this.audioReady) for (const type of events) window.removeEventListener(type, onGesture, true);
      });
    };
    for (const type of events) window.addEventListener(type, onGesture, true);
  }

  private async unlockAudio(): Promise<void> {
    if (this.audioReady) return;
    const ok = await this.o.audio.unlock();
    if (!ok || this.audioReady) return;
    this.audioReady = true;
    const a = this.o.audio;
    a.music.setIsland('harbour');
    a.sfx.setBed('wind', AMBIENT_BEDS.wind);
    a.sfx.setBed('surf_far', AMBIENT_BEDS.surf_far);
  }

  private async voyage(captain: CaptainBody, save: SaveData | null): Promise<void> {
    if (this.loading) return;
    this.loading = true;
    void this.unlockAudio();
    const { engine } = this.o;
    const destination = save?.place ?? 'Anchorage Cay';
    const progressNow = { value: 0.02, message: 'Weighing anchor', destination, cinematic: true };
    const report = (value: number, message: string) => {
      progressNow.value = value;
      progressNow.message = message;
      this.set({ progress: { ...progressNow } });
    };
    let opening: Opening | null = null;
    try {
      const progress = (start: number, end: number, message: string) => (p: PackProgress) => {
        report(start + (end - start) * p.ratio, message);
      };
      // The opening (docs/specs/OPENING-living-chart.md): it's been building in the background on
      // the title and captain screens. The title fades straight into warm dark while the island's
      // code loads, and the cabin fades up out of it; the island streams in behind the cabin.
      const prep = this.prepareOpening();
      // Warm dark falls over the title and the captain panel the moment you set sail; the panel
      // goes once it's covered (the opening's own veil takes over).
      const setSailVeil = document.createElement('div');
      setSailVeil.className = 'ci-opening-veil ci-opening-veil-top';
      document.body.append(setSailVeil);
      // Commit the transparent start now, so the fade runs on the compositor even while the island's
      // code loads on the main thread.
      void setSailVeil.offsetWidth;
      setSailVeil.style.transitionDuration = '600ms';
      setSailVeil.style.opacity = '1';
      document.documentElement.classList.add('ci-opening-active');
      this.o.input.enabled = true;
      // The island's code loads behind the cabin: the cabin only waits for itself and the fade.
      const islandCode = Promise.all([
        import('../world/cove-scene'),
        import('../world/characters'),
        import('./session'),
      ]);
      islandCode.catch(() => undefined);
      const [ready] = await Promise.all([
        prep.then(async (o) => (await o.prepare(), o)),
        new Promise((r) => setTimeout(r, 620)).then(() =>
          this.set({ screen: 'voyage-loading', captain, progress: progressNow }),
        ),
      ]);
      opening = ready;
      this.opening = opening;
      this.openingHold = (holding) => this.set({ progress: { ...progressNow, holding } });
      this.title?.dispose();
      this.title = null;
      opening.start({
        kind: save ? 'continue' : 'voyage',
        reduced: this.state.settings.reducedMotion,
        captainName: this.learn.progress.data.captainName ?? '',
        sails: this.learn.getState().sails,
      });
      await opening.veil(true, 0);
      setSailVeil.remove();
      // A steady resolution for the whole opening and arrival (no adaptive changes mid-beat), at most
      // 1.5x: the cabin's light and the warming world fit 60 fps there. Released at landfall.
      engine.holdResolution(OPENING_PIXEL_CAP);
      this.resolutionHeld = true;
      // The island builds in short slices of each frame, so the cabin and the chart never stall.
      this.unslice ??= installBuildSlicer(BUILD_SLICE_MS);
      await opening.play();
      // Back from Apply's reload: skip the cabin scene, straight to the chart and the dive.
      if (this.settingsOnLand) opening.skip();
      const [{ createCove }, { loadCharacterLibrary }, { createSession, ISLANDS, islandAt }] =
        await islandCode;
      const base = this.o.packBase ?? '/packs';
      await packs.loadManifest();
      report(0.06, 'Loading Test Cove essentials');
      await packs.prefetch('testcove/critical', progress(0.06, 0.24, 'Loading Test Cove essentials'));
      report(0.24, 'Streaming the harbor');
      await packs.streamZone('testcove/harbor', progress(0.24, 0.42, 'Streaming the harbor'));
      const [cove, characters] = await Promise.all([
        createCove(engine, {
          packBase: base,
          onProgress: (p, m) => report(0.42 + p * 0.34, m),
          // A frame between build stages, so the cabin keeps moving while the island builds.
          breathe: buildSlice,
        }),
        loadCharacterLibrary(`${base}/testcove/characters`),
      ]);
      this.cove = cove;
      this.characters = characters;
      engine.camera.fov = 55;
      engine.camera.updateProjectionMatrix();
      engine.clock.set(16.2, 0);
      cove.sky.invalidate();
      // A save on Port Meridian needs its terrain in before you're put ashore there.
      if (save && islandAt(save.x, save.z) === 'meridian') {
        report(0.78, 'Sighting Port Meridian');
        await cove.meridian.loaded;
      }
      report(0.8, 'Warming the harbor');
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
        fromChart: true,
        start: save ? { x: save.x, z: save.z, heading: save.heading } : undefined,
        onMenu: () => this.pause(),
        onChart: () => this.openChart(),
        learn: this.learn,
      });
      // Both islands' skies (and the passage between them) go on the GPU before the hitch guard arms.
      await cove.sky.prefetch([ISLANDS.anchorage.sky.hours, ISLANDS.meridian.sky.hours]);
      report(0.92, 'Lighting the lanterns');
      const post = await this.o.upgradePost?.(cove, { warm: false });
      const frame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
      // The world's pipelines build off-thread (compiled for the post's scene pass, nothing drawn), a
      // few milliseconds of main-thread work a frame, while the cabin holds its establishing shot.
      await compileProgressively(
        engine.scene,
        (o) =>
          Promise.all([
            post ? post.compileObject(o) : engine.renderer.compileAsync(o, engine.camera, engine.scene),
            cove.mirror?.compileObject(engine.renderer, engine.scene, o),
          ]).then(() => undefined),
        frame,
      );
      // Then what only a real draw builds (shadow passes, the post chain), behind the cabin.
      opening.setDrawWorld(true);
      // Small batches: each new shadow or post pipeline is built synchronously on its first draw.
      await warmProgressively(engine.scene, frame, {
        targetMs: 12,
        startBatch: 3,
        frameCost: () => engine.cpuMs,
      });
      // The world's ready to be drawn without stalls: now the camera can move in to the chest.
      opening.release();
      report(0.96, 'Charting the approach');
      await this.session.warmArrival(frame);
      engine.renderNow();
      await frame();
      opening.setDrawWorld(false);
      engine.counters.hitches.length = 0;
      engine.counters.arm();
      report(1, 'Landfall');
      this.save(captain);
      // The chart holds until it's alive, then the camera dives in: to the arrival flyover's first
      // view on a new voyage, or to wherever the save's camera is on Continue.
      await opening.ready();
      const island = this.session.island;
      const c = engine.camera;
      const look = c.getWorldDirection(c.position.clone()).multiplyScalar(30).add(c.position);
      const first = arrivalFlight(ANCHORAGE_ARRIVAL, true).keys[0]!;
      const target =
        !save && island === 'anchorage'
          ? {
              island,
              eye: { x: first.x, y: first.y, z: first.z },
              look: { x: first.tx, y: first.ty, z: first.tz },
            }
          : { island, eye: c.position.clone(), look };
      await opening.dive(target);
      // The opening's song plays on to its end; the island's theme comes in as the arrival nears
      // the captain (see tick).
      this.islandMusicDue = ISLANDS[island].music;
      if (this.audioReady) {
        this.o.audio.sfx.setBed('palms', AMBIENT_BEDS.palms);
        this.o.audio.sfx.setBed('birds_dawn', AMBIENT_BEDS.birds_dawn);
      }
      opening.finish();
      this.opening = null;
      this.openingPrep = null;
      document.documentElement.classList.remove('ci-opening-active');
      this.set({ screen: 'playing', returnTo: 'playing', hasSave: true, save: this.saveSummary() });
      engine.renderer.domElement.focus();
      this.session.begin();
      if (this.settingsOnLand) {
        const qualityNotice = this.settingsOnLand;
        this.settingsOnLand = null;
        this.pause();
        this.set({ qualityNotice });
        this.openSettings();
      }
    } catch (err) {
      console.error(err);
      this.unslice?.();
      this.unslice = null;
      opening?.dispose();
      this.opening = null;
      this.openingPrep = null;
      if (this.resolutionHeld) {
        this.resolutionHeld = false;
        engine.holdResolution(null);
      }
      document.documentElement.classList.remove('ci-opening-active');
      this.set({ progress: { value: 1, message: 'The voyage hit a squall. Please reload.', destination } });
    } finally {
      this.loading = false;
    }
  }

  /**
   * After the opening: once its song reaches the end of its phrase (MusicTrack.handoff) and the
   * arrival is within a couple of seconds of the captain (or there's no flight), the island's theme
   * crossfades in.
   */
  private handOverMusic(): void {
    const due = this.islandMusicDue;
    if (!due || !this.session || this.opening) return;
    if (!this.audioReady) return void (this.islandMusicDue = null);
    const at = this.o.audio.music.position('opening');
    const phraseDone = at === null || at >= (MUSIC_TRACKS.opening.handoff ?? 0);
    if (phraseDone && this.session.arrivalLeft() <= ARRIVAL_NEAR) {
      this.islandMusicDue = null;
      this.o.audio.music.setIsland(due, { fade: SONG_TAIL });
    }
  }

  private endVoyage(): void {
    this.islandMusicDue = null;
    this.unslice?.();
    this.unslice = null;
    if (this.resolutionHeld) {
      this.resolutionHeld = false;
      this.o.engine.holdResolution(null);
    }
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
      place: w.place,
    } satisfies SaveData);
  }

  private tick(dt: number): void {
    this.handOverMusic();
    if (this.resolutionHeld && this.session && !this.opening && this.session.arrivalLeft() === 0) {
      this.resolutionHeld = false;
      this.o.engine.holdResolution(null);
    }
    // The session ticks the audio engine during a voyage; on the title and menus before one (and
    // while the opening hides the world, when the session rests), we do.
    if ((!this.session || this.o.engine.worldHidden()) && this.audioReady) this.o.audio.update(dt);
    if (this.state.screen !== 'playing') return;
    this.saveTimer += dt;
    if (this.saveTimer > 5) {
      this.saveTimer = 0;
      this.save();
    }
  }

  /** Dev/test access: the opening while it plays. */
  get debugOpening(): Opening | null {
    return this.opening;
  }

  /** Dev/test access. */
  get debugSession(): GameSession | null {
    return this.session;
  }
}

const QUALITIES = new Set(['auto', 'lite', 'low', 'medium', 'high', 'ultra']);

/** Old or hand-edited settings fall back to the defaults field by field. */
function sanitizeSettings(s: Settings): Settings {
  const out = { ...s };
  if (!QUALITIES.has(out.quality)) out.quality = DEFAULT_SETTINGS.quality;
  if (out.renderScale !== 'auto' && !(typeof out.renderScale === 'number' && out.renderScale >= 0.5))
    out.renderScale = DEFAULT_SETTINGS.renderScale;
  return out;
}

function readSession<T>(key: string): T | null {
  try {
    const v = sessionStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : null;
  } catch {
    return null;
  }
}

function writeSession(key: string, value: unknown): void {
  try {
    if (value === null) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private mode: Apply still reloads, just onto the title.
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
