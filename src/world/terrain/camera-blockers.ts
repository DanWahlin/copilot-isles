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
const xs: number[] = [];
const zs: number[] = [];
const ys: number[] = [];

/**
 * Fits camera blockers to a mesh's local `positions` placed by `matrix`: the mesh is cut into
 * `bands` slices of height and each slice gets the smallest of a few yawed boxes round its points,
 * so a round boulder is a stack of boxes, not one big one. Nothing under `minTop` (underwater) is kept.
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
  const step = (yMax - yMin) / bands;
  for (let b = 0; b < bands; b++) {
    const y0 = yMin + step * b,
      y1 = b === bands - 1 ? yMax : y0 + step;
    if (y1 < minTop) continue;
    const box = fitBand(y0 - 1e-4, y1 + 1e-4);
    if (box) out.push({ ...box, y0, y1 });
  }
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
