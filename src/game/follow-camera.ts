import type { PerspectiveCamera } from 'three/webgpu';
import type { CollisionWorld } from './collision';
import { wrapAngle } from './player-controller';

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
};

export interface CameraLook {
  lookX: number;
  lookY: number;
  zoom: number;
}

const SAMPLES = 14;

/**
 * Third-person orbit camera (Phase 0 S6): hold-RMB/right-stick orbit, wheel zoom, a gentle
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
  private primed = false;
  private blend = 1;
  private readonly from = { x: 0, y: 0, z: 0 };
  private readonly last = { x: 0, y: 0, z: 0 };

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
    const looking = look.lookX !== 0 || look.lookY !== 0;
    this.yaw = wrapAngle(this.yaw - look.lookX);
    this.pitch = Math.min(r.pitchMax, Math.max(r.pitchMin, this.pitch + look.lookY));
    if (look.zoom)
      this.wantDist = Math.min(r.maxDist, Math.max(r.minDist, this.wantDist * Math.pow(1.12, look.zoom)));

    // Recenter behind the target while it moves, unless you're steering the camera or walking toward it.
    this.idle = looking ? 0 : this.idle + dt;
    if (moving && this.idle > r.recenterDelay) {
      const d = wrapAngle(heading - this.yaw);
      if (Math.abs(d) < 2.2) this.yaw = wrapAngle(this.yaw + d * (1 - Math.exp(-r.recenterRate * dt)));
    }

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

    // Direction from the camera to the pivot.
    const cp = Math.cos(this.pitch),
      sp = Math.sin(this.pitch);
    const dx = Math.sin(this.yaw) * cp,
      dy = -sp,
      dz = Math.cos(this.yaw) * cp;

    // Collision: march from the pivot toward the wanted camera position.
    let allowed = this.wantDist;
    if (world) {
      for (let i = 1; i <= SAMPLES; i++) {
        const s = (this.wantDist * i) / SAMPLES;
        const x = this.pivot.x - dx * s,
          y = this.pivot.y - dy * s,
          z = this.pivot.z - dz * s;
        if (y < world.groundAt(x, z) + 0.45 || world.occludedAt(x, y, z)) {
          allowed = Math.max(r.minDist * 0.5, s - this.wantDist / SAMPLES - 0.2);
          break;
        }
      }
    }
    this.curDist =
      allowed < this.curDist ? allowed : this.curDist + (allowed - this.curDist) * (1 - Math.exp(-2.5 * dt));

    let x = this.pivot.x - dx * this.curDist,
      y = this.pivot.y - dy * this.curDist,
      z = this.pivot.z - dz * this.curDist;
    if (world) {
      const floor = Math.max(world.groundAt(x, z) + 0.4, world.waterAt(x, z, t) + 0.5);
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
    this.last.x = x;
    this.last.y = y;
    this.last.z = z;

    cam.position.set(x, y, z);
    cam.lookAt(this.pivot.x, this.pivot.y, this.pivot.z);
    if (Math.abs(cam.fov - r.fov) > 0.01) {
      cam.fov += (r.fov - cam.fov) * (1 - Math.exp(-4 * dt));
      cam.updateProjectionMatrix();
    }
  }
}
