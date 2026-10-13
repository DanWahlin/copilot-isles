/**
 * A fishing boat riding at anchor off an island: a small wooden rowboat (Quaternius Ships Pack, CC0)
 * with two fishermen (KayKit Adventurers, CC0) sitting in it. It rides the real swell, swings slowly
 * on its anchor rope, one fisherman fishes (a rod in hand, a line down to a bobbing float, a fresh
 * cast now and then), and the other waves when you come by.
 *
 * The fishermen sit with their legs on one animation layer and their arms on another, so a wave or a
 * cast plays over the sitting pose without standing them up.
 */
import {
  CharacterLod,
  attachCharacterLod,
  buildLodsNow,
  loadLodSimplifier,
  type LodSimplifier,
} from '../characters/character-lod';
import { mergeSkinnedParts, shareSkinning } from '../characters/shared-skinning';
import { palettedMaterial } from '../characters/stage-light';
import { unreflected } from '../reflection';
import {
  AnimationMixer,
  Box3,
  BufferAttribute,
  BufferGeometry,
  Color,
  CylinderGeometry,
  Group,
  LoopOnce,
  Mesh,
  MeshStandardNodeMaterial,
  Object3D,
  Quaternion,
  SphereGeometry,
  Vector3,
  type AnimationAction,
  type AnimationClip,
  type Material,
  type PerspectiveCamera,
  type Texture,
} from 'three/webgpu';
import type { GLTF, GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { CircleObstacle, WaveSampler } from '../contracts';
import { world } from '../uniforms';

/** Where a fishing boat lies at anchor, and which way its bow points (radians, 0 = +z). */
export interface FishingBoatSpot {
  readonly x: number;
  readonly z: number;
  readonly heading: number;
}

export interface FishingBoat {
  readonly group: Group;
  /** Resolves once the boat and crew are loaded and in the group. */
  readonly ready: Promise<void>;
  /** So the ship sails round it. */
  readonly shipObstacle: CircleObstacle;
  update(dt: number, t: number, camera: PerspectiveCamera): void;
  dispose(): void;
}

const BOAT_LENGTH = 4.2;
/** How far the hull sits below the water at its lowest point (its draught). */
const DRAUGHT = 0.28;
/** The fishermen's standing height (the island's NPCs are about 1.75 m). */
const FISHER_TALL = 1.62;
/** Arm-layer bones (KayKit rig, names as three sanitises them): the rest of the body stays sitting. */
const ARM_TRACK = /^(upperarm|lowerarm|wrist|hand|handslot|elbowIK|handIK|head)/;
/** The fishermen stop animating past this (they're specks), and the boat stops bobbing past FAR. */
const ANIMATE_NEAR = 260;
const FAR = 700;
/** The waver greets you when you come this close (and then not again for a while). */
const WAVE_NEAR = 60;
const WAVE_AGAIN = 30;

/** Gives a geometry a flat vertex colour (sRGB hex), for the shared vertex-coloured gear material. */
function paint(g: BufferGeometry, hex: number): void {
  const c = new Color(hex);
  const n = g.getAttribute('position').count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    a[i * 3] = c.r;
    a[i * 3 + 1] = c.g;
    a[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new BufferAttribute(a, 3));
}

const _v = new Vector3();
const _a = new Vector3();
const _b = new Vector3();
const _up = new Vector3(0, 1, 0);
const _q = new Quaternion();
const _out = new Vector3();
const _dir = new Vector3();
const ROD_LENGTH = 2.4;
/** The rod's lean while fishing, a cast's wind-up and its throw (boat-local: +x over the side, +y up). */
const ROD_FISH = new Vector3(0.62, 0.78, 0).normalize();
const ROD_BACK = new Vector3(-0.35, 0.94, 0).normalize();
const ROD_THROW = new Vector3(0.93, 0.36, 0).normalize();

function splitClip(clip: AnimationClip, arms: boolean): AnimationClip {
  const out = clip.clone();
  out.name = `${clip.name}${arms ? ':arms' : ':body'}`;
  out.tracks = clip.tracks.filter((track) => ARM_TRACK.test(track.name.split('.')[0]!) === arms);
  return out;
}

interface Fisher {
  readonly root: Object3D;
  readonly mixer: AnimationMixer;
  readonly sitArms: AnimationAction;
  readonly cheer: AnimationAction;
  readonly cast: AnimationAction;
  readonly handSlot: Object3D | null;
  /** 'sit', or the one-shot arm action playing over it. */
  doing: 'sit' | 'cheer' | 'cast';
  left: number;
}

/** Sets a fisher sitting on a thwart: his hips at `seatY` in the boat, facing `yaw`. */
function makeFisher(
  gltf: GLTF,
  at: { x: number; seatY: number; z: number; yaw: number },
  simplify: LodSimplifier | null,
): Fisher {
  const model = gltf.scene;
  model.traverse((o) => {
    const m = o as Mesh;
    if (m.isMesh) {
      m.castShadow = true;
      m.receiveShadow = true;
    }
  });
  const root = new Group();
  root.name = 'fisherman';
  root.add(model);
  const box = new Box3().setFromObject(model);
  model.scale.setScalar(FISHER_TALL / Math.max(0.01, box.max.y - box.min.y));
  const mixer = new AnimationMixer(model);
  const clip = (name: string) => {
    const c = gltf.animations.find((a) => a.name === name);
    if (!c) throw new Error(`Fisher clip missing: ${name}`);
    return c;
  };
  const sit = clip('Sit_Chair_Idle');
  mixer.clipAction(splitClip(sit, false)).play();
  const sitArms = mixer.clipAction(splitClip(sit, true));
  sitArms.play();
  const once = (name: string): AnimationAction => {
    const action = mixer.clipAction(splitClip(clip(name), true));
    action.setLoop(LoopOnce, 1);
    action.clampWhenFinished = false;
    return action;
  };
  const cheer = once('Cheer');
  const cast = once('Throw');
  // Put his hips on the seat in the sitting pose.
  mixer.update(0);
  model.updateMatrixWorld(true);
  const hips = model.getObjectByName('hips');
  const hipsY = hips ? hips.getWorldPosition(_v).y : box.max.y * 0.3;
  root.position.set(at.x, at.seatY - hipsY, at.z);
  root.rotation.y = at.yaw;
  // One skinned mesh per fisher (his parts share a rig and a texture), then the characters' shared
  // skinning shader (issue 235); like every character, not in the mirror.
  mergeSkinnedParts(model);
  // His texture as a palette, like the characters' (and his cape's and mug's, like the painted
  // signs'), so his shadows share theirs (PLAN §15.4).
  model.traverse((o) => {
    const m = o as Mesh;
    if (m.isMesh && !Array.isArray(m.material)) m.material = palettedMaterial(m.material);
  });
  shareSkinning(model);
  // Levels of detail like the characters' (his merged mesh is his own), picked as he's drawn.
  buildLodsNow(model, simplify);
  attachCharacterLod(model, new CharacterLod(root));
  // Frustum-cull him like the characters: his bind-pose bounds, padded for the sitting pose.
  model.traverse((o) => {
    const m = o as Mesh;
    if (!m.isMesh) return;
    m.frustumCulled = true;
    if (!('sharedSkin' in m)) return;
    m.geometry.computeBoundingSphere();
    m.geometry.boundingSphere!.radius *= 1.3;
  });
  unreflected.add(root);
  return {
    root,
    mixer,
    sitArms,
    cheer,
    cast,
    handSlot: model.getObjectByName('handslotr') ?? model.getObjectByName('handslot.r') ?? null,
    doing: 'sit',
    left: 0,
  };
}

function playOver(f: Fisher, action: AnimationAction, kind: 'cheer' | 'cast'): void {
  action.reset();
  action.play();
  f.sitArms.crossFadeTo(action, 0.25, false);
  f.doing = kind;
  f.left = action.getClip().duration - 0.3;
}

export function createFishingBoat(o: {
  loader: GLTFLoader;
  /** The pack's life folder URL (`…/packs/testcove/life/`). */
  base: string;
  at: FishingBoatSpot;
  waves: WaveSampler;
  seed?: number;
}): FishingBoat {
  const group = new Group();
  group.name = 'fishing boat';
  group.position.set(o.at.x, 0, o.at.z);
  // It rides outside the harbour basin, so the mirror wouldn't show it; leaving it out saves the
  // mirror's copies of its shaders (PLAN §15.4).
  unreflected.add(group);
  /** Swings on the anchor and rides the swell's height; `hull` pitches and rolls in it. */
  const swing = new Group();
  const hull = new Group();
  swing.add(hull);
  group.add(swing);

  const owned: { dispose(): void }[] = [];
  // One vertex-coloured material for the boat and all its gear (one pipeline).
  const gear = new MeshStandardNodeMaterial({ roughness: 0.82, metalness: 0, vertexColors: true });
  owned.push(gear);

  // The fishing rod (rides in the hand), the line, the float, and the anchor rope off the bow.
  const rodGeo = new CylinderGeometry(0.012, 0.03, ROD_LENGTH, 5);
  rodGeo.translate(0, ROD_LENGTH / 2 - 0.15, 0);
  const lineGeo = new CylinderGeometry(0.004, 0.004, 1, 3);
  lineGeo.translate(0, 0.5, 0);
  const floatGeo = new SphereGeometry(0.06, 8, 6);
  const ropeGeo = new CylinderGeometry(0.012, 0.012, 1, 4);
  ropeGeo.translate(0, 0.5, 0);
  owned.push(rodGeo, lineGeo, floatGeo, ropeGeo);
  paint(rodGeo, 0x6b4a2c);
  paint(lineGeo, 0xe8e2cf);
  paint(floatGeo, 0xd8402f);
  paint(ropeGeo, 0x8a6a45);
  const rod = new Mesh(rodGeo, gear);
  rod.name = 'fishing rod';
  const line = new Mesh(lineGeo, gear);
  line.name = 'fishing line';
  const bob = new Mesh(floatGeo, gear);
  bob.name = 'fishing float';
  const rope = new Mesh(ropeGeo, gear);
  rope.name = 'anchor rope';
  for (const m of [rod, line, bob, rope]) m.castShadow = true;
  group.add(rod, line, bob);
  hull.add(rope);

  let fisher: Fisher | null = null;
  let waver: Fisher | null = null;
  let gunwale = 0.5;
  let disposed = false;
  const loaded: GLTF[] = [];

  const ready = Promise.all([
    o.loader.loadAsync(`${o.base}rowboat.glb`),
    o.loader.loadAsync(`${o.base}fisher-hooded.glb`),
    o.loader.loadAsync(`${o.base}fisher-barbarian.glb`),
    loadLodSimplifier(),
  ]).then(([boatGltf, hoodedGltf, barbarianGltf, simplify]) => {
    loaded.push(boatGltf, hoodedGltf, barbarianGltf);
    if (disposed) return;
    // The boat: its wood colours baked into one vertex-coloured mesh, long axis along z, BOAT_LENGTH
    // long, keel DRAUGHT under the water.
    const parts: BufferGeometry[] = [];
    boatGltf.scene.updateMatrixWorld(true);
    boatGltf.scene.traverse((c) => {
      const m = c as Mesh;
      if (!m.isMesh) return;
      // The GLB is quantized (16-bit normalized attributes): copy to floats before transforming.
      const src = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry;
      const g = new BufferGeometry();
      for (const name of ['position', 'normal']) {
        const attr = src.getAttribute(name);
        if (!attr) continue;
        const out = new Float32Array(attr.count * 3);
        for (let i = 0; i < attr.count; i++) {
          out[i * 3] = attr.getX(i);
          out[i * 3 + 1] = attr.getY(i);
          out[i * 3 + 2] = attr.getZ(i);
        }
        g.setAttribute(name, new BufferAttribute(out, 3));
      }
      if (src !== m.geometry) src.dispose();
      g.applyMatrix4(m.matrixWorld);
      paint(g, ((m.material as Material & { color?: Color }).color ?? new Color(0x8a5a35)).getHex());
      parts.push(g);
    });
    const merged = mergeGeometries(parts);
    for (const g of parts) g.dispose();
    if (!merged) throw new Error('Rowboat has no meshes');
    owned.push(merged);
    const boat = new Mesh(merged, gear);
    boat.name = 'rowboat';
    boat.castShadow = true;
    boat.receiveShadow = true;
    let box = new Box3().setFromObject(boat);
    if (box.max.x - box.min.x > box.max.z - box.min.z) boat.rotation.y = Math.PI / 2;
    boat.updateMatrixWorld(true);
    box = new Box3().setFromObject(boat);
    const s = BOAT_LENGTH / (box.max.z - box.min.z);
    boat.scale.multiplyScalar(s);
    boat.updateMatrixWorld(true);
    box = new Box3().setFromObject(boat);
    boat.position.set(-(box.min.x + box.max.x) / 2, -box.min.y - DRAUGHT, -(box.min.z + box.max.z) / 2);
    gunwale = box.max.y - box.min.y - DRAUGHT;
    hull.add(boat);

    // The fisherman sits aft facing starboard, rod out over the side; his mate sits forward, facing him.
    const seatY = gunwale - 0.32;
    fisher = makeFisher(hoodedGltf, { x: 0.05, seatY, z: -BOAT_LENGTH * 0.24, yaw: Math.PI / 2 }, simplify);
    waver = makeFisher(barbarianGltf, { x: 0, seatY, z: BOAT_LENGTH * 0.2, yaw: Math.PI }, simplify);
    hull.add(fisher.root, waver.root);

    // The anchor rope runs from the bow down and forward into the water.
    rope.position.set(0, gunwale - 0.05, BOAT_LENGTH * 0.5);
    rope.scale.set(1, 3.2, 1);
    rope.rotation.x = 2.7;
  });

  // The float lies a few metres off the starboard side; the boat swings slowly on its anchor.
  const floatLocal = new Vector3(3.4, 0, -BOAT_LENGTH * 0.2);
  let castIn = 6;
  let waveCool = 0;
  let nibble = 0;
  const seed = o.seed ?? 7;
  let r = seed >>> 0 || 1;
  const rand = () => (r = (r * 1664525 + 1013904223) >>> 0) / 4294967296;

  return {
    group,
    ready,
    shipObstacle: { x: o.at.x, z: o.at.z, r: 3.2 },
    update(dt, t, camera) {
      const dist = Math.hypot(camera.position.x - o.at.x, camera.position.z - o.at.z);
      group.visible = dist < FAR;
      if (!group.visible || !fisher || !waver) return;
      const reduced = world.reducedMotion.value > 0.5;

      // Swing on the anchor, ride the swell: height at the middle, pitch and roll from the ends and sides.
      const heading = o.at.heading + Math.sin(t * 0.045 + seed) * 0.35;
      swing.rotation.y = heading;
      const sx = Math.sin(heading);
      const cz = Math.cos(heading);
      const x = o.at.x;
      const z = o.at.z;
      const half = BOAT_LENGTH * 0.45;
      const bow = o.waves.heightAt(x + sx * half, z + cz * half, t);
      const stern = o.waves.heightAt(x - sx * half, z - cz * half, t);
      const port = o.waves.heightAt(x + cz * 0.8, z - sx * 0.8, t);
      const star = o.waves.heightAt(x - cz * 0.8, z + sx * 0.8, t);
      swing.position.y = (bow + stern + port + star) * 0.25;
      hull.rotation.x = Math.atan2(stern - bow, half * 2) * 0.8;
      hull.rotation.z = Math.atan2(star - port, 1.6) * 0.8;

      // The float bobs on the water off the side (with a nibble now and then).
      _v.copy(floatLocal).applyAxisAngle(_up, heading);
      nibble = Math.max(0, nibble - dt);
      if (nibble === 0 && rand() < dt * 0.08) nibble = 0.6;
      const dip = nibble > 0 ? Math.sin(nibble * 16) * 0.05 : 0;
      bob.position.set(_v.x, o.waves.heightAt(x + _v.x, z + _v.z, t) - dip, _v.z);

      // The waver turns toward you while you're near (as far as he can sitting down), else to his mate.
      const toCam = Math.atan2(camera.position.x - x, camera.position.z - z) - heading;
      let face = Math.PI;
      if (dist < WAVE_NEAR) {
        const off = Math.atan2(Math.sin(toCam - Math.PI), Math.cos(toCam - Math.PI));
        face = Math.PI + Math.max(-0.9, Math.min(0.9, off));
      }
      waver.root.rotation.y += (face - waver.root.rotation.y) * (1 - Math.exp(-dt * 2));

      if (dist < ANIMATE_NEAR) {
        // The waver waves as you come by; the fisherman casts again now and then.
        waveCool = Math.max(0, waveCool - dt);
        if (dist < WAVE_NEAR && waveCool === 0 && waver.doing === 'sit' && !reduced) {
          playOver(waver, waver.cheer, 'cheer');
          waveCool = WAVE_AGAIN;
        }
        castIn -= dt;
        if (castIn <= 0 && fisher.doing === 'sit') {
          playOver(fisher, fisher.cast, 'cast');
          castIn = 14 + rand() * 10;
        }
        for (const f of [fisher, waver]) {
          if (f.doing !== 'sit') {
            f.left -= dt;
            if (f.left <= 0) {
              const from = f.doing === 'cheer' ? f.cheer : f.cast;
              f.sitArms.reset();
              f.sitArms.play();
              from.crossFadeTo(f.sitArms, 0.3, false);
              f.doing = 'sit';
            }
          }
          f.mixer.update(dt);
        }
      }

      // The rod: in the fisherman's hand, out over the side; a cast swings it back, then throws it out.
      group.updateMatrixWorld(true);
      (fisher.handSlot ?? fisher.root).getWorldPosition(_a);
      _dir.copy(ROD_FISH);
      if (fisher.doing === 'cast') {
        const p = fisher.cast.time / fisher.cast.getClip().duration;
        if (p < 0.4) _dir.lerp(ROD_BACK, Math.min(1, p / 0.25));
        else if (p < 0.6) _dir.copy(ROD_BACK).lerp(ROD_THROW, (p - 0.4) / 0.2);
        else _dir.copy(ROD_THROW).lerp(ROD_FISH, Math.min(1, (p - 0.6) / 0.3));
        _dir.normalize();
      }
      _out.copy(_dir).applyQuaternion(hull.getWorldQuaternion(_q));
      rod.position.set(_a.x - x, _a.y, _a.z - z);
      rod.quaternion.setFromUnitVectors(_up, _out);
      // The line: from the rod's tip to the float.
      _a.addScaledVector(_out, ROD_LENGTH - 0.15);
      bob.getWorldPosition(_b);
      _v.subVectors(_b, _a);
      const len = _v.length();
      line.position.set(_a.x - x, _a.y, _a.z - z);
      line.quaternion.copy(_q.setFromUnitVectors(_up, _v.divideScalar(Math.max(1e-4, len))));
      line.scale.set(1, len, 1);
    },
    dispose() {
      disposed = true;
      unreflected.delete(group);
      for (const f of [fisher, waver]) {
        f?.mixer.stopAllAction();
        if (f) unreflected.delete(f.root);
      }
      for (const gltf of loaded)
        gltf.scene.traverse((c) => {
          const m = c as Mesh;
          if (!m.isMesh) return;
          m.geometry.dispose();
          for (const mat of (Array.isArray(m.material) ? m.material : [m.material]) as (Material & {
            map?: Texture | null;
            paletteMap?: Texture | null;
          })[]) {
            mat.map?.dispose();
            mat.paletteMap?.dispose();
            mat.dispose();
          }
        });
      for (const d of owned) d.dispose();
      group.clear();
      fisher = null;
      waver = null;
    },
  };
}
