import {
  Bone,
  BufferAttribute,
  BufferGeometry,
  Group,
  Matrix4,
  Quaternion,
  type Object3D,
  Skeleton,
  SkinnedMesh,
  Vector3,
  type Material,
} from 'three/webgpu';

/**
 * The kraken's body: a low-poly mantle and head in the Quaternius Pirate Kit's flat colours (the
 * tentacle's own swatches: pink, light pink, purple and gold), with big eyes that follow their
 * target. It's a skinned mesh in the tentacles' vertex layout, so it draws with their one material
 * and the shared skinning graph (no shader of its own).
 *
 * Swappable: whatever body replaces this one (a model such as "The Kraken" with its own tentacles
 * removed) only has to give the same `KrakenBody`: a root, the sockets the tentacles grow from, and
 * an update. The tentacles don't know what body they're on.
 */
export interface KrakenBody {
  readonly root: Group;
  /** The body's own drawn parts (hidden when only arms show, as in a distant sighting). */
  readonly drawn: Object3D;
  /** Where each tentacle grows from, in the body's frame (under the water line), and its outward lean. */
  readonly sockets: readonly { position: Vector3; outward: Vector3 }[];
  /** Breathing, sway and the eyes' look (`look` in world space, or null to look ahead). */
  update(dt: number, t: number, look: Vector3 | null, anger: number): void;
  dispose(): void;
}

/** The tentacle's swatches (sRGB), so body and arms match. */
export const KRAKEN_SWATCHES = {
  pink: 0xdb71a3,
  light: 0xe890b2,
  purple: 0xa14b7c,
  gold: 0xff9a0c,
  white: 0xf3efe6,
  black: 0x14080f,
} as const;

const BODY = 0;
const MANTLE = 1;
const EYE_L = 2;
const EYE_R = 3;
const BROWS = 4;

/** Low-poly triangles with flat normals, a colour per face and one bone per vertex. */
class FlatBuilder {
  readonly pos: number[] = [];
  readonly col: number[] = [];
  readonly bone: number[] = [];
  readonly weight: number[] = [];
  private r = 1;
  private g = 1;
  private b = 1;

  color(hex: number): this {
    this.r = linear((hex >> 16) & 255);
    this.g = linear((hex >> 8) & 255);
    this.b = linear(hex & 255);
    return this;
  }

  tri(a: Vector3, b: Vector3, c: Vector3, ba: number, bb = ba, bc = ba, wa = 1, wb = wa, wc = wa): void {
    for (const [p, bone, w] of [
      [a, ba, wa],
      [b, bb, wb],
      [c, bc, wc],
    ] as const) {
      this.pos.push(p.x, p.y, p.z);
      this.col.push(this.r, this.g, this.b);
      this.bone.push(bone, BODY, 0, 0);
      this.weight.push(w, 1 - w, 0, 0);
    }
  }

  /** A low-poly ellipsoid on one bone (flattened along `squash` of its own z). */
  blob(
    c: Vector3,
    rx: number,
    ry: number,
    rz: number,
    bone: number,
    seg = 8,
    rings = 5,
    rot: Quaternion | null = null,
  ): void {
    const pt = (i: number, j: number, out: Vector3) => {
      const th = (i / seg) * Math.PI * 2;
      const ph = (j / rings) * Math.PI;
      out.set(Math.sin(ph) * Math.cos(th) * rx, Math.cos(ph) * ry, Math.sin(ph) * Math.sin(th) * rz);
      if (rot) out.applyQuaternion(rot);
      return out.add(c);
    };
    const a = new Vector3(),
      b = new Vector3(),
      d = new Vector3(),
      e = new Vector3();
    for (let j = 0; j < rings; j++)
      for (let i = 0; i < seg; i++) {
        pt(i, j, a);
        pt(i + 1, j, b);
        pt(i, j + 1, d);
        pt(i + 1, j + 1, e);
        if (j > 0) this.tri(a, d, b, bone);
        if (j < rings - 1) this.tri(b, d, e, bone);
      }
  }

