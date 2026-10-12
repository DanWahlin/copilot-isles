#!/usr/bin/env node
// Draw-call and triangle budget check (PLAN §12.1). For each tier and island it walks the player to
// fixed spots (named spots plus seeded walkable spots, the same seed every run), turns the follow
// camera to four headings at each one, and records the worst frame. Counts are whole-frame, like the
// HUD and PLAN §12.1: every pass the renderer draws (main scene pass, shadow cascades, mirror, post
// quads). It splits each worst frame by pass and by scene group, so you can see what to cut:
//   pass   scene:main (the camera's scene pass), scene:shadow (sun shadow cascades), scene:cam (mirror
//          or another camera on the scene), aux:post (post-processing quads), aux:other (other scenes)
//   group  the scene's top-level child the object belongs to (e.g. port-meridian-town, vegetation),
//          one level deeper for big groups
// Needs a no-HMR dev server (edits elsewhere would reload the page mid-run):
//   npx vite --config tools/vite.nohmr.config.mjs --host 127.0.0.1 --port 5353 --strictPort
// node tools/budgettest.mjs [--base=http://127.0.0.1:5353] [--tiers=lite,low,medium,high,ultra]
//   [--islands=anchorage,meridian] [--spots=12] (seeded walkable spots per island, plus the named ones)
//   [--yaws=4] [--frames=8] (frames read per view) [--top=10] (groups to print) [--json=<file>]
//   [--views] (print every view) [--webgl]
// npm run check:frame-budgets -- --base=http://127.0.0.1:5353 runs it as a gate (not part of the build).
// It ends with one line per tier and island, and exits 0 only when every tier's worst view is within
// budget; it exits 1 when any is over (there's no allowance for a known gap), or on a page error.
import { writeFileSync } from 'node:fs';
import { collectLogs, launchChrome, parseFlags } from './lib/browser.mjs';

/** PLAN §12.1: draw calls (whole frame incl. mirror + post) and triangles (all scene passes), per tier. */
const BUDGET = {
  lite: { draws: 100, tris: 300_000 },
  low: { draws: 150, tris: 500_000 },
  medium: { draws: 225, tris: 1_000_000 },
  high: { draws: 300, tris: 2_000_000 },
  ultra: { draws: 400, tris: 3_500_000 },
};

/** Walkable areas to seed spots in, and named spots (x, z) that are known to be heavy views. */
const ISLANDS = {
  anchorage: {
    box: [-230, -230, 260, 230],
    named: [
      ['quay', -112, -82],
      ['village', -130, -40],
      ['mill', -58, -62],
      ['beach', 20, 96],
    ],
  },
  meridian: {
    box: [430, -1000, 940, -560],
    named: [
      ['quay', 'quay'],
      ['plaza', 660, -800],
      ['town', 760, -850],
      ['fort', 800, -772],
    ],
  },
};

const opt = parseFlags();
const base = String(opt.base || 'http://127.0.0.1:5353');
const tiers = String(opt.tiers || 'lite,low,medium,high,ultra').split(',');
const islands = String(opt.islands || 'anchorage,meridian').split(',');
const SPOTS = Number(opt.spots ?? 12);
const YAWS = Number(opt.yaws ?? 4);
const FRAMES = Number(opt.frames ?? 8);
const TOP = Number(opt.top ?? 10);

