#!/usr/bin/env node
// Sea battle 1 in the real game (index.html?debug; docs/specs/BATTLES.md): a new voyage with the Seal of
// Anchorage, board, sail out of Anchorage toward Port Meridian until the lookout calls sails, then play
// the battle to the end through the real controls (Space fires, R brings her round, the question card
// answered with the keyboard), dock at Port Meridian, and check the battle is saved and isn't fought
// again. A second voyage tests Skip battle. Fails on page errors, hitches, or > 150 programs.
// Screenshots at the sighting, a broadside, a hit, a raider striking, the question, the bonus pick and
// the win card.
// node tools/battletest.mjs [--base=http://localhost:5301] [--tier=high] [--webgl] [--out=/tmp/shots/battle]
//   [--only=play|skip] [--sea=calm|breeze|fresh|gale] (the Sea state setting: the battle must still fight
//   on its own fixed sea, today's Breeze, and the harbour must show the setting's)
//   [--battle=3] (battle 3, "Trust the Evidence": Chapters 00-02 done, the chart to Thousand-Bough Isle,
//   then out toward Keelhaven; its peak must stay at or under 140 programs with Keelhaven in memory, its
//   end must bring the passage's "next morning", and you dock at Keelhaven). Battle 3's kraken: after
//   wave 1 the evidence and the flagship taken (its beat), then in wave 2 a tell near you, a dodge, a
//   lure (a raider led over a tell and taken) and a hit on your hull, and its retreat after the last
//   raider; no ship's sails may jump (`sailJumps`). --nokraken plays it without (a census without it).
import { collectLogs, launchChrome, parseFlags, waitForTitle } from './lib/browser.mjs';
import { passLearningPauses } from './lib/learning-cards.mjs';

const opt = parseFlags();
const base = opt.base || 'http://localhost:5301';
const out = opt.out || '/tmp/shots/battle';
const tier = opt.tier || 'high';
const tag = `${opt.webgl ? 'gl' : 'gpu'}-${tier}`;
// --nokraken: battle 3 without its kraken (its census without it).
const url = `${base}/?debug&tier=${tier}${opt.webgl ? '&webgl' : ''}${opt.nokraken ? '&nokraken' : ''}`;
const BATTLE = Number(opt.battle ?? 1);
if (BATTLE !== 1 && BATTLE !== 3) throw new Error('--battle=1 or --battle=3');
// Battle 3 has an island on each side of its passage in memory: its peak keeps room for the next.
const PROGRAM_CAP = BATTLE === 3 ? 140 : 150;
const BATTLE_ID = BATTLE === 3 ? 'passage-thousand-bough-keelhaven' : 'passage-anchorage-meridian';
/** The quests done before the battle (each chapter's island and its Seal). */
const CH0 = ['Q0.2', 'Q0.3', 'Q0.4', 'Q0.5', 'Q0.6', 'Q0.7', 'Q0.8', 'Q0.9', 'Q0.10', 'Q0.11'];
const CH1 = ['Q1.1', 'Q1.2', 'Q1.3', 'Q1.4', 'Q1.5', 'Q1.6', 'Q1.7', 'Q1.8', 'Q1.A'];
const CH2 = ['Q2.1', 'Q2.2', 'Q2.3', 'Q2.4', 'Q2.5', 'Q2.6', 'Q2.7', 'Q2.8', 'Q2.9', 'Q2.A'];
const QUESTS = BATTLE === 3 ? [...CH0, ...CH1, ...CH2] : CH0;

const browser = await launchChrome({ autoplay: true });
const report = { url, play: null, skip: null };
const logs = [];
const fail = (msg) => logs.push(`[battletest] ${msg}`);

/**
 * A voyage on the real entry with the Seal of Anchorage earned, ashore on Anchorage: a new voyage
 * whose Chapter 00 quests are marked done, saved, then reloaded and continued from the title (so
 * the island is built and warmed with the Seal, as a real save would be).
 */
