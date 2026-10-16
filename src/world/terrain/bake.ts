import { packs } from '../../engine/packs';
import { sunState } from '../sky/sun';
import { COVE } from '../layout';
import {
  coveHeight,
  coveMasks,
  DEFAULT_TERRAIN_BOUNDS,
  TERRAIN_DEEP_DEPTH,
  type HeightGridData,
} from './cove-height';
import { clamp01, smoothstep } from '../../util/math';

export interface TerrainBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  cell: number;
}

export interface TerrainBakeSource {
  bounds: TerrainBounds;
  heightAt(x: number, z: number): number;
  masksAt(x: number, z: number): { sand: number; grass: number; rock: number; cliff: number };
}

export interface TerrainPackOptions {
  seabedRadius?: number;
  deepDepth?: number;
  farSeabedRing?: { innerRadius: number; outerRadius: number; segments: number };
}

interface ShorelinePoint {
  x: number;
  z: number;
}

export interface ShorelineChain {
  points: ShorelinePoint[];
  closed: boolean;
  length: number;
}

export interface TerrainBakeData extends HeightGridData {
  maxX: number;
  maxZ: number;
  normals: Float32Array;
  ao: Uint8Array;
  sunMorning: Uint8Array;
  sunGolden: Uint8Array;
  rim: Uint8Array;
  masks: Uint8Array;
  shoreline: ShorelineChain[];
  hash: string;
}

export interface PackedTerrainJson {
  version: 2;
  nx: number;
  nz: number;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  cell: number;
  seabedRadius: number;
  deepDepth: number;
  channels: {
    heights: { offset: number; length: number; type: 'uint16'; components: 1; min: number; max: number };
    packed: {
      offset: number;
      length: number;
      type: 'unorm8';
      components: 8;
      order: ['ao', 'sunMorning', 'sunGolden', 'rim', 'sand', 'grass', 'rock', 'cliff'];
    };
  };
  shoreline: ShorelineChain[];
  farSeabedRing: { innerRadius: number; outerRadius: number; segments: number };
  hash: string;
}

const AO_DIRECTIONS: readonly [number, number][] = [
  [1, 0],
  [0.5, 0.8660254038],
  [-0.5, 0.8660254038],
  [-1, 0],
  [-0.5, -0.8660254038],
  [0.5, -0.8660254038],
];

/** The two baked suns (morning and golden hour), shared with the chart's miniatures. */
export const SUNS = [sunState(10).sun, sunState(16.5).sun] as const;

function gridIndex(nx: number, ix: number, iz: number): number {
  return iz * nx + ix;
}

function sampleGrid(
  heights: Float32Array,
  nx: number,
  nz: number,
  minX: number,
  minZ: number,
  cell: number,
  x: number,
  z: number,
): number {
  const gx = (x - minX) / cell;
  const gz = (z - minZ) / cell;
  if (gx < 0 || gz < 0 || gx > nx - 1 || gz > nz - 1) return coveHeight(x, z);
  const ix = Math.min(nx - 2, Math.max(0, Math.floor(gx)));
  const iz = Math.min(nz - 2, Math.max(0, Math.floor(gz)));
  const tx = gx - ix;
  const tz = gz - iz;
  const i00 = gridIndex(nx, ix, iz);
  const i10 = i00 + 1;
  const i01 = i00 + nx;
  const i11 = i01 + 1;
  const a = heights[i00] + (heights[i10] - heights[i00]) * tx;
  const b = heights[i01] + (heights[i11] - heights[i01]) * tx;
  return a + (b - a) * tz;
}

export function normalFromGrid(
  heights: Float32Array,
  nx: number,
  nz: number,
  minX: number,
  minZ: number,
  cell: number,
  ix: number,
  iz: number,
  out: Float32Array,
  offset: number,
): void {
  const x = minX + ix * cell;
  const z = minZ + iz * cell;
  const hx0 = sampleGrid(heights, nx, nz, minX, minZ, cell, x - cell, z);
  const hx1 = sampleGrid(heights, nx, nz, minX, minZ, cell, x + cell, z);
  const hz0 = sampleGrid(heights, nx, nz, minX, minZ, cell, x, z - cell);
  const hz1 = sampleGrid(heights, nx, nz, minX, minZ, cell, x, z + cell);
  const sx = -(hx1 - hx0) / (2 * cell);
  const sz = -(hz1 - hz0) / (2 * cell);
  const len = Math.hypot(sx, 1, sz) || 1;
  out[offset] = sx / len;
  out[offset + 1] = 1 / len;
  out[offset + 2] = sz / len;
}

