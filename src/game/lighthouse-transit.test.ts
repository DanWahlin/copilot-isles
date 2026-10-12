import { PerspectiveCamera } from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { tierSettings } from '../engine/quality';
import type { HeightField } from '../world/contracts';
import { COVE } from '../world/layout';
import { createVillage } from '../world/islands/anchorage/village';
import {
  LIGHTHOUSE,
  LIGHTHOUSE_DOOR_HEADING,
  STAIR_START,
  TREAD_ANGLE,
  WATCH_DOOR_HEADING,
  lighthouseLevels,
} from '../world/islands/anchorage/lighthouse-stair';
import { CollisionWorld } from './collision';
import { FollowCamera } from './follow-camera';
import {
  GALLERY_CAMERA_COLUMN,
  LIGHTHOUSE_BOTTOM,
  LIGHTHOUSE_STAIR_HEAD,
  LIGHTHOUSE_TOP,
  lighthouseArrival,
  lighthouseFade,
  lighthouseTransitAt,
  onLighthouseGallery,
} from './lighthouse-transit';
import { PlayerController } from './player-controller';

const L = COVE.lighthouse;
const { floor, deck } = lighthouseLevels();
const at = (a: number, r: number) => ({ x: L.x + Math.sin(a) * r, z: L.z + Math.cos(a) * r });
const mid = (LIGHTHOUSE.newel + LIGHTHOUSE.inner) * 0.5;

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

async function lighthouseWorld() {
  const village = await createVillage({ tier: tierSettings('high'), heightField });
  const world = new CollisionWorld({
    ground: heightField,
    surfaces: [{ heightAt: village.walkable, kind: 'stone' }],
    circles: village.colliders.circles,
    boxes: village.colliders.boxes,
  });
  return { village, world };
}

/** Walks `player` through the waypoints until the fast-forward fires; returns its direction (or null). */
function walkUntilTransit(
  player: PlayerController,
  world: CollisionWorld,
  path: { x: number; z: number }[],
): { dir: ReturnType<typeof lighthouseTransitAt>; waypoint: number } {
  const intent = { moveX: 0, moveY: 1, run: false, jump: false };
  let i = 0;
  for (let step = 0; step < 60 * 60 && i < path.length; step += 1) {
    const dir = lighthouseTransitAt(player.x, player.y, player.z, player.mode !== 'air');
    if (dir) return { dir, waypoint: i };
    const target = path[i]!;
    const dx = target.x - player.x;
    const dz = target.z - player.z;
    if (Math.hypot(dx, dz) < 0.2) {
      i += 1;
      continue;
    }
    player.step(1 / 60, intent, Math.atan2(dx, dz), world, step / 60);
  }
  return { dir: null, waypoint: i };
}

