#!/usr/bin/env node
// Offline retarget of Quaternius's CC0 Universal Animation Library to the Test Cove captain rigs.
// Writes small binary clip packs consumed at runtime; no retargeting runs in the browser.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  AnimationClip,
  AnimationMixer,
  Quaternion,
  QuaternionKeyframeTrack,
  Vector3,
  VectorKeyframeTrack,
} from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

globalThis.self ??= globalThis;

const CACHE = 'tools/.cache/characters';
const SOURCE_GLTF = `${CACHE}/AnimationLibrary_Godot_Standard.gltf`;
const SOURCE_BIN = `${CACHE}/AnimationLibrary_Godot_Standard.bin`;
const SOURCE_GLB = `${CACHE}/AnimationLibrary_Godot_Standard.glb`;
const SOURCE_URLS = {
  gltf: 'https://raw.githubusercontent.com/J-Ponzo/gltf-universal-animation-library/main/glTF/AnimationLibrary_Godot_Standard.gltf',
  bin: 'https://raw.githubusercontent.com/J-Ponzo/gltf-universal-animation-library/main/glTF/AnimationLibrary_Godot_Standard.bin',
};
const SOURCE_HASH = {
  gltf: '0ff075c7ad6855c5c2c37a171592ee8f0d6ab2f58259e2be77a9b63dd8027765',
  bin: '6e65377d81558333c4093dbb144a48fd19019343d82b1a3a7992a98ec0e0543c',
  glb: 'd72b4eae13525effe9be143118dc669ed6aed21e472e85ccb26e8fc67ac62823',
};

const TARGETS = [
  {
    key: 'captain',
    in: 'public/packs/testcove/characters/captain.glb',
    out: 'public/packs/testcove/characters/locomotion-captain.loco',
  },
  {
    key: 'anne',
    in: 'public/packs/testcove/characters/anne.glb',
    out: 'public/packs/testcove/characters/locomotion-anne.loco',
  },
  {
    key: 'henry',
    in: 'public/packs/testcove/characters/henry.glb',
    out: 'public/packs/testcove/characters/locomotion-henry.loco',
  },
];

const CLIPS = {
  idle: 'Idle_Loop',
  walk: 'Walk_Loop',
  jog: 'Jog_Fwd_Loop',
  run: 'Sprint_Loop',
  jumpStart: 'Jump_Start',
  jumpLoop: 'Jump_Loop',
  jumpLand: 'Jump_Land',
  talk: 'Idle_Talking_Loop',
  wave: 'Interact',
  sit: 'Sitting_Idle_Loop',
  helm: 'Driving_Loop',
  wade: 'Walk_Loop',
  swim: 'Swim_Fwd_Loop',
  tread: 'Swim_Idle_Loop',
};

const BONE_MAP = {
  Body: 'DEF-hips',
  Hips: 'DEF-spine001',
  Abdomen: 'DEF-spine002',
  Torso: 'DEF-spine003',
  Neck: 'DEF-neck',
  Head: 'DEF-head',
  ShoulderL: 'DEF-shoulderL',
  UpperArmL: 'DEF-upper_armL',
  LowerArmL: 'DEF-forearmL',
  ShoulderR: 'DEF-shoulderR',
  UpperArmR: 'DEF-upper_armR',
  LowerArmR: 'DEF-forearmR',
  UpperLegL: 'DEF-thighL',
  LowerLegL: 'DEF-shinL',
  FootL: 'DEF-footL',
  UpperLegR: 'DEF-thighR',
  LowerLegR: 'DEF-shinR',
  FootR: 'DEF-footR',
};

const FPS = 15;
const MAGIC = 0x434f4c49; // ILOC, little-endian.
const qTmp = new Quaternion();
const qDelta = new Quaternion();
const qWorld = new Quaternion();
const qLocal = new Quaternion();
const qInv = new Quaternion();
const vTmp = new Vector3();
const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);

