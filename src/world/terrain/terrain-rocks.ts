import {
  BufferAttribute,
  BufferGeometry,
  Euler,
  Group,
  InstancedMesh,
  Matrix4,
  Quaternion,
  Vector3,
} from 'three/webgpu';
import type { HeightField } from '../contracts';
import { COVE } from '../layout';
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

function fract(v: number): number {
  return v - Math.floor(v);
}

function rand(seed: number): number {
  return fract(Math.sin(seed * 12.9898 + 78.233) * 43758.5453);
}

function rockAsset(seed: number): number {
  return Math.floor(rand(seed) * ROCK_VARIANTS) % ROCK_VARIANTS;
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

  for (let col = 0; col < 13; col++) {
    const xBase = 108 + (col / 12) * 104;
    const zBase = COVE.headland.z1 + 2 + (rand(col + 1760) - 0.5) * 4;
    for (let layer = 0; layer < 3; layer++) {
      const seed = 1600 + col * 37 + layer * 11;
      const y = -2.2 + layer * 5.8 + rand(seed + 1) * 1.2;
      const s = 5.4 + rand(seed + 2) * 3.8;
      out.push({
        asset: rockAsset(seed),
        x: xBase + (rand(seed + 3) - 0.5) * 7,
        z: zBase + rand(seed + 4) * 7,
        y,
        sx: s * (1.25 + rand(seed + 5) * 0.8),
        sy: s * (0.72 + rand(seed + 6) * 0.42),
        sz: s * (0.72 + rand(seed + 7) * 0.55),
        yaw: (rand(seed + 8) - 0.5) * 0.95,
        pitch: -0.1 + (rand(seed + 9) - 0.5) * 0.28,
        roll: (rand(seed + 10) - 0.5) * 0.34,
      });
    }
  }

  for (let i = 0; i < 20; i++) {
    const t = i / 19;
    const seed = 1800 + i * 17;
    const x = 118 + t * 92 + (rand(seed) - 0.5) * 8;
    const z = COVE.headland.z1 + 10 + Math.sin(t * Math.PI * 1.6) * 7 + rand(seed + 1) * 9;
    const s = 4.8 + rand(seed + 2) * 7.2;
    out.push({
      asset: rockAsset(seed + 3),
      x,
      z,
      sx: s * (1.4 + rand(seed + 4) * 1.1),
      sy: s * (0.55 + rand(seed + 5) * 0.55),
      sz: s * (0.9 + rand(seed + 6) * 0.9),
      yaw: rand(seed + 7) * Math.PI * 2,
      pitch: (rand(seed + 8) - 0.5) * 0.2,
      roll: (rand(seed + 9) - 0.5) * 0.25,
      yOffset: -1.2 - rand(seed + 10) * 0.85,
    });
  }
}

function headlandTopRocks(out: RockInstance[]): void {
  for (let i = 0; i < 12; i++) {
    const t = rand(i + 100);
    const z = COVE.headland.z0 + 10 + t * (COVE.headland.z1 - COVE.headland.z0 - 18);
    const x = 184 + rand(i + 101) * 17;
    const s = 8 + rand(i + 102) * 10;
    out.push({
      asset: rockAsset(i + 103),
      x,
      z,
      sx: s * (1.15 + rand(i + 104) * 0.8),
      sy: s * (0.58 + rand(i + 105) * 0.45),
      sz: s * (0.95 + rand(i + 106) * 0.8),
      yaw: rand(i + 107) * Math.PI * 2,
      pitch: (rand(i + 108) - 0.5) * 0.14,
      roll: (rand(i + 109) - 0.5) * 0.14,
      yOffset: -2.9,
    });
  }
}

