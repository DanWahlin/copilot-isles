import type { CollisionWorld, SurfaceKind } from './collision';
import { clamp01, lerp, smoothstep, wrapAngle } from '../util/math';

export interface MoveIntent {
  /** Strafe right (+) / left (−), camera-relative. */
  moveX: number;
  /** Forward (+) / back (−), camera-relative. */
  moveY: number;
  run: boolean;
  jump: boolean;
}

export type PlayerMode = 'ground' | 'wade' | 'swim' | 'air';

/**
 * Where the player may swim (game/swim-bounds.ts). Without one, wading stops at chest depth.
 */
export interface SwimLimit {
  /**
   * Metres left before the soft edge at (x, z) (negative past it), and the way back in (a unit
   * vector) written to `back`.
   */
  roomAt(x: number, z: number, t: number, back: { x: number; z: number }): number;
  /** Whether (x, z) is in the waters you may swim at all: a hard stop the soft edge keeps you inside. */
  inWaters(x: number, z: number): boolean;
}

export interface PlayerTuning {
  radius: number;
  walkSpeed: number;
  runSpeed: number;
  accel: number;
  decel: number;
  /** Heading slew rate (rad/s) toward the movement direction. */
  turnRate: number;
  stepUp: number;
  stepDown: number;
  /** Minimum terrain normal-y you can walk up (≈ cos 42°). */
  minSlopeY: number;
  gravity: number;
  jumpSpeed: number;
  /** Water depth where wading starts to slow you, and (with nowhere to swim) where you can go no further. */
  wadeStart: number;
  wadeMax: number;
  /** Depth where the body floats off the bed and swims (a `SwimLimit` must say where). */
  swimStart: number;
  /**
   * How far under the surface the feet's spot rides afloat: treading water (upright, head and shoulders
   * out), and in the stroke (the body lies along the water, so it rides higher).
   */
  treadFloat: number;
  strokeFloat: number;
  /** Swimming speed, and the faster stroke with the run key (m/s). */
  swimSpeed: number;
  swimRunSpeed: number;
  swimAccel: number;
  swimDecel: number;
  /** Heading slew rate afloat (rad/s): you turn in place, then swim where you face. */
  swimTurnRate: number;
  /** The most the bed may rise over a swimmer's feet in one move (onto a ledge), m. */
  swimStepUp: number;
  /** The soft edge slows you over its last `swimSoft` m and drifts you back in at up to `swimPush` m/s. */
  swimSoft: number;
  swimPush: number;
}

const DEFAULT_TUNING: PlayerTuning = {
  radius: 0.36,
  walkSpeed: 1.75,
  runSpeed: 4.45,
  accel: 7.6,
  decel: 10.5,
  turnRate: 9.4,
  stepUp: 0.55,
  stepDown: 0.7,
  minSlopeY: 0.74,
  gravity: 22,
  jumpSpeed: 5.4,
  wadeStart: 0.22,
  wadeMax: 1.05,
  // The captains are short (shoulders ~0.7 m, the head 0.93-1.21 m): past shoulder depth they float.
  swimStart: 0.74,
  treadFloat: 0.7,
  strokeFloat: 0.48,
  swimSpeed: 0.95,
  swimRunSpeed: 1.6,
  swimAccel: 2.4,
  swimDecel: 1.5,
  swimTurnRate: 3.4,
  swimStepUp: 0.3,
  swimSoft: 6,
  swimPush: 0.7,
};

/** Afloat or back on the bed: the band (m) under `swimStart` where a swimmer still swims. */
const SWIM_HYSTERESIS = 0.06;
/** How much water a swim move may step through (a fall's lip, a pool over a stream), m. */
const WATER_STEP = 0.4;

/**
 * Kinematic third-person walker (Phase 0 S6). Camera-relative movement with smoothed speed and
 * heading, step-up/down, a walkable-slope limit, wading that slows you, a small hop, and (where a
 * `SwimLimit` says) swimming past wading depth, with a soft edge that turns you back. Runs on the
 * engine's fixed step; the render reads `x/y/z/heading`.
 */
