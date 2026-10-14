import { Group, Mesh, SkinnedMesh, Vector3, type AnimationClip, type Object3D } from 'three/webgpu';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { FACE_FITS, faceFamily } from './face-fit';
import { rigFace } from './face-rig';
import { BODY_CONFIG, normalizeClips, shortenForearms } from './index';
import { dressNpcCharacter, mergeNpcAccessories } from './npc-accessories';
import { RuntimeCharacter } from './runtime-character';
import { shareSkinning } from './shared-skinning';
import type { CharacterClip, NpcId, SourceKey } from './types';
import { mulberry32 } from '../../util/math';

/**
 * The held-prop audit (test support, never shipped): builds an NPC as the character library does,
 * plays every clip and talk mode it can be in, and measures how deep any prop (in a hand, on the belt
 * or the back) goes into the skinned body, on the CPU, from the drawn pose.
 */

/** Parts worn on the belt, the back or the ground: they ride a bone and must stay outside the body. */
const WORN_PROPS: ReadonlySet<string> = new Set([
  'satchel',
  'rolled chart',
  'spyglass',
  'spyglass rim',
  'lute body',
  'lute soundhole',
  'lute neck',
  'lute string',
  'fish bucket',
  'tool handle',
  'tool head',
  'money pouch',
  'money pouch clasp',
  'tackle pouch',
  'fishing cork',
  'coiled fishing net',
  'fishing net line',
]);

/** Parts carried in a hand (by name, so the audit also reads rigs that hang them on the forearm). */
const HELD_PROPS: ReadonlySet<string> = new Set([
  'ledger',
  'ledger page',
  'market basket',
  'market basket handle',
  'basket fruit',
  'vendor produce tray',
  'vendor tray handle',
  'vendor produce',
  'fishing rod',
  'fishing line',
  'pinwheel stick',
  'pinwheel vane',
  'toy hoop',
  'merchant scales',
  'scale pan',
  'rolled map in hand',
  'map ribbon',
  'shipwright mallet handle',
  'shipwright mallet head',
  'handheld spyglass',
  'handheld spyglass rim',
  'brass astrolabe',
  'astrolabe hand grip',
]);

/** Coats, aprons, robes and sashes: a held prop mustn't pass through them either. */
const CLOTHING: ReadonlySet<string> = new Set([
  'sash',
  'merchant apron bib',
  'merchant apron skirt',
  'guard uniform coat',
  'guard coat skirt',
  'naval coat chest',
  'naval coat tails',
  'archivist frock coat',
  'archivist coat tail',
  'astronomer long robe',
]);

const HAND_BONE = /^(Middle|Index|Pinky|Thumb)\d([LR])/;
const ARM_BONE = /^(?:LowerArm|Middle1)([LR])$/;

/** NPCs whose post is seated (they talk seated too), and those who run laps (they stop to talk). */
const SEATED: ReadonlySet<NpcId> = new Set([
  'fisherman',
  'old_sailor',
  'lyra',
  'mer_fisher',
  'mer_matron',
  'tb_weaver',
  'tb_fisher',
]);
const RUNNERS: ReadonlySet<NpcId> = new Set(['child', 'mer_kid_a', 'mer_kid_b', 'tb_kid_a', 'tb_kid_b']);
const WALKERS: ReadonlySet<NpcId> = new Set(['dockhand_a']);

/**
 * The modes an NPC really plays in the game (npcs.ts, meridian-npcs.ts, thousand-bough-npcs.ts):
 * standing NPCs idle, talk, listen and wave; seated ones sit and talk seated; walkers and runners
 * also move (and stop to talk). Lyra sits at Anchorage and stands on Thousand-Bough Isle.
 */
export function npcModes(body: NpcId): readonly AuditMode[] {
  const names = new Set<string>(['idle', 'talk', 'listen', 'wave']);
  if (SEATED.has(body)) {
    if (body !== 'lyra') names.clear();
    names.add('sit');
  }
  if (WALKERS.has(body)) names.add('walk');
  if (RUNNERS.has(body)) names.add('lap');
  return AUDIT_MODES.filter((m) => names.has(m.name));
}

