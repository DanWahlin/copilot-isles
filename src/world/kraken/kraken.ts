import {
  AnimationMixer,
  BufferAttribute,
  Group,
  LoopRepeat,
  Matrix4,
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
import { attribute, smoothstep } from 'three/tsl';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { plainShadowColor } from '../../engine/shadow-color';
import type { Tier } from '../contracts';
import { shareSkinning } from '../characters/shared-skinning';
import { createKrakenBody, type KrakenBody } from './kraken-body';
import { KRAKEN_GLOW_RED, recolourTentacle } from './kraken-palette';
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
  /** Which way the socket points (out and down, the body's frame, unit). */
  readonly outward: Vector3;
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
  /** Each socket's arm scale (default `KRAKEN_ARM_SCALES`). */
  scales?: readonly number[];
  /** Sockets whose arm is the slim one: thinner along its length, for coiling round a mast. */
  slim?: readonly number[];
  /** How fast the clips play: a huge creature moves slowly (0.4–0.6). */
  clipSpeed?: number;
}

/**
 * Each socket's arm scale: long arms that reach a ship from under the water. Socket 0's (the one
 * that arcs over a deck and coils a mast) is shorter, so its bones are short enough to wind tight.
 */
export const KRAKEN_ARM_SCALES: readonly number[] = [1.75, 2.2, 2.0, 2.1, 1.9, 2.1, 2.0, 2.2];

/** The sockets with arms per tier: Lite's four are the ones that face the prey, and one behind. */
export function krakenSockets(tier: Tier): readonly number[] {
  return tier === 'lite' ? [0, 1, 7, 6] : [0, 1, 2, 3, 4, 5, 6, 7];
}

interface TentacleSource {
  geometry: BufferGeometry;
  /** The same arm, thinner along its length (made once, on first use). */
  slim: BufferGeometry | null;
  mesh: SkinnedMesh;
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
    let mesh: SkinnedMesh | null = null;
    gltf.scene.traverse((obj) => {
      const m = obj as SkinnedMesh;
      if (m.isSkinnedMesh) mesh = m;
    });
    if (!mesh) throw new Error('kraken: no tentacle mesh');
    const geometry = (mesh as SkinnedMesh).geometry;
    unpackAttributes(geometry);
    return { geometry, slim: null, mesh, scene: gltf.scene, clips: gltf.animations };
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
  /**
   * Poses arm `k` after its clip (the encounter drives its arms along paths); without it, an arm
   * with a weight follows its `path`.
   */
  onPose: ((arm: KrakenArm, k: number) => void) | null = null;
  private readonly camPos = new Vector3();
  private lodFar = false;
  private disposed = false;
  private readonly slim: BufferGeometry | null;

