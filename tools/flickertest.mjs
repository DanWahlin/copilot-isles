#!/usr/bin/env node
// Flicker and z-fighting check. For fixed camera views on Anchorage Cay, Port Meridian and
// Thousand-Bough Isle (the Test
// Cove dev page), it freezes all motion and then:
//   (a) still: draws the same frame several times and diffs them. With time held, any change is
//       flicker (unstable shading, compute noise, something still animating).
//   (b) jitter: shifts the projection by sub-pixel steps along a diagonal (camera.setViewOffset) and
//       follows each pixel through the series. A static edge crossing a pixel changes it once (a thin
//       wire twice); faces fighting for the same depth flip it back and forth. Pixels with 3 or more
//       big changes are "noisy"; 16 px tiles that are mostly noisy merge into reported regions, each
//       labelled with the object under its centre.
//   (c) dolly: moves the camera forward by 0.2 mm steps (no pan). Only depth changes, so faces that
//       fight swap; flips from (b) and (c) add up.
// Each region also lists the nearest raycast hits under its centre. When the two nearest solid hits
// are under 5 cm apart, the region is flagged `stacked` (printed as a suspect): that is z-fighting.
// Alpha-tested foliage (palms, grass, impostors) and thin rigging also shimmer under (b), with AA off;
// they're aliasing, not z-fighting, and show as unstacked regions. Diffs use ?notaa on purpose: TAA
// would smear a fight into soft shimmer that's harder to measure.
// Expected motion is frozen, not masked: the clock is paused (waves, foam, wind, clouds, life and
// shader time all read the sim clock), the frame loop stops, frame systems run with dt ≈ 0, temporal
// AA, auto exposure and grain are off (?notaa&noautoexposure&nograin), and the render scale is fixed
// at 1. Any pixel that still changes in (a) is reported, then masked out of (b). The clouds can't hold
// fully still: their 4x4 ordered dither re-traces part of each block every frame, so cloud edges keep
// a small still change (up to about 0.05% in a sky-heavy view); --max-still allows for it.
// --audit adds the static coplanar-face audit (src/dev/coplanar-audit.ts) once per island.
// Needs the dev server (npm run dev, port 5301). Exits 1 when a view goes over a threshold.
// node tools/flickertest.mjs [--base=http://127.0.0.1:5301] [--out=test-results/flicker]
//   [--views=name,name] [--size=1280x720] [--frames=4] [--steps=8] [--tier=high] [--webgl]
//   [--max-still=0.001] [--max-noisy=0.002] [--audit] [--list]
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import sharp from 'sharp';
import { collectLogs, launchChrome, parseFlags, parseSize } from './lib/browser.mjs';

