import type { Matrix4 } from 'three/webgpu';

/**
 * A box the follow camera keeps out of but walkers pass (a rock's or a cliff's rough shape). It has
 * the shape of the game's BoxCollider: `rot` is a yaw about +y, `y0`/`y1` the world heights it spans.
 */
export interface CameraBlockerBox {
  x: number;
  z: number;
  hx: number;
  hz: number;
  rot: number;
  y0: number;
  y1: number;
}

const FIT_ANGLES = 12;
/**
 * The tallest a slice may be. A tall rock's top slice used to reach out over the player at its foot
 * (its box is as wide as the slice's widest point), so the pivot sat in it and it was skipped.
 */
const MAX_BAND = 0.8;
const xs: number[] = [];
const zs: number[] = [];
const ys: number[] = [];

/**
 * Fits camera blockers to a mesh's local `positions` placed by `matrix`: the mesh is cut into
 * at least `bands` slices of height, none taller than MAX_BAND, and each slice gets the smallest of a
 * few yawed boxes round its points, so a round boulder is a stack of boxes, not one big one. Nothing
 * under `minTop` (underwater) is kept.
 */
export function meshCameraBlockers(
  positions: ArrayLike<number>,
  matrix: Matrix4,
  out: CameraBlockerBox[],
  bands = 3,
  minTop = -0.5,
): void {
  const e = matrix.elements;
  xs.length = 0;
  zs.length = 0;
  ys.length = 0;
  let yMin = Infinity,
    yMax = -Infinity;
  for (let i = 0; i + 2 < positions.length; i += 3) {
    const px = positions[i],
      py = positions[i + 1],
      pz = positions[i + 2];
    const x = e[0] * px + e[4] * py + e[8] * pz + e[12];
    const y = e[1] * px + e[5] * py + e[9] * pz + e[13];
    const z = e[2] * px + e[6] * py + e[10] * pz + e[14];
    xs.push(x);
    ys.push(y);
    zs.push(z);
    if (y < yMin) yMin = y;
    if (y > yMax) yMax = y;
  }
  if (!(yMax > minTop)) return;
  const count = Math.max(bands, Math.ceil((yMax - yMin) / MAX_BAND));
  const step = (yMax - yMin) / count;
  for (let b = 0; b < count; b++) {
    const y0 = yMin + step * b,
      y1 = b === count - 1 ? yMax : y0 + step;
    if (y1 < minTop) continue;
    const box = fitBand(y0 - 1e-4, y1 + 1e-4);
    if (box) out.push({ ...box, y0, y1 });
  }
}

const SURFACE_STRIP = 2;
const SURFACE_PADDING = 0.3;
/** How far a merged blocker may reach past the surface (beyond what the blockers above it cover anyway). */
const MERGE_SLACK = 0.6;
const CLIP_MAX = 16;

// Scratch for meshSurfaceCameraBlockers (grown as needed, never shrunk).
let us = new Float64Array(0);
let vs = new Float64Array(0);
let hs = new Float64Array(0);
/** Per (slice, strip) cell: the surface's u and v range in it, and (`reach*`) with every slice above it. */
let cellU0 = new Float64Array(0);
let cellU1 = new Float64Array(0);
let cellV0 = new Float64Array(0);
let cellV1 = new Float64Array(0);
let reachU0 = new Float64Array(0);
let reachU1 = new Float64Array(0);
let reachV0 = new Float64Array(0);
let reachV1 = new Float64Array(0);
let covered = new Uint8Array(0);
/** A triangle, clipped to a slice, then to a strip (and a clip's halfway buffer): (u, v, y) points. */
const triangle = new Float64Array(CLIP_MAX * 3);
const inSlice = new Float64Array(CLIP_MAX * 3);
const inCell = new Float64Array(CLIP_MAX * 3);
const clipTmp = new Float64Array(CLIP_MAX * 3);
/** The box being grown by `tryGrow`, in (u, v). */
const box = { u0: 0, u1: 0, v0: 0, v1: 0 };

