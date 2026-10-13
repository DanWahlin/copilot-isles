import { Group, Vector3, type Mesh, type Object3D, type PerspectiveCamera, type Scene } from 'three/webgpu';
import type { Node } from 'three/webgpu';
import type { TierSettings } from '../../../engine/quality';
import type { CircleObstacle } from '../../contracts';
import { FarCull } from '../../far-cull';
import { skipSunShadows } from '../../sky/cached-sun-shadow';
import { createCoastFoam } from '../../terrain/coast-foam';
import { loadTerrainPack } from '../../terrain/bake';
import type { CompositeHeightField } from '../../terrain/composite-height-field';
import { createTerrainAsync, type CreatedTerrain } from '../../terrain/terrain-mesh';
import type { VegetationSystem } from '../../vegetation';
import { loadVillageKit } from '../../village/kit';
import { createBirds, type BirdsSystem } from '../../life/birds';
import { createThousandBoughAsync, type ThousandBoughWorld } from './index';
import { createThousandBoughRocks, type ThousandBoughRocks } from './rocks';
import { THOUSAND_BOUGH as TB } from './layout';
import { createThousandBoughSilhouette } from './tree/silhouette';

/** Within this distance (m) of the island's centre it streams in; within `SHOW` it's drawn (not the silhouette). */
/** The share of the island's small stones each tier keeps. */
const SMALL_ROCKS = { lite: 0.1, low: 0.4, medium: 1, high: 1, ultra: 1 } as const;
/** The boulders cast the sun's shadow on High and Ultra (Low and Medium spend those triangles elsewhere). */
const ROCK_SHADOWS = (tier: TierSettings['tier']) => tier === 'high' || tier === 'ultra';

export const THOUSAND_BOUGH_RANGE = { load: 1100, show: 900, detail: 640 } as const;

export interface ThousandBoughStream {
  /** The far shape, drawn until the island is near. */
  silhouette: Group;
  terrain: CreatedTerrain | null;
  foam: Mesh | null;
  /** The island's world (the tree village, its water, mist, life), once streamed. */
  system: ThousandBoughWorld | null;
  ready: boolean;
  /**
   * Starts streaming the island (once; later calls return the same promise). Nothing of it loads
   * until something needs it: boarding with the island open, the chart, a save or a jump there, or
   * coming within 1100 m. Resolves with the system once everything is in the scene (hidden), or null.
   */
  load(): Promise<ThousandBoughWorld | null>;
  /** Resolves when `load` has finished (it doesn't start the stream). */
  worldReady: Promise<ThousandBoughWorld | null>;
  /** The island's own roots (terrain, foam, world, plants, birds) for a warm-up, once streamed. */
  roots(): Object3D[];
  /** Hands the island's visibility to a warm-up (the frame loop keeps updating but stops showing/hiding it). */
  hold(on: boolean): void;
  /** Small detail (people, chests, props) culled while the camera's far from the island. */
  detail: FarCull;
  /** Per frame: streams in by range, shows or hides by range, and runs the world. */
  update(camera: PerspectiveCamera, dt: number, t: number): void;
  /** Roots the harbour mirror leaves out (pushed onto `out`). */
  mirrorHidden(out: (Object3D | null | undefined)[]): void;
  dispose(): void;
}

export interface ThousandBoughStreamContext {
  scene: Scene;
  tier: TierSettings;
  packBase: string;
  cloudShadowNode?: Node<'float'> | null;
  breathe: () => Promise<void>;
  heightField: CompositeHeightField;
  /** The ship's obstacles (the wharf's piles join them). */
  shipObstacles: CircleObstacle[];
  vegetation: () => VegetationSystem | null;
  /** The sky, whose mood (haze) the island sets as you near it. */
  sky: { mood: { fogScale: number; hazeTint: [number, number, number]; fill: number; exposure: number } };
  birds: boolean;
  /** Where the tier has sun shadows but the islands don't take them (cove-scene's `skipIslandShadows`). */
  skipShadows: boolean;
  disabled: boolean;
}

/**
 * Thousand-Bough Isle streamed in on demand, like Port Meridian (skill §3): its baked terrain, coast
 * foam, the tree village and its plants arrive hidden, and the game's flow warms them before they're
 * first drawn. Until then (and while the camera's far) its silhouette stands on the horizon.
 */
