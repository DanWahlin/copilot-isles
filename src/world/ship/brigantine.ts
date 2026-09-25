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
} from 'three/webgpu';
import { uniform } from 'three/tsl';
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
  waterlineHalfBeamAt,
  type BuoyancyStation,
  type HullCapsule,
} from './lines';
import { MeshBuilder } from './mesh-builder';
import {
  createDeckGeometry,
  createHullGeometry,
  createNameBoardGeometry,
  createSternGoldGeometry,
  createTrimGeometry,
  createWindowGeometry,
} from './brigantine-hull';
import {
  createBundledCanvasGeometry,
  createRiggingGeometry,
  createSailGeometry,
  createSparGeometry,
} from './brigantine-rig';
import {
  makeCanvasMaterial,
  makeShipMaterial,
  paintShipName,
  type BrigantineUniforms,
} from './brigantine-materials';
import { createShipPipes, type ShipPipes } from './pipes';
import { DEFAULT_SAIL_PALETTE, sailPalette } from './sail-palettes';

export { fitShipNameFontSize } from './brigantine-materials';

interface BrigantineOptions {
  tier: Tier;
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
  helm: { x: number; y: number; z: number; heading: number };
  boarding: { x: number; y: number; z: number };
}

const WATERLINE_POLYGON_POINTS = 32;
const BOW_Z = BRIGANTINE_HALF_LENGTH + 0.28;
const BOW_STEM = { x: 0, y: 2.05, z: 12.1 } as const;
const STERN_Z = -BRIGANTINE_HALF_LENGTH - 0.15;
const HELM_Z = -9.55;
const BOARDING_Z = -0.15;

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

export function createBrigantine({ tier }: BrigantineOptions): Brigantine {
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
  };
  const anchors: ShipAnchors = {
    helm: { x: 0, y: deckHeightAt(-8.0) + 0.18, z: HELM_Z, heading: 0 },
    // At COVE.mooring heading π, local +x maps to world -x (west/port rail), which is the pier-facing side.
    boarding: {
      x: halfBeamAt(BOARDING_Z, deckHeightAt(BOARDING_Z)) * 0.72,
      y: deckHeightAt(BOARDING_Z),
      z: BOARDING_Z,
    },
  };
  const materials: Material[] = [];
  const register = <T extends Material>(m: T): T => {
    materials.push(m);
    return m;
  };

  const shipMaterial = register(makeShipMaterial());
  const riggingLineMaterial = register(
    new LineBasicMaterial({ color: 0x17110c, transparent: true, opacity: 0.72 }),
  );
  const pipeSystem = createShipPipes(shipMaterial);
  const christening = createChristeningSystem(shipMaterial);
  paintShipName(null);
  addMesh(group, createHullGeometry(tier), shipMaterial, 'rounded planked hull');
  addMesh(group, createDeckGeometry(tier), shipMaterial, 'deck planking rails and fittings', false);
  addMesh(group, createTrimGeometry(tier), shipMaterial, 'wales strakes gunports galleries anchors');
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
  const rigging = new LineSegments(createRiggingGeometry(), riggingLineMaterial);
  rigging.name = 'standing and running rigging lines';
  group.add(rigging);
  group.add(pipeSystem.group);
  group.add(christening.group);

  const lanternPivot = new Group();
  lanternPivot.name = 'stern lantern pendulum';
  lanternPivot.position.set(0, 3.65, -12.05);
  const lanternRig = new MeshBuilder();
  lanternRig.setRegion(4);
  lanternRig.setColor(0x17110c);
  lanternRig.addCylinderBetween({ x: 0, y: 0, z: 0 }, { x: 0, y: -0.58, z: 0 }, 0.018, 6);
  lanternRig.addBox(0, -0.2, 0, 0.2, 0.04, 0.2);
  addMesh(lanternPivot, lanternRig.build(), shipMaterial, 'lantern hanger', false);
  const lanternGeo = new MeshBuilder();
  lanternGeo.setRegion(6);
  lanternGeo.setColor(0xffb060);
  lanternGeo.addBox(0, -0.74, 0, 0.24, 0.3, 0.24);
  addMesh(lanternPivot, lanternGeo.build(), shipMaterial, 'stern lantern', false);
  group.add(lanternPivot);

  const blockPivot = new Group();
  blockPivot.name = 'hanging block spring';
  blockPivot.position.set(-1.15, 9.2, -4.65);
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
      paintShipName(name);
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
      localToWorldXZ(dynamics.pose, 0, BOW_Z, oceanBow, 0);
      localToWorldXZ(dynamics.pose, 0, STERN_Z, oceanStern, 0);
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
      group.traverse((object) => {
        const mesh = object as Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
      });
      pipeSystem.dispose();
      christening.dispose();
      for (const material of materials) material.dispose();
    },
  };
  api.triangleCount = triangleCount(group);
  api.drawCallCount = drawCallCount(group);
  return api;
}
