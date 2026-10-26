import {
  Bone,
  BufferAttribute,
  BufferGeometry,
  Group,
  Matrix4,
  Quaternion,
  Skeleton,
  SkinnedMesh,
  Vector3,
  type Material,
  type Object3D,
} from 'three/webgpu';
import { mulberry32 } from '../../util/math';
import { KRAKEN_COLORS, hexToLinear } from './kraken-palette';

/**
 * The kraken's body: a big, ancient, low-poly octopus head (a tall, lumpy mantle, darker toward its
 * top, mottled, with old scars and barnacles, over a low face whose small amber eyes glow under a
 * heavy brow; a beak under it, between the arm roots) in the arms' own deep-sea teal-green: a dark
 * back, a pale sea-green throat. Menacing, not monstrous. Its arms grow from
 * a ring under the head, below the eyes, as an octopus's do: surfaced, the head and eyes show and
 * the arms rise from the water round it. It's a skinned mesh in the tentacles' vertex layout, so it
 * draws with their one material and the shared skinning graph (no shader of its own).
 *
 * Swappable: whatever body replaces this one (a model such as "The Kraken" with its own tentacles
 * removed) only has to give the same `KrakenBody`: a root, its drawn parts, the sockets the
 * tentacles grow from (under its head), its eyes' height, and an update. The tentacles don't know
 * what body they're on.
 */
export interface KrakenBody {
  readonly root: Group;
  /** The body's own drawn parts (hidden when only arms show, as in a distant sighting). */
  readonly drawn: Object3D;
  /**
   * Where each tentacle grows from, in the body's frame: a ring under the head, below the eyes. Each
   * points out and down (`outward`, unit).
   */
  readonly sockets: readonly { position: Vector3; outward: Vector3 }[];
  /** The eyes' height in the body's frame (the sockets are all well below it). */
  readonly eyeHeight: number;
  /** How far up the body lifts out of the water when surfaced (its frame's origin is the water line). */
  readonly surfaced: number;
  /** Breathing, sway and the eyes' look (`look` in world space, or null to look ahead). */
  update(dt: number, t: number, look: Vector3 | null, anger: number): void;
  dispose(): void;
}

const BODY = 0;
const MANTLE = 1;
const EYE_L = 2;
const EYE_R = 3;
const BROWS = 4;

/** Indexed, smooth-shaded triangles with a colour and up to two bones per vertex. */
class SmoothBuilder {
  readonly pos: number[] = [];
  readonly col: number[] = [];
  readonly bone: number[] = [];
  readonly weight: number[] = [];
  readonly index: number[] = [];
  private readonly rgb = [1, 1, 1];

  color(hex: number): this {
    hexToLinear(hex, this.rgb);
    return this;
  }

  /** A vertex on `bone` (weight `w`, the rest on the body). Returns its index. */
  vertex(p: Vector3, bone: number, w = 1, rgb: readonly number[] = this.rgb): number {
    this.pos.push(p.x, p.y, p.z);
    this.col.push(rgb[0]!, rgb[1]!, rgb[2]!);
    this.bone.push(bone, BODY, 0, 0);
    this.weight.push(w, 1 - w, 0, 0);
    return this.pos.length / 3 - 1;
  }

  /** A round low-poly ellipsoid on one bone, its own z flattened by `rz`, turned by `rot`. */
  blob(
    c: Vector3,
    rx: number,
    ry: number,
    rz: number,
    bone: number,
    seg = 12,
    rings = 7,
    rot: Quaternion | null = null,
  ): void {
    const first = this.pos.length / 3;
    const p = new Vector3();
    for (let j = 0; j <= rings; j++)
      for (let i = 0; i < seg; i++) {
        const th = (i / seg) * Math.PI * 2;
        const ph = (j / rings) * Math.PI;
        p.set(Math.sin(ph) * Math.cos(th) * rx, Math.cos(ph) * ry, Math.sin(ph) * Math.sin(th) * rz);
        if (rot) p.applyQuaternion(rot);
        this.vertex(p.add(c), bone);
      }
    for (let j = 0; j < rings; j++)
      for (let i = 0; i < seg; i++) {
        const a = first + j * seg + i;
        const b = first + j * seg + ((i + 1) % seg);
        // Wound to face out (the material draws front faces only).
        this.index.push(a, b, a + seg, b, b + seg, a + seg);
      }
  }

