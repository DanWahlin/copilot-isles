import { ACESFilmicToneMapping, HalfFloatType, PerspectiveCamera, Scene, WebGPURenderer } from 'three/webgpu';
import type { Backend } from '../world/contracts';
import { world } from '../world/uniforms';
import { AdaptiveResolution } from './adaptive-res';
import { DayClock } from './day-clock';
import { FixedStep } from './fixed-step';
import { FrameCounters } from './frame-counters';
import type { TierSettings } from './quality';

/** Anything the engine ticks. `fixed` runs at 60 Hz (physics); `frame` once per rendered frame. */
export interface System {
  fixed?(h: number, t: number): void;
  frame?(dt: number, t: number): void;
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
  gpuMs = 0;
  cpuMs = 0;
  /** Overrides the default scene render (e.g. the post-processing pipeline). */
  renderFn: (() => void) | null = null;
  /**
   * A cutscene drawn in place of the world (the opening's cabin, while the island streams in behind
   * it). With `drawWorld` set, the world renders first too, so its uploads happen off screen.
   */
  cutscene: { render(): void; drawWorld: boolean } | null = null;

  private readonly systems: System[] = [];
  private readonly step = new FixedStep(1 / 60);
  private last = 0;
  private running = false;
  private timestamps = false;
  private resolving = false;
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
    // ACES gives the quality-slice look: soft sun roll-off and warm highlights without AgX's
    // heavy desaturation of the saturated sails and chibi character palettes.
    renderer.toneMapping = ACESFilmicToneMapping;
    const backend = (renderer.backend as { trackTimestamp?: boolean }) ?? {};
    e.timestamps = backend.trackTimestamp === true;
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

  /** Effective pixel ratio: device DPR capped per tier × tier base scale × adaptive scale. */
  pixelRatio(): number {
    const dpr = Math.min(window.devicePixelRatio || 1, this.tier.maxDpr);
    return dpr * this.tier.renderScale * this.adaptive.scale;
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
    const dt = Math.min(raw, 0.1);
    if (raw > 0) this.fps += (1 / raw - this.fps) * 0.05;

    const alpha = this.step.advance(dt, (h) => {
      if (!this.clock.paused) {
        for (const s of this.systems) s.fixed?.(h, this.clock.sim + h);
      }
      this.clock.advance(h);
    });
    // Render time runs smoothly between fixed steps (PLAN §12.8): at 120 Hz the 60 Hz simulation
    // clock only moves every other frame, which made everything driven by it judder. The fixed
    // steps still run at 60 Hz; frame systems and shaders see sim time interpolated by `alpha`.
    const renderTime = this.clock.paused ? this.clock.sim : this.clock.sim + alpha * this.step.step;
    world.time.value = renderTime;
    for (const s of this.systems) s.frame?.(dt, renderTime);
    this.renderNow();
    this.cpuMs = performance.now() - tickStart;

    // Adaptive resolution: GPU time where the backend exposes timestamps, else a vsync-aware
    // frame-time signal (see .plans/issues.md: raising relies on backoff probes without GPU time).
    let signal = raw;
    if (this.timestamps) {
      if (!this.resolving) {
        this.resolving = true;
        // three returns the GPU duration of the most recent resolved frame (ms).
        void this.renderer
          .resolveTimestampsAsync('render')
          .then((ms) => {
            if (typeof ms === 'number' && ms > 0) this.gpuMs = ms;
          })
          .finally(() => (this.resolving = false));
      }
      // A pipelined GPU can't sustain more work than the frame interval, so clamp implausible
      // readings (tile GPUs report pass wall time; issues.md #11) to the wall frame time.
      if (this.gpuMs > 0) signal = Math.min(this.gpuMs / 1000, raw);
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
