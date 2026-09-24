import {
  AnimationAction,
  AnimationClip,
  AnimationMixer,
  Bone,
  Color,
  Group,
  LoopRepeat,
  Material,
  Mesh,
  Object3D,
  SkinnedMesh,
  Vector3,
} from 'three/webgpu';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { packs } from '../../engine/packs';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import type { TierSettings } from '../../engine/quality';
import { ANNE_HAT_SWATCHES, ANNE_TRICORN_FIT, createTricornGeometry } from './tricorn';

export const PLAYER_BODIES = ['man', 'woman'] as const;
export const NPC_IDS = [
  'nell',
  'dockhand_a',
  'dockhand_b',
  'fisherman',
  'merchant',
  'lookout',
  'child',
  'old_sailor',
  'suri',
  'pim',
  'pol',
  'juno',
  'lyra',
] as const;
export const CHARACTER_BODIES = [...PLAYER_BODIES, ...NPC_IDS] as const;
export const CHARACTER_CLIPS = ['idle', 'walk', 'run', 'talk', 'wave', 'sit', 'helm', 'wade'] as const;

export type PlayerBody = (typeof PLAYER_BODIES)[number];
export type NpcId = (typeof NPC_IDS)[number];
export type CharacterBody = (typeof CHARACTER_BODIES)[number];
export type CharacterClip = (typeof CHARACTER_CLIPS)[number];
export type LookTarget = Vector3 | Object3D | null;

export interface CharacterCreateOptions {
  body: CharacterBody;
  /** Player palette 0-3; NPCs use role defaults plus this optional tint offset. */
  variant?: number;
  /** Pass the runtime tier so NPC mixers can be throttled on Low/Lite. */
  tier?: Pick<TierSettings, 'npcAnimRate' | 'tier'>;
  /** Optional camera/player object for distance-based NPC mixer throttling. */
  updateTarget?: Object3D;
}

export interface Character {
  readonly group: Group;
  play(clip: CharacterClip, fade?: number): void;
  setSpeed(mps: number): void;
  lookAt(target: LookTarget): void;
  update(dt: number): void;
  readonly capsule: { readonly radius: number; readonly height: number };
  dispose(): void;
}

export interface CharacterLibrary {
  readonly clips: readonly CharacterClip[];
  readonly bodies: readonly CharacterBody[];
  create(options: CharacterCreateOptions): Character;
  dispose(): void;
}

type SourceKey = 'captain' | 'anne' | 'henry' | 'farmer' | 'lis' | 'worker' | 'adventurer';

interface SourceAsset {
  readonly key: SourceKey;
  readonly file: string;
  readonly scene: Group;
  readonly clips: ReadonlyMap<CharacterClip, AnimationClip>;
}

