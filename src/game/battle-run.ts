import { Vector3, type PerspectiveCamera } from 'three/webgpu';
import type { IslesAudio } from '../audio';
import type { Engine } from '../engine/engine';
import type { InputState } from '../engine/input';
import { QUIZZES } from '../learn/content';
import type { ChoiceQuiz } from '../learn/types';
import { BATTLE_PLANS, Battle, type BattlePlan, type BattleSnapshot } from '../world/battle/battle';
import type { HeightField } from '../world/contracts';
import type { CoveScene } from '../world/cove-scene';
import { unreflected } from '../world/reflection';
import type { ShipDynamics } from '../world/ship';
import { skipSunShadows } from '../world/sky/cached-sun-shadow';
import { world } from '../world/uniforms';
import { BATTLE_SOUNDS, createBattleAudio } from './battle-audio';
import { BattleCamera } from './battle-camera';
import { BattleHud } from './battle-hud';
import type { CameraShot, FollowCamera } from './follow-camera';
import type { Helm } from './helm';

export interface BattleRunOptions {
  engine: Engine;
  cove: CoveScene;
  audio: IslesAudio | null;
  hudParent: HTMLElement;
  /** Index in `BATTLE_PLANS`. */
  plan: number;
  seed?: number;
  /** Open water at (x, z) (where raiders may come out of the fog). */
  openWater(x: number, z: number): boolean;
  /** The sea floor and islands the raiders sail over (they run aground on it). */
  ground?: HeightField | null;
  /** Once, when the battle is won or skipped. */
  onEnd(how: 'won' | 'skipped'): void;
  /** Once, when the first wave starts (after the briefing): the battle's chart label. */
  onStart?(): void;
}

/** The briefing shows before every battle until you tick "Don't show this again". */
const BRIEF_KEY = 'isles.battleBriefing.hidden';
/** After the win, the camera holds its turn round your ship this long (s) before it's yours again. */
const WON_HOLD = 9;
/** How far a stick or key must go before it moves between the question's choices. */
const NAV_EDGE = 0.6;

/**
 * A sea battle in the game (docs/specs/BATTLES.md): the lazily loaded part. It builds the battle
 * (raiders, fog, guns, splashes) when the passage's battle waits, warms every pipeline through the
 * game's late warm before the lookout calls sails, then runs the battle with its HUD, camera
 * director, sounds and music, on a battle clock that stops while the game is paused. `update` and
 * `steer` allocate nothing.
 */
export class BattleRun {
  readonly battle: Battle;
  readonly plan: BattlePlan;
  readonly hud: BattleHud;
  readonly director: BattleCamera;
  /** Resolves once everything the battle draws is built (before then it doesn't start). */
  readonly ready: Promise<void>;
  warmed = false;
  started = false;
  ended: 'won' | 'skipped' | null = null;
  /** The battle clock (s): it only runs while the battle is updated. */
  t = 0;
  private endedAt = 0;
  private hudAt = -1;
  private quizWave = -1;
  private musicInBattle = false;
  private navHeld = false;
  private wasDirecting = false;
  private readonly snap: BattleSnapshot = {
    phase: 'idle',
    wave: 0,
    waves: 0,
    hull: 1,
    raidersLeft: 0,
    raidersTotal: 0,
    bears: [false, false],
    breakOffs: 0,
    calm: false,
    doubleShot: false,
    stores: { timber: 0, powder: 0 },
    lull: 0,
    title: '',
    hint: '',
    hintTurn: 0,
    assist: false,
  };
  private readonly focusAt = { x: 0, z: 0 };
  private readonly look = { x: 0, y: 3, z: 0 };
  private readonly dcam = { x: 0, y: 0, z: 0 };
  private readonly dtarget = { x: 0, y: 0, z: 0 };
  private readonly shot: CameraShot = { x: 0, y: 0, z: 0, tx: 0, ty: 0, tz: 0 };
  private readonly listener = { x: 0, y: 0, z: 0 };
  private readonly lookDir = new Vector3();
  private disposed = false;
  /** Rested by `suspend` (you sailed into an island's waters), until `resume`. */
  private suspended = false;
  /** Lets the leaping fish and dolphins back into the sea (they stay out while the battle's on). */
  private unquiet: (() => void) | null = null;

