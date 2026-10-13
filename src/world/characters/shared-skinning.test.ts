import {
  Bone,
  BufferAttribute,
  BufferGeometry,
  Group,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Raycaster,
  Skeleton,
  SkinnedMesh,
  Vector3,
} from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { mergeSkinnedParts, shareSkinning } from './shared-skinning';

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

  it('merges parts that each have their own skin over the same bones, offset (as a glTF loads them)', () => {
    const plain = rig(false, true);
    const merged = rig(false, true);
    mergeSkinnedParts(merged.group);
    expect(skinnedMeshes(merged.group)).toHaveLength(1);
    for (const r of [plain, merged]) {
      r.arm.rotation.set(-0.4, 0.5, 0.9);
      r.group.updateMatrixWorld(true);
    }
    const expected = skinnedVertices(plain.group);
    const actual = skinnedVertices(merged.group);
    expected.forEach((v, i) => expect(actual[i]!.distanceTo(v)).toBeLessThan(1e-5));
  });

  it('keeps parts with different materials apart', () => {
    const r = rig(true);
    mergeSkinnedParts(r.group);
    expect(skinnedMeshes(r.group)).toHaveLength(2);
  });
});

describe('shareSkinning', () => {
  it('ray-tests and reads vertices in the drawn pose, not the bind pose', () => {
    const plain = rig();
    const shared = rig();
    shareSkinning(shared.group);
    expect(skinnedMeshes(shared.group)).toHaveLength(0);
    for (const r of [plain, shared]) {
      r.arm.rotation.set(0.3, -0.8, 1.1);
      r.arm.position.x += 1;
      // Moved since it was shared and never drawn: its bind follows it all the same.
      r.group.position.set(5, 0.5, -3);
      r.group.updateMatrixWorld(true);
    }
    const expected = skinnedVertices(plain.group);
    const meshes: Mesh[] = [];
    shared.group.traverse((o) => {
      if (o instanceof Mesh) meshes.push(o);
    });
    const arm = meshes[1]!;
    const v = new Vector3();
    for (let i = 0; i < 3; i++) {
      arm.getVertexPosition(i, v).applyMatrix4(arm.matrixWorld);
      expect(v.distanceTo(expected[3 + i]!)).toBeLessThan(1e-5);
    }
    // A ray at the posed arm triangle's centre, along its normal, hits it there.
    const [a, b, c] = [expected[3]!, expected[4]!, expected[5]!];
    const centre = a.clone().add(b).add(c).divideScalar(3);
    const normal = b.clone().sub(a).cross(c.clone().sub(a)).normalize();
    const ray = new Raycaster(centre.clone().addScaledVector(normal, 2), normal.clone().negate());
    const hits = ray.intersectObject(arm);
    expect(hits).toHaveLength(1);
    expect(hits[0]!.point.distanceTo(centre)).toBeLessThan(1e-4);
    // Where the bind pose has it (what a plain Mesh would test), there's nothing.
    const bind = new Vector3();
    const position = arm.geometry.getAttribute('position');
    for (let i = 0; i < 3; i++) bind.add(v.fromBufferAttribute(position, i).applyMatrix4(arm.matrixWorld));
    bind.divideScalar(3);
    expect(bind.distanceTo(centre)).toBeGreaterThan(0.5);
    ray.set(bind.clone().add(new Vector3(0, 0, 2)), new Vector3(0, 0, -1));
    expect(ray.intersectObject(arm)).toHaveLength(0);
    // The fitted bounds don't stay behind for frustum culling to read.
    expect('boundingSphere' in arm).toBe(false);
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
function rig(twoMaterials = false, skeletonPerPart = false): { group: Group; arm: Bone } {
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
    if (!skeletonPerPart) return mesh.bind(skeleton);
    // Its own skin: the inverse binds carry where the part was modelled (a constant offset).
    const own = new Skeleton([rootBone, arm]);
    const at = new Matrix4().makeTranslation(0.05 * bone, -0.3, 0.2 * bone);
    for (const inverse of own.boneInverses) inverse.multiply(at);
    g.applyMatrix4(new Matrix4().copy(at).invert());
    mesh.bind(own, mesh.matrixWorld);
  };
  part(0, new Vector3(0, 0.1, 0), 1, material);
  part(1, new Vector3(0.2, 1.1, -0.1), 1.4, twoMaterials ? new MeshStandardMaterial() : material);
  return { group, arm };
}
