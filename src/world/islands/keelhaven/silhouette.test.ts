import type { BufferGeometry, Group, Mesh } from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { KEELHAVEN } from './layout';
import { createKeelhavenSilhouette, KEELHAVEN_SILHOUETTE_SKY } from './silhouette';

function size(group: Group): { triangles: number; meshes: number } {
  let triangles = 0;
  let meshes = 0;
  group.traverse((o) => {
    const g = (o as Mesh).geometry as BufferGeometry | undefined;
    if (!g) return;
    meshes++;
    triangles += (g.getIndex()?.count ?? 0) / 3;
  });
  return { triangles, meshes };
}

describe('Keelhaven silhouette', () => {
  it('bakes the island’s own sky', () => {
    expect(KEELHAVEN_SILHOUETTE_SKY).toEqual(KEELHAVEN.sky);
  });

  it.each(['high', 'lite'] as const)(
    'is one small draw on %s',
    async (tier) => {
      const s = createKeelhavenSilhouette(tier, async () => {});
      expect(s.group.children).toHaveLength(0);
      await s.ready;
      const { triangles, meshes } = size(s.group);
      expect(meshes).toBe(1);
      expect(triangles).toBeLessThan(tier === 'lite' ? 20_000 : 45_000);
    },
    60_000,
  );
});
