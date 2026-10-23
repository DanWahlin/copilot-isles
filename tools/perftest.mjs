#!/usr/bin/env node
// Local perf gate (PLAN §12.1 and §12.10, docs/specs/PHASE-0-spike.md §5, issues.md #29 and #11):
// `npm run check:perf -- --base=<no-HMR server>`. Per tier (Low and High by default) it measures, against
// `perf` in tools/budgets.json (each tier's `gate`, and its PLAN `target`, printed beside it):
//
//   cpu  Main-thread ms per frame: the engine's tick (`Engine.cpuMs`: every system's update and the
//        renderer's submission; the HUD's CPU figure and PLAN §12.1's "JS main thread per frame"), with
//        Chrome throttling the page's CPU by the tier's factor (Low 3×: the spec's stand-in for the
//        UHD 620 floor on this M3 Max), on settled views: each island's quay and town, and sailing
//        (full sail out of Anchorage). On both backends, both gated.
//   gpu  GPU ms per frame, at the tier's render scale held still (adaptive resolution off) and 1080p
//        (the spec's output size), in a browser with vsync and the frame cap off and no CPU throttle:
//        uncapped, the GPU runs at its working clock (at a capped 60 fps an Apple GPU idles most of
//        the frame and clocks down: the same Low frame read 4.7 ms capped against 1.4 ms uncapped).
//        Gated on WebGPU's reading, the union of its passes' timestamp intervals (`Engine.gpuBusyMs`,
//        issue #11). WebGL2's EXT_disjoint_timer_query_webgl2 sum is printed beside it, not gated: on
//        ANGLE-Metal a timer query times the whole command buffers its pass ran in, and those overlap
//        like WebGPU's passes did, so the sum reads past the frame period once a frame has many passes
//        (High). A reading over the frame period took in another client's GPU work and is resampled.
//   fly  The Phase 0 bench's flythrough (tools/bench.mjs's path: lagoon, headland, harbour, board, sail,
//        turn, dock) at the tier's throttle, started on a settled world: the most triangles drawn in
//        one frame (every pass), static shadow map redraws included, on both backends.
//
// It reads like `check:frame-budgets`: a view is measured only once the world has settled
// (`__dev.settled()`: no warm-up, no stream loading, the island you left freed) and 20 frames in a
// row have had no static shadow redraw, so a busy machine takes longer but reads the same. The throttle
// goes on for the sample only, after `--warmup` frames that aren't counted. A view's reading is the
// median of `--frames` frames. Other work on the machine only adds time, so a view whose quartiles
// spread over `--noise` of its median, or that's over budget, is sampled again (up to `--repeats`
// samples) and the lowest median is kept; every sample's median and spread is printed. It prints the
// load average at the start and the end: compare runs on a quiet machine (the 1-minute load under
// about a quarter of the cores), and before/after trees in turns, under the same conditions.
//
// Needs a no-HMR dev server (edits elsewhere would reload the page mid-run):
//   npx vite --config tools/vite.nohmr.config.mjs --host 127.0.0.1 --port 5353 --strictPort
// node tools/perftest.mjs [--base=http://127.0.0.1:5353] [--tiers=low,high] [--backends=webgpu,webgl]
//   [--gpu-backends=webgpu,webgl] [--fly-backends=webgpu,webgl] [--skip=cpu,gpu,fly]
//   [--views=anchorage,a-town,sailing,meridian,m-plaza,thousand-bough,tb-booths] [--frames=90]
//   [--warmup=30] [--repeats=3] [--noise=0.2] [--size=1920x1080] [--settle-timeout=180]
//   [--sea=calm|breeze|fresh|gale] (the Sea state setting from the first frame; Gale's foam and spray
//   are in the sea's own shader and its waves are taller, so the gate must hold in every state)
//   [--profile=<dir>] (a CPU profile of each CPU view after its sample, top functions printed)
//   [--json=<file>]
// It exits 0 only when every gated reading of every tier is within its gate; 1 when any is over, a view
// doesn't settle, the hitch guard records anything, or a page logs an error. PLAN targets a reading
// misses are listed at the end either way.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { cpus, loadavg } from 'node:os';
import { join } from 'node:path';
import { collectLogs, launchChrome, parseFlags, parseSize } from './lib/browser.mjs';

