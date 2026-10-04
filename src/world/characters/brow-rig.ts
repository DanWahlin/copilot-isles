import { Bone, Matrix4, Skeleton, SkinnedMesh, Vector3, type Object3D } from 'three/webgpu';

/** The brow bones added under each NPC rig's Head (left is +x, the character's own left). */
export const BROW_BONES = ['BrowL', 'BrowR'] as const;

/** The hair swatch column in the Pirate Kit atlas; the brows are painted from it (32 px cells). */
const HAIR_COLUMN = 5;

/**
 * Gives a source rig movable brows (issue #186 follow-up). The Pirate Kit models carry each brow as
 * its own small island of hair-coloured faces, skinned wholly to the Head. This finds the two islands
 * above the eyes, adds a BrowL and a BrowR bone under the Head at their centres, and moves those
 * vertices onto the new bones. At rest each brow bone matches the Head exactly, so nothing changes
 * until the face moves them. Run once per source scene, before it's cloned (clones share geometry).
 */
export function rigBrows(scene: Object3D): number {
  scene.updateMatrixWorld(true);
  let rigged = 0;
  scene.traverse((object) => {
    if (object instanceof SkinnedMesh && rigMesh(object, scene)) rigged++;
  });
  return rigged;
}

function rigMesh(mesh: SkinnedMesh, root: Object3D): boolean {
  const skeleton = mesh.skeleton;
  const headIndex = skeleton.bones.findIndex((b) => b.name === 'Head');
  const head = skeleton.bones[headIndex];
  if (!head || head.getObjectByName(BROW_BONES[0])) return false;
  const g = mesh.geometry;
  const pos = g.getAttribute('position');
  const uv = g.getAttribute('uv');
  const skinIndex = g.getAttribute('skinIndex');
  const skinWeight = g.getAttribute('skinWeight');
  const index = g.getIndex();
  if (!pos || !uv || !skinIndex || !skinWeight || !index) return false;

  // Bind-pose vertex → Head space, then metres (the rig's bones are scaled).
  const toHead = new Matrix4().multiplyMatrices(skeleton.boneInverses[headIndex]!, mesh.bindMatrix);
  const metres = head.getWorldScale(new Vector3()).x / Math.max(1e-6, root.getWorldScale(new Vector3()).x);
  const n = pos.count;
  const local = new Float32Array(n * 3);
  const v = new Vector3();
  for (let i = 0; i < n; i++) {
    v.fromBufferAttribute(pos, i).applyMatrix4(toHead).multiplyScalar(metres);
    local.set([v.x, v.y, v.z], i * 3);
  }

  // Islands: weld split vertices by position, then join each triangle's corners.
  const rep = new Int32Array(n);
  const weld = new Map<string, number>();
  for (let i = 0; i < n; i++) {
    const key = `${pos.getX(i).toFixed(5)},${pos.getY(i).toFixed(5)},${pos.getZ(i).toFixed(5)}`;
    const first = weld.get(key);
    if (first === undefined) weld.set(key, i);
    rep[i] = first ?? i;
  }
  const parent = Int32Array.from({ length: n }, (_, i) => i);
  const find = (a: number): number => {
    while (parent[a] !== a) a = parent[a] = parent[parent[a]!]!;
    return a;
  };
  for (let t = 0; t < index.count; t += 3) {
    const a = find(rep[index.getX(t)]!);
    parent[find(rep[index.getX(t + 1)]!)] = a;
    parent[find(rep[index.getX(t + 2)]!)] = a;
  }
  const islands = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const root = find(rep[i]!);
    const list = islands.get(root);
    if (list) list.push(i);
    else islands.set(root, [i]);
  }

  const brows: [number[] | null, number[] | null] = [null, null];
  for (const list of islands.values()) {
    if (list.length > 300) continue;
    const u = uv.getX(list[0]!) * 32;
    if (u < HAIR_COLUMN || u >= HAIR_COLUMN + 1) continue;
    if (!list.every((i) => skinIndex.getX(i) === headIndex && skinWeight.getX(i) > 0.99)) continue;
    const c = centre(local, list);
    const [lo, hi] = bounds(local, list);
    if (Math.abs(c.x) < 0.08 || Math.abs(c.x) > 0.24 || c.y < 0.11 || c.y > 0.19 || c.z < 0.15) continue;
    if (hi.y - lo.y > 0.09) continue;
    const side = c.x > 0 ? 0 : 1;
    if (!brows[side] || brows[side]!.length < list.length) brows[side] = list;
  }
  if (!brows[0] || !brows[1]) return false;

  const bones = [...skeleton.bones];
  const inverses = skeleton.boneInverses.map((m) => m.clone());
  brows.forEach((list, side) => {
    const bone = new Bone();
    bone.name = BROW_BONES[side]!;
    bone.position.copy(centre(local, list!)).divideScalar(metres);
    head.add(bone);
    bone.updateMatrix();
    // At rest the brow's skinning matrix equals the Head's: inverse(local) · inverse(Head bind).
    inverses.push(bone.matrix.clone().invert().multiply(skeleton.boneInverses[headIndex]!));
    bones.push(bone);
    for (const i of list!) skinIndex.setX(i, bones.length - 1);
  });
  skinIndex.needsUpdate = true;
  mesh.bind(new Skeleton(bones, inverses), mesh.bindMatrix);
  head.updateMatrixWorld(true);
  return true;
}

function centre(local: Float32Array, list: readonly number[]): Vector3 {
  const c = new Vector3();
  for (const i of list) {
    c.x += local[i * 3]!;
    c.y += local[i * 3 + 1]!;
    c.z += local[i * 3 + 2]!;
  }
  return c.divideScalar(list.length);
}

function bounds(local: Float32Array, list: readonly number[]): [Vector3, Vector3] {
  const lo = new Vector3(Infinity, Infinity, Infinity);
  const hi = new Vector3(-Infinity, -Infinity, -Infinity);
  for (const i of list) {
    const p = new Vector3(local[i * 3]!, local[i * 3 + 1]!, local[i * 3 + 2]!);
    lo.min(p);
    hi.max(p);
  }
  return [lo, hi];
}
