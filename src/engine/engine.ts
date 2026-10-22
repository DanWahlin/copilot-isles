import { ACESFilmicToneMapping, HalfFloatType, PerspectiveCamera, Scene, WebGPURenderer } from 'three/webgpu';
import { setKtx2Renderer } from './ktx2';
import type { Backend } from '../world/contracts';
import { world } from '../world/uniforms';
import { AdaptiveResolution } from './adaptive-res';
import { DayClock } from './day-clock';
import { FixedStep } from './fixed-step';
import { FrameCounters, limitGpuMs } from './frame-counters';
import { installBusyTimestamps, type BusyTimestampPool } from './gpu-timestamps';
import { trackInstanceBuffers, type InstanceBufferRenderer } from './instance-buffers';
import type { TierSettings } from './quality';

/** Frames between GPU timestamp resolves. */
const RESOLVE_EVERY = 4;

/** Anything the engine ticks. `fixed` runs at 60 Hz (physics); `frame` once per rendered frame. */
export interface System {
  fixed?(h: number, t: number): void;
  frame?(dt: number, t: number): void;
  /** Keeps ticking while a cutscene hides the world (the cutscene itself, menus, audio). */
  cutscene?: boolean;
}

export interface EngineOptions {
  canvas: HTMLCanvasElement;
  backend: Backend;
  tier: TierSettings;
  hdr?: boolean;
}

/**
 * The engine core (Phase 0 T2): renderer lifecycle, the fixed-step simulation clock, time of day,
 * adaptive resolution fed by GPU time, whole-frame counters, and the system tick order.
 */
export class Engine {
  readonly renderer: WebGPURenderer;
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(55, 1, 0.1, 25000);
  readonly clock = new DayClock(16.5, 0);
  readonly counters: FrameCounters;
  readonly adaptive: AdaptiveResolution;
  readonly tier: TierSettings;
  backend: Backend;
  fps = 60;
  /**
   * GPU ms per frame (`gpuBusyMs`), limited to the frame's wall time (`limitGpuMs`); 0 without
   * timestamps. Show this one.
   */
  gpuMs = 0;
  /**
   * The time the GPU was busy with the frame's passes (ms): on WebGPU the union of their timestamp
   * intervals (`BusyTimestampPool`, issues.md #11), on WebGL2 the sum of their timer queries (which
   * can't overlap there).
   */
  gpuBusyMs = 0;
  /** The passes' durations summed, as three reports them; far too high on Apple's WebGPU (issues.md #11). Debug only. */
  gpuRawMs = 0;
  cpuMs = 0;
  /** Overrides the default scene render (e.g. the post-processing pipeline). */
  renderFn: (() => void) | null = null;
  /**
   * A cutscene drawn in place of the world (the opening's cabin, while the island streams in behind
   * it). With `drawWorld` set, the world renders first too, so its uploads happen off screen.
   */
  cutscene: { render(): void; drawWorld: boolean } | null = null;

  private manualScale: number | null = null;
  /** A cap on the pixel ratio while a cutscene holds the screen (see holdResolution). */
  private pixelCap: number | null = null;
  private readonly systems: System[] = [];
  private readonly step = new FixedStep(1 / 60);
  private last = 0;
  private running = false;
  private timestamps = false;
  private resolving = false;
  /** Frames until the next timestamp resolve (`RESOLVE_EVERY`). */
  private resolveIn = 0;
  /** The WebGPU pool that reads the passes' union (null on WebGL2). */
  private busyPool: BusyTimestampPool | null = null;
  /** The latest resolved readings; copied at the tick so they pair with `gpuMs`. */
  private gpuReading = 0;
  private busyReading = 0;
  private resizeObs: ResizeObserver | null = null;

  private constructor(renderer: WebGPURenderer, o: EngineOptions) {
    this.renderer = renderer;
    this.backend = o.backend;
    this.tier = o.tier;
    this.counters = new FrameCounters(renderer);
    this.adaptive = new AdaptiveResolution({ targetFps: o.tier.targetFps });
  }

  static createRenderer(o: EngineOptions): WebGPURenderer {
    return new WebGPURenderer({
      canvas: o.canvas,
      antialias: false,
      powerPreference: 'high-performance',
      forceWebGL: o.backend === 'webgl2',
      reversedDepthBuffer: true,
      trackTimestamp: true,
      ...(o.hdr && o.backend === 'webgpu' ? { outputType: HalfFloatType } : {}),
    });
  }

