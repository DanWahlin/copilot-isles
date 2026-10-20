import { ktx2Loader } from '../../engine/ktx2';
import type { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Euler,
  Group,
  Matrix4,
  Mesh,
  Object3D,
  Quaternion,
  RepeatWrapping,
  Vector3,
  type Material,
  type Texture,
} from 'three/webgpu';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { packs } from '../../engine/packs';
import { palettedMaterial } from '../characters/stage-light';
import { releaseMaterialTextures } from '../../util/dispose-three';
import { VILLAGE_HOUSE_PIECES } from './house-builder';
import {
  createClothMaterial,
  createGlowMaterial,
  createHaloMaterial,
  createMetalMaterial,
  createPavingMaterial,
  createPlasterMaterial,
  createRoofTileMaterial,
  createRopeMaterial,
  createStoneMaterial,
  createThatchMaterial,
  createWoodMaterial,
} from './materials';

export interface VillageBoxCollider {
  x: number;
  z: number;
  hx: number;
  hz: number;
  rot: number;
  height?: number;
  /** World heights it spans (the lighthouse's walls); a walker outside them passes. */
  y0?: number;
  y1?: number;
}

export interface VillageAnchor {
  x: number;
  y: number;
  z: number;
  heading: number;
}

interface VillageKitPart {
  geometry: BufferGeometry;
  materialKey: MaterialKey;
}

export interface VillageKit {
  pieces: ReadonlyMap<string, readonly VillageKitPart[]>;
  materials: Record<MaterialKey, Material>;
  dispose(): void;
}

export type MaterialKey =
  | 'stone'
  | 'paving'
  | 'plaster'
  | 'roofTile'
  | 'thatch'
  | 'wood'
  | 'cloth'
  | 'metal'
  | 'rope'
  | 'glow'
  | 'halo';

const tmpMatrix = new Matrix4();
const tmpQuat = new Quaternion();
const tmpEuler = new Euler();
const tmpPosition = new Vector3();
const tmpScale = new Vector3();
const KIT_PIECES = new Set([...VILLAGE_HOUSE_PIECES, 'Prop_Crate']);

function kitMaterialKey(material: string): MaterialKey {
  if (material.includes('RoundTiles')) return 'roofTile';
  if (material.includes('Plaster')) return 'plaster';
  if (material.includes('Metal')) return 'metal';
  if (material.includes('Brick') || material.includes('Rock') || material.includes('UnevenBrick'))
    return 'stone';
  if (material.includes('WindowGlass')) return 'glow';
  return 'wood';
}

let villageKitPromise: Promise<VillageKit> | null = null;

export function loadVillageKit(base = '/packs/testcove/village/kit.glb'): Promise<VillageKit> {
  if (!villageKitPromise) {
    const p = loadVillageKitInternal(base);
    villageKitPromise = p;
    // A failed load (offline) is tried again by the next caller, not cached.
    p.catch(() => {
      if (villageKitPromise === p) villageKitPromise = null;
    });
  }
  return villageKitPromise;
}

/**
 * Frees the cached kit's textures on the GPU after a voyage (the kit and its images stay cached, so
 * the next voyage uploads them again without a refetch).
 */
export function releaseVillageKitTextures(): void {
  void villageKitPromise
    ?.then((kit) => {
      for (const material of Object.values(kit.materials)) releaseMaterialTextures(material);
    })
    .catch(() => undefined);
}

export function createFallbackVillageKit(): VillageKit {
  return {
    pieces: new Map(),
    materials: {
      stone: createStoneMaterial(),
      paving: createPavingMaterial(),
      plaster: createPlasterMaterial(),
      roofTile: createRoofTileMaterial(),
      thatch: createThatchMaterial(),
      wood: createWoodMaterial(),
      cloth: createClothMaterial(),
      metal: createMetalMaterial(),
      rope: createRopeMaterial(),
      glow: createGlowMaterial(),
      halo: createHaloMaterial(),
    },
    dispose() {
      for (const material of Object.values(this.materials)) material.dispose();
    },
  };
}

function prepareLoadedMaterial(material: Material, key: MaterialKey): Material {
  material.name = material.name || `village-${key}`;
  material.vertexColors = true;
  material.side = DoubleSide;
  if ('roughness' in material) {
    const rough = material as Material & { roughness: number; metalness?: number };
    if (key === 'wood') rough.roughness = 0.94;
    if (key === 'stone') rough.roughness = 0.97;
    if (key === 'roofTile') rough.roughness = 0.76;
    if (key === 'plaster') rough.roughness = 0.86;
    if (rough.metalness !== undefined && key !== 'metal') rough.metalness = 0;
  }
  if ('emissive' in material && key === 'glow') {
    const glow = material as Material & { emissive: Color; emissiveIntensity: number };
    glow.emissive = new Color(0xffa75c);
    glow.emissiveIntensity = 0.85;
  }
  return material;
}

