import { Group, type Mesh, type Object3D } from 'three/webgpu';
import type { CircleObstacle } from '../../contracts';
import { FarCull } from '../../far-cull';
import type { BirdsSystem } from '../../life/birds';
import { skipSunShadows } from '../../sky/cached-sun-shadow';
import { loadTerrainPack } from '../../terrain/bake';
import { createCoastFoam } from '../../terrain/coast-foam';
import { createTerrainAsync, type CreatedTerrain } from '../../terrain/terrain-mesh';
import { loadVillageKit } from '../../village/kit';
import type { VegetationPatch } from '../../vegetation/types';
import {
  addIslandBirds,
  addIslandGround,
  addIslandPlants,
  disposeTree,
  removeIslandGround,
} from '../../island-parts';
import { freeInSlices, StreamLifecycle } from '../../stream-lifecycle';
import { wreckWaterline } from '../../wreck/wreck';
import { createIslandDepthTile } from '../depth-tile';
import { footprintDistance } from '../footprint';
import type { IslandStream, IslandStreamCreateContext } from '../island-stream';
import { SilhouetteSwap } from '../silhouette-swap';
import { worksFoamSkip, worksSkin } from './apron';
import { KEELHAVEN_FLORA } from './flora';
import { keelhavenTerrainWater } from './height';
import { createKeelhavenWorldAsync, type KeelhavenWorld } from './index';
import { KEELHAVEN as K } from './layout';
import { createKeelhavenSilhouette } from './silhouette';
import { KEELHAVEN_PLANT_LOOK } from './vegetation';
import { worksApronSteps, worksPin } from './works';
import { KEELHAVEN_WRECKS } from './wrecks';

/** Keelhaven's stream (its registry entry holds its ranges and outline): its world is the town and works. */
export interface KeelhavenStream extends IslandStream<KeelhavenWorld> {
  readonly system: KeelhavenWorld | null;
}

/**
 * Keelhaven streamed in on demand, like Thousand-Bough (skill §3): its baked terrain, coast foam (with
 * surf on the exposed cliff feet and a wash round each wreck), the town, the shipyard, the falls and
 * its plants arrive hidden, and the game's flow warms them before they're first drawn. Until then (and
 * while the camera's far) its silhouette stands on the horizon.
 */
