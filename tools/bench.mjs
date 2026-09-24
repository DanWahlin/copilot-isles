#!/usr/bin/env node
// Phase 0 benchmark / tier emulation. Example:
//   node tools/bench.mjs --base=http://127.0.0.1:5301 --out=docs/reports/phase0-bench --duration=60
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const opt = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, ...v] = a.replace(/^--/, '').split('=');
    return [k, v.length ? v.join('=') : true];
  }),
);

const base = String(opt.base || 'http://127.0.0.1:5301').replace(/\/$/, '');
const outBase = String(opt.out || 'docs/reports/phase0-bench');
const duration = Number(opt.duration || 60);
const quick = !!opt.quick;
const tiers = opt.tiers ? String(opt.tiers).split(',') : ['lite', 'low', 'medium', 'high', 'ultra'];
const backends = opt.backend ? String(opt.backend).split(',') : ['webgpu', 'webgl'];
const viewport = parseSize(String(opt.size || '1600x900'));

const BUDGET = {
  lite: { gpuMs: 0.5, cpuMs: 7, draws: 100, tris: 300_000, programs: 150, throttle: 6 },
  low: { gpuMs: 1.0, cpuMs: 6, draws: 150, tris: 500_000, programs: 150, throttle: 3 },
  medium: { gpuMs: 2.5, cpuMs: 5, draws: 225, tris: 1_000_000, programs: 150, throttle: 2 },
  high: { gpuMs: 4.0, cpuMs: 4, draws: 300, tris: 2_000_000, programs: 150, throttle: 1 },
  ultra: { gpuMs: 14.0, cpuMs: 4, draws: 400, tris: 3_500_000, programs: 150, throttle: 1 },
};

function parseSize(s) {
  const [width, height] = s.split('x').map(Number);
  return { width: width || 1600, height: height || 900 };
}

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p)))];
}

function avg(values) {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

function pass(v, limit) {
  return v <= limit;
}

async function openPage(browser, url, throttle = 1) {
  const page = await browser.newPage({ viewport });
  const cdp = await page.context().newCDPSession(page);
  if (throttle > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });
  const logs = [];
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') logs.push(`[${m.type()}] ${m.text()}`);
  });
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
  await page.goto(url, { waitUntil: 'load', timeout: 120_000 });
  return { page, logs, cdp };
}

async function measureTitle(browser, backend, tier) {
  const suffix = `${backend === 'webgl' ? '&webgl' : ''}&tier=${tier}&skipBenchmark`;
  const url = `${base}/?debug${suffix}`;
  const t0 = performance.now();
  const { page, logs } = await openPage(browser, url, BUDGET[tier].throttle);
  await page.waitForFunction(() => window.__flow?.getState().screen === 'title', null, { timeout: 120_000 });
  const ttiMs = performance.now() - t0;
  await page.waitForTimeout(quick ? 500 : 1200);
  const info = await page.evaluate(() => window.__isles?.info?.() ?? null);
  await page.close();
  return { backend, tier, url, ttiMs, info, logs };
}

