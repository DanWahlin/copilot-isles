import { Bone, Quaternion, Vector3 } from 'three/webgpu';
import type { ArmPose, Side } from './gestures';

/**
 * One NPC hand on the Pirate Kit rig: the palm bones (Index1, Middle1, Thumb1) hang straight off the
 * forearm, with the finger joints beyond them, so the forearm rolls the palm, the palm bones bend the
 * wrist, and the joints curl the fingers. One authored pose reads the same on either hand.
 *
 * Every turn is about the knuckle line (or, for the roll, the forearm's length). Bending about the
 * knuckle line leaves that line where it is, so each bone's axis, expressed in its parent's own
 * frame, is fixed: it's found once from the rest pose, and posing is one quaternion multiply per bone
 * with no world-matrix work. The hand is put back to rest before the next pose only if it moved.
 */
export class HandRig {
  private readonly joints: {
    bone: Bone;
    axis: Vector3;
    rest: Quaternion;
    kind: 0 | 1 | 2 | 3;
    gain: number;
  }[] = [];
  /** Down the forearm toward the fingers, in forearm space (the palm-up roll). */
  private readonly along = new Vector3();
  private posed = false;
  /** Closes the fingers round a carried prop (0 open, 1 holding); gestures can't open them past it. */
  grip = 0;

  private constructor(
    private readonly forearm: Bone,
    private readonly side: Side,
    chains: Record<'Index' | 'Middle' | 'Thumb' | 'Pinky', Bone[]>,
  ) {
    forearm.updateWorldMatrix(true, true);
    const knuckleI = chains.Index[1]!.getWorldPosition(new Vector3());
    const knuckleM = chains.Middle[1]!.getWorldPosition(new Vector3());
    const wrist = chains.Middle[0]!.getWorldPosition(new Vector3());
    const forearmQ = forearm.getWorldQuaternion(new Quaternion());
    const inv = forearmQ.clone().invert();
    const lateralWorld = new Vector3().subVectors(knuckleI, knuckleM).normalize();
    this.along.subVectors(knuckleM, wrist).applyQuaternion(inv).normalize();
    const add = (bone: Bone, kind: 0 | 1 | 2 | 3) => {
      const parentQ = bone.parent!.getWorldQuaternion(new Quaternion()).invert();
      this.joints.push({
        bone,
        axis: lateralWorld.clone().applyQuaternion(parentQ).normalize(),
        rest: bone.quaternion.clone(),
        kind,
        // The first joint of each finger takes the full curl, the outer ones a little less.
        gain: kind !== 0 && bone.parent !== forearm && bone.parent!.parent !== forearm ? 0.85 : 1,
      });
    };
    // kind: 0 palm (wrist bend), 1 index, 2 middle (the little finger curls with it), 3 thumb.
    for (const palm of [chains.Index[0]!, chains.Middle[0]!, chains.Thumb[0]!, ...chains.Pinky.slice(0, 1)])
      add(palm, 0);
    for (const b of chains.Index.slice(1)) add(b, 1);
    for (const b of [...chains.Middle.slice(1), ...chains.Pinky.slice(1)]) add(b, 2);
    for (const b of chains.Thumb.slice(1)) add(b, 3);
  }

  /** The hand under `forearm`, or null when it hasn't the full set of fingers (the captain's hook). */
  static of(forearm: Bone, side: Side): HandRig | null {
    const chains: Record<'Index' | 'Middle' | 'Thumb' | 'Pinky', Bone[]> = {
      Index: [],
      Middle: [],
      Thumb: [],
      Pinky: [],
    };
    for (const child of forearm.children) {
      if (!(child instanceof Bone)) continue;
      const kind = (['Index', 'Middle', 'Thumb', 'Pinky'] as const).find((k) => child.name.startsWith(k));
      if (!kind) continue;
      let b: Bone | undefined = child;
      while (b && !b.name.endsWith('_end')) {
        chains[kind].push(b);
        b = b.children.find((c): c is Bone => c instanceof Bone);
      }
    }
    if (chains.Index.length < 3 || chains.Middle.length < 3 || chains.Thumb.length < 2) return null;
    return new HandRig(forearm, side, chains);
  }

  /** Puts the hand back to rest if the last pose moved it (call before the next pose). */
  restore(): void {
    if (!this.posed) return;
    this.posed = false;
    for (const j of this.joints) j.bone.quaternion.copy(j.rest);
  }

  /** Rolls the forearm, bends the wrist, and curls the fingers by the pose's offsets. */
  apply(pose: ArmPose): void {
    const s = this.side;
    if (Math.abs(pose.twist) > 1e-3) {
      // About the forearm's own length: a turn in its own frame.
      this.forearm.quaternion.multiply(DQ.setFromAxisAngle(this.along, TWIST * s * pose.twist));
    }
    const amounts = AMOUNTS;
    const g = this.grip;
    amounts[0] = pose.wrist;
    amounts[1] = Math.max(pose.index, g * 1.0);
    amounts[2] = Math.max(pose.curl, g * 1.15);
    amounts[3] = Math.max(pose.thumb, g * 0.8) * 0.6;
    for (const j of this.joints) {
      const amount = amounts[j.kind]!;
      if (Math.abs(amount) < 1e-3) continue;
      j.bone.quaternion.premultiply(DQ.setFromAxisAngle(j.axis, BEND * s * amount * j.gain));
      this.posed = true;
    }
  }
}

/** Signs that make + roll the palm up, and + bend and curl toward the palm (from the rest pose). */
const TWIST = -1;
const BEND = -1;
const DQ = new Quaternion();
const AMOUNTS = [0, 0, 0, 0];
