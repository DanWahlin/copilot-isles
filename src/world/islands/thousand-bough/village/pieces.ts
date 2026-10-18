import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CylinderGeometry,
  Matrix4,
  Quaternion,
  Vector3,
} from 'three/webgpu';
import { makeBuckets, paint, type MaterialKey } from '../../../village/kit';

/**
 * Small builders for the tree village's timber, rope, stone and glass: each piece is made in place
 * (world space), painted a colour, and dropped into its material's bucket; the village merges each
 * bucket into a few chunks (one material each, so no new shader).
 */
export type Buckets = ReturnType<typeof makeBuckets>;

/** The village's colours (spec §2.3), as vertex paint (the kit's materials multiply it). */
export const PAINT = {
  teak: 0xf3d6b2,
  teakDark: 0xb07c4a,
  weathered: 0xb08a62,
  plank: 0xffeedb,
  thatch: 0xc9a86a,
  rope: 0xc8b48a,
  stone: 0x8f938a,
  basalt: 0x5a5f5b,
  moss: 0x5e8c3a,
  iron: 0x4a4a48,
  brass: 0xb8923e,
  lantern: 0xffb54a,
  blue: 0x3b82f6,
  green: 0x3fa34d,
  teal: 0x1ea7a7,
  lilac: 0xe9e4f5,
  heliconia: 0xe2552d,
  orchid: 0xc2307a,
  cream: 0xe8dcc0,
} as const;

/**
 * The kit's glow material only lights up at night (its colour is the paint × 0.18 by day); paint
 * this bright and a lantern glows warm amber at the island's dusk too.
 */
export const LANTERN_GLOW = 0xffffff;
export function lanternPaint(g: BufferGeometry, strength = 5.4): void {
  const c = g.getAttribute('color') as BufferAttribute;
  for (let i = 0; i < c.count; i++) c.setXYZ(i, strength * 1.0, strength * 0.66, strength * 0.27);
  c.needsUpdate = true;
}

const M = new Matrix4();
const Q = new Quaternion();
const S = new Vector3();
const P = new Vector3();
const A = new Vector3();
const B = new Vector3();
const UP = new Vector3(0, 1, 0);
const DIR = new Vector3();

/**
 * The kit's wood texture is an atlas: a light plank band across its top (v 0.02–0.27) and a dark one
 * under it (v 0.33–0.58), grain along u. Pieces map their own long axis along the grain and their
 * width across one band, so a board shows planks, not the atlas's carved trim. Call before placing.
 */
export function woodUv(g: BufferGeometry, dark: boolean, metresPerRepeat = 1.8): void {
  const pos = g.getAttribute('position');
  g.computeBoundingBox();
  const b = g.boundingBox!;
  const size = [b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z];
  const long = size.indexOf(Math.max(...size));
  const others = [0, 1, 2].filter((k) => k !== long);
  const v0 = dark ? 0.34 : 0.03;
  const uvs = new Float32Array(pos.count * 2);
  const at = (i: number, k: number) => (k === 0 ? pos.getX(i) : k === 1 ? pos.getY(i) : pos.getZ(i));
  const mins = [b.min.x, b.min.y, b.min.z];
  for (let i = 0; i < pos.count; i++) {
    uvs[i * 2] = at(i, long) / metresPerRepeat;
    let w = 0;
    let span = 0;
    for (const k of others) {
      w += at(i, k) - mins[k]!;
      span += size[k]!;
    }
    uvs[i * 2 + 1] = v0 + 0.23 * (span > 0 ? w / span : 0.5);
  }
  g.setAttribute('uv', new BufferAttribute(uvs, 2));
}

/** Wood colours that read dark in the atlas's dark band. */
const DARK_WOOD = new Set<number>([0xb07c4a, 0xb08a62]);

function put(buckets: Buckets, key: MaterialKey, g: BufferGeometry, colour: number): BufferGeometry {
  paint(g, colour);
  // The atlas's plank bands are dark and red: lift them toward honey teak #B07A45 (vertex colour over
  // 1, the green and blue more than the red).
  if (key === 'wood') {
    const c = g.getAttribute('color');
    for (let i = 0; i < c.count; i++) c.setXYZ(i, c.getX(i) * 1.22, c.getY(i) * 1.34, c.getZ(i) * 1.24);
  }
  buckets[key].push(g);
  return g;
}

/** A box centred at (x, y, z), turned `yaw` about +y (then `pitch` about its own x, `roll` about its z). */
export function box(
  buckets: Buckets,
  key: MaterialKey,
  x: number,
  y: number,
  z: number,
  sx: number,
  sy: number,
  sz: number,
  yaw: number,
  colour: number,
  pitch = 0,
  roll = 0,
): BufferGeometry {
  const g = new BoxGeometry(sx, sy, sz);
  if (key === 'wood') woodUv(g, DARK_WOOD.has(colour));
  Q.setFromAxisAngle(UP, yaw);
  if (pitch || roll) {
    const q2 = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), pitch);
    const q3 = new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), roll);
    Q.multiply(q2).multiply(q3);
  }
  M.compose(P.set(x, y, z), Q, S.set(1, 1, 1));
  g.applyMatrix4(M);
  return put(buckets, key, g, colour);
}

