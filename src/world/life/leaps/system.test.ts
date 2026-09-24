import { InstancedMesh, Matrix4, PerspectiveCamera, Vector3 } from 'three/webgpu';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { world } from '../../uniforms';
import { createLeaps, leapDive, leapHeight } from './system';

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
});
