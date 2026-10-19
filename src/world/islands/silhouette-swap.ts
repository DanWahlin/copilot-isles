/**
 * How far (m) either side of an island's swap distance the swap waits: going out it draws the
 * silhouette only past `show + SWAP_HYSTERESIS`, coming back the island only inside
 * `show - SWAP_HYSTERESIS`, so a camera that orbits or bobs across the line doesn't flicker
 * between them.
 */
export const SWAP_HYSTERESIS = 20;

/**
 * Whether an island draws as its silhouette, from the camera's distance (`footprintDistance`) and
 * whether it did last frame: past its swap distance `show` it does, whether it's in memory or not
 * (an island you've left stays resident for a while, PLAN §13.3, but only its silhouette draws).
 * Pure, so it's tested.
 */
export function drawsSilhouette(
  wasFar: boolean,
  distance: number,
  show: number,
  band = SWAP_HYSTERESIS,
): boolean {
  return wasFar ? distance > show - band : distance > show + band;
}

/** An island's swap, remembered from frame to frame (`drawsSilhouette`). */
export class SilhouetteSwap {
  /** True while the island draws as its silhouette. */
  far: boolean | null = null;

  constructor(
    readonly show: number,
    readonly band = SWAP_HYSTERESIS,
  ) {}

  /** The swap for this frame's distance; the first one goes by `show` alone. */
  update(distance: number): boolean {
    this.far =
      this.far === null ? distance > this.show : drawsSilhouette(this.far, distance, this.show, this.band);
    return this.far;
  }
}