/** [name, island, camera position, orbit target, what it covers]. */
const VIEWS = [
  ['harbor', 'anchorage', [-40, 14, -150], [-112, 3, -80], 'harbour, quay, village roofs'],
  ['pier', 'anchorage', [-110, 3.6, -92], [-108, 2.6, -124], 'pier planks to the pier head'],
  ['quay', 'anchorage', [-104, 4.5, -82], [-117, 3, -62], 'quay paving, doors, chart table'],
  ['fishing-dock', 'anchorage', [-67, 2.6, -158], [-76, 0.8, -167], 'fishing jetty close up'],
  ['fishing-pier', 'anchorage', [-108, 4, -122], [-76, 1, -167], 'jetty and shore foam'],
  ['mill', 'anchorage', [-54, 5.5, -59], [-62, 1.6, -64], 'mill race terrace and tiles'],
  ['village', 'anchorage', [-150, 9, -10], [-112, 5, -50], 'houses, roofs, paths'],
  ['roofs', 'anchorage', [-95, 18, -40], [-118, 6, -62], 'roofs and chimneys from above'],
  ['ridge', 'anchorage', [-116, 21, -47], [-125.4, 17.2, -55.8], 'roof ridges and tiles close up'],
  ['lighthouse', 'anchorage', [-158, 23, -82], [-168, 20.4, -93], 'lighthouse gallery and lantern'],
  ['beach', 'anchorage', [-10, 2.4, 92], [40, 1.2, 100], 'south beach, shoreline foam'],
  ['headland', 'anchorage', [300, 30, -30], [160, 25, -5], 'terrain and rock seams'],
  ['stack', 'anchorage', [330, 12, 290], [270, 18, 210], 'sea stack rocks'],
  ['approach', 'anchorage', [-330, 10, -330], [-100, 8, -80], 'island from the sea, far ranges'],
  ['m-harbor', 'meridian', [570, 24, -610], [700, 10, -735], 'Meridian harbour and mole'],
  ['m-quay', 'meridian', [692, 6, -762], [650, 2.4, -754], 'Meridian quay paving close up'],
  ['m-town', 'meridian', [610, 82, -610], [855, 32, -875], 'terraced town, roofs, roads'],
  ['m-plaza', 'meridian', [690, 22, -770], [660, 8, -800], 'plaza paving and houses'],
  ['m-market', 'meridian', [669.6, 9.9, -789.6], [679, 9.7, -787.3], 'Model Market: boards, awning, counter'],
  ['m-fort', 'meridian', [786, 50, -760], [806, 41, -780], 'Meridian fort: walls, towers, roofs'],
  ['m-citadel', 'meridian', [890, 105, -855], [1028, 64, -1002], 'citadel walls'],
  ['m-ridge', 'meridian', [910, 118, -780], [1110, 92, -1078], 'ridge rocks, distant ranges'],
  [
    'tb-wharf',
    'thousand-bough',
    [1925, 8, -1395],
    [1945, 2.4, -1430],
    'Root Wharf, Bough Landing, boathouse',
  ],
  ['tb-roothall', 'thousand-bough', [1985, 24, -1600], [2010, 19, -1560], 'Root Hall, stair foot, plinth'],
  ['tb-stair', 'thousand-bough', [1978, 31, -1578], [2008, 26, -1560], 'Great Stair, rails, decks'],
  ['tb-bridge', 'thousand-bough', [1984, 38, -1522], [2016, 31, -1527], 'rope bridge R1 and decks'],
  ['tb-flume', 'thousand-bough', [2010, 36, -1596], [2008, 21, -1626], 'Flume Terrace tiles and gates'],
  ['tb-crown', 'thousand-bough', [2035, 58, -1530], [2010, 51, -1556], 'Crown Deck, beacon, rail'],
];

const opt = parseFlags(process.argv.slice(2));
if (opt.list) {
  for (const [name, island, , , what] of VIEWS)
    console.log(`${name.padEnd(14)} ${island.padEnd(10)} ${what}`);
  process.exit(0);
}
const base = String(opt.base || 'http://127.0.0.1:5301');
const out = resolve(String(opt.out || 'test-results/flicker'));
const size = parseSize(opt.size || '1280x720');
const frames = Number(opt.frames || 4);
const steps = Number(opt.steps || 8);
const maxStill = Number(opt['max-still'] ?? 0.001);
const maxNoisy = Number(opt['max-noisy'] ?? 0.002);
const pick = opt.views ? new Set(String(opt.views).split(',')) : null;
const views = VIEWS.filter(([name]) => !pick || pick.has(name));
if (!views.length) throw new Error(`no such view: ${opt.views} (see --list)`);

/** A pixel channel change this big (0-255) counts as a change. */
const CHANGE = 24;
/** A still-frame change this big counts as flicker (frames should match exactly). */
const STILL_CHANGE = 6;
const TILE = 16;
/** A tile is noisy when this share of its pixels is solid noise. */
const TILE_SHARE = 0.04;
/** Frozen frames drawn before measuring. */
const WARM_FRAMES = 64;
/** Camera moves this far forward (metres) per dolly step: well under a pixel of parallax. */
const DOLLY_STEP = 0.0002;

