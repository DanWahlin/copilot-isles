import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Buffer } from 'node:buffer';
import { gzipSync } from 'node:zlib';
import { bakeTerrainFrom, hashTerrainPack, packTerrain } from '../../src/world/terrain/bake';
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
  let { binary, json } = packTerrain(baked, '', options);
  const hash = hashTerrainPack(binary, json);
  baked.hash = hash;
  ({ binary, json } = packTerrain(baked, hash, options));
  await mkdir(dirname(outBase), { recursive: true });
  await Promise.all([
    writeFile(`${outBase}.bin`, Buffer.from(binary)),
    writeFile(`${outBase}.json`, `${JSON.stringify(json, null, 2)}\n`),
  ]);
  const ms = performance.now() - start;
  const gzipBytes = gzipSync(Buffer.from(binary), { level: 9 }).byteLength;
  console.log(
    `Baked Meridian terrain ${json.nx}x${json.nz} in ${(ms / 1000).toFixed(2)}s; hash ${hash}; bin ${(binary.byteLength / 1048576).toFixed(2)} MiB (${(gzipBytes / 1048576).toFixed(2)} MiB gzip)`,
  );
  return { binary, json, gzipBytes };
}

if (import.meta.url === `file://${process.argv[1]}`) await bakeMeridianTerrain();
