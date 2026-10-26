import { Vector3, type Object3D } from 'three/webgpu';
import { createAudio } from '../audio';
import { createPost } from '../engine/post';
import { compileProgressively, warmProgressively } from '../engine/warm';
import { BATTLE_SOUNDS, createBattleAudio } from '../game/battle-audio';
import { createOcean } from '../world/ocean/ocean';
import { skipSunShadows, skipSunShadowsWhereOff } from '../world/sky/cached-sun-shadow';
import { createSky } from '../world/sky/sky-system';
import { world } from '../world/uniforms';
import { compileAndStart, createDevHarness, engineStats, seaOrbitControls } from './harness';

/**
 * Kraken prototype (devpages/kraken.html): a raider on open water, the kraken rising beside her,
 * coiling round her hull and foremast, squeezing her until she breaks, and going back under. A
 * second mode shows distant sightings (tentacles far off, as ambient sea life).
 * Keys: Space play/pause, . step, R restart, M reduced motion, 1/2/3 Lite/Medium/High, B backend,
 * S sightings mode, K a sighting now. Flags: ?webgl, ?tier=, ?rm, ?shot, ?wait (don't start),
 * ?time= (hour), ?mode=sightings, ?nomusic.
 */
const harness = await createDevHarness();
const { q, backend, tier, canvas, renderer, engine } = harness;
const { scene, camera, clock } = engine;
clock.set(Number(q.get('time') ?? 16.4), Number(q.get('az') ?? 35));
world.reducedMotion.value = q.has('rm') ? 1 : 0;

const sky = createSky(renderer, scene, tier, backend);
const ocean = createOcean({ tier, env: sky.env });
scene.add(ocean.mesh);

const audio = createAudio();
const listener = { x: 0, y: 0, z: 0 };
const listenerFwd = { x: 0, y: 0, z: -1 };
const onSound = createBattleAudio(audio, listener);
let audioOn = false;
const unlock = () => {
  if (audioOn) return;
  audioOn = true;
  void audio.unlock().then(() => {
    void audio.sfx.preload(BATTLE_SOUNDS);
    if (!q.has('nomusic')) audio.music.setIsland('battle');
  });
};
addEventListener('pointerdown', unlock);
addEventListener('keydown', unlock);

// The kraken loads with this page only (a dynamic import: never in the game's chunks).
const { KrakenScene } = await import('../world/kraken/kraken-scene');
const kscene = await KrakenScene.create({ tier, waves: ocean.field, onSound });
kscene.reducedMotion = q.has('rm');
scene.add(kscene.group);
// The raider draws like the battle's: no sun-shadow shaders of its own.
if (tier.shadowCascades > 0) skipSunShadows(kscene.ship.group);

const controls = seaOrbitControls(camera, canvas);
controls.maxDistance = 400;
controls.minDistance = 4;
let director = true;
controls.addEventListener('start', () => (director = false));

/** Scripted shots per beat: camera and target, relative to where the ship is (she faces +z, the kraken is on +x). */
const SHOTS: Record<string, readonly [number[], number[]]> = {
  calm: [
    [-34, 9, 30],
    [4, 4, 0],
  ],
  rise: [
    [-30, 8, 36],
    [9, 5, 0],
  ],
  reach: [
    [-28, 13, 32],
    [6, 7, 0],
  ],
  coil: [
    [-21, 10, 25],
    [3, 4, 0],
  ],
  squeeze: [
    [-16, 7, 19],
    [2, 3, 0],
  ],
  break: [
    [-28, 12, 28],
    [3, 2, 0],
  ],
  apart: [
    [-34, 11, 26],
    [4, 1, 0],
  ],
  sink: [
    [-36, 8, 18],
    [6, 0, 0],
  ],
  retreat: [
    [-30, 9, 30],
    [13, 3, 0],
  ],
  done: [
    [-34, 9, 30],
    [8, 3, 0],
  ],
};
const camGoal = new Vector3();
const lookGoal = new Vector3();
const shipAt = new Vector3();
const camFocus = new Vector3();
const lookDir = new Vector3();
let snapCamera = true;

