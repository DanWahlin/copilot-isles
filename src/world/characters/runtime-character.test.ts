import { AnimationClip, Bone, Group, Quaternion, QuaternionKeyframeTrack, Vector3 } from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { RuntimeCharacter } from './runtime-character';
import type { BodyConfig, CharacterClip } from './types';

describe('RuntimeCharacter procedural pose layers', () => {
  it('does not accumulate offsets on bones missing mixer tracks', () => {
    const { group, body, torso } = testRig();
    const character = new RuntimeCharacter(
      group,
      new Map<CharacterClip, AnimationClip>([['sit', hipsOnlyClip()]]),
      'fisherman',
      { source: 'henry_npc', scale: 1, radius: 0.3, height: 1.7, tint: 0xffffff } satisfies BodyConfig,
      { body: 'fisherman', tier: { tier: 'high', npcAnimRate: 1 } },
    );
    character.play('sit', 0);

    const dt = (Math.PI * 2) / 0.3 / 60;
    let frame60BodyY = 0;
    let frame60Torso = new Quaternion();
    for (let frame = 1; frame <= 600; frame += 1) {
      character.update(dt);
      if (frame === 60) {
        frame60BodyY = body.position.y;
        frame60Torso = torso.quaternion.clone();
      }
    }

    expect(Math.abs(body.position.y - frame60BodyY)).toBeLessThan(0.02);
    expect(torso.quaternion.angleTo(frame60Torso)).toBeLessThan(0.05);
  });

  it('keeps a seated rig seated while it talks, gesturing with the upper body', () => {
    const { group, torso, upperLegL } = testRig();
    const character = new RuntimeCharacter(
      group,
      new Map<CharacterClip, AnimationClip>([['sit', hipsOnlyClip()]]),
      'lyra',
      { source: 'henry_npc', scale: 1, radius: 0.3, height: 1.7, tint: 0xffffff } satisfies BodyConfig,
      { body: 'lyra', tier: { tier: 'high', npcAnimRate: 1 } },
    );
    character.play('sit', 0);
    const dt = 1 / 60;
    for (let frame = 0; frame < 30; frame += 1) character.update(dt);
    const seatedLeg = upperLegL.quaternion.clone();
    const quietTorso = torso.quaternion.clone();

    character.setTalking(true);
    let torsoSwing = 0;
    for (let frame = 0; frame < 90; frame += 1) {
      character.update(dt);
      torsoSwing = Math.max(torsoSwing, torso.quaternion.angleTo(quietTorso));
    }

    expect(upperLegL.quaternion.angleTo(seatedLeg)).toBeLessThan(0.01);
    expect(torsoSwing).toBeGreaterThan(0.03);
  });

  it('holds the helm with both hands on the grip, fingers closed, without drifting', () => {
    const { group } = testRig();
    const character = new RuntimeCharacter(
      group,
      new Map<CharacterClip, AnimationClip>([
        ['idle', hipsOnlyClip('idle')],
        ['helm', hipsOnlyClip('helm')],
      ]),
      'man',
      { source: 'captain', scale: 1, radius: 0.3, height: 1.2, tint: 0xffffff } satisfies BodyConfig,
      { body: 'man', tier: { tier: 'high', npcAnimRate: 1 } },
    );
    group.rotation.y = 0.7;
    group.position.set(3, 1, -2);
    const knuckle = group.getObjectByName('Middle2L')!;
    const open = knuckle.quaternion.clone();
    character.play('helm', 0);
    character.setGrip({ y: 0.5, z: 0.35, spread: 0.3 });

    const wristAt = (name: string) =>
      group.worldToLocal(group.getObjectByName(name)!.getWorldPosition(new Vector3()));
    for (let frame = 0; frame < 5; frame += 1) character.update(1 / 60);
    const first = wristAt('Middle1L');
    for (let frame = 0; frame < 120; frame += 1) character.update(1 / 60);
    // The wrist stops just short of the grip, so the hand closes on it.
    for (const [name, x] of [
      ['Middle1L', 0.3],
      ['Middle1R', -0.3],
    ] as const) {
      const wrist = wristAt(name);
      expect(wrist.x).toBeCloseTo(x, 2);
      expect(wrist.y).toBeCloseTo(0.5, 2);
      expect(wrist.z).toBeCloseTo(0.29, 2);
    }
    expect(wristAt('Middle1L').distanceTo(first)).toBeLessThan(0.01);
    expect(knuckle.quaternion.angleTo(open)).toBeGreaterThan(0.5);

    character.setGrip(null);
    character.play('idle', 0);
    character.update(1 / 60);
    expect(knuckle.quaternion.angleTo(open)).toBeLessThan(1e-4);
  });
});

function testRig(): { group: Group; body: Bone; torso: Bone; upperLegL: Bone } {
  const group = new Group();
  const root = new Bone();
  root.name = 'Root';
  const body = child(root, 'Body', [0, 0.38, 0]);
  child(body, 'Hips', [0, 0.0, 0]);
  const abdomen = child(body, 'Abdomen', [0, 0.18, 0]);
  const torso = child(abdomen, 'Torso', [0, 0.16, 0]);
  child(torso, 'Neck', [0, 0.18, 0]);
  child(torso, 'Head', [0, 0.32, 0]);
  const upperLegs: Bone[] = [];
  for (const side of ['L', 'R'] as const) {
    const x = side === 'L' ? 0.16 : -0.16;
    const shoulder = child(torso, `Shoulder${side}`, [x, 0.12, 0]);
    const upperArm = child(shoulder, `UpperArm${side}`, [x, -0.08, 0]);
    const lowerArm = child(upperArm, `LowerArm${side}`, [x, -0.18, 0]);
    // A finger off the wrist: knuckle, two joints, and the tip.
    let finger = child(lowerArm, `Middle1${side}`, [0, -0.2, 0]);
    finger = child(finger, `Middle2${side}`, [0, -0.03, 0]);
    finger = child(finger, `Middle3${side}`, [0, -0.03, 0]);
    child(finger, `Middle3${side}_end`, [0, -0.02, 0]);
    const upperLeg = child(body, `UpperLeg${side}`, [x * 0.6, -0.18, 0]);
    upperLegs.push(upperLeg);
    const lowerLeg = child(upperLeg, `LowerLeg${side}`, [0, -0.22, 0]);
    child(lowerLeg, `Foot${side}`, [0, -0.2, 0.06]);
  }
  group.add(root);
  return { group, body, torso, upperLegL: upperLegs[0]! };
}

function child(parent: Bone, name: string, position: [number, number, number]): Bone {
  const bone = new Bone();
  bone.name = name;
  bone.position.fromArray(position);
  parent.add(bone);
  return bone;
}

function hipsOnlyClip(name = 'sit'): AnimationClip {
  const times = new Float32Array([0, 1]);
  const values = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1]);
  return new AnimationClip(`test:${name}`, 1, [
    new QuaternionKeyframeTrack('Hips.quaternion', times, values),
  ]);
}
