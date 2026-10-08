import { sharedInstancedMesh } from '../../engine/instancing';
import { BufferAttribute, BufferGeometry, Euler, Group, Matrix4, Quaternion, Vector3 } from 'three/webgpu';
import type { HeightField, Tier } from '../contracts';
import { COVE } from '../layout';
import { ROCK_ASSETS } from './rock-assets';
import { createRockMaterial } from './terrain-material';
import { createSeaStack, createSeaStackMaterial } from './sea-stack';
import { createHeadlandCliff } from './headland-cliff';

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

/**
 * Boulders round the point lighthouse's knoll and along its ridge path (COVE.lighthouse), so the
 * point reads as rock from the sea. The landward side of the knoll and the path itself stay clear.
 */
/** Coast rocks that would land on the lighthouse knoll's top or its ridge path. */
function onLighthousePoint(r: RockInstance): boolean {
  const p = COVE.lighthouse;
  const dx = p.neck.x - p.x;
  const dz = p.neck.z - p.z;
  const t = Math.max(0, Math.min(1, ((r.x - p.x) * dx + (r.z - p.z) * dz) / (dx * dx + dz * dz)));
  const d = Math.hypot(r.x - (p.x + dx * t), r.z - (p.z + dz * t));
  const reach = Math.max(r.sx, r.sz) * 0.5;
  return d - reach < 3.4 || Math.hypot(r.x - p.x, r.z - p.z) - reach < p.radius + 1;
}

function lighthousePointRocks(out: RockInstance[]): void {
  const p = COVE.lighthouse;
  const pathA = Math.atan2(p.neck.z - p.z, p.neck.x - p.x);
  for (let i = 0; i < 16; i++) {
    const a = pathA + 0.75 + (i / 15) * (Math.PI * 2 - 1.5) + (rand(i + 1900) - 0.5) * 0.25;
    const r = p.radius + 3.2 + rand(i + 1901) * 3.6;
    const s = 1.6 + rand(i + 1902) * 2.6;
    out.push({
      asset: rockAsset(i + 1903),
      x: p.x + Math.cos(a) * r,
      z: p.z + Math.sin(a) * r,
      sx: s * (1.1 + rand(i + 1904) * 0.7),
      sy: s * (0.7 + rand(i + 1905) * 0.5),
      sz: s * (0.9 + rand(i + 1906) * 0.6),
      yaw: rand(i + 1907) * Math.PI * 2,
      pitch: (rand(i + 1908) - 0.5) * 0.3,
      roll: (rand(i + 1909) - 0.5) * 0.3,
      yOffset: -0.2,
    });
  }
  const dx = p.neck.x - p.x;
  const dz = p.neck.z - p.z;
  const len = Math.hypot(dx, dz);
  for (let i = 0; i < 10; i++) {
    const t = 0.32 + (i >> 1) * 0.13 + rand(i + 1950) * 0.05;
    const side = i % 2 ? 1 : -1;
    const off = side * (5.2 + rand(i + 1951) * 1.8);
    const s = 1.3 + rand(i + 1952) * 1.6;
    out.push({
      asset: rockAsset(i + 1953),
      x: p.x + dx * t + (-dz / len) * off,
      z: p.z + dz * t + (dx / len) * off,
      sx: s * (1.2 + rand(i + 1954) * 0.6),
      sy: s * (0.55 + rand(i + 1955) * 0.4),
      sz: s * (0.9 + rand(i + 1956) * 0.5),
      yaw: rand(i + 1957) * Math.PI * 2,
      yOffset: -0.3,
    });
  }
}

function allRockInstances(): RockInstance[] {
  const out: RockInstance[] = [];
  shoreAndTalusRocks(out);
  coveCoastRocks(out);
  const kept = out.filter((instance) => !inBlockedPad(instance) && !onLighthousePoint(instance));
  lighthousePointRocks(kept);
  return kept;
}

function rockGeometry(asset: (typeof ROCK_ASSETS)[number]): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(asset.positions, 3));
  geometry.setAttribute('normal', new BufferAttribute(asset.normals, 3));
  geometry.setIndex(new BufferAttribute(asset.indices, 1));
  geometry.computeBoundingSphere();
  return geometry;
}

/** The same rocks, yielding between the big pieces (the sea stack, the cliff, the boulders). */
export function* buildTerrainRocks(
  heightField: HeightField,
  tier: Tier = 'high',
): Generator<void, Group, void> {
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

  // The sea stack and the headland's cliff share one karst material (one pipeline for both).
  const karst = createSeaStackMaterial(tier);
  group.add(createSeaStack(tier, karst));
  yield;
  const cliff = createHeadlandCliff(heightField, tier, karst);
  if (cliff) group.add(cliff);
  yield;

  for (const [assetIndex, list] of [...grouped.entries()].sort(([a], [b]) => a - b)) {
    const asset = ROCK_ASSETS[assetIndex];
    const mesh = sharedInstancedMesh(rockGeometry(asset), material, list.length);
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