export interface RigSource {
  readonly scene: Group;
  readonly clips: ReadonlyMap<CharacterClip, AnimationClip>;
}

/**
 * A character GLB parsed in Node: textures (which need a DOM to decode) are dropped first. Faces get
 * their jaw and brows as the library rigs them.
 */
export async function parseCharacterGlb(bytes: Uint8Array, key: SourceKey): Promise<RigSource> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const jsonLength = view.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + jsonLength))) as {
    images?: unknown;
    textures?: unknown;
    samplers?: unknown;
    materials?: { pbrMetallicRoughness?: Record<string, unknown>; [k: string]: unknown }[];
  };
  delete json.images;
  delete json.textures;
  delete json.samplers;
  for (const m of json.materials ?? []) {
    delete m.pbrMetallicRoughness?.baseColorTexture;
    delete m.pbrMetallicRoughness?.metallicRoughnessTexture;
    delete m.normalTexture;
    delete m.emissiveTexture;
    delete m.occlusionTexture;
  }
  const text = new TextEncoder().encode(JSON.stringify(json));
  const padded = (text.length + 3) & ~3;
  const rest = bytes.subarray(20 + jsonLength);
  const out = new Uint8Array(20 + padded + rest.length);
  const o = new DataView(out.buffer);
  o.setUint32(0, 0x46546c67, true);
  o.setUint32(4, 2, true);
  o.setUint32(8, out.length, true);
  o.setUint32(12, padded, true);
  o.setUint32(16, 0x4e4f534a, true);
  out.set(text, 20);
  out.fill(0x20, 20 + text.length, 20 + padded);
  out.set(rest, 20 + padded);
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const gltf = await loader.parseAsync(out.buffer, '');
  if (key.endsWith('_npc')) {
    const family = faceFamily(key);
    rigFace(gltf.scene, { mouthY: FACE_FITS[family].mouthY, columns: family === 'captain' ? [0, 5] : [4] });
  }
  return { scene: gltf.scene, clips: normalizeClips(gltf.animations) };
}

/** An NPC built as `CharacterLibrary.create` builds it (no materials or levels of detail). */
export function buildAuditNpc(source: RigSource, body: NpcId): RuntimeCharacter {
  const config = BODY_CONFIG[body];
  const clone = SkeletonUtils.clone(source.scene) as Group;
  clone.name = `character_${body}`;
  clone.scale.setScalar(config.scale);
  shortenForearms(clone);
  clone.updateMatrixWorld(true);
  clone.traverse((object) => {
    if (object instanceof SkinnedMesh) object.normalizeSkinWeights();
  });
  dressNpcCharacter(clone, body);
  mergeNpcAccessories(clone);
  shareSkinning(clone);
  return new RuntimeCharacter(clone, source.clips, body, config, {
    body,
    tier: { tier: 'high', npcAnimRate: 1 },
  });
}

/** One way an NPC can be animated, run for `seconds` from a fresh start. */
export interface AuditMode {
  readonly name: string;
  readonly seconds: number;
  start(character: RuntimeCharacter): void;
}

export const AUDIT_MODES: readonly AuditMode[] = [
  { name: 'idle', seconds: 16, start: (c) => c.play('idle', 0) },
  {
    name: 'talk',
    seconds: 24,
    start: (c) => {
      c.play('idle', 0);
      c.setTalking(true);
    },
  },
  {
    name: 'listen',
    seconds: 8,
    start: (c) => {
      c.play('idle', 0);
      c.setTalking(true);
      c.speak(null);
    },
  },
  {
    name: 'wave',
    seconds: 3,
    start: (c) => {
      c.play('idle', 0);
      c.greet();
    },
  },
  { name: 'walk', seconds: 4, start: (c) => (c.play('idle', 0), c.setSpeed(1.35)) },
  { name: 'jog', seconds: 3, start: (c) => (c.play('idle', 0), c.setSpeed(2.35)) },
  { name: 'run', seconds: 3, start: (c) => (c.play('idle', 0), c.setSpeed(4.15)) },
  // The children's laps round the fountain and the treehouse (npcs `speed: 2.6`).
  { name: 'lap', seconds: 3, start: (c) => (c.play('idle', 0), c.setSpeed(2.6)) },
  {
    name: 'sit',
    seconds: 8,
    start: (c) => {
      c.play('sit', 0);
      c.setTalking(true);
    },
  },
  { name: 'nod', seconds: 2, start: (c) => c.play('nod', 0) },
  { name: 'shake', seconds: 2, start: (c) => c.play('shake', 0) },
];

