import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicNodeMaterial,
} from 'three/webgpu';
import {
  abs,
  cameraPosition,
  dot,
  float,
  Fn,
  max,
  normalize,
  normalWorld,
  positionWorld,
  smoothstep,
  vec4,
  vertexColor,
} from 'three/tsl';
import { world } from '../uniforms';

/** Ground cover weights at a point (an island's baked masks: they sum to 1). */
export interface SilhouetteMasks {
  sand: number;
  grass: number;
  rock: number;
  cliff: number;
}

/** A footprint that stands up as a block on the horizon (a house, from its footprint). */
export interface SilhouetteBlock {
  x: number;
  z: number;
  hx: number;
  hz: number;
  /** Yaw about +y (three's convention, as `BoxCollider.rot`). */
  rot: number;
  /** World heights it spans (else the ground at its centre, up by `height`). */
  y0?: number;
  y1?: number;
  height?: number;
  color: number;
  /** A pyramid roof in this colour, rising `roofRise` m (a flat top in `color` without). */
  roof?: number;
  roofRise?: number;
}

/**
 * A flat face with its own colour (a façade cell, a roof slope), lit like the blocks. `inside` is a
 * point behind it (the face's normal points away from it).
 */
export interface SilhouetteFace {
  pts: readonly (readonly [number, number, number])[];
  color: number;
  inside: readonly [number, number, number];
}

/** A round landmark as an eight-sided prism (a lighthouse, a sea stack, a tower), with a cone cap. */
export interface SilhouetteTower {
  x: number;
  z: number;
  r0: number;
  r1: number;
  y0: number;
  y1: number;
  color: number;
  cap?: { color: number; height: number };
}

/** A strip draped over the ground (a waterfall's streak): its points, half width and lift (m). */
interface SilhouetteRibbon {
  points: readonly (readonly [number, number])[];
  halfWidth: number;
  lift: number;
  /** Heights of its points (a fall that leaps clear of its cliff), else the ground's plus `lift`. */
  ys?: readonly number[];
  color: number;
  /**
   * Soft water (a fall seen from afar): banded down its length, fading into the ground's own colour
   * at its edges, lip and foot, and never more than this much water (0-1) at its heart.
   */
  soft?: number;
}

/**
 * A baked light (view-independent: Lambert), so the far shape has the island's lit and shaded sides.
 * `sun` and `ambient` are linear RGB factors on the colours (1 leaves a colour as it is).
 */
interface SilhouetteLight {
  /** Unit direction toward the sun. */
  dir: readonly [number, number, number];
  sun: readonly [number, number, number];
  /** The sky's light on faces that look up; `ground` on faces that look sideways (a sky dome's). */
  ambient: readonly [number, number, number];
  ground?: readonly [number, number, number];
  /** Wrap (0-1): the sun reaches past the terminator, as the low sky's glow does on side faces. */
  wrap?: number;
}

export interface SilhouetteOptions {
  name: string;
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  /** Grid spacing (m). */
  cell: number;
  /**
   * The lowest the ground goes (m, default −6: under the sea it's the ocean's). The harbour mirror's
   * copy stops at the water (0): it's seen from under the water, where anything lower would be in
   * the way.
   */
  floor?: number;
  /** The island's ground (and anything that should read as ground, like a tree's crown). */
  height: (x: number, z: number) => number;
  /** Gentle slopes (the island's green), steep faces (rock), and the shore. */
  land: number;
  rock: number;
  sand: number;
  /** With masks, the ground takes the island's own cover: these colours, blended by its masks. */
  masks?: (x: number, z: number) => SilhouetteMasks;
  cliff?: number;
  /**
   * Trees on the ground (0-1): the ground rises by up to `forestHeight` m there in `forestColor`, so
   * the ridge line has its tree line. Or a canopy (a great tree) at full strength.
   */
  forest?: (x: number, z: number, ground: number, masks: SilhouetteMasks | null) => number;
  /** Moss or scrub over the rock (0-1, colour only), in `mossColor`. */
  moss?: (x: number, z: number, masks: SilhouetteMasks) => number;
  mossColor?: number;
  forestColor?: number;
  forestHeight?: number;
  /** With masks: how far the grid's sheer faces (over ~45°) take the cliff colour (0-1). */
  sheer?: number;
  /**
   * How much its bare ground takes the low sun's sheen (0-1, default 1): less where the real island's
   * bare faces are its cliff meshes, which don't shine like dry ground.
   */
  sheen?: number;
  light?: SilhouetteLight;
  blocks?: readonly SilhouetteBlock[];
  /** Faces as they are (a town's façades and roofs in their own colours, `SilhouetteFace`). */
  faces?: readonly SilhouetteFace[];
  towers?: readonly SilhouetteTower[];
  ribbons?: readonly SilhouetteRibbon[];
}

