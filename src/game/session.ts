import { Vector3 } from 'three/webgpu';
import type { IslesAudio } from '../audio';
import type { FootstepSurface } from '../audio/soundscape/soundscape';
import type { Engine } from '../engine/engine';
import type { Input } from '../engine/input';
import type { Character, CharacterLibrary, PlayerBody } from '../world/characters';
import type { CoveScene } from '../world/cove-scene';
import { COVE } from '../world/layout';
import { CollisionWorld, type SurfaceKind, type WalkSurface } from './collision';
import { Dialogue } from './dialogue';
import { FootstepPuffs } from './footstep-puffs';
import { FollowCamera, SAIL_RIG, WALK_RIG } from './follow-camera';
import { Helm } from './helm';
import { Hud } from './hud';
import { Interactions } from './interaction';
import { COVE_NPCS, NpcCrowd, type Npc } from './npcs';
import { PlayerController } from './player-controller';
import type { LearnStore } from '../learn/store';
import { createChest, type TreasureChest } from './chest';
import { COVE_CHESTS, npcScript, questLog } from './cove-quests';
import { runScript, type ScriptStep } from './script';
import { defaultShipName } from '../learn/progress';
import { createBard } from './puzzles/bard';
import { createChristening } from './puzzles/christening';
import { createCrane } from './puzzles/crane';
import { createFirstWords } from './puzzles/first-words';
import { createGearCheck } from './puzzles/gear';
import { createPaintSails } from './puzzles/paint-sails';
import { createSluice } from './puzzles/sluice';
import type { HintTier, Puzzle, PuzzleHost, PuzzleTerminal } from './puzzles/types';

type SessionMode = 'walk' | 'sail' | 'docking' | 'transition';

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
  /** Freezes the player, helm, and HUD prompts while menus are open (the world keeps living). */
  setPaused(on: boolean): void;
  /** Fast travel: docks the ship if you're sailing, then puts you at (x, z). */
  travel(x: number, z: number, heading: number): Promise<void>;
  /** Player or ship position for the chart. */
  where(): { x: number; z: number; heading: number; onShip: boolean };
  /** Dev/test hooks. */
  readonly debug: {
    teleport(x: number, z: number, heading?: number): void;
    board(): Promise<void>;
    dock(): void;
    state(): Record<string, unknown>;
    /** Chest positions and facings (tests). */
    chests(): { id: string; x: number; z: number; h: number; opened: boolean }[];
    /** Where the Trial is taken (tests). */
    trialAt(): { x: number; z: number; heading: number } | null;
    /** The message bottles and whether each has been read (tests). */
    bottles(): { id: string; x: number; z: number; read: boolean }[];
    /** A puzzle's test hooks (state, solve, …) by id, e.g. 'P0.1'. */
    puzzle(id: string): Puzzle['debug'] | null;
    /** Presses Wingman's hint key. */
    hint(): void;
  };
  dispose(): void;
}

const WALK_HELP =
  '<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> move · <kbd>Shift</kbd> run · <kbd>Space</kbd> hop<br>' +
  'hold <kbd>RMB</kbd> look · wheel zoom · <kbd>E</kbd> interact';
const SAIL_HELP =
  '<kbd>W</kbd>/<kbd>S</kbd> raise / lower sails · <kbd>A</kbd>/<kbd>D</kbd> helm<br>' +
  'hold <kbd>RMB</kbd> look · wheel zoom · <kbd>E</kbd> dock at the pier';

/** The christening's shot of the port bow name board, in ship-local space (+x is the pier side). */
const CHRISTEN_EYE = new Vector3(-7.2, 4.4, 4.6);
const CHRISTEN_AT = new Vector3(-1.6, 2.4, 10.6);

