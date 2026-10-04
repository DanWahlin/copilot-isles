import {
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
import type { HeightField, Tier } from '../../contracts';
import { world } from '../../uniforms';
import { LeapsDirector, seededRandom, type LeapArc, type LeapKind, type ScreenRect } from './director';
import { createDolphinGeometry, createFlyingFishGeometry, createSplashGeometry } from './geometry';
import { createDolphinMaterial, createFlyingFishMaterial, createSplashMaterial } from './material';

export interface CreateLeapsOptions {
  tier: Tier | TierSettings;
  heightField?: HeightField | null;
  seed?: number;
  titleMode?: boolean;
  avoidRects?: ScreenRect[];
  viewport?: { width: number; height: number };
}

export interface LeapsSystem {
  group: Group;
  setAvoidRects(rects: ScreenRect[]): void;
  force(kind?: LeapKind): boolean;
  update(dt: number, t: number, camera: PerspectiveCamera): void;
  dispose(): void;
}

interface Agent {
  kind: LeapKind;
  start: Vector3;
  end: Vector3;
  offset: Vector3;
  startTime: number;
  duration: number;
  height: number;
  scale: number;
  phase: number;
  /** Arc parameter where it's deep enough to hide after re-entry (it starts that deep at 1 − this). */
  dive: number;
  splashedExit: boolean;
  splashedEntry: boolean;
}

interface Splash {
  x: number;
  z: number;
  start: number;
  duration: number;
  scale: number;
  /** 0..1, shape and orientation variety. */
  seed: number;
  /** 0 breaking the surface, 1 diving back in (with a plume). */
  kind: number;
}

const MAX_DOLPHINS = 12;
const MAX_FISH = 72;
const MAX_SPLASHES = 64;
const tmpPos = new Vector3();
const tmpVel = new Vector3();
const tmpDir = new Vector3();
const tmpScale = new Vector3();
const tmpMatrix = new Matrix4();
const tmpQuat = new Quaternion();
const tmpEuler = new Euler(0, 0, 0, 'YXZ');

function resolveTier(tier: Tier | TierSettings): TierSettings {
  return typeof tier === 'string' ? tierSettings(tier) : tier;
}

function seedFromUrl(): number {
  if (typeof location === 'undefined') return 0x1ea9_5eed;
  const q = new URLSearchParams(location.search);
  const raw = q.get('seed');
  if (!raw) return 0x1ea9_5eed;
  let h = 0x811c9dc5;
  for (let i = 0; i < raw.length; i++) h = Math.imul(h ^ raw.charCodeAt(i), 0x01000193) >>> 0;
  return h || 0x1ea9_5eed;
}

/**
 * Height above the sea along a leap: a ballistic parabola in the arc parameter `s`, which breaks the
 * surface at s = 0, peaks at `height`, and re-enters at s = 1. Outside 0…1 it's under water.
 */
export function leapHeight(s: number, height: number): number {
  return 4 * height * s * (1 - s);
}

/** The arc parameter where a leap of `height` is `depth` under water again after re-entry. */
export function leapDive(height: number, depth: number): number {
  return 0.5 + 0.5 * Math.sqrt(1 + depth / Math.max(0.01, height));
}

/** How deep (m) the body's centre goes before it's hidden: its half-length plus a wave's worth. */
const HIDE_DEPTH = { dolphin: 2.6, fish: 0.7 } as const;

function pointAt(agent: Agent, s: number, out: Vector3): Vector3 {
  out.lerpVectors(agent.start, agent.end, s).add(agent.offset);
  out.y = leapHeight(s, agent.height);
  return out;
}

function velocityAt(agent: Agent, s: number, out: Vector3): Vector3 {
  out.copy(agent.end).sub(agent.start).divideScalar(agent.duration);
  out.y = (4 * agent.height * (1 - 2 * s)) / agent.duration;
  return out;
}

function spawnSplash(splashes: Splash[], x: number, z: number, t: number, scale: number, kind = 0): void {
  if (splashes.length >= MAX_SPLASHES) splashes.shift();
  const seed = Math.random();
  splashes.push({
    x,
    z,
    start: t,
    duration: kind ? 1.7 : 1.4,
    scale: scale * (0.85 + seed * 0.3),
    seed,
    kind,
  });
}

function addPod(agents: Agent[], splashes: Splash[], arc: LeapArc, now: number, rng: () => number): void {
  tmpDir.copy(arc.end).sub(arc.start).setY(0).normalize();
  const right = new Vector3(tmpDir.z, 0, -tmpDir.x);
  const max = arc.kind === 'dolphin' ? MAX_DOLPHINS : MAX_FISH;
  const count = Math.min(arc.school, Math.max(0, max - agents.filter((a) => a.kind === arc.kind).length));
  for (let i = 0; i < count; i++) {
    const lane = i - (count - 1) * 0.5;
    const height = arc.controlHeight * (0.82 + rng() * 0.35);
    const startOffset = right
      .clone()
      .multiplyScalar(lane * (arc.kind === 'dolphin' ? 1.9 : 0.75) + (rng() - 0.5) * 0.9)
      .addScaledVector(tmpDir, (rng() - 0.5) * (arc.kind === 'dolphin' ? 4.0 : 8.5));
    agents.push({
      kind: arc.kind,
      start: arc.start.clone(),
      end: arc.end.clone(),
      offset: startOffset,
      startTime: now + i * (arc.kind === 'dolphin' ? 0.18 : 0.055),
      duration: arc.duration * (0.88 + rng() * 0.25),
      height,
      scale: arc.kind === 'dolphin' ? 1.35 + rng() * 0.22 : 0.75 + rng() * 0.25,
      phase: rng() * Math.PI * 2,
      dive: leapDive(height, HIDE_DEPTH[arc.kind]),
      splashedExit: false,
      splashedEntry: false,
    });
  }
  spawnSplash(splashes, arc.start.x, arc.start.z, now, arc.kind === 'dolphin' ? 2.7 : 0.7);
}

export function createLeaps(options: CreateLeapsOptions): LeapsSystem {
  const tier = resolveTier(options.tier);
  const enabled = tier.leaps > 0 && tier.tier !== 'lite';
  const seed = options.seed ?? seedFromUrl();
  const rng = seededRandom(seed ^ 0x51a5_f15);
  const director = new LeapsDirector({
    seed,
    heightField: options.heightField ?? null,
    titleMode: options.titleMode,
    avoidRects: options.avoidRects,
    viewport: options.viewport,
  });
  const group = new Object3D() as Group;
  group.name = 'leaps';

  const dolphinGeometry = createDolphinGeometry();
  const fishGeometry = createFlyingFishGeometry();
  const splashGeometry = createSplashGeometry();
  const dolphinPhase = new InstancedBufferAttribute(new Float32Array(MAX_DOLPHINS), 1);
  const dolphinAmp = new InstancedBufferAttribute(new Float32Array(MAX_DOLPHINS), 1);
  const fishPhase = new InstancedBufferAttribute(new Float32Array(MAX_FISH), 1);
  const fishAmp = new InstancedBufferAttribute(new Float32Array(MAX_FISH), 1);
  const splashAge = new InstancedBufferAttribute(new Float32Array(MAX_SPLASHES), 1);
  const splashSeed = new InstancedBufferAttribute(new Float32Array(MAX_SPLASHES), 1);
  const splashKind = new InstancedBufferAttribute(new Float32Array(MAX_SPLASHES), 1);
  dolphinGeometry.setAttribute('leapPhase', dolphinPhase);
  dolphinGeometry.setAttribute('leapAmp', dolphinAmp);
  fishGeometry.setAttribute('leapPhase', fishPhase);
  fishGeometry.setAttribute('leapAmp', fishAmp);
  splashGeometry.setAttribute('splashAge', splashAge);
  splashGeometry.setAttribute('splashSeed', splashSeed);
  splashGeometry.setAttribute('splashKind', splashKind);

  const dolphinMesh = new InstancedMesh(dolphinGeometry, createDolphinMaterial(), MAX_DOLPHINS);
  const fishMesh = new InstancedMesh(fishGeometry, createFlyingFishMaterial(), MAX_FISH);
  const splashMesh = new InstancedMesh(splashGeometry, createSplashMaterial(), MAX_SPLASHES);
  dolphinMesh.name = 'leaps-dolphins';
  fishMesh.name = 'leaps-flying-fish';
  splashMesh.name = 'leaps-splashes';
  for (const mesh of [dolphinMesh, fishMesh, splashMesh]) {
    mesh.count = 0;
    mesh.frustumCulled = false;
    group.add(mesh);
  }

  const agents: Agent[] = [];
  const splashes: Splash[] = [];
  let nextAt = options.titleMode ? 2.5 : 12 + rng() * 18;
  let lastViewportW = 0;
  let lastViewportH = 0;

  function schedule(now: number): void {
    nextAt = now + (options.titleMode ? 6 + rng() * 14 : 20 + rng() * 40);
  }

  function force(kind: LeapKind = rng() < 0.5 ? 'dolphin' : 'fish'): boolean {
    if (!enabled || world.reducedMotion.value > 0.5) return false;
    const camera = activeCamera;
    if (!camera) return false;
    if (options.titleMode) {
      camera.getWorldDirection(tmpDir);
      tmpDir.y = 0;
      if (tmpDir.lengthSq() < 0.001) tmpDir.set(0, 0, -1);
      tmpDir.normalize();
      const right = new Vector3(tmpDir.z, 0, -tmpDir.x);
      const selected = kind;
      const start = camera.position
        .clone()
        .addScaledVector(tmpDir, selected === 'dolphin' ? 62 : 54)
        .addScaledVector(right, selected === 'dolphin' ? -9 : 11);
      start.y = 0;
      const end = start
        .clone()
        .addScaledVector(right, selected === 'dolphin' ? 34 : -28)
        .addScaledVector(tmpDir, selected === 'dolphin' ? 10 : 18);
      addPod(
        agents,
        splashes,
        {
          kind: selected,
          start,
          end,
          controlHeight: selected === 'dolphin' ? 7.5 : 1.8,
          duration: selected === 'dolphin' ? 2.6 : 3.4,
          school: selected === 'dolphin' ? 3 : 10,
          seed: 0,
        },
        world.time.value,
        rng,
      );
      return true;
    }
    const arc = director.next(camera, kind);
    if (!arc) return false;
    addPod(agents, splashes, arc.arc, world.time.value, rng);
    return true;
  }

  let activeCamera: PerspectiveCamera | null = null;

  function updateMeshes(now: number): void {
    let d = 0;
    let f = 0;
    for (let i = agents.length - 1; i >= 0; i--) {
      const a = agents[i];
      // Rise from under water, break the surface at s = 0, re-enter at s = 1, then dive out of sight.
      const local = (now - a.startTime) / a.duration;
      if (local < 0) continue;
      const s = 1 - a.dive + local;
      if (s > a.dive) {
        agents.splice(i, 1);
        continue;
      }
      pointAt(a, s, tmpPos);
      velocityAt(a, s, tmpVel);
      if (!a.splashedExit && s >= 0) {
        spawnSplash(splashes, tmpPos.x, tmpPos.z, now, a.kind === 'dolphin' ? 2.2 * a.scale : 0.6);
        a.splashedExit = true;
      }
      if (!a.splashedEntry && s >= 1) {
        spawnSplash(
          splashes,
          a.end.x + a.offset.x,
          a.end.z + a.offset.z,
          now,
          a.kind === 'dolphin' ? 2.8 * a.scale : 0.7,
          1,
        );
        a.splashedEntry = true;
      }
      const yaw = Math.atan2(tmpVel.x, tmpVel.z);
      const pitch = Math.atan2(tmpVel.y, Math.hypot(tmpVel.x, tmpVel.z));
      tmpEuler.set(
        -pitch,
        yaw,
        Math.sin((now + a.phase) * 3.0) * (a.kind === 'dolphin' ? 0.08 : 0.18),
        'YXZ',
      );
      tmpQuat.setFromEuler(tmpEuler);
      tmpScale.setScalar(a.scale);
      tmpMatrix.compose(tmpPos, tmpQuat, tmpScale);
      if (a.kind === 'dolphin' && d < MAX_DOLPHINS) {
        dolphinMesh.setMatrixAt(d, tmpMatrix);
        dolphinPhase.setX(d, a.phase);
        dolphinAmp.setX(d, s > 0 && s < 1 ? 1 : 0.6);
        d++;
      } else if (a.kind === 'fish' && f < MAX_FISH) {
        fishMesh.setMatrixAt(f, tmpMatrix);
        fishPhase.setX(f, a.phase);
        fishAmp.setX(f, 0.8);
        f++;
      }
    }
    dolphinMesh.count = d;
    fishMesh.count = f;
    dolphinMesh.instanceMatrix.needsUpdate = true;
    fishMesh.instanceMatrix.needsUpdate = true;
    dolphinPhase.needsUpdate = true;
    dolphinAmp.needsUpdate = true;
    fishPhase.needsUpdate = true;
    fishAmp.needsUpdate = true;

    let s = 0;
    for (let i = splashes.length - 1; i >= 0; i--) {
      const splash = splashes[i];
      const age = (now - splash.start) / splash.duration;
      if (age > 1) {
        splashes.splice(i, 1);
        continue;
      }
      if (s >= MAX_SPLASHES) continue;
      // Shape and growth over its life are in the shader; here only placement and a random turn.
      const scale = splash.scale * 0.75;
      tmpEuler.set(0, splash.seed * Math.PI * 2, 0, 'YXZ');
      tmpQuat.setFromEuler(tmpEuler);
      tmpMatrix.compose(tmpPos.set(splash.x, 0.04, splash.z), tmpQuat, tmpScale.set(scale, scale, scale));
      splashMesh.setMatrixAt(s, tmpMatrix);
      splashAge.setX(s, age);
      splashSeed.setX(s, splash.seed);
      splashKind.setX(s, splash.kind);
      s++;
    }
    splashMesh.count = s;
    splashMesh.instanceMatrix.needsUpdate = true;
    splashAge.needsUpdate = true;
    splashSeed.needsUpdate = true;
    splashKind.needsUpdate = true;
  }

  return {
    group,
    setAvoidRects(rects) {
      director.setAvoidRects(rects);
    },
    force,
    update(_dt, t, camera) {
      activeCamera = camera;
      if (lastViewportW !== window.innerWidth || lastViewportH !== window.innerHeight) {
        lastViewportW = window.innerWidth;
        lastViewportH = window.innerHeight;
        director.setViewport({ width: Math.max(1, lastViewportW), height: Math.max(1, lastViewportH) });
      }
      if (enabled && world.reducedMotion.value < 0.5 && t >= nextAt) {
        const projected = director.next(camera, 'any');
        if (projected) addPod(agents, splashes, projected.arc, t, rng);
        schedule(t);
      }
      updateMeshes(t);
    },
    dispose() {
      dolphinGeometry.dispose();
      fishGeometry.dispose();
      splashGeometry.dispose();
      dolphinMesh.material.dispose();
      fishMesh.material.dispose();
      splashMesh.material.dispose();
    },
  };
}
