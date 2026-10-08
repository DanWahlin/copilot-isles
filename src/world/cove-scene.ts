import { Group, Vector3, type Mesh, type Object3D } from 'three/webgpu';
import { positionWorld } from 'three/tsl';
import type { Engine } from '../engine/engine';
import { HarborMirror } from './ocean/harbor-mirror';
import { createOcean, type Ocean } from './ocean/ocean';
import { createSky, type SkySystem } from './sky/sky-system';
import { createCoastFoam } from './terrain/coast-foam';
import { seaStackShipObstacle } from './terrain/sea-stack-shape';
import { HEADLAND_CLIFF_AREA, headlandCaveShipObstacle } from './terrain/headland-cliff-shape';
import { createDistantRangesAsync } from './terrain/distant-ranges';
import { loadTerrainPack } from './terrain/bake';
import { createTerrainAsync, type CreatedTerrain } from './terrain/terrain-mesh';
import { releaseTerrainTextures } from './terrain/terrain-material';
import { releaseTerrainNoiseTexture } from './terrain/noise-texture';
import { CompositeHeightField } from './terrain/composite-height-field';
import { COVE } from './layout';
import { createStarfish, type StarfishSystem } from './starfish';
import { MERIDIAN, createMeridianRocks, createMeridianSilhouette } from './islands/meridian';
import { createBeachDebris, type BeachDebrisSystem } from './debris/beach-debris';
import { createBrigantine, type Brigantine } from './ship';
import { createVegetation, type VegetationSystem } from './vegetation';
import type { PlantInstance } from './vegetation/types';
import { meridianPlantsSliced } from './islands/meridian-plants';
import { meridianTownPlants } from './meridian-town/plantings';
import { createMeridianWaterMesh } from './islands/meridian-water-mesh';
import type { WaterStrips } from './sites/water';
import { loadVillageKit } from './village/kit';
import { DOCK_GULL_SPOT, createVillage, type VillageSystem } from './islands/anchorage/village';
import { ANCHORAGE_VEGETATION } from './islands/anchorage/vegetation-rules';
import { createDockGull, type DockGull } from './life/dock-gull';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { packs } from '../engine/packs';
import { createFishingBoat, type FishingBoat } from './life/fishing-boat';
import { ANCHORAGE_FISHING_BOATS } from './islands/anchorage/life';
import { createMeridianTownAsync, type MeridianTownSystem } from './meridian-town';
import { createBirds, type BirdsSystem } from './life/birds';
import type { LeapsSystem } from './life/leaps';
import { villageExclusionAsync } from './village-exclusion';
import { BRIGANTINE_CARGO, createCoveSites, type CoveSites } from './sites';
import type { CircleObstacle } from './contracts';

export interface CoveScene {
  sky: SkySystem;
  ocean: Ocean;
  mirror: HarborMirror | null;
  terrain: CreatedTerrain;
  heightField: CompositeHeightField;
  foam: Mesh;
  ranges: Group;
  meridian: {
    silhouette: Group;
    terrain: CreatedTerrain | null;
    foam: Mesh | null;
    town: MeridianTownSystem | null;
    ready: boolean;
    /**
     * Starts streaming Port Meridian (once; later calls return the same promise). Nothing of it loads
     * until something needs it: boarding, the chart, a save or a jump there, or coming within 900 m.
     * Resolves with the town once terrain and town are in the scene (hidden), or null if Meridian is
     * disabled or failed.
     */
    load(): Promise<MeridianTownSystem | null>;
    /** Resolves when `load` has finished (it doesn't start the stream). */
    townReady: Promise<MeridianTownSystem | null>;
    /** Meridian's own roots (terrain, foam, town, gulls) for a warm-up, once streamed. */
    roots(): Object3D[];
    /**
     * Hands Meridian's visibility to a warm-up running from afar (the frame loop stops showing and
     * hiding it, but keeps updating it; the silhouette stays as it is).
     */
    hold(on: boolean): void;
  };
  vegetation: VegetationSystem | null;
  ship: Brigantine;
  village: VillageSystem;
  /** Puzzle set pieces (the P0.1 mill race). */
  sites: CoveSites;
  /** Shells, pebbles, driftwood, and seaweed along hero beaches. */
  debris: BeachDebrisSystem;
  birds: BirdsSystem | null;
  leaps: LeapsSystem | null;
  /**
   * How objects that join after the island's warm-up get warmed (the game's flow sets one that
   * matches the post's scene pass); without one they're precompiled with `compileAsync`.
   */
  setLateWarm(warm: ((roots: Object3D[]) => Promise<void>) | null): void;
  /** The starfish to collect on both islands (the session sets their ground and which are found). */
  starfish: StarfishSystem;
  dispose(): void;
}

