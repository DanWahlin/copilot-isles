import type { Point3 } from '../sites/geo';
import { FaceBuilder, addTube, type Buckets } from './plaza-kit';

/**
 * Red terracotta roofs with a ridge and eaves (the concept's hillside town): a gable roof (ridge
 * along the façade, gable ends plastered in the house's colour) or a hipped one (four slopes, a
 * pyramid on a square plan), each with an overhang, a fascia, a dark timber soffit under the eaves
 * and a capped ridge. The tiles' UVs run down each slope, so the courses lie the right way.
 * In the house's frame: width `w` along local x (the façade), depth `d` along local z.
 */
export type RoofKind = 'gable' | 'hip';

const PITCH = Math.tan((25 * Math.PI) / 180);
const EAVE = 0.45;
const GABLE_OVERHANG = 0.3;
const THICK = 0.16;
/** Tile texture repeats per metre (six columns of tiles, four courses per repeat). */
const TILE = 1 / 1.75;

interface Frame {
  x: number;
  y: number;
  z: number;
  c: number;
  s: number;
}

function at(f: Frame, lx: number, ly: number, lz: number): Point3 {
  return { x: f.x + lx * f.c + lz * f.s, y: f.y + ly, z: f.z - lx * f.s + lz * f.c };
}

function shade(colour: number, k: number): number {
  const r = Math.min(255, Math.round(((colour >> 16) & 255) * k));
  const g = Math.min(255, Math.round(((colour >> 8) & 255) * k));
  const b = Math.min(255, Math.round((colour & 255) * k));
  return (r << 16) | (g << 8) | b;
}

/** Adds a quad wound so its face points along `out` (lighting needs the right winding). */
function quadOut(
  fb: FaceBuilder,
  a: Point3,
  b: Point3,
  c: Point3,
  d: Point3,
  out: Point3,
  ua: [number, number],
  ub: [number, number],
  uc: [number, number],
  ud: [number, number],
): void {
  const ux = b.x - a.x,
    uy = b.y - a.y,
    uz = b.z - a.z;
  const vx = c.x - a.x,
    vy = c.y - a.y,
    vz = c.z - a.z;
  const nx = uy * vz - uz * vy,
    ny = uz * vx - ux * vz,
    nz = ux * vy - uy * vx;
  if (nx * out.x + ny * out.y + nz * out.z >= 0) fb.quad(a, b, c, d, ua, ub, uc, ud);
  else fb.quad(a, d, c, b, ua, ud, uc, ub);
}

function triOut(fb: FaceBuilder, a: Point3, b: Point3, c: Point3, out: Point3): void {
  const ux = b.x - a.x,
    uy = b.y - a.y,
    uz = b.z - a.z;
  const vx = c.x - a.x,
    vy = c.y - a.y,
    vz = c.z - a.z;
  const nx = uy * vz - uz * vy,
    ny = uz * vx - ux * vz,
    nz = ux * vy - uy * vx;
  const uv: [number, number][] = [
    [a.x * 0.55, a.y * 0.55],
    [b.x * 0.55, b.y * 0.55],
    [c.x * 0.55, c.y * 0.55],
  ];
  if (nx * out.x + ny * out.y + nz * out.z >= 0) fb.tri(a, b, c, uv[0]!, uv[1]!, uv[2]!);
  else fb.tri(a, c, b, uv[0]!, uv[2]!, uv[1]!);
}

/**
 * A roof on a wall top at y (the house's centre x, z, yaw `rot`), into the roof tile, timber and
 * plaster buckets. `wallTint` paints a gable's end triangles.
 */
