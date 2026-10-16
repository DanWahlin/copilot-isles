import type { Object3D, Scene } from 'three/webgpu';
import { releaseRemovedObjects } from '../util/dispose-three';

/**
 * Where a streamed island is: not in memory, streaming in, in the scene, being freed, or failed to
 * stream (a 404, offline): it's tried again only after a wait, or when something asks for it.
 */
export type StreamState = 'absent' | 'loading' | 'resident' | 'unloading' | 'failed';

/** After a failed stream, how long (ms) before a load that nothing waits on tries again. */
export const RETRY_AFTER_MS = 30_000;

/**
 * The life of a streamed island's world (PLAN §13.3 residency: an island you've left is freed and
 * streams in again when it's needed). `build` streams it in and returns its world (null if it failed
 * or the voyage ended); `teardown` frees it. A `load` while it's freeing waits for that, then streams
 * it again; `ready` always resolves with the next (or current) load's world, and `onReady` hears
 * every load, so whoever puts things on the island can put them back after a reload.
 */
export class StreamLifecycle<T> {
  state: StreamState = 'absent';
  /** How many times it has streamed in (a reload is 2, …). */
  loads = 0;
  private current: Promise<T | null> | null = null;
  private resolveReady: (t: T | null) => void = () => {};
  private readyPromise: Promise<T | null>;
  private freeing: Promise<void> | null = null;
  private readonly listeners = new Set<(t: T) => void>();
  private ended = false;
  /** When the last stream failed (ms, `now`'s clock). */
  private failedAt = 0;

  /**
   * `build` streams the island in and returns its world, or throws (after taking back whatever it
   * had added); it returns null only when the voyage has ended.
   */
  constructor(
    private readonly build: () => Promise<T | null>,
    private readonly teardown: () => Promise<void>,
    private readonly disabled = false,
    private readonly now: () => number = () => performance.now(),
  ) {
    this.readyPromise = this.fresh();
    if (disabled) this.resolveReady(null);
  }

  /** The world once the current (or next) load has finished; null if disabled, failed, or ended. */
  get ready(): Promise<T | null> {
    return this.readyPromise;
  }

  /**
   * Starts streaming in (once per residency; later calls share it). After a failure it tries again
   * only once `RETRY_AFTER_MS` has passed, or at once with `retry` (a jump there, a player's ask).
   */
  load(retry = false): Promise<T | null> {
    if (this.disabled || this.ended) return this.readyPromise;
    if (this.state === 'loading' || this.state === 'resident') return this.current ?? this.readyPromise;
    if (this.state === 'failed' && !retry && this.now() - this.failedAt < RETRY_AFTER_MS)
      return Promise.resolve(null);
    const waitFor = this.freeing;
    this.state = 'loading';
    const run = (async () => {
      if (waitFor) await waitFor;
      if (this.ended) return null;
      let world: T | null = null;
      let failed = false;
      try {
        world = await this.build();
      } catch (error) {
        console.warn('[stream] load failed', error);
        failed = true;
      }
      if (this.ended) return null;
      if (!world) {
        this.state = failed ? 'failed' : 'absent';
        this.failedAt = this.now();
        this.current = null;
        this.resolveReady(null);
        this.readyPromise = this.fresh();
        return null;
      }
      this.state = 'resident';
      this.loads++;
      this.resolveReady(world);
      for (const fn of this.listeners) fn(world);
      return world;
    })();
    this.current = run;
    return run;
  }

  /** Frees the world (only when it's resident); resolves once it's gone. */
  unload(): Promise<void> {
    if (this.state !== 'resident') return this.freeing ?? Promise.resolve();
    this.state = 'unloading';
    this.current = null;
    // Whoever waits for the next load waits for a new one.
    this.readyPromise = this.fresh();
    const freeing: Promise<void> = this.teardown().finally(() => {
      if (this.state === 'unloading') this.state = 'absent';
      if (this.freeing === freeing) this.freeing = null;
    });
    this.freeing = freeing;
    return freeing;
  }

  /** It's already in (built with the world, not streamed): counts as the first load. */
  markResident(world: T): void {
    if (this.state !== 'absent') return;
    this.state = 'resident';
    this.loads++;
    this.current = Promise.resolve(world);
    this.resolveReady(world);
  }

  /** Hears every load from now on (the world it streamed). */
  onReady(fn: (t: T) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** The voyage is over: nothing loads again, and anyone waiting gets null. */
  end(): void {
    this.ended = true;
    this.listeners.clear();
    this.resolveReady(null);
  }

  private fresh(): Promise<T | null> {
    return new Promise<T | null>((r) => (this.resolveReady = r));
  }
}

/**
 * Frees an island's parts a few at a time (`breathe` between them, so a frame never holds them all):
 * each `free` runs, then everything that was under `roots` and has left the scene is told it's
 * disposed (three keeps a drawn object's render object, and its shaders, until then; skill §4).
 */
export async function freeInSlices(
  scene: Scene,
  roots: readonly (Object3D | null | undefined)[],
  free: readonly (() => void)[],
  breathe: () => Promise<void>,
): Promise<void> {
  const objects: Object3D[] = [];
  for (const r of roots) r?.traverse((o) => void objects.push(o));
  for (const r of roots) r?.removeFromParent();
  for (const f of free) {
    f();
    await breathe();
  }
  releaseRemovedObjects(objects, scene);
}
