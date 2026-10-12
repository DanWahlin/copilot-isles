import { BufferAttribute, BufferGeometry, Mesh, type Material } from 'three/webgpu';
import type { Tier } from '../contracts';
import { packs } from '../../engine/packs';
import { LION_HEAD_ASSETS, type LionHeadAsset } from './lion-head-assets';

interface DecodedLionAsset {
  geometry: BufferGeometry;
  triangles: number;
}

const cache = new Map<string, Promise<DecodedLionAsset>>();
const MAGIC = 'CILION1\0';

function assetForTier(tier: Tier): LionHeadAsset {
  if (tier === 'lite') return LION_HEAD_ASSETS.lite;
  if (tier === 'low') return LION_HEAD_ASSETS.low;
  if (tier === 'medium') return LION_HEAD_ASSETS.medium;
  return LION_HEAD_ASSETS.high;
}

function align2(n: number): number {
  return n + (n & 1);
}

function decodeGeometry(buffer: ArrayBuffer, asset: LionHeadAsset): DecodedLionAsset {
  const view = new DataView(buffer);
  let magic = '';
  for (let i = 0; i < 8; i++) magic += String.fromCharCode(view.getUint8(i));
  if (magic !== MAGIC) throw new Error(`Invalid lion figurehead asset: ${magic}`);
  const vertices = view.getUint32(8, true);
  const indexCount = view.getUint32(12, true);
  const posOffset = 16;
  const normalOffset = posOffset + vertices * 3 * 2;
  const indexOffset = align2(normalOffset + vertices * 3);
  const positions = new Float32Array(vertices * 3);
  const normals = new Float32Array(vertices * 3);
  const colors = new Float32Array(vertices * 3);
  const regions = new Float32Array(vertices);
  const uvs = new Float32Array(vertices * 2);
  const center = asset.center;
  const radius = asset.radius;
  const sx = 3.3;
  const sy = 3.05;
  const sz = 4.7;
  const yBase = 1.03;
  const zBase = 13.32;
  for (let i = 0; i < vertices; i++) {
    const p = i * 3;
    const src = posOffset + p * 2;
    const nsrc = normalOffset + p;
    const x0 = center[0] + (view.getInt16(src, true) / 32767) * radius;
    const y0 = center[1] + (view.getInt16(src + 2, true) / 32767) * radius;
    const z0 = center[2] + (view.getInt16(src + 4, true) / 32767) * radius;
    const nx = view.getInt8(nsrc) / 127;
    const ny = view.getInt8(nsrc + 1) / 127;
    const nz = view.getInt8(nsrc + 2) / 127;
    const yNorm = Math.max(0, Math.min(1, y0 / 0.43636));
    const face = Math.max(0, nz);
    const sideRecess = Math.abs(nx) * 0.04;
    const recess = Math.max(0, -nz) * 0.18 + Math.max(0, -ny) * 0.08;
    const shade = Math.max(0.42, Math.min(1.05, 0.66 + face * 0.2 + yNorm * 0.08 - recess - sideRecess));
    positions[p] = x0 * sx;
    positions[p + 1] = yBase + y0 * sy;
    positions[p + 2] = zBase + z0 * sz + y0 * 0.58;
    normals[p] = nx;
    normals[p + 1] = ny;
    normals[p + 2] = nz;
    colors[p] = shade * 1.05;
    colors[p + 1] = shade * 0.86;
    colors[p + 2] = shade * 0.42;
    regions[i] = 3;
  }
  const indices = new Uint16Array(indexCount);
  for (let i = 0; i < indexCount; i++) indices[i] = view.getUint16(indexOffset + i * 2, true);
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new BufferAttribute(uvs, 2));
  geometry.setAttribute('color', new BufferAttribute(colors, 3));
  geometry.setAttribute('shipRegion', new BufferAttribute(regions, 1));
  geometry.setIndex(new BufferAttribute(indices, 1));
  geometry.computeBoundingSphere();
  return { geometry, triangles: indexCount / 3 };
}

function loadAsset(tier: Tier): Promise<DecodedLionAsset> {
  const asset = assetForTier(tier);
  const cached = cache.get(asset.file);
  if (cached) return cached;
  const promise = packs
    .loadManifest()
    .then(() => packs.prefetch(`testcove/ship/lion-${tier === 'ultra' ? 'high' : tier}`))
    .catch(() => undefined)
    .then(() => fetch(packs.url(asset.file)))
    .then((response) => {
      if (!response.ok) throw new Error(`Lion figurehead asset failed: HTTP ${response.status}`);
      return response.arrayBuffer();
    })
    .then((buffer) => decodeGeometry(buffer, asset));
  cache.set(asset.file, promise);
  return promise;
}

export function loadLionHeadFigurehead(tier: Tier, material: Material): Promise<Mesh> {
  return loadAsset(tier).then(({ geometry }) => {
    // Each ship owns its copy: the opening's ship frees its figurehead when the opening ends, and a
    // shared geometry would then upload again for your ship mid-play (a hitch).
    const mesh = new Mesh(geometry.clone(), material);
    mesh.name = 'gilded CC0 lion figurehead';
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  });
}