let playing = !q.has('wait');
let stepOnce = 0;
let ready = false;
let hudAt = 0;
const hud = document.getElementById('hud')!;

engine.add({
  frame(dt, t) {
    const run = ready && (playing || stepOnce > 0);
    const step = run ? (stepOnce > 0 ? stepOnce : dt) : 0;
    if (stepOnce > 0) clock.sim += stepOnce;
    stepOnce = 0;
    ocean.field.setFocus(0, 0);
    kscene.update(step, t, camera);
    if (director) {
      const [p, l] = SHOTS[kscene.phase()]!;
      kscene.shipPosition(shipAt);
      camGoal.set(shipAt.x + p[0]!, p[1]!, shipAt.z + p[2]!);
      lookGoal.set(shipAt.x + l[0]!, l[1]!, shipAt.z + l[2]!);
      const k = snapCamera ? 1 : 1 - Math.exp(-dt * 0.9);
      snapCamera = false;
      camera.position.lerp(camGoal, k);
      controls.target.lerp(lookGoal, k);
    }
    controls.update();
    if (kscene.shake > 0) {
      // A shudder through the camera as she breaks (none with reduced motion).
      const s = kscene.shake;
      camera.position.x += Math.sin(t * 61) * s * 0.4;
      camera.position.y += Math.sin(t * 47 + 1) * s * 0.3;
    }
    ocean.update(camera);
    listener.x = camera.position.x;
    listener.y = camera.position.y;
    listener.z = camera.position.z;
    camera.getWorldDirection(lookDir);
    listenerFwd.x = lookDir.x;
    listenerFwd.y = lookDir.y;
    listenerFwd.z = lookDir.z;
    audio.sfx.setListener(listener, listenerFwd);
    audio.update(dt);
    camFocus.set(camera.position.x, 0, camera.position.z);
    sky.update(clock, camFocus, dt, camera);
    if (t - hudAt > 0.15) {
      hudAt = t;
      const [a, b] = engineStats(harness);
      hud.textContent = `${a}\n${b}\n${kscene.phase()} · ${kscene.time.toFixed(1)} / ${kscene.duration} s${
        kscene.reducedMotion ? ' · reduced motion' : ''
      }${playing ? '' : ' · paused'}`;
    }
  },
});

const post = q.has('nopost') ? null : await createPost(renderer, scene, camera, tier);
if (post) engine.renderFn = post.render;
await compileAndStart(renderer, engine, scene, camera, post ? () => post.compile() : undefined);

/**
 * Warms what shows later (the kraken under the water, the pieces, splinters and splashes) like the
 * game's late warm: pipelines for the scene pass first, then one real draw of each, so nothing
 * builds a shader or uploads mid-scene (the hitch guard stays empty).
 */
async function warm(): Promise<void> {
  const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
  const roots = [kscene.group];
  const restore = kscene.stageWarm();
  if (sky.sun.castShadow) skipSunShadowsWhereOff(kscene.group);
  try {
    const compile = (obj: Object3D) =>
      post ? post.compileObject(obj) : renderer.compileAsync(obj, camera, scene);
    await compileProgressively(kscene.group, compile, nextFrame, 3);
    const endShadowWarm = sky.shadowWarm(roots);
    try {
      await warmProgressively(roots, nextFrame, {
        targetMs: 3,
        startBatch: 2,
        frameCost: () => engine.cpuMs,
        solo: (obj) => !!(obj as { isInstancedMesh?: boolean }).isInstancedMesh,
      });
    } finally {
      endShadowWarm();
    }
  } finally {
    restore();
  }
}
await engine.counters.excuse(warm());
// Two settled frames after the warm's uploads, then the scene starts.
await new Promise((r) => setTimeout(r, 200));
ready = true;
kscene.restart();
snapCamera = true;

