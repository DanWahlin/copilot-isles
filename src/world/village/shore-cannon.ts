import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  CylinderGeometry,
  Matrix4,
  SphereGeometry,
  TorusGeometry,
} from 'three/webgpu';

/**
 * A shore battery's gun (Dan's reference: a naval truck carriage): a cast-iron barrel with its
 * reinforce rings, mouldings and cascabel, the trunnions under iron cap squares on two stepped oak
 * cheeks, iron straps, bolts and ring-bolts, four solid trucks with iron tyres and axle caps, the
 * bed and quoin under the breech. Built from primitives into the town kit's buckets (`metal`,
 * `wood`), so the guns add no material, shader or draw call of their own: their pieces merge into
 * the town's chunks, whose index levels of detail (`buildChunkLodIndex`) thin them with distance.
 * This file's three levels pick the detail per tier (`cannonDetail`).
 *
 * Local frame: the origin is on the ground under the carriage's middle, +z is the way the muzzle
 * points, +y up. Every part's colour is in its vertex colours (the kit materials multiply by them).
 */
export type CannonDetail = 'full' | 'mid' | 'lite';

/** One gun's (or prop's) pieces by kit material, in its local frame. */
export interface CannonParts {
  metal: BufferGeometry[];
  wood: BufferGeometry[];
}

/** The gun's size, for colliders, placement checks and tests (metres, local frame). */
export const CANNON = {
  /** Barrel axis height above the ground (the trunnions' centre). */
  axisY: 0.83,
  /** The trunnions' z (3/7 of the barrel from the breech, as cast). */
  trunnionZ: 0.3,
  /** The breech face's and the muzzle face's z; the cascabel's knob reaches `cascabelZ`. */
  breechZ: -0.75,
  muzzleZ: 1.7,
  cascabelZ: -1.005,
  /** The trucks: their axles' z, radii and the wheels' centre-plane |x|. */
  frontAxleZ: 0.42,
  rearAxleZ: -0.44,
  frontTruck: 0.21,
  rearTruck: 0.19,
  truckX: 0.42,
  truckWidth: 0.1,
  /** The carriage's ends and half-width over the axle caps. */
  carriageZ0: -0.62,
  carriageZ1: 0.62,
  halfWidth: 0.53,
  /** Round shot's radius (a 12-pounder's, a little large so it reads at a distance). */
  shotRadius: 0.075,
} as const;

const IRON = 0xa88c6e;
const IRON_WORN = 0xf4d8b0;
const IRON_DARK = 0x8c7862;
const BORE = 0x1a1714;
const OAK = 0x9a6c42;
const OAK_DARK = 0x74502f;
const TRUCK = 0x7a5534;
const SHOT = 0x9a8670;
const MOSS = 0x47602e;

/**
 * The kit's metal texture is a sheet of plates and ornaments: iron samples it at a twentieth of the
 * timber's density, so a barrel takes a soft patina from it rather than its motifs.
 */
const METAL_UV = 0.025;

const tmp = new Matrix4();
const color = new Color();
const mossColor = new Color();

function segments(detail: CannonDetail, full: number, mid: number, lite: number): number {
  return detail === 'full' ? full : detail === 'mid' ? mid : lite;
}

/** Gives a non-indexed geometry an index (so it merges with the indexed kit pieces). */
function indexed(g: BufferGeometry): BufferGeometry {
  if (g.index) return g;
  const n = g.getAttribute('position').count;
  const index = n > 65535 ? new Uint32Array(n) : new Uint16Array(n);
  for (let i = 0; i < n; i++) index[i] = i;
  g.setIndex(new BufferAttribute(index, 1));
  return g;
}

/** Drops the attributes the town merge doesn't share (extrude groups, uv1), keeping p/n/uv/colour. */
function clean(g: BufferGeometry): BufferGeometry {
  for (const name of Object.keys(g.attributes))
    if (name !== 'position' && name !== 'normal' && name !== 'uv' && name !== 'color')
      g.deleteAttribute(name);
  g.clearGroups();
  return g;
}