  build(): BufferGeometry {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(this.pos), 3));
    g.setAttribute('color', new BufferAttribute(new Float32Array(this.col), 3));
    g.setAttribute('skinIndex', new BufferAttribute(new Uint16Array(this.bone), 4));
    g.setAttribute('skinWeight', new BufferAttribute(new Float32Array(this.weight), 4));
    g.setIndex(this.index);
    g.computeVertexNormals();
    g.computeBoundingBox();
    g.computeBoundingSphere();
    return g;
  }
}

/** The head's profile, bottom to top: (radius, height) in metres. A tall, heavy mantle over a low face. */
const PROFILE: readonly (readonly [number, number])[] = [
  [0.01, -3.6],
  [2.0, -3.5],
  [3.0, -3.0],
  [3.7, -2.1],
  [4.05, -0.9],
  [4.1, 0.3],
  [3.95, 1.4],
  [3.8, 2.3],
  [4.15, 3.5],
  [4.65, 5.0],
  [4.8, 6.6],
  [4.65, 8.2],
  [4.15, 9.6],
  [3.35, 10.8],
  [2.25, 11.8],
  [1.1, 12.45],
  [0.01, 12.65],
];
const TOP = 12.65;
/** Where the mantle's bone takes over (its crease over the brow). */
const CREASE = 2.3;
const SEGMENTS = 28;
/** Rows of the head's mesh per profile step. */
const SUB = 2;
const ROWS = (PROFILE.length - 1) * SUB + 1;
/** The head's own triangles come first in the index (tests). */
export const KRAKEN_HEAD_INDEX_COUNT = (ROWS - 1) * SEGMENTS * 6;
/** The eyes' height (and the sockets' ring, well under it). */
const EYE_Y = 0.95;
/** The right eye's centre (the left is its mirror): small for the head, set deep under the brow. */
export const KRAKEN_EYE = { x: 1.85, y: EYE_Y, z: 2.9, radius: 0.8 } as const;
const SOCKET_Y = -3.15;
const SOCKET_R = 2.05;

