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
  Frustum,
  Sphere,
  type DataTexture,
  type MeshStandardNodeMaterial,
  type PerspectiveCamera,
} from 'three/webgpu';
import { COVE } from '../layout';
import type { HeightField } from '../contracts';
import type { TierSettings } from '../../engine/quality';
import type { GrassKind, HeightGrid } from './types';
import { EXCLUSION_SOFT_MARGIN, exclusionWeight, type VegetationExclude } from './exclusions';
import { smoothstep } from '../../util/math';
import { SeededRandom, hash2 } from './random';
import { createGrassMaterial, type GrassReach } from './materials';

interface GrassClump {
  x: number;
  z: number;
  scale: number;
  rotation: number;
  kind: GrassKind;
  color: Color;
  edgeWeight: number;
  lod: number;
}

interface GrassCell {
  x: number;
  z: number;
  clumps: GrassClump[];
}

interface TierMesh {
  mesh: InstancedMesh;
  shape: InstancedBufferAttribute;
  tint: InstancedBufferAttribute;
  capacity: number;
  /** Blades: this detail draws out to here (the last band runs to the edge of the reach). */
  maxDistance: number;
  triangles: number;
  visible: number;
  kind: 'blade' | 'wildflower' | 'seedHead';
}

const CELL_SIZE = 8;
/**
 * Blade detail by distance (metres, high tier; lower tiers scale them down): full tussocks up close,
 * then fewer but wider blades that cover the same ground, so a swap is hard to see.
 */
const BLADE_BANDS = [
  { blades: 184, twoTri: true, widen: 1, until: 9 },
  { blades: 72, twoTri: false, widen: 2.4, until: 18 },
  { blades: 20, twoTri: false, widen: 7.5, until: Infinity },
] as const;
/** Grass reach (high tier): full density to `full`, thinned to `keep` by `far`, gone past `far`. */
const REACH = { full: 20, far: 40, keep: 0.35 } as const;
/** Re-pick visible clumps after the camera moves this far (m) or turns past this (cos of ~3°). */
const REPICK_MOVE = 1.5;
const REPICK_TURN_COS = Math.cos((3 * Math.PI) / 180);
/** Frustum padding (m) so a small turn between re-picks never shows an empty edge. */
const FRUSTUM_PAD = 4;
const UP = new Vector3(0, 1, 0);
const tmpObject = new Object3D();
const tmpQuat = new Quaternion();
const tmpScale = new Vector3();
const tmpMatrix = new Matrix4();

function forcedWebGLBackend(): boolean {
  return typeof location !== 'undefined' && new URLSearchParams(location.search).has('webgl');
}

function installGrassDebug(group: Object3D): void {
  if (typeof globalThis === 'undefined') return;
  if (
    !import.meta.env.DEV &&
    (typeof location === 'undefined' || !new URLSearchParams(location.search).has('debug'))
  ) {
    return;
  }
  const target = globalThis as unknown as {
    __vegetationDebug?: { setGrassVisible?: (visible: boolean) => void; grassVisible?: () => boolean };
  };
  target.__vegetationDebug = {
    ...target.__vegetationDebug,
    setGrassVisible: (visible: boolean) => {
      group.visible = visible;
    },
    grassVisible: () => group.visible,
  };
}

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
  part = 1,
): void {
  positions.push(...a, ...b, ...c);
  normals.push(...normal, ...normal, ...normal);
  uvs.push(...uvA, ...uvB, ...uvC);
  parts.push(part, part, part);
  shade.push(uvA[1], uvB[1], uvC[1]);
}

