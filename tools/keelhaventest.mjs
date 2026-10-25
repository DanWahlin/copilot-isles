#!/usr/bin/env node
// End-to-end Chapter 03 run on Keelhaven, in the course's order (docs/specs/ISLAND-03-keelhaven.md §4):
// ashore at the Old Town quay (the arrival flyover, Juno and Wingman), Lyra's re-take on the tavern porch
// (a wrong bar first), Hester's Evidence Board, Dory's sounding, tool chest and bell cord (and her app
// card), Cass at Drydock 2, Barty at the Old Hulk, Stroud's ledgers (the wrong port first), Arlo at Lock 2,
// and Ottoline's Trial at the Gate Light. Then the chests, the bottles and the starfish.
// Each NPC is walked up to from a free side and talked to with E; quizzes are answered, cards confirmed
// with I did it. Fails on any page error, a missing beat, or a hitch after warm-up. Screenshots at every beat.
//   node tools/keelhaventest.mjs [--base=http://127.0.0.1:5301] [--out=<dir>] [--tier=high] [--webgl]
//                                [--reduced] [--verbose]
import { mkdirSync } from 'node:fs';
import { collectLogs, launchChrome, parseFlags } from './lib/browser.mjs';
import { answerCard, cardOpen, cardState } from './lib/learning-cards.mjs';

const opt = parseFlags();
const base = opt.base || 'http://localhost:5301';
const out = opt.out || 'tmp/shots/keelhaven';
mkdirSync(out, { recursive: true });
const tag = `${opt.tier || 'auto'}-${opt.webgl ? 'gl' : 'gpu'}`;
const url =
  `${base}/devpages/play.html?auto&quiet&keelhaven&shot` +
  `${opt.webgl ? '&webgl' : ''}${opt.tier ? `&tier=${opt.tier}` : ''}`;

