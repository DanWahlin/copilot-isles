// Adapted from Tidewater © 2026 DRG Software Solutions LLC, MIT, src/world/vegetation/GrassField.js@d32799f
import {
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  Object3D,
  Quaternion,
  Vector3,
  type DataTexture,
  type MeshStandardNodeMaterial,
  type PerspectiveCamera,
} from 'three/webgpu';
import { COVE } from '../layout';
import type { HeightField } from '../contracts';
import type { TierSettings } from '../../engine/quality';
import type { GrassKind, HeightGrid } from './types';
import { EXCLUSION_SOFT_MARGIN, exclusionWeight, type VegetationExclude } from './exclusions';
import { SeededRandom, clamp01, hash2, smoothstep } from './random';
import { createGrassMaterial } from './materials';

interface GrassClump {
  x: number;
  z: number;
  scale: number;
  rotation: number;
  kind: GrassKind;
  color: Color;
  edgeWeight: number;
}

interface GrassCell {
  x: number;
  z: number;
  clumps: GrassClump[];
}

interface TierMesh {
  mesh: InstancedMesh;
  fade: InstancedBufferAttribute;
  tint: InstancedBufferAttribute;
  capacity: number;
  maxDistance: number;
  minDistance: number;
  triangles: number;
  visible: number;
  flower: boolean;
}

const CELL_SIZE = 8;
const HIGH_DISTANCES = { near: 24, mid: 42 } as const;
const tmpObject = new Object3D();
const tmpQuat = new Quaternion();
const tmpScale = new Vector3();
const tmpMatrix = new Matrix4();

function pushTri(
  positions: number[],
  normals: number[],
  uvs: number[],
  parts: number[],
  shade: number[],
  a: number[],
  b: number[],
  c: number[],
  normal: number[],
  uvA: number[],
  uvB: number[],
  uvC: number[],
): void {
  positions.push(...a, ...b, ...c);
  normals.push(...normal, ...normal, ...normal);
  uvs.push(...uvA, ...uvB, ...uvC);
  parts.push(1, 1, 1);
  shade.push(uvA[1], uvB[1], uvC[1]);
}

function createGrassGeometry(blades: number): BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const parts: number[] = [];
  const shade: number[] = [];
  for (let i = 0; i < blades; i += 1) {
    const angle = (i / blades) * Math.PI * 2 + (i % 2) * 0.31;
    const height = 0.62 + (i % 7) * 0.055;
    const width = 0.075 + (i % 4) * 0.015;
    const ox = Math.cos(angle * 1.9) * (0.18 + (i % 3) * 0.035);
    const oz = Math.sin(angle * 1.7) * (0.18 + (i % 4) * 0.025);
    const rightX = Math.cos(angle) * width;
    const rightZ = -Math.sin(angle) * width;
    const bendX = Math.sin(angle) * height * (0.18 + (i % 2) * 0.045);
    const bendZ = Math.cos(angle) * height * (0.15 + (i % 3) * 0.032);
    const normal = [Math.sin(angle) * 0.55, 0.56, Math.cos(angle) * 0.55];
    const baseL = [ox - rightX, 0, oz - rightZ];
    const baseR = [ox + rightX, 0, oz + rightZ];
    const mid = [ox + bendX * 0.36, height * 0.58, oz + bendZ * 0.36];
    const midW = width * 0.45;
    const midL = [mid[0] - (rightX / width) * midW, mid[1], mid[2] - (rightZ / width) * midW];
    const midR = [mid[0] + (rightX / width) * midW, mid[1], mid[2] + (rightZ / width) * midW];
    const tip = [ox + bendX, height, oz + bendZ];
    pushTri(positions, normals, uvs, parts, shade, baseL, baseR, midR, normal, [0, 0], [1, 0], [0.85, 0.58]);
    pushTri(
      positions,
      normals,
      uvs,
      parts,
      shade,
      baseL,
      midR,
      midL,
      normal,
      [0, 0],
      [0.85, 0.58],
      [0.15, 0.58],
    );
    pushTri(
      positions,
      normals,
      uvs,
      parts,
      shade,
      midL,
      midR,
      tip,
      normal,
      [0.15, 0.58],
      [0.85, 0.58],
      [0.5, 1],
    );
  }
  return makeGeometry(positions, normals, uvs, parts, shade);
}

