import {
  Box3,
  BufferGeometry,
  Color,
  DoubleSide,
  Float32BufferAttribute,
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
import { createPlantGeometry } from './plant-geometry';
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

export interface VegetationModelPart {
  geometry: BufferGeometry;
  material: Material | Material[];
}

export type VegetationGeometryCatalog = Record<PlantSpecies, VegetationModelPart[]>;

type SourceMaterial = Material & {
  color?: Color;
  map?: Texture | null;
  alphaMap?: Texture | null;
  alphaMode?: string;
};

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
  const g = geometry.clone();
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

async function createPalmParts(species: PlantSpecies, material: Material): Promise<VegetationModelPart[]> {
  return [{ geometry: createPlantGeometry(species), material }];
}

async function loadSpecies(
  loader: GLTFLoader,
  species: PlantSpecies,
  palmMaterial: Material,
): Promise<VegetationModelPart[]> {
  if (species.startsWith('palm')) return createPalmParts(species, palmMaterial);
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
  const palmMaterial = createVegetationMaterial({
    map: null,
    color: new Color(0xffffff),
    alphaTest: 0.05,
    name: 'procedural-coconut-palm',
  });
  const speciesList = [
    'palmTall',
    'palmCluster',
    'palmYoung',
    ...(Object.keys(MODEL_BY_SPECIES) as PlantSpecies[]),
  ] as PlantSpecies[];
  const entries = await Promise.all(
    speciesList.map(async (species) => [species, await loadSpecies(loader, species, palmMaterial)] as const),
  );
  return Object.fromEntries(entries) as VegetationGeometryCatalog;
}