export interface PropFinding {
  readonly prop: string;
  /** The deepest any of its vertices went into the body (m; 0 if none did). */
  depth: number;
  /** When, and against which bone's part of the body. */
  at: number;
  bone: string;
  /** A held prop's gap to its hand (m): its nearest vertex to the palm's middle, the worst frame's. */
  gap: number;
}

export interface AuditOptions {
  /** Seconds between samples. */
  readonly step?: number;
  /** About how far apart (m) a part's surface is sampled. */
  readonly sample?: number;
  /** How long to play the mode (default: the mode's own length). */
  readonly seconds?: number;
  /** Stands in for Math.random while the NPC plays (gesture and fidget picks), for repeatable runs. */
  readonly random?: () => number;
}

/**
 * Plays `mode` on a fresh NPC and samples it every `step` seconds: for each held or worn prop, the
 * deepest penetration into the body (signed distance to the skinned triangles, the carrying hand's
 * own fingers and palm excepted) and, for held props, how far it reaches from the palm.
 */
export function auditMode(
  source: RigSource,
  body: NpcId,
  mode: AuditMode,
  { step = 1 / 15, sample = 0.025, seconds = mode.seconds, random = mulberry32(7) }: AuditOptions = {},
): PropFinding[] {
  const realRandom = Math.random;
  Math.random = random;
  try {
    const character = buildAuditNpc(source, body);
    const group = character.group;
    const parts = propVertices(group);
    if (!parts.length) return [];
    const surface = new BodySurface(bodyMesh(group));
    const clothing = clothingSurface(group);
    mode.start(character);
    const findings = new Map<string, PropFinding>();
    for (const part of parts) findings.set(part.name, { prop: part.name, depth: 0, at: 0, bone: '', gap: 0 });
    const sub = 1 / 60;
    const steps = Math.round(seconds / sub);
    const every = Math.max(1, Math.round(step / sub));
    const v = new Vector3();
    const palm = new Vector3();
    const knuckle = new Vector3();
    for (let frame = 1; frame <= steps; frame++) {
      character.update(sub);
      if (frame % every) continue;
      group.updateMatrixWorld(true);
      surface.update();
      clothing?.update();
      for (const part of parts) {
        const f = findings.get(part.name)!;
        const skip = part.hand;
        if (part.palmBone) {
          // The palm's middle: halfway from the wrist to the knuckles.
          part.palmBone.getWorldPosition(palm);
          part.knuckleBone!.getWorldPosition(knuckle);
          palm.lerp(knuckle, 0.5);
        }
        const world = part.world;
        for (let k = 0; k < part.count; k++) {
          part.mesh.getVertexPosition(part.start + k, v).applyMatrix4(part.mesh.matrixWorld);
          world[k * 3] = v.x;
          world[k * 3 + 1] = v.y;
          world[k * 3 + 2] = v.z;
        }
        let gap = Infinity;
        const tris = part.triangles;
        for (let t = 0; t < tris.length; t += 3) {
          const a = tris[t]!;
          const b = tris[t + 1]!;
          const c = tris[t + 2]!;
          if (part.palmBone) {
            closest(palm, world, a, b, c, BARY);
            gap = Math.min(gap, Math.hypot(palm.x - BARY.x, palm.y - BARY.y, palm.z - BARY.z));
          }
          // Points over the whole triangle, about every `sample` metres: a long rod's only vertices
          // are at its ends, and its middle can be the part that's in the body.
          const n = Math.min(
            40,
            Math.max(
              1,
              Math.ceil(Math.max(edge(world, a, b), edge(world, b, c), edge(world, c, a)) / sample),
            ),
          );
          for (let i = 0; i <= n; i++)
            for (let j = 0; i + j <= n; j++) {
              const u = i / n;
              const w = j / n;
              for (let axis = 0; axis < 3; axis++) {
                const o = world[a * 3 + axis]!;
                const value = o + (world[b * 3 + axis]! - o) * u + (world[c * 3 + axis]! - o) * w;
                if (axis === 0) v.x = value;
                else if (axis === 1) v.y = value;
                else v.z = value;
              }
              let hit = surface.depth(v, skip);
              if (clothing && part.hand) {
                const worn = clothing.depth(v, null);
                if (worn.depth > hit.depth) hit = worn;
              }
              if (hit.depth > f.depth) {
                f.depth = hit.depth;
                f.at = frame * sub;
                f.bone = hit.bone;
              }
            }
        }
        if (part.palmBone) f.gap = Math.max(f.gap, gap);
      }
    }
    character.dispose();
    return [...findings.values()];
  } finally {
    Math.random = realRandom;
  }
}

