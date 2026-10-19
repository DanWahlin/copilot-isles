import { describe, expect, it } from 'vitest';
import type { HeightField } from '../world/contracts';
import { naturalWaterAt, steepness, FALLS } from '../world/islands/fresh-water-natural';
import { meridianHeight, meridianWater } from '../world/islands/meridian';
import type { FreshWater } from '../world/islands/meridian-water';
import { thousandBoughHeight, thousandBoughWater } from '../world/islands/thousand-bough/height';
import { CollisionWorld } from './collision';
import { PlayerController } from './player-controller';

/**
 * The island's carved height drawn on a `step` m grid, as the tier's finest terrain level draws it
 * near the player (High 1, Medium 2, Low 3, Lite 4; `stepsForTier`): two triangles a cell.
 */
function tierGround(height: (x: number, z: number) => number, step: number): HeightField {
  return {
    heightAt(x, z) {
      const i = Math.floor(x / step);
      const j = Math.floor(z / step);
      const u = x / step - i;
      const v = z / step - j;
      const h00 = height(i * step, j * step);
      const h11 = height((i + 1) * step, (j + 1) * step);
      if (u >= v) {
        const h10 = height((i + 1) * step, j * step);
        return h00 + (h10 - h00) * u + (h11 - h10) * v;
      }
      const h01 = height(i * step, (j + 1) * step);
      return h00 + (h11 - h01) * u + (h01 - h00) * v;
    },
    normalAt: (_x, _z, out) => {
      out[0] = 0;
      out[1] = 1;
      out[2] = 0;
      return out;
    },
    masksAt: () => ({ sand: 0, grass: 1, rock: 0, cliff: 0 }),
  };
}

/** Where you'd walk into each stream: its centre line on every reach that isn't a fall or in a pool. */
function streamSpots(water: FreshWater): [number, number][] {
  const out: [number, number][] = [];
  for (const s of water.streams)
    for (let i = 2; i < s.count - 2; i += 2) {
      const run = Math.hypot(s.x[i + 1]! - s.x[i]!, s.z[i + 1]! - s.z[i]!) || 1;
      if (steepness(Math.max(0, s.surface[i]! - s.surface[i + 1]!) / run) > FALLS * 0.8) continue;
      if (water.basinAt(s.x[i]!, s.z[i]!, 1.2)) continue;
      out.push([s.x[i]!, s.z[i]!]);
    }
  return out;
}

/** Pools' middles (out to half their shore). */
function poolSpots(water: FreshWater): [number, number][] {
  const out: [number, number][] = [];
  for (const b of Object.values(water.basins)) {
    out.push([b.x, b.z]);
    for (let k = 0; k < 6; k++) out.push(water.rimPoint(b, (k / 6) * Math.PI * 2, 0.5));
  }
  return out;
}

/** The player's mode and water depth standing still at (x, z). */
function standIn(world: CollisionWorld, x: number, z: number): { mode: string; depth: number } {
  const p = new PlayerController();
  p.teleport(world, x, z);
  for (let i = 0; i < 4; i++)
    p.step(1 / 60, { moveX: 0, moveY: 0, run: false, jump: false }, 0, world, i / 60);
  return { mode: p.mode, depth: p.depth };
}

const ISLANDS = [
  ['Port Meridian', meridianWater, meridianHeight],
  ['Thousand-Bough', thousandBoughWater, thousandBoughHeight],
] as const;
const TIERS = [
  ['High', 1],
  ['Medium', 2],
  ['Low', 3],
  ['Lite', 4],
] as const;

describe.each(ISLANDS)("%s's fresh water wades alike on every tier", (_name, waterOf, height) => {
  const water = waterOf();
  const worldFor = (step: number) =>
    new CollisionWorld({
      ground: tierGround(height, step),
      inland: (x, z, g, out) => naturalWaterAt(water, x, z, g, out),
    });
  const high = worldFor(1);

  it.each(TIERS)('walking into a stream on %s is wading, as deep as on High', (_tier, step) => {
    const world = worldFor(step);
    const spots = streamSpots(water);
    expect(spots.length).toBeGreaterThan(40);
    let wading = 0;
    const off: number[] = [];
    for (const [x, z] of spots) {
      const here = standIn(world, x, z);
      if (here.mode === 'wade') wading++;
      off.push(Math.abs(here.depth - standIn(high, x, z).depth));
    }
    expect(wading / spots.length).toBeGreaterThan(0.97);
    // The coarse ground fills the bed; the depth you wade comes from the bed the water's drawn in, so
    // it's nearly High's (a coarse ground dipping under the bed, or High's finer hollows, aside).
    off.sort((a, b) => a - b);
    expect(off[Math.floor(off.length * 0.9)]).toBeLessThan(0.2);
  });

  it.each(TIERS)("a pool's middle on %s is wading", (_tier, step) => {
    const world = worldFor(step);
    for (const [x, z] of poolSpots(water)) expect(standIn(world, x, z).mode).toBe('wade');
  });

  it('on High the bed is the ground you see (the stream only lowers it where a coarse ground fills it)', () => {
    const ground = tierGround(height, 1);
    let lowered = 0;
    const spots = streamSpots(water);
    for (const [x, z] of spots) if (high.groundAt(x, z) < ground.heightAt(x, z) - 0.05) lowered++;
    expect(lowered / spots.length).toBeLessThan(0.1);
  });
});

it("the cause: Lite's coarse ground fills Thousand-Bough's stream beds, so its plain level isn't wading", () => {
  const water = thousandBoughWater();
  const world = new CollisionWorld({
    ground: tierGround(thousandBoughHeight, 4),
    inland: (x, z, g, out) => {
      const level = water.levelAt(x, z);
      if (level === null) return false;
      out.level = level;
      out.floor = g;
      return true;
    },
  });
  const spots = streamSpots(water);
  const wading = spots.filter(([x, z]) => standIn(world, x, z).mode === 'wade').length;
  expect(wading / spots.length).toBeLessThan(0.7);
});