  constructor(private readonly o: BattleRunOptions) {
    const { engine, cove, audio } = o;
    this.plan = BATTLE_PLANS[o.plan]!;
    this.hud = new BattleHud(o.hudParent, {
      fire: (which) => this.battle.fire(which),
      skip: () => this.skip(),
      answer: (pick) => this.battle.answer(pick),
      calm: (on) => this.battle.setCalm(on),
      assist: (on) => this.battle.setAssist(on),
    });
    this.hud.setWonText(this.plan.won);
    this.director = new BattleCamera(() => world.reducedMotion.value > 0.5);
    this.battle = new Battle({
      plan: this.plan.waves,
      tier: engine.tier,
      waves: cove.ocean.field,
      player: cove.ship,
      seed: o.seed ?? 0xba771e,
      onCaption: (text) => this.hud.caption(text),
      onSound: audio ? createBattleAudio(audio, this.listener) : undefined,
      onBeat: (beat, x, z) => this.director.beat(beat, x, z),
      openWater: o.openWater,
      ground: o.ground ?? null,
    });
    const group = this.battle.group;
    // The raiders draw like your ship: no sun-shadow shaders of their own.
    if (engine.tier.shadowCascades > 0) skipSunShadows(group);
    unreflected.add(group);
    engine.scene.add(group);
    if (audio) void audio.sfx.preload(BATTLE_SOUNDS);
    // The battle's music buffers while you sail out, so it starts on the lookout's call.
    audio?.music.prefetch('battle');
    // Built now and warmed while you sail out: its first real frames build nothing (skill §3).
    this.ready = engine.counters.excuse(this.warm());
  }

  private async warm(): Promise<void> {
    const restore = this.battle.stageWarm();
    try {
      await this.o.cove.warmLate([this.battle.group]);
    } finally {
      restore();
    }
    this.warmed = true;
  }

  /** True from the lookout's call until the battle is won or skipped (paused ones too). */
  get active(): boolean {
    return this.started && !this.ended;
  }

  /** The lookout calls sails: the briefing (until you've hidden it), then the first wave. */
  begin(): void {
    if (this.started) return;
    this.started = true;
    // A dolphin's splash looks like a ball's: nothing leaps while the battle's on (or its hulls sink),
    // only while it rests in harbour.
    this.unquiet = this.o.cove.quietSea.add({ x: 0, z: 0, r: Infinity, when: () => !this.suspended });
    this.setMusic(true);
    let hidden = false;
    try {
      hidden = localStorage.getItem(BRIEF_KEY) === '1';
    } catch {
      // Private mode: the briefing just shows each time.
    }
    if (hidden) {
      this.battle.start(this.t);
      this.o.onStart?.();
      return;
    }
    this.hud.showBriefing((hide) => {
      if (hide) {
        try {
          localStorage.setItem(BRIEF_KEY, '1');
        } catch {
          // Private mode.
        }
      }
      if (this.ended) return;
      this.battle.start(this.t);
      this.o.onStart?.();
    });
  }

  skip(): void {
    if (this.ended) return;
    this.battle.skip(this.t);
    this.finish('skipped');
  }

  /** You sailed into an island's waters: the raiders fall back into the fog (the wave is kept). */
  suspend(): void {
    if (this.battle.phase === 'idle') return;
    const was = this.battle.phase;
    this.battle.suspend(this.t);
    this.suspended = this.battle.phase !== was;
  }

  /** Back on open water after `suspend`. */
  resume(): void {
    if (!this.suspended) return;
    this.suspended = false;
    this.battle.resume(this.t);
  }

  /** Resting after you sailed out of the zone. */
  get resting(): boolean {
    return this.suspended;
  }

  private finish(how: 'won' | 'skipped'): void {
    this.ended = how;
    this.endedAt = this.t;
    this.setMusic(false);
    this.o.onEnd(how);
  }

  private setMusic(on: boolean): void {
    if (on === this.musicInBattle) return;
    this.musicInBattle = on;
    this.o.audio?.music.setIsland(on ? 'battle' : 'harbour');
  }

  /**
   * The helm while the battle runs: your helmsman's ("Bring her round"), or held while a question
   * waits (the helm keys move between its choices). True when it took the helm this frame.
   */
  steer(dt: number, s: InputState, helm: Helm, dyn: ShipDynamics): boolean {
    if (!this.active) return false;
    if (this.hud.choosing) {
      helm.update(dt, 0, 0, dyn);
      return true;
    }
    const b = this.battle;
    if (!b.assist) return false;
    // Any helm key takes the helm back from your helmsman.
    if (Math.abs(s.moveX) > 0.2 || Math.abs(s.moveY) > 0.2) {
      b.setAssist(false);
      return false;
    }
    helm.trim = b.assistHelm.trim;
    helm.rudder = b.assistHelm.rudder;
    dyn.setInput(b.assistHelm);
    return true;
  }

