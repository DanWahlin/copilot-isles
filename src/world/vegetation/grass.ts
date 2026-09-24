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
  lodSeed: number;
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
}

const CELL_SIZE = 8;
const HIGH_DISTANCES = { near: 18, mid: 46, far: 88 } as const;
const tmpObject = new Object3D();
const tmpQuat = new Quaternion();
const tmpScale = new Vector3();
const tmpMatrix = new Matrix4();

function createGrassGeometry(blades: number, segments: number): BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const parts: number[] = [];
  const shade: number[] = [];
  for (let i = 0; i < blades; i += 1) {
    const angle = (i / blades) * Math.PI * 2 + (i % 2) * 0.27;
    const width = 0.066 + (i % 3) * 0.018;
    const height = 0.66 + (i % 5) * 0.075;
    const ox = Math.cos(angle * 1.7) * 0.2;
    const oz = Math.sin(angle * 1.7) * 0.2;
    const rightX = Math.cos(angle) * width;
    const rightZ = -Math.sin(angle) * width;
    const bendX = Math.sin(angle) * height * (0.16 + (i % 2) * 0.04);
    const bendZ = Math.cos(angle) * height * (0.14 + (i % 3) * 0.025);
    const n = [Math.sin(angle), 0.34, Math.cos(angle)];
    for (let s = 0; s < segments; s += 1) {
      const t0 = s / segments;
      const t1 = (s + 1) / segments;
      const w0 = (1 - t0 * 0.78) * width;
      const w1 = (1 - t1 * 0.78) * width;
      const curve0 = t0 * t0;
      const curve1 = t1 * t1;
      const c0 = [ox + bendX * curve0, height * t0, oz + bendZ * curve0];
      const c1 = [ox + bendX * curve1, height * t1, oz + bendZ * curve1];
      const p0 = [c0[0] - rightX * (w0 / width), c0[1], c0[2] - rightZ * (w0 / width)];
      const p1 = [c0[0] + rightX * (w0 / width), c0[1], c0[2] + rightZ * (w0 / width)];
      const p2 = [c1[0] + rightX * (w1 / width), c1[1], c1[2] + rightZ * (w1 / width)];
      const p3 = [c1[0] - rightX * (w1 / width), c1[1], c1[2] - rightZ * (w1 / width)];
      positions.push(...p0, ...p1, ...p2, ...p0, ...p2, ...p3);
      for (let v = 0; v < 6; v += 1) normals.push(...n);
      uvs.push(0, t0, 1, t0, 1, t1, 0, t0, 1, t1, 0, t1);
      for (let v = 0; v < 6; v += 1) {
        parts.push(1);
        shade.push(0.42 + t1 * 0.55 + (i % 5) * 0.025);
      }
    }
  }
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
  if (masks.cliff > 0.2) return { weight: 0, kind: 'creeper' };
  const beach = masks.sand * (1 - smoothstep(5, 13, y));
  const hill = masks.grass * smoothstep(1, 8, y);
  const creeper = masks.sand * (1 - smoothstep(1.2, 4, y));
  if (beach > hill && beach > 0.18) return { weight: beach * 0.9, kind: 'seaOats' };
  if (creeper > 0.2) return { weight: creeper * 0.55, kind: 'creeper' };
  return { weight: hill * 1.05, kind: 'meadow' };
}

function colorFor(kind: GrassKind, jitter: number): Color {
  const color = new Color();
  if (kind === 'seaOats') color.setHSL(0.16 + jitter * 0.035, 0.38, 0.36 + jitter * 0.12);
  else if (kind === 'creeper') color.setHSL(0.24 + jitter * 0.035, 0.34, 0.27 + jitter * 0.08);
  else color.setHSL(0.285 + jitter * 0.03, 0.46, 0.24 + jitter * 0.08);
  return color;
}

