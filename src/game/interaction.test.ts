import { describe, expect, it } from 'vitest';
import { Interactions, type Interactable } from './interaction';

const item = (id: string, x: number, z: number, radius = 2.6): Interactable => ({
  id,
  label: () => id,
  x,
  y: 0,
  z,
  radius,
  onInteract: () => {},
});

describe('Interactions focus', () => {
  it('moves to the neighbour you step in front of, even from arm-plus reach', () => {
    // The ship's rail fittings: 1.1 m apart, seen from the pier edge ~2.3 m away.
    const set = new Interactions();
    set.add(item('hatch', 0, 0));
    set.add(item('tube', 0, 1.1));
    expect(set.update(-2.3, 0, 0, Math.PI / 2)?.id).toBe('hatch');
    expect(set.update(-2.3, 0, 1.1, Math.PI / 2)?.id).toBe('tube');
    expect(set.update(-2.3, 0, 0, Math.PI / 2)?.id).toBe('hatch');
  });

  it('holds the current focus while the other is only a hair better', () => {
    const set = new Interactions();
    set.add(item('a', 0, 0));
    set.add(item('b', 0, 1));
    expect(set.update(-1, 0, 0.45, Math.PI / 2)?.id).toBe('a');
    expect(set.update(-1, 0, 0.55, Math.PI / 2)?.id).toBe('a');
    expect(set.update(-1, 0, 0.9, Math.PI / 2)?.id).toBe('b');
  });

  it('ignores things out of range or disabled', () => {
    const set = new Interactions();
    set.add({ ...item('far', 5, 0, 1) });
    set.add({ ...item('off', 0.5, 0), enabled: () => false });
    expect(set.update(0, 0, 0, Math.PI / 2)).toBeNull();
  });
});
