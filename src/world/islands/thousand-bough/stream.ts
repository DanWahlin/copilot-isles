import { Group, Vector3, type Mesh, type Object3D, type PerspectiveCamera } from 'three/webgpu';
import type { TierSettings } from '../../../engine/quality';
import type { CircleObstacle } from '../../contracts';
import { loadLodSimplifier } from '../../characters/character-lod';
import { FarCull } from '../../far-cull';
import { skipSunShadows } from '../../sky/cached-sun-shadow';
import { createCoastFoam } from '../../terrain/coast-foam';
import { loadTerrainPack } from '../../terrain/bake';
import {
  addWaterDepthTile,
  removeWaterDepthTile,
  waterDepthTileFromTerrain,
  type WaterDepthTile,
} from '../../ocean/water-depth-texture';
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
import { footprintDistance, type IslandFootprint } from '../footprint';
import { SilhouetteSwap } from '../silhouette-swap';
import {
  addIslandBirds,
  addIslandGround,
  addIslandPlants,
  disposeTree,
  removeIslandGround,
  type IslandStreamContext,
} from '../../island-parts';
import { freeInSlices, StreamLifecycle, type StreamState } from '../../stream-lifecycle';
import type { VegetationPatch } from '../../vegetation/types';

/** The boulders cast the sun's shadow on High and Ultra (Low and Medium spend those triangles elsewhere). */
const ROCK_SHADOWS = (tier: TierSettings['tier']) => tier === 'high' || tier === 'ultra';

/**
 * Distances (m): it streams in within `load`, is drawn (not the silhouette) within `show` (resident or
 * not; a band either side, `SWAP_HYSTERESIS`, keeps it from flickering there), and may be
 * freed past `unload` (game/residency.ts), all by `footprintDistance` (from its centre as if its shore
 * were round); its small detail within `detail` of its centre.
 */
export const THOUSAND_BOUGH_RANGE = { load: 1100, show: 900, detail: 640, unload: 1350 } as const;

/** Thousand-Bough's outline (as `MERIDIAN_FOOTPRINT`): its ranges go by `footprintDistance`. */
export const THOUSAND_BOUGH_FOOTPRINT: IslandFootprint = {
  x: TB.center.x,
  z: TB.center.z,
  radii: [
    320, 324, 336, 324, 320, 268, 260, 260, 256, 256, 252, 148, 308, 328, 332, 328, 336, 348, 352, 384, 400,
    368, 340, 324, 316, 312, 324, 348, 344, 332, 336, 344,
  ],
};

export interface ThousandBoughStream {
  /** The far shape, drawn until the island is near. */
  silhouette: Group;
  /** Resolves once the silhouette's mesh is built (a few grid rows a breath). */
  readonly silhouetteReady: Promise<void>;
  terrain: CreatedTerrain | null;
  foam: Mesh | null;
  /** The island's world (the tree village, its water, mist, life), once streamed. */
  system: ThousandBoughWorld | null;
  ready: boolean;
  /** Where it is: absent, loading, resident or unloading. */
  readonly state: StreamState;
  /** How many times it has streamed in this voyage (each load's content is set up once). */
  readonly loads: number;
  /**
   * Starts streaming the island (once per residency; later calls share it). Nothing of it loads
   * until something needs it: boarding for it, the chart's pick, a save or a jump there, or coming
   * within 1100 m. Resolves with the system once everything is in the scene (hidden), or null. After
   * an unload the next call streams it again; `priority` 'low' is a prefetch.
   */
  load(priority?: RequestPriority, retry?: boolean): Promise<ThousandBoughWorld | null>;
  /** Resolves when the current (or next) load has finished (it doesn't start the stream). */
  readonly worldReady: Promise<ThousandBoughWorld | null>;
  /** Hears every load (the first and each reload after an unload). */
  onReady(fn: (world: ThousandBoughWorld) => void): () => void;
  /**
   * Frees the island (terrain, foam, the tree village, plants, birds, its height field and ship
   * obstacles) a part a frame; the silhouette stays. Whoever put things on it takes them off first.
   */
  unload(): Promise<void>;
  /** The island's own roots (terrain, foam, world, plants, birds) for a warm-up, once streamed. */
  roots(): Object3D[];
  /** Hands the island's visibility to a warm-up (the frame loop keeps updating but stops showing/hiding it). */
  hold(on: boolean): void;
  /** True while a warm-up holds it. */
  readonly held: boolean;
  /** Small detail (people, chests, props) culled while the camera's far from the island. */
  detail: FarCull;
  /** Per frame: streams in by range, shows or hides by range, and runs the world. */
  update(camera: PerspectiveCamera, dt: number, t: number): void;
  /** Roots the harbour mirror leaves out (pushed onto `out`). */
  mirrorHidden(out: (Object3D | null | undefined)[]): void;
  dispose(): void;
}