async function runFlythrough(browser, backend, tier) {
  const budget = BUDGET[tier];
  const url = `${base}/devpages/play.html?auto&quiet&shot&tier=${tier}${backend === 'webgl' ? '&webgl' : ''}`;
  const { page, logs } = await openPage(browser, url, budget.throttle);
  await page.waitForFunction(() => window.__dev?.ready === true && window.__dev.session(), null, {
    timeout: 180_000,
  });
  await page.waitForTimeout(quick ? 1000 : 2500);
  await page.evaluate(() => {
    const samples = [];
    let last = performance.now();
    let on = true;
    const loop = (now) => {
      if (!on) return;
      const s = window.__dev.stats();
      const dt = now - last;
      last = now;
      samples.push({ dt, ...s });
      requestAnimationFrame(loop);
    };
    window.__bench = { samples, stop: () => (on = false) };
    requestAnimationFrame(loop);
  });

  const phase = async (ms, fn) => {
    if (fn) {
      try {
        await fn();
      } catch (err) {
        logs.push(`[bench] phase action failed: ${err.message}`);
        await page.waitForLoadState('load').catch(() => {});
      }
    }
    await page.waitForTimeout(quick ? Math.min(ms, 1500) : ms);
  };
  const totalMs = (quick ? Math.min(duration, 12) : duration) * 1000;
  const q = Math.max(1000, totalMs / 6);

  await phase(q, () => page.evaluate(() => window.__dev?.bench?.teleport?.(10, 105, 0, 0.2, 0.12))); // lagoon
  await phase(q, () => page.evaluate(() => window.__dev?.bench?.teleport?.(144, 12, -0.9, -1.0, 0.2))); // headland
  await phase(q, () =>
    page.evaluate(() => window.__dev?.bench?.teleport?.(-112, -66, Math.PI, Math.PI, 0.2)),
  ); // harbor / NPCs
  await phase(q, async () => {
    await page.evaluate(() => window.__dev?.bench?.board?.());
    await page.waitForTimeout(quick ? 500 : 2500);
    await page.evaluate(() => window.__dev.hold(['KeyW'], 1600));
  });
  await phase(q, () => page.evaluate(() => window.__dev.hold(['KeyA'], 1400))); // sailing turn
  await phase(q, async () => {
    await page.evaluate(() => window.__dev.hold(['KeyS'], 1000));
    await page.evaluate(() => window.__dev?.bench?.dock?.());
  });

  const data = await page.evaluate(() => {
    window.__bench.stop();
    const samples = window.__bench.samples;
    const stats = window.__dev.stats();
    const hitches = window.__isles?.hitches?.() ?? [];
    return { samples, stats, hitches };
  });
  await page.close();

  const fpsSamples = data.samples.filter((s) => s.dt > 0).map((s) => 1000 / s.dt);
  const gpuSamples = data.samples.map((s) => (s.gpuMs && s.gpuMs > 0 ? Math.min(s.gpuMs, s.dt) : s.dt));
  const cpuSamples = data.samples.map((s) => s.cpuMs || 0).filter((v) => v > 0);
  const drawSamples = data.samples.map((s) => s.drawCalls || 0);
  const triSamples = data.samples.map((s) => s.triangles || 0);
  const progSamples = data.samples.map((s) => s.programs || 0);
  const result = {
    backend,
    tier,
    url,
    samples: data.samples.length,
    avgFps: avg(fpsSamples),
    p1Fps: percentile(fpsSamples, 0.01),
    avgGpuMs: avg(gpuSamples),
    avgCpuMs: avg(cpuSamples),
    maxDraws: Math.max(...drawSamples, 0),
    maxTriangles: Math.max(...triSamples, 0),
    maxPrograms: Math.max(...progSamples, 0),
    hitches: data.hitches,
    finalStats: data.stats,
    logs: logs.slice(0, 30),
  };
  result.pass = {
    gpu: pass(result.avgGpuMs, budget.gpuMs),
    cpu: pass(result.avgCpuMs, budget.cpuMs),
    draws: pass(result.maxDraws, budget.draws),
    triangles: pass(result.maxTriangles, budget.tris),
    programs: pass(result.maxPrograms, budget.programs),
  };
  return result;
}

async function fallbackCheck(browser) {
  const { page, logs } = await openPage(browser, `${base}/?forceSoftware`, 1);
  await page.waitForTimeout(1500);
  const text = await page
    .locator('body')
    .innerText()
    .catch(() => '');
  await page.close();
  return { forceSoftware2d: /graphics card|2D|browser/i.test(text), logs };
}

function icon(ok) {
  return ok ? '✅' : '❌';
}

