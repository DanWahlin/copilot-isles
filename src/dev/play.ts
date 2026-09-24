import { type WebGPURenderer } from 'three/webgpu';
import { createAudio } from '../audio';
import { Engine } from '../engine/engine';
import { Input } from '../engine/input';
import { createPost } from '../engine/post';
import { TIERS } from '../engine/quality';
import { createSession, type GameSession } from '../game/session';
import '../game/hud.css';
import { loadCharacterLibrary, type PlayerBody } from '../world/characters';
import type { Tier } from '../world/contracts';
import { createCove } from '../world/cove-scene';

/**
 * Test Cove play page (Phase 0 T11): walk the harbor, talk to Nell, board the brigantine, sail,
 * and dock. ?webgl, ?tier=, ?noveg, ?body=man|woman, ?auto (skip the start card), ?shot, ?time=.
 */
const q = new URLSearchParams(location.search);
const backend = q.has('webgl') ? 'webgl2' : 'webgpu';
const tier = TIERS[(q.get('tier') as Tier) ?? 'high'] ?? TIERS.high;
const canvas = document.getElementById('gl') as HTMLCanvasElement;
const renderer: WebGPURenderer = Engine.createRenderer({ canvas, backend, tier });
await renderer.init();
const engine = Engine.fromRenderer(renderer, { canvas, backend, tier });
const { scene, camera, clock } = engine;
if (q.has('shot')) document.body.classList.add('shot');

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
let session: GameSession | null = null;
let body: PlayerBody = q.get('body') === 'woman' ? 'woman' : 'man';

async function begin(unlock: boolean): Promise<void> {
  if (session) return;
  if (unlock) {
    const ok = await audio.unlock();
    if (ok) {
      audio.music.setIsland('anchorage');
      audio.sfx.setBed('wind', 0.3);
      audio.sfx.setBed('palms', 0.35);
      audio.sfx.setBed('surf_far', 0.55);
      audio.sfx.setBed('birds_dawn', 0.3);
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
  });
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

await renderer.compileAsync(scene, camera);
engine.start();
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
