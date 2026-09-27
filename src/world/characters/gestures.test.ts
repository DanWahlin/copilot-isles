import { describe, expect, it } from 'vitest';
import { GesturePlanner, gestureArm, type ActiveGesture, type GestureKind } from './gestures';

/** A small deterministic PRNG so the planner's choices are repeatable. */
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

function run(planner: GesturePlanner, seconds: number, dt = 1 / 30): ActiveGesture[] {
  const started: ActiveGesture[] = [];
  for (let t = 0; t < seconds; t += dt) {
    const g = planner.update(dt);
    if (g?.started) started.push({ ...g });
  }
  return started;
}

describe('GesturePlanner', () => {
  it('stays still until started and after stopping', () => {
    const p = new GesturePlanner('either', true, seeded(1));
    expect(run(p, 5)).toHaveLength(0);
    p.start();
    expect(run(p, 5).length).toBeGreaterThan(0);
    p.stop();
    expect(run(p, 5)).toHaveLength(0);
  });

  it('never repeats the same gesture twice in a row', () => {
    for (const seed of [1, 2, 3, 42, 99]) {
      const p = new GesturePlanner('either', true, seeded(seed));
      p.start();
      const kinds = run(p, 90).map((g) => g.kind);
      expect(kinds.length).toBeGreaterThan(15);
      for (let i = 1; i < kinds.length; i++) expect(kinds[i]).not.toBe(kinds[i - 1]);
      expect(new Set(kinds).size).toBeGreaterThanOrEqual(4);
    }
  });

  it('rests between gestures', () => {
    const p = new GesturePlanner('either', true, seeded(7));
    p.start();
    let idle = 0;
    let wasActive = false;
    let gaps = 0;
    for (let t = 0; t < 30; t += 1 / 30) {
      const g = p.update(1 / 30);
      if (!g && wasActive) gaps++;
      if (!g) idle++;
      wasActive = g !== null;
    }
    expect(gaps).toBeGreaterThan(3);
    expect(idle).toBeGreaterThan(0);
  });

  it('gestures with the free hand and skips two-handed or nodding gestures when it must', () => {
    const p = new GesturePlanner('right', false, seeded(5));
    p.start();
    const started = run(p, 90);
    expect(started.every((g) => g.side === -1)).toBe(true);
    const kinds = new Set<GestureKind>(started.map((g) => g.kind));
    expect(kinds.has('open')).toBe(false);
    expect(kinds.has('nod')).toBe(false);
  });

  it('eases each gesture in and out', () => {
    const p = new GesturePlanner('left', true, seeded(3));
    p.start();
    const weights: number[] = [];
    let seen = false;
    for (let t = 0; t < 20; t += 1 / 60) {
      const g = p.update(1 / 60);
      if (g) {
        seen = true;
        weights.push(g.weight);
      } else if (seen) break;
    }
    expect(weights[0]).toBeLessThan(0.05);
    expect(Math.max(...weights)).toBeGreaterThan(0.95);
    expect(weights[weights.length - 1]).toBeLessThan(0.1);
  });
});

describe('gestureArm', () => {
  it('keeps an explaining hand below a wave (upper arm forward, forearm not upright)', () => {
    const pose = gestureArm('explain', 0.3, 2.5)!;
    expect(pose.flex + pose.elbow).toBeLessThan(Math.PI * 0.6);
  });

  it('leaves nods and leans to the head and torso', () => {
    expect(gestureArm('nod', 0, 1.6)).toBeNull();
    expect(gestureArm('lean', 0, 2)).toBeNull();
  });
});