async function voyage() {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  collectLogs(page, { types: ['error'], logs });
  await page.goto(url, { waitUntil: 'load' });
  await page.evaluate(() => localStorage.clear());
  await waitForTitle(page, 90_000);
  if (opt.sea) await page.evaluate((id) => window.__flow.updateSettings({ seaState: id }), opt.sea);
  await page.evaluate(() => window.__flow.chooseCaptain());
  await page.waitForTimeout(600);
  await page.evaluate(() => window.__flow.newVoyage('woman'));
  const playing = () =>
    page.waitForFunction(() => window.__flow.getState().screen === 'playing', null, { timeout: 180_000 });
  await playing();
  await page.waitForTimeout(1500);
  await page.evaluate(() => window.__flow.debugSession.debug.skipArrival());
  await page.waitForFunction(() => window.__flow.debugSession.debug.state().mode === 'walk', null, {
    timeout: 20_000,
  });
  await page.evaluate((quests) => {
    const d = window.__flow.debugSession.debug;
    for (const q of quests) d.quest(q, 'done');
  }, QUESTS);
  await page.waitForTimeout(800);
  // A fresh page and Continue (the save and the quests are in localStorage).
  await page.evaluate(() => window.__flow.pause());
  await page.reload({ waitUntil: 'load' });
  await waitForTitle(page, 90_000);
  await page.evaluate(() => window.__flow.continueVoyage());
  await playing();
  // Continue shows where you left off once ashore (and a recap, if one's due): past them first.
  await passLearningPauses(page);
  await page.waitForTimeout(1000);
  if (BATTLE === 3) await toThousandBough(page);
  return page;
}

/** Battle 3: by the chart to Thousand-Bough Isle (its battle waits on the passage out), past its welcome. */
async function toThousandBough(page) {
  await page.evaluate(() => {
    const s = window.__flow.debugSession;
    const q = s.islandQuay('thousand-bough');
    s.travel(q.x, q.z, q.heading);
  });
  await page.waitForFunction(() => window.__flow.debugSession.island === 'thousand-bough', null, {
    timeout: 120_000,
  });
  await page.waitForTimeout(2500);
  await page.evaluate(() => window.__flow.debugSession.debug.skipArrival());
  for (let i = 0, calm = 0; i < 200 && calm < 6; i++) {
    const st = await page.evaluate(() => window.__flow.debugSession.debug.state());
    if (st.mode === 'walk' && !st.dialogue && !st.welcome) calm++;
    else {
      calm = 0;
      if (st.dialogue) await tap(page, 'KeyE');
    }
    await passLearningPauses(page);
    await page.waitForTimeout(400);
  }
}

/** Where the battle's passage runs: from its island's mooring to its destination's (`ISLANDS`). */
async function passageEnds(page) {
  return page.evaluate(async (b) => {
    const { ISLANDS } = await import('/src/game/islands.ts');
    const [from, to] = b === 3 ? ['thousand-bough', 'keelhaven'] : ['anchorage', 'meridian'];
    return { from: ISLANDS[from].mooring, to: ISLANDS[to].mooring };
  }, BATTLE);
}

const S = (page, js) => page.evaluate(`(() => { const s = window.__flow.debugSession; return ${js}; })()`);
const hitches = (page) => page.evaluate(() => window.__isles.hitches());
const info = (page) => page.evaluate(() => window.__isles.info());
const shots = [];
const shot = async (page, name) => {
  const path = `${out}-${tag}-${name}.png`;
  await page.screenshot({ path });
  shots.push(path);
};

/** Steers for (x, z) with A/D for `ms` (or until `done()`), sails up with W. */
async function sailToward(page, x, z, ms, done = async () => false) {
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(2500);
  await page.keyboard.up('KeyW');
  const t0 = Date.now();
  let key = null;
  while (Date.now() - t0 < ms) {
    if (await done()) break;
    const st = await S(page, 's.debug.state().ship');
    const want = Math.atan2(x - st.x, z - st.z);
    const d = Math.atan2(Math.sin(want - st.heading), Math.cos(want - st.heading));
    const next = Math.abs(d) < 0.08 ? null : d > 0 ? 'KeyA' : 'KeyD';
    if (next !== key) {
      if (key) await page.keyboard.up(key);
      if (next) await page.keyboard.down(next);
      key = next;
    }
    await page.waitForTimeout(150);
  }
  if (key) await page.keyboard.up(key);
}