/**
 * Paints a part: its base colour, a little per-vertex variation, darker toward the ground (a soft
 * baked occlusion under the carriage), and moss on upward faces for an old, overgrown gun.
 */
function tint(g: BufferGeometry, hex: number, moss: number, vary = 0.08): BufferGeometry {
  const p = g.getAttribute('position');
  const n = g.getAttribute('normal');
  const colors = new Float32Array(p.count * 3);
  const base = color.set(hex);
  mossColor.set(MOSS);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i),
      y = p.getY(i),
      z = p.getZ(i);
    const h = Math.sin(x * 37.1 + y * 91.7 + z * 53.3) * 43758.5453;
    const v = 1 - vary + (h - Math.floor(h)) * vary * 2;
    const ao = 0.7 + 0.3 * Math.min(1, Math.max(0, y / 0.75));
    const up = n ? Math.max(0, n.getY(i)) : 0;
    const m = moss * Math.min(1, up * 1.4) * (0.55 + 0.45 * (h - Math.floor(h)));
    colors[i * 3] = (base.r * (1 - m) + mossColor.r * m) * v * ao;
    colors[i * 3 + 1] = (base.g * (1 - m) + mossColor.g * m) * v * ao;
    colors[i * 3 + 2] = (base.b * (1 - m) + mossColor.b * m) * v * ao;
  }
  g.setAttribute('color', new BufferAttribute(colors, 3));
  return g;
}

/** Box-projected UVs at the kit's texel density (half a texture a metre). */
export function boxUv(g: BufferGeometry, scale = 0.5): BufferGeometry {
  const p = g.getAttribute('position');
  const n = g.getAttribute('normal');
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const nx = Math.abs(n.getX(i)),
      ny = Math.abs(n.getY(i)),
      nz = Math.abs(n.getZ(i));
    const x = p.getX(i),
      y = p.getY(i),
      z = p.getZ(i);
    const [u, v] = ny >= nx && ny >= nz ? [x, z] : nx >= nz ? [z, y] : [x, y];
    uv[i * 2] = u * scale;
    uv[i * 2 + 1] = v * scale;
  }
  g.setAttribute('uv', new BufferAttribute(uv, 2));
  return g;
}

function finish(g: BufferGeometry, hex: number, moss: number, vary?: number): BufferGeometry {
  return tint(boxUv(indexed(clean(g))), hex, moss, vary);
}

function box(
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number,
  hex: number,
  moss: number,
  ry = 0,
  rx = 0,
): BufferGeometry {
  const g = new BoxGeometry(w, h, d);
  if (rx) g.rotateX(rx);
  if (ry) g.rotateY(ry);
  g.translate(x, y, z);
  return finish(g, hex, moss);
}

/** A cylinder along x (an axle, a truck, a trunnion) from x0 to x1. */
function cylinderX(
  r: number,
  x0: number,
  x1: number,
  y: number,
  z: number,
  seg: number,
  hex: number,
  moss: number,
): BufferGeometry {
  const g = new CylinderGeometry(r, r, Math.abs(x1 - x0), seg, 1);
  g.rotateZ(Math.PI / 2);
  g.translate((x0 + x1) / 2, y, z);
  return finish(g, hex, moss);
}

/** A ring (eye of a ring-bolt): `axis` is the ring's normal. */
function ring(
  r: number,
  tube: number,
  x: number,
  y: number,
  z: number,
  axis: 'x' | 'z',
  seg: number,
  moss: number,
): BufferGeometry {
  const g = new TorusGeometry(r, tube, 4, seg);
  if (axis === 'x') g.rotateY(Math.PI / 2);
  g.translate(x, y, z);
  return finish(g, IRON_DARK, moss * 0.4, 0.05);
}

/**
 * The barrel's turned profile, breech to muzzle: (radius, distance from the breech face). Pairs of
 * close points make the ring edges crisp under the smooth lathe normals.
 */
