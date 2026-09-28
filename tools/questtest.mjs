#!/usr/bin/env node
// End-to-end quest run on the play page, in Chapter 00's order: Nell (prerequisites chest, spyglass
// views, pages), the palette stand (Paint Your Sails), Ezra's fork, Bo's session and tool checks at
// his gear rack, Pim and Pol's Dry-Run Crane (P0.2), Suri's optional sluice (P0.1), Juno's First
// Words (Q0.8), the message bottles, Lyra's soundcheck (Q0.9), then Nell at the bow: the
// Harbormaster's Trial and the christening. Answered through the real UI where it matters (hotspots
// are clicked; other types use __dev.answer()), with screenshots at each beat.
// node tools/questtest.mjs [--base=http://localhost:5301] [--webgl] [--out=/tmp/shots/quest]
import { collectLogs, launchChrome, parseFlags } from './lib/browser.mjs';

const opt = parseFlags();
const base = opt.base || 'http://localhost:5301';
const out = opt.out || '/tmp/shots/quest';
const tag = opt.webgl ? 'gl' : 'gpu';
const url = `${base}/devpages/play.html?auto&quiet&shot${opt.webgl ? '&webgl' : ''}`;

const browser = await launchChrome();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const logs = collectLogs(page, { types: ['error'] });
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

// Nell: Captain's Papers. She opens her chest of prerequisites while she talks (the `nell-chest` cue).
await talk('nell');
results.nell = await drive(
  'nell',
  (s) => s.quests['Q0.2'] === 'palette' && !s.dialogue && !s.quiz && !s.reveal,
);
const chestOpen = await page.evaluate(() => window.__dev.session().debug.chests?.()[0]?.opened ?? null);
if (!chestOpen) logs.push(`[questtest] Nell's chest isn't open after her talk (${chestOpen})`);
if (!seen.has('reveal-pg.prereqs')) logs.push('[questtest] the prerequisites page never showed');

// Paint Your Sails: E at the palette stand opens the theme picker; pick a card and select Finish
// through the real UI, then the New page (C0.3) and Nell's lines.
const stand = await page.evaluate(() => window.__dev.session().debug.puzzle('Q0.2.palette')?.spot() ?? null);
if (stand) {
  await page.evaluate((a) => {
    window.__dev.session().debug.teleport(a.x, a.z, a.heading);
    window.__dev.look(a.heading + 0.25, 0.22);
  }, stand);
  await page.waitForTimeout(900);
  const focus = await page.evaluate(() => window.__dev.session().debug.state().focus);
  if (focus !== 'palette:stand') logs.push(`[questtest] palette: focus is ${focus}, not palette:stand`);
  await shot('palette-stand');
  await tap('KeyE');
  await page.waitForSelector('.ci-palette', { timeout: 5000 }).catch(() => null);
  if (await page.$('.ci-palette')) {
    await page.click('.ci-palette-card[data-id="noctis-azureus"]');
    await page.waitForTimeout(500);
    await shot('palette-picker');
    const preview = await page.evaluate(
      () => window.__dev.session().debug.puzzle('Q0.2.palette').state().shown,
    );
    if (preview !== 'noctis-azureus') logs.push(`[questtest] palette: preview is ${preview}`);
    await page.click('.ci-palette-actions .ci-btn.primary');
  } else logs.push('[questtest] palette: the picker did not open');
  results.palette = await drive(
    'palette',
    (s) => s.quests['Q0.2'] === 'done' && !s.dialogue && !s.reveal && !s.spyglass,
  );
  const sails = await page.evaluate(() => window.__dev.learn.progress.data.sails);
  if (sails !== 'noctis-azureus') logs.push(`[questtest] palette: saved sails are ${sails}`);
} else logs.push('[questtest] no palette stand hook');

// Ezra: Copy the Master Chart.
await talk('merchant');
results.ezra = await drive('ezra', (s) => s.quests['Q0.3'] === 'done' && !s.dialogue && !s.quiz && !s.reveal);

// Bo: a Local repository session, Terminal, and the version checks at his rack (every one passes),
// then GitHub CLI's sign-in (S0.1).
await talk('dockhand_b');
results.bo = await drive('bo', (s) => s.quests['Q0.4'] === 'done' && !s.dialogue && !s.quiz && !s.reveal);
const rack = () => page.evaluate(() => window.__dev.session().debug.puzzle('gear.rack')?.state() ?? null);
if (!(await rack())?.shown) logs.push('[questtest] gear: Bo never ran the checks at his rack');
const gs = await page.evaluate(() => window.__dev.session().debug.puzzle('gear.rack')?.spots() ?? null);
if (gs) {
  await page.evaluate((a) => {
    window.__dev.session().debug.teleport(a.x, a.z, a.heading);
    window.__dev.look(a.heading + 0.3, 0.2);
  }, gs.rack);
  await page.waitForTimeout(900);
  const focus = await page.evaluate(() => window.__dev.session().debug.state().focus);
  if (focus !== 'gear:rack') logs.push(`[questtest] gear: focus at the rack was ${focus}`);
  await tap('KeyE');
  await page.waitForTimeout(900);
  const term = await page.evaluate(() => document.querySelector('.hud-term')?.textContent ?? '');
  if (!/gh version/.test(term) || /not found/.test(term))
    logs.push(`[questtest] gear: the rack's terminal read ${JSON.stringify(term.slice(0, 160))}`);
  await shot('gear-checks');
} else logs.push('[questtest] no gear rack hook');

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

