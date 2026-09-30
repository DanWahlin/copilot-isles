import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Camera,
  CircleGeometry,
  ConeGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicNodeMaterial,
  Object3D,
  SphereGeometry,
  TorusGeometry,
  Vector3,
  type Material,
} from 'three/webgpu';
import { color, float, smoothstep, uv } from 'three/tsl';
import type { TierSettings } from '../../engine/quality';
import type { CircleObstacle, HeightField } from '../contracts';
import { box as geoBox, cylinder as geoCylinder, merge, tubeBetween, worldUv } from '../sites/geo';
import { MERIDIAN, meridianQuayHeight } from '../islands/meridian';
import {
  localToWorld,
  makeBuckets,
  paint,
  transform,
  type MaterialKey,
  type VillageAnchor,
  type VillageBoxCollider,
  type VillageKit,
} from '../village';

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
  shipObstacles: CircleObstacle[];
  walkable(x: number, z: number): number | null;
  anchors: Record<string, MeridianAnchor>;
  metrics: MeridianTownMetrics;
  setLighthouseLit(on: boolean): void;
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
type ColliderSet = { circles: CircleObstacle[]; boxes: VillageBoxCollider[] };

type BasicAnchor = {
  x: number;
  y?: number;
  z: number;
  heading: number;
  tx?: number;
  ty?: number;
  tz?: number;
};

// TSL's fluent typings don't cover radial billboard math on MeshBasicNodeMaterial.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyNode = any;

const DEG = Math.PI / 180;
const TERRACOTTA = 0xffa040;
const TERRACOTTA_DARK = 0xe58e42;
const TERRACOTTA_WARM = 0xffad48;
const LIMESTONE_LIGHT = 0xf0d7aa;
const LIMESTONE_DARK = 0x91704c;
const OCHRE = 0xc07b35;
const CREAM = 0xe0bc7a;
const ROSE = 0xc06a69;
const APRICOT = 0xd99a5f;
const WHITEWASH = 0xf3e4be;
const SAFFRON = 0xd28a32;
const DEEP_BLUE = 0x174b75;
const DEEP_GREEN = 0x1f5c43;
const CYPRESS = 0x173f26;
const OLIVE = 0x6f814c;
const OLIVE_SILVER = 0x9aa876;
const BOUGAINVILLEA = 0xb01377;
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
const PLAZA = { x0: 638, x1: 698, z0: -819, z1: -780, height: MERIDIAN.pads.plaza.height } as const;
const TAVERN_PAD = { x0: 607, x1: 637, z0: -813, z1: -779, height: MERIDIAN.pads.tavern.height } as const;
const CITADEL = { x: MERIDIAN.pads.citadel.x, z: MERIDIAN.pads.citadel.z, r: 39, height: 40 } as const;
const LIFT_BOTTOM = { x: 770.3, z: -766.8, y: MERIDIAN.harbor.quay.height } as const;
const LIFT_TOP = { x: 798.2, z: -779.2, y: 40.35 } as const;

interface TerraceRowSpec {
  id: string;
  x0: number;
  x1: number;
  houseZ: number;
  laneZ: number;
  height: number;
  laneWidth: number;
  seed: number;
  gaps?: readonly { x0: number; x1: number }[];
}

interface TerraceStairStreet {
  x: number;
  z0: number;
  z1: number;
  y0: number;
  y1: number;
  width: number;
  steps: number;
}

const HARBOUR_FRONT_ROW: TerraceRowSpec = {
  id: 'harbour-front',
  x0: 594,
  x1: 758,
  houseZ: -786.2,
  laneZ: -778.8,
  height: PLAZA.height,
  laneWidth: 4.2,
  seed: 520,
  gaps: [{ x0: 638, x1: 682 }],
} as const;

