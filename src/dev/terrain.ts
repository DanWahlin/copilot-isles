import {
  AgXToneMapping,
  Color,
  DirectionalLight,
  HemisphereLight,
  Mesh,
  MeshBasicNodeMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  Vector3,
  WebGPURenderer,
} from 'three/webgpu';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { SkyMesh } from 'three/addons/objects/SkyMesh.js';
import { TIERS } from '../engine/quality';
import { createCoastFoam } from '../world/terrain/coast-foam';
import { createDistantRanges } from '../world/terrain/distant-ranges';
import { loadTerrainPack } from '../world/terrain/bake';
import { createTerrain } from '../world/terrain/terrain-mesh';
import { sunState } from '../world/sky/sun';
import { world } from '../world/uniforms';

interface ViewPreset {
  position: [number, number, number];
  target: [number, number, number];
}

interface TerrainStats {
  backend: 'webgpu' | 'webgl2';
  drawCalls: number;
  triangles: number;
  geometries: number;
  textures: number;
}

declare global {
  interface Window {
    __terrainStats?: TerrainStats;
    setTerrainView?: (view: keyof typeof VIEWS) => void;
  }
}

const VIEWS = {
  harbor: { position: [-210, 72, -184], target: [-108, 4, -78] },
  headland: { position: [292, 54, -48], target: [174, 21, 0] },
  lagoon: { position: [-54, 34, 238], target: [16, 0, 104] },
  stack: { position: [356, 58, 286], target: [270, 23, 210] },
} satisfies Record<string, ViewPreset>;

const root = document.getElementById('terrain-root');
if (!root) throw new Error('Missing #terrain-root');
const params = new URLSearchParams(location.search);
const backend = params.has('webgl') ? 'webgl2' : 'webgpu';
const renderer = new WebGPURenderer({
  antialias: true,
  forceWebGL: backend === 'webgl2',
  powerPreference: 'high-performance',
});
renderer.toneMapping = AgXToneMapping;
renderer.info.autoReset = false;
root.append(renderer.domElement);
await renderer.init();

const scene = new Scene();
scene.background = new Color(0x9bbbd0);
const camera = new PerspectiveCamera(54, 1, 0.2, 9000);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.maxDistance = 900;
controls.minDistance = 8;

const sun = sunState(16.5, -22);
world.sunDir.value.set(sun.sun[0], sun.sun[1], sun.sun[2]);
world.sunColor.value.set(1.0, 0.76, 0.48);
world.skyColor.value.set(0.55, 0.72, 0.9);
world.hazeColor.value.set(0.78, 0.73, 0.64);
world.night.value = sun.night;

const sky = new SkyMesh();
sky.scale.setScalar(7000);
sky.sunPosition.value.set(sun.sun[0], sun.sun[1], sun.sun[2]).multiplyScalar(1000);
sky.turbidity.value = 3.2;
sky.rayleigh.value = 1.35;
sky.mieCoefficient.value = 0.006;
sky.mieDirectionalG.value = 0.74;
scene.add(sky);

const key = new DirectionalLight(0xffc887, 3.2);
key.position.set(sun.sun[0], sun.sun[1], sun.sun[2]).multiplyScalar(600);
scene.add(key, new HemisphereLight(0xa9cfff, 0x2b241b, 0.62));

const data = await loadTerrainPack('/packs/testcove/terrain');
const terrain = createTerrain({ tier: TIERS.high, data });
scene.add(terrain.group);
scene.add(createCoastFoam(data, terrain.heightField));
scene.add(createDistantRanges(TIERS.high));

const water = new Mesh(
  new PlaneGeometry(1800, 1800, 1, 1).rotateX(-Math.PI / 2),
  new MeshBasicNodeMaterial({ color: 0x1688ad, transparent: true, opacity: 0.42, depthWrite: false }),
);
water.name = 'dev-water-plane';
water.renderOrder = 10;
scene.add(water);

function setView(name: keyof typeof VIEWS): void {
  const view = VIEWS[name];
  camera.position.set(...view.position);
  controls.target.set(...view.target);
  controls.update();
}

window.setTerrainView = setView;
for (const button of document.querySelectorAll<HTMLButtonElement>('#hud button[data-view]')) {
  button.addEventListener('click', () => setView(button.dataset.view as keyof typeof VIEWS));
}
setView((params.get('view') as keyof typeof VIEWS | null) ?? 'harbor');

function resize(): void {
  const width = window.innerWidth;
  const height = window.innerHeight;
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
  renderer.setSize(width, height, false);
  camera.aspect = width / Math.max(1, height);
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

document.body.classList.add('ready');
const stats = document.getElementById('stats');
const clockStart = performance.now();
const tmp = new Vector3();

function frame(): void {
  renderer.info.reset();
  const t = (performance.now() - clockStart) / 1000;
  world.time.value = t;
  controls.update();
  tmp.copy(camera.position);
  world.focus.value.set(tmp.x, tmp.z);
  terrain.update(camera);
  renderer.render(scene, camera);
  const info = renderer.info;
  window.__terrainStats = {
    backend,
    drawCalls: info.render.drawCalls,
    triangles: info.render.triangles,
    geometries: info.memory.geometries,
    textures: info.memory.textures,
  };
  if (stats) {
    stats.textContent = `${backend} · draws ${info.render.drawCalls} · tris ${info.render.triangles.toLocaleString()} · geom ${info.memory.geometries}`;
  }
}

renderer.setAnimationLoop(frame);