const opt = parseFlags();
const base = String(opt.base || 'http://127.0.0.1:5353').replace(/\/$/, '');
const budgets = JSON.parse(readFileSync(new URL('./budgets.json', import.meta.url), 'utf8')).perf;
const list = (v, d) =>
  String(v ?? d)
    .split(',')
    .filter(Boolean);
const tiers = list(opt.tiers, 'low,high');
const cpuBackends = list(opt.backends, 'webgpu,webgl');
const gpuBackends = list(opt['gpu-backends'], 'webgpu,webgl');
const flyBackends = list(opt['fly-backends'], 'webgpu,webgl');
const skip = new Set(list(opt.skip, ''));
const FRAMES = Number(opt.frames ?? 90);
const WARMUP = Number(opt.warmup ?? 30);
const REPEATS = Number(opt.repeats ?? 3);
const NOISE = Number(opt.noise ?? 0.2);
const SETTLE_MS = Number(opt['settle-timeout'] ?? 180) * 1000;
const viewport = parseSize(String(opt.size || '1920x1080'));
const profileDir = opt.profile ? String(opt.profile) : null;
if (profileDir) mkdirSync(profileDir, { recursive: true });

/** Settled views: a spot to stand (x, z, facing) or an island's quay, or sailing out of Anchorage. */
const VIEWS = {
  anchorage: { island: 'anchorage', at: [-112, -66, Math.PI] },
  'a-town': { island: 'anchorage', at: [-130, -40, -0.6] },
  sailing: { island: 'anchorage', sail: true },
  meridian: { island: 'meridian', quay: true },
  'm-plaza': { island: 'meridian', at: [660, -800, 0.8] },
  'thousand-bough': { island: 'thousand-bough', quay: true },
  'tb-booths': { island: 'thousand-bough', at: [1934, -1488, 2.4] },
};
const viewIds = list(opt.views, Object.keys(VIEWS).join(','));

const fmt = (v, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : '-');
const fmtK = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : `${Math.round(n / 1000)}k`);
const load = () =>
  loadavg()
    .map((l) => l.toFixed(1))
    .join(' ');

/** In the page: a recorder of the engine's per-frame readings, and the settled-world wait. */
function installRecorder() {
  const dev = window.__dev;
  const engine = dev.engine;
  const N = 4096;
  const rec = {
    on: false,
    n: 0,
    cpu: new Float64Array(N),
    gpu: new Float64Array(N),
    raw: new Float64Array(N),
    dt: new Float64Array(N),
    tris: new Float64Array(N),
    draws: new Float64Array(N),
    refresh: new Uint8Array(N),
    settled: new Uint8Array(N),
  };
  let last = performance.now();
  let refreshes = dev.settled().refreshes;
  let frames = 0;
  const loop = (now) => {
    const dt = now - last;
    last = now;
    frames++;
    if (rec.on && rec.n < N) {
      const i = rec.n++;
      const s = dev.settled();
      rec.cpu[i] = engine.cpuMs;
      // The busy time (the passes' union on WebGPU, their sum on WebGL2); a tree without it, the sum.
      rec.gpu[i] = engine.gpuBusyMs ?? engine.gpuRawMs;
      rec.raw[i] = engine.gpuRawMs;
      rec.dt[i] = dt;
      rec.tris[i] = engine.counters.last.triangles;
      rec.draws[i] = engine.counters.last.drawCalls;
      rec.refresh[i] = s.refreshes !== refreshes ? 1 : 0;
      rec.settled[i] = s.ok ? 1 : 0;
      refreshes = s.refreshes;
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));
  const take = (a) => Array.from(a.subarray(0, rec.n));
  window.__perf = {
    frames: () => frames,
    /** Resolves true once `n` frames in a row are settled with no static shadow redraw (false at `ms`). */
    async settle(n, ms) {
      const t0 = performance.now();
      let run = 0;
      let seen = dev.settled().refreshes;
      while (performance.now() - t0 < ms) {
        await nextFrame();
        const s = dev.settled();
        run = s.ok && s.refreshes === seen ? run + 1 : 0;
        seen = s.refreshes;
        if (run >= n) return true;
      }
      return false;
    },
    /** Skips `warmup` frames, then records `n`. */
    async sample(warmup, n) {
      for (let i = 0; i < warmup; i++) await nextFrame();
      rec.n = 0;
      rec.on = true;
      while (rec.n < n) await nextFrame();
      rec.on = false;
      return {
        cpu: take(rec.cpu),
        gpu: take(rec.gpu),
        raw: take(rec.raw),
        dt: take(rec.dt),
        tris: take(rec.tris),
        draws: take(rec.draws),
      };
    },
    start() {
      rec.n = 0;
      rec.on = true;
    },
    stop() {
      rec.on = false;
      return {
        tris: take(rec.tris),
        draws: take(rec.draws),
        refresh: take(rec.refresh),
        settled: take(rec.settled),
      };
    },
  };
}

