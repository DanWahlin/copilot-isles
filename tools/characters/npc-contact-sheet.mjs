#!/usr/bin/env node
// Captures every Test Cove NPC face-on and builds a labeled contact sheet.
// Usage: node tools/characters/npc-contact-sheet.mjs --base=http://localhost:5331 --out=/tmp/chars/npcs
import { mkdir, readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { collectLogs, launchChrome, parseFlags } from '../lib/browser.mjs';

const opt = parseFlags();
const base = opt.base || 'http://localhost:5331';
const out = opt.out || '/tmp/ci-chars-shots/npcs';
const tag = opt.webgl ? 'gl' : 'gpu';
const url = `${base}/devpages/play.html?auto&quiet&shot${opt.webgl ? '&webgl' : ''}`;

await mkdir(out, { recursive: true });
const browser = await launchChrome();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const logs = collectLogs(page, { types: ['error'] });
await page.goto(url, { waitUntil: 'load' });
await page.waitForFunction(() => window.__dev?.ready === true && window.__dev.session(), null, {
  timeout: 90000,
});
await page.waitForTimeout(1500);

const npcs = await page.evaluate(() => window.__dev.session().npcs.list.map((n) => n.spec.id));
const shots = [];
for (const id of npcs) {
  await page.evaluate((npcId) => {
    const s = window.__dev.session();
    const n = s.npcs.list.find((v) => v.spec.id === npcId);
    if (!n) return;
    if (npcId === 'child') {
      n.talking = true;
      n.character.setSpeed(0);
      n.character.play('idle');
    }
    const seated = n.spec.clip === 'sit';
    const d = npcId === 'lookout' ? 3.2 : 2.5;
    const h = n.heading;
    const targetY = n.y + (seated ? 0.78 : 1.08);
    const eyeY = targetY + (npcId === 'lookout' ? 0.65 : 0.38);
    const overrides = {
      fisherman: { x: -112.4, y: 3.15, z: -104.45, tx: -109.85, ty: 2.45, tz: -104.5 },
      old_sailor: { x: -85.8, y: 3.1, z: -63.6, tx: -88.5, ty: 3.05, tz: -66.8 },
    };
    s.camera.frame(
      overrides[npcId] ?? {
        x: n.x + Math.sin(h) * d,
        y: eyeY,
        z: n.z + Math.cos(h) * d,
        tx: n.x,
        ty: targetY,
        tz: n.z,
      },
    );
  }, id);
  await page.waitForTimeout(id === 'child' ? 650 : 1250);
  const path = join(out, `npc-${tag}-${id}.png`);
  await page.screenshot({ path });
  shots.push(path);
}

const cards = await Promise.all(
  shots.map(async (path) => {
    const src = `data:image/png;base64,${(await readFile(path)).toString('base64')}`;
    return `<figure><figcaption>${basename(path)}</figcaption><img src="${src}" /></figure>`;
  }),
);
const sheet = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await sheet.setContent(`
  <!doctype html>
  <html>
    <head>
      <style>
        body { margin: 0; padding: 12px; background: #f8f4ea; font: 13px system-ui, sans-serif; }
        main { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
        figure { margin: 0; padding: 6px; background: white; border: 1px solid #d8c8a8; }
        figcaption { margin-bottom: 4px; color: #203040; font-weight: 700; }
        img { display: block; width: 100%; aspect-ratio: 16 / 9; object-fit: cover; }
      </style>
    </head>
    <body><main>${cards.join('')}</main></body>
  </html>
`);
const sheetPath = join(out, `npc-${tag}-contact-sheet.png`);
await sheet.screenshot({ path: sheetPath, fullPage: true });
await browser.close();

console.log(JSON.stringify({ base, url, shots, sheet: sheetPath, logs }, null, 2));
if (logs.length) process.exitCode = 1;
