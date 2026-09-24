import { describe, expect, it } from 'vitest';
import { FixedStep } from './fixed-step';

describe('FixedStep', () => {
  it('runs whole steps and returns the leftover as alpha', () => {
    const fs = new FixedStep(1 / 60);
    let ticks = 0;
    const alpha = fs.advance(2.5 / 60, () => ticks++);
    expect(ticks).toBe(2);
    expect(alpha).toBeCloseTo(0.5, 5);
  });

  it('caps steps per frame and drops the backlog after a stall', () => {
    const fs = new FixedStep(1 / 60, 5, 1);
    let ticks = 0;
    fs.advance(0.9, () => ticks++);
    expect(ticks).toBe(5);
    ticks = 0;
    fs.advance(0, () => ticks++);
    expect(ticks).toBe(0);
  });

  it('ignores negative time', () => {
    const fs = new FixedStep();
    let ticks = 0;
    expect(fs.advance(-1, () => ticks++)).toBe(0);
    expect(ticks).toBe(0);
  });
});
