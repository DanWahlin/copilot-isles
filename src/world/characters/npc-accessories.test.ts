import {
  Bone,
  BufferAttribute,
  BufferGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Skeleton,
  SkinnedMesh,
  Vector3,
} from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { dressNpcCharacter, mergeNpcAccessories, SPECTACLES } from './npc-accessories';
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
  mer_guard: ['guard bicorne', 'guard uniform coat', 'guard brass belt'],
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

  it("merges each NPC's accessories into one mesh per bone, keeping every triangle", () => {
    for (const body of Object.keys(MERIDIAN_MARKERS)) {
      const root = testRig();
      dressNpcCharacter(root, body as CharacterBody);
      const before = census(root);
      mergeNpcAccessories(root);
      const after = census(root);
      expect(after.triangles, `${body} triangles`).toBe(before.triangles);
      expect(after.meshes, `${body} meshes`).toBeLessThanOrEqual(before.anchors);
      expect(after.meshes, `${body} merged`).toBeLessThan(before.meshes);
    }
  });

  it('skins the accessories of a rig with a body to its skeleton, in place in any pose', () => {
    for (const body of Object.keys(MERIDIAN_MARKERS)) {
      const plain = testRig(true);
      const merged = testRig(true);
      dressNpcCharacter(plain, body as CharacterBody);
      dressNpcCharacter(merged, body as CharacterBody);
      mergeNpcAccessories(merged);
      const skinned: SkinnedMesh[] = [];
      merged.traverse((o) => {
        if (o instanceof SkinnedMesh && o.name === 'npc accessories') skinned.push(o);
      });
      expect(skinned, `${body} skinned accessories`).toHaveLength(1);
      for (const rig of [plain, merged]) {
        rig.getObjectByName('Head')!.rotation.set(0.4, -0.7, 0.2);
        rig.getObjectByName('UpperArmL')!.rotation.set(-1.1, 0.3, 0.5);
        rig.getObjectByName('Torso')!.rotation.set(0.2, 0.5, -0.1);
        rig.updateMatrixWorld(true);
      }
      const expected = accessoryVertices(plain);
      const actual = accessoryVertices(merged);
      expect(actual.count, `${body} vertices`).toBe(expected.count);
      for (const k of ['x', 'y', 'z'] as const)
        expect(actual.sum[k], `${body} ${k}`).toBeCloseTo(expected.sum[k], 3);
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

function census(root: Group): { meshes: number; triangles: number; anchors: number } {
  let meshes = 0;
  let triangles = 0;
  const anchors = new Set<unknown>();
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    meshes++;
    const g = object.geometry;
    triangles += (g.index ? g.index.count : g.getAttribute('position').count) / 3;
    let anchor = object.parent;
    while (anchor && anchor !== root && !(anchor instanceof Bone)) anchor = anchor.parent;
    anchors.add(anchor);
  });
  return { meshes, triangles, anchors: anchors.size };
}

/** Every accessory vertex in world space, skinned ones through their skeleton (sum and count). */
function accessoryVertices(root: Group): { sum: Vector3; count: number } {
  const sum = new Vector3();
  const v = new Vector3();
  let count = 0;
  root.traverse((o) => {
    if (!(o instanceof Mesh) || o.name === 'body') return;
    const position = o.geometry.getAttribute('position');
    for (let i = 0; i < position.count; i++) {
      v.fromBufferAttribute(position, i);
      if (o instanceof SkinnedMesh) {
        o.skeleton.update();
        o.applyBoneTransform(i, v);
      }
      sum.add(v.applyMatrix4(o.matrixWorld));
      count++;
    }
  });
  return { sum, count };
}

function testRig(withBody = false): Group {
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
  if (withBody) {
    // A one-triangle body skinned to the hips, offset like a glTF rig's mesh node.
    const geometry = new BufferGeometry();
    geometry.setAttribute(
      'position',
      new BufferAttribute(new Float32Array([0, 0, 0, 0.1, 0, 0, 0, 0.1, 0]), 3),
    );
    geometry.setAttribute('skinIndex', new BufferAttribute(new Uint16Array(12), 4));
    geometry.setAttribute(
      'skinWeight',
      new BufferAttribute(new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]), 4),
    );
    const mesh = new SkinnedMesh(geometry, new MeshStandardMaterial());
    mesh.name = 'body';
    mesh.position.set(0.05, 0.02, -0.03);
    mesh.scale.setScalar(1.3);
    group.scale.setScalar(0.9);
    group.add(mesh);
    group.updateMatrixWorld(true);
    const bones: Bone[] = [];
    root.traverse((o) => {
      if (o instanceof Bone) bones.push(o);
    });
    mesh.bind(new Skeleton(bones));
  }
  return group;
}

function child(parent: Bone, name: string, position: [number, number, number]): Bone {
  const bone = new Bone();
  bone.name = name;
  bone.position.fromArray(position);
  parent.add(bone);
  return bone;
}