const BARREL_PROFILE: readonly (readonly [number, number])[] = [
  [0, -0.255],
  [0.038, -0.247],
  [0.062, -0.226],
  [0.075, -0.195],
  [0.072, -0.165],
  [0.058, -0.14],
  [0.042, -0.122],
  [0.042, -0.092],
  [0.084, -0.08],
  [0.09, -0.066],
  [0.15, -0.052],
  [0.215, -0.034],
  [0.25, -0.016],
  [0.268, -0.002],
  [0.276, 0.006],
  [0.276, 0.052],
  [0.266, 0.058],
  [0.266, 0.078],
  [0.272, 0.084],
  [0.272, 0.104],
  [0.26, 0.11],
  [0.256, 0.13],
  [0.246, 0.95],
  [0.259, 0.958],
  [0.259, 0.998],
  [0.24, 1.006],
  [0.237, 1.02],
  [0.226, 1.32],
  [0.239, 1.328],
  [0.239, 1.366],
  [0.212, 1.374],
  [0.205, 1.39],
  [0.166, 2.15],
  [0.177, 2.158],
  [0.177, 2.186],
  [0.161, 2.194],
  [0.155, 2.25],
  [0.168, 2.3],
  [0.186, 2.36],
  [0.196, 2.405],
  [0.196, 2.428],
  [0.186, 2.445],
  [0.13, 2.45],
  [0.072, 2.45],
  [0.068, 2.42],
  [0.066, 2.25],
  [0.0, 2.25],
];
/** The mid and lite profiles keep the silhouette: base ring, reinforce rings, chase, muzzle swell. */
const BARREL_PROFILE_LOW: readonly (readonly [number, number])[] = [
  [0, -0.255],
  [0.07, -0.21],
  [0.07, -0.16],
  [0.042, -0.12],
  [0.042, -0.09],
  [0.2, -0.04],
  [0.274, 0.0],
  [0.274, 0.1],
  [0.256, 0.13],
  [0.246, 0.95],
  [0.258, 0.96],
  [0.258, 1.0],
  [0.237, 1.02],
  [0.226, 1.32],
  [0.238, 1.33],
  [0.238, 1.37],
  [0.205, 1.39],
  [0.166, 2.15],
  [0.155, 2.25],
  [0.194, 2.4],
  [0.186, 2.45],
  [0.07, 2.45],
  [0.066, 2.3],
  [0, 2.3],
];

/** The ring edges and the breech mouldings catch the light: paint them worn bright. */
function barrelColours(g: BufferGeometry, moss: number): void {
  const p = g.getAttribute('position');
  const c = g.getAttribute('color') as BufferAttribute;
  const worn = new Color(IRON_WORN);
  const bore = new Color(BORE);
  for (let i = 0; i < p.count; i++) {
    const along = p.getZ(i) - CANNON.breechZ;
    const r = Math.hypot(p.getX(i), p.getY(i) - CANNON.axisY);
    // Inside the muzzle: soot black.
    if (along > 2.2 && r < 0.075) {
      c.setXYZ(i, bore.r, bore.g, bore.b);
      continue;
    }
    // Raised rings and the breech mouldings: the high spots wear bright.
    const ringy =
      (along > -0.01 && along < 0.11 && r > 0.262) ||
      (along > 0.95 && along < 1.01) ||
      (along > 1.32 && along < 1.37) ||
      (along > 2.15 && along < 2.19) ||
      (along > 2.38 && along < 2.44);
    // The top of the barrel weathers a little lighter than its belly.
    const top = Math.max(0, (p.getY(i) - CANNON.axisY) / 0.27);
    const k = (ringy ? 0.55 : 0) + top * 0.18;
    if (k > 0 && moss === 0)
      c.setXYZ(
        i,
        c.getX(i) + (worn.r - c.getX(i)) * k,
        c.getY(i) + (worn.g - c.getY(i)) * k,
        c.getZ(i) + (worn.b - c.getZ(i)) * k,
      );
  }
}

