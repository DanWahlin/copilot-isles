import { Vector3, type Camera } from 'three/webgpu';
import { world } from '../uniforms';
import type { SplashPool } from '../battle/fx';
import type { Tier, WaveSampler } from '../contracts';
import { Kraken, poseFreeArm, type KrakenArm } from './kraken';
import { AxisAim } from './tentacle-pose';
import type { MarkState, TellMarks } from './tell-marks';
import { freeStance, heavy, type FreeStance } from './arm-paths';

/**
 * Tentacle hazards (a kraken battle's twist, docs: the battle 3 plan): a tentacle that slams down on
 * a circle of sea, or sweeps across an arc of it. Each one gives its evidence first (bubbles, a
 * shadow and a swirl under the water, and the danger ring on it) for a few seconds, then strikes;
 * a ship that read the signs and turned away takes no damage. After the strike the arm stays up as
 * a standing hazard (a small circle) until the kraken retreats.
 */
export type HazardKind = 'slam' | 'sweep';

export interface HazardSpec {
  /** The danger radius (m). */
  radius: number;
  /** The danger arc's width (radians; 2π all round). */
  arc: number;
  /** The tell before the arm shows (s): bubbles, shadow, swirl, ring. */
  tell: number;
  /** The wind-up (s): the arm rises out of the water slowly and rears back. */
  windUp: number;
  /** The strike itself (s): the only fast move, the slam coming down or the sweep across. */
  fall: number;
  /** How long it can hit (s), from when it lands. */
  danger: number;
  /** The heavy follow-through (s): it lies across the water and drags before it stands. */
  follow: number;
  /** The standing arm's danger radius (m) after the strike. */
  standing: number;
  /** Damage to a ship the strike lands on (once per strike), and to one touching the standing arm. */
  damage: number;
  standingDamage: number;
  /** A ship touching the standing arm is hurt again after this long (s). */
  standingEvery: number;
}

/** The hazards' sizes and timings, as data (the battle reads these, tests check them). */
export const HAZARD_SPECS: Readonly<Record<HazardKind, HazardSpec>> = {
  slam: {
    radius: 14,
    arc: Math.PI * 2,
    tell: 2.6,
    windUp: 2.4,
    fall: 0.45,
    danger: 0.9,
    follow: 1.8,
    standing: 5,
    damage: 34,
    standingDamage: 6,
    standingEvery: 2,
  },
  sweep: {
    radius: 24,
    arc: 1.7,
    tell: 2.8,
    windUp: 2.2,
    fall: 1.1,
    danger: 1.3,
    follow: 1.6,
    standing: 5,
    damage: 22,
    standingDamage: 6,
    standingEvery: 2,
  },
};

/** A ship the hazards test against: the battle fills these in place each frame (bow, stern, beam). */
export interface KrakenHull {
  readonly id: string;
  bowX: number;
  bowZ: number;
  sternX: number;
  sternZ: number;
  halfBeam: number;
  /** A raider the kraken may take when a strike lands on her (`wrapAndBreak`); never the player. */
  catchable?: boolean;
}

/** One ship hit by a strike or a standing arm. */
export interface HazardHit {
  shipId: string;
  /** The hazard's id (from `hazard()`), its kind, and whether it was the strike or the standing arm. */
  hazardId: number;
  kind: HazardKind;
  strike: boolean;
  damage: number;
  /** Where on the ship it hit (the hull point nearest the hazard). */
  x: number;
  z: number;
}

/** A ship (or a spot on the sea) a tell is placed for: where it is, which way it heads, how fast. */
export interface TellTarget {
  x: number;
  z: number;
  /** Radians, clockwise from +z (a ship's heading). */
  heading: number;
  /** m/s. */
  speed: number;
}

/** Where the next tell appears. */
export type TellAim = 'dodge' | 'intercept';

