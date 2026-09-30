import { CatmullRomCurve3, Vector3 } from 'three/webgpu';
import type { CameraShot } from './follow-camera';

/**
 * A flyover key: where the camera is and what it looks at (world space). `pace` scales the cruise
 * speed through the key (default 1), so a flight can hurry over open water and linger over the ship.
 */
export interface FlyKey extends CameraShot {
  pace?: number;
}

/**
 * Progress along the flight (0..1) at normalized time `x` (0..1): eases up to a cruise, holds it, then
 * glides to a stop over the last stretch so the flight settles behind the captain instead of braking.
 * Speed is continuous throughout (a trapezoid velocity profile).
 */
export function glide(x: number, accel = 0.14, decel = 0.34): number {
  const t = Math.min(1, Math.max(0, x));
  const v = 1 / (1 - accel / 2 - decel / 2);
  if (t < accel) return (v * t * t) / (2 * accel);
  if (t > 1 - decel) {
    const r = 1 - t;
    return 1 - (v * r * r) / (2 * decel);
  }
  return v * (accel / 2 + t - accel);
}

const STEPS = 720;

/**
 * A camera flight through keys (an island arrival): the eye follows a centripetal Catmull-Rom spline
 * at a speed set by each key's pace (eased at both ends), and the look-at follows its own spline in
 * step with the keys. Sampling doesn't allocate.
 */
export class FlyoverPath {
  private readonly eye: CatmullRomCurve3;
  private readonly look: CatmullRomCurve3;
  /** Normalized flight time at each of STEPS + 1 even steps of the spline parameter. */
  private readonly clock = new Float64Array(STEPS + 1);
  private readonly p = new Vector3();
  readonly length: number;

  constructor(
    keys: readonly FlyKey[],
    readonly seconds: number,
  ) {
    if (keys.length < 2) throw new Error('A flyover needs at least two keys');
    this.eye = new CatmullRomCurve3(
      keys.map((k) => new Vector3(k.x, k.y, k.z)),
      false,
      'centripetal',
    );
    this.look = new CatmullRomCurve3(
      keys.map((k) => new Vector3(k.tx, k.ty, k.tz)),
      false,
      'centripetal',
    );
    const lengths = this.eye.getLengths(STEPS);
    this.length = lengths[STEPS]!;
    const last = keys.length - 1;
    const pace = (i: number) => Math.max(0.05, keys[i]!.pace ?? 1);
    let time = 0;
    for (let j = 1; j <= STEPS; j++) {
      const k = ((j - 0.5) / STEPS) * last;
      const i = Math.min(last - 1, Math.floor(k));
      const f = k - i;
      time += (lengths[j]! - lengths[j - 1]!) / (pace(i) + (pace(i + 1) - pace(i)) * f);
      this.clock[j] = time;
    }
    for (let j = 1; j <= STEPS; j++) this.clock[j]! /= time || 1;
  }

  /** Writes the shot `time` seconds in to `out`; returns true once the flight has landed. */
  sample(time: number, out: CameraShot): boolean {
    const x = time / this.seconds;
    const c = glide(x);
    let lo = 0,
      hi = STEPS;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (this.clock[mid]! <= c) lo = mid;
      else hi = mid;
    }
    const span = this.clock[hi]! - this.clock[lo]!;
    const t = (lo + (span > 0 ? (c - this.clock[lo]!) / span : 0)) / STEPS;
    this.eye.getPoint(t, this.p);
    out.x = this.p.x;
    out.y = this.p.y;
    out.z = this.p.z;
    this.look.getPoint(t, this.p);
    out.tx = this.p.x;
    out.ty = this.p.y;
    out.tz = this.p.z;
    return x >= 1;
  }
}
