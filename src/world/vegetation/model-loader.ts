import {
  Box3,
  BufferGeometry,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Vector3,
  type Material,
  type Object3D,
  type Texture,
} from 'three/webgpu';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { packs } from '../../engine/packs';
import { createVegetationMaterial } from './materials';
import type { PlantSpecies } from './types';

const MODEL_BASE = '/packs/testcove/vegetation/models/';

const MODEL_BY_SPECIES: Partial<Record<PlantSpecies, string>> = {
  banana: 'plant_big.glb',
  fern: 'fern.glb',
  shrub: 'shrub.glb',
  broadleafTree: 'tree_broadleaf.glb',
  flowerBush: 'shrub_flowers.glb',
  log: 'driftwood_dead_tree.glb',
};

export type PalmVariant = 'a' | 'b';
export type PalmLod = 'hero' | 'grove';

const PALM_MODEL: Record<PalmVariant, Record<PalmLod, string>> = {
  a: {
    hero: 'palm_quaternius_a_hero.glb',
    grove: 'palm_quaternius_a_grove.glb',
  },
  b: {
    hero: 'palm_quaternius_b_hero.glb',
    grove: 'palm_quaternius_b_grove.glb',
  },
};

const TARGET_HEIGHT: Record<PlantSpecies, number> = {
  palmTall: 12.4,
  palmCluster: 7.8,
  palmYoung: 4.8,
  banana: 3.4,
  fern: 1.25,
  shrub: 1.65,
  broadleafTree: 9.4,
  flowerBush: 0.85,
  log: 0.9,
};

const tmpBox = new Box3();
const tmpSize = new Vector3();
const tmpCenter = new Vector3();
const tmpColor = new Color();
const tmpLeafBase = new Color(0x2b5622);
const tmpLeafTip = new Color(0x7c8f32);
const tmpBarkLight = new Color(0x8b7b63);
const tmpBarkDark = new Color(0x4a4038);
const tmpFruit = new Color(0x5b4a26);
let sharedPalmMaterial: Material | null = null;

export interface VegetationModelPart {
  geometry: BufferGeometry;
  material: Material | Material[];
  palmVariant?: PalmVariant;
  palmLod?: PalmLod;
}

export type VegetationGeometryCatalog = Record<PlantSpecies, VegetationModelPart[]>;

type SourceMaterial = Material & {
  color?: Color;
  map?: Texture | null;
  alphaMap?: Texture | null;
  alphaMode?: string;
};

export function palmMaterial(): Material {
  sharedPalmMaterial ??= createVegetationMaterial({
    map: null,
    color: new Color(0xffffff),
    alphaTest: 0.05,
    name: 'quaternius-coconut-palm',
  });
  return sharedPalmMaterial;
}

function sourceMaterial(material: Material | Material[] | undefined, index = 0): SourceMaterial {
  return (Array.isArray(material) ? material[index] : (material ?? {})) as SourceMaterial;
}

function materialColor(material: Material | Material[] | undefined, index = 0): Color {
  return sourceMaterial(material, index).color ?? tmpColor.set(0xffffff);
}

function materialPart(species: PlantSpecies, material: SourceMaterial): number {
  const name = material.name.toLowerCase();
  if (species === 'log') return 0;
  if (name.includes('leaf') || name.includes('leaves') || name.includes('plant') || name.includes('palm'))
    return 1;
  if (name.includes('flower') || name.includes('berries') || name.includes('berry') || name.includes('fruit'))
    return 2;
  if (name.includes('bark') || name.includes('trunk') || name.includes('wood')) return 0;
  return species === 'broadleafTree' ||
    species.startsWith('palm') ||
    species === 'fern' ||
    species === 'banana'
    ? 1
    : 0;
}

function materialArray(material: Material | Material[] | undefined): SourceMaterial[] {
  return Array.isArray(material) ? (material as SourceMaterial[]) : [sourceMaterial(material)];
}

