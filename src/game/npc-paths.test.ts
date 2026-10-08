import { describe, expect, it } from 'vitest';
import { tierSettings } from '../engine/quality';
import type { HeightField } from '../world/contracts';
import { createVillage } from '../world/islands/anchorage/village';
import { COVE_NPCS } from './npcs';

const flat: HeightField = {
  heightAt: () => 3,
  normalAt: (_x, _z, out) => {
    out[0] = 0;
    out[1] = 1;
    out[2] = 0;
    return out;
  },
  masksAt: () => ({ sand: 0, grass: 1, rock: 0, cliff: 0 }),
};

/** An NPC's body radius plus a little air, so shoulders and props don't touch. */
const NPC_RADIUS = 0.34;

describe('NPC patrols', () => {
  it('never walk through a village prop or building', async () => {
    const village = await createVillage({ tier: tierSettings('high'), heightField: flat });
    const hits: string[] = [];
    for (const spec of COVE_NPCS) {
      const pts = spec.patrol;
      if (!pts) continue;
      pts.forEach((a, i) => {
        const b = pts[(i + 1) % pts.length]!;
        const steps = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.2);
        for (let k = 0; k <= steps; k += 1) {
          const x = a[0] + ((b[0] - a[0]) * k) / steps;
          const z = a[1] + ((b[1] - a[1]) * k) / steps;
          for (const c of village.colliders.circles)
            if (Math.hypot(x - c.x, z - c.z) < c.r + NPC_RADIUS)
              hits.push(`${spec.id} leg ${i} circle@${c.x},${c.z}`);
          for (const box of village.colliders.boxes) {
            const dx = x - box.x;
            const dz = z - box.z;
            const cs = Math.cos(box.rot);
            const sn = Math.sin(box.rot);
            if (
              Math.abs(dx * cs - dz * sn) < box.hx + NPC_RADIUS &&
              Math.abs(dx * sn + dz * cs) < box.hz + NPC_RADIUS
            )
              hits.push(`${spec.id} leg ${i} box@${box.x},${box.z}`);
          }
        }
      });
    }
    expect([...new Set(hits)]).toEqual([]);
    village.dispose();
  });
});