interface PropPart {
  readonly name: string;
  readonly mesh: Mesh;
  readonly start: number;
  readonly count: number;
  /** For a held prop, the carrying hand's side letter ('L' or 'R'), whose fingers it may touch. */
  readonly hand: string | null;
  readonly palmBone: Object3D | null;
  readonly knuckleBone: Object3D | null;
  /** The part's triangles (indices into `world`) and its vertices in world space, per frame. */
  readonly triangles: Uint32Array;
  readonly world: Float32Array;
}

function edge(p: Float32Array, a: number, b: number): number {
  return Math.hypot(p[a * 3]! - p[b * 3]!, p[a * 3 + 1]! - p[b * 3 + 1]!, p[a * 3 + 2]! - p[b * 3 + 2]!);
}

/** The merged accessories' held and worn props (one entry per part name, vertices grouped). */
function propVertices(group: Group): PropPart[] {
  const merged = group.getObjectByName('npc accessories') as Mesh | undefined;
  if (!merged) return [];
  const names = (merged.userData.parts ?? []) as string[];
  const counts = (merged.userData.partVertices ?? []) as number[];
  const skinIndex = merged.geometry.getAttribute('skinIndex');
  const bones = (merged as unknown as SkinnedMesh).skeleton.bones;
  const out: PropPart[] = [];
  let start = 0;
  names.forEach((name, i) => {
    const count = counts[i] ?? 0;
    const bone = bones[skinIndex.getComponent(start, 0)]!;
    const arm = ARM_BONE.exec(bone.name);
    const palm = arm ? group.getObjectByName(`Middle1${arm[1]}`) : null;
    const knuckle = arm ? group.getObjectByName(`Middle2${arm[1]}`) : null;
    // Parts of the same name (fruit, vanes, strings) report as one prop.
    if (HELD_PROPS.has(name) || WORN_PROPS.has(name))
      out.push({
        name,
        mesh: merged,
        start,
        count,
        hand: arm?.[1] ?? null,
        palmBone: palm ?? null,
        knuckleBone: knuckle ?? null,
        triangles: partTriangles(merged, start, count),
        world: new Float32Array(count * 3),
      });
    start += count;
  });
  return out;
}

/** The triangles of the merged mesh whose corners are all in [start, start + count), local to it. */
function partTriangles(merged: Mesh, start: number, count: number): Uint32Array {
  const index = merged.geometry.index!.array;
  const out: number[] = [];
  for (let t = 0; t < index.length; t += 3) {
    const a = index[t]! - start;
    const b = index[t + 1]! - start;
    const c = index[t + 2]! - start;
    if (a >= 0 && a < count && b >= 0 && b < count && c >= 0 && c < count) out.push(a, b, c);
  }
  return new Uint32Array(out);
}

