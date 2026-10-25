#!/usr/bin/env node
// Wayfinding checks (src/game/wayfinding/, each island's waypoints in src/world/islands/waypoints.ts),
// on the real collision world and terrain:
//  1. Every walking leg of every island is walked both ways by a walker with the captain's tuning
//     (straight at the far waypoint, sliding along whatever's in the way) and must arrive.
//  2. Every sea lane the chart joins has deep water for the brigantine along it and to either side.
//  3. One sitting: board at Anchorage, sail to Port Meridian (the compass's route, followed with the
//     helm), dock, and the gangway's "Board your ship" is there on Meridian's quay; the same on to
//     Thousand-Bough; and after a chart jump back. Each time the compass ashore points at the gangway
//     once the step says to board, and every quest step of every island has a compass target.
//  4. In irons by Port Meridian's harbour, Wingman's tacking tip plays once a voyage.
// node tools/wayfindtest.mjs [--base=http://127.0.0.1:5301] [--out=<dir>] [--only=legs,sea,sitting,tack]
//                            [--webgl] [--verbose]
import { mkdirSync } from 'node:fs';
import { collectLogs, launchChrome, parseFlags } from './lib/browser.mjs';
import { ISLAND_IDS, OPEN_FLAGS, STREAMED } from './lib/islands.mjs';

const opt = parseFlags();
const base = opt.base || 'http://127.0.0.1:5301';
const out = opt.out || 'tmp/shots/wayfind';
mkdirSync(out, { recursive: true });
const only = opt.only ? String(opt.only).split(',') : ['legs', 'sea', 'sitting', 'tack'];
const tag = opt.webgl ? 'gl' : 'gpu';

const browser = await launchChrome();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const logs = collectLogs(page, { types: ['error'] });
const fail = (m) => {
  logs.push(`[wayfindtest] ${m}`);
  if (opt.verbose) console.log(`FAIL ${m}`);
};
const note = (m) => opt.verbose && console.log(`${new Date().toISOString().slice(11, 19)} ${m}`);
const S = (f, a) => page.evaluate(f, a);
const shots = [];
const shot = async (name) => {
  const path = `${out}/${tag}-${String(shots.length).padStart(2, '0')}-${name}.png`;
  await page.screenshot({ path });
  shots.push(path);
};

await page.goto(`${base}/devpages/play.html?auto&quiet${OPEN_FLAGS}&shot${opt.webgl ? '&webgl' : ''}`, {
  waitUntil: 'load',
});
await page.waitForFunction(() => window.__dev?.ready === true && window.__dev.session(), null, {
  timeout: 180000,
});
await page.waitForTimeout(1500);

/** Waits out a first landfall's flyover and welcome (E through its lines), back to walking. */
async function settle() {
  await S(() => window.__dev.session().debug.skipArrival());
  // Wingman's welcome starts a moment after landing: wait for a few calm seconds in a row.
  for (let i = 0, calm = 0; i < 150 && calm < 8; i++) {
    const st = await S(() => window.__dev.session().debug.state());
    if (st.mode === 'walk' && !st.dialogue && !st.welcome) calm++;
    else {
      calm = 0;
      if (st.dialogue) await S(() => window.__dev.tap('KeyE'));
    }
    await page.waitForTimeout(400);
  }
  await page.waitForFunction(() => window.__dev.settled().ok, null, { timeout: 90000 }).catch(() => {});
  await page.waitForTimeout(800);
}

/** Puts the captain ashore on an island (the chart's travel), past its flyover. */
async function ashore(id) {
  const q = await S((id) => window.__dev.session().islandQuay(id), id);
  await S((q) => window.__dev.session().travel(q.x, q.z, q.heading), q);
  await page.waitForFunction((id) => window.__dev.session().island === id, id, { timeout: 60000 });
  await settle();
}

/** The hitch guard's list before any step that jumps the quests about (null: check at the end). */
let hitchesChecked = null;

