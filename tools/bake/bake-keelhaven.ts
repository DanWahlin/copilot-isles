import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bakeTerrainFrom, SUNS, type TerrainBakeData } from '../../src/world/terrain/bake';
import { sunState } from '../../src/world/sky/sun';
import { smoothSteepLight } from './steep-light';
import { writeTerrainPack } from './write-terrain-pack';
import { keelhavenHeight, keelhavenMasks } from '../../src/world/islands/keelhaven/height';
import { KEELHAVEN } from '../../src/world/islands/keelhaven/layout';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');

/**
 * Darkens the sky openness in the gullies and lifts it on the ribs (the mean height 6 m and 14 m away
 * against the height here). The bake's openness looks 36 m out, so it hardly sees a 50 m flute; under a
 * high sun the flutes then read mostly by this shade.
 */
export function shadeFlutes(data: TerrainBakeData, strength = 0.06): void {
  const { nx, nz, heights, ao, cell } = data;
  const raw = ao.slice();
  const at = (ix: number, iz: number) =>
    heights[Math.min(nz - 1, Math.max(0, iz)) * nx + Math.min(nx - 1, Math.max(0, ix))]!;
  for (let iz = 0; iz < nz; iz++)
    for (let ix = 0; ix < nx; ix++) {
      const h = heights[iz * nx + ix]!;
      if (h < 1) continue;
      let sum = 0;
      for (const r of [Math.round(6 / cell), Math.round(14 / cell)])
        sum += at(ix + r, iz) + at(ix - r, iz) + at(ix, iz + r) + at(ix, iz - r);
      const hollow = sum / 8 - h;
      const shade = Math.max(-0.35, Math.min(0.2, -hollow * strength));
      ao[iz * nx + ix] = Math.round(Math.max(0, Math.min(255, raw[iz * nx + ix]! * (1 + shade))));
    }
}

/** The island's height on its own bake grid (bilinear), so the masks' many look-ups don't re-run the height. */
function gridHeights(): (x: number, z: number) => number {
  const b = KEELHAVEN.bounds;
  const nx = Math.round((b.maxX - b.minX) / b.cell) + 1;
  const nz = Math.round((b.maxZ - b.minZ) / b.cell) + 1;
  const grid = new Float32Array(nx * nz);
  for (let iz = 0; iz < nz; iz++)
    for (let ix = 0; ix < nx; ix++)
      grid[iz * nx + ix] = keelhavenHeight(b.minX + ix * b.cell, b.minZ + iz * b.cell);
  return (x, z) => {
    const gx = Math.min(nx - 1.001, Math.max(0, (x - b.minX) / b.cell));
    const gz = Math.min(nz - 1.001, Math.max(0, (z - b.minZ) / b.cell));
    const ix = Math.floor(gx);
    const iz = Math.floor(gz);
    const tx = gx - ix;
    const tz = gz - iz;
    const i = iz * nx + ix;
    const a = grid[i]! + (grid[i + 1]! - grid[i]!) * tx;
    const c = grid[i + nx]! + (grid[i + nx + 1]! - grid[i + nx]!) * tx;
    return a + (c - a) * tz;
  };
}

/**
 * A coarse copy of a baked terrain for the opening's 3D chart (spec O7): the chart's box at the chart's
 * cell, each sample the mean of the fine samples round it (heights, light and masks), no shoreline.
 */