/** Where a tell goes for each aim, as data (the battle can tune it). */
export const TELL_PLACEMENT = {
  /** Dodge: ahead of the player by this share of the way she'll sail before it lands … */
  dodgeAhead: 0.8,
  /** … and off her line by this share of its radius, so a turn away clears it. */
  dodgeAside: 0.5,
  /** The closest a dodge's centre comes to her (m), however slow she sails. */
  dodgeMin: 22,
  /** Intercept: where the raider will be when it lands (this share of her way), so a lured raider sails in. */
  interceptAhead: 1.0,
} as const;

/** A tell placed by `planTell`: its spot, heading (a sweep's middle faces back along her way), size and timing. */
export interface TellPlan {
  x: number;
  z: number;
  heading: number;
  kind: HazardKind;
  radius: number;
  /** How long the evidence shows before the arm rises (s), and until the strike lands (s). */
  tell: number;
  eta: number;
}

/**
 * Where the next tell goes (pure): `dodge` near the player (ahead and off her line, so reading it and
 * turning away clears it), or `intercept` on a raider's course (where she'll be when it lands, so a
 * raider lured over it is taken). `side` (−1 or 1) is which side of her line a dodge goes.
 */
export function planTell(
  out: TellPlan,
  target: Readonly<TellTarget>,
  kind: HazardKind,
  aim: TellAim,
  side = 1,
): TellPlan {
  const spec = HAZARD_SPECS[kind];
  const eta = hazardImpactAt(spec);
  const hs = Math.sin(target.heading);
  const hc = Math.cos(target.heading);
  let ahead: number;
  let aside = 0;
  if (aim === 'dodge') {
    ahead = Math.max(TELL_PLACEMENT.dodgeMin, target.speed * eta * TELL_PLACEMENT.dodgeAhead);
    aside = side * spec.radius * TELL_PLACEMENT.dodgeAside;
  } else ahead = target.speed * eta * TELL_PLACEMENT.interceptAhead;
  out.x = target.x + hs * ahead + hc * aside;
  out.z = target.z + hc * ahead - hs * aside;
  // A sweep's middle faces back along her way: its arc lies across her course.
  out.heading = target.heading + Math.PI;
  out.kind = kind;
  out.radius = spec.radius;
  out.tell = spec.tell;
  out.eta = eta;
  return out;
}

/** Seconds from a hazard's start to its strike landing (the tell, the wind-up and the strike). */
export function hazardImpactAt(spec: HazardSpec): number {
  return spec.tell + spec.windUp + spec.fall;
}

/** A danger area on the sea: a circle, or a sector `arc` wide round `heading` (clockwise from +z). */
export interface HazardArea {
  x: number;
  z: number;
  radius: number;
  heading: number;
  arc: number;
}

/** True when (x, z) is in the area, or within `pad` m of it. */
export function inHazard(a: HazardArea, x: number, z: number, pad = 0): boolean {
  const dx = x - a.x;
  const dz = z - a.z;
  const d = Math.hypot(dx, dz);
  if (d > a.radius + pad) return false;
  if (a.arc >= Math.PI * 2 - 1e-6 || d <= pad) return true;
  const ang = Math.atan2(dx, dz);
  const off = Math.abs(Math.atan2(Math.sin(ang - a.heading), Math.cos(ang - a.heading)));
  // Off the arc's side: the distance to its nearer edge ray must be within the pad.
  if (off <= a.arc / 2) return true;
  return d * Math.sin(Math.min(Math.PI / 2, off - a.arc / 2)) <= pad;
}

/** Points sampled along a hull (bow to stern) for the hit test. */
const HULL_SAMPLES = 7;

/**
 * True when a hull (the line from bow to stern, `halfBeam` either side) touches the area: what the
 * battle tests a ship against during a strike.
 */
export function hazardHitsHull(
  a: HazardArea,
  bowX: number,
  bowZ: number,
  sternX: number,
  sternZ: number,
  halfBeam: number,
): boolean {
  for (let i = 0; i < HULL_SAMPLES; i++) {
    const u = i / (HULL_SAMPLES - 1);
    if (inHazard(a, bowX + (sternX - bowX) * u, bowZ + (sternZ - bowZ) * u, halfBeam)) return true;
  }
  return false;
}

/**
 * How far (m) the hull keeps clear of the area's edge (negative: inside it). A near miss is small and
 * positive. Measured on the area's circle (the arc's sides are left to `hazardHitsHull`).
 */
