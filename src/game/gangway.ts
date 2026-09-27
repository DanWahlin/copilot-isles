import type { WalkSurface } from './collision';

interface Point3 {
  x: number;
  y: number;
  z: number;
}

/**
 * The gangplank as the walker sees it: the axis from `foot` (resting on the pier) up to `top` (hooked
 * over the ship's rail), `halfWidth` either side. `top` follows the ship each frame; `foot` stays put.
 */
export interface PlankSpan {
  top: Point3;
  foot: Point3;
  halfWidth: number;
  /** Walk height above the axis (half the plank's thickness plus the cleats). */
  tread: number;
}

/** How far along the plank (x, z) is, 0 at the foot and 1 at the rail, or null when off it. */
export function plankProgress(span: PlankSpan, x: number, z: number): number | null {
  const dx = span.top.x - span.foot.x;
  const dz = span.top.z - span.foot.z;
  const len2 = dx * dx + dz * dz;
  if (len2 < 1e-6) return null;
  const px = x - span.foot.x;
  const pz = z - span.foot.z;
  const t = (px * dx + pz * dz) / len2;
  if (t < 0 || t > 1) return null;
  const across = Math.abs(px * dz - pz * dx) / Math.sqrt(len2);
  return across <= span.halfWidth ? t : null;
}

/** The plank's walkable height at (x, z), or null when (x, z) isn't over it. */
export function plankHeightAt(span: PlankSpan, x: number, z: number): number | null {
  const t = plankProgress(span, x, z);
  if (t === null) return null;
  return span.foot.y + (span.top.y - span.foot.y) * t + span.tread;
}

/** A walk surface for the plank that's only there while `lowered()` says the gangway is down. */
export function plankSurface(span: PlankSpan, lowered: () => boolean): WalkSurface {
  return { heightAt: (x, z) => (lowered() ? plankHeightAt(span, x, z) : null), kind: 'wood' };
}
