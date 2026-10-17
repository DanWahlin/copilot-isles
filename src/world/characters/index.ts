import {
  AnimationClip,
  BufferGeometry,
  Color,
  Group,
  Material,
  Mesh,
  Quaternion,
  SkinnedMesh,
} from 'three/webgpu';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { packs } from '../../engine/packs';
import { cloneClipWithUserData, loadClipPack } from './loco-pack';
import { dressNpcCharacter, mergeNpcAccessories } from './npc-accessories';
import {
  applyCharacterPalette,
  disposeCharacterPaletteCache,
  type CharacterPaletteCache,
} from './npc-palettes';
import { rigFace } from './face-rig';
import { releaseFaceResources } from './face-material';
import { FACE_FITS, faceFamily } from './face-fit';
import { buildLods, buildLodsNow, loadLodSimplifier, type LodSimplifier } from './character-lod';
import { addShoulderMacaw, createMacawGeometry } from './parrot';
import { addTricorn, stowPlayerWeapon } from './props';
import { RuntimeCharacter } from './runtime-character';
import { shareSkinning } from './shared-skinning';
import { stagedMaterial } from './stage-light';
import {
  CHARACTER_BODIES,
  CHARACTER_CLIPS,
  PLAYER_BODIES,
  type BodyConfig,
  type Character,
  type CharacterBody,
  type CharacterClip,
  type CharacterCreateOptions,
  type CharacterLibrary,
  type PlayerBody,
  type SourceKey,
} from './types';

export {
  CHARACTER_BODIES,
  CHARACTER_CLIPS,
  type Character,
  type CharacterBody,
  type CharacterClip,
  type CharacterLibrary,
  type NpcId,
  type PlayerBody,
} from './types';

/**
 * The character library (Phase 0 T11): loads the Quaternius source models and the baked locomotion
 * packs once, then clones a tinted, rigged character per body on demand.
 */

interface SourceAsset {
  readonly key: SourceKey;
  readonly file: string;
  readonly scene: Group;
  readonly clips: ReadonlyMap<CharacterClip, AnimationClip>;
}

const SOURCES: readonly { readonly key: SourceKey; readonly file: string }[] = [
  { key: 'captain', file: 'captain.glb' },
  { key: 'anne', file: 'anne.glb' },
  { key: 'henry', file: 'henry.glb' },
  { key: 'captain_npc', file: 'captain-npc.glb' },
  { key: 'anne_npc', file: 'anne-npc.glb' },
  { key: 'henry_npc', file: 'henry-npc.glb' },
];

const SOURCE_LOCOMOTION: Record<SourceKey, 'captain' | 'anne' | 'henry'> = {
  captain: 'captain',
  anne: 'anne',
  henry: 'henry',
  captain_npc: 'captain',
  anne_npc: 'anne',
  henry_npc: 'henry',
};