  private constructor(tentacle: TentacleSource, sockets: readonly number[], o: KrakenOptions) {
    this.group.name = 'kraken';
    const { scene: source, clips } = tentacle;
    users++;
    shared ??= createKrakenMaterial();
    this.material = shared;
    this.body = createKrakenBody(this.material, 8);
    this.group.add(this.body.root);
    // Varied arms: scale, the clip each sways with and its phase.
    const scales = o.scales ?? KRAKEN_ARM_SCALES;
    const speed = o.clipSpeed ?? 0.5;
    this.slim = o.slim?.length ? slimTentacle(tentacle) : null;
    for (const i of sockets) {
      const socket = this.body.sockets[i]!;
      const root = new Group();
      root.name = `kraken arm ${i}`;
      const scale = scales[i] ?? 2;
      root.scale.setScalar(scale);
      root.position.copy(socket.position);
      // Each arm turns to face out from its socket (its suckers inward).
      root.rotation.set(0, Math.atan2(socket.outward.x, socket.outward.z), 0, 'YXZ');
      const rig = SkeletonUtils.clone(source);
      root.add(rig);
      const bones: Bone[] = [];
      for (let b = 1; b <= 15; b++) bones.push(rig.getObjectByName(`Tentacle${b}`) as Bone);
      const tip = (rig.getObjectByName('Tentacle15_end') as Bone).position.clone();
      const slimArm = !!this.slim && !!o.slim?.includes(i);
      rig.traverse((obj) => {
        const m = obj as SkinnedMesh;
        if (!m.isSkinnedMesh) return;
        m.material = this.material;
        if (slimArm) m.geometry = this.slim!;
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
      actions.Tentacle_Idle.timeScale = speed * (0.85 + (i % 3) * 0.12);
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
        outward: socket.outward.clone(),
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
    return new Kraken(await loadTentacle(base), o.sockets ?? krakenSockets(o.tier), o);
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
      // An arm on a path all the way (weight 1) needs no clip under it.
      if (arm.weight < 1) arm.mixer.update(dt);
      if (this.onPose) {
        arm.root.updateWorldMatrix(true, false);
        this.onPose(arm, k);
      } else if (arm.weight > 0) {
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
      void source?.then((s) => {
        s.geometry.dispose();
        s.slim?.dispose();
      });
    }
  }
}

/**
 * The kraken's one look (arms and body): flat vertex colours (deep-sea teal-green, amber suckers) and
 * a soft sheen; its eyes' amber, the only colour that red, glows (through the post, as any emissive
 * does). Shared by every kraken, so it's one shader (and its shadow) whatever it's made of.
 */
function createKrakenMaterial(): MeshStandardNodeMaterial {
  const m = new MeshStandardNodeMaterial({ roughness: 0.5, metalness: 0 });
  m.name = 'kraken';
  const vc = attribute('color', 'vec3');
  m.colorNode = vc;
  m.emissiveNode = vc.mul(smoothstep(KRAKEN_GLOW_RED, 0.99, vc.x)).mul(2.2);
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
  // The atlas's swatches as the game draws them: a teal-green back, a sea-green underside, amber suckers.
  g.computeBoundingBox();
  const box = g.boundingBox!;
  recolourTentacle(
    g.getAttribute('color').array as Float32Array,
    g.getAttribute('normal').array as Float32Array,
    g.getAttribute('position').array as Float32Array,
    Math.max(box.max.x - box.min.x, box.max.y - box.min.y, box.max.z - box.min.z),
  );
  const j = g.getAttribute('skinIndex');
  if (j && !(j.array instanceof Uint16Array)) {
    const out = new Uint16Array(j.count * 4);
    for (let i = 0; i < j.count; i++) for (let c = 0; c < 4; c++) out[i * 4 + c] = j.getComponent(i, c);
    g.setAttribute('skinIndex', new BufferAttribute(out, 4));
  }
  g.computeBoundingSphere();
}

const _bind = new Matrix4();
const _bone = new Matrix4();

/**
 * The tentacle made thinner along its length, for an arm that coils round a mast: each vertex moves
 * toward its bone's line (in the bind pose) by a factor that falls from 1 at the base to 0.55 from
 * the middle on. Same vertex layout, so the same shader; made once and shared.
 */
function slimTentacle(t: TentacleSource): BufferGeometry {
  if (t.slim) return t.slim;
  const mesh = t.mesh;
  const sk = mesh.skeleton;
  const names: string[] = [];
  for (let b = 1; b <= 15; b++) names.push(`Tentacle${b}`);
  names.push('Tentacle15_end');
  const slots = names.map((n) => sk.bones.findIndex((b) => b.name === n));
  // Each joint in the geometry's own space (the bind pose).
  _bind.copy(mesh.bindMatrix).invert();
  const joints = slots.map((s) =>
    new Vector3().setFromMatrixPosition(_bone.copy(sk.boneInverses[s]!).invert()).applyMatrix4(_bind),
  );
  const chainOf = new Map<number, number>();
  slots.forEach((s, j) => chainOf.set(s, j));
  const g = t.geometry.clone();
  const pos = g.getAttribute('position');
  const idx = g.getAttribute('skinIndex');
  const wt = g.getAttribute('skinWeight');
  const v = new Vector3();
  const seg = new Vector3();
  const along = new Vector3();
  for (let i = 0; i < pos.count; i++) {
    let best = -1;
    let bestW = 0;
    for (let c = 0; c < 4; c++) {
      const j = chainOf.get(idx.getComponent(i, c));
      const w = wt.getComponent(i, c);
      if (j !== undefined && j < joints.length - 1 && w > bestW) {
        bestW = w;
        best = j;
      }
    }
    if (best < 0) continue;
    v.fromBufferAttribute(pos, i);
    const a = joints[best]!;
    seg.subVectors(joints[best + 1]!, a);
    const len2 = seg.lengthSq() || 1;
    const u = Math.min(1, Math.max(0, v.clone().sub(a).dot(seg) / len2));
    along.copy(a).addScaledVector(seg, u);
    const x = best + u;
    const f = x < 3 ? 1 : x > 7 ? 0.55 : 1 - 0.45 * ((x - 3) / 4);
    v.sub(along).multiplyScalar(f).add(along);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeBoundingSphere();
  t.slim = g;
  return g;
}
