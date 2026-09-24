#!/usr/bin/env node
import { chromium } from '@playwright/test';

const opt = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, ...v] = a.replace(/^--/, '').split('=');
    return [k, v.length ? v.join('=') : true];
  }),
);
const base = opt.base || 'http://localhost:4173';
const modes = opt.mode ? [String(opt.mode)] : ['webgpu', 'webgl'];
const [w, h] = String(opt.size || '1280x720').split('x').map(Number);

async function runMode(mode) {
  const browser = await chromium.launch({
    channel: 'chrome',
    args: ['--use-angle=metal', '--ignore-gpu-blocklist', '--enable-unsafe-webgpu', '--autoplay-policy=no-user-gesture-required'],
  });
  const context = await browser.newContext({ viewport: { width: w, height: h }, serviceWorkers: 'allow' });
  const page = await context.newPage();
  const logs = [];
  const swResponses = [];
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') logs.push(`[${m.type()}] ${m.text()}`);
  });
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
  page.on('response', (response) => {
    if (response.fromServiceWorker()) swResponses.push(response.url());
  });
  const url = `${base}/?debug${mode === 'webgl' ? '&webgl' : ''}`;
  const t0 = performance.now();
  await page.goto(url, { waitUntil: 'load' });
  await page.evaluate(() => localStorage.clear());
  await page.waitForFunction(() => window.__flow?.getState().screen === 'title', null, { timeout: 60000 });
  const titleMs = performance.now() - t0;

  const v0 = performance.now();
  await page.evaluate(() => window.__flow.newVoyage('woman'));
  await page.waitForFunction(() => window.__flow?.getState().screen === 'playing', null, { timeout: 120000 });
  const voyageMs = performance.now() - v0;
  const hitchState = await page.evaluate(() => window.__isles?.hitches?.() ?? []);

  // Give the service worker a moment to install/activate, then reload. It does not claim the first page.
  await page.waitForTimeout(800);
  const r0 = performance.now();
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.__flow?.getState().screen === 'title', null, { timeout: 60000 });
  const secondTitleMs = performance.now() - r0;
  const controlled = await page.evaluate(() => navigator.serviceWorker?.controller !== null).catch(() => false);
  const cachedResources = await page.evaluate(() =>
    performance
      .getEntriesByType('resource')
      .filter((entry) => entry.name.includes('?v=') || entry.name.includes('/assets/'))
      .map((entry) => ({ name: entry.name, transferSize: 'transferSize' in entry ? entry.transferSize : 0 })),
  );
  await browser.close();
  return {
    mode,
    titleMs: Math.round(titleMs),
    voyageMs: Math.round(voyageMs),
    secondTitleMs: Math.round(secondTitleMs),
    controlled,
    serviceWorkerHits: swResponses.length,
    zeroTransferHashedResources: cachedResources.filter((entry) => entry.transferSize === 0).length,
    hitchCount: Array.isArray(hitchState) ? hitchState.length : null,
    logs: logs.slice(0, 20),
  };
}

const results = [];
for (const mode of modes) results.push(await runMode(mode));
console.log(JSON.stringify({ base, results }, null, 2));
