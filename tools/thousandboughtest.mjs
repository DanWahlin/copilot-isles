#!/usr/bin/env node
// End-to-end Chapter 02 run on Thousand-Bough Isle, in the course's order (docs/specs/ISLAND-02-thousand-bough.md
// §4): ashore at the Root Wharf, Tamsin, Lyra at the Booth Pools (and her chest), Saffi in the Root Hall,
// Oak at the Three Landings (and the gondola), Fen's Channel Routing played for real with the keyboard
// and mouse (two rounds of tiles, a wrong run first, a hint; round 3's places for the crews, a wrong one
// first) and the Spire twist (a wrong answer, then a right one), Ines's Flag Hoist (Logbook layering
// and key ownership, a wrong flag, then all six orders), Rook, Pip, and the Elder's Canopy Trial with the
// Seal's Thousand Lanterns. Then the Sky Basket, the chest behind the falls, the bottles and the starfish.
// Fails on any page error, a missing beat, or a hitch after warm-up. Screenshots at every beat.
// Rook asks for the session's branch and the practice issue's number (Your setup): by default the run
// enters them and checks the captions, Logbook pages, terminal and Trial use them; `--setup=skip` skips.
//   node tools/thousandboughtest.mjs [--base=http://127.0.0.1:5386] [--out=<dir>] [--tier=high] [--webgl]
//                                    [--reduced] [--from=elder|rook] [--setup=enter|skip]
import { mkdirSync } from 'node:fs';
import { collectLogs, launchChrome, parseFlags } from './lib/browser.mjs';
import { answerCard, cardOpen, cardState } from './lib/learning-cards.mjs';
import { answerSetupForm, logbookPage, setupPlan } from './lib/setup-forms.mjs';

const opt = parseFlags();
const base = opt.base || 'http://localhost:5301';
const out = opt.out || 'tmp/shots/thousand-bough';
mkdirSync(out, { recursive: true });
const tag = `${opt.tier || 'auto'}-${opt.webgl ? 'gl' : 'gpu'}`;
const url =
  `${base}/devpages/play.html?auto&quiet&thousandbough&shot` +
  `${opt.webgl ? '&webgl' : ''}${opt.tier ? `&tier=${opt.tier}` : ''}`;

const browser = await launchChrome();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
if (opt.reduced) await page.emulateMedia({ reducedMotion: 'reduce' });
const logs = collectLogs(page, { types: ['error'] });
const fail = (m) => {
  logs.push(`[thousandboughtest] ${m}`);
  if (opt.verbose) console.log(`FAIL ${m}`);
};
const note = (m) => opt.verbose && console.log(`${new Date().toISOString().slice(11, 19)} ${m}`);
await page.goto(url, { waitUntil: 'load' });
await page.waitForFunction(() => window.__dev?.ready === true && window.__dev.session(), null, {
  timeout: 180000,
});
await page.waitForTimeout(1500);

const shots = [];
const shot = async (name) => {
  const path = `${out}/${tag}-${String(shots.length).padStart(2, '0')}-${name}.png`;
  await page.screenshot({ path });
  shots.push(path);
};
const S = (f, a) => page.evaluate(f, a);
const tap = (code) => S((c) => window.__dev.tap(c), code);
const tb = (fn, ...args) =>
  S(
    ([fn, args]) => {
      const d = window.__dev.session().debug.thousandBough();
      const v = fn.split('.').reduce((o, k) => (typeof o === 'function' ? o() : o)?.[k], d);
      return typeof v === 'function' ? v(...args) : v;
    },
    [fn, args],
  );
const learnState = () =>
  S(() => {
    const l = window.__dev.learn.getState();
    const st = window.__dev.state();
    return {
      quiz: l.quiz
        ? { id: l.quiz.quiz.id, type: l.quiz.quiz.type, correct: l.quiz.last?.correct ?? null }
        : null,
      reveal: l.reveal?.page.id ?? null,
      banner: l.banner?.title ?? null,
      setupForm: l.setupForm,
      caption: document.querySelector('.ci-spyglass-caption')?.textContent ?? '',
      terminal: document.querySelector('.hud-term.show')?.textContent ?? '',
      dialogue: st.dialogue,
      welcome: st.welcome,
      mode: st.mode,
      quests: window.__dev.learn.progress.data.quests,
      pages: l.pages.length,
      doubloons: l.doubloons,
      board: !!document.querySelector('.ci-cr-grid, .ci-cr-twist'),
      hoist: !!document.querySelector('.ci-fh-flags'),
      places: !!document.querySelector('.ci-cr-crews'),
    };
  });

