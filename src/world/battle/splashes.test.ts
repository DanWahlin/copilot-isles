import { describe, expect, it } from 'vitest';
import { tierSettings } from '../../engine/quality';
import type { WaveSampler } from '../contracts';
import { createBrigantine } from '../ship';
import { Battle } from './battle';
import type { BallPool, SplashPool } from './fx';

/** A sea that moves, so a splash at the wrong time or place sits off the surface. */
const sea: WaveSampler = {
  heightAt: (x, z, t) => 0.45 * Math.sin(0.07 * x + 0.9 * t) + 0.25 * Math.cos(0.05 * z - 0.6 * t),
  velocityAt: (_x, _z, _t, out) => {
    out[0] = 0;
    out[1] = 0;
    return out;
  },
};

interface Pools {
  balls: BallPool;
  splashes: SplashPool;
  combatants: {
    player: boolean;
    state: string;
    scale: number;
    ship: { dynamics: { pose: { x: number; z: number; heading: number } } };
  }[];
}

describe('battle splashes', () => {
  it('makes every splash where a ball goes into the sea or along a sinking hull, and none on a hit', () => {
    const player = createBrigantine({ tier: 'medium', oceanInteraction: false });
    let hits = 0;
    const battle = new Battle({
      tier: tierSettings('medium'),
      waves: sea,
      player,
      seed: 7,
      onSound: (kind) => {
        if (kind === 'timber') hits++;
      },
    });
    const pools = battle as unknown as Pools;
    // The ocean's clock runs 300 s ahead of the battle's (the game's is never the same).
    const offset = 300;

    const balls = pools.balls;
    let now = 0;
    let misses = 0;
    let sinking = 0;
    const strays: string[] = [];
    pools.splashes.onSpawn = (x, y, z) => {
      // On the drawn surface, at the ocean's time.
      if (Math.abs(y - sea.heightAt(x, z, now + offset)) > 1e-4) strays.push(`off the surface at ${x},${z}`);
      // A ball going in: one in flight, just under the water, within a sub-step's travel of it.
      for (let k = 0; k < balls.size; k++) {
        if (balls.owner[k] === -1) continue;
        const bx = balls.x[k]!;
        const bz = balls.z[k]!;
        if (balls.y[k]! < sea.heightAt(bx, bz, now + offset) && Math.hypot(bx - x, bz - z) < 1) {
          misses++;
          return;
        }
      }
      // Air out of a sinking hull: on her centre line, within her length.
      for (const c of pools.combatants) {
        if (c.player || c.state !== 'struck') continue;
        const p = c.ship.dynamics.pose;
        const along = (x - p.x) * Math.sin(p.heading) + (z - p.z) * Math.cos(p.heading);
        const across = (x - p.x) * Math.cos(p.heading) - (z - p.z) * Math.sin(p.heading);
        if (Math.abs(across) < 0.5 && Math.abs(along) <= 10 * c.scale) {
          sinking++;
          return;
        }
      }
      strays.push(`no cause at ${x.toFixed(1)},${z.toFixed(1)}`);
    };

    battle.start(0);
    let drawnRight = true;
    for (let i = 0; i < 60 * 240 && battle.phase !== 'won'; i++) {
      now += 1 / 60;
      battle.fire('bearing');
      battle.update(1 / 60, now, now + offset);
      if (battle.phase === 'question') battle.answer('repairs');
      // Every ball in flight is drawn.
      let live = 0;
      for (let k = 0; k < balls.size; k++) if (balls.owner[k] !== -1) live++;
      if (balls.mesh.count !== live) drawnRight = false;
    }

    expect(strays).toEqual([]);
    expect(drawnRight).toBe(true);
    // The fight had all three: misses, hits (with no splash of their own) and raiders going down.
    expect(misses).toBeGreaterThan(5);
    expect(hits).toBeGreaterThan(5);
    expect(sinking).toBeGreaterThan(0);
    expect(battle.phase).toBe('won');
  });
});
