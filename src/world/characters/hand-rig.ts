import { Bone, Quaternion, Vector3 } from 'three/webgpu';
import type { ArmPose, Side } from './gestures';

/**
 * One NPC hand on the Pirate Kit rig: the palm bones (Index1, Middle1, Thumb1) hang straight off the
 * forearm, with the finger joints beyond them, so the forearm rolls the palm, the palm bones bend the
 * wrist, and the joints curl the fingers. Axes are found once from the rest pose, in the forearm's
 * own space, and mirrored by side, so one authored pose reads the same on either hand.
 */
export class HandRig {
  private readonly palms: Bone[];
  private readonly index: Bone[];
  private readonly middle: Bone[];
  private readonly thumb: Bone[];
  /** Across the knuckles (index side), in forearm space. */
  private readonly lateral = new Vector3();
  /** Down the forearm toward the fingers, in forearm space. */
  private readonly along = new Vector3();

  private constructor(
    private readonly forearm: Bone,
    private readonly side: Side,
    chains: Record<'Index' | 'Middle' | 'Thumb', Bone[]>,
  ) {
    this.index = chains.Index.slice(1);
    this.middle = chains.Middle.slice(1);
    this.thumb = chains.Thumb.slice(1);
    this.palms = [chains.Index[0]!, chains.Middle[0]!, chains.Thumb[0]!];
    const knuckleI = chains.Index[1]!.getWorldPosition(new Vector3());
    const knuckleM = chains.Middle[1]!.getWorldPosition(new Vector3());
    const wrist = chains.Middle[0]!.getWorldPosition(new Vector3());
    const inv = forearm.getWorldQuaternion(new Quaternion()).invert();
    this.lateral.subVectors(knuckleI, knuckleM).applyQuaternion(inv).normalize();
    this.along.subVectors(knuckleM, wrist).applyQuaternion(inv).normalize();
  }

  /** Every bone the pose turns (restored to rest each frame by the character). */
  get bones(): readonly Bone[] {
    return [...this.palms, ...this.index, ...this.middle, ...this.thumb];
  }

  /** The hand under `forearm`, or null when it hasn't the full set of fingers (the captain's hook). */
  static of(forearm: Bone, side: Side): HandRig | null {
    const chains: Record<'Index' | 'Middle' | 'Thumb', Bone[]> = { Index: [], Middle: [], Thumb: [] };
    for (const child of forearm.children) {
      if (!(child instanceof Bone)) continue;
      const kind = (['Index', 'Middle', 'Thumb'] as const).find((k) => child.name.startsWith(k));
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

  /** Rolls the forearm, bends the wrist, and curls the fingers by the pose's offsets. */
  apply(pose: ArmPose): void {
    const s = this.side;
    if (Math.abs(pose.twist) > 1e-3) {
      this.forearm.getWorldQuaternion(Q);
      rotate(this.forearm, AX.copy(this.along).applyQuaternion(Q), TWIST * s * pose.twist);
    }
    // Bending about the knuckle line leaves that line where it is, so one axis serves every joint.
    this.forearm.getWorldQuaternion(Q);
    AX.copy(this.lateral).applyQuaternion(Q);
    if (Math.abs(pose.wrist) > 1e-3) for (const palm of this.palms) rotate(palm, AX, BEND * s * pose.wrist);
    this.curl(this.index, pose.index, 1);
    this.curl(this.middle, pose.curl, 1);
    this.curl(this.thumb, pose.thumb, 0.6);
  }

  private curl(chain: readonly Bone[], amount: number, gain: number): void {
    if (Math.abs(amount) < 1e-3) return;
    for (let i = 0; i < chain.length; i++)
      rotate(chain[i]!, AX, BEND * this.side * amount * gain * (i ? 0.85 : 1));
  }
}

/** Turns a bone about a world axis at its own pivot. */
function rotate(bone: Bone, axis: Vector3, angle: number): void {
  bone.parent!.getWorldQuaternion(PQ);
  DQ.setFromAxisAngle(axis, angle);
  LQ.copy(PQ).invert().multiply(DQ).multiply(PQ);
  bone.quaternion.premultiply(LQ);
}

/** Signs that make + roll the palm up, and + bend and curl toward the palm (from the rest pose). */
const TWIST = -1;
const BEND = -1;
const Q = new Quaternion();
const PQ = new Quaternion();
const DQ = new Quaternion();
const LQ = new Quaternion();
const AX = new Vector3();
