import { Group, Vector3, type Camera } from 'three/webgpu';
import type { TierSettings } from '../../engine/quality';
import type { KrakenHooks } from '../../course/catalog';
import { seededRandom, wrapAngle } from '../../util/math';
import type { WaveSampler } from '../contracts';
import { createBrigantine, type Brigantine, type BrigantineEnv } from '../ship';
import { pointOfSailCurve } from '../ship/dynamics';
import { halfBeamAt } from '../ship/lines';
import { windAt } from '../wind';
import { world } from '../uniforms';
import { KrakenEncounter, type KrakenEvent } from '../kraken/encounter';
import {
  HAZARD_SPECS,
  hazardImpactAt,
  type HazardArea,
  type HazardHit,
  type HazardKind,
  type KrakenHull,
  type TellPlan,
} from '../kraken/hazards';
import type { Battle, BattleBeat, BattleSound } from './battle';

/**
 * Battle 3's kraken (docs/specs/BATTLES.md §2.0c, "Trust the Evidence"): the battle's `kraken` event
 * and what it does for the rest of the battle.
 *
 * - **The beat** (after wave 1), quick and hard: a cut (the HUD's dip) to the sea ahead, where the
 *   evidence shows (bubbles, a dark shadow, a swirl, the danger ring) and the lookout calls it. The
 *   raiders' flagship is already close, sailing straight for it; as she reaches it the kraken seizes
 *   her (`wrapAndBreak(ship, { seize })`: four arms at once, the squeeze, torn in two, under, about
 *   10 s), and the battle carries on 16–18 s after the call. Your guns are held while it plays (the
 *   battle's `event` phase). Skip ends it at once.
 * - **It stays**: through each later wave's fight, tells rise near your ship (to make you dodge) and on
 *   a raider's course (so you can lead one over it), then an arm slams or sweeps and hits any ship in
 *   its area. A raider it strikes is seized and taken; your hull takes damage.
 * - **It retreats** once the last raider is gone, before the win card.
 *
 * The course's words (the flagship's name, the crew's lines) come from `KrakenHooks`; the captions here
 * are the game's own, like the battle's lookout calls. `update` allocates nothing.
 */
export interface KrakenActOptions {
  tier: TierSettings;
  /** The sea as it's drawn (sampled at the sea's clock). */
  waves: WaveSampler;
  battle: Battle;
  hooks: KrakenHooks;
  /** Open water at (x, z): the beat and the tells stay off islands and harbours. */
  openWater?: ((x: number, z: number) => boolean) | null;
  onSound?: (kind: BattleSound, pos: { x: number; y: number; z: number }, gain: number) => void;
  /** A voiced line of the course's, by id (the crew's calls). */
  say(line: string): void;
  caption(text: string): void;
  /** Staging beats for the camera (a raider taken). */
  beat(kind: BattleBeat, x: number, z: number): void;
  seed?: number;
}

/**
 * Where the beat's evidence lies from your ship (m), and how far short of it the flagship is when the
 * beat starts: close, on a diagonal toward your side of it, so the beat is short.
 */
const EVIDENCE_RANGE = 52;
const APPROACH = 55;
/** Her course's angle off the line from the evidence out to where she starts (radians, either side). */
const APPROACH_SKEW = 0.6;
/** The evidence's radius (m): the shadow and the ring. */
const EVIDENCE_RADIUS = 12;
/**
 * The beat opens with a cut: the HUD's dip to dark (battle-hud.css `bh-dip`) is darkest this long
 * (s) after it starts, and the flagship and the beat's camera come in then.
 */
const CUT_AT = 0.35;
/**
 * The kraken seizes her this near the evidence's middle (m), or once she's past it, or after this
 * long (s) whatever the wind does. Her sails stay set throughout, and so do her pieces'.
 */
