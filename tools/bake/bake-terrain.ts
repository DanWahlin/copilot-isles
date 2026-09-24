import { writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Buffer } from 'node:buffer';
import { gzipSync } from 'node:zlib';
import { buildPackManifest } from '../packs/build-manifest.mjs';
import { bakeTerrain, hashTerrainPack, packTerrain } from '../../src/world/terrain/bake';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const outBase = resolve(root, 'public/packs/testcove/terrain');
const start = performance.now();
const baked = bakeTerrain();
let { binary, json } = packTerrain(baked, '');
const hash = hashTerrainPack(binary, json);
baked.hash = hash;
({ binary, json } = packTerrain(baked, hash));
await Promise.all([
  writeFile(`${outBase}.bin`, Buffer.from(binary)),
  writeFile(`${outBase}.json`, `${JSON.stringify(json, null, 2)}\n`),
]);
const ms = performance.now() - start;
const gzipBytes = gzipSync(Buffer.from(binary), { level: 9 }).byteLength;
console.log(
  `Baked terrain ${json.nx}x${json.nz} in ${(ms / 1000).toFixed(2)}s; hash ${hash}; bin ${(binary.byteLength / 1048576).toFixed(2)} MiB (${(gzipBytes / 1048576).toFixed(2)} MiB gzip)`,
);
await buildPackManifest();
