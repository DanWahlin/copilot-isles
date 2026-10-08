#!/usr/bin/env node
// Builds the fishing boat off Anchorage Cay (CC0 sources, pinned):
// - the rowboat: "Boat" from Quaternius's Ships Pack, via Poly Pizza (https://poly.pizza/m/5UEl54KsuC)
// - the fishermen: KayKit Adventurers (Kay Lousberg) Rogue_Hooded and Barbarian, from the pack's GitHub
//   repo at a pinned commit, trimmed to the clips the boat uses, without weapons or the barbarian's hat.
// node tools/life/fetch-fishing-boat.mjs   (sources are cached in .tools/assets)
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune } from '@gltf-transform/functions';

const ROOT = new URL('../..', import.meta.url).pathname;
const CACHE = join(ROOT, '.tools/assets/life');
const OUT = join(ROOT, 'public/packs/testcove/life');
const KAYKIT_COMMIT = '672074b73ba276876a19e8816ecdc5241817ab47';
const KAYKIT_REPO = `https://raw.githubusercontent.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0/${KAYKIT_COMMIT}`;
const KAYKIT = `${KAYKIT_REPO}/addons/kaykit_character_pack_adventures`;

/** The clips the fishermen play: sitting on the thwart, casting, and waving (cheering) at you. */
const CLIPS = ['Sit_Chair_Idle', 'Throw', 'Cheer'];

const SOURCES = [
  {
    out: 'rowboat.glb',
    url: 'https://static.poly.pizza/c5fe6584-9f6e-46cf-bcf6-95979c7494e4.glb',
    sha: '263e5d46f79e8b37afecd0db9056b22dc33c6456074d260589285d1891192335',
  },
  {
    out: 'fisher-hooded.glb',
    url: `${KAYKIT}/Characters/gltf/Rogue_Hooded.glb`,
    sha: '93e6e25213009952276d9cf34f5d96a243767334c66f280db0433ddfabb91545',
    drop: ['Knife_Offhand', '1H_Crossbow', '2H_Crossbow', 'Knife', 'Throwable'],
  },
  {
    out: 'fisher-barbarian.glb',
    url: `${KAYKIT}/Characters/gltf/Barbarian.glb`,
    sha: 'cefc311a0e10c7858b6141f5ada7e33268727564fb8ac1347aab97d000669cc6',
    drop: ['1H_Axe_Offhand', 'Barbarian_Round_Shield', '1H_Axe', '2H_Axe', 'Barbarian_Hat'],
  },
];

async function text(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.text();
}

async function fetchPinned(url, sha, file) {
  if (!existsSync(file)) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
    writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  }
  const actual = createHash('sha256').update(readFileSync(file)).digest('hex');
  if (actual !== sha) throw new Error(`sha256 mismatch for ${url}: ${actual}`);
}

async function main() {
  mkdirSync(CACHE, { recursive: true });
  mkdirSync(OUT, { recursive: true });
  // Licences are checked at the source before anything is used.
  if (!/Creative Commons Zero, CC0/.test(await text(`${KAYKIT_REPO}/LICENSE.txt`)))
    throw new Error('KayKit licence is not CC0');
  const page = await text('https://poly.pizza/m/5UEl54KsuC');
  if (!/CC0/.test(page) || !/Quaternius/.test(page)) throw new Error('Rowboat page is not Quaternius CC0');

  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  for (const s of SOURCES) {
    const src = join(CACHE, `${s.out}.source.glb`);
    await fetchPinned(s.url, s.sha, src);
    const doc = await io.read(src);
    const root = doc.getRoot();
    if (s.drop) {
      for (const node of root.listNodes()) if (s.drop.includes(node.getName())) node.dispose();
      for (const anim of root.listAnimations()) if (!CLIPS.includes(anim.getName())) anim.dispose();
      const kept = root.listAnimations().map((a) => a.getName());
      for (const clip of CLIPS) if (!kept.includes(clip)) throw new Error(`${s.out}: missing clip ${clip}`);
    }
    await doc.transform(prune());
    const trimmed = join(CACHE, `${s.out}.trimmed.glb`);
    await io.write(trimmed, doc);
    execFileSync(
      join(ROOT, 'node_modules/.bin/gltf-transform'),
      [
        'optimize',
        trimmed,
        join(OUT, s.out),
        '--compress',
        'meshopt',
        '--texture-compress',
        'false',
        '--simplify',
        'false',
      ],
      { stdio: 'ignore' },
    );
    const out = readFileSync(join(OUT, s.out));
    console.log(
      `${s.out}: ${(out.length / 1024).toFixed(1)} KB, sha256 ${createHash('sha256').update(out).digest('hex')}`,
    );
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