describe('lighthouse fast-forward', () => {
  it('goes up once you step onto the stair from the ground floor', async () => {
    const { village, world } = await lighthouseWorld();
    const player = new PlayerController();
    const outside = at(LIGHTHOUSE_DOOR_HEADING, LIGHTHOUSE.plinthR + 0.5);
    player.teleport(world, outside.x, outside.z, LIGHTHOUSE_DOOR_HEADING + Math.PI);
    const path = [at(LIGHTHOUSE_DOOR_HEADING, 1.5), at(LIGHTHOUSE_DOOR_HEADING, mid)];
    for (let a = LIGHTHOUSE_DOOR_HEADING; a < STAIR_START + 3 * LIGHTHOUSE.perTurn * TREAD_ANGLE; a += 0.25)
      path.push(at(a, mid));
    const { dir, waypoint } = walkUntilTransit(player, world, path);
    expect(dir).toBe('up');
    // Within the first few steps, not a long manual climb.
    expect(player.y).toBeLessThan(floor + 0.8);
    expect(waypoint).toBeLessThan(path.length);
    village.dispose();
  });

  it('goes down once you step from the watch room into the stairwell', async () => {
    const { village, world } = await lighthouseWorld();
    const player = new PlayerController();
    const top = lighthouseArrival('up');
    player.teleport(world, top.x, top.z, top.heading + Math.PI, top.y);
    expect(player.y).toBeCloseTo(deck, 2);
    const path = [at(WATCH_DOOR_HEADING, 1.5), at(WATCH_DOOR_HEADING, mid)];
    // Round the stairwell from the watch-room floor, away from the door.
    for (let a = WATCH_DOOR_HEADING; a > WATCH_DOOR_HEADING - Math.PI * 2; a -= 0.25) path.push(at(a, mid));
    const { dir } = walkUntilTransit(player, world, path);
    expect(dir).toBe('down');
    village.dispose();
  });

  it('goes either way when you walk straight in toward the newel', async () => {
    const { village, world } = await lighthouseWorld();
    const up = new PlayerController();
    const outside = at(LIGHTHOUSE_DOOR_HEADING, LIGHTHOUSE.plinthR + 0.5);
    up.teleport(world, outside.x, outside.z, LIGHTHOUSE_DOOR_HEADING + Math.PI);
    expect(walkUntilTransit(up, world, [at(LIGHTHOUSE_DOOR_HEADING, 0.3)]).dir).toBe('up');
    const down = new PlayerController();
    down.teleport(world, LIGHTHOUSE_TOP.x, LIGHTHOUSE_TOP.z, LIGHTHOUSE_TOP.heading + Math.PI, deck);
    expect(walkUntilTransit(down, world, [at(WATCH_DOOR_HEADING, 0.3)]).dir).toBe('down');
    village.dispose();
  });

  it("doesn't start again where it leaves you (no loop) and leaves you able to walk off", async () => {
    const { village, world } = await lighthouseWorld();
    for (const a of [LIGHTHOUSE_TOP, LIGHTHOUSE_BOTTOM]) {
      const player = new PlayerController();
      player.teleport(world, a.x, a.z, a.heading, a.y);
      expect(player.y).toBeCloseTo(a.y, 2);
      expect(lighthouseTransitAt(player.x, player.y, player.z, true)).toBeNull();
      // Walk on out the way you face for two seconds: still no fast-forward.
      for (let step = 0; step < 120; step += 1) {
        player.step(1 / 60, { moveX: 0, moveY: 1, run: false, jump: false }, a.heading, world, step / 60);
        expect(lighthouseTransitAt(player.x, player.y, player.z, player.mode !== 'air')).toBeNull();
      }
    }
    // The top leaves you on the gallery (the camera keeps out of the tower there); the bottom just
    // inside the ground door, facing out.
    expect(onLighthouseGallery(LIGHTHOUSE_TOP.x, LIGHTHOUSE_TOP.y, LIGHTHOUSE_TOP.z)).toBe(true);
    const bottomR = Math.hypot(LIGHTHOUSE_BOTTOM.x - L.x, LIGHTHOUSE_BOTTOM.z - L.z);
    expect(bottomR).toBeGreaterThan(LIGHTHOUSE.inner);
    expect(bottomR).toBeLessThan(LIGHTHOUSE.plinthR);
    expect(LIGHTHOUSE_BOTTOM.y).toBe(floor);
    expect(onLighthouseGallery(LIGHTHOUSE_BOTTOM.x, LIGHTHOUSE_BOTTOM.y, LIGHTHOUSE_BOTTOM.z)).toBe(false);
    // The top arrival isn't in the "Go back down" prompt (the bottom shows "Climb to the top", a hint).
    const d = (p: { x: number; z: number }, q: { x: number; z: number }) => Math.hypot(p.x - q.x, p.z - q.z);
    expect(d(LIGHTHOUSE_TOP, LIGHTHOUSE_STAIR_HEAD)).toBeGreaterThan(LIGHTHOUSE_STAIR_HEAD.radius);
    village.dispose();
  });

  it('ignores jumps on the ground floor and anyone outside the shaft', () => {
    const p = at(STAIR_START + TREAD_ANGLE * 0.5, mid);
    expect(lighthouseTransitAt(p.x, floor + 0.8, p.z, false)).toBeNull();
    expect(lighthouseTransitAt(p.x, floor + 0.8, p.z, true)).toBe('up');
    expect(lighthouseTransitAt(p.x, deck - 1, p.z, true)).toBe('down');
    const o = at(STAIR_START, LIGHTHOUSE.inner + 0.4);
    expect(lighthouseTransitAt(o.x, floor + 0.8, o.z, true)).toBeNull();
  });

  it('uses a plain, shorter fade with reduced motion', () => {
    const calm = lighthouseFade(true);
    const full = lighthouseFade(false);
    expect(calm.steps).toBe(0);
    expect(calm.out + calm.hold + calm.in).toBeLessThan(full.out + full.hold + full.in);
    // Both are quick: well under the old manual climb.
    expect(full.out + full.hold + full.in).toBeLessThanOrEqual(1500);
  });
});

