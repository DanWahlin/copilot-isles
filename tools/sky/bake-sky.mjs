#!/usr/bin/env node
// Bakes the WebGPU High clouds (Tidewater's volumetric clouds and their aerial perspective) into the
// cloud layers that WebGL2, Low, Lite and Medium composite over the live sky
// (src/world/sky/clouds/BakedPanorama.ts), one per key in SKY_KEYS (read from the page, so the list has
// one source). Renders five cube faces from the cove page in sky-only mode, waits for the clouds'
// temporal accumulation to converge on each, captures the clouds' light and then their transmittance
// (Sky.ts bakeLayer), and reprojects both to the layer's above-horizon equirect RGBA layout. The page
// runs without post (`nopost`) and tone mapping, so the light holds the sky's own colours and the
// runtime's tone mapping and grade apply exactly once.
// All keys come from one page with the cloud wind off and the sun turned to one azimuth, so they hold
// the same clouds and the dome can blend them without ghosts.
//   node tools/sky/bake-sky.mjs [--base=http://127.0.0.1:5301] [--keys=dusk,noon] [--settle=6000]
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChrome, parseFlags } from '../lib/browser.mjs';

const opt = parseFlags();
const base = String(opt.base || 'http://127.0.0.1:5301').replace(/\/$/, '');
const only = opt.keys ? String(opt.keys).split(',') : null;
const face = Number(opt.face || 1024);
const settle = Number(opt.settle || 6000);
// Captures averaged per layer: less ray-march noise, so cleaner and smaller keys.
const frames = Number(opt.frames || 4);
// Over the harbour, at deck height: the view players see the sky from most.
const eye = [-110, 3, -100];
const faces = [
  { name: 'px', dir: [1, 0, 0], up: [0, 1, 0] },
  { name: 'nx', dir: [-1, 0, 0], up: [0, 1, 0] },
  { name: 'pz', dir: [0, 0, 1], up: [0, 1, 0] },
  { name: 'nz', dir: [0, 0, -1], up: [0, 1, 0] },
  { name: 'py', dir: [0, 1, 0], up: [0, 0, -1] },
];

const dir = mkdtempSync(join(tmpdir(), 'sky-bake-'));
const browser = await launchChrome();
const page = await browser.newPage({ viewport: { width: face, height: face } });
await page.goto(`${base}/devpages/cove.html?tier=ultra&noveg&nopost&cloudWind=0`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__dev?.ready === true, null, { timeout: 180_000 });
const backend = await page.evaluate(() => window.__dev.stats().backend);
if (backend !== 'webgpu') throw new Error(`the bake needs the WebGPU volumetric sky, got ${backend}`);
const keys = (await page.evaluate(() => window.__dev.skyKeys())).filter(
  (k) => !only || only.includes(k.name),
);
if (!keys.length) throw new Error(`no keys match ${opt.keys}`);
const pedestal = await page.evaluate(() => window.__dev.cloudPedestal());
await page.evaluate(() => window.__dev.skyBake(90));
await page.addStyleTag({ content: 'body > *:not(canvas) { display: none !important; }' });
for (const k of keys) mkdirSync(join(dir, k.name));
for (const f of faces) {
  await page.evaluate(([e, d, u]) => window.__dev.skyLook(e, d, u), [eye, f.dir, f.up]);
  for (const k of keys) {
    await page.evaluate(([h, az]) => window.__dev.setTime(h, az), [k.hours, k.az]);
    await page.waitForTimeout(settle);
    for (const [layer, name] of [
      [1, 'light'],
      [2, 'alpha'],
    ]) {
      await page.evaluate((l) => window.__dev.skyLayer(l), layer);
      await page.waitForTimeout(250);
      for (let i = 0; i < frames; i++) {
        await page.waitForTimeout(120);
        await page
          .locator('canvas')
          .first()
          .screenshot({ path: join(dir, k.name, `${f.name}-${name}-${i}.png`) });
      }
    }
    await page.evaluate(() => window.__dev.skyLayer(0));
  }
}
await browser.close();

const script = fileURLToPath(new URL('./reproject.py', import.meta.url));
mkdirSync('public/sky', { recursive: true });
for (const k of keys) {
  const out = `public/sky/clouds-${k.name}.webp`;
  execFileSync(
    'python3',
    [script, join(dir, k.name), out, JSON.stringify(faces), JSON.stringify(pedestal), String(frames)],
    { stdio: 'inherit' },
  );
}
rmSync(dir, { recursive: true, force: true });
console.log(JSON.stringify({ keys, eye }));