// Suri: Open the Sluice (P0.1, optional once the crane's done). The lever and one tile turn go
// through E like a player would.
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
  // The fittings are on the ship's rail, across a narrow gap from the pier; stand on the pier's
  // east edge (x −106, less the player's radius), as a player would.
  const standAt = async (p) => {
    await page.evaluate((p) => {
      window.__dev.session().debug.teleport(Math.min(p.x - 1.05, -106.45), p.z, Math.PI / 2);
      window.__dev.look(Math.PI / 2 + 0.35, 0.12);
    }, p);
    await page.waitForTimeout(800);
  };
  const settle = async () => {
    // Juno's hatch reply runs about 8 s with the clank and her full line.
    for (let k = 0; k < 100 && (await fw())?.running; k++) await page.waitForTimeout(150);
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

// Lyra's soundcheck (Q0.9, optional): the bard at her hammock by the lagoon, and C0.5.
if (await page.evaluate(() => !!window.__dev.session().debug.puzzle('Q0.9.bard'))) {
  const bard = await page.evaluate(() => window.__dev.session().debug.puzzle('Q0.9.bard').state());
  if (bard.quest !== 'start') logs.push(`[questtest] bard: Q0.9 didn't start (${JSON.stringify(bard)})`);
  await talk('lyra');
  await shot('lyra-talk');
  results.lyra = await drive('lyra', (s) => s.quests['Q0.9'] === 'done' && !s.dialogue && !s.reveal);
} else logs.push('[questtest] no bard hook');

// Nell at the pier head, by your bow: the Harbormaster's Trial (Q0.10), then straight on to the
// christening (Q0.11): the coconut flies (the `christen` cue), then Juno and Wingman's sailing lesson.
if (await page.evaluate(() => !!window.__dev.session().debug.puzzle('Q0.11.christen'))) {
  await page.waitForTimeout(600);
  const at = await page.evaluate(() => window.__dev.session().debug.puzzle('Q0.11.christen').state());
  if (!at.atPier) logs.push(`[questtest] trial: Nell isn't at the pier (${JSON.stringify(at)})`);
  await talk('nell');
  await shot('trial-talk');
  results.trial = await drive('trial', (s) => s.quests['Q0.10'] === 'done' && !s.banner && !s.quiz, 150000);
  results.christening = await drive(
    'christening',
    (s) => s.quests['Q0.11'] === 'sail' && !s.dialogue && !s.reveal,
    90000,
  );
  const sawThrow = await page.evaluate(
    () => window.__dev.session().debug.puzzle('Q0.11.christen').state().thrown,
  );
  if (!sawThrow) logs.push('[questtest] christening: the coconut never flew');
  const named = await page.evaluate(
    () => window.__dev.session().debug.puzzle('Q0.11.christen').state().named,
  );
  if (!named) logs.push('[questtest] christening: the ship has no name');
  // The ceremony's own shot of the bow, now with the name on it.
  await page.evaluate(() => window.__dev.session().debug.puzzle('Q0.11.christen').frame(true));
  await page.waitForTimeout(1600);
  await shot('christen-named');
  await page.evaluate(() => window.__dev.session().debug.puzzle('Q0.11.christen').frame(false));
  await page.waitForTimeout(1300);
  // The gangway's down now and the compass points at it; walking up the plank takes the helm.
  const gangway = await page.evaluate(() => window.__dev.session().debug.gangway());
  if (!gangway.down) logs.push('[questtest] gangway still up after the christening');
  const compass = await page.evaluate(() => {
    const el = document.querySelector('.hud-compass');
    return { show: !!el?.classList.contains('show'), label: el?.textContent ?? '' };
  });
  if (!compass.show) logs.push('[questtest] no compass after the christening');
  else if (!/gangway/i.test(compass.label))
    logs.push(`[questtest] compass points elsewhere: ${compass.label}`);
  await page.evaluate(({ foot, top }) => {
    const s = window.__dev.session();
    const yaw = Math.atan2(top.x - foot.x, top.z - foot.z);
    s.debug.teleport(foot.x - Math.sin(yaw) * 0.8, foot.z - Math.cos(yaw) * 0.8, yaw);
  }, gangway);
  await page.waitForTimeout(500);
  await page.evaluate(() => window.__dev.hold(['KeyW'], 2600));
  await page
    .waitForFunction(() => window.__dev.state()?.mode === 'sail', null, { timeout: 8000 })
    .catch(() => logs.push('[questtest] walking up the gangway did not board'));
  const boarded = await learnState();
  if (boarded?.quests?.['Q0.11'] !== 'done')
    logs.push(`[questtest] Q0.11 is ${boarded?.quests?.['Q0.11']} after boarding`);
  await page.waitForTimeout(1500);
  await shot('boarded');
} else logs.push('[questtest] no christening hook');

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