export function hazardClearance(
  a: HazardArea,
  bowX: number,
  bowZ: number,
  sternX: number,
  sternZ: number,
  halfBeam: number,
): number {
  let best = Infinity;
  for (let i = 0; i < HULL_SAMPLES; i++) {
    const u = i / (HULL_SAMPLES - 1);
    const d = Math.hypot(bowX + (sternX - bowX) * u - a.x, bowZ + (sternZ - bowZ) * u - a.z);
    best = Math.min(best, d - a.radius - halfBeam);
  }
  return best;
}

type Stage = 'off' | 'tell' | 'strike' | 'stand' | 'down';

interface Hazard {
  id: number;
  kind: HazardKind;
  area: HazardArea;
  stage: Stage;
  /** Seconds into the hazard. */
  age: number;
  /** When it was told to go down (its age then), or Infinity. */
  downAt: number;
  mark: MarkState | null;
  arm: number;
  struck: boolean;
  /** Its arm's free pose (under any strike path): up slowly, curled, and down again. */
  stance: FreeStance;
  /** When each ship it hit was last hurt (its age then): the strike hits each once. */
  hurt: Map<string, number>;
}

export interface HazardEvents {
  /** Ships hit this frame (the list is reused: copy what you keep). */
  struck(hits: readonly HazardHit[]): void;
  telling(h: Readonly<HazardArea>, kind: HazardKind, strikeIn: number): void;
  striking(h: Readonly<HazardArea>, kind: HazardKind): void;
  /** Its arm breaks the water (at `at`) to wind up. */
  emerging(at: Vector3, kind: HazardKind): void;
  done(kind: HazardKind): void;
}

const _p = new Vector3();
const _strikeAim = new AxisAim();
const smooth = (x: number) => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};

/**
 * The hazards' tentacles: a kraken of its own (two or three arms, no body: the body's under) on the
 * shared tentacle and material, its arms set wherever a hazard rises. One arm per hazard at a time.
 */
export class KrakenHazards {
  readonly kraken: Kraken;
  private readonly hazards: Hazard[] = [];
  private readonly waves: WaveSampler;
  private readonly marks: TellMarks;
  private readonly splashes: SplashPool;
  private readonly events: HazardEvents;
  private rand: () => number;
  private nextId = 1;
  private bubbleAt = 0;
  private t = 0;
  private hulls: readonly KrakenHull[] = [];
  private readonly hitPool: HazardHit[] = [];
  private readonly hits: HazardHit[] = [];

  private constructor(
    kraken: Kraken,
    o: {
      waves: WaveSampler;
      marks: TellMarks;
      splashes: SplashPool;
      events: HazardEvents;
      rand: () => number;
    },
  ) {
    this.kraken = kraken;
    this.waves = o.waves;
    this.marks = o.marks;
    this.splashes = o.splashes;
    this.events = o.events;
    this.rand = o.rand;
    kraken.group.name = 'kraken hazards';
    // Long enough to slam across a whole danger circle from its edge.
    kraken.group.scale.setScalar(1.35);
    kraken.measure();
    kraken.body.drawn.visible = false;
    for (let i = 0; i < kraken.arms.length; i++)
      this.hazards.push({
        id: 0,
        kind: 'slam',
        area: { x: 0, z: 0, radius: 1, heading: 0, arc: Math.PI * 2 },
        stage: 'off',
        age: 0,
        downAt: Infinity,
        mark: null,
        arm: i,
        struck: false,
        stance: { len: 0, curl: 0, bow: 0 },
        hurt: new Map(),
      });
    for (let i = 0; i < 16; i++)
      this.hitPool.push({ shipId: '', hazardId: 0, kind: 'slam', strike: true, damage: 0, x: 0, z: 0 });
    kraken.onPose = (arm, k) => this.poseArm(arm, k);
    this.reset();
  }

