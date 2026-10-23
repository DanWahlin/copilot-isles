import { Color, Matrix4, SRGBColorSpace, Vector3, type BufferGeometry, type Material } from 'three/webgpu';
import { pieceBounds, type PiecePlacement } from './house-builder';
import type { MaterialKey, VillageKit } from './kit';

/** A flat coloured face in world space; the normal points away from `inside`. */
export interface FacadeFace {
  pts: [number, number, number][];
  color: number;
  inside: [number, number, number];
}

/**
 * The kit's base-colour textures (its palettes) as small CPU copies, to sample what the real
 * buildings are painted with.
 */
export interface KitTexels {
  /** The material's colour at (u, v) (glTF uv, wrapping), linear, into `out`. */
  sample(key: MaterialKey, u: number, v: number, out: Color): Color;
}

interface Drawable {
  width: number;
  height: number;
}

/** Reads each kit material's map once (drawn down to `size`²); a material without one is its colour. */
export function readKitTexels(kit: VillageKit, size = 256): KitTexels {
  const maps = new Map<MaterialKey, { data: Uint8ClampedArray; size: number; colour: Color }>();
  for (const [key, material] of Object.entries(kit.materials) as [MaterialKey, Material][]) {
    // The kit's maps are palettes (flat swatches), moved to `paletteMap` (`palettedMaterial`).
    const m = material as Material & {
      color?: Color;
      map?: { image?: unknown } | null;
      paletteMap?: { image?: unknown } | null;
    };
    const colour = m.color ? m.color.clone() : new Color(1, 1, 1);
    const image = (m.map ?? m.paletteMap)?.image as Drawable | undefined;
    let data: Uint8ClampedArray | null = null;
    if (image && image.width > 0 && typeof OffscreenCanvas !== 'undefined') {
      try {
        const canvas = new OffscreenCanvas(size, size);
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx?.drawImage(image as CanvasImageSource, 0, 0, size, size);
        data = ctx ? ctx.getImageData(0, 0, size, size).data : null;
      } catch {
        data = null;
      }
    }
    maps.set(key, { data: data ?? new Uint8ClampedArray(0), size, colour });
  }
  const texel = new Color();
  return {
    sample(key, u, v, out) {
      const m = maps.get(key);
      if (!m) return out.setRGB(1, 1, 1);
      if (!m.data.length) return out.copy(m.colour);
      const x = Math.min(m.size - 1, Math.floor((u - Math.floor(u)) * m.size));
      const y = Math.min(m.size - 1, Math.floor((v - Math.floor(v)) * m.size));
      const i = (y * m.size + x) * 4;
      texel.setRGB(m.data[i]! / 255, m.data[i + 1]! / 255, m.data[i + 2]! / 255, SRGBColorSpace);
      return out.copy(texel).multiply(m.colour);
    },
  };
}

/** Wall cells across (wall-local x) and up (y): the middle cell is where windows and doors are. */
const COLS = [-1, -0.7, 0.7, 1] as const;
const ROWS_UP = [1.0, 2.6] as const;
/** A cell nothing covers is a hole in the wall (an opening): dark room inside. */
const OPENING = new Color(0.02, 0.018, 0.016);
/** How far apart (m) a triangle's parts are visited (`eachTriangle`), and the most per edge. */
const SAMPLE_SPACING = 0.08;
const MAX_SPLIT = 48;
/** A roof's or gable's mean colour needs far fewer. */
const MEAN_SPACING = 0.6;
/** A wall's own little depth buffer (m per texel): only what's in front shows. */
const TEXEL = 0.1;
/** The paint's per-vertex variation averages about this (kit.ts `paint`). */
const PAINT_MEAN = 0.98;

const tmpM = new Matrix4();
const tmpInv = new Matrix4();
const a = new Vector3();
const b = new Vector3();
const c = new Vector3();
const n = new Vector3();
const e1 = new Vector3();
const e2 = new Vector3();
const col = new Color();
const paintC = new Color();

/**
 * Walks every triangle of `placements`' kit parts in the frame `frame` (its inverse is applied after
 * each placement's matrix), calling `visit` for each of its equal parts (about SAMPLE_SPACING apart) with that part's middle, the triangle's normal
 * (unit), the part's area and its colour (the texture there × material colour × the vertex paint).
 */
