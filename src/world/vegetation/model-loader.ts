import {
  Box3,
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Group,
  Matrix4,
  Mesh,
  Vector3,
  type Material,
  type Object3D,
  type Texture,
} from 'three/webgpu';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { packs } from '../../engine/packs';
import {
  createMappedVegetationMaterial,
  createPalmMaterial,
  createRecoloredLeafMaterial,
  createVegetationMaterial,
} from './materials';
import { buildCypress, buildMaquisBush, buildPricklyPear } from './cactus';
import { buildPalmFar, buildPalmNear, buildYoungPalm } from './palms';
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
  cactus: 2.1,
  brush: 1.45,
  cypress: 8.5,
};

const tmpBox = new Box3();
const tmpSize = new Vector3();
const tmpCenter = new Vector3();
const tmpColor = new Color();
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

/** The one Tidewater material every procedural palm shares. */
export function palmMaterial(atlas?: Texture | null): Material {
  void atlas;
  sharedPalmMaterial ??= createPalmMaterial();
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

function toVegetationMaterials(
  material: Material | Material[] | undefined,
  species: PlantSpecies,
): Material | Material[] {
  const convert = (mat: SourceMaterial): Material => {
    // The common bush's leaf map is painted red; on the island's hills that reads as red blotches.
    if (mat.map && species === 'shrub')
      return createRecoloredLeafMaterial(mat.map, `vegetation-${mat.name || 'shrub'}`);
    if (mat.map) {
      return createMappedVegetationMaterial({
        name: `vegetation-${mat.name || 'mapped'}`,
        map: mat.map,
        color: mat.color ?? new Color(0xffffff),
        normalMap: (mat as SourceMaterial & { normalMap?: Texture | null }).normalMap ?? null,
        roughness: (mat as SourceMaterial & { roughness?: number }).roughness ?? 0.82,
      });
    }
    return createVegetationMaterial({
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

/**
 * Meshopt-quantized models store positions/normals/UVs as normalized integers, which can only hold
 * -1..1; baking the node transform and target height into them would overflow. Widen to float first.
 */
function dequantize(geometry: BufferGeometry): void {
  for (const name of ['position', 'normal', 'uv'] as const) {
    const attr = geometry.getAttribute(name);
    if (!attr || (attr.array instanceof Float32Array && !attr.normalized)) continue;
    const out = new Float32Array(attr.count * attr.itemSize);
    for (let i = 0; i < attr.count; i += 1) {
      for (let c = 0; c < attr.itemSize; c += 1) out[i * attr.itemSize + c] = attr.getComponent(i, c);
    }
    geometry.setAttribute(name, new Float32BufferAttribute(out, attr.itemSize));
  }
}

function addInstanceAttributes(geometry: BufferGeometry, mesh: Mesh, species: PlantSpecies): BufferGeometry {
  const g = species.startsWith('palm') && geometry.index ? geometry.toNonIndexed() : geometry.clone();
  dequantize(g);
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
  // Build-time part tags (tools/vegetation/fetch-palms.mjs); GLTFLoader lower-cases `_PART`.
  const tagged = g.getAttribute('_part') as Float32BufferAttribute | undefined;
  if (tagged) {
    for (let i = 0; i < count; i += 1) parts[i] = tagged.getX(i);
    // Copied into `vegPart`; dropping it leaves room for the instance matrices as attributes, so
    // the plants share one shader (engine/instancing.ts, PLAN §15.4).
    g.deleteAttribute('_part');
  } else if (g.groups.length > 0) {
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
  const fade = new Float32Array(count);
  fade.fill(1);
  g.setAttribute('fade', new Float32BufferAttribute(fade, 1));
  const tint = new Float32Array(count * 3);
  tint.fill(1);
  g.setAttribute('tint', new Float32BufferAttribute(tint, 3));
  if (species.startsWith('palm')) {
    for (const name of Object.keys(g.attributes)) {
      if (!['position', 'normal', 'uv', 'color', 'vegPart', 'shade', 'fade', 'tint'].includes(name))
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

function createPalmParts(
  species: PlantSpecies,
  variant: PalmVariant,
  lod: PalmLod,
  targetHeight = TARGET_HEIGHT[species],
): VegetationModelPart[] {
  const seed =
    (variant === 'a' ? 11 : 29) + (species === 'palmCluster' ? 100 : 0) + (species === 'palmYoung' ? 200 : 0);
  const geometry =
    species === 'palmYoung'
      ? buildYoungPalm(seed)
      : lod === 'hero'
        ? buildPalmNear(seed)
        : buildPalmFar(seed);
  const parts: VegetationModelPart[] = [
    { geometry, material: palmMaterial(), palmVariant: variant, palmLod: lod },
  ];
  normalizeParts(parts, targetHeight);
  return parts;
}

export async function loadPalmObject(variant: PalmVariant, height: number): Promise<Group> {
  const parts = createPalmParts('palmTall', variant, 'hero', height);
  const group = new Group();
  group.name = `tidewater-palm-${variant}`;
  for (const part of parts) {
    const mesh = new Mesh(part.geometry, part.material as Material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  return group;
}

async function loadSpecies(loader: GLTFLoader, species: PlantSpecies): Promise<VegetationModelPart[]> {
  if (species.startsWith('palm')) {
    return (['a', 'b'] as const).flatMap((variant) =>
      (['hero', 'grove'] as const).flatMap((lod) => createPalmParts(species, variant, lod)),
    );
  }
  if (species === 'cactus' || species === 'brush' || species === 'cypress') {
    // Built in code (no model in the kit): Port Meridian's prickly pears and maquis brush. Same
    // material options, so both share one program.
    const source =
      species === 'cactus' ? buildPricklyPear() : species === 'brush' ? buildMaquisBush() : buildCypress();
    const geometry = addInstanceAttributes(source, new Mesh(source), species);
    source.dispose();
    const parts: VegetationModelPart[] = [
      {
        geometry,
        material: createVegetationMaterial({
          alphaTest: 0.12,
          color: new Color(species === 'cactus' ? 0x93a85e : species === 'brush' ? 0x8c9a58 : 0x3d5a34),
          name: 'vegetation-procedural',
        }),
      },
    ];
    normalizeParts(parts, TARGET_HEIGHT[species]);
    return parts;
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
    parts.push({ geometry, material: toVegetationMaterials(mesh.material, species) });
  });
  if (parts.length === 0) throw new Error(`Vegetation model has no meshes: ${species}`);
  normalizeParts(parts, TARGET_HEIGHT[species]);
  return parts;
}

export async function loadVegetationGeometries(): Promise<VegetationGeometryCatalog> {
  await MeshoptDecoder.ready;
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const speciesList = [
    'palmTall',
    ...(Object.keys(MODEL_BY_SPECIES) as PlantSpecies[]),
    'cactus',
    'brush',
    'cypress',
  ] as PlantSpecies[];
  const entries = await Promise.all(
    speciesList.map(async (species) => [species, await loadSpecies(loader, species)] as const),
  );
  return Object.fromEntries(entries) as VegetationGeometryCatalog;
}
