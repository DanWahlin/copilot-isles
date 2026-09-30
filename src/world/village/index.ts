import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Camera,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Euler,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  Object3D,
  Quaternion,
  RepeatWrapping,
  SphereGeometry,
  TorusGeometry,
  Vector3,
  type Material,
  type Texture,
} from 'three/webgpu';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { packs } from '../../engine/packs';
import type { TierSettings } from '../../engine/quality';
import type { CircleObstacle, HeightField } from '../contracts';
import { COVE } from '../layout';
import { coloredIndexedGeometry } from '../sites/geo';
import {
  VILLAGE_HOUSE_PIECES,
  buildHouse,
  houseDoorAnchor,
  houseDoorSideSpot,
  housePerches,
  houseStairsSpan,
  placementWorldMaxY,
  stairsHeightAt,
  type HouseFootprint,
  type HouseSpec,
  type PiecePlacement,
  type StairSpan,
} from './house-builder';
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
}

export interface VillageAnchor {
  x: number;
  y: number;
  z: number;
  heading: number;
}

interface VillageMetrics {
  staticDraws: number;
  propDraws: number;
  drawCalls: number;
  staticTriangles: number;
  propTriangles: number;
  triangles: number;
  buildingCount: number;
}

export interface VillageSystem {
  group: Group;
  colliders: { circles: CircleObstacle[]; boxes: VillageBoxCollider[] };
  shipObstacles: CircleObstacle[];
  perches: Vector3[];
  walkable: (x: number, z: number) => number | null;
  anchors: Record<string, VillageAnchor>;
  metrics: VillageMetrics;
  update(dt: number, t: number, camera: Camera): void;
  dispose(): void;
}

