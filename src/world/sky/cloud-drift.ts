/**
 * Reduced motion and the live volumetric clouds (PLAN §9): the clouds hold still while it's on, like
 * the baked cloud layer does. Their drift doesn't stop dead or start at full speed when the setting
 * changes: its scale ramps over `CLOUD_DRIFT_EASE_S`, and only the drift's rate changes, so the clouds
 * never jump.
 */
export const CLOUD_DRIFT_EASE_S = 1.5;

/** The live clouds' drift scale (0 still, 1 with the wind), one frame of `dt` seconds on. */
export function easeCloudDrift(scale: number, reducedMotion: boolean, dt: number): number {
  const target = reducedMotion ? 0 : 1;
  const step = Math.max(0, dt) / CLOUD_DRIFT_EASE_S;
  return scale < target ? Math.min(target, scale + step) : Math.max(target, scale - step);
}
