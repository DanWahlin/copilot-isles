#!/usr/bin/env node
// Nell's face and lip-sync check for the quality slice: her talk shot, a 6-frame sequence across one line,
// and a face crop, with CPU and hitch metrics. node tools/nell-quality-probe.mjs [--base=...] [--out=...]
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { collectLogs, launchChrome, parseFlags } from './lib/browser.mjs';

const opt = parseFlags();
const base = opt.base || 'http://127.0.0.1:5341';
const out = opt.out || '.copilot-nell-shots';
const tier = opt.tier || 'high';
const webgl = opt.webgl ? '&webgl' : '';
const logs = [];

await mkdir(out, { recursive: true });
const browser = await launchChrome({ autoplay: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
collectLogs(page, { logs });
await page.addInitScript(() => {
  const seq = [0, 0.06, 0.12, 0.2, 0.3, 0.42, 0.55, 0.7, 0.85, 0.95];
  let i = 0;
  Math.random = () => seq[i++ % seq.length];
});
await page.goto(`${base}/devpages/play.html?auto&quiet&shot&tier=${tier}${webgl}`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__dev?.ready === true && window.__dev.session(), null, {
  timeout: 90000,
});
await page.waitForTimeout(1600);
await page.evaluate(() => {
  const s = window.__dev.session();
  const n = s.npcs.list.find((v) => v.spec.id === 'nell');
  const h = n.heading;
  s.debug.teleport(n.x + Math.sin(h) * 2.05, n.z + Math.cos(h) * 2.05, h + Math.PI);
  window.__dev.look(h + Math.PI + 0.28, 0.1);
  s.debug.talk('nell');
});
await page.waitForTimeout(520);
await page.screenshot({ path: join(out, `nell-talk-${tier}${opt.webgl ? '-webgl' : ''}.png`) });
await page.screenshot({
  path: join(out, `nell-face-${tier}${opt.webgl ? '-webgl' : ''}.png`),
  clip: { x: 560, y: 145, width: 480, height: 430 },
});
for (let i = 0; i < 6; i++) {
  await page.waitForTimeout(i === 0 ? 0 : 170);
  await page.screenshot({
    path: join(out, `nell-seq-${tier}-${String(i + 1).padStart(2, '0')}.png`),
    clip: { x: 560, y: 145, width: 480, height: 430 },
  });
}
const metrics = await page.evaluate(() => ({
  stats: window.__dev.stats?.() ?? null,
  hitches: window.__isles?.hitches?.() ?? [],
  state: window.__dev.state(),
}));
await writeFile(
  join(out, `metrics-${tier}${opt.webgl ? '-webgl' : ''}.json`),
  JSON.stringify({ metrics, logs }, null, 2),
);
await browser.close();
console.log(JSON.stringify({ out, tier, webgl: !!opt.webgl, logs: logs.slice(0, 10), metrics }, null, 2));