export interface CreateVillageOptions {
  tier: TierSettings;
  heightField: HeightField;
  kit?: VillageKit;
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

type MaterialKey =
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
type RoofType = 'gable' | 'hip' | 'thatch';

interface BuildingSpec {
  id: string;
  x: number;
  z: number;
  w: number;
  d: number;
  rot: number;
  floors: 1 | 2 | 3;
  colour: number;
  roof: RoofType;
  roofColour: number;
  stoneColour?: number;
  quay?: boolean;
  upperOffset?: { x: number; z: number };
  upperScale?: number;
  balcony?: boolean;
  awning?: number;
  sign?: number;
  chimney?: boolean;
  anchor?: string;
}

interface PropInstance {
  x: number;
  z: number;
  y: number;
  rot?: number;
  s?: number;
  sx?: number;
  sy?: number;
  sz?: number;
}

const DEG = Math.PI / 180;
const tmpMatrix = new Matrix4();
const tmpQuat = new Quaternion();
const tmpEuler = new Euler();
const tmpPosition = new Vector3();
const tmpScale = new Vector3();
const tmpObject = new Object3D();

export const VILLAGE_BUILDING_COUNT = 10;
const BOATHOUSE = { x: COVE.pier.x + 2.9, z: -96.5, hx: 2.35, hz: 3.2 } as const;
const QUAY_STEPS = { x: -128, zTop: COVE.quay.z - 2.1, width: 5.5, count: 6, tread: 0.72 } as const;
const PIER_RAMP = {
  x: COVE.pier.x,
  z0: COVE.quay.z - 4.4,
  z1: COVE.quay.z,
  width: COVE.pier.width + 0.8,
} as const;
const BRIGANTINE_BERTH = { minX: -105.5, maxX: -98.9, minZ: -124.5, maxZ: -100.5 } as const;
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

const BUILDINGS: BuildingSpec[] = [
  {
    id: 'harbourmaster',
    x: -94,
    z: -63.6,
    w: 9.2,
    d: 8.3,
    rot: -8 * DEG,
    floors: 2,
    colour: 0x91aeb5,
    roof: 'hip',
    roofColour: 0xa86648,
    quay: true,
    balcony: true,
    sign: 0xd6b259,
    chimney: true,
    anchor: 'harbourmasterDoor',
  },
  {
    id: 'tavern',
    x: -124.8,
    z: -54.2,
    w: 10.8,
    d: 9.4,
    rot: 28 * DEG,
    floors: 3,
    colour: 0xb97868,
    roof: 'gable',
    roofColour: 0x9f5840,
    balcony: true,
    awning: 0xe4bd64,
    sign: 0xf2d17c,
    chimney: true,
    anchor: 'tavernDoor',
  },
  {
    id: 'chandlery',
    x: -139.5,
    z: -64.6,
    w: 9.4,
    d: 8.1,
    rot: 8 * DEG,
    floors: 2,
    colour: 0xbfa36e,
    roof: 'gable',
    roofColour: 0xa45f42,
    quay: true,
    awning: 0x4f9c8a,
    sign: 0xe6c67b,
    chimney: true,
    anchor: 'chandleryDoor',
  },
  {
    id: 'fish-market',
    x: -147.2,
    z: -51.6,
    w: 10.0,
    d: 7.4,
    rot: -19 * DEG,
    floors: 1,
    colour: 0xd8cdb4,
    roof: 'thatch',
    roofColour: 0xa99a71,
    stoneColour: 0xa09c8a,
    awning: 0x77aabd,
    sign: 0xd2c05e,
    anchor: 'fishMarketDoor',
  },
  {
    id: 'storehouse',
    x: -82.2,
    z: -50.4,
    w: 9.8,
    d: 10.6,
    rot: -31 * DEG,
    floors: 2,
    colour: 0xd0c7aa,
    roof: 'gable',
    roofColour: 0x9b6046,
    stoneColour: 0x9a9888,
    chimney: false,
    anchor: 'storehouseDoor',
  },
  {
    id: 'sky-blue-house',
    x: -106.8,
    z: -32.8,
    w: 8.2,
    d: 8.8,
    rot: -44 * DEG,
    floors: 2,
    colour: 0x8faebe,
    roof: 'hip',
    roofColour: 0xaa6a48,
    balcony: false,
    chimney: true,
  },
  {
    id: 'lime-cottage',
    x: -133.8,
    z: -32.6,
    w: 7.6,
    d: 7.2,
    rot: 42 * DEG,
    floors: 2,
    colour: 0xa2b48f,
    roof: 'thatch',
    roofColour: 0xaa9b6d,
    stoneColour: 0x999786,
    awning: 0xd1c48c,
  },
  {
    id: 'chartmaker',
    x: -117.4,
    z: -18.4,
    w: 8.5,
    d: 7.8,
    rot: -3 * DEG,
    floors: 2,
    colour: 0xd9ceb2,
    roof: 'gable',
    roofColour: 0xab6a49,
    balcony: true,
    sign: 0xf0d990,
    anchor: 'chartmakerDoor',
  },
  {
    id: 'cream-rowhouse',
    x: -150.5,
    z: -40.5,
    w: 7.4,
    d: 9.2,
    rot: 79 * DEG,
    floors: 2,
    colour: 0xdccfaf,
    roof: 'hip',
    roofColour: 0xa96547,
    balcony: false,
    chimney: true,
  },
  {
    id: 'green-leaning-house',
    x: -95.5,
    z: -24.1,
    w: 7.2,
    d: 7.7,
    rot: 25 * DEG,
    floors: 2,
    colour: 0x8faf96,
    roof: 'thatch',
    roofColour: 0xa89969,
    stoneColour: 0x969181,
  },
];

let villageKitPromise: Promise<VillageKit> | null = null;

export function loadVillageKit(base = '/packs/testcove/village/kit.glb'): Promise<VillageKit> {
  villageKitPromise ??= loadVillageKitInternal(base);
  return villageKitPromise;
}

function createFallbackVillageKit(): VillageKit {
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
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const gltf: GLTF = await loader.loadAsync(packs.url(url));
  return createVillageKitFromGltf(gltf);
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
          const part = subsetGeometry(geometry, group.start, group.count);
          part.applyMatrix4(object.matrixWorld);
          parts.push({ geometry: part, materialKey: kitMaterialKey(material.name) });
        }
      } else {
        const material = materialList[0]!;
        const part = cloneGeometryAsFloat(geometry);
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

export async function createVillage({
  tier,
  heightField,
  kit,
}: CreateVillageOptions): Promise<VillageSystem> {
  const villageKit =
    kit ?? (typeof window === 'undefined' ? createFallbackVillageKit() : await loadVillageKit());
  const group = new Group();
  group.name = 'anchorage-cay-village';

  const buckets = makeBuckets();
  const colliders = { circles: [] as CircleObstacle[], boxes: [] as VillageBoxCollider[] };
  const shipObstacles: CircleObstacle[] = [];
  const perches: Vector3[] = [];
  const anchors: Record<string, VillageAnchor> = {};
  const low = tier.tier === 'lite' || tier.tier === 'low';
  const mediumUp = tier.tier !== 'lite' && tier.tier !== 'low';
  streetHeightField = heightField;
  stairSpans.length = 0;

  addQuay(buckets, colliders, shipObstacles, anchors, perches);
  addPier(buckets, colliders, shipObstacles, anchors, perches, villageKit, low);
  for (const building of BUILDINGS)
    addBuilding(building, heightField, buckets, colliders, anchors, perches, villageKit, low);
  addPlaza(buckets, colliders, anchors, heightField, villageKit, low);
  addMarketStalls(buckets, colliders, anchors, heightField, perches);
  if (!low) addVillageFestooning(buckets, colliders, heightField);
  addLighthouse(buckets, colliders, shipObstacles, anchors, perches);
  addLanterns(buckets, colliders, heightField, low);
  addMooredBoatShipObstacles(shipObstacles);

  const materials = villageKit.materials;

  let staticDraws = 0;
  let staticTriangles = 0;
  const staticMeshes: Mesh[] = [];
  for (const key of Object.keys(buckets) as MaterialKey[]) {
    const geometries = buckets[key];
    if (geometries.length === 0) continue;
    const merged = mergeGeometries(geometries, false);
    for (const geometry of geometries) geometry.dispose();
    if (!merged) continue;
    merged.computeBoundingSphere();
    merged.computeBoundingBox();
    const mesh = new Mesh(merged, materials[key]);
    mesh.name = `village-${key}`;
    mesh.castShadow = key !== 'glow' && key !== 'halo';
    mesh.receiveShadow = key !== 'glow' && key !== 'halo';
    group.add(mesh);
    staticMeshes.push(mesh);
    staticDraws += 1;
    staticTriangles += triangleCount(merged);
  }

  const propMeshes = addInstancedProps(group, heightField, materials, colliders, villageKit, low, mediumUp);
  const propTriangles = propMeshes.reduce((sum, mesh) => sum + triangleCount(mesh.geometry) * mesh.count, 0);
  const metrics: VillageMetrics = {
    staticDraws,
    propDraws: propMeshes.length,
    drawCalls: staticDraws + propMeshes.length,
    staticTriangles,
    propTriangles,
    triangles: staticTriangles + propTriangles,
    buildingCount: BUILDINGS.length,
  };
  group.userData.villageMetrics = metrics;

  return {
    group,
    colliders,
    shipObstacles,
    perches,
    walkable,
    anchors,
    metrics,
    update(_dt: number, _t: number, camera: Camera): void {
      group.userData.lastCameraDistance = Math.hypot(
        camera.position.x - COVE.village.center.x,
        camera.position.z - COVE.village.center.z,
      );
    },
    dispose(): void {
      for (const mesh of staticMeshes) {
        mesh.geometry.dispose();
      }
      for (const mesh of propMeshes) {
        mesh.geometry.dispose();
        mesh.dispose();
      }
      for (const material of Object.values(materials)) material.dispose();
      if (streetHeightField === heightField) streetHeightField = null;
      group.clear();
    },
  };
}

export function walkable(x: number, z: number): number | null {
  // Door stairs first: they stand on the quay and streets, so they're the higher surface there.
  for (const span of stairSpans) {
    const h = stairsHeightAt(span, x, z);
    if (h !== null) return h;
  }
  if (Math.abs(x - PIER_RAMP.x) <= PIER_RAMP.width * 0.5 && z >= PIER_RAMP.z0 && z <= PIER_RAMP.z1) {
    const t = (z - PIER_RAMP.z0) / (PIER_RAMP.z1 - PIER_RAMP.z0);
    return COVE.pier.deck + (COVE.quay.height - COVE.pier.deck) * t;
  }
  const q = COVE.quay;
  if (x >= q.x0 - 1.2 && x <= q.x1 + 1.2 && z >= q.z - 1.6 && z <= q.z + 8.5) return q.height;
  if (
    Math.abs(x - QUAY_STEPS.x) <= QUAY_STEPS.width * 0.5 + 0.15 &&
    z <= QUAY_STEPS.zTop + 0.55 &&
    z >= QUAY_STEPS.zTop - QUAY_STEPS.tread * (QUAY_STEPS.count - 1) - 0.55
  ) {
    const step = Math.max(
      0,
      Math.min(QUAY_STEPS.count - 1, Math.round((QUAY_STEPS.zTop - z) / QUAY_STEPS.tread)),
    );
    return 0.45 + step * 0.33 + 0.3;
  }
  const p = COVE.pier;
  const minZ = Math.min(p.z0, p.z1);
  const maxZ = Math.max(p.z0, p.z1);
  if (Math.abs(x - p.x) <= p.width * 0.5 + 0.35 && z >= minZ && z <= maxZ + 0.8) return p.deck;
  if (Math.abs(x - BOATHOUSE.x) <= BOATHOUSE.hx + 0.25 && Math.abs(z - BOATHOUSE.z) <= BOATHOUSE.hz + 0.25)
    return p.deck;
  const street = streetWalkable(x, z);
  if (street !== null) return street;
  return null;
}

function makeBuckets(): Record<MaterialKey, BufferGeometry[]> {
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

type BuildingHousePlan = Omit<HouseSpec, 'id' | 'origin' | 'rotY' | 'tint' | 'roofTint'> & {
  seed: number;
};

const BUILDING_HOUSE_PLANS = {
  harbourmaster: {
    footprint: { w: 6, d: 4 },
    storeys: 2,
    ground: 'unevenbrick',
    upper: 'mixed',
    doorSide: 'front',
    doorSegment: 1,
    windows: 'regular',
    roof: 'gable',
    dormers: 1,
    chimney: true,
    balcony: true,
    overhang: true,
    stairs: true,
    vines: 1,
    seed: 11,
  },
  tavern: {
    footprint: { w: 6, d: 8 },
    storeys: 3,
    ground: 'unevenbrick',
    upper: 'woodgrid',
    doorSide: 'front',
    doorSegment: 1,
    windows: 'regular',
    roof: 'gable',
    dormers: 2,
    chimney: true,
    balcony: true,
    overhang: true,
    stairs: true,
    vines: false,
    seed: 17,
  },
  chandlery: {
    footprint: { w: 6, d: 4 },
    storeys: 2,
    ground: 'unevenbrick',
    upper: 'mixed',
    doorSide: 'front',
    doorSegment: 1,
    windows: 'regular',
    roof: 'gable',
    dormers: 1,
    chimney: true,
    balcony: false,
    overhang: false,
    stairs: true,
    vines: false,
    seed: 23,
  },
  'fish-market': {
    footprint: { w: 6, d: 4 },
    storeys: 1,
    ground: 'unevenbrick',
    upper: 'plaster',
    doorSide: 'front',
    doorSegment: 1,
    windows: 'sparse',
    roof: 'gable',
    dormers: false,
    chimney: false,
    balcony: false,
    overhang: false,
    stairs: false,
    vines: 1,
    seed: 31,
  },
  storehouse: {
    footprint: { w: 6, d: 6 },
    storeys: 2,
    ground: 'unevenbrick',
    upper: 'plaster',
    doorSide: 'front',
    doorSegment: 1,
    windows: 'sparse',
    roof: 'gable',
    dormers: false,
    chimney: false,
    balcony: false,
    overhang: false,
    stairs: false,
    vines: false,
    seed: 37,
  },
  'sky-blue-house': {
    footprint: { w: 6, d: 4 },
    storeys: 2,
    ground: 'unevenbrick',
    upper: 'mixed',
    doorSide: 'front',
    doorSegment: 1,
    windows: 'regular',
    roof: 'gable',
    dormers: false,
    chimney: true,
    balcony: false,
    overhang: false,
    stairs: false,
    vines: false,
    seed: 41,
  },
  'lime-cottage': {
    footprint: { w: 4, d: 4 },
    storeys: 2,
    ground: 'unevenbrick',
    upper: 'plaster',
    doorSide: 'front',
    doorSegment: 0,
    windows: 'regular',
    roof: 'gable',
    dormers: false,
    chimney: true,
    balcony: false,
    overhang: false,
    stairs: false,
    vines: 1,
    seed: 43,
  },
  chartmaker: {
    footprint: { w: 6, d: 4 },
    storeys: 2,
    ground: 'unevenbrick',
    upper: 'woodgrid',
    doorSide: 'front',
    doorSegment: 1,
    windows: 'regular',
    roof: 'gable',
    dormers: 1,
    chimney: true,
    balcony: true,
    overhang: true,
    stairs: true,
    vines: 1,
    seed: 47,
  },
  'cream-rowhouse': {
    footprint: { w: 4, d: 6 },
    storeys: 2,
    ground: 'unevenbrick',
    upper: 'mixed',
    doorSide: 'front',
    doorSegment: 0,
    windows: 'regular',
    roof: 'gable',
    dormers: false,
    chimney: true,
    balcony: false,
    overhang: false,
    stairs: false,
    vines: false,
    seed: 53,
  },
  'green-leaning-house': {
    footprint: { w: 4, d: 4 },
    storeys: 2,
    ground: 'unevenbrick',
    upper: 'woodgrid',
    doorSide: 'front',
    doorSegment: 0,
    windows: 'sparse',
    roof: 'gable',
    dormers: false,
    chimney: false,
    balcony: false,
    overhang: false,
    stairs: false,
    vines: false,
    seed: 59,
  },
} as const satisfies Record<string, BuildingHousePlan>;

function buildingHousePlan(spec: BuildingSpec): BuildingHousePlan {
  return (
    BUILDING_HOUSE_PLANS[spec.id as keyof typeof BUILDING_HOUSE_PLANS] ?? {
      footprint: { w: 6, d: 4 },
      storeys: spec.floors,
      ground: 'unevenbrick',
      upper: 'mixed',
      doorSide: 'front',
      doorSegment: 1,
      windows: 'regular',
      roof: 'gable',
      dormers: false,
      chimney: spec.chimney ?? false,
      balcony: spec.balcony ?? false,
      overhang: false,
      stairs: false,
      vines: false,
      seed: 7,
    }
  );
}

function buildingFootprint(spec: BuildingSpec): HouseFootprint {
  return buildingHousePlan(spec).footprint;
}

function houseSpecForBuilding(spec: BuildingSpec, baseY: number, low: boolean): HouseSpec {
  const plan = buildingHousePlan(spec);
  return {
    ...plan,
    id: spec.id,
    dormers: low ? false : plan.dormers,
    chimney: !low && (spec.chimney ?? plan.chimney),
    balcony: !low && Boolean(spec.balcony && plan.balcony),
    overhang: !low && Boolean(plan.overhang),
    vines: low ? false : plan.vines,
    origin: { x: spec.x, y: baseY, z: spec.z },
    rotY: spec.rot,
    tint: spec.colour,
    roofTint: spec.roofColour,
  };
}

function addBuilding(
  spec: BuildingSpec,
  heightField: HeightField,
  buckets: Record<MaterialKey, BufferGeometry[]>,
  colliders: { boxes: VillageBoxCollider[] },
  anchors: Record<string, VillageAnchor>,
  perches: Vector3[],
  kit: VillageKit,
  low: boolean,
): void {
  const baseY = spec.quay ? COVE.quay.height : heightField.heightAt(spec.x, spec.z);
  const house = houseSpecForBuilding(spec, baseY, low);
  const placements = buildHouse(house);
  addBuildingFoundation(spec, heightField, house.footprint, baseY, buckets);
  for (const placement of placements) addKitPlacement(buckets, kit, placement);
  if (!low) addColonialBuildingDetails(spec, house.footprint, baseY, buckets);
  perches.push(...housePerches(house, placements));

  const footprint = house.footprint;
  const maxY = placements.reduce((max, placement) => Math.max(max, placementWorldMaxY(placement)), baseY);
  colliders.boxes.push({
    x: spec.x,
    z: spec.z,
    hx: footprint.w * 0.52,
    hz: footprint.d * 0.52,
    rot: spec.rot,
    height: Math.max(3.2, maxY - baseY),
  });
  if (spec.anchor) anchors[spec.anchor] = houseDoorAnchor(house);
  const stairs = houseStairsSpan(house);
  if (stairs) stairSpans.push(stairs);
}

function addBuildingFoundation(
  spec: BuildingSpec,
  heightField: HeightField,
  footprint: HouseFootprint,
  baseY: number,
  buckets: Record<MaterialKey, BufferGeometry[]>,
): void {
  const corners = [
    [-footprint.w * 0.5, -footprint.d * 0.5],
    [footprint.w * 0.5, -footprint.d * 0.5],
    [footprint.w * 0.5, footprint.d * 0.5],
    [-footprint.w * 0.5, footprint.d * 0.5],
  ] as const;
  const minGround = spec.quay
    ? COVE.quay.height - 0.08
    : Math.min(
        ...corners.map(([lx, lz]) => {
          const p = localToWorld(spec.x, spec.z, spec.rot, lx, lz);
          return heightField.heightAt(p.x, p.z);
        }),
      );
  const bottom = Math.min(minGround - 0.08, baseY - 0.16);
  const top = baseY + 0.08;
  addBox(
    buckets.paving,
    spec.x,
    bottom,
    spec.z,
    footprint.w + 0.36,
    Math.max(0.18, top - bottom),
    footprint.d + 0.36,
    spec.rot,
    spec.stoneColour ?? 0x928a78,
  );
}

function addColonialBuildingDetails(
  spec: BuildingSpec,
  footprint: HouseFootprint,
  baseY: number,
  buckets: Record<MaterialKey, BufferGeometry[]>,
): void {
  const shutterPalette = [0x2f6f7f, 0x6f3f35, 0x3f7a52, 0x8f4b38, 0xb7833e] as const;
  const accent = shutterPalette[Math.abs(spec.id.length + Math.round(spec.x)) % shutterPalette.length]!;
  const frontZ = -footprint.d * 0.5 - 0.08;
  const windowXs = footprint.w > 5 ? [-footprint.w * 0.24, footprint.w * 0.24] : [0];
  const storeyYs = spec.floors > 1 ? [1.65, 3.55] : [1.55];

  for (const yOffset of storeyYs) {
    for (const lx of windowXs) {
      const p = localToWorld(spec.x, spec.z, spec.rot, lx, frontZ);
      addWindowShutters(buckets, p.x, baseY + yOffset, p.z, spec.rot, accent);
      if (yOffset < 2.1) addFlowerBox(buckets, p.x, baseY + yOffset - 0.55, p.z, spec.rot);
    }
  }

  const doorSign = localToWorld(spec.x, spec.z, spec.rot, -footprint.w * 0.34, frontZ - 0.08);
  const lamp = houseDoorSideSpot(houseSpecForBuilding(spec, baseY, false));
  addDoorLantern(buckets, lamp, lamp.y + 1.5);
  if (spec.sign) addHangingShopSign(buckets, doorSign.x, baseY + 2.1, doorSign.z, spec.rot, spec.sign);
  if (spec.awning)
    addDoorAwning(buckets, spec.x, baseY + 2.2, spec.z, spec.rot, footprint.w, frontZ, spec.awning);
  if (spec.id === 'tavern') addBoardedWindowPatch(buckets, spec, footprint, baseY);
}

function addWindowShutters(
  buckets: Record<MaterialKey, BufferGeometry[]>,
  x: number,
  y: number,
  z: number,
  rot: number,
  colour: number,
): void {
  const left = localToWorld(x, z, rot, -0.42, 0);
  const right = localToWorld(x, z, rot, 0.42, 0);
  addBox(buckets.wood, left.x, y - 0.34, left.z, 0.16, 0.72, 0.08, rot, colour);
  addBox(buckets.wood, right.x, y - 0.34, right.z, 0.16, 0.72, 0.08, rot, colour);
  addBox(buckets.wood, left.x, y - 0.02, left.z, 0.2, 0.055, 0.1, rot, 0xd0b06f);
  addBox(buckets.wood, right.x, y - 0.02, right.z, 0.2, 0.055, 0.1, rot, 0xd0b06f);
}

function addFlowerBox(
  buckets: Record<MaterialKey, BufferGeometry[]>,
  x: number,
  y: number,
  z: number,
  rot: number,
): void {
  addBox(buckets.wood, x, y, z, 0.96, 0.18, 0.2, rot, 0x6f4a2f);
  for (const lx of [-0.32, 0, 0.32]) {
    const p = localToWorld(x, z, rot, lx, -0.02);
    addCylinder(buckets.cloth, p.x, y + 0.16, p.z, 0.08, 0.05, 0.16, 7, rot, lx === 0 ? 0xffd364 : 0xd65b7f);
  }
  addBox(buckets.rope, x, y + 0.12, z, 0.86, 0.08, 0.08, rot, 0x3f7a43);
}

/**
 * A small lantern on a wall bracket beside a door: a plate on the wall, an arm straight out, and the
 * lantern hanging from its end. `spot` is on the wall surface, `heading` facing out; `y` is the
 * lantern's base.
 */
function addDoorLantern(
  buckets: Record<MaterialKey, BufferGeometry[]>,
  spot: { x: number; z: number; heading: number },
  y: number,
): void {
  const nx = Math.sin(spot.heading);
  const nz = Math.cos(spot.heading);
  // addBox's length runs along its local x; this yaw points it out of the wall.
  const out = spot.heading - Math.PI / 2;
  const reach = 0.36;
  const at = (d: number) => ({ x: spot.x + nx * d, z: spot.z + nz * d });
  const plate = at(0.015);
  const arm = at(reach * 0.5);
  const lamp = at(reach - 0.02);
  addBox(buckets.metal, plate.x, y + 0.38, plate.z, 0.03, 0.22, 0.12, out, 0x5f574f);
  addBox(buckets.metal, arm.x, y + 0.5, arm.z, reach, 0.04, 0.04, out, 0x5f574f);
  addBox(buckets.metal, lamp.x, y + 0.39, lamp.z, 0.016, 0.12, 0.016, out, 0x5f574f);
  addLanternFixture(buckets, lamp.x, y, lamp.z, spot.heading, 0.52);
}

function addHangingShopSign(
  buckets: Record<MaterialKey, BufferGeometry[]>,
  x: number,
  y: number,
  z: number,
  rot: number,
  colour: number,
): void {
  addBox(buckets.metal, x, y + 0.38, z, 0.86, 0.045, 0.045, rot, 0x5f574f);
  addBox(buckets.wood, x, y, z, 0.9, 0.48, 0.09, rot, 0x755030);
  addBox(buckets.cloth, x, y + 0.03, z - 0.055, 0.62, 0.18, 0.025, rot, colour);
  addTorus(buckets.metal, x - 0.28, y + 0.28, z, 0.08, 0.012, 8, 0x6f665c, Math.PI / 2, 0, 0);
  addTorus(buckets.metal, x + 0.28, y + 0.28, z, 0.08, 0.012, 8, 0x6f665c, Math.PI / 2, 0, 0);
}

function addDoorAwning(
  buckets: Record<MaterialKey, BufferGeometry[]>,
  x: number,
  y: number,
  z: number,
  rot: number,
  width: number,
  frontZ: number,
  colour: number,
): void {
  const p = localToWorld(x, z, rot, 0, frontZ - 0.22);
  addBox(buckets.cloth, p.x, y, p.z, Math.min(width * 0.7, 3.4), 0.09, 0.95, rot, colour, 0.18, 0);
  addBox(buckets.wood, p.x, y - 0.04, p.z - 0.45, Math.min(width * 0.72, 3.55), 0.09, 0.08, rot, 0x6c482d);
}

function addBoardedWindowPatch(
  buckets: Record<MaterialKey, BufferGeometry[]>,
  spec: BuildingSpec,
  footprint: HouseFootprint,
  baseY: number,
): void {
  const p = localToWorld(spec.x, spec.z, spec.rot, -footprint.w * 0.33, -footprint.d * 0.5 - 0.13);
  addBox(buckets.wood, p.x, baseY + 1.06, p.z, 1.12, 0.92, 0.1, spec.rot, 0x4f3525);
  for (let i = 0; i < 3; i += 1) {
    addBox(
      buckets.rope,
      p.x,
      baseY + 1.14 + i * 0.25,
      p.z - 0.055,
      1.22,
      0.13,
      0.08,
      spec.rot + (i - 1) * 0.05,
      i % 2 ? 0x7a5438 : 0x6a472e,
    );
  }
  addBox(
    buckets.metal,
    p.x - 0.5 * Math.cos(spec.rot),
    baseY + 1.47,
    p.z + 0.5 * Math.sin(spec.rot),
    0.06,
    0.22,
    0.07,
    spec.rot,
    0x2d2924,
  );

  const screen = localToWorld(spec.x, spec.z, spec.rot, -footprint.w * 0.48, -footprint.d * 0.5 - 0.16);
  addBox(buckets.wood, screen.x, baseY + 0.72, screen.z, 1.35, 2.2, 0.12, spec.rot, 0x5a3a25);
  for (let i = 0; i < 5; i += 1) {
    addBox(
      buckets.rope,
      screen.x,
      baseY + 0.9 + i * 0.34,
      screen.z - 0.07,
      1.52,
      0.13,
      0.08,
      spec.rot + (i % 2 ? -0.035 : 0.045),
      i % 2 ? 0x795236 : 0x6a472e,
    );
  }

  const side = localToWorld(spec.x, spec.z, spec.rot, -footprint.w * 0.5 - 0.16, -footprint.d * 0.15);
  addBox(buckets.wood, side.x, baseY + 0.58, side.z, 1.28, 2.35, 0.12, spec.rot + Math.PI / 2, 0x513421);
  for (let i = 0; i < 5; i += 1) {
    addBox(
      buckets.rope,
      side.x,
      baseY + 0.82 + i * 0.34,
      side.z - 0.07,
      1.42,
      0.13,
      0.08,
      spec.rot + Math.PI / 2 + (i % 2 ? 0.04 : -0.03),
      i % 2 ? 0x7c5437 : 0x68462e,
    );
  }
}

function addKitPlacement(
  buckets: Record<MaterialKey, BufferGeometry[]>,
  kit: VillageKit,
  placement: PiecePlacement,
): void {
  const parts = kit.pieces.get(placement.piece);
  if (!parts) return;
  for (const base of parts) {
    const geometry = base.geometry.clone();
    geometry.applyMatrix4(placement.matrix);
    paint(geometry, kitPaintColour(base.materialKey, placement.tint));
    buckets[base.materialKey].push(geometry);
  }
}

function kitPaintColour(materialKey: MaterialKey, tint?: number): number {
  if (materialKey === 'plaster') return tint ?? 0xffffff;
  if (materialKey === 'wood') return 0x9b7651;
  return 0xffffff;
}

function addQuay(
  buckets: Record<MaterialKey, BufferGeometry[]>,
  colliders: { circles: CircleObstacle[]; boxes: VillageBoxCollider[] },
  shipObstacles: CircleObstacle[],
  anchors: Record<string, VillageAnchor>,
  perches: Vector3[],
): void {
  const q = COVE.quay;
  const length = q.x1 - q.x0;
  const cx = (q.x0 + q.x1) * 0.5;
  addBox(buckets.stone, cx, 0, q.z - 1.35, length, q.height, 3.0, 0, 0xb4a487);
  addQuayFrontBand(buckets);
  addBox(buckets.paving, cx, q.height - 0.1, q.z + 3.2, length - 3.0, 0.16, 8.2, 0, 0xb9a783);
  addQuayBackCurb(buckets);
  addBox(buckets.stone, cx, 0.35, q.z - 2.95, length - 1.2, 0.72, 0.22, 0, 0x253d2e);
  for (const x of [-145, -133, -120, -96, -81]) {
    addQuayBollard(buckets, x, q.height, q.z + 0.35);
    addRopeCoil(buckets, x + 0.42, q.height + 0.05, q.z + 0.85, 0.2, 0.68);
    colliders.circles.push({ x, z: q.z + 0.35, r: 0.75 });
    perches.push(new Vector3(x, q.height + 0.72, q.z + 0.35));
  }
  for (let x = q.x0; x <= q.x1 + 0.01; x += 3) shipObstacles.push({ x, z: q.z - 2.35, r: 1.8 });
  for (const x of [-142, -116, -88]) {
    addTorus(buckets.metal, x, 1.16, q.z - 2.88, 0.33, 0.04, 12, 0x33302b, 0, 0, 0);
  }
  addSteps(buckets, -128, q.z - 2.1, q.height);
  addLadder(buckets, -91.5, q.z - 2.9, 0.1, q.height + 0.45);
  addLadder(buckets, -144.5, q.z - 2.9, 0.1, q.height + 0.45);
  shipObstacles.push({ x: q.x0, z: q.z - 1.5, r: 3.2 }, { x: q.x1, z: q.z - 1.5, r: 3.2 });
  // Salt's bench, looking out over the harbour. The seated rig tucks its feet under the seat, so it
  // needs a bench with open space beneath (a barrel put his legs through the staves).
  const salt = { x: -88.5, z: q.z + 5.2, faces: -0.4 + Math.PI };
  const seatTop = addQuayBench(buckets, colliders, salt.x, q.height + 0.06, salt.z, salt.faces);
  anchors.quayBenches = { x: salt.x, y: seatTop, z: salt.z, heading: -0.4 };
  anchors.noticeBoard = { x: -104.7, y: q.height, z: q.z + 5.3, heading: Math.PI };
  addChartTable(buckets, colliders, anchors, q.height + 0.06);
}

/**
 * Ezra's chart table at the foot of the pier (Q0.3), so forking the course is a few steps from Nell
 * rather than a walk up to his shop. He stands at its east end, facing the way you come from Nell.
 */
function addChartTable(
  buckets: Record<MaterialKey, BufferGeometry[]>,
  colliders: { boxes: VillageBoxCollider[] },
  anchors: Record<string, VillageAnchor>,
  floor: number,
): void {
  const t = COVE.chartTable;
  const top = floor + 0.84;
  addBox(buckets.wood, t.x, top - 0.06, t.z, 1.5, 0.06, 0.86, 0, 0x7a5232);
  for (const sx of [-0.66, 0.66])
    for (const sz of [-0.34, 0.34])
      addBox(buckets.wood, t.x + sx, floor, t.z + sz, 0.08, top - 0.06 - floor, 0.08, 0, 0x5e3f25);
  addBox(buckets.wood, t.x, floor + 0.18, t.z, 1.3, 0.05, 0.05, 0, 0x5e3f25);
  // The master chart, weighted at the corners, with its islands inked in and a rolled spare.
  addBox(buckets.cloth, t.x - 0.05, top, t.z, 1.08, 0.012, 0.7, 0.04, 0xe8d9b0);
  for (const [dx, dz, w, d, r] of [
    [-0.32, -0.12, 0.2, 0.14, 0.4],
    [0.05, 0.14, 0.26, 0.12, -0.3],
    [0.3, -0.18, 0.14, 0.1, 0.9],
    [-0.1, -0.2, 0.08, 0.07, 0.2],
  ] as const)
    addBox(buckets.cloth, t.x + dx, top + 0.012, t.z + dz, w, 0.004, d, r, 0x6f8b5a);
  addBox(buckets.cloth, t.x + 0.12, top + 0.013, t.z - 0.02, 0.5, 0.003, 0.012, -0.5, 0x7a3b28);
  for (const [dx, dz] of [
    [-0.55, -0.3],
    [0.45, -0.3],
    [-0.55, 0.3],
    [0.45, 0.3],
  ] as const)
    addCylinder(buckets.metal, t.x + dx, top, t.z + dz, 0.035, 0.04, 0.05, 8, 0, 0x6b6258);
  const roll = new CylinderGeometry(0.045, 0.045, 0.62, 10, 1);
  transform(roll, t.x + 0.6, top + 0.045, t.z + 0.12, 0.2, 0, Math.PI / 2, 1, 1, 1);
  paint(roll, 0xdcc99c);
  buckets.cloth.push(roll);
  addCylinder(buckets.metal, t.x + 0.58, top, t.z - 0.24, 0.035, 0.045, 0.07, 8, 0, 0x2b2622);
  colliders.boxes.push({ x: t.x, z: t.z, hx: 0.8, hz: 0.48, rot: 0, height: 1 });
  anchors.chartTable = { x: t.x + 1.45, y: floor, z: t.z, heading: Math.PI / 2 };
}

/**
 * A plank bench with a backrest for someone sitting at (x, z) facing `faces`; the seat sits a little
 * behind that point so their knees clear the front edge. Returns the seat's top height.
 */
function addQuayBench(
  buckets: Record<MaterialKey, BufferGeometry[]>,
  colliders: { boxes: VillageBoxCollider[] },
  x: number,
  floor: number,
  z: number,
  faces: number,
): number {
  const fx = Math.sin(faces);
  const fz = Math.cos(faces);
  // addBox's length runs along (cos rot, −sin rot): across the sitter's lap.
  const rot = faces;
  const tx = Math.cos(rot);
  const tz = -Math.sin(rot);
  const cx = x - fx * 0.1;
  const cz = z - fz * 0.1;
  const seat = 0.4;
  addBox(buckets.wood, cx, floor + seat, cz, 1.5, 0.07, 0.42, rot, 0x7a5232);
  for (const s of [-0.62, 0.62]) {
    addBox(buckets.wood, cx + tx * s, floor, cz + tz * s, 0.08, seat, 0.36, rot, 0x5e3f25);
    const bx = cx + tx * s - fx * 0.19;
    const bz = cz + tz * s - fz * 0.19;
    addBox(buckets.wood, bx, floor + seat + 0.07, bz, 0.07, 0.4, 0.05, rot, 0x5e3f25);
  }
  addBox(buckets.wood, cx - fx * 0.2, floor + seat + 0.3, cz - fz * 0.2, 1.46, 0.13, 0.04, rot, 0x7a5232);
  colliders.boxes.push({ x: cx, z: cz, hx: 0.78, hz: 0.24, rot, height: 0.9 });
  return floor + seat + 0.07;
}

function addQuayFrontBand(buckets: Record<MaterialKey, BufferGeometry[]>): void {
  const q = COVE.quay;
  const gapHalf = COVE.pier.width * 0.5 + 1.0;
  const leftX0 = q.x0 - 0.7;
  const leftX1 = COVE.pier.x - gapHalf;
  const rightX0 = COVE.pier.x + gapHalf;
  const rightX1 = q.x1 + 0.7;
  for (const [x0, x1] of [
    [leftX0, leftX1],
    [rightX0, rightX1],
  ] as const) {
    const w = x1 - x0;
    if (w <= 0) continue;
    addBox(buckets.paving, (x0 + x1) * 0.5, q.height - 0.08, q.z - 0.9, w, 0.32, 2.15, 0, 0x9a9078);
    addBox(buckets.paving, (x0 + x1) * 0.5, q.height + 0.14, q.z - 1.02, w, 0.12, 1.95, 0, 0xa59a80);
    for (let x = x0 + 2.0; x < x1 - 0.6; x += 3.2) {
      addBox(buckets.paving, x, q.height + 0.205, q.z - 1.02, 0.045, 0.014, 1.78, 0, 0x756e5d);
    }
  }
}

function addQuayBackCurb(buckets: Record<MaterialKey, BufferGeometry[]>): void {
  const q = COVE.quay;
  const cx = (q.x0 + q.x1) * 0.5;
  addBox(buckets.stone, cx, q.height + 0.02, q.z + 7.34, q.x1 - q.x0 - 3.0, 0.18, 0.28, 0, 0x9a9178);
  addBox(buckets.stone, q.x0 + 1.28, q.height + 0.02, q.z + 3.1, 0.26, 0.16, 7.5, 0, 0x9a9178);
  addBox(buckets.stone, q.x1 - 1.28, q.height + 0.02, q.z + 3.1, 0.26, 0.16, 7.5, 0, 0x9a9178);
}

function addQuayBollard(
  buckets: Record<MaterialKey, BufferGeometry[]>,
  x: number,
  y: number,
  z: number,
): void {
  addCylinder(buckets.metal, x, y, z, 0.34, 0.42, 0.16, 14, 0, 0x8b857b);
  addCylinder(buckets.metal, x, y + 0.16, z, 0.22, 0.26, 0.52, 14, 0, 0x9a9287);
  addCylinder(buckets.metal, x, y + 0.66, z, 0.5, 0.28, 0.18, 14, 0, 0x91897f);
  addTorus(buckets.metal, x, y + 0.72, z, 0.39, 0.045, 16, 0xa89d90, Math.PI / 2, 0, 0);
}

function addSteps(buckets: Record<MaterialKey, BufferGeometry[]>, x: number, z: number, top: number): void {
  for (let i = 0; i < 6; i += 1) {
    const y = 0.45 + i * 0.33;
    addBox(buckets.stone, x, y, z - i * 0.72, 5.5, 0.3, 0.78, 0, 0x9b927f);
  }
  addBox(buckets.metal, x - 3.05, 1.25, z - 1.95, 0.12, top - 0.15, 0.12, 0, 0x2c2a26);
}

function addLadder(
  buckets: Record<MaterialKey, BufferGeometry[]>,
  x: number,
  z: number,
  y0: number,
  y1: number,
): void {
  const h = y1 - y0;
  addBox(buckets.wood, x - 0.34, y0, z, 0.09, h, 0.09, 0, 0x624429);
  addBox(buckets.wood, x + 0.34, y0, z, 0.09, h, 0.09, 0, 0x624429);
  for (let y = y0 + 0.45; y < y1 - 0.2; y += 0.42)
    addBox(buckets.wood, x, y, z, 0.78, 0.06, 0.08, 0, 0x6e4b2b);
}

function addShipObstacle(target: CircleObstacle[], obstacle: CircleObstacle): void {
  if (!circleOverlapsBerth(obstacle)) target.push(obstacle);
}

function circleOverlapsBerth(obstacle: CircleObstacle): boolean {
  return (
    obstacle.x + obstacle.r > BRIGANTINE_BERTH.minX &&
    obstacle.x - obstacle.r < BRIGANTINE_BERTH.maxX &&
    obstacle.z + obstacle.r > BRIGANTINE_BERTH.minZ &&
    obstacle.z - obstacle.r < BRIGANTINE_BERTH.maxZ
  );
}

function addWeatheredPierDeck(
  buckets: Record<MaterialKey, BufferGeometry[]>,
  pier: typeof COVE.pier,
  minZ: number,
  maxZ: number,
  low: boolean,
): void {
  const length = maxZ - minZ;
  addBox(
    buckets.rope,
    pier.x,
    pier.deck - 0.26,
    (minZ + maxZ) * 0.5,
    pier.width + 0.34,
    0.14,
    length + 0.72,
    0,
    0x2c251e,
  );

  const usableWidth = pier.width + 0.28;
  const plankDepth = low ? 0.34 : 0.255;
  const gap = low ? 0.035 : 0.026;
  let index = 0;
  for (let z = minZ + 0.2; z <= maxZ - 0.2; z += plankDepth + gap) {
    const noise = organicNoise(index * 0.53, z * 0.18);
    const replaced = !low && (index === 145 || index === 161);
    const missingEdge = !low && (index === 173 || index === 181);
    const tint = replaced ? 0xa99b8a : noise > 0.42 ? 0xb6a18a : noise < -0.42 ? 0x9b8f80 : 0xaa9982;
    const depth = plankDepth + organicNoise(index * 1.7, z * 0.3) * 0.018;
    const y = pier.deck - 0.12 + organicNoise(index * 0.7, z * 0.2) * 0.006;
    if (missingEdge) {
      addPierPlank(
        buckets.rope,
        pier.x - 0.36,
        y,
        z,
        usableWidth - 0.72,
        0.14,
        depth,
        tint,
        pier.x,
        usableWidth,
      );
    } else {
      addPierPlank(buckets.rope, pier.x, y, z, usableWidth, 0.14, depth, tint, pier.x, usableWidth);
    }
    if (!low && index % 5 === 0) addPierNails(buckets, pier.x, y + 0.148, z, usableWidth);
    index += 1;
  }
}

function addPierPlank(
  target: BufferGeometry[],
  x: number,
  y: number,
  z: number,
  w: number,
  h: number,
  d: number,
  colour: number,
  pierX: number,
  pierWidth: number,
): void {
  const geometry = new BoxGeometry(w, h, d);
  transform(geometry, x, y + h * 0.5, z, 0, 0, 0, 1, 1, 1);
  applyPierPlankUv(geometry);
  paintPierPlank(geometry, colour, pierX, pierWidth);
  target.push(geometry);
}

function applyPierPlankUv(geometry: BufferGeometry): void {
  const position = geometry.getAttribute('position') as BufferAttribute;
  const normal = geometry.getAttribute('normal') as BufferAttribute | undefined;
  const uvs = new Float32Array(position.count * 2);
  for (let i = 0; i < position.count; i += 1) {
    const nx = Math.abs(normal?.getX(i) ?? 0);
    const ny = Math.abs(normal?.getY(i) ?? 1);
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    if (ny > 0.6) {
      uvs[i * 2] = x * 0.36;
      uvs[i * 2 + 1] = z * 2.6;
    } else if (nx > 0.6) {
      uvs[i * 2] = z * 2.6;
      uvs[i * 2 + 1] = y * 1.8;
    } else {
      uvs[i * 2] = x * 0.36;
      uvs[i * 2 + 1] = y * 1.8;
    }
  }
  geometry.setAttribute('uv', new BufferAttribute(uvs, 2));
}

function paintPierPlank(geometry: BufferGeometry, colour: number, pierX: number, pierWidth: number): void {
  const position = geometry.getAttribute('position') as BufferAttribute;
  const normal = geometry.getAttribute('normal') as BufferAttribute | undefined;
  const c = new Color(colour);
  const colors = new Float32Array(position.count * 3);
  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i);
    const z = position.getZ(i);
    const ny = normal?.getY(i) ?? 0;
    const side = ny < 0.35;
    const centreWear = 1 - Math.min(1, Math.abs(x - pierX) / (pierWidth * 0.5));
    const grain = 0.9 + (organicNoise(x * 0.7, z * 3.3) + 1) * 0.07;
    const wear = side ? 0.42 : 0.9 + centreWear * 0.08;
    colors[i * 3] = c.r * grain * wear;
    colors[i * 3 + 1] = c.g * grain * wear;
    colors[i * 3 + 2] = c.b * grain * wear;
  }
  geometry.setAttribute('color', new BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
}

function addPierNails(
  buckets: Record<MaterialKey, BufferGeometry[]>,
  x: number,
  y: number,
  z: number,
  deckWidth: number,
): void {
  for (const side of [-1, 1]) {
    for (const offset of [0.46, 1.52]) {
      addBox(buckets.metal, x + side * (deckWidth * 0.5 - offset), y, z, 0.055, 0.012, 0.055, 0, 0x201c18);
    }
  }
}

function addPierPile(
  buckets: Record<MaterialKey, BufferGeometry[]>,
  x: number,
  z: number,
  pier: typeof COVE.pier,
  low: boolean,
): void {
  const pileBottom = -2.9;
  const pileHeight = pier.deck + 3.45;
  const pileTop = pileBottom + pileHeight;
  addCylinder(buckets.rope, x, pileBottom, z, 0.31, 0.38, pileHeight, low ? 8 : 12, 0, 0x9a8168);
  addCylinder(buckets.rope, x, -0.12, z, 0.32, 0.39, 0.44, low ? 8 : 12, 0, 0x3d4538);
  addCylinder(buckets.rope, x, -0.02, z, 0.34, 0.4, 0.075, low ? 8 : 12, 0, 0x456044);
  addCylinder(buckets.wood, x, pileTop, z, 0.32, 0.36, 0.06, low ? 8 : 12, 0, 0x2e281f);
  if (low) return;
  for (let i = 0; i < 3; i += 1) {
    const a = i * 2.1 + organicNoise(x * 0.17, z * 0.13);
    addBox(
      buckets.rope,
      x + Math.cos(a) * 0.32,
      -0.12 + i * 0.08,
      z + Math.sin(a) * 0.32,
      0.045,
      0.62,
      0.035,
      a,
      0x31482c,
    );
  }
}

function addPier(
  buckets: Record<MaterialKey, BufferGeometry[]>,
  colliders: { circles: CircleObstacle[]; boxes: VillageBoxCollider[] },
  shipObstacles: CircleObstacle[],
  anchors: Record<string, VillageAnchor>,
  perches: Vector3[],
  kit: VillageKit,
  low: boolean,
): void {
  const p = COVE.pier;
  const minZ = Math.min(p.z0, p.z1);
  const maxZ = Math.max(p.z0, p.z1);
  addWeatheredPierDeck(buckets, p, minZ, maxZ, low);
  addPierRootSteps(buckets);
  for (let z = minZ + 2.5; z <= maxZ - 1.5; z += low ? 8.4 : 6.0) {
    for (const side of [-1, 1]) {
      const x = p.x + side * (p.width * 0.5 + 0.55);
      addPierPile(buckets, x, z, p, low);
      colliders.circles.push({ x, z, r: 0.92 });
      addShipObstacle(shipObstacles, { x, z, r: 1.35 });
      if (z > -109 || low) continue;
      addCylinder(buckets.wood, x, p.deck + 0.06, z, 0.08, 0.1, 1.28, 8, 0, 0x6a4b31);
    }
  }
  if (!low) addPierSideStructure(buckets, p, minZ, maxZ);
  for (let z = minZ + 1.2; z <= maxZ - 1.2; z += 3) {
    addShipObstacle(shipObstacles, { x: p.x - p.width * 0.5 - 0.75, z, r: 1.2 });
    addShipObstacle(shipObstacles, { x: p.x + p.width * 0.5 + 0.75, z, r: 1.2 });
  }
  addMooringHardware(buckets, colliders, perches, p);
  addPierDressing(buckets, colliders, p, low);
  addBoathouse(buckets, colliders, shipObstacles, kit, BOATHOUSE.x, BOATHOUSE.z, p.deck);
  anchors.pierEnd = { x: p.x, y: p.deck, z: p.z1 + 2.2, heading: Math.PI };
}

function addPierSideStructure(
  buckets: Record<MaterialKey, BufferGeometry[]>,
  pier: typeof COVE.pier,
  minZ: number,
  maxZ: number,
): void {
  const length = maxZ - minZ;
  const centerZ = (minZ + maxZ) * 0.5;
  for (const side of [-1, 1]) {
    const x = pier.x + side * (pier.width * 0.5 + 0.2);
    addBox(buckets.rope, x, pier.deck - 0.36, centerZ, 0.18, 0.42, length - 1.2, 0, 0x806b56);
    addBox(buckets.rope, x, pier.deck - 0.18, centerZ, 0.14, 0.14, length - 1.0, 0, 0x927861);
  }
  for (const z of [-111.5, -95.5]) {
    addPierCrossBrace(buckets, pier.x - pier.width * 0.5 - 0.74, z);
    addPierCrossBrace(buckets, pier.x + pier.width * 0.5 + 0.74, z + 1.6);
  }
}

function addPierCrossBrace(buckets: Record<MaterialKey, BufferGeometry[]>, x: number, z: number): void {
  addBox(buckets.rope, x, 0.18, z, 0.24, 1.85, 0.22, 0, 0xb08a68, 0.92, 0);
  addBox(buckets.rope, x, 0.18, z, 0.24, 1.85, 0.22, 0, 0xb08a68, -0.92, 0);
}

function addPierRootSteps(buckets: Record<MaterialKey, BufferGeometry[]>): void {
  const steps = 4;
  const dz = (PIER_RAMP.z1 - PIER_RAMP.z0) / steps;
  for (let i = 0; i < steps; i += 1) {
    const t0 = i / steps;
    const z = PIER_RAMP.z0 + dz * (i + 0.5);
    const y = COVE.pier.deck + (COVE.quay.height - COVE.pier.deck) * t0;
    addBox(
      buckets.rope,
      PIER_RAMP.x,
      y - 0.02,
      z,
      PIER_RAMP.width,
      0.18,
      dz + 0.02,
      0,
      i % 2 ? 0x9f8e7a : 0xaa9982,
    );
  }
}

function addMooringHardware(
  buckets: Record<MaterialKey, BufferGeometry[]>,
  colliders: { circles: CircleObstacle[] },
  perches: Vector3[],
  pier: typeof COVE.pier,
): void {
  const x = pier.x + pier.width * 0.5 + 0.16;
  for (const z of [-103, -121]) {
    addCylinder(buckets.metal, x, pier.deck, z, 0.24, 0.3, 0.64, 12, 0, 0x252320);
    addTorus(buckets.metal, x, pier.deck + 0.62, z, 0.28, 0.035, 12, 0x2f2c26, Math.PI / 2, 0, 0);
    addBox(buckets.rope, x + 0.95, pier.deck + 0.36, z - 0.28, 2.0, 0.06, 0.06, 0.22, 0xc4a576);
    colliders.circles.push({ x, z, r: 0.55 });
    perches.push(new Vector3(x, pier.deck + 0.64, z));
  }
}

function addPierDressing(
  buckets: Record<MaterialKey, BufferGeometry[]>,
  colliders: { circles: CircleObstacle[]; boxes: VillageBoxCollider[] },
  pier: typeof COVE.pier,
  low: boolean,
): void {
  addCargoStack(buckets, pier.x - 1.35, pier.deck, -92.2, -0.08, 0x496f86, low);
  colliders.boxes.push({ x: pier.x - 1.35, z: -92.2, hx: 0.95, hz: 0.75, rot: -0.08, height: 1.45 });

  if (!low) {
    // Along the west edge, on the deck and clear of the pile lantern at z −89.5.
    const rackX = pier.x - pier.width * 0.5 + 0.38;
    addNetRack(buckets, rackX, -85.6, pier.deck, Math.PI / 2);
    colliders.boxes.push({ x: rackX, z: -85.6, hx: 1.25, hz: 0.2, rot: Math.PI / 2, height: 1.8 });
    addPierPostLantern(buckets, colliders, pier.x - pier.width * 0.5 - 0.55, pier.deck, -89.5, -1);
    addPierPostLantern(buckets, colliders, pier.x + pier.width * 0.5 + 0.55, pier.deck, -107.5, 1);
  }
}

function addRopeCoil(
  buckets: Record<MaterialKey, BufferGeometry[]>,
  x: number,
  y: number,
  z: number,
  rot: number,
  scale: number,
): void {
  for (let i = 0; i < 5; i += 1) {
    addTorus(
      buckets.rope,
      x,
      y + i * 0.018,
      z,
      (0.32 - i * 0.045) * scale,
      0.026 * scale,
      18,
      i % 2 ? 0x9c8358 : 0x8b744f,
      Math.PI / 2,
      rot,
      0,
    );
  }
  addBox(buckets.rope, x, y + 0.085, z, 0.62 * scale, 0.04 * scale, 0.05 * scale, rot + 0.45, 0x8b744f);
}

function addCargoStack(
  buckets: Record<MaterialKey, BufferGeometry[]>,
  x: number,
  y: number,
  z: number,
  rot: number,
  tarp: number,
  low: boolean,
): void {
  addBox(buckets.wood, x - 0.25, y + 0.02, z, 1.45, 0.72, 0.95, rot, 0x8f6542);
  addBox(buckets.wood, x + 0.42, y + 0.68, z + 0.15, 1.0, 0.58, 0.78, rot, 0x775236);
  if (low) return;
  addBox(buckets.cloth, x + 0.05, y + 1.2, z + 0.05, 1.75, 0.08, 1.05, rot, tarp);
  addBox(buckets.rope, x + 0.05, y + 1.26, z + 0.05, 0.08, 0.075, 1.14, rot, 0xc5a873);
  addBox(buckets.rope, x + 0.05, y + 1.27, z + 0.05, 1.84, 0.06, 0.075, rot, 0xc5a873);
}

function addPierPostLantern(
  buckets: Record<MaterialKey, BufferGeometry[]>,
  colliders: { circles: CircleObstacle[] },
  x: number,
  y: number,
  z: number,
  side: -1 | 1,
): void {
  addCylinder(buckets.wood, x, y, z, 0.11, 0.14, 2.7, 8, 0, 0x6b523c);
  addBox(buckets.metal, x + side * 0.28, y + 2.1, z, 0.62, 0.055, 0.055, 0, 0x4d463d);
  addBox(buckets.metal, x + side * 0.54, y + 1.86, z, 0.035, 0.34, 0.035, 0, 0x5f574f);
  addLanternFixture(buckets, x + side * 0.58, y + 1.42, z, 0, 0.6);
  colliders.circles.push({ x, z, r: 0.35 });
}

function addBoathouse(
  buckets: Record<MaterialKey, BufferGeometry[]>,
  colliders: { boxes: VillageBoxCollider[] },
  shipObstacles: CircleObstacle[],
  _kit: VillageKit,
  x: number,
  z: number,
  deck: number,
): void {
  const rot = 0;
  addBox(buckets.wood, x, deck - 0.06, z, 2.7, 0.12, 4.8, rot, 0x745239);
  for (const lx of [-1.14, 1.14]) {
    for (const lz of [-2.05, 2.05]) {
      const p = localToWorld(x, z, rot, lx, lz);
      addCylinder(buckets.wood, p.x, deck, p.z, 0.11, 0.14, 2.05, 8, rot, 0x67462c);
      colliders.boxes.push({ x: p.x, z: p.z, hx: 0.18, hz: 0.18, rot, height: 2.15 });
    }
  }
  addBox(buckets.wood, x, deck + 1.88, z, 0.18, 0.16, 5.0, rot, 0x6f4d31);
  addBox(buckets.wood, x - 0.62, deck + 1.9, z, 1.7, 0.18, 5.15, rot, 0x5f3f2b, 0, 0.56);
  addBox(buckets.wood, x + 0.62, deck + 1.9, z, 1.7, 0.18, 5.15, rot, 0x5f3f2b, 0, -0.56);
  addBox(buckets.wood, x, deck + 0.38, z + 2.25, 2.45, 0.5, 0.16, rot, 0x7b5638);
  addBox(buckets.wood, x - 1.18, deck + 0.28, z, 0.14, 0.48, 3.5, rot, 0x725035);
  addNetRack(buckets, x + 1.62, z - 0.8, deck, 0.05);
  addRopeCoil(buckets, x - 0.72, deck + 0.05, z - 1.15, -0.2, 0.68);
  addLanternFixture(buckets, x - 0.9, deck + 1.28, z - 2.22, rot, 0.72);
  addShipObstacle(shipObstacles, { x, z: z + 0.2, r: 2.35 });
}

function addPlaza(
  buckets: Record<MaterialKey, BufferGeometry[]>,
  colliders: { circles: CircleObstacle[]; boxes: VillageBoxCollider[] },
  anchors: Record<string, VillageAnchor>,
  heightField: HeightField,
  kit: VillageKit,
  low: boolean,
): void {
  const cx = COVE.village.center.x;
  const cz = COVE.village.center.z;
  const y = heightField.heightAt(cx, cz);
  const curbCount = low ? 12 : 22;
  for (let i = 0; i < curbCount; i += 1) {
    const a = (i / curbCount) * Math.PI * 2;
    const x = cx + Math.cos(a) * 6.25;
    const z = cz + Math.sin(a) * 6.25;
    addBox(
      buckets.stone,
      x,
      heightField.heightAt(x, z) - 0.03,
      z,
      1.25,
      0.11,
      0.34,
      a,
      i % 3 === 0 ? 0xb9ad8d : 0xc9bb99,
    );
  }
  addStreetPaving(buckets, heightField, kit, low);
  if (!low) addSpawnPlantingBeds(buckets, heightField);
  addCylinder(buckets.stone, cx, y, cz, 1.05, 1.15, 0.82, 16, 0, 0x908675);
  addCylinder(buckets.stone, cx, y + 0.72, cz, 0.72, 0.78, 0.55, 16, 0, 0xa79c86);
  addBox(buckets.wood, cx, y + 1.18, cz, 3.1, 0.16, 0.18, 0, 0x6d4b2e);
  addBox(buckets.wood, cx, y + 1.18, cz, 0.18, 0.16, 3.1, 0, 0x6d4b2e);
  colliders.circles.push({ x: cx, z: cz, r: 1.5 });
  anchors.plazaWell = { x: cx + 2.7, y, z: cz - 1.2, heading: -1.2 };
  anchors.lookout = { x: -73.5, y: COVE.quay.height + 8.2, z: COVE.quay.z + 1.0, heading: -Math.PI / 2 };
  if (low) return;
  for (const [bx, bz, r] of [
    [-89, -65, 0.2],
    [-116, -38, 0.7],
    [-143, -57, -0.25],
  ] as const) {
    const by = walkable(bx, bz) ?? heightField.heightAt(bx, bz);
    addBox(buckets.wood, bx, by + 0.05, bz, 2.6, 0.22, 0.72, r, 0x6f4d31);
    addBox(buckets.wood, bx, by + 0.55, bz + 0.27, 2.6, 0.72, 0.12, r, 0x5e4129);
  }
}

function addStreetPaving(
  buckets: Record<MaterialKey, BufferGeometry[]>,
  heightField: HeightField,
  _kit: VillageKit,
  low: boolean,
): void {
  buckets.paving.push(createStreetPavingGeometry(heightField, low));
}

function addSpawnPlantingBeds(
  buckets: Record<MaterialKey, BufferGeometry[]>,
  heightField: HeightField,
): void {
  addSpawnPavingApron(buckets, heightField);
}

function addSpawnPavingApron(buckets: Record<MaterialKey, BufferGeometry[]>, heightField: HeightField): void {
  buckets.paving.push(createTerrainPavingRect(heightField, COVE.quay.x0 + 4, COVE.quay.x1 - 4, -66.5, -51.5));
}

function createTerrainPavingRect(
  heightField: HeightField,
  x0: number,
  x1: number,
  z0: number,
  z1: number,
): BufferGeometry {
  const cols = 18;
  const rows = 5;
  const positions: number[] = [];
  const uvs: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const palette = [0x8a806a, 0x928771, 0x817863, 0x998c74] as const;
  for (let iz = 0; iz <= rows; iz += 1) {
    const tz = iz / rows;
    for (let ix = 0; ix <= cols; ix += 1) {
      const tx = ix / cols;
      const x = x0 + (x1 - x0) * tx;
      const z = z0 + (z1 - z0) * tz;
      const y = heightField.heightAt(x, z) + 0.105;
      const tint = new Color(
        palette[Math.abs(Math.floor(organicNoise(x * 0.2, z * 0.2) * 10)) % palette.length]!,
      );
      positions.push(x, y, z);
      uvs.push(x * 0.5, z * 0.5);
      colors.push(tint.r, tint.g, tint.b);
    }
  }
  for (let iz = 0; iz < rows; iz += 1) {
    for (let ix = 0; ix < cols; ix += 1) {
      const a = iz * (cols + 1) + ix;
      const b = a + 1;
      const d = a + cols + 1;
      const c = d + 1;
      indices.push(a, d, b, b, d, c);
    }
  }
  return coloredIndexedGeometry(positions, uvs, colors, indices);
}

let streetHeightField: HeightField | null = null;
/** Every building's exterior door stairs, so you climb them instead of walking through them. */
const stairSpans: StairSpan[] = [];

function isStreetPavedPoint(x: number, z: number): boolean {
  return streetCoverage(x, z, 0) > 0;
}

function streetTerrainHeightAt(heightField: HeightField, x: number, z: number): number {
  return heightField.heightAt(x, z);
}

function streetWalkable(x: number, z: number): number | null {
  if (!streetHeightField || !isStreetPavedPoint(x, z) || insideAnyBuilding(x, z)) return null;
  return streetTerrainHeightAt(streetHeightField, x, z) + 0.08;
}

type StreetPoint = readonly [x: number, z: number];

const STREET_ROUTES: readonly (readonly StreetPoint[])[] = [
  [
    [-151, -45],
    [-128, -45],
    [-115, -45],
    [-92, -51],
    [-74, -62.5],
  ],
  [
    [-110, -66.4],
    [-113, -57.5],
    [-115, -45],
  ],
  [
    [-115, -45],
    [-123.5, -49],
    [-127.1, -58.5],
  ],
  [
    [-115, -45],
    [-105, -52],
    [-94, -66.2],
  ],
  [
    [-115, -45],
    [-97, -49],
    [-80.2, -53.7],
  ],
  [
    [-115, -45],
    [-116.5, -33],
    [-117.2, -21.2],
  ],
  [
    [-91, -55],
    [-82, -60.5],
    [-74, -62.5],
  ],
  [
    [-145, -61],
    [-135, -54],
    [-115, -45],
  ],
] as const;

const MIN_PAVING_RUN = 4;

function createStreetPavingGeometry(heightField: HeightField, low: boolean): BufferGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const addVertex = (x: number, z: number) => {
    const y = streetTerrainHeightAt(heightField, x, z) + 0.12 + organicNoise(x, z) * 0.006;
    const tint = new Color(streetTint(x, z));
    positions.push(x, y, z);
    uvs.push(x * 0.5, z * 0.5);
    colors.push(tint.r, tint.g, tint.b);
    return positions.length / 3 - 1;
  };
  const pushQuad = (a: StreetPoint, b: StreetPoint, c: StreetPoint, d: StreetPoint) => {
    const ia = addVertex(a[0], a[1]);
    const ib = addVertex(b[0], b[1]);
    const ic = addVertex(c[0], c[1]);
    const id = addVertex(d[0], d[1]);
    indices.push(ia, id, ib, ib, id, ic);
  };
  const keep = (a: StreetPoint, b: StreetPoint, c: StreetPoint, d: StreetPoint) => {
    const cx = (a[0] + b[0] + c[0] + d[0]) * 0.25;
    const cz = (a[1] + b[1] + c[1] + d[1]) * 0.25;
    return !(insideAnyBuilding(cx, cz) || isReservedPuzzleGround(cx, cz) || isQuayDeckPoint(cx, cz));
  };

  for (const route of STREET_ROUTES) {
    const samples = sampleStreetRoute(route, low ? 1.0 : 0.72);
    const quads: [StreetPoint, StreetPoint, StreetPoint, StreetPoint][] = [];
    for (let i = 0; i < samples.length - 1; i += 1) {
      const a = samples[i]!;
      const b = samples[i + 1]!;
      quads.push([a.left, b.left, b.right, a.right]);
    }
    // Where a building or the quay deck cuts the street, a run of one or two leftover quads
    // would read as a loose paving slab in the grass, so short runs are dropped.
    let run: typeof quads = [];
    const flush = () => {
      if (run.length >= MIN_PAVING_RUN) for (const q of run) pushQuad(...q);
      run = [];
    };
    for (const q of quads) {
      if (keep(...q)) run.push(q);
      else flush();
    }
    flush();
  }

  return coloredIndexedGeometry(positions, uvs, colors, indices);
}

