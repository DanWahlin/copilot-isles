import { Group, Vector3, type Mesh, type Object3D, type PerspectiveCamera } from 'three/webgpu';
import type { CircleObstacle } from '../contracts';
import type { BirdsSystem } from '../life/birds';
import { createMeridianTownAsync, type MeridianTownSystem } from '../meridian-town';
import { meridianTownPlants } from '../meridian-town/plantings';
import type { WaterStrips } from '../sites/water';
import { skipSunShadows } from '../sky/cached-sun-shadow';
import { loadTerrainPack } from '../terrain/bake';
import type { CameraBlockerBox } from '../terrain/camera-blockers';
import { createCoastFoam } from '../terrain/coast-foam';
import { createTerrainAsync, type CreatedTerrain } from '../terrain/terrain-mesh';
import type { PlantInstance, VegetationPatch } from '../vegetation/types';
import { loadVillageKit } from '../village/kit';
import {
  addIslandBirds,
  addIslandGround,
  addIslandPlants,
  coarserRocksOnLite,
  disposeTree,
  removeIslandGround,
  singlePassWaterOnLite,
} from '../island-parts';
import { freeInSlices, StreamLifecycle } from '../stream-lifecycle';
import {
  MERIDIAN,
  createMeridianRocks,
  meridianNaturalWater,
  meridianRockCameraBlockersSliced,
  meridianWater,
  meridianRockShipObstacles,
} from './meridian';
import { meridianPlantsSliced } from './meridian-plants';
import { MERIDIAN_FLORA } from './meridian-flora';
import { createMeridianSilhouette } from './meridian-silhouette';
import { FarCull } from '../far-cull';
import { footprintDistance } from './footprint';
import type { IslandStream, IslandStreamCreateContext } from './island-stream';
import { SilhouetteSwap } from './silhouette-swap';
import { createMeridianWaterMesh } from './meridian-water-mesh';
import { SMALL_ROCKS } from './stream-stones';

/**
 * Port Meridian's stream (its registry entry, src/islands/meridian.ts, holds its ranges and outline):
 * its world is the town, with the camera-only blockers of its coastal rocks.
 */
export interface MeridianStream extends IslandStream<MeridianTownSystem> {
  readonly town: MeridianTownSystem | null;
  /** Camera-only blockers for its coastal rocks, built in slices before `town` is set. */
  readonly rockCameraBlockers: CameraBlockerBox[];
}

/**
 * Port Meridian streamed in on demand and freed again once you've left it (issue 232; PLAN §13.3):
 * its baked terrain, water, foam, town, plants and gulls arrive hidden, and the game's flow warms
 * them before they're first drawn. Until then (and while the camera's far) its silhouette stands on
 * the horizon.
 */
