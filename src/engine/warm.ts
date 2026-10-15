import type { Object3D } from 'three/webgpu';

/** A layer no camera looks at: staged objects sit on it until they're let in. */
const STAGING_LAYER = 31;

interface Staged {
  obj: Object3D;
  mask: number;
  culled: boolean;
  /** What its first draw builds (`buildKey`). */
  key: string;
}

/** Objects that share a built look (one already drawn) let in with each frame's new looks, at most. */
const SHARED_PER_FRAME = 24;

const materialIds = new WeakMap<object, number>();
let nextMaterialId = 0;

/**
 * What an object's first draw builds: three makes one node graph (several milliseconds) per material
 * and geometry layout, and objects that share them reuse it (an instanced mesh never does). So a
 * batch is sized by how many new looks it holds, not by how many objects.
 */
function buildKey(obj: Object3D): string {
  const o = obj as Object3D & {
    material?: object | object[];
    geometry?: { attributes?: Record<string, unknown>; morphAttributes?: Record<string, unknown> };
    isInstancedMesh?: boolean;
    isSkinnedMesh?: boolean;
  };
  const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
  let key = '';
  for (const m of mats) {
    let id = materialIds.get(m);
    if (id === undefined) materialIds.set(m, (id = nextMaterialId++));
    key += `${id},`;
  }
  const g = o.geometry;
  if (g?.attributes) key += `|${Object.keys(g.attributes).join(',')}`;
  if (g?.morphAttributes) key += `|${Object.keys(g.morphAttributes).join(',')}`;
  // An instanced mesh's graph is its own (three names its instance buffer by node id).
  if (o.isInstancedMesh) key += `|i${o.id}`;
  if (o.isSkinnedMesh) key += '|s';
  return key;
}

/**
 * Warms the world's real render (the post pipeline's scene pass, its MRT and shadow passes) a few
 * objects per frame, instead of building every material's shader in one long first frame.
 *
 * Every renderable under `root` is moved to a layer no camera sees; each frame lets the next batch
 * back in (unculled for that one frame, so it's drawn whatever the camera's looking at). The caller's
 * render loop does the drawing (e.g. the opening draws the world behind the cabin). A batch is
 * counted in new looks (`buildKey`: each one's first draw builds a node graph, ~10 ms for the
 * village's materials), with objects that share an already built look let in alongside. The count is
 * sized from the last frame's cost per new look, so a frame stays near `targetMs` of extra work
 * (twelve new looks at once held a frame for ~110 ms behind the cabin). Layers are used rather than
 * `visible`, because the world's own LOD and streaming systems toggle visibility.
 */
export async function warmProgressively(
  root: Object3D | readonly Object3D[],
  nextFrame: () => Promise<void>,
  opts: {
    targetMs?: number;
    startBatch?: number;
    /** The last frame's own work (ms), e.g. the engine's CPU time; defaults to the frame interval. */
    frameCost?: () => number;
    /**
     * Objects that warm in a frame of their own (e.g. instanced meshes, whose real draw always builds
     * a new program: three names their instance buffer by node id, so no earlier compile matches).
     */
    solo?: (obj: Object3D) => boolean;
  } = {},
): Promise<void> {
  const target = opts.targetMs ?? 45;
  const staged: Staged[] = [];
  const roots: readonly Object3D[] = Array.isArray(root) ? root : [root as Object3D];
  for (const r of roots)
    r.traverse((obj) => {
      const r = obj as Object3D & {
        isMesh?: boolean;
        isLine?: boolean;
        isPoints?: boolean;
        isSprite?: boolean;
      };
      if (!(r.isMesh || r.isLine || r.isPoints || r.isSprite)) return;
      staged.push({ obj, mask: obj.layers.mask, culled: obj.frustumCulled, key: buildKey(obj) });
      obj.layers.set(STAGING_LAYER);
    });
  let batch = Math.max(1, opts.startBatch ?? 6);
  let previous: Staged[] = [];
  let floor = Infinity;
  let next = 0;
  const built = new Set<string>();
  let each = target / Math.max(1, batch);
  try {
    while (next < staged.length || previous.length) {
      for (const s of previous) s.obj.frustumCulled = s.culled;
      const current: Staged[] = [];
      let fresh = 0;
      while (next < staged.length) {
        const s = staged[next]!;
        const alone = opts.solo?.(s.obj) ?? false;
        if (alone && current.length > 0) break;
        const isNew = !built.has(s.key);
        if (isNew ? fresh >= batch : current.length >= batch + SHARED_PER_FRAME) break;
        current.push(s);
        next++;
        if (isNew) {
          fresh++;
          built.add(s.key);
        }
        if (alone) break;
      }
      for (const s of current) {
        s.obj.layers.mask = s.mask;
        s.obj.frustumCulled = false;
      }
      previous = current;
      const t0 = performance.now();
      await nextFrame();
      const cost = opts.frameCost ? opts.frameCost() : performance.now() - t0;
      // Only the warm's own extra work counts: the cheapest frame seen is the scene's base cost.
      floor = Math.min(floor, cost);
      const ms = cost - floor;
      // As many new looks next frame as fit the target at the cost of a new look: the dearest one
      // seen lately (a slow frame counts at once, and is forgotten slowly, as cheap looks and dear
      // ones come in runs). A frame of shared looks only says nothing about the next new one.
      if (fresh > 0) {
        each = Math.max(ms / fresh, each * 0.85, 0.5);
        batch = Math.max(1, Math.min(Math.ceil(batch * 1.5), Math.floor(target / each)));
      }
    }
  } finally {
    // Whatever happens, everything goes back as it was.
    for (const s of staged) {
      s.obj.layers.mask = s.mask;
      s.obj.frustumCulled = s.culled;
    }
  }
}