export const BODY_CONFIG: Record<CharacterBody, BodyConfig> = {
  man: { source: 'captain', scale: 1, radius: 0.34, height: 1.78, tint: 0xffffff },
  woman: { source: 'anne', scale: 0.98, radius: 0.31, height: 1.7, tint: 0xffffff },
  // Nell hugs her ledger on the left and Ezra his on the right, so each talks with the other hand.
  nell: {
    source: 'anne_npc',
    scale: 1,
    radius: 0.31,
    height: 1.72,
    tint: 0xffffff,
    hand: 'right',
    reads: true,
  },
  dockhand_a: { source: 'henry_npc', scale: 1, radius: 0.33, height: 1.75, tint: 0xffffff },
  // Bo and the Admiral set a fist on the hip and talk with the other hand.
  dockhand_b: {
    source: 'henry_npc',
    scale: 1.02,
    radius: 0.34,
    height: 1.78,
    tint: 0xffffff,
    hand: 'right',
    gestures: 'commander',
  },
  // The rod's in his right fist, so he gestures with his left.
  fisherman: { source: 'henry_npc', scale: 0.98, radius: 0.34, height: 1.72, tint: 0xffffff, hand: 'left' },
  merchant: {
    source: 'henry_npc',
    scale: 0.98,
    radius: 0.33,
    height: 1.74,
    tint: 0xffffff,
    hand: 'left',
    reads: true,
  },
  lookout: { source: 'anne_npc', scale: 1.03, radius: 0.33, height: 1.78, tint: 0xffffff },
  child: { source: 'henry_npc', scale: 0.72, radius: 0.23, height: 1.25, tint: 0xffffff },
  old_sailor: { source: 'captain_npc', scale: 0.96, radius: 0.33, height: 1.67, tint: 0xffffff },
  // Chapter 00 cast from the POC spec §4.3, dressed as period variants of the chibi Pirate Kit rigs.
  suri: { source: 'anne_npc', scale: 0.97, radius: 0.32, height: 1.7, tint: 0xffffff },
  pim: { source: 'henry_npc', scale: 0.94, radius: 0.33, height: 1.66, tint: 0xffffff },
  pol: { source: 'anne_npc', scale: 0.94, radius: 0.33, height: 1.66, tint: 0xffffff },
  juno: { source: 'anne_npc', scale: 1.02, radius: 0.31, height: 1.74, tint: 0xffffff },
  lyra: { source: 'anne_npc', scale: 0.96, radius: 0.31, height: 1.68, tint: 0xffffff },
  // Port Meridian (Chapter 01) cast: varied Mediterranean-harbour silhouettes and free-hand talkers.
  tobias: {
    source: 'henry_npc',
    scale: 1.02,
    radius: 0.34,
    height: 1.78,
    tint: 0xffffff,
    hand: 'right',
  },
  mina: {
    source: 'anne_npc',
    scale: 0.93,
    radius: 0.3,
    height: 1.58,
    tint: 0xffffff,
    hand: 'left',
    reads: true,
  },
  anders: {
    source: 'henry_npc',
    scale: 1.08,
    radius: 0.37,
    height: 1.84,
    tint: 0xffffff,
    hand: 'left',
  },
  // Rhea carries her spyglass in her left fist and talks with her right (the commander's hip fist
  // would put the spyglass through her side, so a carrying hand stays with its prop).
  rhea: {
    source: 'anne_npc',
    scale: 1.02,
    radius: 0.32,
    height: 1.74,
    tint: 0xffffff,
    hand: 'right',
    gestures: 'commander',
  },
  oren: {
    source: 'henry_npc',
    scale: 0.99,
    radius: 0.33,
    height: 1.72,
    tint: 0xffffff,
    hand: 'left',
    reads: true,
  },
  pell: {
    source: 'henry_npc',
    scale: 0.95,
    radius: 0.32,
    height: 1.68,
    tint: 0xffffff,
    hand: 'right',
    reads: true,
  },
  admiral: {
    source: 'anne_npc',
    scale: 1.08,
    radius: 0.34,
    height: 1.84,
    tint: 0xffffff,
    hand: 'right',
    gestures: 'commander',
  },
  // Port Meridian ambient townsfolk: non-teacher bodies for harbour life and plaza animation.
  mer_fisher: {
    source: 'henry_npc',
    scale: 0.93,
    radius: 0.32,
    height: 1.62,
    tint: 0xffffff,
    hand: 'right',
  },
  mer_matron: {
    source: 'anne_npc',
    scale: 1,
    radius: 0.32,
    height: 1.7,
    tint: 0xffffff,
    hand: 'left',
  },
  mer_vendor: {
    source: 'henry_npc',
    scale: 0.99,
    radius: 0.34,
    height: 1.74,
    tint: 0xffffff,
    hand: 'left',
  },
  // Gilda keeps the Model Market under the plaza's arcade (docs/specs/MODEL-MARKET.md).
  mer_market: {
    source: 'anne_npc',
    scale: 0.97,
    radius: 0.32,
    height: 1.66,
    tint: 0xffffff,
    hand: 'right',
  },
  mer_kid_a: { source: 'henry_npc', scale: 0.68, radius: 0.22, height: 1.18, tint: 0xffffff },
  mer_kid_b: { source: 'anne_npc', scale: 0.7, radius: 0.22, height: 1.2, tint: 0xffffff },
  mer_guard: { source: 'henry_npc', scale: 1.05, radius: 0.35, height: 1.82, tint: 0xffffff },
  // Thousand-Bough Isle's cast (docs/specs/ISLAND-02-thousand-bough.md §4.2) and islanders.
  tamsin: { source: 'anne_npc', scale: 1, radius: 0.32, height: 1.72, tint: 0xffffff, hand: 'right' },
  saffi: { source: 'anne_npc', scale: 0.95, radius: 0.31, height: 1.64, tint: 0xffffff, hand: 'left' },
  oak: {
    source: 'henry_npc',
    scale: 1.1,
    radius: 0.37,
    height: 1.86,
    tint: 0xffffff,
    hand: 'right',
    gestures: 'commander',
  },
  fen: { source: 'henry_npc', scale: 0.96, radius: 0.32, height: 1.7, tint: 0xffffff, hand: 'left' },
  ines: { source: 'anne_npc', scale: 0.96, radius: 0.3, height: 1.66, tint: 0xffffff, hand: 'right' },
  rook: { source: 'henry_npc', scale: 1, radius: 0.33, height: 1.76, tint: 0xffffff, hand: 'right' },
  pip: {
    source: 'henry_npc',
    scale: 0.92,
    radius: 0.31,
    height: 1.62,
    tint: 0xffffff,
    hand: 'right',
    reads: true,
  },
  elder: {
    source: 'anne_npc',
    scale: 1.03,
    radius: 0.33,
    height: 1.76,
    tint: 0xffffff,
    hand: 'right',
    gestures: 'commander',
  },
  tb_kid_a: { source: 'henry_npc', scale: 0.68, radius: 0.22, height: 1.18, tint: 0xffffff },
  tb_kid_b: { source: 'anne_npc', scale: 0.7, radius: 0.22, height: 1.2, tint: 0xffffff },
  tb_weaver: { source: 'anne_npc', scale: 0.97, radius: 0.32, height: 1.68, tint: 0xffffff, hand: 'left' },
  tb_operator: { source: 'henry_npc', scale: 1, radius: 0.34, height: 1.74, tint: 0xffffff, hand: 'left' },
  tb_fisher: { source: 'henry_npc', scale: 0.94, radius: 0.32, height: 1.64, tint: 0xffffff, hand: 'right' },
  tb_lookout: { source: 'henry_npc', scale: 1, radius: 0.33, height: 1.75, tint: 0xffffff },
};