const TERRACE_ROWS: readonly TerraceRowSpec[] = [
  {
    id: 'plaza-upper',
    x0: 586,
    x1: 756,
    houseZ: -848,
    laneZ: -839.8,
    height: 10.8,
    laneWidth: 3.8,
    seed: 620,
    gaps: [
      { x0: 640, x1: 699 },
      { x0: 607, x1: 615 },
      { x0: 727, x1: 735 },
    ],
  },
  {
    id: 'lower-ochre',
    x0: 592,
    x1: 780,
    houseZ: -870,
    laneZ: -861.8,
    height: 14.2,
    laneWidth: 3.7,
    seed: 700,
    gaps: [
      { x0: 606, x1: 614 },
      { x0: 664, x1: 672 },
      { x0: 728, x1: 736 },
    ],
  },
  {
    id: 'middle-salmon',
    x0: 604,
    x1: 792,
    houseZ: -892,
    laneZ: -883.8,
    height: 17.8,
    laneWidth: 3.7,
    seed: 780,
    gaps: [
      { x0: 606, x1: 614 },
      { x0: 664, x1: 672 },
      { x0: 728, x1: 736 },
      { x0: 782, x1: 790 },
    ],
  },
  {
    id: 'upper-cream',
    x0: 620,
    x1: 804,
    houseZ: -914,
    laneZ: -905.8,
    height: 21.4,
    laneWidth: 3.8,
    seed: 860,
    gaps: [
      { x0: 606, x1: 614 },
      { x0: 664, x1: 672 },
      { x0: 728, x1: 736 },
      { x0: 782, x1: 790 },
    ],
  },
  {
    id: 'citadel-foot',
    x0: 650,
    x1: 812,
    houseZ: -936,
    laneZ: -927.8,
    height: 25.0,
    laneWidth: 3.6,
    seed: 940,
    gaps: [
      { x0: 664, x1: 672 },
      { x0: 728, x1: 736 },
      { x0: 782, x1: 790 },
    ],
  },
  {
    id: 'top-whitewash',
    x0: 700,
    x1: 812,
    houseZ: -956,
    laneZ: -947.8,
    height: 28.6,
    laneWidth: 3.5,
    seed: 1020,
    gaps: [{ x0: 782, x1: 790 }],
  },
] as const;

const TERRACE_STAIR_STREETS: readonly TerraceStairStreet[] = [
  { x: 610, z0: -840, z1: -938, y0: 10.8, y1: 25.0, width: 4.4, steps: 25 },
  { x: 668, z0: -851, z1: -938, y0: 10.8, y1: 25.0, width: 4.2, steps: 22 },
  { x: 732, z0: -840, z1: -958, y0: 10.8, y1: 28.6, width: 4.4, steps: 30 },
  { x: 786, z0: -852, z1: -958, y0: 10.8, y1: 28.6, width: 4.2, steps: 27 },
] as const;

