import { Group, Matrix4, Vector3, type Camera, type Material, type Mesh, type Object3D } from 'three/webgpu';
import type { TierSettings } from '../../engine/quality';
import { clamp01, mulberry32 } from '../../util/math';
import type { BattleSound } from '../battle/battle';
import { SplashPool, SplinterPool, fxBudget } from '../battle/fx';
import type { WaveSampler } from '../contracts';
import type { Brigantine } from '../ship';
import { BRIGANTINE_MASTS } from '../ship/brigantine-rig';
import { BRIGANTINE_HALF_LENGTH, deckHeightAt, halfBeamAt, sheerHeightAt } from '../ship/lines';
import { KrakenHazards, type HazardArea, type HazardKind } from './hazards';
import { Kraken, type KrakenArm } from './kraken';
import { cutShip, type ShipPieces } from './ship-break';
import { TellMarks, type MarkState } from './tell-marks';

/**
 * What the kraken does, driven by a battle (or the dev page): `rise(at)`, `wrapAndBreak(ship)`,
 * `hazard(at, kind)` and `retreat()`. It gives its evidence before it acts (bubbles, a shadow and a
 * swirl under the water, a danger ring) and tells its driver through events:
 * - `telling`: evidence is showing; it acts in `strikeIn` seconds (the lookout's call goes here);
 * - `striking`: it acts now (a rise breaks the water, the arms reach for a ship, a hazard lands);
 * - `done`: a wreck is under, a hazard's arm is down, or the kraken has gone.
 *
 * A ship it wraps is the driver's: the encounter only reads her pose, holds her (no way on, from the
 * reach), hides her when her pieces stand in, and never updates her. Cut her ahead of time with
 * `prepare(ship)` (in the battle's warm-up): her pieces must be drawn once before she breaks.
 */
export type KrakenEventType = 'telling' | 'striking' | 'done';
export type KrakenAct = 'rise' | 'wrap' | 'retreat' | HazardKind;

export interface KrakenEvent {
  type: KrakenEventType;
  act: KrakenAct;
  x: number;
  z: number;
  /** The danger radius (m) for a hazard; the shadow's for a rise or a wrap. */
  radius: number;
  /** Seconds until it acts (telling only). */
  strikeIn: number;
}

/** A wrap's beats (s after it starts). The reduced-motion one is shorter and gentler. */
interface WrapBeats {
  coil: number;
  squeeze: number;
  break: number;
  sink: number;
  release: number;
  /** The kraken goes down on its own after this. */
  leave: number;
}

const WRAP: WrapBeats = { coil: 3, squeeze: 6.5, break: 10.5, sink: 15, release: 18.5, leave: 20.5 };
const WRAP_GENTLE: WrapBeats = { coil: 2.5, squeeze: 5, break: 7.5, sink: 10.5, release: 13.5, leave: 15 };
/** A rise: the tell (s), then the arms, then the body. */
const RISE_TELL = 2.6;
const RISE_TELL_GENTLE = 3.2;
/** Where the kraken rises beside a ship it's going to wrap (her frame: x to port, z to the bow). */
const ANCHOR = { x: 17, z: -1.5 } as const;

export type WrapPhase =
  'none' | 'tell' | 'rise' | 'reach' | 'coil' | 'squeeze' | 'break' | 'apart' | 'sink' | 'retreat';

type Role = 'hull' | 'mast' | 'stern';

interface Wrapper {
  arm: KrakenArm;
  role: Role;
  delay: number;
  piece: number;
}

/** The ship's cuts (ship-local z): between the fore and main masts, and between the main and mizzen. */
const CUTS = [-4.8, 1.8] as const;
const HULL_Z = 0.25;
const STERN_Z = -10.1;
const FORE = BRIGANTINE_MASTS.fore;
const SINK_DELAY = [0.9, -1.5, 0.4] as const;
const CUE_BODY = 0;
const CUE_SLAP = 1;
const CUE_GROAN = 4;
const CUE_UNDER = 7;
const CUE_REACH = 10;
const CUE_DONE = 11;
const CUE_RISE = 12;
const CUE_GONE = 13;

