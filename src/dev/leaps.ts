import { createPost } from '../engine/post';
import { createCove } from '../world/cove-scene';
import { createLeaps } from '../world/life/leaps';
import { compileAndStart, createDevHarness } from './harness';

const { q, backend, tier, renderer, engine } = await createDevHarness();
const { scene, camera, clock } = engine;
clock.set(16.5, 0);
camera.position.set(40, 12, 145);
camera.lookAt(34, 1.5, 35);
camera.updateMatrixWorld(true);
await createCove(engine, { vegetation: false, birds: false });
const demoLeaps = createLeaps({ tier, titleMode: true, seed: 0x1ea9 });
scene.add(demoLeaps.group);
const post = q.has('nopost') ? null : await createPost(renderer, scene, camera, tier);
if (post) engine.renderFn = post.render;

let forced = false;
let n = 0;
const hud = document.getElementById('hud')!;
engine.add({
  frame(dt, t) {
    demoLeaps.update(dt, t, camera);
    if (!forced && (q.has('force') || n > 30)) {
      const a = demoLeaps.force('dolphin');
      const b = demoLeaps.force('fish');
      forced = a || b;
    }
    if (++n % 20 === 0) {
      const c = engine.counters.last;
      hud.textContent = `${backend} ${tier.tier}\ndraws ${c.drawCalls} tris ${c.triangles}\ngpu ${engine.gpuMs.toFixed(2)}ms`;
    }
  },
});

await compileAndStart(renderer, engine, scene, camera, post ? () => post.compile() : undefined);

const dev = window as unknown as { __dev: Record<string, unknown> };
dev.__dev = {};
dev.__dev.ready = true;
dev.__dev.stats = () => ({
  ...engine.counters.last,
  fps: engine.fps,
  gpuMs: engine.gpuMs,
  gpuRawMs: engine.gpuRawMs,
  backend,
  tier: tier.tier,
});
dev.__dev.setCam = (p: number[], t: number[]) => {
  camera.position.set(p[0], p[1], p[2]);
  camera.lookAt(t[0], t[1], t[2]);
  camera.updateMatrixWorld(true);
};
dev.__dev.force = () => {
  demoLeaps.force('dolphin');
  demoLeaps.force('fish');
};