  static async create(o: {
    tier: Tier;
    base?: string;
    waves: WaveSampler;
    marks: TellMarks;
    splashes: SplashPool;
    events: HazardEvents;
    rand: () => number;
  }): Promise<KrakenHazards> {
    const sockets = o.tier === 'lite' ? [3, 5] : [3, 5, 6];
    const kraken = await Kraken.load({
      tier: o.tier,
      base: o.base,
      sockets,
      scales: HAZARD_ARM_SCALES,
      clipSpeed: 0.5,
    });
    return new KrakenHazards(kraken, o);
  }

  reset(): void {
    for (const h of this.hazards) {
      if (h.mark) this.marks.release(h.mark);
      h.mark = null;
      h.stage = 'off';
      const arm = this.kraken.arms[h.arm]!;
      arm.sink = arm.length + 4;
      arm.weight = 0;
      h.stance.len = 0;
    }
  }

  /** Every area that can hurt now (a strike landing, or a standing arm), written into `out`. */
  dangers(out: HazardArea[]): HazardArea[] {
    out.length = 0;
    for (const h of this.hazards) if (this.dangerous(h)) out.push(h.area);
    return out;
  }

  private dangerous(h: Hazard): boolean {
    const spec = HAZARD_SPECS[h.kind];
    const impact = hazardImpactAt(spec);
    if (h.stage === 'strike') return h.age >= impact && h.age <= impact + spec.danger;
    return h.stage === 'stand';
  }

  /** Every hazard that's up (telling, striking or standing), its area written into `out`. */
  areas(out: HazardArea[]): HazardArea[] {
    out.length = 0;
    for (const h of this.hazards) if (h.stage !== 'off') out.push(h.area);
    return out;
  }

  /** True when a hull touches a hazard that can hurt now. */
  hitsHull(bowX: number, bowZ: number, sternX: number, sternZ: number, halfBeam: number): boolean {
    for (const h of this.hazards)
      if (this.dangerous(h) && hazardHitsHull(h.area, bowX, bowZ, sternX, sternZ, halfBeam)) return true;
    return false;
  }

  /** Starts a hazard at (x, z) facing `heading` (a sweep's middle); returns its id, or 0 if every arm is busy. */
  start(kind: HazardKind, x: number, z: number, heading: number): number {
    const h = this.hazards.find((c) => c.stage === 'off');
    if (!h) return 0;
    const spec = HAZARD_SPECS[kind];
    h.id = this.nextId++;
    h.kind = kind;
    h.area.x = x;
    h.area.z = z;
    h.area.radius = spec.radius;
    h.area.heading = heading;
    h.area.arc = spec.arc;
    h.stage = 'tell';
    h.age = 0;
    h.downAt = Infinity;
    h.struck = false;
    h.hurt.clear();
    h.mark = this.marks.acquire();
    if (h.mark) {
      h.mark.x = x;
      h.mark.z = z;
      h.mark.radius = spec.radius;
      h.mark.heading = heading;
      h.mark.arc = spec.arc;
    }
    const arm = this.kraken.arms[h.arm]!;
    // Sweeping arms rise at the arc's middle and sweep across; slamming arms rise in the circle's far
    // side. Sockets are in the (scaled) kraken's frame, which sits at the world's origin.
    const side = kind === 'sweep' ? 0 : 0.45;
    const k = this.kraken.group.scale.x;
    arm.socket.set(
      (x - Math.sin(heading) * spec.radius * side) / k,
      -2 / k,
      (z - Math.cos(heading) * spec.radius * side) / k,
    );
    arm.root.rotation.set(0, heading, 0);
    this.kraken.play(h.arm, 'Tentacle_Idle', 0, 1, true);
    this.events.telling(h.area, kind, hazardImpactAt(spec));
    return h.id;
  }

  /**
   * The ships a strike can hit: the battle's list, its hulls updated in place each frame. Every ship in
   * a strike's area takes its damage (`struck`), the player's or a raider's.
   */
  setHulls(hulls: readonly KrakenHull[]): void {
    this.hulls = hulls;
  }

  /** True when ship `id` is a raider the kraken may take. */
  catchable(id: string): boolean {
    for (const h of this.hulls) if (h.id === id) return !!h.catchable;
    return false;
  }

