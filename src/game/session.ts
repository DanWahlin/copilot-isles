import { Vector3, type Group } from 'three/webgpu';
import type { IslesAudio } from '../audio';
import type { FootstepSurface } from '../audio/soundscape/soundscape';
import type { Engine } from '../engine/engine';
import type { Input } from '../engine/input';
import type { Character, CharacterLibrary, PlayerBody } from '../world/characters';
import { ParrotFlight, type FlightView } from '../world/characters/parrot-flight';
import type { CoveScene } from '../world/cove-scene';
import { COVE } from '../world/layout';
import { windOnBow } from '../world/ship/dynamics';
import { windAt } from '../world/wind';
import { CollisionWorld, type SurfaceKind, type WalkSurface } from './collision';
import { Dialogue } from './dialogue';
import { FootstepPuffs } from './footstep-puffs';
import { FollowCamera, SAIL_RIG, WALK_RIG, type CameraShot } from './follow-camera';
import { arrivalKeys, type IslandArrival, type IslandId } from './arrivals';
import { ISLANDS, islandAt, openIslands, passageSky, type IslandBerth } from './islands';

export { ISLANDS, islandAt } from './islands';
import { meridianQuayHeight } from '../world/islands/meridian';
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
import {
  MERIDIAN_WELCOME,
  meridianLog,
  meridianNpcScript,
  meridianTarget,
  meridianTracker,
} from './meridian-quests';
import { MERIDIAN_NPCS, meridianExtras } from './meridian-npcs';
import { createCrateYard } from './puzzles/crate-yard';
import { createCrateYardSite } from '../world/sites/crate-yard';
import { createThreeHelms, type HelmsHost } from './puzzles/three-helms';
import { createHelmBuoys } from '../world/sites/helm-buoys';
import { loadVillageKit } from '../world/village';
import { MERIDIAN_YARD } from '../world/sites/crate-yard-logic';
import { plankProgress, plankSurface, type PlankSpan } from './gangway';
import { runScript, type ScriptStep } from './script';
import { defaultShipName } from '../learn/progress';
import { createBard } from './puzzles/bard';
import { createChristening } from './puzzles/christening';
import { createCrane } from './puzzles/crane';
import { createFirstWords } from './puzzles/first-words';
import { createGearRack } from './puzzles/gear-rack';
import { createPaintSails } from './puzzles/paint-sails';
import { createSluice } from './puzzles/sluice';
import type { HintTier, Puzzle, PuzzleHost, PuzzleTerminal, SailAction } from './puzzles/types';

type SessionMode = 'walk' | 'sail' | 'docking' | 'transition';
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
  /** Where to start (Continue); defaults to the quay spawn. */
  start?: { x: number; z: number; heading: number };
  /** Esc / Start and M / Back while playing. */
  onMenu?: () => void;
  onChart?: () => void;
  /** Quizzes, spyglass, chests, and the Logbook (the session freezes while one is open). */
  learn?: LearnStore | null;
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
  /**
   * Loading: steps the camera along a pending flyover, calling `step` at each view (render a frame,
   * compile), so everything it'll see is built behind the loading card rather than mid-flight.
   */
  warmArrival(step: () => Promise<void>): Promise<void>;
  /** Fast travel: docks the ship if you're sailing, then puts you at (x, z). */
  travel(x: number, z: number, heading: number): Promise<void>;
  /** An open island's quay by the berth (the chart's "Travel here"), or null if it isn't open. */
  islandQuay(id: string): { x: number; z: number; heading: number; label: string } | null;
  /** Player or ship position for the chart and saves, and the island's name. */
  where(): { x: number; z: number; heading: number; onShip: boolean; place: string };
  /** Dev/test hooks. */
  readonly debug: {
    teleport(x: number, z: number, heading?: number): void;
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
    /** Interactions within `r` metres of (x, z) and whether each is usable now (tests). */
    near(x: number, z: number, r: number): { id: string; y: number; d: number; on: boolean }[];
    /** The lift's raw anchors (tests: tx/ty/tz are the car's ends). */
    liftAnchors(): { liftBottom: unknown; liftTop: unknown };
    /** The lift ride's camera spot and how many of its samples are blocked (tests). */
    liftCamera(): { x: number; y: number; z: number; blocked: number } | null;
    /** Whether Rhea's aboard for the Three Helms, and whether the lighthouse is lit (tests). */
    rheaAboard(): boolean;
    lighthouseLit(): boolean;
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
    /** Presses Wingman's hint key. */
    hint(): void;
    /** Plays Wingman's welcome (the flight and his lines). */
    welcome(): Promise<void>;
    /** Wingman's flight phase and position (tests). */
    wingman(): { phase: string; x: number; y: number; z: number } | null;
    /** The arrival flyover's phase and seconds in (tests). */
    arrival(): { island: string; phase: ArrivalPhase; time: number; eye: number } | null;
    /** Plays an island's arrival flyover again (tests, screenshots). */
    flyover(island?: IslandId): void;
    /** Holds the flyover at `time` seconds in (null lets it fly on). */
    holdArrival(time: number | null): void;
    /** Skips the arrival flyover, as E would. */
    skipArrival(): void;
  };
  dispose(): void;
}

