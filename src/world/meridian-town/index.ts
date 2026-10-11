import {
  BufferAttribute,
  BufferGeometry,
  Camera,
  CircleGeometry,
  ConeGeometry,
  Group,
  Mesh,
  Object3D,
  SphereGeometry,
  TorusGeometry,
  Vector3,
  type Material,
} from 'three/webgpu';
import type { TierSettings } from '../../engine/quality';
import type { CircleObstacle, HeightField, Tier } from '../contracts';
import { box as geoBox, cylinder as geoCylinder, merge, tubeBetween, worldUv } from '../sites/geo';
import { MERIDIAN, meridianQuayHeight } from '../islands/meridian';
import {
  APRICOT,
  CREAM,
  HARBOUR_FRONT_ROW,
  LIMESTONE_LIGHT,
  OCHRE,
  MEDITERRANEAN_TINTS,
  ROOF_TINTS,
  ROSE,
  TERRACE_ROWS,
  TERRACOTTA,
  TERRACOTTA_DARK,
  TERRACOTTA_WARM,
  WHITEWASH,
  rowGapContaining,
  terraceHasBackRow,
  terraceRun,
  type TerraceRowSpec,
} from './terraces';
import { createLighthouseHaloMaterial, createLighthouseLitMaterial } from '../lighthouse-lamp';
import {
  localToWorld,
  makeBuckets,
  paint,
  transform,
  type MaterialKey,
  type VillageAnchor,
  type VillageBoxCollider,
  type VillageKit,
} from '../village/kit';
import { segmentDistance } from '../../util/math';

type HouseSide = 'front' | 'back' | 'left' | 'right';
type HouseRoof = 'gable' | 'tower' | 'flat';
type HouseFootprint = { w: 4 | 6 | 8; d: 4 | 6 | 8 };
interface StairSpan {
  x: number;
  y: number;
  z: number;
  heading: number;
}

export interface MeridianAnchor extends VillageAnchor {
  tx?: number;
  ty?: number;
  tz?: number;
}

export interface MeridianTownMetrics {
  staticDraws: number;
  propDraws: number;
  drawCalls: number;
  staticTriangles: number;
  propTriangles: number;
  triangles: number;
  buildingCount: number;
  colliderCount: number;
  shipObstacleCount: number;
}

export interface MeridianTownSystem {
  group: Group;
  colliders: { circles: CircleObstacle[]; boxes: VillageBoxCollider[] };
  /**
   * Boxes only the follow camera keeps out of (wall tops, the lift house), each with a span: the
   * player walks through or past them, so they aren't in `colliders`.
   */
  cameraBlockers: VillageBoxCollider[];
  shipObstacles: CircleObstacle[];
  walkable(x: number, z: number): number | null;
  anchors: Record<string, MeridianAnchor>;
  metrics: MeridianTownMetrics;
  setLighthouseLit(on: boolean): void;
  setMooringLines(on: boolean): void;
  setLiftCar(t: number): void;
  update(dt: number, t: number, camera: Camera): void;
  dispose(): void;
}

export interface CreateMeridianTownOptions {
  tier: TierSettings;
  heightField: HeightField;
  kit: VillageKit;
}

type Buckets = Record<MaterialKey, BufferGeometry[]>;
/** `camera`: camera-only blockers (see MeridianTownSystem.cameraBlockers). */
type ColliderSet = { circles: CircleObstacle[]; boxes: VillageBoxCollider[]; camera?: VillageBoxCollider[] };

type BasicAnchor = {
  x: number;
  y?: number;
  z: number;
  heading: number;
  tx?: number;
  ty?: number;
  tz?: number;
};

const DEG = Math.PI / 180;
const LIMESTONE_DARK = 0x91704c;
const DEEP_BLUE = 0x174b75;
const DEEP_GREEN = 0x1f5c43;
const CYPRESS = 0x173f26;
const OLIVE = 0x6f814c;
const OLIVE_SILVER = 0x9aa876;
const BOUGAINVILLEA = 0xb01377;
/** The share of houses with bougainvillea over the door (set per tier as the town builds). */
let vineShare = 0.2;
const DARK_WOOD = 0x3c281a;
const METAL = 0x2d302d;
const CLOTH_BLUE = 0x185e83;
const CLOTH_GREEN = 0x2e7c59;
const CLOTH_RED = 0xa73a31;
const CLOTH_GOLD = 0xd79b37;
const PAPER = 0xe9d5a0;

const STAIR_STREET = {
  x: 668,
  z0: MERIDIAN.harbor.quay.z0,
  z1: MERIDIAN.pads.plaza.z,
  width: 8.8,
  steps: 12,
} as const;

const TAVERN_LANE = {
  x: 622,
  z0: MERIDIAN.harbor.quay.z0,
  z1: MERIDIAN.pads.tavern.z + 7,
  width: 5.2,
} as const;

const SHIPYARD_APRON = { x0: 570, x1: 612, z0: -775, z1: -735, height: MERIDIAN.harbor.quay.height } as const;
const MOLE_CONNECTOR = { x0: 572, x1: 592, z0: -735, z1: -706, height: MERIDIAN.mole.height } as const;
const PLAZA = { x0: 638, x1: 698, z0: -819, z1: -780, height: MERIDIAN.pads.plaza.height } as const;
const TAVERN_PAD = { x0: 607, x1: 637, z0: -813, z1: -779, height: MERIDIAN.pads.tavern.height } as const;
const CITADEL = { x: MERIDIAN.pads.citadel.x, z: MERIDIAN.pads.citadel.z, r: 39, height: 40 } as const;
/** The Hall of Records on the citadel, raised on a stone podium with a paved portico in front. */
const HALL_OF_RECORDS = { x: 809.3, z: -778.0 } as const;
const LIFT_BOTTOM = { x: 770.3, z: -766.8, y: MERIDIAN.harbor.quay.height } as const;
const LIFT_TOP = { x: 798.2, z: -779.2, y: 40.35 } as const;

interface TerraceStairStreet {
  x: number;
  z0: number;
  z1: number;
  y0: number;
  y1: number;
  width: number;
  steps: number;
}

const TERRACE_STAIR_STREETS: readonly TerraceStairStreet[] = [
  { x: 610, z0: -840, z1: -938, y0: 10.8, y1: 25.0, width: 4.4, steps: 25 },
  { x: 668, z0: -851, z1: -938, y0: 10.8, y1: 25.0, width: 4.2, steps: 22 },
  { x: 732, z0: -840, z1: -958, y0: 10.8, y1: 28.6, width: 4.4, steps: 30 },
  { x: 786, z0: -852, z1: -958, y0: 10.8, y1: 28.6, width: 4.2, steps: 27 },
] as const;

export function createMeridianTown(options: CreateMeridianTownOptions): MeridianTownSystem {
  const steps = buildMeridianTown(options);
  for (;;) {
    const r = steps.next();
    if (r.done) return r.value;
  }
}

/** The same town, a district at a time: `breathe` runs between steps (keeps the frame moving). */
export async function createMeridianTownAsync(
  options: CreateMeridianTownOptions,
  breathe: () => Promise<void>,
): Promise<MeridianTownSystem> {
  const steps = buildMeridianTown(options);
  for (;;) {
    const r = steps.next();
    if (r.done) return r.value;
    await breathe();
  }
}

function* buildMeridianTown({
  tier,
  heightField,
  kit,
}: CreateMeridianTownOptions): Generator<void, MeridianTownSystem, void> {
  const group = new Group();
  group.name = 'port-meridian-town';

  const buckets = makeBuckets();
  const colliders: ColliderSet = { circles: [], boxes: [], camera: [] };
  const shipObstacles: CircleObstacle[] = [];
  const anchors: Record<string, MeridianAnchor> = {};
  const perches: Vector3[] = [];
  const stairSpans: StairSpan[] = [];
  const low = tier.tier === 'lite' || tier.tier === 'low';
  const mediumUp = tier.tier !== 'lite' && tier.tier !== 'low';
  const high = tier.tier === 'high' || tier.tier === 'ultra';
  vineShare = high ? 0.38 : mediumUp ? 0.26 : 0.12;
  const liftCar = new Group();
  liftCar.name = 'meridian-lift-car';
  const lighthouseGlow = new Group();
  lighthouseGlow.name = 'meridian-lighthouse-glow';
  lighthouseGlow.visible = false;
  const mooringLines = createMooringLines(kit.materials);

  const townWalkable = (x: number, z: number): number | null => {
    for (const span of stairSpans) {
      const h = stairsHeightAt(span, x, z);
      if (h !== null) return h;
    }
    const stair = stairStreetHeight(x, z);
    if (stair !== null) return stair;
    const terraceStair = terraceStairHeight(x, z);
    if (terraceStair !== null) return terraceStair;
    const terraceLane = terraceLaneHeight(x, z);
    if (terraceLane !== null) return terraceLane;
    const lane = laneHeight(x, z);
    if (lane !== null) return lane;
    const quay = meridianQuayHeight(x, z);
    if (quay !== null) return quay;
    if (inBox(x, z, SHIPYARD_APRON)) return SHIPYARD_APRON.height;
    if (inBox(x, z, MOLE_CONNECTOR)) return MOLE_CONNECTOR.height;
    if (inBox(x, z, PLAZA)) return PLAZA.height;
    const tavernStage = tavernStageHeight(x, z);
    if (tavernStage !== null) return tavernStage;
    if (inBox(x, z, TAVERN_PAD)) return TAVERN_PAD.height;
    const citadel = citadelWalkable(x, z);
    if (citadel !== null) return citadel;
    const mole = moleWalkable(x, z);
    if (mole !== null) return mole;
    const slip = shipyardSlipHeight(x, z);
    if (slip !== null) return slip;
    return null;
  };

  const anchor = (id: string, a: BasicAnchor) => {
    anchors[id] = {
      x: a.x,
      y: a.y ?? townWalkable(a.x, a.z) ?? heightField.heightAt(a.x, a.z),
      z: a.z,
      heading: a.heading,
      tx: a.tx,
      ty: a.ty,
      tz: a.tz,
    };
  };

  addHarbour(buckets, colliders, shipObstacles, perches, low, anchor);
  yield;
  addMoleAndLighthouse(buckets, colliders, shipObstacles, perches, kit, lighthouseGlow, anchor);
  yield;
  addHarbourFront(buckets, colliders, stairSpans, perches, heightField, kit, low, anchor);
  yield;
  addStairStreet(buckets, colliders);
  addPlaza(buckets, colliders, perches, heightField, kit, low, high, anchor);
  yield;
  addTavern(buckets, colliders, stairSpans, perches, heightField, kit, low, high, anchor);
  yield;
  addShipyard(buckets, colliders, shipObstacles, perches, heightField, low, mediumUp, anchor);
  yield;
  addLift(buckets, colliders, kit, liftCar, anchor);
  addCitadel(buckets, colliders, stairSpans, perches, heightField, kit, low, high, anchor);
  yield;
  yield* addTerraceHouses(tier.tier, buckets, colliders, stairSpans, perches, heightField, kit, low, high);
  addDenseHillsideTown(buckets, colliders, stairSpans, perches, heightField, kit, low, high);
  yield;
  addVegetation(buckets, colliders, perches, heightField, low, high);
  yield;

  anchor('rhea', { x: 761.4, z: -699.2, heading: -Math.PI / 2, tx: 755.2, ty: 3.8, tz: -704 });
  anchor('crateYard', { x: 594.2, z: -759.2, heading: Math.PI / 2, tx: 586, ty: 3, tz: -752 });
  anchor('extraStall', { x: 768.4, z: -760.5, heading: Math.PI / 2, tx: 779, ty: 4.4, tz: -760.5 });
  anchor('extraFountain', { x: 668, z: -797.2, heading: 0, tx: 668, ty: PLAZA.height + 1.5, tz: -797.2 });
  anchor('extraQuayA', { x: 690, z: -762.6, heading: Math.PI / 2, tx: 704, ty: 3.2, tz: -758 });
  anchor('extraQuayB', { x: 716, z: -762.6, heading: -Math.PI / 2, tx: 704, ty: 3.2, tz: -758 });
  anchor('extraCitadel', {
    x: 786.3,
    y: CITADEL.height,
    z: -803.3,
    heading: 2.53,
    tx: 784,
    ty: CITADEL.height + 3,
    tz: -800,
  });

  group.add(lighthouseGlow, liftCar, mooringLines);
  setLiftCarPosition(liftCar, 0);

  const staticMeshes: Mesh[] = [];
  let staticDraws = 0;
  let staticTriangles = 0;
  for (const key of Object.keys(buckets) as MaterialKey[]) {
    const parts = buckets[key];
    if (parts.length === 0) continue;
    const geometry = merge(parts);
    geometry.computeBoundingSphere();
    geometry.computeBoundingBox();
    const mesh = new Mesh(geometry, kit.materials[key]);
    mesh.name = `meridian-town-${key}`;
    mesh.castShadow = key !== 'glow' && key !== 'halo';
    mesh.receiveShadow = key !== 'glow' && key !== 'halo';
    group.add(mesh);
    staticMeshes.push(mesh);
    staticDraws += 1;
    staticTriangles += triangleCount(geometry);
    yield;
  }

  const propMeshes: Mesh[] = [];
  const propTriangles = propMeshes.reduce((sum, mesh) => sum + triangleCount(mesh.geometry) * mesh.count, 0);
  const metrics: MeridianTownMetrics = {
    staticDraws,
    propDraws: propMeshes.length,
    drawCalls: staticDraws + propMeshes.length + 2,
    staticTriangles,
    propTriangles,
    triangles: staticTriangles + propTriangles,
    buildingCount: countTownBuildings(),
    colliderCount: colliders.circles.length + colliders.boxes.length,
    shipObstacleCount: shipObstacles.length,
  };
  group.userData.meridianTownMetrics = metrics;
  group.userData.perches = perches;

  return {
    group,
    colliders: { circles: colliders.circles, boxes: colliders.boxes },
    cameraBlockers: colliders.camera ?? [],
    shipObstacles,
    walkable: townWalkable,
    anchors,
    metrics,
    setLighthouseLit(on: boolean): void {
      lighthouseGlow.visible = on;
    },
    setMooringLines(on: boolean): void {
      mooringLines.visible = on;
    },
    setLiftCar(t: number): void {
      setLiftCarPosition(liftCar, t);
    },
    update(_dt: number, _t: number, camera: Camera): void {
      for (const child of lighthouseGlow.children) {
        if (child.userData.billboard) child.quaternion.copy(camera.quaternion);
      }
      group.userData.lastCameraDistance = Math.hypot(
        camera.position.x - MERIDIAN.center.x,
        camera.position.z - MERIDIAN.center.z,
      );
    },
    dispose(): void {
      for (const mesh of staticMeshes) mesh.geometry.dispose();
      for (const mesh of propMeshes) {
        mesh.geometry.dispose();
        mesh.dispose();
      }
      disposeTree(lighthouseGlow);
      disposeTree(liftCar);
      disposeTree(mooringLines);
      group.clear();
    },
  };
}

export function meridianTownStairHeight(x: number, z: number): number | null {
  return stairStreetHeight(x, z);
}

function addHarbour(
  buckets: Buckets,
  colliders: ColliderSet,
  shipObstacles: CircleObstacle[],
  perches: Vector3[],
  low: boolean,
  anchor: (id: string, a: BasicAnchor) => void,
): void {
  const { quay, eastArm } = MERIDIAN.harbor;
  const deck = quay.height;
  const waterBase = -MERIDIAN.harbor.depth - 0.35;
  addBox(
    buckets,
    'stone',
    (quay.x0 + quay.x1) / 2,
    waterBase,
    quay.z1 - 0.65,
    quay.x1 - quay.x0,
    deck - waterBase + 0.2,
    1.3,
    0,
    LIMESTONE_DARK,
  );
  addBox(
    buckets,
    'stone',
    eastArm.x0 - 0.65,
    waterBase,
    (eastArm.z0 + eastArm.z1) / 2,
    1.3,
    deck - waterBase + 0.2,
    eastArm.z1 - eastArm.z0,
    0,
    LIMESTONE_DARK,
  );
  addBox(
    buckets,
    'stone',
    eastArm.x1 + 0.65,
    waterBase,
    (eastArm.z0 + eastArm.z1) / 2,
    1.3,
    deck - waterBase + 0.2,
    eastArm.z1 - eastArm.z0,
    0,
    LIMESTONE_DARK,
  );
  addBox(
    buckets,
    'paving',
    (quay.x0 + quay.x1) / 2,
    deck - 0.08,
    (quay.z0 + quay.z1) / 2,
    quay.x1 - quay.x0,
    0.16,
    quay.z1 - quay.z0,
    0,
    0xf0d7aa,
  );
  addBox(
    buckets,
    'paving',
    (eastArm.x0 + eastArm.x1) / 2,
    deck - 0.08,
    (eastArm.z0 + eastArm.z1) / 2,
    eastArm.x1 - eastArm.x0,
    0.16,
    eastArm.z1 - eastArm.z0,
    0,
    0xf0d7aa,
  );
  addBox(
    buckets,
    'stone',
    (quay.x0 + quay.x1) / 2,
    waterBase,
    quay.z1 + 0.85,
    quay.x1 - quay.x0 + 2,
    PLAZA.height - waterBase + 0.15,
    1.7,
    0,
    0x907855,
  );
  addBox(
    buckets,
    'stone',
    (quay.x0 + quay.x1) / 2,
    PLAZA.height - 0.04,
    quay.z1 + 0.82,
    quay.x1 - quay.x0 + 2.6,
    0.36,
    2.0,
    0,
    LIMESTONE_LIGHT,
  );
  for (let x = quay.x0 + 3; x <= quay.x1 - 3; x += 5.4) {
    addBox(
      buckets,
      'stone',
      x,
      deck + 0.4,
      quay.z1 + 1.72,
      0.16,
      PLAZA.height - deck - 0.6,
      0.18,
      0,
      0x745a3b,
    );
  }
  addBox(
    buckets,
    'stone',
    (quay.x0 + quay.x1) / 2,
    -1.15,
    quay.z1 + 10.2,
    quay.x1 - quay.x0 + 4,
    6.8,
    1.4,
    0,
    0x8d7656,
  );
  addBox(
    buckets,
    'stone',
    (quay.x0 + quay.x1) / 2,
    5.45,
    quay.z1 + 10.2,
    quay.x1 - quay.x0 + 4.8,
    0.34,
    1.75,
    0,
    LIMESTONE_LIGHT,
  );
  for (let x = quay.x0 + 4; x <= quay.x1 - 4; x += 4.8) {
    addBox(buckets, 'stone', x, 1.0, quay.z1 + 10.95, 0.12, 4.8, 0.14, 0, 0x70583b);
  }
  for (let x = quay.x0 + 6; x <= quay.x1 - 4; x += 8)
    addBox(
      buckets,
      'stone',
      x,
      deck + 0.015,
      (quay.z0 + quay.z1) / 2,
      0.1,
      0.035,
      quay.z1 - quay.z0 - 1.0,
      0,
      0xb99562,
    );
  for (let z = quay.z0 + 4; z <= quay.z1 - 3; z += 4.5)
    addBox(
      buckets,
      'stone',
      (quay.x0 + quay.x1) / 2,
      deck + 0.02,
      z,
      quay.x1 - quay.x0 - 1.0,
      0.035,
      0.1,
      0,
      0xc8a06d,
    );
  for (let z = eastArm.z1 + 7; z <= eastArm.z0 - 4; z += 8)
    addBox(
      buckets,
      'stone',
      (eastArm.x0 + eastArm.x1) / 2,
      deck + 0.02,
      z,
      eastArm.x1 - eastArm.x0 - 1.0,
      0.035,
      0.1,
      0,
      0xc8a06d,
    );
  for (let x = eastArm.x0 + 4; x <= eastArm.x1 - 3; x += 4.5)
    addBox(
      buckets,
      'stone',
      x,
      deck + 0.015,
      (eastArm.z0 + eastArm.z1) / 2,
      0.1,
      0.035,
      eastArm.z1 - eastArm.z0 - 1.0,
      0,
      0xb99562,
    );
  addQuayEdgeCoping(buckets, quay.x0, MOLE_CONNECTOR.x0 - 0.9, deck, quay.z1 - 0.15);
  addQuayEdgeCoping(buckets, MOLE_CONNECTOR.x1 + 0.9, quay.x1, deck, quay.z1 - 0.15);
  addBox(
    buckets,
    'stone',
    eastArm.x0 - 0.12,
    deck,
    (eastArm.z0 + eastArm.z1) / 2,
    0.8,
    0.34,
    eastArm.z1 - eastArm.z0 + 0.8,
    0,
    LIMESTONE_LIGHT,
  );
  addBox(
    buckets,
    'stone',
    eastArm.x1 + 0.12,
    deck,
    (eastArm.z0 + eastArm.z1) / 2,
    0.8,
    0.34,
    eastArm.z1 - eastArm.z0 + 0.8,
    0,
    LIMESTONE_LIGHT,
  );
  addQuayEdgeWall(colliders, quay.x0, MOLE_CONNECTOR.x0 - 0.9, quay.z1 - 0.2);
  addQuayEdgeWall(colliders, MOLE_CONNECTOR.x1 + 0.9, quay.x1, quay.z1 - 0.2);
  addPlayerWall(
    colliders,
    eastArm.x0 - 0.2,
    (eastArm.z0 + eastArm.z1) / 2,
    0.24,
    (eastArm.z0 - eastArm.z1) / 2,
    0,
    0.7,
  );
  addPlayerWall(
    colliders,
    eastArm.x1 + 0.2,
    (eastArm.z0 + eastArm.z1) / 2,
    0.24,
    (eastArm.z0 - eastArm.z1) / 2,
    0,
    0.7,
  );

  for (let x = quay.x0 + 6; x <= quay.x1 - 8; x += 6) addCopingJoint(buckets, x, deck, quay.z1 - 0.16, 0);
  for (let z = eastArm.z1 + 6; z <= eastArm.z0 - 6; z += 6) {
    addCopingJoint(buckets, eastArm.x0 - 0.16, deck, z, Math.PI / 2);
    addCopingJoint(buckets, eastArm.x1 + 0.16, deck, z, Math.PI / 2);
  }

  const bollards = [602, 624, 646, 706, 728, 746];
  for (const x of bollards) {
    addBollard(buckets, colliders, perches, x, deck, quay.z1 + 1.6);
  }
  for (let i = 0; i < bollards.length - 1; i += 1) {
    const a = bollards[i]!;
    const b = bollards[i + 1]!;
    addSagRope(
      buckets,
      { x: a, y: deck + 0.92, z: quay.z1 + 1.62 },
      { x: b, y: deck + 0.92, z: quay.z1 + 1.62 },
    );
  }
  for (const z of [-760, -742, -724, -666])
    addBollard(buckets, colliders, perches, eastArm.x1 - 3.3, deck, z);

  const extraBenchFloor = 3.42;
  addBox(
    buckets,
    'stone',
    684.2,
    deck - 0.05,
    -764.2,
    6.0,
    extraBenchFloor - deck + 0.04,
    4.0,
    0,
    LIMESTONE_DARK,
  );
  addBox(buckets, 'paving', 684.2, extraBenchFloor - 0.09, -764.2, 5.4, 0.18, 3.6, 0, 0xf0d7aa);
  addBox(buckets, 'stone', 684.2, extraBenchFloor + 0.08, -762.4, 5.8, 0.28, 0.36, 0, LIMESTONE_LIGHT);
  const extraBenchY = addBenchSeat(buckets, 684.2, extraBenchFloor, -764.2, 0, 1.0);
  anchor('extraBench', {
    x: 684.2,
    y: extraBenchY,
    z: -764.2,
    heading: 0,
    tx: 684.2,
    ty: extraBenchFloor + 1.2,
    tz: -752,
  });

  addLampPost(buckets, colliders, perches, 594, deck, -764, 0);
  addLampPost(buckets, colliders, perches, 734, deck, -764, 0);
  addLampPost(buckets, colliders, perches, 765, deck, -742, Math.PI / 2);
  addLampPost(buckets, colliders, perches, 765, deck, -666, Math.PI / 2);

  addCargoGroup(buckets, colliders, 604, deck, -759.2, -8 * DEG);
  addCargoGroup(buckets, colliders, 720, deck, -759.5, 10 * DEG);
  addNetPile(buckets, colliders, 744.5, deck, -735.5, 0.8);
  addNetPile(buckets, colliders, 602.5, deck, -744.5, 0.7);

  addFishingBoat(buckets, colliders, shipObstacles, 622, -740.2, Math.PI, 0.92);
  addFishingBoat(buckets, colliders, shipObstacles, 657, -737.4, Math.PI + 0.08, 0.75);
  addFishingBoat(buckets, colliders, shipObstacles, 596.5, -739.6, Math.PI - 0.05, 0.68);
  addFishingBoat(buckets, colliders, shipObstacles, 686, -736.8, Math.PI + 0.12, 0.7);
  addFishingBoat(buckets, colliders, shipObstacles, 710, -739.3, Math.PI - 0.06, 0.82);
  if (!low) addDinghy(buckets, colliders, shipObstacles, 735.5, -716, Math.PI / 2, 0.7);
  addEastArmArrivalDressing(buckets, colliders, shipObstacles, perches, low);

  for (let x = quay.x0 + 2; x <= quay.x1 - 2; x += 7.5) {
    if (x > 735 && x < 758) continue;
    shipObstacles.push({ x, z: quay.z1 - 1.2, r: 1.55 });
  }
  for (let z = eastArm.z1 + 6; z <= eastArm.z0 - 5; z += 8) {
    if (z > -726 && z < -675) continue;
    shipObstacles.push({ x: eastArm.x1 + 1.2, z, r: 1.6 });
  }
}

