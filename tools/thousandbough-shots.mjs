#!/usr/bin/env node
// Thousand-Bough Isle's hero shots (docs/specs/ISLAND-02-thousand-bough.md §2.8, §12.2) on the dev cove
// page: the camera is posed directly (no walking), at the island's authored dusk (17.77 h, azimuth
// 13.5), after the island has streamed in and settled. JPEGs named <shot>-<tier>-<backend>.jpg.
// Needs a no-HMR dev server:
//   npx vite --config tools/vite.nohmr.config.mjs --host 127.0.0.1 --port 5385 --strictPort
// node tools/thousandbough-shots.mjs [--base=http://127.0.0.1:5385] [--tiers=high,lite] [--webgl]
//   [--shots=H1,H2] [--out=<dir>] [--size=1920x1080] [--time=17.77] [--settle=4000]
// Exits 1 when a daylight shot has more than 2% near-black pixels (a broken material draws black).
import { mkdirSync } from 'node:fs';
import sharp from 'sharp';
import { collectLogs, launchChrome, parseFlags, parseSize } from './lib/browser.mjs';

const opt = parseFlags();
const base = String(opt.base || 'http://127.0.0.1:5385');
const tiers = String(opt.tiers || 'high,lite').split(',');
const out = String(opt.out || 'docs/reviews/island-02');
const size = parseSize(opt.size || '1920x1080');
const backend = opt.webgl ? 'webgl2' : 'webgpu';
const settle = Number(opt.settle ?? 4000);
const HOURS = Number(opt.time ?? 17.77);
const AZ = 13.5;

/** [camera, target, hours?] per shot; the spec's hero shots first, then the acceptance extras. */
const SHOTS = {
  H1: [
    [1700, 12, -1020],
    [2010, 48, -1560],
  ],
  H2: [
    [1932.5, 6.4, -1362],
    [1975, 22, -1520],
  ],
  H3: [
    [1980, 16.5, -1532],
    [2010, 24, -1556],
  ],
  H4: [
    [2001, 33.6, -1532],
    [1931, 5, -1372],
  ],
  H5: [
    [2010, 36, -1596],
    [2008, 21, -1626],
  ],
  H6: [
    [2026, 34, -1626],
    [2056, 24, -1578],
  ],
  // A little higher than the spec's 52.3, over the sea side's low rail (it no longer crosses the view).
  H7: [
    [2010, 54, -1546],
    [1931, 4, -1372],
  ],
  crownDeck: [
    [2030, 58, -1528],
    [2008, 54, -1558],
  ],
  rootGate: [
    [1972, 19.5, -1522],
    [1996, 22, -1546],
  ],
  landing: [
    [1937.6, 8.6, -1367.5],
    [1990, 37, -1536],
  ],
  practiceBough: [
    [2005, 35, -1520],
    [2022, 33, -1531],
  ],
  coveEast: [
    [1946, 7, -1352],
    [1960, 2, -1405],
  ],
  mirrorPath: [
    [2078, 22, -1572],
    [2118, 15, -1606],
  ],
  port5173: [
    [2046, 29, -1566],
    [2062, 28, -1593],
  ],
  H8: [
    [1960, 30, -1470],
    [2010, 40, -1560],
  ],
  // Port Meridian's ridge hides the tree from its quay and citadel; it breaks the horizon as you clear
  // the town's north-east shore (1.06 km out).
  H9: [
    [1150, 9, -680],
    [2010, 50, -1560],
  ],
  H10: [
    [2150, 20.5, -1640],
    [2120, 15, -1595],
  ],
  sea400: [
    [1820, 10, -1180],
    [2010, 45, -1560],
  ],
  base: [
    [1972, 20.5, -1522],
    [2008, 30, -1558],
  ],
  stair: [
    [2002, 26, -1538],
    [2022, 30, -1546],
  ],
  decks: [
    [1955, 40, -1500],
    [2015, 34, -1555],
  ],
  falls: [
    [2090, 22, -1560],
    [2140, 40, -1640],
  ],
  veil: [
    [1996, 24, -1632],
    [2010, 40, -1705],
  ],
  // Lanterns and fireflies as the light goes (the island's own dusk is 17.77 h; this is an hour on).
  dusk: [[1978, 22, -1522], [2012, 32, -1562], 18.15],
  duskWharf: [[1945, 4.6, -1436], [2000, 26, -1550], 19.2],
  aerial: [
    [1650, 380, -1050],
    [2030, 0, -1520],
  ],
};

