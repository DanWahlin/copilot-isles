#!/usr/bin/env node
// End-to-end quest run on the play page: Nell (spyglass + hotspot quiz + page), the chest, Ezra, Bo and his gear rack (Q0.5),
// Suri's sluice (P0.1),
// Pim and Pol's Dry-Run Crane (P0.2),
// and the Harbormaster's Trial at the lighthouse, answered through the real UI where it matters
// (hotspots are clicked; other types use __dev.answer()), with screenshots at each beat.
// node tools/questtest.mjs [--base=http://localhost:5301] [--webgl] [--out=/tmp/shots/quest]
import { chromium } from '@playwright/test';

const opt = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, ...v] = a.replace(/^--/, '').split('=');
    return [k, v.length ? v.join('=') : true];
  }),
);
const base = opt.base || 'http://localhost:5301';
const out = opt.out || '/tmp/shots/quest';
const tag = opt.webgl ? 'gl' : 'gpu';
const url = `${base}/devpages/play.html?auto&quiet&shot${opt.webgl ? '&webgl' : ''}`;

const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--use-angle=metal', '--ignore-gpu-blocklist', '--enable-unsafe-webgpu'],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const logs = [];
page.on('console', (m) => {
  if (m.type() === 'error') logs.push(`[error] ${m.text()}`);
});
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
await page.goto(url, { waitUntil: 'load' });
await page.waitForFunction(() => window.__dev?.ready === true && window.__dev.session(), null, {
  timeout: 90000,
});
await page.waitForTimeout(1500);

const shots = [];
const shot = async (name) => {
  const path = `${out}-${tag}-${name}.png`;
  await page.screenshot({ path });
  shots.push(path);
};
const learnState = () =>
  page.evaluate(() => {
    const l = window.__dev.learn.getState();
    const st = window.__dev.state();
    return {
      quiz: l.quiz
        ? { id: l.quiz.quiz.id, type: l.quiz.quiz.type, correct: l.quiz.last?.correct ?? null }
        : null,
      reveal: l.reveal?.page.id ?? null,
      banner: l.banner?.title ?? null,
      spyglass: l.spyglass?.image ?? null,
      dialogue: st.dialogue,
      quests: window.__dev.learn.progress.data.quests,
      pages: l.pages.length,
      doubloons: l.doubloons,
    };
  });
const tap = (code) => page.evaluate((c) => window.__dev.tap(c), code);

/** Clicks the centre of the correct hotspot target (through the real click handler). */
async function clickHotspot() {
  const box = await page.evaluate(() => {
    const quiz = window.__dev.learn.getState().quiz.quiz;
    const t = quiz.targets.find((x) => x.correct);
    const frame = document.querySelector('.ci-hotspot-frame').getBoundingClientRect();
    return {
      x: frame.left + frame.width * (t.rect[0] + t.rect[2] / 2),
      y: frame.top + frame.height * (t.rect[1] + t.rect[3] / 2),
    };
  });
  await page.mouse.click(box.x, box.y);
}

const seen = new Set();
/** Drives dialogue, quizzes, and reveals until `done(state)` or the timeout. */
async function drive(label, done, ms = 120000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const s = await learnState();
    if (done(s)) return s;
    if (s.quiz) {
      if (!seen.has(s.quiz.id)) {
        seen.add(s.quiz.id);
        await page.waitForTimeout(500);
        await shot(`quiz-${s.quiz.id}`);
      }
      if (s.quiz.correct) await tap('KeyE');
      else if (s.quiz.type === 'hotspot') await clickHotspot();
      else await page.evaluate(() => window.__dev.answer());
    } else if (s.reveal || s.banner) {
      const key = `reveal-${s.reveal ?? s.banner}`;
      if (!seen.has(key)) {
        seen.add(key);
        await page.waitForTimeout(500);
        await shot(key.replace(/[^\w.-]+/g, '_'));
      }
      await tap('KeyE');
    } else if (s.dialogue) {
      if (s.spyglass && !seen.has(`spy-${s.spyglass}`)) {
        seen.add(`spy-${s.spyglass}`);
        await page.waitForTimeout(700);
        await shot(`spyglass-${s.spyglass.replace(/\W+/g, '_')}`);
      }
      await tap('KeyE');
    }
    await page.waitForTimeout(350);
  }
  logs.push(`[questtest] ${label}: timed out`);
  return learnState();
}

