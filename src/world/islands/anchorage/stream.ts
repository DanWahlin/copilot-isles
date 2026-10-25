import type { Group, Object3D, PerspectiveCamera, Scene } from 'three/webgpu';
import type { CreatedTerrain } from '../../terrain/terrain-mesh';
import { releaseGpuCopies } from '../../gpu-release';
import { StreamLifecycle, type StreamState } from '../../stream-lifecycle';
import type { IslandEntry } from '../../../islands/types';
import { footprintDistance } from '../footprint';
import { SilhouetteSwap } from '../silhouette-swap';

/** What wakes: the island's own roots, back in the scene (hidden until the warm-up shows them). */
export interface AnchorageWorld {
  roots: Object3D[];
}

/**
 * Anchorage (the first island, built with the world) as a stream like the others (PLAN §13.3):
 * resident at first; once you've left it, it goes dormant. Its parts leave the scene and their GPU
 * copies (geometry buffers, textures nothing else samples) are freed, but everything else stays as it
 * is (the village, the puzzles' state, the colliders), so waking it is putting them back and warming
 * them through the flow. Meanwhile its silhouette stands on the horizon.
 */
export interface AnchorageStream {
  silhouette: Group;
  /** Its terrain (for the warm-up's levels of detail). */
  terrain: CreatedTerrain;
  readonly state: StreamState;
  readonly loads: number;
  readonly held: boolean;
  /**
   * True while it's in the scene and drawn (not its silhouette): its systems update only then. Past
   * its swap distance its parts are hidden (still resident, so coming back is instant).
   */
  readonly shown: boolean;
  load(priority?: RequestPriority, retry?: boolean): Promise<AnchorageWorld | null>;
  unload(): Promise<void>;
  onReady(fn: (world: AnchorageWorld) => void): () => void;
  roots(): Object3D[];
  hold(on: boolean): void;
  /** What sleeps with it from the session (its cast and chests), set before `unload`. */
  extra: Object3D[];
  /** Shows the woken parts as they were (once they're warmed), and takes the silhouette down. */
  reveal(): void;
  /** Its parts that are out of the scene now (dormant): the world's dispose frees them there. */
  parkedRoots(): Object3D[];
  update(camera: PerspectiveCamera): void;
  dispose(): void;
}

