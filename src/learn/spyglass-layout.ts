/**
 * Where the spyglass (a course picture shown during a talk) goes. On a screen at least this wide for
 * its height it docks on the left, large, and the talk camera slides the speaker to the right; on a
 * taller one it's shown large in front of the speaker. The CSS (`.ci-spyglass` in learn.css) uses
 * the same breakpoint: `@media (min-aspect-ratio: 6/5)`.
 */
export const SPYGLASS_DOCK_ASPECT = 6 / 5;

export function spyglassDocks(width: number, height: number): boolean {
  return height > 0 && width / height >= SPYGLASS_DOCK_ASPECT;
}

/**
 * Where the talk camera puts the speaker while the picture shows, as a fraction of the half-width
 * right of centre and of the half-height below it: right of a docked picture, or under one across
 * the top of a tall screen.
 */
export function spyglassSpeakerPan(width: number, height: number): { x: number; y: number } {
  return spyglassDocks(width, height) ? { x: 0.5, y: 0 } : { x: 0, y: 0.35 };
}