await mkdir(out, { recursive: true });
const params = new URLSearchParams({ tier: String(opt.tier || 'high'), time: '16.33' });
for (const flag of ['shot', 'notaa', 'noautoexposure', 'nograin']) params.set(flag, '');
if (opt.webgl) params.set('webgl', '');
const browser = await launchChrome();
const page = await browser.newPage({ viewport: size, deviceScaleFactor: 1 });
const logs = collectLogs(page);
await page.goto(`${base}/devpages/cove.html?${params.toString().replace(/=(&|$)/g, '$1')}`, {
  waitUntil: 'load',
});
await page.waitForFunction(() => window.__dev?.ready === true, null, { timeout: 180_000 });
const S = (f, a) => page.evaluate(f, a);
await page.waitForTimeout(3000);

/** Draws one frozen frame (projection offset in pixels) and returns its RGBA pixels. */
async function grab(jx = 0, jy = 0, dolly = 0) {
  await S(
    ([x, y, d]) =>
      new Promise((done) => {
        window.__dev.still(x, y, d);
        requestAnimationFrame(() => requestAnimationFrame(done));
      }),
    [jx, jy, dolly],
  );
  const png = await page.screenshot({ type: 'png' });
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, w: info.width, h: info.height, png };
}

function maxChannelDiff(a, b, i) {
  return Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]), Math.abs(a[i + 2] - b[i + 2]));
}

/** Connected noisy tiles → regions (pixel boxes). */
function regionsOf(noisyTile, tw, th) {
  const seen = new Uint8Array(tw * th);
  const regions = [];
  for (let t = 0; t < tw * th; t++) {
    if (!noisyTile[t] || seen[t]) continue;
    const stack = [t];
    seen[t] = 1;
    let x0 = Infinity,
      y0 = Infinity,
      x1 = -1,
      y1 = -1,
      tiles = 0;
    while (stack.length) {
      const c = stack.pop();
      const cx = c % tw,
        cy = (c / tw) | 0;
      tiles++;
      x0 = Math.min(x0, cx);
      y0 = Math.min(y0, cy);
      x1 = Math.max(x1, cx);
      y1 = Math.max(y1, cy);
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const nx = cx + dx,
          ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= tw || ny >= th) continue;
        const n = ny * tw + nx;
        if (!noisyTile[n] || seen[n]) continue;
        seen[n] = 1;
        stack.push(n);
      }
    }
    regions.push({ x: x0 * TILE, y: y0 * TILE, w: (x1 - x0 + 1) * TILE, h: (y1 - y0 + 1) * TILE, tiles });
  }
  return regions.sort((a, b) => b.tiles - a.tiles);
}

const YELLOW = [255, 220, 0];
const RED = [255, 40, 40];
const PURPLE = [150, 60, 160];

/** Darkened frame: still flicker yellow, solid noise red, other noisy pixels (wires) purple, regions cyan. */
async function writeMap(path, base, still, noisy, solid, regions, w, h) {
  const img = Buffer.alloc(w * h * 3);
  for (let p = 0; p < w * h; p++) {
    const i = p * 4;
    const mark = still[p] ? YELLOW : solid[p] ? RED : noisy[p] ? PURPLE : null;
    if (mark) img.set(mark, p * 3);
    else img.set([base[i] * 0.35, base[i + 1] * 0.35, base[i + 2] * 0.35], p * 3);
  }
  for (const R of regions.slice(0, 20)) {
    for (let x = R.x; x < Math.min(w, R.x + R.w); x++)
      for (const y of [R.y, Math.min(h - 1, R.y + R.h - 1)]) img.set([0, 255, 255], (y * w + x) * 3);
    for (let y = R.y; y < Math.min(h, R.y + R.h); y++)
      for (const x of [R.x, Math.min(w - 1, R.x + R.w - 1)]) img.set([0, 255, 255], (y * w + x) * 3);
  }
  await sharp(img, { raw: { width: w, height: h, channels: 3 } })
    .png()
    .toFile(path);
}

