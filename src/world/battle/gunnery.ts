import type { Tier } from '../contracts';

/** A battery's side: +1 port (the hull's local +x), −1 starboard. */
export type Side = 1 | -1;
export const PORT: Side = 1;
export const STARBOARD: Side = -1;

/** The deck guns' stations along the hull (brigantine-hull.ts), stern to bow. Low and Lite carry three a side. */
const GUNS_FULL = [-5.8, -3.55, -1.3, 1.0, 3.25, 5.55] as const;
const GUNS_LOW = [-5.8, -1.3, 3.25] as const;

export function gunStations(tier: Tier): readonly number[] {
  return tier === 'low' || tier === 'lite' ? GUNS_LOW : GUNS_FULL;
}

/** docs/specs/BATTLES.md §4.2: a side bears 45° either side of the beam, from 20 m to 140 m. */
export const ARC_HALF_ANGLE = (45 * Math.PI) / 180;
export const MIN_RANGE = 20;
export const MAX_RANGE = 140;
export const RELOAD_SECONDS = 7;
/** A broadside ripples bow to stern this far apart (s). */
export const RIPPLE_SECONDS = 0.12;

/**
 * Signed angle (radians) of the direction (dx, dz) off `side`'s beam for a ship on `heading`
 * (forward is (sin h, cos h); the port beam is (cos h, −sin h)). Positive is toward the bow.
 */
export function offBeam(heading: number, side: Side, dx: number, dz: number): number {
  const bx = side * Math.cos(heading);
  const bz = -side * Math.sin(heading);
  const fx = Math.sin(heading);
  const fz = Math.cos(heading);
  return Math.atan2(dx * fx + dz * fz, dx * bx + dz * bz);
}

/**
 * How well `side` bears on a hull at (dx, dz) from the ship's centre: NaN when it doesn't, else the
 * absolute angle off the beam (smaller is better). A hull ~`halfLength` long counts once any of it
 * is inside the arc.
 */
export function bearing(heading: number, side: Side, dx: number, dz: number, halfLength = 10): number {
  const range = Math.hypot(dx, dz);
  if (range < MIN_RANGE || range > MAX_RANGE) return Number.NaN;
  const off = Math.abs(offBeam(heading, side, dx, dz));
  const allowance = Math.atan2(halfLength * 0.6, range);
  return off <= ARC_HALF_ANGLE + allowance ? off : Number.NaN;
}

/**
 * One side's guns: a reload timer per gun and a scheduled ripple. Readiness is what the HUD's powder
 * cartridges show (docs/specs/BATTLES.md §5). Nothing here allocates after construction.
 */
export class Battery {
  readonly side: Side;
  readonly stations: readonly number[];
  /** Seconds left to reload each gun (0 = loaded). */
  readonly reload: Float32Array;
  /** When each gun's ripple shot goes off (world seconds), or −1. */
  readonly fireAt: Float32Array;
  reloadSeconds: number;
  /** Multiplies reload speed (powder stores make it > 1 for a while). */
  reloadBoost = 1;

  constructor(side: Side, stations: readonly number[], reloadSeconds = RELOAD_SECONDS) {
    this.side = side;
    this.stations = stations;
    this.reloadSeconds = reloadSeconds;
    this.reload = new Float32Array(stations.length);
    this.fireAt = new Float32Array(stations.length).fill(-1);
  }

  get count(): number {
    return this.stations.length;
  }

  /** 0 empty … 1 loaded, for gun `i`. */
  readiness(i: number): number {
    return 1 - Math.min(1, this.reload[i]! / this.reloadSeconds);
  }

  loadedCount(): number {
    let n = 0;
    for (let i = 0; i < this.reload.length; i++) if (this.reload[i] === 0 && this.fireAt[i]! < 0) n++;
    return n;
  }

  /** True while a ripple is still going off. */
  firing(): boolean {
    for (let i = 0; i < this.fireAt.length; i++) if (this.fireAt[i]! >= 0) return true;
    return false;
  }

  /** Every loaded gun fires, bow first, RIPPLE_SECONDS apart. Returns how many guns were laid. */
  fire(now: number): number {
    let k = 0;
    for (let i = this.stations.length - 1; i >= 0; i--) {
      if (this.reload[i] !== 0 || this.fireAt[i]! >= 0) continue;
      this.fireAt[i] = now + k * RIPPLE_SECONDS;
      k++;
    }
    return k;
  }

  /** Loads every gun at once (a fresh wave, or tests). */
  loadAll(): void {
    this.reload.fill(0);
    this.fireAt.fill(-1);
  }

  /** Advances reloads and calls `shot(i)` for each gun whose ripple time has come. */
  update(dt: number, now: number, shot: (gun: number) => void): void {
    const step = dt * this.reloadBoost;
    for (let i = 0; i < this.reload.length; i++) {
      const at = this.fireAt[i]!;
      if (at >= 0 && now >= at) {
        this.fireAt[i] = -1;
        // Each gun's crew is a touch quicker or slower, so the cartridges refill one by one.
        this.reload[i] = this.reloadSeconds * (1 + 0.05 * ((i * 7) % 5));
        shot(i);
      } else if (this.reload[i]! > 0) {
        this.reload[i] = Math.max(0, this.reload[i]! - step);
      }
    }
  }
}