/** sRGB hex a toward b by t (a colour weathered toward another at a distance). */
export function mixHex(a: number, b: number, t: number): number {
  let out = 0;
  for (const shift of [16, 8, 0]) {
    const ca = (a >> shift) & 255;
    const cb = (b >> shift) & 255;
    out |= Math.round(ca + (cb - ca) * t) << shift;
  }
  return out;
}

/** Below this height (m) the ground reads as beach. */
const SHORE = 1.8;
/** Steeper than this rise per metre, as rock. */
const STEEP = 0.9;
/** Blocks lower than this (m) don't read on the horizon (walls, stalls, crates). */
const MIN_BLOCK = 2.5;
/** The sheen's strength toward a low sun. */
const SHEEN = 0.5;
/** Grid rows sampled between breaths (the masks are the slow part). */
const ROWS_PER_STEP = 6;

const tmp = new Color();
const c2 = new Color();
const sunC = new Color();
const ambC = new Color();
const gndC = new Color();

/**
 * An island's far silhouette (while it isn't streamed in, or the camera's past its show range): its
 * ground on a coarse grid in its own cover (beach, green, rock, cliff, its tree line), with the
 * island's sun baked in (a lit side and a shaded side, like the real island at that hour), and its
 * landmarks as plain blocks, prisms and strips. Every island's silhouette is one unlit, fogged,
 * vertex-coloured graph (one program for them all; one draw each); the haze lightens it with
 * distance like the real island. Steps yield every few grid rows (`createIslandSilhouetteAsync`).
 */
