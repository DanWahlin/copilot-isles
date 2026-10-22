import { BufferGeometry, Matrix4 } from 'three/webgpu';
import { MeshBuilder, paint, withIndex, worldUv } from '../sites/geo';
import { extrudeX, lathe } from '../village/shore-cannon';

/**
 * Shapes for the Model Market's stalls (src/world/market-stall/): round arches with their voussoirs and spandrels,
 * shaped signboard backings and their carved frames, and lathe-turned pots and rims. Each comes
 * back placed, vertex-coloured, world-UV'd and indexed, ready for the town's material buckets (no new
 * material or shader). Built by hand: three's ExtrudeGeometry/LatheGeometry would grow vendor-three.
 */

const UV = 1.8;
const m = new Matrix4();

/**
 * World UVs, a vertex colour (null keeps the colours it has) and an index, so it merges with the
 * kit's pieces.
 */
export function finish(g: BufferGeometry, hex: number | null, uvScale = UV): BufferGeometry {
  for (const name of Object.keys(g.attributes))
    if (name !== 'position' && name !== 'normal' && !(name === 'color' && hex === null))
      g.deleteAttribute(name);
  if (!g.getAttribute('normal')) g.computeVertexNormals();
  worldUv(g, uvScale);
  if (hex !== null) paint(g, hex);
  return g.index ? g : withIndex(g);
}

/** A 2D outline in (x, y), extruded along z from z0 to z1 (flat faces front and back). */
export function prismZ(
  outline: readonly (readonly [number, number])[],
  z0: number,
  z1: number,
  hex: number,
): BufferGeometry {
  const g = extrudeX(outline, -z1, -z0);
  // extrudeX lays the outline in (z, y) across x: a quarter turn puts it in (x, y) along z.
  g.applyMatrix4(m.makeRotationY(Math.PI / 2));
  return finish(g, hex);
}

/**
 * The stones of a round arch: `stones` voussoirs from one springing to the other, each a ring sector
 * between rIn and rOut, a thin joint apart, with the keystone a little proud. Front faces sit at z1,
 * the soffit runs back to z0. Alternate stones are a shade lighter (soft vertex-colour variation).
 */
export function archStones(o: {
  cx: number;
  cy: number;
  rIn: number;
  rOut: number;
  z0: number;
  z1: number;
  stones: number;
  steps: number;
  colours: readonly [number, number];
  keystone?: number;
}): BufferGeometry {
  const b = new MeshBuilder('xy', UV);
  const joint = 0.012;
  for (let i = 0; i < o.stones; i += 1) {
    const a0 = Math.PI - (i / o.stones) * Math.PI - (i === 0 ? 0 : joint);
    const a1 = Math.PI - ((i + 1) / o.stones) * Math.PI + (i === o.stones - 1 ? 0 : joint);
    const key = i === (o.stones - 1) / 2;
    const rOut = o.rOut + (key ? 0.06 : 0);
    const z1 = o.z1 + (key ? (o.keystone ?? 0.03) : 0);
    sector(b, o.cx, o.cy, o.rIn, rOut, a0, a1, o.z0, z1, o.steps, o.colours[i % 2]!);
  }
  return finish(b.geometry(), null);
}

/** Scales a colour (soft shading in the vertex colours). */
function shadeHex(hex: number, k: number): number {
  const c = (v: number) => Math.min(255, Math.round(v * k));
  return (c((hex >> 16) & 255) << 16) | (c((hex >> 8) & 255) << 8) | c(hex & 255);
}

/**
 * A ring sector prism (from angle a0 down to a1), its four sides and two ends. The front face is a
 * shade lighter at its inner edge (a sunlit arris), the soffit darker toward the back (ambient
 * occlusion under the arch), the back and extrados in shade.
 */
