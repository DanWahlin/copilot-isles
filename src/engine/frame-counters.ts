import type { WebGPURenderer } from 'three/webgpu';

export interface FrameStats {
  calls: number;
  triangles: number;
  programs: number;
  geometries: number;
  textures: number;
  gpuMemoryMB: number;
}

export interface Hitch {
  t: number;
  programs: number;
  geometries: number;
  textures: number;
}

/**
 * Whole-frame renderer counters (PLAN §12.10): three.js resets its counters on every render()
 * call, so we disable auto-reset and reset once per frame to sum every pass (scene, mirror, post).
 */
export class FrameCounters {
  last: FrameStats = { calls: 0, triangles: 0, programs: 0, geometries: 0, textures: 0, gpuMemoryMB: 0 };
  readonly hitches: Hitch[] = [];
  private armed = false;
  private base = { programs: 0, geometries: 0, textures: 0 };

  constructor(private readonly renderer: WebGPURenderer) {
    renderer.info.autoReset = false;
  }

  beginFrame(): void {
    this.renderer.info.reset();
  }

  endFrame(t: number): void {
    const { render, memory } = this.renderer.info;
    const mem = memory as typeof memory & { programs?: number; total?: number };
    const programs = mem.programs ?? 0;
    this.last = {
      calls: render.calls,
      triangles: render.triangles,
      programs,
      geometries: memory.geometries,
      textures: memory.textures,
      gpuMemoryMB: (mem.total ?? 0) / 1048576,
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
    const memory = this.renderer.info.memory as { programs?: number; geometries: number; textures: number };
    this.base = { programs: memory.programs ?? 0, geometries: memory.geometries, textures: memory.textures };
    this.armed = true;
  }
}