const talk = async (npcId) => {
  await page.evaluate((id) => {
    const s = window.__dev.session();
    const n = s.npcs.list.find((v) => v.spec.id === id);
    const h = n.heading;
    s.debug.teleport(n.x + Math.sin(h) * 2, n.z + Math.cos(h) * 2, h + Math.PI);
    window.__dev.look(h + Math.PI + 0.35, 0.16);
  }, npcId);
  await page.waitForTimeout(900);
  await tap('KeyE');
  await page.waitForTimeout(600);
};

const results = {};

// Nell: Captain's Papers.
await talk('nell');
results.nell = await drive(
  'nell',
  (s) => s.quests['Q0.2'] === 'chest' && !s.dialogue && !s.quiz && !s.reveal,
);

// The chest beside Nell's door.
const chest = await page.evaluate(() => {
  const n = window.__dev.session().npcs.list.find((v) => v.spec.id === 'nell');
  return { x: n.x, z: n.z, h: n.heading };
});
const chestPos = await page.evaluate(() => window.__dev.session().debug.chests?.()[0] ?? null);
if (chestPos) {
  await page.evaluate(({ x, z, h }) => {
    const s = window.__dev.session();
    s.debug.teleport(x + Math.sin(h) * 1.6, z + Math.cos(h) * 1.6, h + Math.PI);
    window.__dev.look(h + Math.PI + 0.6, 0.35);
  }, chestPos);
  await page.waitForTimeout(900);
  await shot('chest-closed');
  await tap('KeyE');
  await page.waitForTimeout(400);
  await shot('chest-opening');
} else {
  logs.push(`[questtest] no chest debug hook (nell at ${JSON.stringify(chest)})`);
}
results.chest = await drive('chest', (s) => s.quests['Q0.2'] === 'done' && !s.reveal);

// Ezra: Copy the Master Chart.
await talk('merchant');
results.ezra = await drive('ezra', (s) => s.quests['Q0.3'] === 'done' && !s.dialogue && !s.quiz && !s.reveal);

// Bo: Your Own Deck.
await talk('dockhand_b');
results.bo = await drive('bo', (s) => s.quests['Q0.5'] === 'gear' && !s.dialogue && !s.quiz && !s.reveal);

