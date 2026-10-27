import { Group, Vector3, type Mesh, type Object3D } from 'three/webgpu';
import type { TierSettings } from '../../../engine/quality';
import type { CircleObstacle } from '../../contracts';
import { loadLodSimplifier } from '../../characters/character-lod';
import { FarCull } from '../../far-cull';
import { skipSunShadows } from '../../sky/cached-sun-shadow';
import { createCoastFoam } from '../../terrain/coast-foam';
import { loadTerrainPack } from '../../terrain/bake';
import { createTerrainAsync, type CreatedTerrain } from '../../terrain/terrain-mesh';
import { LITE_ROCK_ERROR, simplifyInPlace } from '../../village/chunks';
import { loadVillageKit } from '../../village/kit';
import type { BirdsSystem } from '../../life/birds';
import { createThousandBoughAsync, type ThousandBoughWorld } from './index';
import { createThousandBoughRocks, type ThousandBoughRocks } from './rocks';
import { thousandBoughWater } from './height';
import { SMALL_ROCKS } from '../stream-stones';
import { THOUSAND_BOUGH as TB } from './layout';
import { THOUSAND_BOUGH_FLORA } from './flora';
import { createThousandBoughSilhouette } from './tree/silhouette';
import { createIslandDepthTile } from '../depth-tile';
import { applyIslandMood, resetMood as resetSkyMood } from '../../sky/mood';
import { footprintDistance } from '../footprint';
import type { IslandStream, IslandStreamCreateContext } from '../island-stream';
import { SilhouetteSwap } from '../silhouette-swap';
import {
  addIslandBirds,
  addIslandGround,
  addIslandPlants,
  disposeTree,
  removeIslandGround,
} from '../../island-parts';
import { freeInSlices, StreamLifecycle } from '../../stream-lifecycle';
import type { VegetationPatch } from '../../vegetation/types';

/** The boulders cast the sun's shadow on High and Ultra (Low and Medium spend those triangles elsewhere). */
const ROCK_SHADOWS = (tier: TierSettings['tier']) => tier === 'high' || tier === 'ultra';

/** Thousand-Bough's stream (its registry entry holds its ranges and outline): its world is the tree village. */
export interface ThousandBoughStream extends IslandStream<ThousandBoughWorld> {
  readonly system: ThousandBoughWorld | null;
}

/**
 * Thousand-Bough Isle streamed in on demand, like Port Meridian (skill §3): its baked terrain, coast
 * foam, the tree village and its plants arrive hidden, and the game's flow warms them before they're
 * first drawn. Until then (and while the camera's far) its silhouette stands on the horizon.
 */
