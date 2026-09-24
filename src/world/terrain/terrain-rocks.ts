import {
  BufferAttribute,
  BufferGeometry,
  Euler,
  Group,
  Matrix4,
  Mesh,
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
  yOffset?: number;
}

function fract(v: number): number {
  return v - Math.floor(v);
}

function rand(seed: number): number {
  return fract(Math.sin(seed * 12.9898 + 78.233) * 43758.5453);
}

function headlandBaseRocks(out: RockInstance[]): void {
  for (let i = 0; i < 18; i++) {
    const t = i / 17;
    const z = COVE.headland.z0 - 7 + t * (COVE.headland.z1 - COVE.headland.z0 + 15) + (rand(i + 4) - 0.5) * 9;
    const x = 205 + Math.sin(t * Math.PI * 2.5) * 2 + rand(i + 20) * 7;
    const s = 3 + rand(i + 1) * 6;
    out.push({
      asset: i % 3,
      x,
      z,
      sx: s * (1.35 + rand(i + 8) * 1.25),
      sy: s * (0.8 + rand(i + 9) * 0.9),
      sz: s * (1.1 + rand(i + 10) * 1.4),
      yaw: rand(i + 11) * Math.PI * 2,
      pitch: (rand(i + 12) - 0.5) * 0.22,
      roll: (rand(i + 13) - 0.5) * 0.28,
      yOffset: -1.2 - rand(i + 14) * 0.9,
    });
  }
}

function cliffFaceAndTopRocks(out: RockInstance[]): void {
  for (let i = 0; i < 10; i++) {
    const t = rand(i + 100);
    const z = COVE.headland.z0 + 8 + t * (COVE.headland.z1 - COVE.headland.z0 - 14);
    const x = 190 + rand(i + 101) * 12;
    const s = 7 + rand(i + 102) * 11;
    out.push({
      asset: i % 3,
      x,
      z,
      sx: s * (1.15 + rand(i + 103) * 0.9),
      sy: s * (0.75 + rand(i + 104) * 0.55),
      sz: s * (0.95 + rand(i + 105) * 0.8),
      yaw: rand(i + 106) * Math.PI * 2,
      pitch: (rand(i + 107) - 0.5) * 0.12,
      roll: (rand(i + 108) - 0.5) * 0.12,
      yOffset: -1.8,
    });
  }
}

function shoreAndStackRocks(out: RockInstance[]): void {
  for (let i = 0; i < 12; i++) {
    const a = -0.5 + (i / 11) * 1.2;
    const x = COVE.seaStack.x + Math.cos(a) * (COVE.seaStack.radius + 4 + rand(i + 220) * 6);
    const z = COVE.seaStack.z + Math.sin(a) * (COVE.seaStack.radius + 4 + rand(i + 230) * 6);
    const s = 1.9 + rand(i + 240) * 3.2;
    out.push({
      asset: 1 + (i % 2),
      x,
      z,
      sx: s * 1.4,
      sy: s * 0.75,
      sz: s,
      yaw: rand(i + 241) * Math.PI * 2,
      yOffset: -1.1,
    });
  }
  for (let i = 0; i < 14; i++) {
    const x = -165 + rand(i + 300) * 330;
    const z = 105 + rand(i + 301) * 66;
    const s = 1.0 + rand(i + 302) * 2.4;
    out.push({
      asset: 1 + (i % 2),
      x,
      z,
      sx: s * (1.2 + rand(i + 303) * 0.8),
      sy: s * (0.5 + rand(i + 304) * 0.45),
      sz: s * (0.9 + rand(i + 305) * 0.6),
      yaw: rand(i + 306) * Math.PI * 2,
      yOffset: -0.45,
    });
  }
}

function allRockInstances(): RockInstance[] {
  const out: RockInstance[] = [];
  headlandBaseRocks(out);
  cliffFaceAndTopRocks(out);
  shoreAndStackRocks(out);
  return out;
}

export function createTerrainRocks(heightField: HeightField): Group {
  const group = new Group();
  group.name = 'terrain-rocks';
  const material = createRockMaterial();
  const instances = allRockInstances();
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  const matrix = new Matrix4();
  const rotation = new Quaternion();
  const euler = new Euler();
  const scale = new Vector3();
  const position = new Vector3();
  const normal = new Vector3();
  const transformed = new Vector3();
  const transformedNormal = new Vector3();

  for (const r of instances) {
    const asset = ROCK_ASSETS[r.asset];
    const y = heightField.heightAt(r.x, r.z) + (r.yOffset ?? -0.5);
    euler.set(r.pitch ?? 0, r.yaw, r.roll ?? 0, 'YXZ');
    rotation.setFromEuler(euler);
    scale.set(r.sx, r.sy, r.sz);
    matrix.compose(transformed.set(r.x, y, r.z), rotation, scale);
    const indexOffset = positions.length / 3;
    for (let i = 0; i < asset.positions.length; i += 3) {
      position.set(asset.positions[i], asset.positions[i + 1], asset.positions[i + 2]);
      transformed.copy(position).applyMatrix4(matrix);
      positions.push(transformed.x, transformed.y, transformed.z);
      normal.set(asset.normals[i], asset.normals[i + 1], asset.normals[i + 2]);
      transformedNormal.copy(normal).applyQuaternion(rotation).normalize();
      normals.push(transformedNormal.x, transformedNormal.y, transformedNormal.z);
    }
    for (const index of asset.indices) indices.push(indexOffset + index);
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute('normal', new BufferAttribute(new Float32Array(normals), 3));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  const mesh = new Mesh(geometry, material);
  mesh.name = 'terrain-rocks-merged';
  mesh.frustumCulled = true;
  group.add(mesh);
  return group;
}
