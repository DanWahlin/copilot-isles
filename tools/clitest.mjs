#!/usr/bin/env node
// End-to-end quest run of the second course, GitHub Copilot CLI for Beginners (courses/copilot-cli:
// Anchorage only, text only; docs/specs/COURSE-PACKS.md §8), on the play page with `?pack=copilot-cli`:
// the landfall and Wingman's welcome (captions, no voice), Nell's papers, the course board, Ezra's
// Codespace or clone, Bo's install, Pim and Pol's sign-in, Juno's First Words (the speaking tube),
// the bottles, the Trial and the christening, then the chart (the other islands uncharted) and a sail
// toward Port Meridian (closed in this course). Each caption must hold for its reading time and move
// on with E. Screenshots at each beat.
// node tools/clitest.mjs [--base=http://localhost:5301] [--webgl] [--out=/tmp/shots/cli]
import { collectLogs, launchChrome, parseFlags } from './lib/browser.mjs';
import { answerCard, cardOpen, cardState } from './lib/learning-cards.mjs';

const opt = parseFlags();
const base = opt.base || 'http://localhost:5301';
const out = opt.out || '/tmp/shots/cli';
const tag = opt.webgl ? 'gl' : 'gpu';
const url = `${base}/devpages/play.html?auto&quiet&shot&pack=copilot-cli${opt.webgl ? '&webgl' : ''}`;

const browser = await launchChrome();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const logs = collectLogs(page, { types: ['error'] });
// A text-only course fetches no audio: any voice request is a bug.
const voiceFetches = [];
page.on('request', (r) => {
  if (/\/voice\/[^/]+\.(webm|m4a)$/.test(r.url())) voiceFetches.push(r.url());
});
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
      quiz: l.quiz ? { id: l.quiz.quiz.id, correct: l.quiz.last?.correct ?? null } : null,
      reveal: l.reveal?.page.id ?? null,
      banner: l.banner?.title ?? null,
      spyglass: l.spyglass?.image ?? null,
      dialogue: st.dialogue,
      quests: window.__dev.learn.progress.data.quests,
      pages: l.pages.length,
    };
  });
const tap = (code) => page.evaluate((c) => window.__dev.tap(c), code);
const caption = () =>
  page.evaluate(() => {
    const el = document.querySelector('.hud-subtitle.show');
    return el
      ? {
          speaker: el.querySelector('.hud-speaker')?.textContent ?? '',
          text: el.querySelector('.hud-line')?.textContent ?? '',
          textOnly: el.classList.contains('is-text'),
          next: !!el.querySelector('.hud-next'),
        }
      : null;
  });

const seen = new Set();
const captions = [];
/** Drives captions, quizzes, and reveals until `done(state)`. Captions move on with E. */
/** App tasks the run puts off with Later (the rest it confirms with I did it). */
const cardPlan = { later: [] };
async function drive(label, done, ms = 120000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const s = await learnState();
    // The learning systems' cards (app tasks, a reflection, a Seal card, where you left off) first: one
    // open means the game's still busy, whatever `done` reads.
    const card = await page.evaluate(cardState);
    if (cardOpen(card)) {
      await answerCard(page, card, {
        shot,
        fail: (m) => logs.push(`[clitest] ${m}`),
        seen,
        plan: cardPlan,
      });
      await page.waitForTimeout(300);
      continue;
    }
    if (done(s)) return s;
    if (s.quiz) {
      if (!seen.has(s.quiz.id)) {
        seen.add(s.quiz.id);
        await page.waitForTimeout(500);
        await shot(`quiz-${s.quiz.id}`);
      }
      if (s.quiz.correct) await tap('KeyE');
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
      const c = await caption();
      if (c && !captions.some((x) => x.text === c.text)) {
        captions.push(c);
        // A line's caption (not an unvoiced aside like the ship's name) has the button that moves it on.
        if (c.textOnly && !c.next)
          logs.push(`[clitest] ${label}: a caption has no next button (${JSON.stringify(c)})`);
      }
      if (s.spyglass && !seen.has(`spy-${s.spyglass}`)) {
        seen.add(`spy-${s.spyglass}`);
        await page.waitForTimeout(700);
        await shot(`spyglass-${s.spyglass.replace(/\W+/g, '_')}`);
      }
      await tap('KeyE');
    }
    await page.waitForTimeout(350);
  }
  logs.push(`[clitest] ${label}: timed out`);
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

const results = { course: await page.evaluate(() => window.__dev.course?.() ?? null) };

// Wingman's welcome: a caption holds for its reading time on its own, and E moves it on.
{
  await page.evaluate(() => window.__dev.session().debug.flyover('anchorage'));
  await page.waitForTimeout(2500);
  await tap('KeyE');
  await page.waitForTimeout(2200);
  const first = await caption();
  await shot('welcome-caption');
  if (!first?.textOnly) logs.push(`[clitest] welcome: no text-only caption (${JSON.stringify(first)})`);
  // Let one line run out by itself (its reading time), then press through the rest.
  await page.waitForTimeout(9000);
  const later = await caption();
  if (first && later && later.text === first.text)
    logs.push('[clitest] welcome: a caption never moved on by itself');
  for (let i = 0; i < 30 && (await learnState()).dialogue; i++) {
    await tap('KeyE');
    await page.waitForTimeout(350);
  }
}

