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
import { KRAKEN_COLORS, hexToLinear } from './kraken-palette';

/**
 * The kraken's body: a round, low-poly octopus head (a bulb of a mantle over a face with two big
 * glowing amber eyes, slit pupils, and a few amber spots and darker mottles) in the arms' own deep-sea
 * teal-green: a dark back, a pale sea-green face and throat. Its arms grow from
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

/** The head's profile, bottom to top: (radius, height) in metres. A bulb: face below, mantle above. */
const PROFILE: readonly (readonly [number, number])[] = [
  [0.01, -3.5],
  [1.9, -3.4],
  [2.9, -2.9],
  [3.5, -2.0],
  [3.8, -0.8],
  [3.75, 0.5],
  [3.5, 1.7],
  [3.3, 2.6],
  [3.7, 3.8],
  [4.0, 5.2],
  [3.9, 6.5],
  [3.4, 7.7],
  [2.6, 8.7],
  [1.5, 9.4],
  [0.6, 9.75],
  [0.01, 9.85],
];
/** Where the mantle's bone takes over (its crease over the face). */
const CREASE = 2.6;
const SEGMENTS = 22;
/** The eyes' height (and the sockets' ring, well under it). */
const EYE_Y = 1.25;
const SOCKET_Y = -3.15;
const SOCKET_R = 2.05;

/** The mantle leans back over the face, as an octopus's does. */
function lean(y: number): number {
  return y > CREASE ? -0.34 * (y - CREASE) : 0;
}

/** A point on the head's surface at profile row `j` (fractional) and angle `th` (0 at the face). */
function surface(j: number, th: number, out: Vector3): Vector3 {
  const j0 = Math.min(PROFILE.length - 2, Math.floor(j));
  const f = j - j0;
  const r = PROFILE[j0]![0] + (PROFILE[j0 + 1]![0] - PROFILE[j0]![0]) * f;
  const y = PROFILE[j0]![1] + (PROFILE[j0 + 1]![1] - PROFILE[j0]![1]) * f;
  // The face is a little flatter than the back.
  const front = Math.cos(th) > 0 ? 1 - 0.08 * Math.cos(th) : 1;
  return out.set(Math.sin(th) * r, y, Math.cos(th) * r * front + lean(y));
}