function addEastArmArrivalDressing(
  buckets: Buckets,
  colliders: ColliderSet,
  shipObstacles: CircleObstacle[],
  perches: Vector3[],
  low: boolean,
): void {
  const arm = MERIDIAN.harbor.eastArm;
  const deck = MERIDIAN.harbor.quay.height;
  const midZ = (arm.z0 + arm.z1) * 0.5;
  addBox(
    buckets,
    'stone',
    arm.x1 + 1.55,
    deck - 0.15,
    midZ,
    2.7,
    3.8,
    arm.z0 - arm.z1 + 6,
    0,
    LIMESTONE_DARK,
  );
  addBox(
    buckets,
    'stone',
    arm.x1 + 1.35,
    deck + 3.45,
    midZ,
    3.2,
    0.36,
    arm.z0 - arm.z1 + 6.8,
    0,
    LIMESTONE_LIGHT,
  );
  addBox(buckets, 'paving', arm.x1 + 5.0, deck + 0.03, midZ, 7.8, 0.16, arm.z0 - arm.z1 + 4.0, 0, 0xf0d7aa);
  addBox(buckets, 'paving', arm.x1 + 10.4, deck + 0.04, midZ, 13.8, 0.18, arm.z0 - arm.z1 + 3.2, 0, 0xd6bf8d);
  addBox(buckets, 'stone', arm.x1 + 2.25, deck - 0.25, midZ, 2.2, 8.0, arm.z0 - arm.z1 + 4.6, 0, 0x917a58);
  addBox(
    buckets,
    'stone',
    arm.x1 + 2.0,
    deck + 7.45,
    midZ,
    2.8,
    0.36,
    arm.z0 - arm.z1 + 5.2,
    0,
    LIMESTONE_LIGHT,
  );
  addBox(buckets, 'stone', arm.x1 + 8.6, deck - 0.25, -711, 1.8, 5.6, 114, 0, 0x8f7859);
  addBox(buckets, 'stone', arm.x1 + 7.7, deck + 4.95, -711, 3.4, 0.34, 114, 0, LIMESTONE_LIGHT);
  addBox(buckets, 'stone', arm.x1 + 4.1, deck - 0.18, -711, 4.8, 3.5, 114, 0, 0x9a8260);
  addBox(buckets, 'stone', arm.x1 + 3.6, deck + 3.0, -711, 5.4, 0.28, 114, 0, LIMESTONE_LIGHT);

  for (const z of [-762, -748, -734, -716, -696, -678, -660]) {
    addBox(
      buckets,
      'stone',
      (arm.x0 + arm.x1) * 0.5,
      deck + 0.035,
      z,
      arm.x1 - arm.x0 - 2.1,
      0.055,
      0.34,
      0,
      0x70583b,
    );
  }
  for (const x of [arm.x0 + 2.8, arm.x1 - 2.8]) {
    addBox(buckets, 'stone', x, deck + 0.05, midZ, 0.28, 0.055, arm.z0 - arm.z1 - 4.0, 0, 0x70583b);
  }
  addBox(
    buckets,
    'stone',
    arm.x0 + 0.5,
    deck + 0.06,
    midZ,
    0.55,
    0.24,
    arm.z0 - arm.z1 + 1.0,
    0,
    LIMESTONE_LIGHT,
  );
  addBox(
    buckets,
    'stone',
    arm.x1 - 0.5,
    deck + 0.06,
    midZ,
    0.55,
    0.24,
    arm.z0 - arm.z1 + 1.0,
    0,
    LIMESTONE_LIGHT,
  );

  const mooring = [
    { x: arm.x0 + 1.3, z: -687.8, sx: MERIDIAN.harbor.berth.x - 2.8, sz: -687.5 },
    { x: arm.x0 + 1.2, z: -712.3, sx: MERIDIAN.harbor.berth.x - 2.8, sz: -712.4 },
    { x: arm.x1 - 3.3, z: -688.7, sx: MERIDIAN.harbor.berth.x + 2.0, sz: -689.0 },
    { x: arm.x1 - 3.4, z: -711.2, sx: MERIDIAN.harbor.berth.x + 2.0, sz: -711.1 },
  ] as const;
  for (const m of mooring) {
    addBollard(buckets, colliders, perches, m.x, deck, m.z);
  }
  addRopeCoil(buckets, arm.x0 + 2.2, deck + 0.05, -704.6, 0.75);
  addRopeCoil(buckets, arm.x1 - 3.8, deck + 0.05, -697.5, 0.62);
  addRopeCoil(buckets, arm.x1 - 4.2, deck + 0.05, -727.6, 0.56);
  addRopeCoil(buckets, arm.x0 + 2.2, deck + 0.05, -692.5, 0.64);

  addFishStall(buckets, arm.x0 + 1.8, deck, -690.5, 0, CLOTH_GREEN);
  addFishStall(buckets, arm.x1 - 2.2, deck, -704.5, Math.PI / 2, CLOTH_GREEN);
  addLobsterPots(buckets, arm.x0 + 2.2, deck + 0.08, -695.5, 0.62);
  for (const [x, z, rot, colour] of [
    [arm.x0 + 2.1, -681.8, 0.08, 0x7b5636],
    [arm.x0 + 2.8, -680.9, -0.06, 0x8a633d],
    [arm.x0 + 2.0, -678.6, 0.12, 0x6e4b2b],
  ] as const)
    addBox(buckets, 'wood', x, deck + 0.06, z, 0.92, 0.78, 0.9, rot, colour);
  addDryingNetRack(buckets, arm.x1 + 4.6, deck + 0.1, -716, Math.PI / 2, 1.2);
  addDryingNetRack(buckets, arm.x1 + 5.8, deck + 0.1, -700, Math.PI / 2, 0.95);
  addLobsterPots(buckets, arm.x1 + 4.0, deck + 0.08, -700.5, 0.9);
  addLobsterPots(buckets, arm.x0 + 2.4, deck + 0.08, -728.5, 0.75);
  addBarrelCluster(buckets, colliders, arm.x1 + 4.7, deck, -742.5, 0.72);
  addBarrelCluster(buckets, colliders, arm.x1 + 5.2, deck, -690.5, 0.55);
  addCargoGroup(buckets, colliders, arm.x0 + 2.6, deck, -756.5, 6 * DEG);
  addCargoGroup(buckets, colliders, arm.x0 + 2.7, deck, -682.5, -8 * DEG);
  addFishStall(buckets, arm.x1 + 5.4, deck, -760.5, Math.PI / 2, CLOTH_BLUE);
  addFishStall(buckets, arm.x1 + 5.8, deck, -704.0, Math.PI / 2, CLOTH_GOLD);
  if (!low) addFishStall(buckets, arm.x1 + 5.3, deck, -748.5, Math.PI / 2, CLOTH_RED);

  addLampPost(buckets, colliders, perches, arm.x1 - 2.2, deck, -706.5, Math.PI / 2);
  addLampPost(buckets, colliders, perches, arm.x0 + 2.2, deck, -732.5, -Math.PI / 2);

  addDinghy(buckets, colliders, shipObstacles, arm.x0 - 8.5, -762.5, 0.04, 0.58);
  addDinghy(buckets, colliders, shipObstacles, arm.x0 - 8.0, -739.5, -0.06, 0.62);
  if (!low) addDinghy(buckets, colliders, shipObstacles, arm.x0 - 8.2, -724.0, 0.08, 0.55);
}

function addMoleConnector(buckets: Buckets, colliders: ColliderSet, shipObstacles: CircleObstacle[]): void {
  const c = MOLE_CONNECTOR;
  const cx = (c.x0 + c.x1) * 0.5;
  const cz = (c.z0 + c.z1) * 0.5;
  const waterBase = -MERIDIAN.harbor.depth - 0.35;
  addBox(
    buckets,
    'stone',
    cx,
    waterBase,
    cz,
    c.x1 - c.x0 + 1.2,
    c.height - waterBase + 0.1,
    c.z1 - c.z0,
    0,
    0x8f7859,
  );
  addBox(buckets, 'paving', cx, c.height - 0.08, cz, c.x1 - c.x0, 0.16, c.z1 - c.z0, 0, 0xf0d7aa);
  for (let z = c.z0 + 2.4; z <= c.z1 - 1.2; z += 4.2)
    addBox(buckets, 'stone', cx, c.height + 0.02, z, c.x1 - c.x0 - 1.0, 0.035, 0.13, 0, 0x8d6d49);
  for (let x = c.x0 + 2; x <= c.x1 - 2; x += 4.6)
    addBox(buckets, 'stone', x, c.height + 0.018, cz, 0.11, 0.032, c.z1 - c.z0 - 1.0, 0, 0x9f7d55);
  for (const x of [c.x0 - 0.38, c.x1 + 0.38]) {
    addBox(buckets, 'stone', x, c.height + 0.02, cz, 0.48, 0.55, c.z1 - c.z0 + 0.8, 0, LIMESTONE_DARK);
    addBox(buckets, 'stone', x, c.height + 0.55, cz, 0.62, 0.18, c.z1 - c.z0 + 1.0, 0, LIMESTONE_LIGHT);
    colliders.boxes.push({ x, z: cz, hx: 0.38, hz: (c.z1 - c.z0) * 0.5 + 0.45, rot: 0, height: 0.75 });
    // The wall and the block's face under it, down to the harbour floor, for the camera.
    const out = Math.sign(x - cx);
    colliders.camera?.push({
      x: x - out * 0.06,
      z: cz,
      hx: 0.38,
      hz: (c.z1 - c.z0) * 0.5 + 0.5,
      rot: 0,
      y0: waterBase,
      y1: c.height + 0.73,
    });
  }
  for (let z = c.z0 + 2; z <= c.z1 - 2; z += 6.5) shipObstacles.push({ x: c.x0 - 0.8, z, r: 1.4 });
}

function createMooringLines(materials: Record<MaterialKey, Material>): Group {
  const group = new Group();
  group.name = 'meridian-mooring-lines';
  group.visible = false;
  const deck = MERIDIAN.harbor.quay.height;
  const railX = MERIDIAN.harbor.berth.x + 3.35;
  const ropes = [
    { bx: MERIDIAN.harbor.eastArm.x0 + 1.3, bz: -687.8, sx: railX, sz: -686.7 },
    { bx: MERIDIAN.harbor.eastArm.x0 + 1.2, bz: -712.3, sx: railX, sz: -713.3 },
    { bx: MERIDIAN.harbor.eastArm.x1 - 3.3, bz: -688.7, sx: railX, sz: -688.7 },
    { bx: MERIDIAN.harbor.eastArm.x1 - 3.4, bz: -711.2, sx: railX, sz: -711.2 },
  ] as const;
  const parts: BufferGeometry[] = [];
  for (const rope of ropes) {
    const a = { x: rope.bx, y: deck + 0.82, z: rope.bz };
    const b = { x: rope.sx, y: deck + 1.42, z: rope.sz };
    const mid = {
      x: (a.x + b.x) * 0.5,
      y: (a.y + b.y) * 0.5 - Math.hypot(a.x - b.x, a.z - b.z) * 0.012,
      z: (a.z + b.z) * 0.5,
    };
    parts.push(tubeBetween(0.075, a, mid, 0x8a6642, 8), tubeBetween(0.075, mid, b, 0x8a6642, 8));
  }
  const mesh = new Mesh(merge(parts), materials.rope);
  mesh.name = 'meridian-mooring-lines-rope';
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  group.add(mesh);
  return group;
}

function addMoleAndLighthouse(
  buckets: Buckets,
  colliders: ColliderSet,
  shipObstacles: CircleObstacle[],
  perches: Vector3[],
  kit: VillageKit,
  lighthouseGlow: Group,
  anchor: (id: string, a: BasicAnchor) => void,
): void {
  void kit;
  const m = MERIDIAN.mole;
  addMoleConnector(buckets, colliders, shipObstacles);
  const dx = m.end.x - m.start.x;
  const dz = m.end.z - m.start.z;
  const len = Math.hypot(dx, dz);
  const rot = Math.atan2(dx, dz);
  const cx = (m.start.x + m.end.x) / 2;
  const cz = (m.start.z + m.end.z) / 2;
  addBox(buckets, 'paving', cx, m.height - 0.08, cz, m.width * 1.45, 0.16, len, rot, 0xbfa06f);
  addBox(buckets, 'stone', cx, m.height - 0.02, cz, 0.6, 0.58, len + 2.4, rot + Math.PI / 2, LIMESTONE_LIGHT);
  addBox(
    buckets,
    'stone',
    cx + Math.cos(rot) * (m.width * 0.72),
    m.height - 0.02,
    cz - Math.sin(rot) * (m.width * 0.72),
    0.7,
    0.7,
    len + 1.2,
    rot,
    LIMESTONE_DARK,
  );
  for (let t = 0.08; t <= 0.94; t += 0.1)
    shipObstacles.push({ x: m.start.x + dx * t, z: m.start.z + dz * t, r: m.width * 0.42 });

  const invLen = 1 / Math.max(1e-6, len);
  const edgeX = m.start.x + dx * 0.58 + dz * invLen * (m.width * 0.56);
  const edgeZ = m.start.z + dz * 0.58 - dx * invLen * (m.width * 0.56);
  const seaHeading = Math.atan2(dz * invLen, -dx * invLen);
  const fisherSeatY = addBenchSeat(buckets, edgeX, m.height, edgeZ, seaHeading, 0.74);
  anchor('extraFisher', {
    x: edgeX,
    y: fisherSeatY,
    z: edgeZ,
    heading: seaHeading,
    tx: edgeX + Math.sin(seaHeading) * 10,
    ty: m.height + 1.2,
    tz: edgeZ + Math.cos(seaHeading) * 10,
  });

  const l = m.lighthouse;
  addDiscPaving(buckets, l.x, m.height + 0.02, l.z, l.radius, 0xe8cf9a, 32);
  addCylinderGeom(
    buckets.stone,
    l.x,
    m.height - 0.82,
    l.z,
    l.radius * 0.96,
    l.radius * 1.05,
    0.9,
    32,
    0,
    LIMESTONE_DARK,
  );
  addCylinderGeom(
    buckets.stone,
    l.x,
    m.height + 0.04,
    l.z,
    l.radius * 0.98,
    l.radius * 0.98,
    0.28,
    32,
    0,
    LIMESTONE_LIGHT,
  );
  addTorusGeom(
    buckets.stone,
    l.x,
    m.height + 0.18,
    l.z,
    l.radius * 0.92,
    0.16,
    32,
    LIMESTONE_LIGHT,
    Math.PI / 2,
    0,
    0,
  );
  addCylinderGeom(buckets.stone, l.x, m.height, l.z, 4.9, 5.7, 1.25, 18, 0, LIMESTONE_DARK);
  addCylinderGeom(buckets.plaster, l.x, m.height + 1.15, l.z, 3.2, 4.35, 13.5, 24, 0, 0xe2c58c);
  addCylinderGeom(buckets.stone, l.x, m.height + 14.38, l.z, 4.25, 3.75, 0.9, 24, 0, LIMESTONE_LIGHT);
  addCylinderGeom(buckets.stone, l.x, m.height + 14.95, l.z, 4.45, 4.45, 0.22, 24, 0, 0xb99562);
  addCone(buckets.metal, l.x, m.height + 17.95, l.z, 3.4, 3.4, 18, 0, 0x2f6d62);
  addTorusGeom(buckets.metal, l.x, m.height + 15.04, l.z, 4.65, 0.075, 24, METAL, Math.PI / 2, 0, 0);
  addTorusGeom(buckets.metal, l.x, m.height + 15.72, l.z, 3.18, 0.08, 20, METAL, Math.PI / 2, 0, 0);
  addTorusGeom(buckets.metal, l.x, m.height + 17.15, l.z, 2.72, 0.08, 20, METAL, Math.PI / 2, 0, 0);
  for (let i = 0; i < 12; i += 1) {
    const a = (i / 12) * Math.PI * 2;
    const galleryX = l.x + Math.cos(a) * 4.45;
    const galleryZ = l.z + Math.sin(a) * 4.45;
    const x = l.x + Math.cos(a) * 3.05;
    const z = l.z + Math.sin(a) * 3.05;
    addCylinderGeom(buckets.metal, galleryX, m.height + 14.95, galleryZ, 0.055, 0.065, 0.82, 6, 0, METAL);
    addCylinderGeom(buckets.metal, x, m.height + 14.62, z, 0.08, 0.08, 3.05, 6, 0, METAL);
    perches.push(new Vector3(x, m.height + 17.6, z));
  }
  for (let i = 0; i < 6; i += 1) {
    const a = (i / 6) * Math.PI * 2;
    addBox(
      buckets,
      'metal',
      l.x + Math.cos(a) * 2.65,
      m.height + 15.9,
      l.z + Math.sin(a) * 2.65,
      0.08,
      1.8,
      0.12,
      -a,
      0x12191b,
    );
  }
  addBox(buckets, 'stone', l.x + 0.05, m.height + 4.0, l.z - 3.58, 1.25, 2.6, 0.16, 0, 0x4a3022);
  colliders.circles.push({ x: l.x, z: l.z, r: 5.3 });
  shipObstacles.push({ x: l.x, z: l.z, r: 10.4 });
  perches.push(new Vector3(l.x, m.height + 19.4, l.z));

  const litMaterial = createLighthouseLitMaterial('meridian-lighthouse-lit-material');
  litMaterial.userData.meridianOwned = true;
  const glow = new Mesh(
    merge([
      geoCylinder(2.45, 2.45, 1.55, { x: l.x, y: m.height + 15.9, z: l.z }, 0xfff1a6, 18),
      sphereGeometry(l.x, m.height + 16.6, l.z, 2.4, 1.2, 2.4, 0xfff4b0, 16, 8),
    ]),
    litMaterial,
  );
  glow.name = 'meridian-lighthouse-lit-disc';
  const haloMaterial = createLighthouseHaloMaterial('meridian-lighthouse-halo-billboard-material');
  haloMaterial.userData.meridianOwned = true;
  const halo = new Mesh(new CircleGeometry(2.65, 36), haloMaterial);
  halo.position.set(l.x, m.height + 16.6, l.z);
  halo.name = 'meridian-lighthouse-halo';
  halo.userData.billboard = true;
  lighthouseGlow.add(glow, halo);

  anchor('lighthouse', {
    x: l.x - 6.2,
    y: m.height,
    z: l.z - 2.7,
    heading: Math.PI / 2,
    tx: l.x,
    ty: m.height + 12,
    tz: l.z,
  });
}

