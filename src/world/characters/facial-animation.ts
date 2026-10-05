import { Color, MathUtils, Mesh, Object3D, Vector3, type Bone } from 'three/webgpu';
import { BROW_BONES, JAW_BONE } from './face-rig';
import type { FaceColors, FaceFit } from './face-fit';
import { createFaceParams, faceGeometry, faceMaterial, type FaceParams } from './face-material';
import { planAccents } from './gestures';

export type MouthShape = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'X';
export type FaceExpression = 'neutral' | 'happy' | 'concerned' | 'surprised';

export interface MouthCue {
  readonly start: number;
  readonly end: number;
  readonly value: MouthShape;
}

export interface FacialLine {
  readonly duration: number;
  readonly mouthCues?: readonly MouthCue[];
  readonly expression?: FaceExpression;
  /** Word timings and text, so gestures can land on stressed words. */
  readonly words?: readonly { readonly word: string; readonly start: number; readonly end: number }[];
  readonly text?: string;
}

export interface BlinkState {
  readonly openness: number;
  readonly justStarted: boolean;
}

/**
 * Rhubarb's mouth shapes as [half-width, half-open (× the rig's mouth width), roundness, teeth,
 * tongue]: A presses the lips (P, B, M), B shows clenched teeth (K, S, T, EE), C is open (EH), D wide
 * (AA), E slightly rounded (AO, ER), F puckered (OO, W), G bites the lip (F, V), H lifts the tongue (L).
 */
const MOUTH_POSE: Record<MouthShape, readonly [number, number, number, number, number]> = {
  X: [0.9, 0, 0, 0, 0],
  A: [0.8, 0, 0, 0, 0],
  B: [0.86, 0.24, 0, 1, 0],
  C: [0.92, 0.38, 0, 0.7, 0.25],
  D: [0.98, 0.62, 0, 0.55, 0.45],
  E: [0.66, 0.4, 0.45, 0.25, 0.3],
  F: [0.55, 0.4, 1, 0, 0],
  G: [0.82, 0.2, 0, 1, 0],
  H: [0.88, 0.34, 0, 0.5, 0.85],
};

/** [smile, brow tilt (+ worried), lower-lid lift, upper-lid openness] per expression. */
/** Brows per expression: [raise (m), tilt (+ inner ends up, worried)]. */
const BROWS: Record<FaceExpression, readonly [number, number]> = {
  neutral: [0, 0],
  happy: [0.005, -0.08],
  concerned: [0.003, 0.32],
  surprised: [0.018, 0.06],
};

const EXPRESSION: Record<FaceExpression, readonly [number, number, number, number]> = {
  neutral: [0.3, 0, 0.1, 1],
  happy: [0.7, -0.1, 0.38, 0.94],
  concerned: [-0.28, 0.85, 0.12, 0.98],
  surprised: [0.05, 0.25, 0, 1.2],
};

const MOUTH_SET = new Set<MouthShape>(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'X']);
const TMP_SCALE = new Vector3();
const AXIS_Z = new Vector3(0, 0, 1);

export function isMouthShape(value: string): value is MouthShape {
  return MOUTH_SET.has(value as MouthShape);
}

/**
 * Unpacks a line from `lipsync.json`: `v` holds one Rhubarb shape per cue, `t` the first start and
 * then each cue's length, in centiseconds (cues are contiguous).
 */
export function unpackMouthCues(t: readonly number[], v: string): MouthCue[] {
  const cues: MouthCue[] = [];
  let at = t[0] ?? 0;
  for (let i = 0; i < v.length; i++) {
    const end = at + (t[i + 1] ?? 0);
    const value = v[i]!;
    if (isMouthShape(value)) cues.push({ start: at / 100, end: end / 100, value });
    at = end;
  }
  return cues;
}

export function mouthShapeAt(cues: readonly MouthCue[] | undefined, time: number): MouthShape {
  if (!cues?.length || time < 0) return 'X';
  let lo = 0;
  let hi = cues.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const cue = cues[mid]!;
    if (time < cue.start) hi = mid - 1;
    else if (time >= cue.end) lo = mid + 1;
    else return cue.value;
  }
  return 'X';
}

export class BlinkScheduler {
  private readonly state = { openness: 1, justStarted: false };
  private t = 0;
  private next = 0;
  private blinking = false;
  private blinkT = 0;
  private remaining = 0;