function sector(
  b: MeshBuilder,
  cx: number,
  cy: number,
  rIn: number,
  rOut: number,
  a0: number,
  a1: number,
  z0: number,
  z1: number,
  steps: number,
  hex: number,
): void {
  const p = (r: number, a: number, z: number) => ({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r, z });
  const q = (
    v: readonly [ReturnType<typeof p>, ReturnType<typeof p>, ReturnType<typeof p>, ReturnType<typeof p>],
    k: readonly [number, number, number, number],
  ) => {
    const i = b.vertexCount;
    v.forEach((pt, n) => b.vertex(pt, shadeHex(hex, k[n]!)));
    b.indices.push(i, i + 1, i + 3, i + 1, i + 2, i + 3);
  };
  const edge = 1.1,
    face = 1,
    under = 0.82,
    deep = 0.62,
    shade = 0.78;
  for (let s = 0; s < steps; s += 1) {
    const t0 = a0 + ((a1 - a0) * s) / steps;
    const t1 = a0 + ((a1 - a0) * (s + 1)) / steps;
    q([p(rIn, t0, z1), p(rIn, t1, z1), p(rOut, t1, z1), p(rOut, t0, z1)], [edge, edge, face, face]);
    q([p(rOut, t0, z0), p(rOut, t1, z0), p(rIn, t1, z0), p(rIn, t0, z0)], [shade, shade, shade, shade]);
    q([p(rIn, t0, z0), p(rIn, t1, z0), p(rIn, t1, z1), p(rIn, t0, z1)], [deep, deep, under, under]);
    q([p(rOut, t0, z1), p(rOut, t1, z1), p(rOut, t1, z0), p(rOut, t0, z0)], [shade, shade, shade, shade]);
  }
  q([p(rIn, a0, z0), p(rIn, a0, z1), p(rOut, a0, z1), p(rOut, a0, z0)], [shade, shade, shade, shade]);
  q([p(rOut, a1, z0), p(rOut, a1, z1), p(rIn, a1, z1), p(rIn, a1, z0)], [shade, shade, shade, shade]);
}

/** A semicircular band (the archivolt's moulding) between rIn and rOut, from z0 to z1. */
export function archBand(
  cx: number,
  cy: number,
  rIn: number,
  rOut: number,
  z0: number,
  z1: number,
  steps: number,
  hex: number,
): BufferGeometry {
  const b = new MeshBuilder('xy', UV);
  sector(b, cx, cy, rIn, rOut, Math.PI, 0, z0, z1, steps, hex);
  return finish(b.geometry(), null);
}

/**
 * The wall face round an arch: the bay from cx − half to cx + half, springing line cy up to yTop,
 * less the half disc of radius r. Faces +z at z (or −z when `back`).
 */
export function spandrel(
  cx: number,
  cy: number,
  half: number,
  r: number,
  yTop: number,
  z: number,
  steps: number,
  hex: number,
  back = false,
): BufferGeometry {
  const b = new MeshBuilder('xy', UV);
  b.color(hex);
  const q = (
    a: { x: number; y: number },
    c: { x: number; y: number },
    d: { x: number; y: number },
    e: { x: number; y: number },
  ) =>
    back
      ? b.quad({ ...e, z }, { ...d, z }, { ...c, z }, { ...a, z })
      : b.quad({ ...a, z }, { ...c, z }, { ...d, z }, { ...e, z });
  // Circle points against the bay's square (half wide, half tall over the springing), angle by angle.
  const sq = (t: number) => {
    const c = Math.cos(t),
      s = Math.sin(t);
    const k = half / Math.max(Math.abs(c), Math.abs(s));
    return { x: cx + c * k, y: cy + s * k };
  };
  const ring = (t: number) => ({ x: cx + Math.cos(t) * r, y: cy + Math.sin(t) * r });
  // Steps meet the square's two top corners exactly, so its edge is straight.
  const angles: number[] = [];
  for (let i = 0; i <= steps; i += 1) angles.push((i / steps) * Math.PI);
  angles.push(Math.PI / 4, (3 * Math.PI) / 4);
  angles.sort((a, c) => a - c);
  for (let i = 0; i < angles.length - 1; i += 1) {
    const t0 = angles[i]!,
      t1 = angles[i + 1]!;
    if (t1 - t0 < 1e-6) continue;
    q(ring(t0), sq(t0), sq(t1), ring(t1));
  }
  if (yTop > cy + half + 1e-4)
    q(
      { x: cx + half, y: cy + half },
      { x: cx + half, y: yTop },
      { x: cx - half, y: yTop },
      { x: cx - half, y: cy + half },
    );
  return finish(b.geometry(), null);
}