const TAKE_WITHIN = 7;
const TAKE_AFTER = 10;
/** Wingman's word on it plays at the withdraw; the battle carries on this long (s) after it starts. */
const TAKEN_HOLD = 5;
/** The beat's camera: this far from the evidence (beyond your ship's bow), and from the wreck after. */
const EVIDENCE_VIEW = 50;
const WRAP_VIEW = 40;
/** The first tell of each wave's fight comes this long after the guns run out (s), then every GAP s. */
const FIRST_TELL = 4;
const GAP_MIN = 6.5;
const GAP_MAX = 9.5;
/** How long a struck arm stands before it withdraws (s). */
const STAND = 4;
/** Every third tell goes on a raider's course (a lure), the rest near your ship. */
const LURE_EVERY = 3;
/** Your hull takes this share of a hazard's damage (HAZARD_SPECS): it hurts, and it's still fair. */
const PLAYER_DAMAGE = 0.25;
/** A standing arm brushing her hull: half as much again (it's the strike that hurts). */
const STANDING_DAMAGE = 0.125;
/** Tells keep this far (m) from another hazard that's up. */
const TELL_SPACING = 30;

type Stage = 'off' | 'evidence' | 'approach' | 'wrap' | 'stay' | 'gone';

const SIDE_WORD = ['port', 'starboard'] as const;
/** The lookout's tell calls by where the evidence lies (prebuilt). */
const TELL_CALLS = {
  ahead: 'Bubbles dead ahead! Steer clear!',
  astern: 'Bubbles astern! Steer clear!',
  port: ['Bubbles off the port bow! Steer clear!', 'Bubbles on the port beam! Steer clear!'],
  starboard: ['Bubbles off the starboard bow! Steer clear!', 'Bubbles on the starboard beam! Steer clear!'],
} as const;

const _p = new Vector3();
const bow = new Float32Array(2);
const stern = new Float32Array(2);
const wind = new Float32Array(2);
const HELM = { trim: 0.9, rudder: 0 };
const tellPlan: TellPlan = { x: 0, z: 0, heading: 0, kind: 'slam', radius: 0, tell: 0, eta: 0 };
const tellTarget = { x: 0, z: 0, heading: 0, speed: 0 };

export class KrakenAct {
  readonly group = new Group();
  readonly encounter: KrakenEncounter;
  readonly flagship: Brigantine;
  stage: Stage = 'off';
  /** What happened, for the debug API and the tests. */
  readonly log = {
    tells: 0,
    dodges: 0,
    /** Tells near your ship that struck without touching her. */
    dodged: 0,
    lures: 0,
    playerHits: 0,
    taken: 0,
    flagshipTaken: false,
  };
  private readonly o: KrakenActOptions;
  private readonly battle: Battle;
  private readonly rand: () => number;
  private readonly hulls: KrakenHull[] = [];
  private readonly hullList: KrakenHull[] = [];
  private readonly env: BrigantineEnv;
  /** Each raider slot's rig as the kraken has her cut (null: she can't be taken). */
  private readonly preparedRig: (string | null)[] = [];
  /** The evidence's spot and the flagship's course in the beat. */
  private readonly spot = { x: 0, z: 0, heading: 0 };
  private stageAt = 0;
  /** When the beat started, and when Wingman's word on the flagship started (battle clock; NaN none). */
  private beatAt = 0;
  private takenAt = NaN;
  /** Whether the beat's camera has made its cut. */
  private cutDone = false;
  private now = 0;
  private seaT = 0;
  private nextTellAt = Infinity;
  private tellCount = 0;
  private lastPhase = '';
  private lastWave = -1;
  /** The hazards up and when each goes down (battle clock), by slot. */
  private readonly hazardIds = new Int32Array(4);
  private readonly hazardDown = new Float32Array(4);
  /** Whether each one was placed near your ship, and whether it hit her. */
  private readonly hazardDodge = new Uint8Array(4);
  private readonly hazardHit = new Uint8Array(4);
  /** The raider it's taking (battle ship index, −1 none). */
  private takenIdx = -1;
  private readonly said = new Set<string>();
  private readonly ids: string[] = [];

