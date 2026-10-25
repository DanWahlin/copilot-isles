import { describe, expect, it } from 'vitest';
import { BRIGANTINE_HALF_LENGTH, keelHeightAt } from '../../ship/lines';
import { WreckFrame } from '../../wreck/frame';
import { createWreck } from '../anchorage/wreck';
import { keelhavenHeight } from './height';
import { toFrame } from './layout';
import { createKeelhavenWrecksSteps, KEELHAVEN_WRECKS, OLD_HULK } from './wrecks';
import { BERTH, inWorks } from './works';

const p = { x: 0, y: 0, z: 0 };

/** The keel's lowest gap (m) over the ground along the part of her that's there. */
function keelGap(d: (typeof KEELHAVEN_WRECKS)[number]): { min: number; max: number } {
  const f = new WreckFrame(d.pose);
  let min = Infinity;
  let max = -Infinity;
  for (let z = -BRIGANTINE_HALF_LENGTH + 1; z <= BRIGANTINE_HALF_LENGTH - 1; z += 1) {
    if (d.broken && (d.broken.keep === 'bow' ? z < d.broken.at : z > d.broken.at)) continue;
    f.toWorld(0, keelHeightAt(z), z, p);
    const gap = p.y - keelhavenHeight(p.x, p.z);
    min = Math.min(min, gap);
    max = Math.max(max, gap);
  }
  return { min, max };
}

describe('Keelhaven wrecks', () => {
  it('lie on the reef outside the North Head, clear of the cove mouth and each other', () => {
    const f = { u: 0, v: 0 };
    for (const d of KEELHAVEN_WRECKS) {
      toFrame(d.pose.x, d.pose.z, f);
      expect(f.v, d.name).toBeLessThan(-140);
      expect(keelhavenHeight(d.pose.x, d.pose.z), d.name).toBeLessThan(0);
      expect(Math.hypot(f.u - BERTH.u, f.v - BERTH.v)).toBeGreaterThan(150);
    }
  });

  it('are bedded in the reef (none floating), the Old Hulk up on her blocks', () => {
    for (const d of KEELHAVEN_WRECKS) {
      const { max } = keelGap(d);
      // On her side the keel is up in the air: her low side lies on the reef instead.
      if (Math.abs(d.pose.heel) < 1) expect(Math.min(max, keelGap(d).min), d.name).toBeLessThan(0.6);
    }
    const { min, max } = keelGap(OLD_HULK);
    expect(min).toBeGreaterThan(0.2);
    expect(max).toBeLessThan(1.6);
    const f = { u: 0, v: 0 };
    toFrame(OLD_HULK.pose.x, OLD_HULK.pose.z, f);
    expect(inWorks(f.u, f.v)).toBe(true);
  });

  it('are one mesh in the ship’s look, a tier down on the reef', () => {
    const steps = createKeelhavenWrecksSteps('high');
    let r = steps.next();
    while (!r.done) r = steps.next();
    const w = r.value;
    expect(w.mesh.isMesh).toBe(true);
    expect(w.triangleCount).toBeGreaterThan(20_000);
    expect(w.triangleCount).toBeLessThan(150_000);
    expect(w.shipObstacles.length).toBeGreaterThan(10);
    expect(w.waterlines()).toHaveLength(KEELHAVEN_WRECKS.length);
    // The same look as Anchorage's wreck: one program for both.
    const anchorage = createWreck('high');
    expect(w.mesh.material.constructor).toBe(anchorage.mesh.material.constructor);
    w.dispose();
    anchorage.dispose();
  });
});
