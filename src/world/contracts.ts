/**
 * Shared contracts between world systems. Keep these small and stable: terrain, ocean, ship,
 * vegetation, village, and life modules depend only on these interfaces, never on each other.
 */

/** Terrain height queries (CPU). Heights are metres relative to sea level (negative = seabed). */
export interface HeightField {
  heightAt(x: number, z: number): number;
  /** Surface normal (unit vector) written into `out` [x, y, z]; returns `out`. */
  normalAt(x: number, z: number, out: Float32Array | number[]): Float32Array | number[];
  /** 0-1 masks used for placement: sand, grass, rock, cliff. */
  masksAt(x: number, z: number): { sand: number; grass: number; rock: number; cliff: number };
  /**
   * The ground before any recess that hides terrain behind a covering mesh (the headland's cliff).
   * Meshes that cover the steep faces are traced from it; everything else uses the field itself, which
   * matches the drawn ground. Absent when the field has no recess.
   */
  readonly shapeField?: HeightField;
}

/** Ocean surface queries (CPU), matching what the GPU renders. */
export interface WaveSampler {
  /** Exact water surface height at world (x, z) at time t (s), including the camera-distance fade. */
  heightAt(x: number, z: number, t: number): number;
  /** Horizontal orbital velocity of the water at (x, z) written into out [vx, vz]. */
  velocityAt(x: number, z: number, t: number, out: Float32Array | number[]): Float32Array | number[];
}

/** Obstacles the ship must not pass through (dock posts, rocks, buoys, moored boats). */
export interface CircleObstacle {
  x: number;
  z: number;
  r: number;
  /** Top height above the ground, for camera sight lines (big circles default to tall); walking ignores it. */
  height?: number;
  /**
   * World heights the collider spans (a tower's walls, a gallery railing). A walker whose feet are
   * outside [y0, y1] passes it; without them the collider blocks at every height.
   */
  y0?: number;
  y1?: number;
  /**
   * False: only walkers keep out of it, and the follow camera and sight lines pass through it (a
   * plant's trunk or base: the camera goes through foliage).
   */
  camera?: boolean;
}

/** The shared wind field (CPU side; the GPU side is built from the same constants in wind.ts). */
export interface WindState {
  /** Unit direction the wind blows TOWARD, in the xz-plane. */
  dirX: number;
  dirZ: number;
  /** Mean speed, m/s. */
  speed: number;
}

export type Tier = 'lite' | 'low' | 'medium' | 'high' | 'ultra';
export type Backend = 'webgpu' | 'webgl2';