/** The merged accessories' clothing as a surface of its own (triangles of clothing parts only). */
function clothingSurface(group: Group): BodySurface | null {
  const merged = group.getObjectByName('npc accessories') as Mesh | undefined;
  if (!merged) return null;
  const names = (merged.userData.parts ?? []) as string[];
  const counts = (merged.userData.partVertices ?? []) as number[];
  const keep = new Uint8Array(merged.geometry.getAttribute('position').count);
  let start = 0;
  let any = false;
  names.forEach((name, i) => {
    const count = counts[i] ?? 0;
    if (CLOTHING.has(name)) {
      keep.fill(1, start, start + count);
      any = true;
    }
    start += count;
  });
  return any ? new BodySurface(merged, (a) => keep[a] === 1, 'clothing') : null;
}

function bodyMesh(group: Group): Mesh {
  let best: Mesh | null = null;
  group.traverse((o) => {
    if (!(o instanceof Mesh) || o.name === 'npc accessories' || !('skeleton' in o)) return;
    const n = o.geometry.getAttribute('position').count;
    if (!best || n > best.geometry.getAttribute('position').count) best = o;
  });
  if (!best) throw new Error('No skinned body');
  return best;
}

/**
 * The skinned body's surface in the drawn pose: positions and smooth normals per frame, triangles
 * bucketed in a grid, and a signed distance (positive inside) from the closest triangle within reach.
 */
export class BodySurface {
  private readonly count: number;
  private readonly index: ArrayLike<number>;
  private readonly weld: Int32Array;
  private readonly triBone: Uint16Array;
  private readonly boneNames: string[];
  private readonly pos: Float32Array;
  private readonly nrm: Float32Array;
  private readonly grid = new Map<number, number[]>();
  private readonly v = new Vector3();
  private readonly min = new Vector3();
  private readonly max = new Vector3();
  /** Per triangle: the hand ('L', 'R') its bone belongs to, if any, and the last query that saw it. */
  private readonly triHand: (string | null)[];
  private readonly seen: Uint32Array;
  private readonly spheres: Float32Array;
  private stamp = 0;

  constructor(
    private readonly mesh: Mesh,
    keep?: (vertex: number) => boolean,
    private readonly label?: string,
  ) {
    const g = mesh.geometry;
    const position = g.getAttribute('position');
    this.count = position.count;
    const all = g.index ? Array.from(g.index.array) : Array.from({ length: this.count }, (_, i) => i);
    this.index = keep ? all.filter((_, i) => keep(all[i - (i % 3)]!)) : all;
    this.pos = new Float32Array(this.count * 3);
    this.nrm = new Float32Array(this.count * 3);
    // Seams split vertices: weld them by bind position, so normals are smooth across seams.
    this.weld = new Int32Array(this.count);
    const seen = new Map<string, number>();
    for (let i = 0; i < this.count; i++) {
      const key = `${position.getX(i).toFixed(5)},${position.getY(i).toFixed(5)},${position.getZ(i).toFixed(5)}`;
      const first = seen.get(key);
      this.weld[i] = first ?? i;
      if (first === undefined) seen.set(key, i);
    }
    const skinIndex = g.getAttribute('skinIndex');
    const skinWeight = g.getAttribute('skinWeight');
    const bones = (mesh as unknown as SkinnedMesh).skeleton.bones;
    this.boneNames = bones.map((b) => b.name);
    const tris = this.index.length / 3;
    this.triBone = new Uint16Array(tris);
    this.triHand = new Array<string | null>(tris).fill(null);
    const sum = new Map<number, number>();
    for (let t = 0; t < tris; t++) {
      sum.clear();
      for (let c = 0; c < 3; c++) {
        const i = this.index[t * 3 + c]!;
        for (let k = 0; k < 4; k++) {
          const w = skinWeight.getComponent(i, k);
          if (w <= 0) continue;
          const b = skinIndex.getComponent(i, k);
          sum.set(b, (sum.get(b) ?? 0) + w);
          // The hand: any corner the palm or fingers move (the wrist's skin too).
          const hand = w > HAND_WEIGHT ? HAND_BONE.exec(this.boneNames[b]!) : null;
          if (hand) this.triHand[t] = hand[2]!;
        }
      }
      let best = 0;
      let bestW = -1;
      for (const [b, w] of sum) if (w > bestW) [best, bestW] = [b, w];
      this.triBone[t] = best;
    }
    this.seen = new Uint32Array(tris);
    this.spheres = new Float32Array(tris * 4);
  }

