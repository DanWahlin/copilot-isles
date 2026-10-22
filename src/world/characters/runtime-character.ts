import { unreflected } from '../reflection';
import { floraFeet } from '../flora/feet';
import { CharacterLod, attachCharacterLod } from './character-lod';
import {
  AnimationAction,
  AnimationClip,
  AnimationMixer,
  Bone,
  Frustum,
  LoopRepeat,
  MathUtils,
  Matrix4,
  Mesh,
  Object3D,
  Quaternion,
  Sphere,
  Vector3,
  type EventDispatcher,
  type PerspectiveCamera,
  type Group,
  type Material,
} from 'three/webgpu';
import { smoothstep, wrapAngle } from '../../util/math';
import { CharacterFace, type FacialLine } from './facial-animation';
import { FACE_FITS, faceColors, faceFamily } from './face-fit';
import { GesturePlanner, newPose, type ArmPose, type GestureFrame, type Side } from './gestures';
import { HandRig } from './hand-rig';
import { STAGE_REST, type StageLight } from './stage-light';
import { LegIk } from './leg-ik';
import { contactsOf, inContact, type FootContactMap } from './loco-pack';
import {
  CHARACTER_CLIPS,
  PLAYER_BODIES,
  type BodyConfig,
  type Character,
  type CharacterBody,
  type CharacterClip,
  type CharacterCreateOptions,
  type CharacterGroundMode,
  type CharacterGrounding,
  type HandGrip,
  type LookTarget,
  type PlayerBody,
} from './types';

/** The head's spring steps at most this long (s), and catches up on at most `LOOK_CATCH_UP` of missed time. */
const LOOK_STEP = 0.05;
const LOOK_CATCH_UP = 1;
/** A character's bounds for the view test: a sphere this wide (m) round its middle, props and gestures in. */
const OFFSCREEN_RADIUS = 2.5;
const OFFSCREEN_SPHERE = new Sphere();
/** Within this of the camera (m) an NPC always animates where movers cast sun shadows (the movers' map is 40 m round the focus). */
const MOVER_SHADOW_SQ = 75 * 75;
const VIEW_FRUSTUM = new Frustum();
const VIEW_MATRIX = new Matrix4();
const VIEW_SEEN = new Float64Array(32).fill(Number.NaN);

/** The camera's frustum as it is now (refreshed when its matrices change; NPCs test against it each frame). */
function viewFrustum(camera: PerspectiveCamera): Frustum {
  camera.updateMatrixWorld();
  const w = camera.matrixWorldInverse.elements;
  const p = camera.projectionMatrix.elements;
  let same = true;
  for (let i = 0; i < 16; i++) {
    if (VIEW_SEEN[i] !== w[i] || VIEW_SEEN[16 + i] !== p[i]) same = false;
    VIEW_SEEN[i] = w[i]!;
    VIEW_SEEN[16 + i] = p[i]!;
  }
  if (!same) {
    VIEW_MATRIX.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    VIEW_FRUSTUM.setFromProjectionMatrix(VIEW_MATRIX, camera.coordinateSystem, camera.reversedDepth);
  }
  return VIEW_FRUSTUM;
}

const WALK_STRIDE_METERS = 1.15;
const JOG_STRIDE_METERS = 1.62;
const RUN_STRIDE_METERS = 2.12;
const WALK_SPEED = 1.35;
const JOG_SPEED = 2.35;
const RUN_SPEED = 4.15;
/** The wrist stops this far short of the grip, so the hand, not the wrist, closes on it (m). */
const GRIP_HAND = 0.06;
/** Elbows drop down, out and a touch back when both hands hold something in front. */
const GRIP_POLE = new Vector3(0.55, -1, -0.35).normalize();
/** How far each finger joint folds round a grip, knuckle to tip (rad). */
const FINGER_CURL = [0.55, 0.95, 0.75] as const;
const LOCOMOTION_CLIPS = new Set<CharacterClip>([
  'idle',
  'walk',
  'jog',
  'run',
  'jumpStart',
  'jumpLoop',
  'jumpLand',
  'wade',
]);

interface PlantState {
  active: boolean;
  blend: number;
  x: number;
  y: number;
  z: number;
}

interface BoneRest {
  readonly bone: Bone;
  readonly position: Vector3;
  readonly quaternion: Quaternion;
}

/**
 * One animated character: an AnimationMixer blending idle, walk, jog, run, jump, and wade by speed
 * and grounding, plus a cheap procedural layer on top (lean and bank, hip sway, breathing, idle
 * fidgets, a calm arm carry, landing squash) and, for the player, foot planting with two-bone leg IK.
 * NPC mixers are throttled by tier and distance.
 */
export class RuntimeCharacter implements Character {
  readonly capsule: { readonly radius: number; readonly height: number };