  private constructor(o: KrakenActOptions, encounter: KrakenEncounter, flagship: Brigantine) {
    this.o = o;
    this.battle = o.battle;
    this.encounter = encounter;
    this.flagship = flagship;
    this.rand = seededRandom(o.seed ?? 0x6b7261);
    this.env = { waves: o.waves, ground: null, obstacles: [], t: 0 };
    this.group.name = 'kraken act';
    this.group.add(encounter.group, flagship.group);
    flagship.group.visible = false;
    // The battle takes raiders itself (it decides which can be), so the encounter doesn't on its own.
    encounter.autoCatch = false;
    for (let i = 0; i < o.battle.shipCount; i++) {
      const id = `ship${i}`;
      this.ids.push(id);
      this.hulls.push({
        id,
        bowX: 0,
        bowZ: 0,
        sternX: 0,
        sternZ: 0,
        halfBeam: halfBeamAt(0, 1),
        catchable: false,
      });
      this.preparedRig.push(null);
    }
    encounter.setHulls(this.hullList);
    encounter.on((e) => this.onKraken(e));
  }

  static async create(o: KrakenActOptions): Promise<KrakenAct> {
    // The battle shows the evidence itself, and the kraken seizes (KRAKEN_TIMING_BATTLE).
    const encounter = await KrakenEncounter.create({ tier: o.tier, waves: o.waves, onSound: o.onSound });
    // The flagship draws like the other raiders (a lighter brigantine with the raiders' livery).
    const flagship = createBrigantine({
      tier: o.tier.tier === 'ultra' || o.tier.tier === 'high' ? 'medium' : o.tier.tier,
      oceanInteraction: false,
      raider: true,
    });
    flagship.setName(o.hooks.flagship);
    flagship.setRig('brigantine');
    await flagship.figurehead;
    return new KrakenAct(o, encounter, flagship);
  }

  /**
   * Cuts every hull the kraken may break ahead of time, as each will be when it's taken: the flagship,
   * and each raider slot in the rig it sails after the beat (a slot that changes rig can't be taken).
   * Call once the raiders' figureheads are aboard, before the warm.
   */
  prepare(afterWave: number): void {
    const b = this.battle;
    const show = this.flagship.group.visible;
    this.flagship.group.visible = true;
    this.encounter.prepare(this.flagship, 'flagship');
    this.flagship.group.visible = show;
    for (let i = 1; i < b.shipCount; i++) {
      let rig: 'cutter' | 'brigantine' | null = null;
      let same = true;
      for (let w = afterWave; w < b.plan.length; w++) {
        const r = b.rigIn(w, i);
        if (r === null) continue;
        if (rig && r !== rig) same = false;
        rig = r;
      }
      if (!rig || !same) continue;
      const ship = b.shipAt(i);
      const visible = ship.group.visible;
      ship.setRig(rig);
      ship.group.visible = true;
      this.encounter.prepare(ship, this.ids[i]!);
      ship.group.visible = visible;
      this.preparedRig[i] = rig;
    }
  }

  /** For the battle's warm: the flagship, the kraken, the hazards and their marks drawn once. */
  stageWarm(): () => void {
    const show = this.flagship.group.visible;
    this.flagship.group.visible = true;
    const undo = this.encounter.stageWarm();
    return () => {
      undo();
      this.flagship.group.visible = show;
    };
  }

  /** True while the beat plays (the battle's `event` phase). */
  get playing(): boolean {
    return this.stage === 'evidence' || this.stage === 'approach' || this.stage === 'wrap';
  }