  update(): void {
    const { pos, nrm, count, index, weld, v } = this;
    for (let i = 0; i < count; i++) {
      this.mesh.getVertexPosition(i, v).applyMatrix4(this.mesh.matrixWorld);
      pos[i * 3] = v.x;
      pos[i * 3 + 1] = v.y;
      pos[i * 3 + 2] = v.z;
    }
    nrm.fill(0);
    this.min.set(Infinity, Infinity, Infinity);
    this.max.set(-Infinity, -Infinity, -Infinity);
    const tris = index.length / 3;
    this.grid.clear();
    for (let t = 0; t < tris; t++) {
      const a = index[t * 3]!;
      const b = index[t * 3 + 1]!;
      const c = index[t * 3 + 2]!;
      const ux = pos[b * 3]! - pos[a * 3]!;
      const uy = pos[b * 3 + 1]! - pos[a * 3 + 1]!;
      const uz = pos[b * 3 + 2]! - pos[a * 3 + 2]!;
      const wx = pos[c * 3]! - pos[a * 3]!;
      const wy = pos[c * 3 + 1]! - pos[a * 3 + 1]!;
      const wz = pos[c * 3 + 2]! - pos[a * 3 + 2]!;
      // Each triangle's bounding sphere, for a quick reject in `depth`.
      const sx = (pos[a * 3]! + pos[b * 3]! + pos[c * 3]!) / 3;
      const sy = (pos[a * 3 + 1]! + pos[b * 3 + 1]! + pos[c * 3 + 1]!) / 3;
      const sz = (pos[a * 3 + 2]! + pos[b * 3 + 2]! + pos[c * 3 + 2]!) / 3;
      let r = 0;
      for (const i of [a, b, c])
        r = Math.max(r, Math.hypot(pos[i * 3]! - sx, pos[i * 3 + 1]! - sy, pos[i * 3 + 2]! - sz));
      this.spheres[t * 4] = sx;
      this.spheres[t * 4 + 1] = sy;
      this.spheres[t * 4 + 2] = sz;
      this.spheres[t * 4 + 3] = r;
      const nx = uy * wz - uz * wy;
      const ny = uz * wx - ux * wz;
      const nz = ux * wy - uy * wx;
      for (const i of [weld[a]!, weld[b]!, weld[c]!]) {
        nrm[i * 3] += nx;
        nrm[i * 3 + 1] += ny;
        nrm[i * 3 + 2] += nz;
      }
      let x0 = Infinity,
        y0 = Infinity,
        z0 = Infinity,
        x1 = -Infinity,
        y1 = -Infinity,
        z1 = -Infinity;
      for (const i of [a, b, c]) {
        x0 = Math.min(x0, pos[i * 3]!);
        y0 = Math.min(y0, pos[i * 3 + 1]!);
        z0 = Math.min(z0, pos[i * 3 + 2]!);
        x1 = Math.max(x1, pos[i * 3]!);
        y1 = Math.max(y1, pos[i * 3 + 1]!);
        z1 = Math.max(z1, pos[i * 3 + 2]!);
      }
      this.min.min(V0.set(x0, y0, z0));
      this.max.max(V0.set(x1, y1, z1));
      for (let x = cell(x0); x <= cell(x1); x++)
        for (let y = cell(y0); y <= cell(y1); y++)
          for (let z = cell(z0); z <= cell(z1); z++) {
            const key = cellKey(x, y, z);
            const list = this.grid.get(key);
            if (list) list.push(t);
            else this.grid.set(key, [t]);
          }
    }
  }

