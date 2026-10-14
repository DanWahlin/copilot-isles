import { InstancedBufferAttribute, InstancedMesh, Matrix4, PerspectiveCamera, Vector3 } from 'three/webgpu';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WaveSampler } from '../../contracts';
import { world } from '../../uniforms';
import { QuietSea } from '../quiet-sea';
import { createLeaps, leapDive, leapHeight } from './system';

const swell: WaveSampler = {
  heightAt: (x, z, t) => 0.5 * Math.sin(0.08 * x + 1.1 * t) + 0.3 * Math.cos(0.06 * z - 0.7 * t),
  velocityAt: (_x, _z, _t, out) => {
    out[0] = 0;
    out[1] = 0;
    return out;
  },
};

function gameCamera(): PerspectiveCamera {
  const camera = new PerspectiveCamera(50, 16 / 9, 0.1, 2000);
  camera.position.set(0, 8, 0);
  camera.lookAt(0, 0, -60);
  camera.updateMatrixWorld();
  return camera;
}

describe('leap arc', () => {
  it('breaks the surface at 0, peaks at the height, and re-enters at 1', () => {
    expect(leapHeight(0, 6)).toBe(0);
    expect(leapHeight(0.5, 6)).toBeCloseTo(6, 6);
    expect(leapHeight(1, 6)).toBe(0);
  });

  it('starts and ends deep enough under water to hide the body, never hanging at the surface', () => {
    for (const [height, depth] of [
      [3.6, 2.6],
      [8.4, 2.6],
      [0.8, 0.7],
    ] as const) {
      const dive = leapDive(height, depth);
      expect(dive).toBeGreaterThan(1);
      expect(leapHeight(dive, height)).toBeCloseTo(-depth, 6);
      expect(leapHeight(1 - dive, height)).toBeCloseTo(-depth, 6);
      // After re-entry it keeps going down: no resting on the surface.
      let last = 0;
      for (let s = 1.001; s <= dive; s += 0.01) {
        const y = leapHeight(s, height);
        expect(y).toBeLessThan(last);
        last = y;
      }
    }
  });
});

describe('createLeaps', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('sends every dolphin back under the water and clears the pod, instead of resting on the surface', () => {
    vi.stubGlobal('window', { innerWidth: 1600, innerHeight: 900 });
    const leaps = createLeaps({ tier: 'high', titleMode: true, seed: 7 });
    const dolphins = leaps.group.children.find((c) => c.name === 'leaps-dolphins') as InstancedMesh;
    const camera = new PerspectiveCamera(50, 16 / 9, 0.1, 2000);
    camera.position.set(0, 6, 0);
    camera.lookAt(0, 0, -50);
    camera.updateMatrixWorld();
    world.time.value = 0;
    leaps.update(1 / 60, 0, camera);
    expect(leaps.force('dolphin')).toBe(true);

    const m = new Matrix4();
    const p = new Vector3();
    const atSurface = new Map<number, number>();
    let peak = 0;
    let longest = 0;
    let t = 0;
    for (let frame = 0; frame < 60 * 12; frame++) {
      t += 1 / 60;
      world.time.value = t;
      leaps.update(1 / 60, t, camera);
      for (let i = 0; i < dolphins.count; i++) {
        dolphins.getMatrixAt(i, m);
        p.setFromMatrixPosition(m);
        peak = Math.max(peak, p.y);
        // Frames in a row spent at the surface: crossing it takes a few, resting on it (the old
        // darts-in-a-board look) took seconds.
        const run = Math.abs(p.y) < 0.3 ? (atSurface.get(i) ?? 0) + 1 : 0;
        atSurface.set(i, run);
        longest = Math.max(longest, run);
      }
    }
    expect(peak).toBeGreaterThan(2);
    expect(dolphins.count).toBe(0);
    expect(longest).toBeLessThan(10);
    leaps.dispose();
  });

  it('makes every splash where an animal breaks or re-enters the sea, never before or without one', () => {
    vi.stubGlobal('window', { innerWidth: 1280, innerHeight: 720 });
    const leaps = createLeaps({ tier: 'high', seed: 11, waves: swell });
    const mesh = (name: string) => leaps.group.children.find((c) => c.name === name) as InstancedMesh;
    const creatures = [mesh('leaps-dolphins'), mesh('leaps-flying-fish')];
    const splashes = mesh('leaps-splashes');
    const age = splashes.geometry.getAttribute('splashAge') as InstancedBufferAttribute;
    const camera = gameCamera();
    const m = new Matrix4();
    const p = new Vector3();
    const q = new Vector3();
    let t = 0;
    world.time.value = t;
    leaps.update(1 / 60, t, camera);
    let made = 0;
    const strays: string[] = [];
    for (let pod = 0; pod < 8; pod++) {
      expect(leaps.force(pod % 2 ? 'fish' : 'dolphin')).toBe(true);
      for (let frame = 0; frame < 60 * 6; frame++) {
        t += 1 / 60;
        world.time.value = t;
        leaps.update(1 / 60, t, camera);
        for (let i = 0; i < splashes.count; i++) {
          // A splash made this frame (its life is 1.4–1.7 s).
          if (age.getX(i) !== 0) continue;
          made++;
          splashes.getMatrixAt(i, m);
          p.setFromMatrixPosition(m);
          const surface = swell.heightAt(p.x, p.z, t);
          if (Math.abs(p.y - 0.04 - surface) > 1e-3) strays.push(`off the surface at ${p.x},${p.z}`);
          let near = false;
          for (const c of creatures)
            for (let k = 0; k < c.count && !near; k++) {
              c.getMatrixAt(k, m);
              q.setFromMatrixPosition(m);
              near = Math.hypot(q.x - p.x, q.z - p.z) < 1.5 && Math.abs(q.y - surface) < 1.2;
            }
          if (!near) strays.push(`no animal at ${p.x.toFixed(1)},${p.z.toFixed(1)}`);
        }
      }
    }
    expect(strays).toEqual([]);
    expect(made).toBeGreaterThan(16);
    leaps.dispose();
  });

  it('starts no leap while the sea is quiet (a battle), and none in a quiet stretch', () => {
    vi.stubGlobal('window', { innerWidth: 1280, innerHeight: 720 });
    const quiet = new QuietSea();
    const leaps = createLeaps({ tier: 'high', seed: 5, quiet });
    const camera = gameCamera();
    leaps.update(1 / 60, 0, camera);
    const release = quiet.add({ x: 0, z: 0, r: Infinity });
    expect(leaps.force('dolphin')).toBe(false);
    const drawn = () => leaps.group.children.reduce((n, c) => n + ((c as InstancedMesh).count ?? 0), 0);
    let t = 0;
    for (let frame = 0; frame < 60 * 200; frame++) {
      t += 1 / 60;
      world.time.value = t;
      leaps.update(1 / 60, t, camera);
      expect(drawn()).toBe(0);
    }
    release();
    // Everything ahead of the camera is quiet: still nothing.
    const ahead = quiet.add({ x: 0, z: -100, r: 200 });
    expect(leaps.force('dolphin')).toBe(false);
    ahead();
    expect(leaps.force('dolphin')).toBe(true);
    leaps.dispose();
  });
});