export function chartPack(
  data: TerrainBakeData,
  box: { minX: number; maxX: number; minZ: number; maxZ: number; cell: number },
): TerrainBakeData {
  const { cell } = box;
  const nx = Math.floor((box.maxX - box.minX) / cell) + 1;
  const nz = Math.floor((box.maxZ - box.minZ) / cell) + 1;
  const count = nx * nz;
  const heights = new Float32Array(count);
  const normals = new Float32Array(count * 3);
  const bytes = () => new Uint8Array(count);
  const out: TerrainBakeData = {
    heights,
    nx,
    nz,
    minX: box.minX,
    minZ: box.minZ,
    maxX: box.minX + (nx - 1) * cell,
    maxZ: box.minZ + (nz - 1) * cell,
    cell,
    normals,
    ao: bytes(),
    sunMorning: bytes(),
    sunGolden: bytes(),
    rim: bytes(),
    masks: new Uint8Array(count * 4),
    shoreline: [],
    hash: '',
  };
  // Half the chart's cell in fine samples: each coarse sample averages the fine ones it stands for.
  const r = Math.max(0, Math.round(cell / data.cell / 2));
  for (let iz = 0; iz < nz; iz++)
    for (let ix = 0; ix < nx; ix++) {
      const gx = Math.round((box.minX + ix * cell - data.minX) / data.cell);
      const gz = Math.round((box.minZ + iz * cell - data.minZ) / data.cell);
      let n = 0;
      let h = 0;
      const sums = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
      for (let dz = -r; dz <= r; dz++)
        for (let dx = -r; dx <= r; dx++) {
          const fx = Math.min(data.nx - 1, Math.max(0, gx + dx));
          const fz = Math.min(data.nz - 1, Math.max(0, gz + dz));
          const f = fz * data.nx + fx;
          n++;
          h += data.heights[f]!;
          sums[0] += data.ao[f]!;
          sums[1] += data.sunMorning[f]!;
          sums[2] += data.sunGolden[f]!;
          sums[3] += data.rim[f]!;
          for (let m = 0; m < 4; m++) sums[4 + m] += data.masks[f * 4 + m]!;
          for (let c = 0; c < 3; c++) sums[8 + c] += data.normals[f * 3 + c]!;
        }
      const i = iz * nx + ix;
      heights[i] = h / n;
      out.ao[i] = Math.round(sums[0]! / n);
      out.sunMorning[i] = Math.round(sums[1]! / n);
      out.sunGolden[i] = Math.round(sums[2]! / n);
      out.rim[i] = Math.round(sums[3]! / n);
      for (let m = 0; m < 4; m++) out.masks[i * 4 + m] = Math.round(sums[4 + m]! / n);
      const len = Math.hypot(sums[8]!, sums[9]!, sums[10]!) || 1;
      for (let c = 0; c < 3; c++) normals[i * 3 + c] = sums[8 + c]! / len;
    }
  return out;
}

/**
 * Bakes Keelhaven's terrain pack. The second baked sun (the one the terrain material reads) is the
 * island's own late-morning sun, so the baked shade falls the same way as the sky's. The gullies get a
 * darker sky openness (`shadeFlutes`), and the steep-light smoothing takes a small radius (6 m), so
 * each flute keeps its own shade.
 */
export async function bakeKeelhavenTerrain(outBase = resolve(root, 'public/packs/keelhaven/terrain')) {
  const start = performance.now();
  const { hours, azimuth } = KEELHAVEN.sky;
  const heightOnGrid = gridHeights();
  const baked = bakeTerrainFrom({
    bounds: KEELHAVEN.bounds,
    heightAt: heightOnGrid,
    masksAt: (x, z) => keelhavenMasks(x, z, heightOnGrid),
    suns: [SUNS[0], sunState(hours, azimuth).sun],
  });
  shadeFlutes(baked);
  smoothSteepLight(baked, { radius: 3, sigma: 2 });
  const options = {
    seabedRadius: KEELHAVEN.seabedRadius,
    deepDepth: KEELHAVEN.deepDepth,
    farSeabedRing: { innerRadius: 760, outerRadius: KEELHAVEN.seabedRadius, segments: 160 },
  };
  const written = await writeTerrainPack('Keelhaven terrain', baked, outBase, start, options);
  // The opening's chart reads a coarse pack of its own (spec O7), never the full one.
  await writeTerrainPack(
    'Keelhaven chart',
    chartPack(baked, KEELHAVEN.chart),
    resolve(dirname(outBase), 'chart'),
    performance.now(),
    { seabedRadius: KEELHAVEN.seabedRadius, deepDepth: KEELHAVEN.deepDepth },
  );
  return written;
}

if (import.meta.url === `file://${process.argv[1]}`) await bakeKeelhavenTerrain();