// Bo's gear rack (Q0.5): pick up each piece, hang it (a version check per hook), fetch the missing
// lens, then read the ledger (S0.1). Everything goes through E at the real interaction spots.
const gear = () => page.evaluate(() => window.__dev.session().debug.puzzle('Q0.5.gear')?.state() ?? null);
const gs = await page.evaluate(() => window.__dev.session().debug.puzzle('Q0.5.gear')?.spots() ?? null);
if (gs) {
  const focus = () => page.evaluate(() => window.__dev.session().debug.state().focus);
  const standAt = async (a) => {
    await page.evaluate((a) => {
      window.__dev.session().debug.teleport(a.x, a.z, a.heading ?? Math.PI);
      window.__dev.look((a.heading ?? Math.PI) + 0.3, 0.3);
    }, a);
    await page.waitForTimeout(700);
  };
  /** Stands 1 m from a loose piece, facing it. */
  const fetch = async (id) => {
    const p = gs.loose[id];
    for (const h of [Math.PI, 0, Math.PI / 2, -Math.PI / 2]) {
      await standAt({ x: p.x - Math.sin(h) * 1.0, z: p.z - Math.cos(h) * 1.0, heading: h });
      if ((await focus()) === `gear:${id}`) break;
    }
    if ((await focus()) !== `gear:${id}`)
      logs.push(`[questtest] gear: focus at the ${id} was ${await focus()}`);
    await tap('KeyE');
    await page.waitForTimeout(500);
  };
  const atRack = async (label) => {
    await standAt(gs.rack);
    if ((await focus()) !== 'gear:rack')
      logs.push(`[questtest] gear: focus at the rack was ${await focus()}`);
    await tap('KeyE');
    await page.waitForTimeout(900);
    if (label) await shot(label);
  };
  for (const id of ['compass', 'lantern', 'rope', 'spyglass']) await fetch(id);
  await shot('gear-carried');
  for (const id of ['compass', 'lantern', 'rope']) await atRack(id === 'rope' ? 'gear-three' : null);
  await atRack('gear-missing');
  await drive('gear-missing', (s) => !s.dialogue);
  if ((await gear())?.lens !== 'loose') logs.push('[questtest] gear: the lens never turned up');
  await fetch('lens');
  await atRack();
  results.gear = await drive(
    'gear',
    (s) => s.quests['Q0.5'] === 'ledger' && !s.dialogue && !s.quiz && !s.reveal,
  );
  await standAt(gs.rack);
  await shot('gear-checked');
  await standAt(gs.ledger);
  if ((await focus()) !== 'gear:ledger')
    logs.push(`[questtest] gear: focus at the ledger was ${await focus()}`);
  await tap('KeyE');
  await page.waitForTimeout(900);
  await shot('gear-ledger-wrong');
  results.ledger = await drive(
    'ledger',
    (s) => s.quests['Q0.5'] === 'done' && !s.dialogue && !s.quiz && !s.reveal,
  );
  await standAt(gs.ledger);
  await shot('gear-ledger-signed');
  if (!(await gear())?.signed) logs.push('[questtest] gear: the ledger never signed');
} else logs.push('[questtest] no Q0.5 gear debug hook');

// Suri: Open the Sluice (P0.1). The lever and one tile turn go through E like a player would.
await talk('suri');
results.suri = await drive(
  'suri',
  (s) => s.quests['Q0.6'] === 'sluice' && !s.dialogue && !s.quiz && !s.reveal,
);
const sluice = () => page.evaluate(() => window.__dev.session().debug.puzzle('P0.1')?.state() ?? null);
const spots = await page.evaluate(() => window.__dev.session().debug.puzzle('P0.1')?.spots() ?? null);
if (spots) {
  await page.evaluate(({ lever }) => {
    window.__dev.session().debug.teleport(lever.x + 1.1, lever.z, -Math.PI / 2);
    window.__dev.look(-Math.PI / 2 + 0.5, 0.3);
  }, spots);
  await page.waitForTimeout(900);
  await shot('mill-lever');
  await tap('KeyE');
  await page.waitForTimeout(1200);
  if (!(await sluice())?.gate) logs.push('[questtest] mill: E at the lever did not open the gate');

  const cell = spots.cells.findIndex((c) => c.turns);
  const before = (await sluice())?.rots[cell];
  await page.evaluate((c) => {
    window.__dev.session().debug.teleport(c.x, c.z - 1, 0);
    window.__dev.look(0.4, 0.45);
  }, spots.cells[cell]);
  await page.waitForTimeout(900);
  await tap('KeyE');
  await page.waitForTimeout(900);
  const after = (await sluice())?.rots[cell];
  if (after === before) logs.push(`[questtest] mill: E on tile ${cell} did not turn it`);
  await shot('mill-turned');

  await page.evaluate(() => window.__dev.session().debug.puzzle('P0.1').solve());
  results.sluice = await drive('sluice', (s) => s.quests['Q0.6'] === 'done' && !s.dialogue && !s.reveal);
  await page.waitForTimeout(1500);
  await shot('mill-solved');
} else logs.push('[questtest] no P0.1 debug hook');

