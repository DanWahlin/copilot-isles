import { AnimationClip, BufferGeometry, Color, Group, Material, Mesh, SkinnedMesh } from 'three/webgpu';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { packs } from '../../engine/packs';
import { cloneClipWithUserData, loadClipPack } from './loco-pack';
import { dressNpcCharacter } from './npc-accessories';
import {
  applyCharacterPalette,
  disposeCharacterPaletteCache,
  type CharacterPaletteCache,
} from './npc-palettes';
import { addShoulderMacaw, createMacawGeometry } from './parrot';
import { addTricorn, stowPlayerWeapon } from './props';
import { RuntimeCharacter } from './runtime-character';
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

const BODY_CONFIG: Record<CharacterBody, BodyConfig> = {
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
  dockhand_b: { source: 'henry_npc', scale: 1.02, radius: 0.34, height: 1.78, tint: 0xffffff },
  fisherman: { source: 'henry_npc', scale: 0.98, radius: 0.34, height: 1.72, tint: 0xffffff },
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
  rhea: {
    source: 'anne_npc',
    scale: 1.02,
    radius: 0.32,
    height: 1.74,
    tint: 0xffffff,
    hand: 'right',
  },
  oren: {
    source: 'captain_npc',
    scale: 0.96,
    radius: 0.33,
    height: 1.67,
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
  admiral: { source: 'anne_npc', scale: 1.08, radius: 0.34, height: 1.84, tint: 0xffffff },
};

const PLAYER_VARIANTS = [0xffffff, 0xe8f5ff, 0xffeee4, 0xebffe4] as const;
const TEMP_COLOR = new Color();

export async function loadCharacterLibrary(base = '/packs/testcove/characters'): Promise<CharacterLibrary> {
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const root = base.endsWith('/') ? base : `${base}/`;
  const locomotion = await loadLocomotionPacks(root);
  const loaded = await Promise.all(
    SOURCES.map(async ({ key, file }) => {
      const gltf = await loader.loadAsync(packs.url(`${root}${file}`));
      const scene = gltf.scene;
      scene.name = `source_${key}`;
      prepareSourceScene(scene);
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
  return new CharacterLibraryImpl(new Map(loaded.map((asset) => [asset.key, asset])), macaw, ernest);
}

class CharacterLibraryImpl implements CharacterLibrary {
  readonly clips = CHARACTER_CLIPS;
  readonly bodies = CHARACTER_BODIES;
  private readonly characterPaletteCache: CharacterPaletteCache = new Map();

  constructor(
    private readonly sources: ReadonlyMap<SourceKey, SourceAsset>,
    private readonly macaw: BufferGeometry | null,
    private readonly ernest: BufferGeometry | null,
  ) {}

  create(options: CharacterCreateOptions): Character {
    const body = CHARACTER_BODIES.includes(options.body) ? options.body : 'man';
    const config = BODY_CONFIG[body];
    const source = this.sources.get(config.source);
    if (!source) throw new Error(`Missing character source: ${config.source}`);
    const clone = SkeletonUtils.clone(source.scene) as Group;
    clone.name = `character_${body}`;
    clone.scale.setScalar(config.scale);
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
    else dressNpcCharacter(clone, body);
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

function normalizeClips(
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
    if (clip) byName.set(name, clip.clone());
  }
  return byName;
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
  const clone = material.clone();
  clone.userData.isCharacterCloneMaterial = true;
  applyCharacterPalette(clone, body, source, characterPaletteCache);
  if ('color' in clone && clone.color instanceof Color && tint !== 0xffffff && canTintMaterial(clone)) {
    clone.color.copy(TEMP_COLOR.setHex(tint));
  }
  if ('roughness' in clone && typeof clone.roughness === 'number') clone.roughness = 0.72;
  if ('metalness' in clone && typeof clone.metalness === 'number') clone.metalness = 0.02;
  return clone;
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