  constructor(private readonly random: () => number = Math.random) {
    this.schedule();
  }

  /** Blinks now (a head turn), unless a blink is already under way. */
  trigger(): void {
    if (!this.blinking) this.next = this.t;
  }

  update(dt: number): BlinkState {
    this.t += Math.max(0, dt);
    let justStarted = false;
    if (!this.blinking && this.t >= this.next) {
      this.blinking = true;
      this.blinkT = 0;
      this.remaining = this.random() < 0.18 ? 2 : 1;
      justStarted = true;
    }
    if (!this.blinking) return this.result(1, justStarted);

    this.blinkT += Math.max(0, dt);
    // The lid drops fast and lifts slower: shut by 35% of the blink, open again by the end.
    const cycle = 0.17;
    const phase = Math.min(1, Math.max(0, this.blinkT) / cycle);
    const openness = phase < 0.35 ? 1 - (phase / 0.35) ** 2 : 1 - (1 - (phase - 0.35) / 0.65) ** 2;
    if (phase >= 1) {
      this.remaining--;
      if (this.remaining > 0) this.blinkT = -0.07;
      else {
        this.blinking = false;
        this.schedule();
        return this.result(1, justStarted);
      }
    }
    return this.result(MathUtils.clamp(openness, 0, 1), justStarted);
  }

  /** Reuses one state object (this runs every frame for every face). */
  private result(openness: number, justStarted: boolean): BlinkState {
    this.state.openness = openness;
    this.state.justStarted = justStarted;
    return this.state;
  }

  private schedule(): void {
    this.next = this.t + 2 + this.random() * 4;
  }
}

export class StableSpring {
  value = 0;
  velocity = 0;

  constructor(
    private readonly frequency = 5.2,
    private readonly damping = 0.74,
  ) {}

  update(target: number, dt: number): number {
    const step = Math.min(0.05, Math.max(0, dt));
    const omega = Math.PI * 2 * this.frequency;
    const accel = (target - this.value) * omega * omega - 2 * this.damping * omega * this.velocity;
    this.velocity += accel * step;
    this.value += this.velocity * step;
    if (!Number.isFinite(this.value) || !Number.isFinite(this.velocity)) {
      this.value = target;
      this.velocity = 0;
    }
    return this.value;
  }
}

export class CharacterFace {
  private readonly mesh: Mesh;
  private readonly params: FaceParams;
  private readonly blink = new BlinkScheduler();
  private readonly springs: {
    readonly object: Object3D;
    readonly x: StableSpring;
    readonly z: StableSpring;
  }[] = [];
  private expression: FaceExpression = 'neutral';
  private mouthCues: readonly MouthCue[] = [];
  private speechStarted = 0;
  private speaking = false;
  private listening = false;
  private clock = Math.random() * 10;
  private dartAt = 0.45 + Math.random() * 1.4;
  private dartX = 0;
  private dartY = 0;
  private gazeX = 0;
  private gazeY = 0;
  private smile = EXPRESSION.neutral[0];
  private tilt = 0;
  private lower = EXPRESSION.neutral[2];
  private openBase = 1;
  private readonly mouthNow = [0.9, 0, 0, 0, 0];
  private readonly target = new Vector3();
  private readonly brows: { readonly bone: Bone; readonly rest: Vector3; readonly side: 1 | -1 }[] = [];
  private readonly jaw: { readonly bone: Bone; readonly rest: Vector3 } | null;
  private browRaise = 0;
  private browTilt = 0;
  private accents: readonly number[] = [];
  /** An idle one-brow raise now and then: which side, and seconds left. */
  private quirkAt = 4 + Math.random() * 5;
  private quirkT = 0;
  private quirkSide: 1 | -1 = 1;
  private readonly scalar: number;