/** A held key long enough for a frame's poll to see it (the helm keys are read while held). */
async function tap(page, code) {
  await page.keyboard.down(code);
  await page.waitForTimeout(110);
  await page.keyboard.up(code);
  await page.waitForTimeout(120);
}

const snap = (page) => S(page, 's.debug.battleRun()?.battle.snapshot({ bears: [0, 0], stores: {} }) ?? null');
/** Programs, draws and triangles while the battle's on screen (PLAN §12.1, §15.4). */
const samples = [];
async function sample(page, label) {
  const i = await info(page);
  samples.push({
    label,
    programs: i.programs,
    draws: i.drawCalls,
    triangles: i.triangles,
    fps: Math.round(i.fps),
    resident: (await S(page, 's.debug.residency()')).resident,
  });
  if (i.programs > PROGRAM_CAP) fail(`${i.programs} programs at ${label} (cap ${PROGRAM_CAP})`);
}

/** With --sea: in harbour the sea is the setting's; once the battle's on it's the fixed Breeze. */
async function checkSea(page, label, fixed) {
  if (!opt.sea) return;
  const sea = await S(page, 's.debug.sea()');
  report.sea ??= {};
  report.sea[label] = sea;
  const breeze = sea.windSpeed === 6.5 && sea.amp.every((a) => a === 1);
  if (fixed && !(sea.fixed && sea.settled && breeze))
    fail(`${label}: the battle's sea isn't the fixed Breeze (${JSON.stringify(sea)})`);
  if (!fixed && opt.sea !== 'breeze' && (sea.fixed || breeze))
    fail(`${label}: the harbour's sea isn't the ${opt.sea} setting (${JSON.stringify(sea)})`);
}

async function boardAndSailOut(page) {
  await checkSea(page, 'harbour', false);
  await S(page, 's.debug.board()');
  await page.waitForFunction(() => window.__flow.debugSession.debug.state().mode === 'sail', null, {
    timeout: 20_000,
  });
  await page.waitForTimeout(600);
  const run0 = await S(page, '!!s.debug.battleRun()');
  if (!run0) {
    await page.waitForTimeout(1500);
    if (!(await S(page, '!!s.debug.battleRun()'))) fail('boarding with the Seal built no battle');
  }
  // Out of the harbour toward the next island under sail, then (to keep the test short) a jump to
  // ~60 m short of the open water, and on under sail until the lookout calls sails.
  const t0 = Date.now();
  const started = () => S(page, '!!s.debug.battleRun()?.started');
  if (BATTLE === 3) {
    const { from, to } = await passageEnds(page);
    await sailToward(page, to.x, to.z, 30_000, started);
    if (!(await started())) {
      const k = 0.3;
      const h = Math.atan2(to.x - from.x, to.z - from.z);
      await page.evaluate(
        ([x, z, h]) => window.__flow.debugSession.debug.sailTo(x, z, h),
        [from.x + (to.x - from.x) * k, from.z + (to.z - from.z) * k, h],
      );
      await sailToward(page, to.x, to.z, 90_000, started);
    }
  } else {
    await sailToward(page, 747, -700, 40_000, started);
    if (!(await started())) {
      await S(page, 's.debug.sailTo(215, -360, 2.2)');
      await sailToward(page, 747, -700, 90_000, started);
    }
  }
  const ship = await S(page, 's.debug.state().ship');
  if (!(await started())) fail(`no lookout's call by (${ship.x}, ${ship.z})`);
  return Date.now() - t0;
}

async function waitPhase(page, phases, ms = 60_000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const s = await snap(page);
    if (s && phases.includes(s.phase)) return s;
    await page.waitForTimeout(200);
  }
  return snap(page);
}

// ---- Battle 3's kraken -----------------------------------------------------------------------
const K = (page, js) => S(page, `(() => { const k = s.debug.battleRun().kraken; return ${js}; })()`);
const krakenLog = (page) => K(page, 'k ? { ...k.log, stage: k.stage, wrap: k.encounter.phase() } : null');