/**
 * A signboard's outline (x, y), centred on x = 0 with its base at y = 0: a board w × h with rounded
 * top corners and, for `crest`, a raised round hump in the middle of its top edge (the Powerful board);
 * `scallop` gives the top two small humps (the smaller boards). Counter-clockwise.
 */
export function boardOutline(
  w: number,
  h: number,
  shape: 'crest' | 'scallop' | 'plain',
  inset = 0,
): [number, number][] {
  const hw = w / 2 - inset,
    top = h - inset,
    y0 = inset,
    r = Math.min(0.12, w * 0.06);
  const pts: [number, number][] = [
    [-hw, y0],
    [hw, y0],
  ];
  const corner = (cx: number, cy: number, from: number, to: number) => {
    for (let i = 0; i <= 3; i += 1) {
      const a = from + ((to - from) * i) / 3;
      pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
    }
  };
  corner(hw - r, top - r, 0, Math.PI / 2);
  if (shape === 'crest') {
    // A round hump between shoulders, a third of the width.
    const cw = w * 0.2 - inset,
      ch = 0.24 - inset;
    pts.push([cw + 0.12, top], [cw, top + ch * 0.35]);
    for (let i = 1; i < 6; i += 1) {
      const a = (i / 6) * Math.PI;
      pts.push([Math.cos(a) * cw, top + ch * 0.35 + Math.sin(a) * ch * 0.65]);
    }
    pts.push([-cw, top + ch * 0.35], [-cw - 0.12, top]);
  } else if (shape === 'scallop') {
    for (const sx of [1, -1]) {
      const c = sx * w * 0.22;
      for (let i = 0; i <= 4; i += 1) {
        const a = sx > 0 ? (i / 4) * Math.PI : (i / 4) * Math.PI;
        pts.push([c + Math.cos(a) * w * 0.15, top + Math.sin(a) * 0.1]);
      }
    }
  }
  corner(-hw + r, top - r, Math.PI / 2, Math.PI);
  return pts;
}

/**
 * A raised frame between two outlines with the same points (an outer one and the inner one it
 * surrounds): its front face at z1, and its outer and inner edges back to z0.
 */
export function frameRing(
  outer: readonly (readonly [number, number])[],
  inner: readonly (readonly [number, number])[],
  z0: number,
  z1: number,
  hex: number,
): BufferGeometry {
  const b = new MeshBuilder('xy', UV);
  b.color(hex);
  const n = Math.min(outer.length, inner.length);
  const P = (q: readonly [number, number], z: number) => ({ x: q[0], y: q[1], z });
  for (let i = 0; i < n; i += 1) {
    const j = (i + 1) % n;
    const o0 = outer[i]!,
      o1 = outer[j]!,
      i0 = inner[i]!,
      i1 = inner[j]!;
    b.quad(P(o0, z1), P(o1, z1), P(i1, z1), P(i0, z1));
    b.quad(P(o0, z0), P(o1, z0), P(o1, z1), P(o0, z1));
    b.quad(P(i0, z1), P(i1, z1), P(i1, z0), P(i0, z0));
  }
  return finish(b.geometry(), null);
}

/** A lathe-turned pot (a bottle, jar or urn) standing at (x, y, z): radius × height profile pairs. */
export function turned(
  profile: readonly (readonly [number, number])[],
  segs: number,
  x: number,
  y: number,
  z: number,
  hex: number,
): BufferGeometry {
  const g = lathe(profile, segs);
  g.translate(x, y, z);
  return finish(g, hex);
}
