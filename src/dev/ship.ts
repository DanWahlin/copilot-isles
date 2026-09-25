import { MathUtils, Mesh, MeshStandardNodeMaterial, SphereGeometry, Vector2, Vector3 } from 'three/webgpu';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { COVE } from '../world/layout';
import { createOcean } from '../world/ocean/ocean';
import { createSky } from '../world/sky/sky-system';
import { createBrigantine, type Brigantine } from '../world/ship';
import { compileAndStart, createDevHarness } from './harness';

interface ShipDevApi {
  ship: Brigantine;
  shot(id: 'bow' | 'broadside' | 'stern' | 'deck'): void;
  setTrim(value: number): void;
  stats(): { drawCalls: number; triangles: number; backend: 'webgpu' | 'webgl2' };
}

declare global {
  interface Window {
    __shipDev?: ShipDevApi;
  }
}

const { q: query, backend, tier, canvas, renderer, engine } = await createDevHarness();
const stats = document.getElementById('stats')!;

const { scene, camera, clock } = engine;
clock.set(Number(query.get('time') ?? 16.5), Number(query.get('az') ?? 0));

const sky = createSky(renderer, scene, tier);
const ocean = createOcean({ tier, env: sky.env });
scene.add(ocean.mesh);

const ship = createBrigantine({ tier: tier.tier });
ship.dynamics.reset(COVE.mooring.x, COVE.mooring.z, COVE.mooring.heading);
ship.group.position.set(COVE.mooring.x, 0, COVE.mooring.z);
ship.group.rotation.set(0, COVE.mooring.heading, 0, 'YXZ');
scene.add(ship.group);

const buoyMat = new MeshStandardNodeMaterial({ color: 0xd64d2a, roughness: 0.55 });
for (const buoy of COVE.buoys) {
  const mesh = new Mesh(new SphereGeometry(1.2, 16, 8), buoyMat);
  mesh.position.set(buoy.x, 0.65, buoy.z);
  scene.add(mesh);
}

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.maxDistance = 180;
controls.minDistance = 4;

const env = {
  waves: ocean.field,
  ground: null,
  obstacles: COVE.buoys.map((b) => ({ x: b.x, z: b.z, r: 2.2 })),
  t: 0,
};
const keys = new Set<string>();
let trim = 0.75;
let rudder = 0;
const camOffset = new Vector3();
const lookTarget = new Vector3();
const focus = new Vector3();
const waterFocus = new Vector2();
const upAxis = new Vector3(0, 1, 0);
const shotOffset = new Vector3(-28, 11, 30);
let manualCamera = false;
const autopilotPath = [
  { x: COVE.mooring.x, z: COVE.mooring.z },
  { x: COVE.mooring.x, z: COVE.mooring.z - 18 },
  { x: COVE.mooring.x + 14, z: COVE.mooring.z - 42 },
  COVE.buoys[0],
  COVE.buoys[1],
  { x: COVE.buoys[1].x + 80, z: COVE.buoys[1].z - 60 },
];

function frameCamera(immediate = false): void {
  if (manualCamera) return;
  const p = ship.group.position;
  controls.target.set(p.x, p.y + 5.0, p.z);
  camOffset.copy(shotOffset).applyAxisAngle(upAxis, ship.dynamics.pose.heading);
  lookTarget.set(p.x + camOffset.x, p.y + camOffset.y, p.z + camOffset.z);
  if (immediate) camera.position.copy(lookTarget);
  else camera.position.lerp(lookTarget, 0.08);
}

function setShot(id: 'bow' | 'broadside' | 'stern' | 'deck'): void {
  manualCamera = false;
  if (id === 'bow') shotOffset.set(-26, 10, 28);
  else if (id === 'broadside') shotOffset.set(34, 6.5, 0);
  else if (id === 'stern') shotOffset.set(0, 8.5, -30);
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

function updateControls(dt: number): void {
  if (!ship.dynamics.autopilotComplete) {
    trim = ship.dynamics.control.trim;
    rudder = ship.dynamics.control.rudder;
    return;
  }
  if (keys.has('KeyW')) trim += dt * 0.38;
  if (keys.has('KeyS')) trim -= dt * 0.55;
  rudder = (keys.has('KeyA') ? 1 : 0) + (keys.has('KeyD') ? -1 : 0);
  trim = MathUtils.clamp(trim, 0, 1);
  ship.dynamics.setInput({ trim, rudder });
}

setShot('bow');
canvas.focus();
window.__shipDev = {
  ship,
  shot: setShot,
  setTrim: (value) => {
    trim = MathUtils.clamp(value, 0, 1);
    ship.dynamics.setInput({ trim, rudder });
  },
  stats: () => ({ drawCalls: ship.drawCallCount, triangles: ship.triangleCount, backend }),
};
(window as unknown as { __dev: object }).__dev = {
  ready: true,
  ship,
  camera,
  controls,
  setShotOffset(offset: [number, number, number]) {
    manualCamera = false;
    shotOffset.set(offset[0], offset[1], offset[2]);
    frameCamera(true);
    controls.update();
  },
  setManualCamera(position: [number, number, number], target: [number, number, number]) {
    manualCamera = true;
    camera.position.set(position[0], position[1], position[2]);
    controls.target.set(target[0], target[1], target[2]);
    controls.update();
  },
  stats: window.__shipDev.stats,
};

let n = 0;
engine.add({
  frame(dt, t) {
    updateControls(dt);
    waterFocus.set(ship.dynamics.pose.x, ship.dynamics.pose.z);
    ocean.field.setFocus(waterFocus.x, waterFocus.y);
    env.t = t;
    ship.update(dt, t, env);
    frameCamera();
    controls.update();
    ocean.update(camera);
    focus.set(camera.position.x, 0, camera.position.z);
    sky.update(clock, focus);
    if (++n % 20 === 0) {
      stats.textContent = `backend ${backend} · trim ${ship.uniforms.trim.value.toFixed(2)} · rudder ${rudder.toFixed(2)} · speed ${ship.dynamics.pose.speed.toFixed(2)} m/s · luff ${ship.uniforms.luff.value.toFixed(2)} · calls ${ship.drawCallCount} · tris ${ship.triangleCount}`;
    }
  },
});

await compileAndStart(renderer, engine, scene, camera);
