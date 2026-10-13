import { BufferAttribute, BufferGeometry, type Node } from 'three/webgpu';
import { float, min } from 'three/tsl';
import {
  ambientOpenSky,
  extractShoreline,
  normalFromGrid,
  rimFlag,
  sunVisibility,
  SUNS,
  type ShorelineChain,
  type TerrainBakeData,
} from '../world/terrain/bake';
import type { HeightField } from '../world/contracts';
import { worldToPaper, type ChartIslandSource } from './chart-map';

/**
 * A real island sampled for its chart miniature: heights and terrain masks from the island's own
 * functions, and the same bake the island's terrain gets (grid normals, open-sky AO, the morning and
 * golden-hour suns, skyline rim), only coarser. The miniature then wears the island's own terrain
 * material, so it reads as the real place, small.
 */
export interface IslandGrid {
  src: ChartIslandSource;
  nx: number;
  nz: number;
  cell: number;
  heights: Float32Array;
  /** Per vertex: world normal (3). */
  normals: Float32Array;
  /** Per vertex: sand, grass, rock, cliff (4, 0-1). */
  masks: Float32Array;
  /** Per vertex: AO, morning sun, golden sun, rim (4, 0-1), as the terrain's `terrainLight`. */
  light: Float32Array;
}

/** Chart sample spacing as a fraction of the island's base cell, by tier (finer where it's affordable). */
export const CHART_CELL_SCALE = { lite: 1, low: 0.7, medium: 0.55, high: 0.45, ultra: 0.4 } as const;
/** Without the baked pack, the island's functions are sampled this coarsely (they're slow). */
export const FALLBACK_CELL_SCALE = 1.2;

/**
 * Samples the island a row per step (heights and masks, then the bake), so the caller can spread the
 * work over frames.
 */
export function* sampleIslandGrid(src: ChartIslandSource, cellScale = 1): Generator<void, IslandGrid, void> {
  const cell = src.cell * cellScale;
  const nx = Math.floor((src.maxX - src.minX) / cell) + 1;
  const nz = Math.floor((src.maxZ - src.minZ) / cell) + 1;
  const count = nx * nz;
  const heights = new Float32Array(count);
  const normals = new Float32Array(count * 3);
  const masks = new Float32Array(count * 4);
  const light = new Float32Array(count * 4);
  for (let iz = 0; iz < nz; iz++) {
    const z = src.minZ + iz * cell;
    for (let ix = 0; ix < nx; ix++) {
      const x = src.minX + ix * cell;
      const i = iz * nx + ix;
      heights[i] = src.height(x, z);
      const m = src.masks(x, z);
      masks[i * 4] = m.sand;
      masks[i * 4 + 1] = m.grass;
      masks[i * 4 + 2] = m.rock;
      masks[i * 4 + 3] = m.cliff;
    }
    yield;
  }
  const { minX, minZ } = src;
  for (let iz = 0; iz < nz; iz++) {
    const z = minZ + iz * cell;
    for (let ix = 0; ix < nx; ix++) {
      const x = minX + ix * cell;
      const i = iz * nx + ix;
      const h = heights[i]!;
      normalFromGrid(heights, nx, nz, minX, minZ, cell, ix, iz, normals, i * 3);
      light[i * 4] = ambientOpenSky(heights, nx, nz, minX, minZ, cell, x, z, h);
      light[i * 4 + 1] = sunVisibility(heights, nx, nz, minX, minZ, cell, x, z, h, SUNS[0]);
      light[i * 4 + 2] = sunVisibility(heights, nx, nz, minX, minZ, cell, x, z, h, SUNS[1]);
      light[i * 4 + 3] = rimFlag(heights, normals, nx, nz, minX, minZ, cell, ix, iz);
    }
    yield;
  }
  return { src, nx, nz, cell, heights, normals, masks, light };
}

/**
 * The same grid, resampled from the island's own baked terrain pack (what the game builds its
 * terrain from): exact heights, normals, masks and light, for a few milliseconds of work. Points
 * outside the pack's box are open sea (the island's height function, sand, full light).
 */
