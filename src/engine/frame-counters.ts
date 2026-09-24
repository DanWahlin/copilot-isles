import type { WebGLRenderer } from 'three';

export interface FrameStats {
  calls: number;
  triangles: number;
  programs: number;
  geometries: number;
  textures: number;
}

export interface Hitch {
  t: number;
  programs: number;
  geometries: number;
  textures: number;
}

/**
 * Whole-frame renderer counters (PLAN §12.10): three.js resets its counters on every render()
 * call, so we disable auto-reset and reset once per frame to sum every pass.
 */
export class FrameCounters {
  last: FrameStats = { calls: 0, triangles: 0, programs: 0, geometries: 0, textures: 0 };
  readonly hitches: Hitch[] = [];
  private armed = false;
  private base = { programs: 0, geometries: 0, textures: 0 };

  constructor(private readonly renderer: WebGLRenderer) {
    renderer.info.autoReset = false;
  }

  beginFrame(): void {
    this.renderer.info.reset();
  }

  endFrame(t: number): void {
    const { render, memory, programs } = this.renderer.info;
    const p = programs?.length ?? 0;
    this.last = {
      calls: render.calls,
      triangles: render.triangles,
      programs: p,
      geometries: memory.geometries,
      textures: memory.textures,
    };
    // Hitch guard: after warm-up, any new program/geometry/texture during play is a missing precompile.
    if (
      this.armed &&
      (p > this.base.programs ||
        memory.geometries > this.base.geometries ||
        memory.textures > this.base.textures)
    ) {
      if (this.hitches.length < 200) {
        this.hitches.push({
          t,
          programs: p - this.base.programs,
          geometries: memory.geometries - this.base.geometries,
          textures: memory.textures - this.base.textures,
        });
      }
    }
    if (this.armed) this.base = { programs: p, geometries: memory.geometries, textures: memory.textures };
  }

  /** Call once warm-up is complete. */
  arm(): void {
    const { memory, programs } = this.renderer.info;
    this.base = { programs: programs?.length ?? 0, geometries: memory.geometries, textures: memory.textures };
    this.armed = true;
  }
}
