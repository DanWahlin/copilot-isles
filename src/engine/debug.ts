import type { FrameCounters, FrameStats, Hitch } from './frame-counters';

export interface BackendInfo {
  backend: 'webgpu' | 'webgl2';
  reason: string;
  hdr: boolean;
  features: string[];
}

export interface IslesDebug {
  info(): FrameStats & { width: number; height: number; fps: number; cpuMs: number } & BackendInfo;
  shot?(id: string): void;
  hitches(): Hitch[];
  state(): string;
}

declare global {
  interface Window {
    __isles?: IslesDebug;
    __load?: (progress: number, message?: string) => void;
  }
}

/** Dev builds, or any build opened with ?debug (used by Playwright). Never exposes secrets. */
export function debugEnabled(): boolean {
  return import.meta.env.DEV || new URLSearchParams(location.search).has('debug');
}

export function installDebug(
  counters: FrameCounters,
  canvas: HTMLCanvasElement,
  getFps: () => number,
  getState: () => string,
  backend: BackendInfo,
  options: { getCpuMs?: () => number; shot?: (id: string) => void } = {},
): void {
  if (!debugEnabled()) return;
  window.__isles = {
    info: () => ({
      ...counters.last,
      width: canvas.width,
      height: canvas.height,
      fps: getFps(),
      cpuMs: options.getCpuMs?.() ?? 0,
      ...backend,
    }),
    hitches: () => [...counters.hitches],
    state: getState,
    ...(options.shot ? { shot: options.shot } : {}),
  };
}
