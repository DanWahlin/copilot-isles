import { describe, expect, it } from 'vitest';
import { BANK } from './bank';
import { IslesSoundScape } from './soundscape';

const PUZZLE_ONE_SHOTS = [
  'stone_turn',
  'lever',
  'gate_lift',
  'chime_solve',
  'crane_ratchet',
  'crate_thud',
  'gear_pickup',
  'gear_hang',
  'quill',
  'tube_voice',
  'hatch_clank',
  'bottle_pop',
  'coconut_crack',
  'crowd_cheer_small',
  'lute_strum',
] as const;
const PUZZLE_LOOPS = ['stream', 'waterfall_small', 'wheel_creak'] as const;

describe('puzzle sound bank', () => {
  it('registers puzzle one-shots with slice metadata', () => {
    for (const name of PUZZLE_ONE_SHOTS) {
      const entry = BANK[name];
      expect('slices' in entry, name).toBe(true);
      if ('slices' in entry) expect(entry.slices[0]?.[1], name).toBeGreaterThan(0.25);
    }
  });

  it('registers positional puzzle loops as loop banks', () => {
    for (const name of PUZZLE_LOOPS) {
      const entry = BANK[name];
      expect('loop' in entry && entry.loop, name).toBe(true);
    }
  });

  it('returns a safe no-op loop handle before audio unlock', () => {
    const soundscape = new IslesSoundScape();
    const handle = soundscape.loop('stream', { x: 1, y: 2, z: 3 }, 0.5);
    expect(() => {
      handle.setGain(0.25);
      handle.setPos({ x: 4, y: 5, z: 6 });
      handle.stop();
    }).not.toThrow();
  });
});
