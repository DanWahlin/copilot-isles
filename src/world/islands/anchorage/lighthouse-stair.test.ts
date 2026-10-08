import { describe, expect, it } from 'vitest';
import { tierSettings } from '../../../engine/quality';
import { CollisionWorld } from '../../../game/collision';
import { PlayerController } from '../../../game/player-controller';
import type { HeightField } from '../../contracts';
import { COVE } from '../../layout';
import { createVillage } from './village';
import {
  LIGHTHOUSE,
  LIGHTHOUSE_DOOR_HEADING,
  STAIR_START,
  TREAD_ANGLE,
  WATCH_DOOR_HEADING,
  insideLighthouse,
  lighthouseLevels,
  lighthouseWalkable,
} from './lighthouse-stair';

const L = COVE.lighthouse;
const { floor, deck } = lighthouseLevels();
const at = (a: number, r: number) => ({ x: L.x + Math.sin(a) * r, z: L.z + Math.cos(a) * r });

/** A flat knoll at the lighthouse's top, so the door step is reachable as in the game. */
const heightField: HeightField = {
  heightAt: () => L.top,
  normalAt: (_x, _z, out) => {
    out[0] = 0;
    out[1] = 1;
    out[2] = 0;
    return out;
  },
  masksAt: () => ({ sand: 0, grass: 1, rock: 0, cliff: 0 }),
};

describe('lighthouse stair', () => {
  it('rises a step at a time round the newel, picking the turn under your feet', () => {
    const r = (LIGHTHOUSE.newel + LIGHTHOUSE.inner) * 0.5;
    let y = floor;
    // From the door landing (in the first turn) round onto step 0 (a turn on) and up all 76 steps.
    const start = LIGHTHOUSE_DOOR_HEADING;
    const end = STAIR_START + (LIGHTHOUSE.treads + LIGHTHOUSE.perTurn) * TREAD_ANGLE;
    for (let a = start; a <= end - TREAD_ANGLE * 0.5; a += 0.02) {
      const p = at(a, r);
      const h = lighthouseWalkable(p.x, p.z, y)!;
      expect(h - y, `at ${a.toFixed(2)}`).toBeLessThanOrEqual(0.55);
      expect(h - y).toBeGreaterThan(-0.05);
      y = h;
    }
    expect(y).toBeCloseTo(deck, 5);
    // Without the feet, the lowest level: the ground floor (or the solid first turn).
    const p = at(STAIR_START + TREAD_ANGLE * 2.5, r);
    expect(lighthouseWalkable(p.x, p.z)).toBeCloseTo(floor + 0.6, 5);
    expect(insideLighthouse(p.x, floor + 3, p.z)).toBe(true);
  });

  it('keeps the gallery off the ground: high decks need the feet', () => {
    const g = at(WATCH_DOOR_HEADING + 1.2, (LIGHTHOUSE.watchR + LIGHTHOUSE.railR) * 0.5);
    expect(lighthouseWalkable(g.x, g.z)).toBeNull();
    expect(lighthouseWalkable(g.x, g.z, L.top)).toBeNull();
    expect(lighthouseWalkable(g.x, g.z, deck)).toBeCloseTo(deck, 5);
  });

  it('lets a walker climb in through the door, up the stair and out onto the gallery', async () => {
    const village = await createVillage({ tier: tierSettings('high'), heightField });
    const world = new CollisionWorld({
      ground: heightField,
      surfaces: [{ heightAt: village.walkable, kind: 'stone' }],
      circles: village.colliders.circles,
      boxes: village.colliders.boxes,
    });
    const player = new PlayerController();
    const outside = at(LIGHTHOUSE_DOOR_HEADING, LIGHTHOUSE.plinthR + 0.5);
    player.teleport(world, outside.x, outside.z, LIGHTHOUSE_DOOR_HEADING + Math.PI);
    const mid = (LIGHTHOUSE.newel + LIGHTHOUSE.inner) * 0.5;
    const path: { x: number; z: number }[] = [
      at(LIGHTHOUSE_DOOR_HEADING, 1.5),
      at(LIGHTHOUSE_DOOR_HEADING, mid),
    ];
    for (
      let a = LIGHTHOUSE_DOOR_HEADING;
      a < STAIR_START + (LIGHTHOUSE.treads + LIGHTHOUSE.perTurn) * TREAD_ANGLE;
      a += 0.25
    )
      path.push(at(a, mid));
    path.push(at(WATCH_DOOR_HEADING, mid), at(WATCH_DOOR_HEADING, 1.5), at(WATCH_DOOR_HEADING, 2.35));
    const intent = { moveX: 0, moveY: 1, run: false, jump: false };
    let i = 0;
    for (let step = 0; step < 60 * 240 && i < path.length; step += 1) {
      const target = path[i]!;
      const dx = target.x - player.x;
      const dz = target.z - player.z;
      if (Math.hypot(dx, dz) < 0.2) {
        i += 1;
        continue;
      }
      player.step(1 / 60, intent, Math.atan2(dx, dz), world, step / 60);
    }
    expect(i, `stopped at waypoint ${i} of ${path.length}, y ${player.y.toFixed(2)}`).toBe(path.length);
    expect(player.y).toBeCloseTo(deck, 2);
    const r = Math.hypot(player.x - L.x, player.z - L.z);
    expect(r).toBeGreaterThan(LIGHTHOUSE.watchR);
    expect(r).toBeLessThan(LIGHTHOUSE.railR);
    // The railing holds you on the gallery.
    for (let step = 0; step < 240; step += 1)
      player.step(1 / 60, intent, WATCH_DOOR_HEADING, world, step / 60);
    expect(Math.hypot(player.x - L.x, player.z - L.z)).toBeLessThan(LIGHTHOUSE.railR);
    expect(player.y).toBeCloseTo(deck, 2);
    village.dispose();
  });

  it('keeps walkers on the knoll out of the walls but lets them through the door', async () => {
    const village = await createVillage({ tier: tierSettings('high'), heightField });
    const world = new CollisionWorld({
      ground: heightField,
      surfaces: [{ heightAt: village.walkable, kind: 'stone' }],
      circles: village.colliders.circles,
      boxes: village.colliders.boxes,
    });
    const intent = { moveX: 0, moveY: 1, run: false, jump: false };
    const walkIn = (a: number): number => {
      const player = new PlayerController();
      const p = at(LIGHTHOUSE_DOOR_HEADING + a, LIGHTHOUSE.plinthR + 1.2);
      player.teleport(world, p.x, p.z);
      for (let step = 0; step < 300; step += 1)
        player.step(1 / 60, intent, Math.atan2(L.x - player.x, L.z - player.z), world, step / 60);
      return Math.hypot(player.x - L.x, player.z - L.z);
    };
    for (const a of [0.6, 1.9, 3.3, 4.6])
      expect(walkIn(a), `wall at ${a}`).toBeGreaterThan(LIGHTHOUSE.plinthR);
    expect(walkIn(0)).toBeLessThan(LIGHTHOUSE.inner);
    village.dispose();
  });
});