function* silhouetteSteps(o: SilhouetteOptions): Generator<void, BufferGeometry, void> {
  const { minX, maxX, minZ, maxZ } = o.bounds;
  const floor = o.floor ?? -6;
  const nx = Math.max(1, Math.floor((maxX - minX) / o.cell));
  const nz = Math.max(1, Math.floor((maxZ - minZ) / o.cell));
  const positions: number[] = [];
  const colors: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  const h = new Float32Array((nx + 1) * (nz + 1));
  const lift = new Float32Array((nx + 1) * (nz + 1));
  const base: number[] = [];
  /** Per grid point: how much it takes the sun's sheen (bare ground, not grass or trees). */
  const shine = new Float32Array((nx + 1) * (nz + 1));
  const land = new Color(o.land);
  const sand = new Color(o.sand);
  const rock = new Color(o.rock);
  const cliff = new Color(o.cliff ?? o.rock);
  const forest = new Color(o.forestColor ?? o.land);
  const moss = new Color(o.mossColor ?? o.land);
  for (let j = 0; j <= nz; j++) {
    for (let i = 0; i <= nx; i++) {
      const x = minX + i * o.cell;
      const z = minZ + j * o.cell;
      const k = j * (nx + 1) + i;
      h[k] = o.height(x, z);
      const m = o.masks ? o.masks(x, z) : null;
      const f = o.forest ? Math.min(1, Math.max(0, o.forest(x, z, h[k]!, m))) : 0;
      lift[k] = f * (o.forestHeight ?? 0);
      if (m) {
        tmp.r = sand.r * m.sand + land.r * m.grass + rock.r * m.rock + cliff.r * m.cliff;
        tmp.g = sand.g * m.sand + land.g * m.grass + rock.g * m.rock + cliff.g * m.cliff;
        tmp.b = sand.b * m.sand + land.b * m.grass + rock.b * m.rock + cliff.b * m.cliff;
        if (o.moss) tmp.lerp(moss, Math.min(1, Math.max(0, o.moss(x, z, m))));
        shine[k] = (1 - m.grass) * (1 - f) * (o.sheen ?? 1);
      } else tmp.copy(land);
      if (f > 0) tmp.lerp(forest, Math.min(1, f * 1.4));
      base.push(tmp.r, tmp.g, tmp.b);
    }
    if (j % ROWS_PER_STEP === ROWS_PER_STEP - 1) yield;
  }
  const at = (i: number, j: number) => {
    const k = Math.min(nz, Math.max(0, j)) * (nx + 1) + Math.min(nx, Math.max(0, i));
    return h[k]! + lift[k]!;
  };
  if (o.light) {
    sunC.setRGB(...o.light.sun);
    ambC.setRGB(...o.light.ambient);
    gndC.setRGB(...(o.light.ground ?? o.light.ambient));
  }
  const lit = (out: Color, nxv: number, nyv: number, nzv: number) => {
    if (!o.light) return out;
    const d = o.light.dir;
    const w = o.light.wrap ?? 0;
    const k = Math.max(0, (nxv * d[0] + nyv * d[1] + nzv * d[2] + w) / (1 + w));
    const up = Math.max(0, nyv);
    out.r *= gndC.r + (ambC.r - gndC.r) * up + sunC.r * k;
    out.g *= gndC.g + (ambC.g - gndC.g) * up + sunC.g * k;
    out.b *= gndC.b + (ambC.b - gndC.b) * up + sunC.b * k;
    return out;
  };
  for (let j = 0; j <= nz; j++)
    for (let i = 0; i <= nx; i++) {
      const k = j * (nx + 1) + i;
      const y = at(i, j);
      positions.push(minX + i * o.cell, Math.max(floor, y), minZ + j * o.cell);
      const gx = (at(i + 1, j) - at(i - 1, j)) / (2 * o.cell);
      const gz = (at(i, j + 1) - at(i, j - 1)) / (2 * o.cell);
      tmp.setRGB(base[k * 3]!, base[k * 3 + 1]!, base[k * 3 + 2]!);
      const steep = Math.min(1, Math.max(0, (Math.hypot(gx, gz) - STEEP * 0.6) / (STEEP * 0.8)));
      if (!o.masks) {
        // Without masks: rock by slope, beach by height.
        const shore = Math.min(1, Math.max(0, (SHORE + 1.2 - h[k]!) / 2.4));
        tmp.lerp(rock, steep).lerp(sand, shore * (1 - steep));
      } else if (o.sheer && lift[k] === 0) {
        // The coarse grid's sheer faces stand for the real ground's cliffs (its masks see the ledges).
        const g = Math.hypot(gx, gz);
        tmp.lerp(cliff, o.sheer * Math.min(1, Math.max(0, (g - 1) / 0.8)));
      }
      const len = Math.hypot(gx, 1, gz);
      lit(tmp, -gx / len, 1 / len, -gz / len);
      colors.push(tmp.r, tmp.g, tmp.b, shine[k]!);
      normals.push(-gx / len, 1 / len, -gz / len);
    }
  for (let j = 0; j < nz; j++)
    for (let i = 0; i < nx; i++) {
      const a = j * (nx + 1) + i;
      const c = a + nx + 1;
      // Leave out cells wholly under the sea (the ocean covers them).
      if (Math.max(positions[a * 3 + 1]!, positions[(a + 1) * 3 + 1]!, positions[c * 3 + 1]!) <= floor + 0.1)
        continue;
      indices.push(a, c, a + 1, a + 1, c, c + 1);
    }
  yield;

  /**
   * A flat face (its own vertices, so it's lit by its own normal), facing away from `inside` (a
   * point within the solid it bounds).
   */
  const face = (
    pts: readonly (readonly [number, number, number])[],
    hex: number,
    inside: readonly [number, number, number] | null,
  ) => {
    const first = positions.length / 3;
    const [a, b, c] = pts;
    const ux = b![0] - a![0],
      uy = b![1] - a![1],
      uz = b![2] - a![2];
    const vx = c![0] - a![0],
      vy = c![1] - a![1],
      vz = c![2] - a![2];
    let nxv = uy * vz - uz * vy,
      nyv = uz * vx - ux * vz,
      nzv = ux * vy - uy * vx;
    const l = Math.hypot(nxv, nyv, nzv) || 1;
    nxv /= l;
    nyv /= l;
    nzv /= l;
    if (inside && nxv * (a![0] - inside[0]) + nyv * (a![1] - inside[1]) + nzv * (a![2] - inside[2]) < 0) {
      nxv = -nxv;
      nyv = -nyv;
      nzv = -nzv;
    }
    c2.set(hex);
    // Falling water (no `inside`) catches the light whichever way it faces.
    if (inside) lit(c2, nxv, nyv, nzv);
    for (const p of pts) {
      positions.push(p[0], p[1], p[2]);
      colors.push(c2.r, c2.g, c2.b, 0);
      normals.push(nxv, nyv, nzv);
    }
    for (let k = 1; k + 1 < pts.length; k++) indices.push(first, first + k, first + k + 1);
  };
  for (const b of o.blocks ?? []) {
    const ground = o.height(b.x, b.z);
    const y0 = (b.y0 ?? ground) - 0.5;
    const y1 = b.y1 ?? (b.y0 ?? ground) + (b.height ?? 0);
    if (y1 - y0 < MIN_BLOCK || Math.min(b.hx, b.hz) < 0.8) continue;
    const c = Math.cos(b.rot);
    const s = Math.sin(b.rot);
    // three's yaw about +y: x' = x cos + z sin, z' = −x sin + z cos.
    const corner = (lx: number, lz: number, y: number): [number, number, number] => [
      b.x + lx * c + lz * s,
      y,
      b.z - lx * s + lz * c,
    ];
    const ring = [
      [-b.hx, -b.hz],
      [b.hx, -b.hz],
      [b.hx, b.hz],
      [-b.hx, b.hz],
    ] as const;
    const mid: [number, number, number] = [b.x, (y0 + y1) / 2, b.z];
    for (let k = 0; k < 4; k++) {
      const [ax, az] = ring[k]!;
      const [bx, bz] = ring[(k + 1) % 4]!;
      face([corner(ax, az, y0), corner(bx, bz, y0), corner(bx, bz, y1), corner(ax, az, y1)], b.color, mid);
    }
    const top = ring.map(([lx, lz]) => corner(lx, lz, y1));
    if (b.roof !== undefined) {
      const apex: [number, number, number] = [b.x, y1 + (b.roofRise ?? 2), b.z];
      for (let k = 0; k < 4; k++) face([top[k]!, top[(k + 1) % 4]!, apex], b.roof, mid);
    } else face(top, b.color, mid);
  }
  for (const f of o.faces ?? []) face(f.pts, f.color, f.inside);
  for (const t of o.towers ?? []) {
    const sides = 8;
    const ringAt = (y: number, r: number) =>
      Array.from({ length: sides }, (_, k) => {
        const a = (k / sides) * Math.PI * 2;
        return [t.x + Math.cos(a) * r, y, t.z + Math.sin(a) * r] as [number, number, number];
      });
    const lo = ringAt(t.y0, t.r0);
    const hi = ringAt(t.y1, t.r1);
    const mid: [number, number, number] = [t.x, (t.y0 + t.y1) / 2, t.z];
    for (let k = 0; k < sides; k++) {
      const n = (k + 1) % sides;
      face([lo[k]!, lo[n]!, hi[n]!, hi[k]!], t.color, mid);
    }
    const apex: [number, number, number] = [t.x, t.y1 + (t.cap?.height ?? 0), t.z];
    for (let k = 0; k < sides; k++) face([hi[k]!, hi[(k + 1) % sides]!, apex], t.cap?.color ?? t.color, mid);
    // A floating mass (a crown) needs its underside.
    if (t.y0 > o.height(t.x, t.z) + 1)
      for (let k = 0; k < sides; k++)
        face([lo[(k + 1) % sides]!, lo[k]!, [t.x, t.y0, t.z]], t.color, [t.x, t.y1, t.z]);
  }
  /** A soft fall: a grid down its length, its colour easing from the ground's into the water's. */
  const softRibbon = (r: SilhouetteRibbon) => {
    const ALONG = 8;
    const ACROSS = [-1, -0.45, 0, 0.45, 1];
    const water = new Color(r.color);
    const pts = r.points;
    const [ax, az] = pts[0]!;
    const [bx, bz] = pts[pts.length - 1]!;
    const dx = bx - ax,
      dz = bz - az;
    const l = Math.hypot(dx, dz) || 1;
    const ya = r.ys?.[0] ?? o.height(ax, az) + r.lift;
    const yb = r.ys?.[pts.length - 1] ?? o.height(bx, bz) + r.lift;
    const first = positions.length / 3;
    for (let a = 0; a <= ALONG; a++) {
      const t = a / ALONG;
      // Lip and foot fade out (the foot into its mist); bands of white water down the sheet.
      const along = Math.min(1, t / 0.12) * Math.min(1, (1 - t) / 0.25);
      const band = 0.78 + 0.22 * Math.cos(a * 2.4);
      // A fall narrows a little as it drops (its sheet gathers).
      const half = r.halfWidth * (1 - 0.25 * t);
      const cx = ax + dx * t,
        cz = az + dz * t,
        cy = ya + (yb - ya) * t;
      for (const u of ACROSS) {
        const x = cx + (-dz / l) * half * u;
        const z = cz + (dx / l) * half * u;
        const across = 1 - Math.abs(u) ** 2.5;
        groundColor(x, z, c2).lerp(water, (r.soft ?? 1) * across * along * band);
        positions.push(x, cy, z);
        colors.push(c2.r, c2.g, c2.b, 0);
        normals.push(-dz / l, 0, dx / l);
      }
    }
    const n = ACROSS.length;
    for (let a = 0; a < ALONG; a++)
      for (let u = 0; u + 1 < n; u++) {
        const i0 = first + a * n + u;
        const i1 = i0 + n;
        indices.push(i0, i1, i0 + 1, i0 + 1, i1, i1 + 1);
      }
  };
  /** The ground's finished colour (lit) at the grid point nearest (x, z). */
  const groundColor = (x: number, z: number, out: Color) => {
    const i = Math.min(nx, Math.max(0, Math.round((x - minX) / o.cell)));
    const j = Math.min(nz, Math.max(0, Math.round((z - minZ) / o.cell)));
    const k = (j * (nx + 1) + i) * 4;
    return out.setRGB(colors[k]!, colors[k + 1]!, colors[k + 2]!);
  };
  for (const r of o.ribbons ?? []) {
    if (r.soft !== undefined) {
      softRibbon(r);
      continue;
    }
    const pts = r.points;
    for (let k = 0; k + 1 < pts.length; k++) {
      const [ax, az] = pts[k]!;
      const [bx, bz] = pts[k + 1]!;
      const dx = bx - ax,
        dz = bz - az;
      const l = Math.hypot(dx, dz) || 1;
      const px = (-dz / l) * r.halfWidth,
        pz = (dx / l) * r.halfWidth;
      const ya = r.ys?.[k] ?? o.height(ax, az) + r.lift,
        yb = r.ys?.[k + 1] ?? o.height(bx, bz) + r.lift;
      face(
        [
          [ax - px, ya, az - pz],
          [ax + px, ya, az + pz],
          [bx + px, yb, bz + pz],
          [bx - px, yb, bz - pz],
        ],
        r.color,
        null,
      );
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute('color', new BufferAttribute(new Float32Array(colors), 4));
  geometry.setAttribute('normal', new BufferAttribute(new Float32Array(normals), 3));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * Every island silhouette's colour (one graph): its baked colour, and the low sun's sheen on its
 * bare ground (the colour's alpha) that looks up, seen toward the sun at a glancing angle (the real
 * islands' rock and dry ground go golden from their sunward side). View dependent, so not baked.
 */
const silhouetteColor = Fn(() => {
  const view = normalize(positionWorld.sub(cameraPosition));
  const toward = max(dot(view, world.sunDir), 0);
  const c = vertexColor();
  const glance = float(1).sub(abs(dot(normalWorld, view)));
  const up = smoothstep(0.25, 0.9, normalWorld.y);
  const sheen = world.sunColor.mul(toward.pow(5).mul(glance.pow(2)).mul(up).mul(c.a).mul(SHEEN));
  return vec4(c.rgb.add(sheen), 1);
});

function silhouetteMesh(name: string, geometry: BufferGeometry): Mesh {
  const material = new MeshBasicNodeMaterial({ depthWrite: true, side: DoubleSide });
  material.colorNode = silhouetteColor();
  material.fog = true;
  const mesh = new Mesh(geometry, material);
  mesh.name = `${name}-mesh`;
  return mesh;
}

/** The silhouette, built at once (a cheap island: Anchorage's samples its loaded height field). */
export function createIslandSilhouette(o: SilhouetteOptions): Group {
  const group = new Group();
  group.name = o.name;
  const steps = silhouetteSteps(o);
  let r = steps.next();
  while (!r.done) r = steps.next();
  group.add(silhouetteMesh(o.name, r.value));
  return group;
}

/**
 * The silhouette's group at once (empty), its mesh a few grid rows a breath later (an island's masks
 * take ~100 ms to sample in all: in one go that held a frame of the opening).
 */
export function createIslandSilhouetteAsync(
  o: SilhouetteOptions,
  breathe: () => Promise<void>,
): { group: Group; ready: Promise<void> } {
  const group = new Group();
  group.name = o.name;
  const ready = (async () => {
    const steps = silhouetteSteps(o);
    let r = steps.next();
    while (!r.done) {
      await breathe();
      r = steps.next();
    }
    group.add(silhouetteMesh(o.name, r.value));
  })();
  return { group, ready };
}