async function clickHotspot() {
  const box = await S(() => {
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

const plan = setupPlan(opt.setup);
const captions = new Set();
const terminals = new Set();
const seen = new Set();
/** Drives dialogue, quizzes and reveals until `done(state)`; `every` runs each tick. */
/** App tasks the run puts off with Later (the rest it confirms with I did it). */
const cardPlan = { later: [] };
async function drive(label, done, ms = 180000, every = null) {
  const t0 = Date.now();
  note(`drive ${label}`);
  while (Date.now() - t0 < ms) {
    const s = await learnState();
    if (done(s)) return s;
    // The learning systems' cards (app tasks, a reflection, a Seal card, where you left off).
    const card = await page.evaluate(cardState);
    if (cardOpen(card)) {
      await answerCard(page, card, {
        shot,
        fail: (m) => logs.push(`[thousandboughtest] ${m}`),
        seen,
        plan: cardPlan,
      });
      await page.waitForTimeout(300);
      continue;
    }
    if (every && (await every(s)) === 'handled') {
      await page.waitForTimeout(250);
      continue;
    }
    if (s.caption && !captions.has(s.caption)) {
      captions.add(s.caption);
      if (/#\d|empty-state|copilot\//.test(s.caption)) {
        await page.waitForTimeout(500);
        await shot(`caption-${captions.size}`);
      }
    }
    if (s.terminal) terminals.add(s.terminal);
    if (s.setupForm) await answerSetupForm(page, s.setupForm, plan, { shot, fail });
    else if (s.quiz) {
      if (!seen.has(s.quiz.id)) {
        seen.add(s.quiz.id);
        await page.waitForTimeout(600);
        await shot(`quiz-${s.quiz.id}`);
      }
      if (s.quiz.correct) await tap('KeyE');
      else if (s.quiz.type === 'hotspot') await clickHotspot();
      else await S(() => window.__dev.answer());
    } else if (s.reveal || s.banner) {
      const key = `reveal-${s.reveal ?? s.banner}`;
      if (!seen.has(key)) {
        seen.add(key);
        await page.waitForTimeout(600);
        await shot(key.replace(/[^\w.-]+/g, '_'));
      }
      await tap('KeyE');
    } else if (s.dialogue) await tap('KeyE');
    await page.waitForTimeout(350);
  }
  fail(`${label}: timed out`);
  return learnState();
}
const quest = (id, want) => (s) => s.quests[id] === want;

/** Walks up to an NPC on their level from wherever there's room, checks the prompt, and presses E. */
async function talk(id) {
  await page
    .waitForFunction(() => !window.__dev.state().dialogue && !window.__dev.state().welcome, null, {
      timeout: 30000,
    })
    .catch(() => fail(`still talking before ${id}`));
  const n = await S(
    (id) =>
      window.__dev
        .session()
        .debug.cast()
        .find((v) => v.id === id) ?? null,
    id,
  );
  if (!n) return fail(`no NPC ${id}`);
  // On its own level (the decks stack over each other).
  const ground = await S(
    ([x, z, y]) => window.__dev.session().world.groundAt(x, z, y + 0.3),
    [n.x, n.z, n.y],
  );
  if (Math.abs(n.y - ground) > 0.15) fail(`${id} stands ${(n.y - ground).toFixed(2)} m off the ground`);
  let ok = false;
  for (const reach of [2.0, 2.8]) {
    if (ok) break;
    for (const k of [0, 1, -1, 2, -2, 3, -3, 4]) {
      const a = n.h + (k * Math.PI) / 4;
      const at = await S(
        ([x, z, h, y]) => {
          window.__dev.session().debug.teleport(x, z, h, y);
          return window.__dev.state();
        },
        [n.x + Math.sin(a) * reach, n.z + Math.cos(a) * reach, a + Math.PI, n.y + 0.3],
      );
      await page.waitForTimeout(250);
      const prompt = await S(() => document.querySelector('.hud-prompt.show')?.textContent ?? null);
      if (Math.abs(at.y - n.y) < 1 && prompt?.includes('Talk to') && prompt.includes(n.name.split(' ')[0])) {
        ok = true;
        break;
      }
    }
  }
  await S((a) => window.__dev.look(a, 0.16), n.h + Math.PI + 0.35);
  await page.waitForTimeout(700);
  await shot(`talk-${id}`);
  const focus = await S(() => window.__dev.state().focus);
  note(`talk ${id}: prompt ${ok}, focus ${focus}`);
  if (ok) await tap('KeyE');
  else {
    fail(`can't get a talk prompt at ${id} from any side`);
    await S((id) => window.__dev.session().debug.talk(id), id);
  }
  const started = await page
    .waitForFunction(() => window.__dev.state().dialogue || window.__dev.learn.getState().quiz, null, {
      timeout: 4000,
    })
    .then(() => true)
    .catch(() => false);
  if (!started) {
    fail(`E at ${id} didn't start a conversation (focus ${focus})`);
    await S((id) => window.__dev.session().debug.talk(id), id);
  }
  // The conversation's own shot (the camera eases in over the first moment).
  await page.waitForTimeout(1300);
  if (await tb('crownView')) {
    // The Elder opens on the view from the Crown (H7) before she speaks.
    await page.waitForTimeout(600);
    await shot('above-the-mist');
    await page.waitForFunction(() => window.__dev.state().dialogue, null, { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(1200);
  }
  await shot(`stop-${id}`);
}

const hitchesBefore = await S(() => window.__isles?.hitches?.().length ?? 0);

// ---- Ashore at the Root Wharf (the chart's travel), with the arrival flyover ----
const q = await S(() => window.__dev.session().islandQuay('thousand-bough'));
if (!q) fail('Thousand-Bough isn’t open');
await S((q) => window.__dev.session().travel(q.x, q.z, q.heading), q);
await page.waitForFunction(() => window.__dev.session().island === 'thousand-bough', null, {
  timeout: 60000,
});
for (const t of [1.5, 6, 11, 16, 21]) {
  await S((t) => window.__dev.session().debug.holdArrival(t), t);
  await page.waitForTimeout(900);
  if ((await S(() => window.__dev.session().debug.arrival()?.phase)) !== 'flying') break;
  await shot(`arrival-${t}`);
}
await S(() => window.__dev.session().debug.holdArrival(null));
if ((await S(() => window.__dev.session().debug.arrival()?.phase)) === 'flying')
  await S(() => window.__dev.session().debug.skipArrival());
await page.waitForFunction(
  () =>
    window.__dev
      .session()
      .debug.cast()
      .some((n) => n.id === 'tamsin'),
  null,
  {
    timeout: 90000,
  },
);
await page
  .waitForFunction(() => window.__dev.state().dialogue, null, { timeout: 8000 })
  .catch(() => fail('no Thousand-Bough welcome'));
// Juno's "That's no ordinary tree" plays over the tree (the arrival's last framing), before Wingman.
{
  const first = await S(() => ({
    sub: document.querySelector('.hud-subtitle')?.textContent ?? '',
    framing: window.__dev.session().camera.framing,
  }));
  if (!/ordinary tree/.test(first.sub) || !first.framing)
    fail(`welcome opens with "${first.sub.slice(0, 60)}" (framed ${first.framing})`);
  await page.waitForTimeout(1500);
  await shot('juno-tree');
}
// The welcome pauses between Juno's line and Wingman's (he takes off), so wait for all of it.
await drive('welcome', (s) => !s.dialogue && !s.welcome, 60000);
await page.waitForTimeout(1200);
await shot('ashore');
const tracker = await S(() => window.__dev.learn.getState().tracker);
if (tracker?.island !== 'Thousand-Bough Isle') fail(`tracker shows ${tracker?.island}`);
const compass = await S(() => document.querySelector('.hud-compass-label')?.textContent ?? null);
if (!compass?.includes('Tamsin')) fail(`compass points at ${compass}, not Tamsin`);

/** Plays the Gate Board with real keys: moves the cursor with arrows and turns with E, then F. */
async function playRound(round, opts) {
  const open = await page
    .waitForFunction(
      (r) => document.querySelector('.ci-cr-eyebrow')?.textContent?.includes(`Round ${r}`),
      round,
      {
        timeout: 60000,
      },
    )
    .then(() => true)
    .catch(() => false);
  if (!open) {
    fail(`the Gate Board never showed round ${round} (Q2.5 is ${(await learnState()).quests['Q2.5']})`);
    await shot(`round${round}-missing`);
    return;
  }
  await page.waitForFunction(() => !document.querySelector('.ci-cr-go')?.disabled, null, { timeout: 60000 });
  await page.waitForTimeout(500);
  await shot(`round${round}-start`);
  if (opts.wrongFirst) {
    await page.keyboard.press('KeyF');
    await page.waitForFunction(
      () => !/gates are open/.test(document.querySelector('.ci-cr-message')?.textContent ?? ''),
      null,
      { timeout: 30000 },
    );
    await page.waitForTimeout(400);
    await shot(`round${round}-wrong-run`);
    const msg = await S(() => document.querySelector('.ci-cr-message')?.textContent ?? '');
    if (!/mixed|stops short|Great Hall|wheel/.test(msg)) fail(`round ${round} wrong run says "${msg}"`);
    await page.waitForFunction(() => !document.querySelector('.ci-cr-go')?.disabled, null, {
      timeout: 30000,
    });
  }
  if (opts.hint) {
    await page.keyboard.press('KeyQ');
    await page.waitForTimeout(400);
    await page.keyboard.press('KeyQ');
    await page.waitForTimeout(900);
    await shot(`round${round}-hint`);
  }
  let clicked = !opts.click;
  for (let guard = 0; guard < 60; guard++) {
    const wrong = await tb('routing.wrong');
    if (!wrong) break;
    if (!clicked) {
      // Once with the mouse: click the tile on the schematic.
      clicked = true;
      await page.click(`.ci-cr-tile[data-cell="${wrong[0]},${wrong[1]}"]`);
      await page.waitForTimeout(150);
      continue;
    }
    const st = await tb('routing.state');
    const [r0, c0] = st.cursor ?? [0, 1];
    for (let i = 0; i < Math.abs(wrong[0] - r0); i++)
      await page.keyboard.press(wrong[0] > r0 ? 'ArrowDown' : 'ArrowUp');
    for (let i = 0; i < Math.abs(wrong[1] - c0); i++)
      await page.keyboard.press(wrong[1] > c0 ? 'ArrowRight' : 'ArrowLeft');
    await page.keyboard.press('KeyE');
    await page.waitForTimeout(120);
  }
  await shot(`round${round}-routed`);
  await page.keyboard.press('KeyF');
  await page.waitForFunction(
    () => !/gates are open/.test(document.querySelector('.ci-cr-message')?.textContent ?? ''),
    null,
    { timeout: 30000 },
  );
  await page.waitForTimeout(300);
  await shot(`round${round}-solved`);
  const msg = await S(() => document.querySelector('.ci-cr-message')?.textContent ?? '');
  if (!/wheel/.test(msg)) fail(`round ${round} didn't solve: "${msg}"`);
}

/**
 * Round 3 with real input: the crews' orders and places, a wrong place first (Feature in the current
 * checkout), a hint, then each crew where its order fits, by mouse and keys.
 */
async function playPlaces() {
  const open = await page
    .waitForFunction(
      () => !!document.querySelector('.ci-cr-crews') && !document.querySelector('.ci-cr-go')?.disabled,
      null,
      { timeout: 60000 },
    )
    .then(() => true)
    .catch(() => false);
  if (!open) {
    fail(`round 3's places never showed (P2.1 is ${(await learnState()).quests['P2.1']})`);
    await shot('round3-missing');
    return;
  }
  await page.waitForTimeout(500);
  await shot('round3-start');
  const orders = await S(() => [...document.querySelectorAll('.ci-cr-crew-order')].map((e) => e.textContent));
  if (orders.length !== 3) fail(`round 3 shows ${orders.length} crew orders`);
  const best = await tb('routing.best');
  // The blue crew in the Great Hall (by mouse); the others by keys.
  await page.click('[data-crew="blue"] [data-ws="hall"]');
  const key = { channel: 'Digit1', hall: 'Digit2', gondola: 'Digit3' };
  for (let i = 1; i < 3; i++) {
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press(key[best[i]]);
  }
  const checked = await S(() =>
    [...document.querySelectorAll('.ci-cr-ws [aria-checked="true"]')].map((b) => b.dataset.ws),
  );
  if (checked.join() !== ['hall', best[1], best[2]].join()) fail(`round 3 picks show ${checked}`);
  await page.keyboard.press('KeyF');
  await page.waitForFunction(() => !!document.querySelector('.ci-cr-verdict'), null, { timeout: 30000 });
  await page.waitForTimeout(400);
  await shot('round3-wrong');
  const msg = await S(() => document.querySelector('.ci-cr-message')?.textContent ?? '');
  if (!/New worktree/.test(msg)) fail(`round 3 wrong place says "${msg}"`);
  const marks = await S(() => [...document.querySelectorAll('.ci-cr-verdict')].map((e) => e.textContent));
  if (!/✗/.test(marks[0] ?? '') || !/✓/.test(marks[1] ?? '')) fail(`round 3 verdicts: ${marks}`);
  await page.waitForFunction(() => !document.querySelector('.ci-cr-go')?.disabled, null, { timeout: 30000 });
  await page.keyboard.press('KeyQ');
  await page.waitForTimeout(600);
  await shot('round3-hint');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press(key[best[0]]);
  await page.keyboard.press('KeyF');
  await page
    .waitForFunction(() => /fits/.test(document.querySelector('.ci-cr-message')?.textContent ?? ''), null, {
      timeout: 30000,
    })
    .catch(() => fail('round 3 never solved'));
  await page.waitForTimeout(300);
  await shot('round3-solved');
}

/** Rook's branch and issue questions (Your setup), then everywhere the answers show. */
async function checkRookSetup() {
  const setup = await S(() => window.__dev.learn.getState().setup);
  const issue = plan.issue === 'skip' ? 3 : plan.issue;
  const branch = plan.branch === 'skip' ? 'practice-empty-state-copy' : plan.branch;
  if (plan.issue !== 'skip' && setup.issue !== plan.issue) fail(`issue not saved: ${setup.issue}`);
  if (plan.issue === 'skip' && setup.issue !== null) fail('a skipped issue was saved');
  if (plan.branch !== 'skip' && setup.branch !== plan.branch) fail(`branch not saved: ${setup.branch}`);
  if (plan.branch === 'skip' && setup.branch !== null) fail('a skipped branch was saved');
  const all = [...captions].join('\n');
  if (!all.includes(`Type #${issue} and pick`))
    fail(`no caption with #${issue}: ${JSON.stringify([...captions])}`);
  if (!all.includes(`this session on ${branch}`)) fail(`Pip's caption doesn't name ${branch}`);
  const plan2 = await logbookPage(page, 'pg2.plan', shot);
  if (!plan2.includes(`type #${issue} and pick`)) fail(`pg2.plan doesn't say #${issue}`);
  if (plan.issue !== 'skip' && !plan2.includes(`Your practice issue #${issue}`))
    fail('pg2.plan has no Your practice issue note');
  const details = await logbookPage(page, 'pg2.details', shot);
  if (plan.branch !== 'skip' && !details.includes(branch)) fail(`pg2.details doesn't note ${branch}`);
  if (plan.branch === 'skip' && details.includes('Your session’s branch'))
    fail('pg2.details notes a skipped branch');
  const chronicle = await logbookPage(page, 'pg2.chronicle', shot);
  if (!chronicle.includes(branch)) fail(`pg2.chronicle doesn't name ${branch}`);
  // The Practice Bough's session terminal, seen by Rook.
  const term = [...terminals].reverse().find((t) => t.includes('Working branch'));
  if (!term?.includes(`Working branch: ${branch}`) || !term.includes(`Attached: #${issue}`))
    fail(`the session terminal doesn't show ${branch} and #${issue}: ${JSON.stringify(term)}`);
}

if (opt.from === 'elder') {
  await S(() => {
    for (const id of ['Q2.1', 'Q2.2', 'Q2.3', 'Q2.4', 'Q2.5', 'Q2.6', 'Q2.7', 'Q2.8'])
      window.__dev.session().debug.quest(id, 'done');
    window.__dev.session().debug.quest('Q2.9', 'start');
  });
} else if (opt.from === 'rook') {
  await S(() => {
    for (const id of ['Q2.1', 'Q2.2', 'Q2.3', 'Q2.4', 'Q2.5', 'Q2.6'])
      window.__dev.session().debug.quest(id, 'done');
    window.__dev.session().debug.quest('Q2.7', 'start');
  });
  await talk('rook');
  await drive('Rook', quest('Q2.7', 'done'));
  await shot('rook-session-terminal');
  await talk('pip');
  await drive('Pip', quest('Q2.8', 'done'));
  await checkRookSetup();
} else {
  // Q2.1 Tamsin → Q2.2 Lyra (and her chest) → Q2.3 Saffi → Q2.4 Oak.
  await talk('tamsin');
  await drive('Tamsin', quest('Q2.1', 'done'));
  await talk('lyra_bough');
  await drive('Lyra', quest('Q2.2', 'done'));
  const c21 = await S(() =>
    window.__dev
      .session()
      .debug.chests()
      .find((c) => c.id === 'C2.1'),
  );
  if (!c21?.opened) fail('Lyra’s chest C2.1 didn’t open');
  // Step into a booth.
  const booth = await S(() => {
    const a = { x: 1923.6, y: 6.8, z: -1495.2 };
    window.__dev.session().debug.teleport(a.x, a.z, -2, a.y);
    return a;
  });
  await page.waitForTimeout(800);
  if ((await tb('inBooth')) !== 'b') fail(`not in booth b at ${JSON.stringify(booth)}`);
  await shot('booth');
  await talk('saffi');
  await drive('Saffi', quest('Q2.3', 'done'));
  await talk('oak');
  let gondolaShot = false;
  await drive('Oak', quest('Q2.4', 'done'), 180000, async () => {
    if (!gondolaShot && (await S(() => window.__dev.session().camera.framing))) {
      const st = await learnState();
      if (!st.quiz) {
        gondolaShot = true;
        await shot('oak-talk');
      }
    }
  });

  // Q2.5 Fen: the shared trough, three rounds and the Spire twist, by real input.
  await talk('fen');
  await drive('Fen', (s) => s.board, 120000);
  await playRound(1, { wrongFirst: true, click: true });
  await playRound(2, { wrongFirst: true, hint: true });
  await playPlaces();
  await page
    .waitForFunction(() => !!document.querySelector('.ci-cr-twist'), null, { timeout: 90000 })
    .catch(() => fail('the Spire twist never asked its question'));
  await page.waitForFunction(() => !document.querySelector('.ci-cr-choices button')?.disabled, null, {
    timeout: 30000,
  });
  await shot('twist-question');
  await page.keyboard.press('Digit1');
  await page.waitForTimeout(800);
  await shot('twist-wrong');
  await page.waitForFunction(() => !document.querySelector('.ci-cr-choices button')?.disabled, null, {
    timeout: 30000,
  });
  await page.click('.ci-cr-choices button[data-choice="port5174"]');
  await page.waitForTimeout(1500);
  await shot('twist-right');
  await drive('Fen close', quest('Q2.5', 'done'));
  await shot('fen-done');

  // Q2.6 Ines and the Flag Hoist: one wrong flag, then all four.
  await talk('ines');
  let hoisted = 0;
  let wrongFlag = false;
  await drive('Ines', quest('Q2.6', 'done'), 240000, async (s) => {
    if (!s.hoist) return;
    const h = await tb('hoist');
    if (h.busy || !h.open) return 'handled';
    if (!wrongFlag) {
      wrongFlag = true;
      await shot('hoist-order-1');
      await page.keyboard.press('KeyJ');
      await page.waitForTimeout(300);
      const opened = await S(() => window.__dev.learn.getState().logbook.open);
      if (!opened) fail('J did not open the Logbook over the Flag Hoist');
      const stack = await S(() => {
        const logbook = document.querySelector('.ci-logbook');
        if (!logbook) return null;
        const rect = logbook.getBoundingClientRect();
        const top = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
        return !!top && (top === logbook || logbook.contains(top));
      });
      if (!stack) fail('the Logbook was not topmost over the Flag Hoist');
      await page.keyboard.press(`Digit${h.right}`);
      await page.waitForTimeout(300);
      const duringLogbook = await tb('hoist');
      if (duringLogbook.index !== h.index) fail('a Logbook digit reached the Flag Hoist');
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
      if (await S(() => window.__dev.learn.getState().logbook.open))
        fail('Escape did not close the Logbook over the Flag Hoist');
      await page.keyboard.press(`Digit${h.right === 2 ? 1 : 2}`);
      await page.waitForTimeout(250);
      const afterClose = await tb('hoist');
      if (afterClose.index !== h.index || (!afterClose.busy && !afterClose.message))
        fail('the Flag Hoist did not accept a keyboard pick after the Logbook closed');
      await page.waitForTimeout(950);
      await shot('hoist-wrong');
      return 'handled';
    }
    if (h.index === 0 && /[@#&`]/.test(h.order)) fail(`the first order gives the answer away: ${h.order}`);
    if (h.choices && !seen.has(`hoist-${h.index}`)) {
      seen.add(`hoist-${h.index}`);
      await shot(`hoist-order-${h.index + 1}`);
    }
    await page.keyboard.press(`Digit${h.right}`);
    hoisted += 1;
    return 'handled';
  });
  if (hoisted < 6) fail(`only ${hoisted} orders answered`);

  // Q2.7 Rook → Q2.8 Pip.
  await talk('rook');
  await drive('Rook', quest('Q2.7', 'done'));
  await shot('rook-session-terminal');
  await talk('pip');
  await drive('Pip', quest('Q2.8', 'done'));
  await checkRookSetup();
}

// Q2.9 the Elder's Canopy Trial and the Thousand Lanterns.
await talk('elder');
let cascade = false;
let trialShot = false;
let crownShot = false;
await drive('Elder', quest('Q2.9', 'done'), 300000, async (s) => {
  if (!crownShot && (await tb('crownView'))) {
    crownShot = true;
    await page.waitForTimeout(1500);
    await shot('above-the-mist');
    return 'handled';
  }
  if (s.quiz?.id === 'T2.6' && !seen.has('T2.6-issue')) {
    seen.add('T2.6-issue');
    const want = `#${plan.issue === 'skip' || opt.from === 'elder' ? 3 : plan.issue}`;
    await page.waitForTimeout(400);
    const text = await S(() => document.querySelector('.ci-quiz-backdrop')?.textContent ?? '');
    if (!text.includes(`Type ${want} and pick the issue`)) fail(`T2.6 doesn't say ${want}`);
  }
  if (!trialShot && s.quiz?.id === 'T2.1') {
    trialShot = true;
    await page.waitForTimeout(500);
    await shot('trial-start');
  }
  if (!cascade && (await tb('sealing'))) {
    cascade = true;
    for (let i = 0; i < 5; i++) {
      await page.waitForTimeout(800);
      await shot(`seal-${i}`);
    }
    return 'handled';
  }
});
if (!cascade) fail('the Seal cascade never played');
await shot('trial-done');
const final = await learnState();
for (const id of ['Q2.1', 'Q2.2', 'Q2.3', 'Q2.4', 'Q2.5', 'Q2.6', 'Q2.7', 'Q2.8', 'Q2.9'])
  if (final.quests[id] !== 'done') fail(`${id} is ${final.quests[id]}`);
if (
  !(await S(() => window.__dev.learn.progress.data.seals ?? window.__dev.learn.getState().seals))
    ?.toString()
    .includes('Thousand-Bough')
)
  fail('no Seal of Thousand-Bough');

// After the Seal: the Sky Basket down, the chest behind the falls, the bottles, the starfish.
const top = { x: 1987, y: 50.5, z: -1560 };
await S((a) => window.__dev.session().debug.teleport(a.x + 0.8, a.z, -Math.PI / 2, a.y), top);
await page.waitForTimeout(600);
const basketPrompt = await S(() => document.querySelector('.hud-prompt.show')?.textContent ?? null);
if (!basketPrompt?.includes('Sky Basket')) fail(`no Sky Basket prompt at the top (${basketPrompt})`);
else {
  await tap('KeyE');
  await page.waitForTimeout(2500);
  const st = await S(() => window.__dev.state());
  if (st.y > 25) fail(`the Sky Basket didn't come down (y ${st.y})`);
}
/** Stands next to a pickup (trying each side, on its level) until its prompt shows, then presses E. */
async function pickUp(id, x, z, y, want) {
  for (const r of [1.2, 1.8, 0.7])
    for (let k = 0; k < 8; k++) {
      const a = (k * Math.PI) / 4;
      await S(
        ([x, z, h, y]) => window.__dev.session().debug.teleport(x, z, h, y),
        [x + Math.sin(a) * r, z + Math.cos(a) * r, a + Math.PI, y],
      );
      await page.waitForTimeout(220);
      const p = await S(() => document.querySelector('.hud-prompt.show')?.textContent ?? '');
      if (p.includes(want)) {
        await tap('KeyE');
        // Its card opens a moment later (the bottle pops, the lid lifts).
        await page
          .waitForFunction(
            () => {
              const l = window.__dev.learn.getState();
              return !!(l.reveal || l.banner);
            },
            null,
            { timeout: 4000 },
          )
          .catch(() => fail(`no card after opening ${id}`));
        return true;
      }
    }
  const near = await S(([x, z]) => window.__dev.session().debug.near(x, z, 3), [x, z]);
  fail(`no "${want}" prompt at ${id} (${x}, ${z}); near: ${JSON.stringify(near)}`);
  return false;
}
for (const b of await S(() =>
  window.__dev
    .session()
    .debug.bottles()
    .filter((x) => x.id.startsWith('B2.')),
)) {
  if (await pickUp(b.id, b.x, b.z, undefined, 'message in the bottle'))
    await drive(`bottle ${b.id}`, (s) => !s.reveal && !s.banner && !s.dialogue, 15000);
}
const read = await S(
  () =>
    window.__dev
      .session()
      .debug.bottles()
      .filter((x) => x.id.startsWith('B2.') && x.read).length,
);
if (read !== 3) fail(`${read} of 3 bottles read`);
const c22 = await S(() =>
  window.__dev
    .session()
    .debug.chests()
    .find((c) => c.id === 'C2.2'),
);
if (c22) {
  if (await pickUp('C2.2', c22.x, c22.z, 19.3, 'Open the chest')) {
    await page.waitForTimeout(800);
    await shot('chest-behind-the-falls');
    await drive('chest C2.2', (s) => !s.reveal && !s.banner, 20000);
  }
  if (
    !(await S(
      () =>
        window.__dev
          .session()
          .debug.chests()
          .find((c) => c.id === 'C2.2').opened,
    ))
  )
    fail('the chest behind the falls didn’t open');
} else fail('no chest C2.2');
await drive('cards closed', (s) => !s.reveal && !s.banner && !s.dialogue && !s.quiz, 15000);
const stars = await S(() =>
  window.__dev
    .session()
    .debug.starfish()
    .filter((s) => s.island === 'thousand-bough'),
);
for (const s of stars) {
  await S((s) => window.__dev.session().debug.teleport(s.x + 0.2, s.z, 0, s.y), s);
  await page.waitForTimeout(900);
}
const got = await S(() => window.__dev.learn.progress.data.starfish.filter((id) => id.startsWith('sf.t.')));
const missed = stars.filter((s) => !got.includes(s.id)).map((s) => `${s.id} (${s.x}, ${s.y}, ${s.z})`);
if (missed.length || stars.length !== 5)
  fail(`starfish: ${got.length} of ${stars.length} found; missed ${missed.join(', ')}`);
await shot('done');

const hitches = await S(() => window.__isles?.hitches?.() ?? []);
if (hitches.length > hitchesBefore)
  fail(`hitches after warm-up: ${JSON.stringify(hitches.slice(hitchesBefore, hitchesBefore + 5))}`);

await browser.close();
console.log(
  JSON.stringify(
    {
      url,
      final: { quests: final.quests, pages: final.pages, doubloons: final.doubloons },
      shots: shots.length,
      out,
      logs: logs.slice(0, 40),
    },
    null,
    1,
  ),
);
process.exit(logs.length ? 1 : 0);