function growScratch(vertices: number, cells: number): void {
  if (us.length < vertices) {
    us = new Float64Array(vertices);
    vs = new Float64Array(vertices);
    hs = new Float64Array(vertices);
  }
  if (cellU0.length < cells) {
    cellU0 = new Float64Array(cells);
    cellU1 = new Float64Array(cells);
    cellV0 = new Float64Array(cells);
    cellV1 = new Float64Array(cells);
    reachU0 = new Float64Array(cells);
    reachU1 = new Float64Array(cells);
    reachV0 = new Float64Array(cells);
    reachV1 = new Float64Array(cells);
    covered = new Uint8Array(cells);
  }
}

/**
 * Clips the polygon of `n` (u, v, y) points in `src` to `lo <= p[axis] <= hi` into `dst`; returns
 * its new point count.
 */
function clipSlab(
  src: Float64Array,
  n: number,
  axis: number,
  lo: number,
  hi: number,
  dst: Float64Array,
): number {
  return clipPlane(clipTmp, clipPlane(src, n, axis, lo, 1, clipTmp), axis, hi, -1, dst);
}

/** Keeps the part of the polygon with `sign * (p[axis] - at) >= 0`. */
function clipPlane(
  src: Float64Array,
  n: number,
  axis: number,
  at: number,
  sign: number,
  dst: Float64Array,
): number {
  let m = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const di = sign * (src[i * 3 + axis]! - at),
      dj = sign * (src[j * 3 + axis]! - at);
    if (di >= 0) {
      dst[m * 3] = src[i * 3]!;
      dst[m * 3 + 1] = src[i * 3 + 1]!;
      dst[m * 3 + 2] = src[i * 3 + 2]!;
      m++;
    }
    if (di >= 0 !== dj >= 0) {
      const f = di / (di - dj);
      for (let c = 0; c < 3; c++) dst[m * 3 + c] = src[i * 3 + c]! + (src[j * 3 + c]! - src[i * 3 + c]!) * f;
      dst[m * 3 + axis] = at;
      m++;
    }
  }
  return m;
}

/**
 * Fits stacked camera blockers to an indexed mesh's transformed triangles. The mesh is cut into at
 * least `bands` slices of height (none taller than MAX_BAND) and, along its long axis, into strips
 * SURFACE_STRIP wide; each triangle is clipped to every (slice, strip) cell it crosses, so a cell's
 * extent is the surface's exact one (between vertex rows too), and the empty corners of a rock's
 * bounding box stay out. Neighbouring cells whose extents are close (within MERGE_SLACK of what's
 * already covered there) share one box. Every box reaches down to `baseY` (the rock's terrain
 * contact), so a ground or water floor clamp can't lift the camera into it. Nothing under `minTop`
 * (underwater) is kept.
 */