function isQuayDeckPoint(x: number, z: number): boolean {
  const q = COVE.quay;
  return x >= q.x0 - 0.5 && x <= q.x1 + 0.5 && z >= q.z - 1.1 && z <= q.z + 8.4;
}

function sampleStreetRoute(
  route: readonly StreetPoint[],
  spacing: number,
): {
  left: StreetPoint;
  right: StreetPoint;
}[] {
  const centers: StreetPoint[] = [];
  for (let i = 0; i < route.length - 1; i += 1) {
    const a = route[i]!;
    const b = route[i + 1]!;
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const steps = Math.max(2, Math.ceil(Math.hypot(dx, dz) / spacing));
    for (let s = 0; s < steps; s += 1) {
      if (i > 0 && s === 0) continue;
      const t = s / steps;
      centers.push([a[0] + dx * t, a[1] + dz * t]);
    }
  }
  centers.push(route[route.length - 1]!);
  return centers.map((center, i) => {
    const prev = centers[Math.max(0, i - 1)]!;
    const next = centers[Math.min(centers.length - 1, i + 1)]!;
    const dx = next[0] - prev[0];
    const dz = next[1] - prev[1];
    const len = Math.hypot(dx, dz) || 1;
    const nx = -dz / len;
    const nz = dx / len;
    const half =
      streetHalfWidth(center[0], center[1]) + organicNoise(center[0] * 0.33, center[1] * 0.33) * 0.18;
    return {
      left: [center[0] + nx * half, center[1] + nz * half],
      right: [center[0] - nx * half, center[1] - nz * half],
    };
  });
}

