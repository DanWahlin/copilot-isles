#!/usr/bin/env node
// Dev screenshot helper: node tools/devshot.mjs <url> <out.png> [--wait=ms] [--eval="js"] [--size=1600x900]
// Uses the installed Chrome with the real GPU (ANGLE/Metal locally), like the local Playwright config.
import { chromium } from '@playwright/test';

const [url, out, ...rest] = process.argv.slice(2);
if (!url || !out) {
  console.error('usage: devshot <url> <out.png> [--wait=ms] [--eval=js] [--size=WxH]');
  process.exit(2);
}
const opt = Object.fromEntries(
  rest.map((a) => {
    const [k, ...v] = a.replace(/^--/, '').split('=');
    return [k, v.join('=')];
  }),
);
const [w, h] = (opt.size || '1600x900').split('x').map(Number);
const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--use-angle=metal', '--ignore-gpu-blocklist', '--enable-unsafe-webgpu'],
});
const page = await browser.newPage({ viewport: { width: w, height: h } });
const logs = [];
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') logs.push(`[${m.type()}] ${m.text()}`);
});
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
await page.goto(url, { waitUntil: 'load' });
await page
  .waitForFunction(() => window.__dev?.ready === true, null, { timeout: 60000 })
  .catch(() => logs.push('[devshot] __dev.ready never became true'));
const evalResult = opt.eval ? await page.evaluate(opt.eval) : undefined;
await page.waitForTimeout(Number(opt.wait || 2500));
const stats = await page.evaluate(() => window.__dev?.stats?.() ?? null).catch(() => null);
await page.screenshot({ path: out });
await browser.close();
console.log(JSON.stringify({ out, stats, evalResult, logs: logs.slice(0, 20) }, null, 1));
