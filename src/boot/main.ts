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
  const [webgpu, webgl] = [q.has('webgl') ? null : await detectWebGPU(), detectWebGL2()];
  const choice = chooseBackend(
    webgpu ?? { available: false, kind: 'none', vendor: '', architecture: '', features: [] },
    webgl,
    {
      preferWebGL: q.has('webgl'),
      force: q.has('forceGpu'),
      forceSoftware: q.has('forceSoftware'),
    },
  );
  if (!choice.backend) return showFallback(choice.reason);
  const backend: Backend = choice.backend;

  const hdr = backend === 'webgpu' && q.has('hdr') && matchMedia('(dynamic-range: high)').matches;
  const canvas = document.getElementById('gl') as HTMLCanvasElement;
  const renderer = new WebGPURenderer({
    canvas,
    antialias: false,
    powerPreference: 'high-performance',
    forceWebGL: backend === 'webgl2',
    reversedDepthBuffer: true,
    ...(hdr ? { outputType: HalfFloatType } : {}),
  });
  await renderer.init();
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
    { backend, reason: choice.reason, hdr, features: webgpu?.features ?? [] },
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