  constructor(
    private readonly head: Bone,
    character: Object3D,
    private readonly body: string,
    private readonly fit: FaceFit,
    colors: FaceColors,
  ) {
    this.params = createFaceParams();
    const c = new Color(colors.skin);
    this.params.skin.set(c.r, c.g, c.b, 0);
    c.setHex(colors.iris);
    this.params.iris.set(c.r, c.g, c.b, 0);
    this.params.shape.set(fit.eyeRx, fit.eyeRy, fit.irisR, 0);
    this.params.mouth.set(fit.mouthW * 0.9, 0, 0, this.smile);

    this.mesh = new Mesh(faceGeometry(fit), faceMaterial());
    this.mesh.name = 'character-face';
    this.mesh.userData.face = this.params;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = true;
    // The rig's bones are in centimetres; the face is authored in metres at the character's own scale.
    head.updateWorldMatrix(true, false);
    const charScale = character.getWorldScale(TMP_SCALE).x;
    const scalar = charScale / Math.max(1e-6, head.getWorldScale(TMP_SCALE).x);
    this.mesh.scale.setScalar(scalar);
    this.scalar = scalar;
    head.add(this.mesh);
    const jaw = head.getObjectByName(JAW_BONE) as Bone | undefined;
    this.jaw = jaw ? { bone: jaw, rest: jaw.position.clone() } : null;
    BROW_BONES.forEach((name, i) => {
      const bone = head.getObjectByName(name) as Bone | undefined;
      if (bone) this.brows.push({ bone, rest: bone.position.clone(), side: i === 0 ? 1 : -1 });
    });
    this.collectSprings();
  }

  /** The face mesh; its userData carries the current Rhubarb shape and line time (probes). */
  get object(): Object3D {
    return this.mesh;
  }

  speak(line: FacialLine | null): void {
    this.speaking = !!line;
    if (line) this.listening = false;
    this.mouthCues = line?.mouthCues ?? [];
    this.expression = line?.expression ?? 'neutral';
    this.speechStarted = performance.now() / 1000;
    // The brows flash up just ahead of the stressed words the hands land on.
    this.accents = line?.words?.length
      ? planAccents(line.words, line.text ?? '', line.duration, 'open').map((a) => a.t - 0.06)
      : [];
  }

  /** Attentive while someone else talks: brows a touch up, a soft smile. */
  listen(on: boolean): void {
    this.listening = on;
  }

  setVisible(on: boolean): void {
    this.mesh.visible = on;
  }

  /** Starts a blink now: the eyes close as the head swings to something new. */
  blinkNow(): void {
    this.blink.trigger();
  }

  update(dt: number, lookTarget: Object3D | Vector3 | null): void {
    this.clock += dt;
    this.updateDarts(dt);
    this.updateGaze(lookTarget, dt);

    const [smile0, tilt, lower, open] = EXPRESSION[this.expression];
    const smile = smile0 + (this.listening ? 0.12 : 0);
    const ke = 1 - Math.exp(-dt * 6);
    this.smile += (smile - this.smile) * ke;
    this.tilt += (tilt - this.tilt) * ke;
    this.lower += (lower - this.lower) * ke;
    this.openBase += (open - this.openBase) * ke;

    const blink = this.blink.update(dt).openness;
    // The upper lid rides with the gaze: looking down drops it, looking up lifts it.
    const lidOpen = Math.max(0, (this.openBase + (this.gazeY / this.fit.eyeRy) * 0.45) * blink);
    const p = this.params;
    p.eye.set(this.gazeX, this.gazeY, lidOpen, this.lower + (1 - blink) * 0.25);
    p.iris.w = this.tilt;

    const time = this.speaking ? performance.now() / 1000 - this.speechStarted : -1;
    const shape = mouthShapeAt(this.mouthCues, time);
    this.mesh.userData.mouthShape = shape;
    this.mesh.userData.mouthTime = time;
    const pose = MOUTH_POSE[shape];
    const km = 1 - Math.exp(-dt * 26);
    const m = this.mouthNow;
    for (let i = 0; i < 5; i++) m[i] = m[i]! + (pose[i]! - m[i]!) * km;
    const w = this.fit.mouthW;
    const surprised = this.expression === 'surprised' && this.speaking ? 0.06 : 0;
    const gape = w * (m[1]! + surprised);
    p.mouth.set(w * m[0]!, gape, m[2]!, this.smile * (1 - m[2]!));
    // The jaw carries the chin (and any beard) down with the opening, and a touch back.
    if (this.jaw) {
      this.jaw.bone.position.copy(this.jaw.rest);
      this.jaw.bone.position.y -= gape * 1.1 * this.scalar;
      this.jaw.bone.position.z -= gape * 0.25 * this.scalar;
    }
    p.skin.w = m[3]!;
    p.shape.w = m[4]!;

    this.updateBrows(dt, time, blink);
    this.updateSprings(dt);
  }

