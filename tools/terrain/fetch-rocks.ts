import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Buffer } from 'node:buffer';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { NodeIO, type Primitive } from '@gltf-transform/core';

interface RockSource {
  key: string;
  gltf: string;
}

const ZIP_URL = 'https://opengameart.org/sites/default/files/stylized_nature_megakitstandard.zip';
const ZIP_SHA256 = '298f6732b872e4cf7b30e6e7abf9641c7f6dc6b326df37ac089533ed7e3d58c9';
const SOURCES: readonly RockSource[] = [
  { key: 'Rock_Medium_1', gltf: 'glTF/Rock_Medium_1.gltf' },
  { key: 'Rock_Medium_2', gltf: 'glTF/Rock_Medium_2.gltf' },
  { key: 'Rock_Medium_3', gltf: 'glTF/Rock_Medium_3.gltf' },
  { key: 'RockPath_Round_Wide', gltf: 'glTF/RockPath_Round_Wide.gltf' },
  { key: 'RockPath_Round_Thin', gltf: 'glTF/RockPath_Round_Thin.gltf' },
];
const TEXTURES = [
  { source: 'glTF/Rocks_Diffuse.png', output: 'rocks.webp', size: 1024 },
  { source: 'glTF/PathRocks_Diffuse.png', output: 'path-rocks.webp', size: 1024 },
  { source: 'glTF/Grass.png', output: 'grass.webp', size: 512 },
] as const;

const execFileAsync = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const cacheDir = resolve(root, 'tools/.cache');
const zipPath = resolve(cacheDir, 'stylized_nature_megakitstandard.zip');
const extractDir = resolve(cacheDir, 'nature-kit-standard');
const rockDir = resolve(root, 'public/packs/testcove/rocks');
const textureDir = resolve(root, 'public/packs/testcove/terrain-textures');
const modulePath = resolve(root, 'src/world/terrain/rock-assets.ts');
const io = new NodeIO();

function sha256(data: Uint8Array): string {
  return createHash('sha256').update(data).digest('hex');
}

async function ensureZip(): Promise<Uint8Array> {
  await mkdir(cacheDir, { recursive: true });
  try {
    const existing = new Uint8Array(await (await import('node:fs/promises')).readFile(zipPath));
    if (sha256(existing) === ZIP_SHA256) return existing;
  } catch {
    // Download below.
  }
  const response = await fetch(ZIP_URL);
  if (!response.ok) throw new Error(`Failed to fetch ${ZIP_URL}: ${response.status}`);
  const data = new Uint8Array(await response.arrayBuffer());
  const actual = sha256(data);
  if (actual !== ZIP_SHA256) throw new Error(`Nature MegaKit sha256 mismatch: ${actual}`);
  await writeFile(zipPath, Buffer.from(data));
  return data;
}

function fmt(values: ArrayLike<number>, digits = 5): string {
  const out: string[] = [];
  for (let i = 0; i < values.length; i++) {
    const v = Number(values[i]);
    out.push(Number.isInteger(v) ? String(v) : Number(v.toFixed(digits)).toString());
  }
  return out.join(',');
}

function appendPrimitive(
  primitive: Primitive,
  positions: number[],
  normals: number[],
  indices: number[],
  baseIndex: number,
): number {
  const position = primitive.getAttribute('POSITION');
  const normal = primitive.getAttribute('NORMAL');
  const index = primitive.getIndices();
  if (!position) throw new Error('Rock primitive has no POSITION');
  const pos = Array.from(position.getArray() as ArrayLike<number>);
  const nor = normal ? Array.from(normal.getArray() as ArrayLike<number>) : new Array(pos.length).fill(0);
  const idx = index
    ? Array.from(index.getArray() as ArrayLike<number>)
    : Array.from({ length: pos.length / 3 }, (_, i) => i);
  positions.push(...pos);
  normals.push(...nor);
  for (const i of idx) indices.push(baseIndex + i);
  return baseIndex + pos.length / 3;
}

