import {
  AgXToneMapping,
  Color,
  DirectionalLight,
  FogExp2,
  HemisphereLight,
  MathUtils,
  Mesh,
  MeshStandardNodeMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  SphereGeometry,
  Vector2,
  Vector3,
  WebGPURenderer,
  type Node,
} from 'three/webgpu';
import { color, float, mix, positionLocal, sin, vec3 } from 'three/tsl';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { SkyMesh } from 'three/addons/objects/SkyMesh.js';
import { tierSettings } from '../engine/quality';
import { COVE } from '../world/layout';
import { WaveField, wavesForTier } from '../world/ocean/waves';
import { world } from '../world/uniforms';
import { createBrigantine, type Brigantine } from '../world/ship';
import { WIND } from '../world/wind';

interface ShipDevApi {
  ship: Brigantine;
  shot(id: 'bow' | 'broadside' | 'stern' | 'deck'): void;
  stats(): { drawCalls: number; triangles: number; backend: 'webgpu' | 'webgl2' };
}

declare global {
  interface Window {
    __shipDev?: ShipDevApi;
  }
}

const query = new URLSearchParams(location.search);
const backend: 'webgpu' | 'webgl2' = query.has('webgl') ? 'webgl2' : 'webgpu';
const tier = query.get('tier') === 'low' ? 'low' : 'high';
const settings = tierSettings(tier);
const canvas = document.getElementById('gl') as HTMLCanvasElement;
const stats = document.getElementById('stats')!;

const renderer = new WebGPURenderer({
  canvas,
  antialias: true,
  forceWebGL: backend === 'webgl2',
  powerPreference: 'high-performance',
  reversedDepthBuffer: true,
});
renderer.toneMapping = AgXToneMapping;
await renderer.init();

const scene = new Scene();
scene.fog = new FogExp2(new Color(0x8eb2ca), 0.00115);

const camera = new PerspectiveCamera(52, innerWidth / innerHeight, 0.1, 2500);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.maxDistance = 180;
controls.minDistance = 4;

const sun = new DirectionalLight(0xffd6a0, 3.2);
sun.position.set(-150, 72, -190);
scene.add(sun, new HemisphereLight(0x9fc7ff, 0x162315, 0.86));
world.sunDir.value.copy(sun.position).normalize();
world.sunColor.value.set(1, 0.82, 0.56);
world.windDir.value.set(WIND.dirX, WIND.dirZ).normalize();
world.windSpeed.value = WIND.speed;

const sky = new SkyMesh();
sky.scale.setScalar(1200);
sky.sunPosition.value.copy(sun.position).normalize();
sky.turbidity.value = 2.8;
sky.rayleigh.value = 1.5;
sky.mieCoefficient.value = 0.018;
sky.mieDirectionalG.value = 0.76;
sky.cloudCoverage.value = 0.36;
sky.cloudDensity.value = 0.28;
sky.cloudScale.value = 0.44;
scene.add(sky);

function waterMaterial(): MeshStandardNodeMaterial {
  const mat = new MeshStandardNodeMaterial({ color: 0x0c5d75, roughness: 0.32, metalness: 0 });
  let h: Node<'float'> = float(0);
  for (const wave of wavesForTier(settings.waves)) {
    const phase = positionLocal.x
      .mul(wave.dx * wave.k)
      .add(positionLocal.z.mul(wave.dz * wave.k))
      .sub(world.time.mul(wave.w))
      .add(wave.ph);
    h = h.add(sin(phase).mul(wave.a)) as Node<'float'>;
  }
  mat.positionNode = positionLocal.add(vec3(0, h, 0));
  const depthTint = sin(positionLocal.x.mul(0.012).add(positionLocal.z.mul(0.018)))
    .mul(0.5)
    .add(0.5);
  mat.colorNode = mix(color(0x0a4157), color(0x1c8aa0), depthTint.mul(0.34));
  mat.roughnessNode = float(0.22);
  return mat;
}

const water = new Mesh(new PlaneGeometry(1400, 1400, 180, 180).rotateX(-Math.PI / 2), waterMaterial());
water.receiveShadow = true;
scene.add(water);

const ship = createBrigantine({ tier });
ship.dynamics.reset(COVE.mooring.x, COVE.mooring.z, COVE.mooring.heading);
scene.add(ship.group);

