import type { WebGPURenderer } from 'three/webgpu';
import { correctMemoryInfo, type InfoWithMemory } from './memory-ledger';

export interface FrameStats {
  /** Draw calls in the last frame, summed across every pass (scene, mirror, post). Used for budgets. */
  drawCalls: number;
  /** `renderer.render()` calls in the last frame. */
  frameCalls: number;
  triangles: number;
  /** Active pipelines/programs (PLAN §15.4 cap). */
  programs: number;
  geometries: number;
  textures: number;
  textureMB: number;
  /** All resources three.js tracks (buffers, textures, programs), not just textures. */
  trackedMB: number;
}

export interface Hitch {
  t: number;
  programs: number;
  geometries: number;
  textures: number;
  /** What the game was doing (e.g. the screen), when the owner sets `stage`. */
  stage?: string;
}

/**
 * A frame that came long after the one before it (wall time), while the guard is armed: a main-thread
 * stall (a long build step, a synchronous shader build) that the resource guard can't see.
 */
export interface Stall {
  t: number;
  /** Wall time since the frame before, in ms. */
  ms: number;
  stage?: string;
  /** It fell in an excused late addition's load or warm (its stalls still show to the player). */
  excused?: boolean;
}

/** A frame gap over this (ms) is a stall: the Long Tasks API's threshold. */
export const STALL_MS = 50;

/** The subset of three's `Info` we read (it's the same object on the WebGPU and WebGL2 backends). */
export interface InfoLike {
  autoReset: boolean;
  reset(): void;
  render: { drawCalls: number; frameCalls: number; triangles: number };
  memory: { geometries: number; textures: number; programs?: number; texturesSize?: number; total?: number };
}

const MB = 1048576;

/**
 * The GPU time we show and report (HUD, stats, `window.__isles`, the benchmark): the raw timestamp
 * reading limited to the wall time of the frame. A pipelined GPU can't do more work per frame than the
 * frame interval, but WebGPU pass timestamps on Apple GPUs (tile GPUs) read far higher: they sum each
 * pass's wall time, which overlaps and includes other clients' GPU work (.plans/issues.md #11).
 * Returns 0 when there's no reading.
 */
export function limitGpuMs(rawMs: number, frameMs: number): number {
  return rawMs > 0 ? Math.min(rawMs, Math.max(0, frameMs)) : 0;
}

/**
 * Whole-frame renderer counters (PLAN §12.10). three.js resets per-frame metrics on every render()
 * call unless autoReset is off, so we reset once per frame to sum every pass. Note that
 * `render.calls` is a lifetime count in three's shared Info, which is why we read `drawCalls`.
 */
export class FrameCounters {
  last: FrameStats = {
    drawCalls: 0,
    frameCalls: 0,
    triangles: 0,
    programs: 0,
    geometries: 0,
    textures: 0,
    textureMB: 0,
    trackedMB: 0,
  };
  readonly hitches: Hitch[] = [];
  /** Frame gaps over STALL_MS after warm-up (`noteFrameGap`). Not hitches: timing depends on the machine. */
  readonly stalls: Stall[] = [];
  /** Labels each hitch with what the game was doing (set by the game flow). */
  stage: (() => string) | null = null;
  private armed = false;
  /** Excused late additions still loading, and frames left to let their first draw upload. */
  private excused = 0;
  private settle = 0;
  private base = { programs: 0, geometries: 0, textures: 0 };
  private readonly info: InfoLike;
  /** Recounts textures whose size changed since three counted them (engine/memory-ledger.ts). */
  private readonly recountTextures: () => void;

  constructor(renderer: WebGPURenderer | { info: InfoLike }) {
    this.info = renderer.info as unknown as InfoLike;
    this.info.autoReset = false;
    this.recountTextures = correctMemoryInfo(renderer.info as unknown as InfoWithMemory);
  }

  beginFrame(): void {
    this.info.reset();
  }

  endFrame(t: number): void {
    this.recountTextures();
    const { render, memory } = this.info;
    const programs = memory.programs ?? 0;
    this.last = {
      drawCalls: render.drawCalls,
      frameCalls: render.frameCalls,
      triangles: render.triangles,
      programs,
      geometries: memory.geometries,
      textures: memory.textures,
      textureMB: (memory.texturesSize ?? 0) / MB,
      trackedMB: (memory.total ?? 0) / MB,
    };
    // Hitch guard: after warm-up, any new pipeline/geometry/texture during play is a missing precompile.
    if (!this.armed) return;
    // An excused, precompiled late addition: its pipelines and first uploads aren't hitches.
    if (this.excused > 0 || this.settle > 0) {
      if (this.excused === 0) this.settle--;
      this.base = { programs, geometries: memory.geometries, textures: memory.textures };
      return;
    }
    const grew =
      programs > this.base.programs ||
      memory.geometries > this.base.geometries ||
      memory.textures > this.base.textures;
    if (grew && this.hitches.length < 200) {
      this.hitches.push({
        t,
        programs: programs - this.base.programs,
        geometries: memory.geometries - this.base.geometries,
        textures: memory.textures - this.base.textures,
        ...(this.stage ? { stage: this.stage() } : {}),
      });
    }
    this.base = { programs, geometries: memory.geometries, textures: memory.textures };
  }

  /**
   * A deliberate late addition that is precompiled off the frame (`renderer.compileAsync`, then added to
   * the scene), like the title's distant gulls: its growth isn't a hitch while it loads and for
   * `settleFrames` frames after (its first draw uploads its buffers and textures). Returns `work`.
   */
  excuse<T>(work: Promise<T>, settleFrames = 3): Promise<T> {
    this.excused++;
    const done = (): void => {
      this.excused--;
      this.settle = Math.max(this.settle, settleFrames);
    };
    work.then(done, done);
    return work;
  }

  /**
   * Records a frame that came `gapMs` (wall time) after the frame before as a stall when it's over
   * STALL_MS and the guard is armed. The resource guard only sees new programs, geometries and textures,
   * so CPU work (a build step that doesn't breathe) never shows there.
   */
  noteFrameGap(gapMs: number, t: number): void {
    if (!this.armed || gapMs <= STALL_MS || this.stalls.length >= 200) return;
    this.stalls.push({
      t,
      ms: Math.round(gapMs),
      ...(this.stage ? { stage: this.stage() } : {}),
      ...(this.excused > 0 || this.settle > 0 ? { excused: true } : {}),
    });
  }

  /** Call once warm-up is complete. */
  arm(): void {
    const { memory } = this.info;
    this.base = { programs: memory.programs ?? 0, geometries: memory.geometries, textures: memory.textures };
    this.armed = true;
  }
}
