import { Group, Vector3, type Mesh, type Object3D, type PerspectiveCamera, type Scene } from 'three/webgpu';
import type { Node } from 'three/webgpu';
import type { TierSettings } from '../../engine/quality';
import type { CircleObstacle } from '../contracts';
import { createBirds, type BirdsSystem } from '../life/birds';
import { createMeridianTownAsync, type MeridianTownSystem } from '../meridian-town';
import { meridianTownPlants } from '../meridian-town/plantings';
import type { WaterStrips } from '../sites/water';
import { skipSunShadows } from '../sky/cached-sun-shadow';
import { loadTerrainPack } from '../terrain/bake';
import type { CameraBlockerBox } from '../terrain/camera-blockers';
import { createCoastFoam } from '../terrain/coast-foam';
import type { CompositeHeightField } from '../terrain/composite-height-field';
import { createTerrainAsync, type CreatedTerrain } from '../terrain/terrain-mesh';
import type { VegetationSystem } from '../vegetation';
import type { PlantInstance, VegetationPatch } from '../vegetation/types';
import { loadVillageKit } from '../village/kit';
import { coarserRocksOnLite, disposeTree, singlePassWaterOnLite } from '../island-parts';
import { freeInSlices, StreamLifecycle, type StreamState } from '../stream-lifecycle';
import {
  MERIDIAN,
  createMeridianRocks,
  meridianRockCameraBlockersSliced,
  meridianRockShipObstacles,
} from './meridian';
import { meridianPlantsSliced } from './meridian-plants';
import { createMeridianSilhouette } from './meridian-silhouette';
import { footprintDistance, type IslandFootprint } from './footprint';
import { createMeridianWaterMesh } from './meridian-water-mesh';

/**
 * Port Meridian's distances (m, `footprintDistance`: from its centre as if its shore were round): it
 * streams in within `load`, is drawn (not its silhouette) within `show`, and may be freed once you're
 * past `unload` (see game/residency.ts). Its north-east cliffs are ~700 m off Thousand-Bough's
 * mooring (1 005 here): `unload` stays under that, so it's freed while you're there.
 */
export const MERIDIAN_RANGE = { load: 880, show: 760, unload: 950 } as const;

/**
 * Port Meridian's outline (`measureFootprint(meridianHeight, …)`, 32 bearings; a test keeps it in
 * step): its ranges go by `footprintDistance`, so the swap is as far off its north-east cliffs as
 * off its town.
 */
export const MERIDIAN_FOOTPRINT: IslandFootprint = {
  x: MERIDIAN.center.x,
  z: MERIDIAN.center.z,
  radii: [
    340, 328, 300, 280, 248, 236, 224, 212, 200, 192, 212, 288, 292, 304, 292, 320, 336, 332, 316, 280, 252,
    232, 236, 232, 268, 312, 328, 380, 440, 496, 496, 352,
  ],
};

export interface MeridianStream {
  silhouette: Group;
  /** Resolves once the silhouette's mesh is built (a few grid rows a breath). */
  readonly silhouetteReady: Promise<void>;
  terrain: CreatedTerrain | null;
  foam: Mesh | null;
  town: MeridianTownSystem | null;
  /** Camera-only blockers for its coastal rocks, built in slices before `town` is set. */
  rockCameraBlockers: CameraBlockerBox[];
  ready: boolean;
  /** Where it is: absent, loading, resident or unloading. */
  readonly state: StreamState;
  /** How many times it has streamed in this voyage (each load's content is set up once). */
  readonly loads: number;
  /**
   * Starts streaming Port Meridian (once per residency; later calls share it). Nothing of it loads
   * until something needs it: boarding for it, the chart's pick, a save or a jump there, or coming
   * within its `load` range. Resolves with the town once terrain and town are in the scene (hidden), or null if
   * Meridian is disabled or failed. After an unload, the next call streams it again. `priority` 'low'
   * is a prefetch (the likely next island): its download shares the line with the music.
   */
  load(priority?: RequestPriority, retry?: boolean): Promise<MeridianTownSystem | null>;
  /** Resolves when the current (or next) load has finished (it doesn't start the stream). */
  readonly townReady: Promise<MeridianTownSystem | null>;
  /** Hears every load (the first and each reload after an unload). */
  onReady(fn: (town: MeridianTownSystem) => void): () => void;
  /**
   * Frees the island (terrain, water, foam, town, plants, gulls, its height field and ship obstacles)
   * a part a frame; the silhouette stays. Whoever put things on it takes them off first.
   */
  unload(): Promise<void>;
  /** Meridian's own roots (terrain, foam, town, gulls, plants) for a warm-up, once streamed. */
  roots(): Object3D[];
  /**
   * Hands Meridian's visibility to a warm-up running from afar (the frame loop stops showing and
   * hiding it, but keeps updating it; the silhouette stays as it is).
   */
  hold(on: boolean): void;
  /** True while a warm-up holds it. */
  readonly held: boolean;
  /** Per frame: streams in by range, shows or hides by range, and runs the town and gulls. */
  update(camera: PerspectiveCamera, dt: number, t: number): void;
  /** Roots the harbour mirror leaves out (pushed onto `out`). */
  mirrorHidden(out: (Object3D | null | undefined)[]): void;
  dispose(): void;
}