  private readonly mixer: AnimationMixer;
  private readonly actions = new Map<CharacterClip, AnimationAction>();
  private readonly body: Bone | null;
  private readonly hips: Bone | null;
  private readonly abdomen: Bone | null;
  private readonly torso: Bone | null;
  private readonly shoulderL: Bone | null;
  private readonly shoulderR: Bone | null;
  private readonly upperArmL: Bone | null;
  private readonly upperArmR: Bone | null;
  private readonly lowerArmL: Bone | null;
  private readonly lowerArmR: Bone | null;
  /** The first bone past each forearm (the palm's root), for reaching the hands. */
  private readonly wristL: Bone | null;
  private readonly wristR: Bone | null;
  /** Each hand's finger chains (knuckle outward), curled round a grip; player captains only. */
  private readonly fingersL: readonly Bone[][];
  private readonly fingersR: readonly Bone[][];
  private grip: HandGrip | null = null;
  private readonly upperLegL: Bone | null;
  private readonly upperLegR: Bone | null;
  private readonly lowerLegL: Bone | null;
  private readonly lowerLegR: Bone | null;
  private readonly lowerLegEndL: Bone | null;
  private readonly lowerLegEndR: Bone | null;
  private readonly footL: Bone | null;
  private readonly footR: Bone | null;
  private readonly proceduralRests: readonly BoneRest[];
  private readonly head: Bone | null;
  private readonly neck: Bone | null;
  private readonly face: CharacterFace | null;
  private readonly targetWorld = new Vector3();
  private readonly lookWorld = new Vector3();
  /** Where the head aims: it trails the look target on a spring, so the eyes get there first. */
  private readonly aimWorld = new Vector3();
  private readonly aimVelocity = new Vector3();
  private aimReady = false;
  /** How much the head follows the look target (eases in and out instead of snapping). */
  private lookWeight = 0;
  private blinkCooldown = 0;
  /** This character's staging light, shared by all its meshes (read per object by the shader). */
  private readonly stage: StageLight = { ...STAGE_REST };
  private spotlit = false;
  /** Level of detail, picked as each mesh is drawn (full while talking or spotlit). */
  readonly lod: CharacterLod;
  /** Squared distance to the camera (or player), refreshed each frame for NPCs. */
  private viewDistSq = 0;
  private readonly footWorld = new Vector3();
  private readonly footTargetWorld = new Vector3();
  private readonly armCarry = new Map<Bone, Quaternion>();
  private readonly legIk = new LegIk();
  private lookTarget: LookTarget = null;
  private readonly npc: boolean;
  private readonly characterBody: CharacterBody;
  private readonly npcAnimRate: number;
  private readonly updateTarget: Object3D | null;
  private groundAt: ((x: number, z: number) => number) | null = null;
  private readonly footPlantL: PlantState = { active: false, blend: 0, x: 0, y: 0, z: 0 };
  private readonly footPlantR: PlantState = { active: false, blend: 0, x: 0, y: 0, z: 0 };
  private throttledDt = 0;
  /** Time spent out of view (`offscreen`), not yet animated. */
  private hiddenFor = 0;
  /** Whether this tier draws movers into a sun shadow map (an NPC off screen could cast onto it). */
  private readonly moverShadows: boolean;
  private targetSpeed = 0;
  private visualSpeed = 0;
  private previousVisualSpeed = 0;
  private locomotionClock = 0;
  private idleClock = Math.random() * 2;
  private idleFidgetAt = 3.2 + Math.random() * 2.6;
  private idleFidget = 0;
  private idleFidgetKind = 0;
  private activeClip: CharacterClip = 'idle';
  private talking = false;
  private readonly gestures: GesturePlanner;
  private gesture: GestureFrame | null = null;
  private readonly handL: HandRig | null;
  private readonly handR: HandRig | null;
  /** This step's hand poses from the gesture (rest when there's none). */
  private handPoseL: ArmPose = REST_POSE;
  private handPoseR: ArmPose = REST_POSE;
  private readonly reads: boolean;
  /** Carries something in a hand: the wave clip would swing it through the arm, so they nod hello. */
  private readonly holding: boolean;
  /** A one-shot clip (a wave hello, a nod) blended over a standing idle, then handed back. */
  private overlay: { clip: CharacterClip; t: number; dur: number; peak: number } | null = null;
  /** Head-only nod (radians, down), set by the 'nod' gesture. */
  private nodPitch = 0;
  private groundMode: CharacterGroundMode = 'ground';
  private airTime = 0;
  private verticalSpeed = 0;
  private lastVerticalSpeed = 0;
  private landBlend = 0;
  private stopBlend = 0;
  private lastHeading: number;
  private readonly baseScale: number;
  private readonly rigMeters: number;

  constructor(
    readonly group: Group,
    clips: ReadonlyMap<CharacterClip, AnimationClip>,
    body: CharacterBody,
    config: BodyConfig,
    options: CharacterCreateOptions,
  ) {
    this.characterBody = body;
    unreflected.add(group);
    floraFeet.add(group);
    this.npc = !PLAYER_BODIES.includes(body as PlayerBody);
    this.npcAnimRate = Math.max(0.1, options.tier?.npcAnimRate ?? 1);
    this.updateTarget = options.updateTarget ?? null;
    this.moverShadows = (options.tier?.shadowMoverMap ?? 1) > 0;
    // A hand that carries a prop (a ledger, a spyglass) never gestures: the other one talks.
    const holds = (group.userData.holds ?? []) as number[];
    const left = holds.includes(1);
    const right = holds.includes(-1);
    this.gestures = new GesturePlanner(
      left !== right ? (left ? 'right' : 'left') : (config.hand ?? 'either'),
      clips.has('nod'),
      config.gestures ?? (config.reads ? 'ledger' : 'open'),
    );
    this.gestures.offHandHolds = left || right;
    this.holding = left || right;
    this.reads = !!config.reads;
    this.capsule = { radius: config.radius * config.scale, height: config.height * config.scale };
    this.mixer = new AnimationMixer(group);
    for (const clipName of CHARACTER_CLIPS) {
      const clip = clips.get(clipName);
      if (!clip) continue;
      const action = this.mixer.clipAction(bindableClip(clip, group));
      action.loop = LoopRepeat;
      action.enabled = true;
      action.time = Math.random() * Math.max(0.001, clip.duration);
      action.setEffectiveWeight(clipName === 'idle' ? 1 : 0);
      action.play();
      this.actions.set(clipName, action);
    }
    this.body = bone(group, 'Body');
    this.hips = bone(group, 'Hips');
    this.abdomen = bone(group, 'Abdomen');
    this.torso = bone(group, 'Torso');
    this.shoulderL = bone(group, 'ShoulderL');
    this.shoulderR = bone(group, 'ShoulderR');
    this.upperArmL = bone(group, 'UpperArmL');
    this.upperArmR = bone(group, 'UpperArmR');
    this.lowerArmL = bone(group, 'LowerArmL');
    this.lowerArmR = bone(group, 'LowerArmR');
    this.wristL = firstChildBone(this.lowerArmL);
    this.wristR = firstChildBone(this.lowerArmR);
    group.updateMatrixWorld(true);
    this.handL = this.npc && this.lowerArmL ? HandRig.of(this.lowerArmL, 1) : null;
    this.handR = this.npc && this.lowerArmR ? HandRig.of(this.lowerArmR, -1) : null;
    // A hand that carries a prop keeps its fingers closed on it.
    if (this.handL && left) this.handL.grip = 1;
    if (this.handR && right) this.handR.grip = 1;
    this.fingersL = this.npc ? [] : fingerChains(this.lowerArmL);
    this.fingersR = this.npc ? [] : fingerChains(this.lowerArmR);
    this.upperLegL = bone(group, 'UpperLegL');
    this.upperLegR = bone(group, 'UpperLegR');
    this.lowerLegL = bone(group, 'LowerLegL');
    this.lowerLegR = bone(group, 'LowerLegR');
    this.lowerLegEndL = bone(group, 'LowerLegL_end');
    this.lowerLegEndR = bone(group, 'LowerLegR_end');
    this.footL = bone(group, 'FootL');
    this.footR = bone(group, 'FootR');
    this.head = bone(group, 'Head');
    this.neck = bone(group, 'Neck');
    this.face = this.npc ? createFace(this.head, group, body, config) : null;
    group.traverse((object) => {
      if (object instanceof Mesh) object.userData.stage = this.stage;
    });
    this.proceduralRests = proceduralBones([
      this.body,
      this.hips,
      this.abdomen,
      this.torso,
      this.neck,
      this.head,
      this.shoulderL,
      this.shoulderR,
      this.upperArmL,
      this.upperArmR,
      this.lowerArmL,
      this.lowerArmR,
      this.upperLegL,
      this.upperLegR,
      this.lowerLegL,
      this.lowerLegR,
      this.footL,
      this.footR,
      ...this.fingersL.flat(),
      ...this.fingersR.flat(),
    ]);
    this.baseScale = config.scale;
    this.lastHeading = group.rotation.y;
    const root = group.getObjectByName('Root');
    this.rigMeters = 1 / Math.max(1, root?.getWorldScale(new Vector3()).x ?? 100);
    this.mixer.update(0.001);
    this.captureArmCarry();
    this.lod = new CharacterLod(group, !this.npc);
    attachCharacterLod(group, this.lod);
  }

