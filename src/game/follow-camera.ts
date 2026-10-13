import type { PerspectiveCamera } from 'three/webgpu';
import type { CollisionWorld } from './collision';
import { smoothstep, wrapAngle } from '../util/math';

export interface CameraRig {
  /** Distance limits and the default. */
  minDist: number;
  maxDist: number;
  dist: number;
  /** Pivot height above the target's feet. */
  pivotY: number;
  pitchMin: number;
  pitchMax: number;
  /** Pitch the rig starts at when you switch to it. */
  pitch: number;
  /** Seconds without look input before the camera eases back behind the target. */
  recenterDelay: number;
  recenterRate: number;
  fov: number;
  /**
   * Terrain clearance round the camera: the ground this far away in each of the four axis directions
   * must stay at least `ringClear` below the camera, so it keeps off cliff faces and rock skirts that
   * stand out past the height field.
   */
  ringRadius: number;
  ringClear: number;
}

export const WALK_RIG: CameraRig = {
  minDist: 2.2,
  maxDist: 14,
  dist: 6.2,
  pivotY: 1.55,
  pitchMin: -0.35,
  pitchMax: 1.25,
  pitch: 0.32,
  recenterDelay: 1.6,
  recenterRate: 1.4,
  fov: 55,
  ringRadius: 1,
  ringClear: -0.3,
};

export const SAIL_RIG: CameraRig = {
  minDist: 14,
  maxDist: 60,
  dist: 32,
  pivotY: 7.5,
  pitchMin: -0.05,
  pitchMax: 1.1,
  pitch: 0.2,
  recenterDelay: 2.5,
  recenterRate: 0.8,
  fov: 55,
  ringRadius: 7,
  ringClear: 0.45,
};

export interface CameraLook {
  lookX: number;
  lookY: number;
  zoom: number;
}

/** Collision march: sample spacing (m) along the line from the pivot, and the most samples taken. */
const STEP = 0.25;
const MAX_SAMPLES = 160;
/** How high the camera keeps above the ground under it. */
const GROUND_CLEAR = 0.45;
/**
 * How far the camera keeps from colliders. Low down it's the near plane's half-diagonal (about
 * 0.11 m at fov 55, 16:9) plus a margin, so you can still walk along a wall with the camera behind
 * you; higher up it's more, for eaves, roofs, and balconies that stand past their footprints.
 */
const PAD_LOW = 0.25;
const PAD_HIGH = 0.7;
/** The closest the camera comes to the pivot when a wall is right behind you. */
const NEAR_DIST = 0.15;
/**
 * Under a low span (a lamp head, an awning, a balcony, a lintel) the pivot ducks to keep this far
 * under it, so the eye, which can come in to NEAR_DIST of the pivot, never ends up inside it. Spans
 * lower than PIVOT_FLOOR over your feet (rocks, cliff overhangs you walk through) don't count.
 */
const PIVOT_CLEAR = PAD_LOW;
const PIVOT_FLOOR = 0.9;
const NO_LOOK: CameraLook = { lookX: 0, lookY: 0, zoom: 0 };

/** A held camera shot for a story beat: where the camera sits and what it looks at (world space). */
export interface CameraShot {
  x: number;
  y: number;
  z: number;
  tx: number;
  ty: number;
  tz: number;
}

/** Seconds to ease into a held shot and back out to the follow camera. */
const SHOT_EASE = 1.1;

/**
 * Third-person orbit camera (Phase 0 S6): mouse-drag/right-stick orbit, wheel zoom, a gentle
 * recenter behind the target when you walk or sail without touching the camera, and collision
 * against terrain, buildings, and the water surface (pull in fast, ease out slowly).
 * Yaw uses the ship convention: the camera looks along (sin yaw, cos yaw).
 */
export class FollowCamera {
  yaw = 0;
  pitch = 0.32;
  rig: CameraRig = WALK_RIG;
  private wantDist = WALK_RIG.dist;
  private curDist = WALK_RIG.dist;
  private idle = 0;
  private readonly pivot = { x: 0, y: 0, z: 0 };
  /** The pivot the eye orbits and looks at: `pivot`, ducked `duck` m under a low span. */
  private readonly aim = { x: 0, y: 0, z: 0 };
  private duck = 0;
  private primed = false;
  private blend = 1;
  private readonly from = { x: 0, y: 0, z: 0 };
  private readonly last = { x: 0, y: 0, z: 0 };
  private shot: CameraShot | null = null;
  private held: CameraShot | null = null;
  private shotMix = 0;
  /** A cut from one held shot to another eases from where the camera was (`switchFrom`). */
  private readonly switchFrom: CameraShot = { x: 0, y: 0, z: 0, tx: 0, ty: 0, tz: 0 };
  private readonly switched: CameraShot = { x: 0, y: 0, z: 0, tx: 0, ty: 0, tz: 0 };
  private switchMix = 1;
  private readonly lastLook = { x: 0, y: 0, z: 0 };
  private column: { x: number; z: number; r: number } | null = null;
  /** Where a held shot's subject sits on screen (see `setScreenPan`), wanted and eased. */
  private panWantX = 0;
  private panWantY = 0;
  private panX = 0;
  private panY = 0;

