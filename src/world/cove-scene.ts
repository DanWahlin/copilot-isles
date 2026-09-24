import { Vector3, type Group, type Mesh } from 'three/webgpu';
import type { Engine } from '../engine/engine';
import { createOcean, type Ocean } from './ocean/ocean';
import { createSky, type SkySystem } from './sky/sky-system';
import { createCoastFoam } from './terrain/coast-foam';
import { createDistantRanges } from './terrain/distant-ranges';
import { loadTerrainPack } from './terrain/bake';
import { createTerrain, type CreatedTerrain } from './terrain/terrain-mesh';
import { COVE } from './layout';
import { createBrigantine, type Brigantine } from './ship';
import { createVegetation, type VegetationSystem } from './vegetation';

export interface CoveScene {
  sky: SkySystem;
  ocean: Ocean;
  terrain: CreatedTerrain;
  foam: Mesh;
  ranges: Group;
  vegetation: VegetationSystem | null;
  ship: Brigantine;
  dispose(): void;
}

export interface CoveOptions {
  /** Base URL for packs (dev: '/packs', built: './packs'). */
  packBase?: string;
  vegetation?: boolean;
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
  const ocean = createOcean({ tier, env: sky.env });
  scene.add(ocean.mesh);

  report(0.3, 'Charting the cove');
  const data = await loadTerrainPack(`${o.packBase ?? '/packs'}/testcove/terrain`);
  const terrain = createTerrain({ tier, data });
  const foam = createCoastFoam(data, terrain.heightField);
  const ranges = createDistantRanges();
  scene.add(terrain.group, foam, ranges);

  let vegetation: VegetationSystem | null = null;
  if (o.vegetation !== false) {
    report(0.6, 'Planting palms');
    vegetation = await createVegetation({
      heightField: terrain.heightField,
      heightGrid: terrain.heightGrid,
      tier,
      renderer,
    });
    scene.add(vegetation.group);
  }

  report(0.8, 'Rigging the brigantine');
  const ship = createBrigantine({ tier: tier.tier });
  ship.dynamics.reset(COVE.mooring.x, COVE.mooring.z, COVE.mooring.heading);
  scene.add(ship.group);
  const shipEnv = { waves: ocean.field, ground: terrain.heightField, obstacles: [], t: 0 };

  const focus = new Vector3();
  engine.add({
    frame(dt, t) {
      ocean.update(camera);
      shipEnv.t = t;
      ship.update(dt, t, shipEnv);
      terrain.update(camera);
      vegetation?.update(camera);
      focus.set(camera.position.x, 0, camera.position.z);
      sky.update(clock, focus);
    },
  });
  report(0.9, 'Lighting the lanterns');

  return {
    sky,
    ocean,
    terrain,
    foam,
    ranges,
    vegetation,
    ship,
    dispose() {
      ship.dispose();
      vegetation?.dispose();
      terrain.dispose();
      ocean.dispose();
      sky.dispose();
    },
  };
}
