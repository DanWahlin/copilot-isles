import { Group, Matrix4, Vector3, type Camera, type Material, type Mesh, type Object3D } from 'three/webgpu';
import type { TierSettings } from '../../engine/quality';
import { clamp01, mulberry32 } from '../../util/math';
import type { BattleSound } from '../battle/battle';
import { SplashPool, SplinterPool, fxBudget } from '../battle/fx';
import type { WaveSampler } from '../contracts';
import { createBrigantine, type Brigantine, type BrigantineEnv } from '../ship';
import { BRIGANTINE_MASTS } from '../ship/brigantine-rig';
import { deckHeightAt, halfBeamAt, sheerHeightAt } from '../ship/lines';
import { Kraken, type KrakenArm } from './kraken';
import { cutShip, type ShipPieces } from './ship-break';

/** The scene's beats (s). The reduced-motion version is shorter and gentler. */
interface Beats {
  rise: number;
  reach: number;
  coil: number;
  squeeze: number;
  break: number;
  sink: number;
  release: number;
  retreat: number;
  end: number;
}

const FULL: Beats = {
  rise: 2,
  reach: 7.5,
  coil: 10.5,
  squeeze: 14,
  break: 18,
  sink: 22.5,
  release: 26,
  retreat: 28,
  end: 35,
};
const GENTLE: Beats = {
  rise: 1,
  reach: 5,
  coil: 7.5,
  squeeze: 10,
  break: 12.5,
  sink: 15.5,
  release: 18.5,
  retreat: 20,
  end: 26,
};

export type KrakenPhase =
  'calm' | 'rise' | 'reach' | 'coil' | 'squeeze' | 'break' | 'apart' | 'sink' | 'retreat' | 'done';

/** What each reaching arm holds: the hull's waist, the foremast, or the hull aft. */
type Role = 'hull' | 'mast' | 'stern';

interface Wrapper {
  arm: KrakenArm;
  role: Role;
  /** Seconds after the reach beat this arm starts. */
  delay: number;
  /** Which piece it holds after the break. */
  piece: number;
}

/** The ship's cuts (ship-local z): between the fore and main masts, and between the main and mizzen. */
const CUTS = [-4.8, 1.8] as const;
const HULL_Z = 0.25;
/** Each piece's start down after the sink beat (s): the middle, dragged by the arm round her waist, first. */
const SINK_DELAY = [0.9, -1.5, 0.4] as const;
const CUE_BODY = 0;
const CUE_SLAP = 1;
const CUE_GROAN = 4;
const CUE_UNDER = 7;
const STERN_Z = -10.1;
const FORE = BRIGANTINE_MASTS.fore;

const smooth = (x: number) => {
  const t = clamp01(x);
  return t * t * (3 - 2 * t);
};

const _m = new Matrix4();
const _p = new Vector3();
const _a = new Vector3();
const _look = new Vector3();

export interface KrakenSceneOptions {
  tier: TierSettings;
  waves: WaveSampler;
  onSound?: (kind: BattleSound, pos: { x: number; y: number; z: number }, gain: number) => void;
  /** The tentacle's folder (defaults to the game's pack). */
  base?: string;
}

/**
 * A prototype scene (devpages/kraken.html): a raider rides the swell, the kraken rises beside her,
 * three arms coil round her hull and foremast, squeeze until she flexes and creaks, and pull her
 * apart; the pieces tilt and sink, and the kraken slides back under. Everything that appears later
 * (the pieces, the splinters, the splashes) is built up front and warmed with the rest.
 */