const STEP_WALK = 0.78;
const STEP_RUN = 1.15;
const DOCK_RANGE = 38;
/** Seconds of visible assisted approach before the fade tidies the ship into the berth. */
const DOCK_ASSIST_MAX = 6;

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
  const world = new CollisionWorld({
    ground,
    waves: ocean.field,
    surfaces: [villageSurface, sitesSurface],
    circles: [...village.colliders.circles, ...sites.colliders.circles],
    boxes: [...village.colliders.boxes, ...sites.colliders.boxes],
  });

  const hud = new Hud(o.hudParent);
  await hud.loadSubtitles(o.voiceManifest ?? '/voice/testcove/manifest.json');
  hud.setHelp(WALK_HELP);
  const dialogue = new Dialogue(hud, audio);

  // Player: stepUp covers the 0.6 m quay-to-pier lip.
  const player = new PlayerController({ stepUp: 0.66 });
  const start = o.start ?? COVE.spawn;
  player.teleport(world, start.x, start.z, start.heading);
  const hero: Character = o.characters.create({ body: o.body, variant: o.variant ?? 0, tier });
  hero.group.position.set(player.x, player.y, player.z);
  hero.group.rotation.y = player.heading;
  engine.scene.add(hero.group);
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
  dyn.dockAssist(COVE.mooring);

  let mode: SessionMode = 'walk';
  let dockTime = 0;
  const interactions = new Interactions();
  const boardPoint = new Vector3();
  const tmp = new Vector3();

  // Quests (POC §4.4 slice): NPC scripts depend on quest state, saved with learning progress.
  const learn = o.learn ?? null;
  const quests = (): Record<string, string> => learn?.progress.data.quests ?? localQuests;
  const localQuests: Record<string, string> = {};
  const setQuest = (id: string, step: string) => {
    if (learn) learn.progress.setQuest(id, step);
    else localQuests[id] = step;
    learn?.setQuests(questLog(quests()));
  };
  if (!quests()['Q0.2']) setQuest('Q0.2', 'start');
  // Older saves: Nell's chest used to lead straight to Ezra (before Paint Your Sails), the crane
  // straight to the Trial (before Q0.8), First Words had no bard after it (before Q0.9), and the Trial
  // ended the island (before the christening).
  if (quests()['Q0.2'] === 'chest' && learn?.isChestOpen('C0.1')) setQuest('Q0.2', 'palette');
  if (quests()['Q0.7'] === 'done' && !quests()['Q0.8']) setQuest('Q0.8', 'start');
  if (quests()['Q0.8'] === 'done' && !quests()['Q0.9']) setQuest('Q0.9', 'start');
  if (quests()['Q0.10'] === 'done' && !quests()['Q0.11']) setQuest('Q0.11', 'start');
  learn?.setQuests(questLog(quests()));
  let scriptRunning = false;
  let disposed = false;
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
    npcs.setTalking(n, true);
    const beat = learn ? npcScript(n.spec.id, quests()) : null;
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
    npcs.setTalking(n, false);
  };
  for (const n of npcs.list) {
    if (!n.spec.voiced && !n.spec.barks && !npcScript(n.spec.id, quests())) continue;
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
      radius: 2.6,
      enabled: () => mode === 'walk' && !n.talking,
      onInteract: () => void talkTo(n),
    });
  }

  const shipDocked = () => Math.hypot(dyn.pose.x - COVE.mooring.x, dyn.pose.z - COVE.mooring.z) < 1.5;
  interactions.add({
    id: 'ship:board',
    label: () => 'Take the helm',
    get x() {
      return boardPoint.x;
    },
    get y() {
      return boardPoint.y;
    },
    get z() {
      return boardPoint.z;
    },
    radius: 3.4,
    enabled: () => mode === 'walk' && shipDocked(),
    onInteract: () => void board(),
  });

  // Treasure chests beside their NPCs; each grants a Logbook page once.
  const chests: { id: string; chest: TreasureChest; x: number; y: number; z: number }[] = [];
  for (const c of COVE_CHESTS) {
    const n = npcs.list.find((v) => v.spec.id === c.npc);
    if (!n) continue;
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
  }
  async function openChest(id: string, chest: TreasureChest): Promise<void> {
    input.enabled = false;
    audio?.sfx.oneShot('step_wood', chest.group.position, 1);
    await chest.open();
    await learn?.openChest(id);
    if (id === 'C0.1' && quests()['Q0.2'] === 'chest') {
      setQuest('Q0.2', 'palette');
      hud.toast('Quest updated: paint your sails at the palette stand by Nell’s door.', 4);
    }
    input.enabled = !paused;
  }

  // Message bottles on the beaches (B0.1-B0.3): optional troubleshooting pages.
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

  // The Harbormaster's Trial at the lighthouse door (POC §4.7): 8 questions, then the Seal.
  const trialAt = village.anchors.lighthouseDoor;
  if (trialAt) {
    interactions.add({
      id: 'trial:T0',
      label: () =>
        quests()['Q0.10'] === 'done' ? 'Retake the Harbormaster’s Trial' : 'Take the Harbormaster’s Trial',
      x: trialAt.x,
      y: trialAt.y,
      z: trialAt.z,
      radius: 3,
      enabled: () => mode === 'walk' && !!learn && !!quests()['Q0.10'] && !scriptRunning,
      onInteract: () => void takeTrial(),
    });
  }
  async function takeTrial(): Promise<void> {
    if (!learn) return;
    scriptRunning = true;
    input.enabled = false;
    await dialogue.say('Wingman', 'Eight questions, Captain. No answers from me in here, only nudges.');
    const out = await learn.runTrial('T0');
    if (out.passed) {
      setQuest('Q0.10', 'done');
      if (!quests()['Q0.11']) {
        setQuest('Q0.11', 'start');
        hud.toast('The lighthouse is lit. Nell’s waiting by your bow to christen your ship.', 5);
      } else hud.toast('The lighthouse is lit. Fast travel unlocked on the chart.', 4.5);
    }
    input.enabled = !paused;
    scriptRunning = false;
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
  const lyra = npcs.list.find((n) => n.spec.id === 'lyra');
  const puzzles: Puzzle[] = [
    createPaintSails(puzzleHost, sites.palette, ship),
    createBard(puzzleHost, sites.hammock, () => lyra?.talking ?? false),
    createSluice(puzzleHost, sites.mill),
    createCrane(puzzleHost, sites.crane),
    createGearCheck(puzzleHost, sites.gear),
    createFirstWords(puzzleHost, ship, () => shipDocked()),
    ...(christening ? [christening] : []),
  ];
  const hintPresses = new Map<string, { key: string; n: number }>();

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
    const open = questLog(quests()).find((q) => !q.done);
    void dialogue.say(
      'Wingman',
      open ? `Logbook says: ${open.detail}` : 'Nothing pressing, Captain. Enjoy the view.',
    );
  }

  async function board(): Promise<void> {
    if (mode !== 'walk') return;
    mode = 'transition';
    input.enabled = false;
    hud.setPrompt(null);
    await hud.fade(true);
    const a = ship.anchors.helm;
    ship.group.add(hero.group);
    hero.group.position.set(a.x, a.y, a.z);
    hero.group.rotation.set(0, a.heading, 0);
    hero.setSpeed(0);
    hero.play('helm');
    dyn.clearDockAssist();
    helm.reset();
    cam.setRig(SAIL_RIG, true);
    cam.snapBehind(dyn.pose.heading);
    hud.setSailing(true);
    hud.setHelp(SAIL_HELP);
    mode = 'sail';
    input.enabled = true;
    await hud.fade(false);
    hud.toast('Raise the sails with W. Steer with A and D.', 4);
    audio?.music.setIsland('harbour');
  }

  function dock(): void {
    if (mode !== 'sail') return;
    const d = Math.hypot(dyn.pose.x - COVE.mooring.x, dyn.pose.z - COVE.mooring.z);
    if (d > DOCK_RANGE) {
      hud.toast('Sail back to the pier to go ashore.', 3);
      return;
    }
    mode = 'docking';
    dockTime = 0;
    helm.reset();
    dyn.dockAssist(COVE.mooring);
    hud.toast('Bringing her alongside…', 3);
  }

  /** Moors the ship bow-out at the berth (only while the screen is black) and puts the hero on the pier. */
  async function disembark(): Promise<void> {
    mode = 'transition';
    input.enabled = false;
    await hud.fade(true);
    const m = COVE.mooring;
    dyn.reset(m.x, m.z, m.heading);
    dyn.dockAssist(m);
    engine.scene.add(hero.group);
    hero.group.rotation.set(0, 0, 0);
    hero.play('idle');
    const b = ship.anchors.boarding;
    const boardZ = m.z - Math.sin(m.heading) * b.x + Math.cos(m.heading) * b.z;
    player.teleport(world, pier.x + 0.9, boardZ, 0);
    cam.setRig(WALK_RIG, true);
    cam.snapBehind(0);
    hud.setSailing(false);
    hud.setHelp(WALK_HELP);
    mode = 'walk';
    input.enabled = true;
    await hud.fade(false);
    audio?.music.setIsland('anchorage');
  }

  // Footsteps and ship sounds.
  let stride = 0;
  let slapIn = 2;
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

  let anim: 'move' | 'wade' = 'move';
  let cooldown = 0;
  let paused = false;
  let resumedAt = 0;
  let hintTimer = o.quiet ? -1 : 2.2;
  const listenerPos = { x: 0, y: 0, z: 0 };
  const listenerFwd = { x: 0, y: 0, z: -1 };

  const remove = engine.add(
    {
      frame(dt, t) {
        const s = input.poll();
        if (paused) {
          hud.setPrompt(null);
          hero.update(dt);
          npcs.update(dt, mode === 'walk' ? player : { x: 1e6, y: 0, z: 1e6 });
          audio?.update(dt);
          return;
        }
        // A quiz, page, or Logbook owns input: freeze the walker (the world keeps living).
        if (learn?.busy) {
          hud.setPrompt(null);
          if (mode === 'walk')
            player.step(dt, { ...s, moveX: 0, moveY: 0, jump: false, run: false }, cam.yaw, world, t);
          hero.setSpeed(0);
          hero.update(dt);
          npcs.update(dt, mode === 'walk' ? player : { x: 1e6, y: 0, z: 1e6 });
          for (const c of chests) c.chest.update(dt, t);
          audio?.update(dt);
          resumedAt = performance.now();
          return;
        }
        // Menu keys: ignore the edge from the same key press that closed the menu.
        if (performance.now() - resumedAt > 200) {
          if (s.menu && o.onMenu) return o.onMenu();
          if (s.map && o.onChart) return o.onChart();
        }
        // A short cooldown after a conversation ends so mashing E to skip doesn't restart it.
        if (dialogue.active) cooldown = 0.45;
        else cooldown = Math.max(0, cooldown - dt);
        // The E that closed a quiz or page mustn't also skip the next line or re-open a chat.
        if (s.interact && performance.now() - resumedAt > 250) {
          if (dialogue.active) dialogue.next();
          else if (cooldown <= 0 && mode === 'sail') dock();
          else if (cooldown <= 0 && mode === 'walk') interactions.fire();
        }

        if (hintTimer > 0 && (hintTimer -= dt) <= 0 && !dialogue.active)
          void dialogue.play(['wingman.hint.01']);
        if (s.hint && mode === 'walk' && !dialogue.active && !scriptRunning) hint();

        ship.group.updateMatrixWorld();
        ship.group.localToWorld(
          boardPoint.set(ship.anchors.boarding.x, ship.anchors.boarding.y, ship.anchors.boarding.z),
        );

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
          hud.setPrompt(dialogue.active ? null : (focus?.label() ?? null));
          cam.update(dt, camera, s, player, player.heading, sp > 0.3, world, t);
        } else if (mode === 'sail' || mode === 'docking') {
          if (mode === 'sail') helm.update(dt, s.moveX, s.moveY, dyn);
          else if (dyn.dockComplete || (dockTime += dt) > DOCK_ASSIST_MAX) void disembark();
          const pose = dyn.pose;
          const near = Math.hypot(pose.x - COVE.mooring.x, pose.z - COVE.mooring.z) < DOCK_RANGE;
          hud.setPrompt(mode === 'sail' && near ? 'Dock at the pier' : null);
          hud.updateSail(helm.trim, helm.rudder, Math.abs(dyn.forwardSpeed));
          tmp.set(pose.x, ship.group.position.y, pose.z);
          cam.update(dt, camera, s, tmp, pose.heading, Math.abs(dyn.forwardSpeed) > 0.5, world, t);
          if (Math.abs(dyn.forwardSpeed) > 0.8 && (slapIn -= dt) <= 0) {
            slapIn = 1.4 + Math.random() * 2.2;
            audio?.sfx.oneShot('hull_slap', tmp, Math.min(1, 0.35 + Math.abs(dyn.forwardSpeed) / 9));
          }
        }

        hero.update(dt);
        npcs.update(dt, mode === 'walk' ? player : { x: 1e6, y: 0, z: 1e6 });
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

  async function travel(x: number, z: number, heading: number): Promise<void> {
    if (mode === 'transition') return;
    dialogue.cancel();
    if (mode === 'sail' || mode === 'docking') await disembark();
    player.teleport(world, x, z, heading);
    cam.snapBehind(heading);
  }

  return {
    get mode() {
      return mode;
    },
    setPaused(on) {
      paused = on;
      hud.setMenuOpen(on);
      input.enabled = !on && !dialogue.active;
      if (!on) resumedAt = performance.now();
      if (on) hero.setSpeed(0);
    },
    travel,
    where: () =>
      mode === 'walk' || mode === 'transition'
        ? { x: player.x, z: player.z, heading: player.heading, onShip: false }
        : { x: dyn.pose.x, z: dyn.pose.z, heading: dyn.pose.heading, onShip: true },
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
      trialAt: () => (trialAt ? { x: trialAt.x, z: trialAt.z, heading: trialAt.heading } : null),
      bottles: () =>
        Object.entries(bottleSpots).map(([id, p]) => ({
          id,
          x: p.x,
          z: p.z,
          read: !!learn?.isChestOpen(id),
        })),
      puzzle: (id: string) => puzzles.find((p) => p.id === id)?.debug ?? null,
      hint,
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
      hero.group.removeFromParent();
      hero.dispose();
      footstepPuffs.dispose();
      hud.dispose();
    },
  };
}