  build(): BufferGeometry {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(this.pos), 3));
    g.setAttribute('color', new BufferAttribute(new Float32Array(this.col), 3));
    g.setAttribute('skinIndex', new BufferAttribute(new Uint16Array(this.bone), 4));
    g.setAttribute('skinWeight', new BufferAttribute(new Float32Array(this.weight), 4));
    g.computeVertexNormals();
    return g;
  }
}

function linear(c: number): number {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

/** A small, stable hash in [0, 1) for the face pattern. */
function hash(i: number, j: number): number {
  const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/** Head and mantle profile: (radius, height), bottom (under the water) to the mantle's tip. */
const PROFILE: readonly (readonly [number, number])[] = [
  [2.4, -3.2],
  [3.3, -1.8],
  [3.75, 0.2],
  [3.6, 1.9],
  [3.05, 3.3],
  [3.35, 4.6],
  [3.4, 6.0],
  [3.0, 7.4],
  [2.15, 8.7],
  [1.05, 9.7],
  [0, 10.15],
];
/** Where the mantle's bone takes over (its crease over the head). */
const CREASE = 3.3;
const SEGMENTS = 14;

function lean(y: number): number {
  return y > CREASE ? -0.3 * (y - CREASE) : 0;
}

function buildBody(): { geometry: BufferGeometry; bones: Bone[] } {
  const B = new FlatBuilder();
  const ring = (j: number, i: number, out: Vector3) => {
    const [r, y] = PROFILE[j]!;
    const th = (i / SEGMENTS) * Math.PI * 2 + Math.PI * 0.5;
    return out.set(Math.cos(th) * r, y, Math.sin(th) * r * 0.92 + lean(y));
  };
  const a = new Vector3(),
    b = new Vector3(),
    c = new Vector3(),
    d = new Vector3(),
    mid = new Vector3();
  for (let j = 0; j < PROFILE.length - 1; j++)
    for (let i = 0; i < SEGMENTS; i++) {
      ring(j, i, a);
      ring(j, i + 1, b);
      ring(j + 1, i, c);
      ring(j + 1, i + 1, d);
      mid.copy(a).add(b).add(c).add(d).multiplyScalar(0.25);
      const front = mid.z > 0.6 && Math.abs(mid.x) < 2.6;
      const yMid = (PROFILE[j]![1] + PROFILE[j + 1]![1]) * 0.5;
      let hex: number = KRAKEN_SWATCHES.pink;
      if (yMid < CREASE && front) hex = KRAKEN_SWATCHES.light;
      else if (yMid > CREASE && hash(i, j) < 0.32) hex = KRAKEN_SWATCHES.purple;
      else if (Math.abs(yMid - CREASE) < 0.8 && i % 2 === 0) hex = KRAKEN_SWATCHES.purple;
      B.color(hex);
      // Vertices above the crease ride the mantle bone; the crease row is shared half and half.
      const w = (p: Vector3) => (p.y > CREASE + 0.05 ? 1 : p.y > CREASE - 0.05 ? 0.5 : 0);
      B.tri(a, c, b, MANTLE, MANTLE, MANTLE, w(a), w(c), w(b));
      B.tri(b, c, d, MANTLE, MANTLE, MANTLE, w(b), w(c), w(d));
    }
  // Gold spots on the mantle: the suckers' gold.
  B.color(KRAKEN_SWATCHES.gold);
  for (let k = 0; k < 7; k++) {
    const th = Math.PI * 0.5 + (k - 3) * 0.55;
    const y = 4.4 + (k % 2) * 1.5;
    const r = 3.42 - (k % 2) * 0.12;
    B.blob(
      new Vector3(Math.cos(th) * r, y, Math.sin(th) * r * 0.92 + lean(y)),
      0.46,
      0.46,
      0.3,
      MANTLE,
      6,
      3,
      faceOut(th),
    );
  }
  // Big eyes: white, a gold iris, a black pupil and a glint. Each eye's parts ride its own bone.
  const eyes: [number, Vector3][] = [
    [EYE_L, new Vector3(1.72, 1.55, 2.72)],
    [EYE_R, new Vector3(-1.72, 1.55, 2.72)],
  ];
  for (const [bone, e] of eyes) {
    B.color(KRAKEN_SWATCHES.white);
    B.blob(e, 1.18, 1.25, 1.1, bone, 12, 7);
    B.color(KRAKEN_SWATCHES.gold);
    B.blob(new Vector3(e.x, e.y, e.z + 0.98), 0.74, 0.8, 0.28, bone, 12, 4);
    B.color(KRAKEN_SWATCHES.black);
    B.blob(new Vector3(e.x, e.y, e.z + 1.2), 0.42, 0.62, 0.16, bone, 10, 4);
    B.color(KRAKEN_SWATCHES.white);
    B.blob(new Vector3(e.x + 0.18 * Math.sign(e.x), e.y + 0.3, e.z + 1.3), 0.13, 0.13, 0.06, bone, 6, 3);
  }
  // Heavy brows that tilt down to the middle: a scowl.
  B.color(KRAKEN_SWATCHES.purple);
  for (const s of [1, -1]) {
    const q = new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), s * -0.38);
    B.blob(new Vector3(s * 1.75, 2.95, 3.05), 1.45, 0.34, 0.5, BROWS, 8, 3, q);
  }
  const geometry = B.build();
  const bones: Bone[] = [];
  const names = ['KrakenBody', 'Mantle', 'EyeL', 'EyeR', 'Brows'];
  const at = [
    new Vector3(0, 0, 0),
    new Vector3(0, CREASE, 0),
    eyes[0]![1],
    eyes[1]![1],
    new Vector3(0, 2.95, 3.0),
  ];
  for (let i = 0; i < names.length; i++) {
    const bone = new Bone();
    bone.name = names[i]!;
    bone.position.copy(at[i]!);
    if (i > 0) bones[0]!.add(bone);
    bones.push(bone);
  }
  // Bind space: a vertex rides relative to its bone's rest position.
  return { geometry, bones };
}

