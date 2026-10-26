import { onPierDeck } from '../world/islands/anchorage/village';
import { spyglassSpeakerPan } from '../learn/spyglass-layout';
import { CHART_LABELS, chartLabel, firstShowing } from '../learn/content/labels';
import { barksFor } from '../course/active';
import {
  COURSE,
  courseIsland,
  courseVoiceBase,
  islandHooks,
  welcomeLines as courseWelcome,
} from '../course/catalog';
import { Vector3, type Object3D } from 'three/webgpu';
import { buildSlice } from '../engine/build-slice';
import { releaseRemovedObjects } from '../util/dispose-three';
import type { IslesAudio } from '../audio';
import type { FootstepSurface } from '../audio/soundscape/soundscape';
import type { Engine } from '../engine/engine';
import type { Input, InputState } from '../engine/input';
import type { Character, CharacterLibrary, PlayerBody } from '../world/characters';
import type { CharacterGrounding } from '../world/characters/types';
import { ParrotFlight, type FlightView } from '../world/characters/parrot-flight';
import { clearCharacterLodView, setCharacterLodView } from '../world/characters/character-lod';
import type { CoveScene } from '../world/cove-scene';
import type { FarCull } from '../world/far-cull';
import { COVE } from '../world/layout';
import { windOnBow } from '../world/ship/dynamics';
import { seaState } from '../world/ocean/sea-state';
import { windAt } from '../world/wind';
import { CollisionWorld, type SurfaceKind, type WalkSurface } from './collision';
import type { CircleObstacle } from '../world/contracts';
import { ShipCameraBlockers } from './ship-camera';
import { Residency, type ResidencyDecision } from './residency';
import { footprintDistance } from '../world/islands/footprint';
import { Dialogue } from './dialogue';
import { FootstepPuffs } from './footstep-puffs';
import { FollowCamera, SAIL_RIG, WALK_RIG, type CameraShot } from './follow-camera';
import { arrivalFlight, arrivalKeys, type IslandArrival, type IslandId } from './arrivals';
import {
  ISLANDS,
  islandAt,
  islandLight,
  nextMorningFrom,
  nightAtSea,
  nightAtSeaSeconds,
  NIGHT_AT_SEA,
  openIslands,
  otherLight,
  passageSky,
  type IslandBerth,
  type PassageHold,
} from './islands';
import { PassageBattles } from './passage-battles';
import type { BattleRun } from './battle-run';

export { ISLANDS, islandAt } from './islands';
import { HOME_ISLAND, ISLAND_LIST, STREAMED_ISLANDS, isIslandId } from '../islands/registry';
import { noteIslandStory } from '../islands/open';
import type { IslandContent, IslandContentHost, IslandCode, IslandSetup, IslandWalk } from './island-code';
import { terrainRockCameraBlockersSliced } from '../world/terrain/terrain-rocks';
import { FlyoverPath } from './flyover';
import { world as worldUniforms } from '../world/uniforms';
import { Helm } from './helm';
import { Hud } from './hud';
import { Interactions, type Interactable } from './interaction';
import { COVE_NPCS, NpcCrowd, type Npc } from './npcs';
import { PlayerController } from './player-controller';
import type { LearnStore } from '../learn/store';
import { createChest, type TreasureChest } from './chest';
import { COVE_CHESTS, currentQuest, npcScript } from './cove-quests';
import { bearingOf, type CompassTarget } from './compass';
import { compassGoals, type CompassGoals } from './compass-goals';
import { CompassRoute, Wayfinder, type CompassLeg } from './wayfinding/compass-route';
import type { WalkRoute } from './wayfinding/walk-graph';
import { TIP_SPOTS } from './island-tips';
import { puzzleOn } from '../course/puzzles';
import { createModelMarketSigns, type ModelMarketSite } from '../world/sites/model-market';
import { BOOTH_LAYOUT } from '../world/market-stall/booth';
import type { VillageAnchor } from '../world/village/kit';
import type { MarketStallLayout } from '../world/market-stall/layout';
import { createModelMarket, type MarketHost } from './puzzles/model-market';
import { MARKET_PUZZLE, marketStall } from './market/stalls';
import { CATEGORY_PRICE, JOBS as MARKET_JOBS } from './market/jobs';
import { BOARDS as MARKET_BOARDS } from './market/models';
import {
  GALLERY_CAMERA_COLUMN,
  LIGHTHOUSE_GROUND_DOOR,
  LIGHTHOUSE_STAIR_HEAD,
  lighthouseArrival,
  lighthouseFade,
  lighthouseTransitAt,
  onLighthouseGallery,
  type LighthouseDirection,
} from './lighthouse-transit';
import { starfishCount } from '../world/starfish/spots';
import { plankProgress, plankSurface, type PlankSpan } from './gangway';
import { runScript, type ScriptStep } from './script';
import { defaultShipName } from '../learn/progress';
import { islandChapter } from '../learn/course-board';
import { COURSE_BOARDS } from '../world/islands/course-boards';
import { courseBoardSpot } from '../world/sites/course-board';
import { fillSetup } from '../learn/setup';
import { createBard } from './puzzles/bard';
import { createChristening } from './puzzles/christening';
import { createCrane } from './puzzles/crane';
import { createFirstWords } from './puzzles/first-words';
import { createGearRack } from './puzzles/gear-rack';
import { createPaintSails } from './puzzles/paint-sails';
import { createSluice, SLUICE_ID } from './puzzles/sluice';
import { migrateQuests, storyEvent, storyHolds } from './story';
import type { HintTier, Puzzle, PuzzleHost, PuzzleTerminal, SailAction } from './puzzles/types';

type SessionMode = 'walk' | 'sail' | 'docking' | 'transition';
/** The islands that come and go from memory (the streamed ones, and Anchorage, which goes dormant). */
export type StreamedIsland = IslandId;
export type { IslandSetup };
/** A first landfall: waiting for the game to show, flying in (or, with reduced motion, just the title card), then done. */
type ArrivalPhase = 'waiting' | 'flying' | 'card' | 'done';

export interface SessionOptions {
  engine: Engine;
  cove: CoveScene;
  characters: CharacterLibrary;
  input: Input;
  hudParent: HTMLElement;
  audio: IslesAudio | null;
  body: PlayerBody;
  variant?: number;
  voiceManifest?: string;
  /** Skips the opening Wingman hint (screenshots, tests). */
  quiet?: boolean;
  /** A first landfall flies the short arrival that follows the opening's dive into the chart. */
  fromChart?: boolean;
  /** Where to start (Continue); defaults to the quay spawn. */
  start?: { x: number; z: number; heading: number };
  /** Esc / Start and M / Back while playing. */
  onMenu?: () => void;
  onChart?: () => void;
  /** Quizzes, spyglass, chests, and the Logbook (the session freezes while one is open). */
  learn?: LearnStore | null;
  /**
   * A Continue: once the player's ashore and nothing else is on, the "where you left off" card, then
   * Wingman's recap if one's due.
   */
  resume?: boolean;
  /** Sea battles already fought or skipped (from the save). */
  battles?: readonly string[];
  /** A sea battle was won or skipped (save it now). */
  onBattle?: (id: string, how: 'won' | 'skipped') => void;
}

export interface GameSession {
  readonly mode: SessionMode;
  readonly player: PlayerController;
  readonly hud: Hud;
  readonly world: CollisionWorld;
  readonly camera: FollowCamera;
  readonly npcs: NpcCrowd;
  /** The island you're on, or whose berth the ship lies at while you sail. */
  readonly island: IslandId;
  /** Freezes the player, helm, and HUD prompts while menus are open (the world keeps living). */
  setPaused(on: boolean): void;
  /**
   * Puts a wedged captain back on the nearest point of the island's routes, or warps the ship off
   * into open water (the pause menu's Unstuck). False when there's nothing to do (a battle, a ride).
   */
  unstuck(): boolean;
  /** The game's on screen (the loading card has gone): a first landfall's flyover takes off. */
  begin(): void;
  /** Seconds until the arrival flyover reaches the captain (0 when there's none, or it's done). */
  arrivalLeft(): number;
  /**
   * Loading: steps the camera along a pending flyover, calling `step` at each view (render a frame,
   * compile), so everything it'll see is built behind the loading card rather than mid-flight.
   */
  warmArrival(step: () => Promise<void>): Promise<void>;
  /**
   * A streamed island's cast, chests and sites (their groups), once its world has streamed in and
   * they've joined the scene: unwarmed and hidden, so nothing draws them before they're built.
   * Whoever warms them calls `reveal` after (the flow, with the island). Pending until the island
   * loads.
   */
  islandSetup(id: StreamedIsland): Promise<IslandSetup>;
  /**
   * Hears each time an island's cast, chests and sites join the scene: the first visit, and each
   * time it streams in again after it was freed. Hidden and unwarmed until the listener calls `reveal`.
   */
  onIslandSetup(fn: (id: StreamedIsland, setup: IslandSetup) => void): () => void;
  /** The islands whose content is in the scene now, and which setup (1, 2, …) it is. */
  islandSetups(): { id: StreamedIsland; setup: IslandSetup; gen: number }[];
  /** How many times an island's content has been set up this voyage (0: never). */
  islandSetupGen(id: StreamedIsland): number;
  /** Fast travel: docks the ship if you're sailing, then puts you at (x, z). */
  travel(x: number, z: number, heading: number): Promise<void>;
  /** An open island's quay by the berth (the chart's "Travel here"), or null if it isn't open. */
  islandQuay(id: string): { x: number; z: number; heading: number; label: string } | null;
  /** Player or ship position for the chart and saves, and the island's name. */
  where(): { x: number; z: number; heading: number; onShip: boolean; place: string };
  /** The passage's sea battle (docs/specs/BATTLES.md): whether one's on, Skip battle, and what's done. */
  readonly battle: {
    readonly active: boolean;
    skip(): void;
    done(): string[];
  };
  /** Dev/test hooks. */
  readonly debug: {
    /** The starfish to collect (tests). */
    starfish(): { id: string; island: string; x: number; z: number; y?: number }[];
    /** `y` picks the level where walk surfaces stack (the lighthouse stair). */
    teleport(x: number, z: number, heading?: number, y?: number): void;
    board(): Promise<void>;
    dock(): void;
    state(): Record<string, unknown>;
    /** Chest positions and facings (tests). */
    chests(): { id: string; x: number; z: number; h: number; opened: boolean }[];
    /** The message bottles and whether each has been read (tests). */
    bottles(): { id: string; x: number; z: number; read: boolean }[];
    /** A puzzle's test hooks (state, solve, …) by id, e.g. 'P0.1'. */
    puzzle(id: string): Puzzle['debug'] | null;
    /** The streamed islands' cast where they stand (tests), empty until an island's up. */
    cast(): { id: string; name: string; x: number; y: number; z: number; h: number; ground: number }[];
    /** The lift's two landings (tests), null until the town's up. */
    liftSpots(): {
      bottom: { x: number; z: number; h: number };
      top: { x: number; z: number; h: number };
    } | null;
    /** Starts a conversation with an NPC wherever you're standing (tests: carry on past an unreachable one). */
    talk(id: string): boolean;
    /** Where to stand to read each island's course notice board, facing it (tests). */
    courseBoards(): { island: IslandId; x: number; y: number; z: number; heading: number }[];
    /** Interactions within `r` metres of (x, z) and whether each is usable now (tests). */
    near(
      x: number,
      z: number,
      r: number,
    ): { id: string; x: number; y: number; z: number; d: number; on: boolean }[];
    /** The lift's raw anchors (tests: tx/ty/tz are the car's ends). */
    liftAnchors(): { liftBottom: unknown; liftTop: unknown };
    /** The lift ride's camera spot and how many of its samples are blocked (tests). */
    liftCamera(): { x: number; y: number; z: number; blocked: number } | null;
    /** Whether Rhea's aboard for the Three Helms, and whether the lighthouse is lit (tests). */
    rheaAboard(): boolean;
    lighthouseLit(): boolean;
    /** Whether Anchorage's point lighthouse is lit (tests). */
    anchorageLighthouseLit(): boolean;
    /** The lighthouse fast-forward under way ('up', 'down') or null (tests). */
    lighthouseTransit(): LighthouseDirection | null;
    /** Moves the ship while you're sailing (tests: skip the passage between islands). */
    sailTo(x: number, z: number, heading: number): void;
    /** Sets a quest step, e.g. to lower the gangway without playing the island (tests). */
    quest(id: string, step: string): void;
    /** The live sea (Settings → Sea state), and whether a battle or course holds it fixed. */
    sea(): { chosen: string; fixed: boolean; settled: boolean; windSpeed: number; amp: number[] };
    /** Whether the gangway's down, and its world-space foot and top (tests). */
    gangway(): {
      down: boolean;
      foot: { x: number; y: number; z: number };
      top: { x: number; y: number; z: number };
    };
    /** A streamed island's content hooks (tests: Thousand-Bough's board, hoist and basket), by island id. */
    island(id: string): Record<string, (...args: never[]) => unknown> | null;
    /** Presses Wingman's hint key. */
    hint(): void;
    /** Plays Wingman's welcome (the flight and his lines). */
    welcome(): Promise<void>;
    /**
     * Queues a learning pause for the next quiet moment ashore: the "where you left off" card
     * (`resume`), Wingman's recap (`recap`, leaving out `except`'s chapter), or both.
     */
    learningPause(what: { resume?: boolean; recap?: boolean; except?: string }): void;
    /** Wingman's flight phase and position (tests). */
    wingman(): { phase: string; x: number; y: number; z: number } | null;
    /** The arrival flyover's phase and seconds in (tests). */
    arrival(): { island: string; phase: ArrivalPhase; time: number; eye: number } | null;
    /** Plays an island's arrival flyover again (tests, screenshots); `fromChart`: the short one. */
    flyover(island?: IslandId, fromChart?: boolean): void;
    /** Holds the flyover at `time` seconds in (null lets it fly on). */
    holdArrival(time: number | null): void;
    /** Skips the arrival flyover, as E would. */
    skipArrival(): void;
    /** The passage battle's run once it's built (tests: its Battle, HUD and camera director). */
    battleRun(): BattleRun | null;
    /**
     * Which islands are in memory (tests, the memory gate): each streamed island's state, and
     * `settled` once every island you've left is freed and every one you need is in.
     */
    residency(): {
      resident: string[];
      states: Record<string, string>;
      settled: boolean;
    };
    /** Frees (or streams in) an island now, whatever the residency rules say (tests, screenshots). */
    unloadIsland(id: StreamedIsland): Promise<void>;
    /**
     * Keeps every island in memory that is (nothing's freed) while on, as if the world were busy
     * (tests: measure an island you've arrived at with the last one still resident).
     */
    keepResident(on: boolean): void;
    loadIsland(id: StreamedIsland): Promise<void>;
  };
  dispose(): void;
}

const WALK_HELP =
  '<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> move · <kbd>Shift</kbd> run · <kbd>Space</kbd> hop<br>' +
  'drag <kbd>mouse</kbd> look · wheel zoom · <kbd>E</kbd> interact';
const SAIL_HELP =
  '<kbd>W</kbd>/<kbd>S</kbd> raise / lower sails · <kbd>A</kbd>/<kbd>D</kbd> helm<br>' +
  'drag <kbd>mouse</kbd> look · wheel zoom · <kbd>E</kbd> dock when you’re near a berth';

/** The christening's shot of the port bow name board, in ship-local space (+x is the pier side). */
const CHRISTEN_EYE = new Vector3(-7.2, 4.4, 4.6);
const CHRISTEN_AT = new Vector3(-1.6, 2.4, 10.6);

/** How long Wingman's framed welcome holds before moving can cut it short. */
const INTRO_HOLD_MS = 1600;
/** With reduced motion there's no flight: the title card holds over the captain this long. */
const ARRIVAL_CARD_ONLY = 3.4;
/** How often (s) the session looks for a puzzle that's ready for its chart label. */
const LABEL_CHECK_EVERY = 0.25;
/** How much further into the evening's light (0-1) you sail back before the morning's hold lets go. */
const TURN_BACK = 0.1;
/** …or the chart label, which has more to read (docs/specs/LOWER-THIRDS.md). */
const ARRIVAL_LABEL_ONLY = 7;
const cardOnlySeconds = (plan: IslandArrival) => (plan.label ? ARRIVAL_LABEL_ONLY : ARRIVAL_CARD_ONLY);
/** Seconds into a flyover before a key press can skip it (so a held key from the menu doesn't). */
const ARRIVAL_SKIP_AFTER = 0.6;
/** Seconds of flight between the views warmed up while loading. */
const ARRIVAL_WARM_STEP = 0.5;

/** Wingman's tacking tip, the first time in a voyage you're in irons near a harbour (any course). */
const TACK_TIP_ID = 'tip:tacking';
const TACK_TIP =
  'We can’t sail straight into the wind, Captain. Tack instead: steer about 45° off it with A or D till ' +
  'the sails fill, then turn through the wind and zig-zag up to where you’re going.';
/** How close (m) to a berth counts as near its harbour, for the tacking tip. */
const HARBOUR_REACH = 450;

