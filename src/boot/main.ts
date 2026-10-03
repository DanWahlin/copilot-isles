import { WebGPURenderer } from 'three/webgpu';
import { chooseBackend, detectWebGL2, detectWebGPU, type Backend } from './detect';
import { showFallback } from './fallback';
import { heuristicTier, isPhoneDevice, refineWithBenchmark } from '../engine/capability';
import {
  benchmarkStorageKey,
  readStartupBenchmark,
  runTitleStartupBenchmark,
  writeStartupBenchmark,
} from '../engine/benchmark';
import { installDebug } from '../engine/debug';
import type { Tier } from '../world/contracts';

const stage = (p: number, msg: string) => window.__load?.(p, msg);
const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
const TIER_NAMES: Record<Tier, string> = {
  lite: 'Lite',
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  ultra: 'Ultra',
};

async function boot(): Promise<void> {
  stage(0.05, 'Charting the isles');
  // URL options: ?webgl forces the WebGL2 backend; ?hdr enables HDR output on HDR displays (WebGPU);
  // ?tier= overrides the quality tier; ?forceGpu / ?forceSoftware are test overrides.
  const q = new URLSearchParams(location.search);
  // Always probe WebGPU: even with ?webgl, a device without WebGL2 should still get WebGPU (not the 2D stub).
  const [webgpu, webgl] = [await detectWebGPU(), detectWebGL2()];
  const choice = chooseBackend(webgpu, webgl, {
    preferWebGL: q.has('webgl'),
    force: q.has('forceGpu'),
    forceSoftware: q.has('forceSoftware'),
  });
  if (!choice.backend) return showFallback(choice.reason);
  let backend: Backend = choice.backend;

  const [{ Engine }, { TIERS }, { createPost }, { Input }] = await Promise.all([
    import('../engine/engine'),
    import('../engine/quality'),
    import('../engine/post'),
    import('../engine/input'),
  ]);
  const saved = readQuality();
  const phone = isPhoneDevice(navigator, Math.min(screen.width, screen.height));
  const gpuName = backend === 'webgpu' ? `${webgpu.vendor} ${webgpu.architecture}` : webgl.renderer;
  const heuristic = heuristicTier({
    backend,
    gpu: gpuName,
    isPhone: phone,
    deviceMemory: (navigator as Navigator & { deviceMemory?: number }).deviceMemory,
  });
  const benchmarkKey = benchmarkStorageKey(backend, gpuName);
  const cachedBenchmark = readStartupBenchmark(benchmarkKey);
  const autoTier = cachedBenchmark ? refineWithBenchmark(heuristic, cachedBenchmark.gpuMs, phone) : heuristic;
  const hasTierOverride = q.has('tier') || (saved !== null && saved !== 'auto');
  const tierName = (q.get('tier') as Tier) || (saved && saved !== 'auto' ? saved : autoTier);
  const tier = TIERS[tierName] ?? TIERS.medium;

  const hdr = backend === 'webgpu' && q.has('hdr') && matchMedia('(dynamic-range: high)').matches;
  const canvas = document.getElementById('gl') as HTMLCanvasElement;
  canvas.tabIndex = 0;
  const create = (b: Backend): WebGPURenderer => Engine.createRenderer({ canvas, backend: b, tier, hdr });
  // Consensus E1/E3: if WebGPU device creation fails, retry on the WebGL2 backend, then the 2D stub.
  let renderer = create(backend);
  try {
    await renderer.init();
  } catch (err) {
    if (backend !== 'webgpu' || !(webgl.webgl2 && (webgl.kind === 'hardware' || q.has('forceGpu')))) {
      console.error(err);
      return showFallback(webgl.webgl2 ? 'software' : 'no-webgl2');
    }
    console.warn('WebGPU init failed; retrying on the WebGL2 backend', err);
    renderer.dispose();
    backend = 'webgl2';
    renderer = create(backend);
    await renderer.init();
  }
  // PLAN §14.2: mobile GPUs can drop the device (memory pressure, backgrounding). Phase 0 reloads
  // once; real recovery (recreate device + re-upload packs) is issues.md #5.
  renderer.onDeviceLost = (info: unknown) => {
    console.warn('GPU device lost', info);
    renderer.setAnimationLoop(null);
    if (!q.has('recovered')) {
      const url = new URL(location.href);
      url.searchParams.set('recovered', '1');
      location.replace(url);
    } else {
      stage(1, 'The graphics device was lost. Please reload.');
    }
  };

  const engine = Engine.fromRenderer(renderer, { canvas, backend, tier, hdr });
  stage(0.25, 'Raising the swell');
  const [{ GameFlow }, { mountUi }, { createAudio }, { mountLearn }] = await Promise.all([
    import('../game/flow'),
    import('../ui/mount'),
    import('../audio'),
    import('../ui/learn/LearnLayer'),
    import('../game/hud.css'),
  ]);
  let post = createPost(renderer, engine.scene, engine.camera, tier, { lean: true });
  if (post) engine.renderFn = post.render;
  let richPostReady = false;
  const upgradePost = async () => {
    if (richPostReady) return;
    const rich = createPost(renderer, engine.scene, engine.camera, tier);
    if (!rich) return;
    await renderer.compileAsync(engine.scene, engine.camera);
    const previous = post;
    post = rich;
    engine.renderFn = rich.render;
    engine.renderNow();
    previous?.dispose();
    richPostReady = true;
  };
  const input = new Input(canvas);
  const audio = createAudio();
  const renderInfo = `${backend === 'webgpu' ? 'WebGPU' : 'WebGL2'} · ${TIER_NAMES[tier.tier]}`;
  const flow = new GameFlow({ engine, input, audio, hudParent: document.body, renderInfo, upgradePost });

  stage(0.55, 'Rigging the brigantine');
  flow.showTitle();
  registerServiceWorker();
  stage(0.75, 'Lighting the lighthouses');
  await renderer.compileAsync(engine.scene, engine.camera);
  engine.renderNow();
  await nextFrame();

  if (!hasTierOverride && !cachedBenchmark && !q.has('skipBenchmark')) {
    stage(0.86, 'Testing the trade winds');
    try {
      const sample = await runTitleStartupBenchmark(engine, {
        backend,
        gpu: gpuName,
        heuristicTier: heuristic,
        isPhone: phone,
      });
      writeStartupBenchmark(benchmarkKey, sample);
      if (sample.refinedTier !== tier.tier) {
        console.info(`Benchmark selected ${sample.refinedTier}; applying on next load.`);
      }
    } catch (err) {
      console.warn('Startup benchmark failed', err);
    }
  }

  mountUi(document.getElementById('ui')!, flow);
  mountLearn(
    document.body,
    flow.learn,
    {
      subscribe: (fn) => flow.subscribe(() => fn()),
      get: () => flow.getState().screen === 'playing',
    },
    {
      subscribe: (fn) => flow.subscribe(() => fn()),
      muted: () => flow.getState().settings.muted,
      toggle: () => flow.updateSettings({ muted: !flow.getState().settings.muted }),
    },
  );
  engine.start();
  stage(1, 'Ready');

  installDebug(
    engine.counters,
    canvas,
    () => engine.fps,
    () => flow.getState().screen,
    {
      backend,
      reason: backend === choice.backend ? choice.reason : 'webgpu init failed',
      hdr: hdr && backend === 'webgpu',
      features: webgpu.features,
    },
    { getCpuMs: () => engine.cpuMs },
  );
  if (import.meta.env.DEV || q.has('debug')) (window as unknown as { __flow: unknown }).__flow = flow;

  const loading = document.getElementById('loading');
  void (window.__loadDone?.() ?? Promise.resolve()).then(() => {
    loading?.classList.add('gone');
    setTimeout(() => loading?.remove(), 1000);
  });
}

function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  window.setTimeout(() => {
    void navigator.serviceWorker.register('./sw.js').catch((err: unknown) => {
      console.warn('Service worker registration failed', err);
    });
  }, 0);
}

function readQuality(): string | null {
  try {
    const s = JSON.parse(localStorage.getItem('copilot-isles.settings.v1') ?? 'null') as {
      quality?: string;
    } | null;
    return s?.quality ?? null;
  } catch {
    return null;
  }
}

boot().catch((err) => {
  console.error(err);
  stage(1, 'Something went wrong while loading. Please reload.');
});