const results = [];
const audits = {};
let meridianLoaded = false;
let thousandBoughLoaded = false;
// Vite reloads the page when anyone edits a source file; a view measured across a reload is redone.
let loads = 0;
page.on('framenavigated', (frame) => {
  if (frame === page.mainFrame()) loads++;
});
for (const view of views) {
  for (let attempt = 1; ; attempt++) {
    const before = loads;
    try {
      const r = await measure(view);
      if (loads === before) {
        results.push(r);
        console.error(
          `${r.ok ? 'ok  ' : 'FAIL'} ${r.view.padEnd(13)} still ${pct(r.still)}  noisy ${pct(r.noisy)}  solid ${pct(r.solid)}  in regions ${pct(r.inRegions)}  ${r.regions.length} regions`,
        );
        for (const R of r.regions.filter((R) => R.stacked))
          console.error(
            `       stacked faces at ${R.x},${R.y} (${R.w}x${R.h} px): ${R.objects.slice(0, 2).join(' / ')}`,
          );
        break;
      }
    } catch (error) {
      await page.waitForTimeout(1000);
      if (loads === before) throw error;
    }
    if (attempt >= 3) throw new Error(`${view[0]}: the page kept reloading (dev server HMR)`);
    console.error(`     ${view[0]}: the page reloaded (HMR), measuring again`);
    await page.waitForFunction(() => window.__dev?.ready === true, null, { timeout: 180_000 });
    await page.waitForTimeout(3000);
    meridianLoaded = false;
    thousandBoughLoaded = false;
  }
}

function pct(share) {
  return `${(share * 100).toFixed(3)}%`;
}

