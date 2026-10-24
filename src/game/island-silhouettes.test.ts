import type { BufferGeometry, Group, Mesh } from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { footprintDistance, measureFootprint } from '../world/islands/footprint';
import { MERIDIAN, meridianHeight } from '../world/islands/meridian';
import { createMeridianSilhouette, MERIDIAN_SILHOUETTE_SKY } from '../world/islands/meridian-silhouette';
import { thousandBoughHeightDry } from '../world/islands/thousand-bough/height';
import { THOUSAND_BOUGH } from '../world/islands/thousand-bough/layout';
import {
  createThousandBoughSilhouette,
  THOUSAND_BOUGH_SILHOUETTE_SKY,
} from '../world/islands/thousand-bough/tree/silhouette';
import { ANCHORAGE_SILHOUETTE_SKY } from '../world/islands/anchorage/silhouette';
import { coveHeight } from '../world/terrain/cove-height';
import { ISLANDS } from './islands';

const MERIDIAN_FOOTPRINT = ISLANDS.meridian.footprint;
const THOUSAND_BOUGH_FOOTPRINT = ISLANDS['thousand-bough'].footprint;
const ANCHORAGE_FOOTPRINT = ISLANDS.anchorage.footprint;

const breathe = async () => {};

/** Bytes of a silhouette's geometry (its attributes and index), and its triangles. */
function size(group: Group): { bytes: number; triangles: number; meshes: number } {
  let bytes = 0;
  let triangles = 0;
  let meshes = 0;
  group.traverse((o) => {
    const g = (o as Mesh).geometry as BufferGeometry | undefined;
    if (!g) return;
    meshes++;
    for (const a of Object.values(g.attributes))
      bytes += (a.array as ArrayLike<number> & { byteLength: number }).byteLength;
    const index = g.getIndex();
    if (index) {
      bytes += (index.array as unknown as { byteLength: number }).byteLength;
      triangles += index.count / 3;
    }
  });
  return { bytes, triangles, meshes };
}

describe('island silhouettes', () => {
  it('bake the light of their island’s own sky', () => {
    expect(ANCHORAGE_SILHOUETTE_SKY).toEqual(ISLANDS.anchorage.sky);
    expect(MERIDIAN_SILHOUETTE_SKY).toEqual(ISLANDS.meridian.sky);
    expect(THOUSAND_BOUGH_SILHOUETTE_SKY).toEqual(ISLANDS['thousand-bough'].sky);
  });

  it.each(['high', 'lite'] as const)('are one small draw each on %s', async (tier) => {
    const islands = [createMeridianSilhouette(tier, breathe), createThousandBoughSilhouette(tier, breathe)];
    for (const s of islands) {
      // Built a few rows a breath: empty until it's ready.
      expect(s.group.children).toHaveLength(0);
      await s.ready;
      const { bytes, triangles, meshes } = size(s.group);
      expect(meshes).toBe(1);
      expect(bytes).toBeLessThan(1024 * 1024);
      expect(triangles).toBeLessThan(tier === 'lite' ? 14_000 : 26_000);
    }
  });
});

describe('island footprints', () => {
  it('match the islands’ ground', () => {
    const m = measureFootprint(meridianHeight, MERIDIAN.center.x, MERIDIAN.center.z);
    expect(m.radii).toEqual(MERIDIAN_FOOTPRINT.radii);
    const t = measureFootprint(thousandBoughHeightDry, THOUSAND_BOUGH.center.x, THOUSAND_BOUGH.center.z);
    expect(t.radii).toEqual(THOUSAND_BOUGH_FOOTPRINT.radii);
    const a = measureFootprint(coveHeight, ANCHORAGE_FOOTPRINT.x, ANCHORAGE_FOOTPRINT.z);
    expect(a.radii).toEqual(ANCHORAGE_FOOTPRINT.radii);
  });

  it('measure from the shore: equally far off it is the same distance on every side', () => {
    const f = MERIDIAN_FOOTPRINT;
    const mean = f.radii.reduce((a, b) => a + b) / f.radii.length;
    for (let k = 0; k < f.radii.length; k++) {
      const a = (k / f.radii.length) * Math.PI * 2;
      // 400 m straight out from its shore on each bearing.
      const r = f.radii[k]! + 400;
      const d = footprintDistance(f, f.x + Math.cos(a) * r, f.z + Math.sin(a) * r);
      // The outline's corners can be nearer than straight out, never farther.
      expect(d).toBeLessThanOrEqual(mean + 400 + 1e-6);
      expect(d).toBeGreaterThan(mean + 400 - 120);
    }
    // At its centre it's 0, and on its shore its mean radius.
    expect(footprintDistance(f, f.x, f.z)).toBe(0);
    expect(footprintDistance(f, f.x + f.radii[0]!, f.z)).toBeCloseTo(mean, 6);
    // Port Meridian's north-east ridge reaches ~500 m: its swap is ~200 m farther out there than south.
    const ne = footprintDistance(f, f.x + 900 * Math.cos(-0.5), f.z + 900 * Math.sin(-0.5));
    const s = footprintDistance(f, f.x, f.z + 900);
    expect(s - ne).toBeGreaterThan(150);
  });
});
