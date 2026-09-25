import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bakeTerrainFrom } from '../../src/world/terrain/bake';
import { writeTerrainPack } from './write-terrain-pack';
import { MERIDIAN, meridianHeight, meridianMasks } from '../../src/world/islands/meridian';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');

export async function bakeMeridianTerrain(outBase = resolve(root, 'public/packs/meridian/terrain')) {
  const start = performance.now();
  const baked = bakeTerrainFrom({
    bounds: MERIDIAN.bounds,
    heightAt: meridianHeight,
    masksAt: meridianMasks,
  });
  const options = {
    seabedRadius: MERIDIAN.seabedRadius,
    deepDepth: MERIDIAN.deepDepth,
    farSeabedRing: { innerRadius: 520, outerRadius: MERIDIAN.seabedRadius, segments: 160 },
  };
  return writeTerrainPack('Meridian terrain', baked, outBase, start, options);
}

if (import.meta.url === `file://${process.argv[1]}`) await bakeMeridianTerrain();
