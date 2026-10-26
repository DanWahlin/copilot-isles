import { describe, expect, it } from 'vitest';
import { Bone, Group, Vector3 } from 'three/webgpu';
import { ChainPoser, CurvePath, followPath } from './tentacle-pose';

/** A chain like the Quaternius tentacle's: 15 bones along +y, shorter toward the tip, under a scaled root. */
function makeChain(scale = 1.6) {
  const root = new Group();
  root.scale.setScalar(scale);
  const armature = new Group();
  armature.rotation.x = -Math.PI / 2;
  armature.scale.setScalar(100);
  root.add(armature);
  const holder = new Group();
  holder.rotation.x = Math.PI / 2;
  armature.add(holder);
  const bones: Bone[] = [];
  let parent: Group | Bone = holder;
  for (let i = 0; i < 15; i++) {
    const b = new Bone();
    b.position.set(0, i === 0 ? 0 : i === 1 ? 0.034 : 0.015 - i * 0.0004, 0);
    // A little twist and bend in the bind pose, as the model has.
    b.quaternion.setFromAxisAngle(new Vector3(1, 0.2, 0.1).normalize(), 0.05 * ((i % 3) - 1));
    parent.add(b);
    bones.push(b);
    parent = b;
  }
  const rest = bones.map((b) => b.quaternion.clone());
  const poser = new ChainPoser(bones, new Vector3(0, 0.009, 0));
  poser.measure(root);
  return { root, bones, rest, poser };
}

/** Root at the chain's base, then a helix round a horizontal axis (a hull's waist), moved by (ox, oy, oz) and a roll. */
function coil(path: CurvePath, base: Vector3, ox: number, oy: number, oz: number, roll: number): void {
  path.clear();
  path.push(base.x, base.y, base.z);
  path.push(base.x + 3, base.y + 2, base.z);
  const cy = 1 + oy;
  for (let k = 0; k <= 16; k++) {
    const a = -Math.PI * 0.5 + (k / 8) * Math.PI * 2 + roll;
    path.push(12 + ox + Math.cos(a) * 4.2, cy + Math.sin(a) * 3.4, oz + k * 0.3);
  }
  path.build();
}

function worldJoints(bones: readonly Bone[], root: Group): Vector3[] {
  root.updateWorldMatrix(true, true);
  return bones.map((b) => new Vector3().setFromMatrixPosition(b.matrixWorld));
}

describe('followPath', () => {
  it('puts every joint on the path at its bone length from the one before', () => {
    const path = new CurvePath();
    for (let k = 0; k <= 12; k++) path.push(Math.cos(k * 0.6) * 3, k * 0.4, Math.sin(k * 0.6) * 3);
    path.build();
    const lengths = new Float32Array(10).fill(1.1);
    const out = new Float32Array(33);
    followPath(path, lengths, out);
    for (let i = 0; i <= 10; i++)
      expect(path.distanceTo(out[i * 3]!, out[i * 3 + 1]!, out[i * 3 + 2]!)).toBeLessThan(1e-4);
    for (let i = 0; i < 10; i++) {
      const d = Math.hypot(
        out[i * 3 + 3]! - out[i * 3]!,
        out[i * 3 + 4]! - out[i * 3 + 1]!,
        out[i * 3 + 5]! - out[i * 3 + 2]!,
      );
      expect(d).toBeCloseTo(1.1, 4);
    }
  });

  it('runs on straight past the end of a short path', () => {
    const path = new CurvePath();
    path.push(0, 0, 0);
    path.push(0, 2, 0);
    path.build();
    const out = new Float32Array(15);
    followPath(path, [1, 1, 1, 1], out);
    expect(out[13]).toBeCloseTo(4, 4);
    expect(Number.isFinite(out[12]!)).toBe(true);
  });
});

describe('ChainPoser', () => {
  it('lays the bones on a coil within 2 cm', () => {
    const { root, bones, poser } = makeChain();
    const path = new CurvePath();
    coil(path, poser.base(new Vector3()), 0, 0, 0, 0);
    poser.pose(path, 1);
    for (const p of worldJoints(bones, root)) {
      expect(Number.isFinite(p.x + p.y + p.z)).toBe(true);
      expect(path.distanceTo(p.x, p.y, p.z)).toBeLessThan(0.02);
    }
  });

  it('stays on a moving, rocking coil for 1,000 frames (clip pose under it each frame)', () => {
    const { root, bones, rest, poser } = makeChain();
    const path = new CurvePath();
    const base = new Vector3();
    let worst = 0;
    for (let f = 0; f < 1000; f++) {
      // The mixer writes the clip's pose every frame before the pose runs.
      bones.forEach((b, i) => b.quaternion.copy(rest[i]!));
      const t = f / 60;
      coil(
        path,
        poser.base(base),
        Math.sin(t * 0.7) * 0.6,
        Math.sin(t * 1.3) * 0.8,
        Math.sin(t * 0.4),
        Math.sin(t) * 0.2,
      );
      poser.pose(path, 1);
      for (const p of worldJoints(bones, root)) {
        expect(Number.isFinite(p.x + p.y + p.z)).toBe(true);
        worst = Math.max(worst, path.distanceTo(p.x, p.y, p.z));
      }
    }
    expect(worst).toBeLessThan(0.02);
  });

  it('stays on the path when it poses from its own last pose (no clip), with no drift', () => {
    const { root, bones, poser } = makeChain(1.2);
    const path = new CurvePath();
    const base = new Vector3();
    let worst = 0;
    for (let f = 0; f < 1000; f++) {
      const t = f / 60;
      coil(path, poser.base(base), Math.sin(t) * 0.5, Math.cos(t * 0.8) * 0.5, 0, Math.sin(t * 0.5) * 0.3);
      poser.pose(path, 1);
      for (const b of bones) expect(Math.abs(b.quaternion.length() - 1)).toBeLessThan(1e-6);
      for (const p of worldJoints(bones, root)) worst = Math.max(worst, path.distanceTo(p.x, p.y, p.z));
    }
    expect(worst).toBeLessThan(0.02);
  });

  it('blends from the clip pose at weight 0 to the path at weight 1', () => {
    const { root, bones, rest, poser } = makeChain();
    const path = new CurvePath();
    coil(path, poser.base(new Vector3()), 0, 0, 0, 0);
    poser.pose(path, 0);
    bones.forEach((b, i) => expect(b.quaternion.angleTo(rest[i]!)).toBeLessThan(1e-6));
    poser.pose(path, 0.5);
    const half = worldJoints(bones, root);
    expect(half.every((p) => Number.isFinite(p.x + p.y + p.z))).toBe(true);
  });
});
