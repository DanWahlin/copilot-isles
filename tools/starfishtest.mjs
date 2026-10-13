#!/usr/bin/env node
// Checks every starfish can be collected on foot (issue 243). For each one, using the game's own
// collision world and the player's walk rules (collider push-out, step-up, slope limit, wading
// depth), it finds a spot within pickup range of the star and floods outward from there. A star
// passes if that walk gets well clear of it (so it isn't shut in by colliders, water or a wall).
// Needs the dev server (npm run dev, port 5301).
// node tools/starfishtest.mjs [--base=http://localhost:5301] [--out=/tmp/shots/starfish]
import { collectLogs, launchChrome, parseFlags } from './lib/browser.mjs';

const opt = parseFlags(process.argv.slice(2));
const base = opt.base || 'http://localhost:5301';
const out = opt.out || '';
const browser = await launchChrome({ autoplay: true });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const logs = collectLogs(page);
await page.goto(`${base}/devpages/play.html?auto&quiet&meridian`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__dev?.ready === true && window.__dev.session(), null, {
  timeout: 120000,
});
const S = (f, a) => page.evaluate(f, a);
await page.waitForTimeout(2500);
// Port Meridian's town (and its colliders) only load when needed: go there first.
const q = await S(() => window.__dev.session().islandQuay('meridian'));
await S((q) => window.__dev.session().travel(q.x, q.z, q.heading), q);
await page.waitForFunction(() => window.__dev.session().debug.cast().length > 0, null, { timeout: 90000 });
await page.waitForTimeout(1500);
// And Thousand-Bough's world (its decks and the stair) when it's open.
const tb = await S(() => window.__dev.session().islandQuay('thousand-bough'));
if (tb) {
  await S((q) => window.__dev.session().travel(q.x, q.z, q.heading), tb);
  await page.waitForFunction(
    () =>
      window.__dev
        .session()
        .debug.cast()
        .some((n) => n.id === 'tamsin'),
    null,
    {
      timeout: 120000,
    },
  );
  await page.waitForTimeout(1500);
}

const results = await S(() => {
  const s = window.__dev.session();
  const w = s.world;
  const T = s.player.tune;
  const STEP_UP = 0.66; // the session's player (createSession: stepUp 0.66)
  const PICK = 1.05; // a little inside the 1.1 m pickup radius
  const ESCAPE = 30; // metres from the star that count as "out"
  const CELL = 0.3;
  const MAX_CELLS = 120000;
  const p = { x: 0, z: 0 };
  const free = (x, z, y) => {
    p.x = x;
    p.z = z;
    w.pushOut(p, T.radius, y);
    return Math.hypot(p.x - x, p.z - z) < 0.03;
  };
  const report = [];
  for (const sp of s.debug.starfish()) {
    const starGround = w.groundAt(sp.x, sp.z, sp.y);
    // Places you could stand to pick it up.
    const seeds = [];
    for (let dx = -PICK; dx <= PICK; dx += 0.15)
      for (let dz = -PICK; dz <= PICK; dz += 0.15) {
        if (Math.hypot(dx, dz) > PICK) continue;
        const x = sp.x + dx,
          z = sp.z + dz;
        const g = w.groundAt(x, z, starGround + 0.3);
        if (Math.abs(g - starGround) > 0.7) continue;
        if (w.waterAt(x, z, 0) - g > T.wadeMax) continue;
        if (!free(x, z, g)) continue;
        seeds.push({ x, z, y: g });
      }
    if (!seeds.length) {
      report.push({ id: sp.id, name: sp.name, ok: false, why: 'nowhere to stand within reach' });
      continue;
    }
    // Flood out from the pickup spots with the player's walk rules.
    const seen = new Set();
    const key = (x, z, y) => `${Math.round(x / CELL)},${Math.round(z / CELL)},${Math.round(y)}`;
    const queue = [];
    for (const c of seeds) {
      const k = key(c.x, c.z, c.y);
      if (!seen.has(k)) {
        seen.add(k);
        queue.push(c);
      }
    }
    let ok = false;
    let far = 0;
    for (let head = 0; head < queue.length && queue.length < MAX_CELLS; head++) {
      const a = queue[head];
      const d = Math.hypot(a.x - sp.x, a.z - sp.z);
      far = Math.max(far, d);
      if (d > ESCAPE) {
        ok = true;
        break;
      }
      const g0 = w.groundAt(a.x, a.z, a.y);
      const cur = w.waterAt(a.x, a.z, 0) - g0;
      for (const [ox, oz] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
        [1, 1],
        [1, -1],
        [-1, 1],
        [-1, -1],
      ]) {
        const x = a.x + ox * CELL,
          z = a.z + oz * CELL;
        if (!free(x, z, a.y)) continue;
        const g1 = w.groundAt(x, z, a.y);
        const rise = g1 - Math.max(a.y, g0);
        if (rise > STEP_UP) continue;
        if (rise > 0.05 && w.slopeAt(x, z, a.y) < T.minSlopeY) continue;
        const depth = w.waterAt(x, z, 0) - g1;
        if (depth > T.wadeMax && depth > cur) continue;
        const k = key(x, z, g1);
        if (seen.has(k)) continue;
        seen.add(k);
        queue.push({ x, z, y: g1 });
      }
    }
    report.push({
      id: sp.id,
      name: sp.name,
      ok,
      ...(ok ? {} : { why: `shut in: the walk only reaches ${far.toFixed(1)} m from it` }),
    });
  }
  return report;
});

const failed = results.filter((r) => !r.ok);
if (out) {
  for (const r of failed) {
    await S((id) => {
      const sp = window.__dev
        .session()
        .debug.starfish()
        .find((v) => v.id === id);
      window.__dev.session().debug.teleport(sp.x, sp.z, 0, sp.y);
    }, r.id);
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${out}-${r.id}.png` });
  }
}
for (const r of results)
  console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${r.id.padEnd(22)} ${r.name}${r.ok ? '' : ` (${r.why})`}`);
const errors = logs.filter((l) => l.startsWith('[error]') || l.startsWith('[pageerror]'));
console.log(JSON.stringify({ stars: results.length, failed: failed.length, errors: errors.slice(0, 5) }));
await browser.close();
process.exit(failed.length || errors.length ? 1 : 0);