  /**
   * Holds a framed shot (the christening's look at the bow) until cleared with null, easing in and
   * back out to the follow camera. Look input is ignored while a shot holds. A new shot while one's
   * on screen eases across from the current view; the same object mutated each frame (a flyover)
   * is followed exactly.
   */
  frame(shot: CameraShot | null): void {
    if (shot && this.held && shot !== this.held && this.shotMix > 0) {
      this.switchFrom.x = this.last.x;
      this.switchFrom.y = this.last.y;
      this.switchFrom.z = this.last.z;
      this.switchFrom.tx = this.lastLook.x;
      this.switchFrom.ty = this.lastLook.y;
      this.switchFrom.tz = this.lastLook.z;
      this.switchMix = 0;
    }
    this.shot = shot;
    if (shot) this.held = shot;
  }

  /** Jumps straight into a shot with no ease (the first frame of a flyover). */
  cut(shot: CameraShot): void {
    this.shot = shot;
    this.held = shot;
    this.shotMix = 1;
    this.switchMix = 1;
  }

  /**
   * Slides a held shot so its subject sits `nx` of the half-width right of centre and `ny` of the
   * half-height below it (0, 0 is centred), moving eye and target together so the angle doesn't
   * change. Room for a course picture (the spyglass): docked on the left, or across the top of a
   * tall screen. Eases in and out; follow views ignore it.
   */
  setScreenPan(nx: number, ny = 0): void {
    this.panWantX = nx;
    this.panWantY = ny;
  }

  /** Drops any held shot at once, back on the follow camera (behind a fade). */
  release(): void {
    this.shot = null;
    this.held = null;
    this.shotMix = 0;
    this.switchMix = 1;
  }

  /**
   * Where the follow camera comes to rest behind `target` facing `heading` (ignoring collision), so
   * a flyover can land exactly on it.
   */
  restPose(target: { x: number; y: number; z: number }, heading: number, out: CameraShot): CameraShot {
    const cp = Math.cos(this.pitch);
    const dx = Math.sin(heading) * cp,
      dy = -Math.sin(this.pitch),
      dz = Math.cos(heading) * cp;
    out.tx = target.x;
    out.ty = target.y + this.rig.pivotY;
    out.tz = target.z;
    out.x = out.tx - dx * this.wantDist;
    out.y = out.ty - dy * this.wantDist;
    out.z = out.tz - dz * this.wantDist;
    return out;
  }

  /**
   * Keeps the camera out of a vertical column (the lighthouse's watch room, from its gallery): the
   * yaw turns, never more than it must, so the line from you back to the camera passes outside the
   * column's radius. Null lifts it. The yaw still recenters behind you as you walk round.
   */
  keepOutside(column: { x: number; z: number; r: number } | null): void {
    this.column = column;
  }

  /** Whether a held story shot is on screen (or still easing out). */
  get framing(): boolean {
    return this.shotMix > 0;
  }

  /** Turns the yaw (eased) until the camera's side of `target` is clear of the column. */
  private clearColumn(target: { x: number; z: number }, dt: number): void {
    const c = this.column!;
    const rp = Math.hypot(target.x - c.x, target.z - c.z);
    if (rp < 1e-3) return;
    // The back ray (pivot to camera) clears the column while its angle from "out" is under `limit`.
    const limit = rp > c.r ? Math.acos(-Math.sqrt(1 - (c.r / rp) ** 2)) : Math.PI / 2;
    const out = Math.atan2(target.x - c.x, target.z - c.z);
    const back = wrapAngle(this.yaw + Math.PI - out);
    if (Math.abs(back) <= limit) return;
    const want = wrapAngle(out + (back >= 0 ? limit : -limit) - Math.PI);
    this.yaw = wrapAngle(this.yaw + wrapAngle(want - this.yaw) * (1 - Math.exp(-6 * dt)));
  }

  setRig(rig: CameraRig, snap = false): void {
    if (rig === this.rig) return;
    this.rig = rig;
    this.wantDist = rig.dist;
    if (snap) this.curDist = rig.dist;
    this.blend = snap ? 1 : 0;
    this.from.x = this.last.x;
    this.from.y = this.last.y;
    this.from.z = this.last.z;
    this.pitch = rig.pitch;
  }