/** Atlas columns the jaw carries: skin, plus the captain's beard (hair). */
const JAW_COLUMNS = { anne: [4], henry: [4], captain: [0, 5] } as const;

const PLAYER_VARIANTS = [0xffffff, 0xe8f5ff, 0xffeee4, 0xebffe4] as const;
const TEMP_COLOR = new Color();

export async function loadCharacterLibrary(base = '/packs/testcove/characters'): Promise<CharacterLibrary> {
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const root = base.endsWith('/') ? base : `${base}/`;
  const simplifier = loadLodSimplifier();
  const locomotion = await loadLocomotionPacks(root);
  const loaded = await Promise.all(
    SOURCES.map(async ({ key, file }) => {
      const gltf = await loader.loadAsync(packs.url(`${root}${file}`));
      const scene = gltf.scene;
      scene.name = `source_${key}`;
      prepareSourceScene(scene);
      // NPCs get movable brows and a jaw for their faces; the players' rigs stay as they are.
      if (key.endsWith('_npc')) {
        const family = faceFamily(key);
        rigFace(scene, { mouthY: FACE_FITS[family].mouthY, columns: JAW_COLUMNS[family] });
      }
      return {
        key,
        file,
        scene,
        clips: normalizeClips(gltf.animations, locomotion.get(SOURCE_LOCOMOTION[key])),
      } satisfies SourceAsset;
    }),
  );
  const captain = loaded.find((asset) => asset.key === 'captain')?.scene;
  const macaw = captain ? createMacawGeometry(captain) : null;
  const ernest = captain ? createMacawGeometry(captain, false) : null;
  // Levels of detail for the bodies (shared by every clone), after the face rigs and the macaws,
  // which read the full meshes. One mesh per task, so the load makes no long frame.
  const simplify = await simplifier;
  if (simplify) for (const asset of loaded) await buildLods(asset.scene, simplify, true);
  return new CharacterLibraryImpl(
    new Map(loaded.map((asset) => [asset.key, asset])),
    macaw,
    ernest,
    simplify,
  );
}

