import { Group, Vector3, type Mesh, type Object3D } from 'three/webgpu';
import type { Engine } from '../engine/engine';
import { HarborFlotsam } from './ocean/flotsam';
import { HarborMirror } from './ocean/harbor-mirror';
import { createOcean, type Ocean } from './ocean/ocean';
import { createSky, type SkySystem } from './sky/sky-system';
import { createCoastFoam } from './terrain/coast-foam';
import { createDistantRanges } from './terrain/distant-ranges';
import { loadTerrainPack } from './terrain/bake';
import { createTerrain, type CreatedTerrain } from './terrain/terrain-mesh';
import { CompositeHeightField } from './terrain/composite-height-field';
import { COVE } from './layout';
import { MERIDIAN, createMeridianRocks, createMeridianSilhouette } from './islands/meridian';
import { createBrigantine, type Brigantine } from './ship';
import { createVegetation, type VegetationSystem } from './vegetation';
import { createVillage, type VillageSystem } from './village';
import { createBirds, type BirdsSystem } from './life/birds';
import type { LeapsSystem } from './life/leaps';
import { villageExclusion } from './village-exclusion';
import { createCoveSites, type CoveSites } from './sites';

export interface CoveScene {
  sky: SkySystem;
  ocean: Ocean;
  mirror: HarborMirror | null;
  flotsam: HarborFlotsam;
  terrain: CreatedTerrain;
  heightField: CompositeHeightField;
  foam: Mesh;
  ranges: Group;
  meridian: {
    silhouette: Group;
    terrain: CreatedTerrain | null;
    foam: Mesh | null;
    ready: boolean;
  };
  vegetation: VegetationSystem | null;
  ship: Brigantine;
  village: VillageSystem;
  /** Puzzle set pieces (the P0.1 mill race). */
  sites: CoveSites;
  birds: BirdsSystem | null;
  leaps: LeapsSystem | null;
  dispose(): void;
}

export interface CoveOptions {
  /** Base URL for packs (dev: '/packs', built: './packs'). */
  packBase?: string;
  vegetation?: boolean;
  birds?: boolean;
  onProgress?: (p: number, msg: string) => void;
}

/**
 * Assembles the Test Cove world (Phase 0 §2) into an engine: sky + lighting, ocean, terrain with
 * coast foam and distant ranges, and vegetation. The ship, village, characters, and life plug in
 * alongside as they land. Shared by the game flow and the cove dev page.
 */