export function* resampleIslandGrid(
  src: ChartIslandSource,
  data: TerrainBakeData,
  cellScale = 1,
): Generator<void, IslandGrid, void> {
  const cell = src.cell * cellScale;
  const nx = Math.floor((src.maxX - src.minX) / cell) + 1;
  const nz = Math.floor((src.maxZ - src.minZ) / cell) + 1;
  const count = nx * nz;
  const heights = new Float32Array(count);
  const normals = new Float32Array(count * 3);
  const masks = new Float32Array(count * 4);
  const light = new Float32Array(count * 4);
  const outside: number[] = [];
  const raised: number[] = [];
  for (let iz = 0; iz < nz; iz++) {
    const z = src.minZ + iz * cell;
    for (let ix = 0; ix < nx; ix++) {
      const x = src.minX + ix * cell;
      const i = iz * nx + ix;
      const gx = (x - data.minX) / data.cell;
      const gz = (z - data.minZ) / data.cell;
      if (gx < 0 || gz < 0 || gx > data.nx - 1 || gz > data.nz - 1) {
        // Past the pack's edge: the island's own functions, baked below once the heights are in.
        heights[i] = src.height(x, z);
        outside.push(i);
        continue;
      }
      const ix0 = Math.min(data.nx - 2, Math.floor(gx));
      const iz0 = Math.min(data.nz - 2, Math.floor(gz));
      const tx = gx - ix0;
      const tz = gz - iz0;
      const i00 = iz0 * data.nx + ix0;
      const i10 = i00 + 1;
      const i01 = i00 + data.nx;
      const i11 = i01 + 1;
      const w00 = (1 - tx) * (1 - tz);
      const w10 = tx * (1 - tz);
      const w01 = (1 - tx) * tz;
      const w11 = tx * tz;
      const f = (v: ArrayLike<number>, c = 0, n = 1): number =>
        v[i00 * n + c]! * w00 + v[i10 * n + c]! * w10 + v[i01 * n + c]! * w01 + v[i11 * n + c]! * w11;
      heights[i] = f(data.heights);
      const lift = src.relief?.(x, z) ?? 0;
      if (lift > 0) {
        heights[i] += lift;
        raised.push(i);
      }
      const ax = f(data.normals, 0, 3);
      const ay = f(data.normals, 1, 3);
      const az = f(data.normals, 2, 3);
      const len = Math.hypot(ax, ay, az) || 1;
      normals[i * 3] = ax / len;
      normals[i * 3 + 1] = ay / len;
      normals[i * 3 + 2] = az / len;
      for (let c = 0; c < 4; c++) masks[i * 4 + c] = f(data.masks, c, 4) / 255;
      light[i * 4] = f(data.ao) / 255;
      light[i * 4 + 1] = f(data.sunMorning) / 255;
      light[i * 4 + 2] = f(data.sunGolden) / 255;
      light[i * 4 + 3] = f(data.rim) / 255;
    }
    if ((iz & 7) === 7) yield;
  }
  // A landmark the terrain doesn't hold (Thousand-Bough's banyan): its own normals, green and lit.
  for (const i of raised) {
    const ix = i % nx;
    normalFromGrid(heights, nx, nz, src.minX, src.minZ, cell, ix, (i - ix) / nx, normals, i * 3);
    masks.fill(0, i * 4, i * 4 + 4);
    masks[i * 4 + 1] = 1;
    light[i * 4] = Math.max(light[i * 4]!, 0.85);
  }
  // Ground past the pack's edge (Port Meridian's mountain runs on past its terrain's box) gets the
  // same bake as `sampleIslandGrid`, so there's no seam where the two meet.
  for (let k = 0; k < outside.length; k++) {
    const i = outside[k]!;
    const ix = i % nx;
    const iz = (i - ix) / nx;
    const x = src.minX + ix * cell;
    const z = src.minZ + iz * cell;
    const h = heights[i]!;
    normalFromGrid(heights, nx, nz, src.minX, src.minZ, cell, ix, iz, normals, i * 3);
    if (h < -1.5) {
      masks[i * 4] = 1;
      light.fill(1, i * 4, i * 4 + 3);
      continue;
    }
    const m = src.masks(x, z);
    masks[i * 4] = m.sand;
    masks[i * 4 + 1] = m.grass;
    masks[i * 4 + 2] = m.rock;
    masks[i * 4 + 3] = m.cliff;
    light[i * 4] = ambientOpenSky(heights, nx, nz, src.minX, src.minZ, cell, x, z, h);
    light[i * 4 + 1] = sunVisibility(heights, nx, nz, src.minX, src.minZ, cell, x, z, h, SUNS[0]);
    light[i * 4 + 2] = sunVisibility(heights, nx, nz, src.minX, src.minZ, cell, x, z, h, SUNS[1]);
    light[i * 4 + 3] = rimFlag(heights, normals, nx, nz, src.minX, src.minZ, cell, ix, iz);
    if ((k & 255) === 255) yield;
  }
  return { src, nx, nz, cell, heights, normals, masks, light };
}

/**
 * Runs a sliced job `budget.ms` milliseconds per frame until it returns. Raise `budget.ms` (to
 * Infinity) to finish it on the next frame (e.g. under a veil, where frame rate doesn't matter).
 */
export function runSliced<T>(job: Generator<void, T, void>, budget: { ms: number } = { ms: 3 }): Promise<T> {
  return new Promise((resolve) => {
    const step = () => {
      const end = performance.now() + budget.ms;
      for (;;) {
        const r = job.next();
        if (r.done) return resolve(r.value);
        if (performance.now() > end) break;
      }
      requestAnimationFrame(step);
    };
    step();
  });
}

export function islandShoreline(grid: IslandGrid): ShorelineChain[] {
  const { src, nx, nz, heights, cell } = grid;
  return extractShoreline(heights, nx, nz, src.minX, src.minZ, cell);
}

/** Below this the miniature tucks under the paper (the chart's own water shows there). */
const SEA_FLOOR = -1.2;
/**
 * How far below the paper's face a miniature folded flat by its pop-up sinks (paper metres). The sheet
 * is 1.6 mm thick, so a flat island or rock hides under it instead of z-fighting with the ink.
 */