export class PlayerController {
  x = 0;
  y = 0;
  z = 0;
  heading = 0;
  /** Horizontal velocity (m/s). */
  vx = 0;
  vz = 0;
  vy = 0;
  mode: PlayerMode = 'ground';
  /** Water depth at the feet's spot over the bed (m, ≥ 0). */
  depth = 0;
  waterY = 0;
  surface: SurfaceKind = 'sand';
  /** True for the step on which the player touched down after being airborne. */
  landed = false;
  /** How far the body floats (0 wading or ashore, 1 swimming), eased with the depth. */
  afloat = 0;
  /** How much of floating is the stroke (0 treading water, 1 swimming along). */
  stroke = 0;
  /** Where swimming is allowed (null: nowhere, wading stops at chest depth). */
  swimLimit: SwimLimit | null = null;
  /** Room left to the soft edge as of the last swimming step (m; Infinity ashore). */
  swimRoom = Infinity;
  readonly tune: PlayerTuning;
  private readonly p = { x: 0, z: 0 };
  private readonly back = { x: 0, z: 0 };
  /** Afloat: speed along the heading from your own stroke, and the soft edge's drift (m/s). */
  private own = 0;
  private driftX = 0;
  private driftZ = 0;
  /** The surface the swimmer rides, eased so the chop doesn't jitter him. */
  private float = 0;

  constructor(tune: Partial<PlayerTuning> = {}) {
    this.tune = { ...DEFAULT_TUNING, ...tune };
  }

  get speed(): number {
    return Math.hypot(this.vx, this.vz);
  }

  /** The pace the body moves at for the animation: afloat, the stroke's own (not the edge's drift). */
  get animSpeed(): number {
    return this.mode === 'swim' ? Math.abs(this.own) : this.speed;
  }

  /** Puts the walker at (x, z); `y` picks the level where surfaces stack (a stair's turns). */
  teleport(world: CollisionWorld, x: number, z: number, heading = this.heading, y?: number): void {
    this.x = x;
    this.z = z;
    this.heading = heading;
    this.vx = this.vz = this.vy = 0;
    this.own = this.driftX = this.driftZ = 0;
    this.y = world.groundAt(x, z, y);
    this.mode = 'ground';
    this.afloat = this.stroke = 0;
    this.swimRoom = Infinity;
  }

