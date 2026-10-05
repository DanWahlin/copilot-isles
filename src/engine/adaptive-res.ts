/**
 * Adaptive resolution (PLAN §12.9, delta consensus D4). Pure logic: feed it frame samples and it
 * returns the render scale. Thresholds are multiples of the tier's target frame time T:
 * lower above 1.25·T (×0.92, or ×0.84 above 2.5·T), raise below 0.85·T (+0.05).
 */
export interface AdaptiveOptions {
  targetFps: number;
  min?: number;
  max?: number;
  warmupFrames?: number;
  windowFrames?: number;
  dropCooldown?: number;
  raiseCooldown?: number;
}

export class AdaptiveResolution {
  scale: number;
  readonly min: number;
  readonly max: number;
  private readonly T: number;
  private readonly warmup: number;
  private readonly window: number;
  private readonly dropCooldown: number;
  private readonly raiseCooldown: number;
  private frames = 0;
  private acc = 0;
  private n = 0;
  private clock = 0;
  private holdUntil = 0;
  private locked = false;
  private paused = false;
  private noRaise = false;
  /** Scale we last raised from, and how many times raising from it failed (exponential backoff). */
  private triedFrom = -1;
  private triedAt = 0;
  private failures = new Map<number, number>();
  private barredUntil = new Map<number, number>();

  constructor(o: AdaptiveOptions) {
    this.T = 1 / o.targetFps;
    this.min = o.min ?? 0.72;
    this.max = o.max ?? 1;
    this.scale = this.max;
    this.warmup = o.warmupFrames ?? 90;
    this.window = o.windowFrames ?? 60;
    this.dropCooldown = o.dropCooldown ?? 8;
    this.raiseCooldown = o.raiseCooldown ?? 2.5;
  }

  /** Pause decisions during transitions (fast travel, docking, cuts) or while hidden. */
  setPaused(p: boolean): void {
    this.paused = p;
    this.acc = 0;
    this.n = 0;
  }

  /**
   * While on, the scale can still drop but never rises (a cutscene: a raise that can't hold the
   * target halves the frame rate under vsync, which reads as judder).
   */
  holdRaises(on: boolean): void {
    this.noRaise = on;
  }

  lock(scale: number | null): void {
    this.locked = scale !== null;
    if (scale !== null) this.scale = Math.min(this.max, Math.max(this.min, scale));
  }

  /**
   * @param frameSeconds GPU time if available, otherwise frame time.
   * @param wallSeconds real elapsed time since the last call.
   * @returns true if the scale changed.
   */
  sample(frameSeconds: number, wallSeconds: number): boolean {
    this.clock += wallSeconds;
    if (this.locked || this.paused || !(frameSeconds > 0) || frameSeconds > 0.5) return false;
    if (++this.frames < this.warmup) return false;
    this.acc += frameSeconds;
    if (++this.n < this.window) return false;
    const avg = this.acc / this.n;
    this.acc = 0;
    this.n = 0;

    // A raise that immediately runs hot counts as a failed upscale for that level.
    if (this.triedFrom >= 0 && this.clock - this.triedAt < 3 && avg > 1.25 * this.T) {
      const f = (this.failures.get(this.triedFrom) ?? 0) + 1;
      this.failures.set(this.triedFrom, f);
      this.barredUntil.set(this.triedFrom, this.clock + Math.min(120, 15 * 2 ** (f - 1)));
      this.triedFrom = -1;
    }
    if (this.clock < this.holdUntil) return false;

    const prev = this.scale;
    if (avg > 1.25 * this.T && this.scale > this.min) {
      this.scale = Math.max(this.min, this.scale * (avg > 2.5 * this.T ? 0.84 : 0.92));
      this.holdUntil = this.clock + this.dropCooldown;
    } else if (!this.noRaise && avg < 0.85 * this.T && this.scale < this.max) {
      const key = Math.round(this.scale * 100);
      if ((this.barredUntil.get(key) ?? 0) > this.clock) return false;
      this.triedFrom = key;
      this.triedAt = this.clock;
      this.scale = Math.min(this.max, this.scale + 0.05);
      this.holdUntil = this.clock + this.raiseCooldown;
    }
    return this.scale !== prev;
  }
}