async function main() {
  await ensureSource();
  const source = await loadGltf(SOURCE_GLB);
  const sourceMesh = firstSkinned(source.scene);
  const sourceRest = restData(sourceMesh.skeleton.bones);
  const sourceBones = namedBones(sourceMesh.skeleton.bones);
  const sourceHipHeight = hipHeight(
    sourceBones.get('DEF-hips'),
    sourceBones.get('DEF-footL'),
    sourceBones.get('DEF-footR'),
  );

  for (const targetSpec of TARGETS) {
    const target = await loadGltf(targetSpec.in);
    const targetMesh = firstSkinned(target.scene);
    const targetBones = namedBones(targetMesh.skeleton.bones);
    const targetRest = restData(targetMesh.skeleton.bones);
    const targetHipHeight = hipHeight(
      targetBones.get('Body'),
      targetBones.get('FootL'),
      targetBones.get('FootR'),
    );
    const legRatio = targetHipHeight / sourceHipHeight;
    const pack = {
      meta: {
        source: 'Quaternius Universal Animation Library standard free pack, glTF mirror by J-Ponzo',
        sourceUrl: 'https://github.com/J-Ponzo/gltf-universal-animation-library',
        license: 'CC0 1.0',
        sourceSha256: SOURCE_HASH,
        target: targetSpec.key,
        fps: FPS,
        legRatio,
        method:
          'world-rest-aligned rotation retarget; Body vertical translation scaled, horizontal root motion zeroed; no scale tracks',
        bakedAt: new Date().toISOString(),
      },
      clips: new Map(),
    };

    for (const [name, sourceName] of Object.entries(CLIPS)) {
      const clip = source.animations.find((entry) => entry.name === sourceName);
      if (!clip) throw new Error(`Missing UAL clip ${sourceName}`);
      const baked = bakeClip(name, clip, {
        source,
        sourceMesh,
        sourceBones,
        sourceRest,
        target,
        targetMesh,
        targetBones,
        targetRest,
        legRatio,
      });
      pack.clips.set(name, baked);
    }
    await writeBinaryPack(targetSpec.out, pack);
    console.log(
      `${targetSpec.out} ${Math.round((await readFile(targetSpec.out)).byteLength / 1024)} KB ${await shaFile(targetSpec.out)}`,
    );
  }
}

async function ensureSource() {
  await mkdir(CACHE, { recursive: true });
  if (!existsSync(SOURCE_GLTF)) await download(SOURCE_URLS.gltf, SOURCE_GLTF);
  if (!existsSync(SOURCE_BIN)) await download(SOURCE_URLS.bin, SOURCE_BIN);
  await assertHash(SOURCE_GLTF, SOURCE_HASH.gltf);
  await assertHash(SOURCE_BIN, SOURCE_HASH.bin);
  if (!existsSync(SOURCE_GLB) || (await shaFile(SOURCE_GLB)) !== SOURCE_HASH.glb) {
    execFileSync(
      'npx',
      ['gltf-transform', 'copy', SOURCE_GLTF, SOURCE_GLB, '--vertex-layout', 'interleaved', '--allow-net'],
      {
        stdio: 'inherit',
      },
    );
  }
  await assertHash(SOURCE_GLB, SOURCE_HASH.glb);
}