const smooth = (x: number) => {
  const t = clamp01(x);
  return t * t * (3 - 2 * t);
};

const _m = new Matrix4();
const _p = new Vector3();
const _a = new Vector3();
const _look = new Vector3();

export interface KrakenEncounterOptions {
  tier: TierSettings;
  waves: WaveSampler;
  onSound?: (kind: BattleSound, pos: { x: number; y: number; z: number }, gain: number) => void;
  /** The tentacle's folder (defaults to the game's pack). */
  base?: string;
}

interface Wreck {
  ship: Brigantine;
  pieces: ShipPieces;
}

export class KrakenEncounter {
  readonly group = new Group();
  readonly kraken: Kraken;
  readonly hazards: KrakenHazards;
  readonly marks: TellMarks;
  readonly splashes: SplashPool;
  readonly splinters: SplinterPool;
  /** Seconds since the encounter started (its own clock). */
  time = 0;
  reducedMotion = false;
  /** Camera shake for this frame (m), 0 with reduced motion. */
  shake = 0;
  private readonly waves: WaveSampler;
  private readonly onSound: KrakenEncounterOptions['onSound'];
  private readonly listeners: ((e: Readonly<KrakenEvent>) => void)[] = [];
  private readonly event: KrakenEvent = { type: 'telling', act: 'rise', x: 0, z: 0, radius: 0, strikeIn: 0 };
  private readonly wrappers: Wrapper[] = [];
  private readonly wrapperOf: (Wrapper | null)[] = [];
  private readonly tipY: Float32Array;
  private readonly fired = new Uint8Array(32);
  private readonly wrecks: Wreck[] = [];
  private rand = mulberry32(0x6b72);
  /** When the rise started (encounter time), NaN when it hasn't. */
  private riseAt = NaN;
  private retreatAt = NaN;
  private wrapAt = NaN;
  private wreck: Wreck | null = null;
  private broke = false;
  private riseMark: MarkState | null = null;
  private readonly brokeAt = { x: 0, z: 0, heading: 0, pitch: 0, roll: 0 };
  private readonly sound = { x: 0, y: 0, z: 0 };
  private readonly anchor = new Vector3();
  private anchorHeading = 0;

  private constructor(
    o: KrakenEncounterOptions,
    kraken: Kraken,
    hazards: KrakenHazards,
    marks: TellMarks,
    splashes: SplashPool,
  ) {
    this.waves = o.waves;
    this.onSound = o.onSound;
    this.kraken = kraken;
    this.hazards = hazards;
    this.marks = marks;
    this.splashes = splashes;
    this.group.name = 'kraken encounter';
    const budget = fxBudget(o.tier);
    this.splinters = new SplinterPool(budget.splinters);
    if (budget.splinters === 0) this.splinters.mesh.visible = false;
    this.group.add(kraken.group, hazards.kraken.group, marks.group, splashes.mesh, this.splinters.mesh);
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
    this.reset();
  }

  static async create(o: KrakenEncounterOptions): Promise<KrakenEncounter> {
    const kraken = await Kraken.load({ tier: o.tier.tier, base: o.base });
    const marks = new TellMarks(o.tier.tier === 'lite' ? 3 : 4);
    const splashes = new SplashPool(fxBudget(o.tier).splashes);
    let enc: KrakenEncounter | null = null;
    const rand = mulberry32(0x4a2d);
    const hazards = await KrakenHazards.create({
      tier: o.tier.tier,
      base: o.base,
      waves: o.waves,
      marks,
      splashes,
      rand,
      events: {
        telling: (a, kind, strikeIn) => enc?.emitEvent('telling', kind, a.x, a.z, a.radius, strikeIn),
        striking: (a, kind) => {
          enc?.emitEvent('striking', kind, a.x, a.z, a.radius, 0);
          _p.set(a.x, 0, a.z);
          enc?.emit('splash', _p, 1.2);
        },
        done: (kind) => enc?.emitEvent('done', kind, 0, 0, 0, 0),
      },
    });
    enc = new KrakenEncounter(o, kraken, hazards, marks, splashes);
    return enc;
  }

