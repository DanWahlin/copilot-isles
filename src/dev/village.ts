import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createCove } from '../world/cove-scene';
import { createVillage } from '../world/village';
import {
  bindSkyPanel,
  compileAndStart,
  createDevHarness,
  engineStats,
  orbitViews,
  showSkyReadouts,
} from './harness';

/** Anchorage Cay village dev page: Test Cove plus the procedural harbor village (?webgl, ?tier=, ?view=). */
const h = await createDevHarness();
const { q, backend, tier, canvas, renderer, engine } = h;
const { scene, camera, clock } = engine;

const t0 = performance.now();
const cove = await createCove(engine, { vegetation: !q.has('noveg') });
const village = await createVillage({ tier, heightField: cove.terrain.heightField });
scene.add(village.group);
const buildMs = performance.now() - t0;

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI * 0.495;

const VIEWS: Record<string, [number[], number[]]> = {
  quay: [
    [-87, 7.5, -86],
    [-119, 4.2, -63],
  ],
  street: [
    [-151, 8.5, -76],
    [-121, 3.8, -49],
  ],
  plaza: [
    [-140, 12, -71],
    [-116, 3.5, -45],
  ],
  pier: [
    [-96, 6.5, -107],
    [-108, 3.0, -83],
  ],
  'from-the-harbor': [
    [-61, 10.5, -132],
    [-116, 5.0, -59],
  ],
  aerial: [
    [-164, 92, -139],
    [-115, 3.4, -55],
  ],
};
const { setCam, setView } = orbitViews(camera, controls, VIEWS, 'quay');
setView(q.get('view') ?? 'quay');

const setTime = bindSkyPanel({ q, clock, invalidate: () => cove.sky.invalidate(), setView });

const stats = document.getElementById('stats')!;
let n = 0;
engine.add({
  frame(dt, t) {
    controls.update();
    village.update(dt, t, camera);
    if (++n % 20 === 0) {
      stats.textContent =
        `${engineStats(h).join('\n')}\n` +
        `village ${village.metrics.drawCalls} draws · ${(village.metrics.triangles / 1000).toFixed(1)}k tris\n` +
        `scale ${engine.adaptive.scale.toFixed(2)} · ${clock.hours.toFixed(2)}h · build ${buildMs.toFixed(0)} ms`;
      showSkyReadouts(clock);
    }
  },
});

const compileMs = await compileAndStart(renderer, engine, scene, camera);

(window as unknown as { __dev: object }).__dev = {
  ready: true,
  setTime,
  setView,
  setCam,
  stats: () => ({
    ...engine.counters.last,
    fps: engine.fps,
    gpuMs: engine.gpuMs,
    backend,
    tier: tier.tier,
    buildMs,
    compileMs,
    village: village.metrics,
    anchors: village.anchors,
  }),
};