  /** Places the camera behind a heading immediately (spawn, teleport). */
  snapBehind(heading: number): void {
    this.yaw = heading;
    this.primed = false;
    this.curDist = this.wantDist;
    this.duck = 0;
  }

  update(
    dt: number,
    cam: PerspectiveCamera,
    look: CameraLook,
    target: { x: number; y: number; z: number },
    heading: number,
    moving: boolean,
    world: CollisionWorld | null,
    t: number,
  ): void {
    const r = this.rig;
    const input = this.shot ? NO_LOOK : look;
    const looking = input.lookX !== 0 || input.lookY !== 0;
    this.yaw = wrapAngle(this.yaw - input.lookX);
    this.pitch = Math.min(r.pitchMax, Math.max(r.pitchMin, this.pitch + input.lookY));
    if (input.zoom)
      this.wantDist = Math.min(r.maxDist, Math.max(r.minDist, this.wantDist * Math.pow(1.12, input.zoom)));

    // Recenter behind the target while it moves, unless you're steering the camera or walking toward it.
    this.idle = looking ? 0 : this.idle + dt;
    if (moving && this.idle > r.recenterDelay) {
      const d = wrapAngle(heading - this.yaw);
      if (Math.abs(d) < 2.2) this.yaw = wrapAngle(this.yaw + d * (1 - Math.exp(-r.recenterRate * dt)));
    }

    if (this.column && !this.shot) this.clearColumn(target, dt);

    // Pivot: follow xz tightly and y more softly so steps and wading don't bob the view.
    const tx = target.x,
      ty = target.y + r.pivotY,
      tz = target.z;
    if (!this.primed) {
      this.pivot.x = tx;
      this.pivot.y = ty;
      this.pivot.z = tz;
      this.primed = true;
    } else {
      const kxz = 1 - Math.exp(-14 * dt),
        ky = 1 - Math.exp(-7 * dt);
      this.pivot.x += (tx - this.pivot.x) * kxz;
      this.pivot.y += (ty - this.pivot.y) * ky;
      this.pivot.z += (tz - this.pivot.z) * kxz;
    }

    // Duck under a low span at once; rise back slowly once you're out from under it.
    let need = 0;
    if (world)
      need =
        this.pivot.y -
        world.cameraCeilingAt(this.pivot.x, this.pivot.y, this.pivot.z, PIVOT_CLEAR, target.y + PIVOT_FLOOR);
    this.duck = need >= this.duck ? need : this.duck + (need - this.duck) * (1 - Math.exp(-2.5 * dt));
    const aim = this.aim;
    aim.x = this.pivot.x;
    aim.y = this.pivot.y - this.duck;
    aim.z = this.pivot.z;

    // Direction from the camera to the pivot.
    const cp = Math.cos(this.pitch),
      sp = Math.sin(this.pitch);
    const dx = Math.sin(this.yaw) * cp,
      dy = -sp,
      dz = Math.cos(this.yaw) * cp;

    // Collision: march from the pivot toward the wanted camera position and stop at the last clear
    // sample. Close samples (not a fixed count) so a thin wall can't fall between two of them.
    let allowed = this.wantDist;
    if (world) {
      const n = Math.min(MAX_SAMPLES, Math.ceil(this.wantDist / STEP));
      const step = this.wantDist / n;
      for (let i = 1; i <= n; i++) {
        const s = step * i;
        if (blocked(world, r, aim, aim.x - dx * s, aim.y - dy * s, aim.z - dz * s)) {
          allowed = Math.max(NEAR_DIST, s - step);
          break;
        }
      }
    }
    this.curDist =
      allowed < this.curDist ? allowed : this.curDist + (allowed - this.curDist) * (1 - Math.exp(-2.5 * dt));

    let x = aim.x - dx * this.curDist,
      y = aim.y - dy * this.curDist,
      z = aim.z - dz * this.curDist;
    if (world) {
      // The ground under the camera: not a deck stacked high overhead (a surface's lowest level, or
      // the one at the camera's own height, whichever is lower).
      const floor = Math.max(groundUnder(world, x, z, y) + 0.4, world.waterAt(x, z, t) + 0.5);
      if (y < floor) y = floor;
    }

    // Smooth rig changes (boarding the ship) over ~0.8 s, starting from the last output.
    if (this.blend < 1) {
      this.blend = Math.min(1, this.blend + dt / 0.8);
      const e = this.blend * this.blend * (3 - 2 * this.blend);
      x = this.from.x + (x - this.from.x) * e;
      y = this.from.y + (y - this.from.y) * e;
      z = this.from.z + (z - this.from.z) * e;
    }
    let lx = aim.x,
      ly = aim.y,
      lz = aim.z;
    this.shotMix = Math.min(1, Math.max(0, this.shotMix + (this.shot ? dt : -dt) / SHOT_EASE));
    if (this.shotMix > 0 && this.held) {
      let h = this.held;
      if (this.switchMix < 1) {
        this.switchMix = Math.min(1, this.switchMix + dt / SHOT_EASE);
        const k = this.switchMix * this.switchMix * (3 - 2 * this.switchMix);
        const f = this.switchFrom,
          s = this.switched;
        s.x = f.x + (h.x - f.x) * k;
        s.y = f.y + (h.y - f.y) * k;
        s.z = f.z + (h.z - f.z) * k;
        s.tx = f.tx + (h.tx - f.tx) * k;
        s.ty = f.ty + (h.ty - f.ty) * k;
        s.tz = f.tz + (h.tz - f.tz) * k;
        h = s;
      }
      const e = this.shotMix * this.shotMix * (3 - 2 * this.shotMix);
      x += (h.x - x) * e;
      y += (h.y - y) * e;
      z += (h.z - z) * e;
      lx += (h.tx - lx) * e;
      ly += (h.ty - ly) * e;
      lz += (h.tz - lz) * e;
    } else if (!this.shot) {
      this.held = null;
    }

    this.last.x = x;
    this.last.y = y;
    this.last.z = z;
    this.lastLook.x = lx;
    this.lastLook.y = ly;
    this.lastLook.z = lz;

    // The screen pan (after `last`, which shot switches ease from, so it stays continuous).
    const ease = 1 - Math.exp(-4 * dt);
    this.panX += (this.panWantX - this.panX) * ease;
    this.panY += (this.panWantY - this.panY) * ease;
    const held = this.shotMix * this.shotMix * (3 - 2 * this.shotMix);
    if ((Math.abs(this.panX) > 1e-4 || Math.abs(this.panY) > 1e-4) && held > 0) {
      const fx = lx - x,
        fy = ly - y,
        fz = lz - z;
      const dist = Math.hypot(fx, fy, fz) || 1;
      const flat = Math.hypot(fx, fz) || 1;
      // The view's right, level; moving eye and target left puts the subject right of centre, and
      // moving them up puts it lower.
      const rx = -fz / flat,
        rz = fx / flat;
      const halfHeight = dist * Math.tan((cam.fov * Math.PI) / 360);
      let side = -this.panX * halfHeight * cam.aspect * held;
      let lift = this.panY * halfHeight * held;
      // Less if a wall's in the way.
      for (
        let i = 0;
        i < 3 && world && world.sightBlockedAt(x + rx * side, y + lift, z + rz * side, 0.25);
        i++
      ) {
        side *= 0.5;
        lift *= 0.5;
      }
      x += rx * side;
      z += rz * side;
      y += lift;
      lx += rx * side;
      lz += rz * side;
      ly += lift;
    }

    cam.position.set(x, y, z);
    cam.lookAt(lx, ly, lz);
    if (Math.abs(cam.fov - r.fov) > 0.01) {
      cam.fov += (r.fov - cam.fov) * (1 - Math.exp(-4 * dt));
      cam.updateProjectionMatrix();
    }
  }
}

