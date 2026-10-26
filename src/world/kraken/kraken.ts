import {
  AnimationMixer,
  BufferAttribute,
  Group,
  LoopRepeat,
  MeshStandardNodeMaterial,
  SkinnedMesh,
  Vector3,
  type AnimationAction,
  type AnimationClip,
  type Bone,
  type BufferGeometry,
  type Camera,
  type Object3D,
} from 'three/webgpu';
import { attribute } from 'three/tsl';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { plainShadowColor } from '../../engine/shadow-color';
import type { Tier } from '../contracts';
import { shareSkinning } from '../characters/shared-skinning';
import { createKrakenBody, type KrakenBody } from './kraken-body';
import { ChainPoser, CurvePath } from './tentacle-pose';

export type TentacleClip = 'Tentacle_Idle' | 'Tentacle_Attack' | 'Tentacle_Attack2' | 'Tentacle_Poke';
const CLIPS: readonly TentacleClip[] = [
  'Tentacle_Idle',
  'Tentacle_Attack',
  'Tentacle_Attack2',
  'Tentacle_Poke',
];

/** One tentacle: its own copy of the rig on the shared geometry, material and skinning graph. */
export interface KrakenArm {
  readonly index: number;
  /** At its socket on the body; `rise` moves it up and down the socket's line. */
  readonly root: Group;
  readonly mixer: AnimationMixer;
  readonly actions: Readonly<Record<TentacleClip, AnimationAction>>;
  readonly poser: ChainPoser;
  /** The path the procedural pose follows (world space), filled by the scene each frame. */
  readonly path: CurvePath;
  /** 0 the clip's pose, 1 the path's. */
  weight: number;
  /** World metres the arm is drawn down into the water (0 at its socket). */
  sink: number;
  readonly scale: number;
  /** The arm's length (m) at its scale. */
  readonly length: number;
  readonly socket: Vector3;
  /** Shown (Lite and the distance level of detail draw fewer). */
  shown: boolean;
  /** The clip it plays now. */
  clip: TentacleClip;
}

export interface KrakenOptions {
  tier: Tier;
  /** Where the packs are served from (the page's base). */
  base?: string;
  /** Which sockets get an arm (default: every one, or four on Lite). */
  sockets?: readonly number[];
}

/** The sockets with arms per tier: Lite's four are the ones that face the prey, and one behind. */
export function krakenSockets(tier: Tier): readonly number[] {
  return tier === 'lite' ? [0, 1, 7, 4] : [0, 1, 2, 3, 4, 5, 6, 7];
}

interface TentacleSource {
  geometry: BufferGeometry;
  scene: Object3D;
  clips: readonly AnimationClip[];
}

/**
 * The tentacle and the kraken's material are shared by every kraken (the battle's and the distant
 * sightings'): loaded once, one look. The last kraken disposed frees their GPU side.
 */
let source: Promise<TentacleSource> | null = null;
let shared: MeshStandardNodeMaterial | null = null;
let users = 0;

function loadTentacle(base: string): Promise<TentacleSource> {
  source ??= (async () => {
    await MeshoptDecoder.ready;
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    const gltf = await loader.loadAsync(`${base}tentacle.glb`);
    let geometry: BufferGeometry | null = null;
    gltf.scene.traverse((obj) => {
      const m = obj as SkinnedMesh;
      if (m.isSkinnedMesh) geometry = m.geometry;
    });
    if (!geometry) throw new Error('kraken: no tentacle mesh');
    unpackAttributes(geometry);
    return { geometry, scene: gltf.scene, clips: gltf.animations };
  })();
  // A failed download isn't kept: the next kraken tries again.
  source.catch(() => (source = null));
  return source;
}

/** Past this distance (m) from the camera only the arms that are busy and the first four draw. */
export const KRAKEN_LOD_FAR = 170;

/**
 * The kraken: a body (swappable, `KrakenBody`) and Quaternius's tentacle copied round it at
 * varied scales and phases. Everything shares one material and the characters' shared skinning
 * graph, so the kraken adds one look (one lit shader and its shadow) whatever its arm count.
 */