export function ambientOpenSky(
  heights: Float32Array,
  nx: number,
  nz: number,
  minX: number,
  minZ: number,
  cell: number,
  x: number,
  z: number,
  h: number,
): number {
  let occlusion = 0;
  for (const [dx, dz] of AO_DIRECTIONS) {
    let horizon = 0;
    for (let s = 3; s <= 36; s += 5.5) {
      const sh = sampleGrid(heights, nx, nz, minX, minZ, cell, x + dx * s, z + dz * s);
      horizon = Math.max(horizon, (sh - h) / s);
    }
    occlusion += clamp01((horizon - 0.04) * 1.8);
  }
  return clamp01(1 - (occlusion / AO_DIRECTIONS.length) * 0.72);
}

export function sunVisibility(
  heights: Float32Array,
  nx: number,
  nz: number,
  minX: number,
  minZ: number,
  cell: number,
  x: number,
  z: number,
  h: number,
  sun: readonly [number, number, number],
): number {
  if (sun[1] <= 0.015) return 0;
  const horizontal = Math.hypot(sun[0], sun[2]);
  if (horizontal < 0.001) return 1;
  const dx = sun[0] / horizontal;
  const dz = sun[2] / horizontal;
  const slope = sun[1] / horizontal;
  let visibility = 1;
  for (let s = 5; s <= 190; s *= 1.24) {
    const rayY = h + 0.8 + slope * s;
    const terrainY = sampleGrid(heights, nx, nz, minX, minZ, cell, x + dx * s, z + dz * s);
    const clearance = rayY - terrainY;
    visibility = Math.min(visibility, smoothstep(-0.7, 2.6, clearance));
    if (visibility <= 0.02) return 0;
  }
  return clamp01(visibility);
}

export function rimFlag(
  heights: Float32Array,
  normals: Float32Array,
  nx: number,
  nz: number,
  minX: number,
  minZ: number,
  cell: number,
  ix: number,
  iz: number,
): number {
  const i = gridIndex(nx, ix, iz);
  const h = heights[i];
  if (h < 3) return 0;
  const nOff = i * 3;
  const slope = Math.hypot(normals[nOff], normals[nOff + 2]);
  const x = minX + ix * cell;
  const z = minZ + iz * cell;
  let drop = 0;
  for (const [dx, dz] of AO_DIRECTIONS) {
    const sample = sampleGrid(heights, nx, nz, minX, minZ, cell, x + dx * 24, z + dz * 24);
    drop = Math.max(drop, h - sample);
  }
  // Only real skyline edges glow (the headland used to get a flat bonus, which lit its whole grassy top
  // gold whenever the sun was behind it).
  return clamp01(smoothstep(6, 22, drop) * smoothstep(0.16, 0.6, slope));
}

function edgePoint(x0: number, z0: number, h0: number, x1: number, z1: number, h1: number): ShorelinePoint {
  const t = h0 === h1 ? 0.5 : clamp01((0 - h0) / (h1 - h0));
  return { x: x0 + (x1 - x0) * t, z: z0 + (z1 - z0) * t };
}

interface Segment {
  a: ShorelinePoint;
  b: ShorelinePoint;
}

function keyPoint(p: ShorelinePoint): string {
  return `${Math.round(p.x * 1000)}:${Math.round(p.z * 1000)}`;
}

function chainLength(points: ShorelinePoint[]): number {
  let len = 0;
  for (let i = 1; i < points.length; i++)
    len += Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z);
  return len;
}

function appendConnected(chain: ShorelinePoint[], point: ShorelinePoint, atStart: boolean): void {
  if (atStart) chain.unshift(point);
  else chain.push(point);
}