interface BodyConfig {
  readonly source: SourceKey;
  readonly scale: number;
  readonly radius: number;
  readonly height: number;
  readonly tint: number;
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
const WALK_STRIDE_METERS = 1.15;
const RUN_STRIDE_METERS = 2.05;
const WALK_SPEED = 1.35;
const RUN_SPEED = 3.8;
const TEMP_COLOR = new Color();

export async function loadCharacterLibrary(base = '/packs/testcove/characters'): Promise<CharacterLibrary> {
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const root = base.endsWith('/') ? base : `${base}/`;
  const loaded = await Promise.all(
    SOURCES.map(async ({ key, file }) => {
      const gltf = await loader.loadAsync(packs.url(`${root}${file}`));
      const scene = gltf.scene;
      scene.name = `source_${key}`;
      prepareSourceScene(scene);
      return { key, file, scene, clips: normalizeClips(gltf.animations) } satisfies SourceAsset;
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

class RuntimeCharacter implements Character {
  readonly capsule: { readonly radius: number; readonly height: number };

  private readonly mixer: AnimationMixer;
  private readonly actions = new Map<CharacterClip, AnimationAction>();
  private readonly head: Bone | null;
  private readonly neck: Bone | null;
  private readonly targetWorld = new Vector3();
  private readonly lookWorld = new Vector3();
  private lookTarget: LookTarget = null;
  private readonly npc: boolean;
  private readonly npcAnimRate: number;
  private readonly updateTarget: Object3D | null;
  private throttledDt = 0;

  constructor(
    readonly group: Group,
    clips: ReadonlyMap<CharacterClip, AnimationClip>,
    body: CharacterBody,
    config: BodyConfig,
    options: CharacterCreateOptions,
  ) {
    this.npc = !PLAYER_BODIES.includes(body as PlayerBody);
    this.npcAnimRate = Math.max(0.1, options.tier?.npcAnimRate ?? 1);
    this.updateTarget = options.updateTarget ?? null;
    this.capsule = { radius: config.radius * config.scale, height: config.height * config.scale };
    this.mixer = new AnimationMixer(group);
    for (const clipName of CHARACTER_CLIPS) {
      const clip = clips.get(clipName);
      if (!clip) continue;
      const action = this.mixer.clipAction(clip);
      action.loop = LoopRepeat;
      action.enabled = true;
      action.setEffectiveWeight(clipName === 'idle' ? 1 : 0);
      action.play();
      this.actions.set(clipName, action);
    }
    this.head =
      group.getObjectByName('Head') instanceof Bone ? (group.getObjectByName('Head') as Bone) : null;
    this.neck =
      group.getObjectByName('Neck') instanceof Bone ? (group.getObjectByName('Neck') as Bone) : null;
    this.mixer.update(0.001);
  }

  play(clip: CharacterClip, fade = 0.22): void {
    if (!this.actions.has(clip)) return;
    for (const [name, action] of this.actions) fadeAction(action, name === clip ? 1 : 0, fade);
    if (clip === 'wade') this.actions.get('wade')?.setEffectiveTimeScale(0.55);
  }

  setSpeed(mps: number): void {
    const speed = Math.max(0, Number.isFinite(mps) ? mps : 0);
    const idle = this.actions.get('idle');
    const walk = this.actions.get('walk');
    const run = this.actions.get('run');
    if (!idle || !walk || !run) return;
    const runWeight = smoothstep(WALK_SPEED, RUN_SPEED, speed);
    const walkWeight = smoothstep(0.08, WALK_SPEED, speed) * (1 - runWeight);
    const idleWeight = Math.max(0, 1 - walkWeight - runWeight);
    fadeAction(idle, idleWeight, 0.18);
    fadeAction(walk, walkWeight, 0.18);
    fadeAction(run, runWeight, 0.18);
    for (const [name, action] of this.actions) {
      if (name !== 'idle' && name !== 'walk' && name !== 'run') fadeAction(action, 0, 0.18);
    }
    syncStride(walk, speed, WALK_STRIDE_METERS);
    syncStride(run, speed, RUN_STRIDE_METERS);
  }

  lookAt(target: LookTarget): void {
    this.lookTarget = target;
  }

  update(dt: number): void {
    const step = this.animationStep(dt);
    if (step > 0) this.mixer.update(step);
    this.applyLookAt();
  }

  dispose(): void {
    this.mixer.stopAllAction();
    this.group.traverse((object) => {
      if (object instanceof Mesh) disposeOwnedMaterial(object.material);
      if (object instanceof Mesh && object.userData.ownedGeometry) object.geometry.dispose();
    });
  }

  private animationStep(dt: number): number {
    if (!this.npc) return dt;
    this.throttledDt += dt;
    const interval = this.npcInterval();
    if (this.throttledDt < interval) return 0;
    const step = this.throttledDt;
    this.throttledDt = 0;
    return step;
  }

  private npcInterval(): number {
    let interval = 1 / 60 / this.npcAnimRate;
    if (!this.updateTarget) return interval;
    this.updateTarget.getWorldPosition(this.targetWorld);
    const distanceSq = this.group.position.distanceToSquared(this.targetWorld);
    if (distanceSq > 170 * 170) return Math.max(interval, 0.5);
    if (distanceSq > 95 * 95) interval = Math.max(interval, 1 / 10);
    else if (distanceSq > 55 * 55) interval = Math.max(interval, 1 / 20);
    return interval;
  }

  private applyLookAt(): void {
    if (!this.lookTarget || (!this.head && !this.neck)) return;
    if (this.lookTarget instanceof Object3D) this.lookTarget.getWorldPosition(this.lookWorld);
    else this.lookWorld.copy(this.lookTarget);
    if (this.neck) this.neck.lookAt(this.lookWorld);
    if (this.head) this.head.lookAt(this.lookWorld);
  }
}

/**
 * Hangs a tricorn on the Head bone so it follows every nod and look. It reuses the body's atlas
 * material, so it shares the program the rigid weapon meshes already compile (+1 draw, +0 programs).
 */
function addTricorn(root: Group): void {
  const head = root.getObjectByName('Head');
  let body: SkinnedMesh | null = null;
  root.traverse((o) => {
    if (!body && o instanceof SkinnedMesh) body = o;
  });
  if (!(head instanceof Bone) || !body) return;
  const skinned: SkinnedMesh = body;
  root.updateMatrixWorld(true);
  const headScale = head.getWorldScale(new Vector3()).x;
  const rootScale = root.getWorldScale(new Vector3()).x;
  const hat = new Mesh(createTricornGeometry(ANNE_TRICORN_FIT, ANNE_HAT_SWATCHES), skinned.material);
  hat.name = 'captain tricorn';
  hat.userData.ownedGeometry = true;
  // Author in metres: undo the armature's scale between the root and the Head bone.
  hat.scale.setScalar(rootScale / headScale);
  hat.castShadow = true;
  hat.receiveShadow = true;
  head.add(hat);
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

function normalizeClips(clips: readonly AnimationClip[]): Map<CharacterClip, AnimationClip> {
  const byName = new Map<CharacterClip, AnimationClip>();
  const find = (needle: string) =>
    clips.find((clip) => clip.name.toLowerCase().includes(needle.toLowerCase()));
  const mapping: readonly [CharacterClip, AnimationClip | undefined][] = [
    ['idle', find('|Idle|') ?? find('Idle')],
    ['walk', find('|Walk|') ?? find('Walk')],
    ['run', find('|Run|') ?? find('Run')],
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

function fadeAction(action: AnimationAction, weight: number, fade: number): void {
  action.enabled = true;
  action.paused = false;
  action.setEffectiveWeight(Math.max(0, Math.min(1, weight)));
  if (weight > 0) action.fadeIn(fade);
  else action.fadeOut(fade);
}

function syncStride(action: AnimationAction, speed: number, stride: number): void {
  const duration = Math.max(0.001, action.getClip().duration);
  const cyclesPerSecond = speed <= 0.02 ? 1 : speed / stride;
  action.setEffectiveTimeScale(Math.max(0.25, cyclesPerSecond * duration));
}

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function disposeOwnedMaterial(material: Material | Material[]): void {
  if (Array.isArray(material)) {
    for (const entry of material) disposeOwnedMaterial(entry);
  } else if (material.userData.isCharacterCloneMaterial) material.dispose();
}

function disposeMaterial(material: Material | Material[]): void {
  if (Array.isArray(material)) {
    for (const entry of material) disposeMaterial(entry);
  } else material.dispose();
}
