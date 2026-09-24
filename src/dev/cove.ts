import { ACESFilmicToneMapping, AgXToneMapping, NeutralToneMapping, type WebGPURenderer } from 'three/webgpu';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Engine } from '../engine/engine';
import { createPost } from '../engine/post';
import { TIERS } from '../engine/quality';
import type { Tier } from '../world/contracts';
import { createCove } from '../world/cove-scene';
import { world } from '../world/uniforms';

/** Test Cove dev page: every world module together under the shared sky (?webgl, ?tier=, ?tm=). */
const q = new URLSearchParams(location.search);
const backend = q.has('webgl') ? 'webgl2' : 'webgpu';
const tier = TIERS[(q.get('tier') as Tier) ?? 'high'] ?? TIERS.high;
const canvas = document.getElementById('gl') as HTMLCanvasElement;
const renderer: WebGPURenderer = Engine.createRenderer({ canvas, backend, tier });
const TM = { agx: AgXToneMapping, neutral: NeutralToneMapping, aces: ACESFilmicToneMapping } as const;
await renderer.init();
const engine = Engine.fromRenderer(renderer, { canvas, backend, tier });
if (q.has('tm')) renderer.toneMapping = TM[q.get('tm') as keyof typeof TM] ?? renderer.toneMapping;
const { scene, camera, clock } = engine;
const t0 = performance.now();
const cove = await createCove(engine, { vegetation: !q.has('noveg') });
const buildMs = performance.now() - t0;
if (q.has('env')) scene.environmentIntensity = Number(q.get('env'));
const post = q.has('nopost') ? null : createPost(renderer, scene, camera, tier);
if (post) engine.renderFn = post.render;

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI * 0.495;

// [camera, target]
const VIEWS: Record<string, [number[], number[]]> = {
  harbor: [
    [-40, 14, -150],
    [-112, 3, -80],
  ],
  village: [
    [-150, 9, -10],
    [-112, 5, -50],
  ],
  lagoon: [
    [-40, 7, 215],
    [30, 1, 120],
  ],
  headland: [
    [300, 30, -30],
    [160, 25, -5],
  ],
  stack: [
    [330, 12, 290],
    [270, 18, 210],
  ],
  approach: [
    [-330, 10, -330],
    [-100, 8, -80],
  ],
  aerial: [
    [-420, 260, 380],
    [0, 0, 0],
  ],
};
function setView(name: string) {
  const v = VIEWS[name] ?? VIEWS.harbor;
  camera.position.set(v[0][0], v[0][1], v[0][2]);
  controls.target.set(v[1][0], v[1][1], v[1][2]);
  controls.update();
}
setView(q.get('view') ?? 'harbor');

const timeEl = document.getElementById('time') as HTMLInputElement;
const azEl = document.getElementById('az') as HTMLInputElement;
const windEl = document.getElementById('wind') as HTMLInputElement;
const setTime = (h: number, az = clock.azimuth) => {
  clock.set(h, az);
  timeEl.value = String(h);
  azEl.value = String(az);
  cove.sky.invalidate();
};
setTime(Number(q.get('time') ?? 16.5), Number(q.get('az') ?? 0));
windEl.value = String(world.windSpeed.value);
timeEl.oninput = () => setTime(Number(timeEl.value));
azEl.oninput = () => setTime(clock.hours, Number(azEl.value));
windEl.oninput = () => (world.windSpeed.value = Number(windEl.value));
document
  .querySelectorAll<HTMLButtonElement>('[data-view]')
  .forEach((b) => (b.onclick = () => setView(b.dataset.view!)));
document
  .querySelectorAll<HTMLButtonElement>('[data-time]')
  .forEach((b) => (b.onclick = () => setTime(Number(b.dataset.time))));
if (q.has('shot')) document.body.classList.add('shot');

const stats = document.getElementById('stats')!;
let n = 0;
engine.add({
  frame() {
    controls.update();
    if (++n % 20 === 0) {
      const c = engine.counters.last;
      stats.textContent =
        `${backend} · ${tier.tier} · ${engine.fps.toFixed(0)} fps · gpu ${engine.gpuMs.toFixed(2)} ms\n` +
        `draws ${c.drawCalls} · programs ${c.programs} · tris ${(c.triangles / 1000).toFixed(0)}k\n` +
        `scale ${engine.adaptive.scale.toFixed(2)} · ${clock.hours.toFixed(2)}h · build ${buildMs.toFixed(0)} ms`;
      document.getElementById('timeV')!.textContent = clock.hours.toFixed(1);
      document.getElementById('azV')!.textContent = String(clock.azimuth);
      document.getElementById('windV')!.textContent = world.windSpeed.value.toFixed(1);
    }
  },
});

const tc = performance.now();
await renderer.compileAsync(scene, camera);
const compileMs = performance.now() - tc;
engine.start();

window.__dev = {
  ready: true,
  setTime,
  setView,
  setCam: (p, t) => {
    camera.position.set(p[0], p[1], p[2]);
    controls.target.set(t[0], t[1], t[2]);
    controls.update();
  },
  stats: () => ({
    ...engine.counters.last,
    fps: engine.fps,
    gpuMs: engine.gpuMs,
    backend,
    tier: tier.tier,
    buildMs,
    compileMs,
  }),
};