const WALK_HELP =
  '<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> move · <kbd>Shift</kbd> run · <kbd>Space</kbd> hop<br>' +
  'hold <kbd>RMB</kbd> look · wheel zoom · <kbd>E</kbd> interact';
const SAIL_HELP =
  '<kbd>W</kbd>/<kbd>S</kbd> raise / lower sails · <kbd>A</kbd>/<kbd>D</kbd> helm<br>' +
  'hold <kbd>RMB</kbd> look · wheel zoom · <kbd>E</kbd> dock when you’re near a berth';

/** The christening's shot of the port bow name board, in ship-local space (+x is the pier side). */
const CHRISTEN_EYE = new Vector3(-7.2, 4.4, 4.6);
const CHRISTEN_AT = new Vector3(-1.6, 2.4, 10.6);

/** How long Wingman's framed welcome holds before moving can cut it short. */
const INTRO_HOLD_MS = 1600;
/** With reduced motion there's no flight: the title card holds over the captain this long. */
const ARRIVAL_CARD_ONLY = 3.4;
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

  const pier = COVE.pier;
  const pierKind = (x: number, z: number): SurfaceKind =>
    Math.abs(x - pier.x) <= pier.width * 0.5 + 0.4 && z <= Math.max(pier.z0, pier.z1) + 0.8
      ? 'wood'
      : 'stone';
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
      plankSurface(plank, () => gangwayDown),
    ],
    circles: [...village.colliders.circles, ...sites.colliders.circles],
    boxes: [...village.colliders.boxes, ...sites.colliders.boxes],
  });

  const hud = new Hud(o.hudParent);
  await hud.loadSubtitles(o.voiceManifest ?? '/voice/testcove/manifest.json');
  hud.setHelp(WALK_HELP);
  let facialSpeaker: Character | null = null;
  let lineFace: Character | null = null;
  // Each voiced line moves the face of whoever says it: Pim and Pol share scenes, and Rhea talks
  // aboard. The nearest islander with that name wins (Lyra plays on two islands).
  const speakerFace = (speaker: string): Character | null => {
    let best: Character | null = null;
    let bestD = Infinity;
    for (const n of [...npcs.list, ...(meridianNpcs?.list ?? [])]) {
      if (!n.spec.name.split(' ').includes(speaker)) continue;
      const d = (n.x - player.x) ** 2 + (n.z - player.z) ** 2;
      if (d < bestD) [best, bestD] = [n.character, d];
    }
    if (speaker === 'Rhea' && rheaAboard?.group.parent) return rheaAboard;
    return best;
  };
  const dialogue = new Dialogue(hud, audio, (line) => {
    const face = line ? (speakerFace(line.speaker) ?? facialSpeaker) : null;
    if (lineFace && lineFace !== face) lineFace.speak(null);
    lineFace = face;
    face?.speak(line);
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

  const npcs = new NpcCrowd(
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
  );
  for (const n of npcs.list) engine.scene.add(n.character.group);

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
    publishQuests();
  };
  const publishQuests = () =>
    learn?.setQuests([...questLog(quests()), ...meridianLog(quests())], trackerHere());
  /** The task list for the island you're on (Anchorage's points on to Meridian once it's open). */
  const trackerHere = () => {
    if (island === 'meridian') return meridianTracker(quests());
    const t = questTracker(quests());
    return openIslands().some((b) => b.id === 'meridian')
      ? { ...t, next: 'Port Meridian’s next. Board your ship and follow the compass north-east.' }
      : t;
  };
  if (!quests()['Q0.2']) setQuest('Q0.2', 'start');
  migrateQuests(quests(), setQuest);
  publishQuests();
  let scriptRunning = false;
  let disposed = false;
  let meridianTownCollidersAdded = false;
  const addMeridianTownColliders = (town: CoveScene['meridian']['town']) => {
    if (!town || disposed || meridianTownCollidersAdded) return;
    for (const c of town.colliders.circles) world.addCircle(c);
    for (const b of town.colliders.boxes) world.addBox(b);
    meridianTownCollidersAdded = true;
  };
  addMeridianTownColliders(cove.meridian.town);
  void cove.meridian.townReady.then(addMeridianTownColliders);
  // World beats a script can wait on (`{ cue }` steps), registered by the puzzles below.
  const cues = new Map<string, () => Promise<void>>();
  const scriptExtras = {
    onCue: (cue: string) => cues.get(cue)?.(),
    format: (text: string) =>
      text
        .replaceAll('{ship}', learn?.progress.shipName ?? defaultShipName(null))
        .replaceAll('{captain}', learn?.progress.data.captainName ?? 'Captain'),
  };

  // Talk to NPCs: quest beats run as scripts; Nell's lines are voiced; everyone else offers a bark.
  const talkTo = async (n: Npc) => {
    if (dialogue.active || scriptRunning) return;
    const originalPlayer = { x: player.x, z: player.z, heading: player.heading };
    const originalInputEnabled = input.enabled;
    if (n.spec.talkShot?.standLocal) {
      const stand = localNpcPoint(n, n.spec.talkShot.standLocal);
      placePlayer(stand.x, stand.z, Math.atan2(n.x - stand.x, n.z - stand.z));
      input.enabled = false;
    }
    const shot = npcTalkShot(n);
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
      } else if (n.spec.barks?.length) {
        const i = Math.floor(Math.random() * n.spec.barks.length);
        hud.showText(n.spec.name, n.spec.barks[i]!, 4.5);
        await new Promise((r) => setTimeout(r, 2600));
      }
    } finally {
      facialSpeaker?.speak(null);
      facialSpeaker = null;
      lineFace?.speak(null);
      lineFace = null;
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
    return meridianIds.has(n.spec.id)
      ? meridianNpcScript(n.spec.id, quests())
      : npcScript(n.spec.id, quests());
  }
  /** The camera shot of the conversation that's on (so a tour can come back to it). */
  let talkShot: CameraShot | null = null;
  const addNpcTalk = (n: Npc) => {
    if (!n.spec.voiced && !n.spec.barks && !scriptFor(n)) return;
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

  // Treasure chests beside their NPCs; each grants a Logbook page once.
  const chests: { id: string; chest: TreasureChest; x: number; y: number; z: number }[] = [];
  const placeChest = (c: { id: string; side: number; back: number }, n: Npc) => {
    const s = Math.sin(n.heading);
    const co = Math.cos(n.heading);
    // NPC-right (for a character facing +heading) is (-cos, +sin) in xz.
    const x = n.home.x + s * (n.spec.out ?? 0) - co * c.side - s * c.back;
    const z = n.home.z + co * (n.spec.out ?? 0) + s * c.side - co * c.back;
    const y = world.surfaceHeightAt(x, z) ?? world.groundAt(x, z);
    const chest = createChest();
    chest.group.position.set(x, y, z);
    chest.group.rotation.y = n.heading;
    if (learn?.isChestOpen(c.id)) chest.setOpen();
    engine.scene.add(chest.group);
    world.addCircle({ x, z, r: 0.55 });
    chests.push({ id: c.id, chest, x, y, z });
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
  };
  for (const c of COVE_CHESTS) {
    const n = npcs.list.find((v) => v.spec.id === c.npc);
    if (n) placeChest(c, n);
  }
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
  const christening = nell
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
  const gearRack = createGearRack(puzzleHost, sites.gear);
  cues.set('gear-checks', async () => gearRack.cue());
  const lyra = npcs.list.find((n) => n.spec.id === 'lyra');
  const puzzles: Puzzle[] = [
    createPaintSails(puzzleHost, sites.palette, ship),
    createBard(puzzleHost, sites.hammock, () => lyra?.talking ?? false),
    createSluice(puzzleHost, sites.mill),
    createCrane(puzzleHost, sites.crane),
    gearRack,
    createFirstWords(puzzleHost, ship, () => island === 'anchorage' && shipDocked()),
    ...(christening ? [christening] : []),
  ];
  const hintPresses = new Map<string, { key: string; n: number }>();

  // ---- Port Meridian (Chapter 01): its cast, sites and set pieces arrive with the town ----
  let meridianNpcs: NpcCrowd | null = null;
  const FAR = { x: 1e6, y: 0, z: 1e6 };
  const anyTalking = () =>
    npcs.list.some((n) => n.talking) || (meridianNpcs?.list.some((n) => n.talking) ?? false);
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
    for (const n of [...npcs.list, ...(meridianNpcs?.list ?? [])])
      if (!n.talking && Math.hypot(n.x - player.x, n.z - player.z) < 45) n.character.greet();
    audio?.sfx.oneShot('crowd_cheer_small', player, 0.8);
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
    audio?.sfx.oneShot('crowd_cheer_small', player, 0.8);
    await new Promise((r) => setTimeout(r, 2600));
    await hud.fade(true, 260);
    if (talkShot) cam.cut(talkShot);
    await hud.fade(false, 260);
  });

  const setupMeridian = async (town: CoveScene['meridian']['town']) => {
    if (!town || disposed || meridianNpcs) return;
    const cast = [...MERIDIAN_NPCS, ...meridianExtras(town.anchors)];
    meridianNpcs = new NpcCrowd(o.characters, cast, town.anchors, world, tier, camera, {
      ...town.anchors.promenade!,
    });
    for (const n of meridianNpcs.list) {
      engine.scene.add(n.character.group);
      addNpcTalk(n);
    }
    for (const c of MERIDIAN_CHESTS) {
      const n = meridianNpcs.list.find((v) => v.spec.id === c.npc);
      if (n) placeChest(c, n);
    }
    if (quests()['Q1.8'] === 'done') {
      town.setLighthouseLit(true);
      lighthouseLit = true;
    }
    // The lift, from the top of the east arm to the citadel bluff.
    for (const [id, up] of [
      ['liftBottom', true],
      ['liftTop', false],
    ] as const) {
      const a = town.anchors[id];
      if (!a) continue;
      interactions.add({
        id: up ? 'lift:bottom' : 'lift:top',
        label: () => (up ? 'Ride the lift up' : 'Ride the lift down'),
        x: a.x,
        y: a.y,
        z: a.z,
        radius: 2.6,
        enabled: () => mode === 'walk' && !scriptRunning && !liftRide,
        onInteract: () => rideLift(up),
      });
    }
    // P1.1 The Crate Yard on the shipyard apron, and P1.2 The Three Helms out in the bay.
    const kit = await loadVillageKit();
    if (disposed) return;
    const yardAt = town.anchors.crateYard;
    if (yardAt) {
      const site = createCrateYardSite({ tier, kit, origin: yardAt, layout: MERIDIAN_YARD });
      engine.scene.add(site.group);
      for (const c of site.colliders.circles) world.addCircle(c);
      for (const b of site.colliders.boxes) world.addBox(b);
      for (const c of site.crateCircles) world.addDynamic(c);
      meridianSites.push(site);
      puzzles.push(createCrateYard(puzzleHost, site));
    }
    const buoys = createHelmBuoys({ kit, waves: ocean.field });
    engine.scene.add(buoys.group);
    meridianSites.push(buoys);
    puzzles.push(createThreeHelms(helmsHost, buoys));
    await engine.renderer.compileAsync(engine.scene, camera);
  };
  void cove.meridian.townReady.then(setupMeridian);

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
        : questLog(quests()).find((q) => !q.done);
    void dialogue.say(
      'Wingman',
      open?.detail ? `Logbook says: ${open.detail}` : 'Nothing pressing, Captain. Enjoy the view.',
    );
  }

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
    const targetY = n.y + (seated ? 0.82 : 1.18);
    const eyeLift = n.spec.talkEyeLift ?? (seated ? 1.25 : 1.45);
    const target = { x: n.x, y: targetY, z: n.z };
    const candidates: CameraShot[] = [
      {
        x: player.x + fx * 0.72 + rightX * 1.65,
        y: Math.max(player.y + eyeLift, targetY + 0.18),
        z: player.z + fz * 0.72 + rightZ * 1.65,
        tx: target.x,
        ty: target.y,
        tz: target.z,
      },
      {
        x: player.x + fx * 0.72 - rightX * 1.65,
        y: Math.max(player.y + eyeLift, targetY + 0.18),
        z: player.z + fz * 0.72 - rightZ * 1.65,
        tx: target.x,
        ty: target.y,
        tz: target.z,
      },
      {
        x: n.x + fx * 2.75 + rightX * 1.35,
        y: Math.max(n.y + eyeLift, targetY + 0.28),
        z: n.z + fz * 2.75 + rightZ * 1.35,
        tx: target.x,
        ty: target.y,
        tz: target.z,
      },
      {
        x: n.x + fx * 2.75 - rightX * 1.35,
        y: Math.max(n.y + eyeLift, targetY + 0.28),
        z: n.z + fz * 2.75 - rightZ * 1.35,
        tx: target.x,
        ty: target.y,
        tz: target.z,
      },
    ].map((candidate) => ({
      ...candidate,
      y: Math.max(
        candidate.y,
        world.waterAt(candidate.x, candidate.z, 0) + 0.7,
        world.groundAt(candidate.x, candidate.z) + 0.45,
      ),
    }));
    const first = candidates.find((candidate) => validTalkShot(candidate, target));
    if (first) return first;
    // Boxed in (a stage, a fountain, a wall behind you): look for a clear two-shot all round them.
    const toPlayer = Math.atan2(fx, fz);
    for (const dist of [3.2, 4.4, 2.4])
      for (const turn of [0.6, -0.6, 1.2, -1.2, 0, 1.9, -1.9, Math.PI]) {
        const a = toPlayer + turn;
        const x = n.x + Math.sin(a) * dist,
          z = n.z + Math.cos(a) * dist;
        const shot: CameraShot = {
          x,
          y: Math.max(n.y + eyeLift + 0.3, world.groundAt(x, z) + 1.4, world.waterAt(x, z, 0) + 0.8),
          z,
          tx: target.x,
          ty: target.y,
          tz: target.z,
        };
        if (validTalkShot(shot, target)) return shot;
      }
    return candidates[0]!;
  }

  function validTalkShot(shot: CameraShot, target: { x: number; y: number; z: number }): boolean {
    if (Math.hypot(shot.x - player.x, shot.y - (player.y + 1.5), shot.z - player.z) < 0.7) return false;
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

  async function board(): Promise<void> {
    if (mode !== 'walk') return;
    mode = 'transition';
    input.enabled = false;
    hud.setPrompt(null);
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
    if (meridianReachable() && !currentQuest(quests())) return ISLANDS.meridian;
    return island === 'meridian' && meridianReachable() ? ISLANDS.meridian : ISLANDS.anchorage;
  }
  const meridianReachable = () => openIslands().some((b) => b.id === 'meridian');

  function dock(): void {
    if (mode !== 'sail' || crewAtHelm) return;
    const to = berthInRange();
    if (!to) {
      hud.toast(`Sail to ${sailTarget().berthLabel} to go ashore.`, 3);
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
    if ((!ashore && !afloat) || dialogue.active || scriptRunning || anyTalking()) {
      hud.setCompass(null);
      return;
    }
    camera.getWorldDirection(compassDir);
    let target: CompassTarget | null = null;
    if (ashore) {
      const goal = island === 'anchorage' ? questTarget(quests()) : meridianTarget(quests());
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
  const welcomeLines = (): string[] =>
    island === 'meridian'
      ? quests()['Q1.1'] === 'done'
        ? []
        : [...MERIDIAN_WELCOME]
      : island !== 'anchorage'
        ? []
        : quests()['Q0.2'] === 'start'
          ? [
              'wingman.welcome.01',
              'wingman.welcome.02',
              'wingman.welcome.03',
              'wingman.welcome.04',
              'wingman.welcome.05',
            ]
          : ['wingman.welcome.back'];
  /**
   * Wingman flies up in front of the captain to talk, and heads back to the shoulder on his last
   * line. The first time, the captain holds still and the camera frames him over their shoulder;
   * moving (after a moment to see who's talking) sends him back early while he keeps talking.
   */
  async function welcome(): Promise<void> {
    const lines = welcomeLines();
    if (!lines.length) return;
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
    await new Promise((r) => setTimeout(r, wingman ? 350 : 0));
    if (disposed) return;
    const last = lines.length > 1 ? lines[lines.length - 1] : null;
    await dialogue.play(lines, (id) => {
      if (id !== last) return;
      wingman?.land();
      release();
    });
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
    const cardEnd = a.path ? plan.cardAt + plan.cardFor : ARRIVAL_CARD_ONLY - 0.4;
    const showCard = a.time >= cardAt && a.time < cardEnd;
    if (showCard !== a.card) {
      a.card = showCard;
      hud.showCard(showCard ? plan.card : null);
    }
    if (a.time > ARRIVAL_SKIP_AFTER && (s.interact || s.stirring || s.jump || s.map)) {
      void endArrival('skipped');
      return;
    }
    if (!a.path) {
      if (a.time >= ARRIVAL_CARD_ONLY) void endArrival('landed');
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
  else if (firstLandfall()) startArrival(berth.arrival, true);

  const listenerPos = { x: 0, y: 0, z: 0 };
  const listenerFwd = { x: 0, y: 0, z: -1 };

  const remove = engine.add(
    {
      frame(dt, t) {
        const s = input.poll();
        if (paused) {
          hud.setPrompt(null);
          hero.update(dt);
          updateWingman(dt);
          npcs.update(dt, mode === 'walk' ? player : { x: 1e6, y: 0, z: 1e6 });
          if (meridianNpcs && nearMeridian()) meridianNpcs.update(dt, mode === 'walk' ? player : FAR);
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
          npcs.update(dt, mode === 'walk' ? player : { x: 1e6, y: 0, z: 1e6 });
          if (meridianNpcs && nearMeridian()) meridianNpcs.update(dt, mode === 'walk' ? player : FAR);
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
          if (s.menu && o.onMenu) return o.onMenu();
          if (s.map && o.onChart && !arriving) return o.onChart();
        }
        // A short cooldown after a conversation ends so mashing E to skip doesn't restart it.
        if (dialogue.active) cooldown = 0.45;
        else cooldown = Math.max(0, cooldown - dt);
        // The E that closed a quiz or page mustn't also skip the next line or re-open a chat.
        if (s.interact && !arriving && performance.now() - resumedAt > 250) {
          if (dialogue.active) dialogue.next();
          else if (cooldown <= 0 && mode === 'sail') {
            const act = sailAction();
            if (act) act.fire();
            else dock();
          } else if (cooldown <= 0 && mode === 'walk') interactions.fire();
        }

        if (hintTimer > 0 && (hintTimer -= dt) <= 0 && !dialogue.active) void welcome();
        if (introCut && s.stirring) introCut();
        if (s.hint && (mode === 'walk' || mode === 'sail') && !dialogue.active && !scriptRunning) hint();

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
          hud.setPrompt(dialogue.active || anyTalking() ? null : (focus?.label() ?? null));
          cam.update(dt, camera, s, player, player.heading, sp > 0.3, world, t);
          // Up the plank to the rail, and she's yours: over the side to the helm.
          if (gangwayDown && !dialogue.active && !scriptRunning) {
            const along = plankProgress(plank, player.x, player.z);
            if (along !== null && along > 0.8) void board();
          }
        } else if (mode === 'sail' || mode === 'docking') {
          if (mode === 'sail' && !crewAtHelm) helm.update(dt, s.moveX, s.moveY, dyn);
          else if (mode === 'docking' && (dyn.dockComplete || (dockTime += dt) > DOCK_ASSIST_MAX))
            void disembark();
          const pose = dyn.pose;
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
        for (const site of meridianSites) site.update(dt, t);
        updateCompass();
        // The task list and controls help step aside while a conversation or framed shot has the
        // screen, and come back a moment after (so they don't flicker between lines).
        const busy =
          mode === 'transition' ||
          mode === 'docking' ||
          crewAtHelm ||
          !!liftRide ||
          dialogue.active ||
          scriptRunning ||
          anyTalking() ||
          cam.framing;
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
        npcs.update(dt, mode === 'walk' ? player : { x: 1e6, y: 0, z: 1e6 });
        if (meridianNpcs && nearMeridian()) meridianNpcs.update(dt, mode === 'walk' ? player : FAR);
        footstepPuffs.update(dt);
        for (const c of chests) c.chest.update(dt, t);
        for (const p of puzzles) p.update(dt, t);
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
      view(0);
      await step();
    },
    travel,
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
      teleport(x, z, heading = player.heading) {
        player.teleport(world, x, z, heading);
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
      bottles: () =>
        Object.entries(bottleSpots).map(([id, p]) => ({
          id,
          x: p.x,
          z: p.z,
          read: !!learn?.isChestOpen(id),
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
        const n = [...npcs.list, ...(meridianNpcs?.list ?? [])].find((v) => v.spec.id === id);
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
      cast: () =>
        (meridianNpcs?.list ?? []).map((n) => ({
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
      flyover(id: IslandId = island) {
        if (mode !== 'walk') return;
        startArrival(ISLANDS[id].arrival, false);
      },
      holdArrival(time: number | null) {
        arrivalHold = time;
      },
      skipArrival() {
        if (arrival && arrival.phase !== 'done') void endArrival('skipped');
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
      learn?.reset();
      for (const p of puzzles) p.dispose();
      for (const c of chests) c.chest.dispose();
      remove();
      dialogue.cancel();
      npcs.dispose();
      meridianNpcs?.dispose();
      for (const site of meridianSites) {
        site.group.removeFromParent();
        site.dispose();
      }
      wingman?.dispose();
      rheaAboard?.group.removeFromParent();
      rheaAboard?.dispose();
      hero.group.removeFromParent();
      hero.dispose();
      footstepPuffs.dispose();
      hud.dispose();
    },
  };
}