  play(clip: CharacterClip, fade = 0.22): void {
    if (!this.actions.has(clip)) return;
    this.overlay = null;
    this.activeClip = clip;
    for (const [name, action] of this.actions) fadeAction(action, name === clip ? 1 : 0, fade);
    if (clip === 'wade') this.actions.get('wade')?.setEffectiveTimeScale(0.55);
  }

  setSpeed(mps: number): void {
    const speed = Math.max(0, Number.isFinite(mps) ? mps : 0);
    if (speed < 0.08 && this.targetSpeed > 0.38) this.stopBlend = Math.max(this.stopBlend, 1);
    this.targetSpeed = speed;
    this.activeClip = 'idle';
    const weights = new Map<CharacterClip, number>();
    const idle = this.actions.get('idle');
    const walk = this.actions.get('walk');
    const jog = this.actions.get('jog') ?? this.actions.get('run');
    const run = this.actions.get('run');
    if (!idle || !walk || !run) return;

    if (this.groundMode === 'air' && (this.actions.has('jumpStart') || this.actions.has('jumpLoop'))) {
      const startWeight = Math.max(0, 1 - this.airTime / 0.2);
      weights.set('jumpStart', startWeight);
      weights.set('jumpLoop', 1 - startWeight);
      weights.set('walk', Math.min(0.18, speed / RUN_SPEED) * (1 - startWeight));
      weights.set('run', Math.min(0.22, speed / RUN_SPEED) * (1 - startWeight));
      weights.set('idle', 0);
    } else if (this.groundMode === 'wade' && this.actions.has('wade')) {
      const wadeWeight = smoothstep(0.05, 0.45, speed);
      weights.set('idle', 1 - wadeWeight);
      weights.set('wade', wadeWeight);
    } else {
      const moveWeight = smoothstep(0.06, 0.48, speed);
      const runWeight = smoothstep(3.05, RUN_SPEED, speed);
      const jogWeight = smoothstep(WALK_SPEED, JOG_SPEED, speed) * (1 - smoothstep(3.0, RUN_SPEED, speed));
      const walkWeight = moveWeight * (1 - smoothstep(1.7, 2.8, speed));
      const sum = Math.max(1, walkWeight + jogWeight + runWeight);
      weights.set('idle', Math.max(0, 1 - moveWeight));
      weights.set('walk', (walkWeight / sum) * moveWeight);
      weights.set('jog', (jogWeight / sum) * moveWeight);
      weights.set('run', (runWeight / sum) * moveWeight);
      if (this.landBlend > 0.02 && this.actions.has('jumpLand')) {
        const land = Math.min(0.72, this.landBlend);
        for (const [name, weight] of weights) weights.set(name, weight * (1 - land * 0.55));
        weights.set('jumpLand', land);
      }
    }

    for (const [name, action] of this.actions) setBlendWeight(action, weights.get(name) ?? 0);
    syncStride(walk, speed, WALK_STRIDE_METERS);
    if (jog) syncStride(jog, speed, JOG_STRIDE_METERS);
    syncStride(run, speed, RUN_STRIDE_METERS);
    const wade = this.actions.get('wade');
    if (wade) syncStride(wade, Math.max(0.35, speed * 0.7), WALK_STRIDE_METERS);
  }

  setGrounding(state: CharacterGrounding): void {
    const next = state.mode;
    if (next === 'air' && this.groundMode !== 'air') this.airTime = 0;
    if (state.landed) {
      const impact = MathUtils.clamp(Math.abs(this.lastVerticalSpeed) / 7, 0.35, 1);
      this.landBlend = Math.max(this.landBlend, impact);
    }
    this.groundMode = next;
    this.verticalSpeed = state.verticalSpeed ?? this.verticalSpeed;
    this.groundAt = state.groundAt ?? null;
  }

  lookAt(target: LookTarget): void {
    this.lookTarget = target;
  }

  setGrip(grip: HandGrip | null): void {
    this.grip = grip;
  }

  setTalking(on: boolean): void {
    this.talking = on;
    this.lod.forced = on || this.spotlit;
    // Seated rigs keep their upper-body beat; standing talkers gesture.
    if (on && this.standing()) {
      if (this.overlay?.clip === 'wave') this.overlay.dur = Math.min(this.overlay.dur, this.overlay.t + 0.3);
      this.gestures.start();
    } else if (!on) {
      this.gestures.stop();
      this.face?.listen(false);
    }
  }

  /** Moves the face, and lands gestures on the line's stressed words (whoever's speaking it). */
  speak(line: FacialLine | null): void {
    this.face?.speak(line);
    if (line && !this.gestures.active && this.standing()) this.gestures.start();
    else if (!line && !this.talking) this.gestures.stop();
    if (!this.gestures.active) return;
    // Between their own lines, someone in a conversation listens instead of talking with their hands.
    if (line) this.gestures.plan(line.words ?? null, line.text, line.duration);
    else this.gestures.listen();
    this.face?.listen(!line && this.talking);
  }

  setSpotlight(on: boolean): void {
    this.spotlit = on;
    this.lod.forced = on || this.talking;
  }

  greet(): void {
    if (this.talking || !this.npc) return;
    this.startOverlay(this.holding ? 'nod' : 'wave', 1);
  }

  update(dt: number): void {
    // An NPC no one can see doesn't animate (PLAN §12.3): its time is kept and spent when it's back in view.
    if (this.offscreen()) {
      this.hiddenFor += dt;
      this.throttledDt += dt;
      return;
    }
    const late = this.hiddenFor;
    this.hiddenFor = 0;
    const step = this.animationStep(dt);
    if (step > 0) {
      this.restoreProceduralBones();
      this.gesture = this.standing() ? this.gestures.update(step) : null;
      this.nodPitch = 0;
      this.updateOverlay(step);
      this.mixer.update(step);
      this.handPoseL = this.handPoseR = REST_POSE;
      this.applyProceduralPolish(step);
      this.applyHands();
    }
    // Back in view: the head's spring catches up on the time it missed before it aims.
    for (let t = Math.min(late, LOOK_CATCH_UP); t > 0; t -= LOOK_STEP)
      this.advanceAim(Math.min(LOOK_STEP, t));
    this.applyLookAt(dt + late);
    this.applyLookNod();
    this.updateFace(dt + late, step);
    const ks = 1 - Math.exp(-(dt + late) * 2.5);
    this.stage.key += ((this.spotlit ? 0.18 : STAGE_REST.key) - this.stage.key) * ks;
    this.stage.rim += ((this.spotlit ? 0.4 : STAGE_REST.rim) - this.stage.rim) * ks;
    this.lastVerticalSpeed = this.verticalSpeed;
  }