function clonePavingMaterial(material: Material): Material {
  const clone = material.clone();
  clone.name = `${material.name || 'village-stone'}-paving`;
  clone.vertexColors = true;
  clone.side = DoubleSide;
  const mapped = clone as Material & {
    color?: Color;
    map?: Texture | null;
    roughness: number;
    metalness?: number;
    roughnessMap?: Texture | null;
    metalnessMap?: Texture | null;
  };
  mapped.roughness = 0.96;
  if (mapped.metalness !== undefined) mapped.metalness = 0;
  // The kit's stone is a cool dark grey: warm it toward sun-baked cobbles so the quay and lanes
  // don't read as a dark slab from the air (arrival flyovers) while keeping their texture.
  mapped.color?.setRGB(1.55, 1.38, 1.12);
  if (mapped.map) {
    mapped.map = mapped.map.clone();
    mapped.map.wrapS = RepeatWrapping;
    mapped.map.wrapT = RepeatWrapping;
    mapped.map.repeat.multiplyScalar(1.15);
    mapped.map.needsUpdate = true;
  }
  if (mapped.roughnessMap) mapped.roughnessMap = null;
  if (mapped.metalnessMap) mapped.metalnessMap = null;
  return clone;
}

async function loadVillageKitInternal(url: string): Promise<VillageKit> {
  // Its roughness maps are KTX2 with a WebP fallback (tools/village/ktx-roughness.mjs): compressed on
  // the GPU when the Basis transcoder loads, the WebP when it doesn't (`KHR_texture_basisu` isn't
  // required). A transcode that fails mid-load leaves a map out: then the kit loads again on WebP.
  const ktx2 = await ktx2Loader();
  if (ktx2) {
    const gltf = await loadKitGltf(url, ktx2);
    if (!missingRoughness(gltf)) return createVillageKitFromGltf(gltf);
    console.warn('[kit] a KTX2 roughness map failed to transcode; loading the WebP maps');
  }
  return createVillageKitFromGltf(await loadKitGltf(url, null));
}

function loadKitGltf(url: string, ktx2: KTX2Loader | null): Promise<GLTF> {
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  if (ktx2) loader.setKTX2Loader(ktx2);
  return loader.loadAsync(packs.url(url));
}

/** A material whose glTF has a roughness map but whose loaded copy came without one. */
export function missingRoughness(gltf: Pick<GLTF, 'parser' | 'scenes'>): boolean {
  const defs = (
    gltf.parser.json as {
      materials?: { name?: string; pbrMetallicRoughness?: { metallicRoughnessTexture?: unknown } }[];
    }
  ).materials;
  const want = new Set(
    (defs ?? []).filter((m) => m.pbrMetallicRoughness?.metallicRoughnessTexture).map((m) => m.name),
  );
  let missing = false;
  for (const scene of gltf.scenes)
    scene.traverse((o) => {
      const mats = (o as Mesh).material;
      for (const m of Array.isArray(mats) ? mats : mats ? [mats] : [])
        if (want.has(m.name) && !(m as Material & { roughnessMap?: Texture | null }).roughnessMap)
          missing = true;
    });
  return missing;
}

