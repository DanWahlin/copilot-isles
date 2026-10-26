#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { spawn } from 'node:child_process';

const ROOT = new URL('../..', import.meta.url).pathname;
const CACHE = join(ROOT, 'tools/.cache');
const ZIP = join(CACHE, 'stylized_nature_megakitstandard.zip');
const WORK = join(ROOT, 'tools/vegetation/.megakit');
const OUT = join(ROOT, 'public/packs/testcove/vegetation');
const MODEL_OUT = join(OUT, 'models');
const TEX_OUT = join(OUT, 'textures');
const ZIP_URL = 'https://opengameart.org/sites/default/files/stylized_nature_megakitstandard.zip';
const ZIP_SHA256 = '298f6732b872e4cf7b30e6e7abf9641c7f6dc6b326df37ac089533ed7e3d58c9';

const ASSETS = [
  {
    name: 'tree_broadleaf',
    source: 'CommonTree_1.gltf',
    title: 'CommonTree_1',
    file: 'models/tree_broadleaf.glb',
    textureSize: 1024,
  },
  {
    name: 'shrub',
    source: 'Bush_Common.gltf',
    title: 'Bush_Common',
    file: 'models/shrub.glb',
    textureSize: 512,
  },
  {
    name: 'shrub_flowers',
    source: 'Bush_Common_Flowers.gltf',
    title: 'Bush_Common_Flowers',
    file: 'models/shrub_flowers.glb',
    textureSize: 512,
  },
  {
    name: 'flower_bush',
    source: 'Flower_4_Group.gltf',
    title: 'Flower_4_Group',
    file: 'models/flower_bush.glb',
    textureSize: 512,
  },
  { name: 'fern', source: 'Fern_1.gltf', title: 'Fern_1', file: 'models/fern.glb', textureSize: 512 },
  {
    name: 'plant_big',
    source: 'Plant_1_Big.gltf',
    title: 'Plant_1_Big',
    file: 'models/plant_big.glb',
    textureSize: 512,
  },
  {
    name: 'driftwood_dead_tree',
    source: 'DeadTree_3.gltf',
    title: 'DeadTree_3',
    file: 'models/driftwood_dead_tree.glb',
    textureSize: 512,
  },
];

const PALM_TEXTURES = [{ name: 'grass', source: 'Grass.png', file: 'textures/grass.webp', size: 512 }];

async function sha256(path) {
  return createHash('sha256')
    .update(await readFile(path))
    .digest('hex');
}

async function downloadZip() {
  await mkdir(CACHE, { recursive: true });
  try {
    if ((await sha256(ZIP)) === ZIP_SHA256) return;
  } catch {
    // Missing cache entry.
  }
  const response = await fetch(ZIP_URL, { headers: { 'user-agent': 'Kraken Isles asset fetcher' } });
  if (!response.ok) throw new Error(`${ZIP_URL}: ${response.status} ${response.statusText}`);
  await writeFile(ZIP, Buffer.from(await response.arrayBuffer()));
  const hash = await sha256(ZIP);
  if (hash !== ZIP_SHA256) throw new Error(`stylized_nature_megakitstandard.zip sha256 mismatch ${hash}`);
}

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: 'inherit', cwd: ROOT, shell: process.platform === 'win32' });
    p.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`${cmd} ${args.join(' ')} exited ${code}`)),
    );
  });
}

await downloadZip();
await run('chmod', ['-R', 'u+rwX', WORK]).catch(() => {});
await rm(WORK, { recursive: true, force: true });
await mkdir(WORK, { recursive: true });
await run('unzip', ['-oq', ZIP, 'glTF/*', '-d', WORK]);
await rm(OUT, { recursive: true, force: true });
await mkdir(MODEL_OUT, { recursive: true });
await mkdir(TEX_OUT, { recursive: true });

const manifest = [];
for (const asset of ASSETS) {
  const input = join(WORK, 'glTF', asset.source);
  const output = join(OUT, asset.file);
  await mkdir(dirname(output), { recursive: true });
  await run('npx', [
    'gltf-transform',
    'optimize',
    input,
    output,
    '--compress',
    'meshopt',
    '--meshopt-level',
    'high',
    '--texture-compress',
    'webp',
    '--texture-size',
    String(asset.textureSize),
    '--simplify',
    'true',
    '--simplify-ratio',
    '0.86',
    '--simplify-error',
    '0.0008',
  ]);
  manifest.push({
    ...asset,
    creator: 'Quaternius',
    license: 'CC0 1.0',
    page: 'https://opengameart.org/content/stylized-nature-megakit',
    zip: ZIP_URL,
    zipSha256: ZIP_SHA256,
    sha256: await sha256(output),
  });
}

for (const texture of PALM_TEXTURES) {
  const input = join(WORK, 'glTF', texture.source);
  const output = join(OUT, texture.file);
  await mkdir(dirname(output), { recursive: true });
  await run('cwebp', [
    '-quiet',
    '-q',
    '86',
    '-resize',
    String(texture.size),
    String(texture.size),
    input,
    '-o',
    output,
  ]);
  manifest.push({
    ...texture,
    creator: 'Quaternius',
    license: 'CC0 1.0',
    page: 'https://opengameart.org/content/stylized-nature-megakit',
    zip: ZIP_URL,
    zipSha256: ZIP_SHA256,
    sha256: await sha256(output),
  });
}

await writeFile(
  join(OUT, 'manifest.json'),
  JSON.stringify({ generated: new Date().toISOString(), assets: manifest }, null, 2),
);
await run('chmod', ['-R', 'u+rwX', WORK]).catch(() => {});
await rm(WORK, { recursive: true, force: true });
