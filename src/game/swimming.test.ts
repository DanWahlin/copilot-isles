import { describe, expect, it } from 'vitest';
import type { HeightField, WaveSampler } from '../world/contracts';
import { CollisionWorld, type CollisionWorldOptions } from './collision';
import { PlayerController, type MoveIntent } from './player-controller';
import { SWIM_BAND, SwimBounds } from './swim-bounds';
import { wrapAngle } from '../util/math';

/** A beach shelving into the sea along +z (the shoreline at z = 20), down to a 4 m deep bed. */
const bed = (z: number) => Math.max(-4, 1 - z * 0.05);
const beach: HeightField = {
  heightAt: (_x, z) => bed(z),
  normalAt: (_x, _z, out) => {
    out[0] = 0;
    out[1] = 0.9987;
    out[2] = 0.05;
    return out;
  },
  masksAt: () => ({ sand: 1, grass: 0, rock: 0, cliff: 0 }),
};
const flatSea: WaveSampler = { heightAt: () => 0, velocityAt: (_x, _z, _t, o) => o };
/** A swell: 0.3 m, 6 s, running in to the beach, and a little chop. */
const swell: WaveSampler = {
  heightAt: (x, z, t) => 0.3 * Math.sin(z * 0.12 - t * 1.05) + 0.04 * Math.sin(x * 1.3 + z * 0.9 - t * 4.1),
  velocityAt: (_x, _z, _t, o) => o,
};
/** Where wading stops on the beach (still water 1.05 m deep: wadeMax), and the band's edge past it. */
const WADE_END = (1 + 1.05) / 0.05;
const EDGE = WADE_END + SWIM_BAND;

function setup(
  o: Partial<CollisionWorldOptions> = {},
  inWaters: (x: number, z: number) => boolean = () => true,
) {
  const world = new CollisionWorld({ ground: beach, waves: flatSea, ...o });
  const player = new PlayerController();
  // As the session's: the band, the island's waters, and decks and quays to keep clear of.
  const bounds = new SwimBounds(world, {
    band: () => SWIM_BAND,
    inWaters,
    wadeMax: player.tune.wadeMax,
    deck: (x, z) => world.surfaceHeightAt(x, z) !== null,
  });
  player.swimLimit = bounds;
  return { world, player, bounds };
}

const still: MoveIntent = { moveX: 0, moveY: 0, run: false, jump: false };
const ahead: MoveIntent = { moveX: 0, moveY: 1, run: false, jump: false };
const fast: MoveIntent = { moveX: 0, moveY: 1, run: true, jump: false };

/** Steps `secs` at 60 Hz from time `t0` with the camera along `yaw`; calls `each` after every step. */
function run(
  p: PlayerController,
  w: CollisionWorld,
  intent: MoveIntent,
  yaw: number,
  secs: number,
  t0 = 0,
  each?: (t: number) => void,
): number {
  let t = t0;
  for (let i = 0; i < Math.round(secs * 60); i++) {
    t += 1 / 60;
    p.step(1 / 60, intent, yaw, w, t);
    each?.(t);
  }
  return t;
}