export function createMeridianTown({
  tier,
  heightField,
  kit,
}: CreateMeridianTownOptions): MeridianTownSystem {
  const group = new Group();
  group.name = 'port-meridian-town';

  const buckets = makeBuckets();
  const colliders: ColliderSet = { circles: [], boxes: [] };
  const shipObstacles: CircleObstacle[] = [];
  const anchors: Record<string, MeridianAnchor> = {};
  const perches: Vector3[] = [];
  const stairSpans: StairSpan[] = [];
  const low = tier.tier === 'lite' || tier.tier === 'low';
  const mediumUp = tier.tier !== 'lite' && tier.tier !== 'low';
  const high = tier.tier === 'high' || tier.tier === 'ultra';
  const liftCar = new Group();
  liftCar.name = 'meridian-lift-car';
  const lighthouseGlow = new Group();
  lighthouseGlow.name = 'meridian-lighthouse-glow';
  lighthouseGlow.visible = false;

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

  addHarbour(buckets, colliders, shipObstacles, perches, low);
  addMoleAndLighthouse(buckets, colliders, shipObstacles, perches, kit, lighthouseGlow, anchor);
  addHarbourFront(buckets, colliders, stairSpans, perches, heightField, kit, low, anchor);
  addStairStreet(buckets, colliders);
  addPlaza(buckets, colliders, perches, heightField, kit, low, high, anchor);
  addTavern(buckets, colliders, stairSpans, perches, heightField, kit, low, high, anchor);
  addShipyard(buckets, colliders, shipObstacles, perches, heightField, low, mediumUp, anchor);
  addLift(buckets, colliders, kit, liftCar, anchor);
  addCitadel(buckets, colliders, stairSpans, perches, heightField, kit, low, high, anchor);
  addTerraceHouses(buckets, colliders, stairSpans, perches, heightField, kit, low, high);
  addDenseHillsideTown(buckets, colliders, stairSpans, perches, heightField, kit, low, high);
  addVegetation(buckets, colliders, perches, heightField, low, high);

  anchor('rhea', { x: 761.4, z: -699.2, heading: -Math.PI / 2, tx: 755.2, ty: 3.8, tz: -704 });
  anchor('crateYard', { x: 594.2, z: -759.2, heading: Math.PI / 2, tx: 586, ty: 3, tz: -752 });

  group.add(lighthouseGlow, liftCar);
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
    colliders,
    shipObstacles,
    walkable: townWalkable,
    anchors,
    metrics,
    setLighthouseLit(on: boolean): void {
      lighthouseGlow.visible = on;
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
  addBox(
    buckets,
    'stone',
    (quay.x0 + quay.x1) / 2,
    deck,
    quay.z1 - 0.15,
    quay.x1 - quay.x0 + 0.8,
    0.34,
    0.8,
    0,
    LIMESTONE_LIGHT,
  );
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
  addPlayerWall(colliders, (quay.x0 + quay.x1) / 2, quay.z1 - 0.2, (quay.x1 - quay.x0) / 2, 0.24, 0, 0.7);
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

  for (let x = quay.x0 + 2; x <= quay.x1 - 2; x += 7.5) {
    if (x > 735 && x < 758) continue;
    shipObstacles.push({ x, z: quay.z1 - 1.2, r: 1.55 });
  }
  for (let z = eastArm.z1 + 6; z <= eastArm.z0 - 5; z += 8) {
    if (z > -726 && z < -675) continue;
    shipObstacles.push({ x: eastArm.x1 + 1.2, z, r: 1.6 });
  }
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

  const litMaterial = new MeshBasicNodeMaterial({
    transparent: true,
    opacity: 0.88,
    vertexColors: true,
    blending: AdditiveBlending,
    depthWrite: false,
  });
  litMaterial.name = 'meridian-lighthouse-lit-material';
  litMaterial.userData.meridianOwned = true;
  const glow = new Mesh(
    merge([
      geoCylinder(2.45, 2.45, 1.55, { x: l.x, y: m.height + 15.9, z: l.z }, 0xfff1a6, 18),
      sphereGeometry(l.x, m.height + 16.6, l.z, 2.4, 1.2, 2.4, 0xfff4b0, 16, 8),
    ]),
    litMaterial,
  );
  glow.name = 'meridian-lighthouse-lit-disc';
  const haloMaterial = new MeshBasicNodeMaterial({
    transparent: true,
    opacity: 0.92,
    blending: AdditiveBlending,
    depthWrite: false,
    depthTest: false,
    side: DoubleSide,
  });
  haloMaterial.name = 'meridian-lighthouse-halo-billboard-material';
  haloMaterial.userData.meridianOwned = true;
  const coord = uv() as AnyNode;
  const d = coord.sub(0.5).length();
  const alpha = smoothstep(float(0.5), float(0.0), d);
  haloMaterial.opacityNode = alpha.mul(0.72);
  haloMaterial.colorNode = color(0xffefaa).mul(alpha.mul(0.65).add(0.35));
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
  colliders.boxes.push({ x: 579.4, z: -743.8, hx: 4.9, hz: 12.5, rot: -15 * DEG, height: 0.35 });
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
  addRoundTower(buckets, colliders, perches, 820, y, -752, 4.2, 9.6, true);
  addRoundTower(buckets, colliders, perches, 842, y, -796, 4.8, 10.8, true);
  addCitadelGate(buckets, colliders, 784, y, -800, -35 * DEG);

  addObservatory(buckets, colliders, perches, 826.5, y, -804.5);
  anchor('oren', { x: 821.4, y, z: -800.2, heading: 2.35, tx: 826.5, ty: y + 6.2, tz: -804.5 });

  addHallOfRecords(buckets, colliders, perches, 809.3, y, -778.0, kit, stairSpans);
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

function addTerraceHouses(
  buckets: Buckets,
  colliders: ColliderSet,
  stairSpans: StairSpan[],
  perches: Vector3[],
  heightField: HeightField,
  kit: VillageKit,
  low: boolean,
  high: boolean,
): void {
  void low;
  let previousHeight: number = PLAZA.height;
  for (const row of TERRACE_ROWS) {
    addTerraceRetainingWall(buckets, row, previousHeight);
    addLanePaving(buckets, row);
    addTerraceHouseRun(buckets, colliders, stairSpans, perches, heightField, kit, row, { arcade: false });
    addTerraceHouseRun(buckets, colliders, stairSpans, perches, heightField, kit, row, {
      arcade: false,
      backRow: true,
    });
    previousHeight = row.height;
  }
  for (const stair of TERRACE_STAIR_STREETS) addTerraceStairStreet(buckets, colliders, stair);
  addTownEdgeInfill(buckets, colliders, stairSpans, perches, heightField, kit, low, high);
  addTerraceGardenPots(buckets, colliders, heightField, high);
}

const MEDITERRANEAN_TINTS = [
  WHITEWASH,
  LIMESTONE_LIGHT,
  CREAM,
  OCHRE,
  SAFFRON,
  APRICOT,
  ROSE,
  0xd7a66f,
] as const;
const ROOF_TINTS = [TERRACOTTA_WARM, TERRACOTTA, TERRACOTTA_DARK, 0xf49a46, 0xffb24d, 0xef9650] as const;

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
  addBox(buckets, 'paving', midX, row.height - 0.08, row.laneZ, length, 0.16, row.laneWidth, 0, 0xf0d7aa);
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
  const widths: readonly (4 | 6 | 8)[] = [6, 4, 6, 8, 4, 6, 6, 8, 4, 6];
  let x = row.x0 + (options.backRow ? 2.2 : 0);
  let index = 0;
  const stopX = row.x1 - (options.backRow ? 2.2 : 0);
  while (x < stopX - 3.8) {
    const containing = rowGapContaining(row, x + 0.1);
    if (containing) {
      if (options.arcade) addArcadeBridge(buckets, containing.x0, containing.x1, row);
      x = containing.x1;
      continue;
    }
    const nextGap = nextRowGapStart(row, x);
    const runEnd = Math.min(stopX, nextGap ?? stopX);
    const available = runEnd - x;
    const width = houseWidthForAvailable(widths[(row.seed + index) % widths.length]!, available);
    if (width === null) {
      x = runEnd + 0.01;
      continue;
    }
    const seed = row.seed + index;
    const depth: 6 | 8 = seed % 4 === 0 || width === 8 ? 8 : 6;
    const centerX = x + width * 0.5;
    const setback = ((seed % 4) - 1.5) * 0.12;
    const storeys: 2 | 3 = seed % 5 === 0 || row.height < 12 ? 3 : 2;
    const tint = MEDITERRANEAN_TINTS[seed % MEDITERRANEAN_TINTS.length]!;
    const centerZ = options.backRow ? row.houseZ - 7.1 - setback : row.houseZ + setback;
    addTownHouse(buckets, colliders, stairSpans, perches, heightField, kit, {
      id: `${row.id}-${options.backRow ? 'back-house' : 'house'}-${seed}`,
      x: centerX,
      z: centerZ,
      rotY: options.backRow ? 0 : Math.PI,
      footprint: { w: width, d: depth },
      storeys,
      tint,
      roofTint: ROOF_TINTS[seed % ROOF_TINTS.length]!,
      doorSide: 'front',
      upper: 'plaster',
      ground: 'plaster',
      roof: seed % 6 === 0 ? 'flat' : 'gable',
      balcony: seed % 2 === 0,
      awning:
        options.arcade || seed % 5 === 0
          ? [CLOTH_BLUE, CLOTH_GREEN, CLOTH_GOLD, CLOTH_RED][seed % 4]
          : undefined,
      seed,
    });
    if (options.arcade) addArcadeBay(buckets, centerX, row.height, row.houseZ + depth * 0.5 + 0.12, width);
    x += width + (seed % 3 === 0 ? 0.16 : 0.04);
    index += 1;
  }
}

function rowGapContaining(row: TerraceRowSpec, x: number): { x0: number; x1: number } | null {
  return row.gaps?.find((gap) => x >= gap.x0 && x < gap.x1) ?? null;
}

function nextRowGapStart(row: TerraceRowSpec, x: number): number | null {
  const next = row.gaps?.filter((gap) => gap.x0 > x).sort((a, b) => a.x0 - b.x0)[0];
  return next?.x0 ?? null;
}

function houseWidthForAvailable(preferred: 4 | 6 | 8, available: number): 4 | 6 | 8 | null {
  if (available >= preferred) return preferred;
  if (available >= 8) return 8;
  if (available >= 6) return 6;
  if (available >= 4) return 4;
  return null;
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
  if (spec.seed % 5 === 0) addBougainvilleaOnFacade(buckets, spec, y + 2.2);
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
  addBox(buckets, 'plaster', x, y + 2.2, z, 6.0, 16.8, 6.0, 0, 0xe4bd7a);
  for (let i = 0; i < 6; i += 1)
    addBox(buckets, 'stone', x, y + 4.7 + i * 2.55, z, 6.35, 0.18, 6.35, 0, 0xd7b77f);
  addBox(buckets, 'stone', x, y + 18.95, z, 7.0, 0.85, 7.0, 0, LIMESTONE_DARK);
  addBox(buckets, 'stone', x, y + 19.8, z, 6.5, 4.6, 6.5, 0, LIMESTONE_LIGHT);
  for (const [lx, lz] of [
    [-2.55, -2.55],
    [2.55, -2.55],
    [-2.55, 2.55],
    [2.55, 2.55],
  ] as const) {
    addCylinderGeom(buckets.stone, x + lx, y + 19.8, z + lz, 0.28, 0.34, 4.6, 12, 0, 0xf4dca4);
  }
  for (const [dx, dz, rot] of [
    [0, -3.28, 0],
    [3.28, 0, Math.PI / 2],
    [0, 3.28, Math.PI],
    [-3.28, 0, -Math.PI / 2],
  ] as const) {
    addArchVoussoirs(buckets, x + dx, y + 22.1, z + dz, 1.45, rot, LIMESTONE_DARK);
    addBox(buckets, 'metal', x + dx * 0.98, y + 20.6, z + dz * 0.98, 1.2, 1.9, 0.08, rot, 0x223033);
  }
  addCylinderGeom(buckets.metal, x, y + 20.0, z, 0.55, 0.78, 1.25, 16, 0, 0x6c4a25);
  addCone(buckets.metal, x, y + 20.95, z, 0.72, 1.3, 16, 0, 0x765229);
  addBox(buckets, 'stone', x, y + 24.0, z, 7.2, 0.62, 7.2, 0, LIMESTONE_DARK);
  addCone(buckets.roofTile, x, y + 24.6, z, 5.15, 4.3, 4, Math.PI / 4, TERRACOTTA_WARM);
  for (const [dx, dz, rot] of [
    [0, -3.18, 0],
    [3.18, 0, Math.PI / 2],
    [0, 3.18, Math.PI],
    [-3.18, 0, -Math.PI / 2],
  ] as const)
    addClockFace(buckets, x + dx, y + 14.2, z + dz, rot);
  colliders.boxes.push({ x, z, hx: 4.8, hz: 4.8, rot: 0, height: 29 });
  perches.push(new Vector3(x, y + 29.4, z));
}

function addClockFace(buckets: Buckets, x: number, y: number, z: number, rot: number): void {
  addDiscVertical(buckets, 'cloth', x, y, z, rot, 1.52, 0xf0dba9);
  addTorusGeom(buckets.metal, x, y, z, 1.55, 0.045, 28, METAL, 0, rot, 0);
  addBox(buckets, 'metal', x, y - 0.02, z - 0.07, 0.08, 0.82, 0.04, rot, METAL, 0, -0.48);
  addBox(buckets, 'metal', x, y - 0.02, z - 0.08, 0.08, 0.58, 0.04, rot, METAL, 0, 0.82);
  for (let i = 0; i < 12; i += 1) {
    const a = (i / 12) * Math.PI * 2;
    const px = x + Math.sin(a) * 1.0 * Math.cos(rot);
    const py = y + Math.cos(a) * 1.0;
    addBox(buckets, 'metal', px, py - 0.03, z - Math.cos(rot) * 0.12, 0.08, 0.18, 0.04, rot, METAL);
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
  colliders.circles.push({ x, z, r: 3.25 });
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
  }
  addBox(buckets, 'cloth', x - 5.4, y + 0.8, z - 5.0, 0.52, 3.6, 0.06, 0, CLOTH_BLUE);
  addBox(buckets, 'cloth', x + 5.4, y + 0.8, z - 5.0, 0.52, 3.6, 0.06, 0, CLOTH_RED);
  colliders.boxes.push({ x, z: z + 1.2, hx: 7.5, hz: 4.1, rot: 0, height: 6.8 });
  colliders.boxes.push({ x, z: z - 5.2, hx: 7.8, hz: 1.65, rot: 0, height: 0.55 });
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
  const n = 23;
  for (let i = 0; i < n; i += 1) {
    const a0 = (-1.02 + (i / n) * 1.92) * Math.PI;
    const a1 = (-1.02 + ((i + 1) / n) * 1.92) * Math.PI;
    const am = (a0 + a1) * 0.5;
    const px = x + Math.cos(am) * r;
    const pz = z + Math.sin(am) * r * 0.78;
    const len = Math.hypot(Math.cos(a1) * r - Math.cos(a0) * r, (Math.sin(a1) - Math.sin(a0)) * r * 0.78);
    const rot = Math.atan2(Math.cos(am), -Math.sin(am));
    const h = 3.2;
    addBox(buckets, 'stone', px, y - 1.0, pz, len + 0.9, h + 1.1, 1.65, rot, 0xc2a476);
    addBox(buckets, 'stone', px, y + h * 0.45, pz, len + 0.75, 0.1, 1.74, rot, 0xd7b77f);
    const merlonCount = Math.max(1, Math.floor(len / 2.6));
    for (let j = 0; j < merlonCount; j += 1) {
      const lx = (j - (merlonCount - 1) / 2) * (len / merlonCount);
      const p = localToWorld(px, pz, rot, lx, 0);
      addBox(buckets, 'stone', p.x, y + h, p.z, 0.92, 0.7, 1.78, rot, LIMESTONE_LIGHT);
    }
    colliders.boxes.push({ x: px, z: pz, hx: len * 0.5 + 0.5, hz: 0.95, rot, height: h + 0.9 });
    if (i % 3 === 0) perches.push(new Vector3(px, y + h + 0.8, pz));
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
  addCylinderGeom(buckets.wood, x, y, z, 0.16 * s, 0.2 * s, 2.4 * s, 8, 0, 0x5a3924);
  addCone(buckets.cloth, x, y + 1.35 * s, z, 1.0 * s, 4.4 * s, 12, 0, CYPRESS);
  addCone(buckets.cloth, x, y + 3.0 * s, z, 0.78 * s, 3.6 * s, 12, 0, 0x0f341f);
  addCone(buckets.cloth, x, y + 4.4 * s, z, 0.55 * s, 2.6 * s, 12, 0, 0x194b2b);
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
  addCylinderGeom(buckets.stone, x, y, z, 0.55 * s, 0.72 * s, 0.72 * s, 12, 0, 0x8e6846);
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
  addCylinderGeom(buckets.wood, x, y, z, 0.22 * s, 0.33 * s, 2.2 * s, 9, 0.15, 0x5a3a25);
  addSphere(buckets.cloth, x, y + 2.75 * s, z, 1.6 * s, 1.0 * s, 1.45 * s, OLIVE_SILVER, 12, 8);
  addSphere(
    buckets.cloth,
    x - 0.92 * s,
    y + 2.45 * s,
    z + 0.28 * s,
    1.15 * s,
    0.78 * s,
    1.0 * s,
    OLIVE,
    10,
    6,
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
    10,
    6,
  );
  colliders.circles.push({ x, z, r: 0.62 * s });
}

function addBougainvillea(buckets: Buckets, x: number, y: number, z: number, rot: number, s: number): void {
  for (let i = 0; i < 12; i += 1) {
    const lx = Math.sin(i * 3.1) * 1.6 * s;
    const ly = Math.cos(i * 1.7) * 0.9 * s;
    const lz = (i % 3) * 0.06;
    const p = localToWorld(x, z, rot, lx, lz);
    addSphere(
      buckets.cloth,
      p.x,
      y + ly,
      p.z,
      0.22 * s,
      0.14 * s,
      0.22 * s,
      i % 2 ? BOUGAINVILLEA : 0xd51c91,
      6,
      4,
    );
  }
  addTube(
    buckets.rope,
    0.035 * s,
    { x: x - Math.cos(rot) * 1.6 * s, y: y - 1.0 * s, z: z + Math.sin(rot) * 1.6 * s },
    { x: x + Math.cos(rot) * 1.2 * s, y: y + 1.1 * s, z: z - Math.sin(rot) * 1.2 * s },
    0x31502c,
    5,
  );
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
  const g = new TorusGeometry(radius, tube, 8, segments);
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

function citadelWalkable(x: number, z: number): number | null {
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

function segmentDistance(x: number, z: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax;
  const dz = bz - az;
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / Math.max(1e-6, dx * dx + dz * dz)));
  return Math.hypot(x - (ax + dx * t), z - (az + dz * t));
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