export class KrakenScene {
  readonly group = new Group();
  readonly ship: Brigantine;
  readonly kraken: Kraken;
  readonly pieces: ShipPieces;
  readonly splashes: SplashPool;
  readonly splinters: SplinterPool;
  /** Seconds into the scene. */
  time = 0;
  reducedMotion = false;
  /** Camera shake for this frame (m), 0 with reduced motion. */
  shake = 0;
  private readonly waves: WaveSampler;
  private readonly onSound: KrakenSceneOptions['onSound'];
  private readonly wrappers: Wrapper[] = [];
  /** Each arm's wrapper (by its place in `kraken.arms`), or null. */
  private readonly wrapperOf: (Wrapper | null)[] = [];
  /** Each arm's tip height last frame (where it meets the water: a ring of spray). */
  private readonly tipY: Float32Array;
  /** One-off cues already played (`CUE_*` slots). */
  private readonly fired = new Uint8Array(32);
  private readonly env: BrigantineEnv;
  private rand = mulberry32(0x6b72);
  private broke = false;
  /** The ship's pose when she broke: the pieces start from it. */
  private readonly brokeAt = { x: 0, y: 0, z: 0, heading: 0, pitch: 0, roll: 0 };
  private readonly sound = { x: 0, y: 0, z: 0 };
  private readonly krakenHome = new Vector3(17, 0, -1.5);
  private sinceFrame = 0;

  private constructor(o: KrakenSceneOptions, kraken: Kraken) {
    this.waves = o.waves;
    this.onSound = o.onSound;
    this.kraken = kraken;
    const tier = o.tier.tier;
    this.ship = createBrigantine({
      tier: tier === 'ultra' || tier === 'high' ? 'medium' : tier,
      oceanInteraction: false,
      raider: true,
    });
    this.ship.setName('Grey Gull');
    this.ship.dynamics.reset(0, 0, 0);
    this.env = { waves: o.waves, ground: null, obstacles: [], t: 0 };
    this.group.name = 'kraken scene';
    this.group.add(this.ship.group, kraken.group);
    kraken.group.position.copy(this.krakenHome);
    // It faces the ship (its forward is +z).
    kraken.group.rotation.y = -Math.PI / 2;
    kraken.measure();
    const budget = fxBudget(o.tier);
    this.splashes = new SplashPool(budget.splashes);
    this.splinters = new SplinterPool(budget.splinters);
    if (budget.splinters === 0) this.splinters.mesh.visible = false;
    this.group.add(this.splashes.mesh, this.splinters.mesh);
    // The pieces are cut now, from the ship as she's drawn (hull, rig, figurehead), and hidden.
    this.pieces = cutShip(this.ship.group, CUTS, shipMaterialOf(this.ship.group));
    this.pieces.group.visible = false;
    this.group.add(this.pieces.group);
    // Arms by socket: 0 and 7 face the ship, 1 a little aft.
    const roles: [number, Role, number, number][] = [
      [0, 'hull', 0, 1],
      [7, 'mast', 0.6, 2],
      [1, 'stern', 1.1, 0],
    ];
    for (const [socket, role, delay, piece] of roles) {
      const arm = kraken.arms.find((a) => a.index === socket);
      if (arm) this.wrappers.push({ arm, role, delay, piece });
    }
    for (const arm of kraken.arms) this.wrapperOf.push(this.wrappers.find((w) => w.arm === arm) ?? null);
    this.tipY = new Float32Array(kraken.arms.length);
    this.restart();
  }

  static async create(o: KrakenSceneOptions): Promise<KrakenScene> {
    const kraken = await Kraken.load({ tier: o.tier.tier, base: o.base });
    const scene = new KrakenScene(o, kraken);
    await scene.ship.figurehead;
    // The figurehead loads after the ship's made: cut again with it aboard.
    scene.recut();
    return scene;
  }

  private recut(): void {
    this.group.remove(this.pieces.group);
    this.pieces.dispose();
    (this as { pieces: ShipPieces }).pieces = cutShip(this.ship.group, CUTS, shipMaterialOf(this.ship.group));
    this.pieces.group.visible = false;
    this.group.add(this.pieces.group);
  }

  get beats(): Beats {
    return this.reducedMotion ? GENTLE : FULL;
  }

  get duration(): number {
    return this.beats.end;
  }