/** Installed in the page: splits every draw by pass and scene group, and keeps the last frames. */
function installProbe() {
  const dev = window.__dev;
  const r = dev.engine.renderer;
  const info = r.info;
  const mainScene = dev.scene;
  const mainCam = dev.camera;
  const groupOf = new WeakMap();
  const group = (o) => {
    let g = groupOf.get(o);
    if (g) return g;
    const chain = [];
    for (let p = o; p && p !== mainScene; p = p.parent) chain.push(p);
    if (!chain.length || chain[chain.length - 1].parent !== mainScene) g = '(other scene)';
    else {
      const top = chain[chain.length - 1];
      const second = chain[chain.length - 2];
      const name = (x) => x.name || x.type;
      g =
        second && /terrain|town|village|vegetation|sites|plants/.test(top.name)
          ? `${name(top)}/${name(second)}`
          : name(top);
    }
    groupOf.set(o, g);
    return g;
  };
  let pass = 'aux:other';
  // Shadow renders are numbered in frame order (one per cascade), so the passes show each map's share.
  let shadowRenders = 0;
  let cascade = '';
  const render = r.render.bind(r);
  r.render = (scene, camera) => {
    const prev = pass;
    const prevCascade = cascade;
    if (scene !== mainScene) pass = camera.isOrthographicCamera ? 'aux:post' : 'aux:other';
    else pass = `scene:${camera === mainCam ? 'main' : camera.isOrthographicCamera ? 'shadow' : 'cam'}`;
    if (pass === 'scene:shadow') cascade = String(shadowRenders++);
    try {
      return render(scene, camera);
    } finally {
      pass = prev;
      cascade = prevCascade;
    }
  };
  const blank = () => ({ draws: 0, tris: 0, passes: {}, groups: {} });
  let cur = blank();
  const frames = [];
  const update = info.update.bind(info);
  info.update = (object, count, instanceCount) => {
    update(object, count, instanceCount);
    const tris = object.isMesh || object.isSprite ? instanceCount * (count / 3) : 0;
    cur.draws++;
    cur.tris += tris;
    const p = (cur.passes[pass === 'scene:shadow' ? pass + cascade : pass] ??= { draws: 0, tris: 0 });
    p.draws++;
    p.tris += tris;
    const key = `${pass === 'scene:main' ? 'main' : pass === 'scene:shadow' ? 'shadow' : 'other'} ${group(object)}`;
    const g = (cur.groups[key] ??= { draws: 0, tris: 0 });
    g.draws++;
    g.tris += tris;
  };
  const reset = info.reset.bind(info);
  info.reset = () => {
    if (cur.draws) {
      frames.push(cur);
      if (frames.length > 64) frames.shift();
    }
    cur = blank();
    shadowRenders = 0;
    reset();
  };
  window.__budget = {
    take(n) {
      frames.length = 0;
      return new Promise((res) => {
        const tick = () => (frames.length >= n ? res(frames.slice(0, n)) : requestAnimationFrame(tick));
        requestAnimationFrame(tick);
      });
    },
  };
}

/** Seeded walkable spots (same generator and seed as the terrain LOD check). */
function seedSpots({ box, n }) {
  const s = window.__dev.session();
  const w = s.world;
  const R = s.player.tune.radius;
  let seed = 9;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const out = [];
  for (let i = 0; i < 20000 && out.length < n; i++) {
    const x = box[0] + rnd() * (box[2] - box[0]);
    const z = box[1] + rnd() * (box[3] - box[1]);
    if (w.surfaceHeightAt(x, z) !== null) continue;
    if (w.slopeAt(x, z) < 0.8) continue;
    const g = w.groundAt(x, z);
    if (!(g > 0.8)) continue;
    const p = { x, z };
    w.pushOut(p, R, g);
    if (Math.hypot(p.x - x, p.z - z) > 0.03) continue;
    out.push({ x, z });
  }
  return out;
}

