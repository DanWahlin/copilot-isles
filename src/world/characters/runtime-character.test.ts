import { AnimationClip, Bone, Group, Quaternion, QuaternionKeyframeTrack } from 'three/webgpu';
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
});

function testRig(): { group: Group; body: Bone; torso: Bone } {
  const group = new Group();
  const root = new Bone();
  root.name = 'Root';
  const body = child(root, 'Body', [0, 0.38, 0]);
  child(body, 'Hips', [0, 0.0, 0]);
  const abdomen = child(body, 'Abdomen', [0, 0.18, 0]);
  const torso = child(abdomen, 'Torso', [0, 0.16, 0]);
  child(torso, 'Neck', [0, 0.18, 0]);
  child(torso, 'Head', [0, 0.32, 0]);
  for (const side of ['L', 'R'] as const) {
    const x = side === 'L' ? 0.16 : -0.16;
    const shoulder = child(torso, `Shoulder${side}`, [x, 0.12, 0]);
    const upperArm = child(shoulder, `UpperArm${side}`, [x, -0.08, 0]);
    child(upperArm, `LowerArm${side}`, [x, -0.18, 0]);
    const upperLeg = child(body, `UpperLeg${side}`, [x * 0.6, -0.18, 0]);
    const lowerLeg = child(upperLeg, `LowerLeg${side}`, [0, -0.22, 0]);
    child(lowerLeg, `Foot${side}`, [0, -0.2, 0.06]);
  }
  group.add(root);
  return { group, body, torso };
}

function child(parent: Bone, name: string, position: [number, number, number]): Bone {
  const bone = new Bone();
  bone.name = name;
  bone.position.fromArray(position);
  parent.add(bone);
  return bone;
}

function hipsOnlyClip(): AnimationClip {
  const times = new Float32Array([0, 1]);
  const values = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1]);
  return new AnimationClip('test:sit', 1, [new QuaternionKeyframeTrack('Hips.quaternion', times, values)]);
}