function toVegetationMaterials(material: Material | Material[] | undefined): Material | Material[] {
  const convert = (mat: SourceMaterial): Material => {
    if (mat.map) {
      const out = new MeshStandardMaterial({
        name: `vegetation-${mat.name || 'mapped'}`,
        map: mat.map,
        alphaMap: mat.map,
        color: mat.color ?? new Color(0xffffff),
        normalMap: (mat as SourceMaterial & { normalMap?: Texture | null }).normalMap ?? null,
        roughness: (mat as SourceMaterial & { roughness?: number }).roughness ?? 0.82,
        metalness: 0,
        side: DoubleSide,
        alphaTest: 0.75,
        transparent: true,
        vertexColors: true,
      });
      out.depthWrite = true;
      return out;
    }
    return createVegetationMaterial({
      map: null,
      color: mat.color ?? new Color(0xffffff),
      alphaTest: 0.12,
      name: `vegetation-${mat.name || 'mat'}`,
    });
  };
  return Array.isArray(material) ? materialArray(material).map(convert) : convert(sourceMaterial(material));
}

function classifyPart(species: PlantSpecies, r: number, g: number, b: number): number {
  if (species === 'log') return 0;
  if (g > r * 1.08 && g > b * 1.08) return 1;
  if (r > 0.48 && (g > 0.22 || b > 0.22)) return 2;
  if (r > g * 1.08 && r > b * 1.08) return 0;
  return species === 'broadleafTree' ||
    species.startsWith('palm') ||
    species === 'fern' ||
    species === 'banana'
    ? 1
    : 0;
}