  dispose(): void {
    unreflected.delete(this.group);
    floraFeet.delete(this.group);
    this.mixer.stopAllAction();
    this.face?.dispose();
    this.group.traverse((object) => {
      if (object instanceof Mesh) disposeOwnedMaterial(object.material);
      if (object instanceof Mesh && object.userData.ownedGeometry) object.geometry.dispose();
      // Frees the renderer's state for this mesh (as InstancedMesh.dispose() does), so its pipelines
      // are released even though the shared materials it drew with stay alive for other characters.
      if (object instanceof Mesh)
        (object as unknown as EventDispatcher<{ dispose: object }>).dispatchEvent({ type: 'dispose' });
    });
  }

  /** Poses the hands after the arms: gesture hand shapes, and the grip on anything carried. */
  private applyHands(): void {
    const l = this.handL;
    const r = this.handR;
    if (l && (l.grip || this.handPoseL !== REST_POSE)) l.apply(this.handPoseL);
    if (r && (r.grip || this.handPoseR !== REST_POSE)) r.apply(this.handPoseR);
  }

  /**
   * Faces cost a little CPU each: full rate up close, the throttled animation rate further out (blinks
   * and gaze still run), and beyond ~55 m, where an eye is under a pixel, not drawn at all.
   */
  private updateFace(dt: number, step: number): void {
    const face = this.face;
    if (!face) return;
    const visible = this.viewDistSq < FACE_DRAW_SQ;
    face.setVisible(visible);
    if (!visible) return;
    // Low tiers throttle NPC animation (npcAnimRate < 1); the face follows that rate there.
    if (this.viewDistSq < FACE_FULL_RATE_SQ && this.npcAnimRate >= 1) face.update(dt, this.lookTarget);
    else if (step > 0) face.update(step, this.lookTarget);
  }

  /** Standing still on the idle clip, where overlays and gestures can play. */
  private standing(): boolean {
    return this.activeClip === 'idle' && this.targetSpeed < 0.05 && this.groundMode === 'ground';
  }

  private startOverlay(clip: CharacterClip, peak: number): void {
    const action = this.actions.get(clip);
    if (!action || !this.standing() || this.overlay) return;
    action.reset();
    this.overlay = { clip, t: 0, dur: action.getClip().duration, peak };
  }

  /** Blends the overlay clip in and back out over the idle; runs before the mixer samples. */
  private updateOverlay(dt: number): void {
    const o = this.overlay;
    if (!o) return;
    const action = this.actions.get(o.clip);
    const idle = this.actions.get('idle');
    o.t += dt;
    const done = o.t >= o.dur || !this.standing();
    const w = done ? 0 : smoothstep(0, 0.25, o.t) * (1 - smoothstep(o.dur - 0.35, o.dur, o.t)) * o.peak;
    if (action) setBlendWeight(action, w);
    if (idle) setBlendWeight(idle, 1 - w);
    if (done) this.overlay = null;
  }

  private animationStep(dt: number): number {
    if (!this.npc) return dt;
    this.throttledDt += dt;
    const interval = this.npcInterval();
    if (this.throttledDt < interval) return 0;
    const step = this.throttledDt;
    this.throttledDt = 0;
    return step;
  }

  private npcInterval(): number {
    let interval = 1 / 60 / this.npcAnimRate;
    if (!this.updateTarget) return interval;
    this.updateTarget.getWorldPosition(this.targetWorld);
    const distanceSq = this.group.position.distanceToSquared(this.targetWorld);
    this.viewDistSq = distanceSq;
    if (distanceSq > 170 * 170) return Math.max(interval, 0.5);
    if (distanceSq > 95 * 95) interval = Math.max(interval, 1 / 10);
    else if (distanceSq > 55 * 55) interval = Math.max(interval, 1 / 20);
    return interval;
  }

  private restoreProceduralBones(): void {
    for (const rest of this.proceduralRests) {
      rest.bone.position.copy(rest.position);
      rest.bone.quaternion.copy(rest.quaternion);
    }
    this.handL?.restore();
    this.handR?.restore();
  }

  /**
   * The eyes lead and the head follows (the face aims the eyes at the true target): the head's aim
   * point trails the target on a critically damped spring, look-at fades in and out instead of
   * snapping, and a big swing to a new target starts with a blink.
   */
  private applyLookAt(dt: number): void {
    if (!this.head && !this.neck) return;
    const want = this.lookTarget ? 1 : 0;
    this.lookWeight += (want - this.lookWeight) * (1 - Math.exp(-dt * 5));
    if (this.lookTarget) {
      if (this.lookTarget instanceof Object3D) this.lookTarget.getWorldPosition(this.lookWorld);
      else this.lookWorld.copy(this.lookTarget);
      if (!this.aimReady) {
        this.aimWorld.copy(this.lookWorld);
        this.aimVelocity.set(0, 0, 0);
        this.aimReady = true;
      }
    }
    if (!this.aimReady || this.lookWeight < 0.002) {
      if (!this.lookTarget) this.aimReady = false;
      return;
    }
    if (this.lookTarget) {
      this.advanceAim(Math.min(LOOK_STEP, Math.max(0, dt)));
      this.blinkCooldown = Math.max(0, this.blinkCooldown - dt);
      if (this.head && this.blinkCooldown <= 0) {
        this.head.getWorldPosition(LOOK_H);
        LOOK_A.subVectors(this.aimWorld, LOOK_H);
        LOOK_B.subVectors(this.lookWorld, LOOK_H);
        if (LOOK_A.angleTo(LOOK_B) > 0.45) {
          this.face?.blinkNow();
          this.blinkCooldown = 1.2;
        }
      }
    }
    this.aimBone(this.neck);
    this.aimBone(this.head);
  }

  /** Moves the head's aim toward the look target on its spring (critical damping), `step` seconds. */
  private advanceAim(step: number): void {
    if (!this.lookTarget || !this.aimReady) return;
    const omega = 9;
    // a = ω²(target − aim) − 2ω·v, integrated semi-implicitly.
    LOOK_D.subVectors(this.lookWorld, this.aimWorld).multiplyScalar(omega * omega);
    LOOK_D.addScaledVector(this.aimVelocity, -2 * omega);
    this.aimVelocity.addScaledVector(LOOK_D, step);
    this.aimWorld.addScaledVector(this.aimVelocity, step);
  }

