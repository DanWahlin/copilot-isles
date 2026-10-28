// Adapted from Tidewater © 2026 DRG Software Solutions LLC, MIT, src/world/vegetation/GrassField.js@d32799f
import {
  interleaveVertexAttributes,
  markAttributeChanged,
  markInstancesChanged,
  sharedInstancedMesh,
} from '../../engine/instancing';
import {
  BufferGeometry,
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
import type { HeightField } from '../contracts';
import type { TierSettings } from '../../engine/quality';
import type { GrassKind, HeightGrid } from './types';
import type { VegetationExclude } from './exclusions';
import { smoothstep } from '../../util/math';
import { createGrassMaterial, grassCentre, type GrassReach } from './materials';
import {
  BLADE_COUNTS,
  BLADE_RANK_STEP,
  MID_ALONG,
  bladeBands,
  bladeLayout,
  setBladeMorph,
  type BladeBands,
} from './blade-bands';
import { GRASS_REACH, grassFieldCentre, grassReachScale } from './grass-reach';
import type { FloraRules, HeadForm } from '../flora/types';
import { FLORA_CELL, scatterFlora, type FloraCell, type FloraClump } from '../flora/scatter';
import { createFlowerGeometry } from '../flora/heads';
import { FLOWER_REACH, floraSpeciesIndex } from '../flora/nodes';

type MeshKind = 'blade' | HeadForm | 'seedHead';

interface TierMesh {
  mesh: InstancedMesh;
  shape: InstancedBufferAttribute;
  tint: InstancedBufferAttribute;
  capacity: number;
  /** Blades: this detail draws clumps closer than this (ground distance; the last band to the reach's edge). */
  maxDistance: number;
  triangles: number;
  visible: number;
  kind: MeshKind;
}

const REACH = GRASS_REACH;
/**
 * Re-pick visible clumps after the camera moves this far (m) or turns past this (cos of ~3°). A band
 * swap waits until the shader has finished a band's transition this far closer (`bladeBands`), so a
 * shorter move keeps the dense band's reach (and its triangles) down.
 */
const REPICK_MOVE = 1;
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

/** Every grass field's group (Anchorage's and the streamed islands'), for the debug switch. */
const debugGroups = new Set<Object3D>();

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
  debugGroups.add(group);
  target.__vegetationDebug = {
    ...target.__vegetationDebug,
    setGrassVisible: (visible: boolean) => {
      for (const g of debugGroups) g.visible = visible;
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

/**
 * A tussock's first `blades` blades (`bladeLayout`: every prefix fills the disc evenly), the tall ones
 * in the middle and short fillers round the rim, all splaying outward like a fountain. `near` blades
 * have two triangles, bent at a middle vertex; `far` ones one triangle. Each blade carries what the
 * grass shader needs to turn the near shape into the far one and to widen or shrink it with distance
 * (`bladeMorph`: the middle vertex's move onto the far edge, and each vertex's sideways offset), and
 * its rank in its `vegPart` (`BLADE_RANK_STEP`), so blade i is the same blade in every band.
 */
export function createGrassGeometry(blades: number, detail: 'near' | 'far'): BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const parts: number[] = [];
  const shade: number[] = [];
  const morph: number[] = [];
  const NONE = [0, 0, 0, 0];
  for (let i = 0; i < blades; i += 1) {
    const { x: ox, z: oz, cx, sz, out } = bladeLayout(i);
    const filler = out > 0.82 || i % 7 === 3;
    const height = (filler ? 0.1 + (i % 5) * 0.014 : 0.2 + (i % 10) * 0.027) * (1.08 - out * 0.3);
    const width = filler ? 0.005 + (i % 3) * 0.0014 : 0.007 + (i % 5) * 0.0017;
    // The blade's face turns across its spoke; it bends outward, more the further out it stands.
    const rightX = -sz * width;
    const rightZ = cx * width;
    const lean = 0.12 + out * 0.26 + (i % 4) * 0.03;
    const swirl = ((i % 5) - 2) * 0.12;
    const bendX = (cx - sz * swirl) * height * lean;
    const bendZ = (sz + cx * swirl) * height * lean;
    const droop = filler ? 0.01 : (i % 4) * 0.006;
    const normal = [cx * 0.28, 0.86, sz * 0.28];
    const baseL = [ox - rightX, 0, oz - rightZ];
    const baseR = [ox + rightX, 0, oz + rightZ];
    const tip = [ox + bendX, Math.max(0.04, height - droop), oz + bendZ];
    const part = 1 + i * BLADE_RANK_STEP;
    const left = [0, 0, 0, -width];
    const right = [0, 0, 0, width];
    if (detail === 'near') {
      // The second triangle runs up from one base corner; the middle vertex's far place is on the far
      // triangle's other edge, so with it there the two triangles tile the far triangle exactly. Both
      // are wound like the far triangle: a double-sided face wound the other way is lit from its back.
      const fromLeft = i % 2 === 0;
      const other = fromLeft ? baseR : baseL;
      const mid = [ox + bendX * 0.42, height * 0.55, oz + bendZ * 0.42];
      const onEdge = other.map((v, k) => v + (tip[k]! - v) * MID_ALONG);
      const toEdge = [onEdge[0]! - mid[0]!, onEdge[1]! - mid[1]!, onEdge[2]! - mid[2]!];
      const midMorph = [...toEdge, (1 - MID_ALONG) * (fromLeft ? width : -width)];
      // The far triangle's uv at that point, so the shading matches too.
      const midUv = [(1 - MID_ALONG) * (fromLeft ? 1 : 0) + MID_ALONG * 0.5, MID_ALONG];
      pushTri(positions, normals, uvs, parts, shade, baseL, baseR, mid, normal, [0, 0], [1, 0], midUv, part);
      morph.push(...left, ...right, ...midMorph);
      if (fromLeft) {
        pushTri(
          positions,
          normals,
          uvs,
          parts,
          shade,
          baseL,
          mid,
          tip,
          normal,
          [0, 0],
          midUv,
          [0.5, 1],
          part,
        );
        morph.push(...left, ...midMorph, ...NONE);
      } else {
        pushTri(
          positions,
          normals,
          uvs,
          parts,
          shade,
          baseR,
          tip,
          mid,
          normal,
          [1, 0],
          [0.5, 1],
          midUv,
          part,
        );
        morph.push(...right, ...NONE, ...midMorph);
      }
    } else {
      pushTri(
        positions,
        normals,
        uvs,
        parts,
        shade,
        baseL,
        baseR,
        tip,
        normal,
        [0, 0],
        [1, 0],
        [0.5, 1],
        part,
      );
      morph.push(...left, ...right, ...NONE);
    }
  }
  return makeGeometry(positions, normals, uvs, parts, shade, morph);
}

export function createSeedHeadGeometry(): BufferGeometry {
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

function makeGeometry(
  positions: number[],
  normals: number[],
  uvs: number[],
  parts: number[],
  shade: number[],
  morph?: number[],
): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('vegPart', new Float32BufferAttribute(parts, 1));
  geometry.setAttribute('shade', new Float32BufferAttribute(shade, 1));
  setBladeMorph(geometry, morph);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

/** How tall each blade kind stands against a meadow tussock (its instance's y scale). */
const HEIGHT_SCALE: Record<GrassKind, number> = {
  meadow: 1,
  seaOats: 1.35,
  creeper: 0.32,
  moss: 0.24,
  seedHead: 1,
};

/** A clump's instance matrix into `tmpMatrix`. */
function setClumpMatrix(clump: FloraClump): void {
  tmpObject.position.set(clump.x, 0, clump.z);
  tmpQuat.setFromAxisAngle(UP, clump.rotation);
  if (clump.stem !== undefined) {
    // A flower plant: x and z are its head's radius, y its stem's height (the heads' unit space).
    tmpScale.set(clump.scale, clump.stem, clump.scale);
  } else {
    tmpScale.setScalar(clump.scale * (0.35 + clump.edgeWeight * 0.65));
    tmpScale.y *= HEIGHT_SCALE[clump.kind];
    // Moss and creeper spread wider than they stand.
    if (clump.kind === 'moss' || clump.kind === 'creeper') {
      tmpScale.x *= 1.35;
      tmpScale.z *= 1.35;
    }
  }
  tmpObject.quaternion.copy(tmpQuat);
  tmpObject.scale.copy(tmpScale);
  tmpObject.updateMatrix();
  tmpMatrix.copy(tmpObject.matrix);
}

/**
 * Clumps packed for copying into instance buffers: matrix, tint, and shape (thinning rank or a
 * flower's species row, edge weight, and the clump's turn and width scale, from which the shader finds
 * its centre) per clump, plus where each clump stands (x, z). Written once.
 */
class Packed {
  readonly mats: Float32Array;
  readonly tints: Float32Array;
  readonly shapes: Float32Array;
  readonly pos: Float32Array;

  constructor(clumps: readonly FloraClump[], thinned: boolean) {
    const n = clumps.length;
    this.mats = new Float32Array(n * 16);
    this.tints = new Float32Array(n * 3);
    this.shapes = new Float32Array(n * 4);
    this.pos = new Float32Array(n * 2);
    clumps.forEach((c, i) => {
      setClumpMatrix(c);
      tmpMatrix.toArray(this.mats, i * 16);
      this.tints[i * 3] = c.r;
      this.tints[i * 3 + 1] = c.g;
      this.tints[i * 3 + 2] = c.b;
      this.shapes[i * 4] = c.species ? -2 - floraSpeciesIndex(c.species) : thinned ? c.lod : -1;
      this.shapes[i * 4 + 1] = c.edgeWeight;
      this.shapes[i * 4 + 2] = c.rotation;
      // The width scale `setClumpMatrix` just put in the matrix.
      this.shapes[i * 4 + 3] = tmpScale.x;
      this.pos[i * 2] = c.x;
      this.pos[i * 2 + 1] = c.z;
    });
  }
}

/** A cell's clumps as ranges of the packed blades, flowers and seed heads, with its centre for culling. */
interface PackedCell {
  x: number;
  y: number;
  z: number;
  blades: number;
  bladesEnd: number;
  flowers: number;
  flowersEnd: number;
  seeds: number;
  seedsEnd: number;
}

/** Options for a field beyond its island's rules. */
export interface GrassFieldOptions {
  /** Build later, a few cells a frame (`build`). */
  defer?: boolean;
  /** The group's name (Anchorage's is `vegetation-grass`). */
  name?: string;
}

/**
 * An island's grass and flowers (its `FloraRules`, scattered by `scatterFlora`): tussocks in three
 * bands of detail by distance (`blade-bands.ts`: continuous, so no swap shows), seed heads, and flower
 * plants in drifts, all drawn with one grass material. Built once; each frame only re-picks which clumps draw once the camera has moved or
 * turned enough.
 */
export class GrassField {
  readonly group = new Object3D();
  private readonly cells: FloraCell[] = [];
  private readonly packedCells: PackedCell[] = [];
  private readonly meshes: TierMesh[] = [];
  private readonly bladeMeshes: TierMesh[] = [];
  /** Each flower's mesh (by its head form), worked out once. */
  private flowerTargets: TierMesh[] = [];
  private seedMesh: TierMesh | null = null;
  private readonly material: MeshStandardNodeMaterial;
  private readonly tierScale: number;
  private readonly reach: GrassReach;
  private readonly bands: BladeBands;
  private blades: Packed | null = null;
  private flowers: Packed | null = null;
  private seeds: Packed | null = null;
  private visibleCells = 0;
  private built = false;
  private pending: { steps: Generator<void, void, void>; heightField: HeightField } | null = null;
  private readonly lastEye = new Vector3();
  private readonly lastLook = new Vector3();
  private readonly look = new Vector3();
  /** The field's centre (x, z in x, y): ahead of the camera (`grassFieldCentre`), now and at the last re-pick. */
  private readonly centre = { x: 0, y: 0 };
  private readonly lastCentre = { x: 0, y: 0 };
  private readonly frustum = new Frustum();
  private readonly viewProj = new Matrix4();
  private readonly sphere = new Sphere();

  constructor(
    heightField: HeightField,
    heightGrid: HeightGrid,
    heightTexture: DataTexture,
    tier: TierSettings,
    seed: number,
    rules: FloraRules,
    exclude?: VegetationExclude,
    options: GrassFieldOptions = {},
  ) {
    this.group.name = options.name ?? 'vegetation-grass';
    installGrassDebug(this.group);
    const webgl = forcedWebGLBackend();
    this.tierScale = grassReachScale(tier) * (webgl ? 0.72 : 1);
    this.reach = {
      full: REACH.full * this.tierScale,
      far: REACH.far * this.tierScale,
      keep: REACH.keep,
    };
    this.bands = bladeBands(this.tierScale, REPICK_MOVE);
    const palette = rules.palette;
    this.material = createGrassMaterial(heightTexture, heightGrid, this.reach, this.bands, {
      ground: palette.sward.lush,
      straw: palette.grass.straw,
      strawColour: palette.grass.ramp[3],
    });
    this.material.name = 'vegetation-grass';
    const density = Math.max(0, tier.grassDensity * tier.grassCover * (webgl ? 0.56 : 1));
    const steps = scatterFlora(
      {
        rules,
        heightField,
        seed,
        bladeDensity: density,
        // Flowers from Low up (Lite's meadows are the terrain's), fewer on the lower tiers.
        flowerDensity: density > 0.1 ? Math.min(1, density) : 0,
        exclude,
      },
      this.cells,
    );
    if (options.defer) {
      this.pending = { steps, heightField };
      return;
    }
    while (!steps.next().done);
    this.finishBuild(heightField);
  }

  /** Finishes a deferred build (`defer`), a few cells at a time: `breathe` runs between them. */
  async build(breathe: () => Promise<void>): Promise<void> {
    const pending = this.pending;
    if (!pending) return;
    this.pending = null;
    while (!pending.steps.next().done) await breathe();
    await breathe();
    this.finishBuild(pending.heightField);
  }

  /** How many clumps a band out to `until` m can draw at most (every cell in reach, at its fullest). */
  private capacity(total: number, until: number, perCell: number): number {
    const r = Math.min(until, this.reach.far) + REPICK_MOVE + FLORA_CELL * 1.5;
    const cells = Math.ceil((Math.PI * r * r) / (FLORA_CELL * FLORA_CELL));
    return Math.max(1, Math.min(total, cells * perCell));
  }

  private finishBuild(heightField: HeightField): void {
    const blades: FloraClump[] = [];
    const flowers: FloraClump[] = [];
    const seeds: FloraClump[] = [];
    let bladesPerCell = 1;
    const flowersPerCell = new Map<HeadForm, number>();
    const flowerCount = new Map<HeadForm, number>();
    for (const cell of this.cells) {
      const cellForms = new Map<HeadForm, number>();
      const packed: PackedCell = {
        x: cell.x,
        y: heightField.heightAt(cell.x, cell.z),
        z: cell.z,
        blades: blades.length,
        bladesEnd: blades.length + cell.blades.length,
        flowers: flowers.length,
        flowersEnd: flowers.length + cell.flowers.length,
        seeds: seeds.length,
        seedsEnd: seeds.length + cell.seeds.length,
      };
      for (const c of cell.blades) blades.push(c);
      for (const c of cell.flowers) {
        flowers.push(c);
        const form = c.species!.form;
        cellForms.set(form, (cellForms.get(form) ?? 0) + 1);
        flowerCount.set(form, (flowerCount.get(form) ?? 0) + 1);
      }
      for (const c of cell.seeds) seeds.push(c);
      for (const [form, n] of cellForms) flowersPerCell.set(form, Math.max(flowersPerCell.get(form) ?? 0, n));
      bladesPerCell = Math.max(bladesPerCell, cell.blades.length);
      this.packedCells.push(packed);
    }
    this.cells.length = 0;
    this.blades = new Packed(blades, true);
    this.flowers = new Packed(flowers, false);
    this.seeds = new Packed(seeds, false);

    if (blades.length > 0) {
      const swaps = [this.bands.swap1, this.bands.swap2, Infinity];
      BLADE_COUNTS.forEach((count, band) => {
        const until = swaps[band]!;
        this.addTierMesh(
          createGrassGeometry(count, band === 0 ? 'near' : 'far'),
          this.capacity(blades.length, until, bladesPerCell),
          'blade',
          until,
        );
      });
    }
    const byForm = new Map<HeadForm, TierMesh>();
    for (const [form, count] of flowerCount) {
      const reach = this.reach.far * FLOWER_REACH;
      byForm.set(
        form,
        this.addTierMesh(
          createFlowerGeometry(form),
          this.capacity(count, reach, flowersPerCell.get(form)!),
          form,
        ),
      );
    }
    this.flowerTargets = flowers.map((f) => byForm.get(f.species!.form)!);
    if (seeds.length > 0)
      this.seedMesh = this.addTierMesh(createSeedHeadGeometry(), seeds.length, 'seedHead');
  }

  /**
   * Re-picks which clumps draw, and at which detail, once the camera has moved or turned enough to
   * matter. Heights and fades live in the shader, so between re-picks there's nothing to upload.
   */
  update(camera: PerspectiveCamera): void {
    const eye = camera.position;
    camera.getWorldDirection(this.look);
    grassFieldCentre(eye.x, eye.z, this.look.x, this.look.z, this.reach.far, this.centre);
    // Every field of a tier has the same reach, so each writes the same centre.
    grassCentre.value.set(this.centre.x, this.centre.y);
    if (
      this.built &&
      eye.distanceToSquared(this.lastEye) < REPICK_MOVE * REPICK_MOVE &&
      (this.centre.x - this.lastCentre.x) ** 2 + (this.centre.y - this.lastCentre.y) ** 2 <
        REPICK_MOVE * REPICK_MOVE &&
      this.look.dot(this.lastLook) > REPICK_TURN_COS
    ) {
      return;
    }
    if (!this.blades) return;
    this.built = true;
    this.lastEye.copy(eye);
    this.lastLook.copy(this.look);
    this.lastCentre.x = this.centre.x;
    this.lastCentre.y = this.centre.y;
    camera.updateMatrixWorld();
    this.viewProj.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.viewProj);

    for (const m of this.meshes) m.visible = 0;
    this.visibleCells = 0;
    const far = this.reach.far + REPICK_MOVE;
    const flowerFar = this.reach.far * FLOWER_REACH + REPICK_MOVE;
    const cellRadius = FLORA_CELL * 0.72 + 0.6;
    const blades = this.blades;
    const flowers = this.flowers!;
    const seeds = this.seeds!;
    const c = this.centre;
    for (const cell of this.packedCells) {
      const dx = cell.x - c.x,
        dz = cell.z - c.y;
      if (Math.sqrt(dx * dx + dz * dz) - cellRadius > far) continue;
      this.sphere.center.set(cell.x, cell.y + 0.3, cell.z);
      // Padded so a small turn between re-picks never shows an empty edge.
      this.sphere.radius = cellRadius + FRUSTUM_PAD;
      if (!this.frustum.intersectsSphere(this.sphere)) continue;
      this.visibleCells += 1;
      for (let i = cell.blades; i < cell.bladesEnd; i++) this.place(blades, i, eye, far, null);
      for (let i = cell.flowers; i < cell.flowersEnd; i++)
        this.place(flowers, i, eye, flowerFar, this.flowerTargets[i]!);
      for (let i = cell.seeds; i < cell.seedsEnd; i++) this.place(seeds, i, eye, far, this.seedMesh);
    }

    for (const m of this.meshes) {
      m.mesh.count = m.visible;
      if (m.visible === 0) continue;
      markInstancesChanged(m.mesh);
      markAttributeChanged(m.tint, m.visible * 3);
      markAttributeChanged(m.shape, m.visible * 4);
    }
  }

  /**
   * Copies clump `i` into its mesh (`target`, or the blade band for its distance) when in reach. The
   * shader fades and thins by the clump centre's ground distance from the field's centre, and changes
   * detail by its distance from the camera, as measured here, so allowing for a re-pick's move (of
   * either) leaves out nothing it would show before the next re-pick.
   */
  private place(pack: Packed, i: number, eye: Vector3, far: number, target: TierMesh | null): void {
    const px = pack.pos[i * 2]!,
      pz = pack.pos[i * 2 + 1]!;
    const cx = px - this.centre.x,
      cz = pz - this.centre.y;
    const d = Math.sqrt(cx * cx + cz * cz);
    if (d > far) return;
    let mesh = target;
    if (!mesh) {
      // A blade: skip it if the shader would thin it away anywhere within a re-pick of here.
      const near = Math.max(0, d - REPICK_MOVE);
      const keep = 1 - smoothstep(this.reach.full, this.reach.far, near) * (1 - this.reach.keep);
      if (pack.shapes[i * 4]! >= keep) return;
      const ex = px - eye.x,
        ez = pz - eye.z;
      const dEye = Math.sqrt(ex * ex + ez * ez);
      for (const m of this.bladeMeshes) {
        if (dEye < m.maxDistance) {
          mesh = m;
          break;
        }
      }
      mesh ??= this.bladeMeshes[this.bladeMeshes.length - 1] ?? null;
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
    for (let k = 0; k < 4; k++) shape[slot * 4 + k] = pack.shapes[i * 4 + k]!;
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
    debugGroups.delete(this.group);
    for (const tierMesh of this.meshes) {
      tierMesh.mesh.geometry.dispose();
      tierMesh.mesh.dispose();
    }
    this.material.dispose();
  }

  private addTierMesh(
    geometry: BufferGeometry,
    maxInstances: number,
    kind: MeshKind,
    maxDistance = Infinity,
  ): TierMesh {
    // One vertex buffer for the per-vertex attributes, so with the two instance attributes and the
    // matrices (now and last frame's) the draw stays within WebGPU's 8 vertex buffers.
    interleaveVertexAttributes(geometry);
    const shape = new InstancedBufferAttribute(new Float32Array(maxInstances * 4), 4);
    const tint = new InstancedBufferAttribute(new Float32Array(maxInstances * 3), 3);
    geometry.setAttribute('grassShape', shape);
    geometry.setAttribute('tint', tint);
    const mesh = sharedInstancedMesh(geometry, this.material, maxInstances, { count: 0 });
    mesh.name =
      kind === 'blade' ? 'grass-blades' : kind === 'seedHead' ? 'grass-seed-heads' : `flowers-${kind}`;
    mesh.frustumCulled = false;
    mesh.receiveShadow = true;
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
    return tierMesh;
  }
}