export const PAPER_TUCK = 0.003;

/**
 * A miniature's height on the chart as it pops up (`x`: 0 flat → 1 standing): it stands with a little
 * overshoot like a card unfolding, and while folded flat it sinks just under the paper.
 */
export function popUpY(y: Node<'float'>, x: Node<'float'>): Node<'float'> {
  const back = float(1)
    .add(float(2.6).mul(x.sub(1).pow(3)))
    .add(float(1.6).mul(x.sub(1).pow(2)));
  return y.mul(back).sub(float(1).sub(min(back, 1)).mul(PAPER_TUCK));
}

/**
 * The miniature's mesh in paper-local metres: its land and near shallows (quads wholly under the
 * sea are dropped). It carries the ground's true world position and normal and its baked masks and
 * light for the terrain material, and each vertex's distance from the island's middle (0-1) for
 * the pop-up.
 */
export function islandGeometry(grid: IslandGrid): BufferGeometry {
  const { src, nx, nz, heights, normals, masks, light, cell } = grid;
  const pos = new Float32Array(nx * nz * 3);
  const world = new Float32Array(nx * nz * 3);
  const spread = new Float32Array(nx * nz);
  const p = { x: 0, y: 0, z: 0 };
  const half = Math.hypot(src.maxX - src.minX, src.maxZ - src.minZ) / 2;
  for (let iz = 0; iz < nz; iz++)
    for (let ix = 0; ix < nx; ix++) {
      const i = iz * nx + ix;
      const x = src.minX + ix * cell;
      const z = src.minZ + iz * cell;
      const h = heights[i]!;
      worldToPaper(src, x, Math.max(0, h), z, p);
      pos[i * 3] = p.x;
      // Under the sea, sink just below the paper so the coast meets the chart's own water.
      pos[i * 3 + 1] = h > 0 ? p.y + 0.0004 : -0.0012 * Math.min(1, -h / 2);
      pos[i * 3 + 2] = p.z;
      world[i * 3] = x;
      world[i * 3 + 1] = h;
      world[i * 3 + 2] = z;
      spread[i] = Math.min(1, Math.hypot(x - src.cx, z - src.cz) / half);
    }
  const index: number[] = [];
  for (let iz = 0; iz < nz - 1; iz++)
    for (let ix = 0; ix < nx - 1; ix++) {
      const a = iz * nx + ix;
      const b = a + 1;
      const c = a + nx;
      const d = c + 1;
      if (Math.max(heights[a]!, heights[b]!, heights[c]!, heights[d]!) < SEA_FLOOR) continue;
      index.push(a, c, b, b, c, d);
    }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(pos, 3));
  g.setAttribute('worldPos', new BufferAttribute(world, 3));
  g.setAttribute('worldNormal', new BufferAttribute(normals.slice(), 3));
  g.setAttribute('terrainMask', new BufferAttribute(masks.slice(), 4));
  g.setAttribute('terrainLight', new BufferAttribute(light.slice(), 4));
  g.setAttribute('spread', new BufferAttribute(spread, 1));
  g.setAttribute('hm', new BufferAttribute(heights.slice(), 1));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

/**
 * The grid as a height field (bilinear), so the island's own placement code (the vegetation scatter,
 * the headland cliff) can run on it for the chart.
 */
export function gridHeightField(grid: IslandGrid): HeightField {
  const { src, nx, nz, cell, heights, normals, masks } = grid;
  const at = (x: number, z: number): [number, number, number, number, number, number, number] => {
    const gx = Math.min(nx - 1.0001, Math.max(0, (x - src.minX) / cell));
    const gz = Math.min(nz - 1.0001, Math.max(0, (z - src.minZ) / cell));
    const ix = Math.floor(gx);
    const iz = Math.floor(gz);
    const tx = gx - ix;
    const tz = gz - iz;
    const i00 = iz * nx + ix;
    return [i00, i00 + 1, i00 + nx, i00 + nx + 1, (1 - tx) * (1 - tz), tx * (1 - tz), (1 - tx) * tz];
  };
  const lerp = (v: Float32Array, n: number, c: number, x: number, z: number): number => {
    const [a, b, d, e, w00, w10, w01] = at(x, z);
    const w11 = 1 - w00 - w10 - w01;
    return v[a * n + c]! * w00 + v[b * n + c]! * w10 + v[d * n + c]! * w01 + v[e * n + c]! * w11;
  };
  return {
    heightAt: (x, z) => lerp(heights, 1, 0, x, z),
    normalAt(x, z, out) {
      const a = lerp(normals, 3, 0, x, z);
      const b = lerp(normals, 3, 1, x, z);
      const c = lerp(normals, 3, 2, x, z);
      const len = Math.hypot(a, b, c) || 1;
      out[0] = a / len;
      out[1] = b / len;
      out[2] = c / len;
      return out;
    },
    masksAt: (x, z) => ({
      sand: lerp(masks, 4, 0, x, z),
      grass: lerp(masks, 4, 1, x, z),
      rock: lerp(masks, 4, 2, x, z),
      cliff: lerp(masks, 4, 3, x, z),
    }),
  };
}