describe('gallery camera', () => {
  it('stays behind you, out of the tower, as you walk round the gallery', () => {
    const cam = new FollowCamera();
    const view = new PerspectiveCamera(55, 16 / 9, 0.1, 1000);
    cam.keepOutside(GALLERY_CAMERA_COLUMN);
    const r = (LIGHTHOUSE.watchR + LIGHTHOUSE.railR) * 0.5;
    const look = { lookX: 0, lookY: 0, zoom: 0 };
    let a = WATCH_DOOR_HEADING;
    const target = { x: 0, y: deck, z: 0 };
    const place = () => {
      target.x = L.x + Math.sin(a) * r;
      target.z = L.z + Math.cos(a) * r;
    };
    place();
    cam.snapBehind(LIGHTHOUSE_TOP.cameraYaw);
    // Walk round one way (the camera follows behind), then back toward the camera (S): it stays out.
    for (const dir of [-1, 1]) {
      for (let i = 0; i < 360; i += 1) {
        a += (dir * 1.4) / 60 / r;
        place();
        const heading = a + (dir * Math.PI) / 2;
        cam.update(1 / 60, view, look, target, heading, true, null, i / 60);
        if (i < 120) continue;
        // Out of the column…
        const cr = Math.hypot(view.position.x - L.x, view.position.z - L.z);
        expect(cr).toBeGreaterThan(GALLERY_CAMERA_COLUMN.r);
        if (dir > 0) continue;
        // …and behind you: the camera looks the way you walk.
        const fx = Math.sin(cam.yaw);
        const fz = Math.cos(cam.yaw);
        expect(fx * Math.sin(heading) + fz * Math.cos(heading)).toBeGreaterThan(0.6);
      }
    }
  });

  it('turns off the tower when you face out to sea', () => {
    const cam = new FollowCamera();
    const view = new PerspectiveCamera(55, 16 / 9, 0.1, 1000);
    cam.keepOutside(GALLERY_CAMERA_COLUMN);
    const target = { x: LIGHTHOUSE_TOP.x, y: LIGHTHOUSE_TOP.y, z: LIGHTHOUSE_TOP.z };
    // Straight behind a walker facing out is inside the tower.
    cam.snapBehind(WATCH_DOOR_HEADING);
    for (let i = 0; i < 120; i += 1)
      cam.update(1 / 60, view, { lookX: 0, lookY: 0, zoom: 0 }, target, WATCH_DOOR_HEADING, false, null, 0);
    expect(Math.hypot(view.position.x - L.x, view.position.z - L.z)).toBeGreaterThan(GALLERY_CAMERA_COLUMN.r);
    // Without the column the line from you back to the camera runs through the tower.
    cam.keepOutside(null);
    cam.snapBehind(WATCH_DOOR_HEADING);
    cam.update(1 / 60, view, { lookX: 0, lookY: 0, zoom: 0 }, target, WATCH_DOOR_HEADING, false, null, 0);
    const mx = (view.position.x + target.x) * 0.5;
    const mz = (view.position.z + target.z) * 0.5;
    expect(Math.hypot(mx - L.x, mz - L.z)).toBeLessThan(LIGHTHOUSE.watchR);
  });
});

describe('arrival cameras with the real colliders', () => {
  /** Settles a follow camera on an arrival and returns its distance, its spot, and how "behind" it is. */
  async function settle(a: typeof LIGHTHOUSE_TOP, column: typeof GALLERY_CAMERA_COLUMN | null) {
    const { village, world } = await lighthouseWorld();
    for (const b of village.cameraBlockers) world.addCameraBox(b);
    const player = new PlayerController();
    player.teleport(world, a.x, a.z, a.heading, a.y);
    const cam = new FollowCamera();
    const view = new PerspectiveCamera(55, 16 / 9, 0.1, 1000);
    cam.keepOutside(column);
    cam.snapBehind(a.cameraYaw);
    if (a.cameraPitch !== null) cam.pitch = a.cameraPitch;
    for (let i = 0; i < 180; i += 1)
      cam.update(1 / 60, view, { lookX: 0, lookY: 0, zoom: 0 }, player, a.heading, false, world, i / 60);
    const dx = player.x - view.position.x;
    const dz = player.z - view.position.z;
    const flat = Math.hypot(dx, dz);
    village.dispose();
    return {
      dist: Math.hypot(dx, view.position.y - player.y - cam.rig.pivotY, dz),
      r: Math.hypot(view.position.x - L.x, view.position.z - L.z),
      y: view.position.y,
      behind: (dx / flat) * Math.sin(a.heading) + (dz / flat) * Math.cos(a.heading),
    };
  }

  it('fits the camera about 2 m behind you just inside the ground door, in the shaft', async () => {
    const c = await settle(LIGHTHOUSE_BOTTOM, null);
    expect(c.dist).toBeGreaterThan(1.8);
    expect(c.behind).toBeGreaterThan(0.95);
    // In the shaft (not through its wall) and under the steps over the landing.
    expect(c.r).toBeLessThan(LIGHTHOUSE.inner - 0.2);
    expect(c.y).toBeLessThan(floor + 2.04 - 0.1);
  });

  it('keeps the full follow distance behind you at the top, clear of the tower', async () => {
    const c = await settle(LIGHTHOUSE_TOP, GALLERY_CAMERA_COLUMN);
    expect(c.dist).toBeGreaterThan(5);
    expect(c.behind).toBeGreaterThan(0.8);
    expect(c.r).toBeGreaterThan(GALLERY_CAMERA_COLUMN.r);
  });
});
