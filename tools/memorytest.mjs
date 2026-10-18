#!/usr/bin/env node
// The memory gate (PLAN §12.7, §13.3): plays Anchorage → Port Meridian → Thousand-Bough → Anchorage by
// chart travel, twice, on each tier and backend, and reads the GPU memory three tracks
// (`renderer.info.memory`, made honest by engine/memory-ledger.ts) and the JS heap after a forced GC
// at every stop. Fails if, back at Anchorage, memory is more than a small margin over the first visit
// (the heap's is a share or an absolute floor, whichever is more: budgets.json `margin.heapFloorMB`),
// if it keeps rising from one round trip to the next (a leak), if any stop is over its tier's ceiling
// (tools/budgets.json `memory`), or on a page error, a WebGPU validation error or a hitch. Then it
// sails to Port Meridian, waits for Anchorage to go dormant, quits to the title and starts a new
// voyage: the title must have no Anchorage, the new voyage exactly one, and memory as the first's.
// Also logs Chrome's DOM counters and `performance.measureUserAgentSpecificMemory()` where offered.
//   node tools/memorytest.mjs [--base=http://127.0.0.1:5301] [--tiers=high,lite] [--backends=webgpu,webgl2]
//                             [--trips=2] [--out=<dir>] [--no-gate]
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { collectLogs, launchChrome, parseFlags } from './lib/browser.mjs';