// Pim & Pol: the Dry-Run Crane (P0.2). Every capstan turn and lever pull goes through E.
await talk('pim');
results.pim = await drive('pim', (s) => s.quests['Q0.7'] === 'crane' && !s.dialogue && !s.quiz && !s.reveal);
const crane = () => page.evaluate(() => window.__dev.session().debug.puzzle('P0.2')?.state() ?? null);
const cs = await page.evaluate(() => window.__dev.session().debug.puzzle('P0.2')?.spots() ?? null);
if (cs) {
  const stand = async (p, look = 0.35) => {
    await page.evaluate(
      ({ p, look }) => {
        window.__dev.session().debug.teleport(p.x, p.z, Math.PI);
        window.__dev.look(Math.PI + look, 0.3);
      },
      { p, look },
    );
    await page.waitForTimeout(700);
  };
  const idle = async () => {
    for (let k = 0; k < 60 && ((await crane())?.busy || (await crane())?.running); k++)
      await page.waitForTimeout(250);
  };
  const focus = () => page.evaluate(() => window.__dev.session().debug.state().focus);

  // --yes before any preview: Pol stops you.
  await stand(cs.yes);
  if ((await focus()) !== 'crane:yes') logs.push(`[questtest] crane: focus at --yes was ${await focus()}`);
  await tap('KeyE');
  await page.waitForTimeout(500);
  await shot('crane-preview-first');
  if ((await crane())?.complete) logs.push('[questtest] crane: --yes without a preview completed');

  // Preview the captain's berth (the starting facing) and get refused.
  await stand(cs.dry, -0.35);
  await tap('KeyE');
  await idle();
  await shot('crane-ghosts-captain');
  await stand(cs.yes);
  await tap('KeyE');
  await page.waitForTimeout(600);
  await shot('crane-refused');
  await drive('crane-refused', (s) => !s.dialogue);
  await idle();

  // Turn to your own berth.
  await stand(cs.capstan, 0);
  if ((await focus()) !== 'crane:capstan')
    logs.push(`[questtest] crane: focus at the capstan was ${await focus()}`);
  for (let k = 0; k < 4 && (await crane())?.facing !== cs.yours; k++) {
    await tap('KeyE');
    await page.waitForTimeout(300);
    await idle();
  }
  if ((await crane())?.facing !== cs.yours) logs.push('[questtest] crane: capstan never reached your berth');
  await shot('crane-aimed');

  // Preview, then --yes for real.
  await stand(cs.dry, -0.35);
  await tap('KeyE');
  await idle();
  await shot('crane-ghosts-yours');
  await stand(cs.yes);
  await tap('KeyE');
  await page.waitForTimeout(2500);
  await shot('crane-loading');
  results.crane = await drive('crane', (s) => s.quests['Q0.7'] === 'done' && !s.dialogue && !s.reveal);
  if (!(await crane())?.complete) logs.push('[questtest] crane: not complete after --yes');
  await stand(cs.dry, -0.35);
  await page.waitForTimeout(800);
  await shot('crane-solved');
} else logs.push('[questtest] no P0.2 debug hook');