export interface ThousandBoughStreamContext extends IslandStreamContext {
  /** The sky, whose mood (haze) the island sets as you near it. */
  sky: { mood: { fogScale: number; hazeTint: [number, number, number]; fill: number; exposure: number } };
}

/**
 * Thousand-Bough Isle streamed in on demand, like Port Meridian (skill §3): its baked terrain, coast
 * foam, the tree village and its plants arrive hidden, and the game's flow warms them before they're
 * first drawn. Until then (and while the camera's far) its silhouette stands on the horizon.
 */
export function createThousandBoughStream(ctx: ThousandBoughStreamContext): ThousandBoughStream {
  const { scene, tier } = ctx;
  const far = ctx.disabled
    ? { group: new Group(), ready: Promise.resolve() }
    : createThousandBoughSilhouette(tier.tier, ctx.breathe);
  const silhouette = far.group;
  scene.add(silhouette);
  let disposed = false;
  let held = false;
  const swap = new SilhouetteSwap(THOUSAND_BOUGH_RANGE.show);
  let plants: VegetationPatch | null = null;
  let birds: BirdsSystem | null = null;
  let obstacles: CircleObstacle[] = [];
  let priority: RequestPriority = 'auto';
  // Its floor for the ocean's depth colour (turquoise shallows), lent to the ocean while it's in memory.
  // The ocean's first draw with it uploads it, so it's lent when the warm-up holds the island (an
  // upload the hitch guard excuses), or when the island first shows without a warm-up.
  let depthTile: WaterDepthTile | null = null;
  const lendDepthTile = () => {
    if (depthTile && self.ready) addWaterDepthTile(depthTile);
  };
  const dropDepthTile = () => {
    if (depthTile) removeWaterDepthTile(depthTile);
    depthTile = null;
  };
  const detail = new FarCull(TB.center.x, TB.center.z, THOUSAND_BOUGH_RANGE.detail, tier.detailCullRatio);

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
    const tileBuild = waterDepthTileFromTerrain(data, 'thousand-bough');
    for (let r = tileBuild.next(); ; r = tileBuild.next()) {
      if (r.done) {
        depthTile = r.value;
        break;
      }
      await ctx.breathe();
    }
    if (disposed) {
      dropDepthTile();
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
    dropDepthTile();
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
  const resetMood = () => {
    const mood = ctx.sky.mood;
    mood.fogScale = 1;
    for (let i = 0; i < 3; i++) mood.hazeTint[i] = 1;
    mood.fill = 1;
    mood.exposure = 1;
  };

  const self: ThousandBoughStream = {
    silhouette,
    silhouetteReady: far.ready,
    terrain: null,
    foam: null,
    system: null,
    ready: false,
    detail,
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
      if (on) lendDepthTile();
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
      const mood = ctx.sky.mood;
      mood.fogScale = 1 + (TB.mood.fogScale - 1) * k;
      for (let i = 0; i < 3; i++) mood.hazeTint[i] = 1 + (TB.mood.hazeTint[i]! - 1) * k;
      mood.fill = 1 + (TB.mood.fill - 1) * k;
      mood.exposure = 1 + (TB.mood.exposure - 1) * k;
      const reach = footprintDistance(THOUSAND_BOUGH_FOOTPRINT, camera.position.x, camera.position.z);
      if (reach < THOUSAND_BOUGH_RANGE.load) void self.load();
      const near = !swap.update(reach);
      const show = near || held;
      if (self.ready && self.terrain && self.foam && !held) {
        if (show) lendDepthTile();
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
      dropDepthTile();
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