const q = (s, p) => (s.length ? s[Math.min(s.length - 1, Math.max(0, Math.round((s.length - 1) * p)))] : NaN);
/** Median, quartiles, p90 and the quartiles' spread as a fraction of the median (zero readings left out). */
function stats(values) {
  const s = values.filter((v) => v > 0).sort((x, y) => x - y);
  const med = q(s, 0.5);
  const p25 = q(s, 0.25);
  const p75 = q(s, 0.75);
  return { med, p25, p75, p90: q(s, 0.9), spread: med > 0 ? (p75 - p25) / med : NaN, n: s.length };
}

/** A CPU profile's self time per frame, by function and by file. */
function topOf(profile, frames, n = 25) {
  const byFn = new Map();
  const byFile = new Map();
  const nodes = new Map(profile.nodes.map((nd) => [nd.id, nd]));
  const self = new Map();
  for (let i = 0; i < profile.samples.length; i++) {
    const id = profile.samples[i];
    self.set(id, (self.get(id) ?? 0) + (profile.timeDeltas[i + 1] ?? 0) / 1000);
  }
  let busy = 0;
  for (const [id, ms] of self) {
    const cf = nodes.get(id).callFrame;
    if (cf.functionName === '(idle)') continue;
    busy += ms;
    const file = (cf.url || '(native)').replace(/^.*\/(src|deps)\//, '$1/').replace(/\?.*$/, '');
    const fn = `${cf.functionName || '(anon)'} ${file}:${cf.lineNumber + 1}`;
    byFn.set(fn, (byFn.get(fn) ?? 0) + ms);
    byFile.set(file, (byFile.get(file) ?? 0) + ms);
  }
  const top = (m) =>
    [...m.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(([k, v]) => `${(v / frames).toFixed(3).padStart(7)} ms  ${k}`);
  return { busy: busy / frames, fns: top(byFn), files: top(byFile) };
}

const browsers = {};
const browser = async (uncapped) =>
  (browsers[uncapped ? 'uncapped' : 'capped'] ??= await launchChrome({ autoplay: true, uncapped }));

async function openPlay(tier, backend, uncapped = false) {
  const page = await (await browser(uncapped)).newPage({ viewport });
  const logs = collectLogs(page, { types: ['error'] });
  const cdp = await page.context().newCDPSession(page);
  const sea = opt.sea ? `&sea=${opt.sea}` : '';
  await page.goto(
    `${base}/devpages/play.html?auto&quiet&shot&tier=${tier}${backend === 'webgl' ? '&webgl' : ''}${sea}`,
    {
      waitUntil: 'load',
      timeout: 180_000,
    },
  );
  await page.waitForFunction(() => window.__dev?.ready === true && window.__dev.session(), null, {
    timeout: 240_000,
  });
  // The tier's own render scale, held: adaptive resolution would move the GPU reading with the load.
  await page.evaluate(() => window.__dev.engine.setRenderScale(window.__dev.engine.tier.renderScale));
  await page.evaluate(installRecorder);
  if (!(await page.evaluate(([n, ms]) => window.__perf.settle(n, ms), [20, SETTLE_MS])))
    console.log(`UNSETTLED ${tier} ${backend}: the page's world never settled`);
  return { page, logs, cdp };
}

/** Travels to an island's quay and waits for its setup and for the islands you left to be freed. */
async function goToIsland(page, island) {
  if (island !== 'anchorage') {
    await page.evaluate((id) => window.__dev.learn?.progress.add('arrivals', id), island);
    const at = await page.evaluate((id) => window.__dev.session().islandQuay(id), island);
    await page.evaluate((at) => window.__dev.session().travel(at.x, at.z, at.heading), at);
    await page.waitForFunction(
      (id) =>
        window.__dev
          .session()
          .islandSetups()
          .some((s) => s.id === id),
      island,
      { timeout: 240_000 },
    );
  }
  // The islands you've left are freed 20 s after you leave (PLAN §13.3): measure after that.
  await page.waitForFunction(
    (id) =>
      Object.entries(window.__dev.settled().streams).every(
        ([k, st]) => k === id || st.state === 'absent' || st.state === 'failed',
      ),
    island,
    { timeout: SETTLE_MS, polling: 250 },
  );
}

/** Holds (or lets go of) full sail. */
const helm = (page, down) =>
  page.evaluate(
    (d) => window.dispatchEvent(new KeyboardEvent(d ? 'keydown' : 'keyup', { code: 'KeyW' })),
    down,
  );

/** Takes up a view: stands at its spot, or boards at Anchorage's quay for sailing. */
async function place(page, view) {
  const v = VIEWS[view];
  if (v.sail) {
    await page.evaluate(() => window.__dev.bench.teleport(-112, -66, Math.PI, Math.PI, 0.2));
    await page.evaluate(() => window.__dev.bench.board());
    await page.waitForFunction(() => window.__dev.state()?.mode === 'sail', null, { timeout: 30_000 });
    return;
  }
  let [x, z, yaw] = v.at ?? [];
  if (v.quay) {
    const at = await page.evaluate((id) => window.__dev.session().islandQuay(id), v.island);
    [x, z, yaw] = [at.x, at.z, at.heading];
  }
  await page.evaluate(({ x, z, yaw }) => window.__dev.bench.teleport(x, z, yaw, yaw, 0.2), { x, z, yaw });
}

/**
 * Samples one view: `cpu` throttled (main-thread ms), `gpu` unthrottled in the uncapped browser (GPU
 * ms). Repeats while noisy or over budget; keeps the lowest median.
 */
async function measureView(ctx, tier, backend, view, mode) {
  const { page, cdp } = ctx;
  const b = budgets.tiers[tier];
  const gate = b.gate;
  const sailing = !!VIEWS[view].sail;
  await place(page, view);
  if (!(await page.evaluate(([n, ms]) => window.__perf.settle(n, ms), [20, SETTLE_MS]))) {
    const s = await page.evaluate(() => window.__dev.settled());
    console.log(`UNSETTLED ${tier} ${backend} ${mode} ${view}: ${JSON.stringify(s)}`);
    return { tier, backend, mode, view, unsettled: true };
  }
  const throttle = mode === 'cpu' ? b.throttle : 1;
  const limit = mode === 'cpu' ? gate.cpuMs : gate.gpuMs;
  const samples = [];
  for (let r = 0; r < REPEATS; r++) {
    if (sailing) await helm(page, true);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });
    const got = await page.evaluate(([w, n]) => window.__perf.sample(w, n), [WARMUP, FRAMES]);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    if (sailing) await helm(page, false);
    const s = {
      cpu: stats(got.cpu),
      gpu: stats(got.gpu),
      raw: stats(got.raw),
      dt: stats(got.dt),
      tris: Math.max(...got.tris),
      draws: Math.max(...got.draws),
    };
    samples.push(s);
    const best = Math.min(...samples.map((x) => x[mode].med || Infinity));
    // A GPU can't sustain more work a frame than the frame period (pipelined): a reading over it took
    // in another client's GPU work (another browser) and is sampled again.
    const paced = mode !== 'gpu' || !(s.gpu.med > s.dt.med * 1.05);
    if (!(s[mode].spread > NOISE) && paced && best <= limit) break;
  }
  if (profileDir && mode === 'cpu') await profileView(ctx, tier, backend, view, throttle, sailing);
  if (sailing) {
    await page.evaluate(() => window.__dev.bench.dock());
    await page
      .waitForFunction(() => window.__dev.state()?.mode === 'walk', null, { timeout: 60_000 })
      .catch(() => {});
  }
  const keep = samples.reduce((a, s) => ((s[mode].med || Infinity) < (a[mode].med || Infinity) ? s : a));
  return {
    tier,
    backend,
    mode,
    view,
    ms: keep[mode].med,
    stats: keep[mode],
    cpuMs: keep.cpu.med,
    gpuMs: keep.gpu.med,
    gpuSumMs: keep.raw.med,
    frameMs: keep.dt.med,
    tris: keep.tris,
    draws: keep.draws,
    samples: samples.map((s) => ({ med: s[mode].med, spread: s[mode].spread })),
  };
}