export function createThousandBoughStream(ctx: ThousandBoughStreamContext): ThousandBoughStream {
  const { scene, tier } = ctx;
  const silhouette = ctx.disabled ? new Group() : createThousandBoughSilhouette();
  scene.add(silhouette);
  let resolveReady: (s: ThousandBoughWorld | null) => void = () => {};
  const worldReady = new Promise<ThousandBoughWorld | null>((r) => (resolveReady = r));
  if (ctx.disabled) resolveReady(null);
  let streaming: Promise<void> | null = null;
  let disposed = false;
  let held = false;
  let plants: Object3D | null = null;
  let birds: BirdsSystem | null = null;
  const detail = new FarCull(TB.center.x, TB.center.z, THOUSAND_BOUGH_RANGE.detail, tier.detailCullRatio);

  const self: ThousandBoughStream = {
    silhouette,
    terrain: null,
    foam: null,
    system: null,
    ready: false,
    detail,
    worldReady,
    load() {
      if (!ctx.disabled && !streaming) streaming = stream();
      return worldReady;
    },
    roots() {
      const roots: (Object3D | null | undefined)[] = [
        self.terrain?.group,
        self.foam,
        self.system?.group,
        plants,
        birds?.group,
      ];
      return roots.filter((r): r is Object3D => !!r);
    },
    hold(on) {
      held = on;
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
      if (d < THOUSAND_BOUGH_RANGE.load) void self.load();
      const near = d < THOUSAND_BOUGH_RANGE.show;
      const show = near || held;
      if (self.terrain && self.foam && !held) {
        self.terrain.group.visible = show;
        self.foam.visible = show;
        if (self.system) self.system.group.visible = show;
        if (plants) plants.visible = show;
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
      scene.remove(silhouette);
      silhouette.traverse((o) => {
        const m = o as Object3D & { geometry?: { dispose(): void }; material?: { dispose(): void } };
        m.geometry?.dispose();
        m.material?.dispose();
      });
      if (self.terrain) {
        scene.remove(self.terrain.group);
        self.terrain.dispose();
      }
      if (self.foam) {
        scene.remove(self.foam);
        self.foam.geometry.dispose();
        (self.foam.material as { dispose(): void }).dispose();
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

  const stream = () =>
    loadTerrainPack(`${ctx.packBase}/thousand-bough/terrain`)
      .then(async (data) => {
        if (disposed) return resolveReady(null);
        // The island's own boulders and the Spire ride with the terrain (shown and warmed with it).
        let rocks: ThousandBoughRocks | null = null;
        const terrain = await createTerrainAsync(
          {
            tier,
            data,
            name: 'thousand-bough-terrain',
            cloudShadowNode: ctx.cloudShadowNode,
            createRocks: (hf) =>
              (rocks = createThousandBoughRocks(
                hf,
                undefined,
                SMALL_ROCKS[tier.tier],
                ROCK_SHADOWS(tier.tier),
              )).group,
          },
          ctx.breathe,
        );
        await ctx.breathe();
        if (ctx.skipShadows) skipSunShadows(terrain.group);
        const foam = createCoastFoam(data, terrain.heightField, { maxDistance: 1100 });
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
        const kit = await loadVillageKit();
        if (disposed) return resolveReady(null);
        const system = await createThousandBoughAsync(
          { tier, heightField: terrain.heightField, kit, rocks },
          ctx.breathe,
        );
        if (disposed) {
          system.dispose();
          return resolveReady(null);
        }
        system.group.visible = false;
        if (ctx.skipShadows) skipSunShadows(system.group);
        scene.add(system.group);
        self.system = system;
        ctx.shipObstacles.push(...system.shipObstacles());
        const vegetation = ctx.vegetation();
        if (vegetation) {
          const flora = await system.plants(ctx.breathe);
          if (disposed) return resolveReady(null);
          plants = (await vegetation.addPlants(flora, 'thousand-bough-plants')).group;
          if (ctx.skipShadows) skipSunShadows(plants);
        }
        if (ctx.birds && tier.birds > 0) {
          birds = createBirds({
            tier,
            perches: [],
            center: new Vector3(TB.tree.x - 30, 0, TB.tree.z + 60),
            radius: 200,
            seed: 0x7b0b9,
          });
          birds.group.visible = false;
          scene.add(birds.group);
        }
        resolveReady(system);
      })
      .catch((error) => {
        console.warn('[thousand-bough] stream failed', error);
        resolveReady(null);
      });

  return self;
}
