/**
 * Cooperative time slicing for long world builds. Builders call `await buildSlice()` inside their
 * loops; while a slicer is installed (the opening plays over the island build), the call returns at
 * once until the frame's work budget is spent, then waits for the next frame. With no slicer
 * installed (tests, dev pages, the island already on screen) it costs one resolved await.
 */

let slicer: (() => Promise<void>) | null = null;
const ready = Promise.resolve();

/** Yields to the next frame when this frame's build budget is spent. */
export function buildSlice(): Promise<void> {
  return slicer ? slicer() : ready;
}

/**
 * Installs a slicer that runs at most `budgetMs` of build work per frame, after the frame's own
 * work (rAF, then a task). Returns the uninstall function. Several concurrent builders share the
 * budget.
 */
export function installBuildSlicer(budgetMs = 5): () => void {
  let start = performance.now();
  let pending: Promise<void> | null = null;
  const channel = new MessageChannel();
  let wake: (() => void) | null = null;
  channel.port1.onmessage = () => {
    start = performance.now();
    pending = null;
    const w = wake;
    wake = null;
    w?.();
  };
  const nextSlice = (): Promise<void> => {
    pending ??= new Promise<void>((resolve) => {
      wake = resolve;
      requestAnimationFrame(() => channel.port2.postMessage(0));
    });
    return pending;
  };
  const own = async (): Promise<void> => {
    while (slicer === own && performance.now() - start >= budgetMs) await nextSlice();
  };
  slicer = own;
  return () => {
    if (slicer === own) slicer = null;
    wake?.();
    channel.port1.close();
  };
}
