import { describe, expect, it } from 'vitest';
import { VolumeControls } from './index';

describe('VolumeControls.muted', () => {
  it('silences the master gain without losing the level, and restores it on unmute', () => {
    const applied: string[] = [];
    const v = new VolumeControls((name) => applied.push(name));
    v.master = 0.8;
    expect(v.masterGain).toBeCloseTo(0.64, 6);
    v.muted = true;
    expect(v.masterGain).toBe(0);
    expect(v.master).toBe(0.8);
    v.master = 0.5;
    expect(v.masterGain).toBe(0);
    v.muted = false;
    expect(v.masterGain).toBeCloseTo(0.25, 6);
    expect(applied.filter((n) => n === 'master').length).toBe(4);
  });

  it('ignores a mute that doesn’t change anything', () => {
    const applied: string[] = [];
    const v = new VolumeControls((name) => applied.push(name));
    v.muted = false;
    expect(applied).toEqual([]);
  });
});