export function meshSurfaceCameraBlockers(
  positions: ArrayLike<number>,
  indices: ArrayLike<number>,
  matrix: Matrix4,
  out: CameraBlockerBox[],
  bands = 3,
  minTop = -0.5,
  baseY = minTop,
): void {
  const e = matrix.elements;
  const vertexCount = Math.floor(positions.length / 3);
  growScratch(vertexCount, 0);
  xs.length = 0;
  zs.length = 0;
  let yMin = Infinity,
    yMax = -Infinity;
  for (let i = 0; i < vertexCount; i++) {
    const px = positions[i * 3]!,
      py = positions[i * 3 + 1]!,
      pz = positions[i * 3 + 2]!;
    const y = e[1] * px + e[5] * py + e[9] * pz + e[13];
    xs.push(e[0] * px + e[4] * py + e[8] * pz + e[12]);
    zs.push(e[2] * px + e[6] * py + e[10] * pz + e[14]);
    hs[i] = y;
    if (y < yMin) yMin = y;
    if (y > yMax) yMax = y;
  }
  if (!(yMax > minTop) || !(yMax > yMin)) return;

  // One yaw for the whole mesh: the smallest box round the vertices over the water.
  let bestArea = Infinity,
    rot = 0;
  for (let k = 0; k < FIT_ANGLES; k++) {
    const r = (k / FIT_ANGLES) * (Math.PI / 2);
    const c = Math.cos(r),
      s = Math.sin(r);
    let x0 = Infinity,
      x1 = -Infinity,
      z0 = Infinity,
      z1 = -Infinity;
    for (let i = 0; i < vertexCount; i++) {
      if (hs[i]! < minTop) continue;
      const lx = xs[i]! * c - zs[i]! * s,
        lz = xs[i]! * s + zs[i]! * c;
      if (lx < x0) x0 = lx;
      if (lx > x1) x1 = lx;
      if (lz < z0) z0 = lz;
      if (lz > z1) z1 = lz;
    }
    const area = (x1 - x0) * (z1 - z0);
    if (area < bestArea) {
      bestArea = area;
      rot = r;
    }
  }
  const c = Math.cos(rot),
    s = Math.sin(rot);
  // u runs along the long side (the strips cut across it), v across it.
  let lx0 = Infinity,
    lx1 = -Infinity,
    lz0 = Infinity,
    lz1 = -Infinity;
  for (let i = 0; i < vertexCount; i++) {
    const lx = xs[i]! * c - zs[i]! * s,
      lz = xs[i]! * s + zs[i]! * c;
    if (lx < lx0) lx0 = lx;
    if (lx > lx1) lx1 = lx;
    if (lz < lz0) lz0 = lz;
    if (lz > lz1) lz1 = lz;
  }
  const alongX = lx1 - lx0 >= lz1 - lz0;
  for (let i = 0; i < vertexCount; i++) {
    const lx = xs[i]! * c - zs[i]! * s,
      lz = xs[i]! * s + zs[i]! * c;
    us[i] = alongX ? lx : lz;
    vs[i] = alongX ? lz : lx;
  }
  const u0 = alongX ? lx0 : lz0,
    u1 = alongX ? lx1 : lz1;
  const strips = Math.max(1, Math.ceil((u1 - u0) / SURFACE_STRIP));
  const stripWidth = (u1 - u0) / strips;
  const count = Math.max(bands, Math.ceil((yMax - yMin) / MAX_BAND));
  const step = (yMax - yMin) / count;
  const bandTop = (band: number) => (band === count - 1 ? yMax : yMin + step * (band + 1));
  const cells = count * strips;
  growScratch(vertexCount, cells);
  cellU0.fill(Infinity, 0, cells);
  cellU1.fill(-Infinity, 0, cells);
  cellV0.fill(Infinity, 0, cells);
  cellV1.fill(-Infinity, 0, cells);
  covered.fill(0, 0, cells);

  // Each triangle, clipped to each slice of height it crosses, then to each strip.
  for (let t = 0; t + 2 < indices.length; t += 3) {
    let tyMin = Infinity,
      tyMax = -Infinity;
    for (let k = 0; k < 3; k++) {
      const vi = indices[t + k]!;
      triangle[k * 3] = us[vi]!;
      triangle[k * 3 + 1] = vs[vi]!;
      triangle[k * 3 + 2] = hs[vi]!;
      tyMin = Math.min(tyMin, hs[vi]!);
      tyMax = Math.max(tyMax, hs[vi]!);
    }
    if (tyMax < minTop) continue;
    const bLo = Math.min(count - 1, Math.max(0, Math.floor((tyMin - yMin) / step)));
    const bHi = Math.min(count - 1, Math.max(0, Math.floor((tyMax - yMin) / step)));
    for (let band = bLo; band <= bHi; band++) {
      const y0 = yMin + step * band,
        y1 = bandTop(band);
      if (y1 < minTop) continue;
      const n = clipSlab(triangle, 3, 2, y0, y1, inSlice);
      if (n === 0) continue;
      let pu0 = Infinity,
        pu1 = -Infinity;
      for (let k = 0; k < n; k++) {
        pu0 = Math.min(pu0, inSlice[k * 3]!);
        pu1 = Math.max(pu1, inSlice[k * 3]!);
      }
      const sLo = Math.min(strips - 1, Math.max(0, Math.floor((pu0 - u0) / stripWidth)));
      const sHi = Math.min(strips - 1, Math.max(0, Math.floor((pu1 - u0) / stripWidth)));
      for (let strip = sLo; strip <= sHi; strip++) {
        const a = u0 + stripWidth * strip,
          b = strip === strips - 1 ? u1 : a + stripWidth;
        const poly = sLo === sHi ? inSlice : inCell;
        const m = sLo === sHi ? n : clipSlab(inSlice, n, 0, a, b, inCell);
        const cell = band * strips + strip;
        for (let k = 0; k < m; k++) {
          const pu = poly[k * 3]!,
            pv = poly[k * 3 + 1]!;
          if (pu < cellU0[cell]!) cellU0[cell] = pu;
          if (pu > cellU1[cell]!) cellU1[cell] = pu;
          if (pv < cellV0[cell]!) cellV0[cell] = pv;
          if (pv > cellV1[cell]!) cellV1[cell] = pv;
        }
      }
    }
  }

  // What the blockers of a strip's cell and every cell above it cover anyway (each reaches down).
  for (let strip = 0; strip < strips; strip++) {
    let a0 = Infinity,
      a1 = -Infinity,
      b0 = Infinity,
      b1 = -Infinity;
    for (let band = count - 1; band >= 0; band--) {
      const cell = band * strips + strip;
      a0 = Math.min(a0, cellU0[cell]!);
      a1 = Math.max(a1, cellU1[cell]!);
      b0 = Math.min(b0, cellV0[cell]!);
      b1 = Math.max(b1, cellV1[cell]!);
      reachU0[cell] = a0;
      reachU1[cell] = a1;
      reachV0[cell] = b0;
      reachV1[cell] = b1;
    }
  }

  // Greedy rectangles of cells, from the top slice down: grow along the strips, then down the slices,
  // while the box stays within MERGE_SLACK of every cell's reach.
  for (let top = count - 1; top >= 0; top--)
    for (let strip = 0; strip < strips; strip++) {
      const first = top * strips + strip;
      if (covered[first] || !(cellV1[first]! >= cellV0[first]!)) continue;
      box.u0 = reachU0[first]!;
      box.u1 = reachU1[first]!;
      box.v0 = reachV0[first]!;
      box.v1 = reachV1[first]!;
      let s1 = strip;
      while (s1 + 1 < strips && tryGrow(top, top, strip, s1 + 1, s1 + 1, u0, stripWidth, strips)) s1++;
      let bottom = top;
      while (bottom > 0 && tryGrow(bottom - 1, top, strip, s1, s1, u0, stripWidth, strips, true)) bottom--;
      const y0 = Math.min(yMin + step * bottom, baseY);
      // Every cell at or under the top slice that this box holds needs no box of its own.
      for (let band = top; band >= 0; band--) {
        if (yMin + step * band < y0) break;
        for (let k = strip; k <= s1; k++) {
          const cell = band * strips + k;
          if (
            cellU0[cell]! >= box.u0 - 1e-6 &&
            cellU1[cell]! <= box.u1 + 1e-6 &&
            cellV0[cell]! >= box.v0 - 1e-6 &&
            cellV1[cell]! <= box.v1 + 1e-6
          )
            covered[cell] = 1;
        }
      }
      const cu = (box.u0 + box.u1) * 0.5,
        cv = (box.v0 + box.v1) * 0.5;
      const lx = alongX ? cu : cv,
        lz = alongX ? cv : cu;
      const hu = (box.u1 - box.u0) * 0.5 + 0.05,
        hv = (box.v1 - box.v0) * 0.5 + SURFACE_PADDING;
      out.push({
        x: lx * c + lz * s,
        z: -lx * s + lz * c,
        hx: alongX ? hu : hv,
        hz: alongX ? hv : hu,
        rot,
        y0,
        y1: bandTop(top),
      });
    }
}