export function extractShoreline(
  heights: Float32Array,
  nx: number,
  nz: number,
  minX: number,
  minZ: number,
  cell: number,
): ShorelineChain[] {
  const segments: Segment[] = [];
  for (let iz = 0; iz < nz - 1; iz++) {
    for (let ix = 0; ix < nx - 1; ix++) {
      const x = minX + ix * cell;
      const z = minZ + iz * cell;
      const i00 = gridIndex(nx, ix, iz);
      const h00 = heights[i00];
      const h10 = heights[i00 + 1];
      const h11 = heights[i00 + 1 + nx];
      const h01 = heights[i00 + nx];
      const crossings: ShorelinePoint[] = [];
      if (h00 >= 0 !== h10 >= 0) crossings.push(edgePoint(x, z, h00, x + cell, z, h10));
      if (h10 >= 0 !== h11 >= 0) crossings.push(edgePoint(x + cell, z, h10, x + cell, z + cell, h11));
      if (h11 >= 0 !== h01 >= 0) crossings.push(edgePoint(x + cell, z + cell, h11, x, z + cell, h01));
      if (h01 >= 0 !== h00 >= 0) crossings.push(edgePoint(x, z + cell, h01, x, z, h00));
      if (crossings.length === 2) segments.push({ a: crossings[0], b: crossings[1] });
      else if (crossings.length === 4) {
        segments.push({ a: crossings[0], b: crossings[1] }, { a: crossings[2], b: crossings[3] });
      }
    }
  }

  const unused = new Set(segments.map((_, i) => i));
  const endpointToSegments = new Map<string, number[]>();
  segments.forEach((seg, i) => {
    for (const p of [seg.a, seg.b]) {
      const k = keyPoint(p);
      const list = endpointToSegments.get(k);
      if (list) list.push(i);
      else endpointToSegments.set(k, [i]);
    }
  });

  const chains: ShorelineChain[] = [];
  while (unused.size > 0) {
    const first = unused.values().next().value as number;
    unused.delete(first);
    const chain = [segments[first].a, segments[first].b];
    let grew = true;
    while (grew) {
      grew = false;
      for (const atStart of [false, true]) {
        const end = atStart ? chain[0] : chain[chain.length - 1];
        const connected = endpointToSegments.get(keyPoint(end)) ?? [];
        const nextId = connected.find((id) => unused.has(id));
        if (nextId === undefined) continue;
        unused.delete(nextId);
        const seg = segments[nextId];
        const next = keyPoint(seg.a) === keyPoint(end) ? seg.b : seg.a;
        appendConnected(chain, next, atStart);
        grew = true;
      }
    }
    const closed =
      Math.hypot(chain[0].x - chain[chain.length - 1].x, chain[0].z - chain[chain.length - 1].z) < cell * 1.5;
    if (closed && keyPoint(chain[0]) !== keyPoint(chain[chain.length - 1])) chain.push({ ...chain[0] });
    const length = chainLength(chain);
    if (chain.length >= 4 && length > 8) chains.push({ points: chain, closed, length });
  }
  chains.sort((a, b) => b.length - a.length);
  return chains;
}

