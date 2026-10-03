import {
  Color,
  ConeGeometry,
  CylinderGeometry,
  DodecahedronGeometry,
  DoubleSide,
  Group,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  Quaternion,
  Vector3,
  type BufferGeometry,
  type Material,
} from 'three/webgpu';
import type { TierSettings } from '../../engine/quality';
import type { HeightField } from '../contracts';
import { COVE } from '../layout';
import { SeededRandom, hash2 } from '../vegetation/random';

export interface BeachDebrisSystem {
  group: Group;
  stats: { instances: number; drawCalls: number; triangles: number };
  dispose(): void;
}

interface DebrisOptions {
  heightField: HeightField;
  tier: TierSettings;
  exclude?: (x: number, z: number) => boolean;
  seed?: number;
}

interface DebrisInstance {
  x: number;
  y: number;
  z: number;
  scale: number;
  yaw: number;
  roll: number;
  kind: DebrisKind;
  color: number;
}

type DebrisKind = 'pebble' | 'shell' | 'driftwood' | 'seaweed';

const BOTTLE_GUARDS = [
  { x: -156, z: -48, r: 4.2 },
  { x: -116, z: 36, r: 3.2 },
  { x: 8, z: 88, r: 4.8 },
  { x: 112, z: 98, r: 4.8 },
] as const;
const tmpObject = new Object3D();
const tmpQuat = new Quaternion();
const tmpScale = new Vector3();
const tmpColor = new Color();

function tierScale(tier: TierSettings): number {
  if (tier.tier === 'lite') return 0.28;
  if (tier.tier === 'low') return 0.42;
  if (tier.tier === 'medium') return 0.68;
  if (tier.tier === 'ultra') return 1.12;
  return 1;
}

function targetCounts(tier: TierSettings): Record<DebrisKind, number> {
  const density = tierScale(tier);
  return {
    pebble: Math.round(640 * density),
    shell: Math.round(210 * density),
    driftwood: Math.round(34 * density),
    seaweed: Math.round(135 * density),
  };
}

function inHeroBeachZone(x: number, z: number): boolean {
  const south = z > COVE.beach.z0 - 12 && z < COVE.beach.z1 + 12 && x > -154 && x < 130;
  const harbour =
    x > COVE.quay.x0 - 26 &&
    x < COVE.quay.x1 + 18 &&
    z > COVE.harbor.center.z - COVE.harbor.radius - 8 &&
    z < COVE.quay.z + 30;
  const westStrand = x > -168 && x < -122 && z > -60 && z < -30;
  return south || harbour || westStrand;
}

function bottleClear(x: number, z: number): boolean {
  for (const b of BOTTLE_GUARDS) {
    if (Math.hypot(x - b.x, z - b.z) < b.r) return false;
  }
  return true;
}

function scoreCandidate(heightField: HeightField, x: number, z: number): number {
  if (!inHeroBeachZone(x, z) || !bottleClear(x, z)) return 0;
  const y = heightField.heightAt(x, z);
  const masks = heightField.masksAt(x, z);
  if (y < -0.08 || y > 2.15 || masks.sand < 0.34 || masks.cliff > 0.1) return 0;
  const waterline = 1 - Math.min(1, Math.abs(y - 0.42) / 1.55);
  const strand = Math.max(0.18, masks.sand) * waterline;
  const hashedBreakup = 0.66 + hash2(Math.floor(x * 0.18), Math.floor(z * 0.18), 0x5a11) * 0.34;
  return strand * hashedBreakup;
}

function createMaterial(color: number, roughness: number, name: string): MeshStandardMaterial {
  const material = new MeshStandardMaterial({
    color,
    roughness,
    metalness: 0,
    vertexColors: true,
  });
  if (name === 'seaweed') material.side = DoubleSide;
  material.name = `beach-debris-${name}`;
  return material;
}