// Juno: First Words (Q0.8). Try the Terminal hatch first (wrong), then the Prompt Box tube.
await talk('juno');
results.juno = await drive(
  'juno',
  (s) => s.quests['Q0.8'] === 'pipes' && !s.dialogue && !s.quiz && !s.reveal,
);
const fw = () => page.evaluate(() => window.__dev.session().debug.puzzle('Q0.8.pipes')?.state() ?? null);
const ps = await page.evaluate(() => window.__dev.session().debug.puzzle('Q0.8.pipes')?.spots() ?? null);
if (ps) {
  const focus = () => page.evaluate(() => window.__dev.session().debug.state().focus);
  /** Stands on the pier's east edge, facing the fitting on the ship's rail. */
  const standAt = async (p) => {
    await page.evaluate((p) => {
      window.__dev.session().debug.teleport(p.x - 1.05, p.z, Math.PI / 2);
      window.__dev.look(Math.PI / 2 + 0.35, 0.12);
    }, p);
    await page.waitForTimeout(800);
  };
  const settle = async () => {
    for (let k = 0; k < 40 && (await fw())?.running; k++) await page.waitForTimeout(150);
  };
  await standAt(ps.hatch);
  if ((await focus()) !== 'pipe:hatch')
    logs.push(`[questtest] pipes: focus at the hatch was ${await focus()}`);
  await tap('KeyE');
  await page.waitForTimeout(700);
  await shot('pipes-hatch');
  await settle();
  if ((await learnState()).quests['Q0.8'] !== 'pipes')
    logs.push('[questtest] pipes: the hatch moved the quest on');
  await standAt(ps.tube);
  if ((await focus()) !== 'pipe:tube') logs.push(`[questtest] pipes: focus at the tube was ${await focus()}`);
  await tap('KeyE');
  await page.waitForTimeout(1800);
  await shot('pipes-reply');
  results.firstWords = await drive(
    'first-words',
    (s) => s.quests['Q0.8'] === 'done' && !s.dialogue && !s.quiz && !s.reveal,
  );
} else logs.push('[questtest] no Q0.8 debug hook');

// Message bottles (B0.1-B0.3): walk up to each one on its beach, open it with E, stow the page.
const bottles = () => page.evaluate(() => window.__dev.session().debug.bottles?.() ?? null);
const washedUp = await bottles();
if (washedUp?.length) {
  const doubloons = () => page.evaluate(() => window.__dev.learn.getState().doubloons);
  const before = await doubloons();
  for (const b of washedUp) {
    const h = 0.6;
    await page.evaluate(
      ([x, z, h]) => {
        window.__dev.session().debug.teleport(x, z, h);
        window.__dev.look(h, 0.4);
      },
      [b.x - Math.sin(h) * 1.3, b.z - Math.cos(h) * 1.3, h],
    );
    await page.waitForTimeout(900);
    const f = await page.evaluate(() => window.__dev.session().debug.state().focus);
    if (f !== `bottle:${b.id}`) logs.push(`[questtest] bottle: focus at ${b.id} was ${f}`);
    await tap('KeyE');
    await page.waitForTimeout(700);
    await drive(`bottle-${b.id}`, (s) => !s.reveal && !s.dialogue);
  }
  const unread = (await bottles()).filter((b) => !b.read).map((b) => b.id);
  if (unread.length) logs.push(`[questtest] bottle: still unread ${unread.join(', ')}`);
  const got = (await doubloons()) - before;
  if (got !== washedUp.length * 5)
    logs.push(`[questtest] bottle: expected ${washedUp.length * 5} doubloons, got ${got}`);
  results.bottles = unread.length === 0;
} else logs.push('[questtest] no bottle debug hook');

// The Harbormaster's Trial at the lighthouse.
const lighthouse = await page.evaluate(() => window.__dev.session().debug.trialAt?.() ?? null);
if (lighthouse) {
  await page.evaluate(({ x, z, heading }) => {
    const s = window.__dev.session();
    s.debug.teleport(x + Math.sin(heading) * 1.5, z + Math.cos(heading) * 1.5, heading + Math.PI);
  }, lighthouse);
  await page.waitForTimeout(900);
  await tap('KeyE');
  results.trial = await drive(
    'trial',
    (s) => s.quests['Q0.10'] === 'done' && !s.banner && !s.quiz && !s.dialogue,
  );
} else logs.push('[questtest] no lighthouse trial hook');

await tap('KeyJ');
await page.waitForTimeout(600);
await shot('logbook');
await page.evaluate(() => window.__dev.learn.openLogbook('quests'));
await page.waitForTimeout(400);
await shot('logbook-quests');

const final = await learnState();
await browser.close();
console.log(
  JSON.stringify({ url, final, results: Object.keys(results), shots, logs: logs.slice(0, 20) }, null, 1),
);