function streetCoverage(x: number, z: number, shrink: number): number {
  if (isReservedPuzzleGround(x, z)) return -1;
  const plaza = Math.hypot(x - COVE.village.center.x, z - COVE.village.center.z);
  let cover = 16.0 - shrink + organicNoise(x * 0.35, z * 0.35) * 0.75 - plaza;
  for (const route of STREET_ROUTES) {
    for (let i = 0; i < route.length - 1; i += 1) {
      const d = distanceToSegment(x, z, route[i]!, route[i + 1]!);
      const half = streetHalfWidth(x, z) - shrink + organicNoise(x * 0.42 + i * 13, z * 0.42) * 0.42;
      cover = Math.max(cover, half - d);
    }
  }
  return cover;
}

function streetHalfWidth(x: number, z: number): number {
  const quay = z < -55 ? 2.85 : 2.35;
  return quay + organicNoise(x * 0.16, z * 0.16) * 0.18;
}

function isReservedPuzzleGround(x: number, z: number): boolean {
  return x > -72 && x < -54 && z > -64 && z < -44;
}

function distanceToSegment(x: number, z: number, a: StreetPoint, b: StreetPoint): number {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const lenSq = dx * dx + dz * dz;
  const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / lenSq));
  return Math.hypot(x - (a[0] + dx * t), z - (a[1] + dz * t));
}