  /** Listens to the encounter's events; returns the function that stops listening. */
  on(fn: (e: Readonly<KrakenEvent>) => void): () => void {
    this.listeners.push(fn);
    return () => {
      const i = this.listeners.indexOf(fn);
      if (i >= 0) this.listeners.splice(i, 1);
    };
  }

  /**
   * Cuts `ship` into her pieces ahead of time (in the warm-up, with her rig and figurehead as they'll
   * be). Her pieces join the encounter's group, hidden; they're drawn in its warm (`stageWarm`).
   */
  prepare(ship: Brigantine): void {
    const old = this.wrecks.findIndex((w) => w.ship === ship);
    if (old >= 0) {
      this.group.remove(this.wrecks[old]!.pieces.group);
      this.wrecks[old]!.pieces.dispose();
      this.wrecks.splice(old, 1);
    }
    const pieces = cutShip(ship.group, CUTS, shipMaterialOf(ship.group));
    pieces.group.visible = false;
    this.group.add(pieces.group);
    this.wrecks.push({ ship, pieces });
  }

  /** Back to calm: the kraken deep, no hazards, any wrecked ship whole again (shown). */
  reset(): void {
    this.time = 0;
    this.riseAt = this.retreatAt = this.wrapAt = NaN;
    this.broke = false;
    this.wreck = null;
    this.fired.fill(0);
    this.tipY.fill(-100);
    this.rand = mulberry32(0x6b72);
    this.marks.clear();
    this.riseMark = null;
    this.hazards.reset();
    for (const w of this.wrecks) {
      w.ship.group.visible = true;
      w.pieces.group.visible = false;
      for (const p of w.pieces.pieces) {
        p.root.visible = true;
        p.pivot.rotation.set(0, 0, 0);
        for (const l of p.lines) l.visible = true;
      }
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
    this.kraken.group.visible = false;
  }

  /** Rises at (x, z), facing `heading` (its eyes' way), after its tell. */
  rise(x: number, z: number, heading: number): void {
    if (!Number.isNaN(this.riseAt) && Number.isNaN(this.retreatAt)) return;
    this.riseAt = this.time;
    this.retreatAt = NaN;
    this.fired.fill(0);
    this.tipY.fill(-100);
    this.anchor.set(x, 0, z);
    this.anchorHeading = heading;
    this.kraken.group.position.copy(this.anchor);
    this.kraken.group.rotation.y = heading;
    this.kraken.group.visible = true;
    this.riseMark ??= this.marks.acquire();
    if (this.riseMark) {
      this.riseMark.x = x;
      this.riseMark.z = z;
      this.riseMark.radius = 11;
      this.riseMark.arc = Math.PI * 2;
    }
    this.emitEvent('telling', 'rise', x, z, 11, this.riseTell);
  }

  /**
   * Wraps `ship` (prepared with `prepare`) and tears her apart. If the kraken isn't up, it rises
   * beside her first (with its tell); either way it swims alongside her as she goes.
   */
  wrapAndBreak(ship: Brigantine): boolean {
    const wreck = this.wrecks.find((w) => w.ship === ship);
    if (!wreck || this.wreck) return false;
    this.wreck = wreck;
    this.broke = false;
    this.anchorFor(ship);
    if (Number.isNaN(this.riseAt) || !Number.isNaN(this.retreatAt)) {
      this.rise(this.anchor.x, this.anchor.z, this.anchorHeading);
      this.wrapAt = this.time + this.riseTell + 5.5;
    } else this.wrapAt = this.time + 0.8;
    return true;
  }

  /** A tentacle hazard at (x, z): `heading` is a sweep's middle direction. Returns its id (0: none free). */
  hazard(x: number, z: number, kind: HazardKind, heading = 0): number {
    return this.hazards.start(kind, x, z, heading);
  }

  /** The kraken goes back under: its arms let go, its hazards sink, then its body. */
  retreat(): void {
    this.hazards.retreat();
    if (Number.isNaN(this.riseAt) || !Number.isNaN(this.retreatAt)) return;
    this.retreatAt = this.time;
    this.emitEvent('telling', 'retreat', this.anchor.x, this.anchor.z, 0, 0);
  }

  /** True when a hull touches a hazard that can hurt now (a landing strike or a standing arm). */
  hitsHull(bowX: number, bowZ: number, sternX: number, sternZ: number, halfBeam: number): boolean {
    return this.hazards.hitsHull(bowX, bowZ, sternX, sternZ, halfBeam);
  }

  /** The areas that can hurt now (written into `out`). */
  dangers(out: HazardArea[]): HazardArea[] {
    return this.hazards.dangers(out);
  }

  get riseTell(): number {
    return this.reducedMotion ? RISE_TELL_GENTLE : RISE_TELL;
  }

  private get beats(): WrapBeats {
    return this.reducedMotion ? WRAP_GENTLE : WRAP;
  }

  /** Where the wrap stands (for a camera or a HUD). */
  phase(): WrapPhase {
    const t = this.time;
    if (!Number.isNaN(this.retreatAt)) return t - this.retreatAt < 6 ? 'retreat' : 'none';
    if (Number.isNaN(this.riseAt)) return 'none';
    if (t < this.riseAt + this.riseTell) return 'tell';
    if (Number.isNaN(this.wrapAt) || t < this.wrapAt) return 'rise';
    const w = t - this.wrapAt;
    const b = this.beats;
    if (w < b.coil) return 'reach';
    if (w < b.squeeze) return 'coil';
    if (w < b.break) return 'squeeze';
    if (w < b.break + 1.2) return 'break';
    if (w < b.sink) return 'apart';
    return 'sink';
  }

  /** For the warm-up: everything that shows later, shown; returns the undo. */
  stageWarm(): () => void {
    const restore: (() => void)[] = [];
    const show = (o: Object3D) => {
      const v = o.visible;
      o.visible = true;
      restore.push(() => (o.visible = v));
    };
    show(this.kraken.group);
    for (const w of this.wrecks) show(w.pieces.group);
    for (const arm of this.kraken.arms) show(arm.root);
    restore.push(this.hazards.stageWarm(), this.marks.stageWarm());
    for (const m of [this.splinters.mesh, this.splashes.mesh]) {
      const c = m.count;
      m.count = Math.max(1, c);
      restore.push(() => (m.count = c));
    }
    return () => {
      for (const r of restore) r();
    };
  }

  /** One frame: `dt` the encounter's step (0 while paused), `t` the sea's clock. */
  update(dt: number, t: number, camera: Camera | null): void {
    this.time += dt;
    const time = this.time;
    const wreck = this.wreck;
    if (wreck) {
      wreck.ship.group.updateMatrixWorld(true);
      if (!this.broke) this.anchorFor(wreck.ship);
      // From the reach she's held: no way on (the driver must leave her helm alone).
      if (time >= this.wrapAt) wreck.ship.dynamics.setInput(HELD);
      const b = this.beats;
      const w = time - this.wrapAt;
      const showPieces = w >= b.squeeze;
      wreck.ship.group.visible = !showPieces;
      wreck.pieces.group.visible = showPieces;
      if (showPieces) this.placePieces(wreck, w, t);
      if (w >= b.break && !this.broke) this.breakApart(wreck, t);
      if (w >= b.leave && Number.isNaN(this.retreatAt)) this.retreat();
    }
    // It swims to its place beside the ship (or stays where it rose).
    if (!Number.isNaN(this.riseAt)) {
      const g = this.kraken.group;
      const k = 1 - Math.exp(-dt * 1.4);
      g.position.lerp(this.anchor, k);
      g.rotation.y +=
        Math.atan2(Math.sin(this.anchorHeading - g.rotation.y), Math.cos(this.anchorHeading - g.rotation.y)) *
        k;
    }
    this.updateRiseMark(time);
    this.updateKraken(dt, t, time, camera);
    this.hazards.update(dt, t, camera);
    this.marks.update(t, this.waves);
    this.splashes.sync(t);
    this.splinters.update(dt, t, this.waves);
    this.cues(time, t);
  }

  /** The kraken's place beside `ship`: on her +x side, facing her. */
  private anchorFor(ship: Brigantine): void {
    const g = ship.group;
    const pose = ship.dynamics.pose;
    const s = Math.sin(pose.heading);
    const c = Math.cos(pose.heading);
    this.anchor.set(
      g.position.x + ANCHOR.x * c + ANCHOR.z * s,
      0,
      g.position.z - ANCHOR.x * s + ANCHOR.z * c,
    );
    this.anchorHeading = pose.heading - Math.PI / 2;
  }

  /** The rise's evidence: shadow and swirl before the arms break the water, then gone. */
  private updateRiseMark(time: number): void {
    const m = this.riseMark;
    if (!m) return;
    const age = time - this.riseAt;
    const tell = this.riseTell;
    const told = smooth(age / (tell * 0.75));
    const gone = 1 - smooth((age - tell - 1.5) / 2);
    m.shadow = 0.9 * told * gone;
    m.ring = 0;
    m.spin = age * (1 + told);
    m.x = this.kraken.group.position.x;
    m.z = this.kraken.group.position.z;
    if (age > tell + 4) {
      this.marks.release(m);
      this.riseMark = null;
    }
  }

  private placePieces(wreck: Wreck, w: number, t: number): void {
    const b = this.beats;
    const g = wreck.ship.group;
    const gentle = this.reducedMotion ? 0.5 : 1;
    const list = wreck.pieces.pieces;
    if (!this.broke) {
      // Still one ship: the pieces ride with her, and sag at the cuts as the arms squeeze.
      const squeeze = this.squeezeAt(w);
      for (let k = 0; k < list.length; k++) {
        const p = list[k]!;
        p.root.position.copy(g.position);
        p.root.quaternion.copy(g.quaternion);
        const sign = k === 0 ? 1 : k === 2 ? -1 : 0;
        p.pivot.rotation.set(sign * 0.03 * squeeze * gentle, 0, sign * 0.012 * squeeze * gentle);
      }
      return;
    }
    const age = w - b.break;
    const pull = smooth(age / 3.5);
    for (let k = 0; k < list.length; k++) {
      const p = list[k]!;
      const dir = k === 0 ? -1 : k === 2 ? 1 : 0;
      const along = dir * 5.5 * pull;
      const toward = (k === 1 ? 2.2 : 0.8) * pull;
      const yaw = dir * 0.22 * pull;
      const hs = Math.sin(this.brokeAt.heading);
      const hc = Math.cos(this.brokeAt.heading);
      const x = this.brokeAt.x + along * hs + toward * hc;
      const z = this.brokeAt.z + along * hc - toward * hs;
      const sinkAge = w - (b.sink + SINK_DELAY[k]!);
      const swell = this.waves.heightAt(x, z, t) * Math.max(0, 1 - Math.max(0, sinkAge) / 3);
      const down = 0.6 * smooth(age / 2) + 2 * smooth(sinkAge / 2.5) + 10 * clamp01(sinkAge / 4.5) ** 2;
      p.root.position.set(x, swell - down, z);
      p.root.rotation.set(
        this.brokeAt.pitch * 0.5,
        this.brokeAt.heading + yaw,
        this.brokeAt.roll * 0.5,
        'YXZ',
      );
      const tilt = smooth(age / 4) * 0.3 + smooth(sinkAge / 3) * 0.55;
      if (k === 1) p.pivot.rotation.set(0, 0, -0.5 * smooth(sinkAge / 3) - 0.12 * pull);
      else p.pivot.rotation.set(-dir * tilt * (this.reducedMotion ? 0.7 : 1), 0, dir * 0.15 * pull);
      p.root.visible = down < 16;
      for (const l of p.lines) l.visible = sinkAge < 0.6;
    }
  }

  private breakApart(wreck: Wreck, t: number): void {
    this.broke = true;
    const g = wreck.ship.group;
    const pose = wreck.ship.dynamics.pose;
    this.brokeAt.x = g.position.x;
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

  /** 0…1 pulses of the arms' squeeze, from the squeeze beat to the break (`w`: seconds into the wrap). */
  private squeezeAt(w: number): number {
    const b = this.beats;
    if (Number.isNaN(w) || w < b.squeeze) return 0;
    if (w >= b.break) return 1;
    const u = (w - b.squeeze) / (b.break - b.squeeze);
    const pulses = this.reducedMotion ? 2 : 3;
    return smooth(u * 1.2) * (0.55 + 0.45 * Math.abs(Math.sin(u * Math.PI * pulses)));
  }

  private updateKraken(dt: number, t: number, time: number, camera: Camera | null): void {
    const kraken = this.kraken;
    if (Number.isNaN(this.riseAt)) return;
    const riseFrom = this.riseAt + this.riseTell;
    const leaving = !Number.isNaN(this.retreatAt);
    const up =
      smooth((time - riseFrom - 2) / 3) * (leaving ? 1 - smooth((time - this.retreatAt - 2) / 3.5) : 1);
    const body = kraken.body.root;
    body.position.y = -16 + 16 * up + Math.sin(t * 0.7) * 0.25 * up;
    for (let k = 0; k < kraken.arms.length; k++) {
      const arm = kraken.arms[k]!;
      const stagger = (arm.index * 0.37) % 1.6;
      const rise = smooth((time - riseFrom - stagger) / 2.6);
      const fall = leaving ? smooth((time - this.retreatAt - stagger * 0.6) / 3) : 0;
      arm.sink = (arm.length + 4) * (1 - rise + fall);
    }
    kraken.place();
    const w = time - this.wrapAt;
    const b = this.beats;
    const retreating = leaving;
    for (let k = 0; k < kraken.arms.length; k++) {
      const arm = kraken.arms[k]!;
      const wr = this.wrapperOf[k];
      if (wr && this.wreck && !Number.isNaN(w)) this.driveWrapper(wr, k, w, t);
      else if (retreating) {
        arm.weight = Math.max(0, arm.weight - dt / 1.8);
        kraken.play(k, 'Tentacle_Idle', 1.2);
      } else if (w >= b.squeeze) kraken.play(k, k % 2 ? 'Tentacle_Attack' : 'Tentacle_Poke', 0.8, 0.8);
      const tip = body.position.y + arm.socket.y - arm.sink + arm.length * 0.85;
      const was = this.tipY[k]!;
      this.tipY[k] = tip;
      if (was > -99 && was < 0 !== tip < 0 && arm.root.visible) this.ring(arm, t, tip > was ? 1 : 0.8);
    }
    if (this.wreck) this.wreck.ship.group.getWorldPosition(_look);
    else _look.copy(kraken.group.position).add(_a.set(0, 0, 20).applyAxisAngle(Y, kraken.group.rotation.y));
    _look.y += 3;
    const anger = this.wreck && w >= 0 && !retreating ? 1 : 0;
    kraken.update(dt, t, camera, _look, anger);
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 0.6);
    if (!this.reducedMotion && w > b.squeeze && w < b.break)
      this.shake = Math.max(this.shake, 0.05 * this.squeezeAt(w));
    if (this.reducedMotion) this.shake = 0;
  }

  /** A reaching arm: its weight, its clip, and its path round what it holds (`w`: seconds into the wrap). */
  private driveWrapper(wr: Wrapper, k: number, w: number, t: number): void {
    const b = this.beats;
    const arm = wr.arm;
    if (w >= wr.delay - 0.6 && w < b.release) this.kraken.play(k, 'Tentacle_Attack', 0.5, 0.7);
    else if (w >= b.release) this.kraken.play(k, 'Tentacle_Attack2', 0.8, 0.6);
    const weightIn = smooth((w - wr.delay) / 1.4);
    const weightOut = smooth((w - b.release - wr.delay * 0.4) / 1.8);
    arm.weight = weightIn * (1 - weightOut);
    if (arm.weight <= 0) return;
    const u = smooth((w - b.coil - wr.delay * 0.5) / 2.4);
    const squeeze = this.squeezeAt(w) * (this.reducedMotion ? 0.5 : 1);
    const frame = w >= b.squeeze ? this.pieceFrame(wr.piece) : this.wreck!.ship.group;
    frame.updateWorldMatrix(true, false);
    _m.copy(frame.matrixWorld);
    const path = arm.path;
    path.clear();
    arm.poser.base(_p);
    path.push(_p.x, _p.y, _p.z);
    if (wr.role === 'mast') this.mastPath(wr, u, squeeze, t);
    else this.hullPath(wr, u, squeeze, t);
    path.build();
  }

  private pieceFrame(k: number): Object3D {
    return this.wreck!.pieces.pieces[k]!.pivot.children[0]!;
  }

  private local(w: Wrapper, x: number, y: number, z: number): void {
    _p.set(x, y, z).applyMatrix4(_m);
    w.arm.path.push(_p.x, _p.y, _p.z);
  }

  /**
   * Up out of the water beside the hull, then a helix round her waist: over the rail and deck, down
   * the far side, under the keel and round again. Held high and loose at first (u 0), it drops and
   * cinches tight (u 1); a squeeze pulls it tighter still.
   */
  private hullPath(w: Wrapper, u: number, squeeze: number, t: number): void {
    const zc = w.role === 'stern' ? STERN_Z : HULL_Z;
    const beam = halfBeamAt(zc, 1.2);
    const lift = 9 * (1 - u) * (1 - u);
    const loose = 1 + 0.9 * (1 - u);
    const tight = 1 - 0.08 * squeeze;
    const rx = (beam + 0.75) * loose * tight;
    const top = sheerHeightAt(zc) + 0.35;
    const ry = (top + 0.7) * loose * tight;
    const cy = 0.15 + lift;
    this.local(w, beam + 6, -2.4, zc + 1.2);
    this.local(w, rx + 0.9, -0.6, zc + 0.6);
    const pitch = 1.5;
    const steps = 24;
    const wobble = Math.sin(t * 2.1 + zc) * 0.08 * (1 - u);
    for (let s = 0; s <= steps; s++) {
      const th = (s / 10) * Math.PI * 2 * (1 + wobble);
      this.local(w, Math.cos(th) * rx, cy + Math.sin(th) * ry, zc + (pitch * s) / 10 - pitch * 0.4);
    }
  }

  /** Up beside the hull, over the rail to the foremast, then a climbing helix round it that cinches. */
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
    const y0 = deck + 1.3 + lift;
    const steps = 24;
    const sway = Math.sin(t * 1.7) * 0.15 * (1 - u);
    for (let s = 0; s <= steps; s++) {
      const ph = (s / 8) * Math.PI * 2 + sway;
      const y = y0 + (climb * s) / 8;
      this.local(w, Math.cos(ph) * r, Math.min(y, FORE.lowerTop - 0.9), zm + Math.sin(ph) * r);
    }
  }

