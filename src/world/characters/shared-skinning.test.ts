import {
  Bone,
  BufferAttribute,
  BufferGeometry,
  Group,
  MeshStandardMaterial,
  Skeleton,
  SkinnedMesh,
  Vector3,
} from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { mergeSkinnedParts } from './shared-skinning';

describe('mergeSkinnedParts', () => {
  it('merges a rig of parts into one skinned mesh that skins every vertex to the same place', () => {
    const plain = rig();
    const merged = rig();
    mergeSkinnedParts(merged.group);
    expect(skinnedMeshes(merged.group)).toHaveLength(1);
    for (const r of [plain, merged]) {
      r.arm.rotation.set(0.3, -0.8, 1.1);
      r.group.updateMatrixWorld(true);
    }
    const expected = skinnedVertices(plain.group);
    const actual = skinnedVertices(merged.group);
    expect(actual.length).toBe(expected.length);
    expected.forEach((v, i) => expect(actual[i]!.distanceTo(v)).toBeLessThan(1e-5));
  });

  it('keeps parts with different materials apart', () => {
    const r = rig(true);
    mergeSkinnedParts(r.group);
    expect(skinnedMeshes(r.group)).toHaveLength(2);
  });
});

function skinnedMeshes(root: Group): SkinnedMesh[] {
  const out: SkinnedMesh[] = [];
  root.traverse((o) => {
    if (o instanceof SkinnedMesh) out.push(o);
  });
  return out;
}

/** Every vertex in world space, skinned, in part order. */
function skinnedVertices(root: Group): Vector3[] {
  const out: Vector3[] = [];
  for (const mesh of skinnedMeshes(root)) {
    mesh.skeleton.update();
    const position = mesh.geometry.getAttribute('position');
    for (let i = 0; i < position.count; i++) {
      const v = new Vector3().fromBufferAttribute(position, i);
      out.push(mesh.applyBoneTransform(i, v).applyMatrix4(mesh.matrixWorld));
    }
  }
  return out;
}

/** Two parts (a body on the root bone, an arm on the arm bone), each with its own node offset and bind. */
function rig(twoMaterials = false): { group: Group; arm: Bone } {
  const group = new Group();
  group.scale.setScalar(0.8);
  const rootBone = new Bone();
  const arm = new Bone();
  arm.position.set(0.3, 1.2, 0);
  rootBone.add(arm);
  group.add(rootBone);
  group.updateMatrixWorld(true);
  const skeleton = new Skeleton([rootBone, arm]);
  const material = new MeshStandardMaterial();
  const part = (bone: number, offset: Vector3, scale: number, m: MeshStandardMaterial): void => {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array([0, 0, 0, 0.2, 0, 0, 0, 0.3, 0.1]), 3));
    g.setAttribute('normal', new BufferAttribute(new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]), 3));
    g.setAttribute(
      'skinIndex',
      new BufferAttribute(new Uint16Array([bone, 0, 0, 0, bone, 0, 0, 0, bone, 0, 0, 0]), 4),
    );
    g.setAttribute(
      'skinWeight',
      new BufferAttribute(new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]), 4),
    );
    const mesh = new SkinnedMesh(g, m);
    mesh.position.copy(offset);
    mesh.scale.setScalar(scale);
    group.add(mesh);
    mesh.updateMatrixWorld(true);
    mesh.bind(skeleton);
  };
  part(0, new Vector3(0, 0.1, 0), 1, material);
  part(1, new Vector3(0.2, 1.1, -0.1), 1.4, twoMaterials ? new MeshStandardMaterial() : material);
  return { group, arm };
}
