import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { CircleObstacle } from '../contracts';
import { ShipDynamics } from '../ship/dynamics';
import { windAt } from '../wind';
import { WaveField, wavesForTier } from './waves';

/**
 * Breeze is today's sea, byte for byte. These hashes were taken at b1db17d (rounded, see `hash`), before the sea-state
 * model existed: the wave samples (heights and orbital velocities, every tier's wave set, with the
 * camera fade), the wind field, and a ship's simulated track (sailing, tacking, through a gusty
 * reach, fending off a pile and docking) over a fixed input. If one moves, Breeze isn't today's sea.
 */
const EXPECTED = {
  waves: '9d932b956b77b886ee51cf3057f9e680e1bd1641f05835a53441bfec72a542c8',
  wind: 'e95da8c7be5adb75a434088ef42035dbb1ceafda27bf02b53f3729e33a66937e',
  ship: 'a84c2e9f75ee097886d32bfaf063874f4155e715dc5358555c0fb2c974436ae3',
};

/**
 * Rounded to 9 significant digits: libm's sin, cos and exp may differ in the last bits between
 * platforms (macOS here, Linux in CI), and a long ship track carries that along. Any real change to
 * the sea or the ship moves far more than that.
 */
function hash(values: number[]): string {
  return createHash('sha256')
    .update(values.map((v) => (v === 0 ? '0' : v.toPrecision(9))).join(','))
    .digest('hex');
}

function waveSamples(): number[] {
  const out: number[] = [];
  const vel = [0, 0];
  for (const count of [3, 4, 6]) {
    const field = new WaveField(wavesForTier(count));
    field.setFocus(14.5, -32.25);
    for (let i = 0; i < 400; i++) {
      const x = -180 + ((i * 37.13) % 420);
      const z = -150 + ((i * 53.71) % 380);
      const t = i * 0.731 + 1000;
      out.push(field.heightAt(x, z, t));
      field.velocityAt(x, z, t, vel);
      out.push(vel[0]!, vel[1]!);
    }
  }
  return out;
}

function windSamples(): number[] {
  const out: number[] = [];
  const w = [0, 0];
  for (let i = 0; i < 400; i++) {
    windAt(-300 + i * 1.7, 200 - i * 2.3, i * 0.37, w);
    out.push(w[0]!, w[1]!);
  }
  return out;
}

function shipTrack(): number[] {
  const waves = new WaveField();
  const ship = new ShipDynamics(40, -60, 0.9);
  const pile: CircleObstacle[] = [{ x: 120, z: -20, r: 1.5 }];
  const out: number[] = [];
  const record = () => {
    const p = ship.pose;
    out.push(p.x, p.z, p.heading, p.heave, p.pitch, p.roll, p.speed, p.luff, p.shake, ship.forwardSpeed);
  };
  let t = 0;
  for (let i = 0; i < 90 * 60; i++) {
    const s = i / 60;
    const trim = s < 5 ? s / 5 : s < 40 ? 0.85 : s < 60 ? 0.5 : 1;
    const rudder = s < 20 ? 0.2 * Math.sin(s * 0.4) : s < 45 ? -0.7 : s < 70 ? 0.9 * Math.sin(s * 0.13) : 0.3;
    // Uneven frames, like a real browser: some steps take two fixed substeps.
    const dt = i % 7 === 3 ? 1 / 30 : 1 / 60;
    t += dt;
    ship.step(dt, { trim, rudder }, { waves, ground: null, obstacles: pile, t });
    if (i % 3 === 0) record();
  }
  ship.dockAssist({ x: ship.pose.x + 30, z: ship.pose.z - 10, heading: 1.2 });
  for (let i = 0; i < 40 * 60; i++) {
    t += 1 / 60;
    ship.step(1 / 60, { trim: 0, rudder: 0 }, { waves, ground: null, obstacles: [], t });
    if (i % 3 === 0) record();
  }
  return out;
}

describe('Breeze is today’s sea', () => {
  it('samples the waves exactly as before the sea-state model', () => {
    const h = hash(waveSamples());
    if (EXPECTED.waves === 'pending') console.log('waves', h);
    expect(h).toBe(EXPECTED.waves);
  });

  it('blows the same wind', () => {
    const h = hash(windSamples());
    if (EXPECTED.wind === 'pending') console.log('wind', h);
    expect(h).toBe(EXPECTED.wind);
  });

  it('sails the same track', () => {
    const h = hash(shipTrack());
    if (EXPECTED.ship === 'pending') console.log('ship', h);
    expect(h).toBe(EXPECTED.ship);
  });
});