  /**
   * Advances one fixed step. `cameraYaw` uses the ship's convention: forward = (sin yaw, cos yaw).
   */
  step(dt: number, intent: MoveIntent, cameraYaw: number, world: CollisionWorld, t: number): void {
    const T = this.tune;
    this.landed = false;

    // Camera-relative wish direction. right = (−cos yaw, sin yaw) for a y-up, +z-south world.
    const fx = Math.sin(cameraYaw),
      fz = Math.cos(cameraYaw);
    let wx = fx * intent.moveY - fz * intent.moveX;
    let wz = fz * intent.moveY + fx * intent.moveX;
    const wl = Math.hypot(wx, wz);
    if (wl > 1) {
      wx /= wl;
      wz /= wl;
    }

    this.waterY = world.waterAt(this.x, this.z, t);
    this.depth = Math.max(0, this.waterY - world.groundAt(this.x, this.z, this.y));
    if (this.mode === 'swim') this.swimMove(dt, wx, wz, Math.min(1, wl), intent.run, t);
    else this.walkMove(dt, wx, wz, wl, intent.run);

    // Horizontal move with collision, then walkability (step, slope, depth) with axis sliding.
    const nx = this.x + this.vx * dt,
      nz = this.z + this.vz * dt;
    if (!this.tryMove(nx, nz, world, t)) {
      if (!this.tryMove(nx, this.z, world, t) && !this.tryMove(this.x, nz, world, t)) {
        this.vx *= 0.5;
        this.vz *= 0.5;
        this.own *= 0.5;
      }
    }

    // Vertical.
    const g = world.groundAt(this.x, this.z, this.y);
    const water = world.waterAt(this.x, this.z, t);
    if (this.mode === 'air') {
      this.vy -= T.gravity * dt;
      this.y += this.vy * dt;
      if (this.y <= g) {
        this.y = g;
        this.vy = 0;
        this.mode = 'ground';
        this.landed = true;
      } else if (this.swimLimit && water - g > T.swimStart && this.y <= water - T.treadFloat) {
        // Down into water too deep to stand in: afloat where you went in.
        this.vy = 0;
        this.mode = 'swim';
        this.float = water;
        this.landed = true;
      }
    } else if (this.mode === 'swim') {
      // Ride the surface (eased, so the chop doesn't jitter you), never under the bed.
      this.float += (water - this.float) * (1 - Math.exp(-6 * dt));
      const ride = Math.max(g, this.float - lerp(T.treadFloat, T.strokeFloat, this.stroke));
      this.y += (ride - this.y) * (1 - Math.exp(-8 * dt));
      if (this.y < g) this.y = g;
    } else if (g < this.y - T.stepDown) {
      this.mode = 'air';
      this.vy = 0;
    } else {
      // Ease onto small steps so stairs and bumpy terrain don't jitter the camera. Wading, the water
      // holds you up: you settle onto the bed more slowly (out of a swim, or as a swell passes).
      const settle = this.mode === 'wade' && this.y > g ? 10 : 30;
      this.y += (g - this.y) * (1 - Math.exp(-settle * dt));
      if (Math.abs(g - this.y) < 0.002) this.y = g;
      if (intent.jump && this.depth < T.wadeStart + 0.2) {
        this.mode = 'air';
        this.vy = T.jumpSpeed;
      }
    }

    this.waterY = water;
    this.depth = Math.max(0, water - g);
    if (this.mode !== 'air') {
      const swim =
        !!this.swimLimit && this.depth > (this.mode === 'swim' ? T.swimStart - SWIM_HYSTERESIS : T.swimStart);
      if (swim && this.mode !== 'swim') this.startSwimming(water);
      this.mode = swim ? 'swim' : this.depth > T.wadeStart ? 'wade' : 'ground';
    }
    if (this.mode !== 'swim') this.swimRoom = Infinity;

    // The pose: afloat eases in with the depth, the stroke with your own pace (and out near the bed).
    const floatWant =
      this.swimLimit && this.mode !== 'air' ? smoothstep(0.55, T.swimStart + 0.08, this.depth) : 0;
    this.afloat += (floatWant - this.afloat) * (1 - Math.exp(-4 * dt));
    const strokeWant =
      this.mode === 'swim'
        ? smoothstep(0.08, 0.55, Math.abs(this.own)) * smoothstep(T.swimStart, T.swimStart + 0.3, this.depth)
        : 0;
    this.stroke += (strokeWant - this.stroke) * (1 - Math.exp(-3 * dt));
    this.surface = world.surfaceAt(this.x, this.z, t, this.y);
  }

  /** Ashore and wading: velocity eases toward the wish, the heading toward where you go. */
  private walkMove(dt: number, wx: number, wz: number, wl: number, run: boolean): void {
    const T = this.tune;
    const wade = smoothstep(T.wadeStart, T.wadeMax, this.depth);
    const air = this.mode === 'air';
    const top = (run ? T.runSpeed : T.walkSpeed) * (1 - 0.6 * wade) * (air ? 0.9 : 1);
    const tx = wx * top,
      tz = wz * top;
    const moving = wl > 0.01;
    const rate = (moving ? T.accel : T.decel) * (air ? 0.25 : 1);
    const k = 1 - Math.exp(-rate * dt);
    this.vx += (tx - this.vx) * k;
    this.vz += (tz - this.vz) * k;

    if (moving) {
      const target = Math.atan2(wx, wz);
      const d = wrapAngle(target - this.heading);
      const pivot = Math.abs(d) > 1.25 && this.speed < T.walkSpeed * 0.75;
      const turnRate = T.turnRate * (pivot ? 1.65 : 1);
      this.heading = wrapAngle(this.heading + d * (1 - Math.exp(-turnRate * dt)));
      if (!air && Math.abs(d) > 1.75 && this.speed > T.walkSpeed) {
        const settle = 1 - Math.exp(-5.5 * dt);
        this.vx *= 1 - settle * 0.28;
        this.vz *= 1 - settle * 0.28;
      }
    }
  }

