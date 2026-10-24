import { AMBIENT_BEDS, createAudio } from '../audio';
import { Input } from '../engine/input';
import { createPost } from '../engine/post';
import { createSession, type GameSession } from '../game/session';
import { warmIsland, warmLate, warmWorld } from '../game/island-warm';
import { installDebug } from '../engine/debug';
import '../game/hud.css';
import { loadCharacterLibrary, type PlayerBody } from '../world/characters';
import { createCove } from '../world/cove-scene';
import { skipSunShadowsWhereOff, type CachedSunShadowNode } from '../world/sky/cached-sun-shadow';
import { QUIZZES } from '../learn/content/index';
import type { Answer } from '../learn/grade';
import { Progress } from '../learn/progress';
import { LearnStore } from '../learn/store';
import { mountLearn } from '../ui/learn/LearnLayer';
import '../ui/ui.css';
import { compileAndStart, createDevHarness } from './harness';
import { activateCourse } from '../course/load';
import { COURSE } from '../course/catalog';
import { isSeaStateId, seaState, type SeaStateId } from '../world/ocean/sea-state';
const COURSE_ID = () => COURSE.id;

// The course pack the page's content comes from (a voyage loads it the same way): `?pack=<id>`
// (`?course=` already pins the course's commit). Like a voyage, the page waits for the core and
// Anchorage's chapter part only, and the other parts load as their islands stream in; `?allparts`
// loads every part first.
const PAGE_Q = new URLSearchParams(location.search);
const PACK = PAGE_Q.get('pack') ?? undefined;
await activateCourse(PACK, PAGE_Q.has('allparts') ? {} : { islands: ['anchorage'] });

/**
 * Test Cove play page (Phase 0 T11): walk the harbor, talk to Nell, board the brigantine, sail,
 * and dock. ?webgl, ?tier=, ?noveg, ?body=man|woman, ?auto (skip the start card), ?shot, ?time=,
 * ?nolearn (plain dialogue, no quizzes/chests), ?keep (keep learning progress in localStorage),
 * ?pack=<course id> (another course pack, e.g. copilot-cli), ?allparts (every chapter part of the
 * pack before the page starts), ?sea=calm|breeze|fresh|gale (the Sea state setting, from the first
 * frame).
 */
const { q, backend, tier, canvas, renderer, engine } = await createDevHarness();
const seaParam = q.get('sea');
if (isSeaStateId(seaParam)) {
  seaState.setSetting(seaParam);
  seaState.snap();
}
const { scene, camera, clock } = engine;

const t0 = performance.now();
const [cove, characters] = await Promise.all([
  createCove(engine, { vegetation: !q.has('noveg') }),
  loadCharacterLibrary('/packs/testcove/characters'),
]);
clock.set(Number(q.get('time') ?? 16.2), Number(q.get('az') ?? 0));
cove.sky.invalidate();
const post = q.has('nopost')
  ? null
  : await createPost(renderer, scene, camera, tier, { temporal: !q.has('notaa') });
if (post) engine.renderFn = post.render;
const buildMs = performance.now() - t0;

const input = new Input(canvas);
const audio = createAudio();
const memory = new Map<string, string>();
const learn = q.has('nolearn')
  ? null
  : new LearnStore(
      q.has('keep')
        ? new Progress(undefined, PACK)
        : new Progress(
            {
              getItem: (k) => memory.get(k) ?? null,
              setItem: (k, v) => void memory.set(k, v),
              removeItem: (k) => void memory.delete(k),
            },
            PACK,
          ),
    );
const playingListeners = new Set<() => void>();
if (learn)
  mountLearn(document.body, learn, {
    subscribe: (fn) => (playingListeners.add(fn), () => playingListeners.delete(fn)),
    get: () => !!session,
  });
let session: GameSession | null = null;
let starting = false;
let body: PlayerBody = q.get('body') === 'woman' ? 'woman' : 'man';
/** Warm-ups running (the world's, an island's, a late one's), for `__dev.settled()`. */
let warms = 0;
const counted = (warm: Promise<void>): Promise<void> => {
  warms++;
  return warm.finally(() => warms--);
};