/**
 * Grows `box` to take in the cells of slices `bandLo`..`bandHi` and strips `s0`..`s1` (with the
 * cells it already has, `all`: every strip of `box` in slice `bandLo`), if no cell then gets more
 * than MERGE_SLACK beyond its reach.
 */
function tryGrow(
  bandLo: number,
  bandHi: number,
  s0: number,
  s1: number,
  sNew: number,
  u0: number,
  stripWidth: number,
  strips: number,
  all = false,
): boolean {
  let g0 = box.u0,
    g1 = box.u1,
    h0 = box.v0,
    h1 = box.v1;
  const from = all ? s0 : sNew;
  for (let k = from; k <= s1; k++) {
    const cell = bandLo * strips + k;
    if (!(reachV1[cell]! >= reachV0[cell]!)) return false;
    g0 = Math.min(g0, reachU0[cell]!);
    g1 = Math.max(g1, reachU1[cell]!);
    h0 = Math.min(h0, reachV0[cell]!);
    h1 = Math.max(h1, reachV1[cell]!);
  }
  // The grown box must stay within MERGE_SLACK of the reach of every cell it would hold.
  for (let band = bandLo; band <= bandHi; band++)
    for (let k = s0; k <= s1; k++) {
      const cell = band * strips + k;
      const a = u0 + stripWidth * k,
        b = a + stripWidth;
      if (Math.max(g0, a) < reachU0[cell]! - MERGE_SLACK || Math.min(g1, b) > reachU1[cell]! + MERGE_SLACK)
        return false;
      if (h0 < reachV0[cell]! - MERGE_SLACK || h1 > reachV1[cell]! + MERGE_SLACK) return false;
    }
  box.u0 = g0;
  box.u1 = g1;
  box.v0 = h0;
  box.v1 = h1;
  return true;
}

