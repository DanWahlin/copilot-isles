import {
  BufferAttribute,
  BufferGeometry,
  Euler,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  Quaternion,
  Vector3,
} from 'three/webgpu';
import type { HeightField } from '../contracts';
import { COVE } from '../layout';
import { smoothstep } from './cove-height';
import { ROCK_ASSETS } from './rock-assets';
import { createRockMaterial } from './terrain-material';

interface RockInstance {
  asset: number;
  x: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
  yaw: number;
  pitch?: number;
  roll?: number;
  y?: number;
  yOffset?: number;
}

export interface TerrainRockStats {
  drawCalls: number;
  instances: number;
  triangles: number;
  byAsset: Array<{ key: string; instances: number; triangles: number }>;
}

const ROCK_VARIANTS = Math.min(3, ROCK_ASSETS.length);
const STOREHOUSE_EAST_PAD = { x0: -71, x1: -53, z0: -75, z1: -51 };
const SEA_STACK_RADIAL_SEGMENTS = 44;
const SEA_STACK_VERTICAL_SEGMENTS = 24;
const SEA_STACK_CORE_TRIANGLES =
  SEA_STACK_RADIAL_SEGMENTS * SEA_STACK_VERTICAL_SEGMENTS * 2 + SEA_STACK_RADIAL_SEGMENTS;

function fract(v: number): number {
  return v - Math.floor(v);
}

function rand(seed: number): number {
  return fract(Math.sin(seed * 12.9898 + 78.233) * 43758.5453);
}

function rockAsset(seed: number): number {
  return Math.floor(rand(seed) * ROCK_VARIANTS) % ROCK_VARIANTS;
}

function inBlockedPad(r: RockInstance): boolean {
  return (
    r.x >= STOREHOUSE_EAST_PAD.x0 &&
    r.x <= STOREHOUSE_EAST_PAD.x1 &&
    r.z >= STOREHOUSE_EAST_PAD.z0 &&
    r.z <= STOREHOUSE_EAST_PAD.z1
  );
}

function headlandBaseRocks(out: RockInstance[]): void {
  for (let i = 0; i < 26; i++) {
    const t = i / 25;
    const z =
      COVE.headland.z0 - 10 + t * (COVE.headland.z1 - COVE.headland.z0 + 22) + (rand(i + 4) - 0.5) * 8;
    const x = 203 + Math.sin(t * Math.PI * 2.5) * 2 + rand(i + 20) * 9;
    const s = 3.8 + rand(i + 1) * 7.5;
    out.push({
      asset: rockAsset(i + 2),
      x,
      z,
      sx: s * (1.45 + rand(i + 8) * 1.25),
      sy: s * (0.7 + rand(i + 9) * 0.8),
      sz: s * (1.0 + rand(i + 10) * 1.25),
      yaw: rand(i + 11) * Math.PI * 2,
      pitch: (rand(i + 12) - 0.5) * 0.2,
      roll: (rand(i + 13) - 0.5) * 0.26,
      yOffset: -1.9 - rand(i + 14) * 1.25,
    });
  }
}

