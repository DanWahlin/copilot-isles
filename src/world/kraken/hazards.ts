import { Vector3, type Camera } from 'three/webgpu';
import { world } from '../uniforms';
import type { SplashPool } from '../battle/fx';
import type { Tier, WaveSampler } from '../contracts';
import { Kraken } from './kraken';
import type { MarkState, TellMarks } from './tell-marks';

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
  /** The tell before the strike (s): bubbles, shadow, swirl, ring. */
  tell: number;
  /** How long the strike can hit (s), from when it lands. */
  strike: number;
  /** The standing arm's danger radius (m) after the strike. */
  standing: number;
}

/** The hazards' sizes and timings, as data (the battle reads these, tests check them). */
export const HAZARD_SPECS: Readonly<Record<HazardKind, HazardSpec>> = {
  slam: { radius: 14, arc: Math.PI * 2, tell: 2.6, strike: 0.8, standing: 5 },
  sweep: { radius: 24, arc: 1.7, tell: 2.8, strike: 1.3, standing: 5 },
};

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
}

export interface HazardEvents {
  telling(h: Readonly<HazardArea>, kind: HazardKind, strikeIn: number): void;
  striking(h: Readonly<HazardArea>, kind: HazardKind): void;
  done(kind: HazardKind): void;
}

const _p = new Vector3();
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
      });
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
    const kraken = await Kraken.load({ tier: o.tier, base: o.base, sockets });
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
    if (h.stage === 'strike') return h.age >= spec.tell + LAND && h.age <= spec.tell + LAND + spec.strike;
    return h.stage === 'stand';
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
    this.events.telling(h.area, kind, spec.tell);
    return h.id;
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
    for (const h of this.hazards) {
      if (h.stage === 'off') continue;
      h.age += dt;
      this.animate(h, t, gentle);
    }
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
    // After the strike the danger shrinks to the standing arm's circle.
    const standing = smooth((age - tell - LAND - spec.strike - 0.2) / 1.2);
    a.radius = spec.radius + (spec.standing - spec.radius) * standing;
    a.arc = spec.arc + (Math.PI * 2 - spec.arc) * standing;
    // The evidence: the shadow darkens and swirls, bubbles come faster, the ring pulses.
    if (m) {
      const told = smooth(age / (tell * 0.7));
      const down = h.downAt < Infinity ? 1 - smooth((age - h.downAt) / 1.5) : 1;
      m.shadow = 0.9 * told * (1 - 0.6 * standing) * down;
      m.ring =
        (age < tell + LAND + spec.strike ? 0.45 + 0.4 * Math.abs(Math.sin(age * 5)) : 0.5) * told * down;
      m.radius = a.radius;
      m.arc = a.arc;
      m.spin = age * (1.2 + told);
      // Bubbles: a few at first, more as it comes.
      if (age < tell && t >= this.bubbleAt) {
        this.bubbleAt = t + (gentle ? 0.35 : 0.18) * (1.4 - age / tell);
        const r = Math.sqrt(this.rand()) * spec.radius * 0.45;
        const ang = this.rand() * Math.PI * 2;
        const bx = a.x + Math.cos(ang) * r;
        const bz = a.z + Math.sin(ang) * r;
        this.splashes.spawn(
          bx,
          this.waves.heightAt(bx, bz, t),
          bz,
          t,
          0.45 + this.rand() * 0.4,
          0,
          this.rand(),
        );
      }
    }
    if (age < tell) {
      arm.sink = arm.length + 4;
      return;
    }
    if (h.stage === 'tell') {
      h.stage = 'strike';
      this.kraken.play(h.arm, 'Tentacle_Attack', 0.2, 1.4);
    }
    // Up fast out of the water, then the strike (a slam over and down, or a sweep low across).
    const up = smooth((age - tell) / (gentle ? 0.9 : 0.55));
    const goneDown = h.downAt < Infinity ? smooth((age - h.downAt) / 2.2) : 0;
    const share = h.kind === 'sweep' ? 0.62 : 0.85;
    arm.sink = arm.length * (1 - share * up) + (arm.length * share + 4) * goneDown;
    const s = age - tell - LAND;
    if (!h.struck && s >= 0) {
      h.struck = true;
      this.events.striking(a, h.kind);
      this.impact(h, t, gentle);
    }
    if (h.kind === 'sweep' && s > 0 && s < spec.strike) this.sprayAlong(h, t, s / spec.strike);
    if (h.stage === 'strike' && s > spec.strike + 0.8) {
      h.stage = 'stand';
      this.kraken.play(h.arm, 'Tentacle_Idle', 1.2, 0.8);
    }
    this.strikePath(h, s);
    if (goneDown >= 1) {
      this.marks.release(h.mark);
      h.mark = null;
      h.stage = 'off';
      arm.weight = 0;
      this.events.done(h.kind);
    }
  }

  /** The arm's path for its strike (weighted in and out round it). */
  private strikePath(h: Hazard, s: number): void {
    const spec = HAZARD_SPECS[h.kind];
    const arm = this.kraken.arms[h.arm]!;
    const a = h.area;
    const w = smooth((s + LAND) / LAND) * (1 - smooth((s - spec.strike - 0.2) / 1.2));
    arm.weight = s > -LAND ? w : 0;
    if (arm.weight <= 0) return;
    const path = arm.path;
    path.clear();
    arm.poser.base(_p);
    path.push(_p.x, _p.y, _p.z);
    const hs = Math.sin(a.heading);
    const hc = Math.cos(a.heading);
    if (h.kind === 'slam') {
      // Up out of the circle's far side, over, and down across its middle (raised high, then it falls).
      const bx = _p.x;
      const bz = _p.z;
      const fall = smooth((s + LAND) / LAND);
      path.push(bx, 2, bz);
      path.push(bx + hs * 3, 11 - 2 * fall, bz + hc * 3);
      path.push(a.x + hs * 2 * fall, 0.5 + 9 * (1 - fall), a.z + hc * 2 * fall);
      path.push(a.x + hs * (2 + 6 * fall), 0.2 + 7 * (1 - fall), a.z + hc * (2 + 6 * fall));
    } else {
      // Rises at the middle and sweeps low across the arc, from one side to the other.
      const u = smooth(s / spec.strike);
      const ang = a.heading - spec.arc / 2 + spec.arc * u;
      const r = spec.radius * 0.75;
      path.push(_p.x, 3, _p.z);
      for (let k = 0; k <= 4; k++) {
        const b = ang - 0.9 + 0.225 * k;
        const rr = (r * (k + 1)) / 5;
        path.push(a.x + Math.sin(b) * rr, 1.6 - 0.2 * k, a.z + Math.cos(b) * rr);
      }
    }
    path.build();
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
        gentle ? 1.6 : 2.8,
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

/** Seconds from the end of the tell to the strike landing. */
const LAND = 0.7;