export interface MeridianStreamContext {
  scene: Scene;
  tier: TierSettings;
  packBase: string;
  cloudShadowNode?: Node<'float'> | null;
  breathe: () => Promise<void>;
  heightField: CompositeHeightField;
  /** The ship's obstacles (the town's quays and the coastal rocks join them while it's in). */
  shipObstacles: CircleObstacle[];
  vegetation: () => VegetationSystem | null;
  birds: boolean;
  /** Where the tier has sun shadows but the islands don't take them (cove-scene's `skipIslandShadows`). */
  skipShadows: boolean;
  disabled: boolean;
  /** Whether coming near streams the island in (a course that doesn't use it leaves the silhouette). */
  nearLoads?: () => boolean;
}

/**
 * Port Meridian streamed in on demand and freed again once you've left it (issue 232; PLAN §13.3):
 * its baked terrain, water, foam, town, plants and gulls arrive hidden, and the game's flow warms
 * them before they're first drawn. Until then (and while the camera's far) its silhouette stands on
 * the horizon.
 */
export function createMeridianStream(ctx: MeridianStreamContext): MeridianStream {
  const { scene, tier } = ctx;
  const far = ctx.disabled
    ? { group: new Group(), ready: Promise.resolve() }
    : createMeridianSilhouette(tier.tier, ctx.breathe);
  const silhouette = far.group;
  scene.add(silhouette);
  let held = false;
  let plants: VegetationPatch | null = null;
  let birds: BirdsSystem | null = null;
  let water: WaterStrips | null = null;
  let disposed = false;
  let obstacles: CircleObstacle[] = [];
  /** The terrain's download priority: low for a prefetch nothing waits on yet (skill §5, streaming audio). */
  let priority: RequestPriority = 'auto';

  const buildParts = async (): Promise<MeridianTownSystem | null> => {
    const data = await loadTerrainPack(`${ctx.packBase}/meridian/terrain`, priority);
    if (disposed) return null;
    const terrain = await createTerrainAsync(
      {
        tier,
        data,
        name: 'port-meridian-terrain',
        createRocks: createMeridianRocks,
        cloudShadowNode: ctx.cloudShadowNode,
      },
      ctx.breathe,
    );
    // Owned from here: a failure later takes it back (teardown).
    self.terrain = terrain;
    await ctx.breathe();
    await coarserRocksOnLite(terrain.group, tier);
    // The tarn, cascade, brook, lake and outflow ride with the terrain (shown and hidden with it).
    water = createMeridianWaterMesh();
    terrain.group.add(water.mesh);
    singlePassWaterOnLite(water.mesh, tier);
    if (ctx.skipShadows) skipSunShadows(terrain.group);
    const foam = createCoastFoam(data, terrain.heightField, { maxDistance: 1100 });
    self.foam = foam;
    terrain.group.visible = false;
    foam.visible = false;
    scene.add(terrain.group, foam);
    ctx.heightField.add(
      { minX: data.minX, maxX: data.maxX, minZ: data.minZ, maxZ: data.maxZ },
      terrain.heightField,
    );
    self.terrain = terrain;
    self.foam = foam;
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
      plants = await vegetation.addPlants(flora, 'port-meridian-plants');
      if (ctx.skipShadows) skipSunShadows(plants.group);
    }
    // Gulls wheeling over Meridian's harbour and the mole, like Anchorage's.
    if (ctx.birds && tier.birds > 0) {
      birds = createBirds({
        tier,
        perches: [],
        center: new Vector3(MERIDIAN.harbor.center.x + 30, 0, MERIDIAN.harbor.center.z - 40),
        radius: 170,
        seed: 0x3e51d,
      });
      birds.group.visible = false;
      scene.add(birds.group);
    }
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
    if (terrain) ctx.heightField.remove(terrain.heightField);
    for (const o of obstacles) {
      const i = ctx.shipObstacles.indexOf(o);
      if (i >= 0) ctx.shipObstacles.splice(i, 1);
    }
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
    get townReady() {
      return life.ready;
    },
    onReady: (fn: (town: MeridianTownSystem) => void) => life.onReady(fn),
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
      const d = footprintDistance(MERIDIAN_FOOTPRINT, camera.position.x, camera.position.z);
      const near = d < MERIDIAN_RANGE.show;
      const show = near || held;
      if (d < MERIDIAN_RANGE.load && (ctx.nearLoads?.() ?? true)) void life.load();
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
