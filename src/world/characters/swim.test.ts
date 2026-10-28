import { readFileSync } from 'node:fs';
import { Group, SkinnedMesh, Vector3, type Mesh } from 'three/webgpu';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { describe, expect, it } from 'vitest';
import { BODY_CONFIG, shortenForearms } from './index';
import { parseLocoPack } from './loco-pack';
import { BodySurface, parseCharacterGlb, type RigSource } from './prop-audit';
import { stowPlayerWeapon } from './props';
import { RuntimeCharacter } from './runtime-character';
import type { SwimLayer } from './swim-layer';
import type { CharacterClip, CharacterGroundMode } from './types';

/**
 * The captains swim on the locomotion pack's Swim_Fwd_Loop and Swim_Idle_Loop (Quaternius's
 * Universal Animation Library, CC0), blended over the walk and wade by how far the body floats.
 * The player controller holds the feet's spot `treadFloat` (0.7 m) under the surface treading
 * water and `strokeFloat` (0.48 m) in the stroke (game/player-controller.ts): these check the real
 * rigs keep the head out at those heights.
 */

const TREAD_FLOAT = 0.7;
const STROKE_FLOAT = 0.48;

const file = (name: string) => new URL(`../../../public/packs/testcove/characters/${name}`, import.meta.url);

