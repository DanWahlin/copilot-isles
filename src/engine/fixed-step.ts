/**
 * Fixed-timestep accumulator (PLAN §12.8): simulation runs at a constant rate,
 * rendering interpolates with the returned alpha, and long stalls never spiral.
 */
export class FixedStep {
  private acc = 0;

  constructor(
    readonly step = 1 / 60,
    readonly maxSteps = 5,
    readonly maxFrame = 0.25,
  ) {}

  /** Advances by `dt` seconds, calling `tick(step)` zero or more times. Returns the interpolation alpha in [0, 1). */
  advance(dt: number, tick: (step: number) => void): number {
    this.acc += Math.min(Math.max(dt, 0), this.maxFrame);
    let n = 0;
    while (this.acc >= this.step && n < this.maxSteps) {
      tick(this.step);
      this.acc -= this.step;
      n++;
    }
    if (n === this.maxSteps && this.acc >= this.step) this.acc = 0;
    return this.acc / this.step;
  }
}