/**
 * Draws each of a terrain's levels of detail once (the finer ones are only shown up close, the merged
 * far blocks only from afar), so walking or sailing near a chunk later doesn't upload it mid-play. A
 * precompile can't do this: the chunks' pipelines already exist, so it skips them and uploads nothing.
 */
export async function warmTerrainLods(
  terrain: { group: Object3D; setLod(lod: number | null): void; readonly lodCount?: number },
  nextFrame: () => Promise<void>,
  opts: Parameters<typeof warmProgressively>[2] = {},
): Promise<void> {
  try {
    for (let lod = 0; lod < (terrain.lodCount ?? 2); lod++) {
      terrain.setLod(lod);
      await warmProgressively(terrain.group, nextFrame, opts);
    }
  } finally {
    terrain.setLod(null);
  }
}

/**
 * Compiles every renderable under `root` with `compile` (e.g. the post pipeline's compileObject: the
 * scene pass's exact target and MRT, pipelines built asynchronously, nothing drawn), spending about
 * `budgetMs` of main-thread time per frame. Each object is unculled while it compiles, so it's
 * built whatever the camera's looking at. Resolves once every pipeline is ready.
 *
 * At most `inFlight` compiles run at once: three's compileAsync builds its node graphs after its
 * first await, in `scheduler.yield()` slices that the browser runs ahead of the next frame, so a
 * whole island's compiles at once held a frame for 100–120 ms behind the cabin.
 */
export async function compileProgressively(
  root: Object3D,
  compile: (object: Object3D) => Promise<void>,
  nextFrame: () => Promise<void>,
  budgetMs = 6,
  inFlight = 4,
): Promise<{ objects: number; frames: number; worstMs: number }> {
  const objects: Object3D[] = [];
  root.traverseVisible((obj) => {
    const r = obj as Object3D & {
      isMesh?: boolean;
      isLine?: boolean;
      isPoints?: boolean;
      isSprite?: boolean;
    };
    if (r.isMesh || r.isLine || r.isPoints || r.isSprite) objects.push(obj);
  });
  const pending = new Set<Promise<void>>();
  let frames = 0;
  let worst = 0;
  let end = performance.now() + budgetMs;
  for (const obj of objects) {
    while (pending.size >= inFlight) {
      await Promise.race(pending);
      end = performance.now() + budgetMs;
    }
    if (performance.now() > end) {
      await nextFrame();
      frames++;
      end = performance.now() + budgetMs;
    }
    const culled = obj.frustumCulled;
    obj.frustumCulled = false;
    const t0 = performance.now();
    const job: Promise<void> = compile(obj)
      .catch(() => undefined)
      .then(() => {
        pending.delete(job);
      });
    pending.add(job);
    worst = Math.max(worst, performance.now() - t0);
    obj.frustumCulled = culled;
  }
  await Promise.all(pending);
  return { objects: objects.length, frames, worstMs: worst };
}

/**
 * Shows the hidden objects under `root` marked `userData.prewarm` (things that appear later, such
 * as the parrot's flight rig) so a warm compiles and uploads them too. Returns the function that
 * hides them again.
 */
export function revealPrewarm(root: Object3D): () => void {
  const shown: Object3D[] = [];
  root.traverse((obj) => {
    if (obj.userData.prewarm === true && !obj.visible) {
      obj.visible = true;
      shown.push(obj);
    }
  });
  return () => {
    for (const obj of shown) obj.visible = false;
  };
}
