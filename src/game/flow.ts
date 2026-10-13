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
import type { CreatedTerrain } from '../world/terrain/terrain-mesh';
import { prewarmWaterDepthTexture } from '../world/ocean/water-depth-texture';
import { world } from '../world/uniforms';
import { buildChart, coveTravelPoints } from './chart';
import type { GameSession } from './session';
import { LearnStore } from '../learn/store';
import type { Opening } from '../opening/opening';
import { ANCHORAGE_ARRIVAL, arrivalFlight } from './arrivals';
import { compileProgressively, revealPrewarm, warmProgressively, warmTerrainLods } from '../engine/warm';
import { skipSunShadowsWhereOff } from '../world/sky/cached-sun-shadow';
import { releaseRemovedObjects } from '../util/dispose-three';
import { buildSlice, installBuildSlicer } from '../engine/build-slice';
import { savedBattles } from './battles';

/** An island's cast and props from the session, to warm with the island and show after. */
interface IslandSetup {
  roots: Object3D[];
  reveal(): void;
}

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
  'skipBattle',
] as const satisfies readonly (keyof GameBridge)[];

interface SaveData {
  captain: CaptainBody;
  x: number;
  z: number;
  heading: number;
  savedAt: number;
  /** The island's name for the title's Continue card (older saves: Anchorage Cay). */
  place?: string;
  /** Sea battles fought or skipped (docs/specs/BATTLES.md), so none is repeated (older saves: none). */
  battles?: string[];
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
  ) => Promise<
    { compileObject(object: Object3D): Promise<void>; warmOutput?(): void } | null | undefined | void
  > | void;
  /** Puts the title's lean post stack back after a voyage (the title's programs match its first visit). */
  restoreTitlePost?: () => Promise<unknown>;
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
  /** The characters' load, started on the captain screen so Juno can stand in the cabin. */
  private characterLib: Promise<CharacterLibrary> | null = null;
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
  /** Port Meridian's late warm-up: resolves once it's streamed in and warmed (it waits for a trigger). */
  private meridianWarm: Promise<void> = Promise.resolve();
  /** Thousand-Bough's late warm-up, like Meridian's. */
  private thousandBoughWarm: Promise<void> = Promise.resolve();

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
      // Already in this chunk (the title's ocean imports it), so a plain import: a dynamic one can't split it.
      void prewarmWaterDepthTexture();
    }, 1500);
  }

  chooseCaptain(): void {
    void this.unlockAudio();
    this.prefetchTitlePacks();
    // While the captain's named, the cabin and chart build and compile in the background (no dark
    // gap at Set sail); the menu covers the title, so the small extra frame time doesn't show.
    void this.prepareOpening().then((o) => o.warm());
    // The characters too (Juno welcomes you in the cabin), a few milliseconds of parsing at a time.
    void this.loadCharacters().catch(() => undefined);
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
    this.set({ screen: 'paused', returnTo: 'playing', battle: this.session.battle.active });
  }

  /** The pause menu's Skip battle: the battle counts as done, and you're back at the helm. */
  skipBattle(): void {
    if (!this.session?.battle.active) return;
    this.session.battle.skip();
    this.set({ battle: false });
    this.resume();
  }

  openChart(): void {
    const from = this.state.screen;
    // A jump to Port Meridian may follow: start streaming it now.
    void this.cove?.meridian.load();
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
      // A jump to Port Meridian waits for it to stream in and warm (behind the fade).
      if (pointId === 'island:meridian') await this.meridianWarm;
      if (pointId === 'island:thousand-bough') {
        void this.cove?.thousandBough.load();
        await this.thousandBoughWarm;
      }
      if (this.session !== session) return;
      await session.travel(p.x, p.z, p.heading);
      this.resume();
      await session.hud.fade(false, 420);
      session.hud.toast(to.label, 2.4);
    })();
  }

  /**
   * Warms Port Meridian once it has streamed in (boarding, the chart, or coming within range starts
   * that): its terrain, foam, plants, town and gulls, its cast, chests and puzzle sites. The frame
   * loop leaves its visibility to the warm meanwhile, and it's hidden again afterwards (shown by
   * distance).
   */
  private async warmMeridian(
    cove: CoveScene,
    session: GameSession,
    post: { compileObject(object: Object3D): Promise<void> } | null,
  ): Promise<void> {
    const { roots: gs, reveal } = await session.meridianSetup;
    // This runs straight after the setup (a microtask, before the next frame), so warmLate hides what
    // it added before it's drawn.
    const own = cove.meridian.roots();
    if (this.cove !== cove || !own.length) return;
    cove.meridian.hold(true);
    try {
      await this.warmLate(cove, [...own, ...gs], post, { keepHidden: own, terrain: cove.meridian.terrain });
    } finally {
      if (this.cove === cove) {
        cove.meridian.hold(false);
        reveal();
      }
    }
  }

  /**
   * Warms Thousand-Bough once it has streamed in (coming within range, a jump there, or boarding for
   * it starts that), like Port Meridian: its terrain, foam, tree village, plants and birds, and the
   * cast and props the session puts on it (`thousandBoughSetup`, when the session has one).
   */
  private async warmThousandBough(
    cove: CoveScene,
    session: GameSession,
    post: { compileObject(object: Object3D): Promise<void> } | null,
  ): Promise<void> {
    const world = await cove.thousandBough.worldReady;
    const setup = await (session as { thousandBoughSetup?: Promise<IslandSetup> }).thousandBoughSetup;
    const own = cove.thousandBough.roots();
    if (this.cove !== cove || !world || !own.length) return;
    cove.thousandBough.hold(true);
    try {
      await this.warmLate(cove, [...own, ...(setup?.roots ?? [])], post, {
        keepHidden: own,
        terrain: cove.thousandBough.terrain,
        // The harbour mirror only draws round Anchorage's harbour, a long way off.
        reflected: false,
      });
    } finally {
      if (this.cove === cove) {
        cove.thousandBough.hold(false);
        setup?.reveal();
      }
    }
  }

  /**
   * Warms objects that join the world after it's playing (another island, the leaping fish) like the
   * island's own warm-up: pipelines precompiled for the post's scene pass off-thread, then a few
   * objects a frame get one real draw (instanced and skinned meshes, uploads, shadow passes) unculled
   * for that frame, then a terrain's finer levels of detail. Nothing under `roots` is drawn otherwise
   * until it's done (hidden, or on a layer no camera sees), so no first draw builds a shader on the
   * spot; uploads are excused from the hitch guard. Only frames that draw the world count. Roots end
   * as they were, except `keepHidden` ones, which end hidden. Stops if the voyage ends.
   */
  private async warmLate(
    cove: CoveScene,
    roots: readonly Object3D[],
    post: { compileObject(object: Object3D): Promise<void> } | null,
    opts: { keepHidden?: readonly Object3D[]; terrain?: CreatedTerrain | null; reflected?: boolean } = {},
  ): Promise<void> {
    if (!roots.length) return;
    const wasVisible = roots.map((r) => r.visible);
    const hideAll = () => {
      for (const r of roots) r.visible = false;
    };
    hideAll();
    const engine = this.o.engine;
    const live = () => this.cove === cove;
    const frame = async () => {
      do await new Promise<void>((r) => requestAnimationFrame(() => r()));
      while (engine.worldHidden() && live());
      if (!live()) throw new Error('voyage ended');
    };
    const compile = (o: Object3D) =>
      Promise.all([
        post ? post.compileObject(o) : engine.renderer.compileAsync(o, engine.camera, engine.scene),
        opts.reflected === false ? null : cove.mirror?.compileObject(engine.renderer, engine.scene, o),
      ]).then(() => undefined);
    const steady = { targetMs: 3, startBatch: 2, frameCost: () => engine.cpuMs };
    await engine.counters
      .excuse(
        (async () => {
          // Parts that appear later (marked userData.prewarm, like Meridian's mooring lines) are shown
          // for the warm too, so their first real showing doesn't upload or compile mid-play.
          const hidePrewarm = roots.map((r) => revealPrewarm(r));
          // One shader per look whether a mesh takes the sun's shadows or not (before any compile).
          if (cove.sky.sun.castShadow) for (const r of roots) skipSunShadowsWhereOff(r);
          try {
            // Each mesh compiles on its own (hidden parents don't matter); the root is only shown
            // while compileProgressively gathers its meshes, synchronously.
            for (const root of roots) {
              root.visible = true;
              const done = compileProgressively(root, compile, frame, 3);
              root.visible = false;
              await done;
            }
            for (const r of roots) r.visible = true;
            const endShadowWarm = cove.sky.shadowWarm(roots);
            try {
              await warmProgressively(roots, frame, {
                ...steady,
                solo: (o) => !!(o as Object3D & { isInstancedMesh?: boolean }).isInstancedMesh,
              });
            } finally {
              endShadowWarm();
            }
            hideAll();
            if (opts.terrain) {
              opts.terrain.group.visible = true;
              await warmTerrainLods(opts.terrain, frame, steady);
            }
          } finally {
            for (const hide of hidePrewarm) hide();
            if (live())
              roots.forEach((r, i) => (r.visible = opts.keepHidden?.includes(r) ? false : wasVisible[i]!));
          }
        })(),
      )
      .catch(() => undefined);
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
        packBase: this.o.packBase,
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
    a.sfx.setBed('gulls_far', AMBIENT_BEDS.gulls_far);
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
      const islandCode = Promise.all([import('../world/cove-scene'), import('./session')]);
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
      // A new voyage opens with Juno in the cabin, if her library's in (it loads on the captain
      // screen; a short wait under the veil, else the cabin plays with her voice alone).
      if (!save) {
        const lib = await Promise.race([
          this.loadCharacters().catch(() => null),
          new Promise<null>((r) => setTimeout(() => r(null), 3000)),
        ]);
        if (lib) opening.setGuide(lib);
      }
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
      const [{ createCove }, { createSession, ISLANDS, islandAt }] = await islandCode;
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
        this.loadCharacters(),
      ]);
      this.cove = cove;
      this.characters = characters;
      engine.camera.fov = 55;
      engine.camera.updateProjectionMatrix();
      engine.clock.set(16.2, 0);
      cove.sky.invalidate();
      // Port Meridian streams in later, when something needs it (see warmMeridian), except for a save
      // there: it's put in now and warmed with the island.
      const meridianFirst = !!save && islandAt(save.x, save.z) === 'meridian';
      const thousandBoughFirst = !!save && islandAt(save.x, save.z) === 'thousand-bough';
      if (thousandBoughFirst) {
        report(0.78, 'Sighting Thousand-Bough');
        await cove.thousandBough.load();
      }
      if (meridianFirst) {
        report(0.78, 'Sighting Port Meridian');
        await cove.meridian.load();
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
        battles: savedBattles(save?.battles),
        // Saved at once, even at sea, so a won or skipped battle is never fought again.
        onBattle: () => this.save(),
      });
      // Both islands' skies (and the passage between them) go on the GPU before the hitch guard arms.
      await cove.sky.prefetch([
        ISLANDS.anchorage.sky.hours,
        ISLANDS.meridian.sky.hours,
        ISLANDS['thousand-bough'].sky.hours,
      ]);
      report(0.92, 'Lighting the lanterns');
      const post = await this.o.upgradePost?.(cove, { warm: false });
      cove.setLateWarm((roots) => this.warmLate(cove, roots, post ?? null));
      const frame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
      // The world's pipelines build off-thread (compiled for the post's scene pass, nothing drawn), a
      // few milliseconds of main-thread work a frame, while the cabin holds its establishing shot.
      // Objects that appear later (marked userData.prewarm) are shown for the warm, then hidden.
      if (thousandBoughFirst) {
        const setup = await (this.session as { thousandBoughSetup?: Promise<IslandSetup> })
          .thousandBoughSetup;
        setup?.reveal();
        cove.thousandBough.hold(true);
        for (const r of cove.thousandBough.roots()) r.visible = true;
      }
      if (meridianFirst) {
        (await this.session.meridianSetup).reveal();
        cove.meridian.hold(true);
        for (const r of cove.meridian.roots()) r.visible = true;
      }
      const hidePrewarm = revealPrewarm(engine.scene);
      // One shader per look whether a mesh takes the sun's shadows or not (before any compile).
      if (cove.sky.sun.castShadow) skipSunShadowsWhereOff(engine.scene);
      let endShadowWarm: (() => void) | null = null;
      try {
        await compileProgressively(
          engine.scene,
          (o) =>
            Promise.all([
              post ? post.compileObject(o) : engine.renderer.compileAsync(o, engine.camera, engine.scene),
              cove.mirror?.compileObject(engine.renderer, engine.scene, o),
            ]).then(() => undefined),
          frame,
        );
        // The post chain's own quad first, in a frame of its own, then what only a real draw builds
        // (shadow passes, instanced meshes on the pass path), behind the cabin.
        post?.warmOutput?.();
        engine.renderNow();
        await frame();
        opening.setDrawWorld(true);
        // Small batches: each new shadow or post pipeline is built synchronously on its first draw.
        endShadowWarm = cove.sky.shadowWarm(engine.scene);
        await warmProgressively(engine.scene, frame, {
          targetMs: 12,
          startBatch: 3,
          frameCost: () => engine.cpuMs,
          solo: (o) => {
            const m = o as Object3D & { isInstancedMesh?: boolean; count?: number };
            if (!m.isInstancedMesh || !m.count) return false;
            for (let p: Object3D | null = o; p; p = p.parent) if (!p.visible) return false;
            return true;
          },
        });
        // The terrain's finer levels of detail (and Meridian's, for a save there).
        for (const t of [
          cove.terrain,
          meridianFirst ? cove.meridian.terrain : null,
          thousandBoughFirst ? cove.thousandBough.terrain : null,
        ]) {
          if (t)
            await warmTerrainLods(t, frame, { targetMs: 12, startBatch: 3, frameCost: () => engine.cpuMs });
        }
      } finally {
        endShadowWarm?.();
        hidePrewarm();
        cove.meridian.hold(false);
        cove.thousandBough.hold(false);
      }
      // The world's ready to be drawn without stalls: now the camera can move in to the chest.
      opening.release();
      report(0.96, 'Charting the approach');
      // The static shadow map redraws on each warm view of the flight, so the casters it passes are built now.
      const endArrivalShadowWarm = cove.sky.shadowWarm(engine.scene);
      try {
        await this.session.warmArrival(frame);
      } finally {
        endArrivalShadowWarm();
      }
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
      if (!meridianFirst) this.meridianWarm = this.warmMeridian(cove, this.session, post ?? null);
      if (!thousandBoughFirst)
        this.thousandBoughWarm = this.warmThousandBough(cove, this.session, post ?? null);
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
    const voyageObjects: Object3D[] = [];
    this.o.engine.scene.traverse((o) => void voyageObjects.push(o));
    this.session?.dispose();
    this.session = null;
    this.cove?.dispose();
    this.cove = null;
    this.characters?.dispose();
    this.characters = null;
    this.characterLib = null;
    releaseRemovedObjects(voyageObjects, this.o.engine.scene);
    void this.o.restoreTitlePost?.();
  }

  /** Loads the characters once per voyage (a failed load is tried again next time). */
  private loadCharacters(): Promise<CharacterLibrary> {
    const lib = (this.characterLib ??= Promise.all([
      import('../world/characters'),
      packs.loadManifest(),
    ]).then(([{ loadCharacterLibrary }]) =>
      loadCharacterLibrary(`${this.o.packBase ?? '/packs'}/testcove/characters`),
    ));
    lib.catch(() => {
      if (this.characterLib === lib) this.characterLib = null;
    });
    return lib;
  }

  private save(captain = this.state.captain): void {
    if (!this.session) return;
    const w = this.session.where();
    const battles = this.session.battle.done();
    if (w.onShip) {
      // At sea the save keeps where you last stood ashore, with the battles brought up to date.
      const last = readJson<SaveData>(SAVE_KEY);
      if (last && savedBattles(last.battles).length !== battles.length)
        writeJson(SAVE_KEY, { ...last, battles } satisfies SaveData);
      return;
    }
    writeJson(SAVE_KEY, {
      captain,
      x: w.x,
      z: w.z,
      heading: w.heading,
      savedAt: Date.now(),
      place: w.place,
      battles,
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
