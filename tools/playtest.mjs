#!/usr/bin/env node
// Scripted play-through of the Test Cove play page (Phase 0 T11 verification).
// node tools/playtest.mjs [--webgl] [--out=/tmp/shots/play] [--base=http://localhost:5300]
// Walks the quay, talks to Nell, boards the brigantine, sails, and docks, capturing state + shots.
import { collectLogs, launchChrome, parseFlags } from './lib/browser.mjs';

const opt = parseFlags();
const base = opt.base || 'http://localhost:5300';
const out = opt.out || '/tmp/shots/play';
const tag = opt.webgl ? 'gl' : 'gpu';
const url = `${base}/devpages/play.html?auto&quiet&shot&nolearn${opt.webgl ? '&webgl' : ''}${opt.noveg ? '&noveg' : ''}`;

const browser = await launchChrome();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const logs = collectLogs(page);
await page.goto(url, { waitUntil: 'load' });
await page.waitForFunction(() => window.__dev?.ready === true && window.__dev.session(), null, {
  timeout: 90000,
});
await page.waitForTimeout(1500);

const results = [];
const state = () => page.evaluate(() => window.__dev.state());
const shot = async (name) => {
  const path = `${out}-${tag}-${name}.png`;
  await page.screenshot({ path });
  return path;
};
const step = async (name, fn, { snap = true } = {}) => {
  await fn();
  const s = await state();
  const path = snap ? await shot(name) : null;
  results.push({ name, state: s, path });
};

await step('spawn', async () => {});
await step('walk', async () => page.evaluate(() => window.__dev.hold(['KeyW'], 1600)));
await step('run-turn', async () => page.evaluate(() => window.__dev.hold(['KeyD', 'ShiftLeft'], 1400)));

// Nell: stand in front of her and talk.
await step('nell', async () => {
  await page.evaluate(() => {
    const s = window.__dev.session();
    const nell = s.npcs.list.find((n) => n.spec.id === 'nell');
    const h = nell.heading;
    s.debug.teleport(nell.x + Math.sin(h) * 2.2, nell.z + Math.cos(h) * 2.2, h + Math.PI);
    window.__dev.look(h + Math.PI + 0.5, 0.18);
  });
  await page.waitForTimeout(900);
  await page.evaluate(() => window.__dev.tap('KeyE'));
  await page.waitForTimeout(2600);
});

// Skip the rest of Nell's lines, then walk the pier to the ship.
await step(
  'pier',
  async () => {
    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => window.__dev.tap('KeyE'));
      await page.waitForTimeout(300);
    }
    await page
      .waitForFunction(() => window.__dev.state()?.dialogue === false, null, { timeout: 20000 })
      .catch(() => logs.push('[playtest] dialogue never ended'));
    await page.waitForTimeout(600);
    await page.evaluate(() => {
      const s = window.__dev.session();
      // The gangway stays up until the christening; skip ahead so the pier walk can board.
      s.debug.quest('Q0.11', 'sail');
      s.debug.teleport(-106.9, -111.6, Math.PI / 2);
      window.__dev.look(Math.PI - 0.6, 0.25);
    });
    await page.waitForTimeout(1200);
  },
  { snap: true },
);

await step('board', async () => {
  const focus = (await state())?.focus;
  if (focus !== 'ship:board') logs.push(`[playtest] focus at the gangway was ${focus}`);
  await page.evaluate(() => window.__dev.tap('KeyE'));
  await page.waitForTimeout(2200);
  if ((await state())?.mode === 'walk') logs.push('[playtest] E at the gangway did not board');
});

await step('sail', async () => {
  await page.evaluate(() => window.__dev.hold(['KeyW'], 1300));
  await page.waitForTimeout(5000);
});
await step('sail-turn', async () => {
  await page.evaluate(() => window.__dev.hold(['KeyA'], 1500));
  await page.waitForTimeout(2500);
});

await step('dock-request', async () => {
  await page.evaluate(() => window.__dev.hold(['KeyS'], 1500));
  await page.evaluate(() => window.__dev.tap('KeyE'));
  await page.waitForTimeout(1500);
});
await step('docked', async () => {
  const trail = [];
  const t0 = Date.now();
  while (Date.now() - t0 < 60000) {
    const s = await state();
    trail.push(s?.ship);
    if (s?.mode === 'walk') break;
    await page.waitForTimeout(2000);
  }
  if ((await state())?.mode !== 'walk') {
    logs.push('[playtest] never docked within 60 s');
    logs.push(`[playtest] dock trail ${JSON.stringify(trail)}`);
  }
  await page.waitForTimeout(1200);
});

const stats = await page.evaluate(() => window.__dev.stats());
await browser.close();
console.log(
  JSON.stringify(
    {
      url,
      results,
      draws: stats.drawCalls,
      tris: stats.triangles,
      fps: stats.fps,
      logs: logs.slice(0, 20),
    },
    null,
    1,
  ),
);
