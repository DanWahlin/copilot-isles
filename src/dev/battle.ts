import { MathUtils, Vector3 } from 'three/webgpu';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createAudio } from '../audio';
import { createPost } from '../engine/post';
import { BATTLE_SOUNDS, createBattleAudio } from '../game/battle-audio';
import { BattleHud } from '../game/battle-hud';
import { Helm } from '../game/helm';
import { QUIZZES } from '../learn/content';
import type { ChoiceQuiz } from '../learn/types';
import { Battle, type BattleSnapshot } from '../world/battle/battle';
import { createOcean } from '../world/ocean/ocean';
import { createBrigantine } from '../world/ship';
import { createSky } from '../world/sky/sky-system';
import { world } from '../world/uniforms';
import { compileAndStart, createDevHarness, engineStats } from './harness';

/**
 * Sea-battle prototype (docs/specs/BATTLES.md §11): open water, your brigantine, one passage battle.
 * W/S trim, A/D steer, Space fires what bears, Z/C fire port/starboard, drag to look.
 * Flags: ?webgl, ?tier=, ?seed=, ?calm, ?shot (no stats panel), ?wait (don't start the battle).
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
const battle = new Battle({
  tier,
  waves: ocean.field,
  player: ship,
  seed: Number(q.get('seed') ?? 0xba771e),
  onCaption: (text) => hud.caption(text),
  onSound: createBattleAudio(audio, listener),
});
scene.add(battle.group);
if (q.has('calm')) battle.setCalm(true);
hud.setQuiz((QUIZZES.get('T0.5') as ChoiceQuiz | undefined) ?? null);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.maxDistance = 260;
controls.minDistance = 10;
controls.maxPolarAngle = Math.PI * 0.47;

const helm = new Helm();
helm.trim = 0.6;
const keys = new Set<string>();
addEventListener('keydown', (e) => {
  keys.add(e.code);
  if (e.repeat) return;
  if (e.code === 'Space') battle.fire('bearing');
  if (e.code === 'KeyZ') battle.fire('port');
  if (e.code === 'KeyC') battle.fire('starboard');
});
addEventListener('keyup', (e) => keys.delete(e.code));

const env = { waves: ocean.field, ground: null, obstacles: battle.playerObstacles, t: 0 };
const follow = new Vector3();
const camFocus = new Vector3();
const lookDir = new Vector3();
/** Where the camera looks, in the ship's frame (x to port, z to the bow), so shots can frame a raider. */
const look = { x: 0, y: 3, z: 0 };
const lastShip = new Vector3();
const snap: BattleSnapshot = {
  phase: 'idle',
  wave: 0,
  waves: 0,
  hull: 1,
  raidersLeft: 0,
  raidersTotal: 0,
  bears: [false, false],
  breakOffs: 0,
  calm: false,
  doubleShot: false,
  stores: { timber: 0, powder: 0 },
  lull: 0,
};
let clockT = 0;
let hudAt = 0;
let frozenHelm = false;
const stats = document.getElementById('hud')!;

// Start behind and above the ship, looking past it.
camera.position.set(-38, 26, -34);
controls.target.set(0, 3, 0);
controls.update();
lastShip.set(0, 0, 0);

engine.add({
  frame(dt, t) {
    clockT = t;
    if (!frozenHelm) {
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
    // The camera rides along with the ship; you orbit it with the mouse.
    follow.set(p.x, 0, p.z);
    camera.position.x += follow.x - lastShip.x;
    camera.position.z += follow.z - lastShip.z;
    const sh = Math.sin(p.heading);
    const ch = Math.cos(p.heading);
    controls.target.set(p.x + look.x * ch + look.z * sh, look.y, p.z - look.x * sh + look.z * ch);
    lastShip.copy(follow);
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
      hud.show(snap.phase !== 'idle' && snap.phase !== 'skipped');
      hud.update(snap, battle);
      const [a, b] = engineStats(harness);
      stats.textContent = `${a}\n${b}\nspeed ${p.speed.toFixed(1)} · trim ${helm.trim.toFixed(2)}`;
    }
  },
});

const post = q.has('nopost') ? null : await createPost(renderer, scene, camera, tier);
if (post) engine.renderFn = post.render;
await compileAndStart(renderer, engine, scene, camera, post ? () => post.compile() : undefined);
if (!q.has('wait')) battle.start(clockT);

const dev = window as unknown as { __battle: Record<string, unknown>; __dev: Record<string, unknown> };
dev.__battle = {
  ready: true,
  battle,
  ship,
  snapshot: () => battle.snapshot(structuredClone(snap)),
  raiders: () => battle.raiders(),
  start: () => battle.start(clockT),
  audio,
  unlockAudio: unlock,
  fire: (which: 'bearing' | 'port' | 'starboard' = 'bearing') => battle.fire(which),
  stats: () => ({ ...engine.counters.last, fps: engine.fps, gpuMs: engine.gpuMs, backend, tier: tier.tier }),
  /** Holds the helm still (screenshots). */
  freezeHelm: (trim = 0.5, rudder = 0) => {
    frozenHelm = true;
    helm.trim = trim;
    helm.rudder = rudder;
    ship.dynamics.setInput({ trim, rudder });
  },
  /** Camera offset from the ship (world axes) and the look height. */
  setCam: (offset: number[], lookY = 3) => {
    const p = ship.dynamics.pose;
    look.x = look.z = 0;
    look.y = lookY;
    camera.position.set(p.x + offset[0]!, offset[1]!, p.z + offset[2]!);
    controls.target.set(p.x, lookY, p.z);
    controls.update();
  },
  /** Camera offset in the ship's own frame: x to port, z toward the bow. */
  setShipCam: (offset: number[], lookY = 3, at: number[] = [0, 0]) => {
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