  /**
   * The battle's `kraken` event: the evidence ahead and the flagship, close, sailing into it. False
   * (the battle goes straight on) when there's no open water for it.
   */
  begin(t: number): boolean {
    if (this.stage !== 'off') return false;
    const p = this.battle.shipAt(0).dynamics.pose;
    windAt(p.x, p.z, t, wind);
    // Off the bow on either side; she crosses your view on her best point of sail.
    let best = -Infinity;
    for (let k = 0; k < 8; k++) {
      const off = (k % 2 === 0 ? 1 : -1) * (0.5 + 0.2 * Math.floor(k / 2));
      const b = p.heading + off;
      const sx = p.x + Math.sin(b) * EVIDENCE_RANGE;
      const sz = p.z + Math.cos(b) * EVIDENCE_RANGE;
      for (let turn = -1; turn <= 1; turn += 2) {
        // From beyond the evidence, toward your side of it.
        const h = b + Math.PI + turn * APPROACH_SKEW;
        const qx = sx - Math.sin(h) * APPROACH;
        const qz = sz - Math.cos(h) * APPROACH;
        const mx = (sx + qx) / 2;
        const mz = (sz + qz) / 2;
        if (!this.open(sx, sz) || !this.open(qx, qz) || !this.open(mx, mz)) continue;
        const score = pointOfSailCurve(Math.sin(h) * wind[0]! + Math.cos(h) * wind[1]!) - Math.abs(off) * 0.2;
        if (score > best) {
          best = score;
          this.spot.x = sx;
          this.spot.z = sz;
          this.spot.heading = h;
        }
      }
    }
    if (best === -Infinity) return false;
    const s = this.spot;
    const qx = s.x - Math.sin(s.heading) * APPROACH;
    const qz = s.z - Math.cos(s.heading) * APPROACH;
    // Her sails are set before she's ever drawn, and she's under way; she shows at the cut.
    const f = this.flagship;
    f.dynamics.setInput(HELM);
    f.restartMotion(qx, qz, s.heading);
    f.dynamics.forwardSpeed = 6;
    f.dynamics.pose.speed = 6;
    f.group.position.set(qx, 0, qz);
    f.group.rotation.set(0, s.heading, 0);
    f.group.visible = false;
    this.encounter.reducedMotion = world.reducedMotion.value > 0.5;
    this.encounter.showEvidence(s.x, s.z, EVIDENCE_RADIUS, 0.8);
    // The lookout calls the evidence, then the flagship sailing over it (one after the other).
    const l = this.o.hooks.lines;
    this.o.say(l.evidence);
    this.o.say(l.flagship);
    this.beatAt = t;
    this.takenAt = NaN;
    this.cutDone = false;
    this.setStage('evidence', t);
    return true;
  }

  /** Skip: the beat ends at once (the flagship's gone under), and the next wave comes. */
  skip(): void {
    if (!this.playing) return;
    this.encounter.release();
    this.encounter.fadeEvidence();
    this.flagship.group.visible = false;
    this.log.flagshipTaken = true;
    this.endBeat();
  }

  /**
   * Where the camera looks while the beat plays (between the evidence and the flagship, then the
   * wreck), and how far back from it (`d`, m), from the cut on. `cut`: the first frame of the shot
   * (the camera jumps there under the dip, not a swoop across the sea).
   */
  focus(out: { x: number; z: number; d: number; cut: boolean }): boolean {
    if (!this.playing || this.now - this.beatAt < CUT_AT) return false;
    out.cut = !this.cutDone;
    this.cutDone = true;
    if (this.stage === 'wrap') {
      this.encounter.wreckPosition(_p);
      out.x = _p.x;
      out.z = _p.z;
      out.d = WRAP_VIEW;
      return true;
    }
    const p = this.flagship.dynamics.pose;
    out.x = this.spot.x * 0.75 + p.x * 0.25;
    out.z = this.spot.z * 0.75 + p.z * 0.25;
    out.d = EVIDENCE_VIEW;
    return true;
  }

  private setStage(stage: Stage, t: number): void {
    this.stage = stage;
    this.stageAt = t;
  }

  private open(x: number, z: number): boolean {
    return !this.o.openWater || this.o.openWater(x, z);
  }

  private sayOnce(line: string, ...after: string[]): void {
    if (this.said.has(line)) return;
    this.said.add(line);
    this.o.say(line);
    for (const a of after) this.said.add(a);
  }

  /** One frame: `t` the battle's clock, `seaT` the sea's (the drawn waves). */
  update(dt: number, t: number, seaT: number, camera: Camera | null): void {
    this.now = t;
    this.seaT = seaT;
    const rm = world.reducedMotion.value > 0.5;
    if (this.encounter.reducedMotion !== rm && !this.playing) this.encounter.reducedMotion = rm;
    this.beatFrame(dt, t);
    this.stayFrame(t);
    this.fillHulls();
    this.encounter.hazards.areas(this.battle.avoidAreas as HazardArea[]);
    this.encounter.update(dt, seaT, camera);
  }

