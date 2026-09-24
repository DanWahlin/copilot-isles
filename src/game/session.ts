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
import { FollowCamera, SAIL_RIG, WALK_RIG } from './follow-camera';
import { Helm } from './helm';
import { Hud } from './hud';
import { Interactions } from './interaction';
import { COVE_NPCS, NpcCrowd, type Npc } from './npcs';
import { PlayerController } from './player-controller';

export type SessionMode = 'walk' | 'sail' | 'docking' | 'transition';

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
  };
  dispose(): void;
}

const WALK_HELP =
  '<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> move · <kbd>Shift</kbd> run · <kbd>Space</kbd> hop<br>' +
  'hold <kbd>RMB</kbd> look · wheel zoom · <kbd>E</kbd> interact';
const SAIL_HELP =
  '<kbd>W</kbd>/<kbd>S</kbd> raise / lower sails · <kbd>A</kbd>/<kbd>D</kbd> helm<br>' +
  'hold <kbd>RMB</kbd> look · wheel zoom · <kbd>E</kbd> dock at the pier';

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

  const pier = COVE.pier;
  const pierKind = (x: number, z: number): SurfaceKind =>
    Math.abs(x - pier.x) <= pier.width * 0.5 + 0.4 && z <= Math.max(pier.z0, pier.z1) + 0.8
      ? 'wood'
      : 'stone';
  const villageSurface: WalkSurface = { heightAt: village.walkable, kind: pierKind };
  const world = new CollisionWorld({
    ground: terrain.heightField,
    waves: ocean.field,
    surfaces: [villageSurface],
    circles: village.colliders.circles,
    boxes: village.colliders.boxes,
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

  const npcs = new NpcCrowd(o.characters, COVE_NPCS, village.anchors, world, tier, camera, {
    x: COVE.spawn.x,
    y: COVE.quay.height,
    z: COVE.spawn.z + 3,
    heading: 0,
  });
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

  // Talk to NPCs: Nell's conversation is voiced; everyone else offers a bark.
  const talkTo = async (n: Npc) => {
    if (dialogue.active) return;
    npcs.setTalking(n, true);
    if (n.spec.voiced) {
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
    if (!n.spec.voiced && !n.spec.barks) continue;
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
    audio?.music.setLayer('explore', true);
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
    audio?.music.setLayer('explore', false);
  }

  // Footsteps and ship sounds.
  let stride = 0;
  let slapIn = 2;
  const footstep = (kind: SurfaceKind): FootstepSurface => {
    if (kind === 'stone') return 'rock';
    if (kind === 'sand') return player.waterY - player.y > -0.18 ? 'wetsand' : 'sand';
    return kind;
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
        // Menu keys: ignore the edge from the same key press that closed the menu.
        if (performance.now() - resumedAt > 200) {
          if (s.menu && o.onMenu) return o.onMenu();
          if (s.map && o.onChart) return o.onChart();
        }
        // A short cooldown after a conversation ends so mashing E to skip doesn't restart it.
        if (dialogue.active) cooldown = 0.45;
        else cooldown = Math.max(0, cooldown - dt);
        if (s.interact) {
          if (dialogue.active) dialogue.next();
          else if (cooldown <= 0 && mode === 'sail') dock();
          else if (cooldown <= 0 && mode === 'walk') interactions.fire();
        }

        if (hintTimer > 0 && (hintTimer -= dt) <= 0 && !dialogue.active)
          void dialogue.play(['wingman.hint.01']);

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
          const wading = player.mode === 'wade' && sp > 0.15;
          if (wading && anim !== 'wade') hero.play('wade');
          else if (!wading && anim === 'wade') hero.play('idle');
          anim = wading ? 'wade' : 'move';
          if (!wading) hero.setSpeed(sp);

          if (player.mode !== 'air' && sp > 0.3) {
            stride += sp * dt;
            const len = sp > 3 ? STEP_RUN : STEP_WALK;
            if (stride > len) {
              stride -= len;
              audio?.sfx.footstep(footstep(player.surface), player);
            }
          }
          if (player.landed) audio?.sfx.footstep(footstep(player.surface), player);

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
      remove();
      dialogue.cancel();
      npcs.dispose();
      hero.group.removeFromParent();
      hero.dispose();
      hud.dispose();
    },
  };
}