  phase(): KrakenPhase {
    const b = this.beats;
    const t = this.time;
    if (t < b.rise) return 'calm';
    if (t < b.reach) return 'rise';
    if (t < b.coil) return 'reach';
    if (t < b.squeeze) return 'coil';
    if (t < b.break) return 'squeeze';
    if (t < b.break + 1.2) return 'break';
    if (t < b.sink) return 'apart';
    if (t < b.retreat) return 'sink';
    if (t < b.end) return 'retreat';
    return 'done';
  }

  /** Back to the start: the ship whole, the kraken deep under her. */
  restart(): void {
    this.time = 0;
    this.broke = false;
    this.fired.fill(0);
    this.tipY.fill(-100);
    this.rand = mulberry32(0x6b72);
    this.ship.group.visible = true;
    this.pieces.group.visible = false;
    for (const p of this.pieces.pieces) {
      p.root.visible = true;
      p.pivot.rotation.set(0, 0, 0);
      for (const l of p.lines) l.visible = true;
    }
    this.splashes.clear();
    this.splinters.clear();
    for (let k = 0; k < this.kraken.arms.length; k++) {
      const arm = this.kraken.arms[k]!;
      arm.weight = 0;
      arm.sink = arm.length + 4;
      this.kraken.play(k, 'Tentacle_Idle', 0, 0.75 + (arm.index % 3) * 0.12, true);
    }
    this.kraken.body.root.position.y = -16;
  }

  /** For the warm-up: everything that shows later, shown; returns the undo. */
  stageWarm(): () => void {
    const restore: (() => void)[] = [];
    const show = (o: Object3D) => {
      const v = o.visible;
      o.visible = true;
      restore.push(() => (o.visible = v));
    };
    show(this.pieces.group);
    if (this.splinters.mesh.count === 0 || !this.splinters.mesh.visible) {
      const c = this.splinters.mesh.count;
      this.splinters.mesh.count = 1;
      restore.push(() => (this.splinters.mesh.count = c));
    }
    const sc = this.splashes.mesh.count;
    this.splashes.mesh.count = Math.max(1, sc);
    restore.push(() => (this.splashes.mesh.count = sc));
    for (const arm of this.kraken.arms) {
      const v = arm.root.visible;
      arm.root.visible = true;
      restore.push(() => (arm.root.visible = v));
    }
    return () => {
      for (const r of restore) r();
    };
  }

  /**
   * One frame. `dt` is the scene's step (0 while paused), `t` the sea's clock.
   */
  update(dt: number, t: number, camera: Camera | null): void {
    this.sinceFrame += dt;
    this.time += dt;
    const b = this.beats;
    const time = this.time;
    this.env.t = t;
    if (dt > 0) this.ship.update(dt, t, this.env);
    this.ship.group.updateMatrixWorld(true);

    // The ship's flex and the swap to her pieces (they stand in from the squeeze on).
    const showPieces = time >= b.squeeze;
    this.ship.group.visible = !showPieces;
    this.pieces.group.visible = showPieces && time < b.end;
    if (showPieces) this.placePieces(time, t);
    else this.broke = false;
    if (time >= b.break && !this.broke) this.breakApart(t);

    this.updateKraken(dt, t, time, camera);
    this.splashes.sync(t);
    this.splinters.update(dt, t, this.waves);
    this.cues(time, t);
  }

