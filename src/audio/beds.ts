/**
 * The island's ambient beds: the gain on each -23 LUFS loop, before the Ambience slider. Measured in
 * the cove, they sit a few dB under the music; the surf used to be 0.5 and drowned it out. Kept in
 * its own tiny module so the game flow can use it without pulling in the audio engine.
 */
export const AMBIENT_BEDS = {
  wind: 0.18,
  surf_far: 0.13,
  palms: 0.22,
  birds_dawn: 0.2,
} as const;
