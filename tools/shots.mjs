#!/usr/bin/env node
// Capture deterministic shots. Phase 0's floor and beauty shots plus the title at every tier:
//   node tools/shots.mjs --base=http://127.0.0.1:5301 --out=tests/visual/baseline
// The quality slice's Walt gate (W1-W4 on Ultra, High and Low, no titles):
//   node tools/shots.mjs --set=walt --backend=webgpu --out=/tmp/shots/walt-before
// --only=cove|title takes just one kind. --live takes the shot on real time (the old way).
//
// Each shot is a frozen frame (issue #86): once the view has loaded and settled on real time
// (`--wait`), the page freezes (clock paused at `SIM` seconds, so waves, wind, clouds and shader time
// are the same in every run; the frame loop stopped; render scale 1) and draws still frames: for
// `--settle` ms first, so the metered exposure (τ 1.2 s) and temporal AA's history forget what ran
// before, then 64 more from the start of temporal AA's jitter, so every run ends on the same jitter.
// Ambient life is reset to its seeded start (`__dev.freeze`). Two runs then differ by well under 0.5 %.
import { mkdir } from 'node:fs/promises';
import { collectLogs, launchChrome, parseFlags, parseSize, waitForTitle } from './lib/browser.mjs';

const opt = parseFlags();
const base = String(opt.base || 'http://127.0.0.1:5301').replace(/\/$/, '');
const out = String(opt.out || 'tests/visual/baseline');
const viewport = parseSize(String(opt.size || '1600x900'));
const backends = opt.backend ? String(opt.backend).split(',') : ['webgpu', 'webgl'];
const tiers = ['lite', 'low', 'medium', 'high', 'ultra'];
const only = opt.only ? String(opt.only) : null;
const live = !!opt.live;
const SIM = 120;
const settleMs = Number(opt.settle || 7000);

/**
 * Freezes the page and draws still frames until the picture no longer depends on what ran before.
 * `api` is the page's freeze-frame hooks: `__dev` on the cove dev page, `__isles.still` on the game.
 */
async function holdStill(page, api) {
  await page.evaluate(
    async ({ api, sim, settleMs }) => {
      const d = api === 'dev' ? window.__dev : window.__isles.still;
      const frame = () => new Promise((r) => requestAnimationFrame(r));
      d.freeze(true, sim);
      const t0 = performance.now();
      while (performance.now() - t0 < settleMs) {
        d.still();
        await frame();
      }
      d.restartJitter();
      for (let i = 0; i < 64; i++) {
        d.still();
        await frame();
      }
    },
    { api, sim: SIM, settleMs },
  );
}
const walt = opt.set === 'walt';
const shots = walt
  ? ['W1', 'W2', 'W3', 'W4'].flatMap((id) =>
      ['ultra', 'high', 'low'].map((tier) => ({ id, tier, page: 'cove' })),
    )
  : [
      { id: 'F1', tier: 'low', page: 'cove' },
      { id: 'F2', tier: 'low', page: 'cove' },
      { id: 'B1', tier: 'high', page: 'cove' },
      { id: 'B2', tier: 'high', page: 'cove' },
    ];

async function captureCove(browser, backend, shot) {
  const page = await browser.newPage({ viewport });
  const logs = collectLogs(page);
  const url = `${base}/devpages/cove.html?shot&tier=${shot.tier}&time=16.5${backend === 'webgl' ? '&webgl' : ''}`;
  await page.goto(url, { waitUntil: 'load', timeout: 120_000 });
  await page.waitForFunction(() => window.__dev?.ready === true, null, { timeout: 180_000 });
  await page.evaluate((id) => window.__dev.shot(id), shot.id);
  await page.waitForTimeout(Number(opt.wait || 2500));
  if (!live) await holdStill(page, 'dev');
  const path = `${out}/${backend}-${shot.id}-${shot.tier}.png`;
  await page.screenshot({ path });
  const stats = await page.evaluate(() => window.__dev.stats());
  await page.close();
  return { path, url, stats, logs };
}

async function captureTitle(browser, backend, tier) {
  const page = await browser.newPage({ viewport });
  const logs = collectLogs(page);
  const url = `${base}/?debug&skipBenchmark&tier=${tier}${backend === 'webgl' ? '&webgl' : ''}`;
  await page.goto(url, { waitUntil: 'load', timeout: 120_000 });
  await waitForTitle(page);
  await page.waitForTimeout(Number(opt.wait || 2500));
  if (!live) await holdStill(page, 'isles');
  const path = `${out}/${backend}-T1-${tier}.png`;
  await page.screenshot({ path });
  const stats = await page.evaluate(() => window.__isles?.info?.() ?? null);
  await page.close();
  return { path, url, stats, logs };
}

await mkdir(out, { recursive: true });
const browser = await launchChrome();
const results = [];
for (const backend of backends) {
  if (only !== 'title')
    for (const shot of shots)
      results.push({ backend, id: shot.id, ...(await captureCove(browser, backend, shot)) });
  if (!walt && only !== 'cove')
    for (const tier of tiers)
      results.push({ backend, id: 'T1', tier, ...(await captureTitle(browser, backend, tier)) });
}
await browser.close();
console.log(JSON.stringify({ out, results }, null, 2));