function addInstanceAttributes(geometry: BufferGeometry, mesh: Mesh, species: PlantSpecies): BufferGeometry {
  const g = species.startsWith('palm') && geometry.index ? geometry.toNonIndexed() : geometry.clone();
  const pos = g.getAttribute('position') as Float32BufferAttribute;
  const count = pos.count;
  const existingColor = g.getAttribute('color') as Float32BufferAttribute | undefined;
  const colors = new Float32Array(count * 3);
  if (existingColor) {
    for (let i = 0; i < count; i += 1) {
      colors[i * 3] = existingColor.getX(i);
      colors[i * 3 + 1] = existingColor.getY(i);
      colors[i * 3 + 2] = existingColor.getZ(i);
    }
  } else {
    for (let i = 0; i < count; i += 1) {
      const c = materialColor(mesh.material);
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
  }

  const parts = new Float32Array(count);
  if (g.groups.length > 0) {
    const index = g.index;
    const mats = materialArray(mesh.material);
    for (const group of g.groups) {
      const matIndex = group.materialIndex ?? 0;
      const part = materialPart(species, mats[matIndex] ?? mats[0]);
      const c = materialColor(mesh.material, matIndex);
      for (let i = group.start; i < group.start + group.count; i += 1) {
        const vertex = index ? index.getX(i) : i;
        parts[vertex] = part;
        if (!existingColor) {
          colors[vertex * 3] = c.r;
          colors[vertex * 3 + 1] = c.g;
          colors[vertex * 3 + 2] = c.b;
        }
      }
    }
  } else {
    for (let i = 0; i < count; i += 1)
      parts[i] = classifyPart(species, colors[i * 3], colors[i * 3 + 1], colors[i * 3 + 2]);
  }

  g.setAttribute('color', new Float32BufferAttribute(colors, 3));
  tmpBox.setFromBufferAttribute(pos);
  const ySpan = Math.max(0.001, tmpBox.max.y - tmpBox.min.y);
  const shade = new Float32Array(count);
  for (let i = 0; i < count; i += 1) {
    const y = pos.getY(i);
    const h = (y - tmpBox.min.y) / ySpan;
    const lum = colors[i * 3] * 0.2126 + colors[i * 3 + 1] * 0.7152 + colors[i * 3 + 2] * 0.0722;
    shade[i] = Math.min(1, Math.max(0, 0.22 + h * 0.58 + lum * 0.18));
  }
  if (!g.getAttribute('uv')) g.setAttribute('uv', new Float32BufferAttribute(new Float32Array(count * 2), 2));
  g.setAttribute('vegPart', new Float32BufferAttribute(parts, 1));
  g.setAttribute('shade', new Float32BufferAttribute(shade, 1));
  g.setAttribute('palmCard', new Float32BufferAttribute(new Float32Array(count), 1));
  const fade = new Float32Array(count);
  fade.fill(1);
  g.setAttribute('fade', new Float32BufferAttribute(fade, 1));
  const tint = new Float32Array(count * 3);
  tint.fill(1);
  g.setAttribute('tint', new Float32BufferAttribute(tint, 3));
  if (species.startsWith('palm')) {
    for (const name of Object.keys(g.attributes)) {
      if (
        !['position', 'normal', 'uv', 'color', 'vegPart', 'shade', 'palmCard', 'fade', 'tint'].includes(name)
      )
        g.deleteAttribute(name);
    }
    g.clearGroups();
    g.setIndex(null);
  }
  return g;
}

function normalizeParts(parts: VegetationModelPart[], targetHeight: number): void {
  tmpBox.makeEmpty();
  for (const part of parts) {
    part.geometry.computeBoundingBox();
    if (part.geometry.boundingBox) tmpBox.union(part.geometry.boundingBox);
  }
  tmpBox.getSize(tmpSize);
  tmpBox.getCenter(tmpCenter);
  const scale = targetHeight / Math.max(0.001, tmpSize.y);
  const matrix = new Matrix4()
    .makeTranslation(-tmpCenter.x, -tmpBox.min.y, -tmpCenter.z)
    .premultiply(new Matrix4().makeScale(scale, scale, scale));
  for (const part of parts) {
    part.geometry.applyMatrix4(matrix);
    part.geometry.computeBoundingBox();
    part.geometry.computeBoundingSphere();
    if (!part.geometry.getAttribute('normal')) part.geometry.computeVertexNormals();
  }
}

function replaceAttribute(
  geometry: BufferGeometry,
  name: string,
  array: Float32Array,
  itemSize: number,
): void {
  geometry.deleteAttribute(name);
  geometry.setAttribute(name, new Float32BufferAttribute(array, itemSize));
}

function appendCoconutCluster(geometry: BufferGeometry): void {
  if (geometry.index) geometry.toNonIndexed();
  const posAttr = geometry.getAttribute('position') as Float32BufferAttribute;
  const normalAttr = geometry.getAttribute('normal') as Float32BufferAttribute;
  const uvAttr = geometry.getAttribute('uv') as Float32BufferAttribute;
  const partAttr = geometry.getAttribute('vegPart') as Float32BufferAttribute;
  const shadeAttr = geometry.getAttribute('shade') as Float32BufferAttribute;
  const colorAttr = geometry.getAttribute('color') as Float32BufferAttribute;
  const palmCardAttr = geometry.getAttribute('palmCard') as Float32BufferAttribute | undefined;
  const positions = Array.from(posAttr.array as ArrayLike<number>);
  const normals = Array.from(normalAttr.array as ArrayLike<number>);
  const uvs = Array.from((uvAttr?.array ?? new Float32Array(posAttr.count * 2)) as ArrayLike<number>);
  const parts = Array.from(partAttr.array as ArrayLike<number>);
  const shades = Array.from(shadeAttr.array as ArrayLike<number>);
  const colors = Array.from(colorAttr.array as ArrayLike<number>);
  const palmCards = Array.from((palmCardAttr?.array ?? new Float32Array(posAttr.count)) as ArrayLike<number>);
  tmpBox.setFromBufferAttribute(posAttr);
  const h = tmpBox.max.y - tmpBox.min.y;
  const cx = (tmpBox.min.x + tmpBox.max.x) * 0.5;
  const cz = (tmpBox.min.z + tmpBox.max.z) * 0.5;
  const origin = new Vector3(cx, tmpBox.min.y + h * 0.73, cz);
  const count = 5;
  for (let i = 0; i < count; i += 1) {
    const a = (i / count) * Math.PI * 2 + 0.18;
    const center = origin
      .clone()
      .add(new Vector3(Math.cos(a) * 0.28, -0.22 - (i % 2) * 0.09, Math.sin(a) * 0.28));
    const r = 0.22 + (i % 3) * 0.018;
    const verts = [
      center.clone().add(new Vector3(0, r * 1.08, 0)),
      center.clone().add(new Vector3(r, 0, 0)),
      center.clone().add(new Vector3(0, 0, r)),
      center.clone().add(new Vector3(-r, 0, 0)),
      center.clone().add(new Vector3(0, 0, -r)),
      center.clone().add(new Vector3(0, -r * 1.08, 0)),
    ];
    const faces = [
      [0, 1, 2],
      [0, 2, 3],
      [0, 3, 4],
      [0, 4, 1],
      [5, 2, 1],
      [5, 3, 2],
      [5, 4, 3],
      [5, 1, 4],
    ];
    for (const face of faces) {
      const a0 = verts[face[0]];
      const b = verts[face[1]];
      const c = verts[face[2]];
      const n = new Vector3().subVectors(b, a0).cross(new Vector3().subVectors(c, a0)).normalize();
      for (const p of [a0, b, c]) {
        positions.push(p.x, p.y, p.z);
        normals.push(n.x, n.y, n.z);
        uvs.push(0, 0);
        parts.push(2);
        shades.push(0.45 + (i % 3) * 0.08);
        colors.push(tmpFruit.r, tmpFruit.g, tmpFruit.b);
        palmCards.push(0);
      }
    }
  }
  replaceAttribute(geometry, 'position', new Float32Array(positions), 3);
  replaceAttribute(geometry, 'normal', new Float32Array(normals), 3);
  replaceAttribute(geometry, 'uv', new Float32Array(uvs), 2);
  replaceAttribute(geometry, 'vegPart', new Float32Array(parts), 1);
  replaceAttribute(geometry, 'shade', new Float32Array(shades), 1);
  replaceAttribute(geometry, 'color', new Float32Array(colors), 3);
  replaceAttribute(geometry, 'palmCard', new Float32Array(palmCards), 1);
  const fade = new Float32Array(parts.length);
  fade.fill(1);
  replaceAttribute(geometry, 'fade', fade, 1);
  const tint = new Float32Array(parts.length * 3);
  tint.fill(1);
  replaceAttribute(geometry, 'tint', tint, 3);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
}

function gradePalmGeometry(geometry: BufferGeometry): void {
  const pos = geometry.getAttribute('position') as Float32BufferAttribute;
  const normal = geometry.getAttribute('normal') as Float32BufferAttribute;
  const part = geometry.getAttribute('vegPart') as Float32BufferAttribute;
  const shade = geometry.getAttribute('shade') as Float32BufferAttribute;
  const color = geometry.getAttribute('color') as Float32BufferAttribute;
  tmpBox.setFromBufferAttribute(pos);
  const h = Math.max(0.001, tmpBox.max.y - tmpBox.min.y);
  const cx = (tmpBox.min.x + tmpBox.max.x) * 0.5;
  const cz = (tmpBox.min.z + tmpBox.max.z) * 0.5;
  const crownY = tmpBox.min.y + h * 0.74;
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const normalizedY = Math.min(1, Math.max(0, (y - tmpBox.min.y) / h));
    const radial = Math.hypot(x - cx, z - cz);
    const isTrunk = radial < h * 0.16 && normalizedY < 0.86;
    const p = isTrunk ? 0 : 1;
    part.setX(i, p);
    if (p >= 0.5 && p < 1.5) {
      const radialWeight = Math.min(1, radial / Math.max(0.001, h * 0.42));
      const vertical = Math.min(1, Math.max(0, (y - crownY + h * 0.18) / (h * 0.42)));
      const t = Math.min(1, radialWeight * 0.65 + vertical * 0.35);
      tmpColor
        .copy(tmpLeafBase)
        .lerp(tmpLeafTip, t)
        .multiplyScalar(0.9 + (i % 7) * 0.025);
      color.setXYZ(i, tmpColor.r, tmpColor.g, tmpColor.b);
      shade.setX(i, 0.28 + t * 0.62);
      const sphere = new Vector3(x - cx, (y - crownY) * 0.45 + h * 0.08, z - cz).normalize();
      const old = new Vector3(normal.getX(i), normal.getY(i), normal.getZ(i));
      old.lerp(sphere, 0.68).normalize();
      normal.setXYZ(i, old.x, old.y, old.z);
    } else if (p < 0.5) {
      const t = Math.min(1, Math.max(0, (y - tmpBox.min.y) / h));
      const groove = Math.sin(t * Math.PI * 34) > 0.72 ? 0.56 : 1;
      tmpColor
        .copy(tmpBarkDark)
        .lerp(tmpBarkLight, 0.48 + t * 0.28)
        .multiplyScalar(groove);
      color.setXYZ(i, tmpColor.r, tmpColor.g, tmpColor.b);
      shade.setX(i, 0.36 + t * 0.24);
    } else if (p >= 1.5 && p < 2.5) {
      color.setXYZ(i, tmpFruit.r, tmpFruit.g, tmpFruit.b);
      shade.setX(i, 0.48);
    }
  }
  color.needsUpdate = true;
  part.needsUpdate = true;
  shade.needsUpdate = true;
  normal.needsUpdate = true;
}

