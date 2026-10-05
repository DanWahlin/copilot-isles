import type { Object3D } from 'three/webgpu';

/** A layer no camera looks at: staged objects sit on it until they're let in. */
const STAGING_LAYER = 31;

interface Staged {
  obj: Object3D;
  mask: number;
  culled: boolean;
}

/**
 * Warms the world's real render (the post pipeline's scene pass, its MRT and shadow passes) a few
 * objects per frame, instead of building every material's shader in one long first frame.
 *
 * Every renderable under `root` is moved to a layer no camera sees; each frame lets the next batch
 * back in (unculled for that one frame, so it's drawn whatever the camera's looking at). The caller's
 * render loop does the drawing (e.g. the opening draws the world behind the cabin). The batch grows
 * while frames stay quick and shrinks when one runs long. Layers are used rather than `visible`,
 * because the world's own LOD and streaming systems toggle visibility.
 */
export async function warmProgressively(
  root: Object3D,
  nextFrame: () => Promise<void>,
  opts: { targetMs?: number; startBatch?: number } = {},
): Promise<void> {
  const target = opts.targetMs ?? 45;
  const staged: Staged[] = [];
  root.traverse((obj) => {
    const r = obj as Object3D & {
      isMesh?: boolean;
      isLine?: boolean;
      isPoints?: boolean;
      isSprite?: boolean;
    };
    if (!(r.isMesh || r.isLine || r.isPoints || r.isSprite)) return;
    staged.push({ obj, mask: obj.layers.mask, culled: obj.frustumCulled });
    obj.layers.set(STAGING_LAYER);
  });
  let batch = Math.max(1, opts.startBatch ?? 6);
  let previous: Staged[] = [];
  let next = 0;
  try {
    while (next < staged.length || previous.length) {
      for (const s of previous) s.obj.frustumCulled = s.culled;
      const current = staged.slice(next, next + batch);
      next += current.length;
      for (const s of current) {
        s.obj.layers.mask = s.mask;
        s.obj.frustumCulled = false;
      }
      previous = current;
      const t0 = performance.now();
      await nextFrame();
      const ms = performance.now() - t0;
      batch =
        ms < target * 0.6
          ? Math.ceil(batch * 1.6)
          : ms > target * 1.6
            ? Math.max(1, Math.floor(batch * 0.6))
            : batch;
    }
  } finally {
    // Whatever happens, everything goes back as it was.
    for (const s of staged) {
      s.obj.layers.mask = s.mask;
      s.obj.frustumCulled = s.culled;
    }
  }
}
