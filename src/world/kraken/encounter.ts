import { Group, Matrix4, Vector3, type Camera, type Material, type Mesh, type Object3D } from 'three/webgpu';
import type { TierSettings } from '../../engine/quality';
import { clamp01, mulberry32 } from '../../util/math';
import type { BattleSound } from '../battle/battle';
import { SplashPool, SplinterPool, fxBudget } from '../battle/fx';
import type { WaveSampler } from '../contracts';
import type { Brigantine } from '../ship';
import { BRIGANTINE_HALF_LENGTH, deckHeightAt, halfBeamAt, sheerHeightAt } from '../ship/lines';
import { BRIGANTINE_MASTS } from '../ship/brigantine-rig';
import {
  Points,
  WRAP_SPOTS,
  ease,
  heavy,
  hullCoil,
  mastCoil,
  mirrorX,
  pullArc,
  railGrip,
  standPath,
  reachOver,
  freeStance,
  type FreeStance,
} from './arm-paths';
import {
  KrakenHazards,
  planTell,
  type HazardArea,
  type HazardHit,
  type HazardKind,
  type KrakenHull,
  type TellAim,
  type TellPlan,
  type TellTarget,
} from './hazards';
import { Kraken, poseFreeArm, type KrakenArm } from './kraken';
import { cutShip, type ShipPieces } from './ship-break';
import { AxisAim, CurvePath } from './tentacle-pose';
import { TellMarks, type MarkState } from './tell-marks';

/**
 * What the kraken does, driven by a battle (or the dev page): `rise(at)`, `wrapAndBreak(ship)`,
 * `hazard(at, kind)` and `retreat()`. It's huge, so it moves slowly and deliberately: its arms rise
 * one or two at a time, sway in long, slow undulations, and make big moves with a little
 * anticipation and an overshoot that settles. It gives its evidence before it acts (bubbles, a
 * shadow and a swirl under the water, a danger ring) and tells its driver through events:
 * - `telling`: evidence is showing; it acts in `strikeIn` seconds (the lookout's call goes here);
 * - `striking`: it acts now (its body or arms break the water, its arms grip a ship, a hazard lands);
 * - `done`: a wreck is under, a hazard's arm is down, or the kraken has gone.
 *
 * Every duration is data (`KRAKEN_TIMING`, `HAZARD_SPECS`), so a battle can tune them.
 *
 * A ship it wraps is the driver's: the encounter only reads her pose, holds her (her way comes off as
 * its arms grip), hides her when her pieces stand in, and never updates her. Cut her ahead of time
 * with `prepare(ship)` (in the battle's warm-up): her pieces must be drawn once before she breaks.
 */
export type KrakenEventType = 'telling' | 'striking' | 'struck' | 'caught' | 'done';
export type KrakenAct = 'rise' | 'wrap' | 'retreat' | HazardKind;

export interface KrakenEvent {
  type: KrakenEventType;
  act: KrakenAct;
  x: number;
  z: number;
  /** The danger radius (m) for a hazard; the shadow's for a rise or a wrap. */
  radius: number;
  /** Seconds until it acts (telling only): the eta. */
  strikeIn: number;
  /** `struck`: every ship hit this frame (reused: copy what you keep). */
  hits: readonly HazardHit[];
  /** `caught`: the raider it takes (her id from `prepare`). */
  shipId: string;
}

/** How long each part of a wrap takes (s). The battle can pass its own. */
export interface KrakenTiming {
  /** The evidence (bubbles, the shadow) before the first tip breaks the water. */
  tell: number;
  /** One arm, from its tip breaking the water to standing at its full height. */
  riseEach: number;
  /** The mean gap between one arm starting to rise and the next (each gap varies ±45 %). */
  riseGap: number;
  /** The highest arm's slow arc over the deck, and how long it hangs there. */
  arc: number;
  hang: number;
  /** The arms curling over the deck and closing round the hull and mast. */
  grip: number;
  /** The squeeze, the hull rolling and groaning, until she tears in two. */
  squeeze: number;
  /** The two halves pulled apart, masts falling outward. */
  apart: number;
  /** The halves dragged under (the foam bursts as they go). */
  under: number;
  /** The arms withdrawing, one after another. */
  withdraw: number;
  /**
   * The body and its eyes surfacing behind the wreck, then sinking, when a wrap asks for it
   * (`wrapAndBreak(ship, { finale: true })`; a battle leaves it off). 0: never.
   */
  finale: number;
  /** The arms' slow sway: its period (s) and size (m). */
  swayPeriod: number;
  swayAmp: number;
  /** The anticipation and the overshoot of a big move (0 for none). */
  anticipate: number;
  overshoot: number;
}

export const KRAKEN_TIMING: KrakenTiming = {
  tell: 3.5,
  riseEach: 4.5,
  riseGap: 1.0,
  arc: 4,
  hang: 2.5,
  grip: 6,
  squeeze: 4,
  apart: 3,
  under: 3.5,
  withdraw: 4,
  finale: 5,
  swayPeriod: 7,
  swayAmp: 0.9,
  anticipate: 0.05,
  overshoot: 0.07,
};

/** Reduced motion: shorter, gentler, no anticipation or overshoot, a smaller sway. */
export const KRAKEN_TIMING_GENTLE: KrakenTiming = {
  ...KRAKEN_TIMING,
  tell: 3,
  riseEach: 3.5,
  riseGap: 0.7,
  arc: 3,
  hang: 1.5,
  grip: 4.5,
  squeeze: 3,
  apart: 2.5,
  under: 3,
  withdraw: 3.5,
  finale: 4,
  swayAmp: 0.5,
  anticipate: 0,
  overshoot: 0,
};

/**
 * A raider taken mid-fight (a strike landed on her): smaller and faster, about 14 s from her being
 * caught to her pieces under; fewer arms (`QUICK_ROLES`), a short arc over her deck, no finale.
 */
export const KRAKEN_TIMING_QUICK: KrakenTiming = {
  ...KRAKEN_TIMING,
  tell: 0.6,
  riseEach: 2.0,
  riseGap: 0.35,
  arc: 1.2,
  hang: 0.3,
  grip: 2.2,
  squeeze: 2,
  apart: 1.8,
  under: 2.4,
  withdraw: 2.2,
  finale: 0,
};

/** Reduced motion's quick wrap: as long, gentler. */
export const KRAKEN_TIMING_QUICK_GENTLE: KrakenTiming = {
  ...KRAKEN_TIMING_QUICK,
  swayAmp: 0.5,
  anticipate: 0,
  overshoot: 0,
};

/** A wrap's beats: seconds after it starts, from the timing and how many arms rise. */
export interface WrapBeats {
  tips: number;
  /** When the last (highest) arm starts to rise. */
  lastRise: number;
  arc: number;
  hang: number;
  grip: number;
  squeeze: number;
  break: number;
  under: number;
  foam: number;
  withdraw: number;
  /** The gap between one arm starting to withdraw and the next. */
  withdrawStep: number;
  /** When the finale starts (with none, when the last arm is down). */
  finale: number;
  hasFinale: boolean;
  end: number;
}

export function wrapBeats(t: KrakenTiming, arms: number, finale = false): WrapBeats {
  const tips = t.tell;
  const lastRise = tips + t.riseGap * Math.max(0, arms - 1);
  const arc = lastRise + t.riseEach * 0.55;
  const hang = arc + t.arc;
  const grip = hang + t.hang;
  const squeeze = grip + t.grip;
  const brk = squeeze + t.squeeze;
  const under = brk + t.apart * 0.5;
  const foam = under + t.under * 0.4;
  const withdraw = brk + t.apart + t.under * 0.5;
  // Each arm takes a little over half the withdraw; the rest is the stagger between them.
  const withdrawStep = arms > 1 ? (0.45 * t.withdraw) / (arms - 1) : 0;
  const gone = withdraw + t.withdraw;
  const hasFinale = finale && t.finale > 0;
  // The finale's arms are the first three down: it starts once they are.
  const fin = hasFinale ? withdraw + 2 * withdrawStep + WITHDRAW_EACH * t.withdraw + 0.3 : gone;
  return {
    tips,
    lastRise,
    arc,
    hang,
    grip,
    squeeze,
    break: brk,
    under,
    foam,
    withdraw,
    withdrawStep,
    finale: fin,
    hasFinale,
    end: (hasFinale ? Math.max(gone, fin + t.finale) : gone) + 0.5,
  };
}

