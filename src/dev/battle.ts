import { MathUtils, Vector3 } from 'three/webgpu';
import { createAudio } from '../audio';
import { createPost } from '../engine/post';
import { BATTLE_SOUNDS, createBattleAudio } from '../game/battle-audio';
import { BattleCamera } from '../game/battle-camera';
import { BattleHud } from '../game/battle-hud';
import { Helm } from '../game/helm';
import { QUIZZES } from '../learn/content';
import type { ChoiceQuiz } from '../learn/types';
import { BATTLE_PLANS, Battle, emptyBattleSnapshot } from '../world/battle/battle';
import { createOcean } from '../world/ocean/ocean';
import { createBrigantine } from '../world/ship';
import { createSky } from '../world/sky/sky-system';
import { world } from '../world/uniforms';
import { compileAndStart, createDevHarness, engineStats, seaOrbitControls } from './harness';
import { activateCourse } from '../course/load';

// The course pack the page's content comes from (a voyage loads it the same way).
await activateCourse();

/**
 * Sea-battle prototype (docs/specs/BATTLES.md §11): open water, your brigantine, one passage battle.
 * W/S trim, A/D steer, Space fires what bears, Z/C fire port/starboard, R "Bring her round" (your
 * helmsman steers to the best broadside; any helm key takes it back), drag to look.
 * Flags: ?webgl, ?tier=, ?seed=, ?calm, ?shot (no stats panel), ?wait (don't start the battle),
 * ?nodirector (no camera director), ?nofollow (the camera doesn't follow the raiders),
 * ?brief / ?nobrief (always / never show the pre-battle briefing), ?battle=2 (the Chapter 01 battle), ?battle=3 (Chapter 02).
 */
const harness = await createDevHarness();
const { q, backend, tier, canvas, renderer, engine } = harness;
const { scene, camera, clock } = engine;
clock.set(Number(q.get('time') ?? 15.5), Number(q.get('az') ?? 0));
if (q.has('rm')) world.reducedMotion.value = 1;

const sky = createSky(renderer, scene, tier, backend);
const ocean = createOcean({ tier, env: sky.env });
scene.add(ocean.mesh);

const ship = createBrigantine({ tier: tier.tier });
ship.setName('Wanderer');
ship.dynamics.reset(0, 0, 0.9);
scene.add(ship.group);

const hud = new BattleHud(document.body, {
  fire: (which) => battle.fire(which),
  skip: () => battle.skip(clockT),
  answer: (pick) => battle.answer(pick),
  calm: (on) => battle.setCalm(on),
  assist: (on) => battle.setAssist(on),
});
// Sound starts on the first key or click (browsers need a gesture).
const audio = createAudio();
const listener = { x: 0, y: 0, z: 0 };
const listenerFwd = { x: 0, y: 0, z: -1 };
let audioOn = false;
const unlock = () => {
  if (audioOn) return;
  audioOn = true;
  void audio.unlock().then(() => audio.sfx.preload(BATTLE_SOUNDS));
};
addEventListener('pointerdown', unlock);
addEventListener('keydown', unlock);
const director = new BattleCamera(() => world.reducedMotion.value > 0.5);
if (q.has('nodirector')) director.enabled = false;
if (q.has('nofollow')) director.follow = false;
// ?battle=2 plays battle 2 (the Chapter 01 recap), ?battle=3 battle 3 (Chapter 02); battle 1 is the default.
const plan = BATTLE_PLANS[Math.min(BATTLE_PLANS.length, Math.max(1, Number(q.get('battle') ?? 1))) - 1]!;
const quizFor = (wave: number) =>
  (QUIZZES.get(plan.waves[wave]?.quiz ?? '') as ChoiceQuiz | undefined) ?? null;
let quizWave = -1;
const battle = new Battle({
  plan: plan.waves,
  tier,
  waves: ocean.field,
  player: ship,
  seed: Number(q.get('seed') ?? 0xba771e),
  onCaption: (text) => hud.caption(text),
  onSound: createBattleAudio(audio, listener),
  onBeat: (beat, x, z) => director.beat(beat, x, z),
});
scene.add(battle.group);
if (q.has('calm')) battle.setCalm(true);
hud.setWonText(plan.won);