function addHarbourFront(
  buckets: Buckets,
  colliders: ColliderSet,
  stairSpans: StairSpan[],
  perches: Vector3[],
  heightField: HeightField,
  kit: VillageKit,
  low: boolean,
  anchor: (id: string, a: BasicAnchor) => void,
): void {
  addTerraceRetainingWall(buckets, HARBOUR_FRONT_ROW, MERIDIAN.harbor.quay.height);
  addLanePaving(buckets, HARBOUR_FRONT_ROW);
  addTerraceHouseRun(buckets, colliders, stairSpans, perches, heightField, kit, HARBOUR_FRONT_ROW, {
    arcade: true,
  });
  addHarbourPromenadeWall(buckets, colliders);
  if (!low) {
    addHangingLaundry(buckets, 600, 11.1, -779.2, 630, 10.7, -779.2);
    addHangingLaundry(buckets, 706, 11.0, -779.0, 752, 10.8, -779.1);
  }
  anchor('promenade', { x: 666.8, y: 2.4, z: -762.5, heading: Math.PI, tx: 668, ty: 7.5, tz: -796 });
}

function addStairStreet(buckets: Buckets, colliders: ColliderSet): void {
  const dz = STAIR_STREET.z1 - STAIR_STREET.z0;
  const tread = Math.abs(dz) / STAIR_STREET.steps;
  const rise = (PLAZA.height - MERIDIAN.harbor.quay.height) / STAIR_STREET.steps;
  for (let i = 0; i < STAIR_STREET.steps; i += 1) {
    const z = STAIR_STREET.z0 - tread * (i + 0.5);
    const h = MERIDIAN.harbor.quay.height + rise * (i + 1);
    addBox(
      buckets,
      'paving',
      STAIR_STREET.x,
      h + 0.02,
      z,
      STAIR_STREET.width,
      0.16,
      tread + 0.04,
      0,
      0xf0d7aa,
    );
    addBox(
      buckets,
      'stone',
      STAIR_STREET.x,
      h - rise - 0.02,
      z + tread * 0.5,
      STAIR_STREET.width,
      rise + 0.04,
      0.16,
      0,
      LIMESTONE_DARK,
    );
  }
  addBox(
    buckets,
    'stone',
    STAIR_STREET.x - STAIR_STREET.width * 0.5 - 0.44,
    MERIDIAN.harbor.quay.height,
    -784,
    0.5,
    3.0,
    25.2,
    0,
    LIMESTONE_DARK,
  );
  addBox(
    buckets,
    'stone',
    STAIR_STREET.x + STAIR_STREET.width * 0.5 + 0.44,
    MERIDIAN.harbor.quay.height,
    -784,
    0.5,
    3.0,
    25.2,
    0,
    LIMESTONE_DARK,
  );
  for (const side of [-1, 1]) {
    for (let i = 0; i <= 5; i += 1) {
      const z = STAIR_STREET.z0 - i * (Math.abs(dz) / 5);
      const y = stairStreetHeight(STAIR_STREET.x, z) ?? 4;
      const x = STAIR_STREET.x + side * (STAIR_STREET.width * 0.5 + 0.8);
      addCylinderGeom(buckets.metal, x, y, z, 0.08, 0.1, 1.35, 6, 0, METAL);
    }
  }
  addSagRope(buckets, { x: 663, y: 3.6, z: -773 }, { x: 663, y: 8.1, z: -796 });
  addSagRope(buckets, { x: 673, y: 3.6, z: -773 }, { x: 673, y: 8.1, z: -796 });
  colliders.boxes.push(
    { x: 662.9, z: -784, hx: 0.45, hz: 12.7, rot: 0, height: 3.1 },
    { x: 673.1, z: -784, hx: 0.45, hz: 12.7, rot: 0, height: 3.1 },
  );
}

function addPlaza(
  buckets: Buckets,
  colliders: ColliderSet,
  perches: Vector3[],
  heightField: HeightField,
  kit: VillageKit,
  low: boolean,
  high: boolean,
  anchor: (id: string, a: BasicAnchor) => void,
): void {
  addBox(
    buckets,
    'paving',
    668,
    PLAZA.height - 0.08,
    -799.4,
    PLAZA.x1 - PLAZA.x0,
    0.16,
    PLAZA.z1 - PLAZA.z0,
    0,
    0xf1d9aa,
  );
  for (let x = PLAZA.x0 + 4; x <= PLAZA.x1 - 4; x += 8)
    addBox(buckets, 'stone', x, PLAZA.height - 0.02, PLAZA.z0 + 0.8, 0.25, 0.12, 1.6, 0, LIMESTONE_DARK);
  for (let z = PLAZA.z0 + 4; z <= PLAZA.z1 - 4; z += 8)
    addBox(buckets, 'stone', PLAZA.x0 + 0.8, PLAZA.height - 0.02, z, 1.6, 0.12, 0.25, 0, LIMESTONE_DARK);
  for (let x = PLAZA.x0 + 5; x <= PLAZA.x1 - 5; x += 5)
    addBox(
      buckets,
      'stone',
      x,
      PLAZA.height + 0.015,
      -799.4,
      0.08,
      0.035,
      PLAZA.z1 - PLAZA.z0 - 1.6,
      0,
      0xb99562,
    );
  for (let z = PLAZA.z0 + 4; z <= PLAZA.z1 - 4; z += 4.8)
    addBox(
      buckets,
      'stone',
      668,
      PLAZA.height + 0.02,
      z,
      PLAZA.x1 - PLAZA.x0 - 1.8,
      0.035,
      0.08,
      0,
      0xc8a06d,
    );
  addBox(buckets, 'paving', 668, PLAZA.height - 0.075, -824.0, 94, 0.15, 11.2, 0, 0xf0d7aa);
  for (let x = 623; x <= 713; x += 5.2)
    addBox(buckets, 'stone', x, PLAZA.height + 0.02, -824.0, 0.07, 0.032, 10.2, 0, 0xb99562);
  for (let z = -829; z <= -819.5; z += 1.55)
    addBox(buckets, 'stone', 668, PLAZA.height + 0.018, z, 91, 0.03, 0.055, 0, 0xc8a06d);
  addCompassRose(buckets, 668, PLAZA.height + 0.035, -797.2);

  addFountain(buckets, colliders, perches, 668, PLAZA.height, -797.2);
  anchor('mina', {
    x: 672.4,
    y: PLAZA.height,
    z: -794.1,
    heading: -2.4,
    tx: 668,
    ty: PLAZA.height + 1.4,
    tz: -797.2,
  });
  anchor('tobias', {
    x: 651.0,
    y: PLAZA.height,
    z: -788.2,
    heading: 0.75,
    tx: 656,
    ty: PLAZA.height + 1.1,
    tz: -791.4,
  });
  addMerchantTable(buckets, colliders, 655.2, PLAZA.height, -791.2, 15 * DEG);

  addLandmarkHouse(buckets, colliders, heightField, kit, {
    id: 'voyage-office',
    x: 642.5,
    z: -798.5,
    rotY: -Math.PI / 2,
    footprint: { w: 6, d: 8 },
    storeys: 2,
    tint: LIMESTONE_LIGHT,
    roofTint: TERRACOTTA,
    seed: 201,
  });
  addVoyageSign(buckets, colliders, 651.2, PLAZA.height + 2.7, -798.5, -Math.PI / 2);
  anchor('voyageOffice', {
    x: 653.5,
    y: PLAZA.height,
    z: -798.7,
    heading: -Math.PI / 2,
    tx: 642.5,
    ty: PLAZA.height + 5,
    tz: -798.5,
  });

  addBountyBoard(buckets, colliders, perches, 657.4, PLAZA.height, -812.4, -12 * DEG);
  anchor('bountyBoard', {
    x: 657.6,
    y: PLAZA.height,
    z: -807.8,
    heading: Math.PI,
    tx: 657.4,
    ty: PLAZA.height + 2.2,
    tz: -812.4,
  });

  addClockTower(buckets, colliders, perches, 668, PLAZA.height, -824.8);
  anchor('clockTower', {
    x: 668.2,
    y: PLAZA.height,
    z: -813.7,
    heading: Math.PI,
    tx: 668,
    ty: PLAZA.height + 17,
    tz: -824.8,
  });

  addLandmarkHouse(buckets, colliders, heightField, kit, {
    id: 'outfitter',
    x: 696.5,
    z: -797.7,
    rotY: Math.PI / 2,
    footprint: { w: 6, d: 8 },
    storeys: 2,
    tint: 0xc98948,
    roofTint: 0x9d3a23,
    seed: 202,
  });
  addOutfitterProps(buckets, colliders, 687.6, PLAZA.height, -797.6, Math.PI / 2);
  anchor('outfitter', {
    x: 684.8,
    y: PLAZA.height,
    z: -797.6,
    heading: Math.PI / 2,
    tx: 696.5,
    ty: PLAZA.height + 4.2,
    tz: -797.7,
  });

  addAwningStall(buckets, colliders, 681.7, PLAZA.height, -787.9, 0, CLOTH_BLUE, CLOTH_GOLD);
  addAwningStall(buckets, colliders, 646.2, PLAZA.height, -810.6, Math.PI / 2, CLOTH_RED, LIMESTONE_LIGHT);
  addBench(buckets, colliders, 680.8, PLAZA.height, -807.2, -25 * DEG);
  addBench(buckets, colliders, 653.8, PLAZA.height, -800.5, 82 * DEG);
  addPottedCypress(buckets, colliders, 645.7, PLAZA.height, -786.2, 1.1);
  addPottedCypress(buckets, colliders, 690.3, PLAZA.height, -811.3, 1.05);
  addOliveTree(buckets, colliders, 685.8, PLAZA.height, -787.2, 0.85);
  addOliveTree(buckets, colliders, 648.7, PLAZA.height, -815.0, 0.8);

  if (high) {
    addBougainvillea(buckets, 651.2, PLAZA.height + 2.1, -802.5, Math.PI / 2, 1.2);
    addBougainvillea(buckets, 688.1, PLAZA.height + 2.0, -793.2, -Math.PI / 2, 1.1);
  }
  if (!low) {
    addStringLanterns(
      buckets,
      { x: 645.8, y: PLAZA.height + 4.6, z: -787.2 },
      { x: 690.2, y: PLAZA.height + 4.3, z: -811.4 },
      8,
    );
  }
}

function addTavern(
  buckets: Buckets,
  colliders: ColliderSet,
  stairSpans: StairSpan[],
  perches: Vector3[],
  heightField: HeightField,
  kit: VillageKit,
  low: boolean,
  high: boolean,
  anchor: (id: string, a: BasicAnchor) => void,
): void {
  addBox(
    buckets,
    'paving',
    622,
    TAVERN_PAD.height - 0.08,
    -796,
    TAVERN_PAD.x1 - TAVERN_PAD.x0,
    0.16,
    TAVERN_PAD.z1 - TAVERN_PAD.z0,
    0,
    0xcda671,
  );
  addTownHouse(buckets, colliders, stairSpans, perches, heightField, kit, {
    id: 'tavern-meridian',
    x: 622,
    z: -807.5,
    rotY: 0,
    footprint: { w: 8, d: 8 },
    storeys: 2,
    tint: 0xbf6c45,
    roofTint: TERRACOTTA_WARM,
    doorSide: 'back',
    upper: 'plaster',
    ground: 'plaster',
    roof: 'gable',
    balcony: true,
    seed: 301,
  });
  addHangingSign(buckets, colliders, 615.3, TAVERN_PAD.height + 3.5, -799.2, Math.PI / 2, 0x7b3b25, 0xffd785);
  addBox(buckets, 'wood', 618.4, TAVERN_PAD.height, -788.4, 8.6, 0.35, 4.2, 0, DARK_WOOD);
  addBox(buckets, 'wood', 618.4, TAVERN_PAD.height + 0.35, -788.4, 8.2, 0.25, 3.8, 0, 0x8b5a34);
  for (const [x, z, rot] of [
    [628.2, -789.2, 12 * DEG],
    [612.4, -794.1, -25 * DEG],
    [631.2, -800.2, 40 * DEG],
  ] as const) {
    addTableSet(buckets, colliders, x, TAVERN_PAD.height, z, rot);
  }
  if (!low)
    addStringLanterns(
      buckets,
      { x: 611.0, y: TAVERN_PAD.height + 4.0, z: -791.8 },
      { x: 632.6, y: TAVERN_PAD.height + 4.0, z: -800.5 },
      6,
    );
  if (high) addBougainvillea(buckets, 612.4, TAVERN_PAD.height + 2.3, -804.2, 0, 1.1);
  anchor('lyra', {
    x: 618.5,
    y: TAVERN_PAD.height + 0.62,
    z: -787.1,
    heading: Math.PI,
    tx: 622,
    ty: TAVERN_PAD.height + 2.2,
    tz: -792,
  });
}

function addShipyard(
  buckets: Buckets,
  colliders: ColliderSet,
  shipObstacles: CircleObstacle[],
  perches: Vector3[],
  heightField: HeightField,
  low: boolean,
  mediumUp: boolean,
  anchor: (id: string, a: BasicAnchor) => void,
): void {
  void heightField;
  void low;
  const y = MERIDIAN.harbor.quay.height;
  addBox(buckets, 'paving', 590.5, y - 0.08, -756, 42, 0.16, 34, 0, 0xe8cf9a);
  addBox(buckets, 'wood', 579.4, -1.0, -742.2, 9.0, 0.32, 22, -15 * DEG, 0x7d5735);
  addBox(buckets, 'wood', 579.4, 0.1, -746.2, 7.8, 0.25, 20, -15 * DEG, 0x8a6541);
  addHullUnderConstruction(buckets, colliders, perches, 579.5, y, -762.2, 8 * DEG);
  addTimberStacks(buckets, colliders, 604.6, y, -745.8, -8 * DEG);
  addSawhorse(buckets, colliders, 572.5, y, -751.2, 20 * DEG);
  addHoist(buckets, colliders, perches, 600.5, y, -769.4, -8 * DEG);
  if (mediumUp) {
    addNetPile(buckets, colliders, 574.5, y, -770.6, 0.72);
    addBarrelCluster(buckets, colliders, 606.8, y, -770.2, 0.9);
  }
  shipObstacles.push({ x: 579.2, z: -739.5, r: 6.6 });
  anchor('anders', { x: 584.8, y, z: -766.0, heading: -0.82, tx: 579.5, ty: y + 2.2, tz: -762.2 });
}

function addLift(
  buckets: Buckets,
  colliders: ColliderSet,
  kit: VillageKit,
  liftCar: Group,
  anchor: (id: string, a: BasicAnchor) => void,
): void {
  const bx = LIFT_BOTTOM.x;
  const bz = LIFT_BOTTOM.z;
  const tx = LIFT_TOP.x;
  const tz = LIFT_TOP.z;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const x0 = bx + sx * 2.1;
      const z0 = bz + sz * 1.7;
      const x1 = tx + sx * 2.5;
      const z1 = tz + sz * 2.1;
      addTube(
        buckets.wood,
        0.16,
        { x: x0, y: LIFT_BOTTOM.y, z: z0 },
        { x: x1, y: LIFT_TOP.y + 4.0, z: z1 },
        0x5a3a22,
        8,
      );
      colliders.circles.push({ x: x0, z: z0, r: 0.45 });
    }
  }
  for (let i = 0; i <= 9; i += 1) {
    const t = i / 9;
    const ax = bx - 2.15 + (tx - bx) * t;
    const az = bz - 1.45 + (tz - bz) * t;
    const ay = LIFT_BOTTOM.y + (LIFT_TOP.y - LIFT_BOTTOM.y) * t + 0.65;
    const bx2 = bx + 2.15 + (tx - bx) * t;
    const bz2 = bz + 1.45 + (tz - bz) * t;
    const by2 = ay;
    addTube(buckets.metal, 0.055, { x: ax, y: ay, z: az }, { x: bx2, y: by2, z: bz2 }, METAL, 6);
  }
  addBox(buckets, 'stone', bx, LIFT_BOTTOM.y, bz - 3.2, 8.3, 2.4, 0.8, 0, LIMESTONE_DARK);
  addBox(buckets, 'stone', bx, LIFT_BOTTOM.y, bz + 3.2, 8.3, 2.4, 0.8, 0, LIMESTONE_DARK);
  addBox(buckets, 'roofTile', bx, LIFT_BOTTOM.y + 3.15, bz, 8.3, 0.35, 6.3, 0, TERRACOTTA_WARM, 0, 0.12);
  addBox(buckets, 'stone', tx, LIFT_TOP.y, tz + 3.8, 8.8, 2.4, 1.5, 0, LIMESTONE_DARK);
  addBox(buckets, 'stone', tx, LIFT_TOP.y + 2.4, tz + 3.8, 9.5, 0.45, 1.7, 0, LIMESTONE_LIGHT);
  addBox(buckets, 'wood', bx, LIFT_BOTTOM.y, bz, 6.7, 0.38, 5.3, 0, 0x79522f);
  addBox(buckets, 'wood', tx, LIFT_TOP.y, tz, 7.2, 0.44, 5.8, 0, 0x79522f);
  addCylinderGeom(buckets.metal, tx + 4.3, LIFT_TOP.y + 3.6, tz, 1.55, 1.55, 0.22, 20, Math.PI / 2, METAL);
  addTorusGeom(buckets.metal, tx + 4.3, LIFT_TOP.y + 3.7, tz, 1.85, 0.12, 20, METAL, 0, Math.PI / 2, 0);
  addTube(
    buckets.rope,
    0.07,
    { x: tx + 4.3, y: LIFT_TOP.y + 3.6, z: tz },
    { x: bx + 1.7, y: LIFT_BOTTOM.y + 3.2, z: bz },
    0x8a6642,
    8,
  );
  addTube(
    buckets.rope,
    0.07,
    { x: tx + 4.3, y: LIFT_TOP.y + 3.6, z: tz },
    { x: tx - 5.0, y: LIFT_TOP.y - 13, z: tz + 1.2 },
    0x8a6642,
    8,
  );
  addBox(buckets, 'metal', tx - 5.0, LIFT_TOP.y - 14.8, tz + 1.2, 1.2, 3.2, 1.0, 0, 0x34312b);
  addLiftCarMeshes(liftCar, kit.materials);
  colliders.boxes.push({ x: bx, z: bz, hx: 2.0, hz: 1.65, rot: 0, height: 2.8 });
  // The lift house's side walls and tilted roof, for the camera (the car rides up through the roof).
  for (const sz of [-1, 1])
    colliders.camera?.push({
      x: bx,
      z: bz + sz * 3.2,
      hx: 4.15,
      hz: 0.4,
      rot: 0,
      y0: LIFT_BOTTOM.y,
      y1: LIFT_BOTTOM.y + 2.4,
    });
  colliders.camera?.push({
    x: bx,
    z: bz,
    hx: 4.15,
    hz: 3.15,
    rot: 0,
    y0: LIFT_BOTTOM.y + 2.6,
    y1: LIFT_BOTTOM.y + 4.0,
  });
  anchor('liftBottom', {
    x: 766.7,
    y: LIFT_BOTTOM.y,
    z: -765.6,
    heading: Math.PI / 2,
    tx: bx,
    ty: LIFT_BOTTOM.y + 1.4,
    tz: bz,
  });
  anchor('liftTop', {
    x: 802.0,
    y: LIFT_TOP.y,
    z: -778.5,
    heading: -Math.PI / 2,
    tx,
    ty: LIFT_TOP.y + 1.4,
    tz,
  });
}

