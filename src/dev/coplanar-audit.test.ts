import { describe, expect, it } from 'vitest';
import { BoxGeometry, DoubleSide, Group, Mesh, MeshBasicMaterial, PlaneGeometry } from 'three/webgpu';
import { auditCoplanar } from './coplanar-audit';

function plane(
  name: string,
  x: number,
  y: number,
  opts: { side?: typeof DoubleSide; transparent?: boolean } = {},
) {
  const m = new Mesh(new PlaneGeometry(2, 2), new MeshBasicMaterial(opts));
  m.name = name;
  m.rotation.x = -Math.PI / 2;
  m.position.set(x, y, 0);
  return m;
}

describe('auditCoplanar', () => {
  it('finds overlapping faces in the same plane', () => {
    const root = new Group();
    root.add(plane('deck', 0, 0), plane('rug', 0.5, 0));
    const { hits, meshes } = auditCoplanar(root);
    expect(meshes).toBe(2);
    expect(hits).toHaveLength(1);
    expect(hits[0]!.a).toContain('deck');
    expect(hits[0]!.b).toContain('rug');
    expect(hits[0]!.normal[1]).toBeCloseTo(1);
  });

  it('ignores lifted, edge-sharing, back-to-back and transparent faces', () => {
    const root = new Group();
    root.add(plane('deck', 0, 0), plane('lifted', 0.5, 0.01), plane('next', 2, 0));
    const under = plane('under', 0, 0);
    under.rotation.x = Math.PI / 2;
    root.add(under, plane('glass', 0.3, 0, { transparent: true }));
    expect(auditCoplanar(root).hits).toEqual([]);
  });

  it('counts double-sided faces from both sides', () => {
    const root = new Group();
    const back = plane('sail', 0, 0, { side: DoubleSide });
    back.rotation.x = Math.PI / 2;
    root.add(plane('deck', 0.5, 0), back);
    expect(auditCoplanar(root).hits).toHaveLength(1);
  });

  it('finds faces overlapping inside one merged mesh, and skips big meshes', () => {
    const root = new Group();
    const box = new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial());
    const twin = box.clone();
    twin.position.x = 0.4;
    root.add(box, twin);
    const { hits } = auditCoplanar(root);
    // Top, bottom, front and back faces of the two boxes overlap.
    expect(hits).toHaveLength(1);
    expect(hits[0]!.pairs).toBeGreaterThanOrEqual(4);
    expect(auditCoplanar(root, { maxTriangles: 4 }).skipped).toHaveLength(2);
  });
});