function setClumpMatrix(clump: GrassClump): void {
  tmpObject.position.set(clump.x, 0, clump.z);
  tmpQuat.setFromAxisAngle(new Vector3(0, 1, 0), clump.rotation);
  const heightScale = clump.kind === 'seaOats' ? 1.55 : clump.kind === 'creeper' ? 0.32 : 0.86;
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
    this.tierScale = Math.max(0.34, tier.grassDistance / HIGH_DISTANCES.far);
    this.buildCells(heightField, tier, seed, exclude);
    const maxClumps = Math.max(
      1,
      this.cells.reduce((sum, cell) => sum + cell.clumps.length, 0),
    );
    this.addTierMesh(createGrassGeometry(7, 2), 0, HIGH_DISTANCES.near * this.tierScale, maxClumps);
    this.addTierMesh(
      createGrassGeometry(4, 1),
      HIGH_DISTANCES.near * this.tierScale,
      HIGH_DISTANCES.mid * this.tierScale,
      maxClumps,
    );
    this.addTierMesh(
      createGrassGeometry(2, 1),
      HIGH_DISTANCES.mid * this.tierScale,
      HIGH_DISTANCES.far * this.tierScale,
      maxClumps,
    );
  }

  update(camera: PerspectiveCamera): void {
    this.visibleCells = 0;
    for (const tierMesh of this.meshes) tierMesh.visible = 0;
    const cx = camera.position.x;
    const cz = camera.position.z;
    const far2 = (HIGH_DISTANCES.far * this.tierScale + CELL_SIZE) ** 2;

    for (const cell of this.cells) {
      const cellDist2 = (cell.x - cx) ** 2 + (cell.z - cz) ** 2;
      if (cellDist2 > far2) continue;
      this.visibleCells += 1;
      for (const clump of cell.clumps) {
        const d = Math.hypot(clump.x - cx, clump.z - cz);
        const mesh = this.meshes.find((m) => d >= m.minDistance && d < m.maxDistance);
        if (!mesh) continue;
        const slot = mesh.visible;
        if (slot >= mesh.capacity) continue;
        setClumpMatrix(clump);
        mesh.mesh.setMatrixAt(slot, tmpMatrix);
        mesh.tint.setXYZ(slot, clump.color.r, clump.color.g, clump.color.b);
        const fadeIn =
          mesh.minDistance <= 0 ? 1 : smoothstep(mesh.minDistance, mesh.minDistance + 5 * this.tierScale, d);
        const fadeOut = 1 - smoothstep(mesh.maxDistance - 16 * this.tierScale, mesh.maxDistance, d);
        mesh.fade.setX(
          slot,
          clamp01(Math.min(fadeIn || 1, fadeOut) * clump.edgeWeight - clump.lodSeed * 0.04),
        );
        mesh.visible += 1;
      }
    }

    for (const tierMesh of this.meshes) {
      tierMesh.mesh.count = tierMesh.visible;
      tierMesh.mesh.instanceMatrix.needsUpdate = true;
      tierMesh.tint.needsUpdate = true;
      tierMesh.fade.needsUpdate = true;
      tierMesh.mesh.frustumCulled = false;
    }
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
    const density = Math.max(0.15, tier.grassDensity);
    for (let x = -COVE.island.halfX; x <= COVE.island.halfX; x += CELL_SIZE) {
      for (let z = -COVE.island.halfZ; z <= COVE.island.halfZ + 18; z += CELL_SIZE) {
        const cx = x + CELL_SIZE * 0.5;
        const cz = z + CELL_SIZE * 0.5;
        const probe = grassWeight(heightField, cx, cz);
        if (probe.weight <= 0) continue;
        const cellWeight = this.cellExclusionWeight(exclude, cx, cz);
        if (cellWeight <= 0.02) continue;
        const clumps: GrassClump[] = [];
        const target = Math.floor((12 + probe.weight * 40) * density * cellWeight);
        const local = rng.fork(Math.floor((x + 300) * 17 + (z + 220) * 31));
        for (let i = 0; i < target; i += 1) {
          const ox = local.range(-CELL_SIZE * 0.42, CELL_SIZE * 0.42);
          const oz = local.range(-CELL_SIZE * 0.42, CELL_SIZE * 0.42);
          const px = cx + ox;
          const pz = cz + oz;
          const sample = grassWeight(heightField, px, pz);
          const blue = hash2(Math.floor(px / 1.7), Math.floor(pz / 1.7), seed);
          const edgeWeight = exclusionWeight(exclude, px, pz, EXCLUSION_SOFT_MARGIN);
          if (sample.weight <= 0 || edgeWeight <= 0.02 || blue < 0.05 || local.next() > edgeWeight) continue;
          const jitter = local.next();
          clumps.push({
            x: px,
            z: pz,
            scale: (0.65 + sample.weight * 0.72) * local.range(0.68, 1.28),
            rotation: local.range(-Math.PI, Math.PI),
            kind: sample.kind,
            color: colorFor(sample.kind, jitter),
            lodSeed: local.next(),
            edgeWeight,
          });
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
    });
  }
}