export type WrapPhase =
  | 'none'
  | 'tell'
  | 'tips'
  | 'rise'
  | 'arc'
  | 'hang'
  | 'grip'
  | 'squeeze'
  | 'break'
  | 'under'
  | 'withdraw'
  | 'finale'
  | 'surfaced'
  | 'retreat';

/**
 * What each arm does in a wrap (by its socket: 0 and 7 face the ship). It commits every arm: six
 * grip her (both sides of the hull, over the deck, round the foremast), and two rise high behind her
 * and arc in over her rails for the final pull. Lite's four (sockets 0, 1, 7, 6) all grip.
 */
type Role = 'mast' | 'bow' | 'stern' | 'gripFore' | 'gripAft' | 'farGrip' | 'pullFar' | 'pullNear';
const ROLE_OF: Readonly<Record<number, Role>> = {
  0: 'mast',
  7: 'bow',
  1: 'stern',
  6: 'gripFore',
  2: 'gripAft',
  3: 'farGrip',
  5: 'pullFar',
  4: 'pullNear',
};
/** The arms that rise round the body in the finale. */
const FINALE_ROLES: readonly Role[] = ['pullNear', 'pullFar', 'farGrip'];
/** The order they let go in: the finale's arms first, the highest (round the foremast) last. */
const WITHDRAW_ORDER: readonly Role[] = [
  'pullNear',
  'pullFar',
  'farGrip',
  'gripAft',
  'gripFore',
  'stern',
  'bow',
  'mast',
];
/** The arms a quick wrap (a raider caught mid-fight) uses: its grips and the foremast coil. */
const QUICK_ROLES: readonly Role[] = ['gripFore', 'farGrip', 'stern', 'bow', 'mast'];
const NO_HITS: readonly HazardHit[] = [];
/** One arm's withdraw, as a share of the whole (`KrakenTiming.withdraw`). */
const WITHDRAW_EACH = 0.55;
/** The order they rise in: tips beside the hull first, the highest (the arc over the deck) last. */
const RISE_ORDER: readonly Role[] = [
  'gripFore',
  'gripAft',
  'farGrip',
  'stern',
  'bow',
  'pullFar',
  'pullNear',
  'mast',
];
/** Which half each arm holds after she tears in two (0 the stern half, 1 the bow). */
const PIECE_OF: Readonly<Record<Role, number>> = {
  mast: 1,
  bow: 1,
  gripFore: 1,
  stern: 0,
  gripAft: 0,
  farGrip: 0,
  pullFar: 1,
  pullNear: 0,
};
/**
 * Where each arm breaks the water beside the ship (her frame: x to the kraken's side, z to her bow)
 * and how much of it stands over the water while it's free (m along it; it bends, so it stands
 * lower than that).
 */
const EMERGE: Readonly<Record<Role, readonly [number, number, number]>> = {
  mast: [6.5, 7.5, 13],
  bow: [5.6, 9.5, 14],
  stern: [6, -4.6, 14],
  gripFore: [5.4, 1.8, 12],
  gripAft: [5.6, -11.5, 12],
  farGrip: [-7.5, -5.5, 12],
  pullFar: [-11, 10.5, 19],
  pullNear: [11, -17.5, 19],
};
/** How far round the surfaced body its arms rise (m), and how much of each stands there. */
const RING = 11.5;
const RING_HEIGHT = 10;
/**
 * Where the kraken lies beside a ship it wraps (her frame), and how deep its body is. It lies
 * pitched toward her (`pitch`), its mantle trailing away under the water as an octopus's does when
 * it reaches: its ring of arms is higher and nearer her, so they reach her, and its head stays under.
 */
const ANCHOR = { x: 13, z: -1.5, depth: -8.5, pitch: -1.15 } as const;
/** The ship's one cut: she tears in two between the fore and main masts. */
const CUTS = [1.8] as const;

interface ArmState {
  arm: KrakenArm;
  k: number;
  role: Role;
  /** When it starts to rise (s after the wrap or rise starts). */
  riseAt: number;
  /** In this wrap (a quick one uses fewer arms), and its withdraw's start after the wrap's. */
  active: boolean;
  outAt: number;
  sway: number;
  stand: CurvePath;
  target: CurvePath;
  target2: CurvePath;
  /** Its visible height last frame (a ring of foam where it breaks the water). */
  shown: number;
}

const _m = new Matrix4();
const _p = new Vector3();
const _a = new Vector3();
const _o = new Vector3();
const _look = new Vector3();
const _b = new Vector3();
/** Where an arm's suckers face: the inside of a free arm's curve, or what a gripping arm holds. */
const _axisAim = new AxisAim();
const _ax = new Vector3();
/** The arc's free pose (its length, curl and bow set as it comes over). */
const _arcStance: FreeStance = { len: 0, curl: 0, bow: 0 };
/** How much of the highest arm arcs over her deck (m along it). */
const ARC_LENGTH = 20;
const _pts = new Points(64);
const _stance: FreeStance = { len: 0, curl: 0, bow: 0 };

export interface KrakenEncounterOptions {
  tier: TierSettings;
  waves: WaveSampler;
  onSound?: (kind: BattleSound, pos: { x: number; y: number; z: number }, gain: number) => void;
  /** The tentacle's folder (defaults to the game's pack). */
  base?: string;
  /** Timings to use instead of `KRAKEN_TIMING` (and its gentle one with reduced motion). */
  timing?: Partial<KrakenTiming>;
  /** The quick wrap's timings (a raider caught mid-fight) instead of `KRAKEN_TIMING_QUICK`. */
  quickTiming?: Partial<KrakenTiming>;
}

interface Wreck {
  ship: Brigantine;
  /** Her id in the battle's hulls (`setHulls`), so a strike that lands on her can catch her. */
  id: string;
  pieces: ShipPieces;
  /** Each rigging line's own opacity (they fade as their half goes under). */
  lineBase: number[];
}

type Mode = 'idle' | 'surfaced' | 'wrap';

export class KrakenEncounter {
  readonly group = new Group();
  readonly kraken: Kraken;
  readonly hazards: KrakenHazards;
  readonly marks: TellMarks;
  readonly splashes: SplashPool;
  readonly splinters: SplinterPool;
  /** Seconds since the encounter started (its own clock). */
  time = 0;
  private gentle = false;
  private finaleOn = false;
  private quick = false;
  private readonly timingQuick: KrakenTiming;
  private readonly timingQuickGentle: KrakenTiming;
  /** A raider a landed strike catches is taken at once (a battle can turn it off and call `wrapAndBreak`). */
  autoCatch = true;
  private beatsNow: WrapBeats;
  /** Camera shake for this frame (m), 0 with reduced motion. */
  shake = 0;
  private readonly timingFull: KrakenTiming;
  private readonly timingGentle: KrakenTiming;
  private readonly waves: WaveSampler;
  private readonly onSound: KrakenEncounterOptions['onSound'];
  private readonly listeners: ((e: Readonly<KrakenEvent>) => void)[] = [];
  private readonly event: KrakenEvent = {
    type: 'telling',
    act: 'rise',
    x: 0,
    z: 0,
    radius: 0,
    strikeIn: 0,
    hits: NO_HITS,
    shipId: '',
  };
  private readonly states: ArmState[] = [];
  private readonly fired = new Uint8Array(48);
  private readonly wrecks: Wreck[] = [];
  private rand = mulberry32(0x6b72);
  private mode: Mode = 'idle';
  /** When the rise or the wrap started, and when it was told to leave (encounter time; NaN none). */
  private startAt = NaN;
  private leaveAt = NaN;
  private wreck: Wreck | null = null;
  private broke = false;
  private tellMark: MarkState | null = null;
  private readonly foamMarks: (MarkState | null)[] = [];
  private readonly foamAt: number[] = [];
  private readonly brokeAt = { x: 0, z: 0, heading: 0, pitch: 0, roll: 0, scale: 1 };
  /** The evidence on its own (`showEvidence`): its mark, where and when it showed, and its ring. */
  private evidenceMark: MarkState | null = null;
  private readonly evidenceAt = { x: 0, z: 0, radius: 0, ring: 0, from: 0, fadeFrom: NaN };
  private readonly sound = { x: 0, y: 0, z: 0 };
  private readonly anchor = new Vector3();
  private anchorHeading = 0;
  private trim = 0;
  private t = 0;

