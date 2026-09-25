import { AnimationClip, Color, Group, Material, Mesh, SkinnedMesh } from 'three/webgpu';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { packs } from '../../engine/packs';
import { cloneClipWithUserData, loadClipPack } from './loco-pack';
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
  { key: 'farmer', file: 'farmer.glb' },
  { key: 'lis', file: 'lis.glb' },
  { key: 'worker', file: 'worker.glb' },
  { key: 'adventurer', file: 'adventurer.glb' },
];

const BODY_CONFIG: Record<CharacterBody, BodyConfig> = {
  man: { source: 'captain', scale: 1, radius: 0.34, height: 1.78, tint: 0xffffff },
  woman: { source: 'anne', scale: 0.98, radius: 0.31, height: 1.7, tint: 0xffffff },
  nell: { source: 'lis', scale: 1, radius: 0.31, height: 1.72, tint: 0xffffff },
  dockhand_a: { source: 'worker', scale: 1, radius: 0.33, height: 1.75, tint: 0xffffff },
  dockhand_b: { source: 'henry', scale: 1.02, radius: 0.34, height: 1.78, tint: 0xffffff },
  fisherman: { source: 'farmer', scale: 0.98, radius: 0.34, height: 1.72, tint: 0xffffff },
  merchant: { source: 'adventurer', scale: 0.98, radius: 0.33, height: 1.74, tint: 0xffffff },
  lookout: { source: 'anne', scale: 1.03, radius: 0.33, height: 1.78, tint: 0xffffff },
  child: { source: 'henry', scale: 0.72, radius: 0.23, height: 1.25, tint: 0xffffff },
  old_sailor: { source: 'captain', scale: 0.96, radius: 0.33, height: 1.67, tint: 0xffffff },
  // Chapter 00 cast from the POC spec §4.3 (reusing the source rigs with tints until more models land).
  suri: { source: 'adventurer', scale: 0.97, radius: 0.32, height: 1.7, tint: 0xffe2c8 },
  pim: { source: 'farmer', scale: 0.94, radius: 0.33, height: 1.66, tint: 0xdff5e0 },
  pol: { source: 'farmer', scale: 0.94, radius: 0.33, height: 1.66, tint: 0xf5dedb },
  juno: { source: 'lis', scale: 1.02, radius: 0.31, height: 1.74, tint: 0xd9e6ff },
  lyra: { source: 'anne', scale: 0.96, radius: 0.31, height: 1.68, tint: 0xf0dcff },
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
        clips: normalizeClips(gltf.animations, locomotion.get(key)),
      } satisfies SourceAsset;
    }),
  );
  return new CharacterLibraryImpl(new Map(loaded.map((asset) => [asset.key, asset])));
}

class CharacterLibraryImpl implements CharacterLibrary {
  readonly clips = CHARACTER_CLIPS;
  readonly bodies = CHARACTER_BODIES;

  constructor(private readonly sources: ReadonlyMap<SourceKey, SourceAsset>) {}

  create(options: CharacterCreateOptions): Character {
    const body = CHARACTER_BODIES.includes(options.body) ? options.body : 'man';
    const config = BODY_CONFIG[body];
    const source = this.sources.get(config.source);
    if (!source) throw new Error(`Missing character source: ${config.source}`);
    const clone = SkeletonUtils.clone(source.scene) as Group;
    clone.name = `character_${body}`;
    clone.scale.setScalar(config.scale);
    clone.updateMatrixWorld(true);
    cloneCharacterMaterials(clone, tintFor(body, config, options.variant ?? 0));
    // The Anne model is bare-headed; as a captain she wears a tricorn like the Captain's.
    if (body === 'woman') addTricorn(clone);
    if (body === 'man' || body === 'woman') stowPlayerWeapon(clone, body);
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
  const [captain, anne] = await Promise.all([
    loadClipPack(`${root}locomotion-captain.loco`),
    loadClipPack(`${root}locomotion-anne.loco`),
  ]);
  const packs = new Map<SourceKey, ReadonlyMap<CharacterClip, AnimationClip>>();
  if (captain.size) packs.set('captain', captain);
  if (anne.size) packs.set('anne', anne);
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
    ['walk', motion('walk') ?? find('|Walk|') ?? find('Walk')],
    ['jog', motion('jog') ?? find('|Run|') ?? find('Run')],
    ['run', motion('run') ?? find('|Run|') ?? find('Run')],
    ['jumpStart', motion('jumpStart') ?? find('|Jump|') ?? find('Jump')],
    ['jumpLoop', motion('jumpLoop') ?? find('Jump_Idle') ?? find('|Jump|') ?? find('Jump')],
    ['jumpLand', motion('jumpLand') ?? find('Jump_Land') ?? find('|Jump|') ?? find('Jump')],
    ['talk', find('|Yes|') ?? find('|No|') ?? find('|Wave|') ?? find('Idle')],
    ['wave', find('|Wave|') ?? find('Wave')],
    ['sit', find('|Duck|') ?? find('Duck') ?? find('Idle')],
    ['helm', find('|Punch|') ?? find('|Sword|') ?? find('Idle')],
    ['wade', find('|Walk|') ?? find('Walk')],
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

function cloneCharacterMaterials(root: Group, tint: number): void {
  root.traverse((object) => {
    if (object instanceof SkinnedMesh) object.normalizeSkinWeights();
    if (object instanceof Mesh) object.material = cloneMaterial(object.material, tint);
  });
}

function cloneMaterial(material: Material | Material[], tint: number): Material | Material[] {
  if (Array.isArray(material)) return material.map((entry) => cloneMaterial(entry, tint) as Material);
  const clone = material.clone();
  clone.userData.isCharacterCloneMaterial = true;
  if ('color' in clone && clone.color instanceof Color) clone.color.copy(TEMP_COLOR.setHex(tint));
  if ('roughness' in clone && typeof clone.roughness === 'number') clone.roughness = 0.72;
  if ('metalness' in clone && typeof clone.metalness === 'number') clone.metalness = 0.02;
  return clone;
}

function disposeMaterial(material: Material | Material[]): void {
  if (Array.isArray(material)) {
    for (const entry of material) disposeMaterial(entry);
  } else material.dispose();
}
