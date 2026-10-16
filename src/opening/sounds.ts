import type { SoundName } from '../audio/soundscape/bank';

/**
 * Every sound the opening plays (the cabin's bed and lantern, the chest and chart cues, the dive). The
 * game starts loading them on the captain screen, so none is dropped on a slow connection: a one-shot
 * asked for before its file has loaded doesn't play.
 */
export const OPENING_SOUNDS: readonly SoundName[] = [
  'opening_cabin',
  'opening_lantern',
  'opening_latch',
  'opening_lid',
  'opening_poof',
  'opening_magic',
  'opening_paper',
  'opening_popup',
  'opening_water',
  'opening_sail',
  'opening_whoosh',
  'opening_spray',
  'big_splash',
];