function createFlowerGeometry(): BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const parts: number[] = [];
  const shade: number[] = [];
  const up = [0, 1, 0];
  for (let i = 0; i < 5; i += 1) {
    const a = (i / 5) * Math.PI * 2;
    const x = Math.cos(a) * 0.18;
    const z = Math.sin(a) * 0.18;
    const h = 0.26 + (i % 3) * 0.045;
    const stemTop = [x * 0.65, h, z * 0.65];
    const stemBase = [x * 0.35, 0, z * 0.35];
    const stemSide = [-Math.sin(a) * 0.014, 0, Math.cos(a) * 0.014];
    pushTri(
      positions,
      normals,
      uvs,
      parts,
      shade,
      [stemBase[0] - stemSide[0], 0, stemBase[2] - stemSide[2]],
      [stemBase[0] + stemSide[0], 0, stemBase[2] + stemSide[2]],
      stemTop,
      up,
      [0, 0],
      [1, 0],
      [0.5, 0.55],
    );
    const r = 0.07;
    const c = stemTop;
    const p1 = [c[0] + Math.cos(a) * r, c[1] + 0.015, c[2] + Math.sin(a) * r];
    const p2 = [c[0] + Math.cos(a + 2.1) * r, c[1] + 0.01, c[2] + Math.sin(a + 2.1) * r];
    const p3 = [c[0] + Math.cos(a - 2.1) * r, c[1] + 0.01, c[2] + Math.sin(a - 2.1) * r];
    pushTri(positions, normals, uvs, parts, shade, p1, p2, p3, up, [0.5, 1], [0, 0.8], [1, 0.8]);
  }
  return makeGeometry(positions, normals, uvs, parts, shade);
}

function makeGeometry(
  positions: number[],
  normals: number[],
  uvs: number[],
  parts: number[],
  shade: number[],
): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('vegPart', new Float32BufferAttribute(parts, 1));
  geometry.setAttribute('shade', new Float32BufferAttribute(shade, 1));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function grassWeight(heightField: HeightField, x: number, z: number): { weight: number; kind: GrassKind } {
  const y = heightField.heightAt(x, z);
  if (y < 0.2) return { weight: 0, kind: 'creeper' };
  const masks = heightField.masksAt(x, z);
  if (masks.sand > 0.68 || masks.rock > 0.55 || masks.cliff > 0.2) return { weight: 0, kind: 'creeper' };
  const hill = masks.grass * smoothstep(1, 8, y) * (1 - masks.sand * 0.9) * (1 - masks.rock * 0.85);
  const creeper = masks.sand * (1 - smoothstep(1.2, 4, y));
  if (creeper > 0.2) return { weight: creeper * 0.35, kind: 'creeper' };
  return { weight: hill * 1.25, kind: 'meadow' };
}

function colorFor(kind: GrassKind, jitter: number): Color {
  const color = new Color();
  if (kind === 'seaOats') color.setHSL(0.155 + jitter * 0.035, 0.34, 0.34 + jitter * 0.1);
  else if (kind === 'creeper') color.setHSL(0.235 + jitter * 0.03, 0.34, 0.24 + jitter * 0.07);
  else if (kind === 'wildflower')
    color.setHSL([0.13, 0.98, 0.92, 0.0][Math.floor(jitter * 4)] ?? 0.13, 0.62, 0.52);
  else color.setHSL(0.235 + jitter * 0.035, 0.43, 0.235 + jitter * 0.085);
  return color;
}

function setClumpMatrix(clump: GrassClump): void {
  tmpObject.position.set(clump.x, 0, clump.z);
  tmpQuat.setFromAxisAngle(new Vector3(0, 1, 0), clump.rotation);
  const heightScale =
    clump.kind === 'seaOats'
      ? 1.35
      : clump.kind === 'creeper'
        ? 0.32
        : clump.kind === 'wildflower'
          ? 0.8
          : 0.78;
  tmpScale.setScalar(clump.scale * (0.35 + clump.edgeWeight * 0.65));
  tmpScale.y *= heightScale;
  tmpObject.quaternion.copy(tmpQuat);
  tmpObject.scale.copy(tmpScale);
  tmpObject.updateMatrix();
  tmpMatrix.copy(tmpObject.matrix);
}

export class GrassField {
  readonly group = new Object3D();
  private readonly cells: GrassCell[] = [];
  private readonly meshes: TierMesh[] = [];
  private readonly material: MeshStandardNodeMaterial;
  private readonly flowers: GrassClump[] = [];
  private readonly tierScale: number;
  private visibleCells = 0;