  private placePieces(time: number, t: number): void {
    const b = this.beats;
    const g = this.ship.group;
    const gentle = this.reducedMotion ? 0.5 : 1;
    if (!this.broke) {
      // Still one ship: the pieces ride with her and flex at the cuts as the arms squeeze.
      const squeeze = this.squeezeAt(time);
      for (let k = 0; k < this.pieces.pieces.length; k++) {
        const p = this.pieces.pieces[k]!;
        p.root.position.copy(g.position);
        p.root.quaternion.copy(g.quaternion);
        // Sagging: the arms press her middle down, so both ends lift about the cuts with each squeeze.
        const sign = k === 0 ? 1 : k === 2 ? -1 : 0;
        p.pivot.rotation.set(sign * 0.03 * squeeze * gentle, 0, sign * 0.012 * squeeze * gentle);
      }
      return;
    }
    const age = time - b.break;
    // Pulled apart along her length (bow forward, stern aft), toward the kraken, then down.
    const pull = smooth(age / 3.5);
    for (let k = 0; k < this.pieces.pieces.length; k++) {
      const p = this.pieces.pieces[k]!;
      const dir = k === 0 ? -1 : k === 2 ? 1 : 0;
      const along = dir * 5.5 * pull;
      const toward = (k === 1 ? 2.2 : 0.8) * pull;
      const yaw = dir * 0.22 * pull;
      const hs = Math.sin(this.brokeAt.heading);
      const hc = Math.cos(this.brokeAt.heading);
      const x = this.brokeAt.x + along * hs + toward * hc;
      const z = this.brokeAt.z + along * hc - toward * hs;
      // Each piece goes down in its own time: the middle (dragged by the arm round her waist) first.
      const sinkAge = time - (b.sink + SINK_DELAY[k]!);
      const swell = this.waves.heightAt(x, z, t) * Math.max(0, 1 - Math.max(0, sinkAge) / 3);
      const down = 0.6 * smooth(age / 2) + 2 * smooth(sinkAge / 2.5) + 10 * clamp01(sinkAge / 4.5) ** 2;
      p.root.position.set(x, swell - down, z);
      p.root.rotation.set(
        this.brokeAt.pitch * 0.5,
        this.brokeAt.heading + yaw,
        this.brokeAt.roll * 0.5,
        'YXZ',
      );
      // The broken ends go down first: bow and stern rear up, the middle rolls toward the kraken.
      const tilt = smooth(age / 4) * 0.3 + smooth(sinkAge / 3) * 0.55;
      if (k === 1) p.pivot.rotation.set(0, 0, -0.5 * smooth(sinkAge / 3) - 0.12 * pull);
      else p.pivot.rotation.set(-dir * tilt * (this.reducedMotion ? 0.7 : 1), 0, dir * 0.15 * pull);
      p.root.visible = down < 16;
      for (const l of p.lines) l.visible = sinkAge < 0.6;
    }
  }

  private breakApart(t: number): void {
    this.broke = true;
    const g = this.ship.group;
    const pose = this.ship.dynamics.pose;
    this.brokeAt.x = g.position.x;
    this.brokeAt.y = g.position.y;
    this.brokeAt.z = g.position.z;
    this.brokeAt.heading = pose.heading;
    this.brokeAt.pitch = g.rotation.x;
    this.brokeAt.roll = g.rotation.z;
    const chips = this.reducedMotion ? 3 : 10;
    for (const z of CUTS) {
      for (let side = -1; side <= 1; side += 2) {
        const y = sheerHeightAt(z);
        const x = side * halfBeamAt(z, y);
        _p.set(x, y - 0.4, z).applyMatrix4(g.matrixWorld);
        _a.set(side, 0, 0).transformDirection(g.matrixWorld);
        this.splinters.burst(_p.x, _p.y, _p.z, _a.x, _a.z, chips, this.rand);
        _p.set(side * halfBeamAt(z, 0.2), 0.2, z).applyMatrix4(g.matrixWorld);
        this.splinters.burst(_p.x, _p.y, _p.z, _a.x, _a.z, Math.ceil(chips * 0.6), this.rand);
        const sea = this.waves.heightAt(_p.x, _p.z, t);
        this.splashes.spawn(_p.x, sea, _p.z, t, this.reducedMotion ? 2 : 3.2, 1, this.rand());
      }
      _p.set(0, sheerHeightAt(z), z).applyMatrix4(g.matrixWorld);
      this.emit('timber', _p, 1);
    }
    this.shake = this.reducedMotion ? 0 : 0.45;
  }

  /** 0…1 pulses of the arms' squeeze, from the squeeze beat to the break. */
  private squeezeAt(time: number): number {
    const b = this.beats;
    if (time < b.squeeze) return 0;
    if (time >= b.break) return 1;
    const u = (time - b.squeeze) / (b.break - b.squeeze);
    const pulses = this.reducedMotion ? 2 : 3;
    return smooth(u * 1.2) * (0.55 + 0.45 * Math.abs(Math.sin(u * Math.PI * pulses)));
  }