export function createThousandBoughStream(ctx: IslandStreamCreateContext): ThousandBoughStream {
  const { scene, tier } = ctx;
  const { ranges, footprint, center } = ctx.island;
  const far = ctx.disabled
    ? { group: new Group(), ready: Promise.resolve() }
    : createThousandBoughSilhouette(tier.tier, ctx.breathe);
  const silhouette = far.group;
  scene.add(silhouette);
  let disposed = false;
  let held = false;
  const swap = new SilhouetteSwap(ranges.show);
  let plants: VegetationPatch | null = null;
  let birds: BirdsSystem | null = null;
  let obstacles: CircleObstacle[] = [];
  let priority: RequestPriority = 'auto';
  // Its own floor for the ocean's depth colour (turquoise shallows), lent while it's in memory.
  const depth = ctx.island.stream?.depthTile ? createIslandDepthTile(ctx.island.id) : null;
  const detail = new FarCull(center.x, center.z, ranges.detail, tier.detailCullRatio);

  const buildParts = async (): Promise<ThousandBoughWorld | null> => {
    // The island's course data (its chapter part) loads with its terrain, at the same priority.
    const [data] = await Promise.all([
      loadTerrainPack(`${ctx.packBase}/thousand-bough/terrain`, priority),
      ctx.courseData?.(priority),
    ]);
    if (disposed) return null;
    // The island's own boulders and the Spire ride with the terrain (shown and warmed with it).
    let rocks: ThousandBoughRocks | null = null;
    const terrain = await createTerrainAsync(
      {
        tier,
        data,
        name: 'thousand-bough-terrain',
        cloudShadowNode: ctx.cloudShadowNode,
        // Its far levels keep under the streams and the pools (no stream hidden in the distance).
        freshWater: thousandBoughWater(),
        createRocks: (hf) =>
          (rocks = createThousandBoughRocks(hf, undefined, SMALL_ROCKS[tier.tier], ROCK_SHADOWS(tier.tier)))
            .group,
      },
      ctx.breathe,
    );
    // Owned from here: a failure later takes it back (teardown).
    self.terrain = terrain;
    // Lite's rocks (the boulders, the cave's roof and the flume's stones share their shapes) take
    // the coarser shape the other islands' loose rocks have there. Before anything draws them, so
    // nothing uploads twice.
    const shapes = (rocks as ThousandBoughRocks | null)?.flumeStones.geometries ?? [];
    const simplify = tier.tier === 'lite' && shapes.length ? await loadLodSimplifier() : null;
    if (simplify) for (const g of shapes) simplifyInPlace(g, simplify, LITE_ROCK_ERROR);
    await ctx.breathe();
    if (ctx.skipShadows) skipSunShadows(terrain.group);
    const foam = createCoastFoam(data, terrain.heightField, { maxDistance: 1100 });
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
    const system = await createThousandBoughAsync(
      { tier, heightField: terrain.heightField, kit, rocks },
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
        'thousand-bough-plants',
        THOUSAND_BOUGH_FLORA,
        terrain,
      );
    }
    birds = addIslandBirds(ctx, new Vector3(TB.tree.x - 30, 0, TB.tree.z + 60), 200, 0x7b0b9);
    return system;
  };

  const teardown = async (): Promise<void> => {
    const { terrain, foam, system } = self;
    const patch = plants;
    const flock = birds;
    self.ready = false;
    self.terrain = null;
    self.foam = null;
    self.system = null;
    plants = null;
    birds = null;
    removeIslandGround(ctx, terrain, obstacles);
    obstacles = [];
    depth?.drop();
    // Its air goes back to the open sea's.
    resetMood();
    const vegetation = ctx.vegetation();
    await freeInSlices(
      scene,
      [terrain?.group, foam, system?.group, patch?.group, flock?.group],
      [
        () => patch && vegetation?.removePlants(patch),
        () => flock?.dispose(),
        () => system?.dispose(),
        () => foam && disposeTree(foam),
        () => terrain?.dispose(),
      ],
      ctx.breathe,
    );
  };

  /** A stream that fails part-way (a 404, offline) takes back what it had added, then reports it. */
  const build = async (): Promise<ThousandBoughWorld | null> => {
    try {
      return await buildParts();
    } catch (error) {
      await teardown();
      throw error;
    }
  };

  const life = new StreamLifecycle<ThousandBoughWorld>(build, teardown, ctx.disabled);
  const resetMood = () => resetSkyMood(ctx.sky.mood);

  const self: ThousandBoughStream & {
    terrain: CreatedTerrain | null;
    foam: Mesh | null;
    system: ThousandBoughWorld | null;
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
        birds?.group,
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
      const d = Math.hypot(camera.position.x - TB.center.x, camera.position.z - TB.center.z);
      // The island's air eases in with its light (ISLANDS' passage blend, from the identity at sea).
      const R = TB.skyReach;
      const k0 = Math.min(1, Math.max(0, (R.reach - d) / (R.reach - R.full)));
      const k = k0 * k0 * (3 - 2 * k0);
      applyIslandMood(ctx.sky.mood, TB.mood, k);
      const reach = footprintDistance(footprint, camera.position.x, camera.position.z);
      if (reach < ranges.load && ctx.nearLoads()) void self.load();
      const near = !swap.update(reach);
      const show = near || held;
      if (self.ready && self.terrain && self.foam && !held) {
        if (show) depth?.lend(true);
        self.terrain.group.visible = show;
        self.foam.visible = show;
        if (self.system) self.system.group.visible = show;
        if (plants) plants.group.visible = show;
        if (birds) birds.group.visible = show;
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
      birds?.update(dt, t, camera);
    },
    mirrorHidden(out) {
      out.push(self.terrain?.group, self.foam, self.system?.group, silhouette, birds?.group);
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
      if (birds) {
        scene.remove(birds.group);
        birds.dispose();
      }
    },
  };
  return self;
}