function buildBody(): { geometry: BufferGeometry; bones: Bone[] } {
  const B = new SmoothBuilder();
  const pink: number[] = [];
  const light: number[] = [];
  hexToLinear(KRAKEN_COLORS.back, pink);
  hexToLinear(KRAKEN_COLORS.under, light);
  const mixed = [0, 0, 0];
  const p = new Vector3();
  // The head: rings round the profile, shared vertices (smooth), no seam.
  const rows = PROFILE.length;
  for (let j = 0; j < rows; j++)
    for (let i = 0; i < SEGMENTS; i++) {
      const th = (i / SEGMENTS) * Math.PI * 2;
      surface(j, th, p);
      // The face, the throat and the underside are pale (the arms' sucker side), the back dark.
      // Pale only low on the face (round the eyes and under them) and on the throat.
      const front = Math.max(0, Math.cos(th));
      const face = Math.min(
        1,
        front ** 2 * (p.y < EYE_Y + 0.6 ? 1 : Math.max(0, 1 - (p.y - EYE_Y - 0.6) / 1.2)) +
          Math.max(0, -p.y - 1.8) / 1.5,
      );
      for (let c = 0; c < 3; c++) mixed[c] = pink[c]! + (light[c]! - pink[c]!) * face;
      const w = p.y > CREASE + 0.6 ? 1 : p.y > CREASE - 0.6 ? (p.y - CREASE + 0.6) / 1.2 : 0;
      B.vertex(p, MANTLE, w, mixed);
    }
  for (let j = 0; j < rows - 1; j++)
    for (let i = 0; i < SEGMENTS; i++) {
      const a = j * SEGMENTS + i;
      const b = j * SEGMENTS + ((i + 1) % SEGMENTS);
      B.index.push(a, b, a + SEGMENTS, b, b + SEGMENTS, a + SEGMENTS);
    }
  // Spots on the mantle: a few amber-gold (the suckers' colour) and darker mottles, raised a little.
  const spots: [number, number, number, number][] = [
    // row, angle (0 the face), size, colour
    [8.6, 0.55, 0.5, KRAKEN_COLORS.sucker],
    [8.6, -0.55, 0.5, KRAKEN_COLORS.sucker],
    [10.1, 1.25, 0.42, KRAKEN_COLORS.sucker],
    [10.1, -1.25, 0.42, KRAKEN_COLORS.sucker],
    [9.4, 0, 0.36, KRAKEN_COLORS.suckerRim],
    [9.2, 2.3, 0.75, KRAKEN_COLORS.backDark],
    [9.0, -2.4, 0.65, KRAKEN_COLORS.backDark],
    [11.0, 3.1, 0.7, KRAKEN_COLORS.backDark],
    [10.5, 1.9, 0.5, KRAKEN_COLORS.backDark],
    [10.6, -1.9, 0.55, KRAKEN_COLORS.backDark],
    [12.0, 2.7, 0.5, KRAKEN_COLORS.backDark],
    [12.2, -2.6, 0.45, KRAKEN_COLORS.backDark],
  ];
  const n = new Vector3();
  const q = new Quaternion();
  const Z = new Vector3(0, 0, 1);
  for (const [row, th, size, hex] of spots) {
    surface(row, th, p);
    // The outward normal, from neighbouring surface points.
    const a = surface(row, th + 0.05, new Vector3()).sub(surface(row, th - 0.05, new Vector3()));
    const b = surface(row + 0.05, th, new Vector3()).sub(surface(row - 0.05, th, new Vector3()));
    n.crossVectors(b, a).normalize();
    q.setFromUnitVectors(Z, n);
    B.color(hex).blob(p.addScaledVector(n, 0.04), size, size * 0.9, size * 0.35, MANTLE, 10, 4, q);
  }
  // Big eyes, old and calm: glowing amber, a dark slit pupil and a glint, in a dark socket. Each eye
  // rides its own bone.
  const eyes: [number, Vector3][] = [
    [EYE_L, new Vector3(1.95, EYE_Y, 2.4)],
    [EYE_R, new Vector3(-1.95, EYE_Y, 2.4)],
  ];
  for (const [bone, e] of eyes) {
    // The socket's dark rim stays put (on the body); the eye turns inside it.
    B.color(KRAKEN_COLORS.backDark).blob(new Vector3(e.x, e.y, e.z - 0.55), 1.38, 1.44, 1.1, BODY, 16, 10);
    B.color(KRAKEN_COLORS.eye).blob(new Vector3(e.x, e.y, e.z + 0.06), 1.2, 1.26, 1.14, bone, 16, 10);
    B.color(KRAKEN_COLORS.pupil).blob(new Vector3(e.x, e.y, e.z + 1.17), 0.24, 0.8, 0.16, bone, 12, 6);
    B.color(KRAKEN_COLORS.glint).blob(
      new Vector3(e.x + 0.34 * Math.sign(e.x), e.y + 0.42, e.z + 1.12),
      0.15,
      0.15,
      0.07,
      bone,
      8,
      4,
    );
  }
  // Heavy, soft brows that only lower when it's angry.
  for (const s of [1, -1]) {
    q.setFromAxisAngle(new Vector3(0, 0, 1), s * -0.18);
    B.color(KRAKEN_COLORS.backDark).blob(
      new Vector3(s * 1.95, EYE_Y + 1.5, 2.85),
      1.15,
      0.3,
      0.5,
      BROWS,
      12,
      5,
      q,
    );
  }
  const geometry = B.build();
  const bones: Bone[] = [];
  const names = ['KrakenBody', 'Mantle', 'EyeL', 'EyeR', 'Brows'];
  const at = [
    new Vector3(0, 0, 0),
    new Vector3(0, CREASE, 0),
    eyes[0]![1],
    eyes[1]![1],
    new Vector3(0, EYE_Y + 1.55, 2.8),
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
    surfaced: 0.7,
    update(dt, t, look, anger) {
      // Breathing: the mantle swells and leans, slow and heavy.
      const breathe = Math.sin(t * 1.3);
      mantle.scale.set(1 + 0.035 * breathe, 1 - 0.03 * breathe, 1 + 0.035 * breathe);
      mantle.rotation.set(-0.05 + 0.05 * Math.sin(t * 0.55), 0, 0.05 * Math.sin(t * 0.37));
      brows.position.y = EYE_Y + 1.55 - 0.3 * anger;
      brows.rotation.x = 0.1 * anger;
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