  private once(cue: number, at: number): boolean {
    if (this.time < at || this.fired[cue]) return false;
    this.fired[cue] = 1;
    return true;
  }

  /** Sounds, splashes and events that happen once at a beat. */
  private cues(time: number, t: number): void {
    if (Number.isNaN(this.riseAt)) return;
    const riseFrom = this.riseAt + this.riseTell;
    // Bubbles over its shadow while it tells.
    if (time < riseFrom && this.rand() < (this.reducedMotion ? 0.12 : 0.3)) {
      const g = this.kraken.group.position;
      const r = Math.sqrt(this.rand()) * 6;
      const a = this.rand() * Math.PI * 2;
      const x = g.x + Math.cos(a) * r;
      const z = g.z + Math.sin(a) * r;
      this.splashes.spawn(x, this.waves.heightAt(x, z, t), z, t, 0.5 + this.rand() * 0.5, 0, this.rand());
    }
    if (this.once(CUE_RISE, riseFrom)) {
      const g = this.kraken.group.position;
      this.emitEvent('striking', 'rise', g.x, g.z, 11, 0);
    }
    if (this.once(CUE_BODY, riseFrom + 3.2)) {
      this.kraken.group.getWorldPosition(_p);
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2;
        const x = _p.x + Math.cos(a) * 4.5;
        const z = _p.z + Math.sin(a) * 4.5;
        this.splashes.spawn(x, this.waves.heightAt(x, z, t), z, t, 2.4, k % 2, this.rand());
      }
      this.emit('sink', _p, 0.7);
    }
    if (!Number.isNaN(this.retreatAt) && this.once(CUE_GONE, this.retreatAt + 6.5)) {
      const g = this.kraken.group.position;
      this.emitEvent('done', 'retreat', g.x, g.z, 0, 0);
    }
    const wreck = this.wreck;
    if (!wreck) return;
    const b = this.beats;
    const g = wreck.ship.group;
    if (this.once(CUE_REACH, this.wrapAt))
      this.emitEvent('striking', 'wrap', g.position.x, g.position.z, BRIGANTINE_HALF_LENGTH, 0);
    for (let i = 0; i < this.wrappers.length; i++) {
      const w = this.wrappers[i]!;
      if (this.once(CUE_SLAP + i, this.wrapAt + b.coil + w.delay * 0.5 + 1.6)) {
        const z = w.role === 'mast' ? FORE.z : w.role === 'stern' ? STERN_Z : HULL_Z;
        _p.set(halfBeamAt(z, 0) + 1, 0, z).applyMatrix4(g.matrixWorld);
        this.splashes.spawn(_p.x, this.waves.heightAt(_p.x, _p.z, t), _p.z, t, 2.2, 1, this.rand());
        this.emit('splash', _p, 0.8);
      }
    }
    const span = b.break - b.squeeze;
    for (let k = 0; k < 3; k++)
      if (this.once(CUE_GROAN + k, this.wrapAt + b.squeeze + 0.3 + (k * span) / 3)) {
        g.getWorldPosition(_p);
        this.emit('groan', _p, 1);
      }
    if (this.broke) {
      const w = time - this.wrapAt;
      if (w > b.sink - 1.5 && w < b.leave + 2 && this.rand() < 0.08 * (this.reducedMotion ? 0.5 : 1)) {
        const p = wreck.pieces.pieces[Math.floor(this.rand() * wreck.pieces.pieces.length)]!;
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
      for (let k = 0; k < wreck.pieces.pieces.length; k++)
        if (this.once(CUE_UNDER + k, this.wrapAt + b.sink + SINK_DELAY[k]! + 3.2)) {
          wreck.pieces.pieces[k]!.root.getWorldPosition(_p);
          this.splashes.spawn(_p.x, this.waves.heightAt(_p.x, _p.z, t), _p.z, t, 3, 1, this.rand());
          this.emit('sink', _p, 1);
        }
      if (this.once(CUE_DONE, this.wrapAt + b.sink + 4.5))
        this.emitEvent('done', 'wrap', this.brokeAt.x, this.brokeAt.z, 0, 0);
    }
  }

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