  /**
   * Whether this NPC is out of the camera's view and can't be seen any other way: no sun shadow of it
   * can reach the screen (Lite and Low have no shadow map for movers; above them, it's beyond the
   * movers' map), and characters stay out of the harbour mirror. The player is never skipped.
   */
  private offscreen(): boolean {
    const camera = this.updateTarget as PerspectiveCamera | null;
    if (!this.npc || this.talking || !camera?.isPerspectiveCamera) return false;
    camera.getWorldPosition(this.targetWorld);
    if (this.moverShadows && this.group.position.distanceToSquared(this.targetWorld) < MOVER_SHADOW_SQ)
      return false;
    const frustum = viewFrustum(camera);
    OFFSCREEN_SPHERE.center.copy(this.group.position);
    OFFSCREEN_SPHERE.center.y += 0.9 * this.group.scale.y;
    OFFSCREEN_SPHERE.radius = OFFSCREEN_RADIUS * Math.max(1, this.group.scale.y);
    return !frustum.intersectsSphere(OFFSCREEN_SPHERE);
  }

  private aimBone(bone: Bone | null): void {
    if (!bone) return;
    LOOK_Q.copy(bone.quaternion);
    bone.lookAt(this.aimWorld);
    if (this.lookWeight < 0.999) bone.quaternion.slerpQuaternions(LOOK_Q, bone.quaternion, this.lookWeight);
  }

  /** The nod on top of look-at, which re-aims the head and neck every frame. */
  private applyLookNod(): void {
    if (!this.lookTarget || !this.nodPitch) return;
    this.neck?.rotateX(this.nodPitch * 0.35);
    this.head?.rotateX(this.nodPitch * 0.65);
  }

  private applyProceduralPolish(dt: number): void {
    const yaw = this.group.rotation.y;
    const turnRate = MathUtils.clamp(wrapAngle(yaw - this.lastHeading) / Math.max(0.001, dt), -8, 8);
    const npcScale = this.npc ? 0.55 : 1;
    this.lastHeading = yaw;
    if (!LOCOMOTION_CLIPS.has(this.activeClip)) {
      this.group.rotation.set(0, yaw, 0);
      this.group.scale.setScalar(this.baseScale);
      this.applyPoseLife(dt, npcScale);
      return;
    }

    const speedRate = this.groundMode === 'air' ? 5 : 11;
    this.visualSpeed += (this.targetSpeed - this.visualSpeed) * (1 - Math.exp(-speedRate * dt));
    const accel = (this.visualSpeed - this.previousVisualSpeed) / Math.max(0.001, dt);
    this.previousVisualSpeed = this.visualSpeed;
    const speed01 = MathUtils.clamp(this.visualSpeed / RUN_SPEED, 0, 1);
    const move = smoothstep(0.05, 0.75, this.visualSpeed);
    const stride =
      this.visualSpeed > 2.8
        ? RUN_STRIDE_METERS
        : this.visualSpeed > 1.55
          ? JOG_STRIDE_METERS
          : WALK_STRIDE_METERS;
    this.locomotionClock += (this.visualSpeed / stride) * Math.PI * 2 * dt;

    if (this.groundMode === 'air') this.airTime += dt;
    else this.airTime = 0;
    this.landBlend = Math.max(0, this.landBlend - dt * 2.7);
    this.stopBlend = Math.max(0, this.stopBlend - dt * 3.1);

    const squash = this.landBlend * 0.055 + this.stopBlend * 0.018;
    const stretch =
      this.groundMode === 'air' && this.verticalSpeed > 0 ? Math.min(0.035, this.verticalSpeed * 0.006) : 0;
    this.group.scale.set(
      this.baseScale * (1 + squash * 0.55 - stretch * 0.35),
      this.baseScale * (1 - squash + stretch),
      this.baseScale * (1 + squash * 0.55 - stretch * 0.35),
    );

    const pitch = MathUtils.clamp((-speed01 * 0.055 - accel * 0.006) * npcScale, -0.13, 0.1);
    const bank = MathUtils.clamp(
      (-turnRate * 0.045 - Math.sin(this.locomotionClock) * 0.012 * move) * npcScale,
      -0.16,
      0.16,
    );
    this.group.rotation.set(pitch, yaw, bank);

    const twoStep = this.locomotionClock * 2;
    const hipSway = Math.sin(twoStep) * 0.045 * move * npcScale;
    const shoulderCounter = Math.sin(this.locomotionClock) * 0.032 * move * npcScale;
    const bob =
      Math.max(0, Math.cos(twoStep)) * 0.026 * move - this.landBlend * 0.05 - this.stopBlend * 0.016;
    const breath = Math.sin(this.idleClock * 2.1) * (1 - move) * 0.006;
    if (this.body) this.body.position.y += (bob + breath) * this.rigMeters;
    this.hips?.rotateZ(hipSway);
    this.abdomen?.rotateZ(-hipSway * 0.42);
    this.torso?.rotateZ(-hipSway * 0.62);
    this.torso?.rotateY((-turnRate * 0.024 + shoulderCounter) * npcScale);
    this.neck?.rotateY(turnRate * 0.016 * npcScale);
    if (!this.lookTarget) this.head?.rotateY(turnRate * 0.01 * npcScale);
    this.footL?.rotateX(Math.sin(this.locomotionClock + Math.PI) * 0.05 * move);
    this.footR?.rotateX(Math.sin(this.locomotionClock) * 0.05 * move);

    this.applyArmMask(move, npcScale);
    this.applyFootPlant(move, dt);
    this.applyIdleLife(dt, move, npcScale);
    if (this.gesture?.active) this.applyGesture(this.gesture);
    else if (this.talking) this.applyTalkBeat(npcScale);
  }

  /**
   * Poses both arms and hands from the gesture frame. The torso never pitches forward and back while
   * talking (a repeated lean reads as an odd body thrust): the shoulders only turn, and nods are
   * head-only.
   */
  private applyGesture(g: GestureFrame): void {
    this.poseArm(1, g.left);
    this.poseArm(-1, g.right);
    if (g.turn) this.rotateInRoot(this.torso, AXIS_Y, g.turn);
    if (g.tilt) this.rotateInRoot(this.head, AXIS_Z, -g.tilt);
    this.nodPitch = g.nod;
    if (g.nod && !this.lookTarget) {
      this.rotateInRoot(this.neck, AXIS_X, g.nod * 0.35);
      this.rotateInRoot(this.head, AXIS_X, g.nod * 0.65);
    }
  }

  private poseArm(side: Side, pose: ArmPose): void {
    const upper = side === 1 ? this.upperArmL : this.upperArmR;
    const lower = side === 1 ? this.lowerArmL : this.lowerArmR;
    if (pose.abduct) this.rotateInRoot(upper, AXIS_Z, side * pose.abduct);
    if (pose.flex) this.rotateInRoot(upper, AXIS_X, -pose.flex);
    if (pose.elbow) this.rotateInRoot(lower, AXIS_X, -pose.elbow);
    if (pose.inward) this.rotateInRoot(lower, AXIS_Z, -side * pose.inward);
    if (side === 1) this.handPoseL = pose;
    else this.handPoseR = pose;
  }