  private beatFrame(dt: number, t: number): void {
    const f = this.flagship;
    const age = t - this.stageAt;
    if (this.stage === 'evidence') {
      this.steerFlagship(dt);
      // She shows at the cut, the dip at its darkest.
      if (age >= CUT_AT) {
        f.group.visible = true;
        this.setStage('approach', t);
      }
    } else if (this.stage === 'approach') {
      this.steerFlagship(dt);
      const p = f.dynamics.pose;
      const dx = this.spot.x - p.x;
      const dz = this.spot.z - p.z;
      const along = dx * Math.sin(p.heading) + dz * Math.cos(p.heading);
      if (Math.hypot(dx, dz) < TAKE_WITHIN || along < 0 || age > TAKE_AFTER) {
        this.encounter.reducedMotion = world.reducedMotion.value > 0.5;
        if (this.encounter.wrapAndBreak(f, { seize: true, side: this.sideFacingYou(f) }))
          this.setStage('wrap', t);
        else this.skip();
      }
    } else if (this.stage === 'wrap') {
      // Seized, she coasts to a stop in its grip (the encounter takes her way off).
      this.updateFlagship(dt);
      // The evidence gives way to what it was evidence of.
      if (age >= this.encounter.beats.grip) this.encounter.fadeEvidence();
      if ((this.encounter.phase() === 'withdraw' || this.encounter.free()) && Number.isNaN(this.takenAt)) {
        this.takenAt = t;
        this.o.say(this.o.hooks.lines.taken);
      }
      if (this.encounter.free() && t - this.takenAt >= TAKEN_HOLD) {
        this.log.flagshipTaken = true;
        this.endBeat();
      }
    }
  }

  private endBeat(): void {
    const t = this.now;
    this.setStage('stay', t);
    this.encounter.release();
    this.flagship.group.visible = false;
    // Wingman's word on what it means for the rest of the fight, as the next wave comes.
    this.o.say(this.o.hooks.lines.stays);
    this.battle.endEvent(t);
  }

  /** The side of `ship` (her +x or −x, `wrapAndBreak`'s `side`) your ship is on: the kraken seizes her from it, in view. */
  private sideFacingYou(ship: Brigantine): number {
    const you = this.battle.shipAt(0).dynamics.pose;
    const p = ship.dynamics.pose;
    const x = (you.x - p.x) * Math.cos(p.heading) - (you.z - p.z) * Math.sin(p.heading);
    return x >= 0 ? 1 : -1;
  }

  /** The flagship holds her course over the evidence at a good trim (she doesn't read the signs). */
  private steerFlagship(dt: number): void {
    const d = this.flagship.dynamics;
    const err = wrapAngle(this.spot.heading - d.pose.heading);
    HELM.trim = 0.9;
    HELM.rudder = Math.max(-1, Math.min(1, err * 2.4 - d.headingRate * 1.2));
    d.setInput(HELM);
    this.updateFlagship(dt);
  }

  private updateFlagship(dt: number): void {
    this.env.t = this.seaT;
    this.flagship.update(dt, this.seaT, this.env);
  }

  /** The kraken through each later wave: tells near you and on raiders' courses, its arms down between. */
  private stayFrame(t: number): void {
    if (this.stage !== 'stay') return;
    const b = this.battle;
    const phase = b.phase;
    if (phase !== this.lastPhase || b.wave !== this.lastWave) {
      const was = this.lastPhase;
      this.lastPhase = phase;
      this.lastWave = b.wave;
      // A new wave reuses the raiders' hulls: whatever it still holds, it lets go.
      if (phase === 'intro' && this.takenIdx >= 0) {
        this.encounter.release();
        this.takenIdx = -1;
      }
      if (phase === 'fight') this.nextTellAt = t + FIRST_TELL;
      else if (was === 'fight' || phase === 'won' || phase === 'skipped') {
        this.encounter.hazards.retreat();
        this.nextTellAt = Infinity;
      }
      // The last raider is gone: it goes back down for good.
      const last = b.wave >= b.plan.length - 1;
      if ((phase === 'lull' && last) || phase === 'won' || phase === 'skipped') {
        this.encounter.retreat();
        this.setStage('gone', t);
        if (phase !== 'skipped') this.o.say(this.o.hooks.lines.retreat);
        return;
      }
    }
    // Standing arms withdraw after a while, so the next tell has an arm.
    for (let k = 0; k < this.hazardIds.length; k++)
      if (this.hazardIds[k]! > 0 && t >= this.hazardDown[k]!) {
        this.encounter.hazards.down(this.hazardIds[k]!);
        if (this.hazardDodge[k] && !this.hazardHit[k]) this.log.dodged++;
        this.hazardIds[k] = 0;
      }
    if (phase !== 'fight' || t < this.nextTellAt) return;
    const max = this.o.tier.tier === 'lite' ? 1 : 2;
    if (this.encounter.hazards.count >= max) {
      this.nextTellAt = t + 1;
      return;
    }
    this.nextTellAt = t + GAP_MIN + (GAP_MAX - GAP_MIN) * this.rand();
    this.tell(t);
  }