async function captain(
  body: 'man' | 'woman' = 'man',
): Promise<{ rig: RigSource; clips: Map<CharacterClip, never> }> {
  const key = body === 'man' ? 'captain' : 'anne';
  const rig = await parseCharacterGlb(new Uint8Array(readFileSync(file(`${key}.glb`))), key);
  const bytes = readFileSync(file(`locomotion-${key}.loco`));
  const loco = parseLocoPack(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  const clips = new Map(rig.clips) as Map<CharacterClip, never>;
  for (const name of ['swim', 'tread'] as const) clips.set(name, loco.get(name) as never);
  return { rig, clips };
}

/** A player captain built as the library builds one (clips, scale, forearms, the stowed weapon). */
function build(rig: RigSource, clips: Map<CharacterClip, never>, body: 'man' | 'woman' = 'man') {
  const config = BODY_CONFIG[body];
  const group = SkeletonUtils.clone(rig.scene) as Group;
  group.scale.setScalar(config.scale);
  shortenForearms(group);
  group.updateMatrixWorld(true);
  group.traverse((o) => {
    if (o instanceof SkinnedMesh) o.normalizeSkinWeights();
  });
  stowPlayerWeapon(group, body);
  const character = new RuntimeCharacter(group, clips, body, config, {
    body,
    tier: { tier: 'high', npcAnimRate: 1 },
  });
  return { character, group };
}

/** The skinned body (the largest skinned mesh: body, head and hat). */
function bodyOf(group: Group): SkinnedMesh {
  let best: SkinnedMesh | null = null;
  group.traverse((o) => {
    if (
      o instanceof SkinnedMesh &&
      (!best || o.geometry.attributes.position!.count > best.geometry.attributes.position!.count)
    )
      best = o;
  });
  return best!;
}

/** Each vertex's bone with the most weight. */
function mainBones(mesh: SkinnedMesh): string[] {
  const index = mesh.geometry.getAttribute('skinIndex');
  const weight = mesh.geometry.getAttribute('skinWeight');
  const names: string[] = [];
  for (let i = 0; i < index.count; i++) {
    let best = 0;
    for (let k = 1; k < 4; k++) if (weight.getComponent(i, k) > weight.getComponent(i, best)) best = k;
    names.push(mesh.skeleton.bones[index.getComponent(i, best)]!.name);
  }
  return names;
}

const TRUNK = /^(Body|Hips|Abdomen|Torso|Neck|Head)$/;
/** The forearm, hand and fingers (the hook on the Captain's left) of one side. */
const forearm = (side: 'L' | 'R') =>
  new RegExp(`^(LowerArm|Middle\\d|Index\\d|Pinky\\d|Thumb\\d|Ring\\d)${side}$`);

const at = (group: Group, name: string, out = new Vector3()) => {
  group.updateMatrixWorld(true);
  return group.worldToLocal(group.getObjectByName(name)!.getWorldPosition(out));
};

/** Plays `seconds` afloat (`stroke` of it the swim stroke), calling `each` after every frame. */
function play(
  character: RuntimeCharacter,
  afloat: number,
  stroke: number,
  speed: number,
  seconds: number,
  mode: CharacterGroundMode = 'swim',
  each?: () => void,
) {
  for (let i = 0; i < Math.round(seconds * 60); i++) {
    character.setGrounding({ mode, afloat, stroke });
    character.setSpeed(speed);
    character.update(1 / 60);
    each?.();
  }
}

describe('swimming captains', () => {
  for (const body of ['man', 'woman'] as const)
    it(`keeps ${body === 'man' ? 'the Captain' : 'Anne'}’s head out of the water, stroking and treading`, async () => {
      const { rig, clips } = await captain(body);
      const { character, group } = build(rig, clips, body);
      const head = new Vector3();
      const top = new Vector3();
      let lowStroke = Infinity;
      let reach = 0;
      play(character, 1, 1, 0.95, 1);
      play(character, 1, 1, 0.95, 2.7, 'swim', () => {
        // The head's middle and its crown over the surface, the feet's spot STROKE_FLOAT under it.
        at(group, 'Head', head);
        at(group, 'Head_end', top);
        lowStroke = Math.min(lowStroke, Math.max(head.y, top.y) - STROKE_FLOAT);
        reach = Math.max(reach, head.z, top.z);
      });
      expect(lowStroke).toBeGreaterThan(0.1);
      // Drawn back by its chest, the head stays within reach of the walker's radius plus a hand.
      expect(reach).toBeLessThan(0.6);
      let lowTread = Infinity;
      play(character, 1, 0, 0, 1);
      play(character, 1, 0, 0, 3.4, 'swim', () => {
        at(group, 'Head', head);
        lowTread = Math.min(lowTread, head.y - TREAD_FLOAT);
      });
      expect(lowTread).toBeGreaterThan(0.1);
      character.dispose();
    });

  for (const body of ['man', 'woman'] as const)
    it(`swims ${body === 'man' ? 'the Captain' : 'Anne'}’s crawl hand over hand, clear of the head, hat and body`, async () => {
      const { rig, clips } = await captain(body);
      const { character, group } = build(rig, clips, body);
      const swim = (character as unknown as { swim: SwimLayer }).swim;
      const mesh = bodyOf(group);
      const bones = mainBones(mesh);
      // The trunk, head and hat: what a hand or forearm mustn't go through.
      const trunk = new BodySurface(mesh as Mesh, (v) => TRUNK.test(bones[v]!));
      const arms = { L: [] as number[], R: [] as number[] };
      bones.forEach((name, v) => {
        if (forearm('L').test(name)) arms.L.push(v);
        if (forearm('R').test(name)) arms.R.push(v);
      });
      expect(arms.L.length).toBeGreaterThan(20);
      expect(arms.R.length).toBeGreaterThan(20);
      play(character, 1, 1, 0.95, 1);
      const v = new Vector3();
      const deepest = { L: 0, R: 0 };
      const hand = { L: new Vector3(), R: new Vector3() };
      const reach = { L: [Infinity, -Infinity], R: [Infinity, -Infinity] };
      // The forward swing's first harmonic per arm, by the stroke's phase.
      const wave = { L: [0, 0], R: [0, 0] };
      // Each hand's entries (the ripple hook): when, and how far over the surface.
      const entries: { side: 'L' | 'R'; t: number; over: number }[] = [];
      let t = 0;
      character.strokeEntries();
      play(character, 1, 1, 0.95, 2.7, 'swim', () => {
        t += 1 / 60;
        group.updateMatrixWorld(true);
        // A vertex more than REACH (8 cm) inside reads as outside, but the arms move a centimetre
        // or two a frame, so anything going in is caught on its way through the skin.
        trunk.update();
        const turn = swim.phase * Math.PI * 2;
        const went = character.strokeEntries();
        for (const side of ['L', 'R'] as const) {
          for (const i of arms[side]) {
            mesh.getVertexPosition(i, v).applyMatrix4(mesh.matrixWorld);
            deepest[side] = Math.max(deepest[side], trunk.signed(v, null));
          }
          at(group, side === 'L' ? 'Middle1L' : 'Middle1R', hand[side]);
          reach[side][0] = Math.min(reach[side][0]!, hand[side].z);
          reach[side][1] = Math.max(reach[side][1]!, hand[side].z);
          wave[side][0] += hand[side].z * Math.cos(turn);
          wave[side][1] += hand[side].z * Math.sin(turn);
          if (went & (side === 'L' ? 1 : 2)) entries.push({ side, t, over: hand[side].y - STROKE_FLOAT });
        }
      });
      // Within a centimetre of the skin, as the held-prop audit allows (prop-audit.test.ts).
      expect(deepest.L).toBeLessThan(0.01);
      expect(deepest.R).toBeLessThan(0.01);
      // Each hand reaches well ahead of the shoulders and pulls back to the hip.
      for (const side of ['L', 'R'] as const) {
        expect(reach[side][1]).toBeGreaterThan(0.25);
        expect(reach[side][0]).toBeLessThan(-0.15);
      }
      // Left then right: the arms are half a cycle apart (within a twentieth of one).
      const gap = Math.atan2(wave.L[1]!, wave.L[0]!) - Math.atan2(wave.R[1]!, wave.R[0]!);
      const half = Math.abs(Math.abs(Math.atan2(Math.sin(gap), Math.cos(gap))) - Math.PI) / (Math.PI * 2);
      expect(half).toBeLessThan(0.05);
      // The hands go in by turns, each at the surface (within a hand's length), evenly spaced.
      expect(entries.length).toBeGreaterThanOrEqual(3);
      for (let i = 1; i < entries.length; i++) expect(entries[i]!.side).not.toBe(entries[i - 1]!.side);
      for (const e of entries) expect(Math.abs(e.over)).toBeLessThan(0.12);
      const beats = entries.slice(1).map((e, i) => e.t - entries[i]!.t);
      for (const b of beats) expect(b).toBeCloseTo(beats[0]!, 1);
      character.dispose();
    });

  it('blends from the wade into the stroke with no jump in the pose', async () => {
    const { rig, clips } = await captain();
    const { character, group } = build(rig, clips);
    const head = new Vector3();
    const last = new Vector3();
    play(character, 0, 0, 0.9, 1, 'wade');
    at(group, 'Head', last);
    at(group, 'Head', last);
    let jump = 0;
    // The bed falls away over two seconds as he wades on, and he strokes off.
    for (let i = 1; i <= 180; i++) {
      const a = Math.min(1, i / 120);
      play(character, a, Math.max(0, (i - 60) / 120), 0.9, 1 / 60, a < 0.5 ? 'wade' : 'swim');
      at(group, 'Head', head);
      jump = Math.max(jump, head.distanceTo(last));
      last.copy(head);
    }
    // At most a few centimetres a frame (the clips' own motion is up to ~2).
    expect(jump).toBeLessThan(0.04);
    character.dispose();
  });

  it('puts the stowed cutlass away while he swims (the kick would sweep through it)', async () => {
    const { rig, clips } = await captain();
    const { character, group } = build(rig, clips);
    const blade = group.getObjectByName('Weapon_Cutlass')!;
    play(character, 0, 0, 0.9, 0.2, 'wade');
    expect(blade.visible).toBe(true);
    play(character, 0.4, 0, 0.9, 0.2, 'wade');
    expect(blade.visible).toBe(true);
    play(character, 1, 1, 0.95, 0.2);
    expect(blade.visible).toBe(false);
    play(character, 0.2, 0, 0.9, 0.2, 'wade');
    expect(blade.visible).toBe(true);
    character.dispose();
  });

  it('gives NPCs no swim layer', async () => {
    const { rig, clips } = await captain();
    const group = SkeletonUtils.clone(rig.scene) as Group;
    const npc = new RuntimeCharacter(group, clips, 'nell', BODY_CONFIG.nell, {
      body: 'nell',
      tier: { tier: 'high', npcAnimRate: 1 },
    });
    const inner = npc as unknown as { actions: Map<CharacterClip, unknown>; swim: unknown };
    expect(inner.actions.has('walk')).toBe(true);
    expect(inner.actions.has('swim')).toBe(false);
    expect(inner.swim).toBeNull();
    npc.dispose();
  });
});