/** A square beam from a to b (its section w × h, h vertical when the beam's level). */
export function beam(
  buckets: Buckets,
  key: MaterialKey,
  a: { x: number; y: number; z: number },
  b: { x: number; y: number; z: number },
  w: number,
  h: number,
  colour: number,
): BufferGeometry {
  A.set(a.x, a.y, a.z);
  B.set(b.x, b.y, b.z);
  const len = A.distanceTo(B);
  const g = new BoxGeometry(w, h, len);
  if (key === 'wood') woodUv(g, DARK_WOOD.has(colour));
  DIR.subVectors(B, A).normalize();
  // Orient +z along the beam, keeping +y as up as it can.
  M.lookAt(A, B, Math.abs(DIR.y) > 0.98 ? new Vector3(1, 0, 0) : UP);
  Q.setFromRotationMatrix(M);
  // lookAt points -z at the target: flip so the box spans a → b either way (it's symmetric).
  M.compose(P.addVectors(A, B).multiplyScalar(0.5), Q, S.set(1, 1, 1));
  g.applyMatrix4(M);
  return put(buckets, key, g, colour);
}

/** A round post or rope from a to b, `r` thick, with `seg` sides. */
export function rod(
  buckets: Buckets,
  key: MaterialKey,
  a: { x: number; y: number; z: number },
  b: { x: number; y: number; z: number },
  r: number,
  seg: number,
  colour: number,
  rTop = r,
  open = false,
): BufferGeometry {
  A.set(a.x, a.y, a.z);
  B.set(b.x, b.y, b.z);
  const len = A.distanceTo(B);
  const g = new CylinderGeometry(rTop, r, len, seg, 1, open);
  if (key === 'wood') woodUv(g, DARK_WOOD.has(colour), 3);
  DIR.subVectors(B, A).normalize();
  Q.setFromUnitVectors(UP, DIR);
  M.compose(P.addVectors(A, B).multiplyScalar(0.5), Q, S.set(1, 1, 1));
  g.applyMatrix4(M);
  return put(buckets, key, g, colour);
}

/** A rope hanging between a and b with `sag` at its middle, as `n` straight pieces. */
export function rope(
  buckets: Buckets,
  a: { x: number; y: number; z: number },
  b: { x: number; y: number; z: number },
  sag: number,
  r: number,
  colour: number = PAINT.rope,
  n = 8,
): void {
  let prev = a;
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const p = {
      x: a.x + (b.x - a.x) * t,
      y: a.y + (b.y - a.y) * t - sag * 4 * t * (1 - t),
      z: a.z + (b.z - a.z) * t,
    };
    // Open-ended: a rope's pieces meet end to end, so their caps never show.
    rod(buckets, 'rope', prev, p, r, 4, colour, r, true);
    prev = p;
  }
}

/** Two triangles for each cell of a `rows` × `cols` grid of vertices (row-major). */
export function gridIndex(rows: number, cols: number): number[] {
  const idx: number[] = [];
  for (let r = 0; r < rows - 1; r++)
    for (let c = 0; c < cols - 1; c++) {
      const a = r * cols + c;
      idx.push(a, a + cols, a + 1, a + 1, a + cols, a + cols + 1);
    }
  return idx;
}

/**
 * A custom surface from a grid of points (`rows` × `cols`, row-major), as one painted piece: its
 * normals from the grid. Used for curved boards (the stair's walkway, the plinth's faces, thatch).
 */
export function gridSurface(
  buckets: Buckets,
  key: MaterialKey,
  points: readonly { x: number; y: number; z: number }[],
  rows: number,
  cols: number,
  colour: number,
  uvScale = 0.5,
): BufferGeometry {
  const pos = new Float32Array(rows * cols * 3);
  const uvs = new Float32Array(rows * cols * 2);
  const wood = key === 'wood';
  const v0 = DARK_WOOD.has(colour) ? 0.34 : 0.03;
  points.forEach((p, i) => {
    pos[i * 3] = p.x;
    pos[i * 3 + 1] = p.y;
    pos[i * 3 + 2] = p.z;
    // Wood runs its grain down the rows (along the stair, round a ring) and spans a band across.
    uvs[i * 2] = wood ? Math.floor(i / cols) * uvScale : (i % cols) * uvScale;
    uvs[i * 2 + 1] = wood ? v0 + 0.23 * ((i % cols) / Math.max(1, cols - 1)) : Math.floor(i / cols) * uvScale;
  });
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(pos, 3));
  g.setAttribute('uv', new BufferAttribute(uvs, 2));
  g.setIndex(gridIndex(rows, cols));
  return put(buckets, key, g.toNonIndexed(), colour);
}

/** A cone (a hut's thatch, a lantern's cap): base centre, radius, height, sides. */
export function cone(
  buckets: Buckets,
  key: MaterialKey,
  x: number,
  y: number,
  z: number,
  r: number,
  h: number,
  seg: number,
  colour: number,
  rTop = 0,
  shape?: (g: BufferGeometry) => void,
): BufferGeometry {
  const g = new CylinderGeometry(rTop, r, h, seg, 2, rTop > 0 ? false : true);
  g.translate(0, h / 2, 0);
  shape?.(g);
  g.translate(x, y, z);
  return put(buckets, key, g, colour);
}

export { makeBuckets };
