import { describe, expect, it } from 'vitest';
import { LookAheadScheduler, type AudioClock } from './scheduler';
import { midiToFrequency, pentatonicChord, quantizeBeat, scaleDegreeToMidi, voiceLeadChord } from './theory';

describe('music theory helpers', () => {
  it('maps Anchorage pentatonic scale degrees across octaves', () => {
    expect(scaleDegreeToMidi(0)).toBe(60);
    expect(scaleDegreeToMidi(4)).toBe(69);
    expect(scaleDegreeToMidi(5)).toBe(72);
    expect(midiToFrequency(69)).toBeCloseTo(440, 8);
  });

  it('builds compact pentatonic chords with voice-leading', () => {
    const first = pentatonicChord(0);
    const next = voiceLeadChord(first, 3);
    expect(first).toEqual([60, 64, 69]);
    expect(Math.max(...next) - Math.min(...next)).toBeLessThanOrEqual(12);
  });

  it('quantizes beats upward to the requested grid', () => {
    expect(quantizeBeat(3.01, 1)).toBe(4);
    expect(quantizeBeat(3.01, 0.5)).toBe(3.5);
  });
});

describe('look-ahead scheduler', () => {
  it('fires events once inside the look-ahead horizon', () => {
    const clock: AudioClock = { currentTime: 0 };
    const fired: number[] = [];
    const scheduler = new LookAheadScheduler(clock, 60, 0.2);
    scheduler.schedule('late', 0.3, () => fired.push(0.3));
    expect(scheduler.update()).toBe(0);
    Object.defineProperty(clock, 'currentTime', { value: 0.11 });
    expect(scheduler.update()).toBe(1);
    expect(scheduler.update()).toBe(0);
    expect(fired).toEqual([0.3]);
  });

  it('schedules stingers on beat-quantized boundaries', () => {
    const clock: AudioClock = { currentTime: 1.01 };
    const scheduler = new LookAheadScheduler(clock, 60, 0.1);
    const event = scheduler.scheduleQuantized('correct', () => undefined, 1);
    expect(event.beat).toBe(2);
    expect(event.time).toBe(2);
  });
});