function addCitadel(
  buckets: Buckets,
  colliders: ColliderSet,
  stairSpans: StairSpan[],
  perches: Vector3[],
  heightField: HeightField,
  kit: VillageKit,
  low: boolean,
  high: boolean,
  anchor: (id: string, a: BasicAnchor) => void,
): void {
  void heightField;
  const y = CITADEL.height;
  addDiscPaving(buckets, CITADEL.x, y - 0.08, CITADEL.z, CITADEL.r * 0.78, 0xe4c991, 40);
  addCurtainWall(buckets, colliders, perches, CITADEL.x, y, CITADEL.z, CITADEL.r);
  addRoundTower(buckets, colliders, perches, 788, y, -781, 4.5, 10.5, true);
  addRoundTower(buckets, colliders, perches, 821, y, -760, 4.2, 9.6, true);
  addRoundTower(buckets, colliders, perches, 842, y, -796, 4.8, 10.8, true);
  addCitadelGate(buckets, colliders, 784, y, -800, -35 * DEG);

  addObservatory(buckets, colliders, perches, 826.5, y, -804.5);
  anchor('oren', { x: 821.4, y, z: -800.2, heading: 2.35, tx: 826.5, ty: y + 6.2, tz: -804.5 });

  addHallOfRecords(buckets, colliders, perches, HALL_OF_RECORDS.x, y, HALL_OF_RECORDS.z, kit, stairSpans);
  anchor('pell', { x: 809.4, y: y + 0.25, z: -785.3, heading: 0, tx: 809.3, ty: y + 3.6, tz: -778.0 });
  anchor('recordsPortico', {
    x: 809.4,
    y: y + 0.25,
    z: -785.3,
    heading: 0,
    tx: 809.3,
    ty: y + 3.6,
    tz: -778.0,
  });

  addAdmiralTerrace(buckets, colliders, perches, 792.8, y, -812.8, high);
  anchor('admiral', { x: 793.4, y: y + 0.35, z: -812.4, heading: 2.8, tx: 688, ty: 8, tz: -706 });

  if (!low) {
    addCypress(buckets, colliders, 801, y, -755, 1.25);
    addCypress(buckets, colliders, 835, y, -786, 1.15);
    addOliveTree(buckets, colliders, 798.0, y, -795.5, 0.9);
  }
}

function* addTerraceHouses(
  tier: Tier,
  buckets: Buckets,
  colliders: ColliderSet,
  stairSpans: StairSpan[],
  perches: Vector3[],
  heightField: HeightField,
  kit: VillageKit,
  low: boolean,
  high: boolean,
): Generator<void, void, void> {
  void low;
  let previousHeight: number = PLAZA.height;
  for (const row of TERRACE_ROWS) {
    addTerraceRetainingWall(buckets, row, previousHeight);
    addLanePaving(buckets, row);
    addTerraceHouseRun(buckets, colliders, stairSpans, perches, heightField, kit, row, { arcade: false });
    yield;
    if (terraceHasBackRow(row, tier))
      addTerraceHouseRun(buckets, colliders, stairSpans, perches, heightField, kit, row, {
        arcade: false,
        backRow: true,
      });
    previousHeight = row.height;
    yield;
  }
  for (const stair of TERRACE_STAIR_STREETS) addTerraceStairStreet(buckets, colliders, stair);
  yield;
  addTownEdgeInfill(buckets, colliders, stairSpans, perches, heightField, kit, low, high);
  addTerraceGardenPots(buckets, colliders, heightField, high);
}

function addDenseHillsideTown(
  buckets: Buckets,
  colliders: ColliderSet,
  stairSpans: StairSpan[],
  perches: Vector3[],
  heightField: HeightField,
  kit: VillageKit,
  low: boolean,
  high: boolean,
): void {
  void colliders;
  void stairSpans;
  void perches;
  void kit;
  if (low) return;
  for (const row of TERRACE_ROWS) {
    const y = row.height + 4.5;
    if (high && row.id !== 'top-whitewash') {
      addStringLanterns(
        buckets,
        { x: row.x0 + 12, y, z: row.laneZ - 0.2 },
        { x: Math.min(row.x1 - 10, row.x0 + 52), y: y - 0.25, z: row.laneZ + 0.4 },
        7,
      );
    }
    const leftY = heightField.heightAt(row.x0 + 6, row.houseZ) + 5.4;
    const rightY = heightField.heightAt(row.x1 - 8, row.houseZ) + 5.1;
    addHangingLaundry(
      buckets,
      row.x0 + 6,
      leftY,
      row.houseZ + 3.1,
      row.x0 + 28,
      leftY - 0.25,
      row.houseZ + 3.0,
    );
    addHangingLaundry(
      buckets,
      row.x1 - 32,
      rightY,
      row.houseZ + 3.0,
      row.x1 - 8,
      rightY - 0.25,
      row.houseZ + 3.1,
    );
  }
}

function addTerraceRetainingWall(buckets: Buckets, row: TerraceRowSpec, previousHeight: number): void {
  const wallZ = row.laneZ + row.laneWidth * 0.5 + 0.36;
  const bottom = Math.min(previousHeight, row.height) - 0.12;
  const h = Math.max(0.8, row.height - previousHeight + 0.7);
  let segmentStart = row.x0;
  const gaps = [...(row.gaps ?? [])].sort((a, b) => a.x0 - b.x0);
  for (const gap of gaps) {
    addRetainingWallSegment(buckets, segmentStart, gap.x0, bottom, h, wallZ, row.height);
    segmentStart = gap.x1;
  }
  addRetainingWallSegment(buckets, segmentStart, row.x1, bottom, h, wallZ, row.height);
}

function addRetainingWallSegment(
  buckets: Buckets,
  x0: number,
  x1: number,
  bottom: number,
  h: number,
  wallZ: number,
  top: number,
): void {
  const length = x1 - x0;
  if (length < 2.5) return;
  const midX = (x0 + x1) * 0.5;
  addBox(buckets, 'stone', midX, bottom, wallZ, length + 0.6, h, 0.72, 0, LIMESTONE_DARK);
  addBox(buckets, 'stone', midX, top + 0.02, wallZ, length + 0.95, 0.24, 0.9, 0, LIMESTONE_LIGHT);
  for (let x = x0 + 3; x <= x1 - 3; x += 5.4)
    addBox(buckets, 'stone', x, top + 0.24, wallZ, 0.12, 0.12, 0.84, 0, 0x8f6f4d);
}

function addLanePaving(buckets: Buckets, row: TerraceRowSpec): void {
  const midX = (row.x0 + row.x1) * 0.5;
  const length = row.x1 - row.x0 + 1.6;
  addBox(buckets, 'paving', midX, row.height - 0.08, row.laneZ, length, 0.16, row.laneWidth, 0, 0xc9966a);
  for (let x = row.x0 + 2.5; x <= row.x1 - 2; x += 4.8)
    addBox(
      buckets,
      'stone',
      x,
      row.height + 0.024,
      row.laneZ,
      0.14,
      0.038,
      row.laneWidth - 0.35,
      0,
      0x8e6f4a,
    );
  for (let z = row.laneZ - row.laneWidth * 0.38; z <= row.laneZ + row.laneWidth * 0.42; z += 1.35)
    addBox(buckets, 'stone', midX, row.height + 0.022, z, length - 0.65, 0.036, 0.095, 0, 0x9f7d55);
}

function addTerraceHouseRun(
  buckets: Buckets,
  colliders: ColliderSet,
  stairSpans: StairSpan[],
  perches: Vector3[],
  heightField: HeightField,
  kit: VillageKit,
  row: TerraceRowSpec,
  options: { arcade: boolean; backRow?: boolean },
): void {
  const run = terraceRun(row, !!options.backRow);
  if (options.arcade) for (const gap of run.gaps) addArcadeBridge(buckets, gap.x0, gap.x1, row);
  for (const h of run.houses) {
    const seed = h.seed;
    addTownHouse(buckets, colliders, stairSpans, perches, heightField, kit, {
      id: `${row.id}-${options.backRow ? 'back-house' : 'house'}-${seed}`,
      x: h.x,
      z: h.z,
      rotY: h.rotY,
      footprint: { w: h.w, d: h.d },
      storeys: h.storeys,
      tint: h.tint,
      roofTint: h.roofTint,
      doorSide: 'front',
      upper: 'plaster',
      ground: 'plaster',
      roof: h.roof,
      balcony: seed % 2 === 0,
      awning:
        options.arcade || seed % 5 === 0
          ? [CLOTH_BLUE, CLOTH_GREEN, CLOTH_GOLD, CLOTH_RED][seed % 4]
          : undefined,
      seed,
    });
    if (options.arcade) addArcadeBay(buckets, h.x, row.height, row.houseZ + h.d * 0.5 + 0.12, h.w);
  }
}

function addArcadeBay(buckets: Buckets, x: number, y: number, z: number, width: number): void {
  const half = Math.min(width * 0.36, 2.2);
  for (const dx of [-half, half])
    addBox(buckets, 'stone', x + dx, y, z, 0.42, 2.75, 0.42, 0, LIMESTONE_LIGHT);
  addArchVoussoirs(buckets, x, y + 2.6, z, half, 0, LIMESTONE_LIGHT);
  addBox(buckets, 'stone', x, y + 3.05, z + 0.08, width * 0.82, 0.42, 0.48, 0, LIMESTONE_LIGHT);
}

function addArcadeBridge(buckets: Buckets, x0: number, x1: number, row: TerraceRowSpec): void {
  const mid = (x0 + x1) * 0.5;
  const z = row.houseZ + 4.1;
  addBox(buckets, 'stone', x0 + 0.45, row.height, z, 0.9, 3.2, 0.78, 0, LIMESTONE_LIGHT);
  addBox(buckets, 'stone', x1 - 0.45, row.height, z, 0.9, 3.2, 0.78, 0, LIMESTONE_LIGHT);
  addArchVoussoirs(buckets, mid, row.height + 2.78, z, Math.min(6.0, (x1 - x0) * 0.36), 0, LIMESTONE_LIGHT);
  addBox(buckets, 'stone', mid, row.height + 3.35, z, x1 - x0 + 1.0, 0.65, 0.82, 0, LIMESTONE_LIGHT);
  addBox(buckets, 'plaster', mid, row.height + 4.0, z - 0.05, x1 - x0 - 1.2, 1.1, 0.58, 0, 0xe8cf9a);
}

function addArchVoussoirs(
  buckets: Buckets,
  x: number,
  y: number,
  z: number,
  radius: number,
  rot: number,
  colour: number,
): void {
  const stones = 7;
  for (let i = 0; i < stones; i += 1) {
    const t = (i / (stones - 1)) * Math.PI;
    const px = x + Math.cos(t) * radius * 0.76;
    const py = y + Math.sin(t) * radius * 0.32;
    addBox(buckets, 'stone', px, py, z, radius * 0.22, 0.34, 0.55, rot + (Math.PI / 2 - t) * 0.22, colour);
  }
}

function addHarbourPromenadeWall(buckets: Buckets, colliders: ColliderSet): void {
  const fullMid = (MERIDIAN.harbor.quay.x0 + MERIDIAN.harbor.quay.x1) * 0.5;
  const fullWidth = MERIDIAN.harbor.quay.x1 - MERIDIAN.harbor.quay.x0;
  addBox(
    buckets,
    'stone',
    fullMid,
    MERIDIAN.harbor.quay.height - 0.2,
    -765.9,
    fullWidth + 2.0,
    PLAZA.height - MERIDIAN.harbor.quay.height + 0.2,
    1.25,
    0,
    LIMESTONE_DARK,
  );
  addBox(
    buckets,
    'stone',
    fullMid,
    PLAZA.height - 0.04,
    -765.9,
    fullWidth + 2.4,
    0.28,
    1.45,
    0,
    LIMESTONE_LIGHT,
  );
  addBox(
    buckets,
    'stone',
    fullMid,
    MERIDIAN.harbor.quay.height - 0.2,
    -778.0,
    fullWidth + 2.0,
    PLAZA.height - MERIDIAN.harbor.quay.height + 0.45,
    1.8,
    0,
    LIMESTONE_DARK,
  );
  addBox(
    buckets,
    'stone',
    fullMid,
    PLAZA.height - 0.04,
    -778.0,
    fullWidth + 2.6,
    0.32,
    2.05,
    0,
    LIMESTONE_LIGHT,
  );
  addBox(buckets, 'paving', fullMid, PLAZA.height - 0.09, -779.8, fullWidth, 0.18, 9.2, 0, 0xf0d7aa);
  for (let x = MERIDIAN.harbor.quay.x0 + 3; x <= MERIDIAN.harbor.quay.x1 - 3; x += 4.6)
    addBox(buckets, 'stone', x, PLAZA.height + 0.025, -779.8, 0.13, 0.038, 8.3, 0, 0x8e6f4a);
  for (let z = -783.5; z <= -776; z += 1.35)
    addBox(buckets, 'stone', fullMid, PLAZA.height + 0.022, z, fullWidth - 1.2, 0.036, 0.095, 0, 0x9f7d55);
  for (const [x0, x1] of [
    [MERIDIAN.harbor.quay.x0, STAIR_STREET.x - STAIR_STREET.width * 0.65],
    [STAIR_STREET.x + STAIR_STREET.width * 0.65, MERIDIAN.harbor.quay.x1],
  ] as const) {
    const mid = (x0 + x1) * 0.5;
    const width = x1 - x0;
    addBox(
      buckets,
      'stone',
      mid,
      MERIDIAN.harbor.quay.height - 0.15,
      -771.0,
      width,
      PLAZA.height - MERIDIAN.harbor.quay.height + 0.35,
      0.95,
      0,
      LIMESTONE_DARK,
    );
    addBox(buckets, 'stone', mid, PLAZA.height - 0.06, -771.0, width + 0.6, 0.28, 1.15, 0, LIMESTONE_LIGHT);
    addBox(buckets, 'paving', mid, PLAZA.height - 0.08, -775.0, width, 0.16, 3.6, 0, 0xf0d7aa);
    addArcade(buckets, mid, PLAZA.height, -776.45, 0, Math.max(3, Math.floor(width / 12)));
    colliders.boxes.push({ x: mid, z: -773.7, hx: width * 0.5, hz: 0.6, rot: 0, height: 4.8 });
    // The retaining wall's face over the quay, for the camera.
    colliders.camera?.push({
      x: mid,
      z: -771.0,
      hx: width * 0.5 + 0.3,
      hz: 0.58,
      rot: 0,
      y0: MERIDIAN.harbor.quay.height - 0.15,
      y1: PLAZA.height + 0.22,
    });
  }
}

function addTerraceStairStreet(buckets: Buckets, colliders: ColliderSet, stair: TerraceStairStreet): void {
  const dz = stair.z1 - stair.z0;
  const tread = Math.abs(dz) / stair.steps;
  const rise = (stair.y1 - stair.y0) / stair.steps;
  for (let i = 0; i < stair.steps; i += 1) {
    const z = stair.z0 - tread * (i + 0.5);
    const h = stair.y0 + rise * (i + 1);
    addBox(buckets, 'paving', stair.x, h + 0.018, z, stair.width, 0.14, tread + 0.04, 0, 0xf0d7aa);
    addBox(
      buckets,
      'stone',
      stair.x,
      h - rise - 0.02,
      z + tread * 0.5,
      stair.width,
      rise + 0.04,
      0.14,
      0,
      LIMESTONE_DARK,
    );
  }
  for (const side of [-1, 1]) {
    const x = stair.x + side * (stair.width * 0.5 + 0.38);
    for (let i = 0; i < stair.steps; i += 2) {
      const z = stair.z0 - tread * (i + 1);
      const h = stair.y0 + rise * (i + 1);
      addBox(buckets, 'stone', x, h + 0.02, z, 0.36, 0.72, tread * 2 + 0.08, 0, LIMESTONE_DARK);
      addBox(buckets, 'stone', x, h + 0.76, z, 0.44, 0.16, tread * 2 + 0.12, 0, LIMESTONE_LIGHT);
      colliders.boxes.push({ x, z, hx: 0.34, hz: tread + 0.08, rot: 0, height: 0.95 });
      // The walking box sits on the lower step; the drawn wall's cap is higher.
      colliders.camera?.push({ x, z, hx: 0.24, hz: tread + 0.06, rot: 0, y0: h - rise * 2, y1: h + 0.94 });
    }
  }
}

function addTerraceGardenPots(
  buckets: Buckets,
  colliders: ColliderSet,
  heightField: HeightField,
  high: boolean,
): void {
  for (const row of TERRACE_ROWS.slice(0, high ? TERRACE_ROWS.length : 4)) {
    for (const x of [row.x0 + 7, row.x1 - 9]) {
      if (rowGapContaining(row, x)) continue;
      addPottedCypress(buckets, colliders, x, row.height, row.laneZ - 0.25, 0.72);
    }
    const oliveX = (row.x0 + row.x1) * 0.5 + ((row.seed % 3) - 1) * 9;
    if (!rowGapContaining(row, oliveX))
      addOliveTree(buckets, colliders, oliveX, row.height, row.laneZ + 0.1, 0.48);
  }
  void heightField;
}

function addTownEdgeInfill(
  buckets: Buckets,
  colliders: ColliderSet,
  stairSpans: StairSpan[],
  perches: Vector3[],
  heightField: HeightField,
  kit: VillageKit,
  low: boolean,
  high: boolean,
): void {
  const edgeHouses = [
    { x: 566, z: -842, rotY: Math.PI + 6 * DEG, w: 6, d: 6, storeys: 2, seed: 1120 },
    { x: 572, z: -868, rotY: Math.PI - 4 * DEG, w: 6, d: 8, storeys: 2, seed: 1121 },
    { x: 583, z: -895, rotY: Math.PI + 9 * DEG, w: 4, d: 6, storeys: 2, seed: 1122 },
    { x: 824, z: -855, rotY: Math.PI - 7 * DEG, w: 6, d: 6, storeys: 2, seed: 1123 },
    { x: 836, z: -884, rotY: Math.PI + 4 * DEG, w: 6, d: 8, storeys: 3, seed: 1124 },
    { x: 830, z: -918, rotY: Math.PI - 8 * DEG, w: 4, d: 6, storeys: 2, seed: 1125 },
  ] as const;
  for (const s of low ? edgeHouses.filter((_h, i) => i % 2 === 0) : edgeHouses) {
    addTownHouse(buckets, colliders, stairSpans, perches, heightField, kit, {
      id: `edge-infill-${s.seed}`,
      x: s.x,
      z: s.z,
      rotY: s.rotY,
      footprint: { w: s.w, d: s.d },
      storeys: s.storeys,
      tint: MEDITERRANEAN_TINTS[s.seed % MEDITERRANEAN_TINTS.length]!,
      roofTint: ROOF_TINTS[s.seed % ROOF_TINTS.length]!,
      doorSide: 'front',
      upper: 'plaster',
      ground: 'plaster',
      roof: s.seed % 4 === 0 ? 'flat' : 'gable',
      balcony: s.seed % 2 === 0,
      seed: s.seed,
    });
  }

  const gardens = [
    { x: 565, z: -816, w: 16, d: 12, rot: 6 * DEG, y: 7.8 },
    { x: 812, z: -832, w: 18, d: 11, rot: -8 * DEG, y: 10.2 },
    { x: 840, z: -802, w: 14, d: 18, rot: 18 * DEG, y: 8.8 },
  ] as const;
  for (const g of gardens) addWalledGarden(buckets, colliders, g.x, g.y, g.z, g.w, g.d, g.rot, high);
  addTownPavingPatch(buckets, 621, 7.05, -825.5, 62, 19, 0, 0xd2a271);
  addTownPavingPatch(buckets, 715, 7.1, -825.5, 58, 19, 0, 0xd2a271);
  addTownPavingPatch(buckets, 668, 8.6, -838.5, 78, 10.5, 0, 0xc99868);
  addTownPavingPatch(buckets, 568, 11.5, -862, 20, 58, 0, 0xc49564);
  addTownPavingPatch(buckets, 824, 14.5, -874, 21, 66, 0, 0xc49564);
  addDrapedPavingPatch(buckets, heightField, 668, -823, 148, 36, 10, 3, 0xcf9e6c);
  addDrapedPavingPatch(buckets, heightField, 668, -806, 96, 24, 8, 3, 0xd6a874);
  addDrapedPavingPatch(buckets, heightField, 560, -858, 36, 96, 4, 8, 0xc49564);
  addDrapedPavingPatch(buckets, heightField, 828, -878, 38, 96, 4, 8, 0xc49564);
  addOliveGrove(buckets, colliders, 564, 8.2, -804, 3, 2, 6.0, 5.2, 0.42);
  addOliveGrove(buckets, colliders, 555, 12.8, -892, 2, 3, 6.5, 6.0, 0.46);
  addOliveGrove(buckets, colliders, 832, 16.8, -846, 2, 3, 6.2, 6.4, 0.44);
  addOliveGrove(buckets, colliders, 807, 24.0, -940, 1, 1, 5.6, 5.2, 0.4);
  for (const house of [
    [588, 7.2, -824, 5.8, 6.2, 2, Math.PI + 0.08, 0xd7a66f, TERRACOTTA],
    [614, 7.25, -824, 6.2, 5.8, 2, Math.PI - 0.04, WHITEWASH, TERRACOTTA_WARM],
    [724, 7.25, -824, 6.0, 6.0, 2, Math.PI + 0.03, APRICOT, TERRACOTTA_DARK],
    [750, 7.25, -824, 5.4, 6.2, 2, Math.PI - 0.07, CREAM, TERRACOTTA],
    [558, 8.0, -824, 5.2, 5.6, 2, Math.PI + 0.1, 0xd8bc82, TERRACOTTA_WARM],
    [548, 12.0, -860, 5.8, 6.0, 2, Math.PI - 0.12, ROSE, TERRACOTTA],
    [562, 16.0, -924, 5.4, 5.8, 2, Math.PI + 0.06, WHITEWASH, TERRACOTTA_DARK],
    [828, 11.2, -826, 5.8, 5.8, 2, Math.PI - 0.08, CREAM, TERRACOTTA],
    [842, 18.4, -886, 6.0, 6.0, 2, Math.PI + 0.05, OCHRE, TERRACOTTA_WARM],
    [832, 23.5, -920, 5.6, 5.8, 2, Math.PI - 0.1, APRICOT, TERRACOTTA],
  ] as const) {
    const [x, y, z, w, d, floors, rot, tint, roofTint] = house;
    addFillerHouse(buckets, colliders, x, y, z, w, d, floors, rot, tint, roofTint);
  }
}

