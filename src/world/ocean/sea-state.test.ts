import { afterEach, describe, expect, it } from 'vitest';
import { ShipDynamics } from '../ship/dynamics';
import { windAt } from '../wind';
import {
  SEA_EASE_S,
  SEA_STATE_IDS,
  SEA_STATES,
  SEA_WAVES,
  SeaStateDriver,
  blendSeaParams,
  capSeaMotion,
  capWindFor,
  cloneSeaParams,
  seaEase,
  seaState,
  type SeaParams,
  type SeaStateId,
} from './sea-state';
import { ALL_WAVES, WaveField } from './waves';

const fields = (p: SeaParams) =>
  Object.entries(p).filter(([, v]) => typeof v === 'number') as [string, number][];

/** Runs `driver` from `t0` for `seconds` at 60 fps, returning the frames' live copies. */
function run(driver: SeaStateDriver, t0: number, seconds: number): { t: number; p: SeaParams }[] {
  const out: { t: number; p: SeaParams }[] = [];
  for (let i = 1; i <= Math.round(seconds * 60); i++) {
    const t = t0 + i / 60;
    driver.update(t);
    out.push({ t, p: cloneSeaParams(driver.live) });
  }
  return out;
}

/** Plays the global sea at `id` for a test, then puts Breeze back. */
function withSea(id: SeaStateId): void {
  seaState.setSetting(id);
  seaState.snap();
}

afterEach(() => withSea('breeze'));

describe('sea states', () => {
  it('makes Breeze today’s sea: every factor 1, every new term 0, the old constants', () => {
    const b = SEA_STATES.breeze.params;
    expect(b.amp).toEqual([1, 1, 1, 1, 1, 1]);
    expect(b.steep).toEqual([1, 1, 1, 1, 1, 1]);
    expect(b.windSpeed).toBe(6.5);
    expect(b.swayWind).toBe(6.5);
    expect(b.gust).toBe(0.45);
    expect(b.capFrom).toBe(0.62);
    // The old shader's smoothstep(4, 11, 6.5) × 0.7 + 0.3.
    expect(b.capWind).toBeCloseTo(0.3 + 0.7 * (2.5 / 7) ** 2 * (3 - (2 * 2.5) / 7), 12);
    for (const k of ['spindrift', 'spray', 'leeway', 'yaw'] as const) expect(b[k]).toBe(0);
    for (const k of ['surf', 'cloudDrift', 'windBed', 'surfBed', 'heel', 'pitch', 'sailing', 'helm'] as const)
      expect(b[k]).toBe(1);
  });

  it('orders the states from Calm to Gale', () => {
    const order = SEA_STATE_IDS.map((id) => SEA_STATES[id].params);
    for (let i = 1; i < order.length; i++) {
      const a = order[i - 1]!;
      const b = order[i]!;
      expect(b.windSpeed).toBeGreaterThan(a.windSpeed);
      for (let w = 0; w < SEA_WAVES; w++) expect(b.amp[w]).toBeGreaterThan(a.amp[w]!);
      expect(b.capFrom).toBeLessThan(a.capFrom);
      expect(b.windBed).toBeGreaterThan(a.windBed);
    }
    expect(SEA_STATE_IDS).toEqual(['calm', 'breeze', 'fresh', 'gale']);
  });

  it('never folds a crest over (Σ Q·a·k < 1 in every state)', () => {
    for (const id of SEA_STATE_IDS) {
      const p = SEA_STATES[id].params;
      let sum = 0;
      ALL_WAVES.forEach((w, i) => (sum += w.q * p.steep[i]! * w.a * p.amp[i]! * w.k));
      expect(sum, id).toBeLessThan(0.5);
    }
  });

  it('keeps the whitecap wind factor of the old shader', () => {
    expect(capWindFor(3)).toBe(0.3);
    expect(capWindFor(12)).toBe(1);
    expect(capWindFor(7.5)).toBeCloseTo(0.3 + 0.7 * 0.5, 12);
  });

  it('caps what moves under reduced motion at Breeze’s size, and keeps the rest', () => {
    const out = cloneSeaParams(SEA_STATES.breeze.params);
    const gale = SEA_STATES.gale.params;
    capSeaMotion(gale, out);
    expect(out.amp).toEqual([1, 1, 1, 1, 1, 1]);
    expect(out.steep).toEqual([1, 1, 1, 1, 1, 1]);
    expect(out.gust).toBe(0.45);
    expect(out.swayWind).toBe(6.5);
    expect(out.heel).toBe(1);
    expect(out.pitch).toBe(1);
    expect(out.yaw).toBe(0);
    expect(out.spray).toBe(0);
    expect(out.windSpeed).toBe(gale.windSpeed);
    expect(out.capFrom).toBe(gale.capFrom);
    expect(out.spindrift).toBe(gale.spindrift);
    expect(out.windBed).toBe(gale.windBed);
    expect(out.sailing).toBe(gale.sailing);
    capSeaMotion(SEA_STATES.calm.params, out);
    expect(out.amp).toEqual(SEA_STATES.calm.params.amp);
  });
});