// ---- Controls ---------------------------------------------------------------------------------
const playBtn = document.getElementById('play') as HTMLButtonElement;
const rmBtn = document.getElementById('rm') as HTMLButtonElement;
const setPlaying = (on: boolean) => {
  playing = on;
  // Paused, the whole sea holds still (stills and stepping).
  clock.paused = !on;
  playBtn.textContent = on ? 'Pause' : 'Play';
};
setPlaying(playing);
const restart = () => {
  kscene.restart();
  director = true;
  snapCamera = true;
  setPlaying(true);
};
const setReduced = (on: boolean) => {
  kscene.reducedMotion = on;
  world.reducedMotion.value = on ? 1 : 0;
  rmBtn.setAttribute('aria-pressed', String(on));
  restart();
};
rmBtn.setAttribute('aria-pressed', String(kscene.reducedMotion));
const reload = (key: string, value: string | null) => {
  const u = new URL(location.href);
  if (value === null) u.searchParams.delete(key);
  else u.searchParams.set(key, value);
  location.href = u.toString();
};
playBtn.onclick = () => setPlaying(!playing);
(document.getElementById('step') as HTMLButtonElement).onclick = () => {
  setPlaying(false);
  stepOnce = 1 / 30;
};
(document.getElementById('restart') as HTMLButtonElement).onclick = restart;
rmBtn.onclick = () => setReduced(!kscene.reducedMotion);
document.querySelectorAll<HTMLButtonElement>('[data-tier]').forEach((b) => {
  b.setAttribute('aria-pressed', String(b.dataset.tier === tier.tier));
  b.onclick = () => reload('tier', b.dataset.tier!);
});
const backendBtn = document.getElementById('backend') as HTMLButtonElement;
backendBtn.textContent = backend === 'webgpu' ? 'WebGL2' : 'WebGPU';
backendBtn.onclick = () => reload('webgl', backend === 'webgpu' ? '' : null);
addEventListener('keydown', (e) => {
  if (e.repeat) return;
  if (e.code === 'Space') setPlaying(!playing);
  else if (e.code === 'Period') {
    setPlaying(false);
    stepOnce = 1 / 30;
  } else if (e.code === 'KeyR') restart();
  else if (e.code === 'KeyM') setReduced(!kscene.reducedMotion);
  else if (e.code === 'Digit1') reload('tier', 'lite');
  else if (e.code === 'Digit2') reload('tier', 'medium');
  else if (e.code === 'Digit3') reload('tier', 'high');
  else if (e.code === 'KeyB') backendBtn.click();
});

const dev = window as unknown as Record<string, unknown>;
const stats = () => ({
  ...engine.counters.last,
  fps: engine.fps,
  backend,
  tier: tier.tier,
  phase: kscene.phase(),
  time: kscene.time,
});
dev.__kraken = {
  ready: true,
  scene: kscene,
  stats,
  play: () => setPlaying(true),
  pause: () => setPlaying(false),
  restart,
  reduced: setReduced,
  /** Runs the scene to `time` (s) in 1/30 s steps without drawing, then pauses there. */
  seek: (time: number) => {
    kscene.restart();
    setPlaying(false);
    while (kscene.time < time) kscene.update(1 / 30, clock.sim, camera);
  },
  director: (on: boolean) => (director = on),
  setCam: (p: number[], target: number[]) => {
    director = false;
    camera.position.set(p[0]!, p[1]!, p[2]!);
    controls.target.set(target[0]!, target[1]!, target[2]!);
    controls.update();
  },
  hitches: () => engine.counters.hitches.slice(),
  unlockAudio: unlock,
};
dev.__isles = {
  hitches: () => engine.counters.hitches.slice(),
  stalls: () => engine.counters.stalls.slice(),
};
dev.__dev = { ready: true, stats };