  /**
   * Afloat: turn toward the wish (in place if it's behind you) and stroke where you face. Near the
   * swim limit's edge the stroke out fades and a drift carries you back in (a soft wall, no snap).
   */
  private swimMove(dt: number, wx: number, wz: number, wl: number, run: boolean, t: number): void {
    const T = this.tune;
    let d = 0;
    if (wl > 0.01) {
      d = wrapAngle(Math.atan2(wx, wz) - this.heading);
      this.heading = wrapAngle(this.heading + d * (1 - Math.exp(-T.swimTurnRate * dt)));
    }
    const hx = Math.sin(this.heading),
      hz = Math.cos(this.heading);
    // Facing well away from the wish, he turns on the spot before he strokes.
    let want = (run ? T.swimRunSpeed : T.swimSpeed) * wl * smoothstep(0.2, 0.9, Math.cos(d));

    // The soft edge: k is 0 well inside, 1 at the edge; past it the drift back grows.
    const room = this.swimLimit ? this.swimLimit.roomAt(this.x, this.z, t, this.back) : Infinity;
    this.swimRoom = room;
    const k = Number.isFinite(room) ? clamp01(1 - room / T.swimSoft) : 0;
    const out = -(hx * this.back.x + hz * this.back.z);
    if (k > 0 && out > 0) want *= (1 - k * out) ** 2;
    const rate = want > this.own ? T.swimAccel : T.swimDecel;
    this.own += (want - this.own) * (1 - Math.exp(-rate * dt));
    const push = k > 0 ? T.swimPush * k * k + Math.min(1, Math.max(0, -room) * 0.5) : 0;
    const e = 1 - Math.exp(-2 * dt);
    this.driftX += (this.back.x * push - this.driftX) * e;
    this.driftZ += (this.back.z * push - this.driftZ) * e;
    this.vx = hx * this.own + this.driftX;
    this.vz = hz * this.own + this.driftZ;
  }

  /** From wading into swimming: keep the pace you came in with, riding the surface where you are. */
  private startSwimming(water: number): void {
    this.own = Math.max(0, this.vx * Math.sin(this.heading) + this.vz * Math.cos(this.heading));
    this.driftX = this.driftZ = 0;
    this.float = water;
  }

  /** Moves to (nx, nz) if the destination is walkable (or swimmable); returns false when blocked. */
  private tryMove(nx: number, nz: number, world: CollisionWorld, t: number): boolean {
    const T = this.tune;
    this.p.x = nx;
    this.p.z = nz;
    world.pushOut(this.p, T.radius, this.y);
    const gx = this.p.x,
      gz = this.p.z;
    const g0 = world.groundAt(this.x, this.z, this.y);
    const g1 = world.groundAt(gx, gz, this.y);
    const rise = g1 - Math.max(this.y, g0);
    const swimming = this.mode === 'swim';
    if (this.mode !== 'air' && rise > (swimming ? T.swimStepUp : T.stepUp)) return false;
    if (rise > 0.05 && world.slopeAt(gx, gz, this.y) < T.minSlopeY) return false;
    const w1 = world.waterAt(gx, gz, t);
    const depth = w1 - g1;
    const w0 = world.waterAt(this.x, this.z, t);
    const curDepth = w0 - g0;
    if (swimming) {
      if (!this.swimLimit!.inWaters(gx, gz)) return false;
      // Not up or down a fall's lip, nor from a pool into a stream under it.
      if (Math.abs(w1 - w0) > WATER_STEP && depth > T.wadeStart) return false;
    } else if (depth > T.wadeMax && depth > curDepth && (!this.swimLimit || this.mode !== 'wade')) {
      // Too deep: allowed only if it gets shallower (so you can always walk back out), or wading on
      // into water you can swim in (never off a quay or a deck into the deep).
      return false;
    }
    this.x = gx;
    this.z = gz;
    return true;
  }
}