function organicNoise(x: number, z: number): number {
  const n = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
  return (n - Math.floor(n)) * 2 - 1;
}

function streetTint(x: number, z: number): number {
  return organicNoise(x * 0.9, z * 0.9) > 0 ? 0xa59a80 : 0x948a73;
}

function insideAnyBuilding(x: number, z: number): boolean {
  for (const b of BUILDINGS) {
    const footprint = buildingFootprint(b);
    const c = Math.cos(-b.rot);
    const s = Math.sin(-b.rot);
    const dx = x - b.x;
    const dz = z - b.z;
    const lx = dx * c + dz * s;
    const lz = -dx * s + dz * c;
    if (Math.abs(lx) < footprint.w * 0.58 && Math.abs(lz) < footprint.d * 0.58) return true;
  }
  return false;
}

function addMarketStalls(
  buckets: Record<MaterialKey, BufferGeometry[]>,
  colliders: { boxes: VillageBoxCollider[] },
  anchors: Record<string, VillageAnchor>,
  heightField: HeightField,
  perches: Vector3[],
): void {
  // The west stall (−136.5, −45.2) came out: nobody kept it, and it read as a low table under the
  // laundry line, which now ends on its own post there.
  const stalls = [{ x: -122.0, z: -43.4, rot: -12 * DEG, cloth: 0x4f9bc0 }];
  for (const stall of stalls) {
    const y = heightField.heightAt(stall.x, stall.z);
    addBox(buckets.wood, stall.x, y + 0.72, stall.z, 4.1, 0.22, 1.15, stall.rot, 0x6e4729);
    for (const lx of [-1.75, 1.75]) {
      for (const lz of [-0.45, 0.45]) {
        const p = localToWorld(stall.x, stall.z, stall.rot, lx, lz);
        addBox(buckets.wood, p.x, y, p.z, 0.16, 1.65, 0.16, stall.rot, 0x674429);
      }
    }
    addStripedMarketAwning(buckets, stall.x, y + 1.66, stall.z, stall.rot, stall.cloth);
    perches.push(new Vector3(stall.x, y + 1.88, stall.z));
    colliders.boxes.push({ x: stall.x, z: stall.z, hx: 2.1, hz: 0.75, rot: stall.rot, height: 1.9 });
  }
  addNetRack(buckets, -149.7, -57.2, heightField.heightAt(-149.7, -57.2), 0.2);
  addNoticeBoard(buckets, -104.7, COVE.quay.height, COVE.quay.z + 5.3, Math.PI, perches);
  colliders.boxes.push(
    { x: -149.7, z: -57.2, hx: 1.25, hz: 0.25, rot: 0.2, height: 1.8 },
    { x: -104.7, z: COVE.quay.z + 5.3, hx: 1.35, hz: 0.22, rot: Math.PI, height: 2.0 },
  );
  const front = localToWorld(-122.0, -43.4, -12 * DEG, 0, -1.9);
  anchors.marketStall = {
    x: front.x,
    y: heightField.heightAt(front.x, front.z),
    z: front.z,
    heading: -12 * DEG,
  };
}

