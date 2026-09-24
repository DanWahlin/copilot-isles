import type { WebGPURenderer } from 'three/webgpu';

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
}

/** The subset of three's `Info` we read (it's the same object on the WebGPU and WebGL2 backends). */
export interface InfoLike {
  autoReset: boolean;
  reset(): void;
  render: { drawCalls: number; frameCalls: number; triangles: number };
  memory: { geometries: number; textures: number; programs?: number; texturesSize?: number; total?: number };
}

const MB = 1048576;

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
  private armed = false;
  private base = { programs: 0, geometries: 0, textures: 0 };
  private readonly info: InfoLike;

  constructor(renderer: WebGPURenderer | { info: InfoLike }) {
    this.info = renderer.info as unknown as InfoLike;
    this.info.autoReset = false;
  }

  beginFrame(): void {
    this.info.reset();
  }

  endFrame(t: number): void {
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
      });
    }
    this.base = { programs, geometries: memory.geometries, textures: memory.textures };
  }

  /** Call once warm-up is complete. */
  arm(): void {
    const { memory } = this.info;
    this.base = { programs: memory.programs ?? 0, geometries: memory.geometries, textures: memory.textures };
    this.armed = true;
  }
}
