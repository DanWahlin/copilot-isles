import { describe, expect, it } from 'vitest';
import { MeshStandardMaterial, type BufferGeometry, type Mesh } from 'three/webgpu';
import type { VillageKit } from '../village/kit';
import { COVE_BOTTLES, createBottles } from './bottles';

const kit = {
  materials: {
    metal: new MeshStandardMaterial(),
    cloth: new MeshStandardMaterial(),
    wood: new MeshStandardMaterial(),
  },
} as unknown as VillageKit;

const meshesOf = (site: ReturnType<typeof createBottles>) => site.group.children as Mesh[];
const positions = (g: BufferGeometry) => Array.from(g.getAttribute('position').array as Float32Array);

describe('message bottles', () => {
  it('picks a bottle up without a new geometry (no hitch mid-play)', () => {
    const site = createBottles({ kit, ground: () => 0 });
    const before = meshesOf(site).map((m) => ({ geometry: m.geometry, positions: positions(m.geometry) }));
    expect(before).toHaveLength(4);
    site.setCollected(COVE_BOTTLES[0]!.id, true);
    const after = meshesOf(site);
    expect(after.map((m) => m.geometry)).toEqual(before.map((b) => b.geometry));
    for (const [i, m] of after.entries()) {
      const now = positions(m.geometry);
      // The first bottle's vertices fold onto one point; the rest stay where they were.
      let changed = 0;
      for (let v = 0; v < now.length; v++) if (now[v] !== before[i]!.positions[v]) changed++;
      expect(changed).toBeGreaterThan(0);
      expect(changed).toBeLessThan(now.length / 2);
      expect(m.visible).toBe(true);
    }
    site.dispose();
  });

  it('hides each mesh once every bottle is read, and shows a bottle again as it was', () => {
    const site = createBottles({ kit, ground: () => 0, lite: true });
    expect(meshesOf(site)).toHaveLength(2);
    const fresh = meshesOf(site).map((m) => positions(m.geometry));
    for (const b of COVE_BOTTLES) site.setCollected(b.id, true);
    expect(meshesOf(site).every((m) => !m.visible)).toBe(true);
    for (const b of COVE_BOTTLES) site.setCollected(b.id, false);
    expect(meshesOf(site).every((m) => m.visible)).toBe(true);
    expect(meshesOf(site).map((m) => positions(m.geometry))).toEqual(fresh);
    site.dispose();
  });
});
