import type { Object3D } from 'three/webgpu';
import type { Engine } from '../engine/engine';
import { compileProgressively, revealPrewarm, warmProgressively, warmTerrainLods } from '../engine/warm';
import type { CoveScene } from '../world/cove-scene';
import { skipSunShadowsWhereOff } from '../world/sky/cached-sun-shadow';
import type { CreatedTerrain } from '../world/terrain/terrain-mesh';
import type { StreamedIsland } from './session';

/** Compiles one object for the post's scene pass (`post.compileObject`). */
export interface ScenePassCompiler {
  compileObject(object: Object3D): Promise<void>;
}

/** The scene's stream for an island (`cove.anchorage`, `cove.meridian`, `cove.thousandBough`). */
export function islandStream(id: StreamedIsland): 'anchorage' | 'meridian' | 'thousandBough' {
  return id === 'thousand-bough' ? 'thousandBough' : id;
}

/**
 * Warms objects that join the world after it's playing (another island, the leaping fish) like the
 * island's own warm-up: pipelines precompiled for the post's scene pass off-thread, then a few
 * objects a frame get one real draw (instanced and skinned meshes, uploads, shadow passes) unculled
 * for that frame, then a terrain's finer levels of detail. Nothing under `roots` is drawn otherwise
 * until it's done (hidden, or on a layer no camera sees), so no first draw builds a shader on the
 * spot; uploads are excused from the hitch guard. Only frames that draw the world count. Roots end
 * as they were, except `keepHidden` ones, which end hidden. Stops once `live()` is false.
 * The game's flow and the play dev page share it, so the page counts shaders and hitches like the game.
 */
export async function warmLate(o: {
  engine: Engine;
  cove: CoveScene;
  roots: readonly Object3D[];
  post: ScenePassCompiler | null;
  live: () => boolean;
  keepHidden?: readonly Object3D[];
  terrain?: CreatedTerrain | null;
  reflected?: boolean;
}): Promise<void> {
  const { engine, cove, roots, post, live } = o;
  if (!roots.length) return;
  const wasVisible = roots.map((r) => r.visible);
  const hideAll = () => {
    for (const r of roots) r.visible = false;
  };
  hideAll();
  const frame = async () => {
    do await new Promise<void>((r) => requestAnimationFrame(() => r()));
    while (engine.worldHidden() && live());
    if (!live()) throw new Error('voyage ended');
  };
  const compile = (obj: Object3D) =>
    Promise.all([
      post ? post.compileObject(obj) : engine.renderer.compileAsync(obj, engine.camera, engine.scene),
      o.reflected === false ? null : cove.mirror?.compileObject(engine.renderer, engine.scene, obj),
    ]).then(() => undefined);
  const steady = { targetMs: 3, startBatch: 2, frameCost: () => engine.cpuMs };
  await engine.counters
    .excuse(
      (async () => {
        // Parts that appear later (marked userData.prewarm, like Meridian's mooring lines) are shown
        // for the warm too, so their first real showing doesn't upload or compile mid-play.
        const hidePrewarm = roots.map((r) => revealPrewarm(r));
        // One shader per look whether a mesh takes the sun's shadows or not (before any compile).
        if (cove.sky.sun.castShadow) for (const r of roots) skipSunShadowsWhereOff(r);
        try {
          // Each mesh compiles on its own (hidden parents don't matter); the root is only shown
          // while compileProgressively gathers its meshes, synchronously.
          for (const root of roots) {
            root.visible = true;
            const done = compileProgressively(root, compile, frame, 3);
            root.visible = false;
            await done;
          }
          for (const r of roots) r.visible = true;
          const endShadowWarm = cove.sky.shadowWarm(roots);
          try {
            await warmProgressively(roots, frame, {
              ...steady,
              solo: (obj) => !!(obj as Object3D & { isInstancedMesh?: boolean }).isInstancedMesh,
            });
          } finally {
            endShadowWarm();
          }
          hideAll();
          if (o.terrain) {
            o.terrain.group.visible = true;
            await warmTerrainLods(o.terrain, frame, steady);
          }
        } finally {
          for (const hide of hidePrewarm) hide();
          if (live())
            roots.forEach((r, i) => (r.visible = o.keepHidden?.includes(r) ? false : wasVisible[i]!));
        }
      })(),
    )
    .catch(() => undefined);
}

