#!/usr/bin/env node
// Course pack parts (issue 304, docs/specs/COURSE-PACKS.md §2): a cold Continue on Thousand-Bough
// gets its chapter's part before anything needs it, and a part request that fails once is tried again.
//
// 1. A new voyage, a jump to Thousand-Bough and a quit: the save is on Thousand-Bough.
// 2. A fresh page (cold: no part loaded), Continue. Checks: the core and the parts of Anchorage and
//    Thousand-Bough load, Port Meridian's doesn't; Thousand-Bough's part arrives before its stream is
//    resident; the island's beats and scripts are in; no read before a part was in (that logs an
//    error); no hitches. Then a quiz from Port Meridian's chapter is asked: its part loads on demand
//    and the quiz card opens.
// 3. A fresh page, Thousand-Bough's part request fails once: the game tries again and lands there.
//
// Fails (exit 1) on any of these, on page errors, or on console errors (but the failed request's own).
// Needs the dev server (it reads the game's modules by URL).
// node tools/coursesplittest.mjs [--base=http://localhost:5301] [--out=<dir>]
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { collectLogs, launchChrome, parseFlags, waitForTitle } from './lib/browser.mjs';
import { passLearningPauses } from './lib/learning-cards.mjs';

const opt = parseFlags();
const base = opt.base || 'http://localhost:5301';
const out = opt.out || 'test-results/coursesplit';
mkdirSync(out, { recursive: true });
const url = `${base}/?debug&tier=${opt.tier || 'medium'}${opt.webgl ? '&webgl' : ''}`;
const COURSE = 'copilot-app';
const SAVE = `kraken-isles.${COURSE}.save.v1`;
/** A chapter part's URL, in dev or in a build: its chapter is group 1. */
const PART = new RegExp(
  `/(?:__course-parts/${COURSE}/|assets/course-${COURSE}-)(\\d\\d-[a-z0-9-]+?)(?:-[0-9a-f]{10})?\\.json`,
);

const browser = await launchChrome({ autoplay: true });
const context = await browser.newContext({ viewport: { width: 1600, height: 900 } });
const fails = [];
const fail = (msg) => fails.push(msg);
const result = {};

async function open(name, { failFirst = null } = {}) {
  const page = await context.newPage();
  const logs = collectLogs(page, { types: ['error'] });
  const parts = [];
  page.on('request', (r) => {
    const m = PART.exec(r.url());
    if (m) parts.push({ chapter: m[1], at: Date.now(), status: 'sent' });
  });
  page.on('requestfinished', (r) => {
    const m = PART.exec(r.url());
    if (m) parts.push({ chapter: m[1], at: Date.now(), status: 'finished' });
  });
  page.on('requestfailed', (r) => {
    const m = PART.exec(r.url());
    if (m) parts.push({ chapter: m[1], at: Date.now(), status: 'failed' });
  });
  if (failFirst) {
    let failed = false;
    await page.route(PART, (route) => {
      if (!failed && PART.exec(route.request().url())[1] === failFirst) {
        failed = true;
        return route.abort('failed');
      }
      return route.continue();
    });
  }
  await page.goto(url, { waitUntil: 'load' });
  await waitForTitle(page, 120_000);
  return { name, page, logs, parts };
}

const flow = (page, js) => page.evaluate(`window.__flow.${js}`);
const until = (page, screen, timeout = 240_000) =>
  page.waitForFunction((s) => window.__flow.getState().screen === s, screen, { timeout });
const onIsland = (page, island, timeout = 240_000) =>
  page.waitForFunction(
    (i) =>
      window.__flow.debugSession?.island === i && window.__flow.debugSession.debug.state().mode === 'walk',
    island,
    { timeout },
  );
const shot = (page, name) => page.screenshot({ path: join(out, `${name}.png`) });

/** Listens (in the page) for chapter parts and for Thousand-Bough's stream going resident. */
const watch = (page) =>
  page.evaluate(async () => {
    const active = await import('/src/course/active.ts');
    window.__split = { heard: [], resident: 0 };
    active.onCoursePart((c) => window.__split.heard.push([c, performance.now()]));
    const tick = () => {
      if (!window.__split.resident && window.__flow.cove?.islands['thousand-bough']?.state === 'resident')
        window.__split.resident = performance.now();
      requestAnimationFrame(tick);
    };
    tick();
  });

/** The active pack's state, read through the game's own modules. */
const packState = (page) =>
  page.evaluate(async () => {
    const active = await import('/src/course/active.ts');
    const p = active.coursePack();
    const tb = active.islandQuests('thousand-bough');
    return {
      in: p.index.map((c) => [c.chapter, active.coursePartIn(c.chapter)]),
      tbBeats: tb.beats.length,
      tbScripts: Object.keys(tb.scripts).length,
      heard: window.__split.heard,
      resident: window.__split.resident,
    };
  });

const ownErrors = (logs, allowFailed) =>
  logs.filter((l) => !(allowFailed && /Failed to load resource|ERR_FAILED/.test(l)));

// 1. A save on Thousand-Bough.
{
  const { page, logs } = await open('setup');
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'load' });
  await waitForTitle(page, 120_000);
  await flow(page, 'chooseCaptain()');
  await page.waitForTimeout(700);
  await flow(page, "newVoyage('woman')");
  await until(page, 'playing');
  await page.waitForTimeout(1500);
  await page.evaluate(() => window.__flow.debugSession.debug.skipArrival());
  await flow(page, "travelTo('island:thousand-bough')");
  await onIsland(page, 'thousand-bough');
  await page.waitForTimeout(3000);
  await flow(page, 'pause()');
  await flow(page, 'quitToTitle()');
  await until(page, 'title', 120_000);
  const save = await page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? 'null'), SAVE);
  result.save = save && { place: save.place, x: Math.round(save.x), z: Math.round(save.z) };
  if (!save) fail('setup: no save after the quit');
  if (logs.length) fail(`setup: ${logs.length} console errors ${JSON.stringify(logs.slice(0, 3))}`);
  await page.close();
}