function createVillageKitFromGltf(gltf: GLTF): VillageKit {
  const materials: Partial<Record<MaterialKey, Material>> = {};
  const rawMaterials = new Set<Material>();
  const pieces = new Map<string, VillageKitPart[]>();

  for (const scene of gltf.scenes) {
    scene.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      const materialList = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materialList) rawMaterials.add(material);
    });
  }
  for (const material of rawMaterials) {
    const key = kitMaterialKey(material.name);
    materials[key] ??= key === 'glow' ? createGlowMaterial() : prepareLoadedMaterial(material.clone(), key);
  }
  const fallback = createFallbackVillageKit();
  for (const key of Object.keys(fallback.materials) as MaterialKey[]) {
    materials[key] ??= fallback.materials[key];
  }
  materials.paving = clonePavingMaterial(materials.stone!);
  // Their textures as palettes: the same look, and their shadows share one plain shader (PLAN §15.4).
  for (const key of Object.keys(materials) as MaterialKey[])
    materials[key] = palettedMaterial(materials[key]!);

  for (const scene of gltf.scenes) {
    scene.updateWorldMatrix(true, true);
    scene.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      const pieceName = kitPieceNameForObject(object, gltf);
      if (!pieceName) return;
      const parts = pieces.get(pieceName) ?? [];
      const materialList = Array.isArray(object.material) ? object.material : [object.material];
      const geometry = object.geometry;
      if (geometry.groups.length > 0) {
        for (const group of geometry.groups) {
          const material = materialList[group.materialIndex ?? 0] ?? materialList[0]!;
          const part = dropZeroAreaTriangles(subsetGeometry(geometry, group.start, group.count));
          part.applyMatrix4(object.matrixWorld);
          parts.push({ geometry: part, materialKey: kitMaterialKey(material.name) });
        }
      } else {
        const material = materialList[0]!;
        const part = dropZeroAreaTriangles(cloneGeometryAsFloat(geometry));
        part.applyMatrix4(object.matrixWorld);
        parts.push({ geometry: part, materialKey: kitMaterialKey(material.name) });
      }
      pieces.set(pieceName, parts);
    });
  }
  return {
    pieces,
    materials: materials as Record<MaterialKey, Material>,
    dispose() {
      for (const material of Object.values(materials)) material?.dispose();
      for (const parts of pieces.values()) for (const part of parts) part.geometry.dispose();
    },
  };
}

function kitPieceNameForObject(object: Object3D, gltf: GLTF): string | null {
  const association = (
    gltf.parser as GLTF['parser'] & {
      associations?: WeakMap<Object3D, { nodes?: number; meshes?: number }>;
      json?: { nodes?: { name?: string }[] };
    }
  ).associations?.get(object);
  const nodeName =
    association?.nodes === undefined ? null : gltf.parser.json.nodes?.[association.nodes]?.name;
  if (nodeName && KIT_PIECES.has(nodeName)) return nodeName;
  let current: Object3D | null = object;
  while (current) {
    if (KIT_PIECES.has(current.name)) return current.name;
    current = current.parent;
  }
  return null;
}

function cloneGeometryAsFloat(source: BufferGeometry): BufferGeometry {
  const result = source.clone();
  for (const name of ['position', 'normal', 'uv', 'tangent'] as const) {
    const attr = source.getAttribute(name) as BufferAttribute | undefined;
    if (attr) result.setAttribute(name, floatAttribute(attr));
  }
  return result;
}

/**
 * Removes triangles with collinear corners. The kit has a few (wood trim, a dormer). They draw
 * nothing, but once placed and merged their winding is rounding noise, so they read as inside-out.
 */
export function dropZeroAreaTriangles(geometry: BufferGeometry): BufferGeometry {
  const p = geometry.getAttribute('position');
  const index = geometry.getIndex();
  const count = index ? index.count : p.count;
  const kept: number[] = [];
  for (let t = 0; t + 2 < count; t += 3) {
    const a = index ? index.getX(t) : t;
    const b = index ? index.getX(t + 1) : t + 1;
    const c = index ? index.getX(t + 2) : t + 2;
    const e1x = p.getX(b) - p.getX(a);
    const e1y = p.getY(b) - p.getY(a);
    const e1z = p.getZ(b) - p.getZ(a);
    const e2x = p.getX(c) - p.getX(a);
    const e2y = p.getY(c) - p.getY(a);
    const e2z = p.getZ(c) - p.getZ(a);
    const cross = Math.hypot(e1y * e2z - e1z * e2y, e1z * e2x - e1x * e2z, e1x * e2y - e1y * e2x);
    const longest = Math.max(e1x * e1x + e1y * e1y + e1z * e1z, e2x * e2x + e2y * e2y + e2z * e2z);
    if (cross > 1e-6 * longest) kept.push(a, b, c);
  }
  if (kept.length === count) return geometry;
  geometry.setIndex(kept);
  return geometry;
}