async function profileView(ctx, tier, backend, view, throttle, sailing) {
  const { page, cdp } = ctx;
  if (sailing) await helm(page, true);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });
  await page.evaluate((w) => window.__perf.sample(w, 1), WARMUP);
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
  const f0 = await page.evaluate(() => window.__perf.frames());
  await cdp.send('Profiler.start');
  await page.waitForTimeout(4000);
  const { profile } = await cdp.send('Profiler.stop');
  const frames = (await page.evaluate(() => window.__perf.frames())) - f0;
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  if (sailing) await helm(page, false);
  const file = join(profileDir, `${tier}-${backend}-${view}.cpuprofile`);
  writeFileSync(file, JSON.stringify(profile));
  const top = topOf(profile, frames);
  console.log(
    `  profile ${file}: ${frames} frames, main thread busy ${fmt(top.busy)} ms/frame (profiler on)\n` +
      `    by file:\n      ${top.files.slice(0, 15).join('\n      ')}\n    by function:\n      ${top.fns.join('\n      ')}`,
  );
}

/** The bench's flythrough (tools/bench.mjs), started on a settled world: its per-frame counts. */
async function flythrough(ctx, tier, backend) {
  const { page, cdp } = ctx;
  const b = budgets.tiers[tier];
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: b.throttle });
  await page.evaluate(() => window.__perf.start());
  const step = async (ms, fn) => {
    await fn();
    await page.waitForTimeout(ms);
  };
  const leg = 2000;
  await step(leg, () => page.evaluate(() => window.__dev.bench.teleport(10, 105, 0, 0.2, 0.12)));
  await step(leg, () => page.evaluate(() => window.__dev.bench.teleport(144, 12, -0.9, -1.0, 0.2)));
  await step(leg, () => page.evaluate(() => window.__dev.bench.teleport(-112, -66, Math.PI, Math.PI, 0.2)));
  await step(leg, async () => {
    await page.evaluate(() => window.__dev.bench.board());
    await page.waitForTimeout(2500);
    await page.evaluate(() => window.__dev.hold(['KeyW'], 1600));
  });
  await step(leg, () => page.evaluate(() => window.__dev.hold(['KeyA'], 1400)));
  await step(leg, async () => {
    await page.evaluate(() => window.__dev.hold(['KeyS'], 1000));
    await page.evaluate(() => window.__dev.bench.dock());
  });
  const got = await page.evaluate(() => window.__perf.stop());
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  const frames = got.tris.map((t, i) => ({ t, i, refresh: !!got.refresh[i], settled: !!got.settled[i] }));
  const peak = frames.reduce((a, f) => (f.t > a.t ? f : a), { t: 0, i: -1 });
  const steady = frames.filter((f) => !f.refresh).reduce((a, f) => (f.t > a.t ? f : a), { t: 0, i: -1 });
  return {
    tier,
    backend,
    frames: frames.length,
    peakTris: peak.t,
    peak,
    steadyPeakTris: steady.t,
    peakDraws: Math.max(0, ...got.draws),
    top: [...frames].sort((a, b) => b.t - a.t).slice(0, 5),
    budget: b.gate.flyTris,
    ok: frames.length > 0 && peak.t < b.gate.flyTris,
  };
}