  /**
   * Two-bone reach: bends the elbow to span the distance, swings the arm so the wrist lands on
   * `target` (the character's own frame, metres from the feet), then rolls the elbow toward the pole.
   */
  private reachArm(side: Side, target: Vector3): void {
    const upper = side === 1 ? this.upperArmL : this.upperArmR;
    const lower = side === 1 ? this.lowerArmL : this.lowerArmR;
    const wrist = side === 1 ? this.wristL : this.wristR;
    if (!upper || !lower || !wrist) return;
    this.group.getWorldQuaternion(ROOT_Q);
    this.group.getWorldPosition(IK_T);
    IK_T.add(IK_U.copy(target).applyQuaternion(ROOT_Q));
    const s = upper.getWorldPosition(IK_S);
    const e = lower.getWorldPosition(IK_E);
    const h = wrist.getWorldPosition(IK_H);
    const a = s.distanceTo(e);
    const b = e.distanceTo(h);
    if (a < 1e-4 || b < 1e-4) return;
    const c = MathUtils.clamp(s.distanceTo(IK_T), Math.abs(a - b) + 1e-3, a + b - 1e-3);

    IK_U.subVectors(s, e);
    IK_V.subVectors(h, e);
    IK_AXIS.crossVectors(IK_U, IK_V);
    if (IK_AXIS.lengthSq() < 1e-12) IK_AXIS.set(1, 0, 0).applyQuaternion(ROOT_Q);
    const wanted = Math.acos(MathUtils.clamp((a * a + b * b - c * c) / (2 * a * b), -1, 1));
    this.rotateInWorld(lower, IK_AXIS.normalize(), wanted - IK_U.angleTo(IK_V));

    wrist.getWorldPosition(IK_H);
    IK_U.subVectors(IK_H, s);
    IK_V.subVectors(IK_T, s);
    IK_AXIS.crossVectors(IK_U, IK_V);
    if (IK_AXIS.lengthSq() > 1e-12) this.rotateInWorld(upper, IK_AXIS.normalize(), IK_U.angleTo(IK_V));

    // Roll about shoulder→target until the elbow faces the pole (down, out, and back).
    const dir = IK_V.normalize();
    lower.getWorldPosition(IK_E);
    IK_U.subVectors(IK_E, s);
    IK_U.addScaledVector(dir, -IK_U.dot(dir));
    IK_H.copy(GRIP_POLE)
      .setX(side * GRIP_POLE.x)
      .applyQuaternion(ROOT_Q);
    IK_H.addScaledVector(dir, -IK_H.dot(dir));
    if (IK_U.lengthSq() < 1e-10 || IK_H.lengthSq() < 1e-10) return;
    const roll = Math.atan2(dir.dot(IK_AXIS.crossVectors(IK_U, IK_H)), IK_U.dot(IK_H));
    this.rotateInWorld(upper, dir, roll);
  }

  /** Closes each finger down and round what the hand's holding, knuckle to tip. */
  private curlFingers(chains: readonly Bone[][]): void {
    if (!chains.length) return;
    this.group.getWorldQuaternion(ROOT_Q);
    const down = IK_V.set(0, -1, 0).applyQuaternion(ROOT_Q);
    for (const chain of chains) {
      const knuckle = chain[0]!;
      const next = chain[1]!;
      // One hinge axis per finger, so the joints fold in the same plane.
      next.getWorldPosition(IK_H).sub(knuckle.getWorldPosition(IK_S));
      IK_AXIS.crossVectors(IK_H, down);
      if (IK_AXIS.lengthSq() < 1e-12) continue;
      IK_AXIS.normalize();
      const thumb = knuckle.name.startsWith('Thumb');
      chain.forEach((joint, i) =>
        this.rotateInWorld(joint, IK_AXIS, (FINGER_CURL[i] ?? 0) * (thumb ? 0.45 : 1)),
      );
    }
  }

  /**
   * Turns a bone about an axis given in the character's own frame (+x left, +y up, +z forward), so
   * poses read the same on both arms whatever each bone's local axes are.
   */
  private rotateInRoot(bone: Bone | null, axis: Vector3, angle: number): void {
    const parent = bone?.parent;
    if (!bone || !parent || Math.abs(angle) < 1e-4) return;
    // The parent's rotation relative to the character, from the local quaternions on the way down
    // (no world matrices): the axis in the parent's frame is that rotation's inverse applied to it.
    let depth = 0;
    for (let o: Object3D | null = parent; o && o !== this.group; o = o.parent) {
      if (depth === CHAIN.length) return this.rotateInWorldFromRoot(bone, axis, angle);
      CHAIN[depth++] = o;
    }
    REL_Q.identity();
    for (let i = depth - 1; i >= 0; i--) REL_Q.multiply(CHAIN[i]!.quaternion);
    WORLD_AXIS.copy(axis).applyQuaternion(REL_Q.invert());
    bone.quaternion.premultiply(DELTA_Q.setFromAxisAngle(WORLD_AXIS, angle));
  }

  private rotateInWorldFromRoot(bone: Bone, axis: Vector3, angle: number): void {
    this.group.getWorldQuaternion(ROOT_Q);
    this.rotateInWorld(bone, WORLD_AXIS.copy(axis).applyQuaternion(ROOT_Q), angle);
  }

  /** Turns a bone about a world-space axis (unit length). */
  private rotateInWorld(bone: Bone | null, axis: Vector3, angle: number): void {
    if (!bone?.parent || Math.abs(angle) < 1e-4) return;
    bone.parent.getWorldQuaternion(PARENT_Q);
    DELTA_Q.setFromAxisAngle(axis, angle);
    // Local change = parent⁻¹ · Δ · parent, applied ahead of the bone's current local rotation.
    LOCAL_Q.copy(PARENT_Q).invert().multiply(DELTA_Q).multiply(PARENT_Q);
    bone.quaternion.premultiply(LOCAL_Q);
  }

  private applyPoseLife(dt: number, npcScale: number): void {
    this.idleClock += dt;
    const breath = Math.sin(this.idleClock * 2.1) * 0.004;
    if (this.body) this.body.position.y += breath * this.rigMeters;
    if (this.activeClip === 'sit') {
      const settle = Math.sin(this.idleClock * 0.9) * npcScale;
      this.hips?.rotateX(-0.08);
      this.torso?.rotateX(0.06);
      this.upperLegL?.rotateX(-1.22);
      this.upperLegR?.rotateX(-1.22);
      this.lowerLegL?.rotateX(1.42);
      this.lowerLegR?.rotateX(1.42);
      this.footL?.rotateX(-0.28);
      this.footR?.rotateX(-0.28);
      this.shoulderL?.rotateZ(0.1);
      this.shoulderR?.rotateZ(-0.1);
      this.torso?.rotateY(settle * 0.025);
      this.neck?.rotateY(-settle * 0.035);
      if (!this.lookTarget) this.head?.rotateY(-settle * 0.045);
    } else if (this.activeClip === 'helm') {
      // A slow weight shift with the ship's roll; the hands stay put on the spokes.
      this.torso?.rotateZ(Math.sin(this.idleClock * 0.7) * 0.012);
      if (this.grip) {
        const { y, z, spread } = this.grip;
        for (const side of [1, -1] as const) {
          this.reachArm(side, GRIP_TARGET.set(side * spread, y, z - GRIP_HAND));
          this.curlFingers(side === 1 ? this.fingersL : this.fingersR);
        }
      }
    }
    if (this.activeClip === 'talk' || this.talking) this.applyTalkBeat(npcScale);
  }

