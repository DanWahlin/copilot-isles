import type { ShipDynamics } from '../world/ship';

/**
 * Keyboard/gamepad helm (Phase 0 S7 controls): W/S raise and lower the sails like a throttle
 * (they stay where you leave them), A/D put the helm over, and it eases back amidships when released.
 * Rudder +1 turns to port in ShipDynamics, so "right" maps to −1.
 */
export class Helm {
  trim = 0;
  rudder = 0;
  trimRate = 0.42;
  rudderRate = 1.5;
  returnRate = 2.4;

  reset(): void {
    this.trim = 0;
    this.rudder = 0;
  }

  update(dt: number, moveX: number, moveY: number, dyn: ShipDynamics): void {
    this.trim = Math.min(1, Math.max(0, this.trim + moveY * this.trimRate * dt));
    const target = -moveX;
    const rate = Math.abs(target) < 0.01 ? this.returnRate : this.rudderRate;
    const d = target - this.rudder;
    this.rudder += Math.max(-rate * dt, Math.min(rate * dt, d));
    dyn.setInput({ trim: this.trim, rudder: this.rudder });
  }
}
