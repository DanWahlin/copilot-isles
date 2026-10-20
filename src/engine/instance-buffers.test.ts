import { afterEach, describe, expect, it } from 'vitest';
import {
  BoxGeometry,
  Color,
  InstancedBufferAttribute,
  InstancedInterleavedBuffer,
  InterleavedBufferAttribute,
  MeshBasicMaterial,
} from 'three/webgpu';
import {
  InstanceMatrices,
  releaseInstanceAttributes,
  releaseInstanceBuffers,
  trackInstanceBuffers,
  untrackInstanceBuffers,
} from './instance-buffers';
import { sharedInstancedMesh } from './instancing';

/** A renderer that records what's created and destroyed, like three's Info and backend. */
function fakeRenderer() {
  const live = new Set<object>();
  const destroyed: object[] = [];
  const renderer = {
    info: {
      createAttribute(a: object) {
        live.add(a);
      },
      destroyAttribute(a: object) {
        live.delete(a);
      },
    },
    backend: {
      destroyAttribute(a: object) {
        destroyed.push(a);
      },
    },
  };
  return { renderer, live, destroyed };
}

/** What three r186 uploads for an instanced mesh on the attribute path (Instance.js): four column views. */
function matrixViews(matrices: InstancedBufferAttribute): InterleavedBufferAttribute[] {
  const data = new InstancedInterleavedBuffer(matrices.array as Float32Array, 16, 1);
  return [0, 4, 8, 12].map((offset) => {
    const view = new InterleavedBufferAttribute(data, 4, offset);
    (view as unknown as { isInstancedBufferAttribute: boolean }).isInstancedBufferAttribute = true;
    return view;
  });
}

afterEach(() => untrackInstanceBuffers());

describe('releaseInstanceBuffers', () => {
  it("frees a disposed mesh's matrices, last frame's and colours, and nothing of its geometry", () => {
    const { renderer, live, destroyed } = fakeRenderer();
    trackInstanceBuffers(renderer);
    const geometry = new BoxGeometry();
    const material = new MeshBasicMaterial();
    const mesh = sharedInstancedMesh(geometry, material, 10);
    mesh.setColorAt(0, new Color(1, 0, 0));
    const other = sharedInstancedMesh(geometry, material, 10);
    expect(mesh.instanceMatrix).toBeInstanceOf(InstanceMatrices);

    // Upload as three does: the geometry's attributes, both meshes' matrices (two passes' views of
    // the same buffer), last frame's (a clone) and the colours (an attribute over their array).
    const shared = Object.values(geometry.attributes);
    const ours = [
      ...matrixViews(mesh.instanceMatrix),
      ...matrixViews(mesh.instanceMatrix),
      ...matrixViews(mesh.instanceMatrix.clone() as InstancedBufferAttribute),
      new InstancedBufferAttribute(mesh.instanceColor!.array, 3),
    ];
    const theirs = matrixViews(other.instanceMatrix);
    for (const a of [...shared, ...ours, ...theirs]) renderer.info.createAttribute(a);

    mesh.dispose();
    expect(new Set(destroyed)).toEqual(new Set(ours));
    for (const a of ours) expect(live.has(a)).toBe(false);
    for (const a of [...shared, ...theirs]) expect(live.has(a)).toBe(true);
    // Twice is harmless, and so is three freeing them again with the geometry (its first render
    // object's): the backend isn't asked twice.
    expect(releaseInstanceBuffers(mesh)).toBe(0);
    const before = destroyed.length;
    for (const a of ours) {
      renderer.backend.destroyAttribute(a);
      renderer.info.destroyAttribute(a);
    }
    expect(destroyed.length).toBe(before);
  });

  it("frees a material's per-instance attributes, and only theirs", () => {
    const { renderer, live, destroyed } = fakeRenderer();
    trackInstanceBuffers(renderer);
    const cards = new InstancedBufferAttribute(new Float32Array(8), 4);
    const kept = new InstancedBufferAttribute(new Float32Array(8), 4);
    renderer.info.createAttribute(cards);
    renderer.info.createAttribute(kept);
    expect(releaseInstanceAttributes([cards])).toBe(1);
    expect(destroyed).toEqual([cards]);
    expect(live.has(kept)).toBe(true);
  });

  it("doesn't free again what three already freed with a geometry", () => {
    const { renderer, destroyed } = fakeRenderer();
    trackInstanceBuffers(renderer);
    const mesh = sharedInstancedMesh(new BoxGeometry(), new MeshBasicMaterial(), 4);
    const views = matrixViews(mesh.instanceMatrix);
    for (const a of views) renderer.info.createAttribute(a);
    // three's own geometry dispose: the backend, then the info.
    renderer.backend.destroyAttribute(views[0]!);
    renderer.info.destroyAttribute(views[0]!);
    expect(releaseInstanceBuffers(mesh)).toBe(3);
    expect(destroyed.filter((a) => a === views[0])).toHaveLength(1);
  });

  it('does nothing without a tracked renderer', () => {
    const mesh = sharedInstancedMesh(new BoxGeometry(), new MeshBasicMaterial(), 4);
    expect(() => mesh.dispose()).not.toThrow();
    expect(releaseInstanceBuffers(mesh)).toBe(0);
  });

  it('keeps the matrices three draws: same array, usage and identity', () => {
    const mesh = sharedInstancedMesh(new BoxGeometry(), new MeshBasicMaterial(), 3);
    expect(mesh.instanceMatrix.count).toBe(mesh.instanceMatrix.array.length / 16);
    expect(Array.from(mesh.instanceMatrix.array.slice(0, 16))).toEqual([
      1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1,
    ]);
    const copy = mesh.instanceMatrix.clone();
    expect(copy.array).not.toBe(mesh.instanceMatrix.array);
    expect((mesh.instanceMatrix as InstanceMatrices).copies).toEqual([copy]);
  });
});