describe('swimming', () => {
  it('wades in, floats past shoulder depth, and swims slower than walking', () => {
    const { world, player } = setup();
    player.teleport(world, 0, 10);
    const modes = new Set<string>();
    run(player, world, ahead, 0, 32, 0, () => modes.add(player.mode));
    expect([...modes]).toEqual(['ground', 'wade', 'swim']);
    expect(player.mode).toBe('swim');
    expect(player.depth).toBeGreaterThan(player.tune.wadeMax);
    expect(player.speed).toBeCloseTo(player.tune.swimSpeed, 1);
    expect(player.speed).toBeLessThan(player.tune.walkSpeed);
    // Stroking along: the body lies along the water, the feet's spot strokeFloat under it.
    expect(player.stroke).toBeGreaterThan(0.95);
    expect(player.afloat).toBeGreaterThan(0.99);
    expect(player.y).toBeCloseTo(-player.tune.strokeFloat, 1);
    // The run key is the faster stroke.
    run(player, world, fast, 0, 4);
    expect(player.speed).toBeCloseTo(player.tune.swimRunSpeed, 1);
  });

  it('treads water upright when still, head and shoulders out', () => {
    const { world, player } = setup();
    player.teleport(world, 0, 10);
    run(player, world, ahead, 0, 40);
    run(player, world, still, 0, 6);
    expect(player.mode).toBe('swim');
    expect(player.speed).toBeLessThan(0.05);
    expect(player.stroke).toBeLessThan(0.05);
    expect(player.y).toBeCloseTo(-player.tune.treadFloat, 1);
  });

  it('turns in place afloat before it strokes the other way', () => {
    const { world, player } = setup();
    player.teleport(world, 0, 10);
    run(player, world, ahead, 0, 40);
    run(player, world, still, 0, 6);
    const z0 = player.z;
    let most = 0;
    // The wish is straight behind: he turns round first, nearly on the spot.
    let turned = Number.NaN;
    run(player, world, ahead, Math.PI, 1, 0, () => {
      if (Math.abs(wrapAngle(player.heading - Math.PI)) > 1) most = Math.max(most, player.speed);
      else if (Number.isNaN(turned)) turned = player.z;
    });
    expect(most).toBeLessThan(0.1);
    expect(Math.abs(turned - z0)).toBeLessThan(0.05);
    run(player, world, ahead, Math.PI, 2);
    expect(Math.abs(Math.cos(player.heading) + 1)).toBeLessThan(0.05);
    expect(player.z).toBeLessThan(z0 - 0.5);
  });

  it('never jumps afloat', () => {
    const { world, player } = setup();
    player.teleport(world, 0, 10);
    run(player, world, ahead, 0, 40);
    run(player, world, { ...ahead, jump: true }, 0, 1);
    expect(player.mode).toBe('swim');
    expect(player.vy).toBe(0);
  });

  it('slows and turns you back softly at the band’s edge, never past it', () => {
    const { world, player, bounds } = setup();
    player.teleport(world, 0, 10);
    let far = 0;
    let lastVz = Number.NaN;
    let jolt = 0;
    run(player, world, fast, 0, 150, 0, () => {
      far = Math.max(far, player.z);
      if (player.mode === 'swim') jolt = Math.max(jolt, Math.abs(player.vz - lastVz) || 0);
      lastVz = player.vz;
    });
    // Out at the edge it holds you a little inside it: no snap (each step's change is small).
    expect(far).toBeGreaterThan(EDGE - player.tune.swimSoft);
    expect(far).toBeLessThan(EDGE + 0.5);
    expect(player.z).toBeLessThan(EDGE);
    expect(jolt).toBeLessThan(0.05);
    expect(player.swimRoom).toBeLessThan(player.tune.swimSoft);
    expect(bounds.limit).toBe('shore');
    // Let go, and the drift carries you back in a little.
    const z = player.z;
    run(player, world, still, 0, 8);
    expect(player.z).toBeLessThan(z - 0.3);
    expect(player.mode).toBe('swim');
  });

  it('measures the band from the nearest ground you could wade on, not from where you went in', () => {
    // A spit runs out along x = 60 to z = 100: swimming out beside it, the band follows it.
    const spit: HeightField = {
      ...beach,
      heightAt: (x, z) => (Math.abs(x - 60) < 3 && z < 100 ? 0.5 : bed(z)),
    };
    const world = new CollisionWorld({ ground: spit, waves: flatSea });
    const player = new PlayerController();
    player.swimLimit = new SwimBounds(world, {
      band: () => SWIM_BAND,
      inWaters: () => true,
      wadeMax: player.tune.wadeMax,
    });
    player.teleport(world, 50, 10);
    let t = 0;
    while (player.z < EDGE + 20 && t < 200) t = run(player, world, ahead, 0, 1, t);
    // 10 m off the spit, 20 m past the beach's band: well inside the spit's.
    expect(player.z).toBeGreaterThan(EDGE + 20);
    expect(player.swimRoom).toBeGreaterThan(SWIM_BAND - 12);
  });

  it('keeps out of a keep-out (the moored ship) softly', () => {
    const { world, player, bounds } = setup();
    // A hull lying across the water at z = 55, 6 m clear all round.
    bounds.keepOuts.push({ x0: -10, z0: 55, x1: 10, z1: 55, r: 6 });
    player.teleport(world, 0, 10);
    let far = 0;
    run(player, world, fast, 0, 80, 0, () => (far = Math.max(far, player.z)));
    expect(far).toBeLessThan(55 - 6 + 0.5);
    expect(far).toBeGreaterThan(55 - 6 - player.tune.swimSoft);
    expect(bounds.limit).toBe('keepOut');
  });

  it('stops hard at the island’s waters, should anything carry you there', () => {
    const { world, player } = setup({}, (_x, z) => z < 50);
    player.teleport(world, 0, 10);
    run(player, world, fast, 0, 80);
    expect(player.z).toBeLessThan(50);
  });

  it('rides the swell smoothly, never under it nor under the bed', () => {
    const { world, player } = setup({ waves: swell });
    player.teleport(world, 0, 10);
    const ys: number[] = [];
    let off = 0;
    let sunk = 0;
    const T = player.tune;
    run(player, world, ahead, 0, 40, 0, (t) => {
      sunk = Math.max(sunk, bed(player.z) - player.y);
      // Out past the line where the swell sets him down on the bed now and then.
      if (player.mode !== 'swim' || player.depth < 1.2) return void ys.push(Number.NaN);
      ys.push(player.y);
      // Out in the swell, riding it: the feet's spot within 10 cm of where the float puts it.
      const ride =
        swell.heightAt(player.x, player.z, t) -
        (T.treadFloat + (T.strokeFloat - T.treadFloat) * player.stroke);
      off = Math.max(off, Math.abs(player.y - ride));
    });
    expect(ys.filter((y) => !Number.isNaN(y)).length).toBeGreaterThan(600);
    expect(off).toBeLessThan(0.12);
    expect(sunk).toBeLessThanOrEqual(0);
    // No jitter: the height's second difference stays tiny (the swell is smooth, the chop eased).
    let jerk = 0;
    for (let i = 2; i < ys.length; i++)
      jerk = Math.max(jerk, Math.abs(ys[i]! - 2 * ys[i - 1]! + ys[i - 2]!) || 0);
    expect(jerk).toBeLessThan(0.002);
  });

  it('swims back to the beach and walks out with no pop in height or speed', () => {
    const { world, player } = setup({ waves: swell });
    player.teleport(world, 0, 10);
    const t = run(player, world, ahead, 0, 40);
    let lastY = player.y;
    let lastSpeed = player.speed;
    let step = 0;
    let lurch = 0;
    const modes: string[] = [];
    run(player, world, ahead, Math.PI, 40, t, () => {
      step = Math.max(step, Math.abs(player.y - lastY));
      lurch = Math.max(lurch, Math.abs(player.speed - lastSpeed));
      lastY = player.y;
      lastSpeed = player.speed;
      if (modes.at(-1) !== player.mode) modes.push(player.mode);
    });
    // The swell lifts him off the bed and sets him down again near the line; then he walks out.
    expect(modes[0]).toBe('swim');
    expect(modes.at(-1)).toBe('ground');
    expect(player.z).toBeLessThan(20);
    expect(player.afloat).toBeLessThan(0.01);
    // At most a couple of centimetres a step (the beach's own slope at walking pace is ~1.5).
    expect(step).toBeLessThan(0.025);
    expect(lurch).toBeLessThan(0.15);
  });

  it('wades only to chest depth where there’s nowhere to swim', () => {
    const world = new CollisionWorld({ ground: beach, waves: flatSea });
    const player = new PlayerController();
    player.teleport(world, 0, 10);
    run(player, world, ahead, 0, 40);
    expect(player.mode).toBe('wade');
    expect(player.afloat).toBe(0);
    expect(-bed(player.z)).toBeLessThanOrEqual(player.tune.wadeMax + 0.05);
  });

  it('keeps a swimmer clear of a pier over the water', () => {
    // A pier from the beach out over the water along x = 0 (|x| < 2): swimming at it across the bay.
    const { world, player, bounds } = setup({
      surfaces: [{ heightAt: (x, z) => (Math.abs(x) < 2 && z > 15 && z < 70 ? 1.2 : null), kind: 'wood' }],
    });
    player.teleport(world, -20, 10);
    run(player, world, ahead, 0, 35);
    expect(player.mode).toBe('swim');
    let near = Infinity;
    run(player, world, ahead, Math.PI / 2, 30, 0, () => (near = Math.min(near, -2 - player.x)));
    // Held off its edge, never under it.
    expect(near).toBeGreaterThan(1.5);
    expect(near).toBeLessThan(4);
    expect(bounds.limit).toBe('deck');
  });

  it('never steps off a quay into deep water', () => {
    // A deck at 1.2 m over the sea from z = 20 to 60 (x < 5): its end is over 2 m of water.
    const { world, player } = setup({
      surfaces: [{ heightAt: (x, z) => (x < 5 && z > 20 && z < 60 ? 1.2 : null), kind: 'wood' }],
    });
    player.teleport(world, 0, 30);
    run(player, world, ahead, 0, 40);
    expect(player.mode).toBe('ground');
    expect(player.z).toBeLessThan(60);
  });

  it('swims in a pool deep enough, inside its banks', () => {
    // A round pool 3 m deep, 8 m across, its surface 2 m up on a flat plateau.
    const plateau: HeightField = { ...beach, heightAt: () => 2 };
    const world = new CollisionWorld({
      ground: plateau,
      waves: flatSea,
      inland: (x, z, g, out) => {
        const r = Math.hypot(x, z);
        if (r > 8) return false;
        out.level = 2.6;
        out.floor = g - 2.4 * Math.min(1, (8 - r) / 3);
        return true;
      },
    });
    const player = new PlayerController();
    player.swimLimit = new SwimBounds(world, {
      band: () => SWIM_BAND,
      inWaters: () => true,
      wadeMax: player.tune.wadeMax,
    });
    player.teleport(world, -12, 0);
    const modes = new Set<string>();
    run(player, world, ahead, Math.PI / 2, 30, 0, () => modes.add(player.mode));
    expect(modes.has('swim')).toBe(true);
    // Across and out the far side.
    expect(player.x).toBeGreaterThan(8);
    expect(player.mode).toBe('ground');
  });
});

describe('SwimBounds', () => {
  it('finds the nearest wadeable ground, to a few centimetres', () => {
    const world = new CollisionWorld({ ground: beach, waves: flatSea });
    const bounds = new SwimBounds(world, { band: () => 30, inWaters: () => true, wadeMax: 1.05 });
    const back = { x: 0, z: 0 };
    expect(bounds.roomAt(3, 61, 0, back)).toBeCloseTo(30 - (61 - WADE_END), 1);
    expect(back.z).toBeCloseTo(-1, 3);
    expect(bounds.roomAt(3, 30, 0, back)).toBe(30);
  });
});
