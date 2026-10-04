import {
  BufferGeometry,
  Color,
  Group,
  LineBasicMaterial,
  LineSegments,
  MathUtils,
  Mesh,
  Object3D,
  Vector3,
  type Material,
  type UniformArrayNode,
} from 'three/webgpu';
import { uniform, uniformArray } from 'three/tsl';
import type { CircleObstacle, HeightField, Tier, WaveSampler } from '../contracts';
import { updateShipOceanInteraction } from '../ocean/ship-interaction';
import { ShipDynamics, type ShipEnv } from './dynamics';
import { createChristeningSystem } from './christening';
import {
  BRIGANTINE_CAPSULES,
  BRIGANTINE_HALF_BEAM_TABLE,
  BRIGANTINE_HALF_LENGTH,
  BRIGANTINE_LENGTH,
  BRIGANTINE_STATIONS,
  deckHeightAt,
  halfBeamAt,
  sheerHeightAt,
  waterlineHalfBeamAt,
  type BuoyancyStation,
  type HullCapsule,
} from './lines';
import { MeshBuilder } from './mesh-builder';
import {
  createDeckGeometry,
  createDeckGunGeometry,
  createHullGeometry,
  createNameBoardGeometry,
  createSternGoldGeometry,
  createTrimGeometry,
  createWindowGeometry,
  QUARTERDECK_Z,
  WHEEL,
} from './brigantine-hull';
import {
  createBundledCanvasGeometry,
  createRiggingGeometry,
  createSailGeometry,
  createSparGeometry,
  mizzenStayPoint,
} from './brigantine-rig';
import { FLAG_PHASE_PERIOD, createFlagGeometry, flagYaw, makeFlagMaterial } from './ship-flags';
import { windAt } from '../wind';
import {
  makeCanvasMaterial,
  createShipLabel,
  makeGunMaterial,
  makeShipMaterial,
  paintShipName,
  type BrigantineUniforms,
} from './brigantine-materials';
import { createShipPipes, type ShipPipes } from './pipes';
import { DEFAULT_SAIL_PALETTE, sailPalette } from './sail-palettes';
import { loadLionHeadFigurehead } from './ship-lion';

export { fitShipNameFontSize } from './brigantine-materials';

interface BrigantineOptions {
  tier: Tier;
  /**
   * Whether this ship drives the ocean's hull cut-out and wake (default true). The ocean follows one
   * ship, so other ships (sea-battle raiders) turn it off.
   */
  oceanInteraction?: boolean;
}

export interface BrigantineEnv extends ShipEnv {
  waves: WaveSampler;
  ground: HeightField | null;
  obstacles: readonly CircleObstacle[];
}

export interface Brigantine {
  group: Group;
  dynamics: ShipDynamics;
  uniforms: BrigantineUniforms;
  update(dt: number, t: number, env: BrigantineEnv): void;
  waterlineTable: Float32Array;
  stations: readonly BuoyancyStation[];
  capsules: readonly HullCapsule[];
  triangleCount: number;
  drawCallCount: number;
  anchors: ShipAnchors;
  readonly pipes: ShipPipes;
  /** Recolours the canvas to a Paint Your Sails palette (uniforms only, no recompile). */
  setSails(paletteId: string | null): void;
  /** Paints the christened ship name onto the stern and bow name boards. */
  setName(name: string | null): void;
  /** Runs deck gun `index` (port 0…5, starboard 6…11, stern to bow) in by `metres` of recoil. */
  setGunRecoil(index: number, metres: number): void;
  /**
   * Lowers the gangplank from the port rail to `foot` (world space, on the pier), or with null raises
   * it. The foot stays where it's put while the rail end rides the swell; call after the ship's pose
   * is applied each frame.
   */
  setGangway(foot: { x: number; y: number; z: number } | null): void;
  /** Writes the world-space point where the plank hooks over the rail (the top of its walk). */
  gangwayTopWorld(out: Vector3): Vector3;
  /** Plays Nell's coconut christening throw from a world-space hand position. */
  christen(from: { x: number; y: number; z: number }): Promise<void>;
  /** Writes 32 closed-polyline world-space xz points: local +x side stern→bow, then local -x side bow→stern. */
  waterlinePolygon(outWorld: Float32Array): Float32Array;
  /** Writes [x, z] for the current bow waterline point. */
  bowWorld(outWorld: Float32Array | number[]): Float32Array | number[];
  /** Writes [x, y, z] for the current bow stem point. */
  bowStemWorld(outWorld: Float32Array | number[]): Float32Array | number[];
  /** Writes [x, z] for the current stern waterline point. */
  sternWorld(outWorld: Float32Array | number[]): Float32Array | number[];
  dispose(): void;
}