  private updateKraken(dt: number, t: number, time: number, camera: Camera | null): void {
    const b = this.beats;
    const kraken = this.kraken;
    // The body comes up after its first arms and goes down after them.
    const up = smooth((time - b.rise - 2) / 3) * (1 - smooth((time - b.retreat - 2) / 3.5));
    const body = kraken.body.root;
    body.position.y = -16 + 16 * up + Math.sin(t * 0.7) * 0.25 * up;
    // Arms rise one after another, and go down the same way at the end.
    for (let k = 0; k < kraken.arms.length; k++) {
      const arm = kraken.arms[k]!;
      const stagger = (arm.index * 0.37) % 1.6;
      const rise = smooth((time - b.rise - stagger) / 2.6);
      const fall = smooth((time - b.retreat - stagger * 0.6) / 3);
      arm.sink = (arm.length + 4) * (1 - rise + fall);
    }
    kraken.place();
    for (let k = 0; k < kraken.arms.length; k++) {
      const arm = kraken.arms[k]!;
      const w = this.wrapperOf[k];
      if (w) this.driveWrapper(w, k, time, t);
      else if (time >= b.squeeze && time < b.retreat)
        kraken.play(k, k % 2 ? 'Tentacle_Attack' : 'Tentacle_Poke', 0.8, 0.8);
      else if (time >= b.retreat) kraken.play(k, 'Tentacle_Idle', 1.2);
      // A ring of spray where its tip breaks the water, coming up or going down.
      const tip = body.position.y + arm.socket.y - arm.sink + arm.length * 0.85;
      const was = this.tipY[k]!;
      this.tipY[k] = tip;
      if (was > -99 && was < 0 !== tip < 0 && arm.root.visible) this.ring(arm, t, tip > was ? 1 : 0.8);
    }
    // The eyes on the ship (or what's left of her), the scowl deepening as it squeezes.
    this.ship.group.getWorldPosition(_look);
    _look.y += 3;
    const anger = time >= b.reach && time < b.retreat ? 1 : 0;
    kraken.update(dt, t, camera, _look, anger);
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 0.6);
    if (!this.reducedMotion && time > b.squeeze && time < b.break)
      this.shake = Math.max(this.shake, 0.05 * this.squeezeAt(time));
    if (this.reducedMotion) this.shake = 0;
  }

  /** A reaching arm: its weight, its clip, and its path round what it holds. */
  private driveWrapper(w: Wrapper, k: number, time: number, t: number): void {
    const b = this.beats;
    const arm = w.arm;
    const start = b.reach + w.delay;
    if (time >= start - 0.6 && time < b.release) this.kraken.play(k, 'Tentacle_Attack', 0.5, 0.7);
    else if (time >= b.release) this.kraken.play(k, 'Tentacle_Attack2', 0.8, 0.6);
    const weightIn = smooth((time - start) / 1.4);
    const weightOut = smooth((time - b.release - w.delay * 0.4) / 1.8);
    arm.weight = weightIn * (1 - weightOut);
    if (arm.weight <= 0) return;
    // u: 0 held high over the ship, 1 coiled tight on her.
    const u = smooth((time - b.coil - w.delay * 0.5) / 2.4);
    const squeeze = this.squeezeAt(time) * (this.reducedMotion ? 0.5 : 1);
    const frame = this.broke || time >= b.squeeze ? this.pieceFrame(w.piece) : this.ship.group;
    frame.updateWorldMatrix(true, false);
    _m.copy(frame.matrixWorld);
    const path = arm.path;
    path.clear();
    arm.poser.base(_p);
    path.push(_p.x, _p.y, _p.z);
    if (w.role === 'mast') this.mastPath(w, u, squeeze, t);
    else this.hullPath(w, u, squeeze, t);
    path.build();
  }

  /** The frame that turns ship-local points into world points for piece `k` (or the ship). */
  private pieceFrame(k: number): Object3D {
    return this.pieces.pieces[k]!.pivot.children[0]!;
  }

  /** Pushes a ship-local point through the frame in `_m`. */
  private local(w: Wrapper, x: number, y: number, z: number): void {
    _p.set(x, y, z).applyMatrix4(_m);
    w.arm.path.push(_p.x, _p.y, _p.z);
  }

  /**
   * Up out of the water beside the hull, then a helix round her waist (a horizontal axis along her
   * length): over the rail and deck, down the far side, under the keel and round again. Held high and
   * loose at first (u 0), it drops and cinches tight (u 1); a squeeze pulls it tighter still.
   */
  private hullPath(w: Wrapper, u: number, squeeze: number, t: number): void {
    const zc = w.role === 'stern' ? STERN_Z : HULL_Z;
    const side = 1;
    const beam = halfBeamAt(zc, 1.2);
    const lift = 9 * (1 - u) * (1 - u);
    const loose = 1 + 0.9 * (1 - u);
    const tight = 1 - 0.08 * squeeze;
    const rx = (beam + 0.75) * loose * tight;
    const top = sheerHeightAt(zc) + 0.35;
    const ry = (top + 0.7) * loose * tight;
    const cy = 0.15 + lift;
    // From the base, under the water to beside the hull.
    this.local(w, side * (beam + 6), -2.4, zc + 1.2);
    this.local(w, side * (rx + 0.9), -0.6, zc + 0.6);
    const pitch = 1.5;
    const turns = 2.4;
    const steps = Math.round(turns * 10);
    const wobble = Math.sin(t * 2.1 + zc) * 0.08 * (1 - u);
    for (let s = 0; s <= steps; s++) {
      const th = (s / 10) * Math.PI * 2 * (1 + wobble);
      const x = side * Math.cos(th) * rx;
      const y = cy + Math.sin(th) * ry;
      const z = zc + (pitch * s) / 10 - pitch * 0.4;
      this.local(w, x, y, z);
    }
  }

  /**
   * Up beside the hull, over the rail to the foremast, then a climbing helix round it: a wide lasso
   * at first (u 0) that cinches round the mast (u 1).
   */
  private mastPath(w: Wrapper, u: number, squeeze: number, t: number): void {
    const zm = FORE.z;
    const beam = halfBeamAt(zm, 1.5);
    const deck = deckHeightAt(zm);
    const rail = sheerHeightAt(zm);
    const r = (1.15 + 4.5 * (1 - u) * (1 - u)) * (1 - 0.12 * squeeze);
    const lift = 5 * (1 - u);
    this.local(w, beam + 6, -2.4, zm + 2.5);
    this.local(w, beam + 0.9, -0.4, zm + 1.6);
    this.local(w, beam + 0.5, rail + 1.4 + lift * 0.5, zm + 1.2);
    const climb = 2.4;
    const turns = 3;
    const y0 = deck + 1.3 + lift;
    const steps = turns * 8;
    const sway = Math.sin(t * 1.7) * 0.15 * (1 - u);
    for (let s = 0; s <= steps; s++) {
      const ph = (s / 8) * Math.PI * 2 + sway;
      const x = Math.cos(ph) * r;
      const z = zm + Math.sin(ph) * r;
      const y = y0 + (climb * s) / 8;
      this.local(w, x, Math.min(y, FORE.lowerTop - 0.9), z);
    }
  }

  /** True once, the first frame at or after `at` (slot `cue` of `fired`). */
  private once(cue: number, at: number): boolean {
    if (this.time < at || this.fired[cue]) return false;
    this.fired[cue] = 1;
    return true;
  }

  /** Sounds and splashes that happen once at a beat. */
  private cues(time: number, t: number): void {
    const b = this.beats;
    const g = this.ship.group;
    if (this.once(CUE_BODY, b.rise + 3.2)) {
      this.kraken.group.getWorldPosition(_p);
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2;
        const x = _p.x + Math.cos(a) * 4.5;
        const z = _p.z + Math.sin(a) * 4.5;
        this.splashes.spawn(x, this.waves.heightAt(x, z, t), z, t, 2.4, k % 2, this.rand());
      }
      this.emit('sink', _p, 0.7);
    }
    for (let i = 0; i < this.wrappers.length; i++) {
      const w = this.wrappers[i]!;
      if (this.once(CUE_SLAP + i, b.coil + w.delay * 0.5 + 1.6)) {
        const z = w.role === 'mast' ? FORE.z : w.role === 'stern' ? STERN_Z : HULL_Z;
        _p.set(halfBeamAt(z, 0) + 1, 0, z).applyMatrix4(g.matrixWorld);
        this.splashes.spawn(_p.x, this.waves.heightAt(_p.x, _p.z, t), _p.z, t, 2.2, 1, this.rand());
        this.emit('splash', _p, 0.8);
      }
    }
    const span = b.break - b.squeeze;
    for (let k = 0; k < 3; k++)
      if (this.once(CUE_GROAN + k, b.squeeze + 0.3 + (k * span) / 3)) {
        g.getWorldPosition(_p);
        this.emit('groan', _p, 1);
      }
    if (this.broke) {
      // Air bubbling out of the broken hull as it goes down.
      if (
        time > b.sink - 1.5 &&
        time < b.retreat + 2 &&
        this.rand() < 0.08 * (this.reducedMotion ? 0.5 : 1)
      ) {
        const p = this.pieces.pieces[Math.floor(this.rand() * this.pieces.pieces.length)]!;
        p.root.getWorldPosition(_p);
        _p.x += (this.rand() - 0.5) * 6;
        _p.z += (this.rand() - 0.5) * 6;
        this.splashes.spawn(
          _p.x,
          this.waves.heightAt(_p.x, _p.z, t),
          _p.z,
          t,
          1 + this.rand(),
          0,
          this.rand(),
        );
      }
      for (let k = 0; k < this.pieces.pieces.length; k++)
        if (this.once(CUE_UNDER + k, b.sink + SINK_DELAY[k]! + 3.2)) {
          this.pieces.pieces[k]!.root.getWorldPosition(_p);
          this.splashes.spawn(_p.x, this.waves.heightAt(_p.x, _p.z, t), _p.z, t, 3, 1, this.rand());
          this.emit('sink', _p, 1);
        }
    }
  }

  /** A ring of splashes where an arm meets the water. */
  private ring(arm: KrakenArm, t: number, scale: number): void {
    arm.root.getWorldPosition(_p);
    const r = 1.6 * arm.scale;
    const n = this.reducedMotion ? 3 : 5;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + arm.index;
      const x = _p.x + Math.cos(a) * r;
      const z = _p.z + Math.sin(a) * r;
      this.splashes.spawn(
        x,
        this.waves.heightAt(x, z, t),
        z,
        t,
        (1.3 + this.rand() * 0.6) * scale,
        k === 0 ? 1 : 0,
        this.rand(),
      );
    }
    this.emit('splash', _p, 0.6 * scale);
  }

  private emit(kind: BattleSound, p: Vector3, gain: number): void {
    this.sound.x = p.x;
    this.sound.y = p.y;
    this.sound.z = p.z;
    this.onSound?.(kind, this.sound, gain);
  }

  /** The ship's place now (whole) or where she broke. */
  shipPosition(out: Vector3): Vector3 {
    if (this.broke) return out.set(this.brokeAt.x, 0, this.brokeAt.z);
    return out.set(this.ship.group.position.x, 0, this.ship.group.position.z);
  }

  dispose(): void {
    this.pieces.dispose();
    this.kraken.dispose();
    this.ship.dispose();
    this.splashes.mesh.geometry.dispose();
    this.splinters.mesh.geometry.dispose();
  }
}

/** The ship's hull material (the caps are its planking). */
function shipMaterialOf(ship: Object3D): Material {
  const hull =
    ship.getObjectByName('rounded planked hull') ?? ship.getObjectByName('hull deck trim and stern (merged)');
  const m = (hull as Mesh | undefined)?.material;
  if (!m || Array.isArray(m)) throw new Error('kraken scene: no hull material');
  return m;
}