  /** Conversational beat; seated rigs have no wave clip, so they gesture harder (no forward rock). */
  private applyTalkBeat(npcScale: number): void {
    const seated = this.activeClip === 'sit';
    const gain = (seated ? 2.2 : 1) * npcScale;
    const beat = Math.sin(this.idleClock * 4.4);
    this.torso?.rotateY(beat * 0.028 * gain);
    this.shoulderL?.rotateZ(Math.max(0, beat) * 0.04 * gain);
    this.shoulderR?.rotateZ(Math.min(0, beat) * 0.04 * gain);
    if (!this.lookTarget) this.head?.rotateY(Math.sin(this.idleClock * 1.6) * 0.04 * npcScale);
  }

  private captureArmCarry(): void {
    for (const bone of [
      this.shoulderL,
      this.upperArmL,
      this.lowerArmL,
      this.shoulderR,
      this.upperArmR,
      this.lowerArmR,
    ]) {
      if (bone) this.armCarry.set(bone, bone.quaternion.clone());
    }
  }

  private applyArmMask(move: number, npcScale: number): void {
    if (move < 0.05 || this.groundMode === 'air') return;
    const swing = Math.sin(this.locomotionClock) * move * npcScale;
    const carry = (bone: Bone | null, strength = 0.92) => {
      const pose = bone ? this.armCarry.get(bone) : null;
      if (bone && pose) bone.quaternion.slerp(pose, strength);
    };
    const gentleSwing = (side: -1 | 1, upper: Bone | null, lower: Bone | null, shoulder: Bone | null) => {
      carry(shoulder);
      carry(upper);
      carry(lower);
      shoulder?.rotateZ(side * swing * 0.035);
      upper?.rotateX(-side * swing * 0.16);
      lower?.rotateX(side * swing * 0.08);
    };

    if (this.characterBody === 'man') {
      carry(this.shoulderL, 0.98);
      carry(this.upperArmL, 0.98);
      carry(this.lowerArmL, 0.98);
      this.shoulderL?.rotateZ(Math.sin(this.locomotionClock * 2) * 0.01);
      gentleSwing(1, this.upperArmR, this.lowerArmR, this.shoulderR);
      return;
    }
    gentleSwing(-1, this.upperArmL, this.lowerArmL, this.shoulderL);
    gentleSwing(1, this.upperArmR, this.lowerArmR, this.shoulderR);
  }

  private applyFootPlant(move: number, dt: number): void {
    if (
      this.npc ||
      !this.groundAt ||
      this.groundMode !== 'ground' ||
      move < 0.12 ||
      !this.lowerLegEndL ||
      !this.lowerLegEndR
    ) {
      this.releasePlant(this.footPlantL, dt);
      this.releasePlant(this.footPlantR, dt);
      return;
    }
    this.group.updateMatrixWorld(true);
    const loco = this.dominantLocomotion();
    const phase = loco ? MathUtils.euclideanModulo(loco.action.time / loco.action.getClip().duration, 1) : 0;
    const leftStance = loco ? inContact(phase, loco.contacts.L) : false;
    const rightStance = loco ? inContact(phase, loco.contacts.R) : false;
    const lowFoot = Math.min(this.groundUnder(this.lowerLegEndL), this.groundUnder(this.lowerLegEndR));
    if (this.body && Number.isFinite(lowFoot)) {
      const pelvis = MathUtils.clamp((lowFoot - this.group.position.y) * 0.42, -0.11, 0.045);
      this.body.position.y += pelvis * this.rigMeters;
    }
    this.plantLeg(this.upperLegL, this.lowerLegL, this.lowerLegEndL, this.footPlantL, leftStance, dt);
    this.plantLeg(this.upperLegR, this.lowerLegR, this.lowerLegEndR, this.footPlantR, rightStance, dt);
  }

  private dominantLocomotion(): { action: AnimationAction; contacts: FootContactMap } | null {
    const name: CharacterClip = this.targetSpeed > 2.8 ? 'run' : this.targetSpeed > 1.55 ? 'jog' : 'walk';
    const action = this.actions.get(name) ?? this.actions.get('walk');
    if (!action) return null;
    return {
      action,
      contacts: contactsOf(action.getClip()),
    };
  }

  private groundUnder(end: Bone): number {
    end.getWorldPosition(this.footWorld);
    return this.groundAt?.(this.footWorld.x, this.footWorld.z) ?? this.footWorld.y;
  }

  private releasePlant(plant: PlantState, dt: number): void {
    plant.active = false;
    plant.blend = Math.max(0, plant.blend - dt / 0.1);
  }

  private plantLeg(
    upperLeg: Bone | null,
    lowerLeg: Bone | null,
    end: Bone | null,
    plant: PlantState,
    stance: boolean,
    dt: number,
  ): void {
    if (!upperLeg || !lowerLeg || !end) return;
    end.getWorldPosition(this.footWorld);
    if (!stance && plant.blend <= 0) {
      plant.active = false;
      return;
    }
    if (stance && !plant.active) {
      plant.active = true;
      plant.blend = 0;
      plant.x = this.footWorld.x;
      plant.y = this.footWorld.y;
      plant.z = this.footWorld.z;
    }
    if (plant.active) plant.y = (this.groundAt?.(plant.x, plant.z) ?? plant.y) + 0.025;
    this.footTargetWorld.set(plant.x, plant.y, plant.z);
    const reachable = this.legIk.reachable(this.group, upperLeg, lowerLeg, end, this.footTargetWorld);
    if (!stance || !reachable) this.releasePlant(plant, dt);
    else plant.blend = Math.min(1, plant.blend + dt / 0.08);
    if (plant.blend <= 0) return;
    this.legIk.solve(this.group, upperLeg, lowerLeg, end, this.footTargetWorld, plant.blend);
  }

