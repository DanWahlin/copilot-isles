import { onPierDeck } from '../world/islands/anchorage/village';
import { spyglassSpeakerPan } from '../learn/spyglass-layout';
import { CHART_LABELS, chartLabel, firstShowing } from '../learn/content/labels';
import { barksFor } from '../course/active';
import { courseVoiceBase, islandHooks, welcomeLines as courseWelcome } from '../course/catalog';
import { Vector3, type Group, type Object3D } from 'three/webgpu';
import { buildSlice } from '../engine/build-slice';
import { releaseRemovedObjects } from '../util/dispose-three';
import type { IslesAudio } from '../audio';
import type { FootstepSurface } from '../audio/soundscape/soundscape';
import type { Engine } from '../engine/engine';
import type { Input } from '../engine/input';
import type { Character, CharacterLibrary, PlayerBody } from '../world/characters';
import { ParrotFlight, type FlightView } from '../world/characters/parrot-flight';
import { clearCharacterLodView, setCharacterLodView } from '../world/characters/character-lod';
import type { CoveScene } from '../world/cove-scene';
import type { FarCull } from '../world/far-cull';
import { COVE } from '../world/layout';
import { windOnBow } from '../world/ship/dynamics';
import { windAt } from '../world/wind';
import { CollisionWorld, type BoxCollider, type SurfaceKind, type WalkSurface } from './collision';
import type { CircleObstacle } from '../world/contracts';
import { Residency, type ResidencyDecision } from './residency';
import { MERIDIAN_FOOTPRINT, MERIDIAN_RANGE } from '../world/islands/meridian-stream';
import { footprintDistance } from '../world/islands/footprint';
import { ANCHORAGE_RANGE } from '../world/islands/anchorage/stream';
import { THOUSAND_BOUGH_FOOTPRINT, THOUSAND_BOUGH_RANGE } from '../world/islands/thousand-bough/stream';
import { Dialogue } from './dialogue';
import { FootstepPuffs } from './footstep-puffs';
import { FollowCamera, SAIL_RIG, WALK_RIG, type CameraShot } from './follow-camera';
import { arrivalFlight, arrivalKeys, type IslandArrival, type IslandId } from './arrivals';
import { ISLANDS, islandAt, openIslands, passageSky, type IslandBerth } from './islands';
import { PassageBattles } from './passage-battles';
import type { BattleRun } from './battle-run';

export { ISLANDS, islandAt } from './islands';
import { MERIDIAN, meridianQuayHeight, meridianWater } from '../world/islands/meridian';
import { terrainRockCameraBlockersSliced } from '../world/terrain/terrain-rocks';
import { meridianTownPlantColliders } from '../world/meridian-town/plantings';
import { FlyoverPath } from './flyover';
import { world as worldUniforms } from '../world/uniforms';
import { Helm } from './helm';
import { Hud } from './hud';
import { Interactions } from './interaction';
import { COVE_NPCS, NpcCrowd, type Npc } from './npcs';
import { PlayerController } from './player-controller';
import type { LearnStore } from '../learn/store';
import { createChest, type TreasureChest } from './chest';
import {
  COVE_CHESTS,
  MERIDIAN_CHESTS,
  boardingOpen,
  currentQuest,
  migrateQuests,
  npcScript,
  questLog,
  questTarget,
  questTracker,
} from './cove-quests';
import { bearingOf, type CompassTarget } from './compass';
import { meridianLog, meridianNpcScript, meridianTarget, meridianTracker } from './meridian-quests';
import { MERIDIAN_NPCS, meridianExtras } from './meridian-npcs';
import { thousandBoughLog, thousandBoughTarget, thousandBoughTracker } from './thousand-bough-quests';
import { createThousandBoughContent, type ThousandBoughContent } from './thousand-bough-session';
import type { ThousandBoughSystem } from '../world/islands/thousand-bough/contract';
import { noteMeridianSeal } from './thousand-bough-open';
import { THOUSAND_BOUGH } from '../world/islands/thousand-bough/layout';
import { TIP_SPOTS } from './island-tips';
import { createCrateYard } from './puzzles/crate-yard';
import { createCrateYardSite } from '../world/sites/crate-yard';
import { createThreeHelms, type HelmsHost } from './puzzles/three-helms';
import { createLostLetters, type LettersHost } from './puzzles/lost-letters';
import { ALCOVES, LETTERS, lettersContent } from './puzzles/hall-letters';
import { puzzleOn, textOf } from '../course/puzzles';
import { createRecordsAlcoves } from '../world/sites/records-alcoves';
import { createModelMarketSigns } from '../world/sites/model-market';
import { createModelMarket, type MarketHost } from './puzzles/model-market';
import { CATEGORY_PRICE, JOBS as MARKET_JOBS } from './market/jobs';
import { BOARDS as MARKET_BOARDS } from './market/models';
import { createHelmBuoys } from '../world/sites/helm-buoys';
import { loadVillageKit } from '../world/village/kit';
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
import { MERIDIAN_YARD } from '../world/sites/crate-yard-logic';
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
import { createSluice } from './puzzles/sluice';
import type { HintTier, Puzzle, PuzzleHost, PuzzleTerminal, SailAction } from './puzzles/types';