function addDrapedPavingPatch(
  buckets: Buckets,
  heightField: HeightField,
  x: number,
  z: number,
  w: number,
  d: number,
  cols: number,
  rows: number,
  colour: number,
): void {
  const positions: number[] = [];
  const indices: number[] = [];
  for (let iz = 0; iz <= rows; iz += 1) {
    const lz = -d * 0.5 + (iz / rows) * d;
    for (let ix = 0; ix <= cols; ix += 1) {
      const lx = -w * 0.5 + (ix / cols) * w;
      const px = x + lx;
      const pz = z + lz;
      positions.push(px, heightField.heightAt(px, pz) + 0.075, pz);
    }
  }
  const stride = cols + 1;
  for (let iz = 0; iz < rows; iz += 1) {
    for (let ix = 0; ix < cols; ix += 1) {
      const a = iz * stride + ix;
      const b = a + stride;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  worldUv(geometry, 2.6);
  paint(geometry, colour);
  buckets.paving.push(geometry);
}

function addFillerHouse(
  buckets: Buckets,
  colliders: ColliderSet,
  x: number,
  y: number,
  z: number,
  w: number,
  d: number,
  floors: number,
  rot: number,
  tint: number,
  roofTint: number,
): void {
  const h = floors * 2.6;
  addBox(buckets, 'stone', x, y - 0.15, z, w + 0.5, 0.45, d + 0.5, rot, 0xb79462);
  addBox(buckets, 'plaster', x, y + 0.3, z, w, h, d, rot, tint);
  addBox(buckets, 'roofTile', x, y + h + 0.4, z, w + 0.6, 0.28, d + 0.6, rot, roofTint, 0, 0.18);
  addBox(buckets, 'roofTile', x, y + h + 0.65, z, w + 0.7, 0.32, d * 0.5, rot, roofTint, 0, -0.18);
  for (const lx of [-w * 0.24, w * 0.24]) {
    const p = localToWorld(x, z, rot, lx, -d * 0.5 - 0.05);
    addBox(buckets, 'metal', p.x, y + 2.1, p.z, 0.58, 0.72, 0.06, rot, 0x15303a);
    addBox(
      buckets,
      'cloth',
      p.x - Math.cos(rot) * 0.42,
      y + 2.1,
      p.z + Math.sin(rot) * 0.42,
      0.16,
      0.82,
      0.05,
      rot,
      DEEP_GREEN,
    );
    addBox(
      buckets,
      'cloth',
      p.x + Math.cos(rot) * 0.42,
      y + 2.1,
      p.z - Math.sin(rot) * 0.42,
      0.16,
      0.82,
      0.05,
      rot,
      DEEP_BLUE,
    );
  }
  colliders.boxes.push({ x, z, hx: w * 0.5 + 0.25, hz: d * 0.5 + 0.25, rot, height: h + 1.1 });
}

function addTownPavingPatch(
  buckets: Buckets,
  x: number,
  y: number,
  z: number,
  w: number,
  d: number,
  rot: number,
  colour: number,
): void {
  addBox(buckets, 'paving', x, y - 0.07, z, w, 0.14, d, rot, colour);
  for (let lx = -w * 0.5 + 2.2; lx <= w * 0.5 - 2; lx += 4.2) {
    const p = localToWorld(x, z, rot, lx, 0);
    addBox(buckets, 'stone', p.x, y + 0.02, p.z, 0.1, 0.032, d - 0.7, rot, 0x92724d);
  }
  for (let lz = -d * 0.5 + 1.6; lz <= d * 0.5 - 1.4; lz += 1.45) {
    const p = localToWorld(x, z, rot, 0, lz);
    addBox(buckets, 'stone', p.x, y + 0.018, p.z, w - 0.7, 0.03, 0.08, rot, 0x9f7d55);
  }
}

function addOliveGrove(
  buckets: Buckets,
  colliders: ColliderSet,
  x: number,
  y: number,
  z: number,
  cols: number,
  rows: number,
  sx: number,
  sz: number,
  scale: number,
): void {
  for (let ix = 0; ix < cols; ix += 1) {
    for (let iz = 0; iz < rows; iz += 1) {
      addOliveTree(
        buckets,
        colliders,
        x + (ix - (cols - 1) * 0.5) * sx + Math.sin((ix + 1) * (iz + 3)) * 0.35,
        y,
        z + (iz - (rows - 1) * 0.5) * sz + Math.cos((ix + 4) * (iz + 1)) * 0.35,
        scale,
      );
    }
  }
}

function addWalledGarden(
  buckets: Buckets,
  colliders: ColliderSet,
  x: number,
  y: number,
  z: number,
  w: number,
  d: number,
  rot: number,
  high: boolean,
): void {
  addBox(buckets, 'paving', x, y - 0.06, z, w, 0.12, d, rot, 0xd9bd87);
  for (const [lx, lz, ww, dd] of [
    [0, -d * 0.5, w, 0.38],
    [0, d * 0.5, w, 0.38],
    [-w * 0.5, 0, 0.38, d],
    [w * 0.5, 0, 0.38, d],
  ] as const) {
    const p = localToWorld(x, z, rot, lx, lz);
    addBox(buckets, 'stone', p.x, y, p.z, ww, 1.05, dd, rot, LIMESTONE_DARK);
  }
  colliders.boxes.push({ x, z, hx: w * 0.5, hz: d * 0.5, rot, height: 1.1 });
  for (const [lx, lz, s] of [
    [-w * 0.22, -d * 0.18, 0.5],
    [w * 0.18, d * 0.15, 0.56],
    [0, -d * 0.02, 0.44],
  ] as const) {
    const p = localToWorld(x, z, rot, lx, lz);
    addOliveTree(buckets, colliders, p.x, y, p.z, s);
  }
  if (high) {
    for (const [lx, lz] of [
      [-w * 0.36, d * 0.32],
      [w * 0.34, -d * 0.34],
    ] as const) {
      const p = localToWorld(x, z, rot, lx, lz);
      addCypress(buckets, colliders, p.x, y, p.z, 0.58);
    }
  }
}

function addVegetation(
  buckets: Buckets,
  colliders: ColliderSet,
  perches: Vector3[],
  heightField: HeightField,
  low: boolean,
  high: boolean,
): void {
  const cypress = [
    [574, -808, 1.05],
    [774, -778, 1.24],
    [791, -758, 1.1],
    [820, -836, 1.08],
    [844, -820, 0.95],
  ] as const;
  for (const [x, z, s] of low ? cypress.slice(0, 4) : cypress)
    addCypress(buckets, colliders, x, heightField.heightAt(x, z), z, s);
  const olives = [
    [564, -830, 0.88],
    [810, -846, 0.78],
    [846, -785, 0.82],
  ] as const;
  for (const [x, z, s] of olives) addOliveTree(buckets, colliders, x, heightField.heightAt(x, z), z, s);
  if (high) {
    for (const [x, z] of [
      [594, -846],
      [640, -868],
      [694, -890],
      [748, -862],
      [792, -914],
    ] as const)
      addBougainvillea(buckets, x, heightField.heightAt(x, z) + 2.0, z + 2.6, Math.PI, 0.72);
  }
  perches.push(new Vector3(590, heightField.heightAt(590, -785) + 6.2, -785));
}

interface TownHouseSpec {
  id: string;
  x: number;
  z: number;
  rotY: number;
  footprint: HouseFootprint;
  storeys: 1 | 2 | 3 | 4;
  tint: number;
  roofTint: number;
  doorSide: HouseSide;
  upper: 'plaster';
  ground: 'plaster';
  roof: HouseRoof;
  balcony: boolean;
  seed: number;
  awning?: number;
}

function addTownHouse(
  buckets: Buckets,
  colliders: ColliderSet,
  stairSpans: StairSpan[],
  perches: Vector3[],
  heightField: HeightField,
  kit: VillageKit,
  spec: TownHouseSpec,
): void {
  void stairSpans;
  void kit;
  const y = houseBaseY(spec.x, spec.z, heightField);
  const w = spec.footprint.w;
  const d = spec.footprint.d;
  const floors = spec.storeys;
  const floorH = 2.72;
  const wallH = floors * floorH;
  const min = footprintMinY(spec.x, spec.z, spec.rotY, spec.footprint, heightField);
  if (y - min > 0.16)
    addBox(
      buckets,
      'stone',
      spec.x,
      min - 0.08,
      spec.z,
      spec.footprint.w + 1.0,
      y - min + 0.16,
      spec.footprint.d + 1.0,
      spec.rotY,
      LIMESTONE_DARK,
    );
  addBox(buckets, 'stone', spec.x, y, spec.z, w + 0.25, 0.55, d + 0.25, spec.rotY, 0xb79462);
  addBox(buckets, 'plaster', spec.x, y + 0.55, spec.z, w, wallH, d, spec.rotY, spec.tint);
  for (let floor = 1; floor <= floors; floor += 1) {
    addBox(
      buckets,
      'stone',
      spec.x,
      y + 0.55 + floor * floorH - 0.08,
      spec.z,
      w + 0.18,
      0.14,
      d + 0.18,
      spec.rotY,
      0xd7b77f,
    );
  }
  const terraceRunHouse = spec.id.includes('-house-');
  addFacadeOpenings(buckets, spec, y + 0.55, wallH);
  if (!terraceRunHouse)
    addFacadeOpenings(buckets, { ...spec, doorSide: 'back' }, y + 0.55, wallH, spec.seed + 13, true);
  if (!terraceRunHouse && w >= 6 && d >= 6 && floors > 1) {
    addFacadeOpenings(buckets, { ...spec, doorSide: 'left' }, y + 0.55, wallH, spec.seed + 31, true);
    addFacadeOpenings(buckets, { ...spec, doorSide: 'right' }, y + 0.55, wallH, spec.seed + 47, true);
  }
  const top = y + 0.55 + wallH;
  if (spec.roof === 'flat' || spec.seed % 4 === 0) {
    addFlatRoofTerrace(buckets, spec.x, top, spec.z, w, d, spec.rotY, spec.roofTint, spec.seed);
    if (spec.seed % 3 === 0) addPergola(buckets, spec.x, top + 0.52, spec.z, w, d, spec.rotY);
  } else {
    addTerracottaRoof(buckets, spec.x, top, spec.z, w, d, spec.rotY, spec.roofTint, spec.roof === 'tower');
  }
  if (spec.awning) {
    const door = facadeWorldPoint(spec, spec.doorSide, 0, 0);
    addAwning(
      buckets,
      door.x,
      y + 2.45,
      door.z,
      sideYaw(spec.rotY, spec.doorSide),
      Math.min(3.6, w * 0.55),
      1.45,
      spec.awning,
      LIMESTONE_LIGHT,
    );
  }
  if (spec.balcony && floors > 1) addBalconyRail(buckets, spec, y + 0.55 + floorH + 0.08);
  if (spec.seed % 5 === 0 || ((spec.seed * 7919) % 100) / 100 < vineShare)
    addBougainvilleaOnFacade(buckets, spec, y + 2.2);
  perches.push(new Vector3(spec.x, top + 1.4, spec.z));
  colliders.boxes.push({
    x: spec.x,
    z: spec.z,
    hx: spec.footprint.w * 0.5 + 0.35,
    hz: spec.footprint.d * 0.5 + 0.35,
    rot: spec.rotY,
    height: wallH + 2.5,
  });
}

function addFacadeOpenings(
  buckets: Buckets,
  spec: TownHouseSpec,
  baseY: number,
  wallH: number,
  seed = spec.seed,
  secondary = false,
): void {
  const width = sideSpan(spec, spec.doorSide);
  const floors = Math.max(1, Math.floor(wallH / 2.72));
  const cols = width >= 7 ? 3 : width >= 5.5 ? 2 : 1;
  const shutter = seed % 2 === 0 ? DEEP_BLUE : DEEP_GREEN;
  for (let floor = 0; floor < floors; floor += 1) {
    const y = baseY + floor * 2.72 + 1.25;
    for (let col = 0; col < cols; col += 1) {
      if (floor === 0 && col === Math.floor(cols / 2) && !secondary) continue;
      const along = (col - (cols - 1) / 2) * (width / (cols + 0.55));
      const tall = floor === floors - 1 && seed % 3 === 0;
      addFacadeRect(buckets, spec, spec.doorSide, along, y, 0.72, tall ? 1.3 : 0.95, 'metal', 0x1b2528);
      addFacadeRect(buckets, spec, spec.doorSide, along - 0.55, y + 0.05, 0.18, 1.05, 'cloth', shutter);
      addFacadeRect(buckets, spec, spec.doorSide, along + 0.55, y + 0.05, 0.18, 1.05, 'cloth', shutter);
      addFacadeRect(buckets, spec, spec.doorSide, along, y - 0.16, 0.94, 0.12, 'stone', LIMESTONE_LIGHT);
      if (floor > 0 && (seed + floor + col) % 5 === 0) {
        addFacadeRect(buckets, spec, spec.doorSide, along, y - 0.58, 0.9, 0.12, 'wood', DARK_WOOD);
        addFlowerBox(
          buckets,
          facadeWorldPoint(spec, spec.doorSide, along, 0.1),
          baseY + floor * 2.72 + 0.75,
          sideYaw(spec.rotY, spec.doorSide),
        );
      }
    }
  }
  if (!secondary) {
    addFacadeRect(buckets, spec, spec.doorSide, 0, baseY + 0.15, 1.2, 2.0, 'wood', 0x4d3020);
    const arch = facadeWorldPoint(spec, spec.doorSide, 0, 0.13);
    addDiscVertical(
      buckets,
      'wood',
      arch.x,
      baseY + 2.12,
      arch.z,
      sideYaw(spec.rotY, spec.doorSide),
      0.62,
      0x4d3020,
    );
    addFacadeRect(buckets, spec, spec.doorSide, 0, baseY + 2.0, 1.55, 0.16, 'stone', LIMESTONE_LIGHT);
  }
}

function addFlatRoofTerrace(
  buckets: Buckets,
  x: number,
  y: number,
  z: number,
  w: number,
  d: number,
  rot: number,
  roofTint: number,
  seed: number,
): void {
  addBox(buckets, 'paving', x, y, z, w + 0.35, 0.18, d + 0.35, rot, 0xf1d9aa);
  for (const [lx, lz, ww, dd] of [
    [0, -d * 0.5, w + 0.55, 0.28],
    [0, d * 0.5, w + 0.55, 0.28],
    [-w * 0.5, 0, 0.28, d + 0.55],
    [w * 0.5, 0, 0.28, d + 0.55],
  ] as const) {
    const p = localToWorld(x, z, rot, lx, lz);
    addBox(buckets, 'stone', p.x, y + 0.16, p.z, ww, 0.62, dd, rot, 0xd9bd87);
  }
  if (seed % 2 === 0) {
    const p = localToWorld(x, z, rot, w * 0.25, -d * 0.15);
    addCylinderGeom(buckets.stone, p.x, y + 0.22, p.z, 0.42, 0.5, 0.6, 10, 0, 0x9a6c45);
    addCypress(buckets, { circles: [], boxes: [] }, p.x, y + 0.78, p.z, 0.34);
  } else {
    const p = localToWorld(x, z, rot, -w * 0.18, d * 0.12);
    addBox(
      buckets,
      'cloth',
      p.x,
      y + 0.22,
      p.z,
      Math.min(2.8, w * 0.55),
      0.08,
      1.4,
      rot,
      roofTint || TERRACOTTA_WARM,
    );
  }
}

function addTerracottaRoof(
  buckets: Buckets,
  x: number,
  y: number,
  z: number,
  w: number,
  d: number,
  rot: number,
  roofTint: number,
  tower: boolean,
): void {
  const colour = roofTint || TERRACOTTA_WARM;
  addBox(buckets, 'roofTile', x, y + 0.06, z, w + 0.8, 0.18, d + 0.8, rot, colour);
  if (tower)
    addCone(buckets.roofTile, x, y + 0.18, z, Math.max(w, d) * 0.78, 2.0, 4, Math.PI / 4 + rot, colour);
  else {
    addBox(buckets, 'roofTile', x, y + 0.25, z, w + 1.0, 0.34, d * 0.52, rot, colour, 0, 0.18);
    addBox(buckets, 'roofTile', x, y + 0.25, z, w + 1.0, 0.34, d * 0.52, rot, colour, 0, -0.18);
  }
}

function addPergola(
  buckets: Buckets,
  x: number,
  y: number,
  z: number,
  w: number,
  d: number,
  rot: number,
): void {
  const halfW = Math.min(w * 0.35, 2.4);
  const halfD = Math.min(d * 0.28, 1.8);
  for (const lx of [-halfW, halfW])
    for (const lz of [-halfD, halfD]) {
      const p = localToWorld(x, z, rot, lx, lz);
      addCylinderGeom(buckets.wood, p.x, y, p.z, 0.07, 0.08, 1.6, 6, 0, DARK_WOOD);
    }
  for (let i = 0; i < 4; i += 1) {
    const a = localToWorld(x, z, rot, -halfW + (i / 3) * halfW * 2, -halfD);
    const b = localToWorld(x, z, rot, -halfW + (i / 3) * halfW * 2, halfD);
    addTube(
      buckets.wood,
      0.045,
      { x: a.x, y: y + 1.55, z: a.z },
      { x: b.x, y: y + 1.55, z: b.z },
      DARK_WOOD,
      6,
    );
  }
}

function addBalconyRail(buckets: Buckets, spec: TownHouseSpec, y: number): void {
  const p = facadeWorldPoint(spec, spec.doorSide, 0, 0.62);
  const rot = sideYaw(spec.rotY, spec.doorSide);
  addBox(
    buckets,
    'stone',
    p.x,
    y - 0.18,
    p.z,
    Math.min(3.4, sideSpan(spec, spec.doorSide) * 0.7),
    0.18,
    0.78,
    rot,
    LIMESTONE_LIGHT,
  );
  addBox(
    buckets,
    'metal',
    p.x,
    y + 0.18,
    p.z,
    Math.min(3.2, sideSpan(spec, spec.doorSide) * 0.65),
    0.45,
    0.08,
    rot,
    METAL,
  );
}

function addBougainvilleaOnFacade(buckets: Buckets, spec: TownHouseSpec, y: number): void {
  const p = facadeWorldPoint(spec, spec.doorSide, -sideSpan(spec, spec.doorSide) * 0.36, 0.15);
  addBougainvillea(buckets, p.x, y, p.z, sideYaw(spec.rotY, spec.doorSide), 0.85);
}

function addFlowerBox(buckets: Buckets, p: { x: number; z: number }, y: number, rot: number): void {
  addBox(buckets, 'wood', p.x, y, p.z, 0.82, 0.16, 0.18, rot, DARK_WOOD);
  for (let i = 0; i < 4; i += 1) {
    addSphere(
      buckets.cloth,
      p.x + (i - 1.5) * 0.18 * Math.cos(rot),
      y + 0.18,
      p.z - (i - 1.5) * 0.18 * Math.sin(rot),
      0.1,
      0.08,
      0.1,
      i % 2 ? BOUGAINVILLEA : 0xe2b23a,
      6,
      4,
    );
  }
}

function addFacadeRect(
  buckets: Buckets,
  spec: TownHouseSpec,
  side: HouseSide,
  along: number,
  y: number,
  w: number,
  h: number,
  key: MaterialKey,
  colour: number,
): void {
  const p = facadeWorldPoint(spec, side, along, 0.08);
  addBox(buckets, key, p.x, y, p.z, w, h, 0.055, sideYaw(spec.rotY, side), colour);
}

function facadeWorldPoint(
  spec: TownHouseSpec,
  side: HouseSide,
  along: number,
  out = 0.08,
): { x: number; z: number } {
  const w = spec.footprint.w;
  const d = spec.footprint.d;
  if (side === 'front') return localToWorld(spec.x, spec.z, spec.rotY, along, -d * 0.5 - out);
  if (side === 'back') return localToWorld(spec.x, spec.z, spec.rotY, -along, d * 0.5 + out);
  if (side === 'right') return localToWorld(spec.x, spec.z, spec.rotY, w * 0.5 + out, along);
  return localToWorld(spec.x, spec.z, spec.rotY, -w * 0.5 - out, -along);
}

function sideYaw(rot: number, side: HouseSide): number {
  if (side === 'left' || side === 'right') return rot + Math.PI / 2;
  return rot;
}

function sideSpan(spec: TownHouseSpec, side: HouseSide): number {
  return side === 'front' || side === 'back' ? spec.footprint.w : spec.footprint.d;
}

function addLandmarkHouse(
  buckets: Buckets,
  colliders: ColliderSet,
  heightField: HeightField,
  kit: VillageKit,
  spec: {
    id: string;
    x: number;
    z: number;
    rotY: number;
    footprint: HouseFootprint;
    storeys: 1 | 2 | 3;
    tint: number;
    roofTint: number;
    seed: number;
  },
): void {
  addTownHouse(buckets, colliders, [], [], heightField, kit, {
    ...spec,
    doorSide: 'front',
    upper: 'plaster',
    ground: 'plaster',
    roof: 'gable',
    balcony: true,
  });
}

function addArcade(buckets: Buckets, x: number, y: number, z: number, rot: number, arches: number): void {
  const span = (arches - 1) * 3.2 + 2.6;
  addBox(buckets, 'stone', x, y + 3.1, z, span, 0.55, 0.64, rot, LIMESTONE_LIGHT);
  addBox(buckets, 'plaster', x, y + 3.62, z - Math.cos(rot) * 0.03, span - 0.6, 0.9, 0.58, rot, 0xe8cf9a);
  for (let i = 0; i < arches; i += 1) {
    const lx = (i - (arches - 1) / 2) * 3.2;
    const p = localToWorld(x, z, rot, lx, 0);
    addBox(
      buckets,
      'stone',
      p.x - Math.cos(rot) * 1.12,
      y,
      p.z + Math.sin(rot) * 1.12,
      0.38,
      2.9,
      0.5,
      rot,
      LIMESTONE_DARK,
    );
    addBox(
      buckets,
      'stone',
      p.x + Math.cos(rot) * 1.12,
      y,
      p.z - Math.sin(rot) * 1.12,
      0.38,
      2.9,
      0.5,
      rot,
      LIMESTONE_DARK,
    );
    addArchVoussoirs(buckets, p.x, y + 2.62, p.z, 1.35, rot, LIMESTONE_DARK);
  }
}

function addVoyageSign(
  buckets: Buckets,
  colliders: ColliderSet,
  x: number,
  y: number,
  z: number,
  rot: number,
): void {
  addBox(buckets, 'wood', x, y, z, 0.22, 2.8, 4.2, rot, DARK_WOOD);
  addDiscVertical(
    buckets,
    'metal',
    x - Math.sin(rot) * 0.14,
    y + 1.35,
    z - Math.cos(rot) * 0.14,
    rot,
    1.35,
    0xd8b45f,
  );
  addTorusGeom(
    buckets.metal,
    x - Math.sin(rot) * 0.18,
    y + 1.35,
    z - Math.cos(rot) * 0.18,
    1.45,
    0.055,
    32,
    0x3b3022,
    0,
    rot,
    0,
  );
  addBox(
    buckets,
    'metal',
    x - Math.sin(rot) * 0.22,
    y + 0.35,
    z - Math.cos(rot) * 0.22,
    0.12,
    1.9,
    0.18,
    rot,
    0x3b3022,
  );
  addBox(
    buckets,
    'metal',
    x - Math.sin(rot) * 0.23,
    y + 1.36,
    z - Math.cos(rot) * 0.23,
    0.14,
    0.18,
    2.25,
    rot,
    0x3b3022,
  );
  addBox(
    buckets,
    'metal',
    x - Math.sin(rot) * 0.24,
    y + 0.12,
    z - Math.cos(rot) * 0.24,
    0.16,
    0.18,
    1.2,
    rot,
    0x3b3022,
    0,
    0.55,
  );
  colliders.boxes.push({ x, z, hx: 0.35, hz: 2.35, rot, height: 3.2 });
}

function addBountyBoard(
  buckets: Buckets,
  colliders: ColliderSet,
  perches: Vector3[],
  x: number,
  y: number,
  z: number,
  rot: number,
): void {
  addCylinderGeom(buckets.wood, x - 2.4, y, z, 0.16, 0.18, 3.3, 8, 0, DARK_WOOD);
  addCylinderGeom(buckets.wood, x + 2.4, y, z, 0.16, 0.18, 3.3, 8, 0, DARK_WOOD);
  addBox(buckets, 'wood', x, y + 0.85, z, 5.6, 2.7, 0.28, rot, 0x5a371f);
  addBox(buckets, 'wood', x, y + 3.55, z, 6.2, 0.28, 0.38, rot, DARK_WOOD);
  for (let i = 0; i < 10; i += 1) {
    const col = i % 5;
    const row = Math.floor(i / 5);
    const px = x + (col - 2) * 1.0;
    const py = y + 1.35 + row * 1.0 + (i % 2) * 0.1;
    const pz = z - 0.18;
    addBox(buckets, 'cloth', px, py, pz, 0.72 + (i % 3) * 0.08, 0.58, 0.03, rot, i % 2 ? PAPER : 0xf3e2b8);
    addBox(buckets, 'metal', px - 0.2, py + 0.5, pz - 0.01, 0.05, 0.05, 0.04, rot, METAL);
    addBox(buckets, 'metal', px + 0.2, py + 0.5, pz - 0.01, 0.05, 0.05, 0.04, rot, METAL);
  }
  colliders.boxes.push({ x, z, hx: 3.3, hz: 0.45, rot, height: 3.9 });
  perches.push(new Vector3(x, y + 3.9, z));
}

function addClockTower(
  buckets: Buckets,
  colliders: ColliderSet,
  perches: Vector3[],
  x: number,
  y: number,
  z: number,
): void {
  addBox(buckets, 'stone', x, y, z, 8.8, 2.2, 8.8, 0, LIMESTONE_DARK);
  addBox(buckets, 'plaster', x, y + 2.2, z, 5.6, 16.2, 5.6, 0, 0xe4bd7a);
  for (const [lx, lz] of [
    [-2.95, -2.95],
    [2.95, -2.95],
    [-2.95, 2.95],
    [2.95, 2.95],
  ] as const)
    addBox(buckets, 'stone', x + lx, y + 2.1, z + lz, 0.34, 16.3, 0.34, 0, 0xcba86e);
  for (let i = 0; i < 7; i += 1)
    addBox(buckets, 'stone', x, y + 4.1 + i * 2.25, z, 6.25, 0.24, 6.25, 0, i % 2 ? 0xd7b77f : 0xb99562);
  addBox(buckets, 'stone', x, y + 18.45, z, 7.2, 0.95, 7.2, 0, LIMESTONE_DARK);
  for (const [lx, lz] of [
    [-2.55, -2.55],
    [2.55, -2.55],
    [-2.55, 2.55],
    [2.55, 2.55],
  ] as const) {
    addBox(buckets, 'stone', x + lx, y + 19.0, z + lz, 0.62, 4.2, 0.62, 0, 0xf4dca4);
  }
  for (const [dx, dz, rot] of [
    [0, -3.28, 0],
    [3.28, 0, Math.PI / 2],
    [0, 3.28, Math.PI],
    [-3.28, 0, -Math.PI / 2],
  ] as const) {
    addArchVoussoirs(buckets, x + dx, y + 21.55, z + dz, 1.55, rot, LIMESTONE_DARK);
    addBox(buckets, 'metal', x + dx * 0.98, y + 20.25, z + dz * 0.98, 1.35, 2.05, 0.08, rot, 0x162226);
  }
  addCylinderGeom(buckets.metal, x, y + 19.7, z, 0.62, 0.82, 1.35, 16, 0, 0x6c4a25);
  addCone(buckets.metal, x, y + 20.72, z, 0.86, 1.45, 16, 0, 0x765229);
  addBox(buckets, 'stone', x, y + 23.15, z, 7.4, 0.62, 7.4, 0, LIMESTONE_DARK);
  addBox(buckets, 'stone', x, y + 23.65, z, 6.8, 0.42, 6.8, 0, LIMESTONE_LIGHT);
  addCone(buckets.roofTile, x, y + 24.05, z, 5.15, 4.3, 4, Math.PI / 4, TERRACOTTA_WARM);
  for (const [dx, dz, rot] of [
    [0, -3.18, 0],
    [3.18, 0, Math.PI / 2],
    [0, 3.18, Math.PI],
    [-3.18, 0, -Math.PI / 2],
  ] as const)
    addClockFace(buckets, x + dx, y + 13.6, z + dz, rot);
  colliders.boxes.push({ x, z, hx: 4.8, hz: 4.8, rot: 0, height: 29 });
  perches.push(new Vector3(x, y + 29.4, z));
}

function addClockFace(buckets: Buckets, x: number, y: number, z: number, rot: number): void {
  addDiscVertical(buckets, 'cloth', x, y, z, rot, 1.82, 0xf0dba9);
  addTorusGeom(buckets.metal, x, y, z, 1.86, 0.055, 32, METAL, 0, rot, 0);
  addBox(buckets, 'metal', x, y - 0.02, z - 0.07, 0.1, 1.08, 0.045, rot, METAL, 0, -0.48);
  addBox(buckets, 'metal', x, y - 0.02, z - 0.08, 0.1, 0.72, 0.045, rot, METAL, 0, 0.82);
  for (let i = 0; i < 12; i += 1) {
    const a = (i / 12) * Math.PI * 2;
    const px = x + Math.sin(a) * 1.45 * Math.cos(rot);
    const py = y + Math.cos(a) * 1.45;
    addBox(buckets, 'metal', px, py - 0.03, z - Math.cos(rot) * 0.12, 0.09, 0.22, 0.045, rot, METAL);
  }
}

function addOutfitterProps(
  buckets: Buckets,
  colliders: ColliderSet,
  x: number,
  y: number,
  z: number,
  rot: number,
): void {
  addAwning(buckets, x, y + 2.4, z, rot, 4.2, 1.55, CLOTH_BLUE, LIMESTONE_LIGHT);
  for (let i = 0; i < 5; i += 1) {
    const p = localToWorld(x, z, rot, -1.6 + i * 0.8, -1.3);
    addBox(
      buckets,
      'cloth',
      p.x,
      y + 1.1,
      p.z,
      0.52,
      1.2 + (i % 2) * 0.35,
      0.05,
      rot,
      [CLOTH_RED, CLOTH_GOLD, CLOTH_BLUE, CLOTH_GREEN, 0x6f3f9d][i]!,
    );
  }
  addBox(buckets, 'wood', x, y, z - 2.0, 3.8, 1.1, 0.85, rot, DARK_WOOD);
  colliders.boxes.push({ x, z: z - 2.0, hx: 2.0, hz: 0.6, rot, height: 1.2 });
}

function addMerchantTable(
  buckets: Buckets,
  colliders: ColliderSet,
  x: number,
  y: number,
  z: number,
  rot: number,
): void {
  addBox(buckets, 'wood', x, y + 0.72, z, 4.2, 0.22, 1.4, rot, 0x754b2c);
  addBox(buckets, 'wood', x, y + 0.15, z, 4.45, 0.18, 1.55, rot, 0x5e3b23);
  for (const lx of [-1.7, 1.7])
    for (const lz of [-0.45, 0.45]) {
      const p = localToWorld(x, z, rot, lx, lz);
      addCylinderGeom(buckets.wood, p.x, y, p.z, 0.08, 0.1, 0.72, 6, 0, DARK_WOOD);
    }
  const props = [
    [-1.25, 0, 0.82, 0.06, 0.52, 0.4, CLOTH_BLUE],
    [-0.25, 0, 0.72, 0.05, 0.42, 0.32, PAPER],
    [0.82, 0, 0.58, 0.05, 0.32, 0.5, METAL],
    [1.5, 0, 0.7, 0.08, 0.45, 0.36, CLOTH_RED],
  ] as const;
  for (const [lx, lz, sy, h, w, d, colour] of props) {
    const p = localToWorld(x, z, rot, lx, lz);
    addBox(buckets, 'cloth', p.x, y + sy, p.z, w, h, d, rot + (lx > 0 ? 0.18 : -0.12), colour);
  }
  colliders.boxes.push({ x, z, hx: 2.35, hz: 0.9, rot, height: 1.1 });
}

function addCompassRose(buckets: Buckets, x: number, y: number, z: number): void {
  addTorusGeom(buckets.stone, x, y, z, 4.4, 0.035, 40, 0x7e5b39, Math.PI / 2, 0, 0);
  addTorusGeom(buckets.stone, x, y + 0.01, z, 2.25, 0.03, 32, 0xf0d7aa, Math.PI / 2, 0, 0);
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * Math.PI * 2;
    addBox(
      buckets,
      i % 2 === 0 ? 'stone' : 'paving',
      x + Math.sin(a) * 1.25,
      y + 0.01,
      z + Math.cos(a) * 1.25,
      i % 2 === 0 ? 0.26 : 0.18,
      0.035,
      i % 2 === 0 ? 3.1 : 2.1,
      a,
      i % 2 === 0 ? 0x7e5b39 : 0xf0d7aa,
    );
  }
}

function addFountain(
  buckets: Buckets,
  colliders: ColliderSet,
  perches: Vector3[],
  x: number,
  y: number,
  z: number,
): void {
  addCylinderGeom(buckets.stone, x, y, z, 3.1, 3.3, 0.55, 28, 0, LIMESTONE_DARK);
  addCylinderGeom(buckets.glow, x, y + 0.56, z, 2.55, 2.55, 0.05, 28, 0, 0x4aa6b9);
  addCylinderGeom(buckets.stone, x, y + 0.52, z, 0.56, 0.82, 1.65, 14, 0, LIMESTONE_LIGHT);
  addCone(buckets.stone, x, y + 2.05, z, 1.05, 1.1, 14, 0, LIMESTONE_LIGHT);
  addCylinderGeom(buckets.glow, x, y + 1.9, z, 0.38, 0.38, 0.03, 14, 0, 0x6dbad0);
  colliders.circles.push({ x, z, r: 3.2, height: 2.6 });
  perches.push(new Vector3(x, y + 2.9, z));
}

function addCitadelGate(
  buckets: Buckets,
  colliders: ColliderSet,
  x: number,
  y: number,
  z: number,
  rot: number,
): void {
  addBox(buckets, 'stone', x, y, z, 7.8, 6.0, 2.2, rot, 0xf0d7aa);
  addBox(buckets, 'wood', x, y, z - 0.15, 3.4, 4.0, 0.35, rot, DARK_WOOD);
  addCylinderGeom(buckets.metal, x - 1.2, y + 0.8, z - 0.42, 0.08, 0.08, 3.0, 6, 0, METAL);
  addCylinderGeom(buckets.metal, x + 1.2, y + 0.8, z - 0.42, 0.08, 0.08, 3.0, 6, 0, METAL);
  colliders.boxes.push({ x, z, hx: 4.1, hz: 1.35, rot, height: 6.4 });
}

function addObservatory(
  buckets: Buckets,
  colliders: ColliderSet,
  perches: Vector3[],
  x: number,
  y: number,
  z: number,
): void {
  addCylinderGeom(buckets.stone, x, y, z, 5.6, 5.9, 4.0, 24, 0, LIMESTONE_LIGHT);
  addCylinderGeom(buckets.stone, x, y + 3.8, z, 5.85, 5.7, 0.55, 24, 0, 0xd7b77f);
  addSphere(buckets.metal, x, y + 5.0, z, 5.2, 2.1, 5.2, 0x42b7ad, 24, 8);
  addTorusGeom(buckets.metal, x, y + 5.05, z, 5.2, 0.06, 24, 0x1e6d67, Math.PI / 2, 0, 0);
  addBox(buckets, 'metal', x, y + 5.7, z - 4.2, 2.0, 0.18, 2.2, 0, 0x10231f);
  addTube(
    buckets.metal,
    0.18,
    { x: x - 3.6, y: y + 3.0, z: z - 3.7 },
    { x: x - 7.0, y: y + 5.2, z: z - 7.6 },
    0x3b342c,
    12,
  );
  addCylinderGeom(buckets.metal, x - 7.2, y + 5.1, z - 7.8, 0.44, 0.3, 0.9, 12, -0.75, 0x2b2d2d);
  colliders.circles.push({ x, z, r: 5.8 });
  perches.push(new Vector3(x, y + 7.5, z));
}

function addHallOfRecords(
  buckets: Buckets,
  colliders: ColliderSet,
  perches: Vector3[],
  x: number,
  y: number,
  z: number,
  kit: VillageKit,
  stairSpans: StairSpan[],
): void {
  void kit;
  void stairSpans;
  addBox(buckets, 'stone', x, y - 0.55, z - 0.4, 18.2, 0.55, 12.0, 0, LIMESTONE_DARK);
  addBox(buckets, 'stone', x, y, z - 0.25, 17.0, 0.45, 10.8, 0, LIMESTONE_LIGHT);
  addBox(buckets, 'paving', x, y + 0.42, z - 4.9, 16.2, 0.18, 3.7, 0, 0xf0d7aa);
  addBox(buckets, 'plaster', x, y + 0.45, z + 1.2, 14.2, 5.0, 7.2, 0, WHITEWASH);
  addBox(buckets, 'stone', x, y + 5.45, z + 1.2, 15.2, 0.55, 7.9, 0, LIMESTONE_DARK);
  addPediment(buckets, x, y + 6.0, z - 3.0, 8.4, 2.0, 0, LIMESTONE_LIGHT);
  for (let i = 0; i < 6; i += 1) {
    const px = x - 6.1 + i * 2.45;
    addCylinderGeom(buckets.stone, px, y + 0.45, z - 4.25, 0.34, 0.38, 4.6, 14, 0, LIMESTONE_LIGHT);
    perches.push(new Vector3(px, y + 5.3, z - 4.25));
    colliders.circles.push({ x: px, z: z - 4.25, r: 0.45 });
  }
  addBox(buckets, 'cloth', x - 5.4, y + 0.8, z - 5.0, 0.52, 3.6, 0.06, 0, CLOTH_BLUE);
  addBox(buckets, 'cloth', x + 5.4, y + 0.8, z - 5.0, 0.52, 3.6, 0.06, 0, CLOTH_RED);
  colliders.boxes.push({ x: x + 1.7, z: z + 1.7, hx: 5.4, hz: 3.4, rot: 0, height: 6.8 });
}

function addAdmiralTerrace(
  buckets: Buckets,
  colliders: ColliderSet,
  perches: Vector3[],
  x: number,
  y: number,
  z: number,
  high: boolean,
): void {
  addBox(buckets, 'paving', x, y + 0.12, z, 13.0, 0.28, 7.0, -20 * DEG, 0xf0d7aa);
  for (const lz of [-3.3, 3.3]) {
    for (let i = 0; i < 8; i += 1) {
      const p = localToWorld(x, z, -20 * DEG, -5.6 + i * 1.6, lz);
      addCylinderGeom(buckets.stone, p.x, y + 0.28, p.z, 0.16, 0.2, 1.05, 8, 0, LIMESTONE_LIGHT);
    }
  }
  for (const lx of [-6.1, 6.1]) {
    for (let i = 0; i < 4; i += 1) {
      const p = localToWorld(x, z, -20 * DEG, lx, -2.2 + i * 1.45);
      addCylinderGeom(buckets.stone, p.x, y + 0.28, p.z, 0.16, 0.2, 1.05, 8, 0, LIMESTONE_LIGHT);
    }
  }
  for (const lz of [-3.3, 3.3]) {
    const p = localToWorld(x, z, -20 * DEG, 0, lz);
    addBox(buckets, 'stone', p.x, y + 1.28, p.z, 12.6, 0.24, 0.28, -20 * DEG, LIMESTONE_LIGHT);
  }
  addCylinderGeom(buckets.wood, x - 5.2, y + 0.28, z - 1.8, 0.13, 0.16, 6.3, 8, 0, DARK_WOOD);
  addBox(buckets, 'cloth', x - 4.2, y + 4.75, z - 1.8, 2.0, 1.1, 0.08, 0, CLOTH_RED, 0, 0.18);
  if (high) addTelescope(buckets, colliders, x + 3.5, y + 0.28, z + 1.0, 2.75);
  perches.push(new Vector3(x - 5.2, y + 6.8, z - 1.8));
}

function addCurtainWall(
  buckets: Buckets,
  colliders: ColliderSet,
  perches: Vector3[],
  x: number,
  y: number,
  z: number,
  r: number,
): void {
  const rx = r * 0.78;
  const rz = r * 0.68;
  const thickness = 1.55;
  const h = 3.15;
  const n = 48;
  const positions: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i < n; i += 1) {
    const a = (i / n) * Math.PI * 2;
    for (const side of [-0.5, 0.5] as const) {
      const px = x + Math.cos(a) * (rx + thickness * side);
      const pz = z + Math.sin(a) * (rz + thickness * side);
      positions.push(px, y - 0.75, pz, px, y + h, pz);
    }
  }
  const stride = 4;
  for (let i = 0; i < n; i += 1) {
    const j = (i + 1) % n;
    const a = i * stride;
    const b = j * stride;
    // Inner face, outer face and top face of the continuous ring.
    indices.push(a, b, a + 1, a + 1, b, b + 1);
    indices.push(a + 2, a + 3, b + 2, a + 3, b + 3, b + 2);
    indices.push(a + 1, b + 1, a + 3, a + 3, b + 1, b + 3);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  worldUv(geometry, 1.8);
  paint(geometry, 0xc2a476);
  buckets.stone.push(geometry);

  for (let i = 0; i < 20; i += 1) {
    const a = (i / 20) * Math.PI * 2;
    const px = x + Math.cos(a) * rx;
    const pz = z + Math.sin(a) * rz;
    const rot = Math.atan2(Math.cos(a) * rx, -Math.sin(a) * rz);
    addBox(buckets, 'stone', px, y + h, pz, 0.86, 0.72, 1.7, rot, LIMESTONE_LIGHT);
    if (i % 3 === 0) colliders.boxes.push({ x: px, z: pz, hx: 1.4, hz: 0.95, rot, height: h + 0.9 });
    if (i % 4 === 0) perches.push(new Vector3(px, y + h + 0.8, pz));
  }
  // The whole ring, merlons included, for the camera: one chord box per segment of the wall.
  for (let i = 0; i < n; i += 1) {
    const a0 = (i / n) * Math.PI * 2,
      a1 = ((i + 1) / n) * Math.PI * 2;
    const x0 = x + Math.cos(a0) * rx,
      z0 = z + Math.sin(a0) * rz;
    const x1 = x + Math.cos(a1) * rx,
      z1 = z + Math.sin(a1) * rz;
    const len = Math.hypot(x1 - x0, z1 - z0);
    colliders.camera?.push({
      x: (x0 + x1) * 0.5,
      z: (z0 + z1) * 0.5,
      hx: len * 0.5 + 0.15,
      hz: thickness * 0.5,
      rot: Math.atan2(-(z1 - z0), x1 - x0),
      y0: y - 0.75,
      y1: y + h + 0.72,
    });
  }
}

function addRoundTower(
  buckets: Buckets,
  colliders: ColliderSet,
  perches: Vector3[],
  x: number,
  y: number,
  z: number,
  r: number,
  h: number,
  roof: boolean,
): void {
  addCylinderGeom(buckets.stone, x, y, z, r, r * 1.08, h, 22, 0, 0xd4b57f);
  for (let band = 1.2; band < h; band += 2.1)
    addCylinderGeom(buckets.stone, x, y + band, z, r + 0.05, r + 0.06, 0.12, 22, 0, 0xf0d7aa);
  addCylinderGeom(buckets.stone, x, y + h - 0.22, z, r * 1.22, r * 1.16, 0.42, 22, 0, LIMESTONE_LIGHT);
  addCylinderGeom(buckets.stone, x, y + h + 0.24, z, r * 1.08, r * 1.18, 0.38, 22, 0, 0xc2a476);
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * Math.PI * 2;
    addBox(
      buckets,
      'stone',
      x + Math.cos(a) * r * 0.8,
      y + h,
      z + Math.sin(a) * r * 0.8,
      0.8,
      0.8,
      0.8,
      a,
      LIMESTONE_LIGHT,
    );
  }
  if (roof) addCone(buckets.roofTile, x, y + h + 0.7, z, r * 1.2, 3.0, 22, 0, TERRACOTTA_WARM);
  colliders.circles.push({ x, z, r: r + 0.4 });
  perches.push(new Vector3(x, y + h + 3.8, z));
}