interface ShipAnchors {
  /** `grip`: where the helmsman's hands go, in their own frame (feet origin, +z forward, metres). */
  helm: {
    x: number;
    y: number;
    z: number;
    heading: number;
    grip: { y: number; z: number; spread: number };
  };
  boarding: { x: number; y: number; z: number };
  /** The gangplank's foot on the pier deck, where "Board your ship" is offered. */
  gangway: { x: number; y: number; z: number };
}

const WATERLINE_POLYGON_POINTS = 32;
const BOW_Z = BRIGANTINE_HALF_LENGTH + 0.28;
const BOW_STEM = { x: 0, y: 1.9, z: 13.18 } as const;
const STERN_Z = -BRIGANTINE_HALF_LENGTH - 0.15;
/** The helmsman stands just aft of the wheel, facing forward, with it at arm's length. */
const HELM_Z = WHEEL.z - 0.33;
const BOARDING_Z = -0.15;
/**
 * The gangplank's foot in ship-local space: at COVE.mooring the pier's east edge is ~4.65 m out on
 * local +x, so the foot rests 0.4 m onto the deck (1.8 m, the pier deck height at a calm mooring).
 */
const GANGWAY_FOOT = { x: 5.05, y: 1.86, z: BOARDING_Z } as const;

function localToWorldXZ(
  pose: ShipDynamics['pose'],
  x: number,
  z: number,
  out: Float32Array | number[],
  i: number,
): void {
  const s = Math.sin(pose.heading);
  const c = Math.cos(pose.heading);
  out[i] = pose.x + c * x + s * z;
  out[i + 1] = pose.z - s * x + c * z;
}

function triangleCount(group: Object3D): number {
  let tris = 0;
  group.traverse((object) => {
    const mesh = object as Mesh;
    if (!mesh.isMesh) return;
    const geometry = mesh.geometry;
    const index = geometry.getIndex();
    const position = geometry.getAttribute('position');
    tris += index ? index.count / 3 : position.count / 3;
  });
  return Math.round(tris);
}

function drawCallCount(group: Object3D): number {
  let calls = 0;
  group.traverse((object) => {
    if (!object.visible) return;
    const drawable = object as Mesh | LineSegments;
    if ('isMesh' in drawable || 'isLineSegments' in drawable) calls += 1;
  });
  return calls;
}

