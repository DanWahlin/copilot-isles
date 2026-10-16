#!/usr/bin/env node
// Adds KTX2 (Basis ETC1S) copies of the village kit's roughness / ORM maps (PLAN §12.7): they stay
// compressed on the GPU (BC / ETC2 / ASTC, ~0.7 MB a 1024² map with mips instead of 5.3 MB RGBA8).
// Each texture keeps its WebP as the fallback: `KHR_texture_basisu` is used, not required, so if the
// Basis transcoder can't load (offline, a worker failure) three's GLTFLoader takes the WebP and the
// world still starts. Roughness is low-frequency and linear, so ETC1S at full quality doesn't show;
// the base colour and normal maps stay WebP only (ETC1S would show on them at High's gameplay
// distances, and UASTC would add megabytes to the download). The GLB is edited in place (only the
// new images and the extension are added), so the meshes stay byte for byte as tools/village/fetch.sh
// wrote them. Needs KTX-Software's `ktx` (npm run toolchain).
//   node tools/village/ktx-roughness.mjs [--in=public/packs/testcove/village/kit.glb] [--out=<same>]
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { parseFlags } from '../lib/browser.mjs';

const opt = parseFlags();
const root = new URL('../..', import.meta.url).pathname;
const input = opt.in || join(root, 'public/packs/testcove/village/kit.glb');
const output = opt.out || input;
const localKtx = join(root, '.tools/ktx/bin/ktx');
const ktx = existsSync(localKtx) ? localKtx : 'ktx';
const BASISU = 'KHR_texture_basisu';

const glb = readFileSync(input);
if (glb.readUInt32LE(0) !== 0x46546c67) throw new Error(`${input} isn't a GLB`);
const jsonLength = glb.readUInt32LE(12);
const json = JSON.parse(glb.subarray(20, 20 + jsonLength).toString('utf8'));
const binStart = 20 + jsonLength + 8;
const binLength = glb.readUInt32LE(20 + jsonLength);
const bin = glb.subarray(binStart, binStart + binLength);
let binSize = json.buffers[0].byteLength;
// The buffer's own bytes (the chunk may carry up to 3 bytes of padding after them).
const chunks = [bin.subarray(0, binSize)];
const pad4 = (n) => (n + 3) & ~3;

/** The image a texture shows (its WebP, else its plain source). */
const sourceOf = (t) => t.extensions?.EXT_texture_webp?.source ?? t.source;
const roughness = new Set();
for (const m of json.materials ?? []) {
  const i = m.pbrMetallicRoughness?.metallicRoughnessTexture?.index;
  if (i !== undefined) roughness.add(i);
}

// Scratch under the repo's ignored tools cache (never /tmp).
const scratch = mkdtempSync(join(root, 'tools/.cache-ktx-'));
let added = 0;
let bytesWebp = 0;
try {
  for (const ti of roughness) {
    const t = json.textures[ti];
    if (t.extensions?.[BASISU]) continue;
    const image = json.images[sourceOf(t)];
    const view = json.bufferViews[image.bufferView];
    const bytes = bin.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength);
    bytesWebp += bytes.byteLength;
    const name = (image.name || `roughness-${ti}`).replace(/[^\w-]/g, '_');
    const png = join(scratch, `${name}.png`);
    const out = join(scratch, `${name}.ktx2`);
    writeFileSync(png, await sharp(bytes).removeAlpha().png().toBuffer());
    execFileSync(ktx, [
      'create',
      '--format',
      'R8G8B8_UNORM',
      '--assign-tf',
      'linear',
      '--encode',
      'basis-lz',
      '--qlevel',
      '255',
      '--clevel',
      '5',
      '--generate-mipmap',
      png,
      out,
    ]);
    const data = readFileSync(out);
    // Appended to the GLB's binary chunk, 4-byte aligned.
    const offset = pad4(binSize);
    if (offset > binSize) chunks.push(Buffer.alloc(offset - binSize));
    chunks.push(data);
    binSize = offset + data.byteLength;
    json.bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: data.byteLength });
    json.images.push({
      name: `${image.name ?? name}.ktx2`,
      mimeType: 'image/ktx2',
      bufferView: json.bufferViews.length - 1,
    });
    t.extensions = { ...t.extensions, [BASISU]: { source: json.images.length - 1 } };
    added += data.byteLength;
    console.log(`${image.name}: ${(data.byteLength / 1024).toFixed(0)} KB KTX2 (WebP kept as the fallback)`);
  }
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
json.extensionsUsed = [...new Set([...(json.extensionsUsed ?? []), BASISU])];
// Used, never required: without a transcoder the WebP is taken.
json.extensionsRequired = (json.extensionsRequired ?? []).filter((e) => e !== BASISU);

// The BIN chunk is the original bytes and the appended images, padded to 4.
const padded = pad4(binSize);
if (padded > binSize) chunks.push(Buffer.alloc(padded - binSize));
json.buffers[0].byteLength = binSize;
let jsonText = Buffer.from(JSON.stringify(json), 'utf8');
if (jsonText.length % 4) jsonText = Buffer.concat([jsonText, Buffer.alloc(4 - (jsonText.length % 4), 0x20)]);
const binData = Buffer.concat(chunks).subarray(0, padded);
const header = Buffer.alloc(12);
header.writeUInt32LE(0x46546c67, 0);
header.writeUInt32LE(2, 4);
header.writeUInt32LE(12 + 8 + jsonText.length + 8 + binData.length, 8);
const jsonHeader = Buffer.alloc(8);
jsonHeader.writeUInt32LE(jsonText.length, 0);
jsonHeader.writeUInt32LE(0x4e4f534a, 4);
const binHeader = Buffer.alloc(8);
binHeader.writeUInt32LE(binData.length, 0);
binHeader.writeUInt32LE(0x004e4942, 4);
writeFileSync(output, Buffer.concat([header, jsonHeader, jsonText, binHeader, binData]));
console.log(
  `roughness maps: ${roughness.size}, ${(bytesWebp / 1024).toFixed(0)} KB WebP kept + ${(added / 1024).toFixed(0)} KB KTX2`,
);
