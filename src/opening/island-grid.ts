import { BufferAttribute, BufferGeometry } from 'three/webgpu';
import { extractShoreline, type ShorelineChain } from '../world/terrain/bake';
import { worldToPaper, type ChartIslandSource } from './chart-map';

/** A real island's heights and colours, sampled on a coarse grid for its chart miniature. */
export interface IslandGrid {
  src: ChartIslandSource;
  nx: number;
  nz: number;
  heights: Float32Array;
  colors: Float32Array;
}

const SAND = [0.86, 0.76, 0.52] as const;
const WET_SAND = [0.62, 0.6, 0.44] as const;
const GRASS = [0.33, 0.55, 0.25] as const;
const GRASS_HIGH = [0.42, 0.6, 0.29] as const;
const ROCK = [0.55, 0.5, 0.42] as const;
const CLIFF = [0.66, 0.6, 0.48] as const;

/**
 * Samples the island's own height and terrain-mask functions (one world: the same functions the game
 * builds its terrain from), a row per step, so the caller can spread the work over frames.
 */
export function* sampleIslandGrid(src: ChartIslandSource): Generator<void, IslandGrid, void> {
  const nx = Math.floor((src.maxX - src.minX) / src.cell) + 1;
  const nz = Math.floor((src.maxZ - src.minZ) / src.cell) + 1;
  const heights = new Float32Array(nx * nz);
  const colors = new Float32Array(nx * nz * 3);
  for (let iz = 0; iz < nz; iz++) {
    const z = src.minZ + iz * src.cell;
    for (let ix = 0; ix < nx; ix++) {
      const x = src.minX + ix * src.cell;
      const i = iz * nx + ix;
      const h = src.height(x, z);
      heights[i] = h;
      let r: number, g: number, b: number;
      if (h < 0.4) {
        const k = Math.min(1, Math.max(0, (h + 2.5) / 2.9));
        r = WET_SAND[0] + (SAND[0] - WET_SAND[0]) * k;
        g = WET_SAND[1] + (SAND[1] - WET_SAND[1]) * k;
        b = WET_SAND[2] + (SAND[2] - WET_SAND[2]) * k;
      } else {
        const m = src.masks(x, z);
        const hi = Math.min(1, h / 40);
        const gr = GRASS[0] + (GRASS_HIGH[0] - GRASS[0]) * hi;
        const gg = GRASS[1] + (GRASS_HIGH[1] - GRASS[1]) * hi;
        const gb = GRASS[2] + (GRASS_HIGH[2] - GRASS[2]) * hi;
        const sum = m.sand + m.grass + m.rock + m.cliff || 1;
        r = (SAND[0] * m.sand + gr * m.grass + ROCK[0] * m.rock + CLIFF[0] * m.cliff) / sum;
        g = (SAND[1] * m.sand + gg * m.grass + ROCK[1] * m.rock + CLIFF[1] * m.cliff) / sum;
        b = (SAND[2] * m.sand + gb * m.grass + ROCK[2] * m.rock + CLIFF[2] * m.cliff) / sum;
      }
      colors[i * 3] = r;
      colors[i * 3 + 1] = g;
      colors[i * 3 + 2] = b;
    }
    yield;
  }
  return { src, nx, nz, heights, colors };
}

/** Runs a sliced job a few milliseconds per frame until it returns. */
export function runSliced<T>(job: Generator<void, T, void>, budgetMs = 3): Promise<T> {
  return new Promise((resolve) => {
    const step = () => {
      const end = performance.now() + budgetMs;
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
  const { src, nx, nz, heights } = grid;
  return extractShoreline(heights, nx, nz, src.minX, src.minZ, src.cell);
}

/** Below this the miniature tucks under the paper (the chart's own water shows there). */
const SEA_FLOOR = -1.2;

/**
 * The miniature's mesh in paper-local metres: its land and near shallows (quads wholly under the
 * sea are dropped), with each vertex's distance from the island's middle (0-1) for the pop-up.
 */
export function islandGeometry(grid: IslandGrid): BufferGeometry {
  const { src, nx, nz, heights, colors } = grid;
  const pos = new Float32Array(nx * nz * 3);
  const spread = new Float32Array(nx * nz);
  const p = { x: 0, y: 0, z: 0 };
  const half = Math.hypot(src.maxX - src.minX, src.maxZ - src.minZ) / 2;
  for (let iz = 0; iz < nz; iz++)
    for (let ix = 0; ix < nx; ix++) {
      const i = iz * nx + ix;
      const x = src.minX + ix * src.cell;
      const z = src.minZ + iz * src.cell;
      const h = heights[i]!;
      worldToPaper(src, x, Math.max(0, h), z, p);
      pos[i * 3] = p.x;
      // Under the sea, sink just below the paper so the coast meets the chart's own water.
      pos[i * 3 + 1] = h > 0 ? p.y + 0.0004 : -0.0012 * Math.min(1, -h / 2);
      pos[i * 3 + 2] = p.z;
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
  g.setAttribute('color', new BufferAttribute(colors.slice(), 3));
  g.setAttribute('spread', new BufferAttribute(spread, 1));
  g.setAttribute('hm', new BufferAttribute(heights.slice(), 1));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}