export function bakeTerrainFrom(source: TerrainBakeSource): TerrainBakeData {
  const { bounds } = source;
  const nx = Math.round((bounds.maxX - bounds.minX) / bounds.cell) + 1;
  const nz = Math.round((bounds.maxZ - bounds.minZ) / bounds.cell) + 1;
  const count = nx * nz;
  const heights = new Float32Array(count);
  const normals = new Float32Array(count * 3);
  const ao = new Uint8Array(count);
  const sunMorning = new Uint8Array(count);
  const sunGolden = new Uint8Array(count);
  const rim = new Uint8Array(count);
  const masks = new Uint8Array(count * 4);

  for (let iz = 0; iz < nz; iz++) {
    const z = bounds.minZ + iz * bounds.cell;
    for (let ix = 0; ix < nx; ix++) {
      const x = bounds.minX + ix * bounds.cell;
      heights[gridIndex(nx, ix, iz)] = source.heightAt(x, z);
    }
  }

  for (let iz = 0; iz < nz; iz++) {
    const z = bounds.minZ + iz * bounds.cell;
    for (let ix = 0; ix < nx; ix++) {
      const x = bounds.minX + ix * bounds.cell;
      const i = gridIndex(nx, ix, iz);
      normalFromGrid(heights, nx, nz, bounds.minX, bounds.minZ, bounds.cell, ix, iz, normals, i * 3);
      const h = heights[i];
      ao[i] = Math.round(
        ambientOpenSky(heights, nx, nz, bounds.minX, bounds.minZ, bounds.cell, x, z, h) * 255,
      );
      sunMorning[i] = Math.round(
        sunVisibility(heights, nx, nz, bounds.minX, bounds.minZ, bounds.cell, x, z, h, SUNS[0]) * 255,
      );
      sunGolden[i] = Math.round(
        sunVisibility(heights, nx, nz, bounds.minX, bounds.minZ, bounds.cell, x, z, h, SUNS[1]) * 255,
      );
      rim[i] = Math.round(
        rimFlag(heights, normals, nx, nz, bounds.minX, bounds.minZ, bounds.cell, ix, iz) * 255,
      );
      const m = source.masksAt(x, z);
      const mo = i * 4;
      masks[mo] = Math.round(m.sand * 255);
      masks[mo + 1] = Math.round(m.grass * 255);
      masks[mo + 2] = Math.round(m.rock * 255);
      masks[mo + 3] = Math.round(m.cliff * 255);
    }
  }

  const shoreline = extractShoreline(heights, nx, nz, bounds.minX, bounds.minZ, bounds.cell);
  const data: TerrainBakeData = {
    heights,
    nx,
    nz,
    minX: bounds.minX,
    minZ: bounds.minZ,
    cell: bounds.cell,
    maxX: bounds.maxX,
    maxZ: bounds.maxZ,
    normals,
    ao,
    sunMorning,
    sunGolden,
    rim,
    masks,
    shoreline,
    hash: '',
  };
  const { binary, json } = packTerrain(data, '');
  data.hash = hashTerrainPack(binary, json);
  return data;
}

export function bakeTerrain(bounds: TerrainBounds = DEFAULT_TERRAIN_BOUNDS): TerrainBakeData {
  return bakeTerrainFrom({ bounds, heightAt: coveHeight, masksAt: coveMasks });
}

export function packTerrain(
  data: TerrainBakeData,
  hash = data.hash,
  options: TerrainPackOptions = {},
): { binary: ArrayBuffer; json: PackedTerrainJson } {
  const count = data.nx * data.nz;
  const heightsBytes = count * 2;
  const packedBytes = count * 8;
  let minHeight = Infinity;
  let maxHeight = -Infinity;
  for (const h of data.heights) {
    minHeight = Math.min(minHeight, h);
    maxHeight = Math.max(maxHeight, h);
  }
  const heightRange = Math.max(1e-6, maxHeight - minHeight);
  const binary = new ArrayBuffer(heightsBytes + packedBytes);
  const heightsView = new Uint16Array(binary, 0, count);
  for (let i = 0; i < count; i++)
    heightsView[i] = Math.max(
      0,
      Math.min(65535, Math.round(((data.heights[i] - minHeight) / heightRange) * 65535)),
    );
  const packedView = new Uint8Array(binary, heightsBytes, packedBytes);
  for (let i = 0; i < count; i++) {
    const o = i * 8;
    const mo = i * 4;
    packedView[o] = data.ao[i];
    packedView[o + 1] = data.sunMorning[i];
    packedView[o + 2] = data.sunGolden[i];
    packedView[o + 3] = data.rim[i];
    packedView[o + 4] = data.masks[mo];
    packedView[o + 5] = data.masks[mo + 1];
    packedView[o + 6] = data.masks[mo + 2];
    packedView[o + 7] = data.masks[mo + 3];
  }
  const shoreline = data.shoreline.map((chain) => {
    const points = chain.points
      .filter((_, i) => i % 3 === 0 || i === chain.points.length - 1)
      .map((p) => ({
        x: Math.round(p.x * 100) / 100,
        z: Math.round(p.z * 100) / 100,
      }));
    if (
      chain.closed &&
      (points[0].x !== points[points.length - 1].x || points[0].z !== points[points.length - 1].z)
    )
      points.push({ ...points[0] });
    return { points, closed: chain.closed, length: Math.round(chain.length * 100) / 100 };
  });
  const json: PackedTerrainJson = {
    version: 2,
    nx: data.nx,
    nz: data.nz,
    minX: data.minX,
    maxX: data.maxX,
    minZ: data.minZ,
    maxZ: data.maxZ,
    cell: data.cell,
    seabedRadius: options.seabedRadius ?? COVE.seabedRadius,
    deepDepth: options.deepDepth ?? TERRAIN_DEEP_DEPTH,
    channels: {
      heights: {
        offset: 0,
        length: heightsBytes,
        type: 'uint16',
        components: 1,
        min: minHeight,
        max: maxHeight,
      },
      packed: {
        offset: heightsBytes,
        length: packedBytes,
        type: 'unorm8',
        components: 8,
        order: ['ao', 'sunMorning', 'sunGolden', 'rim', 'sand', 'grass', 'rock', 'cliff'],
      },
    },
    shoreline,
    farSeabedRing: options.farSeabedRing ?? {
      innerRadius: 390,
      outerRadius: COVE.seabedRadius,
      segments: 144,
    },
    hash,
  };
  return { binary, json };
}