  /**
   * One frame of the battle: your orders (Fire, Z/C, R, and the question's choices), the battle
   * itself, the camera director (it holds the follow camera's shot while it frames the fight), the
   * listener, and the HUD at 10 Hz. Call before the follow camera updates.
   */
  update(dt: number, s: InputState, dyn: ShipDynamics, cam: FollowCamera, camera: PerspectiveCamera): void {
    if (this.disposed) return;
    this.t += dt;
    const t = this.t;
    const b = this.battle;
    if (this.started) {
      if (this.hud.choosing) {
        const y = s.moveY !== 0 ? s.moveY : -s.moveX;
        if (Math.abs(y) > NAV_EDGE) {
          if (!this.navHeld) this.hud.nav(y > 0 ? -1 : 1);
          this.navHeld = true;
        } else this.navHeld = false;
        if (s.interact) this.hud.press();
      } else if (!this.ended) {
        if (s.fire) b.fire('bearing');
        if (s.firePort) b.fire('port');
        if (s.fireStarboard) b.fire('starboard');
        if (s.assist) b.setAssist(!b.assist);
      }
    }
    // The ocean is drawn at the world's clock; the battle samples it there (its own clock differs).
    b.update(dt, t, world.time.value);

    // The director frames the battle's beats until you drag the view, and stands off after the win.
    const director = this.director;
    if (s.lookX !== 0 || s.lookY !== 0 || s.zoom !== 0) director.yieldToUser();
    if (this.ended === 'skipped' || (this.ended === 'won' && t - this.endedAt > WON_HOLD))
      director.enabled = false;
    const p = dyn.pose;
    if (!this.wasDirecting) {
      // Take over from wherever the follow camera is.
      this.dcam.x = camera.position.x;
      this.dcam.y = camera.position.y;
      this.dcam.z = camera.position.z;
      camera.getWorldDirection(this.lookDir);
      this.dtarget.x = camera.position.x + this.lookDir.x * 30;
      this.dtarget.y = camera.position.y + this.lookDir.y * 30;
      this.dtarget.z = camera.position.z + this.lookDir.z * 30;
    }
    director.setFocus(b.focus(this.focusAt), this.focusAt.x, this.focusAt.z);
    director.update(dt, t, p.x, p.z, p.heading, this.look, this.dcam, this.dtarget);
    const directing = this.started && director.directing && b.phase !== 'idle';
    if (directing) {
      const sh = this.shot;
      sh.x = this.dcam.x;
      sh.y = this.dcam.y;
      sh.z = this.dcam.z;
      sh.tx = this.dtarget.x;
      sh.ty = this.dtarget.y;
      sh.tz = this.dtarget.z;
      cam.frame(sh);
    } else if (this.wasDirecting) cam.frame(null);
    this.wasDirecting = directing;

    this.listener.x = camera.position.x;
    this.listener.y = camera.position.y;
    this.listener.z = camera.position.z;

    if (t - this.hudAt >= 0.1) {
      this.hudAt = t;
      const snap = b.snapshot(this.snap);
      // Each wave has its own question (the habit that wave stands for).
      if (snap.wave !== this.quizWave) {
        this.quizWave = snap.wave;
        const id = this.plan.waves[snap.wave]?.quiz ?? '';
        this.hud.setQuiz((QUIZZES.get(id) as ChoiceQuiz | undefined) ?? null);
      }
      const won = snap.phase === 'won';
      this.hud.show(
        this.started &&
          snap.phase !== 'idle' &&
          snap.phase !== 'skipped' &&
          !(won && t - this.endedAt > WON_HOLD),
      );
      this.hud.update(snap, b);
      if (won && !this.ended) this.finish('won');
    }
  }

  /** Whether the battle's done with: ended, and the struck hulls have gone under (s). */
  spent(after = 20): boolean {
    return !!this.ended && this.t - this.endedAt > (this.ended === 'skipped' ? 4 : after);
  }

  /** Call with the follow camera, which gets its own view back. */
  dispose(cam?: FollowCamera): void {
    if (this.disposed) return;
    if (this.wasDirecting) cam?.frame(null);
    this.disposed = true;
    this.unquiet?.();
    this.unquiet = null;
    const { engine, cove } = this.o;
    this.setMusic(false);
    engine.scene.remove(this.battle.group);
    unreflected.delete(this.battle.group);
    this.battle.dispose();
    this.hud.dispose();
    // Your ship comes out of it patched: no shot holes, scorch, or guns run in.
    cove.ship.clearScorch();
    cove.ship.uniforms.sailHoles.value = 0;
  }
}