function printView(r) {
  if (r.unsettled) return;
  const all = r.samples.map((s) => `${fmt(s.med)} ±${fmt(s.spread * 100, 0)}%`).join(', ');
  const what =
    r.mode === 'cpu'
      ? `main thread ${fmt(r.ms)} ms`
      : `GPU ${fmt(r.ms)} ms${r.backend === 'webgpu' ? ` (passes summed ${fmt(r.gpuSumMs)})` : ''}, main thread ${fmt(r.cpuMs)}` +
        (r.ms > r.frameMs * 1.05 ? ' OVER THE FRAME PERIOD' : '');
  console.log(
    `${r.tier.padEnd(5)} ${r.backend.padEnd(7)} ${r.mode} ${r.view.padEnd(15)} ${what} (p25 ${fmt(r.stats.p25)} p75 ${fmt(r.stats.p75)} p90 ${fmt(r.stats.p90)})` +
      `  frame ${fmt(r.frameMs, 1)} ms, ${fmtK(r.tris)} tris, ${r.draws} draws  [samples: ${all}]`,
  );
}

const results = [];
const fly = [];
const hitches = [];
let failed = false;
console.log(
  `load average ${load()} (${cpus().length} cores) at the start${opt.sea ? `, sea ${opt.sea}` : ''}`,
);

