#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { collectLogs, launchChrome, parseFlags, waitForTitle } from './lib/browser.mjs';

const opt = parseFlags();
const base = opt.base || 'http://127.0.0.1:5461';
const out = opt.out || 'cloud-quality';
const frames = Number(opt.frames || 48);
const wait = Number(opt.wait || 3000);
const viewport = { width: 1600, height: 900 };
const target = opt.target;
const before = opt.before;
if (!target || !before) {
  console.error(
    'Usage: node tools/cloud-quality-probe.mjs --target=<reference.png> --before=<before.png> [--base=<url>]',
  );
  process.exit(1);
}

await fs.mkdir(out, { recursive: true });

const experiments = [
  { id: 'a-still-wind0', wind: 0, still: true },
  { id: 'b-orbit-wind0', wind: 0, still: false },
  { id: 'c-still-wind25', wind: 2.5, still: true },
  { id: 'd-today-orbit-wind25', wind: 2.5, still: false },
];

const browser = await launchChrome({ autoplay: true });
const results = [];
try {
  for (const surface of ['title', 'cove']) {
    if (opt.surface && opt.surface !== surface) continue;
    for (const exp of experiments) {
      if (opt.experiment && opt.experiment !== exp.id) continue;
      try {
        const result = await runExperiment(browser, surface, exp);
        results.push(result);
        await fs.writeFile(path.join(out, 'metrics.json'), JSON.stringify(results, null, 2));
      } catch (error) {
        results.push({ surface, experiment: exp.id, error: String(error?.message ?? error) });
        await fs.writeFile(path.join(out, 'metrics.json'), JSON.stringify(results, null, 2));
      }
    }
  }
  await makeReferences(results);
  await fs.writeFile(path.join(out, 'metrics.json'), JSON.stringify(results, null, 2));
  console.log(JSON.stringify({ out, results }, null, 2));
} finally {
  await browser.close();
}

async function runExperiment(browser, surface, exp) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  try {
    await context.addInitScript(() => localStorage.clear());
    const page = await context.newPage();
    const logs = collectLogs(page);
    const url =
      surface === 'title'
        ? `${base}/?debug&tier=high&skipBenchmark&cloudWind=${exp.wind}`
        : `${base}/devpages/cove.html?shot&tier=high&view=harbor&cloudWind=${exp.wind}`;
    await page.goto(url, { waitUntil: 'load' });
    if (surface === 'title') {
      await waitForTitle(page, 90_000);
      await page.evaluate((still) => window.__flow?.updateSettings?.({ reducedMotion: still }), exp.still);
    } else {
      await page.waitForFunction(() => window.__dev?.ready === true, null, { timeout: 90_000 });
      await page.evaluate(() => window.__dev?.shot?.('W4'));
    }
    await page.waitForTimeout(wait);
    const info = await page.evaluate(() => window.__isles?.info?.() ?? window.__dev?.stats?.() ?? null);
    const hitches = await page.evaluate(() => window.__isles?.hitches?.() ?? []);
    const dir = path.join(out, `${surface}-${exp.id}`);
    await fs.mkdir(dir, { recursive: true });
    const images = await captureFrames(page, surface, exp.still, frames);
    for (let i = 0; i < images.length; i++) {
      const png = images[i];
      const framePath = path.join(dir, `frame-${String(i).padStart(2, '0')}.png`);
      if (i === 0) await fs.writeFile(framePath, png);
    }
    const first = images[0];
    const meta = await sharp(first).metadata();
    const crop = cropFor(surface, meta.width ?? viewport.width, meta.height ?? viewport.height);
    await sharp(first)
      .extract(crop)
      .png()
      .toFile(path.join(out, `${surface}-${exp.id}-crop.png`));
    if (surface === 'title' && exp.id === 'd-today-orbit-wind25') {
      await makeSheet(images, crop, path.join(out, 'title-48-frame-orbit-crop-sheet.png'));
    }
    const metrics = await measure(images, crop);
    return {
      surface,
      experiment: exp.id,
      wind: exp.wind,
      still: exp.still,
      crop,
      metrics,
      info,
      hitches,
      logs: logs.slice(0, 20),
    };
  } finally {
    await context.close().catch(() => {});
  }
}

async function captureFrames(page, surface, still, count) {
  const urls = await page.evaluate(
    async ({ surface, still, count }) => {
      const canvas = document.querySelector('canvas');
      const output = [];
      for (let i = 0; i < count; i++) {
        if (surface === 'cove' && !still) {
          const target = [-115, 6, -70];
          const base = [-20, 22, -175];
          const dx = base[0] - target[0];
          const dz = base[2] - target[2];
          const a = i * 0.0026;
          const c = Math.cos(a);
          const s = Math.sin(a);
          window.__dev?.setCam?.([target[0] + dx * c - dz * s, base[1], target[2] + dx * s + dz * c], target);
        }
        await new Promise((resolve) => requestAnimationFrame(() => resolve()));
        output.push(canvas.toDataURL('image/png'));
      }
      return output;
    },
    { surface, still, count },
  );
  return urls.map((dataUrl) => Buffer.from(dataUrl.split(',')[1], 'base64'));
}