await talk('nell');
await page.waitForTimeout(400);
await shot('nell-caption');
results.nell = await drive('nell', (s) => s.quests['Q0.2'] === 'done' && !s.dialogue && !s.quiz && !s.reveal);

// The course notice board: Chapter 00 · Quick Start, linking into the CLI course.
{
  const spot = await page.evaluate(() =>
    window.__dev
      .session()
      .debug.courseBoards()
      .find((b) => b.island === 'anchorage'),
  );
  await page.evaluate((b) => window.__dev.session().debug.teleport(b.x, b.z, b.heading), spot);
  await page.waitForTimeout(600);
  await tap('KeyE');
  await page.waitForTimeout(900);
  const board = await page.evaluate(() => ({
    chapter: window.__dev.learn.getState().courseBoard?.chapter ?? null,
    links: [...document.querySelectorAll('.ci-cb a')].map((a) => a.getAttribute('href')),
  }));
  await shot('course-board');
  if (board.chapter !== '00-quick-start') logs.push(`[clitest] board: ${JSON.stringify(board)}`);
  else if (
    !board.links.some((h) =>
      h?.startsWith(
        'https://github.com/github/copilot-cli-for-beginners/blob/main/00-quick-start/README.md#',
      ),
    )
  )
    logs.push(`[clitest] board links: ${board.links.join(', ')}`);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(600);
  results.board = board.chapter;
}

await talk('merchant');
results.ezra = await drive('ezra', (s) => s.quests['Q0.3'] === 'done' && !s.dialogue && !s.quiz && !s.reveal);
await talk('dockhand_b');
results.bo = await drive('bo', (s) => s.quests['Q0.4'] === 'done' && !s.dialogue && !s.quiz && !s.reveal);
await talk('pim');
results.signin = await drive(
  'signin',
  (s) => s.quests['Q0.7'] === 'done' && !s.dialogue && !s.quiz && !s.reveal,
);
await talk('juno');
results.juno = await drive(
  'juno',
  (s) => s.quests['Q0.8'] === 'pipes' && !s.dialogue && !s.quiz && !s.reveal,
);

// First Words: the speaking tube carries the prompt to Copilot (the hatch is the shell).
const ps = await page.evaluate(() => window.__dev.session().debug.puzzle('first-words')?.spots() ?? null);
if (ps) {
  await page.evaluate((p) => {
    window.__dev.session().debug.teleport(Math.min(p.x - 1.05, -106.45), p.z, Math.PI / 2);
    window.__dev.look(Math.PI / 2 + 0.35, 0.12);
  }, ps.tube);
  await page.waitForTimeout(800);
  await tap('KeyE');
  await page.waitForTimeout(1800);
  await shot('pipes-reply');
  results.firstWords = await drive(
    'first-words',
    (s) => s.quests['Q0.8'] === 'done' && !s.dialogue && !s.quiz && !s.reveal,
  );
} else logs.push('[clitest] no First Words puzzle');

// Nell by the bow: the Trial (seven questions) and the christening.
await page.waitForTimeout(600);
await talk('nell');
results.trial = await drive('trial', (s) => s.quests['Q0.10'] === 'done' && !s.banner && !s.quiz, 150000);
results.christening = await drive(
  'christening',
  (s) => s.quests['Q0.11'] === 'sail' && !s.dialogue && !s.reveal,
  90000,
);

// The chart: Anchorage charted, the other islands not in this course.
await page.evaluate(() => window.__dev.learn.openLogbook('quests'));
await page.waitForTimeout(500);
await shot('logbook-quests');
await page.evaluate(() => window.__dev.learn.closeLogbook());
await page.waitForTimeout(400);

// Port Meridian is closed in this course: sail over, and there's no berth to dock at.
{
  await page.evaluate(() => window.__dev.session().debug.board());
  await page.waitForTimeout(1500);
  await page.evaluate(() => window.__dev.session().debug.sailTo(744, -672, Math.PI));
  await page.waitForTimeout(2000);
  const off = await page.evaluate(() => ({
    prompt: document.querySelector('.hud-prompt.show')?.textContent ?? null,
    island: window.__dev.session().island,
    battle: window.__dev.session().battle.active,
  }));
  await shot('off-meridian');
  if (off.prompt?.includes('Port Meridian') || off.island !== 'anchorage' || off.battle)
    logs.push(`[clitest] Port Meridian should be closed in this course (${JSON.stringify(off)})`);
  results.meridianClosed = !off.prompt?.includes('Port Meridian');
}

const final = await learnState();
const textOnly = captions.filter((c) => c.textOnly).length;
if (textOnly < 20) logs.push(`[clitest] only ${textOnly} text-only captions`);
if (voiceFetches.length) logs.push(`[clitest] fetched voice audio: ${voiceFetches.slice(0, 3).join(', ')}`);
await browser.close();
console.log(
  JSON.stringify(
    {
      url,
      final: { quests: final.quests, pages: final.pages },
      results,
      captions: captions.length,
      shots: shots.length,
      out,
      logs,
    },
    null,
    1,
  ),
);
if (logs.length) process.exitCode = 1;