// Low enough for the director's sea-level shots; it keeps the camera 3 m above the water.
const controls = seaOrbitControls(camera, canvas);
controls.maxDistance = 260;
controls.minDistance = 10;
// Drag or zoom and the director stands off.
controls.addEventListener('start', () => director.yieldToUser());

const HELM_KEYS = new Set([
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
]);
const focusAt = { x: 0, z: 0 };
const helm = new Helm();
helm.trim = 0.6;
const keys = new Set<string>();
addEventListener('keydown', (e) => {
  keys.add(e.code);
  if (e.repeat) return;
  if (e.code === 'Space') battle.fire('bearing');
  if (e.code === 'KeyZ') battle.fire('port');
  if (e.code === 'KeyC') battle.fire('starboard');
  if (e.code === 'KeyR') battle.setAssist(!battle.assist);
  // Any helm key takes the helm back from your helmsman.
  if (battle.assist && HELM_KEYS.has(e.code)) battle.setAssist(false);
});
addEventListener('keyup', (e) => keys.delete(e.code));

const env = { waves: ocean.field, ground: null, obstacles: battle.playerObstacles, t: 0 };
const camFocus = new Vector3();
const lookDir = new Vector3();
/** Where the camera looks, in the ship's frame (x to port, z to the bow), so shots can frame a raider. */
const look = { x: 0, y: 3, z: 0 };
const snap = emptyBattleSnapshot();
/** A ship the camera rides with (dev shots): index (0 yours), offset in its frame (x port, z bow), look height. */
const track = { i: -1, x: 0, y: 0, z: 0, lookY: 6 };
let clockT = 0;
let musicInBattle = false;
let hudAt = 0;
let frozenHelm = false;
const stats = document.getElementById('hud')!;

// Start astern and a little above the ship, looking past it.
camera.position.set(-24, 11, -27);
controls.target.set(0, 3, 0);
controls.update();