const opt = parseFlags();
const base = opt.base || 'http://127.0.0.1:5301';
const tiers = String(opt.tiers || 'high,lite').split(',');
const backends = String(opt.backends || 'webgpu,webgl2').split(',');
const trips = Number(opt.trips || 2);
const out = opt.out || null;
const budgets = JSON.parse(readFileSync(new URL('./budgets.json', import.meta.url), 'utf8')).memory;
const GPU_ERROR =
  /GPUValidationError|while destroyed|\[(Buffer|Texture|TextureView|BindGroup|RenderPipeline)\b/;
const ROUTE = ['meridian', 'thousand-bough', 'anchorage'];
const MB = 1048576;

const fails = [];
const results = [];

async function run(tier, backend) {
  const browser = await launchChrome({ autoplay: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  const logs = collectLogs(page, { types: ['error'] });
  let gpuErrors = 0;
  page.on('console', (m) => GPU_ERROR.test(m.text()) && gpuErrors++);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Performance.enable');
  const tag = `${tier}/${backend}`;
  const fail = (m) => fails.push(`${tag}: ${m}`);
  const flow = (js) => page.evaluate(`window.__flow.${js}`);
  const S = (js) => page.evaluate(`(() => { const s = window.__flow.debugSession; return ${js}; })()`);
  const until = (screen, timeout = 240_000) =>
    page.waitForFunction((s) => window.__flow?.getState().screen === s, screen, { timeout });
  const stops = [];

  /** Waits until the islands left behind have unloaded (the residency readout settles), then reads memory. */
  async function stop(label) {
    await page
      .waitForFunction(() => window.__flow.debugSession?.debug.residency?.().settled ?? true, null, {
        timeout: 120_000,
      })
      .catch(() => fail(`${label}: residency didn't settle in 120 s`));
    await page.waitForTimeout(4000);
    for (let i = 0; i < 3; i++) await cdp.send('HeapProfiler.collectGarbage').catch(() => {});
    const metrics = Object.fromEntries(
      (await cdp.send('Performance.getMetrics')).metrics.map((x) => [x.name, x.value]),
    );
    const dom = await cdp.send('Memory.getDOMCounters').catch(() => null);
    const info = await page.evaluate(async () => {
      const i = window.__isles.info();
      let uaMB = null;
      if (globalThis.crossOriginIsolated && performance.measureUserAgentSpecificMemory)
        uaMB = (await performance.measureUserAgentSpecificMemory()).bytes / 1048576;
      const s = window.__flow.debugSession;
      return {
        trackedMB: i.trackedMB,
        textureMB: i.textureMB,
        geometries: i.geometries,
        textures: i.textures,
        programs: i.programs,
        island: s?.island,
        resident: s?.debug.residency?.().resident ?? null,
        uaMB,
      };
    });
    const row = {
      label,
      trackedMB: +info.trackedMB.toFixed(1),
      textureMB: +info.textureMB.toFixed(1),
      heapMB: +(metrics.JSHeapUsedSize / MB).toFixed(1),
      geometries: info.geometries,
      textures: info.textures,
      programs: info.programs,
      island: info.island,
      resident: info.resident,
      dom: dom ? { nodes: dom.nodes, listeners: dom.jsEventListeners, documents: dom.documents } : null,
      uaMB: info.uaMB,
    };
    stops.push(row);
    console.log(
      `  ${tag} ${label.padEnd(22)} tracked ${row.trackedMB} MB (tex ${row.textureMB}) heap ${row.heapMB} MB  resident ${JSON.stringify(row.resident)}`,
    );
    return row;
  }

  const url = `${base}/?debug&meridian&thousandbough&tier=${tier}${backend === 'webgl2' ? '&webgl' : ''}`;
  try {
    await page.goto(url, { waitUntil: 'load' });
    await page.evaluate(() => localStorage.clear());
    await until('title', 180_000);
    await page.waitForTimeout(2000);
    await flow('chooseCaptain()');
    await page.waitForTimeout(700);
    await flow("newVoyage('woman')");
    await until('playing', 300_000);
    await page.waitForTimeout(1500);
    await S('s.debug.skipArrival()');
    const first = await stop('anchorage (first)');
    const back = [];
    for (let trip = 1; trip <= trips; trip++) {
      for (const id of ROUTE) {
        // The way a player goes: open the Captain's Chart, pick the island.
        await flow('openChart()');
        await page.waitForTimeout(800);
        await flow(`travelTo('island:${id}')`);
        await page.waitForFunction(
          (id) => window.__flow.getState().screen === 'playing' && window.__flow.debugSession?.island === id,
          id,
          { timeout: 180_000 },
        );
        await page.waitForTimeout(1500);
        await S('s.debug.skipArrival()');
        const row = await stop(`${id} (trip ${trip})`);
        if (id === 'anchorage') back.push(row);
      }
    }
    const hitches = await page.evaluate(() => window.__isles.hitches());
    const stalls = await page.evaluate(() => window.__isles.stalls());
    if (hitches.length) fail(`${hitches.length} hitches ${JSON.stringify(hitches.slice(0, 3))}`);
    // Quit while Anchorage is dormant (its parts parked out of the scene), then a new voyage: one
    // Anchorage, nothing drawn with freed buffers, and memory back where the first voyage began.
    const anchorages = () =>
      page.evaluate(() => {
        let n = 0;
        window.__flow.o.engine.scene.traverse((o) => void (o.name === 'test-cove-terrain' && n++));
        return n;
      });
    await flow('openChart()');
    await page.waitForTimeout(800);
    await flow("travelTo('island:meridian')");
    await page.waitForFunction(
      () =>
        window.__flow.getState().screen === 'playing' && window.__flow.debugSession?.island === 'meridian',
      null,
      { timeout: 180_000 },
    );
    await page.waitForTimeout(1500);
    await S('s.debug.skipArrival()');
    // Past the residency's 20 s away: Anchorage goes dormant.
    await page.waitForTimeout(24_000);
    const dormant = await stop('meridian (anchorage dormant)');
    if (dormant.resident?.includes('anchorage'))
      fail(`Anchorage still resident: ${JSON.stringify(dormant.resident)}`);
    await flow('pause()');
    await flow('quitToTitle()');
    await until('title', 120_000);
    await page.waitForTimeout(6000);
    const atTitle = await anchorages();
    if (atTitle !== 0)
      fail(`title after quitting with Anchorage dormant: ${atTitle} Anchorage terrains in the scene`);
    await flow('chooseCaptain()');
    await page.waitForTimeout(700);
    await flow("newVoyage('woman')");
    await until('playing', 300_000);
    await page.waitForTimeout(1500);
    await S('s.debug.skipArrival()');
    const again = await stop('anchorage (new voyage)');
    const count = await anchorages();
    if (count !== 1) fail(`new voyage after a dormant quit: ${count} Anchorage terrains in the scene`);
    if (gpuErrors) fail(`${gpuErrors} WebGPU validation errors`);
    for (const l of logs) fail(l);
    // Back at Anchorage, close to the first visit.
    const m = budgets.margin;
    // The heap's allowance: a share of the first visit's, or an absolute floor (budgets.json says why).
    const heapLimit = (mb) => +Math.max(mb * (1 + m.heapPct / 100), mb + m.heapFloorMB).toFixed(1);
    const b1 = back[0];
    if (b1) {
      if (b1.trackedMB > first.trackedMB * (1 + m.trackedPct / 100))
        fail(
          `back at Anchorage: tracked ${b1.trackedMB} MB > first ${first.trackedMB} MB + ${m.trackedPct} %`,
        );
      if (b1.heapMB > heapLimit(first.heapMB))
        fail(
          `back at Anchorage: heap ${b1.heapMB} MB > ${heapLimit(first.heapMB)} MB (first ${first.heapMB} MB)`,
        );
    }
    // The next voyage starts where the first did.
    if (again.trackedMB > first.trackedMB * (1 + m.trackedPct / 100))
      fail(
        `new voyage: tracked ${again.trackedMB} MB > first voyage ${first.trackedMB} MB + ${m.trackedPct} %`,
      );
    if (again.heapMB > heapLimit(first.heapMB))
      fail(
        `new voyage: heap ${again.heapMB} MB > ${heapLimit(first.heapMB)} MB (first voyage ${first.heapMB} MB)`,
      );
    // No growth from one round trip to the next.
    for (let i = 1; i < back.length; i++) {
      const a = back[i - 1],
        c = back[i];
      if (c.trackedMB - a.trackedMB > budgets.leak.trackedMB)
        fail(`round trip ${i + 1}: tracked grew ${a.trackedMB} → ${c.trackedMB} MB`);
      if (c.heapMB - a.heapMB > budgets.leak.heapMB)
        fail(`round trip ${i + 1}: heap grew ${a.heapMB} → ${c.heapMB} MB`);
    }
    // Every stop under the tier's ceiling.
    const ceiling = budgets.ceilings[tier];
    if (ceiling)
      for (const r of stops) {
        if (r.trackedMB > ceiling.trackedMB)
          fail(`${r.label}: tracked ${r.trackedMB} MB > ceiling ${ceiling.trackedMB} MB`);
        if (r.heapMB > ceiling.heapMB) fail(`${r.label}: heap ${r.heapMB} MB > ceiling ${ceiling.heapMB} MB`);
      }
    // Frame gaps over 50 ms after warm-up (not a gate: timing depends on the machine), for the report.
    results.push({
      tier,
      backend,
      stops,
      hitches: hitches.length,
      stalls: stalls.length,
      stallList: stalls,
      gpuErrors,
    });
  } catch (e) {
    fail(`run failed: ${e.message.split('\n')[0]}`);
    results.push({ tier, backend, stops, error: e.message.split('\n')[0] });
  } finally {
    await browser.close();
  }
}

for (const tier of tiers) for (const backend of backends) await run(tier, backend);

if (out) {
  mkdirSync(out, { recursive: true });
  writeFileSync(`${out}/memory.json`, JSON.stringify({ base, results, fails }, null, 2));
}
console.log('\nstop                    ' + results.map((r) => `${r.tier}/${r.backend}`.padEnd(24)).join(''));
const labels = results[0]?.stops.map((s) => s.label) ?? [];
for (const [i, l] of labels.entries())
  console.log(
    l.padEnd(24) +
      results
        .map((r) => (r.stops[i] ? `${r.stops[i].trackedMB} / ${r.stops[i].heapMB} MB` : '-').padEnd(24))
        .join(''),
  );
console.log('(tracked GPU / JS heap after GC)');
if (fails.length) {
  console.log(`\nFAIL (${fails.length})`);
  for (const f of fails) console.log(`  ${f}`);
  if (!opt['no-gate']) process.exit(1);
} else console.log('\nPASS');