  dispose(): void {
    this.mesh.removeFromParent();
  }

  private updateBrows(dt: number, time: number, blink: number): void {
    if (!this.brows.length) return;
    const [raise, tilt] = BROWS[this.expression];
    let flash = 0;
    for (const a of this.accents) {
      const u = (time - a) / 0.2;
      if (u > -3 && u < 3) flash = Math.max(flash, Math.exp(-u * u));
    }
    // Brows lift a little with an upward glance and dip as the lids close.
    const target =
      raise +
      (this.listening ? 0.004 : 0) +
      flash * 0.011 +
      (this.gazeY / this.fit.eyeRy) * 0.004 -
      (1 - blink) * 0.0025;
    const k = 1 - Math.exp(-dt * 14);
    this.browRaise += (target - this.browRaise) * k;
    this.browTilt += (tilt - this.browTilt) * (1 - Math.exp(-dt * 8));
    if (!this.speaking) {
      this.quirkAt -= dt;
      if (this.quirkAt <= 0) {
        this.quirkAt = 5 + Math.random() * 7;
        this.quirkT = 0.9;
        this.quirkSide = Math.random() < 0.5 ? 1 : -1;
      }
    }
    this.quirkT = Math.max(0, this.quirkT - dt);
    const quirk = Math.sin((this.quirkT / 0.9) * Math.PI) * 0.007;
    for (const b of this.brows) {
      const lift = this.browRaise + (b.side === this.quirkSide ? quirk : 0);
      b.bone.position.copy(b.rest);
      b.bone.position.y += lift * this.scalar;
      // Positive tilt lifts each brow's inner end (toward the nose).
      b.bone.quaternion.setFromAxisAngle(AXIS_Z, b.side * this.browTilt);
    }
  }

  private updateDarts(dt: number): void {
    this.dartAt -= dt;
    if (this.dartAt > 0) return;
    this.dartAt = 0.45 + Math.random() * 1.6;
    this.dartX = (Math.random() - 0.5) * this.fit.eyeRx * 0.28;
    this.dartY = (Math.random() - 0.5) * this.fit.eyeRy * 0.16;
  }

  /** The eyes lead: they turn toward the target (in the face's own metres) ahead of the head. */
  private updateGaze(lookTarget: Object3D | Vector3 | null, dt: number): void {
    let tx = this.dartX;
    let ty = this.dartY;
    if (lookTarget) {
      if (lookTarget instanceof Object3D) lookTarget.getWorldPosition(this.target);
      else this.target.copy(lookTarget);
      this.mesh.worldToLocal(this.target);
      const dz = Math.max(0.05, this.target.z - this.fit.eyeZ0);
      const yaw = Math.atan2(this.target.x, dz);
      const pitch = Math.atan2(this.target.y - this.fit.eyeY, Math.hypot(this.target.x, dz));
      tx += MathUtils.clamp(yaw / 0.7, -1, 1) * this.fit.eyeRx * 0.42;
      ty += MathUtils.clamp(pitch / 0.6, -1, 1) * this.fit.eyeRy * 0.3;
    }
    const k = 1 - Math.exp(-dt * 24);
    this.gazeX += (tx - this.gazeX) * k;
    this.gazeY += (ty - this.gazeY) * k;
  }

  private updateSprings(dt: number): void {
    if (!this.springs.length) return;
    const driveX = Math.sin(this.clock * 1.6) * 0.004;
    const driveZ = Math.sin(this.clock * 1.1 + 0.7) * 0.006;
    for (const spring of this.springs) {
      spring.object.rotation.x = MathUtils.clamp(spring.x.update(driveX, dt), -0.01, 0.01);
      spring.object.rotation.z = MathUtils.clamp(spring.z.update(driveZ, dt), -0.012, 0.012);
    }
  }

  private collectSprings(): void {
    if (this.body !== 'nell') return;
    for (const name of ['bicorne cockade']) {
      const object = this.head.getObjectByName(name);
      if (object)
        this.springs.push({ object, x: new StableSpring(3.8, 0.7), z: new StableSpring(4.5, 0.72) });
    }
  }
}
