import { Bone, Group } from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { dressNpcCharacter, SPECTACLES } from './npc-accessories';
import type { CharacterBody } from './types';

const MERIDIAN_MARKERS = {
  tobias: ['wide felt brim', 'merchant scales', 'money pouch'],
  mina: ['sun hat ribbon', 'rolled map in hand', 'satchel'],
  anders: ['flat cap crown', 'beard and moustache', 'shipwright mallet head', 'pencil behind ear'],
  rhea: ['naval tricorn', 'naval coat chest', 'handheld spyglass'],
  oren: ['star cap crown', 'spectacles', 'astronomer long robe', 'brass astrolabe'],
  pell: ['periwig cap', 'white cravat', 'ledger', 'quill shaft'],
  admiral: ['bicorne', 'white plume', 'naval coat tails', 'medal'],
  mer_fisher: ['sun-bleached cap crown', 'coiled fishing net', 'rolled sleeve cuff'],
  mer_matron: ['headscarf wrap', 'merchant apron bib', 'market basket'],
  mer_vendor: ['striped shirt band', 'neckerchief knot', 'vendor produce tray'],
  mer_kid_a: ['child sailor cap', 'pinwheel vane', 'satchel'],
  mer_kid_b: ['headscarf wrap', 'toy hoop', 'sash'],
  mer_guard: ['guard helmet dome', 'guard tabard', 'guard brass belt'],
} as const satisfies Partial<Record<CharacterBody, readonly string[]>>;

describe('NPC accessories', () => {
  it('dresses every Meridian NPC with unique silhouette markers', () => {
    for (const [body, markers] of Object.entries(MERIDIAN_MARKERS)) {
      const root = testRig();
      dressNpcCharacter(root, body as CharacterBody);
      const names = new Set<string>();
      root.traverse((object) => names.add(object.name));
      for (const marker of markers) expect(names.has(marker), `${body} missing ${marker}`).toBe(true);
    }
  });

  it('has measured spectacle fit data for each bespectacled NPC', () => {
    expect(Object.keys(SPECTACLES).sort()).toEqual(['merchant', 'nell', 'oren', 'pell']);
    for (const [body, fit] of Object.entries(SPECTACLES)) {
      expect(fit.radius, `${body} lens radius`).toBeGreaterThan(0.04);
      expect(fit.lensZ, `${body} lenses are in front of the eyes`).toBeGreaterThan(0.24);
      expect(fit.temple[0], `${body} arms start outside the lens`).toBeGreaterThan(fit.eyeX);
      expect(fit.ear[0], `${body} arms reach back to the ear`).toBeGreaterThan(fit.temple[0]);
      expect(fit.ear[1], `${body} arms run back instead of through cheeks`).toBeLessThan(fit.temple[1]);
    }
  });
});

function testRig(): Group {
  const group = new Group();
  const root = new Bone();
  root.name = 'Root';
  const body = child(root, 'Body', [0, 0.38, 0]);
  child(body, 'Hips', [0, 0, 0]);
  const torso = child(body, 'Torso', [0, 0.36, 0]);
  child(torso, 'Head', [0, 0.42, 0]);
  for (const side of ['L', 'R'] as const) {
    const shoulder = child(torso, `Shoulder${side}`, [side === 'L' ? 0.18 : -0.18, 0.1, 0]);
    const upperArm = child(shoulder, `UpperArm${side}`, [0, -0.12, 0]);
    child(upperArm, `LowerArm${side}`, [0, -0.22, 0]);
  }
  group.add(root);
  return group;
}

function child(parent: Bone, name: string, position: [number, number, number]): Bone {
  const bone = new Bone();
  bone.name = name;
  bone.position.fromArray(position);
  parent.add(bone);
  return bone;
}
