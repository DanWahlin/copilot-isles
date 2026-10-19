import { describe, expect, it } from 'vitest';
import type { HeightField } from '../world/contracts';
import { CollisionWorld } from './collision';
import { wrapAngle } from '../util/math';
import { PlayerController } from './player-controller';

/** Beach sloping into the sea along +z (sea level 0 at z = 20), a 3 m cliff at x > 30. */
const ground: HeightField = {
  heightAt: (x, z) => (x > 30 ? 3 : 1 - z * 0.05),
  normalAt: (x, _z, out) => {
    out[0] = 0;
    out[1] = x > 30 ? 1 : 0.9987;
    out[2] = 0.05;
    return out;
  },
  masksAt: () => ({ sand: 1, grass: 0, rock: 0, cliff: 0 }),
};
const flatSea = {
  heightAt: () => 0,
  velocityAt: (_x: number, _z: number, _t: number, o: number[] | Float32Array) => o,
};

function world(extra: Partial<ConstructorParameters<typeof CollisionWorld>[0]> = {}) {
  return new CollisionWorld({ ground, waves: flatSea, ...extra });
}

function walk(p: PlayerController, w: CollisionWorld, yaw: number, secs: number, run = false) {
  for (let i = 0; i < secs * 60; i++)
    p.step(1 / 60, { moveX: 0, moveY: 1, run, jump: false }, yaw, w, i / 60);
}

describe('CollisionWorld', () => {
  it('takes fresh water above the sea (a hill lake) as the water there', () => {
    const w = world({
      inland: (x, _z, g, out) => {
        if (x <= 30 || x >= 40) return false;
        out.level = 3.6;
        out.floor = g;
        return true;
      },
    });
    expect(w.waterAt(35, 0, 0)).toBeCloseTo(3.6, 5);
    expect(w.surfaceAt(35, 0, 0)).toBe('water');
    expect(w.waterAt(10, 0, 0)).toBe(0);
    expect(w.groundAt(35, 0)).toBe(3);
  });

  it('wades on the bed fresh water gives, under a coarse ground that fills it', () => {
    // A stream drawn 0.5 m deep over a ground that stands just under its surface.
    const w = world({
      inland: (x, _z, g, out) => {
        if (x <= 30 || x >= 40) return false;
        out.level = g + 0.02;
        out.floor = g - 0.48;
        return true;
      },
    });
    expect(w.groundAt(35, 0)).toBeCloseTo(2.52, 5);
    expect(w.waterAt(35, 0, 0) - w.groundAt(35, 0)).toBeCloseTo(0.5, 5);
    expect(w.surfaceAt(35, 0, 0)).toBe('water');
  });

  it('pushes a circle out of a circle obstacle', () => {
    const w = world({ circles: [{ x: 0, z: 0, r: 1 }] });
    const p = { x: 0.5, z: 0 };
    expect(w.pushOut(p, 0.5)).toBe(true);
    expect(Math.hypot(p.x, p.z)).toBeCloseTo(1.5, 5);
  });

  it('pushes out of a rotated box through the nearest face', () => {
    const w = world({ boxes: [{ x: 10, z: 10, hx: 2, hz: 1, rot: Math.PI / 2 }] });
    // Rotated 90°, the box's long axis runs along world z (z 8-12) and it spans x 9-11.
    // (10.2, 11.5) is 0.5 m from the z = 12 end face and 0.8 m from the x = 11 side.
    const p = { x: 10.2, z: 11.5 };
    w.pushOut(p, 0.4);
    expect(p.x).toBeCloseTo(10.2, 4);
    expect(p.z).toBeCloseTo(12.4, 4);
  });

  it('prefers man-made surfaces above the terrain', () => {
    const w = world({ surfaces: [{ heightAt: (x) => (x < 0 ? 2 : null), kind: 'wood' }] });
    expect(w.groundAt(-1, 0)).toBe(2);
    expect(w.groundAt(1, 0)).toBeCloseTo(1, 5);
    expect(w.surfaceAt(-1, 0)).toBe('wood');
  });
});

describe('PlayerController', () => {
  it('walks forward along the camera yaw at walk speed', () => {
    const w = world();
    const p = new PlayerController();
    p.teleport(w, 0, 0);
    walk(p, w, Math.PI / 2, 2); // camera looks toward +x
    expect(p.x).toBeGreaterThan(2.5);
    expect(Math.abs(p.z)).toBeLessThan(0.01);
    expect(p.speed).toBeCloseTo(p.tune.walkSpeed, 1);
    expect(wrapAngle(p.heading - Math.PI / 2)).toBeCloseTo(0, 2);
  });

  it('cannot climb a 3 m cliff and slides along it', () => {
    const w = world();
    const p = new PlayerController();
    p.teleport(w, 28, 0);
    walk(p, w, Math.PI / 2, 2);
    expect(p.x).toBeLessThanOrEqual(30);
  });

  it('wades into the sea, slows down, and stops at chest depth', () => {
    const w = world();
    const p = new PlayerController();
    p.teleport(w, 0, 10);
    walk(p, w, 0, 30); // toward +z, deeper water
    const depth = 0 - ground.heightAt(p.x, p.z);
    expect(p.mode).toBe('wade');
    expect(depth).toBeLessThanOrEqual(p.tune.wadeMax + 0.05);
    expect(depth).toBeGreaterThan(p.tune.wadeMax - 0.2);
    // Walking back out always works.
    walk(p, w, Math.PI, 20);
    expect(p.mode).toBe('ground');
  });

  it('hops and lands', () => {
    const w = world();
    const p = new PlayerController();
    p.teleport(w, 0, 0);
    p.step(1 / 60, { moveX: 0, moveY: 0, run: false, jump: true }, 0, w, 0);
    expect(p.mode).toBe('air');
    let landed = false;
    for (let i = 0; i < 120 && !landed; i++) {
      p.step(1 / 60, { moveX: 0, moveY: 0, run: false, jump: false }, 0, w, 0);
      landed = p.landed;
    }
    expect(landed).toBe(true);
    expect(p.y).toBeCloseTo(1, 3);
  });

  it('stays finite under huge time steps', () => {
    const w = world({ circles: [{ x: 1, z: 1, r: 0.5 }] });
    const p = new PlayerController();
    p.teleport(w, 0, 0);
    for (let i = 0; i < 50; i++) p.step(0.5, { moveX: 1, moveY: 1, run: true, jump: i % 7 === 0 }, 0.3, w, i);
    expect(Number.isFinite(p.x + p.y + p.z + p.heading)).toBe(true);
  });
});