class CharacterLibraryImpl implements CharacterLibrary {
  readonly clips = CHARACTER_CLIPS;
  readonly bodies = CHARACTER_BODIES;
  private readonly characterPaletteCache: CharacterPaletteCache = new Map();

  constructor(
    private readonly sources: ReadonlyMap<SourceKey, SourceAsset>,
    private readonly macaw: BufferGeometry | null,
    private readonly ernest: BufferGeometry | null,
    private readonly simplifier: LodSimplifier | null = null,
  ) {}

  create(options: CharacterCreateOptions): Character {
    const body = CHARACTER_BODIES.includes(options.body) ? options.body : 'man';
    const base = BODY_CONFIG[body];
    const k = options.scale ?? 1;
    const config = k === 1 ? base : { ...base, scale: base.scale * k };
    const source = this.sources.get(config.source);
    if (!source) throw new Error(`Missing character source: ${config.source}`);
    const clone = SkeletonUtils.clone(source.scene) as Group;
    clone.name = `character_${body}`;
    clone.scale.setScalar(config.scale);
    shortenForearms(clone);
    clone.updateMatrixWorld(true);
    cloneCharacterMaterials(
      clone,
      body,
      config.source,
      this.characterPaletteCache,
      tintFor(body, config, options.variant ?? 0),
    );
    // The Anne model is bare-headed and bird-less; as a captain she gets a tricorn and a macaw.
    if (body === 'woman') {
      addTricorn(clone);
      if (this.macaw) addShoulderMacaw(clone, this.macaw);
    }
    // The Captain's Ernest moves from his hook arm to his left shoulder (a baked copy).
    if (body === 'man' && this.ernest) {
      const onArm = clone.getObjectByName('Ernest');
      if (onArm) {
        onArm.visible = false;
        addShoulderMacaw(clone, this.ernest, 'UpperArmL');
      }
    }
    if (body === 'man' || body === 'woman') stowPlayerWeapon(clone, body);
    else {
      dressNpcCharacter(clone, body);
      mergeNpcAccessories(clone);
      // The merged accessories are this NPC's own mesh: its levels of detail are made here.
      buildLodsNow(clone, this.simplifier);
    }
    // Every character's materials carry the staging light (key and rim in talk shots, issue #188).
    clone.traverse((object) => {
      if (!(object instanceof Mesh) || object.name === 'character-face') return;
      object.material = Array.isArray(object.material)
        ? object.material.map(stagedMaterial)
        : stagedMaterial(object.material);
    });
    // One skinning shader for every character (issue 235).
    shareSkinning(clone);
    return new RuntimeCharacter(clone, source.clips, body, config, options);
  }

  dispose(): void {
    for (const source of this.sources.values()) {
      source.scene.traverse((object) => {
        if (object instanceof Mesh) {
          object.geometry.dispose();
          disposeMaterial(object.material);
        }
      });
    }
    this.macaw?.dispose();
    this.ernest?.dispose();
    disposeCharacterPaletteCache(this.characterPaletteCache);
    releaseFaceResources();
  }
}

