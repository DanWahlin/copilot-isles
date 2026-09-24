import { Vector3 } from 'three/webgpu';
import type { Engine } from '../engine/engine';
import { createOcean } from '../world/ocean/ocean';
import { createSky } from '../world/sky/sky-system';
import { createDistantRanges } from '../world/terrain/distant-ranges';
import { createBrigantine, type BrigantineEnv } from '../world/ship';

export interface TitleBackdrop {
  dispose(): void;
}

/**
 * The title backdrop (PLAN §13.5, POC §3.1): open ocean, sky, and your brigantine at anchor,
 * swinging gently on its rope, with distant ranges in the haze and a slow golden-hour orbit.
 * No island mesh, so the title stays inside its budget; Anchorage Cay streams after New Voyage.
 * The ship sits right of centre so the menu column on the left stays clear.
 */
export function createTitleBackdrop(engine: Engine): TitleBackdrop {
  const { renderer, scene, tier, camera, clock } = engine;
  const sky = createSky(renderer, scene, tier);
  const ocean = createOcean({ tier, env: sky.env });
  const ranges = createDistantRanges();
  const ship = createBrigantine({ tier: tier.tier });
  const anchor = { x: 0, z: 0, heading: 2.3 };
  ship.dynamics.reset(anchor.x, anchor.z, anchor.heading);
  scene.add(ocean.mesh, ranges, ship.group);
  const shipEnv: BrigantineEnv = { waves: ocean.field, ground: null, obstacles: [], t: 0 };

  clock.set(17.1, -35);
  sky.invalidate();
  camera.fov = 42;
  camera.updateProjectionMatrix();

  const focus = new Vector3();
  const look = new Vector3();
  let orbit = 0.35;
  const remove = engine.add(
    {
      frame(dt, t) {
        // Swing on the anchor rope: slow yaw and a little drift around the anchor.
        const pose = ship.dynamics.pose;
        pose.heading = anchor.heading + Math.sin(t * 0.07) * 0.22 + Math.sin(t * 0.023) * 0.12;
        pose.x = anchor.x + Math.sin(t * 0.05) * 1.2;
        pose.z = anchor.z + Math.cos(t * 0.04) * 1.0;
        shipEnv.t = t;
        ship.update(dt, t, shipEnv);

        orbit += dt * 0.012;
        const r = 58;
        camera.position.set(Math.sin(orbit) * r, 7.5 + Math.sin(t * 0.11) * 0.4, Math.cos(orbit) * r);
        // Aim left of the ship so it sits right of centre, clear of the menu column.
        const sx = Math.cos(orbit),
          sz = -Math.sin(orbit);
        look.set(anchor.x - sx * 14, 9, anchor.z - sz * 14);
        camera.lookAt(look);

        ocean.update(camera);
        focus.set(camera.position.x, 0, camera.position.z);
        sky.update(clock, focus);
      },
    },
    true,
  );

  return {
    dispose() {
      remove();
      scene.remove(ocean.mesh, ranges, ship.group);
      ship.dispose();
      ocean.dispose();
      sky.dispose();
      ranges.traverse((o) => {
        const m = o as { geometry?: { dispose(): void }; material?: { dispose(): void } };
        m.geometry?.dispose();
        m.material?.dispose();
      });
    },
  };
}