describe('easing between sea states', () => {
  it('eases smoothly over SEA_EASE_S and lands exactly on the target', () => {
    expect(seaEase(0)).toBe(0);
    expect(seaEase(1)).toBe(1);
    const d = new SeaStateDriver();
    d.update(100);
    d.setSetting('gale');
    const frames = run(d, 100, SEA_EASE_S + 0.5);
    const gale = SEA_STATES.gale.params;
    const breeze = SEA_STATES.breeze.params;
    // No jump: each frame moves at most the eased curve's steepest step (1.875 × the linear one).
    const maxStep = (1.875 / (SEA_EASE_S * 60)) * 1.01;
    let prev = breeze;
    for (const { p } of frames) {
      for (let w = 0; w < SEA_WAVES; w++) {
        const span = gale.amp[w]! - breeze.amp[w]!;
        expect(Math.abs(p.amp[w]! - prev.amp[w]!)).toBeLessThanOrEqual(Math.abs(span) * maxStep + 1e-12);
        expect(p.amp[w]).toBeGreaterThanOrEqual(prev.amp[w]!);
      }
      expect(Math.abs(p.windSpeed - prev.windSpeed)).toBeLessThanOrEqual(
        (gale.windSpeed - breeze.windSpeed) * maxStep + 1e-12,
      );
      prev = p;
    }
    // Half-way through it's still on its way; at the end it's the Gale exactly.
    const mid = frames[Math.round(SEA_EASE_S * 30)]!.p;
    expect(mid.amp[0]).toBeGreaterThan(1.5);
    expect(mid.amp[0]).toBeLessThan(2.3);
    expect(d.settled).toBe(true);
    for (const [k, v] of fields(gale)) expect(Object.is(d.live[k as keyof SeaParams], v), k).toBe(true);
    expect(d.live.amp).toEqual(gale.amp);
  });

  it('comes back to Breeze exactly (not nearly), so Breeze stays byte-identical', () => {
    const d = new SeaStateDriver();
    d.update(0);
    d.setSetting('fresh');
    run(d, 0, 2);
    d.setSetting('breeze');
    run(d, 2, SEA_EASE_S + 0.1);
    const b = SEA_STATES.breeze.params;
    for (const [k, v] of fields(b)) expect(Object.is(d.live[k as keyof SeaParams], v), k).toBe(true);
    for (let w = 0; w < SEA_WAVES; w++) {
      expect(Object.is(d.live.amp[w], 1)).toBe(true);
      expect(Object.is(d.live.steep[w], 1)).toBe(true);
    }
  });

  it('turns mid-ease without a jump', () => {
    const d = new SeaStateDriver();
    d.update(0);
    d.setSetting('gale');
    const a = run(d, 0, 2);
    const before = a[a.length - 1]!.p;
    d.setSetting('calm');
    const b = run(d, 2, 1 / 60);
    expect(Math.abs(b[0]!.p.amp[0]! - before.amp[0]!)).toBeLessThan(0.01);
    run(d, 2 + 1 / 60, SEA_EASE_S);
    expect(d.live.amp).toEqual(SEA_STATES.calm.params.amp);
  });

  it('holds the fixed sea while a battle or a course needs it, then eases back', () => {
    const d = new SeaStateDriver();
    d.setSetting('gale');
    d.snap();
    expect(d.live.amp).toEqual(SEA_STATES.gale.params.amp);
    let on = true;
    const release = d.hold(() => on);
    run(d, 0, SEA_EASE_S + 0.1);
    expect(d.fixed).toBe(true);
    expect(d.live.amp).toEqual([1, 1, 1, 1, 1, 1]);
    expect(d.live.windSpeed).toBe(6.5);
    on = false;
    run(d, 10, 0.5);
    expect(d.fixed).toBe(false);
    expect(d.live.amp[0]).toBeLessThan(SEA_STATES.gale.params.amp[0]!);
    run(d, 10.5, SEA_EASE_S);
    expect(d.live.amp).toEqual(SEA_STATES.gale.params.amp);
    on = true;
    d.snap();
    expect(d.live.windSpeed).toBe(6.5);
    release();
    d.snap();
    expect(d.live.windSpeed).toBe(17);
  });

  it('caps motion under reduced motion, and the fixed sea ignores it', () => {
    const d = new SeaStateDriver();
    d.setSetting('gale');
    d.setReducedMotion(true);
    d.snap();
    expect(d.live.amp).toEqual([1, 1, 1, 1, 1, 1]);
    expect(d.live.capFrom).toBe(SEA_STATES.gale.params.capFrom);
    d.setReducedMotion(false);
    run(d, 0, SEA_EASE_S + 0.1);
    expect(d.live.amp).toEqual(SEA_STATES.gale.params.amp);
  });

  it('allocates nothing per frame (same live object, a version bump per change)', () => {
    const d = new SeaStateDriver();
    const live = d.live;
    const amp = d.live.amp;
    d.update(0);
    d.setSetting('fresh');
    const v = d.version;
    d.update(0.1);
    expect(d.version).toBe(v + 1);
    d.update(0.1);
    expect(d.version).toBe(v + 2);
    expect(d.live).toBe(live);
    expect(d.live.amp).toBe(amp);
  });

  it('blends any two states field by field', () => {
    const out = cloneSeaParams(SEA_STATES.breeze.params);
    blendSeaParams(SEA_STATES.calm.params, SEA_STATES.gale.params, 0.5, out);
    expect(out.windSpeed).toBeCloseTo((2.6 + 17) / 2, 12);
  });
});