export class Kraken {
  readonly group = new Group();
  readonly body: KrakenBody;
  readonly arms: KrakenArm[] = [];
  readonly material: MeshStandardNodeMaterial;
  private readonly camPos = new Vector3();
  private lodFar = false;
  private disposed = false;

  private constructor(tentacle: TentacleSource, sockets: readonly number[]) {
    this.group.name = 'kraken';
    const { scene: source, clips } = tentacle;
    users++;
    shared ??= createKrakenMaterial();
    this.material = shared;
    this.body = createKrakenBody(this.material, 8);
    this.group.add(this.body.root);
    // Varied arms: scale, the clip each sways with and its phase. The first three are the long
    // ones that reach for a ship.
    const SCALES = [1.8, 1.7, 1.15, 1.05, 1.2, 1.0, 1.25, 1.8];
    for (const i of sockets) {
      const socket = this.body.sockets[i]!;
      const root = new Group();
      root.name = `kraken arm ${i}`;
      const scale = SCALES[i]!;
      root.scale.setScalar(scale);
      root.position.copy(socket.position);
      // Each arm leans out from the body a little and turns so its suckers face in.
      root.rotation.set(
        socket.outward.z * 0.28,
        Math.atan2(socket.outward.x, socket.outward.z),
        -socket.outward.x * 0.28,
        'YXZ',
      );
      const rig = SkeletonUtils.clone(source);
      root.add(rig);
      const bones: Bone[] = [];
      for (let b = 1; b <= 15; b++) bones.push(rig.getObjectByName(`Tentacle${b}`) as Bone);
      const tip = (rig.getObjectByName('Tentacle15_end') as Bone).position.clone();
      rig.traverse((o) => {
        const m = o as SkinnedMesh;
        if (!m.isSkinnedMesh) return;
        m.material = this.material;
        m.castShadow = true;
        m.receiveShadow = true;
        // A posed arm reaches far from its bind pose's bounds.
        m.frustumCulled = false;
      });
      this.body.root.add(root);
      const mixer = new AnimationMixer(rig);
      const actions = {} as Record<TentacleClip, AnimationAction>;
      for (const name of CLIPS) {
        const clip = clips.find((c) => c.name === name);
        if (!clip) throw new Error(`kraken: no clip ${name}`);
        const action = mixer.clipAction(clip);
        action.setLoop(LoopRepeat, Infinity);
        actions[name] = action;
      }
      actions.Tentacle_Idle.play();
      // Each arm sways at its own pace and phase.
      actions.Tentacle_Idle.time = (i * 0.37) % actions.Tentacle_Idle.getClip().duration;
      actions.Tentacle_Idle.timeScale = 0.75 + (i % 3) * 0.12;
      const poser = new ChainPoser(bones, tip);
      this.arms.push({
        index: i,
        root,
        mixer,
        actions,
        poser,
        path: new CurvePath(48, 6),
        weight: 0,
        sink: 0,
        scale,
        length: 0,
        socket: socket.position.clone(),
        shown: true,
        clip: 'Tentacle_Idle',
      });
    }
    // One material, one skinning graph for the body and every arm.
    shareSkinning(this.group);
    plainShadowColor(this.material);
    this.measure();
  }

  /** Loads the tentacle (once for every kraken) and builds a kraken. */
  static async load(o: KrakenOptions): Promise<Kraken> {
    const base = o.base ?? `${import.meta.env.BASE_URL || '/'}packs/testcove/kraken/`;
    return new Kraken(await loadTentacle(base), o.sockets ?? krakenSockets(o.tier));
  }

  /** Bone lengths in world metres (after the kraken is placed or scaled). */
  measure(): void {
    for (const arm of this.arms) {
      arm.poser.measure(this.group);
      let len = 0;
      for (const l of arm.poser.lengths) len += l;
      (arm as { length: number }).length = len;
    }
  }