function addStripedMarketAwning(
  buckets: Record<MaterialKey, BufferGeometry[]>,
  x: number,
  y: number,
  z: number,
  rot: number,
  accent: number,
): void {
  const w = 4.9;
  const d = 2.45;
  const cols = 10;
  const rows = 4;
  const positions: number[] = [];
  const uvs: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  const mutedAccent = new Color(accent).lerp(new Color(0xd8c69c), 0.38);
  const canvas = new Color(0xe5d6ad);
  const addVertex = (ix: number, iz: number) => {
    const lx = -w * 0.5 + (ix / cols) * w;
    const lz = -d * 0.5 + (iz / rows) * d;
    const sag = -0.18 * (1 - Math.abs(lx) / (w * 0.5)) - 0.04 * Math.sin((iz / rows) * Math.PI);
    const wx = x + lx * c + lz * s;
    const wz = z - lx * s + lz * c;
    positions.push(wx, y + sag, wz);
    uvs.push(ix / cols, iz / rows);
    const stripe = Math.floor((ix / cols) * 6) % 2 === 0 ? mutedAccent : canvas;
    colors.push(stripe.r, stripe.g, stripe.b);
    return positions.length / 3 - 1;
  };
  for (let iz = 0; iz <= rows; iz += 1) for (let ix = 0; ix <= cols; ix += 1) addVertex(ix, iz);
  for (let iz = 0; iz < rows; iz += 1) {
    for (let ix = 0; ix < cols; ix += 1) {
      const a = iz * (cols + 1) + ix;
      const b = a + 1;
      const d0 = a + cols + 1;
      const c0 = d0 + 1;
      indices.push(a, b, d0, b, c0, d0);
    }
  }
  buckets.cloth.push(coloredIndexedGeometry(positions, uvs, colors, indices));

  const front = localToWorld(x, z, rot, 0, -d * 0.5);
  const back = localToWorld(x, z, rot, 0, d * 0.5);
  addBox(buckets.wood, front.x, y - 0.08, front.z, w + 0.15, 0.11, 0.12, rot, 0x6c482d);
  addBox(buckets.wood, back.x, y - 0.08, back.z, w + 0.15, 0.11, 0.12, rot, 0x6c482d);
}