const smooth = (e0: number, e1: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/** The mantle leans back over the face, as an octopus's does. */
function lean(y: number): number {
  return y > CREASE ? -0.3 * (y - CREASE) : 0;
}

/** How lumpy the mantle is at height `y` (0 on the face, 1 on the mantle, 0 at its very top). */
function lumpy(y: number): number {
  return smooth(CREASE, CREASE + 1.5, y) * (1 - smooth(TOP - 1.2, TOP, y));
}

/** The profile row (fractional) at height `y`. */
function rowAt(y: number): number {
  for (let j = 0; j < PROFILE.length - 1; j++) {
    const y0 = PROFILE[j]![1];
    const y1 = PROFILE[j + 1]![1];
    if (y <= y1) return j + Math.max(0, (y - y0) / (y1 - y0));
  }
  return PROFILE.length - 1;
}

/**
 * A point on the head's surface at profile row `j` (fractional) and angle `th` (0 at the face). The
 * mantle is old and uneven: lumps, and a slight lean to one side.
 */
function surface(j: number, th: number, out: Vector3): Vector3 {
  const j0 = Math.min(PROFILE.length - 2, Math.floor(j));
  const f = j - j0;
  let r = PROFILE[j0]![0] + (PROFILE[j0 + 1]![0] - PROFILE[j0]![0]) * f;
  const y = PROFILE[j0]![1] + (PROFILE[j0 + 1]![1] - PROFILE[j0]![1]) * f;
  const k = lumpy(y);
  r *=
    1 +
    k *
      (0.05 * Math.sin(3 * th + 0.9 * y) +
        0.035 * Math.sin(5 * th - 1.3 * y + 0.4) +
        0.02 * Math.sin(7 * th + 2.1 * y));
  // The face is a little flatter than the back.
  const front = Math.cos(th) > 0 ? 1 - 0.08 * Math.cos(th) : 1;
  const side = 0.35 * k * Math.sin((Math.PI * (y - CREASE)) / (TOP - CREASE));
  return out.set(Math.sin(th) * r + side, y, Math.cos(th) * r * front + lean(y));
}

/** The surface's point and outward normal at height `y` and angle `th`. */
function onSurface(y: number, th: number, p: Vector3, n: Vector3): void {
  const j = rowAt(y);
  surface(j, th, p);
  const a = surface(j, th + 0.05, _s1).sub(surface(j, th - 0.05, _s2));
  const b = surface(j + 0.05, th, _s3).sub(surface(j - 0.05, th, _s4));
  n.crossVectors(b, a).normalize();
}
const _s1 = new Vector3();
const _s2 = new Vector3();
const _s3 = new Vector3();
const _s4 = new Vector3();

function buildBody(): { geometry: BufferGeometry; bones: Bone[] } {
  const B = new SmoothBuilder();
  const C = {
    back: [0, 0, 0],
    deep: [0, 0, 0],
    dark: [0, 0, 0],
    under: [0, 0, 0],
  };
  hexToLinear(KRAKEN_COLORS.back, C.back);
  hexToLinear(KRAKEN_COLORS.deep, C.deep);
  hexToLinear(KRAKEN_COLORS.backDark, C.dark);
  hexToLinear(KRAKEN_COLORS.under, C.under);
  const mixed = [0, 0, 0];
  const p = new Vector3();
  const n = new Vector3();
  // The head: rings round the profile, shared vertices (smooth), no seam.
  for (let j = 0; j < ROWS; j++)
    for (let i = 0; i < SEGMENTS; i++) {
      const th = (i / SEGMENTS) * Math.PI * 2;
      surface(j / SUB, th, p);
      // Pale only low on the face and on the throat (the arms' sucker side); the back dark teal,
      // darker toward the top, mottled with old, darker patches.
      const front = Math.max(0, Math.cos(th));
      const face = Math.min(
        1,
        0.8 * front ** 2 * (1 - smooth(EYE_Y - 1.2, EYE_Y - 0.2, p.y)) + Math.max(0, -p.y - 2) / 1.4,
      );
      const mottle = 0.5 + 0.5 * Math.sin(4.1 * th + 1.3 * p.y) * Math.sin(2.7 * th - 0.9 * p.y + 1.1);
      const top = 0.55 * smooth(CREASE, 9, p.y);
      const dark = Math.min(1, top + Math.max(0, mottle - 0.6) * 2.2 * smooth(0, 2, p.y));
      for (let c = 0; c < 3; c++) {
        const back = C.back[c]! + (C.deep[c]! - C.back[c]!) * dark;
        mixed[c] = back + (C.under[c]! - back) * face;
      }
      const w = p.y > CREASE + 0.6 ? 1 : p.y > CREASE - 0.6 ? (p.y - CREASE + 0.6) / 1.2 : 0;
      B.vertex(p, MANTLE, w, mixed);
    }
  for (let j = 0; j < ROWS - 1; j++)
    for (let i = 0; i < SEGMENTS; i++) {
      const a = j * SEGMENTS + i;
      const b = j * SEGMENTS + ((i + 1) % SEGMENTS);
      B.index.push(a, b, a + SEGMENTS, b, b + SEGMENTS, a + SEGMENTS);
    }
  const q = new Quaternion();
  const turn = new Quaternion();
  const Z = new Vector3(0, 0, 1);
  /** Something lying on the mantle: its z out along the surface's normal, its x turned `angle`. */
  const onMantle = (y: number, th: number, lift: number, angle: number): Vector3 => {
    onSurface(y, th, p, n);
    q.setFromUnitVectors(Z, n);
    turn.setFromAxisAngle(n, angle);
    q.premultiply(turn);
    return p.addScaledVector(n, lift);
  };
  // Darker, older patches, uneven in size and shape.
  const patches: [number, number, number, number, number][] = [
    // height, angle (0 the face), length, width, turn
    [9.5, 2.2, 0.9, 0.6, 0.4],
    [8.9, -2.5, 0.75, 0.5, -0.8],
    [11.0, 3.0, 0.8, 0.55, 1.2],
    [10.4, 1.5, 0.55, 0.35, 0.2],
    [10.6, -1.7, 0.65, 0.4, -0.3],
    [11.6, -2.8, 0.5, 0.4, 0.9],
    [7.6, 3.4, 0.6, 0.35, 0.6],
    [6.9, -3.6, 0.7, 0.45, -1.1],
  ];
  B.color(KRAKEN_COLORS.deep);
  for (const [y, th, l, wd, ang] of patches)
    B.blob(onMantle(y, th, 0.02, ang).clone(), l, wd, 0.1, MANTLE, 9, 4, q.clone());
  // Old scars: pale streaks, some in parallel (claw marks).
  const scars: [number, number, number, number][] = [
    // height, angle, length, turn
    [6.0, 1.35, 2.4, 0.5],
    [6.4, 1.43, 2.0, 0.5],
    [5.65, 1.27, 1.5, 0.5],
    [8.3, -0.95, 2.6, -0.35],
    [8.65, -1.03, 1.7, -0.35],
    [4.7, 2.55, 2.0, 1.0],
  ];
  B.color(KRAKEN_COLORS.scar);
  for (const [y, th, l, ang] of scars)
    B.blob(onMantle(y, th, 0.03, ang).clone(), l / 2, 0.09, 0.05, MANTLE, 8, 3, q.clone());
  // Barnacle clusters: small pale cones in a crowd.
  const rand = mulberry32(0x6b62);
  const clusters: [number, number, number][] = [
    [7.2, -1.9, 7],
    [9.8, 0.65, 5],
    [4.4, -0.8, 4],
    [6.9, 2.9, 6],
    [11.3, -0.4, 4],
  ];
  B.color(KRAKEN_COLORS.barnacle);
  for (const [y, th, count] of clusters)
    for (let c = 0; c < count; c++) {
      const r = 0.12 + 0.12 * rand();
      const at = onMantle(y + (rand() - 0.5) * 1.1, th + (rand() - 0.5) * 0.28, r * 0.35, 0).clone();
      B.blob(at, r, r * (0.8 + 0.4 * rand()), r * 0.9, MANTLE, 7, 3, q.clone());
    }
  // Small eyes set deep under a heavy brow ridge (a narrowed, watchful look): glowing amber and a
  // dark slit pupil, in a dark socket. Each eye turns on its own bone.
  const E = KRAKEN_EYE;
  const eyes: [number, Vector3][] = [
    [EYE_L, new Vector3(E.x, E.y, E.z)],
    [EYE_R, new Vector3(-E.x, E.y, E.z)],
  ];
  const X = new Vector3(1, 0, 0);
  const ZZ = new Vector3(0, 0, 1);
  for (const [bone, e] of eyes) {
    const s = Math.sign(e.x);
    // The socket stays put (on the body); the eye turns inside it.
    B.color(KRAKEN_COLORS.deep).blob(new Vector3(e.x, e.y, e.z - 0.25), 1.08, 1.0, 0.9, BODY, 14, 8);
    B.color(KRAKEN_COLORS.eye).blob(
      new Vector3(e.x, e.y, e.z + 0.02),
      E.radius,
      E.radius,
      0.78,
      bone,
      16,
      10,
    );
    B.color(KRAKEN_COLORS.pupil).blob(new Vector3(e.x, e.y, e.z + 0.79), 0.1, 0.5, 0.07, bone, 10, 6);
    // The lower lid: a heavy fold under the eye.
    q.setFromAxisAngle(ZZ, -s * 0.12);
    B.color(KRAKEN_COLORS.backDark).blob(
      new Vector3(e.x, e.y - 0.66, e.z + 0.32),
      1.0,
      0.28,
      0.55,
      BODY,
      12,
      5,
      q,
    );
    // The brow ridge: heavy, low over the eye, its inner end lower (a frown), its front edge down.
    q.setFromAxisAngle(ZZ, s * 0.3).multiply(turn.setFromAxisAngle(X, 0.28));
    // In the skin's own colour: a ridge of it, its shadow on the eye.
    B.color(KRAKEN_COLORS.back).blob(
      new Vector3(e.x * 1.04, e.y + 0.6, e.z + 0.5),
      1.45,
      0.46,
      0.8,
      BROWS,
      14,
      6,
      q,
    );
  }
  // The mouth: a low ridge on the face (under the water when it's surfaced), and under the head,
  // between the arm roots, a ring round a dark beak.
  q.setFromAxisAngle(X, 0.25);
  B.color(KRAKEN_COLORS.backDark).blob(new Vector3(0, -1.8, 3.45), 1.25, 0.2, 0.35, BODY, 12, 5, q);
  B.color(KRAKEN_COLORS.backDark).blob(new Vector3(0, -3.45, 0), 1.45, 0.22, 1.45, BODY, 14, 4);
  B.color(KRAKEN_COLORS.beak).blob(new Vector3(0, -3.62, 0.15), 0.48, 0.55, 0.5, BODY, 10, 6);
  const geometry = B.build();
  const bones: Bone[] = [];
  const names = ['KrakenBody', 'Mantle', 'EyeL', 'EyeR', 'Brows'];
  const at = [
    new Vector3(0, 0, 0),
    new Vector3(0, CREASE, 0),
    eyes[0]![1],
    eyes[1]![1],
    new Vector3(0, BROW_Y, E.z + 0.5),
  ];
  for (let i = 0; i < names.length; i++) {
    const bone = new Bone();
    bone.name = names[i]!;
    bone.position.copy(at[i]!);
    if (i > 0) bones[0]!.add(bone);
    bones.push(bone);
  }
  return { geometry, bones };
}
const BROW_Y = EYE_Y + 0.6;

/** The ring of sockets under the head (pure: the tests check it against the body's eyes and bounds). */
export function krakenSockets(count = 8): { position: Vector3; outward: Vector3 }[] {
  const sockets: { position: Vector3; outward: Vector3 }[] = [];
  for (let i = 0; i < count; i++) {
    // Round the underside, from the face's left round to its right.
    const th = ((i + 0.5) / count) * Math.PI * 2;
    const x = Math.sin(th);
    const z = Math.cos(th);
    sockets.push({
      position: new Vector3(x * SOCKET_R, SOCKET_Y, z * SOCKET_R),
      outward: new Vector3(x, -0.35, z).normalize(),
    });
  }
  return sockets;
}

const _look = new Vector3();
const _eye = new Vector3();
const _inv = new Matrix4();
const _q = new Quaternion();
const FORWARD = new Vector3(0, 0, 1);

/** The placeholder body (until a modelled one replaces it). `material` is the tentacles' own. */
export function createKrakenBody(material: Material, armCount = 8): KrakenBody {
  const root = new Group();
  root.name = 'kraken body';
  const { geometry, bones } = buildBody();
  const mesh = new SkinnedMesh(geometry, material);
  mesh.name = 'kraken mantle and head';
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  // The body's bounds move little; it sways inside a sphere round its rest pose.
  mesh.frustumCulled = false;
  mesh.add(bones[0]!);
  mesh.updateMatrixWorld(true);
  mesh.bind(new Skeleton(bones));
  // In a group of its own: shared skinning swaps the mesh for another object later.
  const drawn = new Group();
  drawn.name = 'kraken body parts';
  drawn.add(mesh);
  root.add(drawn);
  const [, mantle, eyeL, eyeR, brows] = bones as [Bone, Bone, Bone, Bone, Bone];
  const eyeBones = [eyeL, eyeR] as const;

  return {
    root,
    drawn,
    sockets: krakenSockets(armCount),
    eyeHeight: EYE_Y,
    // Low in the water: the brow, the eyes and the mantle show; the face under them doesn't.
    surfaced: 0.25,
    update(dt, t, look, anger) {
      // Breathing: the mantle swells and leans, slow and heavy.
      const breathe = Math.sin(t * 1.3);
      mantle.scale.set(1 + 0.035 * breathe, 1 - 0.03 * breathe, 1 + 0.035 * breathe);
      mantle.rotation.set(-0.05 + 0.05 * Math.sin(t * 0.55), 0, 0.05 * Math.sin(t * 0.37));
      brows.position.y = BROW_Y - 0.15 * anger;
      brows.rotation.x = 0.06 * anger;
      // Eyes turn to their target (in the body's frame), a little lazily.
      for (const eye of eyeBones) {
        if (look) {
          root.updateWorldMatrix(true, false);
          _inv.copy(root.matrixWorld).invert();
          _look.copy(look).applyMatrix4(_inv).sub(_eye.copy(eye.position)).normalize();
          // Within a cone ahead: eyes don't roll back into the head.
          _look.z = Math.max(_look.z, 0.35);
          _q.setFromUnitVectors(FORWARD, _look.normalize());
        } else _q.identity();
        eye.quaternion.slerp(_q, Math.min(1, dt * 4));
      }
    },
    dispose() {
      geometry.dispose();
    },
  };
}
