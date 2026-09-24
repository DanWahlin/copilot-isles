import { ACESFilmicToneMapping, AgXToneMapping, NeutralToneMapping, type WebGPURenderer } from 'three/webgpu';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Engine } from '../engine/engine';
import { createPost } from '../engine/post';
import { TIERS } from '../engine/quality';
import type { Tier } from '../world/contracts';
import { createCove } from '../world/cove-scene';
import { MERIDIAN } from '../world/islands/meridian';
import { world } from '../world/uniforms';
import { ANCHORAGE_SLUICE, flow, openings, solutionPath } from '../world/sites/sluice-logic';

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
  'anchorage-quay-to-meridian': [
    [-112, 6, -69],
    [MERIDIAN.pads.citadel.x, MERIDIAN.pads.citadel.height + 22, MERIDIAN.pads.citadel.z],
  ],
  'meridian-harbor': [
    [570, 24, -610],
    [700, 10, -735],
  ],
  'meridian-town': [
    [610, 82, -610],
    [855, 32, -875],
  ],
  'meridian-citadel': [
    [890, 105, -855],
    [1028, 64, -1002],
  ],
  'meridian-ridge': [
    [910, 118, -780],
    [1110, 92, -1078],
  ],
};
function setView(name: string) {
  const v = VIEWS[name] ?? VIEWS.harbor;
  camera.position.set(v[0][0], v[0][1], v[0][2]);
  controls.target.set(v[1][0], v[1][1], v[1][2]);
  controls.update();
}

const SHOTS: Record<string, { view?: string; time: number; camera?: [number[], number[]] }> = {
  F1: {
    view: 'harbor',
    time: 16.5,
    camera: [
      [-96, 5.2, -69],
      [-118, 3, -92],
    ],
  },
  F2: {
    time: 16.5,
    camera: [
      [-96, 8, -132],
      [-96, 3, -108],
    ],
  },
  B1: {
    view: 'lagoon',
    time: 16.5,
    camera: [
      [-46, 6.5, 205],
      [30, 1.2, 116],
    ],
  },
  B2: {
    view: 'headland',
    time: 16.5,
    camera: [
      [292, 20, -18],
      [158, 24, 0],
    ],
  },
};
function shot(id: string) {
  const s = SHOTS[id];
  if (!s) return false;
  setTime(s.time);
  if (s.camera) {
    camera.position.set(s.camera[0][0], s.camera[0][1], s.camera[0][2]);
    controls.target.set(s.camera[1][0], s.camera[1][1], s.camera[1][2]);
    controls.update();
  } else if (s.view) setView(s.view);
  return true;
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
      cove.mirror?.finalizeFrame(c.drawCalls, c.triangles);
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

(window as unknown as { __dev: object }).__dev = {
  ready: true,
  setTime,
  setView,
  shot,
  setCam: (p: number[], t: number[]) => {
    camera.position.set(p[0], p[1], p[2]);
    controls.target.set(t[0], t[1], t[2]);
    controls.update();
  },
  /** Poses the P0.1 mill race: 'dry' (start tiles, gate shut), 'gate' (start tiles, gate open), or 'solved'. */
  mill: (mode: 'dry' | 'gate' | 'solved' = 'solved') => {
    const L = ANCHORAGE_SLUICE;
    const rots = L.tiles.map((t) => (mode === 'solved' ? t.solution : t.start));
    const gate = mode !== 'dry';
    const m = cove.sites.mill;
    rots.forEach((r, i) => m.setRotation(i, r, true));
    m.setLever(gate, true);
    const f = flow(L, rots, gate, 2.4);
    m.setWater(
      f.cells.map((c, i) => ({ ...c, mask: openings(L.tiles[i]!.kind, rots[i]!) })),
      gate,
      f.solved,
    );
    return { solved: f.solved, path: solutionPath(L) };
  },
  stats: () => {
    cove.mirror?.finalizeFrame(engine.counters.last.drawCalls, engine.counters.last.triangles);
    return {
      ...engine.counters.last,
      fps: engine.fps,
      gpuMs: engine.gpuMs,
      cpuMs: engine.cpuMs,
      backend,
      tier: tier.tier,
      buildMs,
      compileMs,
      mirror: cove.mirror?.stats ?? null,
    };
  },
};
