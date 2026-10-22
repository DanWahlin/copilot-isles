/**
 * The dock gull: the title's seagull (Seagull by Poly by Google, CC-BY 3.0, see ASSETS.md) standing
 * on the pier-end bollard by the crane board, and living there. It looks about in quick, birdlike
 * snaps, watches you when you're near, turns round on the bollard in little hops, shuffles, preens
 * under a wing and throws its head back to call. One draw: the head turns and nods in the vertex
 * shader on a smooth neck weight, so there's no seam.
 */
import {
  BufferAttribute,
  Group,
  Mesh,
  MeshStandardNodeMaterial,
  type PerspectiveCamera,
  type Texture,
} from 'three/webgpu';
import { Fn, attribute, cos, positionLocal, sin, uniform, vec3 } from 'three/tsl';
import type { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { ownMap } from '../../engine/own-map';
import { world } from '../uniforms';

export interface DockGull {
  readonly group: Group;
  /** Resolves once the model is loaded and in the group. */
  readonly ready: Promise<void>;
  update(dt: number, t: number, camera: PerspectiveCamera): void;
  dispose(): void;
}

// Model space (Poly's units): +z forward, +y up, feet at y −30.1 centred near z 7.8, standing 58 tall.
const FEET_Y = -30.13;
const FEET_Z = 7.8;
const MODEL_TALL = 58.2;
/** A herring gull stands about half a metre tall. */
const TALL_M = 0.5;
/** The neck: the head turns about a vertical axis here and nods about a level one. */
const NECK = { y: 11, z: 17 };

type Act = 'idle' | 'look' | 'turn' | 'shuffle' | 'preen' | 'call';

function rand(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function wrap(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export function createDockGull(o: {
  loader: GLTFLoader;
  url: string;
  /** Where the feet stand (the bollard's top), and the way it first faces. */
  at: { x: number; y: number; z: number };
  heading: number;
  seed?: number;
}): DockGull {
  const group = new Group();
  group.name = 'dock gull';
  group.position.set(o.at.x, o.at.y, o.at.z);
  const body = new Group();
  group.add(body);

  const headYawU = uniform(0);
  const headPitchU = uniform(0);
  let mesh: Mesh | null = null;
  let material: MeshStandardNodeMaterial | null = null;
  let map: Texture | null = null;
  let disposed = false;

  const ready = o.loader.loadAsync(o.url).then((gltf) => {
    let src: Mesh | null = null;
    gltf.scene.traverse((c) => {
      if (!src && (c as Mesh).isMesh) src = c as Mesh;
    });
    if (!src) return;
    const source = src as Mesh;
    const geo = source.geometry;
    // Neck weight: 0 on the body, 1 on the head, eased across the neck.
    const pos = geo.getAttribute('position');
    const w = new Float32Array(pos.count);
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      const u = Math.min(1, Math.max(0, (y - 7) / 8));
      w[i] = u * u * (3 - 2 * u);
    }
    geo.setAttribute('headW', new BufferAttribute(w, 1));
    const srcMat = (Array.isArray(source.material) ? source.material[0] : source.material) as {
      map?: Texture | null;
    };
    map = srcMat.map ?? null;
    material = new MeshStandardNodeMaterial({ roughness: 0.85, metalness: 0 });
    // Not as `map` (`ownMap`): its texture is freed with Anchorage's dormancy while other looks with
    // a `map` still build (issues 264, 265).
    if (map) ownMap(material, map);
    material.positionNode = Fn(() => {
      const p = positionLocal;
      const hw = attribute('headW', 'float');
      const pitch = headPitchU.mul(hw);
      const yaw = headYawU.mul(hw);
      const dy = p.y.sub(NECK.y);
      const dz = p.z.sub(NECK.z);
      // Nod (positive tips the bill down), then turn.
      const y1 = dy.mul(cos(pitch)).sub(dz.mul(sin(pitch)));
      const z1 = dy.mul(sin(pitch)).add(dz.mul(cos(pitch)));
      const x2 = p.x.mul(cos(yaw)).add(z1.mul(sin(yaw)));
      const z2 = p.x
        .mul(sin(yaw))
        .negate()
        .add(z1.mul(cos(yaw)));
      return vec3(x2, y1.add(NECK.y), z2.add(NECK.z));
    })();
    const s = TALL_M / MODEL_TALL;
    mesh = new Mesh(geo, material);
    mesh.name = 'dock gull model';
    mesh.scale.setScalar(s);
    mesh.position.set(0, -FEET_Y * s, -FEET_Z * s);
    // No sun shadow: a few pixels on the bollard, and its head-turn graph needed shadow shaders of
    // its own (2 programs; PLAN §15.4).
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    body.add(mesh);
    (source.material as { dispose?: () => void }).dispose?.();
    if (disposed) {
      body.remove(mesh);
      mesh.geometry.dispose();
      material.dispose();
      map?.dispose();
      mesh = null;
      material = null;
      map = null;
    }
  });

  const rng = rand(o.seed ?? 0x6011);
  let heading = o.heading;
  let act: Act = 'idle';
  let actT = 1.5;
  // Head: where it's snapping to, and where it is.
  let headYaw = 0;
  let headPitch = 0;
  let wantYaw = 0;
  let wantPitch = 0;
  let glanceT = 0.8;
  // Hops (turning round or shuffling on the bollard top).
  let hopsLeft = 0;
  /** 0..1 through the current hop; 1 when standing. */
  let hopT = 1;
  let preenSide = 1;
  let hopFrom = 0;
  let hopTo = 0;
  let turnGoal = heading;
  let offX = 0;
  let offZ = 0;
  let fromX = 0;
  let fromZ = 0;
  let toX = 0;
  let toZ = 0;
  let lean = 0;
  let calledNear = false;

  function startHop(toHeading: number, dx: number, dz: number): void {
    hopT = 0;
    hopFrom = heading;
    hopTo = toHeading;
    fromX = offX;
    fromZ = offZ;
    toX = dx;
    toZ = dz;
  }

  function choose(camAngle: number, near: boolean, reduced: boolean): void {
    const r = rng();
    if (near && Math.abs(wrap(camAngle - heading)) > 1.2 && r < 0.55) {
      act = 'turn';
      turnGoal = camAngle + (rng() - 0.5) * 0.6;
    } else if (r < 0.28) {
      act = 'look';
    } else if (r < 0.48) {
      act = 'turn';
      turnGoal = heading + (rng() < 0.5 ? -1 : 1) * (0.8 + rng() * 1.8);
    } else if (r < 0.6 && !reduced) {
      act = 'shuffle';
    } else if (r < 0.75) {
      act = 'preen';
      preenSide = rng() < 0.5 ? -1 : 1;
    } else if (r < 0.85) {
      act = 'call';
    } else {
      act = 'idle';
    }
    actT =
      act === 'preen'
        ? 1.6 + rng()
        : act === 'call'
          ? 1.0
          : act === 'look'
            ? 2 + rng() * 2
            : 1.5 + rng() * 2.5;
    if (act === 'turn') {
      const left = Math.abs(wrap(turnGoal - heading));
      hopsLeft = reduced ? 0 : Math.max(1, Math.ceil(left / 0.9));
    } else if (act === 'shuffle') {
      hopsLeft = 1 + Math.floor(rng() * 2);
    } else hopsLeft = 0;
  }

  return {
    group,
    ready,
    update(dt, t, camera) {
      if (!mesh) return;
      const dx = camera.position.x - group.position.x;
      const dz = camera.position.z - group.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 90) return;
      const reduced = world.reducedMotion.value > 0.5;
      const camAngle = Math.atan2(dx, dz);
      const near = dist < 7;

      // A close approach: it turns to face you and calls (once per approach).
      if (dist < 2.4 && !calledNear) {
        calledNear = true;
        act = 'call';
        actT = 1.0;
        hopsLeft = 0;
      } else if (dist > 4) calledNear = false;

      actT -= dt;
      if (actT <= 0 && hopsLeft === 0 && hopT >= 1) choose(camAngle, near, reduced);

      // Hops: each one about a fifth of a second, a few centimetres up.
      if (hopT < 1) {
        hopT = Math.min(1, hopT + dt / 0.2);
        const u = hopT * hopT * (3 - 2 * hopT);
        heading = hopFrom + wrap(hopTo - hopFrom) * u;
        offX = fromX + (toX - fromX) * u;
        offZ = fromZ + (toZ - fromZ) * u;
        body.position.y = Math.sin(hopT * Math.PI) * 0.03;
      } else {
        body.position.y = 0;
        if (hopsLeft > 0) {
          hopsLeft--;
          if (act === 'turn') {
            const left = wrap(turnGoal - heading);
            const step = Math.sign(left) * Math.min(Math.abs(left), 0.9);
            startHop(heading + step, offX * 0.5, offZ * 0.5);
          } else {
            const a = rng() * Math.PI * 2;
            const r = 0.03 + rng() * 0.05;
            startHop(heading + (rng() - 0.5) * 0.5, Math.cos(a) * r, Math.sin(a) * r);
          }
        } else if (act === 'turn' && reduced) {
          heading += wrap(turnGoal - heading) * (1 - Math.exp(-dt * 1.5));
        }
      }

      // Head: quick snaps between holds, like a real gull.
      glanceT -= dt;
      const toCam = wrap(camAngle - heading);
      if (act === 'preen') {
        // Head round to the back and down into the wing, nibbling.
        wantYaw = preenSide * 1.7;
        wantPitch = 0.75 + Math.sin(t * 22) * 0.08;
      } else if (act === 'call') {
        wantYaw = near ? Math.max(-1, Math.min(1, toCam)) : 0;
        wantPitch = actT > 0.6 ? 0.25 : -0.75;
      } else if (glanceT <= 0) {
        glanceT = reduced ? 1.6 + rng() * 2 : 0.5 + rng() * 1.3;
        if (near && rng() < 0.65) {
          wantYaw = Math.max(-1.2, Math.min(1.2, toCam + (rng() - 0.5) * 0.3));
          wantPitch = (rng() - 0.6) * 0.3;
        } else {
          wantYaw = (rng() - 0.5) * 2.0;
          wantPitch = (rng() - 0.5) * 0.45;
        }
      }
      if (act !== 'preen' && Math.abs(wantYaw) > 1.4) wantYaw = Math.sign(wantYaw) * 1.2;
      const snap = 1 - Math.exp(-dt * (reduced ? 5 : 16));
      headYaw += (wantYaw - headYaw) * snap;
      headPitch += (wantPitch - headPitch) * snap;
      headYawU.value = headYaw;
      headPitchU.value = headPitch;

      // The body: a lean back to call, forward to preen, and breathing.
      const wantLean = act === 'call' && actT < 0.6 ? -0.22 : act === 'preen' ? 0.12 : 0;
      lean += (wantLean - lean) * (1 - Math.exp(-dt * 8));
      body.rotation.x = lean;
      body.scale.y = 1 + Math.sin(t * 2.3) * 0.012;
      group.rotation.y = heading;
      body.position.x = offX;
      body.position.z = offZ;
    },
    dispose() {
      disposed = true;
      mesh?.geometry.dispose();
      material?.dispose();
      map?.dispose();
      mesh = null;
      material = null;
      map = null;
    },
  };
}
