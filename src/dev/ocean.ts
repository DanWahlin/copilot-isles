import { Mesh, MeshStandardNodeMaterial, PlaneGeometry, Vector3 } from 'three/webgpu';
import { color, mix, positionWorld, smoothstep, vec3 } from 'three/tsl';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createSky } from '../world/sky/sky-system';
import { createOcean } from '../world/ocean/ocean';
import {
  bindSkyPanel,
  compileAndStart,
  createDevHarness,
  engineStats,
  orbitViews,
  showSkyReadouts,
} from './harness';

/** Sea & Sky dev page: the T4 sky + T5 ocean with a test beach, on either backend (?webgl). */
const h = await createDevHarness();
const { q, backend, tier, canvas, renderer, engine } = h;
const { scene, camera, clock } = engine;

const sky = createSky(renderer, scene, tier, backend);
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
const { setCam, setView } = orbitViews(camera, controls, VIEWS, 'deck');
setView(q.get('view') ?? 'deck');

const setTime = bindSkyPanel({ q, clock, invalidate: () => sky.invalidate(), setView });

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
      stats.textContent =
        `${engineStats(h).join('\n')}\n` +
        `scale ${engine.adaptive.scale.toFixed(2)} · ${clock.hours.toFixed(2)}h`;
      showSkyReadouts(clock);
    }
  },
});

await compileAndStart(renderer, engine, scene, camera);

(window as unknown as { __dev: object }).__dev = {
  ready: true,
  setTime,
  setView,
  setCam,
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