function subsetGeometry(source: BufferGeometry, start: number, count: number): BufferGeometry {
  const result = new BufferGeometry();
  const index = source.getIndex();
  const attributeNames = ['position', 'normal', 'uv', 'tangent'] as const;
  const copied: Partial<Record<(typeof attributeNames)[number], number[]>> = {};
  for (const name of attributeNames) if (source.getAttribute(name)) copied[name] = [];

  for (let i = start; i < start + count; i += 1) {
    const sourceIndex = index ? index.getX(i) : i;
    for (const name of attributeNames) {
      const attr = source.getAttribute(name) as BufferAttribute | undefined;
      const values = copied[name];
      if (!attr || !values) continue;
      for (let c = 0; c < attr.itemSize; c += 1) values.push(attr.getComponent(sourceIndex, c));
    }
  }

  for (const name of attributeNames) {
    const values = copied[name];
    const attr = source.getAttribute(name) as BufferAttribute | undefined;
    if (!values || !attr) continue;
    result.setAttribute(name, new BufferAttribute(new Float32Array(values), attr.itemSize));
  }
  result.setIndex(Array.from({ length: count }, (_v, i) => i));
  return result;
}

export function makeBuckets(): Record<MaterialKey, BufferGeometry[]> {
  return {
    stone: [],
    paving: [],
    plaster: [],
    roofTile: [],
    thatch: [],
    wood: [],
    cloth: [],
    metal: [],
    rope: [],
    glow: [],
    halo: [],
  };
}

export function transform(
  geometry: BufferGeometry,
  x: number,
  y: number,
  z: number,
  ry: number,
  rx: number,
  rz: number,
  sx: number,
  sy: number,
  sz: number,
): BufferGeometry {
  tmpEuler.set(rx, ry, rz, 'XYZ');
  tmpQuat.setFromEuler(tmpEuler);
  tmpPosition.set(x, y, z);
  tmpScale.set(sx, sy, sz);
  tmpMatrix.compose(tmpPosition, tmpQuat, tmpScale);
  geometry.applyMatrix4(tmpMatrix);
  return geometry;
}

export function paint(geometry: BufferGeometry, colour: number): void {
  if (geometry.hasAttribute('tangent')) geometry.deleteAttribute('tangent');
  if (geometry.hasAttribute('uv1')) geometry.deleteAttribute('uv1');
  if (geometry.hasAttribute('uv2')) geometry.deleteAttribute('uv2');
  for (const name of ['position', 'normal', 'uv'] as const) {
    const attr = geometry.getAttribute(name) as BufferAttribute | undefined;
    if (attr && (!(attr instanceof BufferAttribute) || !(attr.array instanceof Float32Array)))
      geometry.setAttribute(name, floatAttribute(attr));
  }
  const position = geometry.getAttribute('position') as BufferAttribute;
  if (!geometry.hasAttribute('uv')) {
    const uvs = new Float32Array(position.count * 2);
    for (let i = 0; i < position.count; i += 1) {
      uvs[i * 2] = position.getX(i) * 0.25;
      uvs[i * 2 + 1] = position.getZ(i) * 0.25;
    }
    geometry.setAttribute('uv', new BufferAttribute(uvs, 2));
  }
  const c = new Color(colour);
  const colors = new Float32Array(position.count * 3);
  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    const hash = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453;
    const variation = 0.88 + (hash - Math.floor(hash)) * 0.2;
    const baseDirt = y < 4.0 ? 0.9 + Math.max(0, 4.0 - y) * -0.035 : 1;
    colors[i * 3] = c.r * variation * baseDirt;
    colors[i * 3 + 1] = c.g * variation * baseDirt;
    colors[i * 3 + 2] = c.b * variation * baseDirt;
  }
  geometry.setAttribute('color', new BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
}

function floatAttribute(attr: BufferAttribute): BufferAttribute {
  const data = new Float32Array(attr.count * attr.itemSize);
  for (let i = 0; i < attr.count; i += 1) {
    data[i * attr.itemSize] = attr.getX(i);
    if (attr.itemSize > 1) data[i * attr.itemSize + 1] = attr.getY(i);
    if (attr.itemSize > 2) data[i * attr.itemSize + 2] = attr.getZ(i);
    if (attr.itemSize > 3) data[i * attr.itemSize + 3] = attr.getW(i);
  }
  return new BufferAttribute(data, attr.itemSize);
}

/** A site's local frame: a group at an anchor's position, turned by its heading, its world matrix set. */
export function anchorFrame(anchor: VillageAnchor): Group {
  const frame = new Group();
  frame.position.set(anchor.x, anchor.y, anchor.z);
  frame.rotation.y = anchor.heading;
  frame.updateMatrixWorld(true);
  return frame;
}

export function localToWorld(
  x: number,
  z: number,
  rot: number,
  lx: number,
  lz: number,
): { x: number; z: number } {
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  return { x: x + lx * c + lz * s, z: z - lx * s + lz * c };
}