async function begin(unlock: boolean): Promise<void> {
  if (session || starting) return;
  starting = true;
  if (unlock) {
    const ok = await audio.unlock();
    if (ok) {
      audio.music.setIsland('anchorage');
      for (const [bed, gain] of Object.entries(AMBIENT_BEDS))
        audio.sfx.setBed(bed as keyof typeof AMBIENT_BEDS, gain);
    }
  }
  const s = await createSession({
    engine,
    cove,
    characters,
    input,
    hudParent: document.body,
    audio: unlock ? audio : null,
    body,
    quiet: q.has('quiet'),
    // `?resume`: as a Continue does, the "where you left off" card and a due recap once ashore.
    resume: q.has('resume'),
    learn,
  });
  // Warmed like the game (game/island-warm.ts): the world before play, each island as it streams in
  // (a first visit, or again after it was freed), and late additions (the leaps, a battle). So the
  // page builds the game's shaders, and its hitch guard (`window.__isles`) sees what the game's would.
  const live = () => true;
  const frame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
  cove.setLateWarm((roots) => counted(warmLate({ engine, cove, roots, post, live })));
  for (const { setup } of s.islandSetups()) setup.reveal();
  s.onIslandSetup((id, setup) => void counted(warmIsland({ engine, cove, id, setup, post, live })));
  await counted(warmWorld({ engine, cove, post, frame, terrains: [cove.terrain] }));
  engine.counters.hitches.length = 0;
  engine.counters.stalls.length = 0;
  engine.counters.arm();
  session = s;
  for (const fn of playingListeners) fn();
  document.getElementById('start')!.classList.add('hide');
  canvas.focus();
  s.begin();
}

const startBtn = document.getElementById('go') as HTMLButtonElement;
document.querySelectorAll<HTMLButtonElement>('[data-body]').forEach((b) => {
  b.setAttribute('aria-pressed', String(b.dataset.body === body));
  b.onclick = () => {
    body = b.dataset.body as PlayerBody;
    document
      .querySelectorAll<HTMLButtonElement>('[data-body]')
      .forEach((o) => o.setAttribute('aria-pressed', String(o === b)));
  };
});
startBtn.onclick = () => void begin(true);

const stats = document.getElementById('stats')!;
let n = 0;
engine.add({
  frame() {
    if (++n % 20 !== 0) return;
    const c = engine.counters.last;
    const s = session?.debug.state();
    stats.textContent =
      `${backend} · ${tier.tier} · ${engine.fps.toFixed(0)} fps · draws ${c.drawCalls} · tris ${(c.triangles / 1000).toFixed(0)}k\n` +
      (s ? `${s.mode} · ${s.surface} · depth ${s.depth} · ${s.x}, ${s.y}, ${s.z}` : '');
  },
});

// One shader per look whether a mesh takes the sun's shadows or not, like the game's warms.
if (cove.sky.sun.castShadow) skipSunShadowsWhereOff(scene);
await compileAndStart(renderer, engine, scene, camera, post ? () => post.compile() : undefined);
// The game's debug hooks (`window.__isles`): tests read its hitch guard, armed once the world's warm.
engine.counters.stage = () => (session ? 'playing' : 'warming');
installDebug(
  engine.counters,
  canvas,
  () => engine.fps,
  () => (session ? 'playing' : 'warming'),
  { backend, reason: 'dev page', hdr: false, features: [] },
  {
    getCpuMs: () => engine.cpuMs,
    getGpuMs: () => engine.gpuMs,
    getGpuBusyMs: () => engine.gpuBusyMs,
    getGpuRawMs: () => engine.gpuRawMs,
  },
);
startBtn.disabled = false;
startBtn.textContent = 'Set sail';
if (q.has('auto')) await begin(false);

const keys = new Set<string>();
const key = (code: string, down: boolean) => {
  if (down === keys.has(code)) return;
  if (down) keys.add(code);
  else keys.delete(code);
  window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code }));
};