/** The smallest-area yawed box round the points with y in [y0, y1]. */
function fitBand(y0: number, y1: number): Omit<CameraBlockerBox, 'y0' | 'y1'> | null {
  let best: Omit<CameraBlockerBox, 'y0' | 'y1'> | null = null;
  let bestArea = Infinity;
  for (let k = 0; k < FIT_ANGLES; k++) {
    const rot = (k / FIT_ANGLES) * (Math.PI / 2);
    const c = Math.cos(rot),
      s = Math.sin(rot);
    let x0 = Infinity,
      x1 = -Infinity,
      z0 = Infinity,
      z1 = -Infinity;
    for (let i = 0; i < ys.length; i++) {
      if (ys[i] < y0 || ys[i] > y1) continue;
      // The collision world's toLocal: lx = x cos − z sin, lz = x sin + z cos.
      const lx = xs[i] * c - zs[i] * s,
        lz = xs[i] * s + zs[i] * c;
      if (lx < x0) x0 = lx;
      if (lx > x1) x1 = lx;
      if (lz < z0) z0 = lz;
      if (lz > z1) z1 = lz;
    }
    if (x1 < x0) return null;
    const area = (x1 - x0) * (z1 - z0);
    if (area >= bestArea) continue;
    bestArea = area;
    const cx = (x0 + x1) * 0.5,
      cz = (z0 + z1) * 0.5;
    best = { x: cx * c + cz * s, z: -cx * s + cz * c, hx: (x1 - x0) * 0.5, hz: (z1 - z0) * 0.5, rot };
  }
  return best;
}
