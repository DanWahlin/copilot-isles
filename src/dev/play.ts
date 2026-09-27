import { AMBIENT_BEDS, createAudio } from '../audio';
import { Input } from '../engine/input';
import { createPost } from '../engine/post';
import { createSession, type GameSession } from '../game/session';
import '../game/hud.css';
import { loadCharacterLibrary, type PlayerBody } from '../world/characters';
import { createCove } from '../world/cove-scene';
import { QUIZZES } from '../learn/content/index';
import type { Answer } from '../learn/grade';
import { Progress } from '../learn/progress';
import { LearnStore } from '../learn/store';
import { mountLearn } from '../ui/learn/LearnLayer';
import '../ui/ui.css';
import { compileAndStart, createDevHarness } from './harness';

/**
 * Test Cove play page (Phase 0 T11): walk the harbor, talk to Nell, board the brigantine, sail,
 * and dock. ?webgl, ?tier=, ?noveg, ?body=man|woman, ?auto (skip the start card), ?shot, ?time=,
 * ?nolearn (plain dialogue, no quizzes/chests), ?keep (keep learning progress in localStorage).
 */
const { q, backend, tier, canvas, renderer, engine } = await createDevHarness();
const { scene, camera, clock } = engine;

const t0 = performance.now();
const [cove, characters] = await Promise.all([
  createCove(engine, { vegetation: !q.has('noveg') }),
  loadCharacterLibrary('/packs/testcove/characters'),
]);
clock.set(Number(q.get('time') ?? 16.2), Number(q.get('az') ?? 0));
cove.sky.invalidate();
const post = q.has('nopost') ? null : createPost(renderer, scene, camera, tier);
if (post) engine.renderFn = post.render;
const buildMs = performance.now() - t0;

const input = new Input(canvas);
const audio = createAudio();
const memory = new Map<string, string>();
const learn = q.has('nolearn')
  ? null
  : new LearnStore(
      q.has('keep')
        ? new Progress()
        : new Progress({
            getItem: (k) => memory.get(k) ?? null,
            setItem: (k, v) => void memory.set(k, v),
            removeItem: (k) => void memory.delete(k),
          }),
    );
const playingListeners = new Set<() => void>();
if (learn)
  mountLearn(document.body, learn, {
    subscribe: (fn) => (playingListeners.add(fn), () => playingListeners.delete(fn)),
    get: () => !!session,
  });
let session: GameSession | null = null;
let body: PlayerBody = q.get('body') === 'woman' ? 'woman' : 'man';

async function begin(unlock: boolean): Promise<void> {
  if (session) return;
  if (unlock) {
    const ok = await audio.unlock();
    if (ok) {
      audio.music.setIsland('anchorage');
      for (const [bed, gain] of Object.entries(AMBIENT_BEDS))
        audio.sfx.setBed(bed as keyof typeof AMBIENT_BEDS, gain);
    }
  }
  session = await createSession({
    engine,
    cove,
    characters,
    input,
    hudParent: document.body,
    audio: unlock ? audio : null,
    body,
    quiet: q.has('quiet'),
    learn,
  });
  for (const fn of playingListeners) fn();
  document.getElementById('start')!.classList.add('hide');
  canvas.focus();
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

await compileAndStart(renderer, engine, scene, camera);
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
  ready: true,
  session: () => session,
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
    cpuMs: engine.cpuMs,
    backend,
    tier: tier.tier,
    buildMs,
    state: session?.debug.state() ?? null,
  }),
};
