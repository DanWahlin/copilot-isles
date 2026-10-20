import { pointOfSailCurve } from '../ship/dynamics';
import { wrapAngle } from '../../util/math';
import type { Side } from './gunnery';

/** What a raider's helmsman asks of its ship this step. */
export interface RaiderHelm {
  trim: number;
  rudder: number;
}

/** What the raider can see: its own ship, the player's ship, the wind, and its guns. */
export interface RaiderView {
  x: number;
  z: number;
  heading: number;
  headingRate: number;
  targetX: number;
  targetZ: number;
  /** Unit-ish wind vector (toward). */
  windX: number;
  windZ: number;
  /** Loaded guns on port and starboard. */
  loadedPort: number;
  loadedStarboard: number;
  /** 0 sunk … 1 whole. */
  hull: number;
  /** A push away from other raiders (summed, metres-ish; 0 when clear). */
  avoidX: number;
  avoidZ: number;
}

/** A view with nothing seen yet (whole hull, at the origin), for the battle to fill each step. */
export function emptyRaiderView(): RaiderView {
  return {
    x: 0,
    z: 0,
    heading: 0,
    headingRate: 0,
    targetX: 0,
    targetZ: 0,
    windX: 0,
    windZ: 0,
    loadedPort: 0,
    loadedStarboard: 0,
    hull: 1,
    avoidX: 0,
    avoidZ: 0,
  };
}

const TWO_PI = Math.PI * 2;
/** Half-width of the no-go zone either side of the wind's eye (radians), with a little margin. */
const NO_GO = 0.8;

/** How well a ship on `heading` sails in the wind (0 in irons … ~1 on a broad reach). */
function sailing(heading: number, windX: number, windZ: number): number {
  const len = Math.hypot(windX, windZ) || 1;
  return pointOfSailCurve((Math.sin(heading) * windX + Math.cos(heading) * windZ) / len);
}

/**
 * A raider's helmsman (docs/specs/BATTLES.md §7): close to its preferred range, put the player abeam
 * on its loaded side, keep out of irons, keep clear of its own fleet and the player's bow, and sail wide
 * when badly hurt. It only steers; the battle decides when its guns fire.
 */
export class RaiderBrain {
  /** Preferred fighting range (m), varied per raider so a wave spreads out. */
  readonly range: number;
  side: Side = 1;
  /** Seconds before it may change sides again (stops it dithering). */
  private commit = 0;
  /** The heading it last wanted (for tests and debugging). */
  desired = 0;

  constructor(range = 65) {
    this.range = range;
  }

  steer(dt: number, v: RaiderView, out: RaiderHelm): RaiderHelm {
    const dx = v.targetX - v.x;
    const dz = v.targetZ - v.z;
    const dist = Math.hypot(dx, dz);
    const toTarget = Math.atan2(dx, dz);
    const hurt = v.hull < 0.3;
    const want = hurt ? this.range * 1.7 : this.range;
    // Positive closes the range, negative opens it.
    const close = Math.max(-0.65, Math.min(dist > want + 60 ? 1.25 : 0.75, (dist - want) / 45));
    this.commit = Math.max(0, this.commit - dt);

    let best = v.heading;
    let bestSide: Side = this.side;
    let bestScore = -Infinity;
    for (let k = 0; k < 2; k++) {
      const side: Side = k === 0 ? 1 : -1;
      const h = toTarget - side * (Math.PI / 2 - close);
      const loaded = side === 1 ? v.loadedPort : v.loadedStarboard;
      let score = sailing(h, v.windX, v.windZ) * 2 + loaded * 0.15;
      score -= Math.abs(wrapAngle(h - v.heading)) * 0.35;
      if (side === this.side) score += this.commit > 0 ? 3 : 0.25;
      if (score > bestScore) {
        bestScore = score;
        best = h;
        bestSide = side;
      }
    }
    if (bestSide !== this.side) {
      this.side = bestSide;
      this.commit = 8;
    }

    // Keep clear of the fleet: bend the heading toward the push.
    const push = Math.hypot(v.avoidX, v.avoidZ);
    if (push > 0.01) {
      const away = Math.atan2(v.avoidX, v.avoidZ);
      best += wrapAngle(away - best) * Math.min(0.7, push / 30);
    }
    // Never sit in irons: slide to the edge of the no-go zone on the nearer tack.
    if (sailing(best, v.windX, v.windZ) < 0.35) {
      const from = Math.atan2(-v.windX, -v.windZ);
      best = from + (wrapAngle(best - from) >= 0 ? 1 : -1) * (NO_GO + 0.35);
    }
    this.desired = wrapAngle(best);

    // Wear ship rather than tack: if the short turn passes through the wind's eye, go the long way round.
    let err = wrapAngle(this.desired - v.heading);
    const windFrom = Math.atan2(-v.windX, -v.windZ);
    const toWind = wrapAngle(windFrom - v.heading);
    if (Math.abs(toWind) < NO_GO) err = toWind > 0 ? -1 : 1;
    else if (Math.sign(toWind) === Math.sign(err) && Math.abs(toWind) - NO_GO < Math.abs(err))
      err -= Math.sign(err) * TWO_PI;
    out.rudder = Math.max(-1, Math.min(1, err * 2.4 - v.headingRate * 1.2));
    // Ease off close in so it doesn't overrun; never ram.
    const ahead = Math.abs(wrapAngle(toTarget - v.heading)) < 0.5 && dist < 45;
    out.trim = ahead ? 0.35 : dist < want * 0.7 ? 0.55 : 0.85;
    return out;
  }
}