function addHullUnderConstruction(
  buckets: Buckets,
  colliders: ColliderSet,
  perches: Vector3[],
  x: number,
  y: number,
  z: number,
  rot: number,
): void {
  addBox(buckets, 'wood', x, y + 0.18, z, 1.0, 0.32, 14.5, rot, DARK_WOOD);
  for (let i = 0; i < 9; i += 1) {
    const lz = -5.6 + i * 1.4;
    const center = localToWorld(x, z, rot, 0, lz);
    addTorusGeom(
      buckets.wood,
      center.x,
      y + 1.05,
      center.z,
      2.4 - Math.abs(lz) * 0.12,
      0.08,
      16,
      0x7a5538,
      Math.PI / 2,
      rot,
      0,
    );
    addBox(
      buckets,
      'wood',
      center.x,
      y + 0.55,
      center.z,
      0.16,
      1.5,
      4.0 - Math.abs(lz) * 0.18,
      rot,
      0x6b472d,
    );
  }
  for (const lx of [-2.35, 2.35]) {
    const a = localToWorld(x, z, rot, lx, -6.6);
    const b = localToWorld(x, z, rot, lx * 0.45, 6.6);
    addTube(buckets.wood, 0.08, { x: a.x, y: y + 1.6, z: a.z }, { x: b.x, y: y + 1.6, z: b.z }, 0x8a6542, 8);
  }
  colliders.boxes.push({ x, z, hx: 3.0, hz: 7.8, rot, height: 2.7 });
  perches.push(new Vector3(x, y + 2.7, z));
}

