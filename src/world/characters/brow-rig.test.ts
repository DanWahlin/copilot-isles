import { describe, expect, it } from 'vitest';
import {
  Bone,
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  MeshBasicMaterial,
  Skeleton,
  SkinnedMesh,
  Uint16BufferAttribute,
  Vector3,
} from 'three/webgpu';
import { BROW_BONES, rigBrows } from './brow-rig';

/** A head bone with three islands of hair-swatch quads: two brows and a fringe too big to be one. */
function rig(): { root: Group; mesh: SkinnedMesh; head: Bone } {
  const root = new Group();
  const head = new Bone();
  head.name = 'Head';
  root.add(head);
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const quad = (cx: number, cy: number, w: number, h: number) => {
    const b = pos.length / 3;
    for (const [x, y] of [
      [-w, -h],
      [w, -h],
      [w, h],
      [-w, h],
    ] as const) {
      pos.push(cx + x, cy + y, 0.22);
      uv.push(5.5 / 32, 9.5 / 32);
    }
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  };
  quad(0.14, 0.14, 0.05, 0.015);
  quad(-0.14, 0.14, 0.05, 0.015);
  quad(0, 0.3, 0.2, 0.1);
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  g.setAttribute('skinIndex', new Uint16BufferAttribute(new Array((pos.length / 3) * 4).fill(0), 4));
  g.setAttribute(
    'skinWeight',
    new Float32BufferAttribute(
      Array.from({ length: (pos.length / 3) * 4 }, (_, i) => (i % 4 ? 0 : 1)),
      4,
    ),
  );
  g.setIndex(idx);
  const mesh = new SkinnedMesh(g, new MeshBasicMaterial());
  root.add(mesh);
  root.updateMatrixWorld(true);
  mesh.bind(new Skeleton([head]));
  return { root, mesh, head };
}

describe('rigBrows', () => {
  it('moves each brow island onto its own bone and leaves the rest pose unchanged', () => {
    const { root, mesh, head } = rig();
    const before = Array.from({ length: 12 }, (_, i) => mesh.getVertexPosition(i, new Vector3()));
    expect(rigBrows(root)).toBe(1);
    for (const name of BROW_BONES) expect(head.getObjectByName(name)).toBeInstanceOf(Bone);
    const skin = mesh.geometry.getAttribute('skinIndex');
    expect(skin.getX(0)).toBe(1);
    expect(skin.getX(4)).toBe(2);
    expect(skin.getX(8)).toBe(0);
    root.updateMatrixWorld(true);
    mesh.skeleton.update();
    for (let i = 0; i < 12; i++)
      expect(mesh.getVertexPosition(i, new Vector3()).distanceTo(before[i]!)).toBeLessThan(1e-6);
    expect(rigBrows(root)).toBe(0);
  });
});