  /**
   * Tests and the video: a tell now, on a raider's course (`lure`), near your ship (`dodge`), or on
   * your course where you'll be when it lands (`onYou`: hold her steady and it hits). False if none fits.
   */
  debugTell(aim: 'lure' | 'dodge' | 'onYou'): boolean {
    if (this.stage !== 'stay' || this.battle.phase !== 'fight') return false;
    return this.tell(this.now, aim);
  }

  /** The next tell: on a raider's course every third time (when one sails toward it), else near you. */
  private tell(t: number, force?: 'lure' | 'dodge' | 'onYou'): boolean {
    const b = this.battle;
    const kind: HazardKind = force === 'onYou' ? 'slam' : this.rand() < 0.5 ? 'slam' : 'sweep';
    let placed = false;
    let lure = false;
    if (force === 'onYou') {
      const p = b.shipAt(0).dynamics.pose;
      placed = this.place(p, kind, 'intercept', 1);
    } else if (force === 'lure' || (!force && (this.tellCount + 1) % LURE_EVERY === 0)) {
      // The raider holding her course best (the least turn), so the tell is where she'll really be.
      const you = b.shipAt(0).dynamics.pose;
      let best = -1;
      let steadiest = Infinity;
      for (let i = 1; i < b.shipCount; i++) {
        if (b.shipState(i) !== 'afloat' || !this.hulls[i]!.catchable) continue;
        const d = b.shipAt(i).dynamics;
        const p = d.pose;
        if (p.speed < 1.5 || Math.hypot(p.x - you.x, p.z - you.z) > 170) continue;
        if (Math.abs(d.headingRate) < steadiest) {
          steadiest = Math.abs(d.headingRate);
          best = i;
        }
      }
      if (best > 0) {
        placed = this.place(b.shipAt(best).dynamics.pose, kind, 'intercept', 1);
        lure = placed;
      }
    }
    if (!placed && force !== 'lure' && force !== 'onYou') {
      const side = this.rand() < 0.5 ? 1 : -1;
      const p = b.shipAt(0).dynamics.pose;
      placed = this.place(p, kind, 'dodge', side) || this.place(p, kind, 'dodge', -side);
    }
    if (!placed) return false;
    const id = this.encounter.hazardAt(tellPlan);
    if (id <= 0) return false;
    this.tellCount++;
    this.log.tells++;
    if (lure) this.log.lures++;
    else this.log.dodges++;
    for (let k = 0; k < this.hazardIds.length; k++)
      if (this.hazardIds[k] === 0) {
        const spec = HAZARD_SPECS[kind];
        this.hazardIds[k] = id;
        this.hazardDown[k] = t + hazardImpactAt(spec) + spec.danger + spec.follow + STAND;
        this.hazardDodge[k] = lure || force === 'onYou' ? 0 : 1;
        this.hazardHit[k] = 0;
        break;
      }
    return true;
  }