function headlandCliffFaceRocks(out: RockInstance[]): void {
  for (let col = 0; col < 8; col++) {
    const zBase = COVE.headland.z0 - 4 + (col / 7) * (COVE.headland.z1 - COVE.headland.z0 + 8);
    const columnLean = (rand(col + 130) - 0.5) * 5.5;
    for (let layer = 0; layer < 5; layer++) {
      const seed = 1000 + col * 31 + layer * 7;
      const y = -2 + layer * 6.4 + rand(seed + 1) * 1.7;
      const s = 7.5 + rand(seed + 2) * 5.5;
      out.push({
        asset: rockAsset(seed),
        x: 197 + columnLean + rand(seed + 3) * 10,
        z: zBase + (rand(seed + 4) - 0.5) * 9,
        y,
        sx: s * (1.45 + rand(seed + 5) * 0.9),
        sy: s * (0.9 + rand(seed + 6) * 0.62),
        sz: s * (0.78 + rand(seed + 7) * 0.62),
        yaw: Math.PI * 0.46 + (rand(seed + 8) - 0.5) * 1.8,
        pitch: -0.08 + (rand(seed + 9) - 0.5) * 0.32,
        roll: (rand(seed + 10) - 0.5) * 0.36,
      });
    }
  }

  for (let col = 0; col < 8; col++) {
    const xBase = 122 + (col / 7) * 82;
    const zBase = COVE.headland.z1 + 1.5 + (rand(col + 1760) - 0.5) * 3;
    for (let layer = 0; layer < 2; layer++) {
      const seed = 1600 + col * 37 + layer * 11;
      const y = -1.8 + layer * 6.5 + rand(seed + 1) * 1.1;
      const s = 4.9 + rand(seed + 2) * 3.1;
      out.push({
        asset: rockAsset(seed),
        x: xBase + (rand(seed + 3) - 0.5) * 8,
        z: zBase + rand(seed + 4) * 3.5,
        y,
        sx: s * (1.1 + rand(seed + 5) * 0.55),
        sy: s * (0.66 + rand(seed + 6) * 0.34),
        sz: s * (0.62 + rand(seed + 7) * 0.36),
        yaw: (rand(seed + 8) - 0.5) * 0.55,
        pitch: -0.22 + (rand(seed + 9) - 0.5) * 0.24,
        roll: (rand(seed + 10) - 0.5) * 0.42,
      });
    }
  }

  for (let i = 0; i < 28; i++) {
    const t = i / 27;
    const seed = 1800 + i * 17;
    const x = 115 + t * 98 + (rand(seed) - 0.5) * 10;
    const z = COVE.headland.z1 + 12 + Math.sin(t * Math.PI * 1.4) * 5 + rand(seed + 1) * 10;
    const s = 3.0 + rand(seed + 2) * 5.8;
    out.push({
      asset: rockAsset(seed + 3),
      x,
      z,
      sx: s * (1.5 + rand(seed + 4) * 1.2),
      sy: s * (0.38 + rand(seed + 5) * 0.35),
      sz: s * (0.85 + rand(seed + 6) * 0.7),
      yaw: rand(seed + 7) * Math.PI * 2,
      pitch: (rand(seed + 8) - 0.5) * 0.2,
      roll: (rand(seed + 9) - 0.5) * 0.25,
      yOffset: -2.1 - rand(seed + 10) * 1.2,
    });
  }
}

function headlandTopRocks(out: RockInstance[]): void {
  for (let i = 0; i < 5; i++) {
    const t = rand(i + 100);
    const z = COVE.headland.z0 + 18 + t * (COVE.headland.z1 - COVE.headland.z0 - 35);
    const x = 178 + rand(i + 101) * 18;
    const s = 4.6 + rand(i + 102) * 5.8;
    out.push({
      asset: rockAsset(i + 103),
      x,
      z,
      sx: s * (1.0 + rand(i + 104) * 0.65),
      sy: s * (0.42 + rand(i + 105) * 0.3),
      sz: s * (0.75 + rand(i + 106) * 0.55),
      yaw: rand(i + 107) * Math.PI * 2,
      pitch: -0.18 + (rand(i + 108) - 0.5) * 0.16,
      roll: (rand(i + 109) - 0.5) * 0.14,
      yOffset: -4.2,
    });
  }
}