function faceOut(theta: number): Quaternion {
  // The spot's flat (local z) faces out from the mantle.
  return new Quaternion().setFromUnitVectors(
    new Vector3(0, 0, 1),
    new Vector3(Math.cos(theta), 0, Math.sin(theta)).normalize(),
  );
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
  const eyes = [eyeL, eyeR] as const;

  const sockets: { position: Vector3; outward: Vector3 }[] = [];
  for (let i = 0; i < armCount; i++) {
    // Round the head under the water line, the gap facing forward (toward its prey) a little wider.
    const th = Math.PI * 0.5 + ((i + 0.5) / armCount) * Math.PI * 2;
    const outward = new Vector3(Math.cos(th), 0, Math.sin(th));
    sockets.push({ position: new Vector3(outward.x * 2.6, -2.6, outward.z * 2.5), outward });
  }

  return {
    root,
    drawn,
    sockets,
    update(dt, t, look, anger) {
      // Breathing: the mantle swells and leans, slow and heavy.
      const breathe = Math.sin(t * 1.3);
      mantle.scale.set(1 + 0.035 * breathe, 1 - 0.03 * breathe, 1 + 0.035 * breathe);
      mantle.rotation.set(-0.06 + 0.05 * Math.sin(t * 0.55), 0, 0.05 * Math.sin(t * 0.37));
      brows.position.y = 2.95 - 0.22 * anger;
      brows.rotation.x = 0.12 * anger;
      // Eyes turn to their target (in the body's frame), a little lazily.
      for (const eye of eyes) {
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