async function download(url, path) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download ${url}: ${res.status}`);
  await writeFile(path, Buffer.from(await res.arrayBuffer()));
}

async function loadGltf(path) {
  const data = await readFile(path);
  const ab = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
  return new Promise((resolve, reject) => loader.parse(ab, '', resolve, reject));
}

function firstSkinned(scene) {
  let mesh = null;
  scene.traverse((object) => {
    if (!mesh && object.isSkinnedMesh) mesh = object;
  });
  if (!mesh) throw new Error(`No skinned mesh in ${scene.name || 'scene'}`);
  return mesh;
}

function namedBones(bones) {
  return new Map(bones.map((bone) => [bone.name, bone]));
}

function restData(bones) {
  bones[0]?.parent?.updateMatrixWorld(true);
  const world = new Map();
  const local = new Map();
  const pos = new Map();
  const scale = new Map();
  for (const bone of bones) {
    world.set(bone.name, bone.getWorldQuaternion(new Quaternion()));
    local.set(bone.name, bone.quaternion.clone());
    pos.set(bone.name, bone.position.clone());
    scale.set(bone.name, bone.getWorldScale(new Vector3()));
  }
  return { world, local, pos, scale };
}

function hipHeight(hip, footL, footR) {
  if (!hip || !footL || !footR) return 1;
  const hipY = hip.getWorldPosition(new Vector3()).y;
  const footY = Math.min(footL.getWorldPosition(new Vector3()).y, footR.getWorldPosition(new Vector3()).y);
  return Math.max(0.01, hipY - footY);
}

function bakeClip(name, clip, ctx) {
  const {
    source,
    sourceMesh,
    sourceBones,
    sourceRest,
    target,
    targetMesh,
    targetBones,
    targetRest,
    legRatio,
  } = ctx;
  const sourceClip = stripScaleTracks(clip);
  const frames = Math.max(2, Math.round(sourceClip.duration * FPS) + 1);
  const times = new Float32Array(frames);
  const rotations = new Map();
  for (const targetName of Object.keys(BONE_MAP)) rotations.set(targetName, new Float32Array(frames * 4));
  const bodyPos = new Float32Array(frames * 3);
  const bodyRest = targetRest.pos.get('Body') ?? new Vector3();
  const bodyParentScale = targetBones.get('Body')?.parent?.getWorldScale(new Vector3()).y || 1;
  const sourceHip = sourceBones.get('DEF-hips');
  const sourceHipRestY = sourceHip?.getWorldPosition(new Vector3()).y ?? 0;

  const mixer = new AnimationMixer(source.scene);
  const action = mixer.clipAction(sourceClip);
  action.reset().play();
  const targetOrder = Object.keys(BONE_MAP).sort(
    (a, b) => depth(targetBones.get(a)) - depth(targetBones.get(b)),
  );

  for (let frame = 0; frame < frames; frame += 1) {
    const t = Math.min(sourceClip.duration, frame / FPS);
    times[frame] = t;
    mixer.setTime(t >= sourceClip.duration ? sourceClip.duration - 0.00001 : t);
    source.scene.updateMatrixWorld(true);
    const generatedWorld = new Map();

    for (const targetName of targetOrder) {
      const sourceName = BONE_MAP[targetName];
      const sourceBone = sourceBones.get(sourceName);
      const targetBone = targetBones.get(targetName);
      if (!sourceBone || !targetBone) continue;
      const sourceCurrent = sourceBone.getWorldQuaternion(qTmp);
      const sourceRestWorld = sourceRest.world.get(sourceName);
      const targetRestWorld = targetRest.world.get(targetName);
      if (!sourceRestWorld || !targetRestWorld) continue;
      qDelta.copy(qInv.copy(sourceRestWorld).invert()).multiply(sourceCurrent);
      qWorld.copy(targetRestWorld).multiply(qDelta).normalize();
      const parentWorld = targetBone.parent
        ? (generatedWorld.get(targetBone.parent.name) ?? targetRest.world.get(targetBone.parent.name))
        : null;
      qLocal.copy(qWorld);
      if (parentWorld) qLocal.premultiply(qInv.copy(parentWorld).invert());
      qLocal.normalize();
      qLocal.toArray(rotations.get(targetName), frame * 4);
      generatedWorld.set(targetName, qWorld.clone());
    }

    const dyWorld = sourceHip ? (sourceHip.getWorldPosition(vTmp).y - sourceHipRestY) * legRatio : 0;
    bodyPos[frame * 3] = bodyRest.x;
    bodyPos[frame * 3 + 1] = bodyRest.y + dyWorld / bodyParentScale;
    bodyPos[frame * 3 + 2] = bodyRest.z;
  }

  mixer.stopAllAction();
  sourceMesh.skeleton.pose();
  source.scene.updateMatrixWorld(true);

  const tracks = [new VectorKeyframeTrack('Body.position', times, bodyPos)];
  for (const [targetName, values] of rotations) {
    if (!targetBones.get(targetName)) continue;
    tracks.push(new QuaternionKeyframeTrack(`${targetName}.quaternion`, times, values));
  }
  const out = new AnimationClip(`ual:${name}`, sourceClip.duration, tracks);
  out.userData.contacts = detectContacts(target.scene, targetMesh, targetBones, out);
  return out;
}

function stripScaleTracks(clip) {
  const clone = clip.clone();
  clone.tracks = clone.tracks.filter((track) => {
    if (track.name.endsWith('.scale')) return false;
    if (track.name.endsWith('.position') && track.name !== 'DEF-hips.position') return false;
    return true;
  });
  clone.resetDuration();
  return clone;
}

function depth(bone) {
  let d = 0;
  for (let p = bone?.parent; p; p = p.parent) d += 1;
  return d;
}

function detectContacts(scene, mesh, bones, clip) {
  const ends = {
    L: bones.get('LowerLegL_end') ?? bones.get('FootL'),
    R: bones.get('LowerLegR_end') ?? bones.get('FootR'),
  };
  const contacts = { L: [], R: [] };
  if (!ends.L || !ends.R) return contacts;
  const samples = Math.max(12, Math.round(clip.duration * FPS * 2));
  const mixer = new AnimationMixer(scene);
  mixer.clipAction(clip).play();
  const data = { L: [], R: [] };
  for (let i = 0; i < samples; i += 1) {
    const t = (i / samples) * clip.duration;
    mixer.setTime(t);
    scene.updateMatrixWorld(true);
    for (const side of ['L', 'R']) {
      const p = ends[side].getWorldPosition(new Vector3());
      data[side].push({ phase: i / samples, y: p.y });
    }
  }
  mixer.stopAllAction();
  mesh.skeleton.pose();
  scene.updateMatrixWorld(true);
  for (const side of ['L', 'R']) {
    const ys = data[side].map((entry) => entry.y);
    const min = Math.min(...ys);
    const max = Math.max(...ys);
    const threshold = min + Math.max(0.025, (max - min) * 0.28);
    const flags = data[side].map((entry) => entry.y <= threshold);
    const intervals = [];
    let start = -1;
    for (let i = 0; i <= flags.length; i += 1) {
      const on = flags[i % flags.length] && i < flags.length;
      if (on && start < 0) start = i;
      if ((!on || i === flags.length) && start >= 0) {
        if (i - start >= 2) intervals.push([start / flags.length, i / flags.length]);
        start = -1;
      }
    }
    contacts[side] = mergeWrapIntervals(intervals);
  }
  return contacts;
}

function mergeWrapIntervals(intervals) {
  if (intervals.length <= 1) return intervals;
  intervals.sort((a, b) => a[0] - b[0]);
  const first = intervals[0];
  const last = intervals[intervals.length - 1];
  if (first[0] <= 0.001 && last[1] >= 0.999) {
    first[0] = last[0] - 1;
    intervals.pop();
  }
  return intervals;
}

async function writeBinaryPack(path, pack) {
  await mkdir(dirname(path), { recursive: true });
  const chunks = [];
  const manifest = { meta: pack.meta, clips: {} };
  let offset = 0;
  for (const [name, clip] of pack.clips) {
    const clipInfo = {
      name: clip.name,
      duration: clip.duration,
      fps: FPS,
      frames: Math.max(...clip.tracks.map((track) => track.times.length)),
      contacts: clip.userData.contacts ?? { L: [], R: [] },
      tracks: [],
    };
    for (const track of clip.tracks) {
      const item = { name: track.name, itemSize: track.getValueSize(), offset };
      let bytes;
      if (track.ValueTypeName === 'quaternion') {
        item.type = 'quat16';
        bytes = int16Bytes(track.values, -1, 1);
      } else {
        item.type = 'vec3f32';
        bytes = Buffer.from(
          track.values.buffer.slice(
            track.values.byteOffset,
            track.values.byteOffset + track.values.byteLength,
          ),
        );
      }
      item.count = bytes.byteLength / (item.type === 'quat16' ? 2 : 4);
      offset += bytes.byteLength;
      chunks.push(bytes);
      clipInfo.tracks.push(item);
    }
    manifest.clips[name] = clipInfo;
  }
  const json = Buffer.from(JSON.stringify(manifest), 'utf8');
  const pad = Buffer.alloc((4 - (json.byteLength % 4)) % 4);
  const header = Buffer.alloc(8);
  header.writeUInt32LE(MAGIC, 0);
  header.writeUInt32LE(json.byteLength, 4);
  await writeFile(path, Buffer.concat([header, json, pad, ...chunks]));
}

function int16Bytes(values, min, max) {
  const out = new Int16Array(values.length);
  const scale = 32767 / Math.max(Math.abs(min), Math.abs(max));
  for (let i = 0; i < values.length; i += 1)
    out[i] = Math.max(-32767, Math.min(32767, Math.round(values[i] * scale)));
  return Buffer.from(out.buffer);
}

async function shaFile(path) {
  return createHash('sha256')
    .update(await readFile(path))
    .digest('hex');
}

async function assertHash(path, expected) {
  const actual = await shaFile(path);
  if (actual !== expected) throw new Error(`sha256 mismatch for ${path}: ${actual}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
