/** Where you are, musically: the title screen and open sea, or ashore on an island. */
export type IslandMusic = 'harbour' | 'anchorage' | 'meridian';

export interface MusicTrack {
  /** Base name in public/audio (the player picks `.ogg` or `.m4a`). */
  readonly file: string;
  /** Integrated loudness of the encoded file, printed by tools/music/fetch.sh. */
  readonly lufs: number;
}

/** The tracks Dan picked (logged in ASSETS.md and ART_PROVENANCE.md, credited on the Credits screen). */
export const MUSIC_TRACKS: Readonly<Record<IslandMusic, MusicTrack>> = {
  // "Bamboo Tide", made for the game by Dan with Suno.
  harbour: { file: 'music_bamboo_tide', lufs: -15.5 },
  // "Medieval: The Bard's Tale" by RandomMind (OpenGameArt, CC0).
  anchorage: { file: 'music_bards_tale', lufs: -17.6 },
  // "Sunset Plains" by Yoiyami (OpenGameArt, CC0).
  meridian: { file: 'music_sunset_plains', lufs: -16.1 },
};

/** Tracks Dan's keeping for islands still to come: not played yet, so not on the Credits screen. */
export const SPARE_TRACKS = {
  // "Reggae" by Pro Sensory (OpenGameArt, CC0): Anchorage's first track.
  reggae: { file: 'music_reggae', lufs: -12.5 },
  // "Salty Sway", made for the game by Dan with Suno: the next island after Port Meridian.
  saltySway: { file: 'music_salty_sway', lufs: -15.3 },
} as const satisfies Record<string, MusicTrack>;

/**
 * The loudness every track plays at going into the music bus: the level of the generated score the
 * Music slider and bus trim were tuned against, so the mix stays where Dan set it.
 */
const MUSIC_TARGET_LUFS = -13.7;

/** Linear gain that brings a track to the shared target loudness. */
export function trackGain(track: MusicTrack): number {
  return 10 ** ((MUSIC_TARGET_LUFS - track.lufs) / 20);
}
