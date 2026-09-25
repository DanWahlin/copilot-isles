import {
  AnimationAction,
  AnimationClip,
  AnimationMixer,
  Bone,
  LoopRepeat,
  MathUtils,
  Mesh,
  Object3D,
  Quaternion,
  Vector3,
  type Group,
  type Material,
} from 'three/webgpu';
import { smoothstep, wrapAngle } from '../../util/math';
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
  type LookTarget,
  type PlayerBody,
} from './types';

const WALK_STRIDE_METERS = 1.15;
const JOG_STRIDE_METERS = 1.62;
const RUN_STRIDE_METERS = 2.12;
const WALK_SPEED = 1.35;
const JOG_SPEED = 2.35;
const RUN_SPEED = 4.15;
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
  private readonly upperLegL: Bone | null;
  private readonly upperLegR: Bone | null;
  private readonly lowerLegL: Bone | null;
  private readonly lowerLegR: Bone | null;
  private readonly lowerLegEndL: Bone | null;
  private readonly lowerLegEndR: Bone | null;
  private readonly footL: Bone | null;
  private readonly footR: Bone | null;
  private readonly head: Bone | null;
  private readonly neck: Bone | null;
  private readonly targetWorld = new Vector3();
  private readonly lookWorld = new Vector3();
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
  private targetSpeed = 0;
  private visualSpeed = 0;
  private previousVisualSpeed = 0;
  private locomotionClock = 0;
  private idleClock = Math.random() * 2;
  private idleFidgetAt = 3.2 + Math.random() * 2.6;
  private idleFidget = 0;
  private idleFidgetKind = 0;
  private activeClip: CharacterClip = 'idle';
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
    this.npc = !PLAYER_BODIES.includes(body as PlayerBody);
    this.npcAnimRate = Math.max(0.1, options.tier?.npcAnimRate ?? 1);
    this.updateTarget = options.updateTarget ?? null;
    this.capsule = { radius: config.radius * config.scale, height: config.height * config.scale };
    this.mixer = new AnimationMixer(group);
    for (const clipName of CHARACTER_CLIPS) {
      const clip = clips.get(clipName);
      if (!clip) continue;
      const action = this.mixer.clipAction(bindableClip(clip, group));
      action.loop = LoopRepeat;
      action.enabled = true;
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
    this.baseScale = config.scale;
    this.lastHeading = group.rotation.y;
    const root = group.getObjectByName('Root');
    this.rigMeters = 1 / Math.max(1, root?.getWorldScale(new Vector3()).x ?? 100);
    this.mixer.update(0.001);
    this.captureArmCarry();
  }

  play(clip: CharacterClip, fade = 0.22): void {
    if (!this.actions.has(clip)) return;
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

  update(dt: number): void {
    const step = this.animationStep(dt);
    if (step > 0) {
      this.mixer.update(step);
      this.applyProceduralPolish(step);
    }
    this.applyLookAt();
    this.lastVerticalSpeed = this.verticalSpeed;
  }

  dispose(): void {
    this.mixer.stopAllAction();
    this.group.traverse((object) => {
      if (object instanceof Mesh) disposeOwnedMaterial(object.material);
      if (object instanceof Mesh && object.userData.ownedGeometry) object.geometry.dispose();
    });
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
    if (distanceSq > 170 * 170) return Math.max(interval, 0.5);
    if (distanceSq > 95 * 95) interval = Math.max(interval, 1 / 10);
    else if (distanceSq > 55 * 55) interval = Math.max(interval, 1 / 20);
    return interval;
  }

  private applyLookAt(): void {
    if (!this.lookTarget || (!this.head && !this.neck)) return;
    if (this.lookTarget instanceof Object3D) this.lookTarget.getWorldPosition(this.lookWorld);
    else this.lookWorld.copy(this.lookTarget);
    if (this.neck) this.neck.lookAt(this.lookWorld);
    if (this.head) this.head.lookAt(this.lookWorld);
  }

  private applyProceduralPolish(dt: number): void {
    const yaw = this.group.rotation.y;
    const turnRate = MathUtils.clamp(wrapAngle(yaw - this.lastHeading) / Math.max(0.001, dt), -8, 8);
    this.lastHeading = yaw;
    if (!LOCOMOTION_CLIPS.has(this.activeClip)) {
      this.group.rotation.set(0, yaw, 0);
      this.group.scale.setScalar(this.baseScale);
      return;
    }

    const speedRate = this.groundMode === 'air' ? 5 : 11;
    this.visualSpeed += (this.targetSpeed - this.visualSpeed) * (1 - Math.exp(-speedRate * dt));
    const accel = (this.visualSpeed - this.previousVisualSpeed) / Math.max(0.001, dt);
    this.previousVisualSpeed = this.visualSpeed;
    const speed01 = MathUtils.clamp(this.visualSpeed / RUN_SPEED, 0, 1);
    const move = smoothstep(0.05, 0.75, this.visualSpeed);
    const npcScale = this.npc ? 0.55 : 1;
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
    const breath = Math.sin(this.idleClock * 2.1) * (1 - move) * 0.012;
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
    if (move > 0.1 || this.groundMode === 'air') {
      this.idleFidget = 0;
      return;
    }
    if (this.idleClock > this.idleFidgetAt && this.idleFidget <= 0) {
      this.idleFidget = 1.8 + Math.random() * 0.7;
      this.idleFidgetKind = (this.idleFidgetKind + 1 + Math.floor(Math.random() * 2)) % 3;
      this.idleFidgetAt = this.idleClock + 5 + Math.random() * 4;
    }
    if (this.idleFidget <= 0) return;
    this.idleFidget = Math.max(0, this.idleFidget - dt);
    const t = 1 - this.idleFidget / 2.5;
    const e = Math.sin(MathUtils.clamp(t, 0, 1) * Math.PI);
    const side = this.idleFidgetKind === 0 ? 1 : -1;
    this.torso?.rotateY(e * 0.055 * side * npcScale);
    this.neck?.rotateY(e * 0.08 * side * npcScale);
    if (!this.lookTarget) this.head?.rotateY(e * 0.1 * side * npcScale);
    if (this.idleFidgetKind === 1) {
      this.shoulderR?.rotateZ(-e * 0.08 * npcScale);
      this.upperArmR?.rotateX(e * 0.16 * npcScale);
    } else if (this.idleFidgetKind === 2) {
      this.shoulderL?.rotateZ(e * 0.06 * npcScale);
      this.upperArmL?.rotateX(e * 0.12 * npcScale);
    }
  }
}

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

function bone(root: Group, name: string): Bone | null {
  const found = root.getObjectByName(name);
  return found instanceof Bone ? found : null;
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