export function createMeridianStream(ctx: IslandStreamCreateContext): MeridianStream {
  const { scene, tier } = ctx;
  const { ranges, footprint, center } = ctx.island;
  const far = ctx.disabled
    ? { group: new Group(), ready: Promise.resolve() }
    : createMeridianSilhouette(tier.tier, ctx.breathe);
  const silhouette = far.group;
  scene.add(silhouette);
  let held = false;
  const swap = new SilhouetteSwap(ranges.show);
  const detail = new FarCull(center.x, center.z, ranges.detail, tier.detailCullRatio);
  let plants: VegetationPatch | null = null;
  let birds: BirdsSystem | null = null;
  let water: WaterStrips | null = null;
  let disposed = false;
  let obstacles: CircleObstacle[] = [];
  /** The terrain's download priority: low for a prefetch nothing waits on yet (skill §5, streaming audio). */
  let priority: RequestPriority = 'auto';

  const buildParts = async (): Promise<MeridianTownSystem | null> => {
    // The island's course data (its chapter part) loads with its terrain, at the same priority.
    const [data] = await Promise.all([
      loadTerrainPack(`${ctx.packBase}/meridian/terrain`, priority),
      ctx.courseData?.(priority),
    ]);
    if (disposed) return null;
    const terrain = await createTerrainAsync(
      {
        tier,
        data,
        name: 'port-meridian-terrain',
        createRocks: createMeridianRocks,
        cloudShadowNode: ctx.cloudShadowNode,
        // Its far levels keep under the brook, the lake and the pools (no stream hidden in the distance).
        freshWater: meridianWater(),
      },
      ctx.breathe,
    );
    // Owned from here: a failure later takes it back (teardown).
    self.terrain = terrain;
    await ctx.breathe();
    await coarserRocksOnLite(terrain.group, tier);
    // The tarn, cascade, brook, lake and outflow ride with the terrain (shown and hidden with it), as
    // natural water over the tier's drawn ground.
    const ground = terrain.heightField;
    water = createMeridianWaterMesh(meridianWater(), {
      maxQuads: 2400,
      natural: meridianNaturalWater((x, z) => ground.heightAt(x, z), SMALL_ROCKS[tier.tier]),
    });
    terrain.group.add(water.mesh);
    singlePassWaterOnLite(water.mesh, tier);
    if (ctx.skipShadows) skipSunShadows(terrain.group);
    const foam = createCoastFoam(data, terrain.heightField, { maxDistance: 1100 });
    self.foam = foam;
    addIslandGround(ctx, data, terrain, foam);
    self.ready = true;
    const rockBlockers = meridianRockCameraBlockersSliced(terrain.heightField);
    for (let r = rockBlockers.next(); ; r = rockBlockers.next()) {
      if (r.done) {
        self.rockCameraBlockers = r.value;
        break;
      }
      await ctx.breathe();
    }
    const kit = await loadVillageKit();
    if (disposed) return null;
    const town = await createMeridianTownAsync({ tier, heightField: terrain.heightField, kit }, ctx.breathe);
    town.group.visible = false;
    self.town = town;
    scene.add(town.group);
    obstacles = [...town.shipObstacles, ...meridianRockShipObstacles(terrain.heightField)];
    ctx.shipObstacles.push(...obstacles);
    // Its plants (hills and town) as their own vegetation batches, shown with the island.
    const vegetation = ctx.vegetation();
    if (vegetation) {
      const flora: PlantInstance[] = [];
      const steps = meridianPlantsSliced(tier.tier);
      for (let r = steps.next(); ; r = steps.next()) {
        if (r.done) {
          flora.push(...r.value, ...meridianTownPlants(tier.tier));
          break;
        }
        await ctx.breathe();
      }
      if (disposed) return null;
      plants = await addIslandPlants(ctx, vegetation, flora, 'port-meridian-plants', MERIDIAN_FLORA, terrain);
    }
    // Gulls wheeling over Meridian's harbour and the mole, like Anchorage's.
    birds = addIslandBirds(
      ctx,
      new Vector3(MERIDIAN.harbor.center.x + 30, 0, MERIDIAN.harbor.center.z - 40),
      170,
      0x3e51d,
    );
    return town;
  };

  const teardown = async (): Promise<void> => {
    const { terrain, foam, town } = self;
    const patch = plants;
    const gulls = birds;
    const strips = water;
    self.ready = false;
    self.terrain = null;
    self.foam = null;
    self.town = null;
    self.rockCameraBlockers = [];
    plants = null;
    birds = null;
    water = null;
    removeIslandGround(ctx, terrain, obstacles);
    obstacles = [];
    const vegetation = ctx.vegetation();
    await freeInSlices(
      scene,
      [terrain?.group, foam, town?.group, patch?.group, gulls?.group],
      [
        () => patch && vegetation?.removePlants(patch),
        () => gulls?.dispose(),
        () => town?.dispose(),
        () => strips?.dispose(),
        () => foam && disposeTree(foam),
        () => terrain?.dispose(),
      ],
      ctx.breathe,
    );
  };

  /** A stream that fails part-way (a 404, offline) takes back what it had added, then reports it. */
  const build = async (): Promise<MeridianTownSystem | null> => {
    try {
      return await buildParts();
    } catch (error) {
      await teardown();
      throw error;
    }
  };

  const life = new StreamLifecycle<MeridianTownSystem>(build, teardown, ctx.disabled);

  const self = {
    silhouette,
    silhouetteReady: far.ready,
    terrain: null as CreatedTerrain | null,
    foam: null as Mesh | null,
    town: null as MeridianTownSystem | null,
    rockCameraBlockers: [] as CameraBlockerBox[],
    ready: false,
    get loads() {
      return life.loads;
    },
    get state() {
      return life.state;
    },
    load(p: RequestPriority = 'auto', retry = false) {
      // A load that's needed now raises a prefetch's priority for whatever it hasn't fetched yet.
      if (life.state !== 'loading' || p !== 'low') priority = p;
      return life.load(retry);
    },
    get world(): MeridianTownSystem | null {
      return self.town;
    },
    get worldReady() {
      return life.ready;
    },
    onReady: (fn: (town: MeridianTownSystem) => void) => life.onReady(fn),
    detail,
    unload: () => life.unload(),
    roots(): Object3D[] {
      const roots: (Object3D | null | undefined)[] = [
        self.terrain?.group,
        self.foam,
        self.town?.group,
        birds?.group,
        plants?.group,
      ];
      return roots.filter((r): r is Object3D => !!r);
    },
    hold(on: boolean) {
      held = on;
    },
    get held() {
      return held;
    },
    update(camera: PerspectiveCamera, dt: number, t: number) {
      detail.update(camera.position.x, camera.position.z);
      const d = footprintDistance(footprint, camera.position.x, camera.position.z);
      const near = !swap.update(d);
      const show = near || held;
      if (d < ranges.load && ctx.nearLoads()) void life.load();
      const { terrain, foam, town } = self;
      if (self.ready && terrain && foam) {
        if (!held) {
          terrain.group.visible = show;
          foam.visible = show;
          if (town) town.group.visible = show;
          if (plants) plants.group.visible = show;
          if (birds) birds.group.visible = show;
        }
        if (show) terrain.update(camera);
      }
      // The far shape stands in until the island's own ground is drawn.
      silhouette.visible = !(near && self.ready);
      if (!show) return;
      town?.update(dt, t, camera);
      birds?.update(dt, t, camera);
    },
    mirrorHidden(out: (Object3D | null | undefined)[]) {
      out.push(self.terrain?.group, self.foam, self.town?.group, silhouette, birds?.group);
    },
    dispose() {
      disposed = true;
      life.end();
      scene.remove(silhouette);
      disposeTree(silhouette);
      const { terrain, foam, town } = self;
      if (terrain) scene.remove(terrain.group);
      if (foam) scene.remove(foam);
      if (town) scene.remove(town.group);
      if (birds) scene.remove(birds.group);
      water?.dispose();
      terrain?.dispose();
      if (foam) disposeTree(foam);
      town?.dispose();
      birds?.dispose();
    },
  };
  return self;
}