function fnv1aBytes(bytes: Uint8Array, hash = 0x811c9dc5): number {
  let h = hash >>> 0;
  for (const b of bytes) {
    h ^= b;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export function hashTerrainPack(
  binary: ArrayBuffer,
  json: Omit<PackedTerrainJson, 'hash'> | PackedTerrainJson,
): string {
  const jsonForHash = { ...json, hash: '' };
  const text = JSON.stringify(jsonForHash);
  let h = fnv1aBytes(new Uint8Array(binary));
  const textBytes = new TextEncoder().encode(text);
  h = fnv1aBytes(textBytes, h);
  return h.toString(16).padStart(8, '0');
}

export function terrainDataFromPack(json: PackedTerrainJson, binary: ArrayBuffer): TerrainBakeData {
  const count = json.nx * json.nz;
  const heightPacked = new Uint16Array(binary, json.channels.heights.offset, count);
  const heights = new Float32Array(count);
  const heightRange = json.channels.heights.max - json.channels.heights.min;
  for (let i = 0; i < count; i++)
    heights[i] = json.channels.heights.min + (heightPacked[i] / 65535) * heightRange;
  const normals = new Float32Array(count * 3);
  for (let iz = 0; iz < json.nz; iz++) {
    for (let ix = 0; ix < json.nx; ix++)
      normalFromGrid(
        heights,
        json.nx,
        json.nz,
        json.minX,
        json.minZ,
        json.cell,
        ix,
        iz,
        normals,
        (iz * json.nx + ix) * 3,
      );
  }
  const packed = new Uint8Array(binary, json.channels.packed.offset, count * 8);
  const ao = new Uint8Array(count);
  const sunMorning = new Uint8Array(count);
  const sunGolden = new Uint8Array(count);
  const rim = new Uint8Array(count);
  const masks = new Uint8Array(count * 4);
  for (let i = 0; i < count; i++) {
    const o = i * 8;
    const mo = i * 4;
    ao[i] = packed[o];
    sunMorning[i] = packed[o + 1];
    sunGolden[i] = packed[o + 2];
    rim[i] = packed[o + 3];
    masks[mo] = packed[o + 4];
    masks[mo + 1] = packed[o + 5];
    masks[mo + 2] = packed[o + 6];
    masks[mo + 3] = packed[o + 7];
  }
  return {
    heights,
    nx: json.nx,
    nz: json.nz,
    minX: json.minX,
    minZ: json.minZ,
    maxX: json.maxX,
    maxZ: json.maxZ,
    cell: json.cell,
    normals,
    ao,
    sunMorning,
    sunGolden,
    rim,
    masks,
    shoreline: json.shoreline,
    hash: json.hash,
  };
}

/** `priority: 'low'` for loads nothing waits on yet (see PackLoader.prefetch). */
export async function loadTerrainPack(
  baseUrl = '/packs/testcove/terrain',
  priority: RequestPriority = 'auto',
): Promise<TerrainBakeData> {
  const [jsonResponse, binResponse] = await Promise.all([
    fetch(packs.url(`${baseUrl}.json`), { priority }),
    fetch(packs.url(`${baseUrl}.bin`), { priority }),
  ]);
  if (!jsonResponse.ok) throw new Error(`Failed to load terrain JSON: ${jsonResponse.status}`);
  if (!binResponse.ok) throw new Error(`Failed to load terrain binary: ${binResponse.status}`);
  const json = (await jsonResponse.json()) as PackedTerrainJson;
  const binary = await binResponse.arrayBuffer();
  return terrainDataFromPack(json, binary);
}