/** A tussock of `blades` blades; `widen` thickens them so fewer blades cover the same ground. */
function createGrassGeometry(blades: number, detail: 'near' | 'far', widen = 1): BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const parts: number[] = [];
  const shade: number[] = [];
  for (let i = 0; i < blades; i += 1) {
    const angle = (i / blades) * Math.PI * 2 + (i % 2) * 0.41 + (i % 5) * 0.037;
    const filler = i >= Math.floor(blades * 0.72);
    const height = filler ? 0.1 + (i % 5) * 0.014 : 0.2 + (i % 10) * 0.027;
    const width = (filler ? 0.005 + (i % 3) * 0.0014 : 0.007 + (i % 5) * 0.0017) * widen;
    const spread = filler ? 0.48 : 0.33;
    const ox = Math.cos(angle * 1.9) * (spread + (i % 3) * 0.038);
    const oz = Math.sin(angle * 1.7) * (spread + (i % 4) * 0.03);
    const rightX = Math.cos(angle) * width;
    const rightZ = -Math.sin(angle) * width;
    const lean = 0.18 + (i % 4) * 0.045;
    const bendX = Math.sin(angle + (i % 3) * 0.35) * height * lean;
    const bendZ = Math.cos(angle - (i % 2) * 0.28) * height * (lean * 0.86);
    const droop = filler ? 0.01 : (i % 4) * 0.006;
    const normal = [Math.sin(angle) * 0.28, 0.86, Math.cos(angle) * 0.28];
    const baseL = [ox - rightX, 0, oz - rightZ];
    const baseR = [ox + rightX, 0, oz + rightZ];
    const mid = [ox + bendX * 0.42, height * 0.55, oz + bendZ * 0.42];
    const tip = [ox + bendX, Math.max(0.04, height - droop), oz + bendZ];
    if (detail === 'near') {
      pushTri(positions, normals, uvs, parts, shade, baseL, baseR, mid, normal, [0, 0], [1, 0], [0.5, 0.58]);
      pushTri(
        positions,
        normals,
        uvs,
        parts,
        shade,
        i % 2 === 0 ? baseL : baseR,
        mid,
        tip,
        normal,
        i % 2 === 0 ? [0, 0] : [1, 0],
        [0.5, 0.58],
        [0.5, 1],
      );
    } else {
      pushTri(positions, normals, uvs, parts, shade, baseL, baseR, tip, normal, [0, 0], [1, 0], [0.5, 1]);
    }
  }
  return makeGeometry(positions, normals, uvs, parts, shade);
}

