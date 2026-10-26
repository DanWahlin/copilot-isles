#!/usr/bin/env node
// Builds the kraken's tentacle (CC0 source, pinned):
// - "Tentacle" from Quaternius's Pirate Kit, via Poly Pizza (https://poly.pizza/m/BR1vpIvvvv)
// The kit's 1024² atlas holds four flat swatches for this model, so each vertex takes its swatch's
// colour (COLOR_0) and the atlas, its UVs and its texture go: no texture to download or upload. The
// clips get short names (Tentacle_Idle, Tentacle_Attack, Tentacle_Attack2, Tentacle_Poke).
// node tools/kraken/fetch-tentacle.mjs   (the source is cached in .tools/assets)
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune } from '@gltf-transform/functions';
import sharp from 'sharp';

const ROOT = new URL('../..', import.meta.url).pathname;
const CACHE = join(ROOT, '.tools/assets/kraken');
const OUT = join(ROOT, 'public/packs/testcove/kraken');
const PAGE = 'https://poly.pizza/m/BR1vpIvvvv';
const SOURCE = {
  out: 'tentacle.glb',
  url: 'https://static.poly.pizza/b39d86e5-e51f-4bd8-bc63-c7fc0cdea864.glb',
  sha: 'b53db44d80b3ce066849009dd39cfcadbac82efaa5a0c5d52bacbc0656ade931',
};
const CLIPS = ['Tentacle_Idle', 'Tentacle_Attack', 'Tentacle_Attack2', 'Tentacle_Poke'];

async function fetchPinned(url, sha, file) {
  if (!existsSync(file)) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
    writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  }
  const actual = createHash('sha256').update(readFileSync(file)).digest('hex');
  if (actual !== sha) throw new Error(`sha256 mismatch for ${url}: ${actual}`);
}

/** sRGB 0…255 to linear (glTF vertex colours are linear). */
function linear(c) {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

async function main() {
  mkdirSync(CACHE, { recursive: true });
  mkdirSync(OUT, { recursive: true });
  // The licence is checked at the source before anything is used.
  const res = await fetch(PAGE);
  const page = res.ok ? await res.text() : '';
  if (!/CC0/.test(page) || !/Quaternius/.test(page)) throw new Error('Tentacle page is not Quaternius CC0');

  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const src = join(CACHE, `${SOURCE.out}.source.glb`);
  await fetchPinned(SOURCE.url, SOURCE.sha, src);
  const doc = await io.read(src);
  const root = doc.getRoot();

  // Bake the atlas swatch under each vertex's UV into COLOR_0.
  const material = root.listMaterials()[0];
  const atlas = material.getBaseColorTexture();
  if (!atlas) throw new Error('tentacle: no atlas');
  const { data, info } = await sharp(Buffer.from(atlas.getImage()))
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const swatches = new Map();
  for (const mesh of root.listMeshes())
    for (const prim of mesh.listPrimitives()) {
      const uv = prim.getAttribute('TEXCOORD_0');
      const n = uv.getCount();
      const colors = new Float32Array(n * 3);
      const t = [0, 0];
      for (let i = 0; i < n; i++) {
        uv.getElement(i, t);
        const x = Math.min(info.width - 1, Math.max(0, Math.floor(t[0] * info.width)));
        const y = Math.min(info.height - 1, Math.max(0, Math.floor(t[1] * info.height)));
        const o = (y * info.width + x) * info.channels;
        colors[i * 3] = linear(data[o]);
        colors[i * 3 + 1] = linear(data[o + 1]);
        colors[i * 3 + 2] = linear(data[o + 2]);
        const key = `${data[o]},${data[o + 1]},${data[o + 2]}`;
        swatches.set(key, (swatches.get(key) ?? 0) + 1);
      }
      const color = doc.createAccessor('COLOR_0').setType('VEC3').setArray(colors).setBuffer(uv.getBuffer());
      prim.setAttribute('COLOR_0', color);
      prim.setAttribute('TEXCOORD_0', null);
    }
  material.setBaseColorTexture(null);
  material.setName('KrakenTentacle');
  atlas.dispose();
  console.log('swatches (sRGB × vertices):', [...swatches].map(([k, v]) => `${k}×${v}`).join('  '));

  // "TentacleArmature|TentacleArmature|…|Tentacle_Idle|…" → "Tentacle_Idle".
  for (const anim of root.listAnimations()) {
    const name = CLIPS.find((c) => anim.getName().split('|').includes(c));
    if (!name) anim.dispose();
    else anim.setName(name);
  }
  const kept = root.listAnimations().map((a) => a.getName());
  for (const clip of CLIPS) if (!kept.includes(clip)) throw new Error(`tentacle: missing clip ${clip}`);

  await doc.transform(prune());
  const trimmed = join(CACHE, `${SOURCE.out}.trimmed.glb`);
  await io.write(trimmed, doc);
  execFileSync(
    join(ROOT, 'node_modules/.bin/gltf-transform'),
    [
      'optimize',
      trimmed,
      join(OUT, SOURCE.out),
      '--compress',
      'meshopt',
      '--texture-compress',
      'false',
      '--simplify',
      'false',
    ],
    { stdio: 'ignore' },
  );
  const out = readFileSync(join(OUT, SOURCE.out));
  console.log(
    `${SOURCE.out}: ${(out.length / 1024).toFixed(1)} KB, sha256 ${createHash('sha256').update(out).digest('hex')}`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