const buoyMat = new MeshStandardNodeMaterial({ color: 0xd64d2a, roughness: 0.55 });
for (const buoy of COVE.buoys) {
  const mesh = new Mesh(new SphereGeometry(1.2, 16, 8), buoyMat);
  mesh.position.set(buoy.x, 0.65, buoy.z);
  scene.add(mesh);
}

const waveField = new WaveField(wavesForTier(settings.waves));
const env = {
  waves: waveField,
  ground: null,
  obstacles: COVE.buoys.map((b) => ({ x: b.x, z: b.z, r: 2.2 })),
  t: 0,
};
const keys = new Set<string>();
let trim = 0.75;
let rudder = 0;
let last = performance.now();
const focus = new Vector2();
const camOffset = new Vector3();
const lookTarget = new Vector3();
const upAxis = new Vector3(0, 1, 0);
const shotOffset = new Vector3(-28, 11, 30);
const autopilotPath = [
  { x: COVE.mooring.x, z: COVE.mooring.z },
  ...COVE.buoys,
  { x: COVE.mooring.x + 18, z: COVE.mooring.z - 5 },
];

function frameCamera(immediate = false): void {
  const p = ship.group.position;
  controls.target.set(p.x, p.y + 5.0, p.z);
  camOffset.copy(shotOffset).applyAxisAngle(upAxis, ship.dynamics.pose.heading);
  lookTarget.set(p.x + camOffset.x, p.y + camOffset.y, p.z + camOffset.z);
  if (immediate) camera.position.copy(lookTarget);
  else camera.position.lerp(lookTarget, 0.08);
}

function setShot(id: 'bow' | 'broadside' | 'stern' | 'deck'): void {
  if (id === 'bow') shotOffset.set(-26, 10, 28);
  else if (id === 'broadside') shotOffset.set(38, 13, 10);
  else if (id === 'stern') shotOffset.set(7, 12, -42);
  else shotOffset.set(7.5, 8.5, -13.5);
  frameCamera(true);
  controls.update();
}

addEventListener('keydown', (event) => {
  keys.add(event.code);
  if (event.code === 'KeyP') ship.dynamics.followSpline(autopilotPath);
  if (event.code === 'Digit1') setShot('bow');
  if (event.code === 'Digit2') setShot('broadside');
  if (event.code === 'Digit3') setShot('stern');
  if (event.code === 'Digit4') setShot('deck');
});
addEventListener('keyup', (event) => keys.delete(event.code));

function resize(): void {
  const dpr = Math.min(devicePixelRatio || 1, settings.maxDpr);
  renderer.setPixelRatio(dpr);
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / Math.max(1, innerHeight);
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();
setShot('bow');
canvas.focus();

window.__shipDev = {
  ship,
  shot: setShot,
  stats: () => ({ drawCalls: ship.drawCallCount, triangles: ship.triangleCount, backend }),
};

renderer.setAnimationLoop((now) => {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  world.time.value += dt;
  sky.sunPosition.value.copy(sun.position).normalize();
  if (!ship.dynamics.autopilotComplete) {
    trim = ship.dynamics.control.trim;
    rudder = ship.dynamics.control.rudder;
  } else {
    if (keys.has('KeyW')) trim += dt * 0.38;
    if (keys.has('KeyS')) trim -= dt * 0.55;
    rudder = (keys.has('KeyA') ? 1 : 0) + (keys.has('KeyD') ? -1 : 0);
    trim = MathUtils.clamp(trim, 0, 1);
    ship.dynamics.setInput({ trim, rudder });
  }
  focus.set(ship.dynamics.pose.x, ship.dynamics.pose.z);
  waveField.setFocus(focus.x, focus.y);
  world.focus.value.copy(focus);
  env.t = world.time.value;
  ship.update(dt, world.time.value, env);
  frameCamera();
  controls.update();
  renderer.render(scene, camera);
  stats.textContent = `backend ${backend} · trim ${ship.uniforms.trim.value.toFixed(2)} · rudder ${rudder.toFixed(2)} · speed ${ship.dynamics.pose.speed.toFixed(2)} m/s · luff ${ship.uniforms.luff.value.toFixed(2)} · calls ${ship.drawCallCount} · tris ${ship.triangleCount}`;
});