/*
 * Hand-built lathe and extrusion: three's LatheGeometry and ExtrudeGeometry (with Shape, its curves
 * and earcut) add about 6 KB gz to vendor-three, which is at its PLAN §13.5 cap.
 */

/**
 * A profile (r, y) turned about +y, with LatheGeometry's smooth normals (each point's normal is
 * the mean of its two segments' normals).
 */
export function lathe(profile: readonly (readonly [number, number])[], segs: number): BufferGeometry {
  const n = profile.length;
  const pn: [number, number][] = [];
  let prevX = 0,
    prevY = 0;
  for (let j = 0; j < n; j++) {
    if (j === n - 1) {
      pn.push([prevX, prevY]);
      break;
    }
    const nx = profile[j + 1]![1] - profile[j]![1];
    const ny = -(profile[j + 1]![0] - profile[j]![0]);
    pn.push(j === 0 ? [nx, ny] : [nx + prevX, ny + prevY]);
    prevX = nx;
    prevY = ny;
  }
  const pos = new Float32Array((segs + 1) * n * 3);
  const nor = new Float32Array((segs + 1) * n * 3);
  for (let i = 0; i <= segs; i++) {
    const phi = (i / segs) * Math.PI * 2;
    const s = Math.sin(phi),
      c = Math.cos(phi);
    for (let j = 0; j < n; j++) {
      const k = (i * n + j) * 3;
      const [r, y] = profile[j]!;
      pos[k] = r * s;
      pos[k + 1] = y;
      pos[k + 2] = r * c;
      const [nr, ny] = pn[j]!;
      const len = Math.hypot(nr, ny) || 1;
      nor[k] = (nr * s) / len;
      nor[k + 1] = ny / len;
      nor[k + 2] = (nr * c) / len;
    }
  }
  const index: number[] = [];
  for (let i = 0; i < segs; i++)
    for (let j = 0; j < n - 1; j++) {
      const a = j + i * n,
        b = a + n,
        cc = a + n + 1,
        d = a + 1;
      index.push(a, b, d, cc, d, b);
    }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(pos, 3));
  g.setAttribute('normal', new BufferAttribute(nor, 3));
  g.setIndex(index);
  return g;
}

/** Ear-clips a simple counter-clockwise polygon; returns triangle corner indices (CCW). */
export function earClip(poly: readonly (readonly [number, number])[]): number[] {
  const left = poly.map((_, i) => i);
  const out: number[] = [];
  const cross = (a: number, b: number, c: number): number => {
    const [ax, ay] = poly[a]!,
      [bx, by] = poly[b]!,
      [cx, cy] = poly[c]!;
    return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  };
  let guard = left.length * left.length;
  while (left.length > 3 && guard-- > 0) {
    let clipped = false;
    for (let i = 0; i < left.length; i++) {
      const a = left[(i + left.length - 1) % left.length]!,
        b = left[i]!,
        c = left[(i + 1) % left.length]!;
      if (cross(a, b, c) <= 1e-12) continue;
      let inside = false;
      for (const p of left) {
        if (p === a || p === b || p === c) continue;
        if (cross(a, b, p) >= 0 && cross(b, c, p) >= 0 && cross(c, a, p) >= 0) {
          inside = true;
          break;
        }
      }
      if (inside) continue;
      out.push(a, b, c);
      left.splice(i, 1);
      clipped = true;
      break;
    }
    if (!clipped) break;
  }
  if (left.length === 3) out.push(left[0]!, left[1]!, left[2]!);
  return out;
}

/**
 * A side profile (u, v) = (z, y) extruded across x from `x0` to `x1`: two flat faces and a wall of
 * flat-shaded quads, non-indexed.
 */