  private applyIdleLife(dt: number, move: number, npcScale: number): void {
    this.idleClock += dt;
    if (move > 0.1 || this.groundMode === 'air' || this.talking || this.overlay) {
      this.idleFidget = 0;
      return;
    }
    // Look about, lift an arm, shift weight, or (for anyone carrying a ledger) glance down at it.
    // Never the same one twice running, and NPCs wait longer between them than the player.
    const kinds = this.npc && this.reads ? 5 : this.npc ? 4 : 3;
    if (this.idleClock > this.idleFidgetAt && this.idleFidget <= 0) {
      this.idleFidget = this.npc ? 2.2 + Math.random() * 0.9 : 1.8 + Math.random() * 0.7;
      this.idleFidgetKind = (this.idleFidgetKind + 1 + Math.floor(Math.random() * (kinds - 1))) % kinds;
      this.idleFidgetAt = this.idleClock + (this.npc ? 6 + Math.random() * 7 : 5 + Math.random() * 4);
    }
    if (this.idleFidget <= 0) return;
    this.idleFidget = Math.max(0, this.idleFidget - dt);
    const t = 1 - this.idleFidget / 2.5;
    const e = Math.sin(MathUtils.clamp(t, 0, 1) * Math.PI);
    const kind = this.idleFidgetKind;
    if (kind === 3) {
      // Weight onto one leg: hips tip, the torso counters.
      this.hips?.rotateZ(e * 0.05);
      this.torso?.rotateZ(-e * 0.035);
      return;
    }
    if (kind === 4) {
      if (!this.lookTarget) {
        this.rotateInRoot(this.neck, AXIS_X, e * 0.18);
        this.rotateInRoot(this.head, AXIS_X, e * 0.22);
      }
      return;
    }
    const side = kind === 0 ? 1 : -1;
    this.torso?.rotateY(e * 0.055 * side * npcScale);
    this.neck?.rotateY(e * 0.08 * side * npcScale);
    if (!this.lookTarget) this.head?.rotateY(e * 0.1 * side * npcScale);
    if (kind === 1) {
      this.shoulderR?.rotateZ(-e * 0.08 * npcScale);
      this.upperArmR?.rotateX(e * 0.16 * npcScale);
    } else if (kind === 2) {
      this.shoulderL?.rotateZ(e * 0.06 * npcScale);
      this.upperArmL?.rotateX(e * 0.12 * npcScale);
    }
  }
}

const AXIS_X = new Vector3(1, 0, 0);
const LOOK_D = new Vector3();
const LOOK_H = new Vector3();
const LOOK_A = new Vector3();
const LOOK_B = new Vector3();
const LOOK_Q = new Quaternion();
const AXIS_Y = new Vector3(0, 1, 0);
const REST_POSE: Readonly<ArmPose> = Object.freeze(newPose());
const CHAIN: Object3D[] = new Array(32);
const REL_Q = new Quaternion();
/** Faces update every frame inside 20 m and aren't drawn past 55 m. */
const FACE_FULL_RATE_SQ = 20 * 20;
const FACE_DRAW_SQ = 55 * 55;
const AXIS_Z = new Vector3(0, 0, 1);
const ROOT_Q = new Quaternion();
const PARENT_Q = new Quaternion();
const DELTA_Q = new Quaternion();
const LOCAL_Q = new Quaternion();
const WORLD_AXIS = new Vector3();
const GRIP_TARGET = new Vector3();
const IK_S = new Vector3();
const IK_E = new Vector3();
const IK_H = new Vector3();
const IK_T = new Vector3();
const IK_U = new Vector3();
const IK_V = new Vector3();
const IK_AXIS = new Vector3();

function bindableClip(clip: AnimationClip, root: Group): AnimationClip {
  const tracks = clip.tracks.filter((track) => {
    const target = trackTargetName(track.name);
    return !target || !!root.getObjectByName(target);
  });
  if (tracks.length === clip.tracks.length) return clip;
  const clone = clip.clone();
  clone.tracks = tracks.map((track) => track.clone());
  clone.resetDuration();
  return clone;
}

function trackTargetName(name: string): string | null {
  const bone = /^\.bones\[([^\]]+)\]\./.exec(name);
  if (bone) return bone[1] ?? null;
  const dot = name.indexOf('.');
  return dot > 0 ? name.slice(0, dot) : null;
}

/**
 * The finger chains below a forearm: each bone off the wrist, then its joints out to (not
 * including) the tip. Chains of one joint (the captain's hook) are left alone.
 */
function fingerChains(lowerArm: Bone | null): Bone[][] {
  const chains: Bone[][] = [];
  for (const start of lowerArm?.children ?? []) {
    if (!(start instanceof Bone)) continue;
    const chain: Bone[] = [];
    for (let b: Bone | null = start; b && !b.name.endsWith('_end'); b = firstChildBone(b)) chain.push(b);
    if (chain.length >= 2) chains.push(chain);
  }
  return chains;
}

/** Every NPC gets the painted face (issue #186); players keep the kit's eyes (seen from behind). */
function createFace(
  head: Bone | null,
  group: Group,
  body: CharacterBody,
  config: BodyConfig,
): CharacterFace | null {
  const colors = faceColors(body);
  if (!head || !colors) return null;
  return new CharacterFace(head, group, body, FACE_FITS[faceFamily(config.source)], colors);
}

function firstChildBone(parent: Bone | null): Bone | null {
  return (parent?.children.find((child) => child instanceof Bone) as Bone | undefined) ?? null;
}

function bone(root: Group, name: string): Bone | null {
  const found = root.getObjectByName(name);
  return found instanceof Bone ? found : null;
}

function proceduralBones(bones: readonly (Bone | null)[]): BoneRest[] {
  const rests: BoneRest[] = [];
  const seen = new Set<Bone>();
  for (const bone of bones) {
    if (!bone || seen.has(bone)) continue;
    seen.add(bone);
    rests.push({
      bone,
      position: bone.position.clone(),
      quaternion: bone.quaternion.clone(),
    });
  }
  return rests;
}

function fadeAction(action: AnimationAction, weight: number, fade: number): void {
  action.enabled = true;
  action.paused = false;
  action.setEffectiveWeight(Math.max(0, Math.min(1, weight)));
  if (weight > 0) action.fadeIn(fade);
  else action.fadeOut(fade);
}

function setBlendWeight(action: AnimationAction, weight: number): void {
  const w = Math.max(0, Math.min(1, weight));
  action.enabled = true;
  action.paused = false;
  action.setEffectiveWeight(w);
}

function syncStride(action: AnimationAction, speed: number, stride: number): void {
  const duration = Math.max(0.001, action.getClip().duration);
  const cyclesPerSecond = speed <= 0.02 ? 1 : speed / stride;
  action.setEffectiveTimeScale(Math.max(0.25, cyclesPerSecond * duration));
}

function disposeOwnedMaterial(material: Material | Material[]): void {
  if (Array.isArray(material)) {
    for (const entry of material) disposeOwnedMaterial(entry);
  } else if (material.userData.isCharacterCloneMaterial) material.dispose();
}
