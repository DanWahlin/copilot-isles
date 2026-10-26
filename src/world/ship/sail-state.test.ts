import { describe, expect, it } from 'vitest';
import { MeshBasicNodeMaterial, type Mesh, type Object3D } from 'three/webgpu';
import { createBrigantine, SAIL_RATE, type Brigantine, type BrigantineEnv } from './brigantine';
import { cutShip } from '../kraken/ship-break';

const calm = {
  heightAt: () => 0,
  velocityAt: (_x: number, _z: number, _t: number, out: Float32Array | number[]) => {
    out[0] = 0;
    out[1] = 0;
    return out;
  },
};
const env: BrigantineEnv = { waves: calm, ground: null, obstacles: [], t: 0 };

/** Every mesh that draws her canvas (its draw callback is the sail state check). */
function sailMeshes(root: Object3D): Mesh[] {
  const out: Mesh[] = [];
  root.traverse((o) => {
    const m = o as Mesh;
    if (m.isMesh && /sails/.test(m.name)) out.push(m);
  });
  return out;
}

/** One frame drawn: each sail mesh's draw callback, as the renderer calls it. */
function draw(ship: Brigantine, meshes: readonly Mesh[] = sailMeshes(ship.group)): void {
  for (const m of meshes) (m.onAfterRender as () => void)();
}

describe('a ship never shows one sail state for a frame and then another', () => {
  it('draws the sails her helm has from her first frame', () => {
    const ship = createBrigantine({ tier: 'low', raider: true });
    // At rest from the start: furled, as her helm is.
    expect(ship.uniforms.trim.value).toBe(ship.dynamics.control.trim);
    draw(ship);
    // A raider under way is placed with her sails set before she's drawn.
    ship.dynamics.setInput({ trim: 0.9, rudder: 0 });
    ship.restartMotion(10, 20, 1);
    expect(ship.uniforms.trim.value).toBeCloseTo(0.9);
    draw(ship);
    expect(ship.sailJumps).toBe(0);
  });

  it("sets or hands the canvas at the crew's pace, never in one jump", () => {
    const ship = createBrigantine({ tier: 'low' });
    ship.dynamics.setInput({ trim: 0, rudder: 0 });
    ship.restartMotion(0, 0, 0);
    draw(ship);
    ship.dynamics.setInput({ trim: 1, rudder: 0 });
    let last = ship.uniforms.trim.value;
    for (let i = 0; i < 90; i++) {
      ship.update(1 / 60, i / 60, env);
      const now = ship.uniforms.trim.value;
      expect(now - last).toBeLessThanOrEqual(SAIL_RATE / 60 + 1e-6);
      last = now;
      draw(ship);
    }
    expect(last).toBeCloseTo(1);
    // A slow frame moves them further, as far as the crew could haul in that time.
    ship.dynamics.setInput({ trim: 0, rudder: 0 });
    ship.update(0.5, 2, env);
    draw(ship);
    expect(ship.sailJumps).toBe(0);
  });

  it('counts sails drawn in a state they could not reach since the last frame', () => {
    const ship = createBrigantine({ tier: 'low' });
    draw(ship);
    // The prototype's bug: drawn with one state, then another applied at once.
    ship.uniforms.trim.value = 1;
    draw(ship);
    expect(ship.sailJumps).toBe(1);
  });

  it('checks the broken pieces too: they keep the state the ship had', () => {
    const ship = createBrigantine({ tier: 'low', raider: true });
    ship.dynamics.setInput({ trim: 0.8, rudder: 0 });
    ship.restartMotion(0, 0, 0);
    draw(ship);
    const pieces = cutShip(ship.group, [2], new MeshBasicNodeMaterial());
    const drawn: Mesh[] = [];
    pieces.group.traverse((o) => {
      const m = o as Mesh;
      if (m.isMesh && m.onAfterRender === sailMeshes(ship.group)[0]!.onAfterRender) drawn.push(m);
    });
    // Both halves carry canvas, and their draws report to the same check.
    expect(drawn.length).toBe(2);
    draw(ship, drawn);
    expect(ship.sailJumps).toBe(0);
    ship.uniforms.trim.value = 0;
    draw(ship, drawn);
    expect(ship.sailJumps).toBe(1);
    pieces.dispose();
  });
});