function seaStackPillarRocks(out: RockInstance[]): void {
  const ledges = [
    { angle: -2.85, y: 6.4, length: 14.0, scale: 5.3 },
    { angle: 2.28, y: 13.6, length: 12.0, scale: 4.8 },
    { angle: -0.42, y: 18.8, length: 9.5, scale: 4.1 },
    { angle: 1.28, y: 24.6, length: 8.4, scale: 3.6 },
  ] as const;
  for (let i = 0; i < ledges.length; i++) {
    const ledge = ledges[i];
    const seed = 2300 + i * 103;
    const a = ledge.angle + (rand(seed) - 0.5) * 0.24;
    const r = stackRadius(ledge.y, a) * 0.96;
    const pieces = i === 0 ? 2 : 1;
    for (let p = 0; p < pieces; p++) {
      const spread = (p - (pieces - 1) * 0.5) * 0.18;
      const aa = a + spread;
      const s = ledge.scale * (0.9 + rand(seed + p + 2) * 0.35);
      out.push({
        asset: rockAsset(seed + p + 3),
        x: COVE.seaStack.x + Math.cos(aa) * r,
        z: COVE.seaStack.z + Math.sin(aa) * r,
        y: ledge.y + rand(seed + p + 4) * 0.7,
        sx: ledge.length * (0.82 + rand(seed + p + 5) * 0.24),
        sy: s * (0.3 + rand(seed + p + 6) * 0.16),
        sz: s * (1.1 + rand(seed + p + 7) * 0.34),
        yaw: aa + Math.PI * 0.5 + (rand(seed + p + 8) - 0.5) * 0.25,
        pitch: -0.22 + (rand(seed + p + 9) - 0.5) * 0.16,
        roll: (rand(seed + p + 10) - 0.5) * 0.22,
      });
    }
  }

  for (let i = 0; i < 5; i++) {
    const seed = 3100 + i * 19;
    const a = rand(seed) * Math.PI * 2;
    const r = rand(seed + 1) * 6.2;
    const s = 2.2 + rand(seed + 2) * 2.5;
    out.push({
      asset: rockAsset(seed + 3),
      x: COVE.seaStack.x + Math.cos(a) * r,
      z: COVE.seaStack.z + Math.sin(a) * r,
      y: COVE.seaStack.height - 5.4 + rand(seed + 4) * 1.8,
      sx: s * (1.1 + rand(seed + 5) * 0.8),
      sy: s * (0.45 + rand(seed + 6) * 0.36),
      sz: s * (0.9 + rand(seed + 7) * 0.8),
      yaw: rand(seed + 8) * Math.PI * 2,
      pitch: (rand(seed + 9) - 0.5) * 0.16,
      roll: (rand(seed + 10) - 0.5) * 0.16,
    });
  }

  for (let i = 0; i < 22; i++) {
    const seed = 3400 + i * 23;
    const a = rand(seed) * Math.PI * 2;
    const r = COVE.seaStack.radius * 0.82 + rand(seed + 1) * 10;
    const s = 2.8 + rand(seed + 2) * 4.8;
    out.push({
      asset: rockAsset(seed + 3),
      x: COVE.seaStack.x + Math.cos(a) * r,
      z: COVE.seaStack.z + Math.sin(a) * r,
      sx: s * (1.5 + rand(seed + 4) * 1.3),
      sy: s * (0.5 + rand(seed + 5) * 0.5),
      sz: s * (0.9 + rand(seed + 6) * 0.8),
      yaw: rand(seed + 7) * Math.PI * 2,
      pitch: (rand(seed + 8) - 0.5) * 0.18,
      roll: (rand(seed + 9) - 0.5) * 0.2,
      yOffset: -3.0 - rand(seed + 10) * 0.9,
    });
  }
}

function shoreAndTalusRocks(out: RockInstance[]): void {
  for (let i = 0; i < 18; i++) {
    const x = -165 + rand(i + 300) * 330;
    const z = 105 + rand(i + 301) * 66;
    const s = 1.7 + rand(i + 302) * 3.8;
    out.push({
      asset: rockAsset(i + 303),
      x,
      z,
      sx: s * (1.2 + rand(i + 304) * 0.8),
      sy: s * (0.48 + rand(i + 305) * 0.45),
      sz: s * (0.9 + rand(i + 306) * 0.6),
      yaw: rand(i + 307) * Math.PI * 2,
      yOffset: -0.75,
    });
  }
}