/** After wave 1: the evidence, the flagship sailing into it and taken, then wave 2 out of the fog. */
async function krakenBeat(page, res) {
  const s = await waitPhase(page, ['event'], 10_000);
  if (s?.phase !== 'event') return fail(`no kraken beat after wave 1 (${s?.phase})`);
  await page.waitForTimeout(1800);
  await shot(page, 'kraken-evidence');
  await sample(page, 'kraken evidence');
  const t0 = Date.now();
  const until = async (pred, ms) => {
    while (Date.now() - t0 < ms) {
      const l = await krakenLog(page);
      if (l && pred(l)) return l;
      await page.waitForTimeout(250);
    }
    return krakenLog(page);
  };
  await until((l) => l.stage === 'approach', 10_000);
  await page.waitForTimeout(4000);
  await shot(page, 'kraken-flagship');
  const grip = await until((l) => l.wrap === 'grip' || l.wrap === 'squeeze', 50_000);
  if (grip?.wrap !== 'grip' && grip?.wrap !== 'squeeze')
    fail(`the kraken never gripped the flagship (${JSON.stringify(grip)})`);
  await page.waitForTimeout(2500);
  await shot(page, 'kraken-taken');
  await sample(page, 'kraken taken');
  await until((l) => l.wrap === 'under' || l.wrap === 'withdraw', 30_000);
  await shot(page, 'kraken-broken');
  const after = await waitPhase(page, ['intro', 'fight'], 70_000);
  if (after?.phase !== 'intro' && after?.phase !== 'fight')
    fail(`wave 2 never came after the kraken (${after?.phase})`);
  res.kraken = { beatSeconds: Math.round((Date.now() - t0) / 1000) + 2, beat: await krakenLog(page) };
  if (!res.kraken.beat?.flagshipTaken) fail('the flagship was never taken');
}

/**
 * Wave 2 with the kraken: your helmsman steers clear of its tells (a dodge); a tell on a raider's
 * course (she's led over it and taken: a lure); then you hold your course over one (a hit). Returns
 * `step()` for the fight loop (true while you hold the helm yourself) and `done()`.
 */
function krakenWave(page, t0) {
  let lure = false;
  let onYou = 0;
  const seen = new Set();
  const once = async (key, l, ok, wait = 0) => {
    if (seen.has(key) || !ok) return;
    seen.add(key);
    if (wait) await page.waitForTimeout(wait);
    await shot(page, key);
    if (key === 'kraken-tell') await sample(page, 'kraken tell');
  };
  return {
    done: () => Date.now() - t0 > 45_000,
    async step() {
      const age = Date.now() - t0;
      const l = await krakenLog(page);
      if (!l) return false;
      await once('kraken-tell', l, l.tells > 0, 1500);
      await once('kraken-dodge', l, l.dodged > 0);
      await once('kraken-lure', l, l.taken > 0, 2500);
      await once('kraken-player-hit', l, l.playerHits > 0);
      if (!lure && age > 8_000 && l.taken === 0) lure = await K(page, 'k.debugTell("lure")');
      // Take the helm (a helm key) and hold her course over a tell on it.
      if (!onYou && age > 20_000 && l.playerHits === 0) {
        await tap(page, 'KeyW');
        if (await K(page, 'k.debugTell("onYou")')) onYou = Date.now();
      }
      return onYou > 0 && Date.now() - onYou < 8_000;
    },
  };
}

/** After the last raider: the kraken goes back down before the win card. */
async function krakenRetreat(page, res) {
  await page.waitForTimeout(2000);
  const l = await krakenLog(page);
  if (l?.stage !== 'gone') fail(`the kraken didn't retreat after the last raider (${l?.stage})`);
  await shot(page, 'kraken-retreat');
  res.kraken = { ...(res.kraken ?? {}), retreat: l };
  const w2 = res.kraken.wave2 ?? {};
  for (const k of ['tells', 'dodged', 'taken', 'playerHits'])
    if (!(w2[k] > 0)) fail(`no kraken ${k} in wave 2 (${JSON.stringify(w2)})`);
}

