import { bakeInstances, sharedInstancedMesh } from '../../../engine/instancing';
import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Camera,
  CircleGeometry,
  Color,
  CylinderGeometry,
  FrontSide,
  Group,
  InstancedMesh,
  Mesh,
  Object3D,
  Sphere,
  SphereGeometry,
  TorusGeometry,
  Vector3,
  type Material,
} from 'three/webgpu';
import { buildSlice } from '../../../engine/build-slice';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { TierSettings } from '../../../engine/quality';
import type { CircleObstacle, HeightField } from '../../contracts';
import { COVE } from '../../layout';
import { BUILDINGS, type BuildingSpec } from './buildings';
import { ANCHORAGE_BATTERIES } from './batteries';
import { addShoreBatteries, cannonDetail, shoreBatteryWalkable } from '../../village/shore-battery';
import {
  ChunkLods,
  buildChunkLodIndex,
  chunkLodEdges,
  chunkLodFloor,
  chunkOptions,
  eachChunk,
  moveBucketInto,
} from '../../village/chunks';
import { loadLodSimplifier } from '../../characters/character-lod';
import { wrapAngle } from '../../../util/math';
import { createLighthouseHaloMaterial, createLighthouseLitMaterial } from '../../lighthouse-lamp';
import { coloredIndexedGeometry } from '../../sites/geo';
import { WaterStrips } from '../../sites/water';
import type { PlantInstance } from '../../vegetation/types';
import {
  FLOOR_LANDING_FROM,
  LIGHTHOUSE,
  LIGHTHOUSE_DECK,
  LIGHTHOUSE_DOOR_HEADING,
  LIGHTHOUSE_GALLERY,
  LIGHTHOUSE_LANTERN,
  LIGHTHOUSE_TREAD_DEPTH,
  STAIR_START,
  TREAD_ANGLE,
  WATCH_DOOR_HEADING,
  WATCH_FLOOR,
  lighthouseWalkable,
  treadTop,
} from './lighthouse-stair';
import {
  PALM_TRUNK_RADIUS,
  PLANTER,
  VILLAGE_PALMS,
  pickVillageShrubs,
  type ShrubCandidate,
  villagePlantInstances,
  villagePlantRank,
} from './plantings';
import {
  buildHouse,
  houseDoorAnchor,
  houseDoorSideSpot,
  housePerches,
  houseStairsSpan,
  HOUSE_STOREY_HEIGHT,
  placementWorldBox,
  placementWorldMaxY,
  stairsHeightAt,
  type HouseFootprint,
  type HouseSpec,
  type PiecePlacement,
  type StairSpan,
} from '../../village/house-builder';
import {
  createFallbackVillageKit,
  loadVillageKit,
  localToWorld,
  makeBuckets,
  paint,
  transform,
  type MaterialKey,
  type VillageAnchor,
  type VillageBoxCollider,
  type VillageKit,
} from '../../village/kit';
import { islandCourseBoard } from '../../../learn/course-board';
import { addCourseBoardTimber } from '../../sites/course-board';
import { COURSE_BOARDS } from '../course-boards';
import { addAnchorageMarket } from './model-market';

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
  /** Camera-only blockers (CollisionWorld.addCameraBox): eaves, awnings, façade trim the walker ignores. */
  cameraBlockers: VillageBoxCollider[];
  shipObstacles: CircleObstacle[];
  perches: Vector3[];
  walkable: (x: number, z: number, y?: number) => number | null;
  anchors: Record<string, VillageAnchor>;
  metrics: VillageMetrics;
  /** Hand-placed village palms and plants for the vegetation's instanced batches (`extraPlants`). */
  plantings: readonly PlantInstance[];
  /**
   * What a neighbouring island's view can drop (PLAN §12.3: neighbours draw at medium detail): the thin
   * merged pieces (timber, ironwork, rope, cloth), the loose props and the fountain's water. The walls,
   * roofs and lights stay, except on Lite.
   */
  neighbourDetail: readonly Mesh[];
  /** Lights the point lighthouse's lamp (Anchorage's Seal, PLAN §3). */
  setLighthouseLit(on: boolean): void;
  lighthouseLit(): boolean;
  update(dt: number, t: number, camera: Camera): void;
  dispose(): void;
}

export interface CreateVillageOptions {
  tier: TierSettings;
  heightField: HeightField;
  kit?: VillageKit;
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

const tmpObject = new Object3D();

export const VILLAGE_BUILDING_COUNT = 10;
/** The boathouse beside the pier; `hx`/`hz` are its deck's half-size (2.7 × 4.8 m). */
const BOATHOUSE = { x: COVE.pier.x + 2.9, z: -96.5, hx: 1.35, hz: 2.4 } as const;
const QUAY_STEPS = { x: -128, zTop: COVE.quay.z - 2.1, width: 5.5, count: 6, tread: 0.72 } as const;
const PIER_RAMP = {
  x: COVE.pier.x,
  z0: COVE.quay.z - 4.4,
  z1: COVE.quay.z,
  width: COVE.pier.width + 0.8,
} as const;
/** Materials whose pieces are thin enough to drop from a neighbouring island (`neighbourDetail`). */
const NEIGHBOUR_DETAIL = new Set<MaterialKey>(['wood', 'metal', 'rope', 'cloth']);
const BRIGANTINE_BERTH = { minX: -105.5, maxX: -98.9, minZ: -124.5, maxZ: -100.5 } as const;
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
  cameraBlockers.length = 0;

  // buildSlice: the village builds a few ms per frame while the opening plays over it.
  addQuay(buckets, colliders, shipObstacles, anchors, perches);
  await buildSlice();
  addPier(buckets, colliders, shipObstacles, anchors, perches, villageKit, low);
  await buildSlice();
  for (const building of BUILDINGS) {
    addBuilding(building, heightField, buckets, colliders, anchors, perches, villageKit, low);
    await buildSlice();
  }
  const fountainWater = addPlaza(buckets, colliders, anchors, heightField, villageKit, low);
  await buildSlice();
  addMarketStalls(buckets, colliders, anchors, heightField, perches);
  // Desmond's Model Market on the quay's east end (docs/specs/MODEL-MARKET.md §2).
  addAnchorageMarket(buckets, colliders, cameraBlockers, anchors, COVE.quay.height, low);
  // The course notice board on the street up from the quay (its lettering is in the sites' atlas).
  const courseBoard = islandCourseBoard('anchorage');
  if (courseBoard) {
    const parts = addCourseBoardTimber(buckets, COURSE_BOARDS.anchorage, courseBoard);
    colliders.boxes.push(parts.box);
    cameraBlockers.push(parts.camera);
  }
  if (!low) addVillageFestooning(buckets, colliders, heightField);
  await buildSlice();
  addLighthouse(buckets, colliders, shipObstacles, anchors, perches, heightField, low);
  addLanterns(buckets, colliders, heightField, low);
  await buildSlice();
  // The point battery on the lighthouse ridge (its pieces merge into the kit's chunks: no new shader).
  const battery = addShoreBatteries(
    buckets,
    ANCHORAGE_BATTERIES,
    (x, z) => heightField.heightAt(x, z),
    cannonDetail(tier.tier),
  );
  colliders.boxes.push(...battery.boxes);
  colliders.circles.push(...battery.circles);
  cameraBlockers.push(...battery.camera);
  await buildSlice();
  const plantings = addVillagePlantings(buckets, colliders, perches, heightField, tier);
  addMooredBoatShipObstacles(shipObstacles);
  await buildSlice();

  const materials = villageKit.materials;

  let staticDraws = 0;
  let staticTriangles = 0;
  const staticMeshes: Mesh[] = [];
  // Spatial chunks per material, so frustum culling works across the village, each with its own
  // levels of detail (no new draws or pipelines; the simplifier is the characters' lazy chunk).
  const neighbourDetail: Mesh[] = [];
  const simplify = typeof window === 'undefined' ? null : await loadLodSimplifier();
  const chunkLods = new ChunkLods(chunkLodEdges(tier), chunkLodFloor(tier));
  // Lite draws the rope with the cloth (alike: matte vertex colour), a draw fewer.
  if (tier.tier === 'lite') moveBucketInto(buckets, 'rope', 'cloth');
  for (const key of Object.keys(buckets) as MaterialKey[]) {
    const geometries = buckets[key];
    if (geometries.length === 0) continue;
    // A chunk a slice: a material's chunks and their levels of detail at once held a frame for
    // ~60 ms while the cabin played.
    for (const chunk of eachChunk(geometries, chunkOptions(tier))) {
      await buildSlice();
      if (simplify) buildChunkLodIndex(chunk.geometry, simplify);
      const mesh = new Mesh(chunk.geometry, materials[key]);
      chunkLods.attach(mesh);
      mesh.name = `village-${key}`;
      mesh.castShadow = key !== 'glow' && key !== 'halo';
      mesh.receiveShadow = key !== 'glow' && key !== 'halo';
      // Lite drops the whole village from the other island (a few pixels there).
      if (NEIGHBOUR_DETAIL.has(key) || tier.tier === 'lite') neighbourDetail.push(mesh);
      group.add(mesh);
      staticMeshes.push(mesh);
      staticDraws += 1;
      staticTriangles += chunk.triangles;
    }
    await buildSlice();
  }

  const propMeshes = addInstancedProps(group, heightField, materials, colliders, villageKit, low, mediumUp);
  // The loose props never move: baked into one draw per material (the timber's crates and casks, the
  // cloth's sacks and pots). Instanced, each look cost an instanced shader of its own in every pass
  // (6 programs; PLAN §15.4); baked, they share the village's.
  for (const [material, name] of [
    [materials.wood, 'village-crates-and-casks'],
    [materials.cloth, 'village-sacks-and-lobster-pots'],
  ] as const) {
    const props = propMeshes.filter((mesh) => mesh.material === material);
    const baked = bakeInstances(props);
    if (!baked) continue;
    const mesh = new Mesh(baked, material);
    mesh.name = name;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    staticMeshes.push(mesh);
    staticDraws += 1;
    staticTriangles += triangleCount(baked);
    for (const prop of props) {
      propMeshes.splice(propMeshes.indexOf(prop), 1);
      prop.removeFromParent();
      prop.geometry.dispose();
      prop.dispose();
    }
  }
  // Loose props are a pixel at most from the other island (PLAN §12.3).
  for (const mesh of group.children)
    if (/^village-(crates|barrels|sacks|lobster)/.test(mesh.name)) neighbourDetail.push(mesh as Mesh);
  const propTriangles = propMeshes.reduce((sum, mesh) => sum + triangleCount(mesh.geometry) * mesh.count, 0);
  await buildSlice();
  plantings.push(...villageShrubs(colliders, anchors, plantings, heightField, tier));
  await buildSlice();
  const metrics: VillageMetrics = {
    staticDraws,
    propDraws: propMeshes.length,
    drawCalls: staticDraws + propMeshes.length,
    staticTriangles,
    propTriangles,
    triangles: staticTriangles + propTriangles,
    buildingCount: BUILDINGS.length,
  };
  if (fountainWater) {
    group.add(fountainWater.mesh);
    neighbourDetail.push(fountainWater.mesh);
    metrics.drawCalls += 1;
    metrics.triangles += fountainWater.mesh.geometry.drawRange.count / 3;
  }
  group.userData.villageMetrics = metrics;
  const lighthouseLamp = createLighthouseLamp();
  group.add(lighthouseLamp);

