#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { spawn } from 'node:child_process';

const ROOT = new URL('../..', import.meta.url).pathname;
const CACHE = join(ROOT, 'tools/.cache/vegetation-palms');
const OUT = join(ROOT, 'public/packs/testcove/vegetation');
const MODEL_OUT = join(OUT, 'models');
const MANIFEST = join(OUT, 'palm-manifest.json');

const SOURCES = [
  {
    id: 'quaternius-a',
    page: 'https://poly.pizza/m/P0tgwyXBgr',
    url: 'https://static.poly.pizza/66cd7d94-abba-471e-8d8b-c8ad30aa5c70.glb',
    sourceSha256: '56ce27c93426e137e996844a7e99457218e513468e5a567046590c183224b436',
    author: 'Quaternius',
    title: 'Palm Tree',
    licenseEvidence: 'Poly Pizza page shows Public Domain (CC0); embedded metadata Licence: CC0 1.0.',
    outputs: [
      { kind: 'hero', file: 'models/palm_quaternius_a_hero.glb', simplifyRatio: 1.0 },
      { kind: 'grove', file: 'models/palm_quaternius_a_grove.glb', simplifyRatio: 0.22 },
    ],
  },
  {
    id: 'quaternius-b',
    page: 'https://poly.pizza/m/A6cKJYFsIb',
    url: 'https://static.poly.pizza/4c17decd-3087-4afe-9611-cfd92cca47cd.glb',
    sourceSha256: 'ae8c66e5e2206c5efd12c2cf96b9064f643076c2d8bac5f3c5f457b2ee6491ca',
    author: 'Quaternius',
    title: 'Palm Tree',
    licenseEvidence: 'Poly Pizza page shows Public Domain (CC0); embedded metadata Licence: CC0 1.0.',
    outputs: [
      { kind: 'hero', file: 'models/palm_quaternius_b_hero.glb', simplifyRatio: 1.0 },
      { kind: 'grove', file: 'models/palm_quaternius_b_grove.glb', simplifyRatio: 0.22 },
    ],
  },
];

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: 'inherit', cwd: ROOT, shell: process.platform === 'win32' });
    p.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`${cmd} ${args.join(' ')} exited ${code}`)),
    );
  });
}

async function sha256(path) {
  return createHash('sha256')
    .update(await readFile(path))
    .digest('hex');
}

async function download(source) {
  await mkdir(CACHE, { recursive: true });
  const output = join(CACHE, `${source.id}.glb`);
  try {
    if ((await sha256(output)) === source.sourceSha256) return output;
  } catch {
    // Missing cache entry.
  }
  const response = await fetch(source.url, { headers: { 'user-agent': 'Copilot Isles asset fetcher' } });
  if (!response.ok) throw new Error(`${source.url}: ${response.status} ${response.statusText}`);
  await writeFile(output, Buffer.from(await response.arrayBuffer()));
  const hash = await sha256(output);
  if (hash !== source.sourceSha256) throw new Error(`${source.id} sha256 mismatch ${hash}`);
  return output;
}

async function build(source, input, spec) {
  const output = join(OUT, spec.file);
  await mkdir(dirname(output), { recursive: true });
  if (spec.simplifyRatio >= 0.999) {
    await copyFile(input, output);
  } else {
    const tmp = `${output}.tmp.glb`;
    await rm(tmp, { force: true });
    await run('npx', [
      'gltf-transform',
      'simplify',
      input,
      tmp,
      '--ratio',
      String(spec.simplifyRatio),
      '--error',
      '0.01',
    ]);
    await run('npx', ['gltf-transform', 'prune', tmp, output]);
    await rm(tmp, { force: true }).catch(() => {});
  }
  return {
    source: source.id,
    kind: spec.kind,
    file: spec.file,
    sha256: await sha256(output),
  };
}

await mkdir(MODEL_OUT, { recursive: true });
const assets = [];
for (const source of SOURCES) {
  const input = await download(source);
  for (const spec of source.outputs) assets.push(await build(source, input, spec));
}

await writeFile(
  MANIFEST,
  JSON.stringify(
    {
      generated: new Date().toISOString(),
      sources: SOURCES,
      assets,
    },
    null,
    2,
  ),
);
console.log(`wrote ${MANIFEST}`);