describe('the sea state drives the sea, the wind and the ship', () => {
  it('scales the wave field, and × 1 leaves the table exactly', () => {
    const f = new WaveField();
    f.setSea(SEA_STATES.breeze.params, 1);
    f.waves.forEach((w, i) => {
      expect(Object.is(w.a, ALL_WAVES[i]!.a)).toBe(true);
      expect(Object.is(w.q, ALL_WAVES[i]!.q)).toBe(true);
    });
    const gale = SEA_STATES.gale.params;
    f.setSea(gale, 2);
    f.waves.forEach((w, i) => expect(w.a).toBeCloseTo(ALL_WAVES[i]!.a * gale.amp[i]!, 12));
    let calm = 0,
      rough = 0;
    const c = new WaveField();
    c.setSea(SEA_STATES.calm.params, 3);
    for (let i = 0; i < 4000; i++) {
      const x = (i % 40) - 20;
      const z = ((i * 7) % 40) - 20;
      calm = Math.max(calm, Math.abs(c.heightAt(x, z, i * 0.137)));
      rough = Math.max(rough, Math.abs(f.heightAt(x, z, i * 0.137)));
    }
    // Calm: a gentle swell under 25 cm; Gale: seas over a metre (Breeze peaks near 0.6 m).
    expect(calm).toBeLessThan(0.25);
    expect(rough).toBeGreaterThan(1.1);
  });

  it('blows the state’s wind', () => {
    const w = [0, 0];
    const mean = (id: SeaStateId) => {
      withSea(id);
      let sum = 0;
      for (let i = 0; i < 2000; i++)
        sum += Math.hypot(...(windAt(i * 3.1, -i * 1.7, i * 0.37, w) as [number, number]));
      return sum / 2000;
    };
    for (const [id, speed] of [
      ['calm', 2.6],
      ['breeze', 6.5],
      ['gale', 17],
    ] as const)
      expect(Math.abs(mean(id) / speed - 1), id).toBeLessThan(0.08);
  });

  for (const id of SEA_STATE_IDS) {
    it(`keeps her upright and sailable in a ${id} (ten minutes of random helm)`, () => {
      withSea(id);
      const waves = new WaveField();
      waves.setSea(seaState.live, seaState.version);
      const ship = new ShipDynamics(0, 0, 1.1);
      let seed = 0x5eaa5 + id.length;
      const rand = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 0xffffffff;
      let maxRoll = 0,
        maxPitch = 0,
        top = 0;
      for (let i = 0; i < 10 * 60 * 60; i++) {
        const trim = i < 600 ? 1 : rand();
        const rudder = i % 600 < 300 ? 0 : rand() * 2 - 1;
        ship.step(1 / 60, { trim, rudder }, { waves, ground: null, obstacles: [], t: i / 60 });
        maxRoll = Math.max(maxRoll, Math.abs(ship.pose.roll));
        maxPitch = Math.max(maxPitch, Math.abs(ship.pose.pitch));
        top = Math.max(top, ship.forwardSpeed);
        expect(Number.isFinite(ship.pose.x)).toBe(true);
      }
      // No capsizing: the attitude springs clamp her, whatever the sea.
      expect(maxRoll).toBeLessThan(0.43);
      expect(maxPitch).toBeLessThan(0.35);
      expect(top).toBeGreaterThan(id === 'calm' ? 2.5 : 4);
      expect(top).toBeLessThan(9.01);
    }, 20_000);

    it(`docks in a ${id}`, () => {
      withSea(id);
      const waves = new WaveField();
      waves.setSea(seaState.live, seaState.version);
      const ship = new ShipDynamics(-30, -40, 0.4);
      ship.dockAssist({ x: 0, z: 0, heading: Math.PI / 2 });
      let done = -1;
      for (let i = 0; i < 90 * 60 && done < 0; i++) {
        ship.step(1 / 60, { trim: 0, rudder: 0 }, { waves, ground: null, obstacles: [], t: i / 60 });
        if (ship.dockComplete) done = i / 60;
      }
      expect(done, `${id} never docked`).toBeGreaterThan(0);
      expect(done).toBeLessThan(60);
    });
  }

  it('sails faster in a Gale than a Calm on the same course', () => {
    const speedIn = (id: SeaStateId) => {
      withSea(id);
      const waves = new WaveField();
      waves.setSea(seaState.live, seaState.version);
      // A broad reach (the wind blows toward +x, −z).
      const ship = new ShipDynamics(0, 0, Math.atan2(0.8, -0.6) - 0.6);
      let sum = 0;
      for (let i = 0; i < 60 * 60; i++) {
        ship.step(1 / 60, { trim: 1, rudder: 0 }, { waves, ground: null, obstacles: [], t: i / 60 });
        if (i > 20 * 60) sum += ship.forwardSpeed;
      }
      return sum / (40 * 60);
    };
    const calm = speedIn('calm');
    const breeze = speedIn('breeze');
    const gale = speedIn('gale');
    expect(calm).toBeLessThan(breeze);
    expect(gale).toBeGreaterThan(breeze);
  });
});
