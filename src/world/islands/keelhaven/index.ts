import { Group, Vector3, type Camera, type Mesh } from 'three/webgpu';
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
import { buildShipyard, type ShipyardOut } from './shipyard';
import { buildTown } from './town-build';
import { createKeelhavenMist } from './mist';
import { keelhavenPlantsSliced } from './vegetation';
import { createKeelhavenWaterMesh } from './water-mesh';

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
  /** The quay's and the works' circles, for the ship. */
  shipObstacles(): CircleObstacle[];
  /** Picks the levels of detail for the camera (no allocation). */
  frame(camera: Camera): void;
  /**
   * Gull flocks for the stream to add (`addIslandBirds`): over the harbour, and over the reef with
   * perches on the standing wreck's masts.
   */
  birds: { center: Vector3; radius: number; seed: number; perches: Vector3[] }[];
  /** Runs what moves (nothing yet: the sheerlegs' block, the gates and the lamps come with the wiring). */
  update(dt: number, t: number): void;
  /** The island's plants, built a slice at a time, for `vegetation.addPlants`. */
  plants(breathe: () => Promise<void>): Promise<PlantInstance[]>;
  dispose(): void;
}

export interface KeelhavenWorldOptions {
  tier: TierSettings;
  /** The island's own baked ground (the drawn ground: the water's depth reads over it). */
  heightField: HeightField;
  kit: VillageKit;
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
  if (signs && courseBoard) group.add(await signs.finalizeAsync(breathe));
  const hull = createDockHull(o.tier.tier, works.dockHull);
  group.add(hull.mesh);
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
      water.dispose();
      mist?.dispose();
      for (const m of meshes) m.geometry.dispose();
      hull.dispose();
      wrecks.dispose();
      rocks.dispose();
    },
  };
}
