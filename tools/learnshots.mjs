#!/usr/bin/env node
// Screenshots of the learning overlay (devpages/learn.html): every quiz type, answered states, pages, Logbook.
// node tools/learnshots.mjs [--base=http://localhost:5301] [--out=/tmp/shots/learn] [--debug]
import { chromium } from '@playwright/test';

const opt = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, ...v] = a.replace(/^--/, '').split('=');
    return [k, v.length ? v.join('=') : true];
  }),
);
const base = opt.base || 'http://localhost:5301';
const out = opt.out || '/tmp/shots/learn';
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const logs = [];
page.on('console', (m) => m.type() === 'error' && logs.push(m.text()));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
const open = async (qs) => {
  await page.goto(`${base}/devpages/learn.html?${qs}${opt.debug ? '&debug' : ''}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__dev?.ready === true);
  await page.waitForTimeout(700);
};
const shot = (name) => page.screenshot({ path: `${out}-${name}.png` });
const frameClick = async (x, y) => {
  const box = await page.locator('.ci-hotspot-frame').boundingBox();
  await page.mouse.click(box.x + box.width * x, box.y + box.height * y);
  await page.waitForTimeout(400);
};

for (const id of ['H0.1', 'H0.2', 'H0.3', 'H0.4']) {
  await open(`q=${id}`);
  await shot(`${id}`);
}
await open('q=H0.2');
await frameClick(0.1, 0.11);
await shot('H0.2-wrong');
await page.keyboard.press('KeyE');
await frameClick(0.23, 0.345);
await shot('H0.2-right');

await open('q=H0.4');
await page.keyboard.down('Shift');
const box = await page.locator('.ci-hotspot-frame').boundingBox();
await page.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.5);
await page.waitForTimeout(300);
await shot('H0.4-lens');
await page.keyboard.up('Shift');

await open('q=MC0.1');
await page.keyboard.press('Digit2');
await page.waitForTimeout(300);
await shot('MC0.1-wrong');
await open('q=S0.1');
await shot('S0.1');
await open('q=M0.1');
await shot('M0.1');
await page.click('.ci-match-right >> nth=0');
await page.click('.ci-match-right >> nth=1');
await page.click('.ci-match-right >> nth=2');
await page.click('.ci-match-right >> nth=3');
await page.keyboard.press('KeyE');
await page.waitForTimeout(300);
await shot('M0.1-checked');
await open('q=T0');
await shot('T0.1');
await page.keyboard.press('KeyE');
await page.waitForTimeout(300);
await shot('T0.1-checked');

await open('');
await page.click('text=Chest C0.4');
await page.waitForTimeout(500);
await shot('chest');
await page.keyboard.press('KeyE');
await page.click('text=Spyglass');
await page.waitForTimeout(500);
await shot('spyglass');
await page.click('text=Hide spyglass');
await page.click('text=Logbook');
await page.waitForTimeout(500);
await shot('logbook');
await page.click('text=Glossary');
await page.waitForTimeout(300);
await shot('logbook-glossary');

await browser.close();
console.log(JSON.stringify({ out, logs }, null, 1));