  return {
    group,
    colliders,
    cameraBlockers: [...cameraBlockers],
    shipObstacles,
    perches,
    walkable,
    anchors,
    metrics,
    plantings,
    neighbourDetail,
    setLighthouseLit(on: boolean): void {
      lighthouseLamp.visible = on;
    },
    lighthouseLit: () => lighthouseLamp.visible,
    update(_dt: number, _t: number, camera: Camera): void {
      updateLighthouseLamp(lighthouseLamp, camera);
      chunkLods.update(camera.position.x, camera.position.y, camera.position.z);
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
      fountainWater?.dispose();
      lighthouseLamp.traverse((o) => {
        const m = o as Mesh;
        if (!m.isMesh) return;
        m.geometry.dispose();
        (m.material as Material).dispose();
      });
      if (streetHeightField === heightField) streetHeightField = null;
      group.clear();
    },
  };
}

/** Whether (x, z) is on the pier's or the boathouse's planks (wood underfoot, not the stone quay). */
export function onPierDeck(x: number, z: number): boolean {
  const p = COVE.pier;
  if (Math.abs(x - p.x) <= p.width * 0.5 + 0.4 && z <= Math.max(p.z0, p.z1) + 0.8) return true;
  return Math.abs(x - BOATHOUSE.x) <= BOATHOUSE.hx && Math.abs(z - BOATHOUSE.z) <= BOATHOUSE.hz;
}

export function walkable(x: number, z: number, y?: number): number | null {
  const tower = lighthouseWalkable(x, z, y);
  if (tower !== null) return tower;
  const battery = shoreBatteryWalkable(ANCHORAGE_BATTERIES, x, z);
  if (battery !== null) return battery;
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
  // Its deck only (it joins the pier's east edge), so you can't stand on the water past its ends.
  if (Math.abs(x - BOATHOUSE.x) <= BOATHOUSE.hx && Math.abs(z - BOATHOUSE.z) <= BOATHOUSE.hz) return p.deck;
  const street = streetWalkable(x, z);
  if (street !== null) return street;
  return lighthousePathWalkable(x, z);
}

