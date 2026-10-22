import { describe, expect, it } from 'vitest';
import { Frustum, Matrix4, Mesh, MeshBasicNodeMaterial, PerspectiveCamera, Vector3 } from 'three/webgpu';
import { createPolarGrid, cullPolarSectors, type PolarSectors } from './polar-grid';
import { mulberry32 } from '../../util/math';

const OPTIONS = { dr0: 0.7, growth: 1.05, radius: 18000, segments: 192 };

function drawRangeFor(mesh: Mesh, camera: PerspectiveCamera): { start: number; count: number } {
  mesh.updateMatrixWorld();
  camera.updateMatrixWorld();
  const g = mesh.geometry;
  type Hook = (r: unknown, s: unknown, c: PerspectiveCamera, g: unknown) => void;
  (mesh.onBeforeRender as unknown as Hook)(null, null, camera, g);
  const range = { start: g.drawRange.start, count: g.drawRange.count };
  (mesh.onAfterRender as unknown as Hook)(null, null, camera, g);
  return range;
}

describe('polar grid sectors', () => {
  it('lays the disc out first, then the rest sector by sector twice, and draws the whole grid by default', () => {
    const g = createPolarGrid(OPTIONS);
    const s = g.userData.polarSectors as PolarSectors;
    const outer = s.segments * s.indicesPerSector;
    expect(s.innerRadius).toBeLessThanOrEqual(20);
    expect(g.drawRange.start).toBe(0);
    expect(g.drawRange.count).toBe(s.innerIndices + outer);
    expect(g.index!.count).toBe(s.innerIndices + 2 * outer);
    const idx = g.index!.array;
    for (let i = 0; i < outer; i++) expect(idx[s.innerIndices + outer + i]).toBe(idx[s.innerIndices + i]);
    // Every triangle of the old ring-by-ring grid is still there, once.
    const key = (t: number) => [idx[t]!, idx[t + 1]!, idx[t + 2]!].join(',');
    const tris = new Set<string>();
    for (let t = 0; t < g.drawRange.count; t += 3) tris.add(key(t));
    expect(tris.size).toBe(g.drawRange.count / 3);
  });

  it('keeps every triangle a camera can see, and leaves out about half the sea', () => {
    const g = createPolarGrid(OPTIONS);
    const s = g.userData.polarSectors as PolarSectors;
    const mesh = new Mesh(g, new MeshBasicNodeMaterial());
    const near = new Mesh(g, mesh.material);
    mesh.add(near);
    cullPolarSectors(
      mesh,
      near,
      () => 1,
      () => 1,
    );
    const pos = g.getAttribute('position');
    const idx = g.index!.array;
    const full = s.segments * s.indicesPerSector;
    const rnd = mulberry32(7);
    const frustum = new Frustum();
    const m = new Matrix4();
    const v = new Vector3();
    let drawn = 0;
    for (let k = 0; k < 40; k++) {
      const camera = new PerspectiveCamera(55, 16 / 9, 0.1, 25000);
      camera.position.set(rnd() * 400 - 200, 2 + rnd() * 40, rnd() * 400 - 200);
      mesh.position.set(camera.position.x, 0, camera.position.z);
      camera.rotation.set(-rnd() * 1.2, rnd() * Math.PI * 2, 0, 'YXZ');
      const disc = drawRangeFor(near, camera);
      expect(disc).toEqual({ start: 0, count: s.innerIndices });
      const r = drawRangeFor(mesh, camera);
      drawn += r.count / full;
      m.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      frustum.setFromProjectionMatrix(m);
      // The disc draws whole; every other triangle with a vertex in view is in the range (either copy).
      for (let t = s.innerIndices; t < s.innerIndices + full; t += 3) {
        let inView = false;
        for (let c = 0; c < 3 && !inView; c++) {
          v.fromBufferAttribute(pos, idx[t + c]!).add(mesh.position);
          inView = frustum.containsPoint(v);
        }
        if (!inView) continue;
        const inRange =
          (t >= r.start && t < r.start + r.count) || (t + full >= r.start && t + full < r.start + r.count);
        expect(inRange).toBe(true);
      }
    }
    expect(drawn / 40).toBeLessThan(0.65);
  });
});
