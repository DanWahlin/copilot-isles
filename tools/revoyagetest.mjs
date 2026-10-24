#!/usr/bin/env node
// Three voyages in one page (issue 251): a voyage ending must not free anything the next one still
// draws. Title → new voyage (Anchorage) → title → Continue, board and sail into the passage battle,
// fire a few broadsides → title → Continue and travel to Port Meridian → title. Fails on any WebGPU
// validation error (a buffer or texture used after it was destroyed), page errors, hitches after a
// voyage's warm-up, or the title's renderer.info.memory differing from the first title's.
// node tools/revoyagetest.mjs [--base=http://localhost:5301] [--tier=medium] [--webgl]
import { collectLogs, launchChrome, parseFlags, waitForTitle } from './lib/browser.mjs';
import { passLearningPauses } from './lib/learning-cards.mjs';

const opt = parseFlags();
const base = opt.base || 'http://localhost:5301';
const tier = opt.tier || 'medium';
const url = `${base}/?debug&tier=${tier}${opt.webgl ? '&webgl' : ''}`;
const GPU_ERROR =
  /GPUValidationError|while destroyed|\[(Buffer|Texture|TextureView|BindGroup|RenderPipeline)\b/;

const browser = await launchChrome({ autoplay: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const logs = collectLogs(page, { types: ['error'] });
const fails = [];
const fail = (msg) => fails.push(msg);
// Chrome reports some WebGPU validation errors as warnings; count those too, per voyage.
let gpuErrors = 0;
page.on('console', (m) => {
  if (GPU_ERROR.test(m.text())) gpuErrors++;
});

const flow = (js) => page.evaluate(`window.__flow.${js}`);
const S = (js) => page.evaluate(`(() => { const s = window.__flow.debugSession; return ${js}; })()`);
const until = (screen, timeout = 240_000) =>
  page.waitForFunction((s) => window.__flow.getState().screen === s, screen, { timeout });
const memory = () =>
  page.evaluate(() => {
    const m = window.__flow.o.engine.renderer.info.memory;
    return { programs: m.programs, geometries: m.geometries, textures: m.textures };
  });

await page.goto(url, { waitUntil: 'load' });
await page.evaluate(() => localStorage.clear());
await waitForTitle(page, 120_000);
await page.waitForTimeout(8000);
const title0 = await memory();
const voyages = [];

/**
 * Starts or continues a voyage, skips the arrival, runs `play`, reads the hitches, runs `beforeQuit`
 * (debug jumps that aren't warmed, like marking quests done), then quits to the title.
 */
async function voyage(name, start, play, beforeQuit) {
  const errorsBefore = gpuErrors;
  if (start === 'new') {
    await flow('chooseCaptain()');
    await page.waitForTimeout(700);
    await flow("newVoyage('woman')");
  } else await flow('continueVoyage()');
  await until('playing');
  await page.waitForTimeout(1500);
  // Continue's "where you left off" card (and a due recap) come first.
  if (start !== 'new') await passLearningPauses(page);
  await S('s.debug.skipArrival()');
  await page.waitForFunction(() => window.__flow.debugSession.debug.state().mode === 'walk', null, {
    timeout: 20_000,
  });
  const note = await play();
  const hitches = await page.evaluate(() => window.__isles.hitches());
  await beforeQuit?.();
  await page.waitForTimeout(800);
  await flow('pause()');
  await flow('quitToTitle()');
  await until('title', 120_000);
  await page.waitForTimeout(9000);
  const title = await memory();
  const row = { name, gpuErrors: gpuErrors - errorsBefore, hitches: hitches.length, title, ...note };
  voyages.push(row);
  if (row.gpuErrors) fail(`${name}: ${row.gpuErrors} WebGPU validation errors`);
  if (hitches.length) fail(`${name}: ${hitches.length} hitches ${JSON.stringify(hitches.slice(0, 3))}`);
  for (const k of Object.keys(title0))
    if (title[k] !== title0[k]) fail(`${name}: title ${k} ${title0[k]} → ${title[k]}`);
}

/** Steers for (x, z) with A/D under sail until `done()` or `ms` runs out. */
async function sailToward(x, z, ms, done) {
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(2500);
  await page.keyboard.up('KeyW');
  const t0 = Date.now();
  let key = null;
  while (Date.now() - t0 < ms && !(await done())) {
    const st = await S('s.debug.state().ship');
    const want = Math.atan2(x - st.x, z - st.z);
    const d = Math.atan2(Math.sin(want - st.heading), Math.cos(want - st.heading));
    const next = Math.abs(d) < 0.08 ? null : d > 0 ? 'KeyA' : 'KeyD';
    if (next !== key) {
      if (key) await page.keyboard.up(key);
      if (next) await page.keyboard.down(next);
      key = next;
    }
    await page.waitForTimeout(150);
  }
  if (key) await page.keyboard.up(key);
}

// 1. A new voyage on Anchorage, with Chapter 00 marked done so the next one carries the Seal.
await voyage(
  'anchorage',
  'new',
  async () => {
    await page.waitForTimeout(8000);
    return {};
  },
  () =>
    S(
      "['Q0.2','Q0.3','Q0.4','Q0.5','Q0.6','Q0.7','Q0.8','Q0.9','Q0.10','Q0.11'].forEach((q) => s.debug.quest(q, 'done'))",
    ),
);

// 2. Continue, board and sail into the passage battle; fire a few broadsides (gun smoke and fog
// are sprites), then quit mid-battle.
await voyage('battle', 'continue', async () => {
  await S('s.debug.board()');
  await page.waitForFunction(() => window.__flow.debugSession.debug.state().mode === 'sail', null, {
    timeout: 20_000,
  });
  await page.waitForTimeout(2000);
  const started = () => S('!!s.debug.battleRun()?.started');
  await S('s.debug.sailTo(215, -360, 2.2)');
  await sailToward(747, -700, 90_000, started);
  if (!(await started())) {
    fail('battle: the battle never started');
    return { battle: false };
  }
  await page.waitForTimeout(700);
  if (await page.$('.bh-brief')) await page.keyboard.press('Enter');
  await page.waitForTimeout(4000);
  let shots = 0;
  const t0 = Date.now();
  while (shots < 3 && Date.now() - t0 < 40_000) {
    const s = await S('s.debug.battleRun()?.battle.snapshot({ bears: [0, 0], stores: {} }) ?? null');
    if (s?.phase === 'fight') {
      if (!s.assist) await page.keyboard.press('KeyR');
      if (s.bears[0] || s.bears[1]) {
        await page.keyboard.press('Space');
        shots++;
      }
    }
    await page.waitForTimeout(400);
  }
  await page.waitForTimeout(3000);
  return { battle: true, shots };
});

// 3. Continue (back ashore on Anchorage) and travel to Port Meridian, which streams in.
await voyage('meridian', 'continue', async () => {
  // The chart starts Port Meridian streaming (a jump there waits for its warm-up).
  await flow('pause()');
  await flow('openChart()');
  await page.waitForTimeout(1000);
  await flow("travelTo('island:meridian')");
  await page.waitForFunction(() => window.__flow.debugSession?.island === 'meridian', null, {
    timeout: 180_000,
  });
  await page.waitForTimeout(8000);
  return { island: await S('s.island') };
});

await browser.close();
const errors = logs.filter((l) => !/favicon/.test(l));
if (errors.length) fail(`${errors.length} console errors`);
console.log(JSON.stringify({ url, title0, voyages, fails, logs: errors.slice(0, 12) }, null, 1));
process.exit(fails.length ? 1 : 0);