/** The point lighthouse's ridge path: its slabs, from the door step to the quay's west end. */
function lighthousePathWalkable(x: number, z: number): number | null {
  if (!streetHeightField) return null;
  const L = COVE.lighthouse;
  const ex = L.neck.x - L.x;
  const ez = L.neck.z - L.z;
  const len = Math.hypot(ex, ez);
  const along = ((x - L.x) * ex + (z - L.z) * ez) / len;
  if (along < LIGHTHOUSE_PATH_START - 0.5 || along > len) return null;
  const across = Math.abs((x - L.x) * ez - (z - L.z) * ex) / len;
  if (across > 0.8) return null;
  return streetHeightField.heightAt(x, z) + 0.08;
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

/** The kit house a village building is (its footprint, storeys, walls and roof, tints). */
export function houseSpecForBuilding(spec: BuildingSpec, baseY: number, low: boolean): HouseSpec {
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
  cameraBlockers.push({
    x: spec.x,
    z: spec.z,
    hx: footprint.w * 0.5 + FACADE_DEPTH,
    hz: footprint.d * 0.5 + FACADE_DEPTH,
    rot: spec.rot,
    y0: baseY - 0.5,
    y1: baseY + house.storeys * HOUSE_STOREY_HEIGHT,
  });
  // Open shutters stand about 0.55 m off the wall, past the façade blocker.
  for (const placement of placements)
    if (placement.role === 'shutters') cameraBlockers.push(placementWorldBox(placement));
  if (house.balcony && house.storeys > 1) {
    // The front balcony: its floor 2 m out from the wall, a storey up, and its railing.
    const b = localToWorld(spec.x, spec.z, spec.rot, 0, -footprint.d * 0.5 - 1);
    const floor = baseY + HOUSE_STOREY_HEIGHT;
    cameraBlockers.push({
      x: b.x,
      z: b.z,
      hx: footprint.w * 0.5,
      hz: 1.05,
      rot: spec.rot,
      y0: floor - 0.15,
      y1: floor + 1.3,
    });
  }
  if (spec.anchor) anchors[spec.anchor] = houseDoorAnchor(house);
  if (spec.id === 'chandlery') {
    // The kit's ledge and post at the front-left corner stand 0.5 m past the façade blocker.
    const c = localToWorld(spec.x, spec.z, spec.rot, -footprint.w * 0.45, -footprint.d * 0.5 - 0.35);
    cameraBlockers.push({
      x: c.x,
      z: c.z,
      hx: 0.75,
      hz: 0.42,
      rot: spec.rot,
      y0: baseY + 0.9,
      y1: baseY + 1.9,
    });
  }
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
  if (spec.awning) {
    addDoorAwning(buckets, spec.x, baseY + 2.2, spec.z, spec.rot, footprint.w, frontZ, spec.awning);
    // The awning reaches about 0.7 m past the façade blocker; keep the camera out of its cloth too.
    const p = localToWorld(spec.x, spec.z, spec.rot, 0, frontZ - 0.3);
    const hx = Math.min(footprint.w * 0.72, 3.55) * 0.5;
    cameraBlockers.push({ x: p.x, z: p.z, hx, hz: 0.55, rot: spec.rot, y0: baseY + 2.05, y1: baseY + 2.5 });
  }
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

export function addKitPlacement(
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

/** The vertex colour a kit part is painted (`paint`) with: a placement's tint on plaster and roof tiles. */
export function kitPaintColour(materialKey: MaterialKey, tint?: number): number {
  if (materialKey === 'plaster') return tint ?? 0xffffff;
  if (materialKey === 'roofTile') return tint ?? 0xffffff;
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
 * Ezra's chart table at the foot of the pier, so forking the course is a few steps from Nell
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
    // Camera only: the quay's stone face below the band, which the sea-level ground doesn't cover.
    cameraBlockers.push({
      x: (x0 + x1) * 0.5,
      z: q.z - 1.35,
      hx: w * 0.5,
      hz: 1.5,
      rot: 0,
      y0: -1,
      y1: q.height + 0.26,
    });
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
        buckets.wood,
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
      addPierPlank(buckets.wood, pier.x, y, z, usableWidth, 0.14, depth, tint, pier.x, usableWidth);
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
      // Camera only: the walk circle has no height, so the camera counted it only near the seabed.
      const bollard = z <= -109 && !low;
      cameraBlockers.push({ x, z, hx: 0.42, hz: 0.42, rot: 0, y0: -3, y1: p.deck + (bollard ? 1.4 : 0.65) });
      addShipObstacle(shipObstacles, { x, z, r: 1.35 });
      if (!bollard) continue;
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
    // Top 1 cm under the boathouse floor (deck + 0.06), which it runs beneath: flush, they z-fought.
    addBox(buckets.rope, x, pier.deck - 0.36, centerZ, 0.18, 0.41, length - 1.2, 0, 0x806b56);
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

/** The pier-end bollard by the crane board, where the dock gull stands (feet on its top). */
const DOCK_GULL_Z = -121;
export const DOCK_GULL_SPOT = {
  x: COVE.pier.x + COVE.pier.width * 0.5 + 0.16,
  y: COVE.pier.deck + 0.64,
  z: DOCK_GULL_Z,
} as const;

function addMooringHardware(
  buckets: Record<MaterialKey, BufferGeometry[]>,
  colliders: { circles: CircleObstacle[] },
  perches: Vector3[],
  pier: typeof COVE.pier,
): void {
  const x = pier.x + pier.width * 0.5 + 0.16;
  for (const z of [-103, DOCK_GULL_Z]) {
    addCylinder(buckets.metal, x, pier.deck, z, 0.24, 0.3, 0.64, 12, 0, 0x252320);
    addTorus(buckets.metal, x, pier.deck + 0.62, z, 0.28, 0.035, 12, 0x2f2c26, Math.PI / 2, 0, 0);
    addBox(buckets.rope, x + 0.95, pier.deck + 0.36, z - 0.28, 2.0, 0.06, 0.06, 0.22, 0xc4a576);
    colliders.circles.push({ x, z, r: 0.55 });
    // The pier-end bollard belongs to the dock gull (life/dock-gull.ts), so the flock keeps off it.
    if (z !== DOCK_GULL_Z) perches.push(new Vector3(x, pier.deck + 0.64, z));
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
    addLifeBuoyPost(buckets, colliders, pier.x + pier.width * 0.5 - 0.22, pier.deck, -88.1);
    addRopeCoil(buckets, pier.x + 1.15, pier.deck + 0.05, -110.4, -0.65, 0.62);
    addCargoStack(buckets, pier.x + 1.15, pier.deck, -114.6, 0.18, 0x9b6f4d, false);
    colliders.boxes.push({ x: pier.x + 1.15, z: -114.6, hx: 0.92, hz: 0.74, rot: 0.18, height: 1.35 });
  }
}

/**
 * A life ring hung on a short post at the pier's edge, facing the walkway: a post, a peg, and the ring
 * hanging from it with its red bands and a coil of throwing line.
 */
function addLifeBuoyPost(
  buckets: Record<MaterialKey, BufferGeometry[]>,
  colliders: { circles: CircleObstacle[] },
  x: number,
  y: number,
  z: number,
): void {
  addBox(buckets.wood, x, y, z, 0.12, 1.45, 0.12, 0, 0x6b4a2d);
  addBox(buckets.wood, x, y + 1.42, z, 0.18, 0.06, 0.18, 0, 0x5c3f27);
  // A peg out toward the walkway, and the ring hanging on it, upright, facing the walkway (−x).
  addBox(buckets.metal, x - 0.09, y + 1.15, z, 0.12, 0.03, 0.03, 0, 0x4d463d);
  const cx = x - 0.12;
  const cy = y + 0.86;
  addTorus(buckets.cloth, cx, cy, z, 0.3, 0.06, 20, 0xf1eee1, 0, Math.PI / 2, 0);
  for (const a of [Math.PI * 0.25, Math.PI * 0.75, Math.PI * 1.25, Math.PI * 1.75]) {
    // Red bands round the ring (the box's y is its base, so centre it on the ring's tube).
    addBox(
      buckets.cloth,
      cx,
      cy + Math.sin(a) * 0.3 - 0.07,
      z + Math.cos(a) * 0.3,
      0.14,
      0.14,
      0.09,
      0,
      0xb94835,
      -a,
    );
  }
  addTorus(buckets.rope, x + 0.0, y + 0.32, z, 0.12, 0.022, 12, 0xc8b17a, 0, Math.PI / 2, 0);
  colliders.circles.push({ x, z, r: 0.25 });
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

/**
 * Pier cargo: a big crate with a smaller one sitting squarely on it, under a canvas tarp that drapes
 * over the top and down the sides, held by two ropes that run down to the deck. Everything rests on
 * what's below it (no overlaps or floating parts).
 */
function addCargoStack(
  buckets: Record<MaterialKey, BufferGeometry[]>,
  x: number,
  y: number,
  z: number,
  rot: number,
  tarp: number,
  low: boolean,
): void {
  const at = (lx: number, lz: number) => localToWorld(x, z, rot, lx, lz);
  // Bottom crate 1.4 × 0.7 × 0.95, then the top crate 0.95 × 0.55 × 0.75 resting on it, off-centre.
  addBox(buckets.wood, x, y, z, 1.4, 0.7, 0.95, rot, 0x8f6542);
  const top = at(-0.12, 0.04);
  addBox(buckets.wood, top.x, y + 0.7, top.z, 0.95, 0.55, 0.75, rot, 0x775236);
  if (low) return;
  // The tarp: thrown over the top crate, hanging a hand's width down each side (the wood shows below).
  const tY = y + 1.25;
  addBox(buckets.cloth, top.x, tY, top.z, 1.05, 0.04, 0.85, rot, tarp);
  for (const side of [-1, 1] as const) {
    const sk = at(-0.12, 0.04 + side * 0.415);
    addBox(buckets.cloth, sk.x, tY - 0.2, sk.z, 1.05, 0.22, 0.03, rot, tarp);
  }
  for (const end of [-1, 1] as const) {
    const fl = at(-0.12 + end * 0.515, 0.04);
    addBox(buckets.cloth, fl.x, tY - 0.16, fl.z, 0.03, 0.18, 0.85, rot, tarp);
  }
  // Two lashings over the tarp, down the sides of both crates to the deck.
  for (const lx of [-0.42, 0.18]) {
    const over = at(lx, 0.04);
    addBox(buckets.rope, over.x, tY + 0.025, over.z, 0.05, 0.03, 0.88, rot, 0xc5a873);
    for (const side of [-1, 1] as const) {
      const upper = at(lx, 0.04 + side * 0.44);
      addBox(buckets.rope, upper.x, y + 0.7, upper.z, 0.05, 0.57, 0.03, rot, 0xc5a873);
      const lower = at(lx, side * 0.49);
      addBox(buckets.rope, lower.x, y, lower.z, 0.05, 0.7, 0.03, rot, 0xc5a873);
    }
  }
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
  // Camera only: the post, its arm and the lantern out over the water.
  cameraBlockers.push({ x: x + side * 0.3, z, hx: 0.5, hz: 0.22, rot: 0, y0: y, y1: y + 2.8 });
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
  addBox(buckets.wood, x, deck - 0.06, z, BOATHOUSE.hx * 2, 0.12, BOATHOUSE.hz * 2, rot, 0x745239);
  // Roof slabs' centre height: the eaves sit about 2.4 m up, high enough to carry a barrel in.
  const roof = deck + 2.85;
  // The posts stop under the slabs (they used to poke up through a roof only 1.45 m up at the eaves).
  const postTop = roof - 0.36 - deck;
  for (const lx of [-1.14, 1.14]) {
    for (const lz of [-2.05, 2.05]) {
      const p = localToWorld(x, z, rot, lx, lz);
      addCylinder(buckets.wood, p.x, deck, p.z, 0.11, 0.14, postTop, 8, rot, 0x67462c);
      colliders.boxes.push({ x: p.x, z: p.z, hx: 0.18, hz: 0.18, rot, height: postTop + 0.1 });
    }
    // A plate along each side, the posts' tops to the roof.
    addBox(buckets.wood, x + lx, deck + postTop, z, 0.16, 0.14, 4.4, rot, 0x6f4d31);
  }
  addBox(buckets.wood, x, roof - 0.02, z, 0.18, 0.16, 5.0, rot, 0x6f4d31);
  addBox(buckets.wood, x - 0.62, roof, z, 1.7, 0.18, 5.15, rot, 0x5f3f2b, 0, 0.56);
  addBox(buckets.wood, x + 0.62, roof, z, 1.7, 0.18, 5.15, rot, 0x5f3f2b, 0, -0.56);
  // Camera only: the roof, from the eaves (about 2.4 m up) to the ridge.
  cameraBlockers.push({ x, z, hx: 1.45, hz: 2.6, rot, y0: deck + 2.3, y1: deck + 3.55 });
  // Open on the pier side (−x): you walk straight in under the roof. A low wall along the water
  // side keeps you on the deck (it used to stand on the pier side, with no collider: it looked like
  // the way in was shut, and you walked through it).
  addBox(buckets.wood, x + 1.18, deck + 0.28, z, 0.14, 0.48, 3.5, rot, 0x725035);
  colliders.boxes.push({ x: x + 1.18, z, hx: 0.12, hz: 1.75, rot, height: 0.6 });
  addNetRack(buckets, x + 1.62, z - 0.8, deck, 0.05);
  addRopeCoil(buckets, x - 0.72, deck + 0.05, z - 1.15, -0.2, 0.68);
  addLanternFixture(buckets, x - 0.9, deck + 2.05, z - 2.22, rot, 0.72);
  addShipObstacle(shipObstacles, { x, z: z + 0.2, r: 2.35 });
}

function addPlaza(
  buckets: Record<MaterialKey, BufferGeometry[]>,
  colliders: { circles: CircleObstacle[]; boxes: VillageBoxCollider[] },
  anchors: Record<string, VillageAnchor>,
  heightField: HeightField,
  kit: VillageKit,
  low: boolean,
): WaterStrips | null {
  const cx = COVE.village.center.x;
  const cz = COVE.village.center.z;
  const y = heightField.heightAt(cx, cz);
  addRoundSquare(buckets, colliders, heightField, low);
  addStreetPaving(buckets, heightField, kit, low);
  if (!low) addSpawnPlantingBeds(buckets, heightField);
  const water =
    SQUARE.centrepiece === 'fountain'
      ? addFountain(buckets, colliders, y + 0.13, low)
      : (addRoofedWell(buckets, colliders, y + 0.13, low), null);
  anchors.plazaWell = { x: cx + 2.7, y, z: cz - 1.2, heading: -1.2 };
  if (low) return water;
  for (const [bx, bz, r] of [
    [-89, -65, 0.2],
    [-143, -57, -0.25],
  ] as const) {
    const by = walkable(bx, bz) ?? heightField.heightAt(bx, bz);
    addBox(buckets.wood, bx, by + 0.05, bz, 2.6, 0.22, 0.72, r, 0x6f4d31);
    addBox(buckets.wood, bx, by + 0.55, bz + 0.27, 2.6, 0.72, 0.12, r, 0x5e4129);
    // Camera only (you walk past it): the seat and its back.
    cameraBlockers.push({ x: bx, z: bz, hx: 1.33, hz: 0.4, rot: r, y0: by, y1: by + 1.3 });
  }
  return water;
}

export type SquareCentrepiece = 'fountain' | 'well';

/** The round town square at the village centre (Dan): its radius, and where its furniture stands. */
export const SQUARE = {
  radius: COVE.village.squareRadius,
  /** The square's focal point (Dan): a tiered fountain, or a roofed well with a windlass. */
  centrepiece: 'fountain' as SquareCentrepiece,
  /** The fountain basin's outer radius (its collider adds the rim); Pip circles at 3.4 m. */
  basin: 2.45,
  /** Where the blue market stall stands, just outside the curb (radians, atan2(z, x)). */
  stallAngle: 2.2,
  /** Angles (radians, atan2(z, x) from the centre) of the benches, which face the well. */
  benches: [0.7, 2.42, -1.02, -2.06],
  /** Flower planters, between the benches and the streets. */
  planters: [1.5, -0.55, -2.6],
  /** Extra lamp posts on the square's rim (the plaza already has one at (−118, −49)). */
  lamps: [0.25, 2.0],
} as const;

/**
 * The square's fountain: a round stone basin with a rolled rim, a pedestal with two tiered bowls and
 * a pineapple finial. Stone merges into the stone bucket; the water (still pools with rings running
 * out, and sheets spilling from each bowl) is one mesh on the mill's water material (same program).
 */
function addFountain(
  buckets: Record<MaterialKey, BufferGeometry[]>,
  colliders: { circles: CircleObstacle[] },
  y0: number,
  low: boolean,
): WaterStrips {
  const cx = COVE.village.center.x;
  const cz = COVE.village.center.z;
  const R = SQUARE.basin;
  const seg = low ? 16 : 24;
  const wallR = R - 0.16;
  addCylinder(buckets.stone, cx, y0 - 0.02, cz, R - 0.06, R - 0.06, 0.14, seg + 8, 0, 0x5f766b);
  for (let i = 0; i < seg; i += 1) {
    const a = (i / seg) * Math.PI * 2;
    const len = ((Math.PI * 2 * wallR) / seg) * 1.06;
    const tint = i % 3 === 0 ? 0xa89c82 : 0xb8ac90;
    addBox(buckets.stone, cx + Math.cos(a) * wallR, y0, cz + Math.sin(a) * wallR, 0.34, 0.6, len, -a, tint);
  }
  addTorus(buckets.stone, cx, y0 + 0.62, cz, wallR, 0.2, low ? 28 : 44, 0xd6cab0, Math.PI / 2, 0, 0);
  addCylinder(buckets.stone, cx, y0 + 0.1, cz, 0.3, 0.46, 1.22, 12, 0, 0xb9ad92);
  addCylinder(buckets.stone, cx, y0 + 1.3, cz, 1.2, 0.36, 0.32, seg, 0, 0xcdc2a6);
  addTorus(buckets.stone, cx, y0 + 1.64, cz, 1.16, 0.08, low ? 20 : 32, 0xddd2b8, Math.PI / 2, 0, 0);
  addCylinder(buckets.stone, cx, y0 + 1.6, cz, 0.15, 0.24, 0.74, 10, 0, 0xb9ad92);
  addCylinder(buckets.stone, cx, y0 + 2.3, cz, 0.62, 0.2, 0.22, 16, 0, 0xcdc2a6);
  addTorus(buckets.stone, cx, y0 + 2.54, cz, 0.6, 0.05, 20, 0xddd2b8, Math.PI / 2, 0, 0);
  addCylinder(buckets.stone, cx, y0 + 2.5, cz, 0.11, 0.15, 0.24, 10, 0, 0xb3a68a);
  addCylinder(buckets.stone, cx, y0 + 2.72, cz, 0.04, 0.15, 0.36, 10, 0, 0xc7b993);
  colliders.circles.push({ x: cx, z: cz, r: R + 0.2 });

  // One-sided, so the transparent water draws once (double-sided draws a back pass too): the pools
  // face up and each stream is laid in both windings.
  const water = new WaterStrips(low ? 120 : 220);
  water.mesh.name = 'anchorage-fountain-water';
  (water.mesh.material as Material).side = FrontSide;
  water.begin();
  // A still pool in rings, its ripples running out from where each sheet lands.
  const pool = (y: number, radii: readonly number[], n: number, land: number, speed: number) => {
    for (let r = 0; r < radii.length - 1; r += 1) {
      const r0 = radii[r]!;
      const r1 = radii[r + 1]!;
      const foam = Math.max(0, 1 - Math.abs((r0 + r1) * 0.5 - land) / 0.45) * 0.45;
      for (let i = 0; i < n; i += 1) {
        const a0 = (i / n) * Math.PI * 2;
        const a1 = ((i + 1) / n) * Math.PI * 2;
        water.quad(
          [cx + Math.cos(a1) * r0, y, cz + Math.sin(a1) * r0],
          [cx + Math.cos(a0) * r0, y, cz + Math.sin(a0) * r0],
          [cx + Math.cos(a1) * r1, y, cz + Math.sin(a1) * r1],
          [cx + Math.cos(a0) * r1, y, cz + Math.sin(a0) * r1],
          r0,
          r1,
          { fill: 0.92, speed, foam },
          0.5,
          0.5,
        );
      }
    }
  };
  // Streams spilling from a bowl's lip (r0 at yTop), arcing out to r1 where they land at yBottom:
  // two quads each (a short curl over the lip, then the drop), with gaps between them.
  const streams = (yTop: number, yBottom: number, r0: number, r1: number, n: number, w: number) => {
    const yMid = yTop - (yTop - yBottom) * 0.3;
    const rMid = r0 + (r1 - r0) * 0.62;
    for (let i = 0; i < n; i += 1) {
      const a = ((i + 0.5) / n) * Math.PI * 2;
      const c = Math.cos(a);
      const sn = Math.sin(a);
      const at = (r: number, y: number, side: number): number[] => {
        const half = (w * 0.5 * r) / r0;
        return [cx + c * r - sn * half * side, y, cz + sn * r + c * half * side];
      };
      const flow = { fill: 0.42, speed: 1.6, foam: 0.35 };
      for (const s of [-1, 1]) {
        water.quad(at(r0, yTop, s), at(r0, yTop, -s), at(rMid, yMid, s), at(rMid, yMid, -s), 0, 0.3, flow);
        water.quad(
          at(rMid, yMid, s),
          at(rMid, yMid, -s),
          at(r1, yBottom, s),
          at(r1, yBottom, -s),
          0.3,
          yTop - yBottom,
          flow,
        );
      }
    }
  };
  pool(y0 + 0.5, low ? [0.46, 1.6, wallR - 0.12] : [0.46, 1.0, 1.4, 1.8, wallR - 0.12], seg, 1.6, 0.35);
  pool(y0 + 1.66, [0.24, 0.7, 1.1], low ? 12 : 16, 0.92, 0.3);
  pool(y0 + 2.56, [0.16, 0.56], 12, 0.56, 0.25);
  streams(y0 + 1.68, y0 + 0.5, 1.22, 1.62, low ? 6 : 8, 0.3);
  streams(y0 + 2.58, y0 + 1.66, 0.62, 0.92, 6, 0.2);
  water.end();
  water.mesh.geometry.boundingSphere = new Sphere(new Vector3(cx, y0 + 1.4, cz), R + 0.6);
  water.mesh.frustumCulled = true;
  return water;
}

/**
 * The square's other centrepiece: the old well raised into a landmark, with a stone drum, two posts
 * under a little tiled roof, a windlass with its crank and rope, and a bucket on the rim.
 */
function addRoofedWell(
  buckets: Record<MaterialKey, BufferGeometry[]>,
  colliders: { circles: CircleObstacle[] },
  y0: number,
  low: boolean,
): void {
  const cx = COVE.village.center.x;
  const cz = COVE.village.center.z;
  addCylinder(buckets.stone, cx, y0, cz, 1.12, 1.24, 0.92, 20, 0, 0x948a77);
  addTorus(buckets.stone, cx, y0 + 0.92, cz, 1.1, 0.12, 32, 0xc4b796, Math.PI / 2, 0, 0);
  addCylinder(buckets.stone, cx, y0 + 0.9, cz, 0.92, 0.92, 0.03, 20, 0, 0x1d2622);
  for (const side of [-1, 1]) {
    addBox(buckets.wood, cx + side * 1.18, y0 + 0.2, cz, 0.2, 2.5, 0.2, 0, 0x5f4128);
    addBox(buckets.wood, cx + side * 1.18, y0 + 1.86, cz, 0.12, 0.42, 0.12, 0, 0x6d4b2e, 0, side * 0.6);
  }
  addBox(buckets.wood, cx, y0 + 2.62, cz, 2.7, 0.16, 0.18, 0, 0x6d4b2e);
  for (const side of [-1, 1]) {
    const slope = 0.62;
    const half = 0.92;
    addBox(
      buckets.roofTile,
      cx,
      y0 + 2.72 + Math.sin(slope) * half * 0.5 - 0.05,
      cz + side * Math.cos(slope) * half * 0.5,
      3.1,
      0.1,
      half + 0.25,
      0,
      0xb8442f,
      side * slope,
      0,
    );
  }
  const axle = new CylinderGeometry(0.13, 0.13, 2.2, 10, 1);
  transform(axle, cx, y0 + 1.66, cz, 0, 0, Math.PI / 2, 1, 1, 1);
  paint(axle, 0x7a5636);
  buckets.wood.push(axle);
  addBox(buckets.wood, cx + 1.36, y0 + 1.4, cz, 0.08, 0.32, 0.08, 0, 0x4d3420);
  addBox(buckets.wood, cx + 1.36, y0 + 1.36, cz + 0.16, 0.08, 0.08, 0.32, 0, 0x4d3420);
  addBox(buckets.rope, cx + 0.3, y0 + 1.3, cz, 0.04, 0.34, 0.04, 0, 0x9b8a64);
  if (!low) {
    addCylinder(buckets.wood, cx + 0.3, y0 + 1.02, cz, 0.2, 0.16, 0.3, 10, 0, 0x6b4a2d);
    addCylinder(buckets.wood, cx - 0.55, y0 + 0.98, cz + 0.72, 0.19, 0.15, 0.32, 10, 0.4, 0x6b4a2d);
  }
  colliders.circles.push({ x: cx, z: cz, r: 1.5 });
}

/** How far a point is inside the nearest street's paving (positive inside). */
function streetRouteCover(x: number, z: number): number {
  let cover = -Infinity;
  for (const route of STREET_ROUTES) {
    for (let i = 0; i < route.length - 1; i += 1)
      cover = Math.max(cover, streetHalfWidth(x, z) - distanceToSegment(x, z, route[i]!, route[i + 1]!));
  }
  return cover;
}

/**
 * The round town square round the well: a paved disc laid in concentric courses with an eight-point
 * compass rose, a curb ring that opens where the streets come in, benches facing the well, flower
 * planters and lamps. Everything merges into the paving, stone, wood and metal buckets.
 */
function addRoundSquare(
  buckets: Record<MaterialKey, BufferGeometry[]>,
  colliders: { circles: CircleObstacle[]; boxes: VillageBoxCollider[] },
  heightField: HeightField,
  low: boolean,
): void {
  const cx = COVE.village.center.x;
  const cz = COVE.village.center.z;
  const R = SQUARE.radius;
  buckets.paving.push(createSquarePavingGeometry(heightField, cx, cz, R, low));

  // The curb: dressed stones on the rim, left out where a street meets the square.
  const curbCount = low ? 30 : 48;
  for (let i = 0; i < curbCount; i += 1) {
    const a = (i / curbCount) * Math.PI * 2;
    const x = cx + Math.cos(a) * (R + 0.18);
    const z = cz + Math.sin(a) * (R + 0.18);
    if (streetRouteCover(x, z) > -0.4) continue;
    const len = ((Math.PI * 2 * (R + 0.18)) / curbCount) * 0.94;
    addBox(
      buckets.stone,
      x,
      heightField.heightAt(x, z) - 0.05,
      z,
      0.42,
      0.26,
      len,
      -a,
      i % 3 === 0 ? 0xb3a687 : 0xc4b796,
    );
  }

  for (const a of SQUARE.benches) {
    const r = R - 1.6;
    const x = cx + Math.cos(a) * r;
    const z = cz + Math.sin(a) * r;
    const y = heightField.heightAt(x, z) + 0.13;
    // The seat runs along the rim; the back is on the outside, so it faces the well.
    const ry = -a + Math.PI / 2;
    const bx = Math.cos(a) * 0.3;
    const bz = Math.sin(a) * 0.3;
    addBox(buckets.stone, x - Math.sin(a) * 0.9, y, z + Math.cos(a) * 0.9, 0.36, 0.42, 0.5, ry, 0xa89b80);
    addBox(buckets.stone, x + Math.sin(a) * 0.9, y, z - Math.cos(a) * 0.9, 0.36, 0.42, 0.5, ry, 0xa89b80);
    addBox(buckets.wood, x, y + 0.42, z, 2.4, 0.1, 0.62, ry, 0x7a5434);
    if (!low) addBox(buckets.wood, x + bx, y + 0.78, z + bz, 2.4, 0.5, 0.09, ry, 0x6b4a2d);
    // The backrest's top is 1.28 m over the seat's base (y), itself 0.13 m over the ground.
    colliders.boxes.push({ x, z, hx: 1.2, hz: 0.36, rot: ry, height: low ? 0.6 : 1.42 });
  }

  for (const a of SQUARE.planters) {
    const r = R - 1.3;
    const x = cx + Math.cos(a) * r;
    const z = cz + Math.sin(a) * r;
    const y = heightField.heightAt(x, z) + 0.13;
    addCylinder(buckets.stone, x, y - 0.05, z, 0.95, 1.02, 0.5, 16, 0, 0xc4b89f);
    addCylinder(buckets.stone, x, y + 0.4, z, 1.0, 1.0, 0.1, 16, 0, 0xd8cfb9);
    addCylinder(buckets.stone, x, y + 0.47, z, 0.84, 0.84, 0.04, 16, 0, 0x6e5538);
    colliders.circles.push({ x, z, r: 1.05, height: 0.6 });
  }

  if (low) return;
  for (const a of SQUARE.lamps) {
    const x = cx + Math.cos(a) * (R - 0.5);
    const z = cz + Math.sin(a) * (R - 0.5);
    const y = heightField.heightAt(x, z) + 0.13;
    const side = Math.cos(a) > 0 ? -1 : 1;
    addBox(buckets.wood, x, y, z, 0.16, 2.6, 0.16, 0, 0x593b23);
    addLampBracket(buckets, x, y, z, side);
    addLanternFixture(buckets, x + side * 0.92, y + 1.68, z, 0, 1);
    colliders.circles.push({ x, z, r: 0.38 });
    addLampHeadBlocker(x, y, z, side);
  }
}

/** The square's paving: concentric courses with a compass rose, each quad its own flat colour. */
function createSquarePavingGeometry(
  heightField: HeightField,
  cx: number,
  cz: number,
  radius: number,
  low: boolean,
): BufferGeometry {
  const rings = low ? 9 : 18;
  const segments = low ? 48 : 96;
  const positions: number[] = [];
  const uvs: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const tint = new Color();
  const course = [0xf2e6c8, 0xe2d4b2] as const;
  const rose = 0x7d6a55;
  const roseLight = 0xfff6dc;
  const rim = 0xbfb094;
  for (let ri = 0; ri < rings; ri += 1) {
    const r0 = (ri / rings) * radius;
    const r1 = ((ri + 1) / rings) * radius;
    const rm = (r0 + r1) * 0.5;
    for (let si = 0; si < segments; si += 1) {
      const a0 = (si / segments) * Math.PI * 2;
      const a1 = ((si + 1) / segments) * Math.PI * 2;
      const am = (a0 + a1) * 0.5;
      // Eight rose points, long on the cardinals and short between, each shaded dark and light along
      // its axis like a chart's compass rose.
      const n = Math.round(am / (Math.PI / 4));
      const d = am / (Math.PI / 4) - n;
      const len = n % 2 === 0 ? 6.6 : 4.4;
      const across = rm * Math.sin(Math.abs(d) * (Math.PI / 4));
      let colour: number = course[ri % 2]!;
      if (rm > 1.4 && across < (n % 2 === 0 ? 1.5 : 1.0) * (1 - rm / len)) colour = d < 0 ? rose : roseLight;
      if (ri === rings - 1) colour = rim;
      tint.set(colour);
      const base = positions.length / 3;
      for (const [r, a] of [
        [r0, a0],
        [r0, a1],
        [r1, a1],
        [r1, a0],
      ] as const) {
        const x = cx + Math.cos(a) * r;
        const z = cz + Math.sin(a) * r;
        positions.push(x, heightField.heightAt(x, z) + 0.135, z);
        uvs.push(x * 0.5, z * 0.5);
        colors.push(tint.r, tint.g, tint.b);
      }
      indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }
  return coloredIndexedGeometry(positions, uvs, colors, indices);
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
/** Camera-only blockers gathered while the village builds (VillageSystem.cameraBlockers). */
const cameraBlockers: VillageBoxCollider[] = [];
/**
 * How far shutters, signs and lanterns stand proud of a wall. The walker's own collider keeps your
 * pivot farther out than this, so a façade blocker never holds the pivot (which would switch it off).
 */
const FACADE_DEPTH = 0.35;

function isStreetPavedPoint(x: number, z: number): boolean {
  const b = STREET_REACH;
  if (x < b.minX || x > b.maxX || z < b.minZ || z > b.maxZ) return false;
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

/**
 * Where a street's paving can reach (`streetCoverage` > 0): the routes padded by the widest a street's
 * half can be (2.85 + 0.18 + 0.42 m), and the square out to its curb. Walk queries from anywhere else
 * (the follow camera's, ~1000 a frame) skip the routes.
 */
const STREET_REACH = (() => {
  const pad = 3.5;
  const square = SQUARE.radius + 0.4;
  const c = COVE.village.center;
  const box = { minX: c.x - square, maxX: c.x + square, minZ: c.z - square, maxZ: c.z + square };
  for (const route of STREET_ROUTES)
    for (const [x, z] of route) {
      box.minX = Math.min(box.minX, x - pad);
      box.maxX = Math.max(box.maxX, x + pad);
      box.minZ = Math.min(box.minZ, z - pad);
      box.maxZ = Math.max(box.maxZ, z + pad);
    }
  return box;
})();

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
  // The round square, out to its curb; the lawn beyond it is ground, not paving.
  const plaza = Math.hypot(x - COVE.village.center.x, z - COVE.village.center.z);
  let cover = SQUARE.radius + 0.4 - shrink - plaza;
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
  // laundry line, which now ends on its own post there. The blue stall stands just off the square's
  // south-west curb, its long side along the rim and its front to the fountain, out of the west
  // street's view of the centrepiece; crates of fruit and fish on the counter say what it is.
  const stallAngle = SQUARE.stallAngle;
  const stallR = SQUARE.radius + 2.2;
  const stall = {
    x: COVE.village.center.x + Math.cos(stallAngle) * stallR,
    z: COVE.village.center.z + Math.sin(stallAngle) * stallR,
    rot: Math.PI / 2 - stallAngle,
    cloth: 0x4f9bc0,
  };
  const stalls = [stall];
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
    for (const [lx, produce] of [
      [-1.35, 0xe58a2b],
      [-0.55, 0x8bbf3f],
      [0.3, 0xe9c74a],
      [1.2, 0x9fb7c4],
    ] as const) {
      const p = localToWorld(stall.x, stall.z, stall.rot, lx, -0.12);
      addBox(buckets.wood, p.x, y + 0.94, p.z, 0.68, 0.2, 0.62, stall.rot, 0x8a6440);
      addBox(buckets.cloth, p.x, y + 1.1, p.z, 0.58, 0.08, 0.52, stall.rot, produce);
    }
    perches.push(new Vector3(stall.x, y + 1.88, stall.z));
    colliders.boxes.push({ x: stall.x, z: stall.z, hx: 2.1, hz: 0.75, rot: stall.rot, height: 1.9 });
    // Camera only: the awning's cloth and beams, which reach past the counter at both ends.
    cameraBlockers.push({
      x: stall.x,
      z: stall.z,
      hx: 2.55,
      hz: 1.32,
      rot: stall.rot,
      y0: y + 1.38,
      y1: y + 1.8,
    });
  }
  addNetRack(buckets, -149.7, -57.2, heightField.heightAt(-149.7, -57.2), 0.2);
  // The harbourmaster's notice board that stood here was removed: it had no use and crowded the
  // quay beside Bo's rack and the palette stand. Its anchor (the quay dockhand's patrol) stays.
  colliders.boxes.push({ x: -149.7, z: -57.2, hx: 1.25, hz: 0.25, rot: 0.2, height: 1.8 });
  const front = localToWorld(stall.x, stall.z, stall.rot, 0, -1.9);
  anchors.marketStall = {
    x: front.x,
    y: heightField.heightAt(front.x, front.z),
    z: front.z,
    heading: stall.rot,
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

/**
 * The village's hand-placed palms (`./plantings`): their planters go into the stone bucket, their
 * trunks get colliders, and the tallest crowns become bird perches. The plants themselves render in
 * the vegetation's instanced batches.
 */
function addVillagePlantings(
  buckets: Record<MaterialKey, BufferGeometry[]>,
  colliders: { circles: CircleObstacle[] },
  perches: Vector3[],
  heightField: HeightField,
  tier: TierSettings,
): PlantInstance[] {
  const ground = (x: number, z: number): number => walkable(x, z) ?? heightField.heightAt(x, z);
  const terrain = (x: number, z: number): number => heightField.heightAt(x, z);
  const plants = villagePlantInstances(VILLAGE_PALMS, tier.tier, ground, terrain);
  const maxRank = villagePlantRank(tier.tier);
  for (const spot of VILLAGE_PALMS) {
    if (spot.rank > maxRank) continue;
    const y = ground(spot.x, spot.z);
    if (spot.planter) {
      // A low limestone ring with a paler coping and dark soil, in the stone bucket (no new draws).
      const r = PLANTER.radius;
      const h = PLANTER.height;
      addCylinder(buckets.stone, spot.x, y - 0.05, spot.z, r, r + 0.06, h - 0.02, 14, 0, 0xc4b89f);
      addCylinder(buckets.stone, spot.x, y + h - 0.08, spot.z, r + 0.05, r + 0.05, 0.1, 14, 0, 0xd8cfb9);
      addCylinder(buckets.stone, spot.x, y + h - 0.02, spot.z, r - 0.12, r - 0.12, 0.05, 14, 0, 0x6e5538);
    }
    const r = spot.planter ? PLANTER.radius + 0.08 : PALM_TRUNK_RADIUS * spot.scale;
    colliders.circles.push({ x: spot.x, z: spot.z, r, height: 11 * spot.scale });
  }
  // A few of the tallest crowns become perches (the birds' perch list stays within its cap).
  let crowns = 0;
  for (const p of plants) {
    if (p.species !== 'palmTall' || p.scale < 1.02 || crowns >= 4) continue;
    crowns += 1;
    // The crown sits about 11.6 m up a 12.4 m palm, displaced by its lean.
    const h = 11.6 * p.scale;
    const dx = (p.leanX * Math.cos(p.rotation) + p.leanZ * Math.sin(p.rotation)) * h;
    const dz = (-p.leanX * Math.sin(p.rotation) + p.leanZ * Math.cos(p.rotation)) * h;
    perches.push(new Vector3(p.x + dx, p.y + h, p.z + dz));
  }
  return plants;
}

/**
 * Shrubs and flowering bushes between the buildings (Dan): beds a metre out from each house wall and
 * just off each street's paving, kept off paving, doors, colliders, palms, the mill and the beach.
 * They render in the vegetation's existing shrub, flower, fern and banana batches, without colliders.
 */
function villageShrubs(
  colliders: { circles: CircleObstacle[]; boxes: VillageBoxCollider[] },
  anchors: Record<string, VillageAnchor>,
  palms: readonly PlantInstance[],
  heightField: HeightField,
  tier: TierSettings,
): PlantInstance[] {
  const candidates: ShrubCandidate[] = [];
  const clear = (x: number, z: number): boolean => {
    if (walkable(x, z) !== null || insideAnyBuilding(x, z)) return false;
    if (x > -74 && x < -51 && z > -77 && z < -42) return false;
    const fromCentre = Math.hypot(x - COVE.village.center.x, z - COVE.village.center.z);
    // The lawn ring round the square (out to the old plaza's 16 m) stays open: people cross it.
    if (fromCentre > 52 || fromCentre < 16) return false;
    if (heightField.heightAt(x, z) < 1.2) return false;
    for (const c of colliders.circles) if (Math.hypot(x - c.x, z - c.z) < c.r + 0.7) return false;
    for (const b of colliders.boxes) if (boxClearance(x, z, b) < 0.45) return false;
    for (const a of Object.values(anchors)) if (Math.hypot(x - a.x, z - a.z) < 2.6) return false;
    for (const p of palms) if (Math.hypot(x - p.x, z - p.z) < 1.6) return false;
    return true;
  };
  for (const b of BUILDINGS) {
    const f = buildingFootprint(b);
    const c = Math.cos(b.rot);
    const s = Math.sin(b.rot);
    const hx = f.w * 0.5 + 1.0;
    const hz = f.d * 0.5 + 1.0;
    for (let side = 0; side < 4; side += 1) {
      const along = side % 2 === 0 ? hx : hz;
      const steps = Math.max(2, Math.round((along * 2) / 2.4));
      for (let i = 0; i <= steps; i += 1) {
        const t = -along + (2 * along * i) / steps;
        const lx = side === 0 ? t : side === 1 ? hx : side === 2 ? -t : -hx;
        const lz = side === 0 ? hz : side === 1 ? t : side === 2 ? -hz : -t;
        const x = b.x + lx * c + lz * s;
        const z = b.z - lx * s + lz * c;
        if (clear(x, z)) candidates.push({ x, z, wall: true });
      }
    }
  }
  for (const route of STREET_ROUTES) {
    for (let i = 0; i < route.length - 1; i += 1) {
      const a = route[i]!;
      const b = route[i + 1]!;
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const nx = -(b[1] - a[1]) / len;
      const nz = (b[0] - a[0]) / len;
      for (let d = 1.5; d < len; d += 3.2) {
        const px = a[0] + ((b[0] - a[0]) * d) / len;
        const pz = a[1] + ((b[1] - a[1]) * d) / len;
        const off = streetHalfWidth(px, pz) + 1.15;
        for (const side of [-1, 1]) {
          const x = px + nx * off * side;
          const z = pz + nz * off * side;
          if (clear(x, z)) candidates.push({ x, z, wall: false });
        }
      }
    }
  }
  const picked = pickVillageShrubs(candidates, tier.tier, (x, z) => heightField.heightAt(x, z));
  // The square's planters each hold a flowering bush.
  for (const [i, a] of SQUARE.planters.entries()) {
    const x = COVE.village.center.x + Math.cos(a) * (SQUARE.radius - 1.3);
    const z = COVE.village.center.z + Math.sin(a) * (SQUARE.radius - 1.3);
    picked.push({
      species: 'flowerBush',
      x,
      y: heightField.heightAt(x, z) + 0.55,
      z,
      scale: 1.55,
      rotation: i * 2.1,
      leanX: 0,
      leanZ: 0,
      colorSeed: (i * 0.37) % 1,
      lodSeed: 0.3,
      slopeDeg: 0,
    });
  }
  return picked;
}

/** Distance from a point to a rotated box collider's edge (negative inside). */
function boxClearance(x: number, z: number, b: VillageBoxCollider): number {
  const c = Math.cos(-b.rot);
  const s = Math.sin(-b.rot);
  const dx = x - b.x;
  const dz = z - b.z;
  const lx = Math.abs(dx * c + dz * s) - b.hx;
  const lz = Math.abs(-dx * s + dz * c) - b.hz;
  return lx <= 0 && lz <= 0 ? Math.max(lx, lz) : Math.hypot(Math.max(0, lx), Math.max(0, lz));
}

const LIGHTHOUSE_RED = 0xb3362b;
/** The ridge path's slabs start this far from the tower's axis (past the door step). */
const LIGHTHOUSE_PATH_START = LIGHTHOUSE.plinthR + 1.0;
const LIGHTHOUSE_WHITE = 0xf1ede2;
/** The whitewash inside the tower. */
const LIGHTHOUSE_LIMEWASH = 0xe6dfcd;

/**
 * The point lighthouse (PLAN §4: Anchorage's "little point lighthouse") on the rocky knoll at the
 * harbour's west jaw: a tapered white tower with red bands, a watch room with a door onto a railed
 * gallery, a glazed lantern room and a red dome, about 23 m tall. It's hollow: the door opens on 76
 * stone steps that wind up round an iron newel to the watch room (Dan: walk in and up to the top;
 * see lighthouse-stair.ts). Everything merges into the village's material buckets, so it adds no
 * draws or shader programs. The lit lamp for the Seal is a separate hidden group.
 */
function addLighthouse(
  buckets: Record<MaterialKey, BufferGeometry[]>,
  colliders: { circles: CircleObstacle[]; boxes: VillageBoxCollider[] },
  shipObstacles: CircleObstacle[],
  anchors: Record<string, VillageAnchor>,
  perches: Vector3[],
  heightField: HeightField,
  low: boolean,
): void {
  const L = COVE.lighthouse;
  const T = LIGHTHOUSE;
  const { x, z } = L;
  const base = L.top;
  const hd = LIGHTHOUSE_DOOR_HEADING;
  const seg = low ? 16 : 24;
  const fx = Math.sin(hd);
  const fz = Math.cos(hd);
  const floor = base + T.plinth;
  const g = base + LIGHTHOUSE_GALLERY;
  const deck = base + LIGHTHOUSE_DECK;
  const lan = base + LIGHTHOUSE_LANTERN;
  const doorH = 2.3;
  const at = (a: number, r: number) => ({ x: x + Math.sin(a) * r, z: z + Math.cos(a) * r });
  // The stair winding over the ground floor, for the camera: from the underside of the lowest step
  // over the door landing up. Below that the follow camera fits behind you just inside the door
  // (the steps under it keep it up through the walk surface, see follow-camera's `blocked`).
  cameraBlockers.push({
    x,
    z,
    hx: T.inner,
    hz: T.inner,
    rot: 0,
    y0: treadTop(FLOOR_LANDING_FROM) - LIGHTHOUSE_TREAD_DEPTH,
    y1: deck,
  });
  // The wall over the door (its passage has no collider above the lintel).
  const doorMid = (T.inner + T.plinthR) * 0.5;
  cameraBlockers.push({
    x: x + fx * doorMid,
    z: z + fz * doorMid,
    hx: T.doorHalf,
    hz: (T.plinthR - T.inner) * 0.5,
    rot: hd,
    y0: floor + doorH,
    y1: deck - 0.4,
  });

  // Plinth and a ring of flagstones on the knoll top. The plinth's top is the ground floor.
  addCylinder(buckets.stone, x, base - 0.7, z, 3.0, 3.35, 1.4, 12, Math.PI / 12, 0x9a9180);
  addCylinder(
    buckets.stone,
    x,
    base + 0.7,
    z,
    T.plinthR - 0.02,
    T.plinthR - 0.02,
    0.14,
    12,
    Math.PI / 12,
    0xb9b09b,
  );
  const flags = low ? 10 : 16;
  for (let i = 0; i < flags; i += 1) {
    const a = (i / flags) * Math.PI * 2 + 0.1;
    const fxp = x + Math.cos(a) * 4.05;
    const fzp = z + Math.sin(a) * 4.05;
    const fy = heightField.heightAt(fxp, fzp) - 0.08;
    addBox(buckets.paving, fxp, fy, fzp, 1.35, 0.16, 1.05, -a, i % 2 ? 0xb3a68a : 0xc2b597);
  }

  // The tower: six tapered bands, white at the foot and red under the gallery, open inside. The foot
  // band leaves the doorway open.
  const bands = [3.0, 2.4, 2.4, 2.4, 2.4, 2.4];
  let y = floor;
  const radiusAt = (h: number) => T.rBottom + (T.rTop - T.rBottom) * ((h - floor) / T.height);
  const doorGap = Math.asin((T.doorHalf + 0.02) / T.rBottom);
  bands.forEach((h, i) => {
    const tint = i % 2 ? LIGHTHOUSE_RED : LIGHTHOUSE_WHITE;
    if (i === 0) {
      addShell(buckets.plaster, x, y, z, radiusAt(y + doorH), radiusAt(y), doorH, seg, tint, hd, doorGap);
      addShell(buckets.plaster, x, y + doorH, z, radiusAt(y + h), radiusAt(y + doorH), h - doorH, seg, tint);
    } else addShell(buckets.plaster, x, y, z, radiusAt(y + h), radiusAt(y), h, seg, tint);
    y += h;
  });
  // The limewashed shaft inside, open at the door.
  const innerGap = Math.asin((T.doorHalf + 0.02) / T.inner);
  const shaftR = T.inner + 0.02;
  addShell(buckets.plaster, x, floor, z, shaftR, shaftR, doorH, seg, LIGHTHOUSE_LIMEWASH, hd, innerGap);
  addShell(buckets.plaster, x, floor + doorH, z, shaftR, shaftR, g - floor - doorH, seg, LIGHTHOUSE_LIMEWASH);
  // The doorway through the wall: its reveals, lintel, a stone frame, the door swung back against
  // the tower, and a step down to the knoll.
  const depth = T.rBottom - T.inner;
  const mid = (T.rBottom + T.inner) * 0.5;
  for (const side of [-1, 1]) {
    const p = localToWorld(x, z, hd, side * (T.doorHalf + 0.06), mid);
    addBox(buckets.plaster, p.x, floor, p.z, 0.12, doorH, depth + 0.06, hd, LIGHTHOUSE_LIMEWASH);
    const f = localToWorld(x, z, hd, side * (T.doorHalf + 0.14), T.rBottom + 0.02);
    addBox(buckets.stone, f.x, floor - 0.05, f.z, 0.24, doorH + 0.2, 0.22, hd, 0xc2b8a2);
  }
  const lintel = localToWorld(x, z, hd, 0, mid);
  addBox(
    buckets.plaster,
    lintel.x,
    floor + doorH - 0.02,
    lintel.z,
    T.doorHalf * 2 + 0.2,
    0.14,
    depth + 0.06,
    hd,
    LIGHTHOUSE_LIMEWASH,
  );
  const head = localToWorld(x, z, hd, 0, T.rBottom + 0.02);
  addBox(buckets.stone, head.x, floor + doorH + 0.1, head.z, T.doorHalf * 2 + 0.52, 0.24, 0.24, hd, 0xc2b8a2);
  const leaf = localToWorld(x, z, hd, T.doorHalf + 0.62, Math.sqrt(T.rBottom ** 2 - 1.2 ** 2) + 0.14);
  addBox(buckets.wood, leaf.x, floor, leaf.z, 1.05, 2.15, 0.12, hd + 0.5, 0x5b3920);
  const step = localToWorld(x, z, hd, 0, T.plinthR + 0.4);
  addBox(buckets.stone, step.x, base - 0.3, step.z, T.doorHalf * 2 + 0.5, 0.72, 0.8, hd, 0xb0a792);

  // Small deep-set windows up the stair, with a pale reveal inside.
  for (const [h, da] of [
    [5.2, 1.7],
    [8.9, -0.9],
    [12.3, 2.6],
  ] as const) {
    const wy = floor + h;
    const r = radiusAt(wy + 0.4) - 0.04;
    const a = hd + da;
    addBox(buckets.wood, x + Math.sin(a) * r, wy, z + Math.cos(a) * r, 0.5, 0.85, 0.2, a, 0x2a2522);
    addBox(
      buckets.stone,
      x + Math.sin(a) * (r + 0.06),
      wy - 0.1,
      z + Math.cos(a) * (r + 0.06),
      0.7,
      0.1,
      0.24,
      a,
      0xd8d1c0,
    );
    const w = at(a, T.inner - 0.01);
    addBox(buckets.plaster, w.x, wy, w.z, 0.46, 0.8, 0.06, a, 0xcfe0e8);
  }

  // The stair: 76 stone steps round an iron newel. The first turn's low steps are solid to the floor;
  // above that each is a slab let into the wall.
  const stepSeg = low ? 2 : 3;
  for (let n = 0; n < T.treads; n += 1) {
    const a0 = STAIR_START + n * TREAD_ANGLE;
    const top = treadTop(n);
    const bottom = n < FLOOR_LANDING_FROM ? floor : top - LIGHTHOUSE_TREAD_DEPTH;
    buckets.stone.push(
      wedgeGeometry(
        x,
        z,
        a0,
        a0 + TREAD_ANGLE * 1.02,
        T.newel,
        T.inner + 0.03,
        bottom,
        top,
        stepSeg,
        n % 2 ? 0xa59b86 : 0xb3a991,
      ),
    );
  }
  addCylinder(buckets.metal, x, floor, z, T.newel, T.newel + 0.04, deck - floor + 0.9, 10, 0, 0x34312d);
  // The watch room's floor, over the turn below; the rest is the stairwell, railed along its edge.
  const wf0 = STAIR_START + WATCH_FLOOR[0] * TREAD_ANGLE;
  const wf1 = STAIR_START + WATCH_FLOOR[1] * TREAD_ANGLE;
  buckets.wood.push(
    wedgeGeometry(x, z, wf0, wf1, T.newel, T.inner + 0.03, deck - 0.14, deck, low ? 4 : 8, 0x7a5634),
  );
  const railA = wf1;
  const rail = at(railA, (T.newel + T.inner) * 0.5);
  addBox(buckets.metal, rail.x, deck + 0.95, rail.z, 0.05, 0.05, T.inner - T.newel, railA, 0x2b2e30);
  const railPost = at(railA, T.inner - 0.1);
  addBox(buckets.metal, railPost.x, deck, railPost.z, 0.05, 1.0, 0.05, railA, 0x2b2e30);
  // Lanterns up the stair (they glow at night).
  for (const h of [2.6, 7.4, 12.2]) {
    const a = STAIR_START + ((h / T.rise - 1) / T.perTurn) * Math.PI * 2 + TREAD_ANGLE * 0.5;
    const p = at(a, T.inner - 0.16);
    addLanternFixture(buckets, p.x, floor + h + 1.7, p.z, a, 0.8);
  }

  // Gallery: a flared corbel (tall enough to carry the wide deck), the deck (a ring, open over the
  // stair) and a two-rail railing.
  addRing(
    buckets.plaster,
    x,
    g - 1.1,
    z,
    T.inner + 0.02,
    T.rTop,
    T.galleryR - 0.25,
    1.1,
    seg,
    LIGHTHOUSE_WHITE,
  );
  addRing(buckets.metal, x, g, z, T.inner + 0.02, T.galleryR, T.galleryR, 0.2, seg, 0x2e2c2a);
  addTorus(buckets.metal, x, deck + 0.9, z, T.railR, 0.05, seg + 8, 0x2b2e30, Math.PI / 2, 0, 0);
  if (!low) addTorus(buckets.metal, x, deck + 0.42, z, T.railR, 0.03, seg + 8, 0x2b2e30, Math.PI / 2, 0, 0);
  const posts = low ? 12 : 20;
  for (let i = 0; i < posts; i += 1) {
    const a = (i / posts) * Math.PI * 2;
    addCylinder(
      buckets.metal,
      x + Math.cos(a) * T.railR,
      deck,
      z + Math.sin(a) * T.railR,
      0.04,
      0.04,
      0.92,
      6,
      0,
      0x2b2e30,
    );
  }

  // The watch room: a white drum on the deck with a door out to the gallery.
  const watchGap = Math.asin((T.doorHalf + 0.02) / T.watchR);
  const wd = WATCH_DOOR_HEADING;
  const watchDoorH = 2.05;
  addShell(buckets.plaster, x, deck, z, T.watchR, T.watchR, watchDoorH, seg, LIGHTHOUSE_WHITE, wd, watchGap);
  addShell(
    buckets.plaster,
    x,
    deck + watchDoorH,
    z,
    T.watchR,
    T.watchR,
    T.watchH - watchDoorH,
    seg,
    LIGHTHOUSE_WHITE,
  );
  addShell(
    buckets.plaster,
    x,
    deck,
    z,
    T.inner + 0.02,
    T.inner + 0.02,
    watchDoorH,
    seg,
    LIGHTHOUSE_LIMEWASH,
    wd,
    innerGap,
  );
  addShell(
    buckets.plaster,
    x,
    deck + watchDoorH,
    z,
    T.inner + 0.02,
    T.inner + 0.02,
    T.watchH - watchDoorH,
    seg,
    LIGHTHOUSE_LIMEWASH,
  );
  for (const side of [-1, 1]) {
    const p = localToWorld(x, z, wd, side * (T.doorHalf + 0.05), (T.watchR + T.inner) * 0.5);
    addBox(buckets.metal, p.x, deck, p.z, 0.1, watchDoorH, T.watchR - T.inner + 0.06, wd, 0x2b2e30);
  }
  const watchHead = localToWorld(x, z, wd, 0, (T.watchR + T.inner) * 0.5);
  addBox(
    buckets.metal,
    watchHead.x,
    deck + watchDoorH - 0.06,
    watchHead.z,
    T.doorHalf * 2 + 0.2,
    0.12,
    T.watchR - T.inner + 0.06,
    wd,
    0x2b2e30,
  );
  addCylinder(buckets.metal, x, lan - 0.18, z, T.watchR + 0.12, T.watchR + 0.12, 0.18, seg, 0, 0x2b2e30);

  // Lantern room: a red wall, the glazing (dark by day, warm at night), glazing bars, and the dome.
  addCylinder(buckets.plaster, x, lan, z, 1.52, 1.58, 0.75, 16, 0, LIGHTHOUSE_RED);
  addCylinder(buckets.glow, x, lan + 0.75, z, 1.38, 1.38, 1.9, 16, 0, 0xffd28a);
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 16;
    addBox(
      buckets.metal,
      x + Math.cos(a) * 1.41,
      lan + 0.75,
      z + Math.sin(a) * 1.41,
      0.08,
      1.9,
      0.08,
      -a,
      0x23272a,
    );
  }
  addCylinder(buckets.metal, x, lan + 2.65, z, 1.64, 1.6, 0.18, 16, 0, 0x2b2e30);
  const dome = new SphereGeometry(1.62, 16, 6, 0, Math.PI * 2, 0, Math.PI / 2);
  transform(dome, x, lan + 2.8, z, 0, 0, 0, 1, 0.82, 1);
  paint(dome, 0x9b2c22);
  buckets.metal.push(dome);
  addCylinder(buckets.metal, x, lan + 4.0, z, 0.2, 0.3, 0.42, 8, 0, 0x7f241c);
  const ball = new SphereGeometry(0.2, 8, 6);
  transform(ball, x, lan + 4.62, z, 0, 0, 0, 1, 1, 1);
  paint(ball, 0x2b2e30);
  buckets.metal.push(ball);
  addCylinder(buckets.metal, x, lan + 4.75, z, 0.025, 0.035, 0.9, 4, 0, 0x2b2e30);

  // The ridge path: stepping slabs from the quay's west end up to the door step.
  const ex = L.neck.x - x;
  const ez = L.neck.z - z;
  const len = Math.hypot(ex, ez);
  const pathRot = Math.atan2(ex, ez);
  const steps = Math.floor((len - LIGHTHOUSE_PATH_START - 1) / 1.15);
  for (let i = 0; i <= steps; i += 1) {
    const d = LIGHTHOUSE_PATH_START + i * 1.15;
    const jitter = organicNoise(i * 3.1, 7.7);
    const px = x + (ex / len) * d + Math.cos(pathRot) * jitter * 0.18;
    const pz = z + (ez / len) * d - Math.sin(pathRot) * jitter * 0.18;
    const py = heightField.heightAt(px, pz) - 0.07;
    addBox(
      buckets.paving,
      px,
      py,
      pz,
      1.35 + jitter * 0.15,
      0.15,
      0.78,
      pathRot + jitter * 0.12,
      i % 3 ? 0xb3a68a : 0xc2b597,
    );
  }

  addLighthouseColliders(colliders, floor, deck, lan);
  shipObstacles.push({ x, z, r: 12.5 });
  for (const t of [0.3, 0.55, 0.8]) shipObstacles.push({ x: x + ex * t, z: z + ez * t, r: 6.5 });

  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * Math.PI * 2 + 0.2;
    perches.push(new Vector3(x + Math.cos(a) * T.railR, deck + 0.96, z + Math.sin(a) * T.railR));
  }
  perches.push(new Vector3(x, lan + 4.85, z));

  const doorOut = T.plinthR + 1.1;
  anchors.lighthouseDoor = { x: x + fx * doorOut, y: base, z: z + fz * doorOut, heading: hd };
  // The lookout keeps watch from the gallery, on the seaward side, at the railing looking out to
  // sea, so you can pass between him and the watch room on your way round.
  const watch = -2.35;
  const look = T.railR - 0.4;
  anchors.lookout = { x: x + Math.sin(watch) * look, y: deck, z: z + Math.cos(watch) * look, heading: watch };
}

/**
 * The tower's walls as colliders that span only their heights, so you can walk the gallery above
 * the shaft walls and climb inside them: the shaft's wall out to the plinth's edge (open at the
 * door), the watch room's wall (open at its door), the gallery railing, and a rail along the
 * stairwell's edge in the watch room. The newel blocks at every height.
 */
function addLighthouseColliders(
  colliders: { circles: CircleObstacle[]; boxes: VillageBoxCollider[] },
  floor: number,
  deck: number,
  lan: number,
): void {
  const L = COVE.lighthouse;
  const T = LIGHTHOUSE;
  const ring = (
    r0: number,
    r1: number,
    n: number,
    y0: number,
    y1: number,
    door: number | null,
    half: number,
  ) => {
    const rc = (r0 + r1) * 0.5;
    const hz = r1 * Math.tan(Math.PI / n) + 0.02;
    for (let i = 0; i < n; i += 1) {
      const a = (i / n) * Math.PI * 2;
      if (door !== null && Math.abs(wrapAngle(a - door)) < half) continue;
      colliders.boxes.push({
        x: L.x + Math.sin(a) * rc,
        z: L.z + Math.cos(a) * rc,
        hx: hz,
        hz: (r1 - r0) * 0.5,
        rot: a,
        height: y1 - L.top,
        y0,
        y1,
      });
    }
  };
  const segA = (Math.PI * 2) / 24;
  // The shaft wall, from the knoll to just under the deck. Its door is a corridor between two jambs.
  const doorA = Math.asin(T.doorHalf / T.inner) + segA * 0.5;
  ring(T.inner, T.plinthR, 24, L.top - 3, deck - 0.4, LIGHTHOUSE_DOOR_HEADING, doorA);
  const reach = T.plinthR * Math.sin(doorA + segA * 0.5) + 0.1;
  for (const side of [-1, 1]) {
    const lateral = (T.doorHalf + reach) * 0.5;
    const axial0 = Math.sqrt(T.inner ** 2 - T.doorHalf ** 2);
    const p = localToWorld(L.x, L.z, LIGHTHOUSE_DOOR_HEADING, side * lateral, (axial0 + T.plinthR) * 0.5);
    colliders.boxes.push({
      x: p.x,
      z: p.z,
      hx: (reach - T.doorHalf) * 0.5,
      hz: (T.plinthR - axial0) * 0.5,
      rot: LIGHTHOUSE_DOOR_HEADING,
      height: deck - 0.4 - L.top,
      y0: L.top - 3,
      y1: deck - 0.4,
    });
  }
  // The watch room's wall, with its door, from the deck up to the lantern.
  ring(
    T.inner,
    T.watchR,
    24,
    deck - 0.4,
    lan,
    WATCH_DOOR_HEADING,
    Math.asin(T.doorHalf / T.inner) + segA * 0.5,
  );
  // The gallery railing (up to its top rail, so the camera can swing out over it).
  ring(T.railR - 0.06, T.railR + 0.14, 32, deck - 0.4, deck + 0.95, null, 0);
  // The rail along the stairwell's edge in the watch room.
  const railA = STAIR_START + WATCH_FLOOR[1] * TREAD_ANGLE;
  const rm = (T.newel + T.inner) * 0.5;
  colliders.boxes.push({
    x: L.x + Math.sin(railA) * rm,
    z: L.z + Math.cos(railA) * rm,
    hx: 0.05,
    hz: (T.inner - T.newel) * 0.5,
    rot: railA,
    height: deck + 1 - L.top,
    y0: deck - 0.3,
    y1: deck + 2,
  });
  colliders.circles.push({ x: L.x, z: L.z, r: T.newel + 0.02, y0: floor - 1, y1: deck + 2 });
}

/**
 * The lamp the Seal lights (PLAN §3): a warm glow inside the glazing and a soft halo billboard,
 * hidden until `setLighthouseLit(true)`. The materials match Port Meridian's, so both lamps share
 * two shader programs. The halo keeps its depth test and is held in front of the lantern each frame
 * (`updateLighthouseLamp`), so the hill and the houses still hide it.
 */
function createLighthouseLamp(): Group {
  const L = COVE.lighthouse;
  // The old lamp heights were set from the deck; the lantern now stands on the watch room.
  const g = L.top + LIGHTHOUSE_LANTERN - 0.2;
  const group = new Group();
  group.name = 'anchorage-lighthouse-lamp';
  group.visible = false;
  const glow = new Mesh(
    mergeGeometries([
      litGeometry(new CylinderGeometry(1.24, 1.24, 1.55, 16), L.x, g + 1.1, L.z, 1, 1, 1, 0xfff1a6),
      litGeometry(new SphereGeometry(1, 16, 8), L.x, g + 1.9, L.z, 1.2, 0.7, 1.2, 0xfff4b0),
    ])!,
    createLighthouseLitMaterial('anchorage-lighthouse-lit-material'),
  );
  glow.name = 'anchorage-lighthouse-lit';
  const halo = new Mesh(
    new CircleGeometry(2.6, 32),
    createLighthouseHaloMaterial('anchorage-lighthouse-halo-material', true),
  );
  halo.name = 'anchorage-lighthouse-halo';
  halo.position.set(L.x, g + 1.9, L.z);
  group.add(glow, halo);
  return group;
}

function litGeometry(
  geometry: BufferGeometry,
  x: number,
  y: number,
  z: number,
  sx: number,
  sy: number,
  sz: number,
  colour: number,
): BufferGeometry {
  transform(geometry, x, y + (geometry.type === 'CylinderGeometry' ? 0.775 : 0), z, 0, 0, 0, sx, sy, sz);
  const n = geometry.getAttribute('position').count;
  const c = new Color(colour);
  const colors = new Float32Array(n * 3);
  for (let i = 0; i < n; i += 1) colors.set([c.r, c.g, c.b], i * 3);
  geometry.setAttribute('color', new BufferAttribute(colors, 3));
  geometry.deleteAttribute('uv');
  return geometry;
}

const lampToCamera = new Vector3();
function updateLighthouseLamp(lamp: Group, camera: Camera): void {
  if (!lamp.visible) return;
  const halo = lamp.children[1]!;
  const L = COVE.lighthouse;
  const y = L.top + LIGHTHOUSE_LANTERN + 1.7;
  lampToCamera.set(camera.position.x - L.x, 0, camera.position.z - L.z);
  const d = lampToCamera.length() || 1;
  halo.position.set(L.x + (lampToCamera.x / d) * 1.9, y, L.z + (lampToCamera.z / d) * 1.9);
  halo.quaternion.copy(camera.quaternion);
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
    addLampHeadBlocker(x, y, z, side);
  }
}

/** The lamp's arm, brace and lantern, for the camera (the post's circle stops at the post). */
function addLampHeadBlocker(x: number, y: number, z: number, side: -1 | 1): void {
  cameraBlockers.push({ x: x + side * 0.55, z, hx: 0.6, hz: 0.22, rot: 0, y0: y + 1.65, y1: y + 2.5 });
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
  // A diagonal brace from the post up to the underside of the arm (it meets both).
  addBox(buckets.metal, x + side * 0.27, y + 2.03, z, 0.5, 0.05, 0.05, 0, 0x6c6258, 0, side * 0.62);
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
      // The sacks' woven cloth: an instanced rope look of their own was one more shader.
      materials.cloth,
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
  const mesh = sharedInstancedMesh(geometry, material, Math.max(1, instances.length));
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

/**
 * An open-ended tapered tube (a hollow tower's shell), seen from both sides. With `gapAt` it leaves
 * an opening `gapHalf` either side of that heading (a doorway).
 */
function addShell(
  target: BufferGeometry[],
  x: number,
  y: number,
  z: number,
  rTop: number,
  rBottom: number,
  h: number,
  segments: number,
  colour: number,
  gapAt = 0,
  gapHalf = 0,
): void {
  const geometry = new CylinderGeometry(
    rTop,
    rBottom,
    h,
    segments,
    1,
    true,
    gapAt + gapHalf,
    Math.PI * 2 - gapHalf * 2,
  );
  transform(geometry, x, y + h * 0.5, z, 0, 0, 0, 1, 1, 1);
  paint(geometry, colour);
  target.push(geometry);
}

/** A flat ring in the XY plane facing +z (RingGeometry's layout, without pulling it into vendor-three). */
function flatRing(rInner: number, rOuter: number, segments: number): BufferGeometry {
  const n = segments + 1;
  const pos = new Float32Array(n * 2 * 3);
  const normal = new Float32Array(n * 2 * 3);
  const uv = new Float32Array(n * 2 * 2);
  for (let i = 0; i < n; i += 1) {
    const a = (i / segments) * Math.PI * 2;
    const c = Math.cos(a);
    const s = Math.sin(a);
    for (let k = 0; k < 2; k += 1) {
      const r = k === 0 ? rInner : rOuter;
      const v = i * 2 + k;
      pos.set([c * r, s * r, 0], v * 3);
      normal[v * 3 + 2] = 1;
      uv.set([(c * r) / rOuter / 2 + 0.5, (s * r) / rOuter / 2 + 0.5], v * 2);
    }
  }
  const index: number[] = [];
  for (let i = 0; i < segments; i += 1) {
    const a = i * 2;
    index.push(a, a + 1, a + 3, a, a + 3, a + 2);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(pos, 3));
  geometry.setAttribute('normal', new BufferAttribute(normal, 3));
  geometry.setAttribute('uv', new BufferAttribute(uv, 2));
  geometry.setIndex(index);
  return geometry;
}

/** A flat ring with walls (a gallery deck, a corbel): `rInner` straight, the outside flaring from `rBottom` to `rTop`. */
function addRing(
  target: BufferGeometry[],
  x: number,
  y: number,
  z: number,
  rInner: number,
  rBottom: number,
  rTop: number,
  h: number,
  segments: number,
  colour: number,
): void {
  const top = flatRing(rInner, rTop, segments);
  transform(top, x, y + h, z, 0, -Math.PI / 2, 0, 1, 1, 1);
  const bottom = flatRing(rInner, rBottom, segments);
  transform(bottom, x, y, z, 0, Math.PI / 2, 0, 1, 1, 1);
  for (const g of [top, bottom]) {
    paint(g, colour);
    target.push(g);
  }
  addShell(target, x, y, z, rTop, rBottom, h, segments, colour);
  addShell(target, x, y, z, rInner, rInner, h, segments, colour);
}

/**
 * A stair step: a wedge between headings `a0` and `a1` (radians, (sin a, cos a)) from radius `r0`
 * to `r1`, its top at `yTop` and its underside at `yBottom`, with flat faces.
 */
function wedgeGeometry(
  cx: number,
  cz: number,
  a0: number,
  a1: number,
  r0: number,
  r1: number,
  yBottom: number,
  yTop: number,
  arcs: number,
  colour: number,
): BufferGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const tint = new Color(colour);
  const vertex = (a: number, r: number, y: number): number => {
    const px = cx + Math.sin(a) * r;
    const pz = cz + Math.cos(a) * r;
    positions.push(px, y, pz);
    uvs.push(px * 0.5 + y * 0.3, pz * 0.5 + y * 0.3);
    colors.push(tint.r, tint.g, tint.b);
    return positions.length / 3 - 1;
  };
  // A quad strip face from two rows of points; `flip` picks the winding so it faces out.
  const face = (rows: [number, number, number][][], flip: boolean) => {
    const a = rows[0]!.map(([ang, r, y]) => vertex(ang, r, y));
    const b = rows[1]!.map(([ang, r, y]) => vertex(ang, r, y));
    for (let i = 0; i < a.length - 1; i += 1) {
      if (flip) indices.push(a[i]!, a[i + 1]!, b[i]!, b[i]!, a[i + 1]!, b[i + 1]!);
      else indices.push(a[i]!, b[i]!, a[i + 1]!, b[i]!, b[i + 1]!, a[i + 1]!);
    }
  };
  const arc = (r: number, y: number): [number, number, number][] =>
    Array.from({ length: arcs + 1 }, (_v, i) => [a0 + ((a1 - a0) * i) / arcs, r, y]);
  face([arc(r0, yTop), arc(r1, yTop)], false);
  face([arc(r0, yBottom), arc(r1, yBottom)], true);
  face([arc(r1, yBottom), arc(r1, yTop)], false);
  face([arc(r0, yBottom), arc(r0, yTop)], true);
  face(
    [
      [
        [a0, r0, yBottom],
        [a0, r1, yBottom],
      ],
      [
        [a0, r0, yTop],
        [a0, r1, yTop],
      ],
    ],
    false,
  );
  face(
    [
      [
        [a1, r0, yBottom],
        [a1, r1, yBottom],
      ],
      [
        [a1, r0, yTop],
        [a1, r1, yTop],
      ],
    ],
    true,
  );
  return coloredIndexedGeometry(positions, uvs, colors, indices);
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

function triangleCount(geometry: BufferGeometry): number {
  return geometry.index ? geometry.index.count / 3 : geometry.getAttribute('position').count / 3;
}