function makeMarkdown({ runs, titles, fallback }) {
  const lines = [`# Phase 0 benchmark`, '', `Generated: ${new Date().toISOString()}`, ''];
  lines.push('## Tier emulation flythrough', '');
  lines.push('| Backend | Tier | Avg FPS | 1% low | GPU ms | CPU ms | Draws | Tris | Programs | Result |');
  lines.push('|---|---:|---:|---:|---:|---:|---:|---:|---:|---|');
  for (const r of runs) {
    const b = BUDGET[r.tier];
    const ok = Object.values(r.pass).every(Boolean);
    lines.push(
      `| ${r.backend} | ${r.tier} | ${r.avgFps.toFixed(1)} | ${r.p1Fps.toFixed(1)} | ${r.avgGpuMs.toFixed(2)} / ${b.gpuMs} ${icon(r.pass.gpu)} | ${r.avgCpuMs.toFixed(2)} / ${b.cpuMs} ${icon(r.pass.cpu)} | ${r.maxDraws} / ${b.draws} ${icon(r.pass.draws)} | ${(r.maxTriangles / 1000).toFixed(0)}k / ${(b.tris / 1000).toFixed(0)}k ${icon(r.pass.triangles)} | ${r.maxPrograms} / ${b.programs} ${icon(r.pass.programs)} | ${ok ? 'green' : 'red'} |`,
    );
  }
  lines.push('', '## Title / §7a checks', '');
  lines.push('| Backend | Tier | TTI ms | Programs | §7a |');
  lines.push('|---|---:|---:|---:|---|');
  for (const t of titles) {
    const ttiBudget = t.tier === 'low' ? 10_000 : 5_000;
    const programs = t.info?.programs ?? 0;
    const ok = t.ttiMs <= ttiBudget && programs <= 40;
    lines.push(
      `| ${t.backend} | ${t.tier} | ${t.ttiMs.toFixed(0)} / ${ttiBudget} | ${programs} / 40 | ${icon(ok)} |`,
    );
  }
  const lowWebgl = runs.filter((r) => r.backend === 'webgl' && r.tier === 'low');
  const lowOk = lowWebgl.every(
    (r) => r.pass.gpu && r.pass.cpu && r.pass.draws && r.pass.triangles && r.pass.programs,
  );
  lines.push('', `- Low forced-WebGL floor shots/flythrough budget: ${icon(lowOk)}`);
  lines.push(`- forceSoftware routes to 2D stub: ${icon(fallback.forceSoftware2d)}`);
  lines.push(
    '- WebGPU init failure → WebGL2 fallback: covered by `src/boot/main.ts`; use browser/device override to force an init exception manually until an injectable renderer factory lands.',
  );
  lines.push('', '## Logs', '');
  for (const r of [...runs, ...titles]) {
    if (!r.logs?.length) continue;
    lines.push(`### ${r.backend} ${r.tier}`, '```', ...r.logs.slice(0, 10), '```', '');
  }
  return lines.join('\n');
}

await mkdir(dirname(outBase), { recursive: true });
const browser = await chromium.launch({
  channel: 'chrome',
  args: [
    '--use-angle=metal',
    '--ignore-gpu-blocklist',
    '--enable-unsafe-webgpu',
    '--autoplay-policy=no-user-gesture-required',
  ],
});
const selectedTiers = quick ? ['low', 'high'] : tiers;
const titleTiers = ['high', 'low'];
const titles = [];
for (const backend of backends) {
  for (const tier of titleTiers) titles.push(await measureTitle(browser, backend, tier));
}
const runs = [];
for (const backend of backends) {
  for (const tier of selectedTiers) runs.push(await runFlythrough(browser, backend, tier));
}
const fallback = await fallbackCheck(browser);
await browser.close();
const data = { base, duration, quick, titles, runs, fallback };
await writeFile(`${outBase}.json`, JSON.stringify(data, null, 2));
await writeFile(`${outBase}.md`, makeMarkdown(data));
console.log(
  JSON.stringify(
    { json: `${outBase}.json`, md: `${outBase}.md`, runs: runs.length, titles: titles.length, fallback },
    null,
    2,
  ),
);
