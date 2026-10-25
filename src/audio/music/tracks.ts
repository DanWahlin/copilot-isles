import { ISLAND_LIST, type IslandId } from '../../islands/registry';

/** Where you are, musically: the title screen and open sea, ashore on an island, or the opening. */
export type IslandMusic = 'harbour' | IslandId | 'opening';

export interface MusicTrack {
  /** Base name in public/audio (the player picks `.ogg` or `.m4a`). */
  readonly file: string;
  /** Integrated loudness of the encoded file, printed by tools/music/fetch.sh. */
  readonly lufs: number;
  /** Plays once and stops (a cue), instead of looping. */
  readonly once?: boolean;
  /** Seconds in where the next track may start crossfading in (the end of a phrase). */
  readonly handoff?: number;
}

/**
 * The tracks Dan picked (logged in ASSETS.md and ART_PROVENANCE.md, credited on the Credits screen):
 * the open sea's, each island's theme (its registry entry's `theme`), and the opening's.
 */
export const MUSIC_TRACKS: Readonly<Record<IslandMusic, MusicTrack>> = {
  // "Bamboo Tide", made for the game by Dan with Suno.
  harbour: { file: 'music_bamboo_tide', lufs: -15.5 },
  ...(Object.fromEntries(ISLAND_LIST.map((e) => [e.id, e.theme])) as Record<IslandId, MusicTrack>),
  // "Island Reveal", made for the opening by Dan with Suno. It starts with the chest's latch; its
  // entrance (6.7 s) lands as the islands pop up, and the island's theme takes over at its phrase end.
  opening: { file: 'music_island_reveal', lufs: -16.0, once: true, handoff: 27.6 },
};

/** What the music player can play: an island's track, or the sea-battle track. */
export type MusicCue = IslandMusic | 'battle';

/**
 * "Brass of the Storm", made for the game by Dan with Suno: the sea-battle track (docs/specs/BATTLES.md).
 * It goes on the Credits screen when the battle ships in the game.
 */
export const BATTLE_TRACK: MusicTrack = { file: 'music_brass_of_the_storm', lufs: -15.8 };

/** The track for a cue. */
export function trackFor(cue: MusicCue): MusicTrack {
  return cue === 'battle' ? BATTLE_TRACK : MUSIC_TRACKS[cue];
}

/** Tracks Dan's keeping for islands still to come: not played yet, so not on the Credits screen. */
export const SPARE_TRACKS = {
  // "Reggae" by Pro Sensory (OpenGameArt, CC0): Anchorage's first track.
  reggae: { file: 'music_reggae', lufs: -12.5 },
  // "Salty Sway", made for the game by Dan with Suno: maritime folk, kept for Keelhaven (Chapter 03).
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