  /** Plays `clip` on arm `i` (the k-th arm), fading from what it plays now. */
  play(k: number, clip: TentacleClip, fade = 0.6, timeScale = 1, force = false): void {
    const arm = this.arms[k];
    if (!arm || (arm.clip === clip && !force)) return;
    arm.clip = clip;
    const next = arm.actions[clip];
    for (const name of CLIPS) {
      const a = arm.actions[name];
      if (a === next) continue;
      if (fade > 0) a.fadeOut(fade);
      else a.stop();
    }
    next.reset();
    next.timeScale = timeScale;
    next.setEffectiveWeight(1);
    if (fade > 0) next.fadeIn(fade);
    next.play();
  }

  /** Puts each arm at its socket, drawn down by its `sink` (call before reading their bases). */
  place(): void {
    for (const arm of this.arms) {
      arm.root.position.copy(arm.socket);
      // `sink` is in world metres; the arm's root is in the (scaled) kraken's frame.
      arm.root.position.y -= arm.sink / this.group.scale.y;
    }
  }

  /**
   * Clips, then each arm's path pose by its weight, then the body. `look` is where the eyes turn.
   * Arms past the level of detail's distance that aren't busy stop drawing.
   */
  update(dt: number, t: number, camera: Camera | null, look: Vector3 | null, anger: number): void {
    if (camera) {
      camera.getWorldPosition(this.camPos);
      const d = this.camPos.distanceTo(this.group.position);
      this.lodFar = this.lodFar ? d > KRAKEN_LOD_FAR - 15 : d > KRAKEN_LOD_FAR + 15;
    }
    this.body.update(dt, t, look, anger);
    for (let k = 0; k < this.arms.length; k++) {
      const arm = this.arms[k]!;
      const show = arm.sink < arm.length + 2 && (!this.lodFar || k < 4 || arm.weight > 0);
      arm.root.visible = arm.shown = show;
      if (!show) continue;
      arm.mixer.update(dt);
      if (arm.weight > 0) {
        arm.root.updateWorldMatrix(true, false);
        arm.poser.pose(arm.path, arm.weight);
      }
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.body.dispose();
    for (const arm of this.arms) arm.mixer.stopAllAction();
    // The shared tentacle and material go with the last kraken (their CPU side stays for the next).
    if (--users === 0) {
      shared?.dispose();
      void source?.then((s) => s.geometry.dispose());
    }
  }
}

/**
 * The tentacles' one look: flat vertex colours (the kit's swatches), a little sheen. Shared by the
 * body, so the kraken is one shader (and its shadow) whatever it's made of.
 */
function createKrakenMaterial(): MeshStandardNodeMaterial {
  const m = new MeshStandardNodeMaterial({ roughness: 0.48, metalness: 0 });
  m.name = 'kraken';
  m.colorNode = attribute('color', 'vec3');
  return m;
}

/**
 * The quantized tentacle's attributes as plain floats (and 16-bit joints), the body's layout, so the
 * two draw with one pipeline. The geometry is shared by every arm, so this runs once.
 */
function unpackAttributes(g: BufferGeometry): void {
  for (const name of ['position', 'normal', 'color', 'skinWeight']) {
    const a = g.getAttribute(name);
    if (!a) continue;
    const size = name === 'color' ? 3 : a.itemSize;
    const out = new Float32Array(a.count * size);
    for (let i = 0; i < a.count; i++) for (let c = 0; c < size; c++) out[i * size + c] = a.getComponent(i, c);
    g.setAttribute(name, new BufferAttribute(out, size));
  }
  const j = g.getAttribute('skinIndex');
  if (j && !(j.array instanceof Uint16Array)) {
    const out = new Uint16Array(j.count * 4);
    for (let i = 0; i < j.count; i++) for (let c = 0; c < 4; c++) out[i * 4 + c] = j.getComponent(i, c);
    g.setAttribute('skinIndex', new BufferAttribute(out, 4));
  }
  g.computeBoundingSphere();
}
