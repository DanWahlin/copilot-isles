import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bakeTerrainFrom } from '../../src/world/terrain/bake';
import { smoothSteepLight } from './steep-light';
import { writeTerrainPack } from './write-terrain-pack';
import { thousandBoughHeight, thousandBoughMasks } from '../../src/world/islands/thousand-bough/height';
import { THOUSAND_BOUGH } from '../../src/world/islands/thousand-bough/layout';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');

export async function bakeThousandBoughTerrain(
  outBase = resolve(root, 'public/packs/thousand-bough/terrain'),
) {
  const start = performance.now();
  const baked = bakeTerrainFrom({
    bounds: THOUSAND_BOUGH.bounds,
    heightAt: thousandBoughHeight,
    masksAt: thousandBoughMasks,
  });
  smoothSteepLight(baked);
  const options = {
    seabedRadius: THOUSAND_BOUGH.seabedRadius,
    deepDepth: THOUSAND_BOUGH.deepDepth,
    farSeabedRing: { innerRadius: 520, outerRadius: THOUSAND_BOUGH.seabedRadius, segments: 160 },
  };
  return writeTerrainPack('Thousand-Bough terrain', baked, outBase, start, options);
}

if (import.meta.url === `file://${process.argv[1]}`) await bakeThousandBoughTerrain();