function prepareSourceScene(scene: Group): void {
  scene.traverse((object) => {
    if (object instanceof Mesh) {
      object.frustumCulled = true;
      object.castShadow = true;
      object.receiveShadow = true;
    }
  });
}

async function loadLocomotionPacks(
  root: string,
): Promise<Map<SourceKey, ReadonlyMap<CharacterClip, AnimationClip>>> {
  const loaded = await Promise.all(
    (['captain', 'anne', 'henry'] as const).map(
      async (key) => [key, await loadClipPack(`${root}locomotion-${key}.loco`)] as const,
    ),
  );
  const packs = new Map<SourceKey, ReadonlyMap<CharacterClip, AnimationClip>>();
  for (const [key, pack] of loaded) if (pack.size) packs.set(key, pack);
  return packs;
}

/** The library's clip set from a source's glTF clips and its locomotion pack (the prop audit uses it too). */
export function normalizeClips(
  clips: readonly AnimationClip[],
  locomotion?: ReadonlyMap<CharacterClip, AnimationClip>,
): Map<CharacterClip, AnimationClip> {
  const byName = new Map<CharacterClip, AnimationClip>();
  const find = (needle: string) =>
    clips.find((clip) => clip.name.toLowerCase().includes(needle.toLowerCase()));
  const motion = (name: CharacterClip) => cloneClipWithUserData(locomotion?.get(name));
  const mapping: readonly [CharacterClip, AnimationClip | undefined][] = [
    ['idle', find('|Idle|') ?? find('Idle') ?? motion('idle')],
    ['walk', find('|Walk|') ?? find('Walk') ?? motion('walk')],
    ['jog', find('|Run|') ?? find('Run') ?? motion('jog')],
    ['run', find('|Run|') ?? find('Run') ?? motion('run')],
    ['jumpStart', motion('jumpStart') ?? find('|Jump|') ?? find('Jump')],
    ['jumpLoop', motion('jumpLoop') ?? find('Jump_Idle') ?? find('|Jump|') ?? find('Jump')],
    ['jumpLand', motion('jumpLand') ?? find('Jump_Land') ?? find('|Jump|') ?? find('Jump')],
    // Talkers gesture procedurally over the idle (setTalking); Wave is only ever a one-off hello.
    ['talk', find('|Idle|') ?? find('Idle') ?? motion('talk')],
    ['wave', find('|Wave|') ?? find('Wave') ?? motion('wave')],
    ['nod', find('|Yes|')],
    ['shake', find('|No|')],
    ['sit', find('|Idle|') ?? find('Idle') ?? motion('sit')],
    // Hands on the wheel are posed procedurally over the idle (runtime-character's applyPoseLife).
    ['helm', find('|Idle|') ?? find('Idle') ?? motion('helm')],
    ['wade', find('|Walk|') ?? find('Walk') ?? motion('wade')],
  ];
  for (const [name, clip] of mapping) {
    if (!clip) continue;
    const copy = clip.clone();
    if (STANDING_CLIPS.has(name)) dampTrack(copy, TORSO_TRACKS, TORSO_SWAY_KEEP);
    byName.set(name, copy);
  }
  return byName;
}

/** Clips built on the kit's Idle (every character stands, talks, sits and steers on it). */
const STANDING_CLIPS: ReadonlySet<CharacterClip> = new Set(['idle', 'talk', 'sit', 'helm']);
/** The chest bones whose idle sway is damped. */
const TORSO_TRACKS = ['Torso.quaternion', 'Abdomen.quaternion', 'Chest.quaternion'];
/**
 * The kit's Idle pitches the chest about 6° forward and back on a loop, which reads as the chest
 * thrusting in and out (Dan: odd, and on a woman it can read as inappropriate). Keep a fifth of it, so
 * there's still a trace of breathing.
 */
const TORSO_SWAY_KEEP = 0.2;