const STEP_WALK = 0.78;
const STEP_RUN = 1.15;
const DOCK_RANGE = 38;
/** Seconds of visible assisted approach before the fade tidies the ship into the berth. */
const DOCK_ASSIST_MAX = 6;
/** Metres of focus handicap for townsfolk who only bark (see `Interactable.bias`). */
const BARK_FOCUS_BIAS = 1.5;

/**
 * The Test Cove play session (Phase 0 T11): the walker and follow camera on collision built from
 * the terrain, village, and pier; eight NPCs with idle life; talking to Nell with voice and synced
 * subtitles; and boarding the brigantine to sail with the helm, then docking back at the pier.
 * Deck walking is deferred (issues.md): boarding puts you straight at the helm.
 */
export async function createSession(o: SessionOptions): Promise<GameSession> {
  const { engine, cove, input, audio } = o;
  const { camera, tier } = engine;
  const { village, ship, terrain, ocean } = cove;
  const ground = cove.heightField ?? terrain.heightField;
  // Every island's play (src/islands/registry.ts): its quests, walks and content. The flow fetches
  // their chunks with the world's, so they're in by now.
  const codes = await Promise.all(ISLAND_LIST.map((e) => e.code()));
  const games = new Map<IslandId, IslandCode>(ISLAND_LIST.map((e, i) => [e.id, codes[i]!]));
  const gameOf = (id: IslandId) => games.get(id)!;
  /** The streamed islands' content (cast, chests, sites, puzzles), made below; each sets up with its world. */
  const contents = new Map<IslandId, IslandContent>();
  const contentList: IslandContent[] = [];
  /** Each content's island (`contentList[i]` is `contentIds[i]`'s). */
  const contentIds: IslandId[] = [];

  const pierKind = (x: number, z: number): SurfaceKind => (onPierDeck(x, z) ? 'wood' : 'stone');
  const villageSurface: WalkSurface = { heightAt: village.walkable, kind: pierKind };
  const sites = cove.sites;
  const sitesSurface: WalkSurface = { heightAt: sites.heightAt, kind: 'stone' };
  // Which island you start on (a save can be on any), and so where the ship lies.
  const start = o.start ?? COVE.spawn;
  let island: IslandId = islandAt(start.x, start.z);
  let berth: IslandBerth = ISLANDS[island];
  // The gangplank: its foot rests on the quay where the calm-moored ship's plank would land, and its
  // top rides the rail each frame. Walkable only while it's down.
  const footLocal = ship.anchors.gangway;
  const plank: PlankSpan = {
    top: { x: 0, y: 0, z: 0 },
    foot: { x: 0, y: footLocal.y, z: 0 },
    halfWidth: 0.3,
    tread: 0.06,
  };
  /** Ship-local (x, z) at a berth, in world space. Port (+x) faces the quay. */
  const atBerth = (m: IslandBerth['mooring'], lx: number, lz: number) => ({
    x: m.x + Math.cos(m.heading) * lx + Math.sin(m.heading) * lz,
    z: m.z - Math.sin(m.heading) * lx + Math.cos(m.heading) * lz,
  });
  const placePlank = () => {
    const f = atBerth(berth.mooring, footLocal.x, footLocal.z);
    plank.foot.x = f.x;
    plank.foot.z = f.z;
  };
  placePlank();
  // Each island's walks (its town, quays and decks) and its water, live once its world has streamed in.
  const walks: IslandWalk[] = [];
  for (const e of ISLAND_LIST) {
    const walk = gameOf(e.id).walk?.({
      stream: cove.islands[e.id] ?? null,
      tier,
      content: () => contents.get(e.id) ?? null,
    });
    if (walk) walks.push(walk);
  }
  const wading = walks.filter((w) => w.inland);
  /** The Gate Board, the Flag Hoist, Pell's letters or a market counter has the keys and the camera. */
  let overlayModal = false;
  let gangwayDown = false;
  const world = new CollisionWorld({
    ground,
    waves: ocean.field,
    surfaces: [
      villageSurface,
      sitesSurface,
      ...walks.flatMap((w) => w.surfaces),
      plankSurface(plank, () => gangwayDown),
    ],
    circles: [
      ...village.colliders.circles,
      ...sites.colliders.circles,
      ...walks.flatMap((w) => w.circles ?? []),
    ],
    boxes: [...village.colliders.boxes, ...sites.colliders.boxes],
    // The islands' pools and streams, as they're drawn over this tier's ground: wade the shallows and
    // the streams, and the deep middle stops you.
    inland: (x, z, g, out) => {
      for (let i = 0; i < wading.length; i++) if (wading[i]!.inland!(x, z, g, out)) return true;
      return false;
    },
  });
  // Boulders and the headland cliff's overhang: only the follow camera keeps out of them.
  // In slices: all at once, the headland's blockers held a frame for ~120 ms behind the cabin.
  const rockBlockers = terrainRockCameraBlockersSliced(terrain.heightField, tier.tier);
  for (let r = rockBlockers.next(); ; r = rockBlockers.next()) {
    if (r.done) {
      for (const b of r.value) world.addCameraBox(b);
      break;
    }
    await buildSlice();
  }
  for (const b of village.cameraBlockers) world.addCameraBox(b);
  for (const b of cove.wreck.cameraBlockers) world.addCameraBox(b);
  for (const b of sites.colliders.camera) world.addCameraBox(b);
  // The moored ship: the follow camera keeps out of her hull and rig while you're ashore.
  const shipCams = new ShipCameraBlockers(world);

  const hud = new Hud(o.hudParent);
  await hud.loadSubtitles(o.voiceManifest ?? `${courseVoiceBase()}manifest.json`);
  hud.setHelp(WALK_HELP);
  let facialSpeaker: Character | null = null;
  let lineFace: Character | null = null;
  const glancers: Npc[] = [];
  /** Who the open conversation is with, and whether its camera has widened to a two-shot. */
  let partner: Npc | null = null;
  let twoShot = false;
  /** Everyone lit for the open conversation (the partner, and anyone else who speaks in it). */
  const lit: Character[] = [];
  const spotlight = (c: Character | null) => {
    if (!c || lit.includes(c)) return;
    c.setSpotlight(true);
    lit.push(c);
  };
  // Each voiced line moves the face of whoever says it: Pim and Pol share scenes, and Rhea talks
  // aboard. The nearest islander with that name wins (Lyra plays on two islands). Anyone else in the
  // scene glances toward the speaker while they talk.
  /** Everyone in the session: Anchorage's cast and each streamed island's. */
  const everyone = (): Npc[] => [...npcs.list, ...contentList.flatMap((c) => c.npcs)];
  /** An island's character who speaks somewhere else now (Rhea aboard for the Three Helms). */
  const speakerElsewhere = (speaker: string): Character | null => {
    for (const c of contentList) {
      const figure = c.speaker?.(speaker);
      if (figure) return figure;
    }
    return null;
  };
  const speakerNpc = (speaker: string): Npc | null => {
    let best: Npc | null = null;
    let bestD = Infinity;
    for (const n of everyone()) {
      if (!n.spec.name.split(' ').includes(speaker)) continue;
      const d = (n.x - player.x) ** 2 + (n.z - player.z) ** 2;
      if (d < bestD) [best, bestD] = [n, d];
    }
    return best;
  };
  const clearGlances = () => {
    for (const n of glancers) n.glance = null;
    glancers.length = 0;
  };
  const dialogue = new Dialogue(hud, audio, (line) => {
    const npc = line ? speakerNpc(line.speaker) : null;
    const aboard = line ? speakerElsewhere(line.speaker) : null;
    const face = line ? (aboard ?? npc?.character ?? facialSpeaker) : null;
    if (lineFace && lineFace !== face) lineFace.speak(null);
    lineFace = face;
    face?.speak(line);
    if (partner) spotlight(face);
    clearGlances();
    if (!npc || aboard) return;
    // Staging: when someone beside your partner speaks (Pim and Pol), widen once to frame them both.
    if (partner && npc !== partner && !twoShot && talkShot) {
      const shot = pairShot(partner, npc);
      if (shot) {
        twoShot = true;
        talkShot = shot;
        cam.frame(shot);
      }
    }
    for (const other of everyone()) {
      // The one you're talking with, and anyone standing right beside the speaker (Pim and Pol).
      const d2 = (other.x - npc.x) ** 2 + (other.z - npc.z) ** 2;
      if (other === npc || d2 > (other.talking ? 36 : 9)) continue;
      // Most of the way toward the speaker's face, a little toward you: a glance, not a stare.
      other.glance = {
        x: npc.x * 0.7 + player.x * 0.3,
        y: npc.y + 1.25,
        z: npc.z * 0.7 + player.z * 0.3,
      };
      glancers.push(other);
    }
  });
  // A text-only course's caption has a button that moves the conversation on (touch parity with E).
  hud.onNext = () => dialogue.next();

  // Player: stepUp 0.66, over the 0.55 default. It was first for the quay-to-pier lip, which the pier
  // ramp removed (#22), but a scan and walks at 0.55 (2026-10-22) still stop on Port Meridian's
  // terrace stairs (x ≈ 610 and 732, z −840 to −891), whose steps rise 0.57–0.6 m. Elsewhere 0.55
  // only loses side climbs (onto a door stair's flank, a deck's edge). Lower it only with those
  // stairs rebuilt.
  const player = new PlayerController({ stepUp: 0.66 });
  const hero: Character = o.characters.create({ body: o.body, variant: o.variant ?? 0, tier });
  /** Teleports the player and snaps the hero model with it, so no frame shows the old spot. */
  const placePlayer = (x: number, z: number, heading: number) => {
    player.teleport(world, x, z, heading);
    hero.group.position.set(player.x, player.y, player.z);
    hero.group.rotation.y = player.heading;
  };
  placePlayer(start.x, start.z, start.heading);
  engine.scene.add(hero.group);
  // Character levels of detail go by this camera, and keep full detail near the player.
  setCharacterLodView({ camera, focus: hero.group, tier: tier.tier });
  // Wingman leaves the shoulder to introduce himself, so it's clear who's talking.
  const wingman = ParrotFlight.attach(hero.group, engine.scene);
  const flightView: {
    captain: Vector3;
    height: number;
    eye: Vector3;
    ahead: { x: number; z: number } | null;
  } = {
    captain: new Vector3(),
    height: hero.capsule.height,
    eye: new Vector3(),
    ahead: null,
  };
  const updateWingman = (dt: number) => {
    if (!wingman || wingman.phase === 'perched') return;
    hero.group.getWorldPosition(flightView.captain);
    camera.getWorldPosition(flightView.eye);
    wingman.update(dt, flightView);
  };
  const footstepPuffs = new FootstepPuffs();
  footstepPuffs.addTo(engine.scene);

  // A character a slice (the whole cast at once held a frame for ~30 ms behind the cabin).
  await buildSlice();
  // Anchorage's market keeper keeps a stall only for a course with the market (else it's scenery).
  const anchorageKeeper = marketStall('anchorage').keeper.npc;
  const npcs = await NpcCrowd.createAsync(
    o.characters,
    COVE_NPCS.filter((n) => n.id !== anchorageKeeper || puzzleOn(MARKET_PUZZLE)),
    { ...village.anchors, ...sites.anchors, juno: COVE.firstMate, lyra: sites.hammock.seat },
    world,
    tier,
    camera,
    {
      x: COVE.spawn.x,
      y: COVE.quay.height,
      z: COVE.spawn.z + 3,
      heading: 0,
    },
    buildSlice,
    () => true,
  );
  await buildSlice();
  for (const n of npcs.list) {
    engine.scene.add(n.character.group);
    cove.detail.anchorage.add(n.character.group);
  }

  const cam = new FollowCamera();
  cam.snapBehind(player.heading);
  const helm = new Helm();
  const dyn = ship.dynamics;
  if (island !== 'anchorage') dyn.reset(berth.mooring.x, berth.mooring.z, berth.mooring.heading);
  dyn.dockAssist(berth.mooring);

  let mode: SessionMode = 'walk';
  /** The crew has the wheel (the Three Helms): your helm input and the dock key are ignored. */
  let crewAtHelm = false;
  /** Resolves a scripted docking (Autopilot's) once you're on the quay. */
  let afterDisembark: (() => void) | null = null;
  let dockTime = 0;
  const interactions = new Interactions();
  // The plank's foot sits on the quay deck, its axis half the plank's thickness up.
  const seatPlank = () => (plank.foot.y = world.groundAt(plank.foot.x, plank.foot.z) + 0.035);
  seatPlank();
  /** Moves the session to an island's berth: the plank, its task list, and its time of day. */
  const setIsland = (id: IslandId) => {
    island = id;
    berth = ISLANDS[id];
    placePlank();
    seatPlank();
    publishQuests();
    applySky(berth.sky);
    goalsStale = true;
  };
  const applySky = (sky: { hours: number; azimuth: number }) => {
    if (
      Math.abs(engine.clock.hours - sky.hours) < 0.002 &&
      Math.abs(engine.clock.azimuth - sky.azimuth) < 0.05
    )
      return;
    engine.clock.set(sky.hours, sky.azimuth);
    o.cove.sky.invalidate();
  };
  // A save away from Anchorage wakes to that island's sky (Anchorage keeps the page's own time).
  if (island !== 'anchorage') applySky(berth.sky);
  const sailSky = { hours: 0, azimuth: 0 };
  /**
   * A held passage sky (spec ISLAND-03 O3): out of an island's evening toward one whose light is the
   * next morning, the evening holds until the "next morning" cut, then the morning holds until you're
   * there. Null on every other passage.
   */
  let passageHold: PassageHold | null = null;
  let morningCut = false;
  /** The evening island's light where the morning came (a battle can end deep in it). */
  let eveningAt = 0;
  /** The night passing at sea (`nightAtSea`): seconds into it, and its two islands' light. */
  let nightPassing: { t: number; from: IslandId; to: IslandId } | null = null;
  /**
   * The "next morning": the night passes at sea under a dim dawn veil while the sun sets and rises
   * (no black frame); with reduced motion, a plain fade.
   */
  const nextMorning = async (): Promise<void> => {
    const hold = passageHold;
    if (!hold || morningCut || nextMorningFrom(hold.hold) !== hold.skip) return;
    morningCut = true;
    if (worldUniforms.reducedMotion.value <= 0.5) {
      nightPassing = { t: 0, from: hold.hold, to: hold.skip };
      return;
    }
    await hud.fade(true, 300);
    if (passageHold === hold) passageHold = { hold: hold.skip, skip: hold.hold };
    hud.toast('Next morning', 2.4);
    await hud.fade(false, 300);
    morningCut = false;
  };
  /** Ends the night at sea at once (you went ashore or travelled): the veil goes. */
  const endNightPassing = () => {
    if (!nightPassing) return;
    nightPassing = null;
    morningCut = false;
    hud.setDawn(0, '');
  };
  /** Anchorage's gangway stays up until the christening; elsewhere you can always board. */
  const canBoard = () => (island === 'anchorage' ? storyHolds('anchorage', 'gangwayDown', quests()) : true);
  const plankTop = new Vector3();
  const tmp = new Vector3();

  // Quests (POC §4.4 slice): NPC scripts depend on quest state, saved with learning progress.
  const learn = o.learn ?? null;
  const quests = (): Record<string, string> => learn?.progress.data.quests ?? localQuests;
  const localQuests: Record<string, string> = {};
  const setQuest = (id: string, step: string) => {
    if (learn) learn.progress.setQuest(id, step);
    else localQuests[id] = step;
    // Anchorage's Seal lights the point lighthouse (the cue shows it; this covers skips and tests).
    if (storyHolds('anchorage', 'sealed', quests())) village.setLighthouseLit(true);
    noteOpenings();
    publishQuests();
  };
  /** Tells the islands' gates which of the story conditions that open islands hold now (src/islands/open.ts). */
  const noteOpenings = () => noteIslandStory((id, condition) => storyHolds(id, condition, quests()));
  const publishQuests = () => {
    goalsStale = true;
    learn?.setQuests(
      ISLAND_LIST.flatMap((e) => gameOf(e.id).quests.log(quests())),
      trackerHere(),
    );
  };
  /** Where the compass points on this island for the quest state (refreshed when either changes). */
  let goals: CompassGoals = { main: null, optional: [] };
  let goalsStale = true;
  /** The task list for the island you're on (Anchorage's points on to Meridian once it's open). */
  const trackerHere = () => gameOf(island).quests.tracker(quests());
  noteOpenings();
  storyEvent('anchorage', 'landed', quests(), setQuest);
  // Suri's gate lever (the mill race) is the crane job's Actions step; without a save there's nothing
  // to check, so an old save's rules that ask for it don't fire.
  migrateQuests(quests(), setQuest, {
    workflowsOn: learn ? !!learn.progress.data.puzzles[SLUICE_ID]?.flags?.includes('gate') : undefined,
  });
  publishQuests();
  /** Chart labels already shown without a save (dev pages with `?nolearn`). */
  const labelsShown = new Set<string>();
  /**
   * A puzzle's or a battle's chart label (docs/specs/LOWER-THIRDS.md), the first time it starts in
   * this save. Ids without a label in the course pack's labels.json show nothing.
   */
  function puzzleLabel(id: string): void {
    const text = chartLabel(id);
    if (text && firstShowing(learn?.progress ?? null, labelsShown, id)) hud.label.show(text, 'puzzle');
  }
  // The passages' sea battles: built and warmed when you board with one waiting.
  const battles = new PassageBattles({
    engine,
    cove,
    audio,
    hudParent: o.hudParent,
    islands: ISLANDS,
    done: o.battles ?? [],
    quests,
    open: (id) => openIslands().some((b) => b.id === id),
    onDone: (id, how) => o.onBattle?.(id, how),
    toast: (text, seconds) => hud.toast(text, seconds),
    onStart: (id) => puzzleLabel(`battle:${id}`),
  });
  battles.prefetch(island);
  let scriptRunning = false;
  let disposed = false;
  // World beats a script can wait on (`{ cue }` steps), registered by the puzzles below.
  const cues = new Map<string, () => Promise<void>>();
  const scriptExtras = {
    onCue: (cue: string) => cues.get(cue)?.(),
    format: (text: string) => {
      const named = text
        .replaceAll('{ship}', learn?.progress.shipName ?? defaultShipName(null))
        .replaceAll('{captain}', learn?.progress.data.captainName ?? 'Captain');
      const l = learn?.getState();
      return l ? fillSetup(named, l.setup, l.osDetected) : named;
    },
  };

  // Talk to NPCs: quest beats run as scripts; Nell's lines are voiced; everyone else offers a bark.
  const talkTo = async (n: Npc) => {
    // Not over Wingman's welcome either (it pauses between Juno's line and his while he takes off).
    if (dialogue.active || scriptRunning || welcomeRunning) return;
    const originalPlayer = { x: player.x, z: player.z, heading: player.heading };
    const originalInputEnabled = input.enabled;
    if (n.spec.talkShot?.standLocal) {
      const stand = localNpcPoint(n, n.spec.talkShot.standLocal);
      placePlayer(stand.x, stand.z, Math.atan2(n.x - stand.x, n.z - stand.z));
      input.enabled = false;
    }
    const shot = npcTalkShot(n);
    partner = n;
    twoShot = false;
    spotlight(n.character);
    const priorFaceTarget = n.faceTarget;
    talkShot = shot;
    cam.frame(shot);
    if (n.spec.talkShot?.faceLocal) n.faceTarget = localNpcPoint(n, n.spec.talkShot.faceLocal);
    try {
      npcs.setTalking(n, true);
      facialSpeaker = n.character;
      const beat = learn ? scriptFor(n) : null;
      if (beat) {
        scriptRunning = true;
        input.enabled = false;
        await runScript(beat.steps, {
          dialogue,
          learn,
          speaker: n.spec.name.split(' ')[0]!,
          onQuest: setQuest,
          cancelled: () => disposed,
          ...scriptExtras,
        });
        input.enabled = !paused;
        scriptRunning = false;
      } else if (n.spec.voiced) {
        input.enabled = false;
        await dialogue.play(n.spec.voiced);
        input.enabled = true;
      } else if (barksFor(n.spec.id)?.length) {
        const barks = barksFor(n.spec.id)!;
        const i = Math.floor(Math.random() * barks.length);
        hud.showText(n.spec.name, barks[i]!, 4.5);
        await new Promise((r) => setTimeout(r, 2600));
      }
    } finally {
      facialSpeaker?.speak(null);
      facialSpeaker = null;
      lineFace?.speak(null);
      lineFace = null;
      clearGlances();
      partner = null;
      twoShot = false;
      for (const c of lit) c.setSpotlight(false);
      lit.length = 0;
      n.faceTarget = priorFaceTarget;
      npcs.setTalking(n, false);
      cam.frame(null);
      if (n.spec.talkShot?.standLocal) {
        placePlayer(originalPlayer.x, originalPlayer.z, originalPlayer.heading);
        input.enabled = originalInputEnabled && !paused;
      }
      if (scriptRunning) {
        scriptRunning = false;
        input.enabled = !paused;
      }
    }
  };
  /** The scripted beat an NPC offers now: a streamed island's cast follow its chapter, everyone else Chapter 00. */
  function scriptFor(n: Npc) {
    for (const c of contentList) if (c.owns(n.spec.id)) return c.script(n.spec.id);
    return npcScript(n.spec.id, quests());
  }
  /** The camera shot of the conversation that's on (so a tour can come back to it). */
  let talkShot: CameraShot | null = null;
  const addNpcTalk = (n: Npc) => {
    if (!n.spec.voiced && !barksFor(n.spec.id) && !scriptFor(n)) return;
    interactions.add({
      id: `npc:${n.spec.id}`,
      label: () => `Talk to ${n.spec.name}`,
      get x() {
        return n.x;
      },
      get y() {
        return n.y;
      },
      get z() {
        return n.z;
      },
      radius: n.spec.talkRadius ?? 2.6,
      // Islanders with a part in the story keep the E over townsfolk who only bark (POC §4, #178).
      bias: scriptFor(n) || n.spec.voiced ? 0 : BARK_FOCUS_BIAS,
      enabled: () => mode === 'walk' && !n.talking,
      onInteract: () => void talkTo(n),
    });
  };
  for (const n of npcs.list) addNpcTalk(n);

  const shipDocked = () => Math.hypot(dyn.pose.x - berth.mooring.x, dyn.pose.z - berth.mooring.z) < 1.5;
  interactions.add({
    id: 'ship:board',
    label: () => 'Board your ship',
    // Wherever she's moored now (after a voyage, a chart jump or a reload), not where she started.
    get x() {
      return plank.foot.x;
    },
    get y() {
      return plank.foot.y;
    },
    get z() {
      return plank.foot.z;
    },
    radius: 2.4,
    enabled: () => mode === 'walk' && shipDocked(),
    onInteract: () => {
      if (canBoard()) return void board();
      // Everything before the christening happens ashore, so say what's next instead.
      const next = currentQuest(quests());
      hud.toast(
        next
          ? `The gangway’s up until Anchorage is done. Next: ${next.task}.`
          : 'The gangway’s up until your ship has her name.',
        4.5,
      );
    },
  });

  /**
   * An island's course notice board (docs/specs/COURSE-BOARDS.md): walk up and read its chapter's
   * topics, each a link into the course. Anchorage's is there from the start; a streamed island's
   * comes and goes with its content. Returns the interaction's id.
   */
  const addCourseBoard = (id: IslandId): string => {
    const iid = `course-board:${id}`;
    const pose = COURSE_BOARDS[id];
    const chapter = islandChapter(id);
    interactions.remove(iid);
    if (!chapter) return iid;
    interactions.add({
      id: iid,
      label: () => 'Read the notices',
      x: pose.x + Math.sin(pose.rot) * 0.9,
      y: pose.y,
      z: pose.z + Math.cos(pose.rot) * 0.9,
      radius: 2.7,
      enabled: () => mode === 'walk' && !scriptRunning && !dialogue.active,
      onInteract: () => learn?.openCourseBoard(chapter),
    });
    return iid;
  };
  addCourseBoard('anchorage');

  // Treasure chests beside their NPCs; each grants a Logbook page once.
  const chests: {
    id: string;
    chest: TreasureChest;
    x: number;
    y: number;
    z: number;
    circle: CircleObstacle;
  }[] = [];
  const placeChest = (c: { id: string; side: number; back: number }, n: Npc, detail: FarCull) => {
    const s = Math.sin(n.heading);
    const co = Math.cos(n.heading);
    // NPC-right (for a character facing +heading) is (-cos, +sin) in xz.
    const x = n.home.x + s * (n.spec.out ?? 0) - co * c.side - s * c.back;
    const z = n.home.z + co * (n.spec.out ?? 0) + s * c.side - co * c.back;
    const y = world.surfaceHeightAt(x, z) ?? world.groundAt(x, z);
    return placeChestAt(c.id, x, y, z, n.heading, detail);
  };
  /** A chest at a spot (Thousand-Bough's sit by the booths and behind the falls, not by an NPC). */
  const placeChestAt = (id: string, x: number, y: number, z: number, heading: number, detail: FarCull) => {
    const c = { id };
    const chest = createChest({ lite: tier.tier === 'lite' });
    chest.group.position.set(x, y, z);
    chest.group.rotation.y = heading;
    if (learn?.isChestOpen(c.id)) chest.setOpen();
    engine.scene.add(chest.group);
    detail.add(chest.group);
    const circle = { x, z, r: 0.55 };
    world.addCircle(circle);
    chests.push({ id: c.id, chest, x, y, z, circle });
    interactions.add({
      id: `chest:${c.id}`,
      label: () => 'Open the chest',
      x,
      y,
      z,
      radius: 2.2,
      enabled: () => mode === 'walk' && !chest.opened && !scriptRunning,
      onInteract: () => void openChest(c.id, chest),
    });
    return chest.group;
  };
  for (const c of COVE_CHESTS) {
    const n = npcs.list.find((v) => v.spec.id === c.npc);
    if (n) placeChest(c, n, cove.detail.anchorage);
  }
  /** Takes chests away with their island (whether each is open lives in the save, not the chest). */
  const removeChests = (ids: readonly string[]) => {
    for (const id of ids) {
      const i = chests.findIndex((c) => c.id === id);
      if (i < 0) continue;
      const c = chests[i]!;
      chests.splice(i, 1);
      interactions.remove(`chest:${id}`);
      world.remove([c.circle]);
      c.chest.group.removeFromParent();
      c.chest.dispose();
    }
  };
  async function openChest(id: string, chest: TreasureChest): Promise<void> {
    input.enabled = false;
    audio?.sfx.oneShot('step_wood', chest.group.position, 1);
    await chest.open();
    await learn?.openChest(id);
    input.enabled = !paused;
  }
  // Nell opens her chest while she talks you through the prerequisites (the `nell-chest` cue).
  const nellChest = COVE_CHESTS.find((c) => c.npc === 'nell')?.id;
  cues.set('nell-chest', async () => {
    const c = chests.find((v) => v.id === nellChest);
    if (!c) return;
    if (!c.chest.opened) {
      audio?.sfx.oneShot('step_wood', c.chest.group.position, 1);
      await c.chest.open();
    }
    await learn?.openChest(c.id);
  });

  // Message bottles on the beaches (B0.1-B0.4): optional troubleshooting pages.
  const bottleSpots = sites.bottles.spots();
  for (const [id, p] of Object.entries(bottleSpots)) {
    if (learn?.isChestOpen(id)) sites.bottles.setCollected(id, true);
    interactions.add({
      id: `bottle:${id}`,
      label: () => 'Read the message in the bottle',
      x: p.x,
      y: p.y,
      z: p.z,
      radius: 2,
      enabled: () => mode === 'walk' && !!learn && !learn.isChestOpen(id) && !scriptRunning,
      onInteract: () => void openBottle(id, p),
    });
  }
  async function openBottle(id: string, at: { x: number; y: number; z: number }): Promise<void> {
    input.enabled = false;
    audio?.sfx.oneShot('bottle_pop', at, 0.9);
    sites.bottles.setCollected(id, true);
    await learn?.openChest(id);
    input.enabled = !paused;
  }

  // Routes for the compass, the crew and Unstuck: each island's walks and the sea lanes between them.
  const wayfinder = new Wayfinder(Object.fromEntries(ISLAND_LIST.map((e) => [e.id, gameOf(e.id).ways])));

  // Puzzles (POC §4.5): each registers its own interactions and saves its own state.
  const puzzleHost: PuzzleHost = {
    learn,
    hud,
    dialogue,
    audio,
    interactions,
    player: {
      get x() {
        return player.x;
      },
      get y() {
        return player.y;
      },
      get z() {
        return player.z;
      },
      get heading() {
        return player.heading;
      },
    },
    quests,
    setQuest,
    canAct: () => mode === 'walk' && !paused && !scriptRunning && !dialogue.active && !learn?.busy,
    beat: async (steps: readonly ScriptStep[], speaker: string) => {
      if (scriptRunning) return false;
      scriptRunning = true;
      input.enabled = false;
      const ok = await runScript(steps, {
        dialogue,
        learn,
        speaker,
        onQuest: setQuest,
        cancelled: () => disposed,
        ...scriptExtras,
      });
      input.enabled = !paused;
      scriptRunning = false;
      return ok;
    },
  };
  /** A puzzle overlay (the Gate Board, the Flag Hoist, Pell's letters) has the keys, the pad and Esc. */
  function setOverlayModal(on: boolean): void {
    overlayModal = on;
    input.enabled = !on && !paused && !scriptRunning;
    if (on) {
      hero.setSpeed(0);
      hud.setPrompt(null);
    }
  }
  // The Model Market: an overlay at Gilda's counter on the plaza, with the camera on her stall.
  const marketHost: MarketHost = {
    ...puzzleHost,
    frame: (shot) => cam.frame(shot),
    cut: (shot) => cam.cut(shot),
    setModal: setOverlayModal,
    reducedMotion: () => worldUniforms.reducedMotion.value > 0.5,
    place: placePlayer,
    filePage: (id) => {
      if (learn?.filePage(id)) hud.toast('New Logbook page: The Model Market. Press J to read it.', 3.5);
    },
    spotlight: (id, on) => {
      const n = everyone().find((v) => v.spec.id === id);
      n?.character.setSpotlight(on);
    },
  };
  const nell = npcs.list.find((n) => n.spec.id === 'nell');
  const bowXZ: number[] = [0, 0];
  // A course can turn a puzzle off (`"disabled": true` in its puzzles/<name>.json): its site stays as
  // scenery, and a cue that would start it does nothing.
  const christening =
    nell && puzzleOn('christening')
      ? createChristening(puzzleHost, {
          ship,
          nell: {
            get x() {
              return nell.x;
            },
            get y() {
              return nell.y;
            },
            get z() {
              return nell.z;
            },
            face: (t) => (nell.faceTarget = t),
            moveTo: (spot) => npcs.moveTo(nell, spot),
          },
          spot: COVE.christening,
          bow: () => {
            ship.bowWorld(bowXZ);
            return { x: bowXZ[0]!, z: bowXZ[1]! };
          },
          shipName: () => learn?.progress.shipName ?? defaultShipName(null),
          frame: (shot) => cam.frame(shot),
          shot: () => {
            // Ship-local: over the pier, aft of the bow and up high, looking at the port bow name board.
            ship.group.updateMatrixWorld();
            const eye = ship.group.localToWorld(CHRISTEN_EYE.clone());
            const at = ship.group.localToWorld(CHRISTEN_AT.clone());
            return { x: eye.x, y: eye.y, z: eye.z, tx: at.x, ty: at.y, tz: at.z };
          },
        })
      : null;
  if (christening) cues.set('christen', christening.cue);
  else cues.set('christen', async () => {});
  const gearRack = puzzleOn('gear-rack') ? createGearRack(puzzleHost, sites.gear) : null;
  cues.set('gear-checks', async () => gearRack?.cue());
  const lyra = npcs.list.find((n) => n.spec.id === 'lyra');
  const puzzles: Puzzle[] = [
    ...(puzzleOn('palette') ? [createPaintSails(puzzleHost, sites.palette, ship)] : []),
    ...(puzzleOn('bard') ? [createBard(puzzleHost, sites.hammock, () => lyra?.talking ?? false)] : []),
    ...(puzzleOn('sluice') ? [createSluice(puzzleHost, sites.mill)] : []),
    ...(puzzleOn('crane') ? [createCrane(puzzleHost, sites.crane)] : []),
    ...(gearRack ? [gearRack] : []),
    ...(puzzleOn('first-words')
      ? [createFirstWords(puzzleHost, ship, () => island === 'anchorage' && shipDocked())]
      : []),
    ...(christening ? [christening] : []),
  ];
  const hintPresses = new Map<string, { key: string; n: number }>();

  /**
   * A Model Market stall's lettering (its boards, plaques and job notes) at its island's anchor; the
   * stall itself is part of the island's town (docs/specs/MODEL-MARKET.md §2).
   */
  function marketSigns(origin: VillageAnchor, layout: MarketStallLayout, island: IslandId): ModelMarketSite {
    return createModelMarketSigns({
      origin,
      layout,
      keeper: marketStall(island).keeper.name,
      boards: MARKET_BOARDS.map((b) => ({
        category: b.category,
        price: CATEGORY_PRICE[b.category],
        names: b.shown.map((m) => m.name),
        more: b.more.length,
      })),
      jobs: MARKET_JOBS.map((j) => ({ id: j.id, note: j.note, size: j.size })),
      done: [],
    });
  }
  // Anchorage's stall on the quay (built with the world, so its market is the session's from the start;
  // it sleeps with the island's cast).
  const anchorageMarket =
    village.anchors.modelMarket && puzzleOn(MARKET_PUZZLE)
      ? marketSigns(village.anchors.modelMarket, BOOTH_LAYOUT, 'anchorage')
      : null;
  /** The market stalls' lettering besides Port Meridian's (freed with the session, or with their island). */
  const marketSites: ModelMarketSite[] = [];
  if (anchorageMarket) {
    marketSites.push(anchorageMarket);
    engine.scene.add(anchorageMarket.group);
    cove.detail.anchorage.add(anchorageMarket.group);
    puzzles.push(createModelMarket(marketHost, anchorageMarket, marketStall('anchorage')));
  }

  const FAR = { x: 1e6, y: 0, z: 1e6 };
  const anyTalking = () =>
    npcs.list.some((n) => n.talking) || contentList.some((c) => c.npcs.some((n) => n.talking));
  // A Seal's won: everyone nearby waves to you, the crowd cheers, and Wingman takes a lap and comes
  // back to your shoulder.
  cues.set('celebrate', async () => {
    audio?.sfx.oneShot('chime_solve', player, 0.9);
    for (const n of everyone())
      if (!n.talking && Math.hypot(n.x - player.x, n.z - player.z) < 45) n.character.greet();
    audio?.sfx.oneShot('stinger_triumph', player, 0.8);
    if (wingman && wingman.phase === 'perched') {
      hero.group.getWorldPosition(flightView.captain);
      camera.getWorldPosition(flightView.eye);
      wingman.takeOff(flightView as FlightView);
      await new Promise((r) => setTimeout(r, 2400));
      wingman.land();
    } else await new Promise((r) => setTimeout(r, 1200));
  });
  /** A Seal's lamp lighting: cut to `shot`, `light` it to a stinger, then cut back to the talk. */
  async function showLighting(shot: CameraShot, light: () => void): Promise<void> {
    await hud.fade(true, 260);
    cam.cut(shot);
    await hud.fade(false, 260);
    await new Promise((r) => setTimeout(r, 1100));
    light();
    audio?.sfx.oneShot('stinger_triumph', player, 0.8);
    await new Promise((r) => setTimeout(r, 2600));
    await hud.fade(true, 260);
    if (talkShot) cam.cut(talkShot);
    await hud.fade(false, 260);
  }
  // Anchorage's Seal (PLAN §4, Island 00 beat 11): the point lighthouse lights across the harbour.
  cues.set('anchorage-lighthouse', async () => {
    const L = COVE.lighthouse;
    // Out on the harbour north-east of the point, looking back at the whole tower with the west
    // beach behind it. Only water lies between, so the shot's always clear.
    const x = L.x + 34,
      z = L.z - 30;
    const shot: CameraShot = {
      x,
      y: Math.max(L.top + 6, world.waterAt(x, z, 0) + 3),
      z,
      tx: L.x,
      ty: L.top + 11,
      tz: L.z,
    };
    await showLighting(shot, () => village.setLighthouseLit(true));
  });
  if (storyHolds('anchorage', 'sealed', quests())) village.setLighthouseLit(true);

  /** An island's content had nothing to set up (it went again, or the session ended). */
  const noSetup: IslandSetup = { roots: [], reveal() {} };

  /** Puzzles whose label has had its chance (shown now, shown in an earlier visit, or none). */
  const labelDone = new Set<string>();
  let labelCheckIn = 0;
  /**
   * A puzzle's label shows when you first stand at it ready to play (the puzzle's `engaged`), with no
   * conversation, quest beat, quiz, menu or flyover in the way, and no other label up.
   */
  function checkPuzzleLabels(): void {
    if (paused || scriptRunning || dialogue.active || learn?.busy || hud.label.mode) return;
    if ((mode !== 'walk' && mode !== 'sail') || (arrival && arrival.phase !== 'done')) return;
    for (const p of puzzles) {
      const label = p.label ?? p.id;
      if (labelDone.has(label) || !p.engaged()) continue;
      labelDone.add(label);
      puzzleLabel(`puzzle:${label}`);
      return;
    }
  }

  // ---- The streamed islands' content: cast, chests, sites and puzzles arrive with each world ----
  /** The open conversation's camera shot, again (after a cutaway in a script). */
  const backToTalk = () => cam.frame(talkShot);
  /** The ship for a puzzle at sea (the Three Helms): the crew takes the wheel, and docks you home. */
  const seaHost: IslandContentHost['sea'] = {
    sailing: () => mode === 'sail' && !paused && !scriptRunning && !dialogue.active && !learn?.busy,
    afloat: () => mode === 'sail' || mode === 'docking',
    ship: dyn,
    crewHelm: (on) => {
      crewAtHelm = on;
      helm.reset();
      dyn.setInput({ trim: 0, rudder: 0 });
      if (!on) dyn.clearAutopilot();
    },
    seaPath: (fx, fz, tx, tz) => wayfinder.sea.path(fx, fz, tx, tz),
    dockHome: () =>
      new Promise<void>((resolve) => {
        afterDisembark = resolve;
        dockTo = ISLANDS[island];
        mode = 'docking';
        dockTime = 0;
        dyn.dockAssist(dockTo.mooring);
      }),
  };
  for (const e of STREAMED_ISLANDS) {
    const make = gameOf(e.id).content;
    const stream = cove.islands[e.id];
    if (!make || !stream) continue;
    const content = make({
      characters: o.characters,
      tier,
      camera,
      scene: engine.scene,
      world,
      detail: cove.detail[e.id],
      learn,
      audio,
      interactions,
      puzzleHost,
      player,
      walking: () => mode === 'walk',
      say: (ids) => dialogue.play([...ids]),
      text: (speaker, line) => dialogue.say(speaker, line),
      frame: (shot) => cam.frame(shot),
      cut: (shot) => cam.cut(shot),
      fade: (on, ms) => hud.fade(on, ms),
      backToTalk,
      place: (x, z, heading, y) => {
        player.teleport(world, x, z, heading, y);
        hero.group.position.set(player.x, player.y, player.z);
        hero.group.rotation.y = player.heading;
        cam.snapBehind(heading);
      },
      setModal: setOverlayModal,
      reducedMotion: () => worldUniforms.reducedMotion.value > 0.5,
      label: puzzleLabel,
      addNpcTalk: (n) => addNpcTalk(n),
      placeChest: placeChestAt,
      removeChests,
      openChest: async (id) => {
        const c = chests.find((v) => v.id === id);
        if (c && !c.chest.opened) {
          audio?.sfx.oneShot('step_wood', c.chest.group.position, 1);
          await c.chest.open();
        }
        await learn?.openChest(id);
      },
      cues,
      puzzles,
      stream,
      cove,
      ship,
      cam,
      hero,
      disposed: () => disposed,
      scripting: () => scriptRunning,
      placePlayer,
      placeChestBy: placeChest,
      beginRide: () => {
        mode = 'transition';
        input.enabled = false;
        hero.setSpeed(0);
        hud.setPrompt(null);
      },
      endRide: () => {
        mode = 'walk';
        input.enabled = !paused;
      },
      showLighting,
      talkShot: () => talkShot,
      sea: seaHost,
    });
    contents.set(e.id, content);
    contentList.push(content);
    contentIds.push(e.id);
  }
  /** A ride of an island's (the lift) has the walker. */
  const riding = () => contentList.some((c) => c.busy?.() ?? false);

  // ---- Islands that stream in and out (PLAN §13.3) ----
  // Each time an island's world streams in, its content goes on it and the listeners (the flow's
  // warm, the dev page's precompile) hear of it; before its world is freed, its content comes off.
  const streams = cove.residents;
  const setupListeners = new Set<(id: StreamedIsland, setup: IslandSetup) => void>();
  // Anchorage's content went in with the session (its first setup).
  const setupGen = Object.fromEntries(ISLAND_LIST.map((e) => [e.id, e.stream ? 0 : 1])) as Record<
    StreamedIsland,
    number
  >;
  const currentSetup: Partial<Record<StreamedIsland, IslandSetup>> = { [HOME_ISLAND]: noSetup };
  const deferred = () => {
    let resolve!: (s: IslandSetup) => void;
    const promise = new Promise<IslandSetup>((r) => (resolve = r));
    return { promise, resolve };
  };
  const nextSetup = Object.fromEntries(ISLAND_LIST.map((e) => [e.id, deferred()])) as Record<
    StreamedIsland,
    ReturnType<typeof deferred>
  >;
  nextSetup[HOME_ISLAND].resolve(noSetup);
  /** Anchorage's cast and chests while it's dormant, and whether each was shown. */
  let anchorageParked: { object: Object3D; visible: boolean }[] = [];
  const anchorageContent = (): Object3D[] => [
    ...npcs.list.map((n) => n.character.group),
    ...(anchorageMarket ? [anchorageMarket.group] : []),
    ...chests.filter((c) => COVE_CHESTS.some((k) => k.id === c.id)).map((c) => c.chest.group),
  ];
  /** Anchorage wakes: its cast and chests go back in (hidden until the warm-up shows them). */
  const setupAnchorage = async (): Promise<IslandSetup> => {
    const parked = anchorageParked;
    anchorageParked = [];
    for (const p of parked) {
      p.object.visible = false;
      engine.scene.add(p.object);
    }
    return {
      roots: parked.map((p) => p.object),
      reveal() {
        for (const p of parked) p.object.visible = p.visible;
        cove.anchorage.reveal();
      },
    };
  };
  /** Islands whose content is being built, or taken down. */
  const settingUp = new Set<StreamedIsland>();
  const unloading = new Set<StreamedIsland>();
  const runSetup = (id: StreamedIsland, make: () => Promise<IslandSetup>) => {
    settingUp.add(id);
    void make().then((setup) => {
      settingUp.delete(id);
      if (disposed || setup === noSetup) return;
      setupGen[id]++;
      currentSetup[id] = setup;
      nextSetup[id].resolve(setup);
      for (const fn of setupListeners) fn(id, setup);
    });
  };
  // A course that doesn't use an island leaves it as scenery: no cast, sites or puzzles there.
  const inCourse = (id: IslandId) => !!courseIsland(id, COURSE);
  /** Each streamed island's Model Market stall (its lettering and market), while the island's in. */
  const islandMarkets = new Map<IslandId, { site: ModelMarketSite; puzzle: Puzzle }>();
  const addIslandMarket = (id: IslandId, stall: { at: VillageAnchor; layout: MarketStallLayout } | null) => {
    if (islandMarkets.has(id) || !stall || !puzzleOn(MARKET_PUZZLE)) return null;
    const site = marketSigns(stall.at, stall.layout, id);
    site.group.visible = false;
    engine.scene.add(site.group);
    cove.detail[id].add(site.group);
    marketSites.push(site);
    const puzzle = createModelMarket(marketHost, site, marketStall(id));
    puzzles.push(puzzle);
    islandMarkets.set(id, { site, puzzle });
    return site.group;
  };
  const removeIslandMarket = (id: IslandId) => {
    const m = islandMarkets.get(id);
    if (!m) return;
    islandMarkets.delete(id);
    const { site, puzzle } = m;
    puzzles.splice(puzzles.indexOf(puzzle), 1);
    puzzle.dispose();
    marketSites.splice(marketSites.indexOf(site), 1);
    site.group.removeFromParent();
    site.dispose();
  };
  /** A streamed island's world is in: its content goes on it, then its course board and market stall. */
  const onIslandWorld = (id: IslandId, built: unknown) =>
    runSetup(id, async () => {
      const content = contents.get(id);
      if (!content || disposed || !inCourse(id)) return noSetup;
      const setup = await content.setup(built);
      if (!setup) return noSetup;
      if (disposed || cove.islands[id]?.world !== built) return setup;
      addCourseBoard(id);
      const market = addIslandMarket(id, content.market?.(built) ?? null);
      if (!market) return setup;
      return {
        roots: [...setup.roots, market],
        reveal() {
          setup.reveal();
          market.visible = true;
        },
      };
    });
  const unsubscribeStreams = [cove.anchorage.onReady(() => runSetup(HOME_ISLAND, setupAnchorage))];
  for (const e of STREAMED_ISLANDS) {
    const stream = cove.islands[e.id];
    if (!stream) continue;
    unsubscribeStreams.push(stream.onReady((built) => onIslandWorld(e.id, built)));
    // Streamed in before the session (a save there).
    if (stream.state === 'resident' && stream.world) onIslandWorld(e.id, stream.world);
  }

  /** Frees an island you've left: its content comes off first, then its world, a part a frame. */
  async function unloadIsland(id: StreamedIsland): Promise<void> {
    if (unloading.has(id) || settingUp.has(id)) return;
    unloading.add(id);
    try {
      await engine.counters.excuse(
        (async () => {
          // Everything its content put in the scene: once it's out, three is told it's disposed, or
          // its render objects (and through them the cast, chests and sites) stay alive (skill §4).
          const leaving: Object3D[] = [];
          if (id !== HOME_ISLAND)
            for (const r of currentSetup[id]?.roots ?? []) r.traverse((o) => void leaving.push(o));
          currentSetup[id] = undefined;
          nextSetup[id] = deferred();
          const content = contents.get(id);
          if (content) {
            content.teardown();
            removeIslandMarket(id);
            interactions.remove(`course-board:${id}`);
          } else if (id === HOME_ISLAND) {
            // Anchorage sleeps with its cast and chests (they stay as they are, out of the scene).
            const parked = anchorageContent().filter((o) => o.parent);
            anchorageParked = parked.map((object) => ({ object, visible: object.visible }));
            cove.anchorage.extra = parked;
          }
          releaseRemovedObjects(leaving, engine.scene);
          await streams[id].unload();
        })(),
      );
    } finally {
      unloading.delete(id);
    }
  }
  const residency = new Residency(
    ISLAND_LIST.map((e) => ({
      id: e.id,
      x: e.center.x,
      z: e.center.z,
      load: e.ranges.load,
      unload: e.ranges.unload,
      distance: e.ranges.byCentre
        ? undefined
        : (x: number, z: number) => footprintDistance(e.footprint, x, z),
    })),
  );
  const residencyOut: ResidencyDecision = { load: [], unload: [] };
  let residencyIn = 0;
  /** Tests hold every island in memory (`debug.keepResident`). */
  let keepResident = false;
  const reachable = (id: IslandId) => openIslands().some((b) => b.id === id);
  /** Where you are for residency: your feet ashore, the ship at sea (not the camera, which roams). */
  const residencyFocus = () =>
    mode === 'sail' || mode === 'docking' ? { x: dyn.pose.x, z: dyn.pose.z } : { x: player.x, z: player.z };
  /** Twice a second: streams in what you'll need, frees what you've left (game/residency.ts). */
  const updateResidency = (dt: number, t: number) => {
    if ((residencyIn -= dt) > 0) return;
    residencyIn = 0.5;
    const aboard = mode === 'sail' || mode === 'docking';
    const busy =
      battles.active ||
      scriptRunning ||
      dialogue.active ||
      anyTalking() ||
      (!!arrival && arrival.phase !== 'done') ||
      mode === 'transition' ||
      mode === 'docking' ||
      riding() ||
      overlayModal ||
      cam.framing ||
      !!learn?.busy ||
      keepResident ||
      puzzles.some((p) => p.engaged());
    const f = residencyFocus();
    residency.update(
      {
        now: t,
        x: f.x,
        z: f.z,
        on: island,
        target: aboard ? sailTarget().id : null,
        busy,
        state: (id) => streams[id].state,
        held: (id) => streams[id].held || settingUp.has(id) || unloading.has(id),
      },
      residencyOut,
    );
    for (const l of residencyOut.load)
      if (reachable(l.id) && !unloading.has(l.id)) void streams[l.id].load(l.priority);
    for (const id of residencyOut.unload) void unloadIsland(id);
  };

  /** What E does at sea right now, from whichever puzzle has something (taking a helm, the next leg). */
  function sailAction(): SailAction | null {
    for (const p of puzzles) {
      const act = p.sailAction?.() ?? null;
      if (act) return act;
    }
    return null;
  }

  /** Wingman's hint key: the puzzle you're at, else a nudge toward the current quest. */
  function hint(): void {
    const p = puzzles.find((z) => z.engaged());
    if (p) {
      const key = p.hintKey();
      const last = hintPresses.get(p.id);
      const n = last?.key === key ? Math.min(3, last.n + 1) : 1;
      const line = p.hint(n as HintTier);
      // Tier 3 does a step, which changes the key, so the next press starts over at a nudge.
      const after = p.hintKey();
      hintPresses.set(p.id, { key: after, n: after === key ? n : 0 });
      if (line) void dialogue.say('Wingman', line);
      return;
    }
    const open = gameOf(island).quests.hintTask(quests());
    void dialogue.say(
      'Wingman',
      (open?.detail ? `Logbook says: ${open.detail}` : 'Nothing pressing, Captain. Enjoy the view.') +
        wayfindingNudge(),
    );
  }

  /** Wingman's word on getting there: Unstuck when you're wedged, the Chart's Travel here when it's far. */
  function wayfindingNudge(): string {
    if (stuckOffer)
      return ' Wedged? Press E, or pick Unstuck in the pause menu, and I’ll put you back on the path.';
    if (mode !== 'walk' || !compassAim) return '';
    if (mainLeg.length > 120 && island === 'anchorage')
      return ' It’s a fair walk: follow the compass, or open the Chart (M), pick a landmark and Travel here.';
    if (mainLeg.length > 120) return ' It’s a fair walk, so follow the compass. It keeps to the paths.';
    return '';
  }

  // Metres: keep the captain's head clear of the lens and the shoulder at the frame edge.
  const TALK_CAMERA_PULLBACK_M = 2.55;
  const TALK_CAMERA_SIDE_M = 1.4;
  const TALK_CAMERA_SHORT_PULLBACK_M = 2.15;
  const TALK_CAMERA_EYE_LIFT_M = 2.4;
  const TALK_CAMERA_SEATED_EYE_LIFT_M = 2.1;
  const TALK_CAMERA_HEAD_CLEARANCE_M = 1.2;

  const talkShotAt = (
    x: number,
    z: number,
    y: number,
    target: { x: number; y: number; z: number },
  ): CameraShot => ({
    x,
    y: Math.max(y, world.waterAt(x, z, 0) + 0.7, world.groundAt(x, z) + 0.45),
    z,
    tx: target.x,
    ty: target.y,
    tz: target.z,
  });

  function npcTalkShot(n: Npc) {
    if (n.spec.talkShot) return localNpcShot(n, n.spec.talkShot.shotLocal, n.spec.talkShot.targetLocal);
    const dx = player.x - n.x;
    const dz = player.z - n.z;
    const len = Math.hypot(dx, dz) || 1;
    const fx = dx / len;
    const fz = dz / len;
    const rightX = fz;
    const rightZ = -fx;
    const seated = n.spec.clip === 'sit';
    const targetY = n.y + (seated ? 0.98 : 1.52);
    const eyeLift = n.spec.talkEyeLift ?? (seated ? TALK_CAMERA_SEATED_EYE_LIFT_M : TALK_CAMERA_EYE_LIFT_M);
    const target = { x: n.x, y: targetY, z: n.z };
    const candidates: CameraShot[] = [
      talkShotAt(
        player.x + fx * TALK_CAMERA_PULLBACK_M + rightX * TALK_CAMERA_SIDE_M,
        player.z + fz * TALK_CAMERA_PULLBACK_M + rightZ * TALK_CAMERA_SIDE_M,
        Math.max(player.y + eyeLift, targetY + 0.18),
        target,
      ),
      talkShotAt(
        player.x + fx * TALK_CAMERA_PULLBACK_M - rightX * TALK_CAMERA_SIDE_M,
        player.z + fz * TALK_CAMERA_PULLBACK_M - rightZ * TALK_CAMERA_SIDE_M,
        Math.max(player.y + eyeLift, targetY + 0.18),
        target,
      ),
      talkShotAt(
        player.x + fx * TALK_CAMERA_SHORT_PULLBACK_M + rightX * TALK_CAMERA_SIDE_M,
        player.z + fz * TALK_CAMERA_SHORT_PULLBACK_M + rightZ * TALK_CAMERA_SIDE_M,
        Math.max(player.y + eyeLift, targetY + 0.18),
        target,
      ),
      talkShotAt(
        player.x + fx * TALK_CAMERA_SHORT_PULLBACK_M - rightX * TALK_CAMERA_SIDE_M,
        player.z + fz * TALK_CAMERA_SHORT_PULLBACK_M - rightZ * TALK_CAMERA_SIDE_M,
        Math.max(player.y + eyeLift, targetY + 0.18),
        target,
      ),
      talkShotAt(
        n.x + fx * 2.75 + rightX * 1.35,
        n.z + fz * 2.75 + rightZ * 1.35,
        Math.max(n.y + eyeLift, targetY + 0.28),
        target,
      ),
      talkShotAt(
        n.x + fx * 2.75 - rightX * 1.35,
        n.z + fz * 2.75 - rightZ * 1.35,
        Math.max(n.y + eyeLift, targetY + 0.28),
        target,
      ),
    ];
    const first = candidates.find(
      (candidate) => validTalkShot(candidate, target) && !blocksView(candidate, n),
    );
    if (first) return first;
    // Boxed in (a stage, a fountain, a wall behind you): look for a clear two-shot all round them.
    const toPlayer = Math.atan2(fx, fz);
    for (const dist of [3.2, 4.4, 2.4])
      for (const turn of [0.6, -0.6, 1.2, -1.2, 0, 1.9, -1.9, Math.PI]) {
        const a = toPlayer + turn;
        const x = n.x + Math.sin(a) * dist,
          z = n.z + Math.cos(a) * dist;
        const shot = talkShotAt(
          x,
          z,
          Math.max(n.y + eyeLift + 0.3, world.groundAt(x, z) + 1.4, world.waterAt(x, z, 0) + 0.8),
          target,
        );
        if (validTalkShot(shot, target) && !blocksView(shot, n)) return shot;
      }
    return candidates[0]!;
  }

  /**
   * A two-shot of two islanders side by side: square on to the pair from your side, pulled back to fit
   * them both, and never with you standing in the way of either face.
   */
  function pairShot(a: Npc, b: Npc): CameraShot | null {
    const sep = Math.hypot(a.x - b.x, a.z - b.z);
    if (sep > 6 || sep < 0.3) return null;
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 + 1.12, z: (a.z + b.z) / 2 };
    // The pair's normal, on your side of them.
    let nx = -(b.z - a.z) / sep;
    let nz = (b.x - a.x) / sep;
    if (nx * (player.x - mid.x) + nz * (player.z - mid.z) < 0) [nx, nz] = [-nx, -nz];
    const playerLen = Math.hypot(player.x - mid.x, player.z - mid.z) || 1;
    const fx = (player.x - mid.x) / playerLen;
    const fz = (player.z - mid.z) / playerLen;
    const rightX = fz;
    const rightZ = -fx;
    const eyeLift =
      a.spec.clip === 'sit' && b.spec.clip === 'sit' ? TALK_CAMERA_SEATED_EYE_LIFT_M : TALK_CAMERA_EYE_LIFT_M;
    const eyeY = Math.max(player.y + eyeLift, mid.y + eyeLift - 1.12);
    for (const [back, side] of [
      [TALK_CAMERA_PULLBACK_M, TALK_CAMERA_SIDE_M],
      [TALK_CAMERA_PULLBACK_M, -TALK_CAMERA_SIDE_M],
      [TALK_CAMERA_SHORT_PULLBACK_M, TALK_CAMERA_SIDE_M],
      [TALK_CAMERA_SHORT_PULLBACK_M, -TALK_CAMERA_SIDE_M],
    ]) {
      const shot = talkShotAt(
        player.x + fx * back + rightX * side,
        player.z + fz * back + rightZ * side,
        eyeY,
        mid,
      );
      if (!validTalkShot(shot, mid) || blocksView(shot, a) || blocksView(shot, b)) continue;
      return shot;
    }
    const base = Math.atan2(nx, nz);
    const back = 2.3 + sep * 0.6;
    for (const turn of [0, 0.3, -0.3, 0.55, -0.55]) {
      const ang = base + turn;
      const x = mid.x + Math.sin(ang) * back;
      const z = mid.z + Math.cos(ang) * back;
      const shot = talkShotAt(
        x,
        z,
        Math.max(eyeY, world.groundAt(x, z) + 1.3, world.waterAt(x, z, 0) + 0.8),
        mid,
      );
      if (!validTalkShot(shot, mid)) continue;
      if (blocksView(shot, a) || blocksView(shot, b)) continue;
      return shot;
    }
    return null;
  }

  /** Whether you stand between the camera and an islander's face. */
  function blocksView(shot: CameraShot, n: Npc): boolean {
    const fx = n.x - shot.x;
    const fz = n.z - shot.z;
    const len2 = fx * fx + fz * fz;
    const t = ((player.x - shot.x) * fx + (player.z - shot.z) * fz) / Math.max(1e-6, len2);
    if (t <= 0 || t >= 1) return false;
    const px = shot.x + fx * t - player.x;
    const pz = shot.z + fz * t - player.z;
    return px * px + pz * pz < 0.55 * 0.55;
  }

  function validTalkShot(shot: CameraShot, target: { x: number; y: number; z: number }): boolean {
    if (
      Math.hypot(shot.x - player.x, shot.y - (player.y + 1.5), shot.z - player.z) <
      TALK_CAMERA_HEAD_CLEARANCE_M
    )
      return false;
    // The camera itself: not inside a wall, a tower, or the hillside.
    if (world.sightBlockedAt(shot.x, shot.y, shot.z, 0.3) || shot.y < world.groundAt(shot.x, shot.z) + 0.4)
      return false;
    for (let i = 1; i < 8; i += 1) {
      const t = i / 8;
      const x = shot.x + (target.x - shot.x) * t;
      const y = shot.y + (target.y - shot.y) * t;
      const z = shot.z + (target.z - shot.z) * t;
      if (world.sightBlockedAt(x, y, z, 0.08)) return false;
    }
    return true;
  }

  function localNpcShot(
    n: Npc,
    shotLocal: readonly [number, number, number],
    targetLocal: readonly [number, number, number],
  ): CameraShot {
    const shot = localNpcPoint(n, [shotLocal[0], shotLocal[2]]);
    const target = localNpcPoint(n, [targetLocal[0], targetLocal[2]]);
    return {
      x: shot.x,
      y: n.y + shotLocal[1],
      z: shot.z,
      tx: target.x,
      ty: n.y + targetLocal[1],
      tz: target.z,
    };
  }

  function localNpcPoint(n: Npc, local: readonly [x: number, z: number]): { x: number; z: number } {
    const rightX = Math.cos(n.heading);
    const rightZ = -Math.sin(n.heading);
    const forwardX = Math.sin(n.heading);
    const forwardZ = Math.cos(n.heading);
    return {
      x: n.x + rightX * local[0] + forwardX * local[1],
      z: n.z + rightZ * local[0] + forwardZ * local[1],
    };
  }

  /** The compass's island streams in at low priority while you sail (nothing waits on it yet). */
  const prefetchSailTarget = () => {
    const to = sailTarget().id;
    if (to !== island) void streams[to].load('low');
  };

  async function board(): Promise<void> {
    if (mode !== 'walk') return;
    prefetchSailTarget();
    // The compass's island is the likely next theme: it buffers while you sail.
    audio?.music.prefetch(sailTarget().music);
    mode = 'transition';
    input.enabled = false;
    hud.setPrompt(null);
    // A battle waiting on this passage builds behind the fade and warms while you sail out.
    void battles.prepare(island);
    await hud.fade(true);
    wingman?.landNow();
    const a = ship.anchors.helm;
    ship.group.add(hero.group);
    hero.group.position.set(a.x, a.y, a.z);
    hero.group.rotation.set(0, a.heading, 0);
    hero.setSpeed(0);
    hero.play('helm');
    hero.setGrip(a.grip);
    dyn.clearDockAssist();
    helm.reset();
    cam.setRig(SAIL_RIG, true);
    cam.snapBehind(dyn.pose.heading);
    hud.setSailing(true);
    hud.setHelp(SAIL_HELP);
    mode = 'sail';
    input.enabled = true;
    await hud.fade(false);
    ironsFor = 0;
    ironsNudged = false;
    hud.toast('Raise the sails with W. Steer with A and D.', 4);
    const morning = nextMorningFrom(island);
    passageHold = morning ? { hold: island, skip: morning } : null;
    eveningAt = 0;
    storyEvent('anchorage', 'setSail', quests(), setQuest);
    contents.get(island)?.onBoard?.();
    audio?.music.setIsland('harbour');
  }

  /** The island whose waters the ship was last in (its theme's been prefetched). */
  let musicWaters: IslandId | null = null;
  /** The open island whose berth is within docking range of the ship, if any. */
  function berthInRange(): IslandBerth | null {
    let best: IslandBerth | null = null;
    let bestD = DOCK_RANGE;
    for (const b of openIslands()) {
      const d = Math.hypot(dyn.pose.x - b.mooring.x, dyn.pose.z - b.mooring.z);
      if (d <= bestD) {
        best = b;
        bestD = d;
      }
    }
    return best;
  }
  /**
   * Where the compass sends you while sailing: the farthest open island along the voyage that you're
   * on or whose island before is done (its `sailHere`: Meridian once Anchorage's quests are done,
   * Thousand-Bough once Meridian's Seal is won), else home.
   */
  function sailTarget(): IslandBerth {
    for (let i = STREAMED_ISLANDS.length - 1; i >= 0; i--) {
      const e = STREAMED_ISLANDS[i]!;
      if (!reachable(e.id)) continue;
      if (island === e.id || gameOf(e.id).quests.sailHere?.(quests())) return ISLANDS[e.id];
    }
    return ISLANDS[HOME_ISLAND];
  }
  const nearHarbour = () =>
    openIslands().some((b) => Math.hypot(dyn.pose.x - b.mooring.x, dyn.pose.z - b.mooring.z) < HARBOUR_REACH);

  function dock(): void {
    if (mode !== 'sail' || crewAtHelm) return;
    const to = berthInRange();
    if (!to) {
      hud.toast(`Sail to ${sailTarget().berthLabel} to go ashore.`, 3);
      return;
    }
    if (battles.blocksDock(to.id)) {
      hud.toast('Raiders are still out there! Finish the fight, or skip the battle from the pause menu.', 4);
      return;
    }
    mode = 'docking';
    dockTime = 0;
    helm.reset();
    dockTo = to;
    dyn.dockAssist(to.mooring);
    hud.toast('Bringing her alongside…', 3);
  }
  let dockTo: IslandBerth = berth;

  /**
   * Moors the ship bow-out at the berth (only while the screen is black) and puts the hero on the
   * quay beside the gangway. A first landfall there plays the island's arrival flyover.
   */
  async function disembark(to: IslandBerth = dockTo): Promise<void> {
    mode = 'transition';
    passageHold = null;
    endNightPassing();
    input.enabled = false;
    await hud.fade(true);
    battles.leftShip(cam);
    if (to.id !== island) setIsland(to.id);
    moorShip();
    engine.scene.add(hero.group);
    hero.group.rotation.set(0, 0, 0);
    hero.setGrip(null);
    hero.play('idle');
    stepAshore();
    cam.setRig(WALK_RIG, true);
    hud.setSailing(false);
    hud.setHelp(WALK_HELP);
    mode = 'walk';
    pendingRecap = islandChapterOf(to.id) || '';
    const landfall = firstLandfall();
    input.enabled = !landfall;
    if (landfall) startArrival(berth.arrival, false);
    audio?.music.setIsland(berth.music);
    crewAtHelm = false;
    for (const c of contentList) c.onLand?.();
    await hud.fade(false);
    const done = afterDisembark;
    afterDisembark = null;
    done?.();
  }
  const moorShip = () => {
    const m = berth.mooring;
    dyn.reset(m.x, m.z, m.heading);
    dyn.dockAssist(m);
  };
  /** On the quay beside the gangway (level with the boarding point), facing the town. */
  const stepAshore = () => {
    const b = ship.anchors.boarding;
    const at = atBerth(berth.mooring, footLocal.x + 0.7, b.z);
    placePlayer(at.x, at.z, berth.landingHeading);
    cam.snapBehind(berth.landingHeading);
  };
  /** The first time ashore on this island. */
  const firstLandfall = () => !!learn && !learn.progress.has('arrivals', berth.id);

  /**
   * The compass, top centre: where the camera looks, a gold marker on the current task ashore (the
   * nearest usable part of it; your ship once the island's done) and a paler one on an optional
   * quest you've started, or on the berth or a puzzle's mark while you're sailing. Each marker aims at
   * the next waypoint of the route there (src/game/wayfinding/), and its distance is the route's.
   * Hidden in conversations.
   */
  const compassDir = new Vector3();
  const mainRoute = new CompassRoute();
  const optionalRoute = new CompassRoute();
  const mainLeg: CompassLeg = { x: 0, z: 0, length: 0, level: null };
  const optionalLeg: CompassLeg = { x: 0, z: 0, length: 0, level: null };
  const mainMarker: CompassTarget = { bearing: 0, label: '', distance: 0, level: null };
  const optionalMarker: CompassTarget = { bearing: 0, label: '', distance: 0, level: null };
  /** What the gold marker's on ashore (for Unstuck's facing and Wingman's nudge), or null. */
  let compassAim: Interactable | null = null;
  function updateCompass(): void {
    const ashore = mode === 'walk';
    const afloat = mode === 'sail' || mode === 'docking';
    compassAim = null;
    // In a sea battle the battle's own HUD has the top of the screen.
    if (
      (!ashore && !afloat) ||
      (dialogue.active && !welcoming) ||
      scriptRunning ||
      anyTalking() ||
      battles.active ||
      overlayModal
    ) {
      hud.setCompass(null);
      return;
    }
    camera.getWorldDirection(compassDir);
    let target: CompassTarget | null = null;
    let optional: CompassTarget | null = null;
    if (ashore) {
      if (goalsStale) {
        goals = compassGoals(gameOf(island).quests, quests());
        goalsStale = false;
      }
      const goal = goals.main;
      const it = goal ? interactions.nearest(goal.ids, player.x, player.z) : null;
      if (goal && it) {
        compassAim = it;
        mainRoute.ashore(wayfinder, island, it.id, player.x, player.y, player.z, it.x, it.y, it.z, mainLeg);
        mainMarker.bearing = bearingOf(mainLeg.x - player.x, mainLeg.z - player.z);
        mainMarker.label = goal.labels?.[it.id] ?? goal.label;
        mainMarker.distance = mainLeg.length;
        mainMarker.level = mainLeg.level;
        target = mainMarker;
      }
      // The nearest optional quest you've started (not the same spot as the gold marker).
      let best: Interactable | null = null;
      let bestLabel = '';
      for (let i = 0; i < goals.optional.length; i++) {
        const g = goals.optional[i]!;
        const o = interactions.nearest(g.ids, player.x, player.z);
        if (!o || o === it) continue;
        if (
          !best ||
          Math.hypot(o.x - player.x, o.z - player.z) < Math.hypot(best.x - player.x, best.z - player.z)
        ) {
          best = o;
          bestLabel = g.labels?.[o.id] ?? g.label;
        }
      }
      if (best) {
        optionalRoute.ashore(
          wayfinder,
          island,
          best.id,
          player.x,
          player.y,
          player.z,
          best.x,
          best.y,
          best.z,
          optionalLeg,
        );
        optionalMarker.bearing = bearingOf(optionalLeg.x - player.x, optionalLeg.z - player.z);
        optionalMarker.label = bestLabel;
        optionalMarker.distance = optionalLeg.length;
        optionalMarker.level = optionalLeg.level;
        optional = optionalMarker;
      }
    } else {
      // A puzzle out on the water first (the Three Helms' next buoy or mark), else the berth you're
      // bound for once out past docking range (inside it, the dock prompt takes over). The route
      // keeps to the sea lanes: round headlands and in through a harbour's mouth.
      let mark: { x: number; z: number; label: string } | null = null;
      for (let i = 0; i < puzzles.length && !mark; i++) mark = puzzles[i]!.sailTarget?.() ?? null;
      const goal = sailTarget();
      const tx = mark ? mark.x : goal.mooring.x;
      const tz = mark ? mark.z : goal.mooring.z;
      const straight = Math.hypot(tx - dyn.pose.x, tz - dyn.pose.z);
      if (mark || (!crewAtHelm && straight > DOCK_RANGE)) {
        mainRoute.afloat(wayfinder, mark ? mark.label : goal.id, dyn.pose.x, dyn.pose.z, tx, tz, mainLeg);
        mainMarker.bearing = bearingOf(mainLeg.x - dyn.pose.x, mainLeg.z - dyn.pose.z);
        mainMarker.label = mark ? mark.label : goal.berthLabel;
        mainMarker.distance = mainLeg.length;
        mainMarker.level = null;
        target = mainMarker;
      }
    }
    hud.setCompass(bearingOf(compassDir.x, compassDir.z), target, optional);
  }

  /**
   * Unstuck (PLAN §9's "never trapped"): pushing against something for a few seconds without getting
   * anywhere, on foot or at the helm, offers a hop back onto the island's routes (E, or the pause
   * menu's Unstuck at any time).
   */
  const STUCK_AFTER = 4;
  const STUCK_RADIUS = 1.2;
  const SHIP_STUCK_AFTER = 12;
  let pushFor = 0;
  const pushFrom = { x: 0, z: 0 };
  let stuckOffer = false;
  const stuckSpot = { x: 0, y: 0, z: 0 };
  const unstuckRoute: WalkRoute = { x: 0, y: 0, z: 0, length: 0, node: -1 };
  const offerUnstuck = (afloat: boolean) => {
    stuckOffer = true;
    hud.toast(
      afloat
        ? 'Stuck fast? Press E and the crew will warp her off into open water.'
        : 'Stuck? Press E to hop back onto the path. Unstuck’s in the pause menu too.',
      6,
    );
  };
  interactions.add({
    id: 'unstuck',
    label: () => 'Unstuck: back onto the path',
    get x() {
      return player.x;
    },
    get y() {
      return player.y;
    },
    get z() {
      return player.z;
    },
    radius: 1,
    // It takes the E from whatever you're pressed up against.
    bias: -50,
    enabled: () => stuckOffer && mode === 'walk' && !dialogue.active && !scriptRunning,
    onInteract: () => void unstuck(),
  });
  /** Watches for a walker or a ship that's trying to move and can't (called each frame). */
  function watchStuck(dt: number, s: InputState): void {
    if (mode === 'walk') {
      const pushing = Math.hypot(s.moveX, s.moveY) > 0.5 && !dialogue.active && !scriptRunning && !riding();
      const moved = Math.hypot(player.x - pushFrom.x, player.z - pushFrom.z);
      if (!pushing || moved > STUCK_RADIUS) {
        pushFrom.x = player.x;
        pushFrom.z = player.z;
        pushFor = 0;
        if (stuckOffer && Math.hypot(player.x - stuckSpot.x, player.z - stuckSpot.z) > 4) stuckOffer = false;
      } else if ((pushFor += dt) > STUCK_AFTER && !stuckOffer) {
        stuckSpot.x = player.x;
        stuckSpot.z = player.z;
        offerUnstuck(false);
      }
    } else if (mode === 'sail' && !crewAtHelm && !battles.active) {
      const trying = helm.trim > 0.3 || Math.abs(s.moveX) > 0.5 || Math.abs(s.moveY) > 0.5;
      const speed = Math.abs(dyn.forwardSpeed);
      if (speed > 1.5 || !trying || berthInRange()) {
        pushFor = 0;
        if (speed > 1.5) stuckOffer = false;
      } else if (speed < 0.6 && (pushFor += dt) > SHIP_STUCK_AFTER && !stuckOffer) offerUnstuck(true);
    } else {
      pushFor = 0;
      stuckOffer = false;
    }
  }
  async function unstuck(): Promise<boolean> {
    if (mode === 'walk' && !riding() && !scriptRunning) {
      const g = wayfinder.walk(island);
      const i = g ? g.nearest(player.x, player.y, player.z) : -1;
      if (!g || i < 0) return false;
      mode = 'transition';
      input.enabled = false;
      hud.setPrompt(null);
      await hud.fade(true, 260);
      g.point(i, stuckSpot);
      // Face along the route toward whatever the compass is on.
      let heading = player.heading;
      const aim = compassAim;
      if (aim) {
        g.route(stuckSpot.x, stuckSpot.y, stuckSpot.z, aim.x, aim.y, aim.z, unstuckRoute);
        if (Math.hypot(unstuckRoute.x - stuckSpot.x, unstuckRoute.z - stuckSpot.z) > 0.5)
          heading = Math.atan2(unstuckRoute.x - stuckSpot.x, unstuckRoute.z - stuckSpot.z);
      }
      player.teleport(world, stuckSpot.x, stuckSpot.z, heading, stuckSpot.y + 0.5);
      hero.group.position.set(player.x, player.y, player.z);
      hero.group.rotation.y = player.heading;
      cam.snapBehind(heading);
      stuckOffer = false;
      pushFor = 0;
      mainRoute.reset();
      optionalRoute.reset();
      mode = 'walk';
      input.enabled = !paused;
      await hud.fade(false, 260);
      hud.toast('Back on the path. Follow the compass from here.', 3.5);
      return true;
    }
    if (mode === 'sail' && !crewAtHelm && !battles.active) {
      const chart = wayfinder.sea;
      const i = chart.nearest(dyn.pose.x, dyn.pose.z);
      if (i < 0) return false;
      mode = 'transition';
      input.enabled = false;
      hud.setPrompt(null);
      await hud.fade(true, 300);
      const p = chart.point(i);
      const goal = sailTarget();
      const next = chart.path(p.x, p.z, goal.mooring.x, goal.mooring.z)[0]!;
      const heading = Math.atan2(next.x - p.x, next.z - p.z);
      dyn.reset(p.x, p.z, heading);
      cam.snapBehind(heading);
      stuckOffer = false;
      pushFor = 0;
      mainRoute.reset();
      mode = 'sail';
      input.enabled = !paused;
      await hud.fade(false, 300);
      hud.toast('The crew warped her off into open water. Follow the compass from here.', 4);
      return true;
    }
    return false;
  }

  // Footsteps and ship sounds.
  let stride = 0;
  let slapIn = 2;
  const windHere = new Float32Array(2);
  /** Seconds stalled head to wind with the sails up; one nudge per boarding. */
  let ironsFor = 0;
  let ironsNudged = false;
  const footstep = (kind: SurfaceKind): FootstepSurface => {
    if (kind === 'stone') return 'rock';
    if (kind === 'sand') return player.waterY - player.y > -0.18 ? 'wetsand' : 'sand';
    return kind;
  };
  let stepSide = 1;
  const puffFootstep = (intensity = 1) => {
    stepSide *= -1;
    const side = stepSide * 0.17;
    const forward = player.speed > 2.8 ? 0.18 : 0.08;
    const s = Math.sin(player.heading);
    const c = Math.cos(player.heading);
    const surface = player.mode === 'wade' ? 'water' : player.surface;
    footstepPuffs.spawn(
      player.x + c * side + s * forward,
      surface === 'water' ? Math.max(player.y, player.waterY) : player.y,
      player.z - s * side + c * forward,
      surface,
      player.heading,
      intensity,
    );
  };

  /** Seconds the HUD stays calm after the last busy frame. */
  const CALM_HOLD = 0.6;
  let calmFor = 0;
  let calmShown = false;
  let anim: 'move' | 'wade' = 'move';
  let cooldown = 0;
  let paused = false;
  let resumedAt = 0;
  let hintTimer = o.quiet ? -1 : 2.2;
  /** Ends Wingman's framed welcome early when the player moves (null when it isn't running). */
  let introCut: (() => void) | null = null;
  // A fresh voyage (Nell not met yet) gets Wingman's welcome and the first step; later sessions a
  // short welcome back.
  // Every island's first welcome points out the task list, the compass and its starfish.
  // The lines are the course's (`course.json` → `hooks.islands`): an island's landing lines (Juno's
  // first look at Thousand-Bough), then Wingman's welcome with the island's tips.
  const firstWelcome = (i: string) => [...(islandHooks(i).landing ?? []), ...courseWelcome(i)];
  const welcomeLines = (): string[] =>
    storyHolds(island, 'firstVisit', quests())
      ? firstWelcome(island)
      : island === HOME_ISLAND
        ? [...(islandHooks(island).welcomeBack ?? [])]
        : [];
  /** Wingman's welcome is on: the task list and compass stay up so he can point them out. */
  let welcoming = false;
  const spotlightTip = (id: string | null) => {
    const spots = (id && TIP_SPOTS[id]) || [];
    hud.setCompassSpot(spots.includes('compass'));
    learn?.setSpotlight(spots.includes('tracker'), spots.includes('starfish'));
  };
  /**
   * Wingman flies up in front of the captain to talk, and heads back to the shoulder on his last
   * line. The first time, the captain holds still and the camera frames him over their shoulder;
   * moving (after a moment to see who's talking) sends him back early while he keeps talking.
   */
  async function welcome(): Promise<void> {
    const lines = welcomeLines();
    if (!lines.length || welcomeRunning) return;
    welcomeRunning = true;
    try {
      await playWelcome(lines);
    } finally {
      welcomeRunning = false;
    }
  }
  /** The whole welcome is on (Juno's look at the tree, the pause while Wingman takes off, his lines). */
  let welcomeRunning = false;
  // The learning systems' pauses, at a natural break once you're ashore and nothing else is on: the
  // "where you left off" card on Continue, then Wingman's spaced recap (src/learn/recap.ts), which
  // also follows a landfall (from the other islands' chapters).
  let pendingResume = !!o.resume;
  /** A recap to offer: `null` none, `''` from every chapter, or a chapter to leave out (where you landed). */
  let pendingRecap: string | null = o.resume ? '' : null;
  let learningIdle = 0;
  let learningRunning = false;
  async function runLearningPause(): Promise<void> {
    if (!learn || learningRunning) return;
    learningRunning = true;
    try {
      if (pendingResume) {
        pendingResume = false;
        const summary = learn.resumeSummary();
        if (summary) await learn.showResume(summary);
        // The card's "Open the checklist" opens the Logbook: the recap waits until it's closed.
        await learn.logbookClosed();
      }
      if (pendingRecap !== null && !disposed) {
        const except = pendingRecap || null;
        pendingRecap = null;
        const ids = learn.recapDue(except);
        if (ids.length) await learn.runRecap(ids);
      }
    } finally {
      learningRunning = false;
      learningIdle = 0;
    }
  }
  const islandChapterOf = (id: string) => COURSE.islands.find((i) => i.island === id)?.chapter ?? '';
  async function playWelcome(lines: string[]): Promise<void> {
    // An island's landing lines (Juno's first look at Thousand-Bough's great tree) play over its
    // landmark, framed from over the captain's shoulder (the arrival's last hold), before Wingman flies up.
    const landing = islandHooks(island).landing ?? [];
    if (landing.length && lines[0] === landing[0] && mode === 'walk') {
      input.enabled = false;
      hero.setSpeed(0);
      cam.frame(berth.arrival.landingShot ?? null);
      await dialogue.play([lines[0]]);
      cam.frame(null);
      input.enabled = !paused;
      if (disposed) return;
      lines = lines.slice(1);
    }
    const framed = !!wingman && mode === 'walk' && lines.length > 1;
    if (wingman) {
      hero.group.getWorldPosition(flightView.captain);
      camera.getWorldPosition(flightView.eye);
      flightView.ahead = framed ? { x: Math.sin(player.heading), z: Math.cos(player.heading) } : null;
      wingman.takeOff(flightView as FlightView);
    }
    let held = framed;
    const release = () => {
      if (!held) return;
      held = false;
      introCut = null;
      cam.frame(null);
      input.enabled = !paused;
    };
    if (framed && wingman) {
      input.enabled = false;
      hero.setSpeed(0);
      cam.frame(wingmanShot(wingman.hoverAt(flightView as FlightView)));
      const from = performance.now();
      introCut = () => {
        if (performance.now() - from < INTRO_HOLD_MS) return;
        wingman?.land();
        release();
      };
    }
    welcoming = true;
    await new Promise((r) => setTimeout(r, wingman ? 350 : 0));
    if (disposed) return;
    const last = lines.length > 1 ? lines[lines.length - 1] : null;
    await dialogue.play(lines, (id) => {
      spotlightTip(id);
      if (id !== last) return;
      wingman?.land();
      release();
    });
    welcoming = false;
    spotlightTip(null);
    wingman?.land();
    release();
    flightView.ahead = null;
  }
  /** Over the captain's shoulder (the one away from the parrot), on Wingman hovering ahead. */
  function wingmanShot(hover: Vector3): CameraShot {
    const ax = Math.sin(player.heading);
    const az = Math.cos(player.heading);
    // Screen-right of the view ahead is (-az, ax); the camera sits across from the parrot.
    const side = Math.sign((hover.x - player.x) * -az + (hover.z - player.z) * ax) || 1;
    const headY = player.y + hero.capsule.height;
    // A three-quarter view from behind: the captain on one side of the frame, Wingman on the other.
    const chestY = headY - 0.35;
    return {
      x: player.x - ax * 4.3 + az * side * 1.2,
      y: headY + 0.5,
      z: player.z - az * 4.3 - ax * side * 1.2,
      tx: player.x + (hover.x - player.x) * 0.5,
      ty: chestY + (hover.y - chestY) * 0.45,
      tz: player.z + (hover.z - player.z) * 0.5,
    };
  }
  // First landfall on an island: a flyover in from the sea, over the ship and the island, down to
  // behind the captain, with the island's title card; then Wingman's welcome. Once per island.
  const flyShot: CameraShot = { x: 0, y: 0, z: 0, tx: 0, ty: 0, tz: 0 };
  const restShot: CameraShot = { x: 0, y: 0, z: 0, tx: 0, ty: 0, tz: 0 };
  /** Tests: holds the flyover at a moment (seconds in) for screenshots. */
  let arrivalHold: number | null = null;
  let arrival: {
    plan: IslandArrival;
    path: FlyoverPath | null;
    phase: ArrivalPhase;
    time: number;
    card: boolean;
  } | null = null;
  function startArrival(plan: IslandArrival, waitForBegin: boolean): void {
    // Wingman's welcome follows the flight: its lines load meanwhile.
    dialogue.preload(welcomeLines());
    const reduced = worldUniforms.reducedMotion.value > 0.5;
    let path: FlyoverPath | null = null;
    if (!reduced) {
      cam.restPose(player, player.heading, restShot);
      path = new FlyoverPath(
        arrivalKeys(plan, { x: player.x, y: player.y, z: player.z, heading: player.heading }, restShot),
        plan.seconds,
      );
      path.sample(0, flyShot);
      cam.cut(flyShot);
    }
    arrival = {
      plan,
      path,
      phase: waitForBegin ? 'waiting' : path ? 'flying' : 'card',
      time: 0,
      card: false,
    };
    hintTimer = -1;
    dialogue.cancel();
    wingman?.landNow();
    input.enabled = false;
    hero.setSpeed(0);
    hud.setCinematic(true);
    learn?.setCinematic(true);
  }
  /** Ends the arrival: marks the island seen and hands over to Wingman (unless travel cut it short). */
  async function endArrival(how: 'landed' | 'skipped' | 'cut'): Promise<void> {
    const a = arrival;
    if (!a || a.phase === 'done') return;
    a.phase = 'done';
    learn?.progress.add('arrivals', a.plan.id);
    if (how === 'skipped' && a.path) {
      await hud.fade(true, 240);
      if (disposed) return;
      cam.release();
    }
    hud.setCinematic(false);
    learn?.setCinematic(false);
    input.enabled = !paused;
    if (how === 'cut') {
      cam.release();
      hintTimer = 0.8;
      return;
    }
    if (how === 'skipped' && a.path) void hud.fade(false, 460);
    cam.frame(null);
    if (welcomeLines().length) void welcome();
  }
  function updateArrival(
    dt: number,
    t: number,
    s: { interact: boolean; stirring: boolean; jump: boolean; map: boolean },
  ): void {
    const a = arrival;
    if (!a || a.phase === 'done' || a.phase === 'waiting') return;
    a.time = arrivalHold ?? a.time + dt;
    const plan = a.plan;
    const cardAt = a.path ? plan.cardAt : 0.5;
    const cardEnd = a.path ? plan.cardAt + plan.cardFor : cardOnlySeconds(plan) - 0.4;
    const showCard = a.time >= cardAt && a.time < cardEnd;
    if (showCard !== a.card) {
      a.card = showCard;
      hud.showCard(showCard ? plan.card : null, plan.label ? CHART_LABELS[plan.label] : null);
    }
    if (a.time > ARRIVAL_SKIP_AFTER && (s.interact || s.stirring || s.jump || s.map)) {
      void endArrival('skipped');
      return;
    }
    if (!a.path) {
      if (a.time >= cardOnlySeconds(plan)) void endArrival('landed');
      return;
    }
    const landed = a.path.sample(a.time, flyShot);
    // Never through the ground or the sea, whatever the keys say.
    const floor = Math.max(
      world.groundAt(flyShot.x, flyShot.z) + 2.2,
      world.waterAt(flyShot.x, flyShot.z, t) + 1.8,
    );
    if (!landed && flyShot.y < floor) flyShot.y = floor;
    cam.frame(flyShot);
    if (landed) void endArrival('landed');
  }
  // A fresh voyage flies in; a Continue (quiet) is already ashore, so this island counts as seen.
  if (o.quiet) learn?.progress.add('arrivals', berth.id);
  else if (firstLandfall()) startArrival(arrivalFlight(berth.arrival, !!o.fromChart), true);

  // The lighthouse stair (Dan: the spiral climb and its camera were too hard): walk in through the
  // ground door, or in from the watch-room door to the stairwell (or press E at either), and a short
  // fade fast-forwards you to the other end, standing in the doorway facing out with the follow
  // camera behind you. On the gallery the camera keeps out
  // of the tower, so it stays behind you and W walks you on round.
  let lighthouseTransit: LighthouseDirection | null = null;
  const lighthouseHold: CameraShot = { x: 0, y: 0, z: 0, tx: 0, ty: 0, tz: 0 };
  async function runLighthouse(dir: LighthouseDirection): Promise<void> {
    if (lighthouseTransit || mode !== 'walk') return;
    lighthouseTransit = dir;
    const fade = lighthouseFade(worldUniforms.reducedMotion.value > 0.5);
    input.enabled = false;
    hud.setPrompt(null);
    hero.setSpeed(0);
    // The camera holds where it is while the screen darkens, so it doesn't close in on your head as
    // you step on into the doorway (the fast-forward puts it behind you at the other end).
    lighthouseHold.x = camera.position.x;
    lighthouseHold.y = camera.position.y;
    lighthouseHold.z = camera.position.z;
    lighthouseHold.tx = player.x;
    lighthouseHold.ty = player.y + cam.rig.pivotY;
    lighthouseHold.tz = player.z;
    cam.cut(lighthouseHold);
    await hud.fade(true, fade.out);
    if (disposed) return;
    const a = lighthouseArrival(dir);
    player.teleport(world, a.x, a.z, a.heading, a.y);
    hero.group.position.set(player.x, player.y, player.z);
    hero.group.rotation.y = player.heading;
    cam.release();
    cam.keepOutside(dir === 'up' ? GALLERY_CAMERA_COLUMN : null);
    cam.snapBehind(a.cameraYaw);
    if (a.cameraPitch !== null) cam.pitch = a.cameraPitch;
    // A quick patter of steps while it's dark: the run up (or down) the stair.
    for (let i = 0; i < fade.steps; i++)
      window.setTimeout(
        () => audio?.sfx.footstep(footstep('stone'), player),
        (i * fade.hold) / Math.max(1, fade.steps),
      );
    await new Promise((resolve) => window.setTimeout(resolve, fade.hold));
    if (disposed) return;
    lighthouseTransit = null;
    input.enabled = !paused;
    await hud.fade(false, fade.in);
  }
  const updateLighthouse = (): void => {
    cam.keepOutside(onLighthouseGallery(player.x, player.y, player.z) ? GALLERY_CAMERA_COLUMN : null);
    if (lighthouseTransit || scriptRunning || cam.framing) return;
    const dir = lighthouseTransitAt(player.x, player.y, player.z, player.mode !== 'air');
    if (dir) void runLighthouse(dir);
  };
  interactions.add({
    id: 'lighthouse:up',
    label: () => 'Climb to the top',
    ...LIGHTHOUSE_GROUND_DOOR,
    enabled: () => mode === 'walk' && !lighthouseTransit && island === 'anchorage',
    onInteract: () => void runLighthouse('up'),
  });
  interactions.add({
    id: 'lighthouse:down',
    label: () => 'Go back down',
    ...LIGHTHOUSE_STAIR_HEAD,
    enabled: () => mode === 'walk' && !lighthouseTransit && island === 'anchorage',
    onInteract: () => void runLighthouse('down'),
  });

  // Starfish to collect (Dan: "like Mario's stars"): walk into one to pick it up. Each pays five
  // doubloons, and an island's last pays twenty more; the purse counts the island you're on.
  const starfish = cove.starfish;
  const starfishAt = new Vector3();
  const starfishCamera: ({ x: number; z: number; r: number; y0: number; y1: number } | undefined)[] = [];
  let starfishTold = '';
  let starfishWalk = 0;
  starfish.setFound(learn?.progress.data.starfish ?? []);
  const updateStarfish = (dt: number): void => {
    // The island under your feet (a chart jump or a teleport can land you on either).
    const here = islandAt(player.x, player.z);
    const name = ISLANDS[here].name;
    learn?.setStarfishIsland(mode === 'walk' ? { id: here, name } : null);
    if (mode !== 'walk' || !learn) return;
    const ready = here === HOME_ISLAND || !!cove.islands[here]?.world;
    for (let i = 0; i < starfish.spots.length; i += 1) {
      const sp = starfish.spots[i]!;
      if (sp.island !== here) continue;
      if (!starfish.grounded(i)) {
        if (!ready) continue;
        starfish.setGround(i, world.groundAt(sp.x, sp.z, sp.y));
        // Keeps the follow camera out of the floating star (a pickup in a tight spot, like the
        // boathouse's, drew the camera through it); found stars drop theirs below.
        if (!learn.progress.data.starfish.includes(sp.id)) {
          starfish.centre(i, starfishAt);
          const c = {
            x: starfishAt.x,
            z: starfishAt.z,
            r: 0.5,
            y0: starfishAt.y - 0.5,
            y1: starfishAt.y + 0.5,
          };
          starfishCamera[i] = c;
          world.addCameraCircle(c);
        }
        continue;
      }
      starfish.centre(i, starfishAt);
      if (Math.hypot(player.x - starfishAt.x, player.z - starfishAt.z) > 1.1) continue;
      if (Math.abs(player.y + 0.6 - starfishAt.y) > 1.3) continue;
      const got = learn.collectStarfish(sp.id, sp.island);
      if (!got) continue;
      starfish.setFound(learn.progress.data.starfish);
      const blocker = starfishCamera[i];
      if (blocker) blocker.y0 = blocker.y1 = Number.NEGATIVE_INFINITY;
      audio?.sfx.oneShot('chime_solve', starfishAt, 0.7);
      hud.toast(
        got.complete
          ? `You found all ${got.total} starfish on ${name}! +${got.earned} doubloons`
          : `Starfish! ${got.found} of ${got.total} on ${name}. +${got.earned} doubloons`,
        4,
      );
    }
    // Tells you once a visit, after a little walking, how many hide here (until you've found one).
    if (starfishTold === here || dialogue.active || scriptRunning || cam.framing) return;
    if ((starfishWalk += dt) < 20) return;
    starfishTold = here;
    starfishWalk = 0;
    const { found, total } = starfishCount(here, learn.progress.data.starfish);
    if (found === 0)
      hud.toast(`${total} starfish hide on ${name}. Can you find them all? Your count's by the purse.`, 6);
  };

  // Reused each frame by the walk step (hot loops don't allocate).
  const stepInput = {} as InputState;
  const grounding: CharacterGrounding = {
    mode: player.mode,
    verticalSpeed: 0,
    landed: false,
    groundAt: (x, z) => world.groundAt(x, z),
  };
  const listenerPos = { x: 0, y: 0, z: 0 };
  const listenerFwd = { x: 0, y: 0, z: -1 };

  /** A content test hook by name, from whichever island has it (Meridian's lift and lighthouse). */
  const contentHook = (name: string): ((...args: never[]) => unknown) | null => {
    for (const c of contentList) if (c.debug[name]) return c.debug[name]!;
    return null;
  };

  const remove = engine.add(
    {
      frame(dt, t) {
        const s = input.poll();
        // A course picture on screen: the talk shot moves its speaker clear of it.
        const spy = learn?.getState().spyglass;
        if (spy && !spy.full) {
          const pan = spyglassSpeakerPan(innerWidth, innerHeight);
          cam.setScreenPan(pan.x, pan.y);
        } else cam.setScreenPan(0, 0);
        if (paused) {
          hud.setPrompt(null);
          hero.update(dt);
          updateWingman(dt);
          if (cove.anchorage.shown) npcs.update(dt, mode === 'walk' ? player : { x: 1e6, y: 0, z: 1e6 });
          for (const c of contentList) c.updateNpcs(dt, mode === 'walk' ? player : FAR, camera.position);
          audio?.update(dt);
          return;
        }
        // A quiz, page, or Logbook owns input: freeze the walker (the world keeps living).
        if (learn?.busy) {
          hud.setPrompt(null);
          hud.setCompass(null);
          if (mode === 'walk')
            player.step(dt, { ...s, moveX: 0, moveY: 0, jump: false, run: false }, cam.yaw, world, t);
          hero.setSpeed(0);
          hero.update(dt);
          updateWingman(dt);
          if (cove.anchorage.shown) npcs.update(dt, mode === 'walk' ? player : { x: 1e6, y: 0, z: 1e6 });
          for (const c of contentList) c.updateNpcs(dt, mode === 'walk' ? player : FAR, camera.position);
          for (const c of chests) c.chest.update(dt, t);
          audio?.update(dt);
          resumedAt = performance.now();
          return;
        }
        // An arrival flyover owns the keys (any of them skips it) until it lands.
        const arriving = !!arrival && arrival.phase !== 'done';
        if (arriving) updateArrival(dt, t, s);
        // Menu keys: ignore the edge from the same key press that closed the menu.
        if (performance.now() - resumedAt > 200) {
          // The Gate Board and the Flag Hoist keep Esc and the pad for themselves.
          if (s.menu && o.onMenu && !overlayModal) return o.onMenu();
          if (s.map && o.onChart && !arriving) return o.onChart();
        }
        // A short cooldown after a conversation ends so mashing E to skip doesn't restart it.
        if (dialogue.active) cooldown = 0.45;
        else cooldown = Math.max(0, cooldown - dt);
        // The E that closed a quiz or page mustn't also skip the next line or re-open a chat.
        if (s.interact && !arriving && performance.now() - resumedAt > 250) {
          if (dialogue.active) dialogue.next();
          else if (cooldown <= 0 && mode === 'sail' && !battles.ownsKeys) {
            const act = sailAction();
            if (act) act.fire();
            else if (stuckOffer && !berthInRange()) void unstuck();
            else dock();
          } else if (cooldown <= 0 && mode === 'walk' && !overlayModal) interactions.fire(s.run);
        }

        if (hintTimer > 0 && (hintTimer -= dt) <= 0 && !dialogue.active) void welcome();
        // A learning pause waits for a quiet moment ashore (no talk, script, welcome or battle).
        if (
          (pendingResume || pendingRecap !== null) &&
          mode === 'walk' &&
          !arriving &&
          !dialogue.active &&
          !scriptRunning &&
          !welcomeRunning &&
          !overlayModal &&
          !battles.active &&
          hintTimer <= 0
        ) {
          learningIdle += dt;
          if (learningIdle > 1.2 && !learningRunning) void runLearningPause();
        } else learningIdle = 0;
        if (introCut && s.stirring) introCut();
        if (
          s.hint &&
          (mode === 'walk' || mode === 'sail') &&
          !dialogue.active &&
          !scriptRunning &&
          !overlayModal
        )
          hint();

        gangwayDown = mode === 'walk' && shipDocked() && canBoard();
        // An island's mooring lines only run to the hull while she's tied up at its berth.
        const moored = mode !== 'sail' && mode !== 'docking' && shipDocked();
        if (moored) shipCams.place(dyn.pose.x, ship.group.position.y, dyn.pose.z, dyn.pose.heading);
        else shipCams.park();
        for (let i = 0; i < contentList.length; i++)
          contentList[i]!.moored?.(moored && island === contentIds[i]);
        ship.setGangway(gangwayDown ? plank.foot : null);
        if (gangwayDown) {
          ship.gangwayTopWorld(plankTop);
          plank.top.x = plankTop.x;
          plank.top.y = plankTop.y;
          plank.top.z = plankTop.z;
        }

        if (mode === 'walk') {
          const n = Math.max(1, Math.ceil(dt / (1 / 60)));
          const h = dt / n;
          // One input copy a frame, reused (a jump only on the first sub-step).
          Object.assign(stepInput, s);
          for (let i = 0; i < n; i++) {
            stepInput.jump = s.jump && i === 0;
            player.step(h, stepInput, cam.yaw, world, t);
          }
          hero.group.position.set(player.x, player.y, player.z);
          hero.group.rotation.y = player.heading;
          const sp = player.speed;
          grounding.mode = player.mode;
          grounding.verticalSpeed = player.vy;
          grounding.landed = player.landed;
          hero.setGrounding(grounding);
          const wading = player.mode === 'wade' && sp > 0.15;
          if (wading && anim !== 'wade') hero.play('wade');
          else if (!wading && anim === 'wade') hero.play('idle');
          anim = wading ? 'wade' : 'move';
          hero.setSpeed(sp);

          if (player.mode !== 'air' && sp > 0.3) {
            stride += sp * dt;
            const len = sp > 3 ? STEP_RUN : STEP_WALK;
            if (stride > len) {
              stride -= len;
              audio?.sfx.footstep(footstep(player.surface), player);
              puffFootstep(sp > 3 ? 1.25 : 0.9);
            }
          }
          if (player.landed) {
            audio?.sfx.footstep(footstep(player.surface), player);
            puffFootstep(1.35);
          }

          const focus = interactions.update(player.x, player.y, player.z, player.heading);
          hud.setPrompt(dialogue.active || anyTalking() || overlayModal ? null : (focus?.label() ?? null));
          updateLighthouse();
          updateStarfish(dt);
          cam.update(dt, camera, s, player, player.heading, sp > 0.3, world, t);
          // Up the plank to the rail, and she's yours: over the side to the helm.
          if (gangwayDown && !dialogue.active && !scriptRunning) {
            const along = plankProgress(plank, player.x, player.z);
            if (along !== null && along > 0.8) void board();
          }
        } else if (mode === 'sail' || mode === 'docking') {
          // A sea battle runs here (it may take the helm: your helmsman, or a question waiting).
          const battleHelm = mode === 'sail' && battles.frame(dt, s, helm, dyn, cam, camera);
          if (mode === 'sail' && !crewAtHelm) {
            if (!battleHelm) helm.update(dt, s.moveX, s.moveY, dyn);
          } else if (mode === 'docking' && (dyn.dockComplete || (dockTime += dt) > DOCK_ASSIST_MAX))
            void disembark();
          const pose = dyn.pose;
          // Into an island's waters: its theme starts buffering before you dock.
          const waters = islandAt(pose.x, pose.z);
          if (waters !== musicWaters) {
            musicWaters = waters;
            audio?.music.prefetch(ISLANDS[waters].music);
          }
          const near = mode === 'sail' && !crewAtHelm ? berthInRange() : null;
          const act = mode === 'sail' && !dialogue.active ? sailAction() : null;
          hud.setPrompt(
            act?.label ?? near?.dockLabel ?? (stuckOffer && mode === 'sail' ? 'Unstuck: warp her off' : null),
          );
          windAt(pose.x, pose.z, t, windHere);
          const bow = windOnBow(pose.heading, windHere[0], windHere[1]);
          hud.updateSail(helm.trim, helm.rudder, Math.abs(dyn.forwardSpeed), bow);
          const stalled =
            mode === 'sail' && bow.point === 'in-irons' && helm.trim > 0.4 && Math.abs(dyn.forwardSpeed) < 1;
          ironsFor = stalled ? ironsFor + dt : 0;
          if (ironsFor > 5 && !ironsNudged && !dialogue.active) {
            ironsNudged = true;
            // Near a harbour, the first time in a voyage: Wingman says how to tack (E skips him).
            if (nearHarbour() && firstShowing(learn?.progress ?? null, labelsShown, TACK_TIP_ID))
              void dialogue.say('Wingman', TACK_TIP);
            else
              hud.toast(
                'We’re head to wind, so the sails can’t fill. Steer with A or D until the arrow’s off the bow.',
                6,
              );
          }
          tmp.set(pose.x, ship.group.position.y, pose.z);
          cam.update(dt, camera, s, tmp, pose.heading, Math.abs(dyn.forwardSpeed) > 0.5, world, t);
          // The light shifts with the passage (the sky only refreshes once the sun has really moved).
          if (openIslands().length > 1) {
            if (passageHold && otherLight(passageHold, pose.x, pose.z)) passageHold = null;
            if (passageHold && !morningCut) {
              const ahead = islandLight(passageHold.skip, pose.x, pose.z);
              const here = islandLight(passageHold.hold, pose.x, pose.z);
              // The evening holds until the next island's light is the stronger; with a battle on the
              // passage, until the battle ends (its win card hands over to the night at sea). Then the
              // morning holds until you're there, or until you turn back into the evening's light past
              // where the morning came.
              const evening = nextMorningFrom(passageHold.hold) === passageHold.skip;
              const run = battles.current;
              if (evening && (run ? run.settled : ahead > 0 && ahead >= here)) {
                eveningAt = here;
                void nextMorning();
              } else if (!evening && (here >= 1 || (ahead > here && ahead > eveningAt + TURN_BACK)))
                passageHold = null;
            }
            passageSky(pose.x, pose.z, sailSky, passageHold);
            if (nightPassing) {
              const n = nightPassing;
              n.t += dt;
              const veil = nightAtSea(n.t, ISLANDS[n.from].sky, ISLANDS[n.to].sky, sailSky);
              hud.setDawn(veil, 'Next morning');
              // From daybreak on, the morning's light holds until you're there.
              if (n.t > NIGHT_AT_SEA.sink && passageHold?.hold === n.from)
                passageHold = { hold: n.to, skip: n.from };
              if (n.t >= nightAtSeaSeconds) {
                endNightPassing();
                // The morning exactly (the sky skips a change under a hundredth of an hour).
                engine.clock.set(sailSky.hours, sailSky.azimuth);
              }
            }
            if (
              Math.abs(engine.clock.hours - sailSky.hours) > 0.01 ||
              Math.abs(engine.clock.azimuth - sailSky.azimuth) > 0.3
            )
              engine.clock.set(sailSky.hours, sailSky.azimuth);
          }
          if (Math.abs(dyn.forwardSpeed) > 0.8 && (slapIn -= dt) <= 0) {
            slapIn = 1.4 + Math.random() * 2.2;
            audio?.sfx.oneShot('hull_slap', tmp, Math.min(1, 0.35 + Math.abs(dyn.forwardSpeed) / 9));
          }
        }

        watchStuck(dt, s);
        for (const c of contentList) c.ride?.(dt, s, t);
        updateResidency(dt, t);
        for (const c of contentList) c.update(dt, t);
        updateCompass();
        // The task list and controls help step aside while a conversation or framed shot has the
        // screen, and come back a moment after (so they don't flicker between lines).
        // (Not during Wingman's welcome: he points them out, so they're up as he flies in.)
        const busy =
          !welcoming &&
          (mode === 'transition' ||
            mode === 'docking' ||
            crewAtHelm ||
            riding() ||
            dialogue.active ||
            scriptRunning ||
            anyTalking() ||
            cam.framing ||
            overlayModal);
        calmFor = busy ? CALM_HOLD : Math.max(0, calmFor - dt);
        const calm = calmFor > 0;
        if (calm !== calmShown) {
          calmShown = calm;
          hud.setCalm(calm);
          learn?.setCalm(calm);
        }
        hero.update(dt);
        updateWingman(dt);
        if (cove.anchorage.shown) npcs.update(dt, mode === 'walk' ? player : { x: 1e6, y: 0, z: 1e6 });
        for (const c of contentList) c.updateNpcs(dt, mode === 'walk' ? player : FAR, camera.position);
        footstepPuffs.update(dt);
        for (const c of chests) c.chest.update(dt, t);
        for (const p of puzzles) p.update(dt, t);
        if ((labelCheckIn -= dt) <= 0) {
          labelCheckIn = LABEL_CHECK_EVERY;
          checkPuzzleLabels();
        }
        let term: PuzzleTerminal | null = null;
        for (const p of puzzles) if ((term = p.terminal?.() ?? null)) break;
        hud.setTerminal(term?.lines ?? null, term?.title);

        if (audio) {
          listenerPos.x = camera.position.x;
          listenerPos.y = camera.position.y;
          listenerPos.z = camera.position.z;
          camera.getWorldDirection(tmp);
          listenerFwd.x = tmp.x;
          listenerFwd.y = tmp.y;
          listenerFwd.z = tmp.z;
          audio.sfx.setListener(listenerPos, listenerFwd);
          audio.update(dt);
        }
      },
    },
    true,
  );

  /** Fast travel: to another island, your ship comes too (moored at its berth). */
  async function travel(x: number, z: number, heading: number): Promise<void> {
    if (mode === 'transition') return;
    passageHold = null;
    endNightPassing();
    if (arrival && arrival.phase !== 'done') await endArrival('cut');
    dialogue.cancel();
    wingman?.landNow();
    const to = ISLANDS[islandAt(x, z)];
    // Its theme buffers while the island streams in, so it starts at once on arrival.
    audio?.music.prefetch(to.music);
    // Fast travel to a battle's destination skips it (and it counts as done).
    battles.travel(island, to.id, cam);
    await streams[to.id].load('auto', true);
    if (disposed) return;
    if (mode === 'sail' || mode === 'docking') await disembark(to);
    if (to.id !== island) {
      setIsland(to.id);
      moorShip();
      audio?.music.setIsland(berth.music);
    }
    placePlayer(x, z, heading);
    cam.snapBehind(heading);
    if (mode === 'walk' && firstLandfall()) startArrival(berth.arrival, false);
  }

  return {
    get mode() {
      return mode;
    },
    get island() {
      return island;
    },
    unstuck() {
      if (battles.active || (mode !== 'walk' && mode !== 'sail')) return false;
      void unstuck();
      return true;
    },
    setPaused(on) {
      paused = on;
      hud.setMenuOpen(on);
      input.enabled = !on && !dialogue.active && !(arrival && arrival.phase !== 'done');
      if (!on) resumedAt = performance.now();
      if (on) hero.setSpeed(0);
    },
    arrivalLeft() {
      const a = arrival;
      if (!a || a.phase === 'done') return 0;
      if (!a.path) return Math.max(0, cardOnlySeconds(a.plan) - a.time);
      return Math.max(0, a.plan.seconds - a.time);
    },
    begin() {
      if (arrival?.phase === 'waiting') arrival.phase = arrival.path ? 'flying' : 'card';
    },
    async warmArrival(step) {
      const a = arrival;
      if (!a?.path || a.phase !== 'waiting') return;
      // The camera's placed here too, so the world streams for this view on the very next frame.
      const view = (t: number) => {
        a.path!.sample(t, flyShot);
        cam.cut(flyShot);
        camera.position.set(flyShot.x, flyShot.y, flyShot.z);
        camera.lookAt(flyShot.tx, flyShot.ty, flyShot.tz);
        camera.updateMatrixWorld();
      };
      for (let t = 0; t <= a.plan.seconds + 0.01; t += ARRIVAL_WARM_STEP) {
        view(t);
        await step();
        if (disposed || a.phase !== 'waiting') return;
      }
      // Then a look all round the landing spot from the follow camera's height, so the village and
      // crew near the captain are drawn even if the flight never passed over them.
      for (let i = 0; i < 8; i++) {
        const yaw = (i / 8) * Math.PI * 2;
        flyShot.x = player.x - Math.sin(yaw) * 6;
        flyShot.y = player.y + 3;
        flyShot.z = player.z - Math.cos(yaw) * 6;
        flyShot.tx = player.x + Math.sin(yaw) * 20;
        flyShot.ty = player.y + 1;
        flyShot.tz = player.z + Math.cos(yaw) * 20;
        cam.cut(flyShot);
        camera.position.set(flyShot.x, flyShot.y, flyShot.z);
        camera.lookAt(flyShot.tx, flyShot.ty, flyShot.tz);
        camera.updateMatrixWorld();
        await step();
        if (disposed || a.phase !== 'waiting') return;
      }
      view(0);
      await step();
    },
    islandSetup: (id) => nextSetup[id].promise,
    onIslandSetup(fn) {
      setupListeners.add(fn);
      return () => setupListeners.delete(fn);
    },
    islandSetups() {
      const out: { id: StreamedIsland; setup: IslandSetup; gen: number }[] = [];
      for (const id of ISLAND_LIST.map((e) => e.id)) {
        const setup = currentSetup[id];
        if (setup) out.push({ id, setup, gen: setupGen[id] });
      }
      return out;
    },
    islandSetupGen: (id) => setupGen[id],
    travel,
    battle: {
      get active() {
        return battles.active;
      },
      skip: () => battles.skip(),
      done: () => [...battles.done],
    },
    islandQuay(id) {
      const b = openIslands().find((i) => i.id === id);
      return b ? { ...b.quay, label: b.name } : null;
    },
    where: () =>
      mode === 'walk' || mode === 'transition'
        ? { x: player.x, z: player.z, heading: player.heading, onShip: false, place: berth.name }
        : { x: dyn.pose.x, z: dyn.pose.z, heading: dyn.pose.heading, onShip: true, place: berth.name },
    player,
    hud,
    world,
    camera: cam,
    npcs,
    debug: {
      starfish: () => starfish.spots.map((sp) => ({ ...sp })),
      teleport(x, z, heading = player.heading, y) {
        player.teleport(world, x, z, heading, y);
        cam.snapBehind(heading);
      },
      board,
      dock,
      chests: () =>
        chests.map((c) => ({
          id: c.id,
          x: c.x,
          z: c.z,
          h: c.chest.group.rotation.y,
          opened: c.chest.opened,
        })),
      bottles: () => [
        ...Object.entries(bottleSpots).map(([id, p]) => ({
          id,
          x: p.x,
          z: p.z,
          read: !!learn?.isChestOpen(id),
        })),
        ...contentList.flatMap((c) => c.bottles?.() ?? []),
      ],
      island: (id) => (isIslandId(id) ? (contents.get(id)?.debug ?? null) : null),
      courseBoards: () =>
        (Object.keys(COURSE_BOARDS) as IslandId[]).map((id) => ({
          island: id,
          ...courseBoardSpot(COURSE_BOARDS[id]),
        })),
      puzzle: (id: string) => puzzles.find((p) => p.id === id)?.debug ?? null,
      liftSpots: () =>
        (contentHook('liftSpots')?.() ?? null) as ReturnType<GameSession['debug']['liftSpots']>,
      near: (x, z, r) => interactions.within(x, z, r),
      talk: (id) => {
        const n = everyone().find((v) => v.spec.id === id);
        if (!n || mode !== 'walk') return false;
        void talkTo(n);
        return true;
      },
      liftAnchors: () =>
        (contentHook('liftAnchors')?.() ?? { liftBottom: null, liftTop: null }) as ReturnType<
          GameSession['debug']['liftAnchors']
        >,
      liftCamera: () =>
        (contentHook('liftCamera')?.() ?? null) as ReturnType<GameSession['debug']['liftCamera']>,
      rheaAboard: () => !!contentHook('rheaAboard')?.(),
      lighthouseLit: () => !!contentHook('lighthouseLit')?.(),
      anchorageLighthouseLit: () => village.lighthouseLit(),
      lighthouseTransit: () => lighthouseTransit,
      cast: () =>
        contentList
          .flatMap((c) => c.npcs)
          .map((n) => ({
            id: n.spec.id,
            name: n.spec.name,
            x: n.x,
            y: n.y,
            z: n.z,
            h: n.heading,
            ground: world.groundAt(n.x, n.z),
          })),
      quest: (id: string, step: string) => setQuest(id, step),
      /** The live sea (Settings → Sea state), and whether a battle or course holds it fixed. */
      sea: () => ({
        chosen: seaState.chosen,
        fixed: seaState.fixed,
        settled: seaState.settled,
        windSpeed: seaState.live.windSpeed,
        amp: seaState.live.amp.slice(),
      }),
      sailTo(x, z, heading) {
        prefetchSailTarget();
        if (mode === 'sail') dyn.reset(x, z, heading);
      },
      gangway: () => ({ down: gangwayDown, foot: { ...plank.foot }, top: { ...plank.top } }),
      hint,
      welcome,
      learningPause: (what) => {
        if (what.resume) pendingResume = true;
        if (what.recap) pendingRecap = what.except ? islandChapterOf(what.except) : '';
      },
      wingman: () =>
        wingman
          ? {
              phase: wingman.phase,
              x: +wingman.root.position.x.toFixed(2),
              y: +wingman.root.position.y.toFixed(2),
              z: +wingman.root.position.z.toFixed(2),
            }
          : null,
      arrival: () =>
        arrival
          ? {
              island: arrival.plan.id,
              phase: arrival.phase,
              time: +arrival.time.toFixed(2),
              eye: Math.hypot(
                camera.position.x - player.x,
                camera.position.y - player.y,
                camera.position.z - player.z,
              ),
            }
          : null,
      flyover(id: IslandId = island, fromChart = false) {
        if (mode !== 'walk') return;
        startArrival(arrivalFlight(ISLANDS[id].arrival, fromChart), false);
      },
      holdArrival(time: number | null) {
        arrivalHold = time;
      },
      skipArrival() {
        if (arrival && arrival.phase !== 'done') void endArrival('skipped');
      },
      battleRun: () => battles.current,
      unloadIsland: (id) => unloadIsland(id),
      keepResident(on) {
        keepResident = on;
      },
      loadIsland: async (id) => void (await streams[id].load()),
      residency() {
        const states: Record<string, string> = {};
        let settled = true;
        const resident: string[] = [];
        for (const r of residency.rules) {
          const state = streams[r.id].state;
          states[r.id] = state;
          if (state === 'resident' || state === 'loading') resident.push(r.id);
          const f = residencyFocus();
          const d = Math.hypot(f.x - r.x, f.z - r.z);
          const aboard = mode === 'sail' || mode === 'docking';
          const keep = island === r.id || (aboard && sailTarget().id === r.id) || d <= r.unload;
          const needed = island === r.id || (aboard && sailTarget().id === r.id) || d < r.load;
          if (state === 'loading' || state === 'unloading' || settingUp.has(r.id) || unloading.has(r.id))
            settled = false;
          else if (state === 'resident' && !keep) settled = false;
          else if (state === 'absent' && needed && reachable(r.id)) settled = false;
        }
        return { resident, states, settled };
      },
      state: () => ({
        mode,
        x: +player.x.toFixed(2),
        y: +player.y.toFixed(2),
        z: +player.z.toFixed(2),
        heading: +player.heading.toFixed(3),
        speed: +player.speed.toFixed(2),
        surface: player.surface,
        depth: +player.depth.toFixed(2),
        focus: interactions.current?.id ?? null,
        dialogue: dialogue.active,
        welcome: welcomeRunning,
        ship: {
          x: +dyn.pose.x.toFixed(2),
          z: +dyn.pose.z.toFixed(2),
          heading: +dyn.pose.heading.toFixed(3),
          speed: +dyn.forwardSpeed.toFixed(2),
          docked: dyn.dockComplete,
        },
        trim: helm.trim,
      }),
    },
    dispose() {
      disposed = true;
      for (const u of unsubscribeStreams) u();
      // Anchorage's cast and chests while it's dormant are out of the scene (the voyage's end doesn't
      // see them): told they're disposed once they're freed below.
      const parkedContent: Object3D[] = [];
      for (const p of anchorageParked) p.object.traverse((o) => void parkedContent.push(o));
      anchorageParked = [];
      setupListeners.clear();
      battles.dispose(cam);
      learn?.reset();
      for (const p of puzzles) p.dispose();
      for (const c of chests) c.chest.dispose();
      remove();
      dialogue.cancel();
      npcs.dispose();
      for (const c of contentList) c.dispose();
      for (const site of marketSites) {
        site.group.removeFromParent();
        site.dispose();
      }
      wingman?.dispose();
      hero.group.removeFromParent();
      hero.dispose();
      clearCharacterLodView(hero.group);
      footstepPuffs.dispose();
      hud.dispose();
      releaseRemovedObjects(parkedContent, engine.scene);
    },
  };
}
