import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPackManifest } from '../packs/build-manifest.mjs';
import { bakeTerrain } from '../../src/world/terrain/bake';
import { bakeMeridianTerrain } from './bake-meridian';
import { writeTerrainPack } from './write-terrain-pack';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const outBase = resolve(root, 'public/packs/testcove/terrain');
const start = performance.now();
const baked = bakeTerrain();
await writeTerrainPack('terrain', baked, outBase, start);
await bakeMeridianTerrain();
await buildPackManifest();
