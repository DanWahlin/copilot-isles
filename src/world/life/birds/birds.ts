// Adapted from Tidewater © 2026 DRG Software Solutions LLC, MIT, src/world/wildlife/Birds.js@d32799f
// Adapted from Tidewater © 2026 DRG Software Solutions LLC, MIT, src/world/wildlife/Flight.js@d32799f
import {
  Color,
  Euler,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  Object3D,
  Quaternion,
  Vector3,
  type Group,
  type PerspectiveCamera,
} from 'three/webgpu';
import { tierSettings, type TierSettings } from '../../../engine/quality';
import type { Tier } from '../../contracts';
import { world } from '../../uniforms';
import { createBirdGeometry } from './geometry';
import { createBirdMaterial } from './material';
import { clamp } from '../../../util/math';

export interface CreateBirdsOptions {
  tier: Tier | TierSettings;
  perches: Vector3[];
  center: Vector3;
  radius: number;
  seed?: number;
  /** Size multiplier for every bird; default 1. */
  scale?: number;
  /** Flight band above `center.y` (m); default 18-73 m. */
  altitude?: readonly [min: number, max: number];
}

export interface BirdsSystem {
  group: Group;
  update(dt: number, t: number, camera: PerspectiveCamera): void;
  dispose(): void;
}

type BirdState = 'fly' | 'perched' | 'takeoff';

interface BirdAgent {
  pos: Vector3;
  vel: Vector3;
  target: Vector3;
  yaw: number;
  bank: number;
  pitch: number;
  speed: number;
  scale: number;
  seed: number;
  flapPhase: number;
  flapAmp: number;
  /** 1 perched (wings folded), 0 flying; eased between. */
  fold: number;
  state: BirdState;
  perch: number;
  timer: number;
  circleDir: number;
}

const tmpObject = new Object3D();
const tmpEuler = new Euler(0, 0, 0, 'YXZ');
const tmpQuat = new Quaternion();
const tmpScale = new Vector3();
const tmpMatrix = new Matrix4();
const tmpSep = new Vector3();
const tmpDelta = new Vector3();
const tmpDesired = new Vector3();
const tmpColor = new Color();

function resolveTier(tier: Tier | TierSettings): TierSettings {
  return typeof tier === 'string' ? tierSettings(tier) : tier;
}

function random(seed: number): () => number {
  let s = seed >>> 0 || 0x12345678;
  return () => {
    s = Math.imul(s ^ (s >>> 15), 1 | s);
    s ^= s + Math.imul(s ^ (s >>> 7), 61 | s);
    return ((s ^ (s >>> 14)) >>> 0) / 4294967296;
  };
}