/** Pulls each key of the named quaternion tracks toward the track's mean pose, keeping `keep` of it. */
function dampTrack(clip: AnimationClip, names: readonly string[], keep: number): void {
  for (const track of clip.tracks) {
    if (!names.includes(track.name)) continue;
    const v = track.values;
    const n = v.length / 4;
    if (n < 2) continue;
    // Mean pose: sign-aligned average of the keys, normalised.
    const m = [0, 0, 0, 0];
    for (let i = 0; i < n; i++) {
      const sgn =
        v[i * 4]! * v[0]! + v[i * 4 + 1]! * v[1]! + v[i * 4 + 2]! * v[2]! + v[i * 4 + 3]! * v[3]! < 0
          ? -1
          : 1;
      for (let k = 0; k < 4; k++) m[k]! += sgn * v[i * 4 + k]!;
    }
    const len = Math.hypot(m[0]!, m[1]!, m[2]!, m[3]!) || 1;
    for (let k = 0; k < 4; k++) m[k]! /= len;
    const mean = new Quaternion(m[0], m[1], m[2], m[3]);
    const q = new Quaternion();
    for (let i = 0; i < n; i++) {
      q.fromArray(v, i * 4);
      q.copy(mean.clone().slerp(q, keep));
      q.toArray(v, i * 4);
    }
  }
}

/**
 * The kit's arms reach almost to the knees, which reads as abnormally long (Dan). The forearm and hand
 * are scaled down by a fifth from the elbow, before anything is attached to them, so props held in the
 * hand and the IK (which measures the bones live) follow.
 */
const FOREARM_SCALE = 0.8;

export function shortenForearms(root: Group): void {
  for (const name of ['LowerArmL', 'LowerArmR']) {
    const bone = root.getObjectByName(name);
    if (bone) bone.scale.multiplyScalar(FOREARM_SCALE);
  }
}

function tintFor(body: CharacterBody, config: BodyConfig, variant: number): number {
  if (PLAYER_BODIES.includes(body as PlayerBody)) {
    return PLAYER_VARIANTS[Math.abs(Math.trunc(variant)) % PLAYER_VARIANTS.length];
  }
  return config.tint;
}

function cloneCharacterMaterials(
  root: Group,
  body: CharacterBody,
  source: SourceKey,
  characterPaletteCache: CharacterPaletteCache,
  tint: number,
): void {
  root.traverse((object) => {
    if (object instanceof SkinnedMesh) object.normalizeSkinWeights();
    if (object instanceof Mesh)
      object.material = cloneMaterial(object.material, body, source, characterPaletteCache, tint);
  });
}

function cloneMaterial(
  material: Material | Material[],
  body: CharacterBody,
  source: SourceKey,
  characterPaletteCache: CharacterPaletteCache,
  tint: number,
): Material | Material[] {
  if (Array.isArray(material))
    return material.map(
      (entry) => cloneMaterial(entry, body, source, characterPaletteCache, tint) as Material,
    );
  let clone = material.clone();
  clone.userData.isCharacterCloneMaterial = true;
  applyCharacterPalette(clone, body, source, characterPaletteCache);
  if ('color' in clone && clone.color instanceof Color && tint !== 0xffffff && canTintMaterial(clone)) {
    clone.color.copy(TEMP_COLOR.setHex(tint));
  }
  if ('roughness' in clone && typeof clone.roughness === 'number') clone.roughness = 0.72;
  if ('metalness' in clone && typeof clone.metalness === 'number') clone.metalness = 0.02;
  clone = withCharacterRim(clone);
  return clone;
}

function withCharacterRim(material: Material): Material {
  if ('emissive' in material && material.emissive instanceof Color) material.emissive.setHex(0x120c06);
  if ('emissiveIntensity' in material && typeof material.emissiveIntensity === 'number')
    material.emissiveIntensity = 0.16;
  return material;
}

function canTintMaterial(material: Material): boolean {
  const name = material.name.toLowerCase();
  return !name.includes('skin') && !name.includes('atlas');
}

function disposeMaterial(material: Material | Material[]): void {
  if (Array.isArray(material)) {
    for (const entry of material) disposeMaterial(entry);
  } else material.dispose();
}