// 2. A cold Continue on Thousand-Bough.
{
  const { page, logs, parts } = await open('cold');
  await watch(page);
  const t0 = Date.now();
  await flow(page, 'continueVoyage()');
  await until(page, 'playing');
  await page.waitForTimeout(1500);
  const pauses = await passLearningPauses(page);
  await page.evaluate(() => window.__flow.debugSession.debug.skipArrival());
  await onIsland(page, 'thousand-bough');
  await page.waitForTimeout(2000);
  await shot(page, 'cold-thousand-bough');
  const s = await packState(page);
  const hitches = await page.evaluate(() => window.__isles.hitches());
  const requested = [...new Set(parts.filter((p) => p.status === 'sent').map((p) => p.chapter))];
  const tbChapter = '02-sessions-worktrees-context';
  const tbHeard = s.heard.find(([c]) => c === tbChapter);
  result.cold = {
    continueToPlayingMs: null,
    requested,
    in: s.in,
    tbBeats: s.tbBeats,
    tbScripts: s.tbScripts,
    tbPartAt: tbHeard ? Math.round(tbHeard[1]) : null,
    tbResidentAt: Math.round(s.resident),
    pauses,
    hitches: hitches.length,
  };
  result.cold.continueToPlayingMs = Date.now() - t0;
  if (!requested.includes('00-setup')) fail("cold: Anchorage's part wasn't requested");
  if (!requested.includes(tbChapter)) fail("cold: Thousand-Bough's part wasn't requested");
  if (requested.includes('01-tour-the-app') && !pauses.recap)
    fail("cold: Port Meridian's part loaded, but nothing asked for it");
  if (!tbHeard) fail("cold: Thousand-Bough's part never arrived");
  else if (!s.resident || tbHeard[1] > s.resident)
    fail(`cold: Thousand-Bough was resident (${s.resident}) before its part arrived (${tbHeard[1]})`);
  if (!s.tbBeats || !s.tbScripts) fail(`cold: Thousand-Bough has ${s.tbBeats} beats, ${s.tbScripts} scripts`);
  if (hitches.length) fail(`cold: ${hitches.length} hitches ${JSON.stringify(hitches.slice(0, 3))}`);

  // A quiz from a chapter whose part isn't in: it loads, then the card opens.
  const quiz = await page.evaluate(async () => {
    const active = await import('/src/course/active.ts');
    const c = active.coursePack().index.find((x) => !active.coursePartIn(x.chapter));
    const q = c?.quizzes.find((x) => x.type === 'mc' || x.type === 'scenario');
    if (!q) return null;
    void window.__flow.learn.ask(q.id);
    return { id: q.id, chapter: c.chapter };
  });
  result.onDemand = quiz;
  if (quiz) {
    await page
      .waitForFunction((id) => window.__flow.learn.getState().quiz?.quiz.id === id, quiz.id, {
        timeout: 20_000,
      })
      .catch(() => fail(`cold: the quiz ${quiz.id} (chapter ${quiz.chapter}) didn't open`));
    const prompt = await page.evaluate(() => window.__flow.learn.getState().quiz?.quiz.prompt ?? '');
    if (!prompt) fail(`cold: the quiz ${quiz.id} opened without its prompt`);
    if (!parts.some((p) => p.chapter === quiz.chapter && p.status === 'finished'))
      fail(`cold: chapter ${quiz.chapter}'s part wasn't loaded for its quiz`);
    await shot(page, 'cold-on-demand-quiz');
    await page.keyboard.press('Escape');
  }
  await page.waitForTimeout(500);
  const errors = ownErrors(logs, false);
  if (errors.length) fail(`cold: ${errors.length} console errors ${JSON.stringify(errors.slice(0, 3))}`);
  result.cold.logs = errors;
  await flow(page, 'pause()');
  await flow(page, 'quitToTitle()');
  await until(page, 'title', 120_000);
  await page.close();
}

// 3. Thousand-Bough's part fails once.
{
  const tbChapter = '02-sessions-worktrees-context';
  const { page, logs, parts } = await open('retry', { failFirst: tbChapter });
  await flow(page, 'continueVoyage()');
  await until(page, 'playing');
  await page.waitForTimeout(1500);
  await passLearningPauses(page);
  await page.evaluate(() => window.__flow.debugSession.debug.skipArrival());
  await onIsland(page, 'thousand-bough');
  await page.waitForTimeout(1500);
  await shot(page, 'retry-thousand-bough');
  const tb = parts.filter((p) => p.chapter === tbChapter);
  const beats = await page.evaluate(async () => {
    const active = await import('/src/course/active.ts');
    return active.islandQuests('thousand-bough').beats.length;
  });
  result.retry = { requests: tb.map((p) => p.status), beats };
  if (!tb.some((p) => p.status === 'failed')) fail('retry: the first request didn\u2019t fail');
  if (!tb.some((p) => p.status === 'finished')) fail('retry: no request after the failure finished');
  if (!beats) fail('retry: Thousand-Bough has no beats after the retry');
  const errors = ownErrors(logs, true);
  if (errors.length) fail(`retry: ${errors.length} console errors ${JSON.stringify(errors.slice(0, 3))}`);
  result.retry.logs = errors;
  await page.close();
}

await browser.close();
result.fails = fails;
writeFileSync(join(out, 'coursesplittest.json'), JSON.stringify(result, null, 1));
console.log(JSON.stringify(result, null, 1));
if (fails.length) process.exitCode = 1;
