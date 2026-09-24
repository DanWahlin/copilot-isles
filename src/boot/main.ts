import { WebGLRenderer, SRGBColorSpace } from 'three';
import { detectGpu } from './detect';
import { showFallback } from './fallback';
import { FixedStep } from '../engine/fixed-step';
import { FrameCounters } from '../engine/frame-counters';
import { installDebug } from '../engine/debug';

const stage = (p: number, msg: string) => window.__load?.(p, msg);
const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

async function boot(): Promise<void> {
  stage(0.05, 'Charting the isles');
  // Test overrides: ?forceGpu lets CI (software-rendered Chromium) exercise the 3D path;
  // ?forceSoftware exercises the fallback path on a real GPU.
  const q = new URLSearchParams(location.search);
  const gpu = detectGpu();
  if (!gpu.webgl2) return showFallback('no-webgl2');
  if (q.has('forceSoftware') || (gpu.kind === 'software' && !q.has('forceGpu')))
    return showFallback('software');

  const canvas = document.getElementById('gl') as HTMLCanvasElement;
  const renderer = new WebGLRenderer({
    canvas,
    antialias: false,
    powerPreference: 'high-performance',
    stencil: false,
  });
  renderer.outputColorSpace = SRGBColorSpace;
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
