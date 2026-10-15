#!/usr/bin/env node
// The opening every player sees, timed: the real title screen in a clean profile, the first press
// (it starts the title's music and sea), the ship dragged round, the Chart with two islands pointed at,
// New Voyage, the name, Set sail, Juno's cabin, the chest, the dive and the fly-in, until the captain's
// ashore. It plays the highlight reel's own steps (tools/video/scenarios/opening.mjs) with real mouse
// and keyboard input, records every frame's time in the page, and fails if any frame gap after the
// title's warm-up is over --max ms (a stall a player sees). `--profile` takes a CPU profile of the run
// and names the functions inside each gap over --explain ms.
//
// node tools/openingtest.mjs [--base=http://127.0.0.1:5301] [--tier=high] [--webgl] [--runs=1]
//   [--max=150] [--explain=100] [--profile] [--size=1920x1080] [--out=/tmp/shots/opening]
//   [--real-gesture] (no autoplay flag: the AudioContext needs the press, as in a normal browser)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { GPU_ARGS, collectLogs, parseFlags, parseSize } from './lib/browser.mjs';
import { makeApi } from './video/lib.mjs';
import scenario from './video/scenarios/opening.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

const opt = parseFlags();
const base = opt.base || 'http://127.0.0.1:5301';
const tier = opt.tier || 'high';
const runs = Number(opt.runs || 1);
const maxGap = Number(opt.max || 150);
const explainOver = Number(opt.explain || 100);
const size = parseSize(opt.size || '1920x1080');
const out = opt.out || '/tmp/shots/opening';
const tag = `${tier}-${opt.webgl ? 'gl' : 'gpu'}`;
fs.mkdirSync(out, { recursive: true });

/**
 * In the page before any game script: every frame's time and the long tasks, on the epoch clock, and
 * whether an opaque veil or flash covered the whole screen at that frame (the opening's dark between
 * Set sail and the cabin, the dive's white flash): a gap there shows nothing moving.
 */
function frameClock() {
  const t0 = performance.timeOrigin;
  const frames = [];
  const covered = [];
  const longTasks = [];
  window.__ot = { frames, covered, longTasks };
  const isCovered = () => {
    for (const el of document.querySelectorAll('.ci-opening-veil, .ci-opening-flash'))
      if (Number(getComputedStyle(el).opacity) >= 0.999) return true;
    return false;
  };
  const tick = (t) => {
    frames.push(t0 + t);
    covered.push(isCovered());
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) longTasks.push([t0 + e.startTime, e.duration]);
    }).observe({ type: 'longtask', buffered: true });
  } catch {
    // No Long Tasks API: the frame times still tell.
  }
}

/** Busy for a few ms under a name the profile can find, so its clock lines up with the page's. */
function profileSync() {
  const start = performance.timeOrigin + performance.now();
  const end = performance.now() + 6;
  while (performance.now() < end) {
    // spin
  }
  return start;
}