export function createKeelhavenStream(ctx: IslandStreamCreateContext): KeelhavenStream {
  const { scene, tier } = ctx;
  const { ranges, footprint, center } = ctx.island;
  const far = ctx.disabled
    ? { group: new Group(), ready: Promise.resolve() }
    : createKeelhavenSilhouette(tier.tier, ctx.breathe);
  const silhouette = far.group;
  scene.add(silhouette);
  let disposed = false;
  let held = false;
  const swap = new SilhouetteSwap(ranges.show);
  let plants: VegetationPatch | null = null;
  const flocks: BirdsSystem[] = [];
  let obstacles: CircleObstacle[] = [];
  let priority: RequestPriority = 'auto';
  // Its own floor for the ocean's depth colour (the reefs and the cove's shallows), lent while it's in memory.
  const depth = ctx.island.stream?.depthTile ? createIslandDepthTile(ctx.island.id) : null;
  const detail = new FarCull(center.x, center.z, ranges.detail, tier.detailCullRatio);

  const buildParts = async (): Promise<KeelhavenWorld | null> => {
    // The island's course data (its chapter part) loads with its terrain, at the same priority.
    const [data] = await Promise.all([
      loadTerrainPack(`${ctx.packBase}/keelhaven/terrain`, priority),
      ctx.courseData?.(priority),
    ]);
    if (disposed) return null;
    // The works' apron (made once): a skin of ground over the ramp the pinned lock floors make.
    const apronSteps = worksApronSteps();
    let apron = apronSteps.next();
    while (!apron.done) {
      await ctx.breathe();
      apron = apronSteps.next();
    }
    if (disposed) return null;
    const terrain = await createTerrainAsync(
      {
        tier,
        data,
        name: 'keelhaven-terrain',
        cloudShadowNode: ctx.cloudShadowNode,
        // Its far levels keep under the river and the falls; its tall fluted walls take prefiltered
        // coarse levels, and the whole island is one block from the sea.
        freshWater: keelhavenTerrainWater(),
        prefilter: K.terrain.prefilter,
        maxMergedTriangles: K.terrain.maxMergedTriangles,
        morphFrames: K.terrain.morphFrames,
        // Every level keeps the works' floors and pads level, and the apron covers the ramp between.
        pin: worksPin,
        skin: worksSkin(apron.value),
      },
      ctx.breathe,
    );
    // Owned from here: a failure later takes it back (teardown).
    self.terrain = terrain;
    await ctx.breathe();
    if (ctx.skipShadows) skipSunShadows(terrain.group);
    const foam = createCoastFoam(data, terrain.heightField, {
      maxDistance: 1100,
      // Surf on the outer coast's cliff feet, and a wash round each wreck on the reef.
      exposure: 1,
      rings: KEELHAVEN_WRECKS.map((d) => wreckWaterline(d.pose)),
      // None along the works' walls (the cut's water is sheltered).
      skip: worksFoamSkip,
    });
    self.foam = foam;
    await depth?.build(data, ctx.breathe);
    if (disposed) {
      depth?.drop();
      return null;
    }
    addIslandGround(ctx, data, terrain, foam);
    self.ready = true;
    const kit = await loadVillageKit();
    if (disposed) return null;
    const system = await createKeelhavenWorldAsync(
      { tier, heightField: terrain.heightField, kit },
      ctx.breathe,
    );
    if (disposed) {
      system.dispose();
      return null;
    }
    system.group.visible = false;
    if (ctx.skipShadows) skipSunShadows(system.group);
    scene.add(system.group);
    self.system = system;
    obstacles = system.shipObstacles();
    ctx.shipObstacles.push(...obstacles);
    const vegetation = ctx.vegetation();
    if (vegetation) {
      const flora = await system.plants(ctx.breathe);
      if (disposed) return null;
      plants = await addIslandPlants(
        ctx,
        vegetation,
        flora,
        'keelhaven-plants',
        KEELHAVEN_FLORA,
        terrain,
        KEELHAVEN_PLANT_LOOK,
      );
    }
    // Gulls over the harbour, and over the reef with perches on the standing wreck's masts.
    for (const f of system.birds) {
      const b = addIslandBirds(ctx, f.center, f.radius, f.seed, f.perches);
      if (b) flocks.push(b);
    }
    return system;
  };

  const teardown = async (): Promise<void> => {
    const { terrain, foam, system } = self;
    const patch = plants;
    const birds = flocks.splice(0);
    self.ready = false;
    self.terrain = null;
    self.foam = null;
    self.system = null;
    plants = null;
    removeIslandGround(ctx, terrain, obstacles);
    obstacles = [];
    depth?.drop();
    // Its air goes back to the open sea's.
    resetMood();
    const vegetation = ctx.vegetation();
    await freeInSlices(
      scene,
      [terrain?.group, foam, system?.group, patch?.group, ...birds.map((b) => b.group)],
      [
        () => patch && vegetation?.removePlants(patch),
        () => {
          for (const b of birds) b.dispose();
        },
        () => system?.dispose(),
        () => foam && disposeTree(foam),
        () => terrain?.dispose(),
      ],
      ctx.breathe,
    );
  };

  /** A stream that fails part-way (a 404, offline) takes back what it had added, then reports it. */
  const build = async (): Promise<KeelhavenWorld | null> => {
    try {
      return await buildParts();
    } catch (error) {
      await teardown();
      throw error;
    }
  };

  const life = new StreamLifecycle<KeelhavenWorld>(build, teardown, ctx.disabled);
  const resetMood = () => {
    const mood = ctx.sky.mood;
    mood.fogScale = 1;
    for (let i = 0; i < 3; i++) mood.hazeTint[i] = 1;
    mood.fill = 1;
    mood.exposure = 1;
  };
  const reach = ctx.island.skyReach ?? { reach: 1300, full: 800 };

  const self: KeelhavenStream & {
    terrain: CreatedTerrain | null;
    foam: Mesh | null;
    system: KeelhavenWorld | null;
    ready: boolean;
  } = {
    silhouette,
    silhouetteReady: far.ready,
    terrain: null,
    foam: null,
    system: null,
    ready: false,
    detail,
    get world() {
      return self.system;
    },
    get state() {
      return life.state;
    },
    get loads() {
      return life.loads;
    },
    get worldReady() {
      return life.ready;
    },
    onReady: (fn) => life.onReady(fn),
    unload: () => life.unload(),
    load(p: RequestPriority = 'auto', retry = false) {
      // A load that's needed now raises a prefetch's priority for whatever it hasn't fetched yet.
      if (life.state !== 'loading' || p !== 'low') priority = p;
      return life.load(retry);
    },
    roots() {
      const roots: (Object3D | null | undefined)[] = [
        self.terrain?.group,
        self.foam,
        self.system?.group,
        plants?.group,
        ...flocks.map((b) => b.group),
      ];
      return roots.filter((r): r is Object3D => !!r);
    },
    hold(on) {
      held = on;
      if (on) depth?.lend(self.ready);
    },
    get held() {
      return held;
    },
    update(camera, dt, t) {
      const d = Math.hypot(camera.position.x - K.center.x, camera.position.z - K.center.z);
      // The island's air eases in with its light (the passage blend, from the identity at sea).
      const k0 = Math.min(1, Math.max(0, (reach.reach - d) / (reach.reach - reach.full)));
      const k = k0 * k0 * (3 - 2 * k0);
      const mood = ctx.sky.mood;
      mood.fogScale = 1 + (K.mood.fogScale - 1) * k;
      for (let i = 0; i < 3; i++) mood.hazeTint[i] = 1 + (K.mood.hazeTint[i]! - 1) * k;
      mood.fill = 1 + (K.mood.fill - 1) * k;
      mood.exposure = 1 + (K.mood.exposure - 1) * k;
      const off = footprintDistance(footprint, camera.position.x, camera.position.z);
      if (off < ranges.load && ctx.nearLoads()) void self.load();
      const near = !swap.update(off);
      const show = near || held;
      if (self.ready && self.terrain && self.foam && !held) {
        if (show) depth?.lend(true);
        self.terrain.group.visible = show;
        self.foam.visible = show;
        if (self.system) self.system.group.visible = show;
        if (plants) plants.group.visible = show;
        for (let i = 0; i < flocks.length; i++) flocks[i]!.group.visible = show;
      }
      if (show) self.terrain?.update(camera);
      // Held for its warm-up: the levels of detail stay as the warm shows them (both drawn once).
      if (show && !held) self.system?.frame(camera);
      // The far shape stands in until the island's own ground is drawn.
      // From high above (an aerial view) the coarse silhouette would show as a sheet: only from low.
      silhouette.visible = !(near && self.ready) && camera.position.y < 150;
      detail.update(camera.position.x, camera.position.z);
      if (!show) return;
      self.system?.update(dt, t);
      for (let i = 0; i < flocks.length; i++) flocks[i]!.update(dt, t, camera);
    },
    mirrorHidden(out) {
      out.push(self.terrain?.group, self.foam, self.system?.group, silhouette);
      for (const b of flocks) out.push(b.group);
    },
    dispose() {
      disposed = true;
      life.end();
      depth?.drop();
      scene.remove(silhouette);
      disposeTree(silhouette);
      if (self.terrain) {
        scene.remove(self.terrain.group);
        self.terrain.dispose();
      }
      if (self.foam) {
        scene.remove(self.foam);
        disposeTree(self.foam);
      }
      if (self.system) {
        scene.remove(self.system.group);
        self.system.dispose();
      }
      for (const b of flocks.splice(0)) {
        scene.remove(b.group);
        b.dispose();
      }
    },
  };
  return self;
}