engine.add({
  frame(dt, t) {
    clockT = t;
    if (battle.assist && !frozenHelm) {
      // Your helmsman has her: the helm follows, so taking it back doesn't jerk the rudder.
      helm.trim = battle.assistHelm.trim;
      helm.rudder = battle.assistHelm.rudder;
      ship.dynamics.setInput(battle.assistHelm);
    } else if (!frozenHelm) {
      const x =
        (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) -
        (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
      const y =
        (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) -
        (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
      helm.update(dt, x, y, ship.dynamics);
    }
    const p = ship.dynamics.pose;
    ocean.field.setFocus(p.x, p.z);
    env.t = t;
    ship.update(dt, t, env);
    battle.update(dt, t);
    // The camera rides along with the ship and the director frames the battle's beats; you orbit it
    // with the mouse.
    director.setFocus(battle.focus(focusAt), focusAt.x, focusAt.z);
    director.update(dt, t, p.x, p.z, p.heading, look, camera.position, controls.target);
    if (track.i >= 0) {
      const tp = battle.ships()[track.i]!.dynamics.pose;
      const s = Math.sin(tp.heading);
      const c = Math.cos(tp.heading);
      camera.position.set(tp.x + track.x * c + track.z * s, track.y, tp.z - track.x * s + track.z * c);
      controls.target.set(tp.x, track.lookY, tp.z);
    }
    controls.update();
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
    if (t - hudAt > 0.1) {
      hudAt = t;
      battle.snapshot(snap);
      // Each wave has its own question (the habit that wave stands for).
      if (snap.wave !== quizWave) {
        quizWave = snap.wave;
        hud.setQuiz(quizFor(snap.wave));
      }
      hud.show(snap.phase !== 'idle' && snap.phase !== 'skipped');
      hud.update(snap, battle);
      // "Brass of the Storm" from the briefing to the win; the open-sea track before and after.
      const inBattle =
        hud.briefingOpen || (snap.phase !== 'idle' && snap.phase !== 'won' && snap.phase !== 'skipped');
      if (inBattle !== musicInBattle) {
        musicInBattle = inBattle;
        audio.music.setIsland(inBattle ? 'battle' : 'harbour');
      }
      const [a, b] = engineStats(harness);
      stats.textContent = `${a}\n${b}\nspeed ${p.speed.toFixed(1)} · trim ${helm.trim.toFixed(2)}`;
    }
  },
});

const post = q.has('nopost') ? null : await createPost(renderer, scene, camera, tier);
if (post) engine.renderFn = post.render;
await compileAndStart(renderer, engine, scene, camera, post ? () => post.compile() : undefined);
/** The briefing shows before every battle until you tick "Don't show this again" (?brief forces it). */
const BRIEF_KEY = 'isles.battleBriefing.hidden';
const startBattle = () => {
  if (q.has('nobrief') || (!q.has('brief') && localStorage.getItem(BRIEF_KEY) === '1')) {
    battle.start(clockT);
    return;
  }
  hud.showBriefing((hide) => {
    if (hide) localStorage.setItem(BRIEF_KEY, '1');
    battle.start(clockT);
  });
};
if (!q.has('wait')) startBattle();

const dev = window as unknown as { __battle: Record<string, unknown>; __dev: Record<string, unknown> };
dev.__battle = {
  ready: true,
  battle,
  ship,
  snapshot: () => battle.snapshot(structuredClone(snap)),
  raiders: () => battle.raiders(),
  start: () => battle.start(clockT),
  /** Starts the battle through the briefing, as the game will. */
  brief: () => startBattle(),
  audio,
  director,
  unlockAudio: unlock,
  fire: (which: 'bearing' | 'port' | 'starboard' = 'bearing') => battle.fire(which),
  stats: () => ({
    ...engine.counters.last,
    fps: engine.fps,
    gpuMs: engine.gpuMs,
    gpuRawMs: engine.gpuRawMs,
    backend,
    tier: tier.tier,
  }),
  /** Holds the helm still (screenshots). */
  freezeHelm: (trim = 0.5, rudder = 0) => {
    frozenHelm = true;
    helm.trim = trim;
    helm.rudder = rudder;
    ship.dynamics.setInput({ trim, rudder });
  },
  /** Camera offset from the ship (world axes) and the look height. */
  setCam: (offset: number[], lookY = 3) => {
    director.yieldToUser();
    const p = ship.dynamics.pose;
    look.x = look.z = 0;
    look.y = lookY;
    camera.position.set(p.x + offset[0]!, offset[1]!, p.z + offset[2]!);
    controls.target.set(p.x, lookY, p.z);
    controls.update();
  },
  /** Camera offset in the ship's own frame: x to port, z toward the bow. */
  setShipCam: (offset: number[], lookY = 3, at: number[] = [0, 0]) => {
    director.yieldToUser();
    const p = ship.dynamics.pose;
    const s = Math.sin(p.heading);
    const c = Math.cos(p.heading);
    look.x = at[0]!;
    look.y = lookY;
    look.z = at[1]!;
    camera.position.set(
      p.x + offset[0]! * c + offset[2]! * s,
      offset[1]!,
      p.z - offset[0]! * s + offset[2]! * c,
    );
    controls.target.set(p.x + look.x * c + look.z * s, lookY, p.z - look.x * s + look.z * c);
    controls.update();
  },
  /** Rides the camera with ship `i` (0 yours, 1… raiders) at `offset` in its frame; `i` −1 stops. */
  trackShip: (i: number, offset: number[] = [30, 8, 10], lookY = 6) => {
    director.yieldToUser();
    track.i = i;
    track.x = offset[0]!;
    track.y = offset[1]!;
    track.z = offset[2]!;
    track.lookY = lookY;
  },
  /** Moves raider `i` to `range` m off your `side` (1 port, −1 starboard), heading `rel` from yours. */
  placeRaider: (i: number, side: number, range: number, along = 0, rel = 0) => {
    const r = battle.raiders()[i];
    if (!r) return;
    const p = ship.dynamics.pose;
    const s = Math.sin(p.heading);
    const c = Math.cos(p.heading);
    const x = p.x + side * range * c + along * s;
    const z = p.z - side * range * s + along * c;
    const raider = battle.ships()[i + 1]!;
    raider.dynamics.reset(x, z, MathUtils.euclideanModulo(p.heading + rel, Math.PI * 2));
  },
};
dev.__dev = { ready: true, stats: dev.__battle.stats };