const want = opt.shots ? String(opt.shots).split(',') : Object.keys(SHOTS);
mkdirSync(out, { recursive: true });
const browser = await launchChrome();
const report = [];
const failures = [];
for (const tier of tiers) {
  const page = await browser.newPage({ viewport: size });
  const logs = collectLogs(page, { types: ['error'] });
  const url = `${base}/devpages/cove.html?tier=${tier}&time=${HOURS}&az=${AZ}&shot${opt.webgl ? '&webgl' : ''}`;
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__dev?.ready === true, null, { timeout: 180000 });
  // Bring the camera over the island so it streams in, and wait for its world.
  await page.evaluate(() => {
    window.__dev.setCam([1900, 40, -1300], [2010, 30, -1560]);
    void window.__dev.cove.islands['thousand-bough'].load();
  });
  await page.waitForFunction(() => !!window.__dev.cove.islands['thousand-bough'].world, null, {
    timeout: 180000,
  });
  await page.waitForTimeout(3000);
  // Round 1's start board (spec §5.3) on the terrace, so the puzzle shots show the flumes.
  await page.evaluate(() => {
    const S = (k, r) => ({ kind: k, rot: r });
    const rows = [
      [S('elbow', 3), S('elbow', 0), S('straight', 0), S('elbow', 3), S('elbow', 0)],
      [S('straight', 1), S('rock', 0), S('straight', 0), S('rock', 0), S('straight', 1)],
      [S('straight', 0), S('elbow', 0), S('straight', 0), S('elbow', 3), S('straight', 0)],
      [S('straight', 0), S('straight', 0), S('straight', 0), S('straight', 0), S('straight', 0)],
    ];
    window.__dev.cove.islands['thousand-bough'].world.flume.setBoard(rows, false);
  });
  for (const name of want) {
    const s = SHOTS[name];
    if (!s) continue;
    await page.evaluate(
      ([cam, target, hours, az]) => {
        window.__dev.setTime(hours, az);
        window.__dev.setCam(cam, target);
      },
      [s[0], s[1], s[2] ?? HOURS, AZ],
    );
    await page.waitForTimeout(settle);
    const path = `${out}/${name}-${tier}-${backend}.jpg`;
    const png = await page.screenshot({ type: 'png' });
    await sharp(png).jpeg({ quality: 88 }).toFile(path);
    // A broken material draws pure black (a NaN in a shader; the palm lesson in the skill; deep shade
    // stays above it): in a
    // daylight shot, no more than 2% of the frame may be near black.
    const { data, info } = await sharp(png).resize(320).raw().toBuffer({ resolveWithObject: true });
    let black = 0;
    for (let i = 0; i < data.length; i += info.channels) if (data[i] + data[i + 1] + data[i + 2] < 4) black++;
    const blackShare = black / (info.width * info.height);
    const day = (s[2] ?? HOURS) < 18;
    if (day && blackShare > 0.02)
      failures.push(`${name} ${tier}: ${(blackShare * 100).toFixed(1)}% near-black pixels`);
    const stats = await page.evaluate(() => {
      const r = window.__dev.cove;
      return { programs: r && window.__isles?.programs?.() };
    });
    report.push({ tier, name, path, blackShare, ...stats });
    console.log(path);
  }
  if (logs.length) console.log(`[${tier}] errors:\n${logs.join('\n')}`);
  await page.close();
}
await browser.close();
if (failures.length) {
  console.error(`FAIL: black pixels (a broken material?)\n${failures.join('\n')}`);
  process.exit(1);
}