/** Whether the camera can't sit at (x, y, z): too near the ground, a cliff face, or a collider. */
function blocked(
  world: CollisionWorld,
  r: CameraRig,
  pivot: { x: number; y: number; z: number },
  x: number,
  y: number,
  z: number,
): boolean {
  // The camera's own height picks the level where walk surfaces stack (the lighthouse gallery over
  // its knoll), so the pad there is for the deck under it, not the ground far below.
  const g = world.groundAt(x, z, y);
  if (y < g + GROUND_CLEAR) return true;
  const k = r.ringRadius,
    lift = y - r.ringClear;
  if (
    k > 0 &&
    (groundUnder(world, x + k, z, y) > lift ||
      groundUnder(world, x - k, z, y) > lift ||
      groundUnder(world, x, z + k, y) > lift ||
      groundUnder(world, x, z - k, y) > lift)
  )
    return true;
  const pad = PAD_LOW + (PAD_HIGH - PAD_LOW) * smoothstep(1.8, 3, y - g);
  return world.cameraBlockedAt(x, y, z, pad, pivot.x, pivot.y, pivot.z);
}

/**
 * The walkable height under a camera at height y: a stacked surface's lowest level (without y), or
 * the level at the camera's height when that's lower (nothing but a deck far overhead there).
 */
function groundUnder(world: CollisionWorld, x: number, z: number, y: number): number {
  return Math.min(world.groundAt(x, z), world.groundAt(x, z, y));
}
