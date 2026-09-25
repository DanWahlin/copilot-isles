import { MathUtils, Quaternion, Vector3, type Bone, type Object3D } from 'three/webgpu';

/** How much of the leg's full length the solver will stretch to (straighter than this and it lets go). */
const MAX_REACH = 0.98;

/**
 * Rotation-only two-bone IK for a leg (thigh → knee → ankle). It never moves a bone, only turns the
 * upper and lower leg so the ankle reaches the target, bending the knee in the plane it already
 * bends in. Scratch vectors live on the instance, so a solve allocates nothing.
 */
export class LegIk {
  private readonly hip = new Vector3();
  private readonly knee = new Vector3();
  private readonly end = new Vector3();
  private readonly target = new Vector3();
  private readonly dir = new Vector3();
  private readonly pole = new Vector3();
  private readonly desiredKnee = new Vector3();
  private readonly turn = new Quaternion();
  private readonly originalUpper = new Quaternion();
  private readonly originalLower = new Quaternion();
  private readonly solvedUpper = new Quaternion();
  private readonly solvedLower = new Quaternion();
  private readonly parentWorld = new Quaternion();
  private readonly boneWorld = new Quaternion();

  /** Whether the ankle can reach `target` without over-straightening the leg. */
  reachable(root: Object3D, upperLeg: Bone, lowerLeg: Bone, end: Bone, target: Vector3): boolean {
    root.updateMatrixWorld(true);
    upperLeg.getWorldPosition(this.hip);
    lowerLeg.getWorldPosition(this.knee);
    end.getWorldPosition(this.end);
    return this.hip.distanceTo(target) <= this.reach();
  }

  /**
   * Turns the leg toward `target`, blended by `weight` (0 leaves the animated pose, 1 is fully
   * solved). `root` is the character, used for the knee direction when the leg is dead straight.
   */
  solve(root: Object3D, upperLeg: Bone, lowerLeg: Bone, end: Bone, target: Vector3, weight: number): void {
    root.updateMatrixWorld(true);
    upperLeg.getWorldPosition(this.hip);
    lowerLeg.getWorldPosition(this.knee);
    end.getWorldPosition(this.end);
    const thigh = this.hip.distanceTo(this.knee);
    const shin = this.knee.distanceTo(this.end);
    const reach = Math.max(0.01, (thigh + shin) * MAX_REACH);

    // Clamp the target to the reachable sphere round the hip.
    this.target.copy(target);
    this.dir.subVectors(this.target, this.hip);
    const dist = this.dir.length();
    if (dist > reach) this.target.copy(this.hip).addScaledVector(this.dir, reach / Math.max(0.001, dist));

    // Knee position from the law of cosines, in the plane of the current bend.
    const d = MathUtils.clamp(this.hip.distanceTo(this.target), 0.001, reach);
    this.dir.subVectors(this.target, this.hip).normalize();
    this.pole.subVectors(this.knee, this.hip);
    this.pole.addScaledVector(this.dir, -this.pole.dot(this.dir));
    if (this.pole.lengthSq() < 1e-6) this.pole.set(0, 0, 1).applyQuaternion(root.quaternion);
    this.pole.normalize();
    const cosHip = MathUtils.clamp((thigh * thigh + d * d - shin * shin) / (2 * thigh * d), -1, 1);
    const sinHip = Math.sqrt(Math.max(0, 1 - cosHip * cosHip));
    this.desiredKnee
      .copy(this.hip)
      .addScaledVector(this.dir, thigh * cosHip)
      .addScaledVector(this.pole, thigh * sinHip);

    this.originalUpper.copy(upperLeg.quaternion);
    this.originalLower.copy(lowerLeg.quaternion);
    this.rotateToward(upperLeg, this.knee.sub(this.hip), this.desiredKnee.sub(this.hip));
    upperLeg.updateMatrixWorld(true);
    lowerLeg.getWorldPosition(this.knee);
    end.getWorldPosition(this.end);
    this.rotateToward(lowerLeg, this.end.sub(this.knee), this.target.sub(this.knee));
    this.solvedUpper.copy(upperLeg.quaternion);
    this.solvedLower.copy(lowerLeg.quaternion);
    upperLeg.quaternion.slerpQuaternions(this.originalUpper, this.solvedUpper, weight);
    lowerLeg.quaternion.slerpQuaternions(this.originalLower, this.solvedLower, weight);
  }

  /** Leg length (from the positions sampled into `hip`, `knee`, and `end`) times the reach limit. */
  private reach(): number {
    return Math.max(0.01, (this.hip.distanceTo(this.knee) + this.knee.distanceTo(this.end)) * MAX_REACH);
  }

  /** Turns `bone` in world space so the direction `from` points along `to`. */
  private rotateToward(bone: Bone, from: Vector3, to: Vector3): void {
    if (from.lengthSq() < 1e-8 || to.lengthSq() < 1e-8) return;
    this.turn.setFromUnitVectors(from.normalize(), to.normalize());
    bone.getWorldQuaternion(this.boneWorld);
    this.boneWorld.premultiply(this.turn).normalize();
    if (bone.parent) bone.parent.getWorldQuaternion(this.parentWorld);
    else this.parentWorld.identity();
    bone.quaternion.copy(this.parentWorld.invert().multiply(this.boneWorld)).normalize();
  }
}
