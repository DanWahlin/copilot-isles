import { Color, Vector2, Vector3 } from 'three/webgpu';
import { uniform } from 'three/tsl';

/**
 * Global world uniforms shared by every TSL material (sky, ocean, terrain, ship, vegetation, life).
 * The engine updates the `.value`s once per frame; materials just reference the nodes.
 * Use our own simulation clock (`time`) rather than TSL's built-in timer so pausing/scrubbing works.
 */
export const world = {
  /** Simulation time in seconds (pauses with the game; shared with the CPU wave/wind samplers). */
  time: uniform(0),
  /** Unit direction toward the sun / moon. */
  sunDir: uniform(new Vector3(0.3, 0.5, -0.8)),
  moonDir: uniform(new Vector3(-0.3, 0.6, 0.7)),
  /** Direction of the current key light (sun by day, moon at night); pairs with sunColor. */
  keyDir: uniform(new Vector3(0.3, 0.5, -0.8)),
  /** Direct light colour × intensity of the current key light (sun or moon). */
  sunColor: uniform(new Color(1, 0.86, 0.66)),
  /** Sky ambient tint (used by custom materials that don't rely on the environment map alone). */
  skyColor: uniform(new Color(0.5, 0.65, 0.85)),
  /** Horizon / haze colour, sampled from the sky model toward the view direction's horizon. */
  hazeColor: uniform(new Color(0.75, 0.8, 0.85)),
  /** 0 = day, 1 = night. */
  night: uniform(0),
  /** Wind (mirrors src/world/wind.ts): unit direction the wind blows toward, and mean speed m/s. */
  windDir: uniform(new Vector2(0.8, -0.6)),
  windSpeed: uniform(6.5),
  /** Camera focus (xz) for the wave distance fade; must equal WaveField.setFocus(). */
  focus: uniform(new Vector2(0, 0)),
  /** Reduced motion (0/1): materials damp decorative motion (cloud drift, sway amplitude). */
  reducedMotion: uniform(0),
};