function eachTriangle(
  kit: VillageKit,
  texels: KitTexels,
  placements: readonly PiecePlacement[],
  frame: Matrix4,
  paint: (key: MaterialKey, tint?: number) => number,
  visit: (cx: number, cy: number, cz: number, normal: Vector3, area: number, colour: Color) => void,
  spacing = SAMPLE_SPACING,
): void {
  tmpInv.copy(frame).invert();
  for (const p of placements) {
    const parts = kit.pieces.get(p.piece);
    if (!parts) continue;
    tmpM.multiplyMatrices(tmpInv, p.matrix);
    for (const part of parts) {
      const g: BufferGeometry = part.geometry;
      const pos = g.getAttribute('position');
      const uv = g.getAttribute('uv');
      const index = g.getIndex();
      const count = index ? index.count : pos.count;
      paintC.set(paint(part.materialKey, p.tint)).multiplyScalar(PAINT_MEAN);
      for (let t = 0; t + 2 < count; t += 3) {
        const i0 = index ? index.getX(t) : t;
        const i1 = index ? index.getX(t + 1) : t + 1;
        const i2 = index ? index.getX(t + 2) : t + 2;
        a.fromBufferAttribute(pos, i0).applyMatrix4(tmpM);
        b.fromBufferAttribute(pos, i1).applyMatrix4(tmpM);
        c.fromBufferAttribute(pos, i2).applyMatrix4(tmpM);
        n.crossVectors(e1.subVectors(b, a), e2.subVectors(c, a));
        const area = n.length() / 2;
        if (area < 1e-6) continue;
        n.divideScalar(area * 2);
        // The triangle in split² equal parts (a barycentric grid about SAMPLE_SPACING apart), each
        // visited at its middle with its own texel, so a big face spreads over every cell it covers.
        const edge = Math.max(e1.length(), e2.length(), a.distanceTo(c), b.distanceTo(c));
        const split = Math.min(MAX_SPLIT, Math.max(1, Math.ceil(edge / spacing)));
        const k = area / (split * split);
        for (let i = 0; i < split; i++)
          for (let j = 0; i + j < split; j++)
            for (let up = 0; up < (i + j < split - 1 ? 2 : 1); up++) {
              const wb = (i + (up ? 2 : 1) / 3) / split;
              const wc = (j + (up ? 2 : 1) / 3) / split;
              const wa = 1 - wb - wc;
              if (uv)
                texels.sample(
                  part.materialKey,
                  wa * uv.getX(i0) + wb * uv.getX(i1) + wc * uv.getX(i2),
                  wa * uv.getY(i0) + wb * uv.getY(i1) + wc * uv.getY(i2),
                  col,
                );
              else texels.sample(part.materialKey, 0.5, 0.5, col);
              col.multiply(paintC);
              visit(
                wa * a.x + wb * b.x + wc * c.x,
                wa * a.y + wb * b.y + wc * c.y,
                wa * a.z + wb * b.z + wc * c.z,
                n,
                k,
                col,
              );
            }
      }
    }
  }
}

/** Which way a placement's local +z faces: +1 away from `origin`, −1 toward it. */
function outwardSign(p: PiecePlacement, origin: { x: number; z: number }): 1 | -1 {
  a.set(0, 0, 0).applyMatrix4(p.matrix);
  b.set(0, 0, 1).applyMatrix4(p.matrix);
  const dot = (b.x - a.x) * (a.x - origin.x) + (b.z - a.z) * (a.z - origin.z);
  return dot >= 0 ? 1 : -1;
}

const world = (m: Matrix4, x: number, y: number, z: number): [number, number, number] => {
  a.set(x, y, z).applyMatrix4(m);
  return [a.x, a.y, a.z];
};

/**
 * A kit house as coloured faces, for a cheap stand-in (the harbour mirror's): each wall segment's
 * outer face in 3 × 3 cells (the middle one where its window or door is), each the mean colour of
 * the frontmost real parts facing out there (the wall, its window, frame, shutters and door; a small
 * depth buffer per wall), sampled from the kit's own textures and paint; a hole nothing covers is
 * the dark room behind.
 * Roofs are their two slopes (or a tower's four) in the roof's colour, and the gable ends in theirs.
 * Small parts (dormers, chimneys, balconies, stairs, vines) are left out.
 */