export function extrudeX(
  outline: readonly (readonly [number, number])[],
  x0: number,
  x1: number,
): BufferGeometry {
  let area = 0;
  for (let i = 0; i < outline.length; i++) {
    const [ax, ay] = outline[i]!,
      [bx, by] = outline[(i + 1) % outline.length]!;
    area += ax * by - bx * ay;
  }
  const poly = area < 0 ? [...outline].reverse() : [...outline];
  const tris = earClip(poly);
  const pos: number[] = [];
  const nor: number[] = [];
  const put = (x: number, u: number, v: number, nx: number, ny: number, nz: number): void => {
    pos.push(x, v, u);
    nor.push(nx, ny, nz);
  };
  // CCW in (u, v) = (z, y) faces −x, so the −x face keeps the order and the +x face reverses it.
  for (let t = 0; t < tris.length; t += 3) {
    for (const k of [0, 1, 2]) {
      const [u, v] = poly[tris[t + k]!]!;
      put(x0, u, v, -1, 0, 0);
    }
    for (const k of [2, 1, 0]) {
      const [u, v] = poly[tris[t + k]!]!;
      put(x1, u, v, 1, 0, 0);
    }
  }
  for (let i = 0; i < poly.length; i++) {
    const [au, av] = poly[i]!,
      [bu, bv] = poly[(i + 1) % poly.length]!;
    const len = Math.hypot(bu - au, bv - av);
    if (len < 1e-9) continue;
    // Outward normal of a CCW edge in (u, v), into world (x, y, z) = (0, v, u).
    const ny = -(bu - au) / len,
      nz = (bv - av) / len;
    put(x0, au, av, 0, ny, nz);
    put(x1, bu, bv, 0, ny, nz);
    put(x0, bu, bv, 0, ny, nz);
    put(x0, au, av, 0, ny, nz);
    put(x1, au, av, 0, ny, nz);
    put(x1, bu, bv, 0, ny, nz);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('normal', new BufferAttribute(new Float32Array(nor), 3));
  return g;
}

function barrel(detail: CannonDetail, moss: number): BufferGeometry {
  const profile = detail === 'full' ? BARREL_PROFILE : BARREL_PROFILE_LOW;
  const g = lathe(profile, segments(detail, 18, 13, 9));
  // The lathe turns about +y: lay it along +z, the breech face at breechZ.
  g.rotateX(Math.PI / 2);
  g.translate(0, CANNON.axisY, CANNON.breechZ);
  const out = finish(g, IRON, moss * 0.6, 0.05);
  barrelColours(out, moss);
  return out;
}

/** One stepped cheek (bracket), its side profile extruded across x; the trunnion's notch on top. */
function cheek(side: -1 | 1, detail: CannonDetail, moss: number): BufferGeometry {
  const { trunnionZ, axisY } = CANNON;
  const z0 = CANNON.carriageZ0,
    z1 = CANNON.carriageZ1;
  const base = 0.26;
  const s: [number, number][] = [
    [z0 + 0.06, base],
    [z1 - 0.02, base],
    [z1, base + 0.05],
    [z1, 0.72],
    [z1 - 0.07, 0.79],
    [trunnionZ + 0.075, 0.79],
  ];
  // The notch the trunnion rests in.
  const steps = detail === 'lite' ? 3 : 6;
  for (let i = 1; i < steps; i++) {
    const a = (i / steps) * Math.PI;
    s.push([trunnionZ + Math.cos(a) * 0.075, axisY - Math.sin(a) * 0.075]);
  }
  s.push(
    [trunnionZ - 0.075, 0.79],
    [0.08, 0.79],
    [0.08, 0.655],
    [-0.24, 0.655],
    [-0.24, 0.52],
    [z0 + 0.04, 0.52],
  );
  // The rear end's quarter-round, worn by the handspikes (a quadratic from (z0 + 0.04, 0.52)).
  const curve = detail === 'lite' ? 2 : 4;
  for (let i = 1; i <= curve; i++) {
    const t = i / curve,
      m = 1 - t;
    s.push([
      m * m * (z0 + 0.04) + 2 * m * t * z0 + t * t * z0,
      m * m * 0.52 + 2 * m * t * 0.5 + t * t * 0.42,
    ]);
  }
  s.push([z0, base + 0.06]);
  const thick = 0.1;
  const inner = 0.255;
  const g = side === 1 ? extrudeX(s, inner, inner + thick) : extrudeX(s, -inner - thick, -inner);
  return finish(g, OAK, moss);
}

function truck(
  side: -1 | 1,
  z: number,
  r: number,
  detail: CannonDetail,
  moss: number,
  out: CannonParts,
): void {
  const x = side * CANNON.truckX;
  const half = CANNON.truckWidth / 2;
  const seg = segments(detail, 18, 12, 7);
  out.wood.push(cylinderX(r, x - half, x + half, r, z, seg, TRUCK, moss));
  if (detail === 'lite') return;
  // The iron tyre, a hair proud of the wood, and the axle cap with its linchpin.
  out.metal.push(cylinderX(r + 0.007, x - half * 0.62, x + half * 0.62, r, z, seg, IRON_DARK, moss * 0.3));
  out.metal.push(
    cylinderX(0.052, x + side * half, x + side * (half + 0.045), r, z, 8, IRON_DARK, moss * 0.3),
  );
  if (detail === 'full') {
    out.metal.push(box(0.012, 0.07, 0.016, x + side * (half + 0.035), r + 0.055, z, IRON_DARK, 0));
    // Two iron straps across the truck's face, as on the reference.
    for (const dy of [-0.06, 0.06])
      out.metal.push(box(0.008, 0.03, r * 1.7, x + side * (half + 0.003), r + dy, z, IRON_DARK, moss * 0.3));
  }
}

/** The gun on its carriage, local frame. */
export function cannonParts(detail: CannonDetail, mossy = false): CannonParts {
  const moss = mossy ? 1 : 0;
  const out: CannonParts = { metal: [], wood: [] };
  const { axisY, trunnionZ } = CANNON;
  out.metal.push(barrel(detail, moss));
  // Trunnions through the cheeks, the rimbases against the barrel.
  out.metal.push(cylinderX(0.058, -0.4, 0.4, axisY, trunnionZ, segments(detail, 12, 8, 6), IRON, moss * 0.5));
  if (detail !== 'lite')
    for (const side of [-1, 1] as const)
      out.metal.push(
        cylinderX(0.09, side * 0.215, side * 0.245, axisY, trunnionZ, segments(detail, 12, 8, 6), IRON, 0),
      );

  out.wood.push(cheek(-1, detail, moss), cheek(1, detail, moss));
  // Axletrees under the cheeks, the front transom between them, the bed and the quoin.
  for (const [r, z] of [
    [CANNON.frontTruck, CANNON.frontAxleZ],
    [CANNON.rearTruck, CANNON.rearAxleZ],
  ] as const) {
    out.wood.push(box(0.74, 0.13, 0.15, 0, r, z, OAK_DARK, moss));
    // The axletree's round arms through the trucks (the axle caps cover their ends).
    out.wood.push(cylinderX(0.042, -0.48, 0.48, r, z, segments(detail, 8, 6, 5), OAK_DARK, moss));
  }
  out.wood.push(box(0.51, 0.2, 0.13, 0, 0.4, 0.5, OAK, moss));
  out.wood.push(box(0.51, 0.05, 0.62, 0, 0.44, -0.3, OAK_DARK, moss));
  // The quoin: a wedge under the breech (thick end to the rear), with its handle.
  const quoin = new BoxGeometry(0.3, 0.08, 0.36);
  const qp = quoin.getAttribute('position');
  for (let i = 0; i < qp.count; i++) if (qp.getZ(i) > 0 && qp.getY(i) > 0) qp.setY(i, qp.getY(i) - 0.05);
  quoin.computeVertexNormals();
  quoin.translate(0, 0.505, -0.4);
  out.wood.push(finish(quoin, OAK, moss));
  if (detail !== 'lite') out.wood.push(box(0.04, 0.04, 0.14, 0, 0.52, -0.62, OAK_DARK, moss));

  for (const side of [-1, 1] as const) {
    truck(side, CANNON.frontAxleZ, CANNON.frontTruck, detail, moss, out);
    truck(side, CANNON.rearAxleZ, CANNON.rearTruck, detail, moss, out);
  }
  if (detail === 'lite') return metalUv(out);

  const outer = 0.255 + 0.1;
  for (const side of [-1, 1] as const) {
    const x = side * 0.305;
    // Cap square: the iron strap that locks the trunnion down, with a bolt each side.
    // Its arc runs down to the cheek's top (4 cm under the trunnions' axis) on both sides.
    const over = 2 * Math.asin(0.04 / 0.085);
    const cap = new TorusGeometry(0.085, 0.016, 4, detail === 'full' ? 8 : 5, Math.PI + over);
    cap.rotateZ(-over / 2);
    cap.rotateY(Math.PI / 2);
    cap.translate(x, axisY, trunnionZ);
    out.metal.push(finish(cap, IRON_DARK, moss * 0.3, 0.04));
    // Straps along the cheek's foot and up its front edge.
    out.metal.push(box(0.012, 0.035, 1.18, side * (outer + 0.004), 0.29, 0, IRON_DARK, moss * 0.3));
    out.metal.push(
      box(0.012, 0.42, 0.035, side * (outer + 0.004), 0.5, CANNON.carriageZ1 - 0.04, IRON_DARK, 0),
    );
    // Ring-bolts: the side tackle's on the cheek, the breeching's at its rear end.
    out.metal.push(
      ring(0.05, 0.011, side * (outer + 0.02), 0.43, -0.16, 'x', detail === 'full' ? 9 : 6, moss),
    );
    out.metal.push(
      ring(0.046, 0.011, x, 0.43, CANNON.carriageZ0 - 0.02, 'z', detail === 'full' ? 9 : 6, moss),
    );
    if (detail === 'full') {
      // Eye-bolt shanks for the rings and the cap squares' bolts.
      out.metal.push(cylinderX(0.012, side * outer, side * (outer + 0.03), 0.48, -0.16, 6, IRON_DARK, 0));
      for (const dz of [-0.11, 0.11])
        out.metal.push(
          cylinderX(
            0.017,
            side * (outer - 0.01),
            side * (outer + 0.012),
            0.74,
            trunnionZ + dz,
            5,
            IRON_DARK,
            0,
          ),
        );
      // Bolt heads down the cheek, through the axletrees and the step.
      for (const [y, z] of [
        [0.33, 0.42],
        [0.33, -0.44],
        [0.6, -0.08],
        [0.46, 0.2],
      ] as const)
        out.metal.push(
          cylinderX(0.016, side * (outer - 0.01), side * (outer + 0.012), y, z, 5, IRON_DARK, 0),
        );
    }
  }
  return metalUv(out);
}

function metalUv(parts: CannonParts): CannonParts {
  for (const g of parts.metal) boxUv(g, METAL_UV);
  return parts;
}

/**
 * A pile of round shot (local frame, origin on the ground): a triangular pyramid of 6, 3 and 1 on
 * Full and Mid, of 3 and 1 on Lite.
 */
export function shotPyramid(detail: CannonDetail, mossy = false): BufferGeometry[] {
  const r = CANNON.shotRadius;
  const out: BufferGeometry[] = [];
  const ball = new SphereGeometry(r, segments(detail, 8, 7, 6), segments(detail, 6, 5, 4));
  const layers = detail === 'lite' ? 2 : 3;
  // Each layer's balls sit in the hollows of the one under it (a tetrahedral stack).
  const rowStep = r * Math.sqrt(3);
  const lift = r * Math.sqrt(8 / 3);
  for (let layer = 0; layer < layers; layer++) {
    const n = layers - layer;
    const y = r + layer * lift;
    // Every layer's centroid stays over the base's, so each ball sits in a hollow of the layer below.
    const z0 = (-2 * (n - 1) * rowStep) / 3;
    for (let row = 0; row < n; row++)
      for (let i = 0; i <= row; i++) {
        const g = ball.clone();
        g.rotateY(i * 1.3 + row * 0.7 + layer);
        g.translate((i - row / 2) * r * 2, y, z0 + row * rowStep);
        out.push(boxUv(finish(g, SHOT, mossy ? 0.5 : 0, 0.1), METAL_UV));
      }
  }
  ball.dispose();
  return out;
}

/** One loose ball on the ground (local frame). */
export function shotBall(detail: CannonDetail, x: number, z: number, mossy = false): BufferGeometry {
  const r = CANNON.shotRadius;
  const g = new SphereGeometry(r, segments(detail, 10, 8, 6), segments(detail, 7, 5, 4));
  g.translate(x, r, z);
  return boxUv(finish(g, SHOT, mossy ? 0.5 : 0, 0.1), METAL_UV);
}

/**
 * The rammer and sponge on one staff, leaning: its foot at the origin, leaning toward +z at `lean`
 * from upright (local frame). Full and Mid only.
 */
export function rammer(lean = 0.32, length = 2.1): CannonParts {
  const out: CannonParts = { metal: [], wood: [] };
  const staff = new CylinderGeometry(0.02, 0.022, length, 6, 1);
  staff.translate(0, length / 2, 0);
  const head = new CylinderGeometry(0.07, 0.07, 0.24, 9, 1);
  head.translate(0, length - 0.02, 0);
  const sponge = new CylinderGeometry(0.075, 0.07, 0.26, 9, 1);
  sponge.translate(0, 0.13, 0);
  const tilt = (g: BufferGeometry) => g.applyMatrix4(tmp.makeRotationX(lean));
  out.wood.push(finish(tilt(staff), 0x8a6a45, 0));
  out.wood.push(finish(tilt(head), OAK_DARK, 0));
  out.wood.push(finish(tilt(sponge), 0x2f2a24, 0, 0.12));
  return out;
}

/** A powder chest: a lidded box with iron corner bands (local frame, origin on the ground). */
export function powderChest(detail: CannonDetail, mossy = false): CannonParts {
  const moss = mossy ? 1 : 0;
  const out: CannonParts = { metal: [], wood: [] };
  out.wood.push(box(0.72, 0.4, 0.46, 0, 0.2, 0, OAK_DARK, moss));
  out.wood.push(box(0.76, 0.07, 0.5, 0, 0.435, 0, OAK, moss));
  if (detail === 'lite') return out;
  for (const x of [-0.26, 0.26]) out.metal.push(box(0.04, 0.42, 0.475, x, 0.215, 0, IRON_DARK, moss * 0.3));
  out.metal.push(ring(0.035, 0.008, 0.38, 0.3, 0, 'x', 6, moss));
  out.metal.push(ring(0.035, 0.008, -0.38, 0.3, 0, 'x', 6, moss));
  return metalUv(out);
}

/** Copies `parts` into the buckets, moved by `matrix` (each copy is the caller's to merge). */
export function placeParts(
  parts: CannonParts,
  matrix: Matrix4,
  buckets: { metal: BufferGeometry[]; wood: BufferGeometry[] },
): void {
  for (const g of parts.metal) buckets.metal.push(g.clone().applyMatrix4(matrix));
  for (const g of parts.wood) buckets.wood.push(g.clone().applyMatrix4(matrix));
}

/** A placement matrix: at (x, y, z), the local +z turned to (sin heading, cos heading). */
export function placement(x: number, y: number, z: number, heading: number, out = new Matrix4()): Matrix4 {
  out.makeRotationY(heading);
  out.setPosition(x, y, z);
  return out;
}
