import { HalfFloatType, WebGPURenderer } from 'three/webgpu';
import { chooseBackend, detectWebGL2, detectWebGPU, type Backend } from './detect';
import { showFallback } from './fallback';
import { FixedStep } from '../engine/fixed-step';
import { FrameCounters } from '../engine/frame-counters';
import { installDebug } from '../engine/debug';

const stage = (p: number, msg: string) => window.__load?.(p, msg);
const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

async function boot(): Promise<void> {
  stage(0.05, 'Charting the isles');
  // URL options: ?webgl forces the WebGL2 backend; ?hdr enables HDR output on HDR displays (WebGPU);
  // ?forceGpu / ?forceSoftware are test overrides (CI's Chromium renders in software).
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

  const hdr = backend === 'webgpu' && q.has('hdr') && matchMedia('(dynamic-range: high)').matches;
  const canvas = document.getElementById('gl') as HTMLCanvasElement;
  const create = (b: Backend) =>
    new WebGPURenderer({
      canvas,
      antialias: false,
      powerPreference: 'high-performance',
      forceWebGL: b === 'webgl2',
      reversedDepthBuffer: true,
      ...(hdr && b === 'webgpu' ? { outputType: HalfFloatType } : {}),
    });
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
  // PLAN §14.2: mobile GPUs can drop the device (memory pressure, backgrounding). Phase 0 scaffold
  // reloads once; T2 replaces this with recreate-device + re-upload of resident packs.
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
  const counters = new FrameCounters(renderer);

  stage(0.25, 'Raising the swell');
  const [{ createTitleScene }, { mountUi }] = await Promise.all([
    import('../title/title-scene'),
    import('../ui/mount'),
  ]);
  const title = createTitleScene(renderer);

  const resize = () => {
    const w = window.innerWidth,
      h = window.innerHeight;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h, false);
    title.resize(w, h);
  };
  resize();
  window.addEventListener('resize', resize);

  stage(0.7, 'Lighting the lighthouses');
  await renderer.compileAsync(title.scene, title.camera);
  renderer.render(title.scene, title.camera);
  await nextFrame();

  mountUi(document.getElementById('ui')!);
  stage(1, 'Ready');

  const step = new FixedStep(1 / 60);
  let simTime = 0,
    last = performance.now(),
    fps = 60;
  installDebug(
    counters,
    canvas,
    () => fps,
    () => 'title',
    {
      backend,
      reason: backend === choice.backend ? choice.reason : 'webgpu init failed',
      hdr: hdr && backend === 'webgpu',
      features: webgpu.features,
    },
  );
  counters.arm();

  const loop = (now: number) => {
    const dt = (now - last) / 1000;
    last = now;
    if (dt > 0) fps += (1 / dt - fps) * 0.05;
    step.advance(dt, (h) => (simTime += h));
    counters.beginFrame();
    title.update(simTime);
    renderer.render(title.scene, title.camera);
    counters.endFrame(simTime);
  };
  renderer.setAnimationLoop(loop);

  // PLAN §12.8: nothing renders while the tab is hidden; resume without a time jump.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      renderer.setAnimationLoop(null);
    } else {
      last = performance.now();
      renderer.setAnimationLoop(loop);
    }
  });

  const loading = document.getElementById('loading');
  loading?.classList.add('gone');
  setTimeout(() => loading?.remove(), 900);
}

boot().catch((err) => {
  console.error(err);
  stage(1, 'Something went wrong while loading. Please reload.');
});