export interface CoveOptions {
  /** Base URL for packs (dev: '/packs', built: './packs'). */
  packBase?: string;
  vegetation?: boolean;
  birds?: boolean;
  onProgress?: (p: number, msg: string) => void;
  /**
   * Called between build stages; resolve it on the next frame to let the screen update while the
   * island builds (the opening's cabin keeps animating). Defaults to no pause.
   */
  breathe?: () => Promise<void>;
}

/**
 * Assembles the Test Cove world (Phase 0 §2) into an engine: sky + lighting, ocean, terrain with
 * coast foam and distant ranges, and vegetation. The ship, village, characters, and life plug in
 * alongside as they land. Shared by the game flow and the cove dev page.
 */
export async function createCove(engine: Engine, o: CoveOptions = {}): Promise<CoveScene> {
  const { renderer, scene, tier, clock, camera } = engine;
  const report = o.onProgress ?? (() => {});
  const breathe = o.breathe ?? (() => Promise.resolve());
  report(0.1, 'Raising the sky');
  const sky = createSky(renderer, scene, tier, engine.backend);
  await breathe();
  const cloudShadowNode = sky.cloudShadowNode?.(positionWorld.xz);
  const params =
    typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
  const mirrorDisabled = params.has('nomirror');
  // Meridian's gulls arrive with its town (the stream below).
  let meridianBirds: BirdsSystem | null = null;
  const meridianDisabled = params.has('nomeridian');
  let meridianWaterMesh: WaterStrips | null = null;
  const mirror = tier.mirror ? new HarborMirror({ renderer, tier, disabled: mirrorDisabled }) : null;
  const ocean = createOcean({ tier, env: sky.env, mirror: mirror?.input, terrainDepth: true });
  await breathe();
  scene.add(ocean.mesh);

  report(0.3, 'Charting the cove');
  const data = await loadTerrainPack(`${o.packBase ?? '/packs'}/testcove/terrain`);
  const terrain = await createTerrainAsync(
    { tier, data, cloudShadowNode, recessSteep: HEADLAND_CLIFF_AREA },
    breathe,
  );
  await breathe();
  if (tier.shadowCascades > 0) disableReceiveShadows(terrain.group);
  const heightField = new CompositeHeightField(-52);
  heightField.add(
    { minX: data.minX, maxX: data.maxX, minZ: data.minZ, maxZ: data.maxZ },
    terrain.heightField,
  );
  const foam = createCoastFoam(data, terrain.heightField);
  await breathe();
  const ranges = await createDistantRangesAsync(tier, breathe);
  await breathe();
  const meridianSilhouette = meridianDisabled ? new Group() : createMeridianSilhouette();
  scene.add(terrain.group, foam, ranges, meridianSilhouette);
  let resolveMeridianTown: (town: MeridianTownSystem | null) => void = () => {};
  const meridianTownReady = new Promise<MeridianTownSystem | null>((resolve) => {
    resolveMeridianTown = resolve;
  });
  const shipObstacles: CircleObstacle[] = [];
  const meridian = {
    silhouette: meridianSilhouette,
    terrain: null as CreatedTerrain | null,
    foam: null as Mesh | null,
    town: null as MeridianTownSystem | null,
    ready: false,
    load(): Promise<MeridianTownSystem | null> {
      if (!meridianDisabled && !meridianStream) meridianStream = streamMeridian();
      return meridianTownReady;
    },
    townReady: meridianTownReady,
    roots(): Object3D[] {
      const roots: (Object3D | null | undefined)[] = [
        meridian.terrain?.group,
        meridian.foam,
        meridian.town?.group,
        meridianBirds?.group,
        meridianPlants,
      ];
      return roots.filter((r): r is Object3D => !!r);
    },
    hold(on: boolean) {
      meridianHeld = on;
    },
  };
  let meridianStream: Promise<void> | null = null;
  let meridianPlants: Object3D | null = null;
  let meridianHeld = false;
  if (meridianDisabled) resolveMeridianTown(null);
  const streamMeridian = () =>
    loadTerrainPack(`${o.packBase ?? '/packs'}/meridian/terrain`)
      .then(async (meridianData) => {
        if (disposed) return resolveMeridianTown(null);
        const meridianTerrain = await createTerrainAsync(
          {
            tier,
            data: meridianData,
            name: 'port-meridian-terrain',
            createRocks: createMeridianRocks,
            cloudShadowNode,
          },
          breathe,
        );
        await breathe();
        // The tarn, cascade, brook, lake and outflow ride with the terrain (shown and hidden with it).
        meridianWaterMesh = createMeridianWaterMesh();
        meridianTerrain.group.add(meridianWaterMesh.mesh);
        if (tier.shadowCascades > 0) disableReceiveShadows(meridianTerrain.group);
        const meridianFoam = createCoastFoam(meridianData, meridianTerrain.heightField, {
          maxDistance: 1100,
        });
        meridianTerrain.group.visible = false;
        meridianFoam.visible = false;
        scene.add(meridianTerrain.group, meridianFoam);
        heightField.add(
          {
            minX: meridianData.minX,
            maxX: meridianData.maxX,
            minZ: meridianData.minZ,
            maxZ: meridianData.maxZ,
          },
          meridianTerrain.heightField,
        );
        meridian.terrain = meridianTerrain;
        meridian.foam = meridianFoam;
        meridian.ready = true;
        const townKit = await loadVillageKit();
        if (disposed) return resolveMeridianTown(null);
        const town = await createMeridianTownAsync(
          { tier, heightField: meridianTerrain.heightField, kit: townKit },
          breathe,
        );
        town.group.visible = false;
        meridian.town = town;
        scene.add(town.group);
        shipObstacles.push(...town.shipObstacles);
        // Its plants (hills and town) as their own vegetation batches, shown with the island.
        if (vegetation) {
          const flora: PlantInstance[] = [];
          const steps = meridianPlantsSliced(tier.tier);
          for (let r = steps.next(); ; r = steps.next()) {
            if (r.done) {
              flora.push(...r.value, ...meridianTownPlants(tier.tier));
              break;
            }
            await breathe();
          }
          if (disposed) return resolveMeridianTown(null);
          meridianPlants = (await vegetation.addPlants(flora, 'port-meridian-plants')).group;
        }
        // Gulls wheeling over Meridian's harbour and the mole, like Anchorage's.
        if (o.birds !== false && tier.birds > 0 && !meridianBirds) {
          meridianBirds = createBirds({
            tier,
            perches: [],
            center: new Vector3(MERIDIAN.harbor.center.x + 30, 0, MERIDIAN.harbor.center.z - 40),
            radius: 170,
            seed: 0x3e51d,
          });
          meridianBirds.group.visible = false;
          scene.add(meridianBirds.group);
        }
        resolveMeridianTown(town);
      })
      .catch((error) => {
        console.warn('[meridian] terrain stream failed', error);
        resolveMeridianTown(null);
      });

  report(0.5, 'Building the harbor');
  const villageKit = typeof window === 'undefined' ? undefined : await loadVillageKit();
  const village = await createVillage({ tier, heightField, kit: villageKit });
  await breathe();
  if (tier.shadowCascades > 0) disableReceiveShadows(village.group);
  scene.add(village.group);
  const sites = await createCoveSites({
    tier,
    heightField: terrain.heightField,
    ground: (x, z) => village.walkable(x, z) ?? terrain.heightField.heightAt(x, z),
  });
  if (tier.shadowCascades > 0) disableReceiveShadows(sites.group);
  scene.add(sites.group);
  await breathe();
  const villageMask = excludeVillageAndSites(await villageExclusionAsync(village, breathe), sites);
  const debris = createBeachDebris({
    heightField: terrain.heightField,
    tier,
    exclude: villageMask,
  });
  scene.add(debris.group);

  let vegetation: VegetationSystem | null = null;
  if (o.vegetation !== false) {
    report(0.6, 'Planting palms');
    vegetation = await createVegetation({
      heightField,
      heightGrid: terrain.heightGrid,
      tier,
      renderer,
      island: ANCHORAGE_VEGETATION,
      exclude: villageMask,
      extraPlants: village.plantings,
    });
    if (tier.shadowCascades > 0) disableReceiveShadows(vegetation.group);
    scene.add(vegetation.group);
  }
  await breathe();

  report(0.8, 'Rigging the brigantine');
  await breathe();
  const ship = createBrigantine({ tier: tier.tier });
  ship.dynamics.reset(COVE.mooring.x, COVE.mooring.z, COVE.mooring.heading);
  if (tier.shadowCascades > 0) disableReceiveShadows(ship.group);
  scene.add(ship.group);
  sites.crane.setShip(ship.group, BRIGANTINE_CARGO);
  shipObstacles.push(...village.shipObstacles, ...sites.shipObstacles, seaStackShipObstacle());
  const caveButtress = headlandCaveShipObstacle(terrain.heightField);
  if (caveButtress) shipObstacles.push(caveButtress);
  const shipEnv = {
    waves: ocean.field,
    ground: heightField,
    obstacles: shipObstacles,
    t: 0,
  };
  let birds: BirdsSystem | null = null;
  if (o.birds !== false && tier.birds > 0) {
    birds = createBirds({
      tier,
      perches: village.perches,
      center: new Vector3(COVE.harbor.center.x, 0, COVE.harbor.center.z + 40),
      radius: 220,
    });
    scene.add(birds.group);
  }

  // The title's seagull lives on the pier-end bollard by the crane board (one draw; +1 program). It
  // joins the scene before the island's pipelines are compiled, so its first draw doesn't stall.
  let dockGull: DockGull | null = null;
  if (o.birds !== false && tier.birds > 0) {
    const gull = createDockGull({
      loader: new GLTFLoader(),
      url: '/packs/testcove/life/dock-gull.glb',
      at: DOCK_GULL_SPOT,
      heading: Math.PI / 2,
    });
    try {
      await gull.ready;
      scene.add(gull.group);
      dockGull = gull;
    } catch {
      gull.dispose();
    }
  }

  // Anchorage's fishing boats (a rowboat and two fishermen each), in the scene before the island compiles.
  const fishingBoats: FishingBoat[] = [];
  if (tier.tier !== 'lite') {
    const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    const boats = ANCHORAGE_FISHING_BOATS.map((at, i) =>
      createFishingBoat({
        loader,
        base: packs.url('/packs/testcove/life/'),
        at,
        waves: ocean.field,
        seed: 7 + i,
      }),
    );
    for (const boat of boats) {
      try {
        await boat.ready;
        scene.add(boat.group);
        shipObstacles.push(boat.shipObstacle);
        fishingBoats.push(boat);
      } catch {
        boat.dispose();
      }
    }
  }

  // The starfish (one draw; +1 program), in the scene before the island compiles.
  const starfish = createStarfish();
  scene.add(starfish.mesh);

  let leaps: LeapsSystem | null = null;
  let lateWarm: ((roots: Object3D[]) => Promise<void>) | null = null;
  let disposed = false;
  let result: CoveScene | null = null;
  const immediateLeaps = typeof location !== 'undefined' && location.pathname.includes('leaps');
  const loadLeaps = async () => {
    if (disposed || leaps || tier.leaps <= 0) return;
    const { createLeaps } = await import('./life/leaps');
    if (disposed || leaps) return;
    const created = createLeaps({ tier, heightField });
    // In the scene for its warm (which keeps it from being drawn until it's built), then live.
    scene.add(created.group);
    if (lateWarm) await lateWarm([created.group]);
    else await renderer.compileAsync(created.group, camera);
    if (disposed) {
      scene.remove(created.group);
      created.dispose();
      return;
    }
    leaps = created;
    if (result) result.leaps = created;
  };
  if (immediateLeaps) void loadLeaps();
  const leapsTimer =
    !immediateLeaps && typeof window !== 'undefined'
      ? window.setTimeout(() => void engine.counters.excuse(loadLeaps()), 90000)
      : 0;

  const focus = new Vector3();
  // What the harbour mirror leaves out, refilled each frame (some systems arrive late) without a new array.
  const mirrorHidden: (Object3D | null | undefined)[] = [];
  const fillMirrorHidden = () => {
    mirrorHidden.length = 0;
    mirrorHidden.push(
      ocean.mesh,
      terrain.group,
      foam,
      ranges,
      meridian.terrain?.group,
      meridian.foam,
      meridian.town?.group,
      meridian.silhouette,
      village.group,
      sites.group,
      debris.group,
      ship.group,
      vegetation?.group,
      birds?.group,
      dockGull?.group,
      meridianBirds?.group,
      leaps?.group,
    );
    return mirrorHidden;
  };
  mirror?.setHidden(fillMirrorHidden);
  const removeSystem = engine.add({
    frame(dt, t) {
      ocean.update(camera, t);
      shipEnv.t = t;
      ship.update(dt, t, shipEnv);
      terrain.update(camera);
      const toMeridian = Math.hypot(
        camera.position.x - MERIDIAN.center.x,
        camera.position.z - MERIDIAN.center.z,
      );
      const nearMeridian = toMeridian < 760;
      const showMeridian = nearMeridian || meridianHeld;
      if (toMeridian < 900) void meridian.load();
      if (meridian.terrain && meridian.foam) {
        if (!meridianHeld) meridian.terrain.group.visible = showMeridian;
        if (!meridianHeld) meridian.foam.visible = showMeridian;
        if (meridian.town && !meridianHeld) meridian.town.group.visible = showMeridian;
        if (meridianPlants && !meridianHeld) meridianPlants.visible = showMeridian;
        if (showMeridian) meridian.terrain.update(camera);
      }
      meridian.silhouette.visible = !nearMeridian;
      vegetation?.update(camera);
      village.update(dt, t, camera);
      if (showMeridian) meridian.town?.update(dt, t, camera);
      if (meridianBirds) {
        if (!meridianHeld) meridianBirds.group.visible = showMeridian;
        if (showMeridian) meridianBirds.update(dt, t, camera);
      }
      sites.update(dt, t);
      birds?.update(dt, t, camera);
      dockGull?.update(dt, t, camera);
      for (const boat of fishingBoats) boat.update(dt, t, camera);
      starfish.update(dt, t, camera);
      leaps?.update(dt, t, camera);
      focus.set(camera.position.x, 0, camera.position.z);
      sky.update(clock, focus, dt, camera);
      if (mirror) {
        mirror.update(renderer, scene, camera, fillMirrorHidden());
      }
      mirror?.finalizeFrame(engine.counters.last.drawCalls, engine.counters.last.triangles);
    },
  });
  report(0.9, 'Lighting the lanterns');

  result = {
    sky,
    ocean,
    mirror,
    terrain,
    heightField,
    foam,
    ranges,
    meridian,
    vegetation,
    ship,
    village,
    sites,
    debris,
    birds,
    leaps,
    starfish,
    setLateWarm(warm) {
      lateWarm = warm;
    },
    dispose() {
      disposed = true;
      if (leapsTimer) window.clearTimeout(leapsTimer);
      removeSystem();
      scene.remove(
        ocean.mesh,
        terrain.group,
        foam,
        ranges,
        meridian.silhouette,
        village.group,
        debris.group,
        ship.group,
      );
      if (meridian.terrain) scene.remove(meridian.terrain.group);
      if (meridian.foam) scene.remove(meridian.foam);
      if (meridian.town) scene.remove(meridian.town.group);
      if (vegetation) scene.remove(vegetation.group);
      if (birds) scene.remove(birds.group);
      if (dockGull) scene.remove(dockGull.group);
      if (meridianBirds) scene.remove(meridianBirds.group);
      if (leaps) scene.remove(leaps.group);
      disposeTree(foam);
      disposeTree(ranges);
      disposeTree(meridian.silhouette);
      meridianWaterMesh?.dispose();
      meridian.terrain?.dispose();
      if (meridian.foam) disposeTree(meridian.foam);
      meridian.town?.dispose();
      birds?.dispose();
      dockGull?.dispose();
      for (const boat of fishingBoats) {
        scene.remove(boat.group);
        boat.dispose();
      }
      starfish.dispose();
      meridianBirds?.dispose();
      leaps?.dispose();
      village.dispose();
      sites.dispose();
      debris.dispose();
      ship.dispose();
      mirror?.dispose();
      vegetation?.dispose();
      terrain.dispose();
      ocean.dispose();
      sky.dispose();
      // The shared terrain textures' GPU copies (their data stays cached for the next voyage).
      releaseTerrainTextures();
      releaseTerrainNoiseTexture();
    },
  };
  return result;
}

function excludeVillageAndSites(
  village: (x: number, z: number) => boolean,
  sites: CoveSites,
): (x: number, z: number) => boolean {
  return (x, z) => village(x, z) || sites.excludes(x, z);
}

function disposeTree(root: Object3D): void {
  root.traverse((o) => {
    const m = o as Object3D & { geometry?: { dispose(): void }; material?: { dispose(): void } };
    m.geometry?.dispose();
    m.material?.dispose();
  });
}

function disableReceiveShadows(root: Object3D): void {
  root.traverse((object) => {
    object.receiveShadow = false;
  });
}
