import { Group, Mesh, Vector3, type Camera, type Material } from 'three/webgpu';
import { loadLodSimplifier } from '../../characters/character-lod';
import { ChunkLods, chunkLodEdges, chunkLodFloor } from '../../village/chunks';
import type { TierSettings } from '../../../engine/quality';
import type { CircleObstacle, HeightField } from '../../contracts';
import type { PlantInstance } from '../../vegetation/types';
import type { VillageKit } from '../../village/kit';
import { makeBuckets, meshesFromBuckets } from '../../village/pieces';
import { islandCourseBoard } from '../../../learn/course-board';
import { addCourseBoardNotices, addCourseBoardTimber } from '../../sites/course-board';
import { SignSet } from '../../sites/sign';
import { COURSE_BOARDS } from '../course-boards';
import { createDockHull } from './dock-hull';
import { createKeelhavenWrecksSteps, hulkDressing } from './wrecks';
import { createKeelhavenRocks } from './rocks';
import { toWorld } from './layout';
import { CHAMBERS } from './works';
import { buildShipyard, type ShipyardOut } from './shipyard';
import { buildTown } from './town-build';
import { createKeelhavenMist } from './mist';
import { keelhavenPlantsSliced } from './vegetation';
import { createKeelhavenWaterMesh } from './water-mesh';
import { KEELHAVEN_ANCHORS } from './anchors';
import { addKeelhavenMarket } from './market';
import { buildKeelhavenProps, createToolChest, type ToolChest } from './props';
import { buildCircuitProps, FLIGHT_HULLS, HULL_REST, type FlightHull } from './circuit';
import { LampSet, type LampLook } from './lamps';
import { headingUv } from './anchors';

/**
 * Keelhaven's world (no gameplay yet), the world its stream will build (`IslandStream.world`, like
 * Thousand-Bough's `createThousandBoughAsync`): its fresh water and falls, its mist, the shipyard and
 * harbour, the town and the Gate Light, and its plants (for `addIslandPlants` with
 * `KEELHAVEN_FLORA` and `KEELHAVEN_PLANT_LOOK`).
 */
export interface KeelhavenWorld {
  group: Group;
  /** The works' fences, camera boxes, ship obstacles, the dock hull's pose and the berth (for the wiring). */
  works: ShipyardOut;
  /** Where the cast, the islanders and the market's keeper stand (spec §3.11, as built). */
  anchors: typeof KEELHAVEN_ANCHORS;
  /** Dory's tool chest: at her side, or on Drydock 2's rack once you've carried it. */
  toolChest: ToolChest;
  /** The quay's and the works' circles, for the ship. */
  shipObstacles(): CircleObstacle[];
  /** Picks the levels of detail for the camera (no allocation). */
  frame(camera: Camera): void;
  /**
   * Gull flocks for the stream to add (`addIslandBirds`): over the harbour, and over the reef with
   * perches on the standing wreck's masts.
   */
  birds: { center: Vector3; radius: number; seed: number; perches: Vector3[] }[];
  /** The Two Circuits' moving parts: the lamps, the flight's hulls and the locks' water. */
  circuit: KeelhavenCircuitWorld;
  /** Runs what moves (nothing by itself: the circuits move the hulls, the water and the lamps). */
  update(dt: number, t: number): void;
  /** The island's plants, built a slice at a time, for `vegetation.addPlants`. */
  plants(breathe: () => Promise<void>): Promise<PlantInstance[]>;
  dispose(): void;
}

/** The circuits' moving parts (the game's puzzle drives them; nothing here keeps time). */
export interface KeelhavenCircuitWorld {
  /** Paints a lamp of the island's lamp set (`ring:<place>`, `flight:<place>`, `lock:<i>`, `gate2:<i>`, `gateLight`). */
  lamp(key: string, look: LampLook): void;
  /** Puts a flight hull at cove frame (u, v), its waterline at `y`, bow along (du, dv), heeled by `roll`. */
  hull(id: FlightHull, u: number, v: number, y: number, du: number, dv: number, roll?: number): void;
  /** A lock's water level (`lock1`, `lock2`), in place. */
  water(chamber: string, y: number): void;
  /** A lamp's look now (for tests). */
  look(key: string): LampLook | null;
}

export interface KeelhavenWorldOptions {
  tier: TierSettings;
  /** The island's own baked ground (the drawn ground: the water's depth reads over it). */
  heightField: HeightField;
  kit: VillageKit;
}

/** The flight's hulls are the dock hull at this size (they fit a lock two abreast). */
const HULL_SCALE = 0.5;

/** The still water's level where a hull rests at u (the basin, the pound, Lock 2 or the cut). */
function restWater(u: number): number {
  for (const c of CHAMBERS)
    if (c.water !== null && u > c.u0 && u < c.u1 && !c.name.startsWith('dock')) return c.water;
  return 0;
}