  /** Wraps an already-initialised renderer (boot owns creation + the WebGL2 retry). */
  static fromRenderer(renderer: WebGPURenderer, o: EngineOptions): Engine {
    const e = new Engine(renderer, o);
    // KTX2 textures (the village kit's roughness maps) transcode to this renderer's formats.
    setKtx2Renderer(renderer);
    // Instanced meshes free the instance buffers three made for them when disposed (issue 262).
    trackInstanceBuffers(renderer as unknown as InstanceBufferRenderer);
    // ACES gives the quality-slice look: soft sun roll-off and warm highlights without AgX's
    // heavy desaturation of the saturated sails and chibi character palettes.
    renderer.toneMapping = ACESFilmicToneMapping;
    const backend = (renderer.backend as { trackTimestamp?: boolean }) ?? {};
    e.timestamps = backend.trackTimestamp === true;
    e.busyPool = installBusyTimestamps(renderer);
    e.resize();
    e.resizeObs = new ResizeObserver(() => e.resize());
    e.resizeObs.observe(o.canvas.parentElement ?? document.body);
    return e;
  }

  /** Registers a system. `first` runs it before the others (e.g. the camera, before camera-dependent systems). */
  add(s: System, first = false): () => void {
    if (first) this.systems.unshift(s);
    else this.systems.push(s);
    return () => {
      const i = this.systems.indexOf(s);
      if (i >= 0) this.systems.splice(i, 1);
    };
  }

  /**
   * Effective pixel ratio: device DPR capped per tier × the render scale. The render scale is the
   * player's manual choice, or else the tier's base scale × the adaptive scale.
   */
  pixelRatio(): number {
    const dpr = Math.min(window.devicePixelRatio || 1, this.tier.maxDpr);
    const ratio = dpr * this.renderScale();
    return this.pixelCap === null ? ratio : Math.min(ratio, this.pixelCap);
  }

  /**
   * Holds the resolution steady for a cutscene: caps the pixel ratio at `cap`, and adaptive
   * resolution may lower the scale but not raise it (a mid-scene raise that can't hold 60 fps
   * halves to 30 under vsync, which reads as judder). `null` lets go: the cap lifts and adaptive
   * resolution raises again as usual.
   */
  holdResolution(cap: number | null): void {
    this.pixelCap = cap;
    this.adaptive.holdRaises(cap !== null);
    this.resize();
  }

  /** The render scale in use, as a fraction of the tier's full resolution. */
  renderScale(): number {
    return this.manualScale ?? this.tier.renderScale * this.adaptive.scale;
  }

  /**
   * Highest manual render scale: 125% on Ultra when that stays inside Ultra's DPR cap (screens up to
   * 1.6× DPR). On a 2× screen it would render past the screen's own pixels for over twice the GPU time.
   */
  maxManualScale(): number {
    const dpr = window.devicePixelRatio || 1;
    return this.tier.tier === 'ultra' && dpr * 1.25 <= this.tier.maxDpr ? 1.25 : 1;
  }

  /**
   * Sets a manual render scale (0.5 to maxManualScale) and stops adaptive resolution from changing
   * it, or `null` for the automatic scale. Applies at once.
   */
  setRenderScale(scale: number | null): void {
    const next = scale === null ? null : Math.min(this.maxManualScale(), Math.max(0.5, scale));
    if (next === this.manualScale) return;
    this.manualScale = next;
    this.adaptive.lock(next === null ? null : this.adaptive.scale);
    this.resize();
  }

  resize(): void {
    const w = window.innerWidth,
      h = window.innerHeight;
    this.renderer.setPixelRatio(this.pixelRatio());
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.counters.arm();
    this.renderer.setAnimationLoop((now: number) => this.tick(now));
    document.addEventListener('visibilitychange', this.onVisibility);
  }

  stop(): void {
    this.running = false;
    this.renderer.setAnimationLoop(null);
    document.removeEventListener('visibilitychange', this.onVisibility);
  }

  /** A cutscene is on screen and the world isn't being drawn behind it (its systems rest). */
  worldHidden(): boolean {
    return !!this.cutscene && !this.cutscene.drawWorld;
  }