function addMesh(
  group: Group,
  geometry: BufferGeometry,
  material: Material,
  name: string,
  castShadow = true,
): Mesh {
  const mesh = new Mesh(geometry, material);
  mesh.name = name;
  mesh.castShadow = castShadow;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

/** Where the gangplank hooks over the port rail, in ship-local space. */
const GANGWAY_TOP = {
  x: halfBeamAt(BOARDING_Z, sheerHeightAt(BOARDING_Z)) - 0.04,
  y: sheerHeightAt(BOARDING_Z) + 0.04,
  z: BOARDING_Z,
} as const;
/** The plank's built length (rail to GANGWAY_FOOT at a calm mooring); it stretches a little from there. */
const GANGWAY_LENGTH = Math.hypot(GANGWAY_FOOT.x - GANGWAY_TOP.x, GANGWAY_TOP.y - GANGWAY_FOOT.y);

/**
 * A plank with cleats and rope hand lines, hooked over the port rail at GANGWAY_TOP. Built along a
 * pivot's +x so `aimGangway` can point it at the pier with a yaw and a pitch.
 */
function createGangway(material: Material): Group {
  const length = GANGWAY_LENGTH;
  const pivot = new Group();
  pivot.name = 'gangway';
  pivot.position.set(GANGWAY_TOP.x, GANGWAY_TOP.y, GANGWAY_TOP.z);
  // Yaw about y, then pitch about the yawed z, so +x runs from the rail to the foot.
  pivot.rotation.order = 'YZX';
  aimGangway(pivot, GANGWAY_FOOT);

  const b = new MeshBuilder();
  b.setRegion(1);
  b.setColor(0xffffff);
  b.addBox(length / 2, 0, 0, length, 0.07, 0.64);
  for (let x = 0.3; x < length - 0.1; x += 0.34) b.addBox(x, 0.05, 0, 0.05, 0.035, 0.56);
  for (const z of [-0.35, 0.35]) {
    for (const x of [0.08, length / 2, length - 0.12]) b.addBox(x, 0.3, z, 0.04, 0.56, 0.04);
  }
  b.setRegion(5);
  b.setColor(0xb89a6a);
  for (const z of [-0.35, 0.35]) b.addBox(length / 2, 0.57, z, length - 0.1, 0.03, 0.03);
  b.setRegion(4);
  b.setColor(0xffffff);
  for (const z of [-0.22, 0.22]) b.addBox(-0.02, -0.08, z, 0.05, 0.16, 0.06);
  addMesh(pivot, b.build(), material, 'gangplank', true);
  return pivot;
}

/** Points the plank from the rail at `foot` (ship-local) and stretches it to reach. */
function aimGangway(pivot: Object3D, foot: { x: number; y: number; z: number }): void {
  const dx = foot.x - GANGWAY_TOP.x;
  const dy = foot.y - GANGWAY_TOP.y;
  const dz = foot.z - GANGWAY_TOP.z;
  const run = Math.hypot(dx, dz);
  pivot.rotation.y = Math.atan2(-dz, dx);
  pivot.rotation.z = Math.atan2(dy, run);
  pivot.scale.x = Math.hypot(run, dy) / GANGWAY_LENGTH;
}

function copyPose(source: ShipDynamics['pose'], target: ShipDynamics['pose']): void {
  target.x = source.x;
  target.z = source.z;
  target.heading = source.heading;
  target.heave = source.heave;
  target.pitch = source.pitch;
  target.roll = source.roll;
  target.speed = source.speed;
  target.luff = source.luff;
  target.shake = source.shake;
}

function shortestYaw(a: number, b: number, t: number): number {
  let d = (b - a + Math.PI) % (Math.PI * 2);
  if (d < 0) d += Math.PI * 2;
  return a + (d - Math.PI) * t;
}

export function createBrigantine({ tier, oceanInteraction = true }: BrigantineOptions): Brigantine {
  const group = new Group();
  group.name = `brigantine-${tier}`;
  group.rotation.order = 'YXZ';

  const dynamics = new ShipDynamics();
  const startSails = sailPalette(DEFAULT_SAIL_PALETTE);
  const uniforms: BrigantineUniforms = {
    trim: uniform(1),
    luff: uniform(0),
    sailCloth: uniform(new Color(startSails.cloth)),
    sailStripe: uniform(new Color(startSails.stripe)),
    flagYaw: uniform(0),
    flagPhase: uniform(0),
    flagStrength: uniform(0.6),
    flagLower: uniform(0),
  };
  const helmY = deckHeightAt(QUARTERDECK_Z) + 0.18;
  const anchors: ShipAnchors = {
    helm: {
      x: 0,
      y: helmY,
      z: HELM_Z,
      heading: 0,
      // Hands on the spokes either side of the hub, a little below it.
      grip: { y: deckHeightAt(WHEEL.z) + WHEEL.hub - 0.03 - helmY, z: WHEEL.z - HELM_Z, spread: 0.36 },
    },
    // At COVE.mooring heading π, local +x maps to world -x (west/port rail), which is the pier-facing side.
    boarding: {
      x: halfBeamAt(BOARDING_Z, deckHeightAt(BOARDING_Z)) * 0.72,
      y: deckHeightAt(BOARDING_Z),
      z: BOARDING_Z,
    },
    gangway: { x: GANGWAY_FOOT.x, y: 1.8, z: GANGWAY_FOOT.z },
  };
  const materials: Material[] = [];
  const register = <T extends Material>(m: T): T => {
    materials.push(m);
    return m;
  };

  const shipLabel = createShipLabel();
  const shipMaterial = register(makeShipMaterial(shipLabel));
  const riggingLineMaterial = register(
    new LineBasicMaterial({ color: 0x17110c, transparent: true, opacity: 0.78, linewidth: 1.6 }),
  );
  const pipeSystem = createShipPipes(shipMaterial);
  const christening = createChristeningSystem(shipMaterial);
  paintShipName(shipLabel, null);
  addMesh(group, createHullGeometry(tier), shipMaterial, 'rounded planked hull');
  addMesh(group, createDeckGeometry(tier), shipMaterial, 'deck planking rails and fittings', false);
  addMesh(group, createTrimGeometry(tier), shipMaterial, 'wales strakes gunports galleries anchors');
  const recoilNode = uniformArray(new Array<number>(12).fill(0), 'float') as UniformArrayNode<'float'>;
  const gunGeometry = createDeckGunGeometry(tier);
  if (gunGeometry) addMesh(group, gunGeometry, register(makeGunMaterial(shipLabel, recoilNode)), 'deck guns');
  addMesh(group, createWindowGeometry(), shipMaterial, 'stern gallery windows and name board backing', false);
  addMesh(group, createSternGoldGeometry(), shipMaterial, 'stern gallery trim and lantern bracket');
  addMesh(group, createNameBoardGeometry(), shipMaterial, 'christening ship name boards', false);
  addMesh(group, createSparGeometry(tier), shipMaterial, 'masts yards boom bowsprit jibboom', false);
  addMesh(group, createBundledCanvasGeometry(tier), shipMaterial, 'furled canvas bundles', false);
  addMesh(
    group,
    createSailGeometry(tier),
    register(makeCanvasMaterial(uniforms)),
    'billowed procedural sails',
  );
  addMesh(
    group,
    createFlagGeometry(),
    register(
      makeFlagMaterial({
        yaw: uniforms.flagYaw,
        phase: uniforms.flagPhase,
        strength: uniforms.flagStrength,
        lower: uniforms.flagLower,
      }),
    ),
    'animated jolly roger and pennants',
    false,
  );
  const rigging = new LineSegments(createRiggingGeometry(tier), riggingLineMaterial);
  rigging.name = 'standing and running rigging lines';
  group.add(rigging);
  group.add(pipeSystem.group);
  group.add(christening.group);
  const gangway = createGangway(shipMaterial);
  gangway.visible = false;
  group.add(gangway);
  const gangwayFoot = new Vector3();
  let disposed = false;
  const flagWind = new Float32Array(2);
  let flagEased = false;

  const lanternPivot = new Group();
  lanternPivot.name = 'stern lantern pendulum';
  lanternPivot.position.set(0, 3.65, -12.05);
  const lanternRig = new MeshBuilder();
  lanternRig.setRegion(4);
  lanternRig.setColor(0x17110c);
  for (const x of [-0.72, 0, 0.72]) {
    lanternRig.addCylinderBetween({ x, y: 0, z: 0 }, { x, y: -0.58, z: 0 }, 0.018, 6);
    lanternRig.addBox(x, -0.2, 0, 0.2, 0.04, 0.2);
  }
  addMesh(lanternPivot, lanternRig.build(), shipMaterial, 'lantern hanger', false);
  const lanternGeo = new MeshBuilder();
  lanternGeo.setRegion(6);
  lanternGeo.setColor(0xffb060);
  for (const x of [-0.72, 0, 0.72]) {
    lanternGeo.addBox(x, -0.74, 0, 0.24, 0.3, 0.24);
    lanternGeo.setRegion(4);
    lanternGeo.setColor(0x17110c);
    lanternGeo.addBox(x, -0.74, 0, 0.31, 0.04, 0.31);
    lanternGeo.addBox(x, -0.58, 0, 0.28, 0.04, 0.28);
    lanternGeo.setRegion(6);
    lanternGeo.setColor(0xffb060);
  }
  addMesh(lanternPivot, lanternGeo.build(), shipMaterial, 'stern lantern', false);
  group.add(lanternPivot);

  // A tackle block dangling from the lower mizzen stay, swaying with the ship.
  const blockPivot = new Group();
  blockPivot.name = 'hanging block spring';
  const blockTop = mizzenStayPoint(-4.65);
  blockPivot.position.set(blockTop.x, blockTop.y, blockTop.z);
  const blockGeo = new MeshBuilder();
  blockGeo.setRegion(4);
  blockGeo.setColor(0x17110c);
  blockGeo.addCylinderBetween({ x: 0, y: 0, z: 0 }, { x: 0, y: -0.85, z: 0.12 }, 0.014, 6);
  blockGeo.addBox(0, -0.98, 0.15, 0.18, 0.24, 0.12);
  addMesh(blockPivot, blockGeo.build(), shipMaterial, 'hanging line and block', false);
  group.add(blockPivot);

  const oceanBow = new Float32Array(2);
  const oceanStern = new Float32Array(2);
  const waterlineLocal = new Float32Array(WATERLINE_POLYGON_POINTS * 2);
  let wi = 0;
  for (let i = 0; i < WATERLINE_POLYGON_POINTS / 2; i++) {
    const z = -BRIGANTINE_HALF_LENGTH + (BRIGANTINE_LENGTH * i) / (WATERLINE_POLYGON_POINTS / 2 - 1);
    waterlineLocal[wi++] = waterlineHalfBeamAt(z);
    waterlineLocal[wi++] = z;
  }
  for (let i = WATERLINE_POLYGON_POINTS / 2 - 1; i >= 0; i--) {
    const z = -BRIGANTINE_HALF_LENGTH + (BRIGANTINE_LENGTH * i) / (WATERLINE_POLYGON_POINTS / 2 - 1);
    waterlineLocal[wi++] = -waterlineHalfBeamAt(z);
    waterlineLocal[wi++] = z;
  }

  let accumulator = 0;
  const fixed = 1 / 60;
  const previous: ShipDynamics['pose'] = {
    x: 0,
    z: 0,
    heading: 0,
    heave: 0,
    pitch: 0,
    roll: 0,
    speed: 0,
    luff: 0,
    shake: 0,
  };
  const current: ShipDynamics['pose'] = {
    x: 0,
    z: 0,
    heading: 0,
    heave: 0,
    pitch: 0,
    roll: 0,
    speed: 0,
    luff: 0,
    shake: 0,
  };
  let lanternX = 0;
  let lanternZ = 0;
  let lanternVx = 0;
  let lanternVz = 0;
  let blockX = 0;
  let blockZ = 0;
  let blockVx = 0;
  let blockVz = 0;
  const bowStemTmp = new Vector3();

  const updateSecondary = (dt: number) => {
    const ax = MathUtils.clamp(dynamics.measuredAcceleration[0] * 0.012, -0.28, 0.28);
    const az = MathUtils.clamp(dynamics.measuredAcceleration[2] * 0.012, -0.28, 0.28);
    const spring = (currentValue: number, velocity: number, target: number, hz: number): [number, number] => {
      const omega = Math.PI * 2 * hz;
      const accel = (target - currentValue) * omega * omega - 2 * 0.68 * omega * velocity;
      const v = velocity + accel * dt;
      return [currentValue + v * dt, v];
    };
    [lanternX, lanternVx] = spring(lanternX, lanternVx, -az, 0.72);
    [lanternZ, lanternVz] = spring(lanternZ, lanternVz, ax, 0.68);
    [blockX, blockVx] = spring(blockX, blockVx, -az * 0.75, 0.9);
    [blockZ, blockVz] = spring(blockZ, blockVz, ax * 0.75, 0.86);
    lanternPivot.rotation.x = MathUtils.clamp(lanternX, -0.38, 0.38);
    lanternPivot.rotation.z = MathUtils.clamp(lanternZ, -0.38, 0.38);
    blockPivot.rotation.x = MathUtils.clamp(blockX, -0.32, 0.32);
    blockPivot.rotation.z = MathUtils.clamp(blockZ, -0.32, 0.32);
  };

  const api: Brigantine = {
    group,
    dynamics,
    uniforms,
    anchors,
    pipes: pipeSystem,
    setSails(paletteId: string | null): void {
      const p = sailPalette(paletteId);
      uniforms.sailCloth.value.setHex(p.cloth);
      uniforms.sailStripe.value.setHex(p.stripe);
    },
    setName(name: string | null): void {
      paintShipName(shipLabel, name);
    },
    setGunRecoil(index: number, metres: number): void {
      if (index >= 0 && index < 12) (recoilNode.array as number[])[index] = metres;
    },
    setGangway(foot: { x: number; y: number; z: number } | null): void {
      gangway.visible = !!foot;
      if (!foot) return;
      group.updateMatrixWorld();
      aimGangway(gangway, group.worldToLocal(gangwayFoot.set(foot.x, foot.y, foot.z)));
    },
    gangwayTopWorld(out: Vector3): Vector3 {
      group.updateMatrixWorld();
      return group.localToWorld(out.set(GANGWAY_TOP.x, GANGWAY_TOP.y, GANGWAY_TOP.z));
    },
    christen(from: { x: number; y: number; z: number }): Promise<void> {
      dynamics.pose.shake = Math.max(dynamics.pose.shake, 0.18);
      return christening.play(from, group);
    },
    waterlineTable: BRIGANTINE_HALF_BEAM_TABLE,
    stations: BRIGANTINE_STATIONS,
    capsules: BRIGANTINE_CAPSULES,
    triangleCount: 0,
    drawCallCount: 0,
    waterlinePolygon(outWorld: Float32Array): Float32Array {
      const n = Math.min(outWorld.length / 2, WATERLINE_POLYGON_POINTS);
      for (let i = 0; i < n; i++)
        localToWorldXZ(dynamics.pose, waterlineLocal[i * 2]!, waterlineLocal[i * 2 + 1]!, outWorld, i * 2);
      return outWorld;
    },
    bowWorld(outWorld: Float32Array | number[]): Float32Array | number[] {
      localToWorldXZ(dynamics.pose, 0, BOW_Z, outWorld, 0);
      return outWorld;
    },
    bowStemWorld(outWorld: Float32Array | number[]): Float32Array | number[] {
      bowStemTmp.set(BOW_STEM.x, BOW_STEM.y, BOW_STEM.z);
      group.updateMatrixWorld(true);
      group.localToWorld(bowStemTmp);
      outWorld[0] = bowStemTmp.x;
      outWorld[1] = bowStemTmp.y;
      outWorld[2] = bowStemTmp.z;
      return outWorld;
    },
    sternWorld(outWorld: Float32Array | number[]): Float32Array | number[] {
      localToWorldXZ(dynamics.pose, 0, STERN_Z, outWorld, 0);
      return outWorld;
    },
    update(dt: number, t: number, env: BrigantineEnv): void {
      accumulator = Math.min(accumulator + Math.max(0, dt), fixed * 5);
      while (accumulator >= fixed) {
        copyPose(dynamics.pose, previous);
        dynamics.step(fixed, dynamics.control, {
          waves: env.waves,
          ground: env.ground,
          obstacles: env.obstacles,
          t,
        });
        accumulator -= fixed;
      }
      copyPose(dynamics.pose, current);
      const alpha = MathUtils.clamp(accumulator / fixed, 0, 1);
      const x = MathUtils.lerp(previous.x, current.x, alpha);
      const z = MathUtils.lerp(previous.z, current.z, alpha);
      const heave = MathUtils.lerp(previous.heave, current.heave, alpha);
      const pitch = MathUtils.lerp(previous.pitch, current.pitch, alpha);
      const roll = MathUtils.lerp(previous.roll, current.roll, alpha);
      const yaw = shortestYaw(previous.heading, current.heading, alpha);
      const shake = current.shake * Math.sin(t * 37) * 0.018;
      group.position.set(x, heave + Math.abs(shake) * 0.3, z);
      group.rotation.set(pitch + shake * 0.5, yaw, roll + shake, 'YXZ');
      uniforms.trim.value = dynamics.control.trim;
      uniforms.luff.value = dynamics.pose.luff;
      // Flags stream down the apparent wind: the true wind less the ship's own way through the water.
      windAt(x, z, t, flagWind);
      const fs = dynamics.forwardSpeed;
      const apparentX = flagWind[0] - Math.sin(yaw) * fs;
      const apparentZ = flagWind[1] - Math.cos(yaw) * fs;
      const targetFlag = flagYaw(yaw, apparentX, apparentZ);
      const was = uniforms.flagYaw.value;
      const turn = Math.atan2(Math.sin(targetFlag - was), Math.cos(targetFlag - was));
      uniforms.flagYaw.value = flagEased ? was + turn * Math.min(1, dt * 2.5) : targetFlag;
      const targetStrength = MathUtils.clamp((Math.hypot(apparentX, apparentZ) - 2) / 9, 0, 1);
      const strength = uniforms.flagStrength.value;
      uniforms.flagStrength.value = flagEased
        ? strength + (targetStrength - strength) * Math.min(1, dt * 1.5)
        : targetStrength;
      uniforms.flagPhase.value =
        (uniforms.flagPhase.value + dt * (4 + 5 * uniforms.flagStrength.value)) % FLAG_PHASE_PERIOD;
      flagEased = true;
      localToWorldXZ(dynamics.pose, 0, BOW_Z, oceanBow, 0);
      localToWorldXZ(dynamics.pose, 0, STERN_Z, oceanStern, 0);
      if (oceanInteraction)
        updateShipOceanInteraction(
          dynamics.pose.x,
          dynamics.pose.z,
          dynamics.pose.heading,
          dynamics.forwardSpeed,
          oceanBow[0]!,
          oceanBow[1]!,
          oceanStern[0]!,
          oceanStern[1]!,
          t,
        );
      updateSecondary(dt);
      pipeSystem.update(dt, t);
      christening.update(dt);
    },
    dispose(): void {
      disposed = true;
      group.traverse((object) => {
        const mesh = object as Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
      });
      pipeSystem.dispose();
      christening.dispose();
      for (const material of materials) material.dispose();
      shipLabel.texture.dispose();
    },
  };
  api.triangleCount = triangleCount(group);
  api.drawCallCount = drawCallCount(group);
  if (typeof window !== 'undefined') {
    void loadLionHeadFigurehead(tier, shipMaterial)
      .then((mesh) => {
        if (disposed) {
          mesh.geometry.dispose();
          return;
        }
        group.add(mesh);
        api.triangleCount = triangleCount(group);
        api.drawCallCount = drawCallCount(group);
      })
      .catch(() => undefined);
  }
  return api;
}