function createSeedHeadGeometry(): BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const parts: number[] = [];
  const shade: number[] = [];
  for (let i = 0; i < 5; i += 1) {
    const a = (i / 5) * Math.PI * 2 + (i % 2) * 0.26;
    const x = Math.cos(a) * (0.14 + (i % 3) * 0.035);
    const z = Math.sin(a) * (0.14 + (i % 4) * 0.028);
    const h = 0.58 + (i % 4) * 0.075;
    const leanX = Math.sin(a + 0.5) * 0.08;
    const leanZ = Math.cos(a - 0.25) * 0.07;
    const width = 0.006;
    const side = [-Math.sin(a) * width, 0, Math.cos(a) * width];
    const top = [x + leanX, h, z + leanZ];
    const mid = [x + leanX * 0.45, h * 0.52, z + leanZ * 0.45];
    const normal = [Math.sin(a) * 0.22, 0.9, Math.cos(a) * 0.22];
    pushTri(
      positions,
      normals,
      uvs,
      parts,
      shade,
      [x - side[0], 0, z - side[2]],
      [x + side[0], 0, z + side[2]],
      [mid[0] + side[0] * 0.55, mid[1], mid[2] + side[2] * 0.55],
      normal,
      [0, 0],
      [1, 0],
      [0.75, 0.55],
      2,
    );
    pushTri(
      positions,
      normals,
      uvs,
      parts,
      shade,
      [x - side[0], 0, z - side[2]],
      [mid[0] + side[0] * 0.55, mid[1], mid[2] + side[2] * 0.55],
      [mid[0] - side[0] * 0.55, mid[1], mid[2] - side[2] * 0.55],
      normal,
      [0, 0],
      [0.75, 0.55],
      [0.25, 0.55],
      2,
    );
    const headSide = [-Math.sin(a) * 0.018, 0, Math.cos(a) * 0.018];
    const headLow = [top[0] - leanX * 0.22, top[1] - 0.105, top[2] - leanZ * 0.22];
    const headTip = [top[0] + leanX * 0.1, top[1] + 0.035, top[2] + leanZ * 0.1];
    pushTri(
      positions,
      normals,
      uvs,
      parts,
      shade,
      [headLow[0] - headSide[0], headLow[1], headLow[2] - headSide[2]],
      [headLow[0] + headSide[0], headLow[1], headLow[2] + headSide[2]],
      headTip,
      normal,
      [0.25, 0.62],
      [0.75, 0.62],
      [0.5, 1],
      2,
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
  if (masks.rock > 0.55 || masks.cliff > 0.2) return { weight: 0, kind: 'creeper' };
  const seaOats =
    masks.sand * smoothstep(0.38, 1.1, y) * (1 - smoothstep(3.6, 6.2, y)) * (0.72 + masks.grass * 0.42);
  if (seaOats > 0.16) return { weight: seaOats * 0.8, kind: 'seaOats' };
  if (masks.sand > 0.78) return { weight: 0, kind: 'creeper' };
  const hill = masks.grass * smoothstep(1, 8, y) * (1 - masks.sand * 0.9) * (1 - masks.rock * 0.85);
  const creeper = masks.sand * (1 - smoothstep(1.2, 4, y));
  if (creeper > 0.2) return { weight: creeper * 0.35, kind: 'creeper' };
  return { weight: hill * 1.25, kind: 'meadow' };
}

function colorFor(kind: GrassKind, jitter: number): Color {
  const color = new Color();
  if (kind === 'seaOats') color.setHSL(0.15 + jitter * 0.025, 0.46, 0.31 + jitter * 0.08);
  else if (kind === 'creeper') color.setHSL(0.19 + jitter * 0.025, 0.42, 0.2 + jitter * 0.055);
  else if (kind === 'wildflower')
    color.setHSL([0.13, 0.98, 0.92, 0.0][Math.floor(jitter * 4)] ?? 0.13, 0.62, 0.52);
  else if (kind === 'seedHead') color.set(0xc9b77a);
  else color.lerpColors(new Color(0x60701f), new Color(0x93a83a), jitter);
  return color;
}

function setClumpMatrix(clump: GrassClump): void {
  tmpObject.position.set(clump.x, 0, clump.z);
  tmpQuat.setFromAxisAngle(UP, clump.rotation);
  const heightScale =
    clump.kind === 'seaOats'
      ? 1.35
      : clump.kind === 'creeper'
        ? 0.32
        : clump.kind === 'wildflower'
          ? 0.8
          : clump.kind === 'seedHead'
            ? 1.0
            : 1.0;
  tmpScale.setScalar(clump.scale * (0.35 + clump.edgeWeight * 0.65));
  tmpScale.y *= heightScale;
  tmpObject.quaternion.copy(tmpQuat);
  tmpObject.scale.copy(tmpScale);
  tmpObject.updateMatrix();
  tmpMatrix.copy(tmpObject.matrix);
}

/**
 * Clumps packed for copying into instance buffers: matrix, tint, and shape (thinning rank, edge
 * weight) per clump, plus where each clump stands. Written once; nothing changes per frame.
 */
class Packed {
  readonly mats: Float32Array;
  readonly tints: Float32Array;
  readonly shapes: Float32Array;
  readonly pos: Float32Array;

  constructor(clumps: readonly GrassClump[], heightField: HeightField, thinned: boolean) {
    const n = clumps.length;
    this.mats = new Float32Array(n * 16);
    this.tints = new Float32Array(n * 3);
    this.shapes = new Float32Array(n * 2);
    this.pos = new Float32Array(n * 3);
    clumps.forEach((c, i) => {
      setClumpMatrix(c);
      tmpMatrix.toArray(this.mats, i * 16);
      this.tints[i * 3] = c.color.r;
      this.tints[i * 3 + 1] = c.color.g;
      this.tints[i * 3 + 2] = c.color.b;
      this.shapes[i * 2] = thinned ? c.lod : -1;
      this.shapes[i * 2 + 1] = c.edgeWeight;
      this.pos[i * 3] = c.x;
      this.pos[i * 3 + 1] = heightField.heightAt(c.x, c.z);
      this.pos[i * 3 + 2] = c.z;
    });
  }
}

/** A cell's clumps as a range of the packed blades, with its centre and ground height for culling. */
interface PackedCell {
  x: number;
  y: number;
  z: number;
  from: number;
  to: number;
}

export class GrassField {
  readonly group = new Object3D();
  private readonly cells: GrassCell[] = [];
  private readonly packedCells: PackedCell[] = [];
  private readonly meshes: TierMesh[] = [];
  private readonly bladeMeshes: TierMesh[] = [];
  private readonly material: MeshStandardNodeMaterial;
  private readonly flowers: GrassClump[] = [];
  private readonly seedHeads: GrassClump[] = [];
  private readonly tierScale: number;
  private readonly densityScale: number;
  private readonly reach: GrassReach;
  private blades: Packed | null = null;
  private flowerPack: Packed | null = null;
  private seedPack: Packed | null = null;
  private visibleCells = 0;
  private built = false;
  private readonly lastEye = new Vector3();
  private readonly lastLook = new Vector3();
  private readonly look = new Vector3();
  private readonly frustum = new Frustum();
  private readonly viewProj = new Matrix4();
  private readonly sphere = new Sphere();

  constructor(
    heightField: HeightField,
    heightGrid: HeightGrid,
    heightTexture: DataTexture,
    tier: TierSettings,
    seed: number,
    exclude?: VegetationExclude,
  ) {
    this.group.name = 'vegetation-grass';
    installGrassDebug(this.group);
    const webglScale = forcedWebGLBackend() ? 0.72 : 1;
    this.tierScale = Math.max(0.34, tier.grassDistance / 88) * webglScale;
    this.densityScale = forcedWebGLBackend() ? 0.56 : 1;
    this.reach = {
      full: REACH.full * this.tierScale,
      far: REACH.far * this.tierScale,
      keep: REACH.keep,
    };
    this.material = createGrassMaterial(heightTexture, heightGrid, this.reach);
    this.buildCells(heightField, tier, seed, exclude);

    const all: GrassClump[] = [];
    for (const cell of this.cells) {
      const from = all.length;
      all.push(...cell.clumps);
      const y = heightField.heightAt(cell.x, cell.z);
      this.packedCells.push({ x: cell.x, y, z: cell.z, from, to: all.length });
    }
    this.blades = new Packed(all, heightField, true);
    this.flowerPack = new Packed(this.flowers, heightField, false);
    this.seedPack = new Packed(this.seedHeads, heightField, false);

    const maxClumps = Math.max(1, all.length);
    for (const band of BLADE_BANDS) {
      this.addTierMesh(
        createGrassGeometry(band.blades, band.twoTri ? 'near' : 'far', band.widen),
        maxClumps,
        'blade',
        band.until * this.tierScale,
      );
    }
    this.addTierMesh(createFlowerGeometry(), Math.max(1, this.flowers.length), 'wildflower');
    this.addTierMesh(createSeedHeadGeometry(), Math.max(1, this.seedHeads.length), 'seedHead');
  }

  /**
   * Re-picks which clumps draw, and at which detail, once the camera has moved or turned enough to
   * matter. Heights and fades live in the shader, so between re-picks there's nothing to upload.
   */
  update(camera: PerspectiveCamera): void {
    const eye = camera.position;
    camera.getWorldDirection(this.look);
    if (
      this.built &&
      eye.distanceToSquared(this.lastEye) < REPICK_MOVE * REPICK_MOVE &&
      this.look.dot(this.lastLook) > REPICK_TURN_COS
    ) {
      return;
    }
    this.built = true;
    this.lastEye.copy(eye);
    this.lastLook.copy(this.look);
    camera.updateMatrixWorld();
    this.viewProj.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.viewProj);

    for (const m of this.meshes) m.visible = 0;
    this.visibleCells = 0;
    const far = this.reach.far + REPICK_MOVE;
    const cellRadius = CELL_SIZE * 0.72 + 0.6;
    const blades = this.blades!;
    for (const cell of this.packedCells) {
      const dx = cell.x - eye.x,
        dy = cell.y - eye.y,
        dz = cell.z - eye.z;
      if (Math.sqrt(dx * dx + dy * dy + dz * dz) - cellRadius > far) continue;
      this.sphere.center.set(cell.x, cell.y + 0.3, cell.z);
      // Padded so a small turn between re-picks never shows an empty edge.
      this.sphere.radius = cellRadius + FRUSTUM_PAD;
      if (!this.frustum.intersectsSphere(this.sphere)) continue;
      this.visibleCells += 1;
      for (let i = cell.from; i < cell.to; i++) this.place(blades, i, eye, far, true);
    }
    const flowers = this.flowerPack!;
    for (let i = 0; i < this.flowers.length; i++) this.place(flowers, i, eye, far, false, 'wildflower');
    const seeds = this.seedPack!;
    for (let i = 0; i < this.seedHeads.length; i++) this.place(seeds, i, eye, far, false, 'seedHead');

    for (const m of this.meshes) {
      m.mesh.count = m.visible;
      if (m.visible === 0) continue;
      m.mesh.instanceMatrix.clearUpdateRanges();
      m.mesh.instanceMatrix.addUpdateRange(0, m.visible * 16);
      m.mesh.instanceMatrix.needsUpdate = true;
      m.tint.clearUpdateRanges();
      m.tint.addUpdateRange(0, m.visible * 3);
      m.tint.needsUpdate = true;
      m.shape.clearUpdateRanges();
      m.shape.addUpdateRange(0, m.visible * 2);
      m.shape.needsUpdate = true;
    }
  }

  private place(
    pack: Packed,
    i: number,
    eye: Vector3,
    far: number,
    thinned: boolean,
    kind: 'blade' | 'wildflower' | 'seedHead' = 'blade',
  ): void {
    const p = pack.pos;
    const dx = p[i * 3]! - eye.x,
      dy = p[i * 3 + 1]! - eye.y,
      dz = p[i * 3 + 2]! - eye.z;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (d > far) return;
    // Skip clumps the shader would thin away anywhere within a re-pick of here.
    if (thinned) {
      const near = Math.max(0, d - REPICK_MOVE);
      const keep = 1 - smoothstep(this.reach.full, this.reach.far, near) * (1 - this.reach.keep);
      if (pack.shapes[i * 2]! >= keep) return;
    }
    let mesh: TierMesh | undefined;
    if (kind === 'blade') {
      for (const m of this.bladeMeshes) {
        if (d < m.maxDistance) {
          mesh = m;
          break;
        }
      }
      mesh ??= this.bladeMeshes[this.bladeMeshes.length - 1];
    } else {
      mesh =
        kind === 'wildflower' ? this.meshes[this.meshes.length - 2] : this.meshes[this.meshes.length - 1];
    }
    if (!mesh || mesh.visible >= mesh.capacity) return;
    const slot = mesh.visible++;
    const mats = mesh.mesh.instanceMatrix.array as Float32Array;
    for (let k = 0; k < 16; k++) mats[slot * 16 + k] = pack.mats[i * 16 + k]!;
    const tint = mesh.tint.array as Float32Array;
    tint[slot * 3] = pack.tints[i * 3]!;
    tint[slot * 3 + 1] = pack.tints[i * 3 + 1]!;
    tint[slot * 3 + 2] = pack.tints[i * 3 + 2]!;
    const shape = mesh.shape.array as Float32Array;
    shape[slot * 2] = pack.shapes[i * 2]!;
    shape[slot * 2 + 1] = pack.shapes[i * 2 + 1]!;
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
      tier.grassDensity * (tier.tier === 'lite' ? 0 : tier.tier === 'low' ? 0.28 : 1) * this.densityScale,
    );
    // Out to the east headland's clifftop too (its cells come last, so the rest of the field is unchanged).
    const maxX = Math.max(COVE.island.halfX, COVE.headland.x1);
    for (let x = -COVE.island.halfX; x <= maxX; x += CELL_SIZE) {
      for (let z = -COVE.island.halfZ; z <= COVE.island.halfZ + 18; z += CELL_SIZE) {
        const cx = x + CELL_SIZE * 0.5;
        const cz = z + CELL_SIZE * 0.5;
        const probe = grassWeight(heightField, cx, cz);
        if (probe.weight <= 0) continue;
        const cellWeight = this.cellExclusionWeight(exclude, cx, cz);
        if (cellWeight <= 0.02) continue;
        const clumps: GrassClump[] = [];
        const target = Math.floor((54 + probe.weight * 132) * density * cellWeight);
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
            scale: (0.72 + sample.weight * 0.34) * local.range(0.84, 1.22),
            rotation: local.range(-Math.PI, Math.PI),
            kind: sample.kind,
            color: colorFor(sample.kind, jitter),
            edgeWeight,
            lod: hash2(Math.floor(px * 2.7), Math.floor(pz * 2.7), seed ^ 0x51f15e),
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
              lod: local.next(),
            });
          }
        }
        if (
          probe.kind === 'meadow' &&
          density > 0.55 &&
          probe.weight > 0.38 &&
          local.next() < 0.12 * probe.weight
        ) {
          const sx = cx + local.range(-CELL_SIZE * 0.4, CELL_SIZE * 0.4);
          const sz = cz + local.range(-CELL_SIZE * 0.4, CELL_SIZE * 0.4);
          const sy = heightField.heightAt(sx, sz);
          const edgeWeight = exclusionWeight(exclude, sx, sz, EXCLUSION_SOFT_MARGIN);
          if (sy > 2.5 && sy < 28 && edgeWeight > 0.5) {
            this.seedHeads.push({
              x: sx,
              z: sz,
              scale: local.range(0.86, 1.22),
              rotation: local.range(-Math.PI, Math.PI),
              kind: 'seedHead',
              color: colorFor('seedHead', local.next()),
              edgeWeight,
              lod: local.next(),
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
    maxInstances: number,
    kind: 'blade' | 'wildflower' | 'seedHead',
    maxDistance = Infinity,
  ): void {
    const shape = new InstancedBufferAttribute(new Float32Array(maxInstances * 2), 2);
    const tint = new InstancedBufferAttribute(new Float32Array(maxInstances * 3), 3);
    geometry.setAttribute('grassShape', shape);
    geometry.setAttribute('tint', tint);
    const mesh = new InstancedMesh(geometry, this.material, maxInstances);
    mesh.count = 0;
    mesh.frustumCulled = false;
    this.group.add(mesh);
    const tierMesh: TierMesh = {
      mesh,
      shape,
      tint,
      capacity: maxInstances,
      maxDistance,
      triangles: Math.floor((geometry.getAttribute('position')?.count ?? 0) / 3),
      visible: 0,
      kind,
    };
    this.meshes.push(tierMesh);
    if (kind === 'blade') this.bladeMeshes.push(tierMesh);
  }
}
