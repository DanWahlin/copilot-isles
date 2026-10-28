import {
  Quaternion,
  Vector3,
  type AnimationClip,
  type Group,
  type Interpolant,
  type Object3D,
} from 'three/webgpu';

interface LayerTrack {
  readonly target: Object3D;
  readonly position: boolean;
  readonly tread: Interpolant | null;
  readonly swim: Interpolant | null;
}

const QA = new Quaternion();
const QB = new Quaternion();
const VA = new Vector3();
const VB = new Vector3();

/**
 * Treading water and the swim stroke (the locomotion pack's `tread` and `swim`), laid over the pose
 * the mixer gave: each bone the clips move turns toward their blend (the stroke's share of it set by
 * `stroke`) by how far the body floats. Not through the mixer: three skips writing a bone whose mixed
 * value hasn't changed since the last frame, and the procedural layer puts the bones back to rest
 * every frame, so a clip's constant track (the kit Walk's held abdomen) only shows once its value
 * starts to move. Blended in through the mixer, the slightest tread weight did that, and the walk's
 * held abdomen jumped in (the head moved 9 cm in a frame).
 */
export class SwimLayer {
  private readonly tracks: LayerTrack[] = [];
  private treadTime = 0;
  private swimTime = 0;
  readonly treadDuration: number;
  readonly swimDuration: number;

  /** The layer for a rig with both clips; null without them (NPCs, a missing pack). */
  static of(group: Group, clips: ReadonlyMap<string, AnimationClip>): SwimLayer | null {
    const tread = clips.get('tread');
    const swim = clips.get('swim');
    return tread && swim ? new SwimLayer(group, tread, swim) : null;
  }

  private constructor(group: Group, tread: AnimationClip, swim: AnimationClip) {
    this.treadDuration = Math.max(0.001, tread.duration);
    this.swimDuration = Math.max(0.001, swim.duration);
    const names = new Set([...tread.tracks, ...swim.tracks].map((t) => t.name));
    for (const name of names) {
      const dot = name.lastIndexOf('.');
      const property = name.slice(dot + 1);
      const target = group.getObjectByName(name.slice(0, dot));
      if (!target || (property !== 'quaternion' && property !== 'position')) continue;
      const of = (clip: AnimationClip) =>
        clip.tracks.find((t) => t.name === name)?.InterpolantFactoryMethodLinear() ?? null;
      this.tracks.push({ target, position: property === 'position', tread: of(tread), swim: of(swim) });
    }
  }

  /** Moves both clips on: treading at its own pace, the stroke at `swimRate` × its own. */
  advance(dt: number, swimRate: number): void {
    this.treadTime = (this.treadTime + dt) % this.treadDuration;
    this.swimTime = (this.swimTime + dt * swimRate) % this.swimDuration;
  }

  /** Turns the bones toward the swim pose by `afloat`, `stroke` of it the stroke (0 treading water). */
  apply(afloat: number, stroke: number): void {
    if (afloat <= 0) return;
    for (const t of this.tracks) {
      const a = t.tread?.evaluate(this.treadTime) ?? null;
      const b = t.swim?.evaluate(this.swimTime) ?? null;
      if (t.position) {
        if (a) VA.fromArray(a);
        if (b) VB.fromArray(b);
        if (a && b) VA.lerp(VB, stroke);
        else if (b) VA.copy(VB);
        else if (!a) continue;
        t.target.position.lerp(VA, afloat);
      } else {
        if (a) QA.fromArray(a);
        if (b) QB.fromArray(b);
        if (a && b) QA.slerp(QB, stroke);
        else if (b) QA.copy(QB);
        else if (!a) continue;
        t.target.quaternion.slerp(QA, afloat);
      }
    }
  }
}