/** One page through every view in `mode`, island by island. */
async function runViews(tier, backend, mode) {
  const ctx = await openPlay(tier, backend, mode === 'gpu');
  let island = 'anchorage';
  try {
    for (const view of viewIds) {
      const v = VIEWS[view];
      if (v.island !== island) {
        await goToIsland(ctx.page, v.island);
        island = v.island;
      }
      const r = await measureView(ctx, tier, backend, view, mode);
      results.push(r);
      printView(r);
    }
    const h = await ctx.page.evaluate(() => window.__isles?.hitches?.() ?? []);
    if (h.length) hitches.push({ tier, backend, mode, hitches: h });
  } catch (err) {
    ctx.logs.push(`[perftest] ${err.message.split('\n')[0]}`);
    results.push({ tier, backend, mode, view: 'run', unsettled: true });
  }
  if (ctx.logs.length) {
    failed = true;
    console.log(`${tier} ${backend} ${mode} page errors:\n  ${ctx.logs.slice(0, 5).join('\n  ')}`);
  }
  await ctx.page.close();
}

for (const tier of tiers) {
  if (!skip.has('cpu')) for (const backend of cpuBackends) await runViews(tier, backend, 'cpu');
  if (!skip.has('gpu')) for (const backend of gpuBackends) await runViews(tier, backend, 'gpu');
  if (!skip.has('fly'))
    for (const backend of flyBackends) {
      const ctx = await openPlay(tier, backend);
      const f = await flythrough(ctx, tier, backend).catch((err) => {
        ctx.logs.push(`[perftest] flythrough: ${err.message.split('\n')[0]}`);
        return {
          tier,
          backend,
          frames: 0,
          peakTris: 0,
          peak: { i: -1 },
          top: [],
          budget: budgets.tiers[tier].gate.flyTris,
          ok: false,
        };
      });
      fly.push(f);
      console.log(
        `${tier.padEnd(5)} ${backend.padEnd(7)} fly  peak ${fmtK(f.peakTris)} / ${fmtK(f.budget)} triangles (frame ${f.peak.i} of ${f.frames}${f.peak.refresh ? ', a static shadow redraw' : ''}${f.peak.settled === false ? ', mid-warm' : ''}); without shadow redraws ${fmtK(f.steadyPeakTris ?? 0)}; draws ≤ ${f.peakDraws}  ${f.ok ? 'ok' : 'OVER'}` +
          `\n      top frames: ${f.top.map((t) => `${fmtK(t.t)}@${t.i}${t.refresh ? ' (redraw)' : ''}`).join(', ')}`,
      );
      if (ctx.logs.length) {
        failed = true;
        console.log(`${tier} ${backend} fly page errors:\n  ${ctx.logs.slice(0, 5).join('\n  ')}`);
      }
      await ctx.page.close();
    }
}
for (const b of Object.values(browsers)) await b.close();

