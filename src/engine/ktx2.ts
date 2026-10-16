import type { WebGPURenderer } from 'three/webgpu';
import type { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';

let renderer: WebGPURenderer | null = null;
let loader: Promise<KTX2Loader | null> | null = null;

/** The renderer whose compressed formats KTX2 textures transcode to (set once it's initialised). */
export function setKtx2Renderer(r: WebGPURenderer): void {
  if (renderer === r) return;
  renderer = r;
  loader = null;
}

/**
 * A KTX2 (Basis) loader for the renderer's compressed formats (PLAN §12.7): BC, ETC2 or ASTC, on
 * WebGPU or WebGL2 (an uncompressed fallback where none is offered). Made on first use (the
 * transcoder's script and wasm load then, into a worker), and shared. Null without a renderer.
 */
export function ktx2Loader(): Promise<KTX2Loader | null> {
  const r = renderer;
  if (!r) return Promise.resolve(null);
  if (loader) return loader;
  const made = import('three/addons/loaders/KTX2Loader.js')
    .then(async ({ KTX2Loader }) => {
      const l = new KTX2Loader()
        .setTranscoderPath(`${import.meta.env.BASE_URL || '/'}basis/`)
        .detectSupport(r);
      // The transcoder's script and wasm, fetched now: if they can't be (offline), there's no loader
      // and KTX2 textures fall back to their WebP (the kit's are optional).
      await l.init();
      return l;
    })
    .catch((error: unknown) => {
      console.warn('[ktx2] transcoder unavailable; KTX2 textures use their fallbacks', error);
      // Tried again by the next caller.
      if (loader === made) loader = null;
      return null;
    });
  loader = made;
  return made;
}