(window as unknown as { __dev: object }).__dev = {
  course: () => COURSE_ID(),
  ready: true,
  session: () => session,
  /** The scene, its camera, and the engine, for tools that ray-test what's drawn (tools/cameratest.mjs). */
  scene,
  camera,
  engine,
  learn,
  /** Submits the right answer to the open quiz (tests); hotspots can also be clicked for real. */
  answer: () => {
    const quiz = learn?.getState().quiz?.quiz;
    if (!learn || !quiz) return false;
    if (!QUIZZES.has(quiz.id)) return false;
    let a: Answer;
    switch (quiz.type) {
      case 'mc':
      case 'scenario':
        a = { type: quiz.type, option: quiz.answer };
        break;
      case 'multi':
        a = { type: 'multi', options: quiz.answers };
        break;
      case 'hotspot':
        a = { type: 'hotspot-target', target: quiz.targets.find((t) => t.correct)!.id };
        break;
      case 'ordering':
        a = { type: 'ordering', order: quiz.items.map((i) => i.id) };
        break;
      case 'matching':
        a = { type: 'matching', pairs: Object.fromEntries(quiz.pairs.map((p) => [p.left.id, p.right.id])) };
        break;
    }
    return !!learn.submit(a)?.correct;
  },
  state: () => session?.debug.state() ?? null,
  bench: {
    teleport: (x: number, z: number, heading = 0, yaw = heading, pitch = 0.2) => {
      session?.debug.teleport(x, z, heading);
      if (session) {
        session.camera.yaw = yaw;
        session.camera.pitch = pitch;
      }
    },
    board: () => session?.debug.board(),
    dock: () => session?.debug.dock(),
  },
  /** Holds keys for `ms` (e.g. hold(['KeyW','ShiftLeft'], 1500)). */
  hold: async (codes: string[], ms: number) => {
    for (const c of codes) key(c, true);
    await new Promise((r) => setTimeout(r, ms));
    for (const c of codes) key(c, false);
  },
  tap: async (code: string) => {
    key(code, true);
    await new Promise((r) => setTimeout(r, 60));
    key(code, false);
  },
  look: (yaw: number, pitch?: number) => {
    if (!session) return;
    session.camera.yaw = yaw;
    if (pitch !== undefined) session.camera.pitch = pitch;
  },
  stats: () => ({
    ...engine.counters.last,
    fps: engine.fps,
    gpuMs: engine.gpuMs,
    gpuBusyMs: engine.gpuBusyMs,
    gpuRawMs: engine.gpuRawMs,
    cpuMs: engine.cpuMs,
    backend,
    tier: tier.tier,
    buildMs,
    state: session?.debug.state() ?? null,
  }),
  /**
   * Whether the world has settled (tools/budgettest.mjs measures only then): no warm-up running (each
   * redraws the static sun shadow map and hidden parts every frame), and every island in or out of
   * memory, none held by a warm. Read-only.
   */
  settled: () => {
    const shadow = (cove.sky.sun.shadow as typeof cove.sky.sun.shadow & { shadowNode?: CachedSunShadowNode })
      .shadowNode;
    const streams = {
      anchorage: cove.anchorage,
      meridian: cove.meridian,
      'thousand-bough': cove.thousandBough,
    };
    const out = {
      warms,
      warming: shadow?.warming ?? 0,
      refreshes: shadow?.refreshes ?? 0,
      lastReason: shadow?.lastReason ?? 'none',
      streams: Object.fromEntries(
        Object.entries(streams).map(([id, st]) => [id, { state: st.state, held: st.held }]),
      ),
    };
    const still = Object.values(out.streams).every(
      (st) => !st.held && (st.state === 'absent' || st.state === 'resident' || st.state === 'failed'),
    );
    return { ok: warms === 0 && out.warming === 0 && still, ...out };
  },
  /**
   * The Sea state setting (Settings → Sea state): eases in over a few seconds like the game's, or
   * `snap` jumps to it. Returns the live sea (and whether a battle or course holds it fixed).
   */
  seaState: (id?: SeaStateId, snap = false) => {
    if (id) seaState.setSetting(id);
    if (snap) seaState.snap();
    return { chosen: seaState.chosen, fixed: seaState.fixed, settled: seaState.settled, live: seaState.live };
  },
  lighthouseLit: (on: boolean) => cove.meridian.town?.setLighthouseLit(on),
  liftCar: (t: number) => cove.meridian.town?.setLiftCar(t),
  mooringLines: (on: boolean) => cove.meridian.town?.setMooringLines(on),
};