  /** Sends hazard `id` down (its standing arm withdraws, freeing it for the next hazard). */
  down(id: number): void {
    for (const h of this.hazards)
      if (h.id === id && h.stage !== 'off' && h.downAt === Infinity) h.downAt = h.age;
  }

  /** How many hazards are up (telling, striking or standing). */
  get count(): number {
    let n = 0;
    for (const h of this.hazards) if (h.stage !== 'off') n++;
    return n;
  }

  /** Sends every hazard down. */
  retreat(): void {
    for (const h of this.hazards) if (h.stage !== 'off' && h.downAt === Infinity) h.downAt = h.age;
  }

  get active(): boolean {
    for (const h of this.hazards) if (h.stage !== 'off') return true;
    return false;
  }

  update(dt: number, t: number, camera: Camera | null): void {
    const gentle = world.reducedMotion.value > 0.5;
    this.t = t;
    this.hits.length = 0;
    for (const h of this.hazards) {
      if (h.stage === 'off') continue;
      h.age += dt;
      this.animate(h, t, gentle);
      if (dt > 0 && this.dangerous(h)) this.testHulls(h);
    }
    if (this.hits.length) this.events.struck(this.hits);
    this.kraken.place();
    this.kraken.update(dt, t, camera, null, 0);
  }

  private animate(h: Hazard, t: number, gentle: boolean): void {
    const spec = HAZARD_SPECS[h.kind];
    const arm = this.kraken.arms[h.arm]!;
    const a = h.area;
    const age = h.age;
    const m = h.mark;
    const tell = spec.tell;
    const impact = hazardImpactAt(spec);
    // Seconds since it landed (negative before).
    const s = age - impact;
    // After the strike and its follow-through the danger shrinks to the standing arm's circle.
    const standing = smooth((s - spec.danger - spec.follow * 0.5) / 1.5);
    a.radius = spec.radius + (spec.standing - spec.radius) * standing;
    a.arc = spec.arc + (Math.PI * 2 - spec.arc) * standing;
    // The evidence: the shadow darkens and swirls, bubbles come faster, the ring pulses.
    if (m) {
      const told = smooth(age / (tell * 0.7));
      const down = h.downAt < Infinity ? 1 - smooth((age - h.downAt) / 1.5) : 1;
      m.shadow = 0.9 * told * (1 - 0.6 * standing) * down;
      m.ring = (s < spec.danger ? 0.45 + 0.4 * Math.abs(Math.sin(age * 4)) : 0.5) * told * down;
      m.radius = a.radius;
      m.arc = a.arc;
      m.foam = 0;
      m.spin = age * (0.8 + told);
      // Bubbles: a few at first, more as it comes.
      if (age < tell + spec.windUp * 0.5 && t >= this.bubbleAt) {
        this.bubbleAt = t + (gentle ? 0.35 : 0.18) * (1.4 - Math.min(1, age / tell));
        const r = Math.sqrt(this.rand()) * spec.radius * 0.45;
        const ang = this.rand() * Math.PI * 2;
        const bx = a.x + Math.cos(ang) * r;
        const bz = a.z + Math.sin(ang) * r;
        this.splashes.spawn(
          bx,
          this.waves.heightAt(bx, bz, t),
          bz,
          t,
          0.5 + this.rand() * 0.5,
          0,
          this.rand(),
        );
      }
    }
    if (age < tell) {
      arm.sink = arm.length + 4;
      h.stance.len = 0;
      return;
    }
    if (h.stage === 'tell') {
      h.stage = 'strike';
      this.kraken.play(h.arm, 'Tentacle_Idle', 0.5, 0.5);
      this.events.emerging(arm.root.getWorldPosition(_p), h.kind);
    }
    // Up slowly out of the water (the wind-up), and down slowly when it goes.
    const up = heavy((age - tell) / (spec.windUp * 0.8), gentle ? 0 : 0.05, gentle ? 0 : 0.06);
    const goneDown = h.downAt < Infinity ? smooth((age - h.downAt) / 3) : 0;
    const share = h.kind === 'sweep' ? 0.62 : 0.85;
    // Its root stays put under the water; the free pose brings it up (its tip first, curled) and
    // takes it down again (curling, in an arc). The strike path is blended over it.
    arm.sink = arm.length * (1 - share);
    freeStance(h.stance, STAND_LENGTH[h.kind], up, goneDown);
    if (!h.struck && s >= 0) {
      h.struck = true;
      this.events.striking(a, h.kind);
      this.impact(h, t, gentle);
    }
    if (h.kind === 'sweep' && s > -spec.fall && s < 0) this.sprayAlong(h, t, (s + spec.fall) / spec.fall);
    if (h.stage === 'strike' && s > spec.danger + spec.follow) {
      h.stage = 'stand';
      this.kraken.play(h.arm, 'Tentacle_Idle', 1.6, 0.45);
    }
    this.strikePath(h, age, s);
    if (goneDown >= 1) {
      this.marks.release(h.mark);
      h.mark = null;
      h.stage = 'off';
      arm.weight = 0;
      arm.sink = arm.length + 4;
      h.stance.len = 0;
      this.events.done(h.kind);
    }
  }