/** A fish-net drying rack: two posts and a head bar, a hemp net hung from it, and cork floats. */
function addNetRack(
  buckets: Record<MaterialKey, BufferGeometry[]>,
  x: number,
  z: number,
  y: number,
  rot: number,
): void {
  const net = 0x76674a;
  const at = (lx: number, lz = 0) => localToWorld(x, z, rot, lx, lz);
  for (const lx of [-1.1, 1.1]) {
    const p = at(lx);
    addBox(buckets.wood, p.x, y, p.z, 0.14, 1.75, 0.14, rot, 0x664326);
  }
  addBox(buckets.wood, x, y + 1.48, z, 2.35, 0.12, 0.12, rot, 0x664326);
  for (let i = 0; i < 9; i += 1) {
    const p = at(-0.96 + i * 0.24, 0.04);
    addBox(buckets.rope, p.x, y + 0.3, p.z, 0.028, 1.14, 0.028, rot, net);
  }
  for (let i = 0; i < 6; i += 1) {
    const p = at(0, 0.04);
    addBox(buckets.rope, p.x, y + 0.36 + i * 0.2, p.z, 1.96, 0.028, 0.028, rot, net);
  }
  for (let i = 0; i < 5; i += 1) {
    const p = at(-0.8 + i * 0.4, 0.07);
    addCylinder(buckets.wood, p.x, y + 1.3, p.z, 0.055, 0.055, 0.12, 8, rot, 0xd9c08a);
  }
}

function addNoticeBoard(
  buckets: Record<MaterialKey, BufferGeometry[]>,
  x: number,
  y: number,
  z: number,
  rot: number,
  perches: Vector3[],
): void {
  addBox(buckets.wood, x - 1.0, y, z, 0.14, 2.4, 0.14, rot, 0x5d3d25);
  addBox(buckets.wood, x + 1.0, y, z, 0.14, 2.4, 0.14, rot, 0x5d3d25);
  addBox(buckets.wood, x, y + 1.05, z, 2.45, 1.35, 0.16, rot, 0x7b522f);
  addBox(buckets.cloth, x - 0.45, y + 1.24, z - 0.09, 0.56, 0.72, 0.04, rot, 0xe7d9ad);
  addBox(buckets.cloth, x + 0.36, y + 1.1, z - 0.09, 0.62, 0.48, 0.04, rot, 0xd0bd8b);
  addBox(buckets.roofTile, x, y + 1.82, z, 2.75, 0.18, 0.42, rot, 0xa64d32);
  perches.push(new Vector3(x, y + 2.0, z));
}

function addVillageFestooning(
  buckets: Record<MaterialKey, BufferGeometry[]>,
  colliders: { circles: CircleObstacle[] },
  heightField: HeightField,
): void {
  addBuntingLine(
    buckets,
    { x: -124.2, y: heightField.heightAt(-124.8, -54.2) + 4.7, z: -51.4 },
    { x: -139.0, y: heightField.heightAt(-139.5, -64.6) + 4.1, z: -61.2 },
    [0xc24f3d, 0xe6c66b, 0x2f7890, 0xf1ead2],
  );
  addBuntingLine(
    buckets,
    { x: -106.2, y: heightField.heightAt(-106.8, -32.8) + 4.0, z: -35.8 },
    { x: -117.8, y: heightField.heightAt(-117.4, -18.4) + 3.7, z: -22.2 },
    [0x3f7a52, 0xd9c088, 0x8f4b38],
  );
  addLaundryLine(
    buckets,
    colliders,
    heightField,
    { x: -148.0, y: heightField.heightAt(-147.2, -51.6) + 2.75, z: -48.4 },
    { x: -137.4, y: heightField.heightAt(-136.5, -45.2) + 2.5, z: -44.4 },
  );
}

interface FestoonPoint {
  x: number;
  y: number;
  z: number;
}

function addBuntingLine(
  buckets: Record<MaterialKey, BufferGeometry[]>,
  a: FestoonPoint,
  b: FestoonPoint,
  colours: readonly number[],
): void {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const len = Math.hypot(dx, dz);
  const rot = Math.atan2(-dz, dx);
  addBox(
    buckets.rope,
    (a.x + b.x) * 0.5,
    (a.y + b.y) * 0.5,
    (a.z + b.z) * 0.5,
    len,
    0.035,
    0.035,
    rot,
    0xc4a576,
  );
  const count = Math.max(4, Math.floor(len / 1.15));
  for (let i = 1; i < count; i += 1) {
    const t = i / count;
    const sag = Math.sin(t * Math.PI) * 0.28;
    const x = a.x + dx * t;
    const y = a.y + (b.y - a.y) * t - sag;
    const z = a.z + dz * t;
    addTriangleFlag(buckets, x, y, z, rot, colours[i % colours.length]!);
  }
}

function addTriangleFlag(
  buckets: Record<MaterialKey, BufferGeometry[]>,
  x: number,
  y: number,
  z: number,
  rot: number,
  colour: number,
): void {
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  const half = 0.26;
  const drop = 0.48;
  const verts = [
    { lx: -half, ly: 0 },
    { lx: half, ly: 0 },
    { lx: 0, ly: -drop },
  ];
  const positions: number[] = [];
  const colors: number[] = [];
  const tint = new Color(colour);
  for (const v of verts) {
    positions.push(x + v.lx * c, y + v.ly, z - v.lx * s);
    colors.push(tint.r, tint.g, tint.b);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute('uv', new BufferAttribute(new Float32Array([0, 0, 1, 0, 0.5, 1]), 2));
  geometry.setAttribute('color', new BufferAttribute(new Float32Array(colors), 3));
  geometry.setIndex([0, 1, 2]);
  geometry.computeVertexNormals();
  buckets.cloth.push(geometry);
}

function addLaundryLine(
  buckets: Record<MaterialKey, BufferGeometry[]>,
  colliders: { circles: CircleObstacle[] },
  heightField: HeightField,
  a: FestoonPoint,
  b: FestoonPoint,
): void {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const len = Math.hypot(dx, dz);
  const rot = Math.atan2(-dz, dx);
  const lineY = (a.y + b.y) * 0.5;
  addBox(buckets.rope, (a.x + b.x) * 0.5, lineY, (a.z + b.z) * 0.5, len, 0.035, 0.035, rot, 0xc4a576);
  // The far end ties off on a T-post (the near end is under the house's eave).
  const ground = heightField.heightAt(b.x, b.z);
  addBox(buckets.wood, b.x, ground - 0.1, b.z, 0.12, lineY - ground + 0.28, 0.12, rot, 0x674429);
  addBox(buckets.wood, b.x, lineY - 0.04, b.z, 0.1, 0.08, 0.62, rot, 0x6e4729);
  colliders.circles.push({ x: b.x, z: b.z, r: 0.22 });
  for (let i = 0; i < 4; i += 1) {
    const t = 0.22 + i * 0.18;
    const x = a.x + dx * t;
    const y = a.y + (b.y - a.y) * t - 0.12;
    const z = a.z + dz * t;
    addBox(
      buckets.cloth,
      x,
      y - 0.52,
      z,
      0.52,
      0.88 - (i % 2) * 0.22,
      0.045,
      rot,
      i % 2 ? 0xd8c69c : 0xe7eadf,
    );
  }
}

function addLighthouse(
  buckets: Record<MaterialKey, BufferGeometry[]>,
  colliders: { circles: CircleObstacle[]; boxes: VillageBoxCollider[] },
  shipObstacles: CircleObstacle[],
  anchors: Record<string, VillageAnchor>,
  perches: Vector3[],
): void {
  const x = COVE.quay.x1 - 2.7;
  const z = COVE.quay.z + 0.8;
  const y = COVE.quay.height;
  addCylinder(buckets.plaster, x, y, z, 1.75, 2.1, 7.5, 18, 0, 0xded8c4);
  addCylinder(buckets.plaster, x, y + 2.25, z, 1.72, 1.84, 0.68, 18, 0, 0xa85e4b);
  addCylinder(buckets.plaster, x, y + 5.15, z, 1.44, 1.56, 0.62, 18, 0, 0xa85e4b);
  addCylinder(buckets.metal, x, y + 7.45, z, 1.9, 1.9, 0.35, 18, 0, 0x5f5144);
  addCylinder(buckets.glow, x, y + 7.78, z, 1.25, 1.25, 0.95, 18, 0, 0xffbd6b);
  addCylinder(buckets.metal, x, y + 8.68, z, 1.55, 1.55, 0.22, 18, 0, 0x3b322c);
  for (let i = 0; i < 6; i += 1) {
    const a = (i / 6) * Math.PI * 2;
    perches.push(new Vector3(x + Math.cos(a) * 1.9, y + 7.8, z + Math.sin(a) * 1.9));
  }
  const cap = new ConeGeometry(1.72, 1.35, 18, 1);
  transform(cap, x, y + 8.78, z, 0, 0, 0, 1, 1, 1);
  paint(cap, 0xb45733);
  buckets.roofTile.push(cap);
  addTorus(buckets.halo, x, y + 8.0, z, 2.9, 0.08, 24, 0xffb66a, Math.PI / 2, 0, 0);
  colliders.circles.push({ x, z, r: 2.6 });
  colliders.boxes.push({ x, z, hx: 2.2, hz: 2.2, rot: 0, height: 9.6 });
  shipObstacles.push({ x, z, r: 2.9 });
  anchors.lighthouseDoor = { x: x - 2.3, y, z: z + 0.2, heading: -Math.PI / 2 };
}

function addLanterns(
  buckets: Record<MaterialKey, BufferGeometry[]>,
  colliders: { circles: CircleObstacle[]; boxes: VillageBoxCollider[] },
  heightField: HeightField,
  low: boolean,
): void {
  // [x, z, side]: the bracket reaches toward +x (side 1) or −x. The two pier lamps stand on the
  // west edge between piles and hang out over the water, clear of the walkway and the camera.
  const pierWest = COVE.pier.x - COVE.pier.width * 0.5 + 0.28;
  const points = [
    [-118, -49, 1],
    [-132, -59, 1],
    [-90, -68, 1],
    [-146, -67, 1],
    [pierWest, -80.5, -1],
    [pierWest, -110.5, -1],
    [-101, -34, 1],
    [-72.6, -70.5, 1],
  ] as const;
  const max = low ? 5 : points.length;
  for (let i = 0; i < max; i += 1) {
    const [x, z, side] = points[i]!;
    const y = walkable(x, z) ?? heightField.heightAt(x, z);
    addBox(buckets.wood, x, y, z, 0.16, 2.6, 0.16, 0, 0x593b23);
    addLampBracket(buckets, x, y, z, side);
    addLanternFixture(buckets, x + side * 0.92, y + 1.68, z, 0, 1);
    colliders.circles.push({ x, z, r: 0.38 });
  }
}

function addLampBracket(
  buckets: Record<MaterialKey, BufferGeometry[]>,
  x: number,
  y: number,
  z: number,
  side: -1 | 1,
): void {
  const armY = y + 2.35;
  addBox(buckets.wood, x + side * 0.42, armY, z, 0.86, 0.1, 0.1, 0, 0x6b4a2d);
  addBox(buckets.metal, x + side * 0.35, y + 2.06, z, 0.55, 0.055, 0.055, 0, 0x6c6258, 0, side * 0.72);
  addTorus(buckets.metal, x + side * 0.72, y + 2.13, z, 0.17, 0.018, 12, 0x6c6258, Math.PI / 2, 0, 0);
  addBox(buckets.metal, x + side * 0.88, armY - 0.18, z, 0.045, 0.24, 0.045, 0, 0x6c6258);
}

function addLanternFixture(
  buckets: Record<MaterialKey, BufferGeometry[]>,
  x: number,
  y: number,
  z: number,
  rot: number,
  scale: number,
): void {
  const s = scale;
  const h = 0.46 * s;
  const w = 0.31 * s;
  const post = 0.035 * s;
  const capY = y + h + 0.08 * s;
  addBox(buckets.metal, x, y, z, w, 0.045 * s, w, rot, 0x5f574f);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      addBox(
        buckets.metal,
        x + sx * w * 0.44,
        y + 0.035 * s,
        z + sz * w * 0.44,
        post,
        h,
        post,
        rot,
        0x6f665c,
      );
    }
  }
  addGlassPane(buckets, x, y + 0.11 * s, z + w * 0.5, w * 0.72, h * 0.72, 0.018 * s, rot, 0xffc987);
  addGlassPane(buckets, x, y + 0.11 * s, z - w * 0.5, w * 0.72, h * 0.72, 0.018 * s, rot, 0xffc987);
  addGlassPane(buckets, x + w * 0.5, y + 0.11 * s, z, 0.018 * s, h * 0.72, w * 0.72, rot, 0xffc987);
  addGlassPane(buckets, x - w * 0.5, y + 0.11 * s, z, 0.018 * s, h * 0.72, w * 0.72, rot, 0xffc987);
  addBox(buckets.glow, x, y + 0.12 * s, z, 0.06 * s, 0.12 * s, 0.06 * s, rot, 0xff9c45);
  addBox(buckets.glow, x, y + 0.22 * s, z, 0.05 * s, 0.11 * s, 0.05 * s, rot, 0xffc36a);
  addLanternCap(buckets, x, capY, z, rot, w * 0.62, 0.14 * s, 0x5b534b);
  addTorus(buckets.metal, x, capY + 0.12 * s, z, 0.09 * s, 0.012 * s, 10, 0x756b60, Math.PI / 2, 0, 0);
}

