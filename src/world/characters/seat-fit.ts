import type { BufferGeometry } from 'three/webgpu';
import { box, type Buckets } from '../village/pieces';

/**
 * How a seated NPC fits its seat (the shared sit pose, runtime-character `applyPoseLife`): its hips
 * on the seat's top, its thighs along it, its knees just past the front edge and its shins plumb down
 * in front of it. Measured on the rigs (seat-audit.test.ts): the seat's top is `drop` over the NPC's
 * origin, its front edge `front` along the NPC's facing from the origin, and a seat `height` over the
 * floor puts the boots on the floor. Salt's legs once went through his bench (issue 363).
 */
export const SIT = {
  /** The seat's top over the NPC's origin (the rigs' seats measure 0.240 to 0.263). */
  drop: 0.25,
  /** The seat's front edge along the NPC's facing from its origin (the shins' backs are at -0.037). */
  front: -0.06,
  /** The seat's top over the floor for the boots to stand on it. */
  height: 0.175,
  /** How deep a seat must be behind its front edge for the hips (they reach 0.30 back). */
  depth: 0.36,
} as const;

/**
 * How far a sitter steps out along a bench's facing from its middle (a bench built to the sit,
 * `SIT.depth` deep, like Port Meridian's `addBenchSeat`): the seat's front edge on the sit's.
 */
export const BENCH_OUT = SIT.depth / 2 - SIT.front;

/**
 * A plain seat block for a seated NPC (a crate turned on its side): its top at `top`, its foot at
 * `floor`, its front edge on the NPC's `SIT.front` for an NPC at (x, z) facing `heading`. Into the
 * wood bucket (no new material). Returns the block.
 */
export function seatBlock(
  b: Buckets,
  x: number,
  z: number,
  heading: number,
  floor: number,
  top: number,
): BufferGeometry {
  const fx = Math.sin(heading);
  const fz = Math.cos(heading);
  const mid = SIT.front - SIT.depth / 2;
  const h = Math.max(0.05, top - floor + 0.05);
  return box(b, 'wood', x + fx * mid, top - h / 2, z + fz * mid, 0.5, h, SIT.depth, heading, 0x8a6a48);
}
