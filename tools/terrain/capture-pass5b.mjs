#!/usr/bin/env node
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

const opt = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, ...value] = arg.replace(/^--/, '').split('=');
    return [key, value.length ? value.join('=') : true];
  }),
);

const base = String(opt.base || 'http://localhost:5301').replace(/\/$/, '');
const out = String(opt.out || '.copilot/terrain-shots/pass5b');
const label = opt.label ? `${String(opt.label)}-` : '';
const viewport = parseSize(String(opt.size || '1600x900'));
const backends = opt.backend ? String(opt.backend).split(',') : ['webgpu', 'webgl2'];
const wait = Number(opt.wait || 2600);
const urlExtra = opt.urlExtra ? `&${String(opt.urlExtra).replace(/^&/, '')}` : '';

const SHOTS = {
  'leaps-camera': {
    camera: [
      [40, 12, 145],
      [34, 1.5, 35],
    ],
  },
  'beach-close': {
    camera: [
      [20, 4.5, 158],
      [170, 5, 96],
    ],
  },
  'b1-lagoon': {
    devShot: 'B1',
    camera: [
      [-46, 6.5, 205],
      [30, 1.2, 116],
    ],
  },
  'coast-flyby': {
    camera: [
      [0, 44, 500],
      [35, 8, 55],
    ],
  },
  'stack-headland-eye': {
    camera: [
      [300, 6, 245],
      [270, 14, 210],
    ],
  },
  'meridian-harbor-mouth': {
    camera: [
      [520, 7, -575],
      [716, 17, -772],
    ],
  },
};

const shotIds = opt.shots ? String(opt.shots).split(',') : Object.keys(SHOTS);

function parseSize(size) {
  const [width, height] = size.split('x').map(Number);
  return { width: width || 1600, height: height || 900 };
}

async function capture(browser, backend, id) {
  const shot = SHOTS[id];
  if (!shot) throw new Error(`Unknown shot ${id}`);
  const page = await browser.newPage({ viewport });
  const logs = [];
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') {
      logs.push(`[${message.type()}] ${message.text()}`);
    }
  });
  page.on('pageerror', (error) => logs.push(`[pageerror] ${error.message}`));
  const url = `${base}/devpages/cove.html?shot&tier=high&time=16.5${backend === 'webgl2' ? '&webgl' : ''}${urlExtra}`;
  await page.goto(url, { waitUntil: 'load', timeout: 120_000 });
  await page.waitForFunction(() => window.__dev?.ready === true, null, { timeout: 180_000 });
  if (shot.devShot) {
    await page.evaluate((devShot) => window.__dev.shot(devShot), shot.devShot);
  } else {
    await page.evaluate((camera) => window.__dev.setCam(camera[0], camera[1]), shot.camera);
  }
  await page.waitForTimeout(wait);
  const stats = await page.evaluate(() => window.__dev.stats());
  const path = `${out}/${backend}-${label}${id}.png`;
  await page.screenshot({ path });
  await writeFile(
    `${out}/${backend}-${label}${id}.json`,
    `${JSON.stringify({ out: path, url, shot: id, camera: shot.camera, stats, logs }, null, 2)}\n`,
  );
  await page.close();
  return { backend, id, path, url, stats, logs };
}

await mkdir(out, { recursive: true });
const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--use-angle=metal', '--ignore-gpu-blocklist', '--enable-unsafe-webgpu'],
});
const results = [];
try {
  for (const backend of backends) {
    for (const id of shotIds) results.push(await capture(browser, backend, id));
  }
} finally {
  await browser.close();
}
console.log(JSON.stringify({ out, results }, null, 2));