function addGlassPane(
  buckets: Record<MaterialKey, BufferGeometry[]>,
  x: number,
  y: number,
  z: number,
  w: number,
  h: number,
  d: number,
  rot: number,
  tint: number,
): void {
  addBox(buckets.glow, x, y, z, w, h, d, rot, tint);
}

function addLanternCap(
  buckets: Record<MaterialKey, BufferGeometry[]>,
  x: number,
  y: number,
  z: number,
  rot: number,
  half: number,
  height: number,
  tint: number,
): void {
  const positions = new Float32Array([
    -half,
    0,
    -half,
    half,
    0,
    -half,
    half,
    0,
    half,
    -half,
    0,
    half,
    0,
    height,
    0,
  ]);
  const indices = [0, 1, 4, 1, 2, 4, 2, 3, 4, 3, 0, 4, 0, 3, 1, 1, 3, 2];
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  transform(geometry, x, y, z, rot, 0, 0, 1, 1, 1);
  paint(geometry, tint);
  buckets.metal.push(geometry);
}

function addMooredBoatShipObstacles(shipObstacles: CircleObstacle[]): void {
  for (const boat of COVE.boats) shipObstacles.push({ x: boat.x, z: boat.z, r: 4.3 });
}

function addInstancedProps(
  group: Group,
  heightField: HeightField,
  materials: Record<MaterialKey, Material>,
  colliders: { circles: CircleObstacle[]; boxes: VillageBoxCollider[] },
  kit: VillageKit,
  low: boolean,
  mediumUp: boolean,
): InstancedMesh[] {
  const meshes: InstancedMesh[] = [];
  const at = (x: number, z: number) => walkable(x, z) ?? heightField.heightAt(x, z);
  const cut = <T>(items: T[]) => (low ? items.slice(0, Math.ceil(items.length * 0.58)) : items);

  const barrels = cut([
    inst(-143, -68, at(-143, -68), 0.1, 1.05),
    inst(-139, -69.4, at(-139, -69.4), 0.6, 0.92),
    inst(-124, -61, at(-124, -61), 0.2, 0.95),
    inst(-91, -70, at(-91, -70), -0.3, 1.08),
    inst(-110, -88, at(-110, -88), 0.2, 0.92),
    inst(-104, -97, at(-104, -97), 0.4, 0.85),
    inst(-81, -59, at(-81, -59), -0.2, 1.0),
    inst(-148, -49, at(-148, -49), 0.3, 0.86),
    inst(-106.6, -91.8, at(-106.6, -91.8), 0.2, 0.78),
    inst(-113.2, -91.4, at(-113.2, -91.4), -0.1, 0.74),
    inst(-129.3, -64.2, at(-129.3, -64.2), 0.6, 0.82),
    // Beside the east end of Salt's bench.
    inst(-87.35, -66.2, at(-87.35, -66.2), -0.4, 0.7),
  ]);
  addCirclePropColliders(colliders, barrels, 0.58);
  meshes.push(
    addInstances(
      group,
      'village-barrels',
      new CylinderGeometry(0.45, 0.5, 1.1, mediumUp ? 14 : 10),
      materials.wood,
      barrels,
      0.55,
      0x8a5a32,
    ),
  );

  const crates = cut([
    inst(-134, -69, at(-134, -69), 0.2, 1.0, 1.3, 0.8, 1.0),
    inst(-130, -70, at(-130, -70), -0.4, 0.75, 1.0, 1.0, 1.0),
    inst(-98, -68, at(-98, -68), 0.1, 0.9, 1.2, 0.75, 0.9),
    inst(-108, -75, at(-108, -75), 0.7, 0.75, 1.0, 0.85, 1.0),
    inst(-108, -115, at(-108, -115), 0.2, 0.8, 1.1, 0.85, 0.9),
    inst(-122, -46, at(-122, -46), -0.3, 0.6, 1.0, 0.7, 0.8),
    inst(-84, -54, at(-84, -54), 0.5, 1.0, 1.15, 0.75, 1.15),
    inst(-109.55, -93.2, at(-109.55, -93.2), -0.15, 0.64, 1.0, 0.7, 0.88),
    inst(-106.45, -108.2, at(-106.45, -108.2), 0.35, 0.68, 0.95, 0.8, 0.85),
    inst(-141.8, -57.8, at(-141.8, -57.8), 0.22, 0.72, 1.15, 0.72, 0.9),
  ]);
  addBoxPropColliders(colliders, crates, 0.58, 0.58, 1.0);
  meshes.push(
    addInstances(
      group,
      'village-crates',
      mergedKitGeometry(kit, 'Prop_Crate', 0x9a7150),
      materials.wood,
      crates,
      0.0,
      0x9a7150,
    ),
  );

  const sacks = cut([
    inst(-136, -46, at(-136, -46), 0, 0.85, 1.0, 0.62, 0.78),
    inst(-133.8, -45.5, at(-133.8, -45.5), 0.4, 0.72, 0.9, 0.58, 0.76),
    inst(-122.8, -44.8, at(-122.8, -44.8), -0.2, 0.72, 0.9, 0.55, 0.7),
    inst(-145.5, -53, at(-145.5, -53), 0.1, 0.8, 0.9, 0.58, 0.75),
  ]);
  addCirclePropColliders(colliders, sacks, 0.48);
  meshes.push(
    addInstances(
      group,
      'village-sacks',
      new SphereGeometry(0.55, mediumUp ? 10 : 8, 6),
      materials.cloth,
      sacks,
      0.34,
      0xc6b184,
    ),
  );

  const pots = cut([
    inst(-149, -54, at(-149, -54), 0.1, 0.85),
    inst(-146.8, -55.3, at(-146.8, -55.3), -0.5, 0.75),
    inst(-143.4, -52.0, at(-143.4, -52.0), 0.15, 0.58),
  ]);
  addCirclePropColliders(colliders, pots, 0.62);
  meshes.push(
    addInstances(
      group,
      'village-lobster-pots',
      new CylinderGeometry(0.48, 0.58, 0.72, 8),
      materials.rope,
      pots,
      0.36,
      0x927145,
    ),
  );

  return meshes.filter((mesh) => mesh.count > 0);
}

function addCirclePropColliders(
  colliders: { circles: CircleObstacle[] },
  instances: PropInstance[],
  radius: number,
): void {
  for (const p of instances) colliders.circles.push({ x: p.x, z: p.z, r: radius * (p.s ?? 1) });
}

function addBoxPropColliders(
  colliders: { boxes: VillageBoxCollider[] },
  instances: PropInstance[],
  hx: number,
  hz: number,
  height: number,
): void {
  for (const p of instances) {
    const s = p.s ?? 1;
    colliders.boxes.push({
      x: p.x,
      z: p.z,
      hx: hx * (p.sx ?? 1) * s,
      hz: hz * (p.sz ?? 1) * s,
      rot: p.rot ?? 0,
      height: height * (p.sy ?? 1) * s,
    });
  }
}

function inst(x: number, z: number, y: number, rot = 0, s = 1, sx = 1, sy = 1, sz = 1): PropInstance {
  return { x, z, y, rot, s, sx, sy, sz };
}

function addInstances(
  group: Group,
  name: string,
  geometry: BufferGeometry,
  material: Material,
  instances: PropInstance[],
  centerY: number,
  colour: number,
  rotateX = 0,
  rotateZ = 0,
): InstancedMesh {
  paint(geometry, colour);
  geometry.computeVertexNormals();
  const mesh = new InstancedMesh(geometry, material, Math.max(1, instances.length));
  mesh.name = name;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  for (let i = 0; i < Math.max(1, instances.length); i += 1) {
    const p = instances[i] ?? { x: 0, y: -1000, z: 0, rot: 0, s: 0.001 };
    tmpObject.position.set(p.x, p.y + centerY * (p.sy ?? p.s ?? 1), p.z);
    tmpObject.rotation.set(rotateX, p.rot ?? 0, rotateZ);
    const s = p.s ?? 1;
    tmpObject.scale.set((p.sx ?? 1) * s, (p.sy ?? 1) * s, (p.sz ?? 1) * s);
    tmpObject.updateMatrix();
    mesh.setMatrixAt(i, tmpObject.matrix);
  }
  group.add(mesh);
  return mesh;
}

function addBox(
  target: BufferGeometry[],
  x: number,
  y: number,
  z: number,
  w: number,
  h: number,
  d: number,
  ry: number,
  colour: number,
  rx = 0,
  rz = 0,
): void {
  const geometry = new BoxGeometry(w, h, d);
  transform(geometry, x, y + h * 0.5, z, ry, rx, rz, 1, 1, 1);
  applyWorldBoxUv(geometry);
  paint(geometry, colour);
  target.push(geometry);
}

function applyWorldBoxUv(geometry: BufferGeometry): void {
  const position = geometry.getAttribute('position') as BufferAttribute;
  const normal = geometry.getAttribute('normal') as BufferAttribute | undefined;
  const uvs = new Float32Array(position.count * 2);
  for (let i = 0; i < position.count; i += 1) {
    const nx = Math.abs(normal?.getX(i) ?? 0);
    const ny = Math.abs(normal?.getY(i) ?? 1);
    const nz = Math.abs(normal?.getZ(i) ?? 0);
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    const uvScale = 0.5;
    if (ny >= nx && ny >= nz) {
      uvs[i * 2] = x * uvScale;
      uvs[i * 2 + 1] = z * uvScale;
    } else if (nx >= nz) {
      uvs[i * 2] = z * uvScale;
      uvs[i * 2 + 1] = y * uvScale;
    } else {
      uvs[i * 2] = x * uvScale;
      uvs[i * 2 + 1] = y * uvScale;
    }
  }
  geometry.setAttribute('uv', new BufferAttribute(uvs, 2));
}

function mergedKitGeometry(kit: VillageKit, name: string, colour: number): BufferGeometry {
  const parts = kit.pieces.get(name);
  if (!parts?.length) {
    const fallback = new BoxGeometry(1, 1, 1);
    paint(fallback, colour);
    return fallback;
  }
  const geometries = parts.map((part) => {
    const clone = part.geometry.clone();
    paint(clone, colour);
    return clone;
  });
  const merged = mergeGeometries(geometries, false);
  for (const geometry of geometries) geometry.dispose();
  if (!merged) throw new Error(`Unable to merge village kit geometry ${name}`);
  return merged;
}

function addCylinder(
  target: BufferGeometry[],
  x: number,
  y: number,
  z: number,
  rTop: number,
  rBottom: number,
  h: number,
  segments: number,
  ry: number,
  colour: number,
): void {
  const geometry = new CylinderGeometry(rTop, rBottom, h, segments, 1);
  transform(geometry, x, y + h * 0.5, z, ry, 0, 0, 1, 1, 1);
  paint(geometry, colour);
  target.push(geometry);
}

function addTorus(
  target: BufferGeometry[],
  x: number,
  y: number,
  z: number,
  radius: number,
  tube: number,
  segments: number,
  colour: number,
  rx: number,
  ry: number,
  rz: number,
): void {
  const geometry = new TorusGeometry(radius, tube, 8, segments);
  transform(geometry, x, y, z, ry, rx, rz, 1, 1, 1);
  paint(geometry, colour);
  target.push(geometry);
}

function transform(
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

function paint(geometry: BufferGeometry, colour: number): void {
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

function localToWorld(x: number, z: number, rot: number, lx: number, lz: number): { x: number; z: number } {
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  return { x: x + lx * c + lz * s, z: z - lx * s + lz * c };
}

function triangleCount(geometry: BufferGeometry): number {
  return geometry.index ? geometry.index.count / 3 : geometry.getAttribute('position').count / 3;
}
