import type { Tier } from '../contracts';
import { LION_HEAD_LODS, type LionHeadLod } from './lion-head-data';
import type { MeshBuilder } from './mesh-builder';

interface DecodedLionLod {
  source: LionHeadLod;
  positions: Int16Array;
  normals: Int8Array;
  indices: Uint16Array | Uint32Array;
}

const decoded = new Map<LionHeadLod, DecodedLionLod>();

function decodeBase64(data: string): Uint8Array {
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function decode(lod: LionHeadLod): DecodedLionLod {
  const cached = decoded.get(lod);
  if (cached) return cached;
  const pBytes = decodeBase64(lod.positions);
  const nBytes = decodeBase64(lod.normals);
  const iBytes = decodeBase64(lod.indices);
  const out: DecodedLionLod = {
    source: lod,
    positions: new Int16Array(pBytes.buffer),
    normals: new Int8Array(nBytes.buffer),
    indices: lod.indexType === 'u32' ? new Uint32Array(iBytes.buffer) : new Uint16Array(iBytes.buffer),
  };
  decoded.set(lod, out);
  return out;
}

function lodForTier(tier: Tier): LionHeadLod {
  if (tier === 'lite') return LION_HEAD_LODS.lite;
  if (tier === 'low') return LION_HEAD_LODS.low;
  if (tier === 'medium') return LION_HEAD_LODS.medium;
  return LION_HEAD_LODS.high;
}

export function addLionHeadFigurehead(builder: MeshBuilder, tier: Tier): void {
  const lod = decode(lodForTier(tier));
  const base = builder.positions.length / 3;
  const center = lod.source.center;
  const radius = lod.source.radius;
  const sx = 3.3;
  const sy = 3.05;
  const sz = 4.7;
  const yBase = 1.03;
  const zBase = 13.32;
  for (let i = 0; i < lod.source.vertices; i++) {
    const p = i * 3;
    const x0 = center[0] + (lod.positions[p]! / 32767) * radius;
    const y0 = center[1] + (lod.positions[p + 1]! / 32767) * radius;
    const z0 = center[2] + (lod.positions[p + 2]! / 32767) * radius;
    const nx = lod.normals[p]! / 127;
    const ny = lod.normals[p + 1]! / 127;
    const nz = lod.normals[p + 2]! / 127;
    const yNorm = Math.max(0, Math.min(1, y0 / 0.43636));
    const face = Math.max(0, nz);
    const sideRecess = Math.abs(nx) * 0.04;
    const recess = Math.max(0, -nz) * 0.18 + Math.max(0, -ny) * 0.08;
    const shade = Math.max(0.42, Math.min(1.05, 0.66 + face * 0.2 + yNorm * 0.08 - recess - sideRecess));
    builder.positions.push(x0 * sx, yBase + y0 * sy, zBase + z0 * sz + y0 * 0.58);
    builder.uvs.push(0, 0);
    builder.colors.push(shade * 1.05, shade * 0.86, shade * 0.42);
    builder.regions.push(3);
  }
  for (let i = 0; i < lod.indices.length; i += 3) {
    builder.indices.push(base + lod.indices[i]!, base + lod.indices[i + 1]!, base + lod.indices[i + 2]!);
  }

  builder.setRegion(3);
  builder.setColor(0xc79331);
  builder.addCylinderBetween({ x: -0.36, y: 1.14, z: 12.55 }, { x: -0.18, y: 1.44, z: 13.42 }, 0.085, 10, {
    endRadius: 0.04,
  });
  builder.addCylinderBetween({ x: 0.36, y: 1.14, z: 12.55 }, { x: 0.18, y: 1.44, z: 13.42 }, 0.085, 10, {
    endRadius: 0.04,
  });
  builder.addBox(0, 1.02, 12.75, 0.82, 0.16, 0.28);
}