/** Measures one view: freeze, still frames, jitter and dolly series, regions, images. */
async function measure([name, island, cam, target, what]) {
  await S(() => window.__dev.freeze(false));
  if (island === 'meridian' && !meridianLoaded) {
    await S(async () => void (await window.__dev.cove.meridian.load()));
    meridianLoaded = true;
  }
  if (island === 'thousand-bough' && !thousandBoughLoaded) {
    await S(async () => void (await window.__dev.cove.thousandBough.load()));
    thousandBoughLoaded = true;
  }
  await S(([c, t]) => window.__dev.setCam(c, t), [cam, target]);
  // Let streaming, LOD fades, impostors and the reflection settle at this view.
  await page.waitForTimeout(island === 'anchorage' ? 2500 : 5000);
  await S(() => window.__dev.freeze(true));
  // Progressive work (the clouds' 16-frame trace and 32-slot panorama) converges on a held frame.
  await S(async (n) => {
    for (let k = 0; k < n; k++) {
      window.__dev.still(0, 0);
      if (k % 8 === 7) await new Promise((done) => requestAnimationFrame(done));
    }
  }, WARM_FRAMES);
  await grab();

  // (a) still frames
  const still = [];
  for (let k = 0; k < frames; k++) still.push(await grab());
  const { w, h } = still[0];
  const stillMask = new Uint8Array(w * h);
  let stillCount = 0;
  for (let k = 1; k < still.length; k++)
    for (let p = 0; p < w * h; p++)
      if (!stillMask[p] && maxChannelDiff(still[0].data, still[k].data, p * 4) > STILL_CHANGE) {
        stillMask[p] = 1;
        stillCount++;
      }

  // (b) sub-pixel jitter along the diagonal (a straight path crosses a straight edge once)
  // and (c) tiny dolly steps forward (a depth-only change; fighting faces swap, solid faces don't).
  const flips = new Uint8Array(w * h);
  const countFlips = (series) => {
    for (let k = 1; k < series.length; k++)
      for (let p = 0; p < w * h; p++)
        if (maxChannelDiff(series[k - 1], series[k], p * 4) > CHANGE) flips[p]++;
  };
  const jitter = [];
  for (let k = 0; k < steps; k++) jitter.push((await grab(k / steps, k / steps)).data);
  countFlips(jitter);
  const dolly = [];
  for (let k = 0; k < steps; k++) dolly.push((await grab(0, 0, k * DOLLY_STEP)).data);
  countFlips(dolly);
  const noisy = new Uint8Array(w * h);
  const tw = Math.ceil(w / TILE),
    th = Math.ceil(h / TILE);
  const tileNoisy = new Uint16Array(tw * th);
  let noisyCount = 0;
  for (let p = 0; p < w * h; p++) {
    if (stillMask[p] || flips[p] < 3) continue;
    noisy[p] = 1;
    noisyCount++;
  }
  // Solid noise: noisy pixels with at least 5 noisy neighbours. Thin wires and rope edges make
  // 1-2 px lines (2-4 neighbours); faces fighting over depth make patches.
  const solid = new Uint8Array(w * h);
  let solidCount = 0;
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++) {
      const p = y * w + x;
      if (!noisy[p]) continue;
      const n =
        noisy[p - w - 1] +
        noisy[p - w] +
        noisy[p - w + 1] +
        noisy[p - 1] +
        noisy[p + 1] +
        noisy[p + w - 1] +
        noisy[p + w] +
        noisy[p + w + 1];
      if (n < 5) continue;
      solid[p] = 1;
      solidCount++;
      tileNoisy[((y / TILE) | 0) * tw + ((x / TILE) | 0)]++;
    }
  const noisyTile = Uint8Array.from(tileNoisy, (n) => (n >= TILE * TILE * TILE_SHARE ? 1 : 0));
  const regions = regionsOf(noisyTile, tw, th);
  let regionPixels = 0;
  for (const R of regions)
    for (let y = R.y; y < Math.min(h, R.y + R.h); y++)
      for (let x = R.x; x < Math.min(w, R.x + R.w); x++) regionPixels += solid[y * w + x];
  await S(() => window.__dev.still(0, 0));
  for (const R of regions.slice(0, 8)) {
    const nx = ((R.x + R.w / 2) / w) * 2 - 1;
    const ny = 1 - ((R.y + R.h / 2) / h) * 2;
    // Nearest hits first: two hits a few mm apart are the faces that fight.
    R.objects = await S(([x, y]) => window.__dev.pick(x, y).slice(0, 3), [nx, ny]);
    R.object = R.objects[0] ?? 'sky';
    // Two solid surfaces within a few cm of each other under the region: the likeliest z-fight.
    const [d0, d1] = R.objects.map((hit) => parseFloat(hit));
    R.stacked = R.objects.length > 1 && d1 - d0 < 0.05 && !/vegetation|rigging|sails/.test(R.objects[0]);
  }

  if (opt.audit && !audits[island]) {
    audits[island] = await S(() => {
      const a = window.__dev.coplanar();
      return { ...a, hits: a.hits.slice(0, 60), skipped: a.skipped.slice(0, 60) };
    });
  }
  await writeFile(join(out, `${name}.png`), still[0].png);
  await writeMap(join(out, `${name}-flicker.png`), still[0].data, stillMask, noisy, solid, regions, w, h);
  const r = {
    view: name,
    island,
    what,
    still: +(stillCount / (w * h)).toFixed(5),
    noisy: +(noisyCount / (w * h)).toFixed(5),
    solid: +(solidCount / (w * h)).toFixed(5),
    inRegions: +(regionPixels / (w * h)).toFixed(5),
    regions: regions.slice(0, 8),
  };
  r.ok = r.still <= maxStill && r.inRegions <= maxNoisy;
  return r;
}
await browser.close();
const ok = results.every((r) => r.ok);
const report = { ok, maxStill, maxNoisy, size, steps, frames, results, audits, logs: logs.slice(0, 20) };
await writeFile(join(out, 'report.json'), JSON.stringify(report, null, 1));
console.log(
  JSON.stringify(
    { ok, out, results: results.map(({ regions, ...r }) => ({ ...r, top: regions[0] })) },
    null,
    1,
  ),
);
if (!ok) process.exit(1);
