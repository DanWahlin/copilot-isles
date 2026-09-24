import {
  ACESFilmicToneMapping,
  Color,
  AgXToneMapping,
  DirectionalLight,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  NeutralToneMapping,
  PlaneGeometry,
  Vector3,
  type WebGPURenderer,
} from 'three/webgpu';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Engine } from '../engine/engine';
import { TIERS } from '../engine/quality';
import type { Tier } from '../world/contracts';
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
  character.play(index % 3 === 0 ? 'talk' : 'idle');
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
function setCam(pos: number[], target: number[]): void {
  camera.position.set(pos[0], pos[1], pos[2]);
  controls.target.set(target[0], target[1], target[2]);
  controls.update();
}
function setView(name: string): void {
  const view = VIEWS[name] ?? VIEWS.lineup;
  setCam(view[0], view[1]);
}
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
  if (clip === 'walk') setSpeed(1.35);
  else if (clip === 'run') setSpeed(3.2);
  else if (clip === 'idle') setSpeed(0);
  else characters.forEach((character) => character.play(clip));
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
if (q.has('shot')) document.body.classList.add('shot');

const stats = document.getElementById('stats')!;
let frameCount = 0;
engine.add({
  frame(dt) {
    controls.update();
    for (const character of characters) character.update(dt);
    if (++frameCount % 20 === 0) {
      const counters = engine.counters.last;
      stats.textContent =
        `${backend} · ${tier.tier} · ${engine.fps.toFixed(0)} fps · gpu ${engine.gpuMs.toFixed(2)} ms\n` +
        `${characters.length} characters · clips ${library.clips.join(', ')}\n` +
        `draws ${counters.drawCalls} · programs ${counters.programs} · tris ${(counters.triangles / 1000).toFixed(0)}k`;
    }
  },
});

await renderer.compileAsync(scene, camera);
engine.start();

(window as unknown as { __dev: object }).__dev = {
  ready: true,
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
