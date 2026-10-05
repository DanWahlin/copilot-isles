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
import type { HeightField, Tier } from '../contracts';
import { COVE } from '../layout';
import { ROCK_ASSETS } from './rock-assets';
import { createRockMaterial } from './terrain-material';
import { createSeaStack } from './sea-stack';

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

const ROCK_VARIANTS = Math.min(3, ROCK_ASSETS.length);
const STOREHOUSE_EAST_PAD = { x0: -71, x1: -53, z0: -75, z1: -51 };
const VILLAGE_MEADOW_PAD = { x0: -174, x1: -55, z0: -50, z1: 18 };

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
    (r.x >= STOREHOUSE_EAST_PAD.x0 &&
      r.x <= STOREHOUSE_EAST_PAD.x1 &&
      r.z >= STOREHOUSE_EAST_PAD.z0 &&
      r.z <= STOREHOUSE_EAST_PAD.z1) ||
    (r.x >= VILLAGE_MEADOW_PAD.x0 &&
      r.x <= VILLAGE_MEADOW_PAD.x1 &&
      r.z >= VILLAGE_MEADOW_PAD.z0 &&
      r.z <= VILLAGE_MEADOW_PAD.z1)
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
  shoreAndTalusRocks(out);
  coveCoastRocks(out);
  return out.filter((instance) => !inBlockedPad(instance));
}

function rockGeometry(asset: (typeof ROCK_ASSETS)[number]): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(asset.positions, 3));
  geometry.setAttribute('normal', new BufferAttribute(asset.normals, 3));
  geometry.setIndex(new BufferAttribute(asset.indices, 1));
  geometry.computeBoundingSphere();
  return geometry;
}

export function createTerrainRocks(heightField: HeightField, _data?: unknown, tier: Tier = 'high'): Group {
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

  group.add(createSeaStack(tier));

  for (const [assetIndex, list] of [...grouped.entries()].sort(([a], [b]) => a - b)) {
    const asset = ROCK_ASSETS[assetIndex];
    const mesh = new InstancedMesh(rockGeometry(asset), material, list.length);
    mesh.name = `terrain-rocks-${asset.key}`;
    mesh.castShadow = false;
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