  /** Render one frame immediately (warm-up, screenshots). */
  renderNow(): void {
    this.counters.beginFrame();
    const cut = this.cutscene;
    if (!cut || cut.drawWorld) {
      if (this.renderFn) this.renderFn();
      else this.renderer.render(this.scene, this.camera);
    }
    cut?.render();
    this.counters.endFrame(this.clock.sim);
  }

  /**
   * Draws one frame with time held (freeze-frame probes such as tools/flickertest.mjs, with the loop
   * stopped and the clock paused): frame systems run at the current sim time with a negligible dt, so
   * camera-dependent work (LOD, reflections, sky) follows the camera but nothing animates.
   */
  renderStill(): void {
    world.time.value = this.clock.sim;
    for (const s of this.systems) s.frame?.(1e-6, this.clock.sim);
    this.renderNow();
  }

  private readonly onTimestamps = (ms: number | undefined): void => {
    if (typeof ms !== 'number' || !(ms > 0)) return;
    this.busyReading = ms;
    this.gpuReading = this.busyPool ? this.busyPool.lastSum : ms;
  };

  private readonly onResolved = (): void => {
    this.resolving = false;
  };

  private readonly onVisibility = () => {
    // PLAN §12.8: nothing renders while hidden; resume without a time jump.
    if (document.hidden) {
      this.renderer.setAnimationLoop(null);
      this.adaptive.setPaused(true);
    } else if (this.running) {
      this.last = performance.now();
      this.adaptive.setPaused(false);
      this.renderer.setAnimationLoop((now: number) => this.tick(now));
    }
  };

  private tick(now: number): void {
    const tickStart = performance.now();
    const raw = (now - this.last) / 1000;
    this.last = now;
    this.counters.noteFrameGap(raw * 1000, this.clock.sim);
    const dt = Math.min(raw, 0.1);
    if (raw > 0) this.fps += (1 / raw - this.fps) * 0.05;

    const alpha = this.step.advance(dt, (h) => {
      if (!this.clock.paused) {
        const hidden = this.worldHidden();
        for (const s of this.systems) if (!hidden || s.cutscene) s.fixed?.(h, this.clock.sim + h);
      }
      this.clock.advance(h);
    });
    // Render time runs smoothly between fixed steps (PLAN §12.8): at 120 Hz the 60 Hz simulation
    // clock only moves every other frame, which made everything driven by it judder. The fixed
    // steps still run at 60 Hz; frame systems and shaders see sim time interpolated by `alpha`.
    const renderTime = this.clock.paused ? this.clock.sim : this.clock.sim + alpha * this.step.step;
    world.time.value = renderTime;
    // While a cutscene hides the world, the world's systems rest (they'd only spend the frame).
    const hidden = this.worldHidden();
    for (const s of this.systems) if (!hidden || s.cutscene) s.frame?.(dt, renderTime);
    this.renderNow();
    this.cpuMs = performance.now() - tickStart;

    // Adaptive resolution: GPU time where the backend exposes timestamps, else a vsync-aware
    // frame-time signal (see .plans/issues.md: raising relies on backoff probes without GPU time).
    let signal = raw;
    if (this.timestamps) {
      // Read every few frames: the reading is the latest frame's either way, adaptive resolution
      // averages 60 frames, and each resolve is a readback with its own main-thread cost.
      if (!this.resolving && --this.resolveIn <= 0) {
        this.resolveIn = RESOLVE_EVERY;
        this.resolving = true;
        // The GPU time of the most recent resolved frame (ms): the passes' union on WebGPU.
        void this.renderer.resolveTimestampsAsync('render').then(this.onTimestamps).finally(this.onResolved);
      }
      // A pipelined GPU can't sustain more work than the frame interval, so a reading over it is
      // limited to the wall frame time (the union keeps under it; the sum didn't, issues.md #11).
      this.gpuRawMs = this.gpuReading;
      this.gpuBusyMs = this.busyReading;
      this.gpuMs = limitGpuMs(this.gpuBusyMs, raw * 1000);
      if (this.gpuBusyMs > 0) signal = this.gpuMs / 1000;
    } else {
      const T = 1 / this.tier.targetFps;
      if (Math.abs(raw - T) < T * 0.08) signal = raw * 0.8;
    }
    if (this.adaptive.sample(signal, raw)) this.resize();
  }

  dispose(): void {
    this.stop();
    this.resizeObs?.disconnect();
    this.renderer.dispose();
  }
}