// The gate: the worst view per tier and backend against its gate (tools/budgets.json `perf`), and
// against the PLAN §12.1 / Phase 0 spec target, which is printed (a missed target is a FAIL only where
// the gate is the target). GPU is gated on WebGPU's reading (the union of its pass timestamps); WebGL2's
// timer queries on ANGLE-Metal time each pass's whole command buffers, which overlap like WebGPU's
// passes did, so their sum reads past the frame period on frames with many passes (issue #11): it's
// printed, not gated.
console.log(`\nload average ${load()} at the end`);
console.log(
  'Perf gate (tools/budgets.json `perf`; worst settled view, median of its frames; gate / PLAN target):',
);
console.log(
  `  ${'tier'.padEnd(6)}${'backend'.padEnd(8)}${'main thread ms'.padEnd(34)}${'GPU ms'.padEnd(40)}${'flythrough peak'.padEnd(26)}result`,
);
const targets = [];
for (const tier of tiers) {
  const { gate, target } = budgets.tiers[tier];
  for (const backend of [...new Set([...cpuBackends, ...gpuBackends, ...flyBackends])]) {
    const why = [];
    const worst = (mode) => {
      const rs = results.filter((r) => r.tier === tier && r.backend === backend && r.mode === mode);
      if (!rs.length) return null;
      if (rs.some((r) => r.unsettled)) why.push(`${mode} UNSETTLED`);
      const ok = rs.filter((r) => !r.unsettled);
      return ok.length ? ok.reduce((a, r) => (r.ms > a.ms ? r : a)) : null;
    };
    const wc = skip.has('cpu') || !cpuBackends.includes(backend) ? null : worst('cpu');
    const wg = skip.has('gpu') || !gpuBackends.includes(backend) ? null : worst('gpu');
    const f = fly.find((x) => x.tier === tier && x.backend === backend);
    const gated = backend === 'webgpu';
    if (wc && wc.ms > gate.cpuMs) why.push('main thread OVER');
    if (wg && gated && !(wg.ms > 0)) why.push('no GPU reading');
    else if (wg && gated && wg.ms > gate.gpuMs) why.push('GPU OVER');
    if (f && !f.ok) why.push('flythrough OVER');
    if (why.length) failed = true;
    const miss = (v, t) => (v > t ? ' MISSED' : '');
    if (wc && wc.ms > target.cpuMs)
      targets.push(`${tier} ${backend} main thread ${fmt(wc.ms)} ms > ${target.cpuMs} (${wc.view})`);
    if (wg && gated && wg.ms > target.gpuMs)
      targets.push(`${tier} ${backend} GPU ${fmt(wg.ms)} ms > ${target.gpuMs} (${wg.view})`);
    if (f && f.peakTris >= target.flyTris)
      targets.push(`${tier} ${backend} flythrough ${fmtK(f.peakTris)} >= ${fmtK(target.flyTris)}`);
    const cpuCell = wc
      ? `${fmt(wc.ms)} / ${gate.cpuMs} / ${target.cpuMs}${miss(wc.ms, target.cpuMs)} (${wc.view})`
      : '';
    const gpuCell = wg
      ? gated
        ? `${fmt(wg.ms)} / ${gate.gpuMs} / ${target.gpuMs}${miss(wg.ms, target.gpuMs)} (${wg.view})`
        : `${fmt(wg.ms)} timer sum, not gated (${wg.view})`
      : '';
    const flyCell = f ? `${fmtK(f.peakTris)} / ${fmtK(gate.flyTris)} / ${fmtK(target.flyTris)}` : '';
    console.log(
      `  ${tier.padEnd(6)}${backend.padEnd(8)}${cpuCell.padEnd(34)}${gpuCell.padEnd(40)}${flyCell.padEnd(26)}${why.length ? why.join(', ') : 'ok'}`,
    );
  }
}
if (targets.length)
  console.log(
    `PLAN targets missed (the gate holds today's ceilings until they're revised; budgets.json \`perf\`):\n  ${targets.join('\n  ')}`,
  );
if (hitches.length) {
  failed = true;
  console.log(`hitch guard: ${JSON.stringify(hitches).slice(0, 800)}`);
}
if (opt.json)
  writeFileSync(String(opt.json), JSON.stringify({ base, load: load(), results, fly, hitches }, null, 1));
console.log(
  failed
    ? 'FAIL: over budget, unsettled, hitches or page errors (see above)'
    : 'PASS: every tier is within its perf budget',
);
process.exit(failed ? 1 : 0);
