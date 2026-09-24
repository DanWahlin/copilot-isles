#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const publicDir = resolve(root, 'public');
const outPath = resolve(publicDir, 'packs/manifest.json');

const PACK_DEFS = [
  {
    id: 'common/critical',
    include: ['fonts/**', 'voice/testcove/manifest.json'],
  },
  {
    id: 'testcove/critical',
    include: [
      'packs/testcove/terrain.bin',
      'packs/testcove/terrain.json',
      'packs/testcove/terrain-textures/**',
      'packs/testcove/rocks/**',
      'packs/testcove/ship/**',
    ],
  },
  {
    id: 'testcove/harbor',
    include: ['packs/testcove/village/**', 'packs/testcove/characters/**', 'packs/testcove/vegetation/**'],
  },
  {
    id: 'meridian/critical',
    include: [
      'packs/meridian/terrain.bin',
      'packs/meridian/terrain.json',
      'packs/testcove/terrain-textures/**',
      'packs/testcove/rocks/**',
    ],
  },
];

function toPosix(path) {
  return path.split(sep).join('/');
}

function sha8(buffer) {
  return createHash('sha256').update(buffer).digest('hex').slice(0, 8);
}

function matchPattern(path, pattern) {
  if (pattern.endsWith('/**')) return path.startsWith(pattern.slice(0, -3));
  return path === pattern;
}

async function walk(dir) {
  if (!existsSync(dir)) return [];
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = resolve(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(path)));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}

async function allPublicFiles() {
  const files = await walk(publicDir);
  return files
    .map((file) => toPosix(relative(publicDir, file)))
    .filter((path) => path !== 'packs/manifest.json' && !path.endsWith('/.DS_Store'))
    .sort();
}

export async function buildPackManifest({ out = outPath } = {}) {
  const candidates = await allPublicFiles();
  const packs = {};
  const fileIndex = {};

  for (const def of PACK_DEFS) {
    const paths = candidates.filter((path) => def.include.some((pattern) => matchPattern(path, pattern)));
    const files = [];
    let totalBytes = 0;
    for (const path of paths) {
      const abs = resolve(publicDir, path);
      const [buffer, info] = await Promise.all([readFile(abs), stat(abs)]);
      const hash = sha8(buffer);
      const file = { path, bytes: info.size, sha256: hash };
      files.push(file);
      fileIndex[path] = { packId: def.id, sha256: hash, bytes: info.size };
      totalBytes += info.size;
    }
    packs[def.id] = { id: def.id, files, totalBytes };
  }

  const manifest = {
    version: 1,
    generatedAt: new Date().toISOString(),
    packs,
    fileIndex,
  };
  await writeFile(out, `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const manifest = await buildPackManifest();
  const summary = Object.values(manifest.packs)
    .map((pack) => `${pack.id}: ${pack.files.length} files, ${pack.totalBytes} bytes`)
    .join('\n');
  console.log(`Wrote ${toPosix(relative(root, outPath))}\n${summary}`);
}
