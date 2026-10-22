import type { FrameCounters, FrameStats, Hitch, Stall } from './frame-counters';

export interface BackendInfo {
  backend: 'webgpu' | 'webgl2';
  reason: string;
  hdr: boolean;
  features: string[];
}

interface IslesDebug {
  info(): FrameStats & {
    width: number;
    height: number;
    fps: number;
    cpuMs: number;
    gpuMs: number;
    gpuBusyMs: number;
    gpuRawMs: number;
  } & BackendInfo;
  shot?(id: string): void;
  /** Freeze-frame for screenshots (tools/shots.mjs), like the cove dev page's `freeze`/`still`. */
  still?: StillShot;
  hitches(): Hitch[];
  /** Frames over 50 ms apart after warm-up (main-thread stalls the hitch guard can't see). */
  stalls(): Stall[];
  state(): string;
}

/** Holds a page still for deterministic screenshots (tools/shots.mjs). */
export interface StillShot {
  /** Pauses the clock (at `sim` seconds if given), stops the frame loop and fixes the render scale at 1; `false` resumes. */
  freeze(on: boolean, sim?: number): void;
  /** Draws one frame with time held (`Engine.renderStill`). */
  still(): void;
  /** Starts temporal AA's jitter over. */
  restartJitter(): void;
}

declare global {
  interface Window {
    __isles?: IslesDebug;
    __load?: (progress: number, message?: string) => void;
    /** Resolves when the splash has finished filling and shown for its minimum time (index.html). */
    __loadDone?: () => Promise<void>;
  }
}

/** Dev builds, or any build opened with ?debug (used by Playwright). Never exposes secrets. */
function debugEnabled(): boolean {
  return import.meta.env.DEV || new URLSearchParams(location.search).has('debug');
}

export function installDebug(
  counters: FrameCounters,
  canvas: HTMLCanvasElement,
  getFps: () => number,
  getState: () => string,
  backend: BackendInfo,
  options: {
    getCpuMs?: () => number;
    /** GPU ms limited to the frame time (`Engine.gpuMs`). */
    getGpuMs?: () => number;
    /** The time the GPU was busy with the frame (`Engine.gpuBusyMs`). */
    getGpuBusyMs?: () => number;
    /** The passes' summed durations (`Engine.gpuRawMs`), for debugging only. */
    getGpuRawMs?: () => number;
    shot?: (id: string) => void;
    still?: StillShot;
  } = {},
): void {
  if (!debugEnabled()) return;
  window.__isles = {
    info: () => ({
      ...counters.last,
      width: canvas.width,
      height: canvas.height,
      fps: getFps(),
      cpuMs: options.getCpuMs?.() ?? 0,
      gpuMs: options.getGpuMs?.() ?? 0,
      gpuBusyMs: options.getGpuBusyMs?.() ?? 0,
      gpuRawMs: options.getGpuRawMs?.() ?? 0,
      ...backend,
    }),
    hitches: () => [...counters.hitches],
    stalls: () => [...counters.stalls],
    state: getState,
    ...(options.shot ? { shot: options.shot } : {}),
    ...(options.still ? { still: options.still } : {}),
  };
}