export function houseFaces(
  kit: VillageKit,
  texels: KitTexels,
  placements: readonly PiecePlacement[],
  origin: { x: number; y: number; z: number },
  paint: (key: MaterialKey, tint?: number) => number,
  cache = new Map<string, number[]>(),
): FacadeFace[] {
  const steps = houseFaceSteps(kit, texels, placements, origin, paint, cache);
  let r = steps.next();
  while (!r.done) r = steps.next();
  return r.value;
}

/** `houseFaces` a wall at a time: it yields after each wall it had to work out. */
export function* houseFaceSteps(
  kit: VillageKit,
  texels: KitTexels,
  placements: readonly PiecePlacement[],
  origin: { x: number; y: number; z: number },
  paint: (key: MaterialKey, tint?: number) => number,
  /** Wall cells already worked out (share one across a town's houses). */
  cache = new Map<string, number[]>(),
): Generator<void, FacadeFace[], void> {
  const out: FacadeFace[] = [];
  const midY = origin.y + 3;
  const sum = Array.from({ length: 9 }, () => ({ r: 0, g: 0, b: 0, w: 0 }));
  for (const wall of placements) {
    if (wall.role !== 'wall') continue;
    const bounds = pieceBounds(wall.piece);
    const sign = outwardSign(wall, origin);
    const faceZ = sign > 0 ? bounds[5] : bounds[2];
    const rows = [bounds[1], ROWS_UP[0], ROWS_UP[1], bounds[4]];
    const attached = placements.filter(
      (p) =>
        p === wall ||
        (p.side === wall.side &&
          p.storey === wall.storey &&
          p.segment === wall.segment &&
          (p.role === 'window' || p.role === 'shutters' || p.role === 'door' || p.role === 'doorframe')),
    );
    // Walls alike (the same piece, tint and face, with the same parts at the same offsets) come out
    // alike: work each out once.
    tmpInv.copy(wall.matrix).invert();
    let key = `${wall.piece}|${wall.tint ?? ''}|${sign}`;
    for (const p of attached)
      if (p !== wall) {
        tmpM.multiplyMatrices(tmpInv, p.matrix);
        key += `|${p.piece}:${p.tint ?? ''}:${tmpM.elements.map((e) => e.toFixed(2)).join(',')}`;
      }
    let cells = cache.get(key);
    if (!cells) {
      // Each texel of the wall's face keeps the colour of the frontmost part over it (the plaster
      // behind a window doesn't show), and a texel nothing covers is an opening.
      const tx = Math.ceil((bounds[3] - bounds[0]) / TEXEL);
      const ty = Math.ceil((bounds[4] - bounds[1]) / TEXEL);
      const depth = new Float32Array(tx * ty).fill(-Infinity);
      const rgb = new Float32Array(tx * ty * 3);
      eachTriangle(kit, texels, attached, wall.matrix, paint, (x, y, zz, normal, _area, colour) => {
        if (normal.z * sign < 0.3) return;
        const ix = Math.floor((x - bounds[0]) / TEXEL);
        const iy = Math.floor((y - bounds[1]) / TEXEL);
        if (ix < 0 || iy < 0 || ix >= tx || iy >= ty) return;
        const t = iy * tx + ix;
        if (zz * sign <= depth[t]!) return;
        depth[t] = zz * sign;
        rgb[t * 3] = colour.r;
        rgb[t * 3 + 1] = colour.g;
        rgb[t * 3 + 2] = colour.b;
      });
      for (const s of sum) s.r = s.g = s.b = s.w = 0;
      for (let iy = 0; iy < ty; iy++)
        for (let ix = 0; ix < tx; ix++) {
          const x = bounds[0] + (ix + 0.5) * TEXEL;
          const y = bounds[1] + (iy + 0.5) * TEXEL;
          const ci = x < COLS[1] ? 0 : x < COLS[2] ? 1 : 2;
          const ri = y < rows[1]! ? 0 : y < rows[2]! ? 1 : 2;
          const s = sum[ri * 3 + ci]!;
          const t = iy * tx + ix;
          const covered = depth[t]! > -Infinity;
          s.r += covered ? rgb[t * 3]! : OPENING.r;
          s.g += covered ? rgb[t * 3 + 1]! : OPENING.g;
          s.b += covered ? rgb[t * 3 + 2]! : OPENING.b;
          s.w += 1;
        }
      cells = sum.map((s) =>
        s.w > 0 ? col.setRGB(s.r / s.w, s.g / s.w, s.b / s.w).getHex() : OPENING.getHex(),
      );
      cache.set(key, cells);
      yield;
    }
    const z = faceZ + sign * 0.03;
    const inside = world(wall.matrix, 0, 1.5, faceZ - sign);
    for (let ri = 0; ri < 3; ri++)
      for (let ci = 0; ci < 3; ci++) {
        const x0 = COLS[ci]!,
          x1 = COLS[ci + 1]!,
          y0 = rows[ri]!,
          y1 = rows[ri + 1]!;
        out.push({
          pts: [
            world(wall.matrix, x0, y0, z),
            world(wall.matrix, x1, y0, z),
            world(wall.matrix, x1, y1, z),
            world(wall.matrix, x0, y1, z),
          ],
          color: cells[ri * 3 + ci]!,
          inside,
        });
      }
  }
  // Roofs and gable ends: the mean colour of what faces up (roofs) or out (gables).
  const mean = (p: PiecePlacement, keep: (normal: Vector3) => number): number => {
    let r = 0,
      g = 0,
      bl = 0,
      w = 0;
    eachTriangle(
      kit,
      texels,
      [p],
      p.matrix,
      paint,
      (_x, _y, _z, normal, area, colour) => {
        const k = keep(normal) * area;
        if (k <= 0) return;
        r += colour.r * k;
        g += colour.g * k;
        bl += colour.b * k;
        w += k;
      },
      MEAN_SPACING,
    );
    return w > 0 ? col.setRGB(r / w, g / w, bl / w).getHex() : 0x6a3a2c;
  };
  const centre: [number, number, number] = [origin.x, midY, origin.z];
  for (const p of placements) {
    const [x0, y0, z0, x1, y1, z1] = pieceBounds(p.piece);
    if (p.role === 'roof') {
      // Up is up in the roof's frame (it only turns about y).
      const colour = mean(p, (normal) => normal.y - 0.3);
      const cx = (x0 + x1) / 2;
      if (p.piece.includes('Tower')) {
        const cz = (z0 + z1) / 2;
        const apex = world(p.matrix, cx, y1, cz);
        const base = [
          world(p.matrix, x0, y0, z0),
          world(p.matrix, x1, y0, z0),
          world(p.matrix, x1, y0, z1),
          world(p.matrix, x0, y0, z1),
        ];
        for (let k = 0; k < 4; k++)
          out.push({ pts: [base[k]!, base[(k + 1) % 4]!, apex], color: colour, inside: centre });
      } else {
        // The ridge runs along the roof's z (its gable ends face front and back).
        const ridge0 = world(p.matrix, cx, y1, z0);
        const ridge1 = world(p.matrix, cx, y1, z1);
        out.push(
          {
            pts: [world(p.matrix, x0, y0, z0), ridge0, ridge1, world(p.matrix, x0, y0, z1)],
            color: colour,
            inside: centre,
          },
          {
            pts: [world(p.matrix, x1, y0, z0), world(p.matrix, x1, y0, z1), ridge1, ridge0],
            color: colour,
            inside: centre,
          },
        );
      }
    } else if (p.role === 'gable') {
      const sign = outwardSign(p, origin);
      const z = (sign > 0 ? z1 : z0) + sign * 0.02;
      const colour = mean(p, (normal) => normal.z * sign - 0.3);
      out.push({
        pts: [world(p.matrix, x0, y0, z), world(p.matrix, x1, y0, z), world(p.matrix, (x0 + x1) / 2, y1, z)],
        color: colour,
        inside: centre,
      });
    }
  }
  return out;
}
