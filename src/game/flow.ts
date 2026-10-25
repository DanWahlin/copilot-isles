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
import { prewarmWaterDepthTexture } from '../world/ocean/water-depth-texture';
import { world } from '../world/uniforms';
import { isSeaStateId, seaState } from '../world/ocean/sea-state';
import { buildChart, coveTravelPoints, prewarmChart } from './chart';
import { islandOpen } from '../islands/open';
import { HOME_ISLAND, ISLAND_LIST, ISLAND_REGISTRY, isIslandId } from '../islands/registry';
import type { GameSession, StreamedIsland } from './session';
import { LearnStore } from '../learn/store';
import { activateCourse } from '../course/load';
import { DEFAULT_COURSE_ID, PLAYABLE_COURSES, PLAYABLE_IDS, selectCourse } from '../course/catalog';
import { Progress } from '../learn/progress';
import { courseKey, lastCourse, migrateSaves, safeStorage, setLastCourse, writeCourseKey } from './save-keys';
import type { OsId } from '../learn/setup';
import type { Opening } from '../opening/opening';
import { BRIEFING_LINES } from '../opening/briefing';
import { OPENING_SOUNDS } from '../opening/sounds';
import { arrivalFlight } from './arrivals';
import { createSky, type SkySystem } from '../world/sky/sky-system';
import { releaseRemovedObjects } from '../util/dispose-three';
import { buildSlice, installBuildSlicer } from '../engine/build-slice';
import { savedBattles } from './battles';
import { warmIsland, warmLate, warmWorld, type ScenePassCompiler } from './island-warm';

const SETTINGS_KEY = 'copilot-isles.settings.v1';
/** The crossfade (s) from the opening's song into the island's theme, at the song's phrase end. */
const SONG_TAIL = 2.4;
/** The island's theme comes in once the arrival is this close (s) to reaching the captain. */
const ARRIVAL_NEAR = 2.5;
/** The opening's pixel-ratio cap (device pixels per CSS pixel). */
const OPENING_PIXEL_CAP = 1.5;
/** Main-thread build work per frame while the island builds behind the opening (ms). */
const BUILD_SLICE_MS = 5;
// The voyage's save is per course (save-keys.ts, COURSE-PACKS.md §6): `copilot-isles.<course>.save.v1`.
/** Session storage: where Apply's reload should land (the title, or back in the game). */
const RESUME_KEY = 'copilot-isles.apply-quality.v1';

