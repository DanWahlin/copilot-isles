import {
  BufferAttribute,
  BufferGeometry,
  CatmullRomCurve3,
  ConeGeometry,
  SphereGeometry,
  TorusGeometry,
  TubeGeometry,
  Vector3,
} from 'three/webgpu';
import { cylinder, tubeBetween, worldUv } from '../sites/geo';
import { paint, transform } from '../village/kit';

/**
 * The plaza fountain's monument: a stone anchor on a stepped octagonal plinth that rises from the
 * basin's water, with a compass star carved on four faces (they echo the compass rose in the paving)
 * and a coil of rope at the anchor's foot. All parts go in the town's stone bucket.
 */

const PLINTH_DARK = 0x91704c;
const PLINTH_LIGHT = 0xf0d7aa;
const STAR = 0xc8a06d;
const ANCHOR = 0xd9dad2;
const ROPE = 0xb99562;
/**
 * The anchor's turn about y (0: broadside to the stair street, +z). At 35° its broad side still faces
 * the stair street, and it reads too from the plaza's west side and its north-east corner.
 */
const ANCHOR_YAW = 35 * (Math.PI / 180);

/** Heights above the plaza paving. The base step starts under the water (its surface is at 0.61). */
export const MONUMENT = {
  baseStep: { r: 1.0, y0: 0.42, y1: 0.74 },
  plinth: { r: 0.78, y0: 0.74, y1: 1.56 },
  cap: { r: 0.95, y0: 1.56, y1: 1.74 },
  /** The anchor's ring: centre and radii (its top is the monument's top). */
  ring: { y: 1.74 + 2.34, r: 0.25, tube: 0.08 },
} as const;

/** The top of the anchor's ring above the paving (the bird perch). */
export const MONUMENT_TOP = MONUMENT.ring.y + MONUMENT.ring.r + MONUMENT.ring.tube;

/**
 * The monument's parts, placed at the plaza point (x, y, z). Lite (PLAN §12.1) uses fewer segments
 * and four-point stars.
 */
export function anchorMonument(x: number, y: number, z: number, lite: boolean): BufferGeometry[] {
  const parts: BufferGeometry[] = [];
  const { baseStep, plinth, cap, ring } = MONUMENT;
  // Octagons with a flat face on each compass point.
  const oct = (r: number, y0: number, y1: number, colour: number) =>
    parts.push(cylinder(r, r, y1 - y0, { x, y: y + y0, z, ry: Math.PI / 8 }, colour, 8));
  oct(baseStep.r, baseStep.y0, baseStep.y1, PLINTH_DARK);
  oct(plinth.r, plinth.y0, plinth.y1, PLINTH_LIGHT);
  oct(cap.r, cap.y0, cap.y1, PLINTH_DARK);

  const apothem = plinth.r * Math.cos(Math.PI / 8);
  const starY = y + (plinth.y0 + plinth.y1) / 2;
  for (let k = 0; k < 4; k += 1) parts.push(compassStar(x, starY, z, (k * Math.PI) / 2, apothem, lite));

  const anchor: BufferGeometry[] = [];
  anchorOnPlinth(anchor, y + cap.y1, y + ring.y, lite);
  for (const g of anchor) {
    g.rotateY(ANCHOR_YAW);
    g.translate(x, 0, z);
    parts.push(g);
  }
  parts.push(ropeCoil(x, y + cap.y1 + 0.05, z, lite));
  return parts;
}

/** The anchor at the origin (x = z = 0), its foot at `top` and its ring's centre at `ringY`. */
function anchorOnPlinth(parts: BufferGeometry[], top: number, ringY: number, lite: boolean): void {
  const x = 0,
    z = 0;
  const { ring } = MONUMENT;
  const radial = lite ? 5 : 8;
  // The crown's boss where the shank meets the cap.
  parts.push(cylinder(0.17, 0.26, 0.2, { x, y: top - 0.02, z }, ANCHOR, radial));
  parts.push(tubeBetween(0.13, { x, y: top + 0.1, z }, { x, y: ringY - ring.r + 0.02, z }, ANCHOR, radial));
  parts.push(torus(x, ringY, z, ring.r, ring.tube, lite ? 4 : 6, lite ? 10 : 14, Math.PI * 2, 0));

  const stockY = top + 1.9;
  const stockHalf = 0.7;
  parts.push(
    tubeBetween(
      0.085,
      { x: x - stockHalf, y: stockY, z },
      { x: x + stockHalf, y: stockY, z },
      ANCHOR,
      lite ? 5 : 6,
    ),
  );
  for (const sx of [-1, 1]) parts.push(knob(x + sx * (stockHalf + 0.04), stockY, z, lite));

  // The arms: the lower half of a ring round the shank, with a fluke on each tip.
  const armR = 0.8;
  const armY = top + 0.95;
  parts.push(torus(x, armY, z, armR, 0.125, lite ? 4 : 6, lite ? 8 : 12, Math.PI, Math.PI));
  for (const sx of [-1, 1]) parts.push(fluke(x + sx * armR, armY - 0.08, z, sx));
}