/**
 * Warms a streamed island's world and the session's content on it (its cast, chests and sites),
 * each time it streams in: the frame loop leaves its visibility to the warm meanwhile, and it's
 * hidden again afterwards (shown by distance).
 */
export function warmIsland(o: {
  engine: Engine;
  cove: CoveScene;
  id: StreamedIsland;
  setup: { roots: Object3D[]; reveal(): void };
  post: ScenePassCompiler | null;
  live: () => boolean;
}): Promise<void> {
  const { cove, id, setup, live } = o;
  // This runs straight after the setup (a microtask, before the next frame), so warmLate hides what
  // it added before it's drawn.
  const stream = cove[islandStream(id)];
  const own = stream.roots();
  if (!live()) return Promise.resolve();
  if (!own.length) {
    setup.reveal();
    return Promise.resolve();
  }
  stream.hold(true);
  return warmLate({
    engine: o.engine,
    cove,
    roots: [...own, ...setup.roots],
    post: o.post,
    live,
    keepHidden: own,
    terrain: stream.terrain,
    // The harbour mirror only draws round Anchorage's harbour, a long way from Thousand-Bough.
    reflected: id !== 'thousand-bough',
  }).finally(() => {
    if (live()) {
      stream.hold(false);
      setup.reveal();
    }
  });
}

/**
 * The world's warm-up before play (the voyage's start): every pipeline compiled for the post's scene
 * pass (and the harbour mirror) off-thread, then a few objects a frame get one real draw (shadow
 * passes, instanced meshes, uploads), then the terrains' finer levels of detail. Objects that appear
 * later (`userData.prewarm`) are shown for it. `beforeDraws` runs between the compile and the draws.
 */
export async function warmWorld(o: {
  engine: Engine;
  cove: CoveScene;
  post: (ScenePassCompiler & { warmOutput?(): void }) | null;
  frame: () => Promise<void>;
  terrains: readonly (CreatedTerrain | null)[];
  beforeDraws?: () => Promise<void>;
}): Promise<void> {
  const { engine, cove, post, frame } = o;
  const hidePrewarm = revealPrewarm(engine.scene);
  // One shader per look whether a mesh takes the sun's shadows or not (before any compile).
  if (cove.sky.sun.castShadow) skipSunShadowsWhereOff(engine.scene);
  let endShadowWarm: (() => void) | null = null;
  try {
    await compileProgressively(
      engine.scene,
      (obj) =>
        Promise.all([
          post ? post.compileObject(obj) : engine.renderer.compileAsync(obj, engine.camera, engine.scene),
          cove.mirror?.compileObject(engine.renderer, engine.scene, obj),
        ]).then(() => undefined),
      frame,
    );
    await o.beforeDraws?.();
    // Small batches: each new shadow or post pipeline is built synchronously on its first draw.
    endShadowWarm = cove.sky.shadowWarm(engine.scene);
    await warmProgressively(engine.scene, frame, {
      targetMs: 12,
      startBatch: 1,
      frameCost: () => engine.cpuMs,
      solo: (obj) => {
        const m = obj as Object3D & { isInstancedMesh?: boolean; count?: number };
        if (!m.isInstancedMesh || !m.count) return false;
        for (let p: Object3D | null = obj; p; p = p.parent) if (!p.visible) return false;
        return true;
      },
    });
    for (const t of o.terrains) {
      if (t) await warmTerrainLods(t, frame, { targetMs: 12, startBatch: 3, frameCost: () => engine.cpuMs });
    }
    cove.worldWarmed();
  } finally {
    endShadowWarm?.();
    hidePrewarm();
  }
}
