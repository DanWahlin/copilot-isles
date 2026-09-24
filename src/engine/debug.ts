import type { FrameCounters, FrameStats, Hitch } from './frame-counters';

export interface IslesDebug {
  info(): FrameStats & { width: number; height: number; fps: number };
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
): void {
  if (!debugEnabled()) return;
  window.__isles = {
    info: () => ({ ...counters.last, width: canvas.width, height: canvas.height, fps: getFps() }),
    hitches: () => [...counters.hitches],
    state: getState,
  };
}
