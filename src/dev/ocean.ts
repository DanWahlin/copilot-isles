import {
  AgXToneMapping,
  Mesh,
  MeshStandardNodeMaterial,
  PlaneGeometry,
  Vector3,
  type WebGPURenderer,
} from 'three/webgpu';
import { color, mix, positionWorld, smoothstep, vec3 } from 'three/tsl';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Engine } from '../engine/engine';
import { TIERS } from '../engine/quality';
import type { Tier } from '../world/contracts';
import { createSky } from '../world/sky/sky-system';
import { createOcean } from '../world/ocean/ocean';
import { world } from '../world/uniforms';

/** Sea & Sky dev page: the T4 sky + T5 ocean with a test beach, on either backend (?webgl). */
const q = new URLSearchParams(location.search);
const backend = q.has('webgl') ? 'webgl2' : 'webgpu';
const tier = TIERS[(q.get('tier') as Tier) ?? 'high'] ?? TIERS.high;
const canvas = document.getElementById('gl') as HTMLCanvasElement;
const renderer: WebGPURenderer = Engine.createRenderer({ canvas, backend, tier });
renderer.toneMapping = AgXToneMapping;
await renderer.init();
const engine = Engine.fromRenderer(renderer, { canvas, backend, tier });
const { scene, camera, clock } = engine;

const sky = createSky(renderer, scene, tier);
const ocean = createOcean({ tier, env: sky.env });
scene.add(ocean.mesh);
if (q.has('nofog')) scene.fogNode = null;
if (q.has('noshadow')) sky.sun.castShadow = false;

// Test beach: a sand ramp from −14 m to +3 m so shallows, absorption, and contact foam are visible.
const beachGeo = new PlaneGeometry(260, 260, 128, 128).rotateX(-Math.PI / 2);
const pos = beachGeo.attributes.position;
for (let i = 0; i < pos.count; i++) {
  const x = pos.getX(i),
    z = pos.getZ(i);
  const d = Math.hypot(x, z);
  const y = 3.2 - d * 0.085 + Math.sin(x * 0.07) * 0.5 + Math.cos(z * 0.05) * 0.4;
  pos.setY(i, Math.max(-14, y));
}
beachGeo.computeVertexNormals();
const sand = new MeshStandardNodeMaterial({ roughness: 0.95 });
sand.colorNode = mix(color(0xa99673), color(0xcdbd9c), smoothstep(-1.5, 1.5, positionWorld.y)).mul(
  mix(vec3(0.8), vec3(1), smoothstep(-8, 0, positionWorld.y)),
);
const beach = new Mesh(
  beachGeo,
  q.has('red') ? new MeshStandardNodeMaterial({ color: 0xff2020, roughness: 0.9 }) : sand,
);
beach.position.set(0, 0, 0);
beach.receiveShadow = true;
scene.add(beach);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI * 0.495;

const VIEWS: Record<string, [number[], number[]]> = {
  deck: [
    [-150, 6, 60],
    [-40, 1, 0],
  ],
  shore: [
    [-120, 9, -30],
    [-70, 0, -10],
  ],
  aerial: [
    [-320, 150, 240],
    [0, 0, 0],
  ],
  horizon: [
    [-400, 3, 0],
    [-1400, 30, 0],
  ],
  glint: [
    [-200, 12, 200],
    [-600, 0, 900],
  ],
};
function setView(name: string) {
  const v = VIEWS[name] ?? VIEWS.deck;
  camera.position.set(v[0][0], v[0][1], v[0][2]);
  controls.target.set(v[1][0], v[1][1], v[1][2]);
  controls.update();
}
setView(q.get('view') ?? 'deck');

const timeEl = document.getElementById('time') as HTMLInputElement;
const azEl = document.getElementById('az') as HTMLInputElement;
const windEl = document.getElementById('wind') as HTMLInputElement;
const setTime = (h: number, az = clock.azimuth) => {
  clock.set(h, az);
  timeEl.value = String(h);
  azEl.value = String(az);
  sky.invalidate();
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

const focus = new Vector3();
const stats = document.getElementById('stats')!;
let n = 0;
engine.add({
  frame() {
    controls.update();
    ocean.update(camera);
    focus.set(camera.position.x, 0, camera.position.z);
    sky.update(clock, focus);
    if (++n % 20 === 0) {
      const c = engine.counters.last;
      stats.textContent =
        `${backend} · ${tier.tier} · ${engine.fps.toFixed(0)} fps · gpu ${engine.gpuMs.toFixed(2)} ms\n` +
        `draws ${c.drawCalls} · programs ${c.programs} · tris ${(c.triangles / 1000).toFixed(0)}k\n` +
        `scale ${engine.adaptive.scale.toFixed(2)} · ${clock.hours.toFixed(2)}h`;
      document.getElementById('timeV')!.textContent = clock.hours.toFixed(1);
      document.getElementById('azV')!.textContent = String(clock.azimuth);
      document.getElementById('windV')!.textContent = world.windSpeed.value.toFixed(1);
    }
  },
});

await renderer.compileAsync(scene, camera);
engine.start();

declare global {
  interface Window {
    __dev?: {
      ready: boolean;
      setTime(h: number, az?: number): void;
      setView(v: string): void;
      setCam(p: number[], t: number[]): void;
      stats(): unknown;
    };
  }
}
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
    sunI: sky.sun.intensity,
    sunPos: sky.sun.position.toArray(),
    sunCol: sky.sun.color.toArray(),
    tgt: sky.sun.target.position.toArray(),
    hemi: sky.hemi.intensity,
    exposure: renderer.toneMappingExposure,
    ...engine.counters.last,
    fps: engine.fps,
    gpuMs: engine.gpuMs,
    backend,
    tier: tier.tier,
  }),
};