export async function createCove(engine: Engine, o: CoveOptions = {}): Promise<CoveScene> {
  const { renderer, scene, tier, clock, camera } = engine;
  const report = o.onProgress ?? (() => {});
  report(0.1, 'Raising the sky');
  const sky = createSky(renderer, scene, tier);
  const params =
    typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
  const mirrorDisabled = params.has('nomirror');
  const meridianDisabled = params.has('nomeridian');
  const mirror = tier.mirror ? new HarborMirror({ renderer, tier, disabled: mirrorDisabled }) : null;
  const ocean = createOcean({ tier, env: sky.env, mirror: mirror?.input });
  scene.add(ocean.mesh);

  report(0.3, 'Charting the cove');
  const data = await loadTerrainPack(`${o.packBase ?? '/packs'}/testcove/terrain`);
  const terrain = createTerrain({ tier, data });
  const heightField = new CompositeHeightField(-52);
  heightField.add(
    { minX: data.minX, maxX: data.maxX, minZ: data.minZ, maxZ: data.maxZ },
    terrain.heightField,
  );
  const foam = createCoastFoam(data, terrain.heightField);
  const ranges = createDistantRanges();
  const meridianSilhouette = meridianDisabled ? new Group() : createMeridianSilhouette();
  scene.add(terrain.group, foam, ranges, meridianSilhouette);
  const meridian = {
    silhouette: meridianSilhouette,
    terrain: null as CreatedTerrain | null,
    foam: null as Mesh | null,
    ready: false,
  };
  if (!meridianDisabled)
    void loadTerrainPack(`${o.packBase ?? '/packs'}/meridian/terrain`)
      .then((meridianData) => {
        const meridianTerrain = createTerrain({
          tier,
          data: meridianData,
          name: 'port-meridian-terrain',
          createRocks: createMeridianRocks,
        });
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
      })
      .catch((error) => console.warn('[meridian] terrain stream failed', error));

  report(0.5, 'Building the harbor');
  const village = await createVillage({ tier, heightField });
  scene.add(village.group);
  const sites = await createCoveSites({ tier, heightField: terrain.heightField });
  scene.add(sites.group);

  let vegetation: VegetationSystem | null = null;
  if (o.vegetation !== false) {
    report(0.6, 'Planting palms');
    vegetation = await createVegetation({
      heightField,
      heightGrid: terrain.heightGrid,
      tier,
      renderer,
      exclude: excludeVillageAndSites(villageExclusion(village), sites),
    });
    scene.add(vegetation.group);
  }

  report(0.8, 'Rigging the brigantine');
  const ship = createBrigantine({ tier: tier.tier });
  ship.dynamics.reset(COVE.mooring.x, COVE.mooring.z, COVE.mooring.heading);
  const flotsam = new HarborFlotsam(tier);
  scene.add(ship.group, flotsam.group);
  const shipEnv = { waves: ocean.field, ground: heightField, obstacles: village.shipObstacles, t: 0 };
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

  let leaps: LeapsSystem | null = null;
  let disposed = false;
  let result: CoveScene | null = null;
  const immediateLeaps = typeof location !== 'undefined' && location.pathname.includes('leaps');
  const loadLeaps = async () => {
    if (disposed || leaps || tier.leaps <= 0) return;
    const { createLeaps } = await import('./life/leaps');
    if (disposed || leaps) return;
    const created = createLeaps({ tier, heightField });
    await renderer.compileAsync(created.group, camera);
    if (disposed) {
      created.dispose();
      return;
    }
    leaps = created;
    if (result) result.leaps = created;
    scene.add(created.group);
  };
  if (immediateLeaps) void loadLeaps();
  const leapsTimer =
    !immediateLeaps && typeof window !== 'undefined' ? window.setTimeout(() => void loadLeaps(), 90000) : 0;

  const focus = new Vector3();
  const removeSystem = engine.add({
    frame(dt, t) {
      ocean.update(camera);
      shipEnv.t = t;
      ship.update(dt, t, shipEnv);
      terrain.update(camera);
      const toMeridian = Math.hypot(
        camera.position.x - MERIDIAN.center.x,
        camera.position.z - MERIDIAN.center.z,
      );
      const showMeridian = toMeridian < 760;
      if (meridian.terrain && meridian.foam) {
        meridian.terrain.group.visible = showMeridian;
        meridian.foam.visible = showMeridian;
        if (showMeridian) meridian.terrain.update(camera);
      }
      meridian.silhouette.visible = !showMeridian;
      vegetation?.update(camera);
      village.update(dt, t, camera);
      sites.update(dt, t);
      birds?.update(dt, t, camera);
      leaps?.update(dt, t, camera);
      flotsam.update(dt, t, ocean.field, ship);
      focus.set(camera.position.x, 0, camera.position.z);
      sky.update(clock, focus);
      mirror?.update(renderer, scene, camera, [
        ocean.mesh,
        terrain.group,
        foam,
        ranges,
        meridian.terrain?.group,
        meridian.foam,
        meridian.silhouette,
        village.group,
        sites.group,
        ship.group,
        vegetation?.group,
        birds?.group,
        leaps?.group,
        flotsam.group,
      ]);
      mirror?.finalizeFrame(engine.counters.last.drawCalls, engine.counters.last.triangles);
    },
  });
  report(0.9, 'Lighting the lanterns');

  result = {
    sky,
    ocean,
    mirror,
    flotsam,
    terrain,
    heightField,
    foam,
    ranges,
    meridian,
    vegetation,
    ship,
    village,
    sites,
    birds,
    leaps,
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
        ship.group,
        flotsam.group,
      );
      if (meridian.terrain) scene.remove(meridian.terrain.group);
      if (meridian.foam) scene.remove(meridian.foam);
      if (vegetation) scene.remove(vegetation.group);
      if (birds) scene.remove(birds.group);
      if (leaps) scene.remove(leaps.group);
      disposeTree(foam);
      disposeTree(ranges);
      disposeTree(meridian.silhouette);
      meridian.terrain?.dispose();
      if (meridian.foam) disposeTree(meridian.foam);
      birds?.dispose();
      leaps?.dispose();
      village.dispose();
      sites.dispose();
      ship.dispose();
      flotsam.dispose();
      mirror?.dispose();
      vegetation?.dispose();
      terrain.dispose();
      ocean.dispose();
      sky.dispose();
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