function angleDiff(a: number, b: number): number {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

const DEFAULT_ALTITUDE: readonly [number, number] = [18, 73];

function chooseTarget(
  agent: BirdAgent,
  center: Vector3,
  radius: number,
  rng: () => number,
  alt: readonly [number, number] = DEFAULT_ALTITUDE,
): void {
  const a = rng() * Math.PI * 2;
  const r = radius * (0.25 + rng() * 0.75);
  agent.target.set(
    center.x + Math.cos(a) * r,
    center.y + alt[0] + rng() * (alt[1] - alt[0]) * 0.87,
    center.z + Math.sin(a) * r,
  );
  agent.timer = 8 + rng() * 14;
  agent.circleDir = rng() < 0.5 ? -1 : 1;
}

function setMatrix(agent: BirdAgent): Matrix4 {
  tmpObject.position.copy(agent.pos);
  tmpEuler.set(agent.pitch, agent.yaw, -agent.bank, 'YXZ');
  tmpQuat.setFromEuler(tmpEuler);
  tmpObject.quaternion.copy(tmpQuat);
  // Perched birds are seen up close: a real gull's size (the flock's size reads well only far off).
  tmpScale.setScalar(agent.scale * (1 - 0.45 * agent.fold));
  tmpObject.scale.copy(tmpScale);
  tmpObject.updateMatrix();
  tmpMatrix.copy(tmpObject.matrix);
  return tmpMatrix;
}

export function createBirds(options: CreateBirdsOptions): BirdsSystem {
  const tier = resolveTier(options.tier);
  const count = Math.max(0, tier.birds);
  const rng = random(options.seed ?? 0xb17d5);
  const agents: BirdAgent[] = [];
  const alt = options.altitude ?? DEFAULT_ALTITUDE;
  const perchCount = Math.min(options.perches.length, Math.ceil(count * 0.24));
  for (let i = 0; i < count; i += 1) {
    const perched = i < perchCount;
    const pos = perched
      ? options.perches[i].clone()
      : new Vector3(
          options.center.x + (rng() - 0.5) * options.radius,
          options.center.y + alt[0] + rng() * (alt[1] - alt[0]),
          options.center.z + (rng() - 0.5) * options.radius,
        );
    const agent: BirdAgent = {
      pos,
      vel: new Vector3(Math.sin(rng() * Math.PI * 2), 0, Math.cos(rng() * Math.PI * 2)).multiplyScalar(8),
      target: new Vector3(),
      yaw: rng() * Math.PI * 2,
      bank: 0,
      pitch: 0,
      speed: 7.5 + rng() * 4,
      scale: (1.6 + rng() * 0.35) * (options.scale ?? 1),
      seed: rng(),
      flapPhase: rng() * Math.PI * 2,
      flapAmp: perched ? 0 : 0.25 + rng() * 0.45,
      fold: perched ? 1 : 0,
      state: perched ? 'perched' : 'fly',
      perch: perched ? i : -1,
      timer: perched ? 16 + rng() * 45 : 0,
      circleDir: rng() < 0.5 ? -1 : 1,
    };
    chooseTarget(agent, options.center, options.radius, rng, alt);
    agents.push(agent);
  }

  const geometry = createBirdGeometry();
  const flapPhase = new InstancedBufferAttribute(new Float32Array(Math.max(1, count)), 1);
  const flapAmp = new InstancedBufferAttribute(new Float32Array(Math.max(1, count)), 1);
  // rgb tint and, in w, the wing fold (one buffer: WebGPU allows 8 vertex buffers per pipeline).
  const birdTint = new InstancedBufferAttribute(new Float32Array(Math.max(1, count) * 4), 4);
  geometry.setAttribute('flapPhase', flapPhase);
  geometry.setAttribute('flapAmp', flapAmp);
  geometry.setAttribute('birdTint', birdTint);
  const mesh = new InstancedMesh(geometry, createBirdMaterial(), Math.max(1, count));
  mesh.name = 'birds';
  mesh.count = 0;
  mesh.frustumCulled = false;
  const group = new Object3D() as Group;
  group.name = 'birds';
  group.add(mesh);

  function updateAgent(agent: BirdAgent, dt: number): void {
    if (agent.state === 'perched') {
      const perch = options.perches[agent.perch];
      if (perch) agent.pos.copy(perch);
      const windYaw = Math.atan2(-world.windDir.value.x, -world.windDir.value.y);
      agent.yaw += angleDiff(windYaw, agent.yaw) * clamp(dt * 3, 0, 1);
      agent.flapAmp = 0;
      agent.timer -= dt;
      if (agent.timer <= 0) {
        agent.state = 'takeoff';
        agent.timer = 1.2;
        agent.vel.set(Math.sin(agent.yaw), 0.8, Math.cos(agent.yaw)).multiplyScalar(agent.speed * 0.7);
      }
      return;
    }

    agent.timer -= dt;
    if (agent.state === 'takeoff') {
      agent.flapAmp = 1;
      agent.timer -= dt;
      agent.target.set(
        agent.pos.x + Math.sin(agent.yaw) * 35,
        agent.pos.y + 18,
        agent.pos.z + Math.cos(agent.yaw) * 35,
      );
      if (agent.timer <= 0) agent.state = 'fly';
    } else if (agent.pos.distanceTo(agent.target) < 12 || agent.timer <= 0) {
      if (options.perches.length > 0 && rng() < 0.16) {
        const p = Math.floor(rng() * options.perches.length);
        agent.target.copy(options.perches[p]);
        agent.target.y += 6;
        agent.perch = p;
        agent.timer = 5 + rng() * 5;
      } else chooseTarget(agent, options.center, options.radius, rng, alt);
    }

    tmpSep.set(0, 0, 0);
    for (const other of agents) {
      if (other === agent || other.state === 'perched') continue;
      const d = agent.pos.distanceTo(other.pos);
      if (d > 0.001 && d < 9)
        tmpSep.addScaledVector(tmpDelta.copy(agent.pos).sub(other.pos), (9 - d) / (d * 9));
    }

    tmpDesired.copy(agent.target).sub(agent.pos).addScaledVector(tmpSep, 18);
    if (tmpDesired.lengthSq() < 0.001) tmpDesired.set(Math.sin(agent.yaw), 0, Math.cos(agent.yaw));
    const wantedYaw = Math.atan2(tmpDesired.x, tmpDesired.z);
    const yawError = angleDiff(wantedYaw, agent.yaw);
    const maxTurn = dt * 1.35;
    const turn = clamp(yawError, -maxTurn, maxTurn);
    agent.yaw += turn;
    agent.bank +=
      (clamp((turn / Math.max(dt, 0.001)) * 0.42, -0.85, 0.85) - agent.bank) * clamp(dt * 4, 0, 1);
    const targetY = clamp(
      agent.target.y,
      options.center.y + Math.min(5, alt[0]),
      options.center.y + alt[1] + 17,
    );
    const climb = clamp((targetY - agent.pos.y) * 0.55, -2.2, 2.8);
    agent.pitch += (clamp(climb / Math.max(agent.speed, 1), -0.32, 0.38) - agent.pitch) * clamp(dt * 3, 0, 1);
    const wind = world.windSpeed.value * 0.07;
    agent.vel.set(
      Math.sin(agent.yaw) * agent.speed + world.windDir.value.x * wind,
      climb,
      Math.cos(agent.yaw) * agent.speed + world.windDir.value.y * wind,
    );
    agent.pos.addScaledVector(agent.vel, dt);
    agent.flapAmp +=
      ((Math.abs(climb) > 0.9 || Math.abs(agent.bank) > 0.45 ? 0.75 : 0.22) - agent.flapAmp) *
      clamp(dt * 2.4, 0, 1);

    const fromCenter = Math.hypot(agent.pos.x - options.center.x, agent.pos.z - options.center.z);
    if (fromCenter > options.radius * 1.2)
      chooseTarget(agent, options.center, options.radius * 0.75, rng, alt);
    if (agent.perch >= 0 && agent.state === 'fly') {
      const perch = options.perches[agent.perch];
      if (perch && agent.pos.distanceTo(perch) < 3.5 && Math.abs(agent.vel.y) < 1.5) {
        agent.state = 'perched';
        agent.timer = 14 + rng() * 42;
        agent.pos.copy(perch);
      }
    }
  }

  return {
    group,
    update(dt, _t, camera) {
      let visible = 0;
      for (const agent of agents) {
        updateAgent(agent, Math.min(0.05, dt));
        agent.fold +=
          ((agent.state === 'perched' ? 1 : 0) - agent.fold) * clamp(Math.min(0.05, dt) * 7, 0, 1);
        if (agent.pos.distanceTo(camera.position) > 1000) continue;
        mesh.setMatrixAt(visible, setMatrix(agent));
        flapPhase.setX(visible, agent.flapPhase + agent.seed * 8);
        flapAmp.setX(visible, agent.flapAmp);
        tmpColor.setHSL(0.58, 0.04, 0.82 + agent.seed * 0.08);
        birdTint.setXYZW(visible, tmpColor.r, tmpColor.g, tmpColor.b, agent.fold);
        visible += 1;
      }
      mesh.count = visible;
      mesh.instanceMatrix.needsUpdate = true;
      flapPhase.needsUpdate = true;
      flapAmp.needsUpdate = true;
      birdTint.needsUpdate = true;
    },
    dispose() {
      geometry.dispose();
      if (Array.isArray(mesh.material)) for (const material of mesh.material) material.dispose();
      else mesh.material.dispose();
      mesh.dispose();
    },
  };
}