function torus(
  x: number,
  y: number,
  z: number,
  r: number,
  tube: number,
  radial: number,
  tubular: number,
  arc: number,
  rz: number,
): BufferGeometry {
  const g = new TorusGeometry(r, tube, radial, tubular, arc);
  transform(g, x, y, z, 0, 0, rz, 1, 1, 1);
  worldUv(g, 0.8);
  paint(g, ANCHOR);
  return g;
}

function knob(x: number, y: number, z: number, lite: boolean): BufferGeometry {
  const g = new SphereGeometry(0.125, lite ? 5 : 6, lite ? 3 : 4);
  transform(g, x, y, z, 0, 0, 0, 1, 1, 1);
  worldUv(g, 0.8);
  paint(g, ANCHOR);
  return g;
}

/** A flat, four-sided spearhead standing on an arm's tip, its broad side facing ±z. */
function fluke(x: number, y: number, z: number, side: number): BufferGeometry {
  const h = 0.62;
  const g = new ConeGeometry(0.33, h, 4, 1).toNonIndexed();
  g.rotateY(Math.PI / 4);
  g.translate(0, h / 2, 0);
  // A slight outward lean, like the flukes on a real anchor's arms.
  transform(g, x, y, z, 0, 0, -side * 0.12, 1, 1, 0.38);
  worldUv(g, 0.8);
  paint(g, ANCHOR);
  return g;
}

function ropeCoil(x: number, y: number, z: number, lite: boolean): BufferGeometry {
  const turns = 2.2;
  const points: Vector3[] = [];
  const steps = lite ? 9 : 14;
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const a = t * turns * Math.PI * 2;
    const r = 0.46 - t * 0.08;
    points.push(new Vector3(x + Math.cos(a) * r, y + t * 0.2, z + Math.sin(a) * r));
  }
  const g = new TubeGeometry(new CatmullRomCurve3(points), lite ? 14 : 30, 0.06, lite ? 4 : 5, false);
  worldUv(g, 0.8);
  paint(g, ROPE);
  return g;
}

/**
 * A compass star in relief on the plinth face looking along `a` (0: +z), `apothem` from the centre.
 * Eight points (four long, four short), or four on Lite. Its back sits inside the plinth.
 */
function compassStar(
  x: number,
  y: number,
  z: number,
  a: number,
  apothem: number,
  lite: boolean,
): BufferGeometry {
  const n = lite ? 8 : 16;
  const ring: [number, number][] = [];
  for (let i = 0; i < n; i += 1) {
    const t = (i / n) * Math.PI * 2 + Math.PI / 2;
    const r = i % 2 === 1 ? 0.07 : lite || i % 4 === 0 ? 0.27 : 0.16;
    ring.push([Math.cos(t) * r, Math.sin(t) * r]);
  }
  const front = 0.03;
  const back = -0.02;
  const out: number[] = [];
  const push = (u: number, v: number, w: number) => out.push(u, v, w);
  for (let i = 0; i < n; i += 1) {
    const [u0, v0] = ring[i]!;
    const [u1, v1] = ring[(i + 1) % n]!;
    push(0, 0, front);
    push(u0, v0, front);
    push(u1, v1, front);
    push(u0, v0, front);
    push(u0, v0, back);
    push(u1, v1, back);
    push(u0, v0, front);
    push(u1, v1, back);
    push(u1, v1, front);
  }
  // Face frame: t (across), up, and the outward normal n; t × up = n.
  const sa = Math.sin(a),
    ca = Math.cos(a);
  const pos = new Float32Array(out.length);
  for (let i = 0; i < out.length; i += 3) {
    const u = out[i]!,
      v = out[i + 1]!,
      w = out[i + 2]! + apothem;
    pos[i] = x + u * ca + w * sa;
    pos[i + 1] = y + v;
    pos[i + 2] = z - u * sa + w * ca;
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(pos, 3));
  g.computeVertexNormals();
  worldUv(g, 0.8);
  paint(g, STAR);
  return g;
}