  /** Plans a tell for `p` into `tellPlan`; false when it'd be off open water or on another hazard. */
  private place(
    p: { x: number; z: number; heading: number; speed: number },
    kind: HazardKind,
    aim: 'dodge' | 'intercept',
    side: number,
  ): boolean {
    tellTarget.x = p.x;
    tellTarget.z = p.z;
    tellTarget.heading = p.heading;
    tellTarget.speed = p.speed;
    this.encounter.planTell(tellPlan, tellTarget, kind, aim, side);
    if (!this.open(tellPlan.x, tellPlan.z)) return false;
    for (const d of this.encounter.dangers(dangers))
      if (Math.hypot(d.x - tellPlan.x, d.z - tellPlan.z) < TELL_SPACING) return false;
    return true;
  }

  /** Each ship in the fight where the kraken's strikes test it (yours and the raiders afloat). */
  private fillHulls(): void {
    const b = this.battle;
    const list = this.hullList;
    list.length = 0;
    for (let i = 0; i < b.shipCount; i++) {
      if (b.shipState(i) !== 'afloat') continue;
      const ship = b.shipAt(i);
      const h = this.hulls[i]!;
      ship.bowWorld(bow);
      ship.sternWorld(stern);
      h.bowX = bow[0]!;
      h.bowZ = bow[1]!;
      h.sternX = stern[0]!;
      h.sternZ = stern[1]!;
      h.halfBeam = halfBeamAt(0, 1) * ship.group.scale.x;
      h.catchable = i > 0 && this.preparedRig[i] !== null && this.preparedRig[i] === b.rigIn(b.wave, i);
      list.push(h);
    }
  }

  private onKraken(e: Readonly<KrakenEvent>): void {
    const b = this.battle;
    const t = this.now;
    if (e.type === 'telling' && (e.act === 'slam' || e.act === 'sweep')) {
      if (!this.said.has(this.o.hooks.lines.tell)) this.sayOnce(this.o.hooks.lines.tell);
      else this.o.caption(tellCall(b.shipAt(0).dynamics.pose, e.x, e.z));
      return;
    }
    if (e.type === 'struck') {
      for (const h of e.hits) this.struck(h, t);
      return;
    }
    if (e.type === 'done' && e.act === 'wrap' && this.takenIdx >= 0) {
      b.letGo(this.takenIdx);
      this.takenIdx = -1;
    }
  }

  private struck(h: Readonly<HazardHit>, t: number): void {
    const b = this.battle;
    const i = this.ids.indexOf(h.shipId);
    if (i < 0 || b.shipState(i) !== 'afloat') return;
    if (i === 0) {
      for (let k = 0; k < this.hazardIds.length; k++)
        if (this.hazardIds[k] === h.hazardId) this.hazardHit[k] = 1;
      b.strikeFromBelow(0, h.damage * (h.strike ? PLAYER_DAMAGE : STANDING_DAMAGE), h.x, h.z, t);
      this.log.playerHits++;
      this.sayOnce(this.o.hooks.lines.hit);
      return;
    }
    // A strike that lands on a raider it can take: it seizes her.
    if (h.strike && this.hulls[i]!.catchable && this.takenIdx < 0 && this.encounter.free()) {
      const ship = b.shipAt(i);
      if (
        this.encounter.wrapAndBreak(ship, { seize: true, side: this.sideFacingYou(ship) }) &&
        b.take(i, t)
      ) {
        this.takenIdx = i;
        this.log.taken++;
        this.o.caption(`${b.shipName(i)} sailed over the evidence. The kraken has her!`);
        this.sayOnce(this.o.hooks.lines.lured);
        return;
      }
    }
    b.strikeFromBelow(i, h.damage, h.x, h.z, t);
  }

  dispose(): void {
    this.encounter.dispose();
    this.flagship.dispose();
  }
}

const dangers: HazardArea[] = [];

/** The lookout's call for a tell at (x, z), by where it lies from your bow. */
function tellCall(p: { x: number; z: number; heading: number }, x: number, z: number): string {
  const rel = wrapAngle(Math.atan2(x - p.x, z - p.z) - p.heading);
  const off = Math.abs(rel);
  if (off < 0.25) return TELL_CALLS.ahead;
  if (off > 2.6) return TELL_CALLS.astern;
  // Heading grows to port (the ship's +x side): a positive bearing is on her port side.
  const side = rel > 0 ? 0 : 1;
  return TELL_CALLS[SIDE_WORD[side]][off < 1.1 ? 0 : 1];
}