const BRIDGE_METHODS = [
  'getState',
  'subscribe',
  'chooseCourse',
  'pickCourse',
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
  'chartSelect',
  'quitToTitle',
  'startOver',
  'updateSettings',
  'applyQuality',
  'renderResolution',
  'setSails',
  'setOs',
  'skipOpening',
  'pressOpening',
  'skipBattle',
  'unstuck',
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
/** The title's sea beds, buffered with its song before the first press. */
const TITLE_BEDS = ['wind', 'surf_far', 'gulls_far'] as const;
/** The longest the title's other downloads wait for its song to buffer (Fast 3G needs ~11 s alone). */
const TITLE_MUSIC_WAIT_MS = 15_000;

export class GameFlow implements GameBridge {
  private state: UiState;
  private readonly listeners = new Set<(s: UiState) => void>();
  private title: TitleBackdrop | null = null;
  private cove: CoveScene | null = null;
  private characters: CharacterLibrary | null = null;
  /** The characters' load, started on the captain screen so Juno can stand in the cabin. */
  private characterLib: Promise<CharacterLibrary> | null = null;
  private session: GameSession | null = null;
  /** Quizzes, pages, chests, and the Logbook (rendered by src/ui/learn), for the current course. */
  readonly learn: LearnStore;
  /** The course a voyage plays: the last one played (Continue), or the one picked for a New Voyage. */
  private course: string;
  private loading = false;
  private saveTimer = 0;
  private audioReady = false;
  private titlePrefetchStarted = false;
  /** The title's song and sea buffering (see prefetchTitleAudio); the title's other downloads wait for it. */
  private titleAudio: Promise<void> | null = null;
  /** After Apply's reload into the game: reopen Graphics settings once you've landed. */
  private settingsOnLand: QualityNotice = null;
  /** A skip asked for while the voyage loads, before its opening exists (a slow machine's Esc). */
  private skipWhenReady = false;
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
  /**
   * Each streamed island's late warm-up, per setup of its content (it streams in again after it's
   * been freed, and warms again): a chart jump there waits for the one that matches the session's.
   */
  private islandWarm = new Map<StreamedIsland, { gen: number; done: Promise<void> }>();
  private unwatchIslands: (() => void) | null = null;
  /** The chart's pick waits a moment before it prefetches (pointing across the chart isn't a pick). */
  private chartPickTimer = 0;

  constructor(private readonly o: GameFlowOptions) {
    // Each island's chart terrain (its height and masks, the world's own code) loads with the title,
    // so the opening's chart has it, and no module of it loads while the title is on screen.
    for (const e of ISLAND_LIST) void e.chart.terrain().catch(() => undefined);
    // Saves from before course packs become the course that claims them (`legacySaves`; their old
    // keys stay for now).
    const storage = safeStorage();
    migrateSaves(storage);
    this.course = lastCourse(storage, PLAYABLE_IDS);
    selectCourse(this.course);
    this.learn = new LearnStore(new Progress(storage, this.course));
    const settings = sanitizeSettings({ ...DEFAULT_SETTINGS, ...readJson<Partial<Settings>>(SETTINGS_KEY) });
    const save = this.readSave();
    this.state = {
      screen: 'title',
      returnTo: 'title',
      progress: { value: 0, message: '' },
      hasSave: !!save,
      save: save ? this.saveSummary() : null,
      course: this.course,
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

  /** Frozen shots of the title (`?debug`, tools/shots.mjs): see `TitleBackdrop.holdStill`. */
  holdTitleStill(t: number): void {
    this.title?.holdStill(t);
  }

  showTitle(): void {
    this.title ??= createTitleBackdrop(this.o.engine);
    this.title.setSails(this.learn.getState().sails);
    if (this.audioReady) this.o.audio.music.setIsland('harbour');
    this.set({ screen: 'title', returnTo: 'title', hasSave: !!this.readSave() });
    this.o.onTitleReady?.();
    this.prefetchTitleAudio();
    this.prefetchTitlePacks();
    // The opening's cabin and chart start building now (a few ms a frame), so Set sail never waits.
    // Its downloads wait for the title's song, like the packs (prefetchTitleAudio).
    void this.titleAudio?.then(() =>
      window.setTimeout(() => {
        void this.prepareOpening();
        // The island's ocean-floor map bakes quietly too (it was a ~1 s freeze in the island build).
        // Already in this chunk (the title's ocean imports it), so a plain import: a dynamic one can't split it.
        void prewarmWaterDepthTexture();
      }, 1500),
    );
    // The Chart's coastlines (~15 ms, the first time the Chart opened).
    window.setTimeout(prewarmChart, 2500);
  }

  chooseCaptain(): void {
    void this.unlockAudio();
    this.prefetchOpeningAudio();
    this.prefetchTitlePacks();
    // While the captain's named, the cabin and chart build and compile in the background (no dark
    // gap at Set sail); the menu covers the title, so the small extra frame time doesn't show.
    void this.prepareOpening().then((o) => o.warm());
    // The characters too (Juno welcomes you in the cabin), a few milliseconds of parsing at a time.
    void this.loadCharacters().catch(() => undefined);
    this.set({ screen: 'captain', returnTo: 'title' });
  }

  /** Title → the course list (with more than one course to choose), else straight to captain select. */
  chooseCourse(): void {
    if (PLAYABLE_COURSES.length < 2) {
      this.useCourse(DEFAULT_COURSE_ID);
      return this.chooseCaptain();
    }
    void this.unlockAudio();
    this.set({ screen: 'course', returnTo: 'title' });
  }

  /** The course list's pick: that course's voyage starts at captain select. */
  pickCourse(id: string): void {
    this.useCourse(id);
    this.chooseCaptain();
  }

  /** Makes a course the current one: its saves, its progress, its chart and its lines. */
  private useCourse(id: string): void {
    const known = PLAYABLE_IDS.includes(id);
    this.course = known ? id : this.course;
    selectCourse(this.course);
    this.learn.useCourse(this.course);
    this.set({ course: this.course, hasSave: !!this.readSave() });
  }

  private readSave(): SaveData | null {
    return readJson<SaveData>(courseKey(this.course, 'save'));
  }

  private writeSave(value: SaveData | null): void {
    try {
      writeCourseKey(safeStorage(), this.course, 'save', value === null ? null : JSON.stringify(value));
    } catch {
      // Private mode / storage full: saves just don't persist.
    }
  }

  newVoyage(captain: CaptainBody, names?: VoyageNames): void {
    setLastCourse(safeStorage(), this.course);
    this.writeSave(null);
    this.learn.newGame();
    if (names) this.learn.progress.setNames(names.captain, names.ship);
    void this.voyage(captain, null);
  }

  continueVoyage(): void {
    // Continue resumes the last course played.
    const last = lastCourse(safeStorage(), PLAYABLE_IDS);
    if (last !== this.course) this.useCourse(last);
    setLastCourse(safeStorage(), this.course);
    const save = this.readSave();
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

  /** The pause menu's Unstuck: back to the game, and back onto the path (or the ship into open water). */
  unstuck(): void {
    if (!this.session) return;
    this.resume();
    this.session.unstuck();
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

  /**
   * The chart's island card shows `islandId`: a jump there is likely, so it starts streaming in at
   * low priority once the pick has held a moment (PLAN §13.3; it's freed again if you don't go).
   */
  chartSelect(islandId: string): void {
    window.clearTimeout(this.chartPickTimer);
    const cove = this.cove;
    if (!cove || !this.session || islandId === this.session.island) return;
    if (!isIslandId(islandId)) return;
    // A locked island (not open yet) is only shown on the chart: nothing of it streams (the same gate
    // as `openIslands`, from the modules the chart asks without loading the world).
    if (!islandOpen(islandId)) return;
    this.chartPickTimer = window.setTimeout(() => {
      if (this.cove === cove && this.state.screen === 'chart') void cove.residents[islandId].load('low');
    }, 600);
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
      // A jump to another island waits for it to stream in and warm (behind the fade).
      const id = pointId.slice('island:'.length);
      if (this.cove && isIslandId(id)) await this.islandWarmed(this.cove, session, id);
      if (this.session !== session) return;
      await session.travel(p.x, p.z, p.heading);
      this.resume();
      await session.hud.fade(false, 420);
      session.hud.toast(to.label, 2.4);
    })();
  }

  /** Warms a streamed island each time it streams in (island-warm.ts). */
  private warmIsland(
    cove: CoveScene,
    id: StreamedIsland,
    setup: { roots: Object3D[]; reveal(): void },
    post: ScenePassCompiler | null,
  ): Promise<void> {
    return warmIsland({ engine: this.o.engine, cove, id, setup, post, live: () => this.cove === cove });
  }

  /** Watches the session's islands from now on: each setup of one (a first visit or a reload) is warmed. */
  private watchIslands(
    cove: CoveScene,
    session: GameSession,
    post: { compileObject(object: Object3D): Promise<void> } | null,
    warmedAlready: readonly StreamedIsland[],
  ): void {
    this.unwatchIslands?.();
    this.islandWarm.clear();
    const warm = (id: StreamedIsland, setup: { roots: Object3D[]; reveal(): void }, gen: number) =>
      this.islandWarm.set(id, { gen, done: this.warmIsland(cove, id, setup, post) });
    for (const { id, setup, gen } of session.islandSetups()) {
      if (warmedAlready.includes(id)) this.islandWarm.set(id, { gen, done: Promise.resolve() });
      else warm(id, setup, gen);
    }
    this.unwatchIslands = session.onIslandSetup((id, setup) => warm(id, setup, session.islandSetupGen(id)));
  }

  /** Streams an island in (if it isn't) and waits for its content's warm-up; gives up if the voyage ends. */
  private async islandWarmed(cove: CoveScene, session: GameSession, id: StreamedIsland): Promise<void> {
    // A jump there asks again at once, even after a failed stream.
    const stream = cove.residents[id];
    const world = await stream.load('auto', true);
    if (!world) return;
    for (let i = 0; i < 1800 && this.cove === cove && this.session === session; i++) {
      // This load's content is set up (a reload's too: one setup per load) and its warm has begun.
      const gen = session.islandSetupGen(id);
      const w = this.islandWarm.get(id);
      if (stream.state === 'resident' && gen === stream.loads && w?.gen === gen) return w.done;
      await new Promise<void>((r) => requestAnimationFrame(() => r()));
    }
  }

  /** Warms what joins the world after it's playing (island-warm.ts). */
  private warmLate(
    cove: CoveScene,
    roots: readonly Object3D[],
    post: ScenePassCompiler | null,
  ): Promise<void> {
    return warmLate({ engine: this.o.engine, cove, roots, post, live: () => this.cove === cove });
  }

  quitToTitle(): void {
    this.save();
    this.endVoyage();
    // Back to the open-sea title: just wind and surf, no island palms or birdsong.
    this.o.audio.sfx.setBed('palms', 0);
    this.o.audio.sfx.setBed('birds_dawn', 0);
    this.set({ hasSave: !!this.readSave(), save: this.saveSummary() });
    this.showTitle();
  }

  startOver(): void {
    this.writeSave(null);
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
    writeSession(RESUME_KEY, { to: inGame && this.readSave() ? 'game' : 'title' });
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
    if (r.to === 'game' && this.readSave()) {
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

  setOs(os: OsId | null): void {
    this.learn.saveSetup({ os });
  }

  skipOpening(): void {
    if (this.opening) this.opening.skip();
    else if (this.loading) this.skipWhenReady = true;
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
      savedCourses: PLAYABLE_IDS.filter((id) => readJson(courseKey(id, 'save'))),
      save: hasSave ? this.saveSummary() : null,
      learn: this.learnSummary(),
      ...patch,
    };
    this.title?.setInteractive(this.state.screen === 'title');
    for (const l of this.listeners) l(this.state);
  }

  private saveSummary(): UiState['save'] {
    const save = this.readSave();
    if (!save) return null;
    return { location: save.place ?? 'Anchorage Cay', questsDone: this.questsDoneCount() };
  }

  private learnSummary(): UiState['learn'] {
    return {
      doubloons: this.learn.progress.data.doubloons,
      seals: this.learn.progress.data.seals.slice(),
      sails: this.learn.progress.data.sails,
      captainName: this.learn.progress.data.captainName,
      os: this.learn.progress.data.setup.os,
      osDetected: this.learn.getState().osDetected,
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
    seaState.setSetting(s.seaState);
    seaState.setReducedMotion(s.reducedMotion);
    this.learn.setGithubChecks(s.githubChecks);
    this.o.engine.setRenderScale(s.renderScale === 'auto' ? null : s.renderScale);
  }

  /**
   * The opening's sound starts loading on the captain screen: Juno's cabin lines, its sound effects
   * and its song (it starts at the chest's latch, while the island streams in behind the cabin).
   */
  private prefetchOpeningAudio(): void {
    const a = this.o.audio;
    a.music.prefetch('opening');
    a.preloadVoice(BRIEFING_LINES);
    void a.sfx.preload(OPENING_SOUNDS);
  }

  /**
   * The title's song and sea buffer once the title's up (loading needs no gesture), so the first press
   * plays them at once. Until the song has buffered (or TITLE_MUSIC_WAIT_MS), the title's other
   * downloads wait: an `<audio>` element's request is low priority, and over HTTP/2 (GitHub Pages) the
   * game's high-priority fetches were served first, so on Slow 4G the title's song didn't start for
   * 40 s after the press (tools/audiotest.mjs).
   */
  private prefetchTitleAudio(): void {
    const a = this.o.audio;
    this.titleAudio ??= this.titleReady().then(() => {
      a.music.prefetch('harbour');
      void a.sfx.preload(TITLE_BEDS);
      return a.music.whenBuffered('harbour', TITLE_MUSIC_WAIT_MS);
    });
  }

  private prefetchTitlePacks(): void {
    if (this.titlePrefetchStarted) return;
    this.titlePrefetchStarted = true;
    const run = () => {
      void (this.titleAudio ?? Promise.resolve())
        .then(() => packs.loadManifest())
        // Nothing waits on it yet: low priority, so the title's song keeps its share of the line.
        .then(() => packs.prefetch('testcove/critical', undefined, undefined, 'low'))
        .catch(() => undefined);
      // The opening builds quietly too, so Continue (and a quick Set sail) fade straight into it.
      void (this.titleAudio ?? Promise.resolve()).then(() => this.prepareOpening());
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
    this.prefetchOpeningAudio();
    const { engine } = this.o;
    const destination = save?.place ?? 'Anchorage Cay';
    const progressNow = { value: 0.02, message: 'Weighing anchor', destination, cinematic: true };
    const report = (value: number, message: string) => {
      progressNow.value = value;
      progressNow.message = message;
      this.set({ progress: { ...progressNow } });
    };
    let opening: Opening | null = null;
    const early: { sky: SkySystem | null } = { sky: null };
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
      // The island's code and the course's data (its core chunk and Anchorage's chapter part; the
      // title only has its course.json) load behind the cabin: the cabin only waits for itself and
      // the fade. The course pack is active before the session reads any of it. The other islands'
      // chapter parts load as those islands stream in (src/course/load.ts).
      const islandCode = Promise.all([
        import('../world/cove-scene'),
        import('./session'),
        activateCourse(this.course, { islands: [HOME_ISLAND] }),
        // Each island's code is a chunk of its own (src/islands/registry.ts): its stream and its play.
        ...ISLAND_LIST.map((e) => e.code()),
      ]);
      islandCode.catch(() => undefined);
      const [ready] = await Promise.all([
        prep.then(async (o) => (await o.prepare(), o)),
        new Promise((r) => setTimeout(r, 620)).then(() =>
          this.set({ screen: 'voyage-loading', captain, progress: progressNow }),
        ),
      ]);
      opening = ready;
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
      // Only now can a skip reach it: start() resets the beat, so an earlier skip waits for play.
      this.opening = opening;
      await opening.veil(true, 0);
      setSailVeil.remove();
      // A steady resolution for the whole opening and arrival (no adaptive changes mid-beat), at most
      // 1.5x: the cabin's light and the warming world fit 60 fps there. Released at landfall.
      engine.holdResolution(OPENING_PIXEL_CAP);
      this.resolutionHeld = true;
      // The island builds in short slices of each frame, so the cabin and the chart never stall.
      this.unslice ??= installBuildSlicer(BUILD_SLICE_MS);
      // The island's sky first, while the screen is still dark: its cloud noise bakes and its compute
      // kernels each build in one step three can't split (60–110 ms on High), which stalled the cabin.
      await opening.play(async () => {
        early.sky = createSky(engine.renderer, engine.scene, engine.tier, engine.backend);
        await early.sky.prefetch([]);
      });
      // Back from Apply's reload, or a skip asked for before the opening was ready.
      if (this.settingsOnLand || this.skipWhenReady) opening.skip();
      this.skipWhenReady = false;
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
          sky: early.sky,
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
      // The other islands stream in later, when something needs them, except for a save on one:
      // it's put in now and warmed with the home island.
      const savedOn = save ? islandAt(save.x, save.z) : HOME_ISLAND;
      const first = savedOn !== HOME_ISLAND ? (cove.islands[savedOn] ?? null) : null;
      if (first) {
        report(0.78, `Sighting ${ISLANDS[savedOn].name}`);
        await first.load();
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
        resume: !!save,
        fromChart: true,
        start: save ? { x: save.x, z: save.z, heading: save.heading } : undefined,
        onMenu: () => this.pause(),
        onChart: () => this.openChart(),
        learn: this.learn,
        battles: savedBattles(save?.battles),
        // Saved at once, even at sea, so a won or skipped battle is never fought again.
        onBattle: () => this.save(),
      });
      // The island's theme takes over from the opening's song: it buffers while the cabin plays.
      this.o.audio.music.prefetch(ISLANDS[this.session.island].music);
      // Every island's sky (and the passages between them) goes on the GPU before the hitch guard arms.
      await cove.sky.prefetch(ISLAND_LIST.map((e) => e.sky.hours));
      report(0.92, 'Lighting the lanterns');
      const post = await this.o.upgradePost?.(cove, { warm: false });
      cove.setLateWarm((roots) => this.warmLate(cove, roots, post ?? null));
      const frame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
      // The world's pipelines build off-thread (compiled for the post's scene pass, nothing drawn), a
      // few milliseconds of main-thread work a frame, while the cabin holds its establishing shot.
      // Objects that appear later (marked userData.prewarm) are shown for the warm, then hidden.
      if (first) {
        (await this.session.islandSetup(savedOn)).reveal();
        first.hold(true);
        for (const r of first.roots()) r.visible = true;
      }
      try {
        await warmWorld({
          engine,
          cove,
          post: post ?? null,
          frame,
          // The terrain's finer levels of detail (and the saved island's, for a save there).
          terrains: [cove.terrain, first?.terrain ?? null],
          beforeDraws: async () => {
            // The post chain's own quad first, in a frame of its own, then what only a real draw builds
            // (shadow passes, instanced meshes on the pass path), behind the cabin.
            // With the world out of the camera's view, so its first draws wait for the batches below
            // (drawn here at once, the terrain, the sea and the sky held this frame for ~55 ms).
            const layers = engine.camera.layers.mask;
            engine.camera.layers.set(30);
            try {
              post?.warmOutput?.();
            } finally {
              engine.camera.layers.mask = layers;
            }
            engine.renderNow();
            await frame();
            ready.setDrawWorld(true);
          },
        });
      } finally {
        first?.hold(false);
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
      engine.counters.stalls.length = 0;
      engine.counters.arm();
      report(1, 'Landfall');
      this.save(captain);
      // The chart holds until it's alive, then the camera dives in: to the arrival flyover's first
      // view on a new voyage, or to wherever the save's camera is on Continue.
      await opening.ready();
      const island = this.session.island;
      const c = engine.camera;
      const look = c.getWorldDirection(c.position.clone()).multiplyScalar(30).add(c.position);
      const key = arrivalFlight(ISLAND_REGISTRY[HOME_ISLAND].arrival, true).keys[0]!;
      const target =
        !save && island === HOME_ISLAND
          ? {
              island,
              eye: { x: key.x, y: key.y, z: key.z },
              look: { x: key.tx, y: key.ty, z: key.tz },
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
      // From here, each island that streams in (a first visit, or again after it was freed) warms.
      const warmedWithVoyage: StreamedIsland[] = [HOME_ISLAND];
      if (first) warmedWithVoyage.push(savedOn);
      this.watchIslands(cove, this.session, post ?? null, warmedWithVoyage);
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
      if (early.sky && this.cove?.sky !== early.sky) early.sky.dispose();
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
      this.skipWhenReady = false;
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
    this.unwatchIslands?.();
    this.unwatchIslands = null;
    this.islandWarm.clear();
    window.clearTimeout(this.chartPickTimer);
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
      const last = this.readSave();
      if (last && savedBattles(last.battles).length !== battles.length)
        this.writeSave({ ...last, battles } satisfies SaveData);
      return;
    }
    this.writeSave({
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
  if (!isSeaStateId(out.seaState)) out.seaState = DEFAULT_SETTINGS.seaState;
  out.githubChecks = out.githubChecks === true;
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