export function createAnchorageStream(ctx: {
  scene: Scene;
  /**
   * Its registry entry (src/islands/anchorage.ts): it draws as its silhouette past `ranges.show`
   * (`footprintDistance` to its outline, from the camera), dormant or not.
   */
  island: Pick<IslandEntry, 'ranges' | 'footprint'>;
  terrain: CreatedTerrain;
  silhouette: Group;
  /** The island's parts, wherever they hang (the scene, or the vegetation's group). */
  parts(): Object3D[];
  /** Its plants stop (or start) updating. */
  plantsAwake(on: boolean): void;
  breathe: () => Promise<void>;
  /**
   * Warms what shows late (the world's late warm), or null before there is one (the world's own
   * warm-up hasn't run): the silhouette is hidden for the world's warm-up, so its first showing
   * would upload its geometry mid-play.
   */
  warm?: (roots: Object3D[]) => Promise<void> | null;
}): AnchorageStream {
  const { scene, silhouette } = ctx;
  silhouette.visible = false;
  scene.add(silhouette);
  let held = false;
  let awake = true;
  /** Woken, but not warmed and shown yet. */
  let showPending = false;
  /** The silhouette's warm owns its visibility until it's done (it hides it between draws). */
  let warming = false;
  let parked: { object: Object3D; parent: Object3D; visible: boolean }[] = [];
  const swap = new SilhouetteSwap(ctx.island.ranges.show);
  const silhouetteRoots = [silhouette];
  /** The silhouette's one warm (it's never freed while the world stands), once started. */
  let silhouetteWarm: Promise<void> | null = ctx.warm ? null : Promise.resolve();
  let silhouetteWarmed = !ctx.warm;
  /**
   * Starts the silhouette's warm (once), or null while there's no late warm yet. It owns the
   * silhouette's visibility meanwhile (it hides it between draws).
   */
  const warmSilhouette = (): Promise<void> | null => {
    if (silhouetteWarm) return silhouetteWarm;
    const w = ctx.warm?.(silhouetteRoots);
    if (!w) return null;
    warming = true;
    silhouetteWarm = w.finally(() => {
      warming = false;
      silhouetteWarmed = true;
    });
    return silhouetteWarm;
  };
  /** Parts hidden by distance (resident, past the swap): each was shown. */
  let distanceHidden: Object3D[] = [];
  let far = false;
  const hideByDistance = () => {
    far = true;
    distanceHidden = ctx.parts().filter((o) => o.visible);
    for (const o of distanceHidden) o.visible = false;
    ctx.plantsAwake(false);
  };
  /** Shows what distance hid (no upload or shader build: they stayed resident and warm). */
  const showByDistance = (plants: boolean) => {
    far = false;
    for (const o of distanceHidden) o.visible = true;
    distanceHidden = [];
    if (plants) ctx.plantsAwake(true);
  };

  const world: AnchorageWorld = { roots: [] };
  const wake = async (): Promise<AnchorageWorld> => {
    for (const p of parked) {
      p.object.visible = false;
      p.parent.add(p.object);
    }
    world.roots = parked.map((p) => p.object);
    showPending = true;
    awake = true;
    return world;
  };
  const sleep = async (): Promise<void> => {
    showPending = false;
    // The silhouette warms while the island still stands: the warm hides it between its draws, so
    // with the parts parked first neither drew for a few frames (the island blinked out). It's
    // usually warm already: the island swapped to it by distance as you left.
    await warmSilhouette();
    awake = false;
    // Parked as they'd be shown: waking puts them back hidden, and the swap hides them again if far.
    if (far) showByDistance(false);
    ctx.plantsAwake(false);
    const objects = [...ctx.parts(), ...self.extra].filter((o) => o.parent);
    parked = objects.map((object) => ({ object, parent: object.parent!, visible: object.visible }));
    for (const p of parked) p.object.removeFromParent();
    silhouette.visible = true;
    await ctx.breathe();
    // Only what nothing in the scene still draws (the village kit, terrain textures and shared
    // models stay for the island you're on).
    await releaseGpuCopies(objects, scene, ctx.breathe);
    // The session's parts come back with its own setup.
    parked = parked.filter((p) => !self.extra.includes(p.object));
    self.extra = [];
  };
  const life = new StreamLifecycle<AnchorageWorld>(wake, sleep);
  life.markResident(world);

  const self: AnchorageStream = {
    silhouette,
    terrain: ctx.terrain,
    extra: [],
    get state() {
      return life.state;
    },
    get loads() {
      return life.loads;
    },
    get held() {
      return held;
    },
    get shown() {
      return awake && !showPending && !far;
    },
    load: (_priority?: RequestPriority, retry = false) => life.load(retry),
    unload: () => life.unload(),
    onReady: (fn) => life.onReady(fn),
    roots: () => (showPending ? parked.map((p) => p.object).filter((o) => o.parent) : []),
    hold(on) {
      held = on;
    },
    reveal() {
      if (!showPending || life.state !== 'resident') return;
      showPending = false;
      for (const p of parked) p.object.visible = p.visible;
      parked = [];
      ctx.plantsAwake(true);
    },
    update(camera) {
      // Past its swap distance a resident Anchorage draws as its silhouette too (you've left it, and
      // it stays in memory a while): the silhouette's warmed first, and the parts are only hidden.
      const p = camera.position;
      const out = swap.update(footprintDistance(ctx.island.footprint, p.x, p.z));
      if (awake && !showPending && !held) {
        if (out && !far) {
          if (silhouetteWarmed) hideByDistance();
          else void warmSilhouette();
        } else if (!out && far) showByDistance(true);
      }
      if (!warming) silhouette.visible = !awake || showPending || far;
    },
    dispose() {
      life.end();
      scene.remove(silhouette);
      silhouette.traverse((o) => {
        const m = o as Object3D & { geometry?: { dispose(): void }; material?: { dispose(): void } };
        m.geometry?.dispose();
        m.material?.dispose();
      });
      // Parked parts stay out of the scene: their owners free them (the world's dispose), and it tells
      // three they're gone (`parkedRoots`). Put back, they'd draw on the title with freed buffers.
      parked = [];
    },
    parkedRoots: () => parked.filter((p) => !p.object.parent).map((p) => p.object),
  };
  return self;
}