function addTimberStacks(
  buckets: Buckets,
  colliders: ColliderSet,
  x: number,
  y: number,
  z: number,
  rot: number,
): void {
  for (let layer = 0; layer < 3; layer += 1) {
    for (let i = 0; i < 5; i += 1) {
      const p = localToWorld(x, z, rot, -1.7 + i * 0.85, layer * 0.38);
      addBox(buckets, 'wood', p.x, y + layer * 0.35, p.z, 0.32, 0.28, 6.0, rot + Math.PI / 2, 0x765033);
    }
  }
  colliders.boxes.push({ x, z, hx: 2.45, hz: 3.3, rot: rot + Math.PI / 2, height: 1.3 });
}

function addSawhorse(
  buckets: Buckets,
  colliders: ColliderSet,
  x: number,
  y: number,
  z: number,
  rot: number,
): void {
  addBox(buckets, 'wood', x, y + 1.0, z, 3.4, 0.22, 0.32, rot, 0x815a38);
  for (const lx of [-1.3, 1.3])
    for (const sx of [-1, 1]) {
      const p = localToWorld(x, z, rot, lx, sx * 0.42);
      addBox(buckets, 'wood', p.x, y, p.z, 0.18, 1.15, 0.18, rot + sx * 0.28, 0x674225, 0.35);
    }
  colliders.boxes.push({ x, z, hx: 1.9, hz: 0.8, rot, height: 1.4 });
}

function addHoist(
  buckets: Buckets,
  colliders: ColliderSet,
  perches: Vector3[],
  x: number,
  y: number,
  z: number,
  rot: number,
): void {
  for (const lx of [-2.1, 2.1]) {
    const p = localToWorld(x, z, rot, lx, 0);
    addBox(buckets, 'wood', p.x, y, p.z, 0.35, 5.2, 0.35, rot, DARK_WOOD);
    colliders.circles.push({ x: p.x, z: p.z, r: 0.38 });
  }
  addBox(buckets, 'wood', x, y + 5.1, z, 5.2, 0.38, 0.48, rot, DARK_WOOD);
  addTorusGeom(buckets.metal, x, y + 4.35, z, 0.55, 0.06, 16, METAL, Math.PI / 2, 0, 0);
  addTube(buckets.rope, 0.05, { x, y: y + 4.25, z }, { x, y: y + 2.3, z: z + 0.6 }, 0x8b6642, 8);
  addBox(buckets, 'metal', x, y + 2.0, z + 0.6, 0.5, 0.6, 0.26, rot, METAL);
  perches.push(new Vector3(x, y + 5.6, z));
}

function addLiftCarMeshes(liftCar: Group, materials: Record<MaterialKey, Material>): void {
  const woodParts: BufferGeometry[] = [];
  const metalParts: BufferGeometry[] = [];
  const ropeParts: BufferGeometry[] = [];
  addBoxTo(woodParts, 0, 0, 0, 3.6, 0.25, 2.8, 0, 0x7a5432);
  addBoxTo(woodParts, 0, 2.45, 0, 3.8, 0.22, 3.0, 0, 0x5b3c24);
  for (const lx of [-1.75, 1.75])
    for (const lz of [-1.35, 1.35]) addBoxTo(woodParts, lx, 0.25, lz, 0.18, 2.35, 0.18, 0, DARK_WOOD);
  for (const lx of [-1.15, 0, 1.15]) addBoxTo(metalParts, lx, 0.75, -1.46, 0.08, 1.45, 0.06, 0, METAL);
  for (const lx of [-1.15, 0, 1.15]) addBoxTo(metalParts, lx, 0.75, 1.46, 0.08, 1.45, 0.06, 0, METAL);
  ropeParts.push(tubeBetween(0.045, { x: 0, y: 2.45, z: 0 }, { x: 0, y: 4.2, z: 0 }, 0x8a6642, 8));
  const wood = new Mesh(merge(woodParts), materials.wood);
  const metal = new Mesh(merge(metalParts), materials.metal);
  const rope = new Mesh(merge(ropeParts), materials.rope);
  wood.name = 'meridian-lift-car-wood';
  metal.name = 'meridian-lift-car-metal';
  rope.name = 'meridian-lift-car-rope';
  liftCar.add(wood, metal, rope);
}

function setLiftCarPosition(liftCar: Group, t: number): void {
  const k = Math.max(0, Math.min(1, t));
  liftCar.position.set(
    LIFT_BOTTOM.x + (LIFT_TOP.x - LIFT_BOTTOM.x) * k,
    LIFT_BOTTOM.y + (LIFT_TOP.y - LIFT_BOTTOM.y) * k,
    LIFT_BOTTOM.z + (LIFT_TOP.z - LIFT_BOTTOM.z) * k,
  );
  liftCar.rotation.y = 0.18;
}

function addBollard(
  buckets: Buckets,
  colliders: ColliderSet,
  perches: Vector3[],
  x: number,
  y: number,
  z: number,
): void {
  addCylinderGeom(buckets.metal, x, y, z, 0.28, 0.34, 0.65, 10, 0, METAL);
  addTorusGeom(buckets.rope, x, y + 0.38, z, 0.42, 0.055, 12, 0x8a6642, Math.PI / 2, 0, 0);
  colliders.circles.push({ x, z, r: 0.55 });
  perches.push(new Vector3(x, y + 0.72, z));
}

function addLampPost(
  buckets: Buckets,
  colliders: ColliderSet,
  perches: Vector3[],
  x: number,
  y: number,
  z: number,
  rot: number,
): void {
  addCylinderGeom(buckets.metal, x, y, z, 0.09, 0.13, 3.2, 8, 0, METAL);
  addBox(buckets, 'metal', x, y + 3.05, z, 0.18, 0.18, 1.2, rot, METAL);
  const end = localToWorld(x, z, rot, 0, 0.58);
  addCylinderGeom(buckets.glow, end.x, y + 2.58, end.z, 0.28, 0.22, 0.45, 8, 0, 0xffa34d);
  addCone(buckets.metal, end.x, y + 3.05, end.z, 0.34, 0.42, 8, 0, METAL);
  colliders.circles.push({ x, z, r: 0.32 });
  perches.push(new Vector3(x, y + 3.4, z));
}

function addFishingBoat(
  buckets: Buckets,
  colliders: ColliderSet,
  shipObstacles: CircleObstacle[],
  x: number,
  z: number,
  rot: number,
  s: number,
): void {
  const y = -0.12;
  addBox(buckets, 'wood', x, y, z, 2.4 * s, 0.55 * s, 7.2 * s, rot, 0x704a2b);
  addBox(buckets, 'wood', x, y + 0.44 * s, z, 2.0 * s, 0.28 * s, 6.5 * s, rot, 0x9a6740);
  addBox(buckets, 'paving', x, y + 0.72 * s, z, 1.6 * s, 0.08 * s, 5.2 * s, rot, 0xd0bc8b);
  addCylinderGeom(buckets.wood, x, y + 0.72 * s, z, 0.045 * s, 0.06 * s, 3.6 * s, 6, 0, DARK_WOOD);
  const a = localToWorld(x, z, rot, -1.0 * s, 0);
  const b = localToWorld(x, z, rot, 1.0 * s, 0);
  addTube(
    buckets.wood,
    0.035 * s,
    { x: a.x, y: y + 1.0 * s, z: a.z },
    { x: b.x, y: y + 1.0 * s, z: b.z },
    DARK_WOOD,
    6,
  );
  colliders.boxes.push({ x, z, hx: 1.5 * s, hz: 4 * s, rot, height: 1.2 * s });
  shipObstacles.push({ x, z, r: 4.4 * s });
}

function addDinghy(
  buckets: Buckets,
  colliders: ColliderSet,
  shipObstacles: CircleObstacle[],
  x: number,
  z: number,
  rot: number,
  s: number,
): void {
  addFishingBoat(buckets, colliders, shipObstacles, x, z, rot, s * 0.72);
}

function addCargoGroup(
  buckets: Buckets,
  colliders: ColliderSet,
  x: number,
  y: number,
  z: number,
  rot: number,
): void {
  for (let i = 0; i < 4; i += 1) {
    const p = localToWorld(x, z, rot, (i % 2) * 1.0, Math.floor(i / 2) * 0.9);
    addBox(buckets, 'wood', p.x, y, p.z, 0.92, 0.86, 0.92, rot + (i % 2) * 0.1, 0x7b5636);
  }
  addBarrelCluster(buckets, colliders, x + 2.0, y, z - 0.4, 0.8);
  colliders.boxes.push({ x: x + 0.5, z: z + 0.45, hx: 1.5, hz: 1.5, rot, height: 1.4 });
}

function addBarrelCluster(
  buckets: Buckets,
  colliders: ColliderSet,
  x: number,
  y: number,
  z: number,
  s: number,
): void {
  for (const [dx, dz] of [
    [0, 0],
    [0.65, 0.28],
    [-0.52, 0.34],
  ] as const) {
    addCylinderGeom(buckets.wood, x + dx * s, y, z + dz * s, 0.34 * s, 0.34 * s, 0.92 * s, 12, 0, 0x6e462b);
    addTorusGeom(
      buckets.metal,
      x + dx * s,
      y + 0.2 * s,
      z + dz * s,
      0.35 * s,
      0.025 * s,
      12,
      METAL,
      Math.PI / 2,
      0,
      0,
    );
    addTorusGeom(
      buckets.metal,
      x + dx * s,
      y + 0.72 * s,
      z + dz * s,
      0.35 * s,
      0.025 * s,
      12,
      METAL,
      Math.PI / 2,
      0,
      0,
    );
  }
  colliders.circles.push({ x, z, r: 1.15 * s });
}

function addNetPile(
  buckets: Buckets,
  colliders: ColliderSet,
  x: number,
  y: number,
  z: number,
  s: number,
): void {
  addTorusGeom(buckets.rope, x, y + 0.12, z, 0.8 * s, 0.07 * s, 16, 0x92704a, Math.PI / 2, 0, 0.2);
  addTorusGeom(
    buckets.rope,
    x + 0.25 * s,
    y + 0.18,
    z - 0.18 * s,
    0.58 * s,
    0.06 * s,
    14,
    0x80613f,
    Math.PI / 2,
    0.4,
    -0.1,
  );
  addBox(buckets, 'rope', x - 0.05, y + 0.06, z, 1.7 * s, 0.08, 0.18, 0.2, 0x8e7048);
  colliders.circles.push({ x, z, r: 0.82 * s });
}

function addRopeCoil(buckets: Buckets, x: number, y: number, z: number, s: number): void {
  for (let i = 0; i < 3; i += 1)
    addTorusGeom(
      buckets.rope,
      x + (i - 1) * 0.08 * s,
      y + i * 0.035,
      z + Math.sin(i) * 0.05 * s,
      (0.42 - i * 0.08) * s,
      0.045 * s,
      16,
      i % 2 ? 0x7a5b39 : 0x92704a,
      Math.PI / 2,
      0,
      i * 0.35,
    );
}

function addDryingNetRack(buckets: Buckets, x: number, y: number, z: number, rot: number, s: number): void {
  for (const lx of [-1.6, 1.6]) {
    const p = localToWorld(x, z, rot, lx * s, 0);
    addCylinderGeom(buckets.wood, p.x, y, p.z, 0.07 * s, 0.09 * s, 2.7 * s, 6, 0, DARK_WOOD);
  }
  const a = localToWorld(x, z, rot, -1.75 * s, 0);
  const b = localToWorld(x, z, rot, 1.75 * s, 0);
  addTube(
    buckets.wood,
    0.055 * s,
    { x: a.x, y: y + 2.5 * s, z: a.z },
    { x: b.x, y: y + 2.5 * s, z: b.z },
    DARK_WOOD,
    6,
  );
  for (let i = 0; i <= 5; i += 1) {
    const t = i / 5;
    const px = a.x + (b.x - a.x) * t;
    const pz = a.z + (b.z - a.z) * t;
    addTube(
      buckets.rope,
      0.022 * s,
      { x: px, y: y + 0.45 * s, z: pz },
      { x: px, y: y + 2.3 * s, z: pz },
      0x80613f,
      4,
    );
  }
  for (let j = 0; j < 4; j += 1) {
    const yy = y + (0.75 + j * 0.42) * s;
    addTube(buckets.rope, 0.018 * s, { x: a.x, y: yy, z: a.z }, { x: b.x, y: yy, z: b.z }, 0x8e7048, 4);
  }
}

function addLobsterPots(buckets: Buckets, x: number, y: number, z: number, s: number): void {
  for (const [dx, dz, rot] of [
    [0, 0, 0],
    [0.72, 0.28, 0.4],
    [-0.58, 0.42, -0.25],
  ] as const) {
    addCylinderGeom(buckets.wood, x + dx * s, y, z + dz * s, 0.42 * s, 0.52 * s, 0.55 * s, 8, rot, 0x6f4a2f);
    addTorusGeom(
      buckets.rope,
      x + dx * s,
      y + 0.35 * s,
      z + dz * s,
      0.48 * s,
      0.035 * s,
      10,
      0x92704a,
      Math.PI / 2,
      0,
      rot,
    );
  }
}

function addFishStall(buckets: Buckets, x: number, y: number, z: number, rot: number, cloth: number): void {
  addBox(buckets, 'wood', x, y + 0.62, z, 4.0, 0.2, 1.55, rot, 0x7a5232);
  for (const lx of [-1.7, 1.7])
    for (const lz of [-0.55, 0.55]) {
      const p = localToWorld(x, z, rot, lx, lz);
      addCylinderGeom(buckets.wood, p.x, y, p.z, 0.055, 0.07, 2.35, 6, 0, DARK_WOOD);
    }
  addAwning(buckets, x, y + 2.25, z, rot, 4.2, 1.9, cloth, LIMESTONE_LIGHT);
  for (const lx of [-1.2, -0.35, 0.5, 1.25]) {
    const p = localToWorld(x, z, rot, lx, -0.1);
    addBox(buckets, 'metal', p.x, y + 0.78, p.z, 0.58, 0.06, 0.18, rot + 0.2, 0xa7c9c6);
  }
}

function addAwningStall(
  buckets: Buckets,
  colliders: ColliderSet,
  x: number,
  y: number,
  z: number,
  rot: number,
  a: number,
  b: number,
): void {
  addBox(buckets, 'wood', x, y, z, 3.8, 0.16, 1.3, rot, DARK_WOOD);
  addBox(buckets, 'wood', x, y + 0.7, z, 3.6, 0.2, 1.2, rot, 0x805333);
  for (const lx of [-1.7, 1.7])
    for (const lz of [-0.55, 0.55]) {
      const p = localToWorld(x, z, rot, lx, lz);
      addCylinderGeom(buckets.wood, p.x, y, p.z, 0.06, 0.07, 2.55, 6, 0, DARK_WOOD);
    }
  addAwning(buckets, x, y + 2.35, z, rot, 4.1, 2.0, a, b);
  colliders.boxes.push({ x, z, hx: 2.2, hz: 0.9, rot, height: 1.0 });
}

function addAwning(
  buckets: Buckets,
  x: number,
  y: number,
  z: number,
  rot: number,
  w: number,
  d: number,
  a: number,
  b: number,
): void {
  const stripes = 6;
  for (let i = 0; i < stripes; i += 1) {
    const lx = -w / 2 + (i + 0.5) * (w / stripes);
    const p = localToWorld(x, z, rot, lx, -d * 0.25);
    addBox(buckets, 'cloth', p.x, y, p.z, w / stripes + 0.03, 0.08, d, rot, i % 2 ? a : b, -0.18);
  }
  addTube(
    buckets.wood,
    0.055,
    { x: x - Math.cos(rot) * w * 0.55, y: y + 0.05, z: z + Math.sin(rot) * w * 0.55 },
    { x: x + Math.cos(rot) * w * 0.55, y: y + 0.05, z: z - Math.sin(rot) * w * 0.55 },
    DARK_WOOD,
    6,
  );
}

function addHangingSign(
  buckets: Buckets,
  colliders: ColliderSet,
  x: number,
  y: number,
  z: number,
  rot: number,
  board: number,
  icon: number,
): void {
  addTube(
    buckets.metal,
    0.045,
    { x, y: y + 1.2, z },
    { x: x + Math.cos(rot) * 1.4, y: y + 1.2, z: z - Math.sin(rot) * 1.4 },
    METAL,
    6,
  );
  addTube(
    buckets.rope,
    0.035,
    { x: x + Math.cos(rot) * 1.2, y: y + 1.2, z: z - Math.sin(rot) * 1.2 },
    { x: x + Math.cos(rot) * 1.2, y: y + 0.2, z: z - Math.sin(rot) * 1.2 },
    0x8a6642,
    6,
  );
  addBox(
    buckets,
    'wood',
    x + Math.cos(rot) * 1.2,
    y - 0.55,
    z - Math.sin(rot) * 1.2,
    1.5,
    1.2,
    0.12,
    rot,
    board,
  );
  addDiscVertical(
    buckets,
    'metal',
    x + Math.cos(rot) * 1.2,
    y - 0.05,
    z - Math.sin(rot) * 1.2 - 0.08,
    rot,
    0.42,
    icon,
  );
  colliders.boxes.push({
    x: x + Math.cos(rot) * 1.2,
    z: z - Math.sin(rot) * 1.2,
    hx: 0.9,
    hz: 0.3,
    rot,
    height: 1.5,
  });
}