// ---- Play battle 1 to the end ---------------------------------------------------------------
async function play() {
  const page = await voyage();
  const res = { sailSeconds: 0, waves: [], saved: null, again: null, docked: null, hitches: [] };
  res.sailSeconds = Math.round((await boardAndSailOut(page)) / 1000);
  const started = await S(page, '!!s.debug.battleRun()?.started');
  if (!started) {
    fail('the battle never started on the passage');
    return { page, res };
  }
  const where = await S(page, 's.debug.state().ship');
  res.startedAt = { x: Math.round(where.x), z: Math.round(where.z) };
  // The briefing first (Enter sets sail), then the lookout's call and the fog.
  await page.waitForTimeout(700);
  if (await page.$('.bh-brief')) {
    await shot(page, 'briefing');
    await page.keyboard.press('Enter');
  }
  await page.waitForTimeout(3600);
  await shot(page, 'sighting');
  await sample(page, 'sighting');
  await checkSea(page, 'sighting', true);
  // Gentle seas for the run, so a break-off doesn't make the test slow (it's covered by the unit tests).
  await S(page, 's.debug.battleRun().battle.setCalm(true)');
  const waves = await S(page, 's.debug.battleRun().plan.waves.length');
  if (BATTLE === 3) {
    // The census with Keelhaven in memory (the island ahead streams in as you sail toward it).
    const r = await S(page, 's.debug.residency()');
    if (!r.resident.includes('keelhaven')) fail(`Keelhaven isn't in memory in battle 3 (${r.resident})`);
  }
  for (let wave = 0; wave < waves; wave++) {
    await waitPhase(page, ['fight']);
    await checkSea(page, `wave ${wave + 1}`, true);
    // Your helmsman brings her round (R) and you fire when she bears (Space).
    await page.keyboard.press('KeyR');
    let fired = false;
    let hit = false;
    let struck = false;
    const t0 = Date.now();
    // Battle 3's kraken through wave 2: a while to see it work before the raiders are hurried.
    const kraken = BATTLE === 3 && wave === 1 && !opt.nokraken;
    const kr = kraken ? krakenWave(page, t0) : null;
    while (Date.now() - t0 < 150_000) {
      const s = await snap(page);
      if (!s || s.phase !== 'fight') break;
      const holding = kr ? await kr.step() : false;
      if (!s.assist && !holding) await page.keyboard.press('KeyR');
      // Hurry the raiders along a little (each still has to be hit to strike).
      if (!kr || kr.done())
        await S(
          page,
          's.debug.battleRun().battle.raiders().forEach((r, i) => s.debug.battleRun().battle.debugHull(i, 14))',
        );
      if (s.bears[0] || s.bears[1]) {
        const before = await S(page, 's.debug.battleRun().battle.raiders().map((r) => r.hull)');
        await page.keyboard.press('Space');
        if (!fired) {
          await page.waitForTimeout(450);
          await shot(page, `wave${wave + 1}-broadside`);
          await sample(page, `wave ${wave + 1} broadside`);
          fired = true;
        }
        await page.waitForTimeout(1300);
        const after = await S(page, 's.debug.battleRun().battle.raiders()');
        if (!hit && after.some((r, i) => r.hull < before[i])) {
          hit = true;
          if (wave === 0) await shot(page, 'hit');
        }
        if (!struck && after.some((r) => r.state === 'struck')) {
          struck = true;
          await page.waitForTimeout(1600);
          await shot(page, `wave${wave + 1}-strike`);
          await sample(page, `wave ${wave + 1} strike`);
        }
      } else await page.waitForTimeout(400);
    }
    if (kr) res.kraken = { ...(res.kraken ?? {}), wave2: await krakenLog(page) };
    const s = await waitPhase(page, ['lull', 'question'], 30_000);
    if (BATTLE === 3 && !opt.nokraken && wave === waves - 1) await krakenRetreat(page, res);
    res.waves.push({
      wave: wave + 1,
      fired,
      hit,
      struck,
      phase: s?.phase,
      hull: s?.hull,
      breakOffs: s?.breakOffs,
    });
    if (s?.phase !== 'lull' && s?.phase !== 'question') {
      fail(`wave ${wave + 1} didn't end (${JSON.stringify(s)})`);
      return { page, res };
    }
    if (wave === 0) await shot(page, 'lull');
    await waitPhase(page, ['question'], 30_000);
    await page.waitForTimeout(900);
    await shot(page, `wave${wave + 1}-question`);
    // Answer with the keyboard: the stick/arrows move between choices and E presses one.
    const right = await S(
      page,
      `(() => {
      const quiz = s.debug.battleRun().hud;
      const opts = [...document.querySelectorAll('.bh-options .bh-choice')];
      return opts.length;
    })()`,
    );
    const answerIdx = await page.evaluate(async (wi) => {
      const run = window.__flow.debugSession.debug.battleRun();
      const { QUIZZES } = await import('/src/learn/content/index.ts');
      const quiz = QUIZZES.get(run.plan.waves[wi].quiz);
      return quiz.options.findIndex((o) => o.id === quiz.answer);
    }, wave);
    for (let k = 0; k < answerIdx; k++) await tap(page, 'ArrowDown');
    await page.keyboard.press('KeyE');
    await page.waitForTimeout(700);
    const picked = await page.$('.bh-choice.right');
    if (!picked) fail(`the right answer wasn't marked right on wave ${wave + 1} (${right} options)`);
    await shot(page, `wave${wave + 1}-bonus`);
    // The bonus pick: double-shotted first, quick repairs after.
    if (wave % 2 === 1) await tap(page, 'ArrowDown');
    await page.waitForTimeout(150);
    await page.keyboard.press('KeyE');
    await page.waitForTimeout(800);
    if (BATTLE === 3 && !opt.nokraken && wave === 0) await krakenBeat(page, res);
  }
  const won = await waitPhase(page, ['won'], 20_000);
  if (won?.phase !== 'won') fail(`the battle wasn't won (${won?.phase})`);
  if (BATTLE === 3) {
    // Every ship's sails, the flagship's and the broken hulls' pieces too: never one state, then another.
    const jumps = await S(
      page,
      '[...s.debug.battleRun().battle.ships(), ...(s.debug.battleRun().kraken ? [s.debug.battleRun().kraken.flagship] : [])].map((sh) => sh.sailJumps)',
    );
    res.sailJumps = jumps;
    if (jumps.some((j) => j > 0)) fail(`sails jumped: ${JSON.stringify(jumps)}`);
  }
  await page.waitForTimeout(2500);
  await shot(page, 'won');
  await sample(page, 'won');
  res.saved = await page.evaluate(
    () => JSON.parse(localStorage.getItem('kraken-isles.copilot-app.save.v1') ?? 'null')?.battles,
  );
  if (!res.saved?.includes(BATTLE_ID)) fail(`the win wasn't saved (${JSON.stringify(res.saved)})`);
  if (BATTLE === 3) {
    // The win card holds, then the night passes at sea (the dawn veil) into Keelhaven's morning.
    const t0 = Date.now();
    const veil = await page
      .waitForFunction(() => document.querySelector('.hud-dawn.show'), null, { timeout: 30_000 })
      .then(() => true)
      .catch(() => false);
    res.morning = veil ? Math.round((Date.now() - t0) / 100) / 10 : null;
    if (!veil) fail('no "next morning" after battle 3 was won');
    else {
      await page.waitForTimeout(1600);
      await shot(page, 'next-morning');
      await page.waitForFunction(() => !document.querySelector('.hud-dawn.show'), null, { timeout: 15_000 });
      await page.waitForTimeout(800);
      await shot(page, 'morning');
    }
  } else await page.waitForTimeout(9000);
  await shot(page, 'after');
  // On to the next island: the berth opens now the passage is clear.
  if (BATTLE === 3) {
    const { to } = await passageEnds(page);
    await page.evaluate(
      ([x, z, h]) => window.__flow.debugSession.debug.sailTo(x, z, h),
      [to.x, to.z, to.heading ?? 0],
    );
  } else await S(page, 's.debug.sailTo(744, -672, Math.PI)');
  await page.waitForTimeout(2500);
  await S(page, 's.debug.dock()');
  await page
    .waitForFunction(
      (id) =>
        window.__flow.debugSession.island === id && window.__flow.debugSession.debug.state().mode === 'walk',
      BATTLE === 3 ? 'keelhaven' : 'meridian',
      { timeout: 90_000 },
    )
    .catch(() => fail('never docked at the next island after the battle'));
  await page.waitForTimeout(1500);
  await S(page, 's.debug.skipArrival()');
  await page.waitForTimeout(2500);
  res.docked = await S(page, '({ island: s.island, mode: s.mode })');
  await shot(page, BATTLE === 3 ? 'keelhaven' : 'meridian');
  // Back aboard at Meridian and home: battle 1 isn't fought again (and battle 2 waits for its island).
  await S(page, 's.debug.board()');
  await page.waitForTimeout(3000);
  res.again = await S(page, 's.debug.battleRun() ? s.debug.battleRun().plan.id : null');
  if (res.again === BATTLE_ID) fail('battle 1 was built again after it was won');
  res.hitches = await hitches(page);
  if (res.hitches.length) fail(`${res.hitches.length} hitches: ${JSON.stringify(res.hitches.slice(0, 5))}`);
  return { page, res };
}

