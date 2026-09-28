import {
  Color,
  DirectionalLight,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  Vector3,
} from 'three/webgpu';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createCove } from '../world/cove-scene';
import { COVE } from '../world/layout';
import {
  CHARACTER_BODIES,
  CHARACTER_CLIPS,
  loadCharacterLibrary,
  type Character,
  type CharacterBody,
  type CharacterClip,
} from '../world/characters';
import { compileAndStart, createDevHarness, engineStats, orbitViews } from './harness';

const h = await createDevHarness();
const { q, backend, tier, canvas, renderer, engine } = h;
const { scene, camera, clock } = engine;

const studio = q.has('studio');
const cove = studio ? null : await createCove(engine, { vegetation: q.has('veg') });
clock.set(Number(q.get('time') ?? 16.2), Number(q.get('az') ?? 0));
if (cove) cove.sky.invalidate();
else {
  scene.background = new Color(0x86c8ff);
  const hemi = new HemisphereLight(0xdcefff, 0x7b704c, 2.0);
  const sun = new DirectionalLight(0xffe0ad, 4.0);
  sun.position.set(-4, 7, -5);
  const ground = new Mesh(
    new PlaneGeometry(36, 20),
    new MeshStandardMaterial({ color: 0x8d9365, roughness: 0.84, metalness: 0 }),
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(hemi, sun, ground);
}

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI * 0.495;

const library = await loadCharacterLibrary('/packs/testcove/characters');
const characters: Character[] = [];
const originX = studio ? 0 : COVE.spawn.x - 13;
const originY = studio ? 0 : COVE.quay.height;
const originZ = studio ? 0 : COVE.spawn.z;
const lookPoint = new Vector3(originX + 2, originY + 1.35, originZ - 6);
const spacing = studio ? 1.65 : 3.1;
const columns = 5;
CHARACTER_BODIES.forEach((body: CharacterBody, index) => {
  const character = library.create({ body, variant: index % 4, tier, updateTarget: camera });
  const col = index % columns;
  const row = Math.floor(index / columns);
  const x = originX + col * spacing;
  const z = originZ + row * (studio ? 2.15 : 4.0);
  const y = (cove ? Math.max(COVE.quay.height, cove.terrain.heightField.heightAt(x, z)) : originY) + 0.03;
  character.group.position.set(x, y, z);
  character.group.rotation.y = Math.PI;
  character.lookAt(lookPoint);
  character.play('idle');
  if (index % 3 === 0) character.setTalking(true);
  scene.add(character.group);
  characters.push(character);
});

const VIEWS: Record<string, [number[], number[]]> = {
  lineup: studio
    ? [
        [-2.2, 3.2, -7.2],
        [3.2, 1.25, 1.0],
      ]
    : [
        [COVE.spawn.x - 16, 7.5, COVE.spawn.z - 28],
        [COVE.spawn.x - 7, 3.2, COVE.spawn.z + 2],
      ],
  close: studio
    ? [
        [0.8, 2.35, -3.1],
        [2.3, 1.2, 0.05],
      ]
    : [
        [COVE.spawn.x - 14, 4.2, COVE.spawn.z - 11],
        [COVE.spawn.x - 8, 3.1, COVE.spawn.z - 1],
      ],
  village: [
    [-142, 9, -36],
    [-108, 3.2, -62],
  ],
};
const { setCam, setView } = orbitViews(camera, controls, VIEWS, 'lineup');
setView(q.get('view') ?? 'lineup');

const clipRoot = document.getElementById('clips')!;
for (const clip of CHARACTER_CLIPS) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = clip;
  button.onclick = () => playClip(clip);
  clipRoot.append(button);
}
function playClip(clip: CharacterClip): void {
  if (clip === 'walk' || clip === 'run' || clip === 'idle') {
    characters.forEach((character) => character.play('idle', 0.05));
    setSpeed(clip === 'walk' ? 1.35 : clip === 'run' ? 3.2 : 0);
  } else characters.forEach((character) => character.play(clip));
}

const speedEl = document.getElementById('speed') as HTMLInputElement;
const speedV = document.getElementById('speedV')!;
function setSpeed(speed: number): void {
  speedEl.value = String(speed);
  speedV.textContent = speed.toFixed(1);
  characters.forEach((character) => character.setSpeed(speed));
}
speedEl.oninput = () => setSpeed(Number(speedEl.value));

document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach((button) => {
  button.onclick = () => {
    if (button.dataset.view === 'webgl') {
      const url = new URL(location.href);
      url.searchParams.set('webgl', '1');
      location.href = url.toString();
      return;
    }
    setView(button.dataset.view!);
  };
});

const stats = document.getElementById('stats')!;
let frameCount = 0;
engine.add({
  frame(dt) {
    controls.update();
    for (const character of characters) character.update(dt);
    if (++frameCount % 20 === 0) {
      const [head, draws] = engineStats(h);
      stats.textContent = `${head}\n${characters.length} characters · clips ${library.clips.join(', ')}\n${draws}`;
    }
  },
});

await compileAndStart(renderer, engine, scene, camera);

(window as unknown as { __dev: object }).__dev = {
  ready: true,
  /** The lineup's characters in CHARACTER_BODIES order (man, woman, …), for probes. */
  characters,
  camera,
  setView,
  setCam,
  playClip,
  setSpeed,
  stats: () => ({ ...engine.counters.last, fps: engine.fps, gpuMs: engine.gpuMs, backend, tier: tier.tier }),
};

window.addEventListener('beforeunload', () => {
  for (const character of characters) character.dispose();
  library.dispose();
});
