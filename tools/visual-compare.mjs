#!/usr/bin/env node
// Simple PNG baseline comparator using browser canvas decoding.
// node tools/visual-compare.mjs --base=tests/visual/baseline --candidate=test-results/visual --tolerance=0.015
import { readFile, readdir, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { launchChrome, parseFlags } from './lib/browser.mjs';

const opt = parseFlags();
const baseDir = resolve(String(opt.base || 'tests/visual/baseline'));
const candidateDir = resolve(String(opt.candidate || 'test-results/visual'));
const tolerance = Number(opt.tolerance || 0.015);
const maxMean = Number(opt.mean || 4.5);

async function pngs(dir) {
  return (await readdir(dir)).filter((f) => f.endsWith('.png')).sort();
}

const dataUrl = async (path) => `data:image/png;base64,${(await readFile(path)).toString('base64')}`;

const files = await pngs(baseDir);
const browser = await launchChrome({ gpu: false });
const page = await browser.newPage();
const results = [];
for (const file of files) {
  const bPath = join(candidateDir, file);
  try {
    await stat(bPath);
  } catch {
    results.push({ file, ok: false, error: 'missing candidate' });
    continue;
  }
  // Data URLs, since Chrome won't decode file:// images into a blank page's canvas.
  const a = await dataUrl(join(baseDir, file));
  const b = await dataUrl(bPath);
  const r = await page.evaluate(
    async ({ a, b }) => {
      async function load(url) {
        const img = new Image();
        img.src = url;
        await img.decode();
        const c = document.createElement('canvas');
        c.width = img.naturalWidth;
        c.height = img.naturalHeight;
        const ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0);
        return { w: c.width, h: c.height, data: ctx.getImageData(0, 0, c.width, c.height).data };
      }
      const A = await load(a),
        B = await load(b);
      if (A.w !== B.w || A.h !== B.h)
        return { mismatch: 1, mean: 255, pixels: 0, size: [A.w, A.h, B.w, B.h] };
      let changed = 0,
        sum = 0;
      const pixels = A.w * A.h;
      for (let i = 0; i < A.data.length; i += 4) {
        const dr = Math.abs(A.data[i] - B.data[i]);
        const dg = Math.abs(A.data[i + 1] - B.data[i + 1]);
        const db = Math.abs(A.data[i + 2] - B.data[i + 2]);
        const da = Math.abs(A.data[i + 3] - B.data[i + 3]);
        const d = Math.max(dr, dg, db, da);
        sum += (dr + dg + db) / 3;
        if (d > 18) changed += 1;
      }
      return { mismatch: changed / pixels, mean: sum / pixels, pixels };
    },
    { a, b },
  );
  results.push({ file, ...r, ok: r.mismatch <= tolerance && r.mean <= maxMean });
}
await browser.close();
const ok = results.every((r) => r.ok);
console.log(JSON.stringify({ ok, tolerance, maxMean, results }, null, 2));
if (!ok) process.exit(1);
