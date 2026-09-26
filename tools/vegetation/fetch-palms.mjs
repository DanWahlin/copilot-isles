#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { spawn } from 'node:child_process';
import { NodeIO } from '@gltf-transform/core';
import sharp from 'sharp';

const ROOT = new URL('../..', import.meta.url).pathname;
const CACHE = join(ROOT, 'tools/.cache/vegetation-palms');
const OUT = join(ROOT, 'public/packs/testcove/vegetation');
const MODEL_OUT = join(OUT, 'models');
const MANIFEST = join(OUT, 'palm-manifest.json');

/**
 * The Quaternius palms paint every face from one of two swatches in a palette atlas. Tagging parts
 * from those swatches at build time gives the runtime an exact trunk/frond split (vegPart 0/1) for
 * wind and leaf translucency; the atlas itself stays, so the palms render as authored.
 */
const PART_BY_SWATCH = [
  { rgb: [0x89, 0x5f, 0x38], part: 0 }, // trunk brown
  { rgb: [0x77, 0xaf, 0x2f], part: 1 }, // frond green
];
const SWATCH_TOLERANCE = 24;

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
      { kind: 'grove', file: 'models/palm_quaternius_a_grove.glb', simplifyRatio: 0.16 },
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
      { kind: 'grove', file: 'models/palm_quaternius_b_grove.glb', simplifyRatio: 0.16 },
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

function swatchPart(r, g, b) {
  let best = null;
  let bestDistance = Infinity;
  for (const swatch of PART_BY_SWATCH) {
    const d = Math.hypot(r - swatch.rgb[0], g - swatch.rgb[1], b - swatch.rgb[2]);
    if (d < bestDistance) [best, bestDistance] = [swatch, d];
  }
  if (bestDistance > SWATCH_TOLERANCE) throw new Error(`unknown palm atlas swatch rgb(${r},${g},${b})`);
  return best.part;
}

/** Writes a `_PART` vertex attribute from each vertex's atlas swatch. */
async function tagParts(input, output) {
  const io = new NodeIO();
  const doc = await io.read(input);
  const root = doc.getRoot();
  const [atlas, ...extra] = root.listTextures();
  if (!atlas || extra.length > 0) throw new Error(`${input}: expected exactly one palette atlas`);
  const { data, info } = await sharp(Buffer.from(atlas.getImage()))
    .raw()
    .toBuffer({ resolveWithObject: true });
  const buffer = root.listBuffers()[0];
  for (const mesh of root.listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const uv = prim.getAttribute('TEXCOORD_0');
      if (!uv) throw new Error(`${input}: palm primitive has no TEXCOORD_0`);
      const parts = new Float32Array(uv.getCount());
      const texel = [];
      for (let i = 0; i < parts.length; i += 1) {
        uv.getElement(i, texel);
        const x = Math.min(info.width - 1, Math.max(0, Math.floor(texel[0] * info.width)));
        const y = Math.min(info.height - 1, Math.max(0, Math.floor(texel[1] * info.height)));
        const o = (y * info.width + x) * info.channels;
        parts[i] = swatchPart(data[o], data[o + 1], data[o + 2]);
      }
      prim.setAttribute('_PART', doc.createAccessor().setType('SCALAR').setArray(parts).setBuffer(buffer));
    }
  }
  await io.write(output, doc);
}

async function build(source, input, spec) {
  const output = join(OUT, spec.file);
  await mkdir(dirname(output), { recursive: true });
  const tagged = `${output}.tagged.glb`;
  await tagParts(input, tagged);
  if (spec.simplifyRatio >= 0.999) {
    await run('npx', ['gltf-transform', 'prune', tagged, output]);
  } else {
    const simplified = `${output}.tmp.glb`;
    await run('npx', [
      'gltf-transform',
      'simplify',
      tagged,
      simplified,
      '--ratio',
      String(spec.simplifyRatio),
      '--error',
      '0.018',
    ]);
    await run('npx', ['gltf-transform', 'prune', simplified, output]);
    await rm(simplified, { force: true });
  }
  await rm(tagged, { force: true });
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
await run('npx', ['prettier', '--write', MANIFEST]);
console.log(`wrote ${MANIFEST}`);