function makeInstances(options: DebrisOptions): Record<DebrisKind, DebrisInstance[]> {
  const rng = new SeededRandom(options.seed ?? 0xbeace5);
  const counts = targetCounts(options.tier);
  const out: Record<DebrisKind, DebrisInstance[]> = {
    pebble: [],
    shell: [],
    driftwood: [],
    seaweed: [],
  };
  for (const kind of Object.keys(counts) as DebrisKind[]) {
    const target = counts[kind];
    const kindRng = rng.fork(target + kind.length * 811);
    for (let i = 0; out[kind].length < target && i < target * 44; i += 1) {
      const x = kindRng.range(-172, 140);
      const z = kindRng.range(-136, 118);
      if (options.exclude?.(x, z)) continue;
      const score = scoreCandidate(options.heightField, x, z);
      if (score <= 0 || kindRng.next() > score) continue;
      const y = options.heightField.heightAt(x, z);
      const shell = kind === 'shell';
      const weed = kind === 'seaweed';
      out[kind].push({
        kind,
        x,
        y: y + (shell ? 0.018 : weed ? 0.012 : 0.025),
        z,
        scale:
          kind === 'pebble'
            ? kindRng.range(0.055, 0.18)
            : shell
              ? kindRng.range(0.08, 0.16)
              : weed
                ? kindRng.range(0.35, 0.9)
                : kindRng.range(0.32, 0.92),
        yaw: kindRng.range(-Math.PI, Math.PI),
        roll: kindRng.signed(0.18),
        color:
          kind === 'pebble'
            ? [0x6b6558, 0x9f927a, 0x4f564d][Math.floor(kindRng.next() * 3)]!
            : shell
              ? [0xf1dec1, 0xe4bd9e, 0xffeed1][Math.floor(kindRng.next() * 3)]!
              : weed
                ? [0x3a5631, 0x536533, 0x624b2c][Math.floor(kindRng.next() * 3)]!
                : [0x79583a, 0x9a7146, 0x5f432d][Math.floor(kindRng.next() * 3)]!,
      });
    }
  }
  return out;
}

function instanceMatrix(instance: DebrisInstance): Matrix4 {
  tmpObject.position.set(instance.x, instance.y, instance.z);
  tmpQuat.setFromEuler(tmpObject.rotation.set(0, instance.yaw, instance.roll));
  tmpObject.quaternion.copy(tmpQuat);
  if (instance.kind === 'pebble') tmpScale.set(instance.scale * 1.4, instance.scale * 0.45, instance.scale);
  else if (instance.kind === 'shell')
    tmpScale.set(instance.scale * 1.5, instance.scale * 0.22, instance.scale);
  else if (instance.kind === 'seaweed')
    tmpScale.set(instance.scale * 0.1, instance.scale * 0.025, instance.scale);
  else tmpScale.set(instance.scale * 0.12, instance.scale * 0.12, instance.scale * 1.25);
  tmpObject.scale.copy(tmpScale);
  tmpObject.updateMatrix();
  return tmpObject.matrix;
}

function triangles(geometry: BufferGeometry): number {
  return geometry.index
    ? Math.floor(geometry.index.count / 3)
    : Math.floor(geometry.attributes.position.count / 3);
}

function makeMesh(
  name: DebrisKind,
  geometry: BufferGeometry,
  material: Material,
  instances: DebrisInstance[],
): InstancedMesh {
  const mesh = new InstancedMesh(geometry, material, Math.max(1, instances.length));
  mesh.name = `beach-${name}`;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.count = instances.length;
  instances.forEach((instance, i) => {
    mesh.setMatrixAt(i, instanceMatrix(instance));
    tmpColor.set(instance.color);
    mesh.setColorAt(i, tmpColor);
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  return mesh;
}

export function createBeachDebris(options: DebrisOptions): BeachDebrisSystem {
  const group = new Group();
  group.name = 'beach-debris';
  const instances = makeInstances(options);
  const geometries: Record<DebrisKind, BufferGeometry> = {
    pebble: new DodecahedronGeometry(1, 0),
    shell: new ConeGeometry(1, 0.42, 12, 1, true),
    driftwood: new CylinderGeometry(1, 1, 1, 7, 1),
    seaweed: new PlaneGeometry(1, 1, 1, 3),
  };
  geometries.driftwood.rotateX(Math.PI / 2);
  geometries.seaweed.rotateX(-Math.PI / 2);
  const materials: Record<DebrisKind, Material> = {
    pebble: createMaterial(0xffffff, 0.92, 'pebble'),
    shell: createMaterial(0xffffff, 0.78, 'shell'),
    driftwood: createMaterial(0xffffff, 0.96, 'driftwood'),
    seaweed: createMaterial(0xffffff, 0.88, 'seaweed'),
  };
  const meshes = (Object.keys(instances) as DebrisKind[]).map((kind) =>
    makeMesh(kind, geometries[kind], materials[kind], instances[kind]),
  );
  for (const mesh of meshes) group.add(mesh);
  const stats = {
    instances: Object.values(instances).reduce((sum, list) => sum + list.length, 0),
    drawCalls: meshes.length,
    triangles: meshes.reduce((sum, mesh) => sum + triangles(mesh.geometry) * mesh.count, 0),
  };
  group.userData.beachDebrisStats = stats;
  return {
    group,
    stats,
    dispose() {
      for (const mesh of meshes) mesh.dispose();
      for (const geometry of Object.values(geometries)) geometry.dispose();
      for (const material of Object.values(materials)) material.dispose();
      group.removeFromParent();
    },
  };
}