  /**
   * The arm's path for its strike: rearing back through the wind-up, the fast strike (accelerating,
   * the only quick move), and a heavy follow-through, weighted in and out round it.
   */
  private strikePath(h: Hazard, age: number, s: number): void {
    const spec = HAZARD_SPECS[h.kind];
    const arm = this.kraken.arms[h.arm]!;
    const a = h.area;
    const w =
      smooth((age - spec.tell) / (spec.windUp * 0.6)) * (1 - smooth((s - spec.danger - spec.follow) / 2));
    arm.weight = w;
    if (w <= 0) return;
    // -0.3 reared back at the top of the wind-up … 0 ready … 1 landed, a small settle after.
    const wind = smooth((age - spec.tell) / spec.windUp);
    const strike = Math.min(1, Math.max(0, (s + spec.fall) / spec.fall)) ** 2;
    const settle = s > 0 ? 0.06 * Math.exp(-s * 2.5) * Math.sin(s * 9) : 0;
    const fall = s < -spec.fall ? -0.3 * wind : strike + settle;
    const path = arm.path;
    path.clear();
    arm.poser.base(_p);
    path.push(_p.x, _p.y, _p.z);
    const hs = Math.sin(a.heading);
    const hc = Math.cos(a.heading);
    if (h.kind === 'slam') {
      // Up out of the circle's far side, rearing back, then over and down across its middle.
      const bx = _p.x;
      const bz = _p.z;
      path.push(bx, 2, bz);
      path.push(bx + hs * 3, 11 - 2 * fall, bz + hc * 3);
      path.push(a.x + hs * 2 * fall, 0.5 + 9 * (1 - fall), a.z + hc * 2 * fall);
      path.push(a.x + hs * (2 + 6 * fall), 0.2 + 7 * (1 - fall), a.z + hc * (2 + 6 * fall));
    } else {
      // Rises at the middle, held at one side of the arc, and sweeps low across it.
      const u = Math.min(1, Math.max(0, fall));
      const ang = a.heading - spec.arc / 2 + spec.arc * u;
      const r = spec.radius * 0.75;
      const lift = 2.5 * (1 - u) * wind;
      path.push(_p.x, 3 + lift, _p.z);
      for (let k = 0; k <= 4; k++) {
        const b = ang - 0.9 + 0.225 * k;
        const rr = (r * (k + 1)) / 5;
        path.push(a.x + Math.sin(b) * rr, 1.6 - 0.2 * k + lift, a.z + Math.cos(b) * rr);
      }
    }
    path.build();
  }