function normalizeGeometry(positions: number[]): { cx: number; cy: number; cz: number; scale: number } {
  let minX = Infinity,
    minY = Infinity,
    minZ = Infinity,
    maxX = -Infinity,
    maxY = -Infinity,
    maxZ = -Infinity;
  for (let i = 0; i < positions.length; i += 3) {
    minX = Math.min(minX, positions[i]);
    maxX = Math.max(maxX, positions[i]);
    minY = Math.min(minY, positions[i + 1]);
    maxY = Math.max(maxY, positions[i + 1]);
    minZ = Math.min(minZ, positions[i + 2]);
    maxZ = Math.max(maxZ, positions[i + 2]);
  }
  const cx = (minX + maxX) * 0.5;
  const cy = minY;
  const cz = (minZ + maxZ) * 0.5;
  const scale = 1 / Math.max(maxX - minX, maxY - minY, maxZ - minZ, 1e-6);
  for (let i = 0; i < positions.length; i += 3) {
    positions[i] = (positions[i] - cx) * scale;
    positions[i + 1] = (positions[i + 1] - cy) * scale;
    positions[i + 2] = (positions[i + 2] - cz) * scale;
  }
  return { cx, cy, cz, scale };
}

async function rockArrays(
  gltfPath: string,
): Promise<{ positions: number[]; normals: number[]; indices: number[] }> {
  const doc = await io.read(gltfPath);
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  let base = 0;
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const primitive of mesh.listPrimitives())
      base = appendPrimitive(primitive, positions, normals, indices, base);
  }
  normalizeGeometry(positions);
  return { positions, normals, indices };
}

await ensureZip();
await rm(extractDir, { recursive: true, force: true });
await mkdir(extractDir, { recursive: true });
await rm(rockDir, { recursive: true, force: true });
await rm(textureDir, { recursive: true, force: true });
await mkdir(rockDir, { recursive: true });
await mkdir(textureDir, { recursive: true });

const extractArgs = [
  zipPath,
  ...SOURCES.flatMap((source) => [source.gltf, source.gltf.replace('.gltf', '.bin')]),
  ...TEXTURES.map((t) => t.source),
  '-d',
  extractDir,
];
await execFileAsync('unzip', ['-q', '-o', ...extractArgs]);

const rocks: string[] = [];
const manifestSources: Array<RockSource & { optimizedBytes: number }> = [];
for (const source of SOURCES) {
  const gltfPath = resolve(extractDir, source.gltf);
  const outputPath = resolve(rockDir, `${source.key}.glb`);
  await execFileAsync('npx', [
    'gltf-transform',
    'optimize',
    gltfPath,
    outputPath,
    '--compress',
    'meshopt',
    '--texture-compress',
    'webp',
    '--texture-size',
    '512',
    '--join',
    'false',
    '--weld',
    'false',
  ]);
  const arrays = await rockArrays(gltfPath);
  rocks.push(`  {
    key: '${source.key}',
    positions: new Float32Array([${fmt(arrays.positions)}]),
    normals: new Float32Array([${fmt(arrays.normals)}]),
    indices: new Uint32Array([${fmt(arrays.indices, 0)}]),
  }`);
  manifestSources.push({ ...source, optimizedBytes: (await stat(outputPath)).size });
}

for (const texture of TEXTURES) {
  await execFileAsync('cwebp', [
    '-quiet',
    '-resize',
    String(texture.size),
    String(texture.size),
    resolve(extractDir, texture.source),
    '-o',
    resolve(textureDir, texture.output),
  ]);
}

await writeFile(
  resolve(rockDir, 'manifest.json'),
  `${JSON.stringify(
    {
      version: 2,
      kit: 'Quaternius Stylized Nature MegaKit — Standard',
      source: ZIP_URL,
      sha256: ZIP_SHA256,
      license: 'Public Domain (CC0)',
      sources: manifestSources,
      textures: TEXTURES.map((texture) => texture.output),
    },
    null,
    2,
  )}\n`,
);
await writeFile(
  modulePath,
  `// Generated by tools/terrain/fetch-rocks.ts from Quaternius Stylized Nature MegaKit — Standard (CC0).\n` +
    `export interface RockAsset { key: string; positions: Float32Array; normals: Float32Array; indices: Uint32Array }\n\n` +
    `export const ROCK_ASSETS: readonly RockAsset[] = [\n${rocks.join(',\n')}\n];\n`,
);
console.log(`Built ${SOURCES.length} Nature MegaKit rocks and ${TEXTURES.length} terrain textures.`);