function seaStackPillarRocks(out: RockInstance[]): void {
  const layers = [
    { y: -3.8, radius: COVE.seaStack.radius + 3.0, count: 15, scale: 7.8 },
    { y: 2.0, radius: COVE.seaStack.radius + 1.9, count: 14, scale: 8.2 },
    { y: 8.2, radius: COVE.seaStack.radius + 0.7, count: 13, scale: 7.8 },
    { y: 14.4, radius: COVE.seaStack.radius - 0.7, count: 12, scale: 7.2 },
    { y: 20.4, radius: COVE.seaStack.radius - 1.9, count: 10, scale: 6.6 },
  ] as const;

  for (const [li, layer] of layers.entries()) {
    for (let i = 0; i < layer.count; i++) {
      const seed = 2300 + li * 101 + i * 13;
      const a = (i / layer.count) * Math.PI * 2 + rand(seed) * 0.22 + li * 0.18;
      const r = layer.radius + (rand(seed + 1) - 0.5) * 2.2;
      const s = layer.scale + rand(seed + 2) * 2.6;
      out.push({
        asset: rockAsset(seed + 3),
        x: COVE.seaStack.x + Math.cos(a) * r,
        z: COVE.seaStack.z + Math.sin(a) * r,
        y: layer.y + rand(seed + 4) * 1.4,
        sx: s * (1.0 + rand(seed + 5) * 0.75),
        sy: s * (0.95 + rand(seed + 6) * 0.6),
        sz: s * (0.72 + rand(seed + 7) * 0.55),
        yaw: a + Math.PI * 0.5 + (rand(seed + 8) - 0.5) * 0.9,
        pitch: (rand(seed + 9) - 0.5) * 0.28,
        roll: (rand(seed + 10) - 0.5) * 0.34,
      });
    }
  }

  for (let i = 0; i < 11; i++) {
    const seed = 3100 + i * 19;
    const a = rand(seed) * Math.PI * 2;
    const r = rand(seed + 1) * 8.5;
    const s = 3.8 + rand(seed + 2) * 5.6;
    out.push({
      asset: rockAsset(seed + 3),
      x: COVE.seaStack.x + Math.cos(a) * r,
      z: COVE.seaStack.z + Math.sin(a) * r,
      y: COVE.seaStack.height - 5.4 + rand(seed + 4) * 1.8,
      sx: s * (1.1 + rand(seed + 5) * 0.8),
      sy: s * (0.55 + rand(seed + 6) * 0.42),
      sz: s * (0.9 + rand(seed + 7) * 0.8),
      yaw: rand(seed + 8) * Math.PI * 2,
      pitch: (rand(seed + 9) - 0.5) * 0.16,
      roll: (rand(seed + 10) - 0.5) * 0.16,
    });
  }

  for (let i = 0; i < 20; i++) {
    const seed = 3400 + i * 23;
    const a = rand(seed) * Math.PI * 2;
    const r = COVE.seaStack.radius + 5 + rand(seed + 1) * 7;
    const s = 2.3 + rand(seed + 2) * 4.0;
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
      yOffset: -1.5 - rand(seed + 10) * 0.8,
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
  return out;
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
    drawCalls: byAsset.length,
    instances: instances.length,
    triangles: byAsset.reduce((sum, asset) => sum + asset.triangles, 0),
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

  for (const [assetIndex, list] of [...grouped.entries()].sort(([a], [b]) => a - b)) {
    const asset = ROCK_ASSETS[assetIndex];
    const mesh = new InstancedMesh(rockGeometry(asset), material, list.length);
    mesh.name = `terrain-rocks-${asset.key}`;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = true;
    for (let i = 0; i < list.length; i++) {
      const r = list[i];
      const y = (r.y ?? heightField.heightAt(r.x, r.z)) + (r.yOffset ?? 0);
      euler.set(r.pitch ?? 0, r.yaw, r.roll ?? 0, 'YXZ');
      rotation.setFromEuler(euler);
      scale.set(r.sx, r.sy, r.sz);
      matrix.compose(position.set(r.x, y, r.z), rotation, scale);
      mesh.setMatrixAt(i, matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    group.add(mesh);
  }
  return group;
}
