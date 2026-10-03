import { describe, expect, it } from 'vitest';
import { BlinkScheduler, StableSpring, mouthShapeAt, type MouthCue } from './facial-animation';

describe('mouth cue player', () => {
  const cues: MouthCue[] = [
    { start: 0.1, end: 0.2, value: 'B' },
    { start: 0.2, end: 0.5, value: 'C' },
    { start: 0.7, end: 0.9, value: 'X' },
  ];

  it('uses Rhubarb cues and closes between cues', () => {
    expect(mouthShapeAt(cues, 0)).toBe('X');
    expect(mouthShapeAt(cues, 0.12)).toBe('B');
    expect(mouthShapeAt(cues, 0.32)).toBe('C');
    expect(mouthShapeAt(cues, 0.6)).toBe('X');
  });
});

describe('blink scheduler', () => {
  it('schedules blinks every two to six seconds', () => {
    const scheduler = new BlinkScheduler(() => 0);
    let firstClosedAt = 0;
    for (let i = 0; i < 180; i++) {
      const state = scheduler.update(1 / 60);
      if (state.openness < 0.8) {
        firstClosedAt = i / 60;
        break;
      }
    }
    expect(firstClosedAt).toBeGreaterThanOrEqual(2);
    expect(firstClosedAt).toBeLessThan(2.2);
  });
});

describe('stable spring', () => {
  it('stays finite through a frame-rate hitch', () => {
    const spring = new StableSpring(4, 0.75);
    for (const dt of [1 / 60, 1 / 30, 0.24, 1 / 60, 1 / 60]) spring.update(0.25, dt);
    expect(Number.isFinite(spring.value)).toBe(true);
    expect(Number.isFinite(spring.velocity)).toBe(true);
    expect(Math.abs(spring.value)).toBeLessThan(1);
  });
});
