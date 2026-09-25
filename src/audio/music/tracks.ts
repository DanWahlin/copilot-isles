/** Where you are, musically: the title screen and open sea, or ashore on Anchorage Cay. */
export type IslandMusic = 'harbour' | 'anchorage';

export interface MusicTrack {
  /** Base name in public/audio (the player picks `.ogg` or `.m4a`). */
  readonly file: string;
  /** Integrated loudness of the encoded file, printed by tools/music/fetch.sh. */
  readonly lufs: number;
}

/** The recorded CC0 tracks Dan picked (credited in ASSETS.md and the Credits screen). */
export const MUSIC_TRACKS: Readonly<Record<IslandMusic, MusicTrack>> = {
  // "Medieval: The Bard's Tale" by RandomMind (OpenGameArt, CC0).
  harbour: { file: 'music_bards_tale', lufs: -17.6 },
  // "Reggae" by Pro Sensory (OpenGameArt, CC0).
  anchorage: { file: 'music_reggae', lufs: -12.5 },
};

/**
 * The loudness every track plays at going into the music bus: the level of the generated score the
 * Music slider and bus trim were tuned against, so the mix stays where Dan set it.
 */
const MUSIC_TARGET_LUFS = -13.7;

/** Linear gain that brings a track to the shared target loudness. */
export function trackGain(track: MusicTrack): number {
  return 10 ** ((MUSIC_TARGET_LUFS - track.lufs) / 20);
}
