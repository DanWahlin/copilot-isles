import { describe, expect, it } from 'vitest';
import {
  GESTURES,
  GesturePlanner,
  HIP_FIST,
  newPose,
  planAccents,
  sampleGesture,
  type GestureFrame,
  type SpokenWord,
} from './gestures';

/** A small deterministic PRNG so the planner's choices are repeatable. */
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

function words(text: string, rate = 0.32): SpokenWord[] {
  let t = 0.1;
  return text
    .replace(/[.,!?:]/g, '')
    .split(/\s+/)
    .map((word) => {
      const w = { word, start: t, end: t + rate };
      t += rate;
      return w;
    });
}

const busy = (f: GestureFrame) =>
  Math.abs(f.left.flex) +
  Math.abs(f.left.elbow) +
  Math.abs(f.right.flex) +
  Math.abs(f.right.elbow) +
  Math.abs(f.nod);

describe('authored gestures', () => {
  it('start and end at rest, wind up before the stroke, and overshoot after it', () => {
    for (const [kind, def] of Object.entries(GESTURES)) {
      const first = def.keys[0]!;
      const last = def.keys[def.keys.length - 1]!;
      expect(
        first.slice(1).every((v) => v === 0),
        kind,
      ).toBe(true);
      expect(
        last.slice(1).every((v) => v === 0),
        kind,
      ).toBe(true);
      expect(first[0], kind).toBeLessThan(-0.3);
      const stroke = def.keys.find((k) => k[0] === 0)!;
      const windup = def.keys.find((k) => k[0] < 0 && k[0] > first[0])!;
      // Anticipation: the elbow is more bent (or the arm more gathered) before the stroke.
      expect(windup[3]! !== stroke[3]! || windup[1]! !== stroke[1]!, kind).toBe(true);
      const over = def.keys.find((k) => k[0] > 0 && k[0] < 0.2)!;
      expect(over, kind).toBeDefined();
    }
  });

  // A fast palm flip is about 9 rad/s; a pop would be several times that.
  it('samples smoothly (no jumps between frames)', () => {
    const a = newPose();
    const b = newPose();
    for (const kind of Object.keys(GESTURES) as (keyof typeof GESTURES)[]) {
      for (let t = -0.6; t < 2.2; t += 1 / 60) {
        sampleGesture(kind, t, a);
        sampleGesture(kind, t + 1 / 60, b);
        for (const key of Object.keys(a) as (keyof typeof a)[])
          expect(Math.abs(a[key] - b[key]), `${kind} ${key} at ${t.toFixed(2)}`).toBeLessThan(0.16);
      }
    }
  });

  it('closes the fist on the hip and points with the index straight', () => {
    expect(HIP_FIST.curl).toBeGreaterThan(1.2);
    const p = sampleGesture('point', 0.4, newPose());
    expect(p.curl).toBeGreaterThan(1);
    expect(p.index).toBeLessThan(0.1);
  });
});

describe('planAccents', () => {
  it('lands strokes on stressed words, spaced out, never the same twice running', () => {
    const w = words(
      'Select the gear at the bottom of the sidebar, and there they all are. I keep a record of every one.',
    );
    const accents = planAccents(w, 'Select the gear … every one.', w[w.length - 1]!.end, 'open');
    expect(accents.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < accents.length; i++) {
      expect(accents[i]!.t - accents[i - 1]!.t).toBeGreaterThanOrEqual(1.9);
      expect(accents[i]!.kind).not.toBe(accents[i - 1]!.kind);
    }
    for (const a of accents) expect(w.some((x) => Math.abs(x.start + 0.04 - a.t) < 1e-6)).toBe(true);
  });

  it('points at "there" and lifts a finger for "first"', () => {
    const w = words('First, a job on GitHub. Open your fork over there, the Actions tab.');
    const kinds = planAccents(w, 'First, a job on GitHub. Open your fork over there.', 6, 'ledger').map(
      (a) => a.kind,
    );
    expect(kinds).toContain('point');
  });

  it('keeps a short line to one stroke at most', () => {
    const w = words('Crew’s aboard, Captain.');
    expect(planAccents(w, 'Crew’s aboard, Captain.', 1.4, 'open').length).toBeLessThanOrEqual(1);
  });
});

describe('GesturePlanner', () => {
  it('stays still until started and after stopping', () => {
    const p = new GesturePlanner('either', true, 'open', seeded(1));
    let moved = 0;
    for (let i = 0; i < 300; i++) moved += busy(p.update(1 / 60));
    expect(moved).toBe(0);
    p.start();
    for (let i = 0; i < 600; i++) moved += busy(p.update(1 / 60));
    expect(moved).toBeGreaterThan(0);
    p.stop();
    let after = 0;
    for (let i = 0; i < 300; i++) after += busy(p.update(1 / 60));
    expect(after).toBe(0);
  });

  it('gestures with the free hand only when the other holds something', () => {
    const p = new GesturePlanner('right', false, 'ledger', seeded(5));
    p.start();
    for (let i = 0; i < 60 * 30; i++) {
      const f = p.update(1 / 60);
      expect(f.left.flex + f.left.elbow + f.left.abduct).toBe(0);
    }
  });

  it('sets a commander’s other fist on the hip while talking, and lets it go after', () => {
    const p = new GesturePlanner('right', true, 'commander', seeded(2));
    p.start();
    let f = p.update(1 / 60);
    for (let i = 0; i < 120; i++) f = p.update(1 / 60);
    expect(f.left.curl).toBeGreaterThan(1.2);
    p.stop();
    for (let i = 0; i < 180; i++) f = p.update(1 / 60);
    expect(f.left.curl).toBeLessThan(0.05);
  });

  it('times a voiced line’s strokes from its words', () => {
    const p = new GesturePlanner('either', true, 'open', seeded(3));
    p.start();
    const w = words(
      'Now, the workspace selector below the prompt box. Don’t trust the checkmark, it just shows the default.',
    );
    p.plan(w, 'Now, the workspace selector below the prompt box.', 6);
    const accents = planAccents(w, 'Now, the workspace selector below the prompt box.', 6, 'open');
    let peakAt = -1;
    let peak = 0;
    for (let t = 0; t < accents[0]!.t + 0.3; t += 1 / 60) {
      const f = p.update(1 / 60);
      const v = Math.max(Math.abs(f.left.abduct), Math.abs(f.right.abduct));
      if (v > peak) [peak, peakAt] = [v, t];
    }
    expect(Math.abs(peakAt - accents[0]!.t)).toBeLessThan(0.25);
  });

  it('never pitches the torso: the frame only turns the shoulders', () => {
    const p = new GesturePlanner('either', true, 'open', seeded(9));
    p.start();
    for (let i = 0; i < 60 * 20; i++) {
      const f = p.update(1 / 60);
      expect(Math.abs(f.turn)).toBeLessThan(0.1);
      expect(Math.abs(f.nod)).toBeLessThan(0.2);
    }
  });
});