// ---- 1. Walking legs --------------------------------------------------------------------------
if (only.includes('legs')) {
  for (const id of ISLAND_IDS) {
    await ashore(id);
    const r = await S(async (id) => {
      const ISLAND_WAYS = await (await import('/src/world/islands/waypoints.ts')).loadIslandWays();
      const s = window.__dev.session();
      const w = s.world;
      const spec = ISLAND_WAYS[id].walk;
      const byId = new Map(spec.nodes.map((n) => [n.id, n]));
      const P = new s.player.constructor();
      const intent = { moveX: 0, moveY: 1, run: true, jump: false };
      const bad = [];
      for (const n of spec.nodes) {
        const g = w.groundAt(n.x, n.z, n.y + 0.5);
        if (Math.abs(g - n.y) > 0.8) bad.push(`node ${n.id}: walk height ${g.toFixed(2)}, not ${n.y}`);
      }
      const walk = (a, b) => {
        P.teleport(w, a.x, a.z, Math.atan2(b.x - a.x, b.z - a.z), a.y + 0.5);
        const len = Math.hypot(b.x - a.x, b.z - a.z);
        const steps = Math.ceil(((len / 3.5) * 1.6 + 4) * 60);
        for (let i = 0; i < steps; i++) {
          if (Math.hypot(b.x - P.x, b.z - P.z) < 1.1 && Math.abs(P.y - b.y) < 1.4) return null;
          P.step(1 / 60, intent, Math.atan2(b.x - P.x, b.z - P.z), w, 0);
        }
        return `stopped at (${P.x.toFixed(1)}, ${P.y.toFixed(1)}, ${P.z.toFixed(1)}), ${Math.hypot(b.x - P.x, b.z - P.z).toFixed(1)} m short`;
      };
      // Townsfolk walk about: a leg that's blocked is tried again a moment later before it fails.
      const retry = [];
      for (const [a, b, ride] of spec.legs) {
        if (ride) continue;
        const A = byId.get(a),
          B = byId.get(b);
        if (walk(A, B)) retry.push([A, B]);
        if (walk(B, A)) retry.push([B, A]);
      }
      if (retry.length) await new Promise((r) => setTimeout(r, 2500));
      for (const [A, B] of retry) {
        const r = walk(A, B);
        if (r) bad.push(`${A.id} → ${B.id}: ${r}`);
      }
      return { legs: spec.legs.length, bad };
    }, id);
    note(`${id}: ${r.legs} legs, ${r.bad.length} problems`);
    for (const b of r.bad) fail(`${id} walk: ${b}`);
  }
}

// ---- 2. Sea lanes ----------------------------------------------------------------------------
if (only.includes('sea')) {
  const r = await S(async (streamed) => {
    const ISLAND_WAYS = await (await import('/src/world/islands/waypoints.ts')).loadIslandWays();
    const { SeaChart } = await import('/src/game/wayfinding/sea-chart.ts');
    const s = window.__dev.session();
    s.debug.keepResident(true);
    for (const id of streamed) await s.debug.loadIsland(id);
    const chart = new SeaChart(Object.values(ISLAND_WAYS).map((w) => w.sea));
    const g = s.world.ground;
    const DRAFT = 2.7;
    const SIDE = 6;
    const bad = [];
    const shallow = (x, z) => g.heightAt(x, z) + DRAFT > -0.4;
    const pts = [];
    for (let i = 0; i < chart.size; i++) pts.push(chart.point(i));
    pts.forEach((p, i) => {
      if (shallow(p.x, p.z))
        bad.push(`waypoint ${i} (${p.x.toFixed(0)}, ${p.z.toFixed(0)}) is in shallow water`);
    });
    let links = 0;
    for (let i = 0; i < pts.length; i++)
      for (let j = i + 1; j < pts.length; j++) {
        const a = pts[i],
          b = pts[j];
        if (!chart.clear(a.x, a.z, b.x, b.z)) continue;
        links++;
        const len = Math.hypot(b.x - a.x, b.z - a.z);
        const nx = -(b.z - a.z) / len,
          nz = (b.x - a.x) / len;
        for (let d = 0; d <= len; d += 4) {
          const x = a.x + ((b.x - a.x) * d) / len,
            z = a.z + ((b.z - a.z) * d) / len;
          if (
            shallow(x, z) ||
            shallow(x + nx * SIDE, z + nz * SIDE) ||
            shallow(x - nx * SIDE, z - nz * SIDE)
          ) {
            bad.push(
              `lane ${i}→${j} (${a.x.toFixed(0)}, ${a.z.toFixed(0)})→(${b.x.toFixed(0)}, ${b.z.toFixed(0)}) shoals at (${x.toFixed(0)}, ${z.toFixed(0)})`,
            );
            break;
          }
        }
      }
    s.debug.keepResident(false);
    return { waypoints: pts.length, links, bad };
  }, STREAMED);
  note(`sea: ${r.waypoints} waypoints, ${r.links} lanes, ${r.bad.length} problems`);
  for (const b of r.bad) fail(`sea: ${b}`);
}

