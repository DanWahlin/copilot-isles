#!/usr/bin/env node
// Capture deterministic Phase 0 shots. Example:
//   node tools/shots.mjs --base=http://127.0.0.1:5301 --out=tests/visual/baseline
import { mkdir } from 'node:fs/promises';
import { collectLogs, launchChrome, parseFlags, parseSize, waitForTitle } from './lib/browser.mjs';

const opt = parseFlags();
const base = String(opt.base || 'http://127.0.0.1:5301').replace(/\/$/, '');
const out = String(opt.out || 'tests/visual/baseline');
const viewport = parseSize(String(opt.size || '1600x900'));
const backends = opt.backend ? String(opt.backend).split(',') : ['webgpu', 'webgl'];
const tiers = ['lite', 'low', 'medium', 'high', 'ultra'];
const shots = [
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
  for (const shot of shots)
    results.push({ backend, id: shot.id, ...(await captureCove(browser, backend, shot)) });
  for (const tier of tiers)
    results.push({ backend, id: 'T1', tier, ...(await captureTitle(browser, backend, tier)) });
}
await browser.close();
console.log(JSON.stringify({ out, results }, null, 2));
