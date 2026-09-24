/**
 * Time of day state (PLAN §6 "Time of day & sun position"): the island's authored time, the
 * player's overrides (time, sun azimuth, speed, pause), and a monotonic simulation clock.
 */
export class DayClock {
  /** Local solar hours, 0-24. */
  hours: number;
  /** Rotation of the sun path, degrees. */
  azimuth: number;
  /** In-game hours per real second (0 = time stands still). */
  speed = 0;
  paused = false;
  /** Simulation seconds (drives waves, wind, animation); stops while paused. */
  sim = 0;

  constructor(hours = 16.5, azimuth = 0) {
    this.hours = hours;
    this.azimuth = azimuth;
  }

  advance(dt: number): void {
    if (this.paused) return;
    this.sim += dt;
    if (this.speed !== 0) this.hours = (((this.hours + dt * this.speed) % 24) + 24) % 24;
  }

  set(hours: number, azimuth = this.azimuth): void {
    this.hours = ((hours % 24) + 24) % 24;
    this.azimuth = azimuth;
  }
}
