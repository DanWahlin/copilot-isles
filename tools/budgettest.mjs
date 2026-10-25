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
//
// It measures the world settled, never on a clock. A fixed wait after each move read frames from an
// island's warm-up on a busy machine (6-7 s there: it redraws the static sun shadow map and every
// terrain level each frame), so the same tree passed or failed with the machine's load. Now each view
// waits until the page's `__dev.settled()` is `ok` (no warm-up running, the sun shadow node not
// warming, every island stream absent, resident or failed and none held by a warm), then until
// `--frames` frames in a row have no static shadow map redraw and steady counts (draws and triangles
// within `--steady` of each other, or repeating a cycle: two such windows in a row with the same peaks
// and troughs, like a part drawn three frames in four); those frames are the view's sample. A view that hasn't settled
// within `--settle-timeout` seconds marks its island UNSETTLED (with what it waited on) and fails.
// Each island's views are measured twice, and both sets are gated: first on arrival with the island
// you've left still in memory (PLAN §13.3 keeps it 20 s; the tool holds it with the session's
// `debug.keepResident` until the set is done, so a slow run measures the same moment), then once
// the islands you've left are freed. A resident island past its swap distance must draw its
// silhouette, not its parts (islands/silhouette-swap.ts): Medium Meridian's hill read 1.00M with
// Anchorage's village drawn in the distance before. An island reached with none left resident (the
// first) reports "none resident" for the first set. Both sets wait for the arrival island's own warm.
// The static map's redraw is left out of the gate on purpose: PLAN §12.4 caches it and redraws it
// only after the focus moves ~50 m or the sun turns (time stands still in play), so it's a one-frame
// cost, not a per-frame one. After each view settles the tool forces one redraw (`invalidate()`, as
// walking 50 m would) and reports the worst such frame per tier and island on a line of its own,
// not gated. A page without `__dev.settled()` (src/dev/play.ts) fails the run.
//
// Needs a no-HMR dev server (edits elsewhere would reload the page mid-run):
//   npx vite --config tools/vite.nohmr.config.mjs --host 127.0.0.1 --port 5353 --strictPort
// node tools/budgettest.mjs [--base=http://127.0.0.1:5353] [--tiers=lite,low,medium,high,ultra]
//   [--islands=anchorage,meridian,thousand-bough] (default: every island in tools/lib/islands.json) [--spots=12] (seeded walkable spots per island, plus the named ones)
//   [--yaws=4] [--frames=8] (settled frames read per view) [--steady=0.03] (the frames' spread allowed,
//   a fraction of the largest count; draws also get 4) [--settle-timeout=120] (seconds per view)
//   [--top=10] (groups to print) [--json=<file>]
//   [--views] (print every view) [--meshes] (print the worst frames' top meshes by name and material)
//   [--webgl] [--cpu-throttle=4] (slows this page's CPU, to check the gate reads the same on a slow machine)
//   [--sea=calm|breeze|fresh|gale] (the Sea state setting, from the first frame: its foam and spray are
//   in the sea's own shader, so every state must read the same draws and triangles)
// npm run check:frame-budgets -- --base=http://127.0.0.1:5353 runs it as a gate (not part of the build).
// It ends with one line per tier and island (both sample sets), and exits 0 only when every tier's
// worst settled view in each set is within budget; it exits 1 when any is over (there's no allowance
// for a known gap), when an island doesn't settle, or on a page error.
import { writeFileSync } from 'node:fs';
import { collectLogs, launchChrome, parseFlags } from './lib/browser.mjs';
import { HOME, ISLAND_IDS, ISLANDS as TOOL_ISLANDS } from './lib/islands.mjs';

/** PLAN §12.1: draw calls (whole frame incl. mirror + post) and triangles (all scene passes), per tier. */
const BUDGET = {
  lite: { draws: 100, tris: 300_000 },
  low: { draws: 150, tris: 500_000 },
  medium: { draws: 225, tris: 1_000_000 },
  high: { draws: 300, tris: 2_000_000 },
  ultra: { draws: 400, tris: 3_500_000 },
};

/**
 * Walkable areas to seed spots in, and named spots (x, z) that are known to be heavy views: each
 * island's `budget` in tools/lib/islands.json.
 */
const ISLANDS = Object.fromEntries(TOOL_ISLANDS.map((i) => [i.id, i.budget]));