function coveCoastRocks(out: RockInstance[]): void {
  for (let i = 0; i < 46; i++) {
    const t = i / 45;
    const angle = Math.PI * (0.7 + t * 0.78);
    const rx = COVE.island.halfX + 6 + rand(i + 410) * 14;
    const rz = COVE.island.halfZ + 3 + rand(i + 411) * 10;
    const x = Math.cos(angle) * rx + (rand(i + 412) - 0.5) * 7;
    const z = Math.sin(angle) * rz + (rand(i + 413) - 0.5) * 7;
    if (z > COVE.beach.z0 - 8 && Math.abs(x) < 150) continue;
    const s = 2.1 + rand(i + 414) * 5.8;
    out.push({
      asset: rockAsset(i + 415),
      x,
      z,
      sx: s * (1.45 + rand(i + 416)),
      sy: s * (0.45 + rand(i + 417) * 0.65),
      sz: s * (0.8 + rand(i + 418) * 0.9),
      yaw: rand(i + 419) * Math.PI * 2,
      pitch: (rand(i + 420) - 0.5) * 0.18,
      roll: (rand(i + 421) - 0.5) * 0.22,
      yOffset: -0.9,
    });
  }

  for (let i = 0; i < 10; i++) {
    const t = i / 9;
    const x = -158 + t * 95 + (rand(i + 520) - 0.5) * 6;
    const z = -32 + Math.sin(t * Math.PI * 2) * 5 + (rand(i + 521) - 0.5) * 5;
    const s = 3.1 + rand(i + 522) * 4.4;
    out.push({
      asset: rockAsset(i + 523),
      x,
      z,
      sx: s * (1.55 + rand(i + 524) * 1.1),
      sy: s * (0.38 + rand(i + 525) * 0.38),
      sz: s * (0.85 + rand(i + 526) * 0.75),
      yaw: rand(i + 527) * Math.PI * 2,
      yOffset: -1.25,
    });
  }
}

function allRockInstances(): RockInstance[] {
  const out: RockInstance[] = [];
  headlandBaseRocks(out);
  headlandCliffFaceRocks(out);
  headlandTopRocks(out);
  seaStackPillarRocks(out);
  shoreAndTalusRocks(out);
  coveCoastRocks(out);
  return out.filter((instance) => !inBlockedPad(instance));
}

function stackRadius(y: number, angle: number): number {
  const t = (y + 6) / 39;
  const taper = 1.18 - t * 0.47;
  const asymmetry = Math.sin(angle * 2.2 - 0.55) * (0.9 + t * 0.35);
  const flute = Math.sin(angle * 5.0 + t * 4.2) * 0.55 + Math.sin(angle * 9.0 - t * 3.6) * 0.32;
  const bite = -Math.max(0, Math.sin(t * Math.PI * 3.7 + angle * 1.45)) * 0.34;
  return Math.max(5.6, COVE.seaStack.radius * 0.82 * taper + asymmetry + flute + bite);
}

