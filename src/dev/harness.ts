import {
  ACESFilmicToneMapping,
  AgXToneMapping,
  NeutralToneMapping,
  type Camera,
  type Object3D,
  type WebGPURenderer,
} from 'three/webgpu';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { DayClock } from '../engine/day-clock';
import { Engine } from '../engine/engine';
import { TIERS, type TierSettings } from '../engine/quality';
import type { Tier } from '../world/contracts';
import { world } from '../world/uniforms';

/** What every dev page starts from: the query string, the chosen backend and tier, and a running engine. */
export interface DevHarness {
  readonly q: URLSearchParams;
  readonly backend: 'webgpu' | 'webgl2';
  readonly tier: TierSettings;
  readonly canvas: HTMLCanvasElement;
  readonly renderer: WebGPURenderer;
  readonly engine: Engine;
}

const TONE_MAPPINGS = {
  agx: AgXToneMapping,
  neutral: NeutralToneMapping,
  aces: ACESFilmicToneMapping,
} as const;

/**
 * Boots a dev page on the `#gl` canvas. Query flags shared by every page: `?webgl` (WebGL2 backend),
 * `?tier=lite|low|medium|high|ultra` (default high), `?tm=agx|neutral|aces` (tone-mapping A/B), and
 * `?shot` (hides the page chrome for screenshots).
 */
export async function createDevHarness(): Promise<DevHarness> {
  const q = new URLSearchParams(location.search);
  const backend = q.has('webgl') ? 'webgl2' : 'webgpu';
  const tier = TIERS[(q.get('tier') as Tier) ?? 'high'] ?? TIERS.high;
  if (q.has('shot')) document.body.classList.add('shot');
  const canvas = document.getElementById('gl') as HTMLCanvasElement;
  const renderer: WebGPURenderer = Engine.createRenderer({ canvas, backend, tier });
  await renderer.init();
  const engine = Engine.fromRenderer(renderer, { canvas, backend, tier });
  const tm = q.get('tm') as keyof typeof TONE_MAPPINGS | null;
  if (tm && TONE_MAPPINGS[tm]) renderer.toneMapping = TONE_MAPPINGS[tm];
  return { q, backend, tier, canvas, renderer, engine };
}

/** A named camera pose: [camera position, orbit target]. */
export type CamPose = readonly [position: readonly number[], target: readonly number[]];

/** Camera posing for an orbit-controlled dev page: `setCam` places camera and target, `setView` picks a named pose. */
export function orbitViews(
  camera: Camera,
  controls: OrbitControls,
  views: Readonly<Record<string, CamPose>>,
  fallback: string,
) {
  const setCam = (position: readonly number[], target: readonly number[]) => {
    camera.position.set(position[0], position[1], position[2]);
    controls.target.set(target[0], target[1], target[2]);
    controls.update();
  };
  const setView = (name: string) => {
    const [position, target] = views[name] ?? views[fallback];
    setCam(position, target);
  };
  return { setCam, setView };
}

/**
 * Wires the shared sky panel: the `#time`, `#az`, and `#wind` sliders plus the `[data-view]` and
 * `[data-time]` buttons. Starts from `?time=` (default 16.5 h) and `?az=`; returns `setTime`.
 */
export function bindSkyPanel(o: {
  q: URLSearchParams;
  clock: DayClock;
  invalidate(): void;
  setView(name: string): void;
}) {
  const { q, clock } = o;
  const timeEl = document.getElementById('time') as HTMLInputElement;
  const azEl = document.getElementById('az') as HTMLInputElement;
  const windEl = document.getElementById('wind') as HTMLInputElement;
  const setTime = (hours: number, azimuth = clock.azimuth) => {
    clock.set(hours, azimuth);
    timeEl.value = String(hours);
    azEl.value = String(azimuth);
    o.invalidate();
  };
  setTime(Number(q.get('time') ?? 16.5), Number(q.get('az') ?? 0));
  windEl.value = String(world.windSpeed.value);
  timeEl.oninput = () => setTime(Number(timeEl.value));
  azEl.oninput = () => setTime(clock.hours, Number(azEl.value));
  windEl.oninput = () => (world.windSpeed.value = Number(windEl.value));
  document
    .querySelectorAll<HTMLButtonElement>('[data-view]')
    .forEach((b) => (b.onclick = () => o.setView(b.dataset.view!)));
  document
    .querySelectorAll<HTMLButtonElement>('[data-time]')
    .forEach((b) => (b.onclick = () => setTime(Number(b.dataset.time))));
  return setTime;
}

/** Refreshes the sky panel's slider readouts (`#timeV`, `#azV`, `#windV`). */
export function showSkyReadouts(clock: DayClock): void {
  document.getElementById('timeV')!.textContent = clock.hours.toFixed(1);
  document.getElementById('azV')!.textContent = String(clock.azimuth);
  document.getElementById('windV')!.textContent = world.windSpeed.value.toFixed(1);
}

/** The stats panel's engine lines: backend, tier, fps, and GPU time; then draws, programs, and triangles. */
export function engineStats({ backend, tier, engine }: DevHarness): [string, string] {
  const c = engine.counters.last;
  return [
    `${backend} · ${tier.tier} · ${engine.fps.toFixed(0)} fps · gpu ${engine.gpuMs.toFixed(2)} ms`,
    `draws ${c.drawCalls} · programs ${c.programs} · tris ${(c.triangles / 1000).toFixed(0)}k`,
  ];
}

/** Compiles the scene's pipelines before the first frame, starts the engine, and returns the compile time in ms. */
export async function compileAndStart(
  renderer: WebGPURenderer,
  engine: Engine,
  scene: Object3D,
  camera: Camera,
  precompile?: () => Promise<void>,
): Promise<number> {
  const t0 = performance.now();
  if (precompile) await precompile();
  else await renderer.compileAsync(scene, camera);
  engine.start();
  return performance.now() - t0;
}
