import { describe, expect, it } from 'vitest';
import { Bone, Group, Vector3 } from 'three/webgpu';
import { BRIGANTINE_MASTS } from '../ship/brigantine-rig';
import { Points, WRAP_SPOTS, hullCoil, mastCoil, standPath } from './arm-paths';
import { AxisAim, ChainPoser, CurveAim, CurvePath, followPath } from './tentacle-pose';

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

describe('suckers face what the arm grips', () => {
  /** A 15-bone chain along +y (the tentacle's lengths, ×2), its suckers on each bone's −z side. */
  const chain = () => {
    const root = new Group();
    const L = [3.4, 1.4, 1.4, 1.3, 1.3, 1.5, 1.5, 1.0, 1.0, 1.1, 1.1, 1.0, 1.0, 0.9, 0.9].map((l) => l * 2);
    const bones: Bone[] = [];
    let parent: Group | Bone = root;
    for (let i = 0; i < 15; i++) {
      const b = new Bone();
      b.position.set(0, i === 0 ? 0 : L[i - 1]!, 0);
      parent.add(b);
      bones.push(b);
      parent = b;
    }
    const poser = new ChainPoser(bones, new Vector3(0, L[14]!, 0));
    const s = new Float32Array(45);
    for (let i = 0; i < 15; i++) s[i * 3 + 2] = -1;
    poser.setSuckers(s);
    poser.measure(root);
    return { root, poser };
  };
  const sk = new Vector3();
  const to = new Vector3();
  const a = new Vector3();
  const b = new Vector3();

  it('round a hull coil, every bone on it turns its suckers to her centre line', () => {
    for (const loose of [0, 0.5, 1]) {
      const pts = new Points(64);
      hullCoil(pts, WRAP_SPOTS.stern.z0, WRAP_SPOTS.stern.z1, loose, 0.5);
      const path = new CurvePath(64, 4);
      for (let i = 0; i < pts.n; i++) path.push(pts.xyz[i * 3]!, pts.xyz[i * 3 + 1]!, pts.xyz[i * 3 + 2]!);
      path.build();
      const { root, poser } = chain();
      root.position.set(pts.xyz[0]!, pts.xyz[1]!, pts.xyz[2]!);
      root.updateMatrixWorld(true);
      const cy = 0.15 + 4 * loose;
      const aim = new AxisAim().set(0, cy, 0, 0, 0, 1);
      // Posed a few frames (the pose turns from the last one), as in play.
      for (let f = 0; f < 3; f++) poser.pose(path, 1, aim);
      root.updateMatrixWorld(true);
      for (let i = 1; i < 15; i++) {
        poser.bones[i]!.getWorldPosition(a);
        if (i + 1 < 15) poser.bones[i + 1]!.getWorldPosition(b);
        else b.copy(a);
        const mid = a.add(b).multiplyScalar(0.5);
        poser.suckerWorld(i, sk);
        to.set(-mid.x, cy - mid.y, 0).normalize();
        expect(sk.dot(to), `loose ${loose} bone ${i}`).toBeGreaterThan(0.5);
      }
    }
  });

  it('round the foremast too', () => {
    const pts = new Points(64);
    mastCoil(pts, 0.3, 0.5);
    // Up to the coil from below (its thick first half), then round the mast, as in play.
    const path = new CurvePath(64, 4);
    path.push(pts.xyz[0]! + 4, pts.xyz[1]! - 24, pts.xyz[2]!);
    for (let i = 0; i < pts.n; i++) path.push(pts.xyz[i * 3]!, pts.xyz[i * 3 + 1]!, pts.xyz[i * 3 + 2]!);
    path.build();
    const { root, poser } = chain();
    root.position.set(pts.xyz[0]! + 4, pts.xyz[1]! - 24, pts.xyz[2]!);
    root.updateMatrixWorld(true);
    const mz = BRIGANTINE_MASTS.fore.z;
    const aim = new AxisAim().set(0, 0, mz, 0, 1, 0);
    for (let f = 0; f < 3; f++) poser.pose(path, 1, aim);
    // The arm's thinner half: in play that's what coils the mast (its long first bones are under
    // the water, on the way there, and they're longer than the coil is wide).
    for (let i = 7; i < 14; i++) {
      poser.bones[i]!.getWorldPosition(a);
      poser.bones[i + 1]!.getWorldPosition(b);
      const mid = a.add(b).multiplyScalar(0.5);
      poser.suckerWorld(i, sk);
      to.set(-mid.x, 0, mz - mid.z).normalize();
      expect(sk.dot(to), `bone ${i}`).toBeGreaterThan(0.5);
    }
  });

  it('a free arm shows its suckers on the inside of its curve, its curled tip too', () => {
    for (const [phase, back] of [
      [0, 0],
      [1.3, 0.8],
      [2.6, 0],
      [4.4, 0.8],
    ] as const) {
      const { root, poser } = chain();
      root.position.set(12, -18, 0);
      root.updateMatrixWorld(true);
      const armLength = poser.lengths.reduce((x, y) => x + y, 0);
      const path = new CurvePath(24, 5);
      standPath(path, 12, -18, 0, -1, 0, 0, 0, 0, 14, armLength, phase, 0.9, -1, 0, 0.4, 0, back);
      path.build();
      const aim = new CurveAim().set(-1, 0);
      for (let f = 0; f < 3; f++) poser.pose(path, 1, aim);
      const side = new Vector3(0, 0, -1);
      let seen = 0;
      const J = poser.joints;
      for (let i = 1; i < 15; i++) {
        a.set(J[i * 3]!, J[i * 3 + 1]!, J[i * 3 + 2]!);
        if (a.y < 0.5) continue;
        b.set(J[(i + 1) * 3]!, J[(i + 1) * 3 + 1]!, J[(i + 1) * 3 + 2]!);
        const along = b.clone().sub(a).normalize();
        // The arm's plane is lean (−x) and up: its inside is along × across.
        const inside = along
          .clone()
          .cross(side.set(0, 0, -1))
          .normalize();
        poser.suckerWorld(i, sk);
        expect(sk.dot(inside), `phase ${phase} bone ${i}`).toBeGreaterThan(0.5);
        seen++;
      }
      expect(seen).toBeGreaterThan(3);
      // Its tip curls toward the suckers' side (the inside), not back over its back.
      const n = poser.joints;
      const k = 14;
      const bend = new Vector3(
        n[(k + 1) * 3]! - 2 * n[k * 3]! + n[(k - 1) * 3]!,
        n[(k + 1) * 3 + 1]! - 2 * n[k * 3 + 1]! + n[(k - 1) * 3 + 1]!,
        n[(k + 1) * 3 + 2]! - 2 * n[k * 3 + 2]! + n[(k - 1) * 3 + 2]!,
      );
      poser.suckerWorld(13, sk);
      if (bend.length() > 0.05) expect(sk.dot(bend.normalize())).toBeGreaterThan(0);
    }
  });
});