  private constructor(
    o: KrakenEncounterOptions,
    kraken: Kraken,
    hazards: KrakenHazards,
    marks: TellMarks,
    splashes: SplashPool,
  ) {
    this.waves = o.waves;
    this.onSound = o.onSound;
    this.timingFull = { ...KRAKEN_TIMING, ...o.timing };
    this.timingGentle = { ...KRAKEN_TIMING_GENTLE, ...o.timing };
    this.timingQuick = { ...KRAKEN_TIMING_QUICK, ...o.quickTiming };
    this.timingQuickGentle = { ...KRAKEN_TIMING_QUICK_GENTLE, ...o.quickTiming };
    this.beatsNow = wrapBeats(this.timingFull, kraken.arms.length);
    this.kraken = kraken;
    this.hazards = hazards;
    this.marks = marks;
    this.splashes = splashes;
    this.group.name = 'kraken encounter';
    const budget = fxBudget(o.tier);
    this.splinters = new SplinterPool(budget.splinters);
    if (budget.splinters === 0) this.splinters.mesh.visible = false;
    this.group.add(kraken.group, hazards.kraken.group, marks.group, splashes.mesh, this.splinters.mesh);
    kraken.arms.forEach((arm, k) => {
      this.states.push({
        arm,
        k,
        role: ROLE_OF[arm.index] ?? 'pullNear',
        riseAt: 0,
        active: true,
        outAt: 0,
        sway: arm.index * 1.7,
        stand: new CurvePath(24, 5),
        target: new CurvePath(48, 4),
        target2: new CurvePath(48, 4),
        shown: 0,
      });
    });
    // Rise order: the order's roles first, any others after.
    this.states.sort((a, b) => RISE_ORDER.indexOf(a.role) - RISE_ORDER.indexOf(b.role));
    kraken.onPose = (arm, k) => this.poseArm(arm, k);
    this.reset();
  }

