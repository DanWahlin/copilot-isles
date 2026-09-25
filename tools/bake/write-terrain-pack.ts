import { Buffer } from 'node:buffer';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { gzipSync } from 'node:zlib';
import {
  hashTerrainPack,
  packTerrain,
  type TerrainBakeData,
  type TerrainPackOptions,
} from '../../src/world/terrain/bake';

/**
 * Packs a baked terrain, stamps it with its content hash (packed once to hash, then again with the
 * hash in the header), writes `<outBase>.bin` and `.json`, and logs the sizes.
 */
export async function writeTerrainPack(
  label: string,
  baked: TerrainBakeData,
  outBase: string,
  startMs: number,
  options: TerrainPackOptions = {},
) {
  let { binary, json } = packTerrain(baked, '', options);
  const hash = hashTerrainPack(binary, json);
  baked.hash = hash;
  ({ binary, json } = packTerrain(baked, hash, options));
  await mkdir(dirname(outBase), { recursive: true });
  await Promise.all([
    writeFile(`${outBase}.bin`, Buffer.from(binary)),
    writeFile(`${outBase}.json`, `${JSON.stringify(json, null, 2)}\n`),
  ]);
  const ms = performance.now() - startMs;
  const gzipBytes = gzipSync(Buffer.from(binary), { level: 9 }).byteLength;
  const mib = (n: number) => (n / 1048576).toFixed(2);
  console.log(
    `Baked ${label} ${json.nx}x${json.nz} in ${(ms / 1000).toFixed(2)}s; hash ${hash}; bin ${mib(binary.byteLength)} MiB (${mib(gzipBytes)} MiB gzip)`,
  );
  return { binary, json, gzipBytes };
}