// ---- 3. One sitting: sail island to island and board each time ----------------------------------
if (only.includes('sitting')) {
  const quests = (list) =>
    S((l) => {
      for (const [id, step] of l) window.__dev.session().debug.quest(id, step);
    }, list);
  const pack = (id) =>
    S(async (id) => {
      const { islandQuests } = await import('/src/course/active.ts');
      return islandQuests(id).quests.map((q) => ({
        id: q.id,
        optional: !!q.optional,
        steps: Object.keys(q.steps),
      }));
    }, id);
  const hud = () =>
    S(() => {
      const txt = (sel) => document.querySelector(sel)?.textContent?.trim() ?? '';
      const st = window.__dev.session().debug.state();
      return {
        compass: document.querySelector('.hud-compass.show.has-target') ? txt('.hud-compass-label') : '',
        name: txt('.hud-compass-label .name'),
        dist: txt('.hud-compass-label .dist'),
        prompt: document.querySelector('.hud-prompt.show') ? txt('.hud-prompt') : '',
        mode: st.mode,
        island: window.__dev.session().island,
      };
    });
  const distOf = (h) => {
    const m = /([\d.]+)\s*(k?m)/.exec(h.dist);
    return m ? parseFloat(m[1]) * (m[2] === 'km' ? 1000 : 1) : null;
  };
  const berths = await S(async () => {
    const { ISLANDS } = await import('/src/game/islands.ts');
    return Object.fromEntries(Object.values(ISLANDS).map((b) => [b.id, b.mooring]));
  });
  /** Walks up to the gangway's foot with the keys (from the quay side) until its prompt shows. */
  const boardByKeys = async (label) => {
    const g = await S(() => window.__dev.session().debug.gangway());
    const near = await S((f) => window.__dev.session().debug.near(f.x, f.z, 3), g.foot);
    if (!near.some((n) => n.id === 'ship:board' && n.on))
      fail(`${label}: no usable "Board your ship" at the gangway (${JSON.stringify(near.map((n) => n.id))})`);
    // Stand on the quay 2.5 m out from the foot (away from the hull), facing it.
    const p = await S(
      ([f, m]) => {
        const s = window.__dev.session();
        const dx = f.x - m.x,
          dz = f.z - m.z;
        const l = Math.hypot(dx, dz) || 1;
        const x = f.x + (dx / l) * 2.5,
          z = f.z + (dz / l) * 2.5;
        const h = Math.atan2(f.x - x, f.z - z);
        s.debug.teleport(x, z, h);
        window.__dev.look(h, 0.25);
        return { x, z };
      },
      [g.foot, berths[await S(() => window.__dev.session().island)]],
    );
    let prompt = '';
    for (let i = 0; i < 12 && !/Board your ship/.test(prompt); i++) {
      await page.keyboard.down('KeyW');
      await page.waitForTimeout(90);
      await page.keyboard.up('KeyW');
      await page.waitForTimeout(150);
      prompt = (await hud()).prompt;
    }
    if (!/Board your ship/.test(prompt)) {
      fail(
        `${label}: walked to the gangway from (${p.x.toFixed(1)}, ${p.z.toFixed(1)}), no "Board your ship" prompt`,
      );
      return false;
    }
    await shot(`${label}-board-prompt`);
    await page.keyboard.press('KeyE');
    await page
      .waitForFunction(() => window.__dev.session().mode === 'sail', null, { timeout: 15000 })
      .catch(() => {});
    if ((await hud()).mode !== 'sail') {
      fail(`${label}: E at the gangway didn't board`);
      return false;
    }
    await page.waitForTimeout(800);
    return true;
  };
  /** Sails up to an island's berth (moved there, as the passage is long) and docks with E. */
  const arrive = async (id, berth) => {
    await S(() => {
      const s = window.__dev.session();
      if (s.battle.active) s.battle.skip();
    });
    await S(
      (b) => window.__dev.session().debug.sailTo(b.x, b.z + (b.heading === 0 ? 12 : -12), b.heading),
      berth,
    );
    await page.waitForTimeout(1200);
    await page.keyboard.press('KeyE');
    await page.waitForFunction(
      (id) => window.__dev.session().mode === 'walk' && window.__dev.session().island === id,
      id,
      { timeout: 60000 },
    );
    await settle();
  };
  const mark = async (l) => note(`${l}: hitches ${await S(() => window.__isles?.hitches?.().length ?? 0)}`);
  // Anchorage, its quests done: the compass is on the ship; board with the keys.
  await ashore('anchorage');
  const anc = await pack('anchorage');
  await quests(anc.filter((q) => !q.optional).map((q) => [q.id, 'done']));
  await page.waitForTimeout(400);
  let h = await hud();
  if (!/Your ship/.test(h.name)) fail(`Anchorage done: compass on "${h.compass}", not the ship`);
  await shot('anchorage-done-compass');
  if (await boardByKeys('anchorage')) {
    h = await hud();
    if (!/Port Meridian/.test(h.name)) fail(`sailing from Anchorage: compass on "${h.compass}"`);
    await mark('boarded at Anchorage');
    await arrive('meridian', berths.meridian);
    await mark('docked at Meridian');
    // The Three Helms: the step says to board, so the compass is on the gangway (near, not 1 km out).
    const mer = await pack('meridian');
    const main = mer.filter((q) => !q.optional);
    await quests([...main.slice(0, 4).map((q) => [q.id, 'done']), [main[4].id, 'helms']]);
    await page.waitForTimeout(400);
    h = await hud();
    const d = distOf(h);
    if (d === null || d > 80)
      fail(`Meridian, the Helms step ashore: compass "${h.compass}" (not the gangway)`);
    await shot('meridian-helms-compass');
    if (await boardByKeys('meridian-helms')) {
      await mark('boarded for the Helms');
      const rhea = await S(() => window.__dev.session().debug.rheaAboard());
      if (!rhea) fail('Meridian: boarded for the Helms, but Rhea isn’t aboard');
      await arrive('meridian', berths.meridian);
      await quests(main.map((q) => [q.id, 'done']));
      await page.waitForTimeout(400);
      h = await hud();
      if (!/Your ship/.test(h.name)) fail(`Meridian sealed: compass on "${h.compass}", not the ship`);
      if (await boardByKeys('meridian-sealed')) {
        h = await hud();
        if (!/Thousand-Bough/.test(h.name)) fail(`sailing from Meridian sealed: compass on "${h.compass}"`);
        await arrive('thousand-bough', berths['thousand-bough']);
        await mark('docked at Thousand-Bough');
        await boardByKeys('thousand-bough');
        await mark('boarded at Thousand-Bough');
        await arrive('thousand-bough', berths['thousand-bough']);
        await mark('docked at Thousand-Bough again');
      }
    }
  }
  // A chart jump back to Anchorage: the gangway's there too.
  await ashore('anchorage');
  await mark('chart jump to Anchorage');
  await boardByKeys('anchorage-after-travel');
  await mark('boarded at Anchorage again');

  // Every quest step of every island, in the game: the compass has a target ashore. (It jumps the
  // quest state about with the dev hooks, which can spawn story props out of order: hitches after
  // this point aren't the game's.)
  hitchesChecked = await S(() => window.__isles?.hitches?.() ?? []);
  for (const id of ISLAND_IDS) {
    await ashore(id);
    const list = await pack(id);
    for (const d of list.filter((x) => !x.optional)) {
      for (const step of d.steps) {
        if (step === 'done') continue;
        await quests([[d.id, step]]);
        await page.waitForTimeout(120);
        h = await hud();
        if (!h.compass) fail(`${id} ${d.id}:${step}: no compass target ashore`);
      }
      await quests([[d.id, 'done']]);
    }
    await page.waitForTimeout(120);
    h = await hud();
    if (!/Your ship/.test(h.name)) fail(`${id} all done: compass "${h.compass}"`);
    note(`${id}: every step has a compass target`);
    await mark(id);
  }
}