  /**
   * How deep `p` is inside the body (m, 0 when outside), and which bone's part of the body it's in.
   * A point nearest the hand named by `skipHand` ('L'/'R': a held prop's own fingers and palm) is in
   * the fist, and doesn't count.
   */
  depth(p: Vector3, skipHand: string | null): { depth: number; bone: string } {
    const d = this.signed(p, skipHand);
    return d > 0 ? { depth: d, bone: this.hitBone } : NO_HIT;
  }

  /** The bone whose part of the body the last `signed` call measured against. */
  hitBone = '';

  /**
   * Signed distance from `p` to the body (m): positive inside, negative outside, -REACH when nothing's
   * within reach (or `p` is in the `skipHand` fist).
   */
  signed(p: Vector3, skipHand: string | null): number {
    const { pos, nrm, index, weld } = this;
    const cx = cell(p.x);
    const cy = cell(p.y);
    const cz = cell(p.z);
    let best = REACH * REACH;
    let bestT = -1;
    let bu = 0;
    let bv = 0;
    let bw = 0;
    if (
      p.x < this.min.x - REACH ||
      p.y < this.min.y - REACH ||
      p.z < this.min.z - REACH ||
      p.x > this.max.x + REACH ||
      p.y > this.max.y + REACH ||
      p.z > this.max.z + REACH
    )
      return -REACH;
    const stamp = ++this.stamp;
    const seen = this.seen;
    // Nearest cells first; stop once no cell left can hold anything nearer than the best so far.
    for (let k = 0; k < OFFSETS.length; k += 4) {
      if (OFFSETS[k + 3]! >= best) break;
      const list = this.grid.get(cellKey(cx + OFFSETS[k]!, cy + OFFSETS[k + 1]!, cz + OFFSETS[k + 2]!));
      if (!list) continue;
      for (const t of list) {
        if (seen[t] === stamp) continue;
        seen[t] = stamp;
        const sphere = this.spheres;
        const reach =
          Math.hypot(p.x - sphere[t * 4]!, p.y - sphere[t * 4 + 1]!, p.z - sphere[t * 4 + 2]!) -
          sphere[t * 4 + 3]!;
        if (reach > 0 && reach * reach >= best) continue;
        const a = index[t * 3]!;
        const b = index[t * 3 + 1]!;
        const c = index[t * 3 + 2]!;
        closest(p, pos, a, b, c, BARY);
        const dx = p.x - BARY.x;
        const dy = p.y - BARY.y;
        const dz = p.z - BARY.z;
        const d = dx * dx + dy * dy + dz * dz;
        if (d < best) {
          best = d;
          bestT = t;
          bu = BARY.u;
          bv = BARY.v;
          bw = BARY.w;
          CLOSE.set(BARY.x, BARY.y, BARY.z);
        }
      }
    }
    // Nearest to the carrying hand's own skin: it's in the fist, where a held prop belongs.
    if (bestT < 0 || (skipHand && this.triHand[bestT] === skipHand)) return -REACH;
    const a = weld[index[bestT * 3]!]!;
    const b = weld[index[bestT * 3 + 1]!]!;
    const c = weld[index[bestT * 3 + 2]!]!;
    const nx = nrm[a * 3]! * bu + nrm[b * 3]! * bv + nrm[c * 3]! * bw;
    const ny = nrm[a * 3 + 1]! * bu + nrm[b * 3 + 1]! * bv + nrm[c * 3 + 1]! * bw;
    const nz = nrm[a * 3 + 2]! * bu + nrm[b * 3 + 2]! * bv + nrm[c * 3 + 2]! * bw;
    const side = (p.x - CLOSE.x) * nx + (p.y - CLOSE.y) * ny + (p.z - CLOSE.z) * nz;
    this.hitBone = this.label ?? this.boneNames[this.triBone[bestT]!]!;
    return side >= 0 ? -Math.sqrt(best) : Math.sqrt(best);
  }
}

