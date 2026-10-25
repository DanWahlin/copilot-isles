import { describe, expect, it } from 'vitest';
import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Vector3,
} from 'three/webgpu';
import {
  bakeInstances,
  markInstancesChanged,
  sharedInstancedMesh,
  SHARED_INSTANCE_CAPACITY,
} from './instancing';

/** The vertex buffers a mesh's draw takes: the geometry's (interleaved once) and its two matrix buffers. */
function vertexBuffers(mesh: InstancedMesh): number {
  const buffers = new Set<unknown>();
  for (const a of Object.values(mesh.geometry.attributes))
    buffers.add('isInterleavedBufferAttribute' in a && a.isInterleavedBufferAttribute ? a.data : a);
  return buffers.size + 2;
}

describe('sharedInstancedMesh', () => {
  it('leaves room for the matrices in a batch past the uniform buffer (more than 1,024 instances)', () => {
    for (const count of [16, SHARED_INSTANCE_CAPACITY + 500]) {
      const geometry = new BufferGeometry();
      for (const name of ['position', 'normal', 'uv', 'color', 'sway', 'part', 'branch'])
        geometry.setAttribute(name, new BufferAttribute(new Float32Array(9), 3));
      const mesh = sharedInstancedMesh(geometry, new MeshBasicMaterial(), count);
      expect(mesh.instanceMatrix.count).toBeGreaterThanOrEqual(SHARED_INSTANCE_CAPACITY);
      expect(vertexBuffers(mesh), String(count)).toBeLessThanOrEqual(8);
      geometry.dispose();
    }
  });
});

describe('bakeInstances', () => {
  it('bakes every instance in place, with its colour, keeping the triangles', () => {
    const material = new MeshStandardMaterial({ vertexColors: true });
    const a = new InstancedMesh(new BoxGeometry(1, 1, 1), material, 3);
    const b = new InstancedMesh(new BoxGeometry(2, 1, 1), material, 2);
    a.position.set(0, 10, 0);
    a.updateMatrix();
    for (let i = 0; i < 3; i++) {
      a.setMatrixAt(i, new Matrix4().makeTranslation(i * 5, 0, 0));
      a.setColorAt(i, new Color(1, 0, 0));
    }
    for (let i = 0; i < 2; i++) b.setMatrixAt(i, new Matrix4().makeTranslation(0, 0, i * 5));
    b.count = 1; // only the instances in use bake
    const baked = bakeInstances([a, b])!;
    expect(baked.index).toBeNull();
    expect(baked.getAttribute('position').count / 3).toBe(3 * 12 + 12);
    expect(Object.keys(baked.attributes).sort()).toEqual(['color', 'normal', 'position', 'uv']);
    const p = new Vector3();
    const box = { minX: Infinity, maxX: -Infinity, minY: Infinity };
    const pos = baked.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      p.fromBufferAttribute(pos, i);
      box.minX = Math.min(box.minX, p.x);
      box.maxX = Math.max(box.maxX, p.x);
      box.minY = Math.min(box.minY, p.y);
    }
    // The first mesh's three boxes sit at x 0, 5, 10 (and y 10, its own position); the second's at 0.
    expect(box.minX).toBeCloseTo(-1);
    expect(box.maxX).toBeCloseTo(10.5);
    expect(box.minY).toBeCloseTo(-0.5);
    const color = baked.getAttribute('color');
    expect([color.getX(0), color.getY(0), color.getZ(0)]).toEqual([1, 0, 0]);
    // The uncoloured mesh bakes white.
    expect([color.getX(pos.count - 1), color.getY(pos.count - 1)]).toEqual([1, 1]);
  });

  it('returns null with nothing to bake', () => {
    const mesh = new InstancedMesh(new BoxGeometry(), new MeshStandardMaterial(), 1);
    mesh.count = 0;
    expect(bakeInstances([mesh])).toBeNull();
  });
});

describe('markInstancesChanged', () => {
  it('reuses the matrix update range as instances move', () => {
    const geometry = new BufferGeometry();
    const material = new MeshBasicMaterial();
    const mesh = sharedInstancedMesh(geometry, material, 4, { count: 3 });

    markInstancesChanged(mesh);
    const range = mesh.instanceMatrix.updateRanges[0]!;
    expect(range).toEqual({ start: 0, count: 48 });

    const version = mesh.instanceMatrix.version;
    mesh.count = 2;
    markInstancesChanged(mesh);
    expect(mesh.instanceMatrix.updateRanges).toEqual([{ start: 0, count: 32 }]);
    expect(mesh.instanceMatrix.updateRanges[0]).toBe(range);
    expect(mesh.instanceMatrix.version).toBe(version + 1);

    geometry.dispose();
    material.dispose();
  });
});