  private emitEvent(
    type: KrakenEventType,
    act: KrakenAct,
    x: number,
    z: number,
    radius: number,
    strikeIn: number,
  ): void {
    const e = this.event;
    e.type = type;
    e.act = act;
    e.x = x;
    e.z = z;
    e.radius = radius;
    e.strikeIn = strikeIn;
    for (const fn of this.listeners) fn(e);
  }

  /** Where the wrecked ship is (or broke), for a camera. */
  wreckPosition(out: Vector3): Vector3 {
    if (this.broke) return out.set(this.brokeAt.x, 0, this.brokeAt.z);
    if (this.wreck) return out.set(this.wreck.ship.group.position.x, 0, this.wreck.ship.group.position.z);
    return out.copy(this.kraken.group.position);
  }

  dispose(): void {
    for (const w of this.wrecks) w.pieces.dispose();
    this.kraken.dispose();
    this.hazards.dispose();
    this.marks.dispose();
    this.splashes.mesh.geometry.dispose();
    this.splinters.mesh.geometry.dispose();
  }
}

const HELD = { trim: 0, rudder: 0 };
const Y = new Vector3(0, 1, 0);

/** The ship's hull material (the caps are its planking). */
function shipMaterialOf(ship: Object3D): Material {
  const hull =
    ship.getObjectByName('rounded planked hull') ?? ship.getObjectByName('hull deck trim and stern (merged)');
  const m = (hull as Mesh | undefined)?.material;
  if (!m || Array.isArray(m)) throw new Error('kraken encounter: no hull material');
  return m;
}