/** Self time per function (and per game call site) in each gap, from a CPU profile. */
function explainGaps(profile, offsetMs, gaps) {
  const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  const parent = new Map();
  for (const n of profile.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
  const name = (n) => {
    const f = n.callFrame;
    const file = f.url ? f.url.replace(/^https?:\/\/[^/]+/, '').replace(/\?.*$/, '') : '';
    return `${f.functionName || '(anonymous)'} ${file}:${f.lineNumber + 1}`;
  };
  // Sample times on the epoch clock.
  const times = [];
  let t = profile.startTime;
  for (const d of profile.timeDeltas) {
    t += d;
    times.push(t / 1000 + offsetMs);
  }
  return gaps.map((g) => {
    const self = new Map();
    const game = new Map();
    let n = 0;
    for (let i = 0; i < profile.samples.length; i++) {
      if (times[i] < g.from || times[i] > g.to) continue;
      const dt = (times[i + 1] ?? times[i]) - times[i];
      const node = byId.get(profile.samples[i]);
      const key = name(node);
      self.set(key, (self.get(key) ?? 0) + dt);
      // The innermost game frame (src/) on the stack: who asked for the work.
      const seen = new Set();
      for (let id = node.id; id !== undefined; id = parent.get(id)) {
        const k = name(byId.get(id));
        if (k.includes('/src/') && !seen.has(k)) {
          seen.add(k);
          game.set(k, (game.get(k) ?? 0) + dt);
        }
      }
      n++;
    }
    const top = (m, k) =>
      [...m.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, k)
        .map(([f, ms]) => [+ms.toFixed(1), f]);
    return { ...g, samples: n, self: top(self, 12), game: top(game, 16) };
  });
}

async function run(i) {
  const args = [...GPU_ARGS];
  if (!opt['real-gesture']) args.push('--autoplay-policy=no-user-gesture-required');
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args });
  const context = await browser.newContext({ viewport: size, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const logs = collectLogs(page, { types: ['error'] });
  await page.addInitScript(frameClock);
  // As the highlight reel films it: the audio tap and the drawn pointer.
  if (opt.reel) {
    await page.addInitScript({ path: path.join(HERE, 'video', 'audio-tap.js') });
    await page.addInitScript({ path: path.join(HERE, 'video', 'cursor.js') });
    await page.exposeFunction('__recPush', () => undefined);
  }
  const marks = [];
  const rec = { marks, mark: (label) => marks.push({ t: Date.now(), label }) };
  const api = makeApi(page, rec);

  const t0 = Date.now();
  await page.goto(`${base}/?debug&tier=${tier}${opt.webgl ? '&webgl' : ''}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__flow?.getState().screen === 'title', null, { timeout: 180_000 });
  const titleAt = Date.now();
  await page.waitForFunction(() => !document.getElementById('loading'), null, { timeout: 30_000 });
  const titleReadyMs = Date.now() - t0;
  const titleScreenMs = titleAt - t0;
  await page.evaluate(() => window.__flow.titleReady());
  await page.mouse.move(1, 1);

  let cdp = null;
  let offsetMs = 0;
  if (opt.profile) {
    cdp = await context.newCDPSession(page);
    await cdp.send('Profiler.enable');
    await cdp.send('Profiler.setSamplingInterval', { interval: 250 });
    await cdp.send('Profiler.start');
  }
  // The frames the compositor presents (a raster stall shows here, not in requestAnimationFrame):
  // a screencast, acked at once. Its timestamps are seconds on the epoch clock.
  const shown = [];
  let cast = null;
  if (!opt['no-screencast']) {
    cast = await context.newCDPSession(page);
    cast.on('Page.screencastFrame', ({ metadata, sessionId }) => {
      shown.push(metadata.timestamp * 1000);
      cast.send('Page.screencastFrameAck', { sessionId }).catch(() => undefined);
    });
    const full = !!opt.reel;
    await cast.send('Page.startScreencast', {
      format: 'jpeg',
      quality: full ? 90 : 30,
      maxWidth: full ? size.width : 480,
      maxHeight: full ? size.height : 270,
      everyNthFrame: 1,
    });
  }
  const from = await page.evaluate(() => performance.timeOrigin + performance.now());
  let error = null;
  try {
    await scenario.play(page, api);
  } catch (e) {
    error = e.message;
  }
  const to = await page.evaluate(() => performance.timeOrigin + performance.now());
  if (cast) await cast.send('Page.stopScreencast').catch(() => undefined);
  let profile = null;
  if (cdp) {
    // Line the profile's clock up with the page's: a named spin at a known page time.
    const syncAt = await page.evaluate(`(${profileSync.toString()})()`);
    ({ profile } = await cdp.send('Profiler.stop'));
    const node = profile.nodes.find((n) => n.callFrame.functionName === 'profileSync');
    let first = null;
    let tt = profile.startTime;
    for (let k = 0; k < profile.samples.length; k++) {
      tt += profile.timeDeltas[k];
      if (profile.samples[k] === node?.id) {
        first = tt / 1000;
        break;
      }
    }
    offsetMs = first === null ? 0 : syncAt - first;
  }
  const page2 = await page.evaluate(
    ({ from, to }) => ({
      frames: window.__ot.frames.filter((t) => t >= from - 200 && t <= to),
      covered: window.__ot.covered.filter((_, i) => {
        const t = window.__ot.frames[i];
        return t >= from - 200 && t <= to;
      }),
      longTasks: window.__ot.longTasks.filter(([t]) => t >= from - 200 && t <= to),
      stalls: window.__isles?.stalls() ?? [],
      hitches: window.__isles?.hitches() ?? [],
      info: window.__isles?.info(),
    }),
    { from, to },
  );
  await browser.close();

  const { frames, covered } = page2;
  /** Whether a veil covered the screen at time t (the last frame at or before it). */
  const coveredAt = (t) => {
    let lo = 0;
    let hi = frames.length - 1;
    if (hi < 0 || t < frames[0]) return false;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (frames[mid] <= t) lo = mid;
      else hi = mid - 1;
    }
    return covered[lo];
  };
  const labelAt = (t) => {
    let l = 'start';
    for (const m of marks) if (m.t <= t) l = m.label;
    return l;
  };
  /** Gaps over 50 ms in a list of frame times, after `from`. */
  const gapsIn = (times, kind) => {
    const list = [];
    for (let k = 1; k < times.length; k++) {
      const ms = times[k] - times[k - 1];
      if (times[k] < from || ms <= 50) continue;
      list.push({
        kind,
        ms: Math.round(ms),
        from: times[k - 1],
        to: times[k],
        at: +((times[k - 1] - from) / 1000).toFixed(2),
        during: labelAt(times[k - 1]),
        // Behind an opaque veil from start to end: nothing on screen could move.
        hidden: coveredAt(times[k - 1]) && coveredAt(times[k] - 1),
      });
    }
    return list;
  };
  // The first presented frame comes a moment after the screencast starts.
  const shownFrames = shown.filter((t) => t >= from - 200 && t <= to);
  const gaps = [...gapsIn(frames, 'raf'), ...gapsIn(shownFrames, 'shown')].sort((a, b) => a.from - b.from);
  const worst = gaps.reduce((m, g) => (g.hidden ? m : Math.max(m, g.ms)), 0);
  const worstHidden = gaps.reduce((m, g) => (g.hidden ? Math.max(m, g.ms) : m), 0);
  let explained = null;
  if (profile) {
    explained = explainGaps(
      profile,
      offsetMs,
      gaps.filter((g) => g.ms > explainOver),
    );
    fs.writeFileSync(path.join(out, `opening-${tag}-${i}.cpuprofile`), JSON.stringify(profile));
  }
  const result = {
    run: i,
    tier,
    backend: page2.info?.backend,
    titleScreenMs,
    titleReadyMs,
    seconds: +((to - from) / 1000).toFixed(1),
    frames: frames.length,
    worstGapMs: worst,
    worstHiddenGapMs: worstHidden,
    over50: gaps.filter((g) => !g.hidden).length,
    shownFrames: shownFrames.length,
    over100: gaps.filter((g) => !g.hidden && g.ms > 100).length,
    gaps: gaps.map(({ kind, ms, at, during, hidden }) => ({
      kind,
      ms,
      at,
      during,
      ...(hidden ? { hidden } : {}),
    })),
    stalls: page2.stalls,
    hitches: page2.hitches,
    longTasks: page2.longTasks.map(([t, d]) => ({
      at: +((t - from) / 1000).toFixed(2),
      ms: Math.round(d),
      during: labelAt(t),
    })),
    explained: explained?.map(({ kind, ms, at, during, hidden, samples, self, game }) => ({
      kind,
      ms,
      at,
      during,
      hidden,
      samples,
      self,
      game,
    })),
    error,
    logs,
  };
  fs.writeFileSync(
    path.join(out, `opening-${tag}-${i}.json`),
    JSON.stringify({
      ...result,
      marks: marks.map((m) => ({ at: +((m.t - from) / 1000).toFixed(2), label: m.label })),
      frameTimes: frames.map((t) => +(t - from).toFixed(1)),
      coveredFrames: covered.map((c) => (c ? 1 : 0)),
      shownTimes: shownFrames.map((t) => +(t - from).toFixed(1)),
    }),
  );
  return result;
}

const results = [];
for (let i = 0; i < runs; i++) {
  const r = await run(i);
  results.push(r);
  console.log(
    `[openingtest] ${tag} run ${i}: worst gap ${r.worstGapMs} ms, ${r.over50} over 50, ${r.over100} over 100, ` +
      `${r.worstHiddenGapMs ? `worst under the veil ${r.worstHiddenGapMs} ms, ` : ''}` +
      `title ready ${r.titleReadyMs} ms${r.error ? `, ERROR ${r.error}` : ''}`,
  );
  for (const g of r.gaps)
    console.log(
      `   ${g.kind.padEnd(5)} ${String(g.ms).padStart(4)} ms at ${g.at}s (${g.during})${g.hidden ? ' [under the veil]' : ''}`,
    );
}
const worst = Math.max(...results.map((r) => r.worstGapMs));
const failed = results.some((r) => r.error || r.logs.length) || worst > maxGap;
console.log(
  JSON.stringify({
    tag,
    runs,
    worstGapMs: worst,
    max: maxGap,
    ok: !failed,
    out,
    errors: results.flatMap((r) => [r.error, ...r.logs].filter(Boolean)),
  }),
);
process.exit(failed ? 1 : 0);