const opt = parseFlags();
const base = String(opt.base || 'http://127.0.0.1:5353');
const tiers = String(opt.tiers || 'lite,low,medium,high,ultra').split(',');
const islands = String(opt.islands || ISLAND_IDS.join(',')).split(',');
for (const id of islands)
  if (!ISLANDS[id])
    throw new Error(`budgettest: no spots for island "${id}" (add its budget to tools/lib/islands.json)`);
const SPOTS = Number(opt.spots ?? 12);
const YAWS = Number(opt.yaws ?? 4);
const FRAMES = Number(opt.frames ?? 8);
const STEADY = Number(opt.steady ?? 0.03);
const SETTLE_MS = Number(opt['settle-timeout'] ?? 120) * 1000;
const TOP = Number(opt.top ?? 10);

/**
 * Installed in the page: splits every draw by pass and scene group, marks the frames where the static
 * sun shadow map redrew (and why), and waits for settled frames.
 */
function installProbe() {
  const dev = window.__dev;
  const sun = dev.scene.children.find((o) => o.isDirectionalLight && o.shadow?.shadowNode);
  const shadow = sun?.shadow.shadowNode ?? null;
  let seenRefreshes = shadow?.refreshes ?? 0;
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
  // Per-mesh key: the object's name (or its parent's, for unnamed parts) and its material's name.
  const meshOf = new WeakMap();
  const meshKey = (o) => {
    let k = meshOf.get(o);
    if (k) return k;
    let n = o.name;
    for (let p = o.parent; !n && p && p !== mainScene; p = p.parent) n = p.name && `${p.name}/${o.type}`;
    const m = Array.isArray(o.material) ? o.material[0] : o.material;
    k = `${n || o.type} [${m?.name || m?.type || '-'}]`;
    meshOf.set(o, k);
    return k;
  };
  const blank = () => ({ draws: 0, tris: 0, passes: {}, groups: {}, meshes: {}, refresh: null, wait: null });
  let cur = blank();
  /** Frames drawn since the probe went in (each pushed with its sequence number). */
  let seq = 0;
  const frames = [];
  const waiting = (s) => {
    const why = [];
    if (s.warms) why.push(`${s.warms} warm-up(s) running`);
    if (s.warming) why.push(`sun shadow warming ${s.warming}`);
    for (const [id, st] of Object.entries(s.streams)) {
      if (st.held) why.push(`${id} held`);
      if (!['absent', 'resident', 'failed'].includes(st.state)) why.push(`${id} ${st.state}`);
    }
    return why.join(', ') || 'not ok';
  };
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
    const mk = `${key.slice(0, key.indexOf(' '))} ${meshKey(object)}`;
    const m = (cur.meshes[mk] ??= { draws: 0, tris: 0 });
    m.draws++;
    m.tris += tris;
  };
  const reset = info.reset.bind(info);
  info.reset = () => {
    if (cur.draws) {
      // The static map redraws inside the frame's render (the shadow node's updateBefore).
      const refreshes = shadow?.refreshes ?? 0;
      if (refreshes !== seenRefreshes) {
        cur.refresh = shadow.lastReason;
        seenRefreshes = refreshes;
      }
      const s = dev.settled();
      if (!s.ok) cur.wait = waiting(s);
      cur.seq = seq++;
      frames.push(cur);
      if (frames.length > 64) frames.shift();
    }
    cur = blank();
    shadowRenders = 0;
    reset();
  };
  const nextFrames = (from, done, timeoutMs) =>
    new Promise((res) => {
      const t0 = performance.now();
      let next = from;
      const tick = () => {
        for (const f of frames) {
          if (f.seq < next) continue;
          next = f.seq + 1;
          const out = done(f);
          if (out) return res(out);
        }
        if (performance.now() - t0 > timeoutMs) return res(null);
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  window.__budget = {
    /**
     * Resolves with `n` frames in a row drawn settled (`__dev.settled().ok`), with no static shadow map
     * redraw and steady counts; or, past `timeoutMs`, with what it was waiting on.
     */
    async settle(n, steady, timeoutMs) {
      const t0 = performance.now();
      let run = [];
      let why = 'no frame drawn';
      const got = await nextFrames(
        seq,
        (f) => {
          if (f.wait || f.refresh) {
            run = [];
            why = f.wait ?? `static shadow map redrew (${f.refresh})`;
            return null;
          }
          run.push(f);
          if (run.length > 2 * n) run.shift();
          if (run.length < n) return null;
          const last = run.slice(-n);
          const near = (a, b, k) => Math.abs(a - b) <= (k === 'draws' ? Math.max(4, steady * a) : steady * a);
          const max = (fs, k) => Math.max(...fs.map((r) => r[k]));
          const min = (fs, k) => Math.min(...fs.map((r) => r[k]));
          // Steady: the last frames agree, or they repeat a cycle (a part drawn 3 frames in 4): the
          // peaks and troughs of two windows in a row match.
          const flat = ['draws', 'tris'].every((k) => near(max(last, k), min(last, k), k));
          const prev = run.length === 2 * n ? run.slice(0, n) : null;
          const cycle =
            prev &&
            ['draws', 'tris'].every(
              (k) => near(max(last, k), max(prev, k), k) && near(min(last, k), min(prev, k), k),
            );
          if (flat || cycle) return last;
          why = `counts unsteady (draws ${min(last, 'draws')}-${max(last, 'draws')}, triangles ${min(last, 'tris')}-${max(last, 'tris')})`;
          return null;
        },
        timeoutMs,
      );
      const ms = Math.round(performance.now() - t0);
      return got ? { ok: true, frames: got, ms } : { ok: false, ms, why, settled: dev.settled() };
    },
    /** Redraws the static shadow map once (as walking 50 m would) and resolves with that frame. */
    async refresh(timeoutMs) {
      if (!shadow) return null;
      const from = seq;
      shadow.invalidate();
      return nextFrames(from, (f) => (f.refresh ? f : null), timeoutMs);
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
const fmtS = (ms) => `${(ms / 1000).toFixed(1)} s`;
/** Waits for settled frames (see the header); null and a report when the view doesn't settle. */
async function settle(page, where) {
  const got = await page.evaluate(
    ([n, steady, ms]) => window.__budget.settle(n, steady, ms),
    [FRAMES, STEADY, SETTLE_MS],
  );
  if (got.ok) return got;
  console.log(
    `UNSETTLED ${where} after ${fmtS(got.ms)}: waiting on ${got.why}\n  __dev.settled() ${JSON.stringify(got.settled)}`,
  );
  return null;
}

const results = [];
let failed = false;

/** The two sample sets each island's views are measured in (both gated). */
const SET_LABEL = {
  resident: 'last island still resident',
  freed: 'islands left freed',
};

/**
 * Walks to each spot, turns to each heading, and records each view's worst settled frame (and the
 * static shadow map's redraw there, reported but not gated). `stuck` names a view that didn't settle.
 */
async function measure(page, tier, island, spots, set) {
  const views = [];
  const refreshes = [];
  let settleMax = { ms: 0, at: '' };
  for (const sp of spots) {
    for (let k = 0; k < YAWS; k++) {
      const yaw = (k / YAWS) * Math.PI * 2;
      await page.evaluate(
        ({ x, z, y, yaw }) => {
          if (y === undefined) return window.__dev.bench.teleport(x, z, yaw, yaw, 0.2);
          window.__dev.session().debug.teleport(x, z, yaw, y);
          window.__dev.look(yaw, 0.2);
        },
        { ...sp, yaw },
      );
      const at = `${sp.name}@${yaw.toFixed(2)}`;
      const got = await settle(
        page,
        `${tier} ${island} (${SET_LABEL[set]}) ${at} (${sp.x.toFixed(1)}, ${sp.z.toFixed(1)})`,
      );
      if (!got) return { stuck: at };
      if (got.ms > settleMax.ms) settleMax = { ms: got.ms, at };
      const frames = got.frames;
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
      // The static map's redraw, settled here (one frame; reported, not gated).
      const r = await page.evaluate((ms) => window.__budget.refresh(ms), 10000);
      if (r) refreshes.push({ at, x: +sp.x.toFixed(1), z: +sp.z.toFixed(1), frame: r });
    }
  }
  return { views, refreshes, settleMax };
}

/** Prints one sample set's worst views against the budget and records it in `results`. */
function report(tier, island, set, { views, refreshes, settleMax }, extra) {
  const b = BUDGET[tier];
  const avg = (k) => views.reduce((a, v) => a + v[k], 0) / views.length;
  const maxT = views.reduce((a, v) => (v.tris > a.tris ? v : a));
  const maxD = views.reduce((a, v) => (v.draws > a.draws ? v : a));
  const over = maxT.tris >= b.tris || maxD.draws >= b.draws;
  failed ||= over;
  const refT = refreshes.length ? refreshes.reduce((a, r) => (r.frame.tris > a.frame.tris ? r : a)) : null;
  const refD = refreshes.length ? refreshes.reduce((a, r) => (r.frame.draws > a.frame.draws ? r : a)) : null;
  const sum = {
    tier,
    island,
    set,
    views: views.length,
    trisAvg: Math.round(avg('tris')),
    trisMax: maxT.tris,
    trisBudget: b.tris,
    drawsAvg: Math.round(avg('draws')),
    drawsMax: maxD.draws,
    drawsBudget: b.draws,
    worstTris: `${maxT.spot}@${maxT.yaw}`,
    worstDraws: `${maxD.spot}@${maxD.yaw}`,
    arrivalMs: extra.arrival.ms,
    ...(extra.left ? { left: extra.left } : {}),
    ...(extra.freedMs !== undefined ? { freedMs: extra.freedMs } : {}),
    settleMaxMs: settleMax.ms,
    refresh: refT && {
      trisMax: refT.frame.tris,
      drawsMax: refD.frame.draws,
      worstTris: refT.at,
      worstDraws: refD.at,
      reason: refT.frame.refresh,
    },
    ok: !over,
  };
  const when =
    set === 'resident' ? `${extra.left.join(', ')} resident` : `islands left freed ${fmtS(extra.freedMs)}`;
  console.log(
    `${tier.padEnd(6)} ${island.padEnd(14)} ${SET_LABEL[set]}: tris avg ${fmtK(sum.trisAvg)} max ${fmtK(sum.trisMax)} / ${fmtK(b.tris)}` +
      `  draws avg ${sum.drawsAvg} max ${sum.drawsMax} / ${b.draws}  ${over ? 'OVER' : 'ok'}` +
      `  (worst tris ${sum.worstTris} (${maxT.x}, ${maxT.z}), draws ${sum.worstDraws} (${maxD.x}, ${maxD.z}))` +
      `  settled: arrival ${fmtS(extra.arrival.ms)}, ${when}, slowest view ${fmtS(settleMax.ms)} (${settleMax.at})`,
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
    if (!opt.meshes) return;
    const meshes = Object.entries(f.meshes)
      .sort((a, b) => b[1][key] - a[1][key])
      .slice(0, Number(opt.meshes) > 1 ? Number(opt.meshes) : 40)
      .map(([g, v]) => `${g} ${v.draws}d/${fmtK(v.tris)}`);
    console.log(`      meshes:\n        ${meshes.join('\n        ')}`);
  };
  show('worst-tris frame', maxT.worst, 'tris');
  show('worst-draws frame', maxD.worstDraws, 'draws');
  if (refT) {
    console.log(
      `    static shadow redraw (not gated): worst ${fmtK(refT.frame.tris)} at ${refT.at}, ${refD.frame.draws} draws at ${refD.at}`,
    );
    show('worst redraw frame', refT.frame, 'tris');
  }
  if (opt.views) for (const v of views) console.log(`    ${v.spot}@${v.yaw} ${fmtK(v.tris)} ${v.draws}d`);
  results.push({
    ...sum,
    views: views.map((v) => ({ spot: v.spot, yaw: v.yaw, x: v.x, z: v.z, tris: v.tris, draws: v.draws })),
    worstTrisFrame: maxT.worst,
    worstDrawsFrame: maxD.worstDraws,
    worstRefreshFrame: refT?.frame ?? null,
  });
}

const browser = await launchChrome({ autoplay: true });
for (const tier of tiers) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const logs = collectLogs(page, { types: ['error'] });
  // A slow machine on demand (Chrome's CPU throttling, this page only): settling takes longer, the counts don't change.
  if (opt['cpu-throttle'])
    await (
      await page.context().newCDPSession(page)
    ).send('Emulation.setCPUThrottlingRate', {
      rate: Number(opt['cpu-throttle']),
    });
  const sea = opt.sea ? `&sea=${opt.sea}` : '';
  await page.goto(
    `${base}/devpages/play.html?auto&quiet&shot&tier=${tier}${opt.webgl ? '&webgl' : ''}${sea}`,
    {
      waitUntil: 'load',
    },
  );
  await page.waitForFunction(() => window.__dev?.ready === true && window.__dev.session(), null, {
    timeout: 180000,
  });
  if (!(await page.evaluate(() => typeof window.__dev.settled === 'function'))) {
    console.log(
      `FAIL: ${base}/devpages/play.html has no __dev.settled() (src/dev/play.ts), so nothing can wait for it`,
    );
    await browser.close();
    process.exit(1);
  }
  await page.evaluate(installProbe);
  let ready = !!(await settle(page, `${tier} start`));
  for (const island of islands) {
    const cfg = ISLANDS[island];
    const b = BUDGET[tier];
    const unsettled = (why, set = 'freed') => {
      failed = true;
      results.push({
        tier,
        island,
        set,
        unsettled: why,
        trisBudget: b.tris,
        drawsBudget: b.draws,
        ok: false,
      });
      console.log(`${tier.padEnd(6)} ${island.padEnd(14)} ${SET_LABEL[set]}: UNSETTLED (${why})`);
    };
    if (!ready) {
      unsettled('the page never settled');
      continue;
    }
    // The island you're leaving stays in memory (as if the world were busy) until the arrival's
    // views with it resident are measured: its 20 s grace would otherwise end mid-sweep.
    await page.evaluate(() => window.__dev.session().debug.keepResident(true));
    if (island !== HOME) {
      // Skip the first-landfall flyover (it holds the camera far from the player), and go ashore.
      await page.evaluate((id) => window.__dev.learn?.progress.add('arrivals', id), island);
      const q = await page.evaluate((id) => window.__dev.session().islandQuay(id), island);
      await page.evaluate((q) => window.__dev.session().travel(q.x, q.z, q.heading), q);
    }
    // Its content is on (the session's setup, whose warm-up `settled()` then counts).
    await page.waitForFunction(
      (id) =>
        window.__dev
          .session()
          .islandSetups()
          .some((s) => s.id === id),
      island,
      { timeout: 180000 },
    );
    const arrival = await settle(page, `${tier} ${island} arrival`);
    if (!arrival) {
      await page.evaluate(() => window.__dev.session().debug.keepResident(false));
      unsettled('arrival', 'resident');
      continue;
    }
    const quay = await page.evaluate((id) => window.__dev.session().islandQuay(id), island);
    const spots = cfg.named.map(([name, x, z, y]) =>
      x === 'quay' ? { name, x: quay.x, z: quay.z } : { name, x, z, y },
    );
    const seeded = await page.evaluate(seedSpots, { box: cfg.box, n: SPOTS });
    seeded.forEach((p, i) => spots.push({ name: `s${i}`, ...p }));
    // 1. The arrival with the islands you've left still resident (PLAN §13.3 keeps them 20 s): they
    // draw their silhouettes past their swap distance, so this is gated like the settled world.
    const left = await page.evaluate(
      (id) =>
        Object.entries(window.__dev.settled().streams)
          .filter(([k, st]) => k !== id && st.state === 'resident')
          .map(([k]) => k),
      island,
    );
    let gaveUp = false;
    if (left.length) {
      const m = await measure(page, tier, island, spots, 'resident');
      if (m.stuck) {
        unsettled(`at ${m.stuck}`, 'resident');
        gaveUp = true;
      } else report(tier, island, 'resident', m, { arrival, left });
    } else {
      console.log(
        `${tier.padEnd(6)} ${island.padEnd(14)} ${SET_LABEL.resident}: none (no island left resident)`,
      );
      results.push({ tier, island, set: 'resident', none: true, ok: true });
    }
    await page.evaluate(() => window.__dev.session().debug.keepResident(false));
    if (gaveUp) continue;
    // 2. The islands you've left are freed 20 s after you leave them (PLAN §13.3, game/residency.ts):
    // measure after that too, or the result depends on how fast the run reaches each view.
    const t0 = Date.now();
    const freed = await page
      .waitForFunction(
        (id) =>
          Object.entries(window.__dev.settled().streams).every(
            ([k, st]) => k === id || st.state === 'absent' || st.state === 'failed',
          ),
        island,
        { timeout: SETTLE_MS, polling: 100 },
      )
      .then(
        () => true,
        () => false,
      );
    if (!freed || !(await settle(page, `${tier} ${island} after the islands you left are freed`))) {
      if (!freed) {
        const s = await page.evaluate(() => window.__dev.settled());
        console.log(
          `UNSETTLED ${tier} ${island}: the islands you left weren't freed\n  ${JSON.stringify(s)}`,
        );
      }
      unsettled('islands left not freed');
      continue;
    }
    const freedMs = Date.now() - t0;
    const m = await measure(page, tier, island, spots, 'freed');
    if (m.stuck) {
      unsettled(`at ${m.stuck}`);
      continue;
    }
    report(tier, island, 'freed', m, { arrival, freedMs });
  }
  if (logs.length) {
    failed = true;
    console.log(`${tier} page errors:\n  ${logs.slice(0, 5).join('\n  ')}`);
  }
  await page.close();
}
await browser.close();
if (opt.json) writeFileSync(String(opt.json), JSON.stringify(results, null, 1));
// The gate: one line per tier and island, worst settled view against the budget in each sample set
// (the arrival with the last island still resident, and with the islands left freed). No allowances:
// any tier over its budget in either set, an island that doesn't settle, or a page error fails the run.
console.log('\nPLAN §12.1 frame budgets (worst settled view per tier and island, in each sample set):');
const cell = (r) => {
  if (!r) return ['', ''];
  if (r.none) return ['none resident', ''];
  if (r.unsettled) return ['UNSETTLED', ''];
  return [`${fmtK(r.trisMax)} / ${fmtK(r.trisBudget)}`, `${r.drawsMax} / ${r.drawsBudget}`];
};
console.log(
  `  ${''.padEnd(23)}${SET_LABEL.resident.padEnd(30)}${SET_LABEL.freed.padEnd(30)}\n` +
    `  ${'tier'.padEnd(7)}${'island'.padEnd(16)}${'triangles'.padEnd(18)}${'draws'.padEnd(12)}${'triangles'.padEnd(18)}${'draws'.padEnd(12)}result`,
);
const rows = new Map();
for (const r of results) {
  const k = `${r.tier}|${r.island}`;
  if (!rows.has(k)) rows.set(k, { tier: r.tier, island: r.island });
  rows.get(k)[r.set] = r;
}
for (const row of rows.values()) {
  const [rt, rd] = cell(row.resident);
  const [ft, fd] = cell(row.freed);
  const why = [];
  for (const set of ['resident', 'freed']) {
    const r = row[set];
    if (!r || r.none) continue;
    if (r.unsettled) {
      why.push(`${set}: UNSETTLED (${r.unsettled})`);
      continue;
    }
    const over = [r.trisMax >= r.trisBudget && 'triangles', r.drawsMax >= r.drawsBudget && 'draws'].filter(
      Boolean,
    );
    if (over.length) why.push(`${set}: OVER (${over.join(', ')})`);
  }
  console.log(
    `  ${row.tier.padEnd(7)}${row.island.padEnd(16)}${rt.padEnd(18)}${rd.padEnd(12)}${ft.padEnd(18)}${fd.padEnd(12)}${why.length ? why.join('; ') : 'ok'}`,
  );
}
// PLAN §12.4: the static map redraws only after the focus moves ~50 m or the sun turns, one frame at
// a time, so its frame isn't held to the per-frame budget; shown so a heavy one is seen.
console.log(
  '\nStatic shadow map redraw frames (worst per tier and island; one frame per ~50 m, PLAN §12.4; not gated):',
);
for (const r of results) {
  if (r.unsettled || r.none) continue;
  const where = `  ${r.tier.padEnd(7)}${r.island.padEnd(16)}${(r.set === 'resident' ? 'resident' : 'freed').padEnd(10)}`;
  if (!r.refresh) {
    console.log(`${where}no sun shadow map on this tier`);
    continue;
  }
  const tris = `${fmtK(r.refresh.trisMax)} (${r.refresh.worstTris})`;
  const draws = `${r.refresh.drawsMax} (${r.refresh.worstDraws})`;
  console.log(`${where}${tris.padEnd(24)}${draws}`);
}
console.log(
  failed ? 'FAIL: over budget, unsettled, or page errors (see above)' : 'PASS: every tier is within budget',
);
process.exit(failed ? 1 : 0);
