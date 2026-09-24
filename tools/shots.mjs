#!/usr/bin/env node
// Capture deterministic Phase 0 shots. Example:
//   node tools/shots.mjs --base=http://127.0.0.1:5301 --out=tests/visual/baseline
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const opt = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, ...v] = a.replace(/^--/, '').split('=');
    return [k, v.length ? v.join('=') : true];
  }),
);
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

function parseSize(s) {
  const [width, height] = s.split('x').map(Number);
  return { width: width || 1600, height: height || 900 };
}

async function captureCove(browser, backend, shot) {
  const page = await browser.newPage({ viewport });
  const logs = [];
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') logs.push(`[${m.type()}] ${m.text()}`);
  });
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
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
  const logs = [];
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') logs.push(`[${m.type()}] ${m.text()}`);
  });
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
  const url = `${base}/?debug&skipBenchmark&tier=${tier}${backend === 'webgl' ? '&webgl' : ''}`;
  await page.goto(url, { waitUntil: 'load', timeout: 120_000 });
  await page.waitForFunction(() => window.__flow?.getState().screen === 'title', null, { timeout: 120_000 });
  await page.waitForTimeout(Number(opt.wait || 2500));
  const path = `${out}/${backend}-T1-${tier}.png`;
  await page.screenshot({ path });
  const stats = await page.evaluate(() => window.__isles?.info?.() ?? null);
  await page.close();
  return { path, url, stats, logs };
}

await mkdir(out, { recursive: true });
const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--use-angle=metal', '--ignore-gpu-blocklist', '--enable-unsafe-webgpu'],
});
const results = [];
for (const backend of backends) {
  for (const shot of shots)
    results.push({ backend, id: shot.id, ...(await captureCove(browser, backend, shot)) });
  for (const tier of tiers)
    results.push({ backend, id: 'T1', tier, ...(await captureTitle(browser, backend, tier)) });
}
await browser.close();
console.log(JSON.stringify({ out, results }, null, 2));