/** Grid cell size and the search reach (m): a point deeper than REACH inside counts as REACH-ish. */
const CELL = 0.04;
const REACH = 0.08;
const SPAN = Math.ceil(REACH / CELL);
const cell = (x: number): number => Math.floor(x / CELL);
/** Cell offsets within SPAN as [dx, dy, dz, nearest squared distance from the centre cell], nearest first. */
const OFFSETS = (() => {
  const list: number[][] = [];
  const gap = (d: number) => Math.max(Math.abs(d) - 1, 0) * CELL;
  for (let x = -SPAN; x <= SPAN; x++)
    for (let y = -SPAN; y <= SPAN; y++)
      for (let z = -SPAN; z <= SPAN; z++) list.push([x, y, z, gap(x) ** 2 + gap(y) ** 2 + gap(z) ** 2]);
  return new Float64Array(list.sort((a, b) => a[3]! - b[3]!).flat());
})();
const cellKey = (x: number, y: number, z: number): number =>
  ((x + 512) * 1024 + (y + 512)) * 1024 + (z + 512);
const BARY = { x: 0, y: 0, z: 0, u: 0, v: 0, w: 0 };
const V0 = new Vector3();
/** A corner this much weighted to a palm or finger bone belongs to the hand. */
const HAND_WEIGHT = 0.15;
const NO_HIT = { depth: 0, bone: '' } as const;
const CLOSE = new Vector3();

/** The closest point to `p` on triangle abc (Ericson, Real-Time Collision Detection 5.1.5), with barycentrics. */
function closest(p: Vector3, pos: Float32Array, a: number, b: number, c: number, out: typeof BARY): void {
  const ax = pos[a * 3]!,
    ay = pos[a * 3 + 1]!,
    az = pos[a * 3 + 2]!;
  const abx = pos[b * 3]! - ax,
    aby = pos[b * 3 + 1]! - ay,
    abz = pos[b * 3 + 2]! - az;
  const acx = pos[c * 3]! - ax,
    acy = pos[c * 3 + 1]! - ay,
    acz = pos[c * 3 + 2]! - az;
  const apx = p.x - ax,
    apy = p.y - ay,
    apz = p.z - az;
  const set = (u: number, v: number, w: number): void => {
    out.u = u;
    out.v = v;
    out.w = w;
    out.x = ax + abx * v + acx * w;
    out.y = ay + aby * v + acy * w;
    out.z = az + abz * v + acz * w;
  };
  const d1 = abx * apx + aby * apy + abz * apz;
  const d2 = acx * apx + acy * apy + acz * apz;
  if (d1 <= 0 && d2 <= 0) return set(1, 0, 0);
  const bpx = p.x - pos[b * 3]!,
    bpy = p.y - pos[b * 3 + 1]!,
    bpz = p.z - pos[b * 3 + 2]!;
  const d3 = abx * bpx + aby * bpy + abz * bpz;
  const d4 = acx * bpx + acy * bpy + acz * bpz;
  if (d3 >= 0 && d4 <= d3) return set(0, 1, 0);
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    const v = d1 / (d1 - d3);
    return set(1 - v, v, 0);
  }
  const cpx = p.x - pos[c * 3]!,
    cpy = p.y - pos[c * 3 + 1]!,
    cpz = p.z - pos[c * 3 + 2]!;
  const d5 = abx * cpx + aby * cpy + abz * cpz;
  const d6 = acx * cpx + acy * cpy + acz * cpz;
  if (d6 >= 0 && d5 <= d6) return set(0, 0, 1);
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    const w = d2 / (d2 - d6);
    return set(1 - w, 0, w);
  }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    const w = (d4 - d3) / (d4 - d3 + (d5 - d6));
    return set(0, 1 - w, w);
  }
  const denom = 1 / (va + vb + vc);
  const v = vb * denom;
  const w = vc * denom;
  return set(1 - v - w, v, w);
}