const fmtK = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : `${Math.round(n / 1000)}k`);
const browser = await launchChrome({ autoplay: true });
const results = [];
let failed = false;
for (const tier of tiers) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const logs = collectLogs(page, { types: ['error'] });
  await page.goto(`${base}/devpages/play.html?auto&quiet&shot&tier=${tier}${opt.webgl ? '&webgl' : ''}`, {
    waitUntil: 'load',
  });
  await page.waitForFunction(() => window.__dev?.ready === true && window.__dev.session(), null, {
    timeout: 180000,
  });
  await page.evaluate(installProbe);
  await page.waitForTimeout(2000);
  for (const island of islands) {
    const cfg = ISLANDS[island];
    if (island === 'meridian') {
      // Skip the first-landfall flyover: it holds the camera far from the player.
      await page.evaluate(() => window.__dev.learn?.progress.add('arrivals', 'meridian'));
      const q = await page.evaluate(() => window.__dev.session().islandQuay('meridian'));
      await page.evaluate((q) => window.__dev.session().travel(q.x, q.z, q.heading), q);
      await page.waitForFunction(() => window.__dev.session().debug.cast().length > 0, null, {
        timeout: 120000,
      });
      await page.waitForTimeout(2500);
    }
    const quay = await page.evaluate((id) => window.__dev.session().islandQuay(id), island);
    const spots = cfg.named.map(([name, x, z]) =>
      x === 'quay' ? { name, x: quay.x, z: quay.z } : { name, x, z },
    );
    const seeded = await page.evaluate(seedSpots, { box: cfg.box, n: SPOTS });
    seeded.forEach((p, i) => spots.push({ name: `s${i}`, ...p }));
    const views = [];
    for (const sp of spots) {
      for (let k = 0; k < YAWS; k++) {
        const yaw = (k / YAWS) * Math.PI * 2;
        await page.evaluate(({ x, z, yaw }) => window.__dev.bench.teleport(x, z, yaw, yaw, 0.2), {
          ...sp,
          yaw,
        });
        await page.waitForTimeout(k === 0 ? 900 : 450);
        const frames = await page.evaluate((n) => window.__budget.take(n), FRAMES);
        const worst = frames.reduce((a, f) => (f.tris > a.tris ? f : a));
        const draws = Math.max(...frames.map((f) => f.draws));
        const worstDraws = frames.reduce((a, f) => (f.draws > a.draws ? f : a));
        views.push({
          spot: sp.name,
          x: +sp.x.toFixed(1),
          z: +sp.z.toFixed(1),
          yaw: +yaw.toFixed(2),
          tris: worst.tris,
          draws,
          worst,
          worstDraws,
        });
      }
    }
    const b = BUDGET[tier];
    const avg = (k) => views.reduce((a, v) => a + v[k], 0) / views.length;
    const maxT = views.reduce((a, v) => (v.tris > a.tris ? v : a));
    const maxD = views.reduce((a, v) => (v.draws > a.draws ? v : a));
    const over = maxT.tris >= b.tris || maxD.draws >= b.draws;
    failed ||= over;
    const sum = {
      tier,
      island,
      views: views.length,
      trisAvg: Math.round(avg('tris')),
      trisMax: maxT.tris,
      trisBudget: b.tris,
      drawsAvg: Math.round(avg('draws')),
      drawsMax: maxD.draws,
      drawsBudget: b.draws,
      worstTris: `${maxT.spot}@${maxT.yaw}`,
      worstDraws: `${maxD.spot}@${maxD.yaw}`,
      ok: !over,
    };
    console.log(
      `${tier.padEnd(6)} ${island.padEnd(9)} tris avg ${fmtK(sum.trisAvg)} max ${fmtK(sum.trisMax)} / ${fmtK(b.tris)}` +
        `  draws avg ${sum.drawsAvg} max ${sum.drawsMax} / ${b.draws}  ${over ? 'OVER' : 'ok'}` +
        `  (worst tris ${sum.worstTris} (${maxT.x}, ${maxT.z}), draws ${sum.worstDraws} (${maxD.x}, ${maxD.z}))`,
    );
    const show = (label, f, key) => {
      const passes = Object.entries(f.passes)
        .map(([p, v]) => `${p} ${v.draws}d/${fmtK(v.tris)}`)
        .join(', ');
      console.log(`    ${label}: ${passes}`);
      const top = Object.entries(f.groups)
        .sort((a, b) => b[1][key] - a[1][key])
        .slice(0, TOP)
        .map(([g, v]) => `${g} ${v.draws}d/${fmtK(v.tris)}`);
      console.log(`      ${top.join('\n      ')}`);
    };
    show('worst-tris frame', maxT.worst, 'tris');
    show('worst-draws frame', maxD.worstDraws, 'draws');
    if (opt.views) for (const v of views) console.log(`    ${v.spot}@${v.yaw} ${fmtK(v.tris)} ${v.draws}d`);
    results.push({
      ...sum,
      views: views.map((v) => ({ spot: v.spot, yaw: v.yaw, x: v.x, z: v.z, tris: v.tris, draws: v.draws })),
      worstTrisFrame: maxT.worst,
      worstDrawsFrame: maxD.worstDraws,
    });
  }
  if (logs.length) {
    failed = true;
    console.log(`${tier} page errors:\n  ${logs.slice(0, 5).join('\n  ')}`);
  }
  await page.close();
}
await browser.close();
if (opt.json) writeFileSync(String(opt.json), JSON.stringify(results, null, 1));
// The gate: one line per tier and island, worst view against the budget. No allowances: any tier over
// its budget (or a page error) fails the run.
console.log('\nPLAN §12.1 frame budgets (worst view per tier and island):');
console.log(
  `  ${'tier'.padEnd(7)}${'island'.padEnd(10)}${'triangles'.padEnd(18)}${'draws'.padEnd(12)}result`,
);
for (const r of results) {
  const tris = `${fmtK(r.trisMax)} / ${fmtK(r.trisBudget)}`;
  const draws = `${r.drawsMax} / ${r.drawsBudget}`;
  const over = [r.trisMax >= r.trisBudget && 'triangles', r.drawsMax >= r.drawsBudget && 'draws'].filter(
    Boolean,
  );
  console.log(
    `  ${r.tier.padEnd(7)}${r.island.padEnd(10)}${tris.padEnd(18)}${draws.padEnd(12)}${over.length ? `OVER (${over.join(', ')})` : 'ok'}`,
  );
}
console.log(failed ? 'FAIL: over budget (or page errors above)' : 'PASS: every tier is within budget');
process.exit(failed ? 1 : 0);