  static async create(o: KrakenEncounterOptions): Promise<KrakenEncounter> {
    // Every arm is the slim one: thick at its root (under the water), tapering long and thin above it.
    const kraken = await Kraken.load({ tier: o.tier.tier, base: o.base, slim: [0, 1, 2, 3, 4, 5, 6, 7] });
    const lite = o.tier.tier === 'lite';
    const marks = new TellMarks(lite ? 5 : 8);
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
          enc?.foam(
            a.x + Math.sin(a.heading) * a.radius * 0.3,
            a.z + Math.cos(a.heading) * a.radius * 0.3,
            4,
            a.radius,
            4,
          );
          _p.set(a.x, 0, a.z);
          enc?.emit('splash', _p, 1.4);
        },
        emerging: (at) => enc?.breakWater(at.x, at.z, 0.8),
        done: (kind) => enc?.emitEvent('done', kind, 0, 0, 0, 0),
        struck: (hits) => enc?.onStruck(hits),
      },
    });
    enc = new KrakenEncounter(o, kraken, hazards, marks, splashes);
    return enc;
  }

  /** Reduced motion: the gentle timing, smaller splashes, no shake. */
  get reducedMotion(): boolean {
    return this.gentle;
  }

  set reducedMotion(on: boolean) {
    this.gentle = on;
    this.beatsNow = wrapBeats(this.timing, this.activeArms(), this.finaleOn);
  }

  private activeArms(): number {
    let n = 0;
    for (const s of this.states) if (!this.quick || QUICK_ROLES.includes(s.role)) n++;
    return n;
  }

  /** The timing in use (the gentle one with reduced motion). */
  get timing(): KrakenTiming {
    if (this.quick) return this.gentle ? this.timingQuickGentle : this.timingQuick;
    return this.gentle ? this.timingGentle : this.timingFull;
  }

  /** The wrap's beats now (s after it starts). */
  get beats(): WrapBeats {
    return this.beatsNow;
  }

  on(fn: (e: Readonly<KrakenEvent>) => void): () => void {
    this.listeners.push(fn);
    return () => {
      const i = this.listeners.indexOf(fn);
      if (i >= 0) this.listeners.splice(i, 1);
    };
  }

  /**
   * Cuts `ship` into her two halves ahead of time (in the warm-up, with her rig and figurehead as
   * they'll be). They join the encounter's group, hidden; its warm (`stageWarm`) draws them.
   */
  prepare(ship: Brigantine, id = ''): void {
    const old = this.wrecks.findIndex((w) => w.ship === ship);
    if (old >= 0) {
      this.group.remove(this.wrecks[old]!.pieces.group);
      this.wrecks[old]!.pieces.dispose();
      this.wrecks.splice(old, 1);
    }
    const pieces = cutShip(ship.group, CUTS, shipMaterialOf(ship.group));
    pieces.group.visible = false;
    this.group.add(pieces.group);
    const lineBase: number[] = [];
    for (const p of pieces.pieces) for (const m of p.lineMaterials) lineBase.push(m.opacity);
    this.wrecks.push({ ship, id, pieces, lineBase });
  }

  /** Back to calm: the kraken deep and hidden, no hazards, any wrecked ship whole again (shown). */
  reset(): void {
    this.time = 0;
    this.mode = 'idle';
    this.startAt = this.leaveAt = NaN;
    this.broke = false;
    this.fired.fill(0);
    this.rand = mulberry32(0x6b72);
    this.marks.clear();
    this.tellMark = null;
    this.evidenceMark = null;
    this.foamMarks.length = 0;
    this.foamAt.length = 0;
    this.hazards.reset();
    for (const w of this.wrecks) {
      // The ship it was taking is whole again; any other ship is its driver's to show or hide.
      if (w === this.wreck) w.ship.group.visible = true;
      this.restorePieces(w);
    }
    this.wreck = null;
    this.splashes.clear();
    this.splinters.clear();
    for (const s of this.states) {
      s.arm.weight = 0;
      s.arm.sink = s.arm.length + 4;
      s.shown = 0;
    }
    this.kraken.body.root.position.set(0, -16, 0);
    this.kraken.group.visible = false;
  }

  /** A wreck's pieces whole and hidden again (a hull the battle sails again can be taken again). */
  private restorePieces(w: Wreck): void {
    w.pieces.group.visible = false;
    let i = 0;
    for (const p of w.pieces.pieces) {
      p.root.visible = true;
      p.pivot.rotation.set(0, 0, 0);
      for (const m of p.lineMaterials) m.opacity = w.lineBase[i++]!;
      for (const l of p.lines) l.visible = true;
    }
  }

  /** Surfaces at (x, z), facing `heading`, after its tell: its arms rise round it, one or two at a time. */
  rise(x: number, z: number, heading: number): void {
    if (this.mode !== 'idle' && Number.isNaN(this.leaveAt)) return;
    this.begin('surfaced');
    this.anchor.set(x, 0, z);
    this.anchorHeading = heading;
    this.kraken.group.position.copy(this.anchor);
    this.kraken.group.rotation.y = heading;
    this.emitEvent('telling', 'rise', x, z, 11, this.timing.tell);
  }

  /**
   * Wraps `ship` (prepared with `prepare`) and tears her in two, from under the water beside her:
   * its evidence, then tips beside her hull, arms rising round her, one arcing over her deck, the
   * grip, the squeeze, the tear, the halves dragged under, the arms withdrawing, and (with a finale)
   * its body and eyes surfacing behind the wreck. It follows her if she's under way.
   */
  wrapAndBreak(ship: Brigantine, o?: { finale?: boolean; quick?: boolean }): boolean {
    const wreck = this.wrecks.find((w) => w.ship === ship);
    if (!wreck || wreck === this.wreck || !this.free()) return false;
    this.finaleOn = !!o?.finale && !o?.quick;
    this.quick = !!o?.quick;
    this.beatsNow = wrapBeats(this.timing, this.activeArms(), this.finaleOn);
    this.restorePieces(wreck);
    this.wreck = wreck;
    this.broke = false;
    this.trim = ship.dynamics.control.trim;
    // Evidence shown ahead of it hands over to the wrap's own.
    this.fadeEvidence();
    this.begin('wrap');
    this.anchorFor(ship);
    this.kraken.group.position.copy(this.anchor);
    this.kraken.group.rotation.y = this.anchorHeading;
    this.emitEvent('telling', 'wrap', this.anchor.x, this.anchor.z, 11, this.timing.tell);
    return true;
  }

  /** True when it can take a ship now: not wrapping one, or its last wrap is over. */
  free(): boolean {
    if (this.mode === 'idle') return true;
    if (this.mode === 'wrap') return this.time - this.startAt >= this.beatsNow.end;
    return !Number.isNaN(this.leaveAt) && this.time - this.leaveAt > this.timing.withdraw + 4;
  }

  /**
   * The ships its strikes can hit (the player's and the raiders'), their hulls updated in place by
   * the battle each frame. A strike landing on a `catchable` raider prepared with her id is `caught`.
   */
  setHulls(hulls: readonly KrakenHull[]): void {
    this.hazards.setHulls(hulls);
  }

  /** Where the next tell goes, near the player (`dodge`) or on a raider's course (`intercept`). */
  planTell(out: TellPlan, target: Readonly<TellTarget>, kind: HazardKind, aim: TellAim, side = 1): TellPlan {
    return planTell(out, target, kind, aim, side);
  }

  /** Starts a hazard where `planTell` put it; returns its id (0 if every arm is busy). */
  hazardAt(plan: Readonly<TellPlan>): number {
    return this.hazards.start(plan.kind, plan.x, plan.z, plan.heading);
  }

  /** Ships hit this frame: the event, then a raider caught (if it can take her). */
  private onStruck(hits: readonly HazardHit[]): void {
    const e = this.event;
    e.hits = hits;
    this.emitEvent('struck', hits[0]!.kind, hits[0]!.x, hits[0]!.z, 0, 0);
    e.hits = NO_HITS;
    for (const h of hits) {
      if (!h.strike || !this.autoCatch || !this.hazards.catchable(h.shipId)) continue;
      const wreck = this.wrecks.find((w) => w.id === h.shipId);
      if (!wreck || !this.wrapAndBreak(wreck.ship, { quick: true })) continue;
      e.shipId = h.shipId;
      this.emitEvent('caught', 'wrap', h.x, h.z, 0, 0);
      e.shipId = '';
      return;
    }
  }

  private begin(mode: Mode): void {
    this.mode = mode;
    this.startAt = this.time;
    this.leaveAt = NaN;
    this.fired.fill(0);
    this.kraken.group.visible = true;
    this.kraken.body.root.position.set(0, mode === 'wrap' ? ANCHOR.depth - 4 : -16, 0);
    if (mode !== 'wrap') this.quick = false;
    // Each arm's rise: one or two at a time, a varied gap between them.
    let at = this.timing.tell;
    for (const s of this.states) {
      s.active = mode !== 'wrap' || !this.quick || QUICK_ROLES.includes(s.role);
      s.riseAt = s.active ? at : Infinity;
      s.shown = 0;
      s.arm.sink = 0;
      s.arm.weight = 1;
      if (s.active) at += this.timing.riseGap * (0.55 + 0.9 * this.rand());
    }
    // Their withdraw, in order (the finale's arms first), over the arms in this wrap.
    let rank = 0;
    for (const role of WITHDRAW_ORDER)
      for (const s of this.states)
        if (s.role === role && s.active) s.outAt = rank++ * this.beatsNow.withdrawStep;
    this.tellMark ??= this.marks.acquire();
    if (this.tellMark) {
      this.tellMark.radius = 12;
      this.tellMark.arc = Math.PI * 2;
    }
  }

  hazard(x: number, z: number, kind: HazardKind, heading = 0): number {
    return this.hazards.start(kind, x, z, heading);
  }

  /**
   * The evidence on its own, before the kraken acts (a battle shows it and lets a ship sail into it):
   * bubbles, the shadow and the swirl under the water at (x, z), `radius` m across, with the danger
   * ring at `ring` (0…1). It stays until a wrap starts (it hands over to the wrap's own), or until
   * `fadeEvidence` or `reset`.
   */
  showEvidence(x: number, z: number, radius: number, ring = 0): void {
    this.evidenceMark ??= this.marks.acquire();
    const e = this.evidenceAt;
    e.x = x;
    e.z = z;
    e.radius = radius;
    e.ring = ring;
    e.from = this.time;
    e.fadeFrom = NaN;
  }

  /** The evidence fades out (over two seconds). */
  fadeEvidence(): void {
    if (this.evidenceMark && Number.isNaN(this.evidenceAt.fadeFrom)) this.evidenceAt.fadeFrom = this.time;
  }

  /** Whether the evidence shows now. */
  get evidenceShown(): boolean {
    return !!this.evidenceMark;
  }

  private updateEvidence(t: number): void {
    const m = this.evidenceMark;
    if (!m) return;
    const e = this.evidenceAt;
    const age = this.time - e.from;
    const fade = Number.isNaN(e.fadeFrom) ? 1 : 1 - ease((this.time - e.fadeFrom) / 2);
    if (fade <= 0) {
      this.marks.release(m);
      this.evidenceMark = null;
      return;
    }
    const told = ease(age / 2);
    m.x = e.x;
    m.z = e.z;
    m.radius = e.radius;
    m.heading = 0;
    m.arc = Math.PI * 2;
    m.shadow = 0.95 * told * fade;
    m.ring = e.ring * ease(age / 1.5) * fade;
    m.foam = 0;
    m.spin = age * (0.6 + 0.6 * told);
    // Bubbles over the shadow.
    if (fade > 0.5 && this.rand() < (this.reducedMotion ? 0.15 : 0.35)) {
      const r = Math.sqrt(this.rand()) * e.radius * 0.6;
      const a = this.rand() * Math.PI * 2;
      const x = e.x + Math.cos(a) * r;
      const z = e.z + Math.sin(a) * r;
      this.splashes.spawn(x, this.waves.heightAt(x, z, t), z, t, 0.6 + this.rand() * 0.6, 0, this.rand());
    }
  }

  /**
   * Lets go of the ship it took, at once: her pieces hidden, its arms down and the kraken free and
   * hidden (a battle skipping the beat, or a new wave reusing her hull). Her own ship stays as her
   * driver left it (hidden while her pieces stood in).
   */
  release(): void {
    if (this.mode !== 'wrap') return;
    const w = this.wreck;
    if (w) w.pieces.group.visible = false;
    this.wreck = null;
    this.broke = false;
    this.mode = 'idle';
    this.startAt = this.leaveAt = NaN;
    this.quick = false;
    if (this.tellMark) {
      this.marks.release(this.tellMark);
      this.tellMark = null;
    }
    for (const s of this.states) {
      s.arm.weight = 0;
      s.arm.sink = s.arm.length + 4;
      s.shown = 0;
    }
    this.kraken.body.root.position.set(0, -16, 0);
    this.kraken.group.visible = false;
  }

  /** The kraken goes back under: its arms let go and withdraw, its hazards sink, then its body. */
  retreat(): void {
    this.hazards.retreat();
    if (this.mode === 'idle' || !Number.isNaN(this.leaveAt)) return;
    this.leaveAt = this.time;
    this.emitEvent('telling', 'retreat', this.anchor.x, this.anchor.z, 0, 0);
  }

  hitsHull(bowX: number, bowZ: number, sternX: number, sternZ: number, halfBeam: number): boolean {
    return this.hazards.hitsHull(bowX, bowZ, sternX, sternZ, halfBeam);
  }

  dangers(out: HazardArea[]): HazardArea[] {
    return this.hazards.dangers(out);
  }

  /** Where it stands (for a camera or a HUD). */
  phase(): WrapPhase {
    if (this.mode === 'idle') return 'none';
    const w = this.time - this.startAt;
    const b = this.beats;
    if (!Number.isNaN(this.leaveAt) && (this.mode !== 'wrap' || this.time - this.leaveAt < 8))
      return 'retreat';
    if (w < b.tips) return 'tell';
    if (this.mode === 'surfaced') return w < b.lastRise + this.timing.riseEach ? 'rise' : 'surfaced';
    if (w < b.tips + this.timing.riseGap * 1.5) return 'tips';
    if (w < b.arc) return 'rise';
    if (w < b.hang) return 'arc';
    if (w < b.grip) return 'hang';
    if (w < b.squeeze) return 'grip';
    if (w < b.break) return 'squeeze';
    if (w < b.under) return 'break';
    if (w < b.withdraw) return 'under';
    if (w < b.finale) return 'withdraw';
    if (w < b.end) return 'finale';
    return 'none';
  }

  /** How far through the current phase it is, 0…1 (for a camera's slow push-in). */
  phaseProgress(): number {
    const w = this.time - this.startAt;
    const b = this.beats;
    switch (this.phase()) {
      case 'tell':
        return span(w, 0, b.tips);
      case 'tips':
      case 'rise':
        return span(w, b.tips, b.arc);
      case 'arc':
        return span(w, b.arc, b.hang);
      case 'hang':
        return span(w, b.hang, b.grip);
      case 'grip':
        return span(w, b.grip, b.squeeze);
      case 'squeeze':
        return span(w, b.squeeze, b.break);
      case 'break':
      case 'under':
        return span(w, b.break, b.withdraw);
      case 'withdraw':
        return span(w, b.withdraw, b.finale);
      case 'finale':
        return span(w, b.finale, b.end);
      default:
        return 0;
    }
  }

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
    this.t = t;
    const w = this.time - this.startAt;
    const b = this.beats;
    const wreck = this.wreck;
    if (wreck && this.mode === 'wrap') {
      wreck.ship.group.updateMatrixWorld(true);
      if (!this.broke) this.anchorFor(wreck.ship);
      // Held: her way comes off as its arms close on her (her sails come in as the trim falls).
      if (w >= b.grip - 2) {
        this.trim = Math.max(0, this.trim - dt * 0.35);
        HELD.trim = this.trim;
        wreck.ship.dynamics.setInput(HELD);
      }
      const showPieces = w >= b.squeeze;
      wreck.ship.group.visible = !showPieces;
      wreck.pieces.group.visible = showPieces;
      if (showPieces) this.placePieces(wreck, w, t);
      if (w >= b.break && !this.broke) this.breakApart(wreck, t);
      if (w >= b.end && Number.isNaN(this.leaveAt)) this.leaveAt = this.time;
      // Done with her: the wreck goes back to its driver, and the kraken is free (and hidden) again.
      if (w >= b.end + WRAP_LINGER) this.release();
    }
    if (this.mode !== 'idle') {
      // It swims slowly to its place beside the ship (or stays where it rose).
      const g = this.kraken.group;
      const k = 1 - Math.exp(-dt * 0.6);
      g.position.lerp(this.anchor, k);
      g.rotation.y +=
        Math.atan2(Math.sin(this.anchorHeading - g.rotation.y), Math.cos(this.anchorHeading - g.rotation.y)) *
        k;
      this.moveBody(w, b);
      for (const s of this.states) s.arm.sink = this.armHidden(s, w, b) ? s.arm.length + 4 : 0;
    }
    this.kraken.place();
    if (this.mode !== 'idle') {
      if (this.wreck) this.wreck.ship.group.getWorldPosition(_look);
      else if (camera) camera.getWorldPosition(_look);
      const anger = this.mode === 'wrap' && w > b.grip && w < b.withdraw ? 1 : 0;
      this.kraken.update(dt, t, camera, _look, anger);
    }
    this.updateTell(w, b);
    this.updateEvidence(t);
    this.hazards.update(dt, t, camera);
    this.updateFoam();
    this.marks.update(t, this.waves);
    this.splashes.sync(t);
    this.splinters.update(dt, t, this.waves);
    if (this.mode !== 'idle') this.cues(w, b, t);
    this.shake = Math.max(0, this.shake - dt * 0.5);
    if (!this.reducedMotion && this.mode === 'wrap' && w > b.squeeze && w < b.break)
      this.shake = Math.max(this.shake, 0.05 * this.squeezeAt(w));
    if (this.reducedMotion) this.shake = 0;
  }

  /** The body: deep beside a ship it wraps (its shadow under the water), surfaced for a rise or the finale. */
  private moveBody(w: number, b: WrapBeats): void {
    const body = this.kraken.body;
    const tm = this.timing;
    let y: number;
    if (this.mode === 'wrap') {
      const fin = b.hasFinale
        ? heavy((w - b.finale) / (tm.finale * 0.4), tm.anticipate, tm.overshoot) *
          (1 - ease((w - b.end + 0.5 + tm.finale * 0.5) / (tm.finale * 0.45)))
        : 0;
      const down = ease((w - b.tips + 2) / 4);
      y = ANCHOR.depth - 4 * (1 - down) + (body.surfaced - ANCHOR.depth) * fin;
      body.root.rotation.x = ANCHOR.pitch * (1 - fin);
    } else {
      body.root.rotation.x = 0;
      const up = heavy((w - tm.tell - 1.5) / (tm.riseEach * 1.1), tm.anticipate, tm.overshoot);
      y = -16 + (16 + body.surfaced) * up;
    }
    if (!Number.isNaN(this.leaveAt) && this.mode !== 'wrap')
      y -= 17 * ease((this.time - this.leaveAt - 2) / 5);
    body.root.position.y = y + Math.sin(this.t * 0.4) * 0.2;
  }

  private armHidden(s: ArmState, w: number, b: WrapBeats): boolean {
    if (!s.active || w < s.riseAt - 1) return true;
    if (this.mode === 'wrap' && w > b.end) return true;
    if (!Number.isNaN(this.leaveAt) && this.time - this.leaveAt > this.timing.withdraw + 4) return true;
    return false;
  }

  /** The evidence: the shadow and swirl over where it'll rise, then gone. */
  private updateTell(w: number, b: WrapBeats): void {
    const m = this.tellMark;
    if (!m) return;
    const tm = this.timing;
    const told = ease(w / (tm.tell * 0.7));
    const gone = 1 - ease((w - tm.tell - 2) / 3);
    m.shadow = 0.95 * told * gone;
    m.ring = 0;
    m.foam = 0;
    m.spin = w * (0.6 + 0.6 * told);
    // Over the body's place, or between it and the ship it's after.
    const g = this.kraken.group.position;
    m.x = this.wreck ? (g.x * 2 + this.wreck.ship.group.position.x) / 3 : g.x;
    m.z = this.wreck ? (g.z * 2 + this.wreck.ship.group.position.z) / 3 : g.z;
    if (w > b.tips + 5) {
      this.marks.release(m);
      this.tellMark = null;
    }
  }

  /** White water: a ring of foam that spreads and fades (an arm breaking the water, the hull tearing). */
  foam(x: number, z: number, r0: number, r1: number, seconds: number): void {
    const m = this.marks.acquire();
    if (!m) return;
    m.foam = 1;
    m.x = x;
    m.z = z;
    m.radius = r0;
    m.arc = Math.PI * 2;
    m.ring = 0;
    m.shadow = 1;
    this.foamMarks.push(m);
    // Start time, then the radii and length packed after it.
    this.foamAt.push(this.time, r0, r1, seconds);
  }

  private updateFoam(): void {
    for (let i = this.foamMarks.length - 1; i >= 0; i--) {
      const m = this.foamMarks[i]!;
      const j = i * 4;
      const age = (this.time - this.foamAt[j]!) / this.foamAt[j + 3]!;
      if (age >= 1 || this.time < this.foamAt[j]!) {
        if (m) this.marks.release(m);
        this.foamMarks.splice(i, 1);
        this.foamAt.splice(j, 4);
        continue;
      }
      m.radius = this.foamAt[j + 1]! + (this.foamAt[j + 2]! - this.foamAt[j + 1]!) * ease(age * 1.3);
      m.shadow = 0.9 * Math.min(1, age * 6) * (1 - age) ** 1.5;
      m.spin = age * 2.5;
    }
  }

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

  /** The frame turning a ship-local point into the world for an arm: her (whole), or the half it holds. */
  private frameFor(role: Role, w: number): Object3D {
    const wreck = this.wreck!;
    if (w < this.beats.squeeze) return wreck.ship.group;
    return wreck.pieces.pieces[PIECE_OF[role]]!.pivot.children[0]!;
  }

  /** One arm, each frame (Kraken.onPose): stand up from the water, then its role's shape over it. */
  private poseArm(arm: KrakenArm, k: number): void {
    const s = this.stateOf(k);
    if (!s) return;
    const tm = this.timing;
    const b = this.beats;
    const w = this.time - this.startAt;
    const a = tm.anticipate;
    const o = tm.overshoot;
    // How far up it is: slowly, tips first; and how far it has withdrawn.
    let rise = heavy((w - s.riseAt) / tm.riseEach, a, o);
    let out = 0;
    if (this.mode === 'wrap') out = ease((w - b.withdraw - s.outAt) / (WITHDRAW_EACH * tm.withdraw));
    if (!Number.isNaN(this.leaveAt))
      out = Math.max(
        out,
        ease((this.time - this.leaveAt - (s.riseAt - tm.tell) * 0.5) / (tm.withdraw * 0.6)),
      );
    // Where it breaks the water: beside the ship it's after, or round its own surfaced body. A
    // finale arm moves to the body only once it's down.
    const finaleArm =
      this.mode === 'wrap' && b.hasFinale && out >= 1 && w > b.finale && FINALE_ROLES.includes(s.role);
    let height: number;
    const frame = this.mode === 'wrap' ? this.frameFor(s.role, w) : null;
    if (this.mode === 'wrap' && !finaleArm) {
      const e = EMERGE[s.role];
      // Where it breaks the water moves with the ship, and once she's torn, with the half it holds
      // (it rises beside her as it drags her down, not stretched straight from where she broke).
      frame!.updateWorldMatrix(true, false);
      _a.set(e[0], 0, e[1]).applyMatrix4(frame!.matrixWorld);
      height = e[2];
    } else {
      // Round the body (the surfaced kraken, or the finale), out along its socket.
      _o.copy(arm.outward).setY(0).normalize().transformDirection(this.kraken.body.root.matrixWorld);
      this.kraken.body.root.getWorldPosition(_a);
      _a.addScaledVector(_o.setY(0).normalize(), RING);
      height = RING_HEIGHT;
      if (finaleArm) {
        rise = heavy((w - b.finale - 0.6) / (tm.finale * 0.5), a, o);
        out = ease((w - b.end + 0.5 + tm.finale * 0.45) / (tm.finale * 0.4));
      }
    }
    // Once her halves are under (the foam burst) its arms let go of them and stand free again,
    // lower and curled, before they withdraw.
    const letGo = this.broke && !finaleArm ? ease((w - b.foam) / 1.6) : 0;
    if (this.broke && !finaleArm) height *= 0.65;
    // Always bent: its tip leads curled and unrolls as it rises, and it curls and bows as it goes.
    freeStance(_stance, height, rise, out);
    const h = _stance.len;
    // Foam where it breaks the water, coming up or going down.
    if (s.shown < 0.5 !== h < 0.5 && h + s.shown > 0) this.breakWater(_a.x, _a.z, h > s.shown ? 1 : 0.7);
    s.shown = h;
    const sea = this.waves.heightAt(_a.x, _a.z, this.t);
    arm.poser.base(_p);
    _o.copy(arm.outward).transformDirection(this.kraken.body.root.matrixWorld);
    // It bends toward the ship it's after (an S: out from her, then its tip hooks over toward her),
    // or out from its body (a J).
    let lx: number;
    let lz: number;
    const nearShip = !!this.wreck && !finaleArm;
    if (nearShip) {
      const sp = this.wreck!.ship.group.position;
      lx = sp.x - _a.x;
      lz = sp.z - _a.z;
    } else {
      lx = _o.x;
      lz = _o.z;
    }
    const ll = Math.hypot(lx, lz) || 1;
    lx /= ll;
    lz /= ll;
    const sway = (this.t / tm.swayPeriod) * Math.PI * 2 + s.sway;
    poseFreeArm(
      arm,
      _a.x,
      _a.z,
      sea,
      _stance,
      sway,
      tm.swayAmp,
      lx,
      lz,
      nearShip ? 0.8 : 0,
      s.stand,
      _o.x,
      _o.z,
    );
    if (this.mode !== 'wrap' || finaleArm || !frame) return;
    // Its role's shape over the ship, blended in slowly (and out as it withdraws).
    const order = RISE_ORDER.indexOf(s.role) % 3;
    const grip = heavy((w - b.grip - order * 0.6) / (tm.grip * 0.7), a, o);
    const squeeze = this.squeezeAt(w) * (this.reducedMotion ? 0.5 : 1);
    const release = (1 - out) * (1 - letGo);
    if (s.role === 'mast') {
      // The highest arm: a slow, tall J over the forecastle (forward of the fore yards and sails),
      // its suckers down toward the deck, a hang, then down round the foremast.
      const arc = heavy((w - b.arc) / tm.arc, a, o);
      const wArc = ease((w - b.arc + 0.5) / (tm.arc * 0.5)) * release;
      if (wArc > 0) {
        // Across her, at the arc's station: her −x (from the kraken's side over to the far one).
        _ax.set(-1, 0, 0).transformDirection(frame.matrixWorld);
        _arcStance.len = ARC_LENGTH;
        _arcStance.curl = 0.35 + 0.25 * Math.max(0, arc);
        _arcStance.bow = 0.15 + 0.55 * Math.max(0, arc) + 0.05 * Math.sin(this.t * 0.5);
        poseFreeArm(
          arm,
          _a.x,
          _a.z,
          sea,
          _arcStance,
          sway,
          tm.swayAmp * 0.5,
          _ax.x,
          _ax.z,
          0,
          s.target,
          _o.x,
          _o.z,
          wArc,
          0,
        );
      }
      const wMast = ease((w - b.grip) / (tm.grip * 0.6)) * release;
      if (wMast > 0) {
        this.shipPath(s, s.target2, frame, _a, sea, SHAPE_MAST, 1 - Math.min(1, Math.max(0, grip)), squeeze);
        arm.poser.pose(s.target2, wMast, _axisAim);
      }
      return;
    }
    if (s.role === 'pullFar' || s.role === 'pullNear') {
      // High behind her until the squeeze, then over her rail for the final pull.
      const start = b.squeeze - 1.5 + (s.role === 'pullNear' ? 0.7 : 0);
      const over = heavy((w - start) / (tm.squeeze * 0.6 + 1), a, o);
      const wPull = ease((w - start) / 1.6) * release;
      if (wPull <= 0) return;
      this.shipPath(
        s,
        s.target,
        frame,
        _a,
        sea,
        s.role === 'pullFar' ? SHAPE_PULL_FAR : SHAPE_PULL_NEAR,
        Math.min(1, Math.max(0.05, over)),
        squeeze,
      );
      arm.poser.pose(s.target, wPull, _axisAim);
      return;
    }
    const wGrip = ease((w - b.grip - order * 0.6) / (tm.grip * 0.45)) * release;
    if (wGrip <= 0) return;
    const loose = 1 - Math.min(1, Math.max(0, grip));
    if (s.role === 'bow') this.shipPath(s, s.target, frame, _a, sea, SHAPE_BOW, loose, squeeze);
    else if (s.role === 'stern') this.shipPath(s, s.target, frame, _a, sea, SHAPE_STERN, loose, squeeze);
    else if (s.role === 'gripFore') this.shipPath(s, s.target, frame, _a, sea, SHAPE_GRIP_FORE, squeeze, 0);
    else if (s.role === 'gripAft') this.shipPath(s, s.target, frame, _a, sea, SHAPE_GRIP_AFT, squeeze, 0);
    else this.shipPath(s, s.target, frame, _a, sea, SHAPE_GRIP_FAR, squeeze, 0);
    arm.poser.pose(s.target, wGrip, _axisAim);
  }

  /**
   * An arm's path to a shape on the ship: from its base under the water to where it breaks the
   * surface (with its spare length looped under), then the shape (ship-local, through `frame`).
   */
  private shipPath(
    s: ArmState,
    path: CurvePath,
    frame: Object3D,
    e: Vector3,
    sea: number,
    shape: number,
    u: number,
    v: number,
  ): void {
    frame.updateWorldMatrix(true, false);
    _m.copy(frame.matrixWorld);
    aimAt(shape, u);
    const arm = s.arm;
    arm.poser.base(_b);
    shapePoints(shape, u, v);
    // The shape's own length above the water, so the loop under it takes up only the rest.
    let above = shapeLength(e, sea);
    // An arc that's more than the arm can reach comes over less far (it still curves, all of it on
    // the arm), never a straight reach toward a shape it can't get to.
    if (shape === SHAPE_PULL_NEAR || shape === SHAPE_PULL_FAR) {
      const avail =
        reachOver(_b.x, _b.y, _b.z, _o.x, _o.z, e.x, e.z, sea, arm.length, arm.poser.lengths[0]!) * 0.95;
      for (let k = 0; k < 3 && above > avail && u > 0.06; k++) {
        u = Math.max(0.05, (u * avail) / above);
        shapePoints(shape, u, v);
        above = shapeLength(e, sea);
      }
    }
    path.clear();
    standPath(
      path,
      _b.x,
      _b.y,
      _b.z,
      _o.x,
      _o.z,
      e.x,
      e.z,
      sea,
      above,
      arm.length,
      0,
      0,
      0,
      1,
      0,
      0,
      0,
      0,
      arm.poser.lengths[0]!,
    );
    // Under the water only: then the shape.
    path.ctrlCount = Math.min(path.ctrlCount, 4);
    for (let i = 0; i < _pts.n; i++) {
      _p.set(_pts.xyz[i * 3]!, _pts.xyz[i * 3 + 1]!, _pts.xyz[i * 3 + 2]!).applyMatrix4(_m);
      path.push(_p.x, _p.y, _p.z);
    }
    path.build();
  }

  private stateOf(k: number): ArmState | undefined {
    for (const s of this.states) if (s.k === k) return s;
    return undefined;
  }

  private placePieces(wreck: Wreck, w: number, t: number): void {
    const b = this.beats;
    const tm = this.timing;
    const g = wreck.ship.group;
    const gentle = this.reducedMotion ? 0.5 : 1;
    const list = wreck.pieces.pieces;
    if (!this.broke) {
      // Still one ship: she rolls toward the kraken and hogs at the cut with each squeeze.
      const squeeze = this.squeezeAt(w);
      for (let k = 0; k < list.length; k++) {
        const p = list[k]!;
        p.root.position.copy(g.position);
        p.root.quaternion.copy(g.quaternion);
        p.root.scale.copy(g.scale);
        const sign = k === 0 ? -1 : 1;
        p.pivot.rotation.set(sign * 0.025 * squeeze * gentle, 0, 0.16 * squeeze * gentle);
      }
      return;
    }
    const age = w - b.break;
    const pull = heavy(age / tm.apart, tm.anticipate, tm.overshoot);
    let i = 0;
    for (let k = 0; k < list.length; k++) {
      const p = list[k]!;
      const dir = k === 0 ? -1 : 1;
      const along = dir * 5 * pull;
      const toward = 2.5 * pull;
      const hs = Math.sin(this.brokeAt.heading);
      const hc = Math.cos(this.brokeAt.heading);
      const x = this.brokeAt.x + along * hs + toward * hc;
      const z = this.brokeAt.z + along * hc - toward * hs;
      const sinkAge = w - b.under - (k === 1 ? 0 : 0.8);
      const swell = this.waves.heightAt(x, z, t) * Math.max(0, 1 - Math.max(0, sinkAge) / 3);
      const down = 0.8 * ease(age / 2) + 2 * ease(sinkAge / 3) + 11 * clamp01(sinkAge / tm.under) ** 2;
      p.root.position.set(x, swell - down * this.brokeAt.scale, z);
      p.root.scale.setScalar(this.brokeAt.scale);
      p.root.rotation.set(
        this.brokeAt.pitch * 0.5,
        this.brokeAt.heading + dir * 0.18 * pull,
        this.brokeAt.roll * 0.5,
        'YXZ',
      );
      // Torn ends up, outer ends dragged down: her masts fall outward; each half rolls away.
      const tilt = (0.32 * pull + 0.4 * ease(sinkAge / tm.under)) * (this.reducedMotion ? 0.7 : 1);
      p.pivot.rotation.set(dir * tilt, 0, 0.16 + dir * 0.22 * pull);
      p.root.visible = down < 16;
      const fade = 1 - ease((sinkAge + 0.6) / 2);
      for (const m of p.lineMaterials) m.opacity = wreck.lineBase[i++]! * fade;
      for (const l of p.lines) l.visible = fade > 0.02;
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
    this.brokeAt.scale = g.scale.x;
    const chips = this.reducedMotion ? 4 : 14;
    for (const z of CUTS) {
      for (let side = -1; side <= 1; side += 2) {
        const y = sheerHeightAt(z);
        const x = side * halfBeamAt(z, y);
        _p.set(x, y - 0.4, z).applyMatrix4(g.matrixWorld);
        _a.set(side, 0.3, 0).transformDirection(g.matrixWorld);
        this.splinters.burst(_p.x, _p.y, _p.z, _a.x, _a.z, chips, this.rand);
        _p.set(side * halfBeamAt(z, 0.2), 0.2, z).applyMatrix4(g.matrixWorld);
        this.splinters.burst(_p.x, _p.y, _p.z, _a.x, _a.z, Math.ceil(chips * 0.6), this.rand);
      }
      _p.set(0, 0, z).applyMatrix4(g.matrixWorld);
      // White water bursting up through the tear, scaled to the ship.
      this.foam(_p.x, _p.z, 6, 20, 5);
      const n = this.reducedMotion ? 3 : 7;
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2;
        const x = _p.x + Math.cos(a) * 5;
        const zz = _p.z + Math.sin(a) * 5;
        this.splashes.spawn(
          x,
          this.waves.heightAt(x, zz, t),
          zz,
          t,
          this.reducedMotion ? 2.5 : 4.2,
          k % 2,
          this.rand(),
        );
      }
      _p.set(0, sheerHeightAt(z), z).applyMatrix4(g.matrixWorld);
      this.emit('timber', _p, 1.2);
      this.emit('groan', _p, 1);
    }
    this.shake = this.reducedMotion ? 0 : 0.4;
  }

  private squeezeAt(w: number): number {
    const b = this.beats;
    if (w < b.squeeze) return 0;
    if (w >= b.break) return 1;
    const u = (w - b.squeeze) / (b.break - b.squeeze);
    const pulses = this.reducedMotion ? 2 : 3;
    return ease(u * 1.2) * (0.55 + 0.45 * Math.abs(Math.sin(u * Math.PI * pulses)));
  }

  private once(cue: number, at: number): boolean {
    if (this.time - this.startAt < at || this.fired[cue]) return false;
    this.fired[cue] = 1;
    return true;
  }

  private cues(w: number, b: WrapBeats, t: number): void {
    const tm = this.timing;
    // Bubbles over the shadow while it tells.
    if (w < tm.tell + 1 && this.rand() < (this.reducedMotion ? 0.15 : 0.35) && this.tellMark) {
      const m = this.tellMark;
      const r = Math.sqrt(this.rand()) * 7;
      const a = this.rand() * Math.PI * 2;
      const x = m.x + Math.cos(a) * r;
      const z = m.z + Math.sin(a) * r;
      this.splashes.spawn(x, this.waves.heightAt(x, z, t), z, t, 0.6 + this.rand() * 0.6, 0, this.rand());
    }
    if (this.once(CUE_TIPS, b.tips)) {
      const g = this.kraken.group.position;
      this.emitEvent('striking', this.mode === 'wrap' ? 'wrap' : 'rise', g.x, g.z, 11, 0);
    }
    if (this.mode === 'surfaced' && this.once(CUE_BODY, tm.tell + 1.5 + tm.riseEach * 0.5)) {
      this.kraken.group.getWorldPosition(_p);
      this.foam(_p.x, _p.z, 5, 14, 5);
      this.emit('sink', _p, 0.8);
    }
    if (!Number.isNaN(this.leaveAt) && this.once(CUE_GONE, this.leaveAt - this.startAt + tm.withdraw + 3)) {
      const g = this.kraken.group.position;
      this.emitEvent('done', 'retreat', g.x, g.z, 0, 0);
    }
    const wreck = this.wreck;
    if (!wreck || this.mode !== 'wrap') return;
    const g = wreck.ship.group;
    if (this.once(CUE_GRIP, b.grip))
      this.emitEvent('striking', 'wrap', g.position.x, g.position.z, BRIGANTINE_HALF_LENGTH, 0);
    const span = b.break - b.squeeze;
    for (let k = 0; k < 3; k++)
      if (this.once(CUE_GROAN + k, b.squeeze + 0.4 + (k * span) / 3)) {
        g.getWorldPosition(_p);
        this.emit('groan', _p, 1);
      }
    if (this.broke) {
      if (w > b.under && w < b.withdraw + 2 && this.rand() < 0.1 * (this.reducedMotion ? 0.5 : 1)) {
        const p = wreck.pieces.pieces[Math.floor(this.rand() * wreck.pieces.pieces.length)]!;
        p.root.getWorldPosition(_p);
        _p.x += (this.rand() - 0.5) * 9;
        _p.z += (this.rand() - 0.5) * 9;
        this.splashes.spawn(
          _p.x,
          this.waves.heightAt(_p.x, _p.z, t),
          _p.z,
          t,
          1.4 + this.rand() * 1.2,
          0,
          this.rand(),
        );
      }
      // The big burst of foam and spray as the halves go under.
      for (let k = 0; k < wreck.pieces.pieces.length; k++)
        if (this.once(CUE_UNDER + k, b.foam + k * 0.9)) {
          wreck.pieces.pieces[k]!.root.getWorldPosition(_p);
          this.foam(_p.x, _p.z, 8, 22, 6);
          const n = this.reducedMotion ? 3 : 8;
          for (let j = 0; j < n; j++) {
            const a = (j / n) * Math.PI * 2 + k;
            const x = _p.x + Math.cos(a) * 6;
            const z = _p.z + Math.sin(a) * 6;
            this.splashes.spawn(
              x,
              this.waves.heightAt(x, z, t),
              z,
              t,
              this.reducedMotion ? 2.5 : 4.8,
              j % 2,
              this.rand(),
            );
          }
          this.emit('sink', _p, 1.2);
        }
      if (this.once(CUE_DONE, b.foam + 3))
        this.emitEvent('done', 'wrap', this.brokeAt.x, this.brokeAt.z, 0, 0);
    }
    if (b.hasFinale && this.once(CUE_FINALE, b.finale + tm.finale * 0.25)) {
      this.kraken.group.getWorldPosition(_p);
      this.foam(_p.x, _p.z, 5, 15, 6);
      this.emit('sink', _p, 0.7);
    }
  }

  /** White water where an arm breaks the surface (or slides under), sized to the creature. */
  breakWater(x: number, z: number, scale: number): void {
    this.foam(x, z, 2.5 * scale, 9 * scale, 3.5);
    const n = this.reducedMotion ? 2 : 4;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + this.rand();
      const xx = x + Math.cos(a) * 2.8;
      const zz = z + Math.sin(a) * 2.8;
      this.splashes.spawn(
        xx,
        this.waves.heightAt(xx, zz, this.t),
        zz,
        this.t,
        (2 + this.rand()) * scale,
        k === 0 && !this.reducedMotion ? 1 : 0,
        this.rand(),
      );
    }
    _p.set(x, 0, z);
    this.emit('splash', _p, 0.7 * scale);
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

  /** The kraken's own place (its body), for a camera. */
  bodyPosition(out: Vector3): Vector3 {
    return this.kraken.body.root.getWorldPosition(out);
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

const CUE_TIPS = 0;
const CUE_BODY = 1;
const CUE_GONE = 2;
const CUE_GRIP = 3;
const CUE_GROAN = 4;
const CUE_UNDER = 8;
const CUE_DONE = 12;
const CUE_FINALE = 13;
const HELD = { trim: 0, rudder: 0 };
/** How long (s) after a wrap's end it keeps the wreck (its arms withdrawn) before it lets go. */
const WRAP_LINGER = 8;

/** How far `w` is from `a` to `z`, 0…1. */
function span(w: number, a: number, z: number): number {
  return clamp01((w - a) / Math.max(0.001, z - a));
}
const SHAPE_MAST = 1;
const SHAPE_BOW = 2;
const SHAPE_STERN = 3;
const SHAPE_GRIP_FORE = 4;
const SHAPE_GRIP_AFT = 5;
const SHAPE_GRIP_FAR = 6;
const SHAPE_PULL_NEAR = 7;
const SHAPE_PULL_FAR = 8;
const WRAP_SPOTS_FORE_Z = BRIGANTINE_MASTS.fore.z;

/** The ship's hull material (the caps are its planking). */
/**
 * What an arm in a wrap shape grips, as a line its suckers face (`_axisAim`, through `_m`, the ship's
 * frame): a hull coil her centre line through the coil's middle, the mast coil the foremast, and an
 * arm over her rail or deck a line under her deck (its suckers down on the deck and in at the hull).
 */
function aimAt(shape: number, u: number): void {
  let px = 0;
  let py: number;
  let pz = 0;
  let dy = 0;
  let dz = 1;
  if (shape === SHAPE_BOW || shape === SHAPE_STERN) py = 0.15 + 4 * u;
  else if (shape === SHAPE_MAST) {
    py = 0;
    pz = WRAP_SPOTS_FORE_Z;
    dy = 1;
    dz = 0;
  } else py = deckHeightAt(0) - 3;
  _ax.set(px, py, pz).applyMatrix4(_m);
  px = _ax.x;
  py = _ax.y;
  pz = _ax.z;
  _ax.set(0, dy, dz).transformDirection(_m);
  _axisAim.set(px, py, pz, _ax.x, _ax.y, _ax.z);
}

/** A wrap shape's points (ship-local) into `_pts`. */
function shapePoints(shape: number, u: number, v: number): void {
  _pts.clear();
  if (shape === SHAPE_MAST) mastCoil(_pts, u, v);
  else if (shape === SHAPE_BOW) hullCoil(_pts, WRAP_SPOTS.bow.z0, WRAP_SPOTS.bow.z1, u, v);
  else if (shape === SHAPE_STERN) hullCoil(_pts, WRAP_SPOTS.stern.z0, WRAP_SPOTS.stern.z1, u, v);
  else if (shape === SHAPE_PULL_NEAR) pullArc(_pts, WRAP_SPOTS.pullAft, u, v);
  else if (shape === SHAPE_PULL_FAR) {
    pullArc(_pts, WRAP_SPOTS.pullFore, u, v);
    mirrorX(_pts);
  } else if (shape === SHAPE_GRIP_FAR) {
    railGrip(_pts, WRAP_SPOTS.gripFar, u);
    mirrorX(_pts);
  } else railGrip(_pts, shape === SHAPE_GRIP_FORE ? WRAP_SPOTS.gripFore : WRAP_SPOTS.gripAft, u);
}

/** The length (m) of `_pts` through `_m` (the ship's frame), from where the arm breaks the water. */
function shapeLength(e: Vector3, sea: number): number {
  let len = 0;
  let lx = e.x;
  let ly = sea;
  let lz = e.z;
  for (let i = 0; i < _pts.n; i++) {
    _p.set(_pts.xyz[i * 3]!, _pts.xyz[i * 3 + 1]!, _pts.xyz[i * 3 + 2]!).applyMatrix4(_m);
    len += Math.hypot(_p.x - lx, _p.y - ly, _p.z - lz);
    lx = _p.x;
    ly = _p.y;
    lz = _p.z;
  }
  return len;
}

function shipMaterialOf(ship: Object3D): Material {
  const hull =
    ship.getObjectByName('rounded planked hull') ?? ship.getObjectByName('hull deck trim and stern (merged)');
  const m = (hull as Mesh | undefined)?.material;
  if (!m || Array.isArray(m)) throw new Error('kraken encounter: no hull material');
  return m;
}
