import type { CollisionWorld, SurfaceKind } from './collision';
import { smoothstep, wrapAngle } from '../util/math';

export interface MoveIntent {
  /** Strafe right (+) / left (−), camera-relative. */
  moveX: number;
  /** Forward (+) / back (−), camera-relative. */
  moveY: number;
  run: boolean;
  jump: boolean;
}

export type PlayerMode = 'ground' | 'wade' | 'air';

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
  /** Water depth where wading starts to slow you, and where you can go no further. */
  wadeStart: number;
  wadeMax: number;
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
};

/**
 * Kinematic third-person walker (Phase 0 S6). Camera-relative movement with smoothed speed and
 * heading, step-up/down, a walkable-slope limit, wading that slows you and stops you at chest
 * depth, and a small hop. Runs on the engine's fixed step; the render reads `x/y/z/heading`.
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
  /** Water depth at the feet (m, ≥ 0). */
  depth = 0;
  waterY = 0;
  surface: SurfaceKind = 'sand';
  /** True for the step on which the player touched down after being airborne. */
  landed = false;
  readonly tune: PlayerTuning;
  private readonly p = { x: 0, z: 0 };

  constructor(tune: Partial<PlayerTuning> = {}) {
    this.tune = { ...DEFAULT_TUNING, ...tune };
  }

  get speed(): number {
    return Math.hypot(this.vx, this.vz);
  }

  teleport(world: CollisionWorld, x: number, z: number, heading = this.heading): void {
    this.x = x;
    this.z = z;
    this.heading = heading;
    this.vx = this.vz = this.vy = 0;
    this.y = world.groundAt(x, z);
    this.mode = 'ground';
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
    this.depth = Math.max(0, this.waterY - world.groundAt(this.x, this.z));
    const wade = smoothstep(T.wadeStart, T.wadeMax, this.depth);
    const air = this.mode === 'air';
    const top = (intent.run ? T.runSpeed : T.walkSpeed) * (1 - 0.6 * wade) * (air ? 0.9 : 1);
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

    // Horizontal move with collision, then walkability (step, slope, depth) with axis sliding.
    const nx = this.x + this.vx * dt,
      nz = this.z + this.vz * dt;
    if (!this.tryMove(nx, nz, world, t)) {
      if (!this.tryMove(nx, this.z, world, t) && !this.tryMove(this.x, nz, world, t)) {
        this.vx *= 0.5;
        this.vz *= 0.5;
      }
    }

    // Vertical.
    const g = world.groundAt(this.x, this.z);
    if (this.mode === 'air') {
      this.vy -= T.gravity * dt;
      this.y += this.vy * dt;
      if (this.y <= g) {
        this.y = g;
        this.vy = 0;
        this.mode = 'ground';
        this.landed = true;
      }
    } else if (g < this.y - T.stepDown) {
      this.mode = 'air';
      this.vy = 0;
    } else {
      // Ease onto small steps so stairs and bumpy terrain don't jitter the camera.
      this.y += (g - this.y) * (1 - Math.exp(-30 * dt));
      if (Math.abs(g - this.y) < 0.002) this.y = g;
      if (intent.jump && this.depth < T.wadeStart + 0.2) {
        this.mode = 'air';
        this.vy = T.jumpSpeed;
      }
    }

    this.waterY = world.waterAt(this.x, this.z, t);
    this.depth = Math.max(0, this.waterY - g);
    if (this.mode !== 'air') this.mode = this.depth > T.wadeStart ? 'wade' : 'ground';
    this.surface = world.surfaceAt(this.x, this.z, t);
  }

  /** Moves to (nx, nz) if the destination is walkable; returns false when blocked. */
  private tryMove(nx: number, nz: number, world: CollisionWorld, t: number): boolean {
    const T = this.tune;
    this.p.x = nx;
    this.p.z = nz;
    world.pushOut(this.p, T.radius);
    const gx = this.p.x,
      gz = this.p.z;
    const g0 = world.groundAt(this.x, this.z);
    const g1 = world.groundAt(gx, gz);
    const rise = g1 - Math.max(this.y, g0);
    if (this.mode !== 'air' && rise > T.stepUp) return false;
    if (rise > 0.05 && world.slopeAt(gx, gz) < T.minSlopeY) return false;
    const depth = world.waterAt(gx, gz, t) - g1;
    const curDepth = world.waterAt(this.x, this.z, t) - g0;
    // Too deep: allowed only if it gets shallower (so you can always walk back out).
    if (depth > T.wadeMax && depth > curDepth) return false;
    this.x = gx;
    this.z = gz;
    return true;
  }
}