  /** Every ship in hazard `h`'s area now: the strike hurts each once, the standing arm now and then. */
  private testHulls(h: Hazard): void {
    const spec = HAZARD_SPECS[h.kind];
    const strike = h.stage === 'strike';
    for (const s of this.hulls) {
      if (!hazardHitsHull(h.area, s.bowX, s.bowZ, s.sternX, s.sternZ, s.halfBeam)) continue;
      const last = h.hurt.get(s.id);
      if (last !== undefined && (strike || h.age - last < spec.standingEvery)) continue;
      h.hurt.set(s.id, h.age);
      const hit = this.hitPool[this.hits.length];
      if (!hit) return;
      hit.shipId = s.id;
      hit.hazardId = h.id;
      hit.kind = h.kind;
      hit.strike = strike;
      hit.damage = strike ? spec.damage : spec.standingDamage;
      // The hull's point nearest the hazard's centre.
      const dx = s.sternX - s.bowX;
      const dz = s.sternZ - s.bowZ;
      const ll = dx * dx + dz * dz;
      const u =
        ll > 0 ? Math.min(1, Math.max(0, ((h.area.x - s.bowX) * dx + (h.area.z - s.bowZ) * dz) / ll)) : 0;
      hit.x = s.bowX + dx * u;
      hit.z = s.bowZ + dz * u;
      this.hits.push(hit);
    }
  }

  /** Arm `k`'s pose each frame: free (always bent), then its strike path by its weight. */
  private poseArm(arm: KrakenArm, k: number): void {
    const h = this.hazards[k];
    if (!h || h.stage === 'off' || h.stance.len <= 0.05) return;
    arm.poser.base(_p);
    const hs = Math.sin(h.area.heading);
    const hc = Math.cos(h.area.heading);
    const ex = _p.x + hs * 2.5;
    const ez = _p.z + hc * 2.5;
    const phase = (this.t / 7) * Math.PI * 2 + k * 1.7;
    poseFreeArm(arm, ex, ez, this.waves.heightAt(ex, ez, this.t), h.stance, phase, 0.9, hs, hc);
    // Striking, its suckers face down onto the water where it lands.
    if (arm.weight > 0) arm.poser.pose(arm.path, arm.weight, _strikeAim.set(h.area.x, -8, h.area.z, 0, 0, 0));
  }

  /** The slam lands (or the sweep starts): a ring of spray, and a plume where it hits. */
  private impact(h: Hazard, t: number, gentle: boolean): void {
    const a = h.area;
    const spec = HAZARD_SPECS[h.kind];
    const n = gentle ? 4 : 8;
    for (let k = 0; k < n; k++) {
      const ang = a.heading + (k / n - 0.5) * (h.kind === 'slam' ? 1.2 : spec.arc);
      const r = spec.radius * (h.kind === 'slam' ? 0.25 + 0.6 * (k / n) : 0.3);
      const x = a.x + Math.sin(ang) * r;
      const z = a.z + Math.cos(ang) * r;
      this.splashes.spawn(
        x,
        this.waves.heightAt(x, z, t),
        z,
        t,
        gentle ? 2 : 3.8,
        gentle ? 0 : k % 2,
        this.rand(),
      );
    }
  }

  private sprayAlong(h: Hazard, t: number, u: number): void {
    if (this.rand() > 0.35) return;
    const a = h.area;
    const spec = HAZARD_SPECS[h.kind];
    const ang = a.heading - spec.arc / 2 + spec.arc * u;
    const r = spec.radius * (0.4 + 0.5 * this.rand());
    const x = a.x + Math.sin(ang) * r;
    const z = a.z + Math.cos(ang) * r;
    this.splashes.spawn(x, this.waves.heightAt(x, z, t), z, t, 1.4 + this.rand(), 0, this.rand());
  }

  /** For the warm-up: every arm shown; returns the undo. */
  stageWarm(): () => void {
    const was = this.kraken.arms.map((a) => a.root.visible);
    for (const a of this.kraken.arms) a.root.visible = true;
    return () => this.kraken.arms.forEach((a, i) => (a.root.visible = was[i]!));
  }

  dispose(): void {
    this.kraken.dispose();
  }
}

/** How much of a hazard's arm stands over the water (m along it) when it isn't striking. */
const STAND_LENGTH: Readonly<Record<HazardKind, number>> = { slam: 15, sweep: 12 };

/** The hazards' arms: about 30 m long at the hazards' kraken's scale. */
const HAZARD_ARM_SCALES: readonly number[] = [1.1, 1.1, 1.1, 1.1, 1.1, 1.1, 1.1, 1.1];
