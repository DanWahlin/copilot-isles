#!/usr/bin/env node
// End-to-end flow check on the real entry (index.html): title → captain → voyage → play → pause →
// chart (archipelago, island detail) → travel to the bard's hammock and the lighthouse → quit.
// node tools/flowtest.mjs [--webgl] [--base=http://localhost:5301] [--out=/tmp/shots/flow]
import { chromium } from '@playwright/test';

const opt = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, ...v] = a.replace(/^--/, '').split('=');
    return [k, v.length ? v.join('=') : true];
  }),
);
const base = opt.base || 'http://localhost:5301';
const out = opt.out || '/tmp/shots/flow';
const tag = opt.webgl ? 'gl' : 'gpu';
const url = `${base}/?debug${opt.webgl ? '&webgl' : ''}${opt.tier ? `&tier=${opt.tier}` : ''}`;
const [w, h] = (opt.size || '1600x900').split('x').map(Number);

const browser = await chromium.launch({
  channel: 'chrome',
  args: [
    '--use-angle=metal',
    '--ignore-gpu-blocklist',
    '--enable-unsafe-webgpu',
    '--autoplay-policy=no-user-gesture-required',
  ],
});
const page = await browser.newPage({ viewport: { width: w, height: h } });
const logs = [];
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') logs.push(`[${m.type()}] ${m.text()}`);
});
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
const t0 = Date.now();
await page.goto(url, { waitUntil: 'load' });
await page.evaluate(() => localStorage.clear());
await page.waitForFunction(() => window.__flow?.getState().screen === 'title', null, { timeout: 60000 });
const titleMs = Date.now() - t0;
// The splash holds for a moment even on a fast load; wait for it to fade before the first shot.
await page.waitForFunction(() => !document.getElementById('loading'), null, { timeout: 15000 });
await page.waitForTimeout(1500);

const results = [];
const shot = async (name) => {
  const path = `${out}-${tag}-${name}.png`;
  await page.screenshot({ path });
  const screen = await page.evaluate(() => window.__flow.getState().screen);
  results.push({ name, screen, path });
};
const flow = (js) => page.evaluate(`window.__flow.${js}`);
const until = (screen, timeout = 90000) =>
  page.waitForFunction((s) => window.__flow.getState().screen === s, screen, { timeout });

await shot('title');
await flow('chooseCaptain()');
await page.waitForTimeout(900);
await shot('captain');
const tv = Date.now();
await flow("newVoyage('woman')");
await page.waitForTimeout(1200);
await shot('loading');
await until('playing');
const voyageMs = Date.now() - tv;
await page.waitForTimeout(2500);
await shot('playing');
await page.keyboard.press('Escape');
await page.waitForTimeout(700);
await shot('paused');
await flow('openChart()');
await page.waitForTimeout(1000);
await shot('chart');
await page.click('.ci-chart-toolbar button:nth-child(2)');
await page.waitForTimeout(700);
await shot('chart-island');
const travel = await page.$$eval('.ci-travel-list button span', (els) => els.map((e) => e.textContent));
if (!travel.includes('Bard’s hammock'))
  logs.push(`[flowtest] no Bard’s hammock travel point (${travel.join(', ')})`);
await flow("travelTo('bard')");
await page.waitForTimeout(2500);
await shot('travel-bard');
await page.keyboard.press('Escape');
await page.waitForTimeout(700);
await flow('openChart()');
await page.waitForTimeout(800);
await flow("travelTo('lighthouse')");
await page.waitForTimeout(2500);
await shot('travel-lighthouse');
await page.keyboard.press('KeyM');
await page.waitForTimeout(900);
await shot('chart-key');
await flow('back()');
await page.waitForTimeout(500);
await flow('pause()');
await flow('openSettings()');
await page.waitForTimeout(700);
await shot('settings');
await flow('back()');
await flow('quitToTitle()');
await page.waitForTimeout(2500);
await shot('title-again');

const info = await page.evaluate(() => window.__isles?.info());
await browser.close();
console.log(JSON.stringify({ url, titleMs, voyageMs, results, info, logs: logs.slice(0, 25) }, null, 1));