const browser = await launchChrome();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
if (opt.reduced) await page.emulateMedia({ reducedMotion: 'reduce' });
const logs = collectLogs(page, { types: ['error'] });
const fail = (m) => {
  logs.push(`[keelhaventest] ${m}`);
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
const kh = (fn, ...args) =>
  S(
    ([fn, args]) => {
      const d = window.__dev.session().debug.island('keelhaven');
      const v = d?.[fn];
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
      dialogue: st.dialogue,
      welcome: st.welcome,
      mode: st.mode,
      quests: window.__dev.learn.progress.data.quests,
      pages: l.pages.length,
      doubloons: l.doubloons,
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

/** A set piece's choice card (the re-take, the sounding, the ledgers…): a wrong pick first where there is one. */
const WRONG_FIRST = { bar2: 'bar1', fork: 'all' };
const cardTried = new Set();
async function answerChoice() {
  const v = await kh('card');
  if (!v?.open || v.busy) return false;
  const ids = v.options.map((o) => o.id);
  const key = `${v.title}|${ids.join(',')}`;
  if (!seen.has(`card-${key}`)) {
    seen.add(`card-${key}`);
    await page.waitForTimeout(400);
    await shot(`card-${v.title.replace(/[^\w]+/g, '_').slice(0, 24)}`);
  }
  let pick = ids.find((id) => !v.options.find((o) => o.id === id).tried) ?? ids[0];
  for (const [right, wrong] of Object.entries(WRONG_FIRST))
    if (ids.includes(right) && ids.includes(wrong) && !cardTried.has(wrong)) pick = wrong;
    else if (ids.includes(right)) pick = right;
  cardTried.add(pick);
  // Through the card's own keys (1-9), as a player would.
  await tap(`Digit${ids.indexOf(pick) + 1}`);
  return true;
}

const seen = new Set();
const cardPlan = { later: [] };
/** Drives dialogue, quizzes, reveals, cards and set pieces until `done(state)`. */
async function drive(label, done, ms = 180000) {
  const t0 = Date.now();
  note(`drive ${label}`);
  while (Date.now() - t0 < ms) {
    const card = await page.evaluate(cardState);
    if (cardOpen(card)) {
      await answerCard(page, card, { shot, fail, seen, plan: cardPlan });
      await page.waitForTimeout(300);
      continue;
    }
    if (await answerChoice()) {
      await page.waitForTimeout(450);
      continue;
    }
    const s = await learnState();
    if (done(s)) return s;
    if (s.quiz) {
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

/** Walks up to an NPC from wherever there's room, checks the prompt, and presses E. */
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
  if (Math.abs(n.y - n.ground) > 0.15) fail(`${id} stands ${(n.y - n.ground).toFixed(2)} m off the ground`);
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
    fail(`E at ${id} didn't start a conversation`);
    await S((id) => window.__dev.session().debug.talk(id), id);
  }
  await page.waitForTimeout(1300);
  await shot(`stop-${id}`);
}
/** The compass's gold marker label (its next stop). */
const compassLabel = () => S(() => document.querySelector('.hud-compass-label')?.textContent ?? null);
/** Sets a quest step (a puzzle the run doesn't play yet). */
const setQuest = (id, step) => S(([id, step]) => window.__dev.session().debug.quest(id, step), [id, step]);

// ---- Ashore at the Old Town quay (the chart's travel), with the arrival flyover ----
const q = await S(() => window.__dev.session().islandQuay('keelhaven'));
if (!q) fail('Keelhaven isn’t open');
await S((q) => window.__dev.session().travel(q.x, q.z, q.heading), q);
await page.waitForFunction(() => window.__dev.session().island === 'keelhaven', null, { timeout: 90000 });
for (const t of [1.5, 9, 14, 19, 24]) {
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
      .some((n) => n.id === 'lyra_keel'),
  null,
  {
    timeout: 90000,
  },
);
await page
  .waitForFunction(() => window.__dev.state().dialogue, null, { timeout: 8000 })
  .catch(() => fail('no Keelhaven welcome'));
await page.waitForTimeout(1200);
await shot('welcome');
await drive('welcome', (s) => !s.dialogue && !s.welcome, 60000);
await page.waitForTimeout(1200);
await shot('ashore');
const tracker = await S(() => window.__dev.learn.getState().tracker);
if (tracker?.island !== 'Keelhaven') fail(`tracker shows ${tracker?.island}`);
if (!(await compassLabel())?.includes('Lyra')) fail(`compass points at ${await compassLabel()}, not Lyra`);

// ---- The stops, in the course's order ----
const stops = [
  { npc: 'lyra_keel', quest: 'Q3.1', next: 'Hester' },
  { npc: 'hester', quest: 'Q3.2', next: 'Dory' },
  { npc: 'dory', quest: 'Q3.3', next: 'Cass' },
];
for (const s of stops) {
  await talk(s.npc);
  await drive(s.npc, (st) => quest(s.quest, 'done')(st) && !st.dialogue);
  await page.waitForTimeout(1200);
  await shot(`after-${s.npc}`);
  const c = await compassLabel();
  if (!c?.includes(s.next)) fail(`after ${s.npc} the compass points at ${c}, not ${s.next}`);
}
if (!(await kh('toolChestOnRack'))) fail('Dory’s tool chest isn’t on Drydock 2’s rack');

// Cass: the Drydock Ring's two laps (the circuit, milestone 3) are set from here.
await talk('cass');
await drive('cass', (st) => st.quests['Q3.4'] === 'ring' && !st.dialogue);
await setQuest('Q3.4', 'done');
await setQuest('Q3.5', 'done');
await page.waitForTimeout(800);

for (const s of [
  { npc: 'barty', quest: 'Q3.6', next: 'Stroud' },
  { npc: 'stroud', quest: 'Q3.7', next: 'Stroud' },
]) {
  await talk(s.npc);
  await drive(s.npc, (st) => quest(s.quest, 'done')(st) && !st.dialogue);
  await page.waitForTimeout(1200);
  await shot(`after-${s.npc}`);
  const c = await compassLabel();
  if (!c?.includes(s.next)) fail(`after ${s.npc} the compass points at ${c}, not ${s.next}`);
}

// The Lock Flight (milestone 3) is set from here; Arlo and Ottoline then talk.
await setQuest('Q3.8', 'done');
await setQuest('Q3.9', 'done');
await page.waitForTimeout(600);
await talk('arlo');
await drive('arlo', (st) => !st.dialogue, 30000);
await talk('ottoline');
await page.waitForTimeout(1500);
await shot('ottoline-gate-light');

// ---- Chests, bottles and starfish ----
const chests = await S(() =>
  window.__dev
    .session()
    .debug.chests()
    .filter((c) => c.id.startsWith('C3.')),
);
if (chests.length !== 3) fail(`${chests.length} chests on Keelhaven, not 3`);
const bottles = await S(() =>
  window.__dev
    .session()
    .debug.bottles()
    .filter((b) => b.id.startsWith('B3.')),
);
if (bottles.length !== 5) fail(`${bottles.length} bottles on Keelhaven, not 5`);
const starfish = await S(() =>
  window.__dev
    .session()
    .debug.starfish()
    .filter((s) => s.island === 'keelhaven'),
);
if (starfish.length !== 5) fail(`${starfish.length} starfish on Keelhaven, not 5`);

const hitches = await S(() => window.__isles?.hitches?.() ?? []);
if (hitches.length) fail(`hitches after warm-up: ${JSON.stringify(hitches)}`);
console.log(JSON.stringify({ shots: shots.length, out, logs }, null, 2));
await browser.close();
process.exit(logs.length ? 1 : 0);