function createSeaStackCore(): Mesh {
  const radialSegments = SEA_STACK_RADIAL_SEGMENTS;
  const verticalSegments = SEA_STACK_VERTICAL_SEGMENTS;
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  for (let j = 0; j <= verticalSegments; j++) {
    const v = j / verticalSegments;
    const baseY = -6 + v * 39;
    for (let i = 0; i <= radialSegments; i++) {
      const a = (i / radialSegments) * Math.PI * 2;
      const topBreak = j === verticalSegments ? Math.sin(a * 3.2 + 0.7) * 0.85 + Math.sin(a * 7.0) * 0.32 : 0;
      const y = baseY + topBreak * smoothstep(0.86, 1, v);
      const r = stackRadius(y, a);
      const rib = 0.96 + 0.045 * Math.sin(a * 4 + v * 7) + 0.02 * Math.sin(a * 9 - v * 5);
      const x = COVE.seaStack.x + Math.cos(a) * r * rib;
      const z = COVE.seaStack.z + Math.sin(a) * r * rib;
      positions.push(x, y, z);
      normals.push(Math.cos(a) * 0.92, 0.2, Math.sin(a) * 0.92);
    }
  }
  const stride = radialSegments + 1;
  for (let j = 0; j < verticalSegments; j++) {
    for (let i = 0; i < radialSegments; i++) {
      const a = j * stride + i;
      const b = a + stride;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const topCenter = positions.length / 3;
  positions.push(COVE.seaStack.x - 1.4, COVE.seaStack.height + 2.9, COVE.seaStack.z + 0.6);
  normals.push(0, 1, 0);
  const topRow = verticalSegments * stride;
  for (let i = 0; i < radialSegments; i++) indices.push(topCenter, topRow + i, topRow + i + 1);
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute('normal', new BufferAttribute(new Float32Array(normals), 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  const mesh = new Mesh(geometry, createRockMaterial());
  mesh.name = 'terrain-rocks-sea-stack-core';
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function rockGeometry(asset: (typeof ROCK_ASSETS)[number]): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(asset.positions, 3));
  geometry.setAttribute('normal', new BufferAttribute(asset.normals, 3));
  geometry.setIndex(new BufferAttribute(asset.indices, 1));
  geometry.computeBoundingSphere();
  return geometry;
}

export function terrainRockStats(): TerrainRockStats {
  const instances = allRockInstances();
  const counts = new Map<number, number>();
  for (const instance of instances) counts.set(instance.asset, (counts.get(instance.asset) ?? 0) + 1);
  const byAsset = [...counts.entries()]
    .sort(([a], [b]) => a - b)
    .map(([asset, count]) => {
      const triangles = (ROCK_ASSETS[asset].indices.length / 3) * count;
      return { key: ROCK_ASSETS[asset].key, instances: count, triangles };
    });
  return {
    drawCalls: byAsset.length + 1,
    instances: instances.length,
    triangles: byAsset.reduce((sum, asset) => sum + asset.triangles, 0) + SEA_STACK_CORE_TRIANGLES,
    byAsset,
  };
}

export function createTerrainRocks(heightField: HeightField): Group {
  const group = new Group();
  group.name = 'terrain-rocks';
  const material = createRockMaterial();
  const instances = allRockInstances();
  const grouped = new Map<number, RockInstance[]>();
  for (const instance of instances) {
    const list = grouped.get(instance.asset);
    if (list) list.push(instance);
    else grouped.set(instance.asset, [instance]);
  }

  const matrix = new Matrix4();
  const rotation = new Quaternion();
  const euler = new Euler();
  const scale = new Vector3();
  const position = new Vector3();
  const normal = new Float32Array(3);

  group.add(createSeaStackCore());

  for (const [assetIndex, list] of [...grouped.entries()].sort(([a], [b]) => a - b)) {
    const asset = ROCK_ASSETS[assetIndex];
    const mesh = new InstancedMesh(rockGeometry(asset), material, list.length);
    mesh.name = `terrain-rocks-${asset.key}`;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = true;
    for (let i = 0; i < list.length; i++) {
      const r = list[i];
      heightField.normalAt(r.x, r.z, normal);
      const terrainY = heightField.heightAt(r.x, r.z);
      const sink = Math.min(r.sx, r.sy, r.sz) * (r.y === undefined ? 0.34 : 0.52);
      const y = (r.y ?? terrainY) + (r.yOffset ?? 0);
      euler.set(r.pitch ?? 0, r.yaw, r.roll ?? 0, 'YXZ');
      rotation.setFromEuler(euler);
      scale.set(r.sx, r.sy, r.sz);
      matrix.compose(
        position.set(r.x - normal[0] * sink, y - normal[1] * sink, r.z - normal[2] * sink),
        rotation,
        scale,
      );
      mesh.setMatrixAt(i, matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    group.add(mesh);
  }
  return group;
}