// ---- Skip battle -----------------------------------------------------------------------------
async function skip() {
  const page = await voyage();
  const res = { saved: null, again: null, hitches: [] };
  await boardAndSailOut(page);
  if (!(await S(page, '!!s.debug.battleRun()?.started'))) {
    fail('(skip) the battle never started');
    return { page, res };
  }
  await page.waitForTimeout(700);
  if (await page.$('.bh-brief')) await page.keyboard.press('Enter');
  await page.waitForTimeout(2500);
  // Docking at Port Meridian is shut while the raiders are out.
  await shot(page, 'skip-before');
  // Battle 3: watch for the night at sea from the skip on (it passes in a few seconds).
  if (BATTLE === 3)
    await page.evaluate(() => {
      window.__sawDawn = false;
      const look = () => {
        if (document.querySelector('.hud-dawn.show')) window.__sawDawn = true;
        else requestAnimationFrame(look);
      };
      look();
    });
  await page.click('.bh-skip');
  await page.waitForTimeout(800);
  const s = await snap(page);
  if (s && s.phase !== 'skipped') fail(`(skip) the battle is ${s.phase} after Skip battle`);
  res.saved = await page.evaluate(
    () => JSON.parse(localStorage.getItem('kraken-isles.copilot-app.save.v1') ?? 'null')?.battles,
  );
  if (!res.saved?.includes(BATTLE_ID)) fail(`(skip) the skip wasn't saved (${JSON.stringify(res.saved)})`);
  await shot(page, 'skip-after');
  await page.waitForTimeout(5000);
  if (await S(page, '!!s.debug.battleRun()')) fail('(skip) the battle was still built after the skip');
  if (BATTLE === 3) {
    // A skip settles the battle at once: the night passes at sea all the same.
    const veil = await page
      .waitForFunction(() => window.__sawDawn, null, { timeout: 20_000 })
      .then(() => true)
      .catch(() => false);
    if (!veil) fail('(skip) no "next morning" after battle 3 was skipped');
    res.hitches = await hitches(page);
    if (res.hitches.length)
      fail(`(skip) ${res.hitches.length} hitches: ${JSON.stringify(res.hitches.slice(0, 5))}`);
    return { page, res };
  }
  // Home and aboard again: no battle waits now.
  await S(page, 's.debug.sailTo(-96, -128, Math.PI)');
  await page.waitForTimeout(2000);
  await S(page, 's.debug.dock()');
  await page
    .waitForFunction(() => window.__flow.debugSession.debug.state().mode === 'walk', null, {
      timeout: 60_000,
    })
    .catch(() => fail('(skip) never docked back at Anchorage'));
  await page.waitForTimeout(1500);
  await S(page, 's.debug.board()');
  await page.waitForTimeout(3000);
  res.again = await S(page, '!!s.debug.battleRun()');
  if (res.again) fail('(skip) a skipped battle was built again');
  res.hitches = await hitches(page);
  if (res.hitches.length)
    fail(`(skip) ${res.hitches.length} hitches: ${JSON.stringify(res.hitches.slice(0, 5))}`);
  return { page, res };
}

if (opt.only !== 'skip') {
  const { page, res } = await play();
  report.play = res;
  await page.close();
}
if (opt.only !== 'play') {
  const { page, res } = await skip();
  report.skip = res;
  await page.close();
}
await browser.close();
console.log(JSON.stringify({ ...report, samples, shots, logs: logs.slice(0, 30) }, null, 1));
process.exit(logs.length ? 1 : 0);