  constructor(
    heightField: HeightField,
    heightGrid: HeightGrid,
    heightTexture: DataTexture,
    tier: TierSettings,
    seed: number,
    exclude?: VegetationExclude,
  ) {
    this.material = createGrassMaterial(heightTexture, heightGrid);
    this.tierScale = Math.max(0.34, tier.grassDistance / 88);
    this.buildCells(heightField, tier, seed, exclude);
    const maxClumps = Math.max(
      1,
      this.cells.reduce((sum, cell) => sum + cell.clumps.length, 0),
    );
    this.addTierMesh(createGrassGeometry(18), 0, HIGH_DISTANCES.near * this.tierScale, maxClumps);
    this.addTierMesh(
      createGrassGeometry(8),
      HIGH_DISTANCES.near * this.tierScale,
      HIGH_DISTANCES.mid * this.tierScale,
      maxClumps,
    );
    this.addTierMesh(createFlowerGeometry(), 0, 34 * this.tierScale, Math.max(1, this.flowers.length), true);
  }

  update(camera: PerspectiveCamera): void {
    this.visibleCells = 0;
    for (const tierMesh of this.meshes) tierMesh.visible = 0;
    const cx = camera.position.x;
    const cz = camera.position.z;
    const far2 = (HIGH_DISTANCES.mid * this.tierScale + CELL_SIZE) ** 2;

    for (const cell of this.cells) {
      const cellDist2 = (cell.x - cx) ** 2 + (cell.z - cz) ** 2;
      if (cellDist2 > far2) continue;
      this.visibleCells += 1;
      for (const clump of cell.clumps) this.writeClump(clump, cx, cz);
    }
    for (const flower of this.flowers) this.writeClump(flower, cx, cz);

    for (const tierMesh of this.meshes) {
      tierMesh.mesh.count = tierMesh.visible;
      tierMesh.mesh.instanceMatrix.needsUpdate = true;
      tierMesh.tint.needsUpdate = true;
      tierMesh.fade.needsUpdate = true;
      tierMesh.mesh.frustumCulled = false;
    }
  }

  private writeClump(clump: GrassClump, cx: number, cz: number): void {
    const d = Math.hypot(clump.x - cx, clump.z - cz);
    const wantFlower = clump.kind === 'wildflower';
    const mesh = this.meshes.find((m) => m.flower === wantFlower && d >= m.minDistance && d < m.maxDistance);
    if (!mesh) return;
    const slot = mesh.visible;
    if (slot >= mesh.capacity) return;
    setClumpMatrix(clump);
    mesh.mesh.setMatrixAt(slot, tmpMatrix);
    mesh.tint.setXYZ(slot, clump.color.r, clump.color.g, clump.color.b);
    const fadeIn =
      mesh.minDistance <= 0 ? 1 : smoothstep(mesh.minDistance, mesh.minDistance + 5 * this.tierScale, d);
    const fadeOut =
      1 - smoothstep(mesh.maxDistance - (mesh.maxDistance - mesh.minDistance) * 0.2, mesh.maxDistance, d);
    mesh.fade.setX(slot, clamp01(Math.min(fadeIn || 1, fadeOut) * clump.edgeWeight));
    mesh.visible += 1;
  }

  stats(): { visibleInstances: number; visibleCells: number; drawCalls: number; triangles: number } {
    let visibleInstances = 0;
    let drawCalls = 0;
    let triangles = 0;
    for (const tierMesh of this.meshes) {
      visibleInstances += tierMesh.visible;
      if (tierMesh.visible > 0) {
        drawCalls += 1;
        triangles += tierMesh.visible * tierMesh.triangles;
      }
    }
    return { visibleInstances, visibleCells: this.visibleCells, drawCalls, triangles };
  }

  dispose(): void {
    for (const tierMesh of this.meshes) {
      tierMesh.mesh.geometry.dispose();
      tierMesh.mesh.dispose();
    }
    this.material.dispose();
  }