/** Builds Keelhaven's world a few milliseconds a frame (`breathe` between parts). */
export async function createKeelhavenWorldAsync(
  o: KeelhavenWorldOptions,
  breathe: () => Promise<void>,
): Promise<KeelhavenWorld> {
  const group = new Group();
  group.name = 'keelhaven';
  const water = createKeelhavenWaterMesh((x, z) => o.heightField.heightAt(x, z));
  group.add(water.mesh);
  await breathe();
  const mist = createKeelhavenMist(o.tier);
  if (mist) group.add(mist.sprite);
  await breathe();
  // The shipyard and the harbour, a part at a step, merged into chunks of the kit's materials.
  const buckets = makeBuckets();
  const steps = buildShipyard(buckets, o.kit, o.tier.tier === 'lite');
  let r = steps.next();
  for (; !r.done; r = steps.next()) await breathe();
  const works = r.value;
  // The Old Town and the Gate Light, into the same buckets (one set of chunks for the island).
  const town = buildTown(
    buckets,
    o.kit,
    works,
    o.tier.tier === 'lite',
    o.tier.tier === 'lite' || o.tier.tier === 'low',
  );
  for (let t = town.next(); !t.done; t = town.next()) await breathe();
  hulkDressing(buckets, works, o.tier.tier === 'lite');
  // The course notice board on the quay (docs/specs/COURSE-BOARDS.md): its timber in the town's
  // chunks, its lettering in the island's sign set (one draw). None without a course (the dev page).
  const signs = typeof document === 'undefined' ? null : new SignSet('keelhaven-signs');
  const courseBoard = signs ? islandCourseBoard('keelhaven') : null;
  // The stops' set pieces with the course's words, and Bram's booth on the quay.
  buildKeelhavenProps(buckets, signs, works);
  buildCircuitProps(buckets, works, o.tier.tier === 'lite');
  addKeelhavenMarket(buckets, works, o.tier.tier === 'lite' || o.tier.tier === 'low');
  if (signs && courseBoard) {
    const pose = COURSE_BOARDS.keelhaven;
    const parts = addCourseBoardTimber(buckets, pose, courseBoard);
    addCourseBoardNotices(signs, pose, courseBoard);
    works.colliders.push(parts.box);
    works.cameraBoxes.push(parts.camera);
  }
  const yard = new Group();
  yard.name = 'keelhaven-shipyard';
  // Each chunk with its index levels of detail (from the sea the yard's fine timber, rope and rails thin out).
  const chunkLods = new ChunkLods(chunkLodEdges(o.tier), chunkLodFloor(o.tier));
  const simplify = await loadLodSimplifier();
  const meshes: Mesh[] = await meshesFromBuckets(buckets, o.kit, o.tier, 'kh-yard', yard, breathe, true, {
    simplify,
    chunkLods,
    // The kit's flat-shaded houses only thin out with distance if their hard edges may collapse.
    permissive: true,
  });
  group.add(yard);
  if (signs?.count) group.add(await signs.finalizeAsync(breathe));
  const toolChest = await createToolChest(o.kit, o.tier, breathe);
  group.add(toolChest.group);
  const hull = createDockHull(o.tier.tier, works.dockHull);
  group.add(hull.mesh);
  // The lamps that change, one mesh in the kit's glow material.
  const lamps = new LampSet(works.lamps, o.kit.materials.glow as Material);
  works.lamps.length = 0;
  if (lamps.mesh) {
    lamps.mesh.updateMatrixWorld(true);
    group.add(lamps.mesh);
  }
  // The flight's three hulls: the dock hull's geometry and material at half size (no new shader).
  const hulls = {} as Record<FlightHull, Mesh>;
  for (const id of FLIGHT_HULLS) {
    const m = new Mesh(hull.mesh.geometry, hull.mesh.material);
    m.name = `keelhaven-hull-${id}`;
    m.scale.setScalar(HULL_SCALE);
    m.castShadow = false;
    m.receiveShadow = true;
    hulls[id] = m;
    group.add(m);
  }
  const chambers = (water.mesh.userData.chambers ?? {}) as Record<string, [number, number]>;
  const circuit: KeelhavenCircuitWorld = {
    lamp: (key, look) => lamps.set(key, look),
    look: (key) => lamps.look(key),
    hull(id, u, v, y, du, dv, roll = 0) {
      const m = hulls[id];
      const p = toWorld(u, v);
      m.position.set(p.x, y, p.z);
      m.rotation.set(0, headingUv(du, dv), roll, 'YXZ');
    },
    water(chamber, y) {
      const r = chambers[chamber];
      if (r) water.setLevel(r[0], r[1], y);
    },
  };
  for (const id of FLIGHT_HULLS) {
    const r = HULL_REST[id];
    circuit.hull(id, r.u, r.v, restWater(r.u), r.du, r.dv);
  }
  await breathe();
  // The reef's wrecks and the Old Hulk: one mesh in the ship's look.
  const wreckSteps = createKeelhavenWrecksSteps(o.tier.tier);
  let w = wreckSteps.next();
  for (; !w.done; w = wreckSteps.next()) await breathe();
  const wrecks = w.value;
  group.add(wrecks.mesh);
  works.shipObstacles.push(...wrecks.shipObstacles);
  works.cameraBoxes.push(...wrecks.cameraBlockers);
  // Boulders at the cliffs' feet, the points and round the wrecks and stacks.
  const rocks = createKeelhavenRocks(o.tier.tier);
  group.add(rocks.group);
  works.circles.push(...rocks.circles);
  await breathe();
  const harbour = toWorld(-40, 0);
  const reef = toWorld(-310, -170);
  return {
    group,
    works,
    anchors: KEELHAVEN_ANCHORS,
    toolChest,
    circuit,
    shipObstacles: () => works.shipObstacles,
    birds: [
      { center: new Vector3(harbour.x, 0, harbour.z), radius: 180, seed: 0x6b1d5, perches: [] },
      { center: new Vector3(reef.x, 0, reef.z), radius: 120, seed: 0x6b1d6, perches: wrecks.perches },
    ],
    update() {},
    frame(camera) {
      chunkLods.update(camera.position.x, camera.position.y, camera.position.z);
    },
    async plants(breathe) {
      const steps = keelhavenPlantsSliced(o.tier.tier, o.heightField);
      for (;;) {
        const r = steps.next();
        if (r.done) return r.value;
        await breathe();
      }
    },
    dispose() {
      signs?.dispose();
      toolChest.dispose();
      water.dispose();
      mist?.dispose();
      for (const m of meshes) m.geometry.dispose();
      hull.dispose();
      lamps.dispose();
      wrecks.dispose();
      rocks.dispose();
    },
  };
}
