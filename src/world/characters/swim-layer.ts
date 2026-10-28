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

  /** Where the stroke is in its cycle (0-1): the left arm's crawl phase. */
  get phase(): number {
    return this.swimTime / this.swimDuration;
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

/**
 * The front crawl's arms (game/swimming, issue 362), drawn procedurally over the clip: the UAL swim
 * clip moves both arms together, up and down. Each hand follows a loop around its own shoulder, in
 * the character's frame (x out from the body, y up, z forward, metres): it enters the water ahead
 * of the shoulder, glides, catches with the elbow high, pulls back under the chest, pushes past the
 * hip, then recovers over the water with the elbow bent and high. Phase 0 is the entry; the other
 * arm runs half a cycle behind. Eight keys, evenly spaced, timed as a heads-up (water-polo) crawl:
 * entry and catch 25 %, pull 25 %, push ~12 %, recovery ~38 % of the cycle. The captains' heads and
 * hats are wider than their shoulders (beard and brim 0.25-0.39 m out), so the loop runs wide of
 * them, measured by `swim.test.ts` against the skinned head, hat and trunk.
 */
// prettier-ignore
const CRAWL_HAND = [
  0.23, -0.13, 0.32, //  entry, at the surface ahead of the shoulder, wide of the head
  0.22, -0.22, 0.29, //  glide, the arm long
  0.08, -0.36, 0.12, //  catch, the hand drops under the elbow (and the beard)
  -0.04, -0.38, -0.05, // pull, under the chest
  0.08, -0.27, -0.24, // push, back past the hip
  0.13, -0.1, -0.3, //   exit, by the thigh
  0.28, 0.08, -0.04, //  recovery, elbow high, the hand swung up and out of the water
  0.28, 0.04, 0.23, //   reaching forward over the water to the entry
];
/** Where the elbow points, key by key (same frame): out and up through the pull, out (under the brim) in the recovery. */
// prettier-ignore
const CRAWL_POLE = [
  1, 0.4, -0.2,
  0.9, 0.5, 0,
  1, 0.6, 0,
  1, 0.4, 0,
  0.8, 0.3, -0.2,
  1, 0.4, -0.4,
  1, 0.2, -0.3,
  1, 0.2, -0.2,
];
const CRAWL_KEYS = CRAWL_HAND.length / 3;
/** Phase of the left arm's pull's deepest point, where the body has rolled furthest toward it. */
const ROLL_PEAK = 0.4;

/** A periodic uniform Catmull-Rom through `keys` (xyz per key) at `phase` (0-1). */
function loop(keys: readonly number[], phase: number, out: Vector3): Vector3 {
  const f = (((phase % 1) + 1) % 1) * CRAWL_KEYS;
  const i = Math.floor(f);
  const t = f - i;
  const t2 = t * t;
  const t3 = t2 * t;
  const w0 = 0.5 * (2 * t2 - t - t3);
  const w1 = 0.5 * (2 - 5 * t2 + 3 * t3);
  const w2 = 0.5 * (t + 4 * t2 - 3 * t3);
  const w3 = 0.5 * (t3 - t2);
  const a = ((i + CRAWL_KEYS - 1) % CRAWL_KEYS) * 3;
  const b = (i % CRAWL_KEYS) * 3;
  const c = ((i + 1) % CRAWL_KEYS) * 3;
  const d = ((i + 2) % CRAWL_KEYS) * 3;
  return out.set(
    keys[a]! * w0 + keys[b]! * w1 + keys[c]! * w2 + keys[d]! * w3,
    keys[a + 1]! * w0 + keys[b + 1]! * w1 + keys[c + 1]! * w2 + keys[d + 1]! * w3,
    keys[a + 2]! * w0 + keys[b + 2]! * w1 + keys[c + 2]! * w2 + keys[d + 2]! * w3,
  );
}

/** The hand's spot (the wrist) relative to its shoulder at `phase`, x out from the body (m). */
export function crawlHand(phase: number, out: Vector3): Vector3 {
  return loop(CRAWL_HAND, phase, out);
}

/** Where the elbow points at `phase` (unnormalised, x out from the body). */
export function crawlPole(phase: number, out: Vector3): Vector3 {
  return loop(CRAWL_POLE, phase, out);
}

/**
 * The shoulder blade's part (-1-1): `reach` forward through the entry and glide (back through the
 * push), and `lift` up through the recovery, so the short-armed captains reach past the head.
 */
export function crawlShoulder(phase: number): { reach: number; lift: number } {
  SHOULDER.reach = Math.cos((phase - 0.05) * Math.PI * 2);
  SHOULDER.lift = Math.max(0, Math.cos((phase - 0.92) * Math.PI * 2));
  return SHOULDER;
}
const SHOULDER = { reach: 0, lift: 0 };

/**
 * The body's roll toward the pulling arm, from the left arm's phase: -1 rolled fully onto the left
 * (its pull's deepest), +1 onto the right half a cycle later.
 */
export function crawlRoll(leftPhase: number): number {
  return -Math.sin((leftPhase - ROLL_PEAK + 0.25) * Math.PI * 2);
}

/** The arm (shoulder to wrist, m) the crawl's loop is drawn for; a longer arm's loop scales up. */
export const CRAWL_ARM = 0.39;

/** The crawl's phase where a hand goes into the water (its loop's first key). */
export const CRAWL_ENTRY = 0;