// ---- 4. In irons by a harbour: Wingman's tacking tip, once a voyage ------------------------------
if (only.includes('tack')) {
  const intoWind = async () => {
    await S(async () => {
      const { windAt } = await import('/src/world/wind.ts');
      const s = window.__dev.session();
      if (s.mode !== 'sail') await s.debug.board();
      if (s.battle.active) s.battle.skip();
      const w = windAt(735, -545, 0, [0, 0]);
      const h = Math.atan2(-w[0], -w[1]);
      s.debug.sailTo(735, -545, h);
      window.__dev.look(h, 0.2);
    });
    await page.waitForTimeout(500);
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(2500);
    await page.keyboard.up('KeyW');
  };
  const wingman = async (ms) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      const line = await S(() => {
        const sub = document.querySelector('.hud-subtitle.show');
        return sub ? sub.textContent : '';
      });
      if (/Tack/.test(line)) return line;
      await page.waitForTimeout(250);
    }
    return '';
  };
  await ashore('meridian');
  await intoWind();
  const line = await wingman(12000);
  if (!line) fail('in irons by Meridian: no tacking tip from Wingman');
  else await shot('tacking-tip');
  await S(() => window.__dev.tap('KeyE'));
  // Ashore and aboard again: the tip doesn't repeat (the head-to-wind toast does).
  await ashore('meridian');
  await intoWind();
  if (await wingman(9000)) fail('the tacking tip played twice in one voyage');
}

await shot('end');
const hitches = hitchesChecked ?? (await S(() => window.__isles?.hitches?.() ?? []));
note(`hitches: ${JSON.stringify(hitches)}`);
if (hitches.length) fail(`hitches: ${JSON.stringify(hitches).slice(0, 400)}`);
console.log(JSON.stringify({ ok: logs.length === 0, logs, shots }, null, 2));
await browser.close();
process.exit(logs.length === 0 ? 0 : 1);