type SessionMode = 'walk' | 'sail' | 'docking' | 'transition';
/** The islands that stream in and out (Anchorage, built with the world, goes dormant instead). */
export type StreamedIsland = 'anchorage' | 'meridian' | 'thousand-bough';
/** An island's cast, chests and sites, hidden until whoever warms them calls `reveal`. */
export interface IslandSetup {
  roots: Object3D[];
  reveal(): void;
}
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
   * Port Meridian's cast, chests and puzzle sites (their groups), once the town has streamed in and
   * they've joined the scene: unwarmed and hidden, so nothing draws them before they're built. Whoever
   * warms them calls `reveal` after (the flow, with the town). Empty if Meridian never loads.
   */
  readonly meridianSetup: Promise<IslandSetup>;
  /** Thousand-Bough's cast, chests and set pieces, like `meridianSetup`, once its world's streamed. */
  readonly thousandBoughSetup: Promise<IslandSetup>;
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
    /** Port Meridian's cast where they stand (tests), empty until the town's up. */
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
    near(x: number, z: number, r: number): { id: string; y: number; d: number; on: boolean }[];
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
    /** Whether the gangway's down, and its world-space foot and top (tests). */
    gangway(): {
      down: boolean;
      foot: { x: number; y: number; z: number };
      top: { x: number; y: number; z: number };
    };
    /** Thousand-Bough's set pieces (tests): the board, the hoist, the basket. */
    thousandBough(): Record<string, (...args: never[]) => unknown> | null;
    /** Presses Wingman's hint key. */
    hint(): void;
    /** Plays Wingman's welcome (the flight and his lines). */
    welcome(): Promise<void>;
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
/** …or the chart label, which has more to read (docs/specs/LOWER-THIRDS.md). */
const ARRIVAL_LABEL_ONLY = 7;
const cardOnlySeconds = (plan: IslandArrival) => (plan.label ? ARRIVAL_LABEL_ONLY : ARRIVAL_CARD_ONLY);
/** Seconds into a flyover before a key press can skip it (so a held key from the menu doesn't). */
const ARRIVAL_SKIP_AFTER = 0.6;
/** Seconds of flight between the views warmed up while loading. */
const ARRIVAL_WARM_STEP = 0.5;

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
  const meridianQuay: WalkSurface = { heightAt: meridianQuayHeight, kind: 'stone' };
  const meridianTownSurface: WalkSurface = {
    heightAt: (x, z) => cove.meridian.town?.walkable(x, z) ?? null,
    kind: 'stone',
  };
  // Thousand-Bough's content (decks, the stair, its pools), live once its world has streamed in.
  let tb: ThousandBoughContent | null = null;
  /** The Gate Board, the Flag Hoist or Pell's letters has the keys and the camera. */
  let tbModal = false;
  const tbSurface: WalkSurface = {
    heightAt: (x, z, y) => tb?.surface.heightAt(x, z, y) ?? null,
    kind: (x, z) => {
      const k = tb?.surface.kind ?? 'wood';
      return typeof k === 'function' ? k(x, z) : k;
    },
  };
  let gangwayDown = false;
  let mooredShown = false;
  const world = new CollisionWorld({
    ground,
    waves: ocean.field,
    surfaces: [
      villageSurface,
      sitesSurface,
      meridianTownSurface,
      meridianQuay,
      tbSurface,
      plankSurface(plank, () => gangwayDown),
    ],
    circles: [
      ...village.colliders.circles,
      ...sites.colliders.circles,
      ...meridianTownPlantColliders(tier.tier),
    ],
    boxes: [...village.colliders.boxes, ...sites.colliders.boxes],
    // Port Meridian's lake and streams: wade the shallows, and the deep middle stops you.
    inland: (x, z) => meridianWater().levelAt(x, z) ?? tb?.inland(x, z) ?? null,
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
  const speakerNpc = (speaker: string): Npc | null => {
    let best: Npc | null = null;
    let bestD = Infinity;
    for (const n of [...npcs.list, ...(meridianNpcs?.list ?? []), ...(tb?.npcs ?? [])]) {
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
    const aboard = line?.speaker === 'Rhea' && rheaAboard?.group.parent ? rheaAboard : null;
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
    for (const other of [...npcs.list, ...(meridianNpcs?.list ?? []), ...(tb?.npcs ?? [])]) {
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

  // Player: stepUp covers the 0.6 m quay-to-pier lip.
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
  const npcs = await NpcCrowd.createAsync(
    o.characters,
    COVE_NPCS,
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
  /** Anchorage's gangway stays up until the christening; elsewhere you can always board. */
  const canBoard = () => (island === 'anchorage' ? boardingOpen(quests()) : true);
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
    if (id === 'Q0.10' && step === 'done') village.setLighthouseLit(true);
    if (id === 'Q1.8') noteMeridianSeal(step === 'done');
    publishQuests();
  };
  const publishQuests = () =>
    learn?.setQuests(
      [...questLog(quests()), ...meridianLog(quests()), ...thousandBoughLog(quests())],
      trackerHere(),
    );
  /** The task list for the island you're on (Anchorage's points on to Meridian once it's open). */
  const trackerHere = () => {
    if (island === 'meridian') return meridianTracker(quests());
    if (island === 'thousand-bough') return thousandBoughTracker(quests());
    const t = questTracker(quests());
    return openIslands().some((b) => b.id === 'meridian')
      ? { ...t, next: 'Port Meridian’s next. Board your ship and follow the compass north-east.' }
      : t;
  };
  noteMeridianSeal(quests()['Q1.8'] === 'done');
  if (!quests()['Q0.2']) setQuest('Q0.2', 'start');
  // Suri's gate lever (P0.1) is the crane job's Actions step; without a save there's nothing to check.
  migrateQuests(quests(), setQuest, {
    workflowsOn: learn ? !!learn.progress.data.puzzles['P0.1']?.flags?.includes('gate') : undefined,
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
  /** Port Meridian's town colliders and camera blockers while it's in (taken out when it's freed). */
  const meridianTownColliders: (CircleObstacle | BoxCollider)[] = [];
  const addMeridianTownColliders = (town: CoveScene['meridian']['town']) => {
    if (!town || disposed || meridianTownColliders.length) return;
    for (const c of town.colliders.circles) world.addCircle(c);
    for (const b of town.colliders.boxes) world.addBox(b);
    for (const b of town.cameraBlockers) world.addCameraBox(b);
    for (const b of cove.meridian.rockCameraBlockers) world.addCameraBox(b);
    meridianTownColliders.push(
      ...town.colliders.circles,
      ...town.colliders.boxes,
      ...town.cameraBlockers,
      ...cove.meridian.rockCameraBlockers,
    );
  };
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
  const meridianIds = new Set(MERIDIAN_NPCS.map((m) => m.id));
  /** The scripted beat an NPC offers now: Meridian's cast follow Chapter 01, everyone else Chapter 00. */
  function scriptFor(n: Npc) {
    if (tb?.ids.has(n.spec.id)) return tb.script(n.spec.id);
    return meridianIds.has(n.spec.id)
      ? meridianNpcScript(n.spec.id, quests(), {
          lettersFiled: learn ? !!learn.progress.data.puzzles['P1.3']?.solved : undefined,
        })
      : npcScript(n.spec.id, quests());
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
    x: plank.foot.x,
    y: plank.foot.y,
    z: plank.foot.z,
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
  cues.set('nell-chest', async () => {
    const c = chests.find((v) => v.id === 'C0.1');
    if (!c) return;
    if (!c.chest.opened) {
      audio?.sfx.oneShot('step_wood', c.chest.group.position, 1);
      await c.chest.open();
    }
    await learn?.openChest('C0.1');
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
    tbModal = on;
    input.enabled = !on && !paused && !scriptRunning;
    if (on) {
      hero.setSpeed(0);
      hud.setPrompt(null);
    }
  }
  // P1.3 The Lost Letters: an overlay at Pell's desk, with the camera on the record cabinets.
  const lettersHost: LettersHost = {
    ...puzzleHost,
    frame: (shot) => cam.frame(shot),
    cut: (shot) => cam.cut(shot),
    setModal: setOverlayModal,
    reducedMotion: () => worldUniforms.reducedMotion.value > 0.5,
    place: placePlayer,
  };
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
  };
  // P1.2 The Three Helms: the crew takes the wheel for each mode, and Rhea comes aboard to teach it.
  const helmsHost: HelmsHost = {
    ...puzzleHost,
    sailing: () => mode === 'sail' && !paused && !scriptRunning && !dialogue.active && !learn?.busy,
    afloat: () => mode === 'sail' || mode === 'docking',
    ship: dyn,
    crewHelm: (on) => {
      crewAtHelm = on;
      helm.reset();
      dyn.setInput({ trim: 0, rudder: 0 });
      if (!on) dyn.clearAutopilot();
    },
    say: (ids) => dialogue.play(ids),
    frame: (shot) => cam.frame(shot),
    dockHome: () =>
      new Promise<void>((resolve) => {
        afterDisembark = resolve;
        dockTo = ISLANDS[island];
        mode = 'docking';
        dockTime = 0;
        dyn.dockAssist(dockTo.mooring);
      }),
  };
  let rheaAboard: Character | null = null;
  /** Rhea stands by the wheel for the Three Helms (and steps back onto the arm when you land). */
  const setRheaAboard = (on: boolean) => {
    if (on && !rheaAboard) {
      rheaAboard = o.characters.create({ body: 'rhea', tier });
      const a = ship.anchors.helm;
      // Forward of the wheel on the starboard side, turned to face the captain.
      rheaAboard.group.position.set(a.x + 1.35, a.y - 0.18, a.z + 1.2);
      rheaAboard.group.rotation.y = Math.atan2(-1.35, -1.2);
      rheaAboard.play('idle');
    }
    if (rheaAboard) {
      if (on) ship.group.add(rheaAboard.group);
      else rheaAboard.group.removeFromParent();
    }
    const onArm = meridianNpcs?.list.find((n) => n.spec.id === 'rhea');
    if (onArm) onArm.character.group.visible = !on;
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

  // ---- Port Meridian (Chapter 01): its cast, sites and set pieces arrive with the town ----
  let meridianNpcs: NpcCrowd | null = null;
  const FAR = { x: 1e6, y: 0, z: 1e6 };
  const anyTalking = () =>
    npcs.list.some((n) => n.talking) ||
    (meridianNpcs?.list.some((n) => n.talking) ?? false) ||
    (tb?.npcs.some((n) => n.talking) ?? false);
  const nearMeridian = () =>
    Math.hypot(
      camera.position.x - ISLANDS.meridian.mooring.x,
      camera.position.z - ISLANDS.meridian.mooring.z,
    ) < 700;
  const meridianSites: { update(dt: number, t: number): void; dispose(): void; group: Group }[] = [];
  /** Where the lift car is: 0 at the east arm, 1 on the citadel bluff. */
  let liftAt = 0;
  let liftRide: {
    from: number;
    to: number;
    t: number;
    call: number;
    /** Which side the camera rides on (unit, horizontal), picked for a clear view the whole way. */
    cam: LiftCam | null;
  } | null = null;
  const liftShot: CameraShot = { x: 0, y: 0, z: 0, tx: 0, ty: 0, tz: 0 };
  const liftCarAt = (k: number, out: { x: number; y: number; z: number }) => {
    const a = cove.meridian.town?.anchors;
    const b = a?.liftBottom,
      tp = a?.liftTop;
    if (!b || !tp) return out;
    const e = k * k * (3 - 2 * k);
    out.x = b.tx! + (tp.tx! - b.tx!) * e;
    out.y = b.ty! - 1.4 + (tp.ty! - 1.4 - (b.ty! - 1.4)) * e;
    out.z = b.tz! + (tp.tz! - b.tz!) * e;
    return out;
  };
  const liftPos = { x: 0, y: 0, z: 0 };
  type LiftCam = { x: number; y: number; z: number; blocked: number };
  /**
   * The lift ride's camera: one fixed spot out on the harbour side, looking up the notch in the bluff
   * at the car as it climbs, with the citadel above. Picked at the start of each ride from spots
   * along the notch's axis (and a little to either side) for the clearest line to the car over the
   * whole ride; `blocked` is how many of its 21 samples aren't clear (tests want 0).
   */
  function liftCamera(): LiftCam | null {
    const a = cove.meridian.town?.anchors;
    const b = a?.liftBottom,
      tp = a?.liftTop;
    if (!b || !tp) return null;
    let hx = b.tx! - tp.tx!,
      hz = b.tz! - tp.tz!;
    const hl = Math.hypot(hx, hz) || 1;
    hx /= hl;
    hz /= hl;
    const car = { x: 0, y: 0, z: 0 };
    const blocked = (c: { x: number; y: number; z: number }) => {
      if (world.groundAt(c.x, c.z) > c.y - 1.2) return true;
      const ty = car.y + 1.2;
      const n = Math.ceil(Math.hypot(car.x - c.x, ty - c.y, car.z - c.z) / 0.75);
      for (let i = 1; i < n - 2; i++) {
        const t = i / n;
        const x = c.x + (car.x - c.x) * t,
          y = c.y + (ty - c.y) * t,
          z = c.z + (car.z - c.z) * t;
        if (y < world.groundAt(x, z) + 0.4 || world.sightBlockedAt(x, y, z, 0.15)) return true;
      }
      return false;
    };
    let best: LiftCam | null = null,
      bestScore = Infinity;
    for (const d of [22, 32, 45, 60])
      for (const u of [3, 8, 14, 22])
        for (const sd of [0, -8, 8]) {
          const c = { x: b.tx! + hx * d + hz * sd, y: b.ty! + u, z: b.tz! + hz * d - hx * sd };
          let bad = 0;
          for (let i = 0; i <= 20; i++) {
            liftCarAt(i / 20, car);
            if (blocked(c)) bad += 1;
          }
          // Clear first, then close, low and square on (a steep or distant view loses the car).
          const score = bad * 10 + d * 0.03 + u * 0.04 + Math.abs(sd) * 0.03;
          if (score < bestScore) {
            bestScore = score;
            best = { ...c, blocked: bad };
          }
        }
    return best;
  }

  function rideLift(up: boolean): void {
    if (liftRide || mode !== 'walk' || !cove.meridian.town) return;
    const to = up ? 1 : 0;
    liftRide = { from: 1 - to, to, t: 0, call: liftAt === 1 - to ? 0 : 2.4, cam: liftCamera() };
    mode = 'transition';
    input.enabled = false;
    hero.setSpeed(0);
    hud.setPrompt(null);
    audio?.sfx.oneShot('crane_ratchet', player, 0.8);
  }
  /** The lift: the car comes to you if it's at the other end, then carries you up (or down) the bluff. */
  function updateLift(dt: number, look: ReturnType<Input['poll']>, t: number): void {
    const r = liftRide;
    const town = cove.meridian.town;
    if (!r || !town) return;
    if (r.call > 0) {
      r.call -= dt;
      town.setLiftCar(r.from + (r.to - r.from) * Math.max(0, r.call / 2.4));
      cam.update(dt, camera, look, player, player.heading, false, world, t);
      if (r.call > 0) return;
    }
    r.t = Math.min(1, r.t + dt / 8);
    const k = r.from + (r.to - r.from) * r.t;
    town.setLiftCar(k);
    liftCarAt(k, liftPos);
    const b0 = town.anchors.liftBottom!,
      t0 = town.anchors.liftTop!;
    // Stand in the car looking out over the harbour, toward the camera out on the quay.
    const out = { x: b0.x - t0.x, z: b0.z - t0.z };
    hero.group.position.set(liftPos.x, liftPos.y + 0.2, liftPos.z);
    hero.group.rotation.y = Math.atan2(out.x, out.z);
    liftShot.x = r.cam?.x ?? liftPos.x + out.x;
    liftShot.y = r.cam?.y ?? liftPos.y + 6;
    liftShot.z = r.cam?.z ?? liftPos.z + out.z;
    liftShot.tx = liftPos.x;
    liftShot.ty = liftPos.y + 1.2;
    liftShot.tz = liftPos.z;
    cam.frame(liftShot);
    cam.update(dt, camera, look, liftPos, 0, false, world, t);
    if (r.t < 1) return;
    liftAt = r.to;
    liftRide = null;
    const a = town.anchors[r.to === 1 ? 'liftTop' : 'liftBottom']!;
    // Step off the landing facing away from the lift: inland up top (the camera hangs over the notch
    // with the harbour behind you), back down the arm at the bottom.
    const b1 = town.anchors.liftBottom!,
      t1 = town.anchors.liftTop!;
    const heading = r.to === 1 ? Math.atan2(t1.x - b1.x, t1.z - b1.z) : Math.PI;
    const step = r.to === 1 ? 1.6 : 0;
    placePlayer(a.x + Math.sin(heading) * step, a.z + Math.cos(heading) * step, heading);
    cam.snapBehind(heading);
    cam.frame(null);
    mode = 'walk';
    input.enabled = !paused;
    audio?.sfx.oneShot('gear_hang', player, 0.7);
  }

  /** A held shot of a landmark from in front of it (Mina's tour, the lighthouse). */
  const landmarkShot = (id: string): CameraShot | null => {
    const a = cove.meridian.town?.anchors[id];
    if (!a || a.tx === undefined) return null;
    const dx = a.tx - a.x,
      dz = a.tz! - a.z;
    const len = Math.hypot(dx, dz) || 1;
    const h = Math.max(0, a.ty! - a.y);
    const back = 5 + h * 0.45;
    return {
      x: a.x - (dx / len) * back + (dz / len) * 2.2,
      y: a.y + 2.6 + h * 0.2,
      z: a.z - (dz / len) * back - (dx / len) * 2.2,
      tx: a.tx,
      ty: a.ty!,
      tz: a.tz!,
    };
  };
  for (const id of ['voyageOffice', 'bountyBoard', 'clockTower', 'outfitter'])
    cues.set(`tour:${id}`, async () => {
      const shot = landmarkShot(id);
      if (shot) cam.frame(shot);
      if (id === 'clockTower')
        audio?.sfx.oneShot('chime_solve', shot ? { x: shot.tx, y: shot.ty, z: shot.tz } : player, 0.9);
      await new Promise((r) => setTimeout(r, 700));
    });
  cues.set('tour:end', async () => {
    if (talkShot) cam.frame(talkShot);
  });
  // A Seal's won: everyone nearby waves to you, the crowd cheers, and Wingman takes a lap and comes
  // back to your shoulder.
  cues.set('celebrate', async () => {
    audio?.sfx.oneShot('chime_solve', player, 0.9);
    for (const n of [...npcs.list, ...(meridianNpcs?.list ?? []), ...(tb?.npcs ?? [])])
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
  let lighthouseLit = false;
  /**
   * The Seal's shot of the lighthouse: out on the water beyond it and a little to one side, looking
   * back at the lamp with the town and the citadel behind it. Nothing stands between the sea and the
   * mole's end, so it's always clear.
   */
  function lighthouseShot(
    adm: { x: number; y: number; z: number },
    lh: { x: number; y: number; z: number },
  ): CameraShot {
    let dx = lh.x - adm.x,
      dz = lh.z - adm.z;
    const len = Math.hypot(dx, dz) || 1;
    dx /= len;
    dz /= len;
    const x = lh.x + dx * 30 + dz * 12,
      z = lh.z + dz * 30 - dx * 12;
    return {
      x,
      y: Math.max(lh.y + 7, world.waterAt(x, z, 0) + 3),
      z,
      tx: lh.x - dx * 6,
      ty: lh.y + 9,
      tz: lh.z - dz * 6,
    };
  }
  // The Seal: the lighthouse on the mole lights up across the harbour.
  cues.set('lighthouse', async () => {
    const town = cove.meridian.town;
    const lh = town?.anchors.lighthouse;
    const adm = town?.anchors.admiral;
    if (!town || !lh || !adm) return;
    // Cuts, not eases: the sea shot is across the harbour, and an ease would swoop through the bluff.
    const shot = lighthouseShot(adm, lh);
    await hud.fade(true, 260);
    cam.cut(shot);
    await hud.fade(false, 260);
    await new Promise((r) => setTimeout(r, 1100));
    town.setLighthouseLit(true);
    lighthouseLit = true;
    audio?.sfx.oneShot('stinger_triumph', player, 0.8);
    await new Promise((r) => setTimeout(r, 2600));
    await hud.fade(true, 260);
    if (talkShot) cam.cut(talkShot);
    await hud.fade(false, 260);
  });

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
    await hud.fade(true, 260);
    cam.cut(shot);
    await hud.fade(false, 260);
    await new Promise((r) => setTimeout(r, 1100));
    village.setLighthouseLit(true);
    audio?.sfx.oneShot('stinger_triumph', player, 0.8);
    await new Promise((r) => setTimeout(r, 2600));
    await hud.fade(true, 260);
    if (talkShot) cam.cut(talkShot);
    await hud.fade(false, 260);
  });
  if (quests()['Q0.10'] === 'done') village.setLighthouseLit(true);

  const noMeridian: IslandSetup = { roots: [], reveal() {} };
  /**
   * What an island's content added to the session (colliders, interactions, chests, puzzles), so
   * it can all be taken out again when the island is freed. Whatever the player has done there lives
   * in the save (quests, puzzles' state, chests, starfish), and the next setup reads it back.
   */
  interface IslandScope {
    colliders: (CircleObstacle | BoxCollider)[];
    interactions: string[];
    chests: string[];
    puzzles: Puzzle[];
  }
  const newScope = (): IslandScope => ({ colliders: [], interactions: [], chests: [], puzzles: [] });
  const clearScope = (sc: IslandScope) => {
    world.remove(sc.colliders);
    for (const id of sc.interactions) interactions.remove(id);
    for (const p of sc.puzzles) {
      const i = puzzles.indexOf(p);
      if (i >= 0) puzzles.splice(i, 1);
      p.dispose();
    }
    removeChests(sc.chests);
    sc.colliders.length = sc.interactions.length = sc.chests.length = sc.puzzles.length = 0;
  };
  let meridianScope = newScope();
  const setupMeridian = async (town: CoveScene['meridian']['town']): Promise<IslandSetup> => {
    if (!town || disposed || meridianNpcs) return noMeridian;
    addMeridianTownColliders(town);
    const scope = meridianScope;
    const cast = [...MERIDIAN_NPCS, ...meridianExtras(town.anchors)];
    // A character a slice: the whole cast at once stalled a frame for ~150 ms while you sailed.
    const crowd = await NpcCrowd.createAsync(
      o.characters,
      cast,
      town.anchors,
      world,
      tier,
      camera,
      { ...town.anchors.promenade! },
      buildSlice,
      () => !disposed && !meridianNpcs && cove.meridian.town === town,
    );
    if (disposed || meridianNpcs || cove.meridian.town !== town) {
      crowd.dispose();
      return noMeridian;
    }
    meridianNpcs = crowd;
    await buildSlice();
    for (const n of meridianNpcs.list) {
      n.character.group.visible = false;
      engine.scene.add(n.character.group);
      addNpcTalk(n);
      scope.interactions.push(`npc:${n.spec.id}`);
    }
    await buildSlice();
    const chestsBefore = chests.length;
    for (const c of MERIDIAN_CHESTS) {
      const n = meridianNpcs.list.find((v) => v.spec.id === c.npc);
      if (n) placeChest(c, n, cove.detail.meridian);
    }
    for (const c of chests.slice(chestsBefore)) {
      c.chest.group.visible = false;
      scope.chests.push(c.id);
    }
    if (quests()['Q1.8'] === 'done') {
      town.setLighthouseLit(true);
      lighthouseLit = true;
    }
    // The lift's car where you left it (a reload builds the town with the car at the bottom).
    if (liftAt) town.setLiftCar(liftAt);
    // The mooring lines go back on (or stay off) on the next frame.
    mooredShown = false;
    // The lift, from the top of the east arm to the citadel bluff.
    for (const [id, up] of [
      ['liftBottom', true],
      ['liftTop', false],
    ] as const) {
      const a = town.anchors[id];
      if (!a) continue;
      const iid = up ? 'lift:bottom' : 'lift:top';
      scope.interactions.push(iid);
      interactions.add({
        id: iid,
        label: () => (up ? 'Ride the lift up' : 'Ride the lift down'),
        x: a.x,
        y: a.y,
        z: a.z,
        radius: 2.6,
        enabled: () => mode === 'walk' && !scriptRunning && !liftRide,
        onInteract: () => rideLift(up),
      });
    }
    scope.interactions.push(addCourseBoard('meridian'));
    // P1.1 The Crate Yard on the shipyard apron, and P1.2 The Three Helms out in the bay.
    const kit = await loadVillageKit();
    if (disposed || cove.meridian.town !== town) return noMeridian;
    const sitesBefore = meridianSites.length;
    const yardAt = town.anchors.crateYard;
    if (yardAt) {
      const site = createCrateYardSite({ tier, kit, origin: yardAt, layout: MERIDIAN_YARD });
      site.group.visible = false;
      engine.scene.add(site.group);
      for (const c of site.colliders.circles) world.addCircle(c);
      for (const b of site.colliders.boxes) world.addBox(b);
      for (const c of site.crateCircles) {
        world.addDynamic(c);
        world.addCameraDynamic(c);
      }
      scope.colliders.push(...site.colliders.circles, ...site.colliders.boxes, ...site.crateCircles);
      meridianSites.push(site);
      if (puzzleOn('crate-yard')) {
        const p = createCrateYard(puzzleHost, site);
        puzzles.push(p);
        scope.puzzles.push(p);
      }
    }
    await buildSlice();
    if (disposed || cove.meridian.town !== town) return noMeridian;
    // P1.3 The Lost Letters: record cabinets between the Hall of Records' columns, and Pell's desk.
    const recordsAt = town.anchors.recordsAlcoves;
    if (recordsAt) {
      const site = createRecordsAlcoves({
        kit,
        origin: recordsAt,
        alcoves: ALCOVES,
        letters: LETTERS.map((l) => l.answer),
        crest: textOf(lettersContent(), 'crest'),
      });
      site.group.visible = false;
      engine.scene.add(site.group);
      for (const b of site.colliders.boxes) world.addBox(b);
      scope.colliders.push(...site.colliders.boxes);
      meridianSites.push(site);
      if (puzzleOn('lost-letters')) {
        const p = createLostLetters(lettersHost, site);
        puzzles.push(p);
        scope.puzzles.push(p);
      }
    }
    await buildSlice();
    if (disposed || cove.meridian.town !== town) return noMeridian;
    // The Model Market (optional): the boards' lettering on Gilda's stall (the stall's part of the
    // town), and her counter. What's been hired lives in the save, so a reload shows the same notes.
    const marketAt = town.anchors.modelMarket;
    if (marketAt) {
      const site = createModelMarketSigns({
        origin: marketAt,
        boards: MARKET_BOARDS.map((b) => ({
          category: b.category,
          price: CATEGORY_PRICE[b.category],
          names: b.shown.map((m) => m.name),
          more: b.more.length,
        })),
        jobs: MARKET_JOBS.map((j) => ({ id: j.id, note: j.note, size: j.size })),
        done: [],
      });
      site.group.visible = false;
      engine.scene.add(site.group);
      meridianSites.push(site);
      if (puzzleOn('market')) {
        const p = createModelMarket(marketHost, site);
        puzzles.push(p);
        scope.puzzles.push(p);
      }
    }
    await buildSlice();
    if (disposed || cove.meridian.town !== town) return noMeridian;
    const buoys = createHelmBuoys({ kit, waves: ocean.field });
    buoys.group.visible = false;
    engine.scene.add(buoys.group);
    meridianSites.push(buoys);
    if (puzzleOn('three-helms')) {
      const helms = createThreeHelms(helmsHost, buoys, cove.quietSea);
      puzzles.push(helms);
      scope.puzzles.push(helms);
    }
    const roots = [
      ...meridianNpcs.list.map((n) => n.character.group),
      ...chests.slice(chestsBefore).map((c) => c.chest.group),
      ...meridianSites.slice(sitesBefore).map((s) => s.group),
    ];
    for (const n of meridianNpcs.list) cove.detail.meridian.add(n.character.group);
    for (const s of meridianSites) cove.detail.meridian.add(s.group);
    return {
      roots,
      reveal() {
        for (const r of roots) r.visible = true;
        // Rhea on the quay stays hidden while she's aboard (setRheaAboard).
        const onArm = meridianNpcs?.list.find((n) => n.spec.id === 'rhea');
        if (onArm && rheaAboard?.group.parent) onArm.character.group.visible = false;
      },
    };
  };
  /** Takes Port Meridian's cast, chests, sites, puzzles and colliders out (before its world is freed). */
  const teardownMeridian = () => {
    if (meridianNpcs) {
      meridianNpcs.dispose();
      meridianNpcs = null;
    }
    clearScope(meridianScope);
    meridianScope = newScope();
    for (const site of meridianSites.splice(0)) {
      site.group.removeFromParent();
      site.dispose();
    }
    world.remove(meridianTownColliders);
    meridianTownColliders.length = 0;
  };

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
      if (labelDone.has(p.id) || !p.engaged()) continue;
      labelDone.add(p.id);
      puzzleLabel(`puzzle:${p.id}`);
      return;
    }
  }

  // ---- Thousand-Bough Isle (Chapter 02): its cast and set pieces arrive with its world ----
  /** The open conversation's camera shot, again (after a cutaway in a script). */
  const backToTalk = () => cam.frame(talkShot);
  tb = createThousandBoughContent({
    characters: o.characters,
    tier,
    camera,
    scene: engine.scene,
    world,
    detail: cove.detail['thousand-bough'],
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
  });

  // ---- Islands that stream in and out (PLAN §13.3) ----
  // Each time an island's world streams in, its content goes on it and the listeners (the flow's
  // warm, the dev page's precompile) hear of it; before its world is freed, its content comes off.
  const streams = {
    anchorage: cove.anchorage,
    meridian: cove.meridian,
    'thousand-bough': cove.thousandBough,
  } as const;
  const setupListeners = new Set<(id: StreamedIsland, setup: IslandSetup) => void>();
  // Anchorage's content went in with the session (its first setup).
  const setupGen: Record<StreamedIsland, number> = { anchorage: 1, meridian: 0, 'thousand-bough': 0 };
  const currentSetup: Partial<Record<StreamedIsland, IslandSetup>> = { anchorage: noMeridian };
  const deferred = () => {
    let resolve!: (s: IslandSetup) => void;
    const promise = new Promise<IslandSetup>((r) => (resolve = r));
    return { promise, resolve };
  };
  const nextSetup = { anchorage: deferred(), meridian: deferred(), 'thousand-bough': deferred() };
  nextSetup.anchorage.resolve(noMeridian);
  /** Anchorage's cast and chests while it's dormant, and whether each was shown. */
  let anchorageParked: { object: Object3D; visible: boolean }[] = [];
  const anchorageContent = (): Object3D[] => [
    ...npcs.list.map((n) => n.character.group),
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
      if (disposed || setup === noMeridian) return;
      setupGen[id]++;
      currentSetup[id] = setup;
      nextSetup[id].resolve(setup);
      for (const fn of setupListeners) fn(id, setup);
    });
  };
  const onMeridianTown = (town: NonNullable<CoveScene['meridian']['town']>) =>
    runSetup('meridian', () => setupMeridian(town));
  const onThousandBough = (sys: ThousandBoughSystem) =>
    runSetup('thousand-bough', async () => {
      if (!tb || disposed) return noMeridian;
      const setup = await tb.setup(sys);
      if (!disposed && cove.thousandBough.system === sys) addCourseBoard('thousand-bough');
      return setup;
    });
  const unsubscribeStreams = [
    cove.anchorage.onReady(() => runSetup('anchorage', setupAnchorage)),
    cove.meridian.onReady(onMeridianTown),
    cove.thousandBough.onReady(onThousandBough),
  ];
  // Streamed in before the session (a save there).
  if (cove.meridian.state === 'resident' && cove.meridian.town) onMeridianTown(cove.meridian.town);
  if (cove.thousandBough.state === 'resident' && cove.thousandBough.system)
    onThousandBough(cove.thousandBough.system);

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
          if (id !== 'anchorage')
            for (const r of currentSetup[id]?.roots ?? []) r.traverse((o) => void leaving.push(o));
          currentSetup[id] = undefined;
          nextSetup[id] = deferred();
          if (id === 'meridian') teardownMeridian();
          else if (id === 'thousand-bough') {
            tb?.teardown();
            interactions.remove('course-board:thousand-bough');
          } else {
            // Anchorage sleeps with its cast and chests (they stay as they are, out of the scene).
            const content = anchorageContent().filter((o) => o.parent);
            anchorageParked = content.map((object) => ({ object, visible: object.visible }));
            cove.anchorage.extra = content;
          }
          releaseRemovedObjects(leaving, engine.scene);
          await streams[id].unload();
        })(),
      );
    } finally {
      unloading.delete(id);
    }
  }
  const residency = new Residency([
    { id: 'anchorage', x: COVE.island.center.x, z: COVE.island.center.z, ...ANCHORAGE_RANGE },
    {
      id: 'meridian',
      x: MERIDIAN.center.x,
      z: MERIDIAN.center.z,
      load: MERIDIAN_RANGE.load,
      unload: MERIDIAN_RANGE.unload,
      distance: (x, z) => footprintDistance(MERIDIAN_FOOTPRINT, x, z),
    },
    {
      id: 'thousand-bough',
      x: THOUSAND_BOUGH.center.x,
      z: THOUSAND_BOUGH.center.z,
      load: THOUSAND_BOUGH_RANGE.load,
      unload: THOUSAND_BOUGH_RANGE.unload,
      distance: (x, z) => footprintDistance(THOUSAND_BOUGH_FOOTPRINT, x, z),
    },
  ]);
  const residencyOut: ResidencyDecision = { load: [], unload: [] };
  let residencyIn = 0;
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
      !!liftRide ||
      tbModal ||
      cam.framing ||
      !!learn?.busy ||
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
    const open =
      island === 'meridian'
        ? meridianTracker(quests()).tasks.find((t) => t.status === 'active')
        : island === 'thousand-bough'
          ? thousandBoughTracker(quests()).tasks.find((t) => t.status === 'active' && !t.optional)
          : questLog(quests()).find((q) => !q.done);
    void dialogue.say(
      'Wingman',
      open?.detail ? `Logbook says: ${open.detail}` : 'Nothing pressing, Captain. Enjoy the view.',
    );
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
    if (quests()['Q0.11'] === 'sail') setQuest('Q0.11', 'done');
    if (island === 'meridian' && quests()['Q1.5'] === 'helms') setRheaAboard(true);
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
  /** Where the compass sends you while sailing: the next island once this one's done, else home. */
  function sailTarget(): IslandBerth {
    // Once Meridian's Seal is won, the compass points on to Thousand-Bough (and home there after).
    if (tbReachable() && (island === 'thousand-bough' || quests()['Q1.8'] === 'done'))
      return ISLANDS['thousand-bough'];
    if (meridianReachable() && !currentQuest(quests())) return ISLANDS.meridian;
    return island === 'meridian' && meridianReachable() ? ISLANDS.meridian : ISLANDS.anchorage;
  }
  const meridianReachable = () => openIslands().some((b) => b.id === 'meridian');
  const tbReachable = () => openIslands().some((b) => b.id === 'thousand-bough');

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
    const landfall = firstLandfall();
    input.enabled = !landfall;
    if (landfall) startArrival(berth.arrival, false);
    audio?.music.setIsland(berth.music);
    crewAtHelm = false;
    setRheaAboard(false);
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
   * The compass, top centre: where the camera looks, and a gold marker on the current task ashore (the
   * nearest usable part of it) or on the pier while you're sailing. Hidden in conversations.
   */
  const compassDir = new Vector3();
  function updateCompass(): void {
    const ashore = mode === 'walk';
    const afloat = mode === 'sail' || mode === 'docking';
    // In a sea battle the battle's own HUD has the top of the screen.
    if (
      (!ashore && !afloat) ||
      (dialogue.active && !welcoming) ||
      scriptRunning ||
      anyTalking() ||
      battles.active ||
      tbModal
    ) {
      hud.setCompass(null);
      return;
    }
    camera.getWorldDirection(compassDir);
    let target: CompassTarget | null = null;
    if (ashore) {
      const goal =
        island === 'anchorage'
          ? questTarget(quests())
          : island === 'thousand-bough'
            ? thousandBoughTarget(quests())
            : meridianTarget(quests());
      const it = goal ? interactions.nearest(goal.ids, player.x, player.z) : null;
      if (goal && it) {
        const dx = it.x - player.x;
        const dz = it.z - player.z;
        const labels = (goal as { labels?: Readonly<Record<string, string>> }).labels;
        const label = labels?.[it.id] ?? goal.label;
        target = { bearing: bearingOf(dx, dz), label, distance: Math.hypot(dx, dz) };
      }
    } else {
      // A puzzle out on the water first (the Three Helms' next buoy or mark), else the berth you're
      // bound for once out past docking range (inside it, the dock prompt takes over).
      const mark = puzzles.map((p) => p.sailTarget?.() ?? null).find((m) => m !== null) ?? null;
      const goal = sailTarget();
      const to = mark ?? { x: goal.mooring.x, z: goal.mooring.z, label: goal.berthLabel };
      const dx = to.x - dyn.pose.x;
      const dz = to.z - dyn.pose.z;
      const distance = Math.hypot(dx, dz);
      if (mark || (!crewAtHelm && distance > DOCK_RANGE))
        target = { bearing: bearingOf(dx, dz), label: to.label, distance };
    }
    hud.setCompass(bearingOf(compassDir.x, compassDir.z), target);
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
    island === 'thousand-bough'
      ? quests()['Q2.1'] === 'done'
        ? []
        : firstWelcome('thousand-bough')
      : island === 'meridian'
        ? quests()['Q1.1'] === 'done'
          ? []
          : firstWelcome('meridian')
        : island !== 'anchorage'
          ? []
          : quests()['Q0.2'] === 'start'
            ? firstWelcome('anchorage')
            : [...(islandHooks('anchorage').welcomeBack ?? [])];
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
  async function playWelcome(lines: string[]): Promise<void> {
    // Thousand-Bough: Juno's first look at the great tree plays over the tree, framed from over the
    // captain's shoulder (the arrival's last hold), before Wingman flies up.
    const landing = islandHooks(island).landing ?? [];
    if (landing.length && lines[0] === landing[0] && mode === 'walk') {
      input.enabled = false;
      hero.setSpeed(0);
      cam.frame(THOUSAND_BOUGH.harbor.landingShot);
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
    const ready =
      here === 'anchorage' || (here === 'meridian' ? !!cove.meridian.town : !!cove.thousandBough.system);
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

  const listenerPos = { x: 0, y: 0, z: 0 };
  const listenerFwd = { x: 0, y: 0, z: -1 };

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
          if (meridianNpcs && nearMeridian()) meridianNpcs.update(dt, mode === 'walk' ? player : FAR);
          tb?.updateNpcs(dt, mode === 'walk' ? player : FAR, camera.position);
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
          if (meridianNpcs && nearMeridian()) meridianNpcs.update(dt, mode === 'walk' ? player : FAR);
          tb?.updateNpcs(dt, mode === 'walk' ? player : FAR, camera.position);
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
          if (s.menu && o.onMenu && !tbModal) return o.onMenu();
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
            else dock();
          } else if (cooldown <= 0 && mode === 'walk' && !tbModal) interactions.fire(s.run);
        }

        if (hintTimer > 0 && (hintTimer -= dt) <= 0 && !dialogue.active) void welcome();
        if (introCut && s.stirring) introCut();
        if (s.hint && (mode === 'walk' || mode === 'sail') && !dialogue.active && !scriptRunning && !tbModal)
          hint();

        gangwayDown = mode === 'walk' && shipDocked() && canBoard();
        // Meridian's mooring lines only run to the hull while she's tied up at the east arm.
        const moored = island === 'meridian' && mode !== 'sail' && mode !== 'docking' && shipDocked();
        if (moored !== mooredShown && cove.meridian.town) {
          mooredShown = moored;
          cove.meridian.town.setMooringLines(moored);
        }
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
          for (let i = 0; i < n; i++) player.step(h, { ...s, jump: s.jump && i === 0 }, cam.yaw, world, t);
          hero.group.position.set(player.x, player.y, player.z);
          hero.group.rotation.y = player.heading;
          const sp = player.speed;
          hero.setGrounding({
            mode: player.mode,
            verticalSpeed: player.vy,
            landed: player.landed,
            groundAt: (x, z) => world.groundAt(x, z),
          });
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
          hud.setPrompt(dialogue.active || anyTalking() || tbModal ? null : (focus?.label() ?? null));
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
          hud.setPrompt(act?.label ?? near?.dockLabel ?? null);
          windAt(pose.x, pose.z, t, windHere);
          const bow = windOnBow(pose.heading, windHere[0], windHere[1]);
          hud.updateSail(helm.trim, helm.rudder, Math.abs(dyn.forwardSpeed), bow);
          const stalled =
            mode === 'sail' && bow.point === 'in-irons' && helm.trim > 0.4 && Math.abs(dyn.forwardSpeed) < 1;
          ironsFor = stalled ? ironsFor + dt : 0;
          if (ironsFor > 5 && !ironsNudged && !dialogue.active) {
            ironsNudged = true;
            hud.toast(
              'We’re head to wind, so the sails can’t fill. Steer with A or D until the arrow’s off the bow.',
              6,
            );
          }
          tmp.set(pose.x, ship.group.position.y, pose.z);
          cam.update(dt, camera, s, tmp, pose.heading, Math.abs(dyn.forwardSpeed) > 0.5, world, t);
          // The light shifts with the passage (the sky only refreshes once the sun has really moved).
          if (meridianReachable()) {
            passageSky(pose.x, pose.z, sailSky);
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

        if (liftRide) updateLift(dt, s, t);
        updateResidency(dt, t);
        for (const site of meridianSites) site.update(dt, t);
        tb?.update(dt, t);
        updateCompass();
        // The task list and controls help step aside while a conversation or framed shot has the
        // screen, and come back a moment after (so they don't flicker between lines).
        // (Not during Wingman's welcome: he points them out, so they're up as he flies in.)
        const busy =
          !welcoming &&
          (mode === 'transition' ||
            mode === 'docking' ||
            crewAtHelm ||
            !!liftRide ||
            dialogue.active ||
            scriptRunning ||
            anyTalking() ||
            cam.framing ||
            tbModal);
        calmFor = busy ? CALM_HOLD : Math.max(0, calmFor - dt);
        const calm = calmFor > 0;
        if (calm !== calmShown) {
          calmShown = calm;
          hud.setCalm(calm);
          learn?.setCalm(calm);
        }
        hero.update(dt);
        if (rheaAboard?.group.parent) rheaAboard.update(dt);
        updateWingman(dt);
        if (cove.anchorage.shown) npcs.update(dt, mode === 'walk' ? player : { x: 1e6, y: 0, z: 1e6 });
        if (meridianNpcs && nearMeridian()) meridianNpcs.update(dt, mode === 'walk' ? player : FAR);
        tb?.updateNpcs(dt, mode === 'walk' ? player : FAR, camera.position);
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
    get meridianSetup() {
      return nextSetup.meridian.promise;
    },
    get thousandBoughSetup() {
      return nextSetup['thousand-bough'].promise;
    },
    onIslandSetup(fn) {
      setupListeners.add(fn);
      return () => setupListeners.delete(fn);
    },
    islandSetups() {
      const out: { id: StreamedIsland; setup: IslandSetup; gen: number }[] = [];
      for (const id of ['anchorage', 'meridian', 'thousand-bough'] as const) {
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
        ...(tb?.bottles() ?? []),
      ],
      thousandBough: () => tb?.debug ?? null,
      courseBoards: () =>
        (Object.keys(COURSE_BOARDS) as IslandId[]).map((id) => ({
          island: id,
          ...courseBoardSpot(COURSE_BOARDS[id]),
        })),
      puzzle: (id: string) => puzzles.find((p) => p.id === id)?.debug ?? null,
      liftSpots: () => {
        const a = cove.meridian.town?.anchors;
        const b = a?.liftBottom,
          t = a?.liftTop;
        return b && t
          ? { bottom: { x: b.x, z: b.z, h: b.heading }, top: { x: t.x, z: t.z, h: t.heading } }
          : null;
      },
      near: (x, z, r) => interactions.within(x, z, r),
      talk: (id) => {
        const n = [...npcs.list, ...(meridianNpcs?.list ?? []), ...(tb?.npcs ?? [])].find(
          (v) => v.spec.id === id,
        );
        if (!n || mode !== 'walk') return false;
        void talkTo(n);
        return true;
      },
      liftAnchors: () => ({
        liftBottom: cove.meridian.town?.anchors.liftBottom ?? null,
        liftTop: cove.meridian.town?.anchors.liftTop ?? null,
      }),
      liftCamera: () => liftCamera(),
      rheaAboard: () => !!rheaAboard?.group.parent,
      lighthouseLit: () => lighthouseLit,
      anchorageLighthouseLit: () => village.lighthouseLit(),
      lighthouseTransit: () => lighthouseTransit,
      cast: () =>
        [...(meridianNpcs?.list ?? []), ...(tb?.npcs ?? [])].map((n) => ({
          id: n.spec.id,
          name: n.spec.name,
          x: n.x,
          y: n.y,
          z: n.z,
          h: n.heading,
          ground: world.groundAt(n.x, n.z),
        })),
      quest: (id: string, step: string) => setQuest(id, step),
      sailTo(x, z, heading) {
        prefetchSailTarget();
        if (mode === 'sail') dyn.reset(x, z, heading);
      },
      gangway: () => ({ down: gangwayDown, foot: { ...plank.foot }, top: { ...plank.top } }),
      hint,
      welcome,
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
      meridianNpcs?.dispose();
      tb?.dispose();
      for (const site of meridianSites) {
        site.group.removeFromParent();
        site.dispose();
      }
      wingman?.dispose();
      rheaAboard?.group.removeFromParent();
      rheaAboard?.dispose();
      hero.group.removeFromParent();
      hero.dispose();
      clearCharacterLodView(hero.group);
      footstepPuffs.dispose();
      hud.dispose();
      releaseRemovedObjects(parkedContent, engine.scene);
    },
  };
}
