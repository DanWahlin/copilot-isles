import { Vector3, type Group, type Mesh, type Object3D } from 'three/webgpu';
import type { Engine } from '../engine/engine';
import { HarborFlotsam } from './ocean/flotsam';
import { HarborMirror } from './ocean/harbor-mirror';
import { createOcean, type Ocean } from './ocean/ocean';
import { createSky, type SkySystem } from './sky/sky-system';
import { createCoastFoam } from './terrain/coast-foam';
import { createDistantRanges } from './terrain/distant-ranges';
import { loadTerrainPack } from './terrain/bake';
import { createTerrain, type CreatedTerrain } from './terrain/terrain-mesh';
import { COVE } from './layout';
import { createBrigantine, type Brigantine } from './ship';
import { createVegetation, type VegetationSystem } from './vegetation';
import { createVillage, type VillageSystem } from './village';
import { createBirds, type BirdsSystem } from './life/birds';
import { createLeaps, type LeapsSystem } from './life/leaps';
import { villageExclusion } from './village-exclusion';
import { createCoveSites, type CoveSites } from './sites';

export interface CoveScene {
  sky: SkySystem;
  ocean: Ocean;
  mirror: HarborMirror | null;
  flotsam: HarborFlotsam;
  terrain: CreatedTerrain;
  foam: Mesh;
  ranges: Group;
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
  const mirrorDisabled =
    typeof location !== 'undefined' && new URLSearchParams(location.search).has('nomirror');
  const mirror = tier.mirror ? new HarborMirror({ renderer, tier, disabled: mirrorDisabled }) : null;
  const ocean = createOcean({ tier, env: sky.env, mirror: mirror?.input });
  scene.add(ocean.mesh);

  report(0.3, 'Charting the cove');
  const data = await loadTerrainPack(`${o.packBase ?? '/packs'}/testcove/terrain`);
  const terrain = createTerrain({ tier, data });
  const foam = createCoastFoam(data, terrain.heightField);
  const ranges = createDistantRanges();
  scene.add(terrain.group, foam, ranges);

  report(0.5, 'Building the harbor');
  const village = await createVillage({ tier, heightField: terrain.heightField });
  scene.add(village.group);
  const sites = await createCoveSites({ tier, heightField: terrain.heightField });
  scene.add(sites.group);

  let vegetation: VegetationSystem | null = null;
  if (o.vegetation !== false) {
    report(0.6, 'Planting palms');
    vegetation = await createVegetation({
      heightField: terrain.heightField,
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
  const shipEnv = { waves: ocean.field, ground: terrain.heightField, obstacles: village.shipObstacles, t: 0 };
  const shipMirrorHidden = ship.group.children.filter(
    (child) =>
      child.name.includes('sails') ||
      child.name.includes('canvas') ||
      child.name.includes('rigging') ||
      child.name.includes('pendulum') ||
      child.name.includes('spring'),
  );

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

  const leaps = tier.leaps > 0 ? createLeaps({ tier, heightField: terrain.heightField }) : null;
  if (leaps) scene.add(leaps.group);

  const focus = new Vector3();
  const removeSystem = engine.add({
    frame(dt, t) {
      ocean.update(camera);
      shipEnv.t = t;
      ship.update(dt, t, shipEnv);
      terrain.update(camera);
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
        village.group,
        sites.group,
        ...shipMirrorHidden,
        vegetation?.group,
        birds?.group,
        leaps?.group,
        flotsam.group,
      ]);
      mirror?.finalizeFrame(engine.counters.last.drawCalls, engine.counters.last.triangles);
    },
  });
  report(0.9, 'Lighting the lanterns');

  return {
    sky,
    ocean,
    mirror,
    flotsam,
    terrain,
    foam,
    ranges,
    vegetation,
    ship,
    village,
    sites,
    birds,
    leaps,
    dispose() {
      removeSystem();
      scene.remove(ocean.mesh, terrain.group, foam, ranges, village.group, ship.group, flotsam.group);
      if (vegetation) scene.remove(vegetation.group);
      if (birds) scene.remove(birds.group);
      if (leaps) scene.remove(leaps.group);
      disposeTree(foam);
      disposeTree(ranges);
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