async function createPalmParts(
  loader: GLTFLoader,
  species: PlantSpecies,
  material: Material,
  variant: PalmVariant,
  lod: PalmLod,
  targetHeight = TARGET_HEIGHT[species],
): Promise<VegetationModelPart[]> {
  const gltf = await loader.loadAsync(packs.url(`${MODEL_BASE}${PALM_MODEL[variant][lod]}`));
  gltf.scene.updateMatrixWorld(true);
  const parts: VegetationModelPart[] = [];
  gltf.scene.traverse((object: Object3D) => {
    const mesh = object as Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    const geometry = addInstanceAttributes(mesh.geometry, mesh, species);
    geometry.applyMatrix4(mesh.matrixWorld);
    parts.push({ geometry, material, palmVariant: variant, palmLod: lod });
  });
  normalizeParts(parts, targetHeight);
  for (const part of parts) {
    gradePalmGeometry(part.geometry);
    if (lod !== 'grove') appendCoconutCluster(part.geometry);
    else if (species !== 'palmYoung') appendCoconutCluster(part.geometry);
  }
  return parts;
}

export async function loadPalmObject(variant: PalmVariant, height: number): Promise<Group> {
  await MeshoptDecoder.ready;
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const material = palmMaterial();
  const parts = await createPalmParts(loader, 'palmTall', material, variant, 'hero', height);
  const group = new Group();
  group.name = `quaternius-palm-${variant}`;
  for (const part of parts) {
    const mesh = new Mesh(part.geometry, part.material as Material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  return group;
}

async function loadSpecies(
  loader: GLTFLoader,
  species: PlantSpecies,
  sharedMaterial: Material,
): Promise<VegetationModelPart[]> {
  if (species.startsWith('palm')) {
    return (
      await Promise.all(
        (['a', 'b'] as const).flatMap((variant) =>
          (['hero', 'grove'] as const).map((lod) =>
            createPalmParts(loader, species, sharedMaterial, variant, lod),
          ),
        ),
      )
    ).flat();
  }
  const model = MODEL_BY_SPECIES[species];
  if (!model) throw new Error(`No vegetation model mapped for ${species}`);
  const gltf = await loader.loadAsync(packs.url(`${MODEL_BASE}${model}`));
  gltf.scene.updateMatrixWorld(true);
  const parts: VegetationModelPart[] = [];
  gltf.scene.traverse((object: Object3D) => {
    const mesh = object as Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    const geometry = addInstanceAttributes(mesh.geometry, mesh, species);
    geometry.applyMatrix4(mesh.matrixWorld);
    if (species === 'log') geometry.applyMatrix4(new Matrix4().makeRotationX(Math.PI / 2));
    parts.push({ geometry, material: toVegetationMaterials(mesh.material) });
  });
  if (parts.length === 0) throw new Error(`Vegetation model has no meshes: ${species}`);
  normalizeParts(parts, TARGET_HEIGHT[species]);
  return parts;
}

export async function loadVegetationGeometries(): Promise<VegetationGeometryCatalog> {
  await MeshoptDecoder.ready;
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const sharedMaterial = palmMaterial();
  const speciesList = ['palmTall', ...(Object.keys(MODEL_BY_SPECIES) as PlantSpecies[])] as PlantSpecies[];
  const entries = await Promise.all(
    speciesList.map(
      async (species) => [species, await loadSpecies(loader, species, sharedMaterial)] as const,
    ),
  );
  return Object.fromEntries(entries) as VegetationGeometryCatalog;
}