function cropFor(surface, width, height) {
  if (surface === 'title') {
    const left = Math.min(Math.round(width * 0.64), Math.max(0, width - 520));
    return { left, top: 0, width: width - left, height: Math.round(height * 0.56) };
  }
  return { left: 0, top: 0, width, height: Math.round(height * 0.58) };
}

async function measure(buffers, crop) {
  const frames = [];
  for (const buffer of buffers) {
    const { data, info } = await sharp(buffer)
      .extract(crop)
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    frames.push({ data, info });
  }
  const { width, height, channels } = frames[0].info;
  const pixels = width * height;
  const sum = new Float64Array(pixels);
  const sum2 = new Float64Array(pixels);
  const meanRgb = new Float64Array(pixels * 3);
  for (const frame of frames) {
    for (let p = 0, j = 0; p < pixels; p++, j += channels) {
      const r = frame.data[j];
      const g = frame.data[j + 1];
      const b = frame.data[j + 2];
      const y = luma(r, g, b);
      sum[p] += y;
      sum2[p] += y * y;
      meanRgb[p * 3] += r;
      meanRgb[p * 3 + 1] += g;
      meanRgb[p * 3 + 2] += b;
    }
  }
  const mask = new Uint8Array(pixels);
  let maskCount = 0;
  for (let p = 0; p < pixels; p++) {
    const r = meanRgb[p * 3] / frames.length;
    const g = meanRgb[p * 3 + 1] / frames.length;
    const b = meanRgb[p * 3 + 2] / frames.length;
    const y = luma(r, g, b);
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const sat = max > 0 ? (max - min) / max : 0;
    if (y > 112 && sat < 0.42 && b < r + 72) {
      mask[p] = 1;
      maskCount++;
    }
  }
  let std = 0;
  for (let p = 0; p < pixels; p++) {
    if (!mask[p]) continue;
    const m = sum[p] / frames.length;
    std += Math.sqrt(Math.max(0, sum2[p] / frames.length - m * m));
  }
  std /= Math.max(1, maskCount);

  let hf = 0;
  let hfCount = 0;
  const first = frames[0].data;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const p = y * width + x;
      if (!mask[p]) continue;
      const c = lumAt(first, channels, width, x, y);
      const lap =
        Math.abs(
          lumAt(first, channels, width, x - 1, y) +
            lumAt(first, channels, width, x + 1, y) +
            lumAt(first, channels, width, x, y - 1) +
            lumAt(first, channels, width, x, y + 1) -
            c * 4,
        ) / 255;
      hf += lap;
      hfCount++;
    }
  }
  hf /= Math.max(1, hfCount);
  return { cloudPixels: maskCount, temporalStdDev: std, highFrequencyEnergy: hf };
}

function lumAt(data, channels, width, x, y) {
  const j = (y * width + x) * channels;
  return luma(data[j], data[j + 1], data[j + 2]);
}

function luma(r, g, b) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

async function makeSheet(images, crop, file) {
  const thumbW = Math.round(crop.width / 4);
  const thumbH = Math.round(crop.height / 4);
  const cols = 8;
  const rows = Math.ceil(images.length / cols);
  const composites = [];
  for (let i = 0; i < images.length; i++) {
    const input = await sharp(images[i]).extract(crop).resize(thumbW, thumbH).png().toBuffer();
    composites.push({ input, left: (i % cols) * thumbW, top: Math.floor(i / cols) * thumbH });
  }
  await sharp({
    create: { width: cols * thumbW, height: rows * thumbH, channels: 3, background: '#87b7ea' },
  })
    .composite(composites)
    .png()
    .toFile(file);
}

async function makeReferences(results) {
  const titleAfter = path.join(out, 'title-d-today-orbit-wind25-crop.png');
  const refs = [];
  for (const [name, file] of [
    ['tidewater-target.png', target],
    ['ours-before-user.png', before],
    ['ours-after-title.png', titleAfter],
  ]) {
    try {
      const data = await sharp(file).resize({ width: 520, height: 300, fit: 'inside' }).png().toBuffer();
      refs.push({ name, data });
      await fs.writeFile(path.join(out, name), await sharp(file).png().toBuffer());
    } catch {
      results.push({ reference: name, missing: file });
    }
  }
  if (!refs.length) return;
  let x = 0;
  await sharp({
    create: { width: 520 * refs.length, height: 300, channels: 3, background: '#cfe7ff' },
  })
    .composite(
      refs.map((ref) => {
        const c = { input: ref.data, left: x, top: 0 };
        x += 520;
        return c;
      }),
    )
    .png()
    .toFile(path.join(out, 'side-by-side-tidewater-before-after.png'));
}