function addTableSet(
  buckets: Buckets,
  colliders: ColliderSet,
  x: number,
  y: number,
  z: number,
  rot: number,
): void {
  addCylinderGeom(buckets.wood, x, y, z, 0.72, 0.72, 0.12, 14, 0, 0x7e5130);
  addCylinderGeom(buckets.wood, x, y, z, 0.12, 0.14, 0.72, 8, 0, DARK_WOOD);
  for (let i = 0; i < 4; i += 1) {
    const a = rot + (i / 4) * Math.PI * 2;
    addBench(buckets, colliders, x + Math.sin(a) * 1.45, y, z + Math.cos(a) * 1.45, a + Math.PI / 2);
  }
  colliders.circles.push({ x, z, r: 0.85 });
}

function addBench(
  buckets: Buckets,
  colliders: ColliderSet,
  x: number,
  y: number,
  z: number,
  rot: number,
): void {
  addBox(buckets, 'wood', x, y + 0.55, z, 1.85, 0.18, 0.42, rot, 0x815635);
  addBox(buckets, 'wood', x, y + 0.95, z + Math.cos(rot) * 0.25, 1.85, 0.52, 0.16, rot, 0x6b4427);
  for (const lx of [-0.72, 0.72])
    for (const lz of [-0.12, 0.12]) {
      const p = localToWorld(x, z, rot, lx, lz);
      addBox(buckets, 'wood', p.x, y, p.z, 0.12, 0.55, 0.12, rot, DARK_WOOD);
    }
  colliders.boxes.push({ x, z, hx: 1.05, hz: 0.42, rot, height: 1.2 });
}

function addBenchSeat(buckets: Buckets, x: number, y: number, z: number, heading: number, s: number): number {
  const seatY = y + 0.46 * s;
  addBox(buckets, 'wood', x, seatY, z, 1.65 * s, 0.16 * s, 0.48 * s, heading, 0x7a5232);
  addBox(
    buckets,
    'wood',
    x - Math.sin(heading) * 0.28 * s,
    seatY + 0.38 * s,
    z - Math.cos(heading) * 0.28 * s,
    1.6 * s,
    0.48 * s,
    0.12 * s,
    heading,
    0x6b4427,
  );
  for (const lx of [-0.62, 0.62])
    for (const lz of [-0.14, 0.14]) {
      const p = localToWorld(x, z, heading, lx * s, lz * s);
      addBox(buckets, 'wood', p.x, y, p.z, 0.1 * s, 0.46 * s, 0.1 * s, heading, DARK_WOOD);
    }
  return seatY + 0.16 * s;
}

function addStringLanterns(
  buckets: Buckets,
  a: { x: number; y: number; z: number },
  b: { x: number; y: number; z: number },
  count: number,
): void {
  addSagRope(buckets, a, b);
  for (let i = 1; i < count; i += 1) {
    const t = i / count;
    const x = a.x + (b.x - a.x) * t;
    const z = a.z + (b.z - a.z) * t;
    const sag = Math.sin(t * Math.PI) * 0.7;
    const y = a.y + (b.y - a.y) * t - sag;
    addTube(buckets.rope, 0.025, { x, y: y + 0.1, z }, { x, y: y - 0.12, z }, 0x8a6642, 5);
    addCylinderGeom(buckets.glow, x, y - 0.45, z, 0.16, 0.13, 0.34, 8, 0, 0xffa352);
  }
}

function addHangingLaundry(
  buckets: Buckets,
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
): void {
  addSagRope(buckets, { x: ax, y: ay, z: az }, { x: bx, y: by, z: bz });
  for (let i = 1; i <= 4; i += 1) {
    const t = i / 5;
    const x = ax + (bx - ax) * t;
    const y = ay + (by - ay) * t - Math.sin(t * Math.PI) * 0.45;
    const z = az + (bz - az) * t;
    addBox(
      buckets,
      'cloth',
      x,
      y - 0.7,
      z,
      0.82,
      0.95,
      0.04,
      Math.atan2(bx - ax, bz - az),
      [CLOTH_BLUE, LIMESTONE_LIGHT, CLOTH_RED, CLOTH_GREEN][i - 1]!,
      0.04,
    );
  }
}

function addCypress(
  buckets: Buckets,
  colliders: ColliderSet,
  x: number,
  y: number,
  z: number,
  s: number,
): void {
  addCylinderGeom(buckets.wood, x, y, z, 0.16 * s, 0.2 * s, 2.4 * s, 6, 0, 0x5a3924);
  addCone(buckets.cloth, x, y + 1.35 * s, z, 1.0 * s, 4.4 * s, 8, 0, CYPRESS);
  addCone(buckets.cloth, x, y + 3.0 * s, z, 0.78 * s, 3.6 * s, 8, 0, 0x0f341f);
  addCone(buckets.cloth, x, y + 4.4 * s, z, 0.55 * s, 2.6 * s, 8, 0, 0x194b2b);
  colliders.circles.push({ x, z, r: 0.42 * s });
}

function addPottedCypress(
  buckets: Buckets,
  colliders: ColliderSet,
  x: number,
  y: number,
  z: number,
  s: number,
): void {
  addCylinderGeom(buckets.stone, x, y, z, 0.55 * s, 0.72 * s, 0.72 * s, 8, 0, 0x8e6846);
  addCypress(buckets, colliders, x, y + 0.7 * s, z, s * 0.66);
}

function addOliveTree(
  buckets: Buckets,
  colliders: ColliderSet,
  x: number,
  y: number,
  z: number,
  s: number,
): void {
  addCylinderGeom(buckets.wood, x, y, z, 0.22 * s, 0.33 * s, 2.2 * s, 6, 0.15, 0x5a3a25);
  addSphere(buckets.cloth, x, y + 2.75 * s, z, 1.6 * s, 1.0 * s, 1.45 * s, OLIVE_SILVER, 6, 4);
  addSphere(
    buckets.cloth,
    x - 0.92 * s,
    y + 2.45 * s,
    z + 0.28 * s,
    1.15 * s,
    0.78 * s,
    1.0 * s,
    OLIVE,
    6,
    4,
  );
  addSphere(
    buckets.cloth,
    x + 0.9 * s,
    y + 2.55 * s,
    z - 0.18 * s,
    1.05 * s,
    0.72 * s,
    1.15 * s,
    0x738753,
    6,
    4,
  );
  colliders.circles.push({ x, z, r: 0.62 * s });
}

function addBougainvillea(buckets: Buckets, x: number, y: number, z: number, rot: number, s: number): void {
  // A climbing vine: a woody stem from the ground, a mass of leaves over the door, and cascades of
  // magenta, cerise and coral bracts spilling down one side.
  const seed = Math.abs(Math.round(x * 13.1 + z * 7.7));
  const r = (i: number) => {
    const v = Math.sin(seed * 0.173 + i * 12.9898) * 43758.5453;
    return v - Math.floor(v);
  };
  const bracts = [BOUGAINVILLEA, 0xd51c91, 0xe0337f, 0xc2187a, 0xee5a7a];
  const ground = y - 2.2;
  const stem = localToWorld(x, z, rot, -1.5 * s, 0.12);
  addTube(
    buckets.rope,
    0.06 * s,
    { x: stem.x, y: ground, z: stem.z },
    { x: stem.x, y: y + 0.6 * s, z: stem.z },
    0x4a3524,
    4,
  );
  for (let i = 0; i < 16; i += 1) {
    // Spread along the top of the door and down the stem side, thicker near the top.
    const along = r(i) * 3.4 - 1.9;
    const drop = Math.pow(r(i + 40), 1.6) * (along < -0.8 ? 2.4 : 0.9);
    const p = localToWorld(x, z, rot, along * s, 0.1 + r(i + 80) * 0.22);
    const leafy = i % 4 === 0;
    const size = (leafy ? 0.46 : 0.34 + r(i + 120) * 0.22) * s;
    addSphere(
      buckets.cloth,
      p.x,
      y + 0.5 * s - drop * s,
      p.z,
      size,
      size * 0.8,
      size * 0.7,
      leafy ? 0x2f5a2a : bracts[i % bracts.length]!,
      5,
      2,
    );
  }
}

function addTelescope(
  buckets: Buckets,
  colliders: ColliderSet,
  x: number,
  y: number,
  z: number,
  heading: number,
): void {
  addCylinderGeom(buckets.metal, x, y, z, 0.12, 0.16, 1.1, 8, 0, METAL);
  const a = { x, y: y + 1.3, z };
  const b = { x: x + Math.sin(heading) * 2.0, y: y + 1.8, z: z + Math.cos(heading) * 2.0 };
  addTube(buckets.metal, 0.18, a, b, 0x4a3c2b, 12);
  addCylinderGeom(buckets.metal, b.x, b.y - 0.1, b.z, 0.34, 0.28, 0.55, 12, heading, 0x2c2f2e);
  colliders.circles.push({ x, z, r: 0.45 });
}

function addPediment(
  buckets: Buckets,
  x: number,
  y: number,
  z: number,
  w: number,
  h: number,
  rot: number,
  colour: number,
): void {
  const hw = w * 0.5;
  const d = 0.65;
  const p = [-hw, 0, -d, hw, 0, -d, 0, h, -d, -hw, 0, d, hw, 0, d, 0, h, d];
  const indices = [0, 1, 2, 3, 5, 4, 0, 3, 1, 1, 3, 4, 1, 4, 5, 1, 5, 2, 2, 5, 3, 2, 3, 0];
  const geom = trianglePrism(p, indices, colour);
  transform(geom, x, y, z, rot, 0, 0, 1, 1, 1);
  buckets.stone.push(geom);
}

function trianglePrism(positions: number[], indices: number[], colour: number): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  worldUv(g, 1.4);
  paint(g, colour);
  return g;
}

function addDiscPaving(
  buckets: Buckets,
  x: number,
  y: number,
  z: number,
  r: number,
  colour: number,
  segments: number,
): void {
  buckets.paving.push(disc(r, { x, y, z, rx: -Math.PI / 2 }, colour, segments));
}

function addDiscVertical(
  buckets: Buckets,
  key: MaterialKey,
  x: number,
  y: number,
  z: number,
  rot: number,
  r: number,
  colour: number,
): void {
  buckets[key].push(disc(r, { x, y, z, ry: rot, rx: 0 }, colour, 28));
}

function addCopingJoint(buckets: Buckets, x: number, y: number, z: number, rot: number): void {
  addBox(buckets, 'stone', x, y + 0.26, z, 0.12, 0.08, 0.76, rot, 0x826344);
}

function addQuayEdgeCoping(buckets: Buckets, x0: number, x1: number, y: number, z: number): void {
  const w = x1 - x0;
  if (w <= 0.1) return;
  addBox(buckets, 'stone', (x0 + x1) * 0.5, y, z, w + 0.4, 0.34, 0.8, 0, LIMESTONE_LIGHT);
}

function addQuayEdgeWall(colliders: ColliderSet, x0: number, x1: number, z: number): void {
  const w = x1 - x0;
  if (w <= 0.1) return;
  addPlayerWall(colliders, (x0 + x1) * 0.5, z, w * 0.5, 0.24, 0, 0.7);
}

function addPlayerWall(
  colliders: ColliderSet,
  x: number,
  z: number,
  hx: number,
  hz: number,
  rot: number,
  height: number,
): void {
  colliders.boxes.push({ x, z, hx, hz, rot, height });
}

function addBox(
  buckets: Buckets,
  key: MaterialKey,
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
  buckets[key].push(geoBox(w, h, d, { x, y, z, ry, rx, rz }, key === 'paving' ? 0xffffff : colour, 1.8));
}

function addBoxTo(
  target: BufferGeometry[],
  x: number,
  y: number,
  z: number,
  w: number,
  h: number,
  d: number,
  ry: number,
  colour: number,
): void {
  target.push(geoBox(w, h, d, { x, y, z, ry }, colour, 1.8));
}

function addCylinderGeom(
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
  target.push(geoCylinder(rTop, rBottom, h, { x, y, z, ry }, colour, segments));
}

function addCone(
  target: BufferGeometry[],
  x: number,
  y: number,
  z: number,
  radius: number,
  h: number,
  segments: number,
  ry: number,
  colour: number,
): void {
  const g = new ConeGeometry(radius, h, segments, 1);
  g.translate(0, h / 2, 0);
  transform(g, x, y, z, ry, 0, 0, 1, 1, 1);
  worldUv(g, 1.5);
  paint(g, colour);
  target.push(g);
}

function addSphere(
  target: BufferGeometry[],
  x: number,
  y: number,
  z: number,
  sx: number,
  sy: number,
  sz: number,
  colour: number,
  ws: number,
  hs: number,
): void {
  target.push(sphereGeometry(x, y, z, sx, sy, sz, colour, ws, hs));
}

function sphereGeometry(
  x: number,
  y: number,
  z: number,
  sx: number,
  sy: number,
  sz: number,
  colour: number,
  ws: number,
  hs: number,
): BufferGeometry {
  const g = new SphereGeometry(1, ws, hs);
  transform(g, x, y, z, 0, 0, 0, sx, sy, sz);
  worldUv(g, 0.8);
  paint(g, colour);
  return g;
}

function addTorusGeom(
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
  const g = new TorusGeometry(radius, tube, 6, segments);
  transform(g, x, y, z, ry, rx, rz, 1, 1, 1);
  worldUv(g, 0.8);
  paint(g, colour);
  target.push(g);
}

function addTube(
  target: BufferGeometry[],
  radius: number,
  a: { x: number; y: number; z: number },
  b: { x: number; y: number; z: number },
  colour: number,
  segments: number,
): void {
  target.push(tubeBetween(radius, a, b, colour, segments));
}

function addSagRope(
  buckets: Buckets,
  a: { x: number; y: number; z: number },
  b: { x: number; y: number; z: number },
): void {
  const mid = {
    x: (a.x + b.x) * 0.5,
    y: (a.y + b.y) * 0.5 - Math.hypot(a.x - b.x, a.z - b.z) * 0.025,
    z: (a.z + b.z) * 0.5,
  };
  addTube(buckets.rope, 0.045, a, mid, 0x8a6642, 8);
  addTube(buckets.rope, 0.045, mid, b, 0x8a6642, 8);
}

function disc(
  r: number,
  p: { x: number; y: number; z: number; rx?: number; ry?: number; rz?: number },
  colour: number,
  segments = 24,
): BufferGeometry {
  const g = new CircleGeometry(r, segments);
  g.rotateX(p.rx ?? 0);
  g.rotateY(p.ry ?? 0);
  g.rotateZ(p.rz ?? 0);
  g.translate(p.x, p.y, p.z);
  paint(g, colour);
  return g;
}

function stairsHeightAt(_span: StairSpan, _x: number, _z: number): number | null {
  void _span;
  void _x;
  void _z;
  return null;
}

function stairStreetHeight(x: number, z: number): number | null {
  if (Math.abs(x - STAIR_STREET.x) > STAIR_STREET.width * 0.5) return null;
  if (z > STAIR_STREET.z0 + 0.35 || z < STAIR_STREET.z1 - 0.35) return null;
  const t = Math.max(0, Math.min(1, (STAIR_STREET.z0 - z) / (STAIR_STREET.z0 - STAIR_STREET.z1)));
  const step = Math.min(STAIR_STREET.steps, Math.max(0, Math.ceil(t * STAIR_STREET.steps)));
  return (
    MERIDIAN.harbor.quay.height + ((PLAZA.height - MERIDIAN.harbor.quay.height) * step) / STAIR_STREET.steps
  );
}

function laneHeight(x: number, z: number): number | null {
  if (Math.abs(x - TAVERN_LANE.x) > TAVERN_LANE.width * 0.5) return null;
  if (z > TAVERN_LANE.z0 + 0.4 || z < TAVERN_LANE.z1 - 0.4) return null;
  const t = Math.max(0, Math.min(1, (TAVERN_LANE.z0 - z) / (TAVERN_LANE.z0 - TAVERN_LANE.z1)));
  return MERIDIAN.harbor.quay.height + (TAVERN_PAD.height - MERIDIAN.harbor.quay.height) * t;
}

function tavernStageHeight(x: number, z: number): number | null {
  if (Math.abs(x - 618.4) <= 4.35 && Math.abs(z + 788.4) <= 2.1) return TAVERN_PAD.height + 0.6;
  return null;
}

function terraceLaneHeight(x: number, z: number): number | null {
  const rows = [HARBOUR_FRONT_ROW, ...TERRACE_ROWS] as const;
  for (const row of rows) {
    if (x < row.x0 - 0.5 || x > row.x1 + 0.5) continue;
    if (Math.abs(z - row.laneZ) <= row.laneWidth * 0.5 + 0.25) return row.height;
  }
  return null;
}

function terraceStairHeight(x: number, z: number): number | null {
  for (const stair of TERRACE_STAIR_STREETS) {
    if (Math.abs(x - stair.x) > stair.width * 0.5) continue;
    if (z > stair.z0 + 0.35 || z < stair.z1 - 0.35) continue;
    const t = Math.max(0, Math.min(1, (stair.z0 - z) / (stair.z0 - stair.z1)));
    const step = Math.min(stair.steps, Math.max(0, Math.ceil(t * stair.steps)));
    return stair.y0 + ((stair.y1 - stair.y0) * step) / stair.steps;
  }
  return null;
}

/**
 * The Hall of Records' podium (addHallOfRecords): the portico paving on top (40.6 at the citadel's
 * 40) and the stone base behind it (40.45). Within one step up (0.66 m) of the citadel floor, so you
 * walk straight up onto it; without this you walked through it at floor level, sunk to the knees.
 */
function hallPodiumHeight(x: number, z: number): number | null {
  const dx = x - HALL_OF_RECORDS.x;
  const dz = z - HALL_OF_RECORDS.z;
  if (Math.abs(dx) <= 8.1 && dz >= -6.75 && dz <= -3.05) return CITADEL.height + 0.6;
  if (Math.abs(dx) <= 8.5 && dz >= -5.65 && dz <= 5.15) return CITADEL.height + 0.45;
  return null;
}

function citadelWalkable(x: number, z: number): number | null {
  const podium = hallPodiumHeight(x, z);
  if (podium !== null) return podium;
  const dx = (x - CITADEL.x) / CITADEL.r;
  const dz = (z - CITADEL.z) / (CITADEL.r * 0.78);
  if (dx * dx + dz * dz < 0.95) return CITADEL.height;
  if (Math.abs(x - LIFT_TOP.x) <= 4.0 && Math.abs(z - LIFT_TOP.z) <= 3.2) return LIFT_TOP.y;
  if (Math.abs(x - 792.8) <= 7.2 && Math.abs(z + 812.8) <= 4.2) return CITADEL.height + 0.35;
  return null;
}

function moleWalkable(x: number, z: number): number | null {
  const d = segmentDistance(
    x,
    z,
    MERIDIAN.mole.start.x,
    MERIDIAN.mole.start.z,
    MERIDIAN.mole.end.x,
    MERIDIAN.mole.end.z,
  );
  if (d <= MERIDIAN.mole.width * 0.72) return MERIDIAN.mole.height;
  if (
    Math.hypot(x - MERIDIAN.mole.lighthouse.x, z - MERIDIAN.mole.lighthouse.z) <=
    MERIDIAN.mole.lighthouse.radius
  )
    return MERIDIAN.mole.height;
  return null;
}

function shipyardSlipHeight(x: number, z: number): number | null {
  const rot = -15 * DEG;
  const [lx, lz] = toLocal(579.4, -742.2, rot, x, z);
  if (Math.abs(lx) > 5 || Math.abs(lz) > 11.5) return null;
  const t = Math.max(0, Math.min(1, (lz + 11.5) / 23));
  return -0.9 + (MERIDIAN.harbor.quay.height + 0.2) * t;
}

function inBox(x: number, z: number, b: { x0: number; x1: number; z0: number; z1: number }): boolean {
  return x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1;
}

function toLocal(cx: number, cz: number, rot: number, x: number, z: number): [number, number] {
  const dx = x - cx;
  const dz = z - cz;
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  return [dx * c - dz * s, dx * s + dz * c];
}

function houseBaseY(x: number, z: number, heightField: HeightField): number {
  const q = meridianQuayHeight(x, z);
  return q ?? heightField.heightAt(x, z);
}

function footprintMinY(
  x: number,
  z: number,
  rot: number,
  footprint: HouseFootprint,
  heightField: HeightField,
): number {
  let min = Number.POSITIVE_INFINITY;
  for (const lx of [-footprint.w / 2, footprint.w / 2]) {
    for (const lz of [-footprint.d / 2, footprint.d / 2]) {
      const p = localToWorld(x, z, rot, lx, lz);
      min = Math.min(min, heightField.heightAt(p.x, p.z));
    }
  }
  return Math.min(min, houseBaseY(x, z, heightField));
}

function countTownBuildings(): number {
  return 92;
}

function triangleCount(geometry: BufferGeometry): number {
  return geometry.index ? geometry.index.count / 3 : geometry.getAttribute('position').count / 3;
}

function disposeTree(root: Object3D): void {
  root.traverse((o) => {
    const m = o as Object3D & { geometry?: { dispose(): void }; material?: Material | Material[] };
    m.geometry?.dispose();
    const materials = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
    for (const material of materials) if (material.userData.meridianOwned) material.dispose();
  });
}