export function addTiledRoof(
  b: Buckets,
  x: number,
  y: number,
  z: number,
  w: number,
  d: number,
  rot: number,
  tint: number,
  wallTint: number,
  kind: RoofKind,
  detail: 'lite' | 'full',
): void {
  const f: Frame = { x, y, z, c: Math.cos(rot), s: Math.sin(rot) };
  const tiles = new FaceBuilder();
  const edges = new FaceBuilder();
  const soffit = new FaceBuilder();
  const gables = new FaceBuilder();
  const e = -0.1;
  const drop = THICK / Math.cos(Math.atan(PITCH));
  const out = (lx: number, ly: number, lz: number): Point3 => ({
    x: lx * f.c + lz * f.s,
    y: ly,
    z: -lx * f.s + lz * f.c,
  });
  const fullRidge = kind === 'gable';
  // Hips run the ridge along the longer side; a gable's ridge always runs along the façade.
  const alongX = fullRidge || w >= d;
  const W = alongX ? w : d;
  const D = alongX ? d : w;
  const hd = D / 2 + EAVE;
  const hw = W / 2 + (fullRidge ? GABLE_OVERHANG : EAVE);
  const H = hd * PITCH;
  const ridgeHalf = fullRidge ? hw : Math.max(0, hw - hd);
  // Points in the roof's own frame (a along the ridge, b across it), turned onto the house.
  const P = (a: number, h: number, bb: number): Point3 => (alongX ? at(f, a, h, bb) : at(f, bb, h, a));
  const O = (a: number, h: number, bb: number): Point3 => (alongX ? out(a, h, bb) : out(bb, h, a));
  const slopeLen = hd / Math.cos(Math.atan(PITCH));
  for (const side of [-1, 1]) {
    // A long slope (a trapezoid, or a rectangle for a gable): eave corners, then ridge ends.
    const e0 = P(-hw, e, side * hd);
    const e1 = P(hw, e, side * hd);
    const r1 = P(ridgeHalf, e + H, 0);
    const r0 = P(-ridgeHalf, e + H, 0);
    const o = O(0, 1, side * PITCH);
    quadOut(
      tiles,
      e0,
      e1,
      r1,
      r0,
      o,
      [-hw * TILE, slopeLen * TILE],
      [hw * TILE, slopeLen * TILE],
      [ridgeHalf * TILE, 0],
      [-ridgeHalf * TILE, 0],
    );
    const below = (p: Point3): Point3 => ({ x: p.x, y: p.y - drop, z: p.z });
    quadOut(
      soffit,
      below(e0),
      below(e1),
      below(r1),
      below(r0),
      { x: -o.x, y: -1, z: -o.z },
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    );
    quadOut(
      edges,
      e0,
      e1,
      below(e1),
      below(e0),
      O(0, 0, side),
      [0, 0],
      [W * TILE, 0],
      [W * TILE, 0.08],
      [0, 0.08],
    );
    if (fullRidge) {
      // The gable's barge edges, then its end triangle (plastered, under the overhang).
      for (const end of [-1, 1]) {
        const top0 = P(end * hw, e, side * hd);
        const top1 = P(end * hw, e + H, 0);
        quadOut(
          edges,
          top0,
          top1,
          below(top1),
          below(top0),
          O(end, 0, 0),
          [0, 0],
          [slopeLen * TILE, 0],
          [slopeLen * TILE, 0.08],
          [0, 0.08],
        );
      }
    } else {
      // The hip's end: a triangle from this side's eave corners up to the ridge end.
      const end = side;
      const c0 = P(end * hw, e, -hd);
      const c1 = P(end * hw, e, hd);
      const tip = P(end * ridgeHalf, e + H, 0);
      const oe = O(end * PITCH, 1, 0);
      const fb = tiles;
      const len = (hw - ridgeHalf) / Math.cos(Math.atan(PITCH));
      const ua: [number, number] = [-hd * TILE, len * TILE];
      const ub: [number, number] = [hd * TILE, len * TILE];
      const uc: [number, number] = [0, 0];
      const ux = c1.x - c0.x,
        uy = c1.y - c0.y,
        uz = c1.z - c0.z;
      const vx = tip.x - c0.x,
        vy = tip.y - c0.y,
        vz = tip.z - c0.z;
      const nx = uy * vz - uz * vy,
        ny = uz * vx - ux * vz,
        nz = ux * vy - uy * vx;
      if (nx * oe.x + ny * oe.y + nz * oe.z >= 0) fb.tri(c0, c1, tip, ua, ub, uc);
      else fb.tri(c0, tip, c1, ua, uc, ub);
      triOut(soffit, below(c0), below(c1), below(tip), { x: -oe.x, y: -1, z: -oe.z });
      quadOut(
        edges,
        c0,
        c1,
        below(c1),
        below(c0),
        O(end, 0, 0),
        [0, 0],
        [D * TILE, 0],
        [D * TILE, 0.08],
        [0, 0.08],
      );
    }
  }
  if (fullRidge) {
    // The gable ends: plaster triangles in the wall's plane, up under the roof.
    const apex = e + H - drop - 0.02;
    for (const end of [-1, 1]) {
      triOut(
        gables,
        P(end * (W / 2), -0.03, -D / 2),
        P(end * (W / 2), -0.03, D / 2),
        P(end * (W / 2), apex, 0),
        O(end, 0, 0),
      );
    }
  }
  b.roofTile.push(tiles.build(tint));
  b.roofTile.push(edges.build(shade(tint, 0.72)));
  b.wood.push(soffit.build(0x5a3a24));
  if (!gables.empty) b.plaster.push(gables.build(wallTint));
  // The ridge (and on a hip, its four hips), capped with round tiles.
  const capColour = shade(tint, 0.82);
  const seg = detail === 'lite' ? 4 : 6;
  if (ridgeHalf > 0.05)
    addTube(
      b,
      'roofTile',
      0.12,
      P(-ridgeHalf - 0.05, e + H + 0.03, 0),
      P(ridgeHalf + 0.05, e + H + 0.03, 0),
      capColour,
      seg,
    );
  if (!fullRidge && detail === 'full') {
    for (const ea of [-1, 1])
      for (const eb of [-1, 1])
        addTube(
          b,
          'roofTile',
          0.09,
          P(ea * ridgeHalf, e + H + 0.03, 0),
          P(ea * hw, e + 0.03, eb * hd),
          capColour,
          4,
        );
  }
}