  private buildCells(
    heightField: HeightField,
    tier: TierSettings,
    seed: number,
    exclude?: VegetationExclude,
  ): void {
    const rng = new SeededRandom(seed ^ 0x67a91f);
    const density = Math.max(
      0,
      tier.grassDensity * (tier.tier === 'lite' ? 0 : tier.tier === 'low' ? 0.28 : 1),
    );
    for (let x = -COVE.island.halfX; x <= COVE.island.halfX; x += CELL_SIZE) {
      for (let z = -COVE.island.halfZ; z <= COVE.island.halfZ + 18; z += CELL_SIZE) {
        const cx = x + CELL_SIZE * 0.5;
        const cz = z + CELL_SIZE * 0.5;
        const probe = grassWeight(heightField, cx, cz);
        if (probe.weight <= 0) continue;
        const cellWeight = this.cellExclusionWeight(exclude, cx, cz);
        if (cellWeight <= 0.02) continue;
        const clumps: GrassClump[] = [];
        const target = Math.floor((30 + probe.weight * 78) * density * cellWeight);
        const local = rng.fork(Math.floor((x + 300) * 17 + (z + 220) * 31));
        for (let i = 0; i < target; i += 1) {
          const ox = local.range(-CELL_SIZE * 0.44, CELL_SIZE * 0.44);
          const oz = local.range(-CELL_SIZE * 0.44, CELL_SIZE * 0.44);
          const px = cx + ox;
          const pz = cz + oz;
          const sample = grassWeight(heightField, px, pz);
          const blue = hash2(Math.floor(px / 1.45), Math.floor(pz / 1.45), seed);
          const edgeWeight = exclusionWeight(exclude, px, pz, EXCLUSION_SOFT_MARGIN);
          if (sample.weight <= 0 || edgeWeight <= 0.02 || blue < 0.025 || local.next() > edgeWeight) continue;
          const jitter = local.next();
          clumps.push({
            x: px,
            z: pz,
            scale: (0.72 + sample.weight * 0.62) * local.range(0.72, 1.28),
            rotation: local.range(-Math.PI, Math.PI),
            kind: sample.kind,
            color: colorFor(sample.kind, jitter),
            edgeWeight,
          });
        }
        if (
          probe.kind === 'meadow' &&
          density > 0.4 &&
          probe.weight > 0.45 &&
          local.next() < 0.1 * probe.weight
        ) {
          const fx = cx + local.range(-CELL_SIZE * 0.36, CELL_SIZE * 0.36);
          const fz = cz + local.range(-CELL_SIZE * 0.36, CELL_SIZE * 0.36);
          const edgeWeight = exclusionWeight(exclude, fx, fz, EXCLUSION_SOFT_MARGIN);
          if (edgeWeight > 0.5) {
            this.flowers.push({
              x: fx,
              z: fz,
              scale: local.range(0.75, 1.25),
              rotation: local.range(-Math.PI, Math.PI),
              kind: 'wildflower',
              color: colorFor('wildflower', local.next()),
              edgeWeight,
            });
          }
        }
        if (clumps.length > 0) this.cells.push({ x: cx, z: cz, clumps });
      }
    }
  }

  private cellExclusionWeight(exclude: VegetationExclude | undefined, x: number, z: number): number {
    if (!exclude) return 1;
    const half = CELL_SIZE * 0.5;
    const samples = [
      exclusionWeight(exclude, x, z, EXCLUSION_SOFT_MARGIN),
      exclusionWeight(exclude, x - half, z - half, EXCLUSION_SOFT_MARGIN),
      exclusionWeight(exclude, x + half, z - half, EXCLUSION_SOFT_MARGIN),
      exclusionWeight(exclude, x - half, z + half, EXCLUSION_SOFT_MARGIN),
      exclusionWeight(exclude, x + half, z + half, EXCLUSION_SOFT_MARGIN),
    ];
    return Math.max(...samples);
  }

  private addTierMesh(
    geometry: BufferGeometry,
    minDistance: number,
    maxDistance: number,
    maxInstances: number,
    flower = false,
  ): void {
    const fade = new InstancedBufferAttribute(new Float32Array(maxInstances), 1);
    const tint = new InstancedBufferAttribute(new Float32Array(maxInstances * 3), 3);
    geometry.setAttribute('fade', fade);
    geometry.setAttribute('tint', tint);
    const mesh = new InstancedMesh(geometry, this.material, maxInstances);
    mesh.count = 0;
    mesh.frustumCulled = false;
    this.group.add(mesh);
    this.meshes.push({
      mesh,
      fade,
      tint,
      capacity: maxInstances,
      minDistance,
      maxDistance,
      triangles: Math.floor((geometry.getAttribute('position')?.count ?? 0) / 3),
      visible: 0,
      flower,
    });
  }
}
