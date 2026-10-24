#!/usr/bin/env node
// End-to-end Chapter 01 run at Port Meridian, in the course's order: Tobias, Mina's tour, Lyra, Anders
// and the Crate Yard (P1.1, solved by its hook), Rhea and the Three Helms (P1.2, sailed for real: each
// buoy's helm, Interactive's marks, Plan's approval, Autopilot home to the berth), the lift up the
// bluff to Oren, his practice at Gilda's Model Market and back to him, Pell and the Lost Letters (P1.3,
// played with the keyboard), and the Admiral's Exam that lights the lighthouse. Screenshots at each
// beat. First, on the way up from the quay, Gilda's counter before the lesson: she sends you to Oren and
// the work order stays shut. Oren's practice (Q1.6 at market) with an empty purse: Gilda stakes the
// starfish; a quick look right-sized with Auto, one overspent (High effort) and one right-sized with a
// Powerful model on Default (your model on its default effort), a hard job that falls short and its
// Retry (a different model, which you choose: Q1.6 moves on), then a hard job retried with more effort,
// and one with Auto (right-sized, with a Retry offered), all with real keys; then Meridian is freed and
// rebuilt to check the market reads the save. At a helm order and at Pell's desk it also types in the
// fork form over the overlay, to check the overlay leaves those keys (and J) alone.
// Oren asks which model the player kept and Pell which computer they're on (Your setup): `--setup=skip`
// skips both forms; by default the run enters them and checks the quiz and Logbook use them.
// node tools/meridiantest.mjs [--base=http://localhost:5301] [--webgl] [--out=/tmp/shots/meridian]
//                             [--from=admiral|oren|pell|market] [--setup=enter|skip]
// (--from=market plays only Oren's practice at the market and its reload.)
import { collectLogs, launchChrome, parseFlags } from './lib/browser.mjs';
import { answerCard, cardOpen, cardState } from './lib/learning-cards.mjs';
import { answerSetupForm, logbookPage, setupPlan } from './lib/setup-forms.mjs';

const opt = parseFlags();
const base = opt.base || 'http://localhost:5301';
const out = opt.out || '/tmp/shots/meridian';
const tag = opt.webgl ? 'gl' : 'gpu';
const url = `${base}/devpages/play.html?auto&quiet&meridian&shot${opt.webgl ? '&webgl' : ''}`;

const browser = await launchChrome();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const logs = collectLogs(page, { types: ['error'] });
await page.goto(url, { waitUntil: 'load' });
await page.waitForFunction(() => window.__dev?.ready === true && window.__dev.session(), null, {
  timeout: 120000,
});
await page.waitForTimeout(1500);

const shots = [];
const shot = async (name) => {
  const path = `${out}-${tag}-${name}.png`;
  await page.screenshot({ path });
  shots.push(path);
};
const S = (f, a) => page.evaluate(f, a);
const tap = (code) => S((c) => window.__dev.tap(c), code);
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
      subtitle: document.querySelector('.hud-subtitle')?.textContent ?? '',
      dialogue: st.dialogue,
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

const plan = setupPlan(opt.setup);
const subtitles = new Set();
const seen = new Set();
/** Drives dialogue, quizzes, and reveals until `done(state)` or the timeout; `every` runs each tick. */
/** App tasks the run puts off with Later (the rest it confirms with I did it). */
const cardPlan = { later: [] };
async function drive(label, done, ms = 150000, every = null) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const s = await learnState();
    if (done(s)) return s;
    // The learning systems' cards (app tasks, a reflection, a Seal card, where you left off).
    const card = await page.evaluate(cardState);
    if (cardOpen(card)) {
      await answerCard(page, card, {
        shot,
        fail: (m) => logs.push(`[meridiantest] ${m}`),
        seen,
        plan: cardPlan,
      });
      await page.waitForTimeout(300);
      continue;
    }
    if (every) await every(s);
    if (s.subtitle) subtitles.add(s.subtitle);
    if (s.subtitle.includes('Command R') && !seen.has('subtitle-shortcut')) {
      seen.add('subtitle-shortcut');
      await page.waitForTimeout(400);
      await shot('subtitle-shortcut');
    }
    if (s.setupForm)
      await answerSetupForm(page, s.setupForm, plan, {
        shot,
        fail: (m) => logs.push(`[meridiantest] ${m}`),
      });
    else if (s.quiz) {
      if (!seen.has(s.quiz.id)) {
        seen.add(s.quiz.id);
        await page.waitForTimeout(500);
        await shot(`quiz-${s.quiz.id}`);
      }
      if (s.quiz.correct) await tap('KeyE');
      else if (s.quiz.type === 'hotspot') await clickHotspot();
      else await S(() => window.__dev.answer());
    } else if (s.reveal || s.banner) {
      const key = `reveal-${s.reveal ?? s.banner}`;
      if (!seen.has(key)) {
        seen.add(key);
        await page.waitForTimeout(500);
        await shot(key.replace(/[^\w.-]+/g, '_'));
      }
      await tap('KeyE');
    } else if (s.dialogue) await tap('KeyE');
    await page.waitForTimeout(350);
  }
  logs.push(`[meridiantest] ${label}: timed out`);
  return learnState();
}

/**
 * Walks up to a Meridian NPC from wherever there's room (in front first, then round them), on their
 * level, checks the talk prompt, and presses E.
 */
const talk = async (id) => {
  const n = await S(
    (id) =>
      window.__dev
        .session()
        .debug.cast()
        .find((v) => v.id === id) ?? null,
    id,
  );
  if (!n) {
    logs.push(`[meridiantest] no NPC ${id}`);
    return;
  }
  if (id !== 'lyra_meridian' && Math.abs(n.y - n.ground) > 0.12)
    logs.push(`[meridiantest] ${id} stands ${(n.y - n.ground).toFixed(2)} m off the ground`);
  const name = n.name;
  let ok = false;
  for (const reach of [2.2, 3.2]) {
    for (const k of [0, 1, -1, 2, -2, 3, -3, 4]) {
      const a = n.h + (k * Math.PI) / 4;
      const at = await S(
        ([x, z, h]) => {
          const s = window.__dev.session();
          s.debug.teleport(x, z, h);
          return window.__dev.state();
        },
        [n.x + Math.sin(a) * reach, n.z + Math.cos(a) * reach, a + Math.PI],
      );
      await page.waitForTimeout(250);
      const prompt = await S(() => document.querySelector('.hud-prompt.show')?.textContent ?? null);
      if (Math.abs(at.y - n.y) < 1 && prompt?.includes('Talk to') && (!name || prompt.includes(name))) {
        ok = true;
        break;
      }
    }
    if (ok) break;
  }
  await S((a) => window.__dev.look(a, 0.16), n.h + Math.PI + 0.35);
  await page.waitForTimeout(700);
  await shot(`talk-${id}`);
  if (ok) await tap('KeyE');
  else {
    // Logged as a failure, then the conversation's started directly so the rest of the run still plays.
    logs.push(`[meridiantest] can't get a talk prompt at ${id} from any side`);
    await S((id) => window.__dev.session().debug.talk(id), id);
  }
  await page.waitForTimeout(600);
};
const quest = (id, want) => (s) => s.quests[id] === want;

// Ashore at Meridian (the chart's travel), past the flyover.
const q = await S(() => window.__dev.session().islandQuay('meridian'));
await S((q) => window.__dev.session().travel(q.x, q.z, q.heading), q);
await page.waitForFunction(() => window.__dev.session().island === 'meridian', null, { timeout: 30000 });
await page.waitForTimeout(4000);
if ((await S(() => window.__dev.session().debug.arrival()?.phase)) === 'flying') await tap('KeyE');
await page.waitForFunction(() => window.__dev.session().debug.cast().length > 0, null, { timeout: 60000 });
// Wingman's welcome follows the flyover; let it start, then play it through.
await page
  .waitForFunction(() => window.__dev.state().dialogue, null, { timeout: 8000 })
  .catch(() => logs.push('[meridiantest] no Meridian welcome'));
await drive('welcome', (s) => !s.dialogue, 30000);
await page.waitForTimeout(1200);
await shot('ashore');

// Walkability: flood-fill the town on a 0.5 m grid (player radius 0.35 m, 0.66 m step-up, the lift
// joining its landings) and check every NPC can be walked to from the landing, and the clifftop cast
// is a short walk from the lift's top.
{
  const reach = await S((q) => {
    const s = window.__dev.session();
    const w = s.world;
    const cell = 0.5;
    const x0 = 560,
      z0 = -840,
      nx = 600,
      nz = 380;
    const idx = (i, j) => j * nx + i;
    const toIJ = (x, z) => [Math.round((x - x0) / cell), Math.round((z - z0) / cell)];
    const h = new Float32Array(nx * nz);
    const ok = new Uint8Array(nx * nz);
    const p = { x: 0, z: 0 };
    for (let j = 0; j < nz; j++)
      for (let i = 0; i < nx; i++) {
        const x = x0 + i * cell,
          z = z0 + j * cell;
        p.x = x;
        p.z = z;
        w.pushOut(p, 0.35);
        if (Math.hypot(p.x - x, p.z - z) > 0.12) continue;
        const y = w.groundAt(x, z);
        if (y < w.waterAt(x, z, 0) + 0.2) continue;
        h[idx(i, j)] = y;
        ok[idx(i, j)] = 1;
      }
    const bfs = (starts) => {
      const d = new Float32Array(nx * nz).fill(Infinity);
      const queue = [];
      for (const [x, z] of starts) {
        const [ci, cj] = toIJ(x, z);
        for (let dj = -2; dj <= 2; dj++)
          for (let di = -2; di <= 2; di++) {
            const k = idx(ci + di, cj + dj);
            if (ok[k] && d[k] === Infinity) {
              d[k] = 0;
              queue.push(k);
            }
          }
      }
      for (let n = 0; n < queue.length; n++) {
        const k = queue[n];
        const i = k % nx,
          j = (k / nx) | 0;
        for (const [di, dj] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ]) {
          const a = i + di,
            b = j + dj;
          if (a < 0 || b < 0 || a >= nx || b >= nz) continue;
          const m = idx(a, b);
          if (!ok[m] || d[m] !== Infinity) continue;
          const dy = h[m] - h[k];
          if (dy > 0.66 || dy < -1.2) continue;
          d[m] = d[k] + cell;
          queue.push(m);
        }
      }
      return d;
    };
    const near = (d, x, z, r) => {
      const [ci, cj] = toIJ(x, z);
      const n = Math.ceil(r / cell);
      let best = Infinity;
      for (let dj = -n; dj <= n; dj++)
        for (let di = -n; di <= n; di++)
          if (Math.hypot(di, dj) * cell <= r) best = Math.min(best, d[idx(ci + di, cj + dj)] ?? Infinity);
      return best;
    };
    const lift = s.debug.liftSpots();
    const fromLanding = bfs([[q.x, q.z]]);
    const liftUp = near(fromLanding, lift.bottom.x, lift.bottom.z, 2.4) < Infinity;
    const fromTop = bfs([[lift.top.x, lift.top.z]]);
    const out = { liftUp, npcs: {} };
    for (const n of s.debug.cast()) {
      const r = n.id === 'lyra_meridian' ? 4.4 : 2.4;
      const walked = Math.min(near(fromLanding, n.x, n.z, r), liftUp ? near(fromTop, n.x, n.z, r) : Infinity);
      out.npcs[n.id] = { reachable: walked < Infinity, fromTop: Math.round(near(fromTop, n.x, n.z, r)) };
    }
    return out;
  }, q);
  if (!reach.liftUp) logs.push('[meridiantest] the lift bottom can’t be walked to from the landing');
  for (const [id, r] of Object.entries(reach.npcs))
    if (!r.reachable) logs.push(`[meridiantest] ${id} can’t be walked to`);
  for (const id of ['oren', 'pell', 'admiral'])
    if (!(reach.npcs[id]?.fromTop <= 60))
      logs.push(`[meridiantest] ${id} is a ${reach.npcs[id]?.fromTop} m walk from the lift top`);
}

/** Oren's model question (Your setup), then where the answer shows. */
async function checkOrenSetup() {
  const setup = await S(() => window.__dev.learn.getState().setup);
  const quizzes = await S(() => window.__dev.learn.progress.data.quizzes);
  // Oren's talk is lighter: the model control's hotspot, then the practice (no model quiz).
  if (!quizzes['H1.3']?.passed) logs.push('[meridiantest] Oren’s H1.3 hotspot wasn’t asked');
  if (quizzes['N1.3'] || quizzes['N1.4']) logs.push('[meridiantest] Oren asked a model quiz he dropped');
  const tryPage = await logbookPage(page, 'pg1.try-controls', shot);
  if (plan.model === 'skip') {
    if (setup.model !== null) logs.push('[meridiantest] a skipped model was saved');
    if (tryPage.includes('Your model')) logs.push('[meridiantest] pg1.try-controls notes a skipped model');
  } else {
    if (setup.model?.pick !== plan.model.pick) logs.push(`[meridiantest] model not saved: ${setup.model}`);
    if (plan.model.name && !tryPage.includes(plan.model.name))
      logs.push(`[meridiantest] pg1.try-controls doesn't note ${plan.model.name}`);
  }
}

/** Pell's prompt history (moved from Oren): the computer question, the quiz, and the Logbook page. */
async function checkPellSetup() {
  const setup = await S(() => window.__dev.learn.getState().setup);
  const detected = await S(() => window.__dev.learn.getState().osDetected);
  const os = setup.os ?? detected;
  const keys = os === 'mac' ? 'Cmd+R' : 'Ctrl+R';
  const other = os === 'mac' ? 'Ctrl+R' : 'Cmd+R';
  const line = [...subtitles].find((t) => t.includes('Command R'));
  if (!line?.includes('Control R'))
    logs.push(`[meridiantest] Pell's prompt history line: ${JSON.stringify(line)}`);
  if (plan.os !== 'skip' && setup.os !== plan.os) logs.push(`[meridiantest] computer not saved: ${setup.os}`);
  if (plan.os === 'skip' && setup.os !== null) logs.push(`[meridiantest] a skipped computer was saved`);
  const prompts = await logbookPage(page, 'pg1.prompts', shot);
  if (!prompts.includes(keys) || prompts.includes(`Press ${other}`))
    logs.push(`[meridiantest] pg1.prompts doesn't use ${keys}`);
  const quizzes = await S(() => window.__dev.learn.progress.data.quizzes);
  if (!quizzes['N1.5']?.passed) logs.push('[meridiantest] the prompt history quiz N1.5 wasn’t asked');
  // The Logbook's Your setup card, where each can be changed.
  await S(() => window.__dev.learn.openLogbook('quests'));
  await page.waitForTimeout(500);
  await shot('logbook-your-setup');
  await S(() => window.__dev.learn.closeLogbook());
  await page.waitForTimeout(200);
}

/**
 * Typing in the fork form (and the Logbook's J) mustn't reach a puzzle overlay's keys. Opens the fork
 * form over the overlay, types into it with real key presses, checks `unmoved()` (no pick or filing
 * happened), and skips the form with Esc. `logbook` first presses J: it should open the Logbook (true)
 * or be held back while the overlay's open (false).
 */
async function forkFormKeys(label, logbook, unmoved) {
  await page.keyboard.press('KeyJ');
  await page.waitForTimeout(300);
  const opened = await S(() => window.__dev.learn.getState().logbook.open);
  if (opened !== logbook)
    logs.push(`[meridiantest] ${label}: J ${opened ? 'opened' : 'didn’t open'} the Logbook`);
  if (opened) {
    if (label === 'helm') {
      const stack = await S(() => {
        const logbook = document.querySelector('.ci-logbook');
        if (!logbook) return null;
        const rect = logbook.getBoundingClientRect();
        const top = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
        return {
          topmost: !!top && (top === logbook || logbook.contains(top)),
          top:
            top?.tagName.toLowerCase() + (top?.getAttribute('class') ? `.${top.getAttribute('class')}` : ''),
        };
      });
      if (!stack?.topmost)
        logs.push(`[meridiantest] helm: Logbook isn’t topmost at its centre (${stack?.top ?? 'missing'})`);
    }
    await page.keyboard.press('Digit1');
    await page.waitForTimeout(300);
    if (!(await unmoved())) logs.push(`[meridiantest] ${label}: 1 in the Logbook reached the overlay`);
  }
  await S(() => void window.__dev.learn.askFork('logbook'));
  await page.waitForSelector('.ci-fork-input');
  await page.focus('.ci-fork-input');
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.type('octo/repo 1e2');
  await page.keyboard.press('Space');
  await page.keyboard.press('ArrowLeft');
  await page.waitForTimeout(300);
  const typed = await S(() => document.querySelector('.ci-fork-input')?.value ?? null);
  if (typed !== 'octo/repo 1e2 ') logs.push(`[meridiantest] ${label}: the fork form got "${typed}"`);
  if (!(await unmoved())) logs.push(`[meridiantest] ${label}: typing in the fork form reached the overlay`);
  await shot(`${label}-fork-form`);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  if (opened) {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  }
  const left = await S(() => {
    const l = window.__dev.learn.getState();
    return { fork: !!l.forkForm, logbook: l.logbook.open };
  });
  if (left.fork || left.logbook) logs.push(`[meridiantest] ${label}: Esc left ${JSON.stringify(left)}`);
  if (!(await unmoved())) logs.push(`[meridiantest] ${label}: Esc reached the overlay`);
}

/** The Lost Letters hold J back (the Logbook would open under them) and leave the fork form its keys. */
async function lettersLeaveLearnKeys(letters) {
  const before = await letters();
  const unmoved = async () => {
    const s = await letters();
    return s.open && s.index === before.index && s.misses === before.misses;
  };
  await forkFormKeys('letters', false, unmoved);
}

/**
 * Q1.7 Pell, then P1.3 The Lost Letters played with the keyboard: walk up to Pell's desk, press E,
 * file one letter in the wrong cubby (and check Pell's cited reason), try the decoy in Model providers,
 * then file every letter with its number key (N for Pell's tray), and Pell's debrief with H1.4.
 */
async function pellAndLetters() {
  await talk('pell');
  await drive('Pell', quest('Q1.7', 'letters'));
  const compass = await S(() => document.querySelector('.hud-compass-label')?.textContent ?? null);
  if (!compass?.includes('letters')) logs.push(`[meridiantest] compass after Pell: ${compass}`);
  const letters = () => S(() => window.__dev.session().debug.puzzle('P1.3').state());
  const desk = await S(() => window.__dev.session().debug.puzzle('P1.3').desk());
  // From the foot of the portico steps, walk up to the desk.
  await S((d) => window.__dev.bench.teleport(d.x, d.z - 3.2, d.heading, d.heading, 0.12), desk);
  await page.waitForTimeout(600);
  let p = null;
  for (let i = 0; i < 8 && !p?.includes('Pell’s letters'); i++) {
    await S(() => window.__dev.hold(['KeyW'], 350));
    await page.waitForTimeout(300);
    p = await S(() => document.querySelector('.hud-prompt.show')?.textContent ?? null);
  }
  if (!p?.includes('Pell’s letters')) logs.push(`[meridiantest] no letters prompt at the desk (${p})`);
  // The chart label shows the first time you stand at it; any key past it, then E opens the bundle.
  for (let i = 0; i < 12 && !(await letters()).open; i++) {
    await tap('KeyE');
    await page.waitForTimeout(600);
  }
  if (!(await letters()).open) logs.push('[meridiantest] the letters overlay never opened');
  await page.waitForTimeout(1600);
  await shot('letters-open');
  await lettersLeaveLearnKeys(letters);
  const settle = async () => {
    for (let i = 0; i < 80; i++) {
      const s = await letters();
      if (!s.view.busy) return s;
      if ((await learnState()).dialogue) await tap('KeyE');
      await page.waitForTimeout(250);
    }
    logs.push('[meridiantest] the letters overlay stayed busy');
    return letters();
  };
  // The first letter (a second GitHub login) in General: handed back with Pell's cited reason.
  await tap('Digit1');
  await page.waitForTimeout(700);
  let st = await letters();
  if (st.index !== 0 || st.view.message?.tone !== 'bad' || st.view.message?.cite !== 'Settings')
    logs.push(`[meridiantest] a wrong filing wasn't handed back: ${JSON.stringify(st.view.message)}`);
  await shot('letters-wrong');
  await settle();
  // Accounts, Accessibility, Sessions, Model providers; the decoy (Model providers first, then N);
  // Projects, Customize.
  const keys = ['Digit2', 'Digit5', 'Digit3', 'Digit8', 'Digit8', 'KeyN', 'Digit0', 'Digit7'];
  for (const [i, key] of keys.entries()) {
    await tap(key);
    await page.waitForTimeout(500);
    st = await letters();
    if (i === 4) {
      if (!/model picker below the prompt box/.test(st.view.message?.text ?? ''))
        logs.push(`[meridiantest] the decoy in Model providers: ${JSON.stringify(st.view.message)}`);
      await shot('letters-decoy');
    }
    if (i === 5) await shot('letters-tray');
    if (st.solved) break;
    await settle();
  }
  st = await letters();
  if (!st.solved || st.misses !== 2)
    logs.push(`[meridiantest] letters: ${JSON.stringify({ ...st, view: null })}`);
  await drive('Pell debrief', quest('Q1.7', 'done'));
  const quizzes = await S(() => window.__dev.learn.progress.data.quizzes);
  if (!quizzes['H1.4']?.passed) logs.push('[meridiantest] Pell’s H1.4 hotspot wasn’t asked');
  await S((d) => window.__dev.bench.teleport(d.x, d.z - 3.2, d.heading, d.heading, 0.12), desk);
  await page.waitForTimeout(1200);
  await shot('letters-filed');
}

/** Up to Gilda's counter from a step or two out, until its prompt shows; returns the prompt. */
async function toCounter(want) {
  const stand = await S(() => window.__dev.session().debug.puzzle('market').stand());
  await S(
    (d) =>
      window.__dev.bench.teleport(
        d.x - Math.sin(d.heading) * 2.2,
        d.z - Math.cos(d.heading) * 2.2,
        d.heading,
        d.heading,
        0.12,
      ),
    stand,
  );
  await page.waitForTimeout(600);
  let p = null;
  for (let i = 0; i < 8 && !p?.includes(want); i++) {
    await S(() => window.__dev.hold(['KeyW'], 250));
    await page.waitForTimeout(250);
    p = await S(() => document.querySelector('.hud-prompt.show')?.textContent ?? null);
  }
  return p;
}

/**
 * Gilda's counter before Oren's lesson (docs/specs/MODEL-MARKET.md §7): no hello as you come up, the
 * prompt asks about the market, and E has her send you to Oren with the work order shut.
 */
async function marketEarly() {
  const market = () => S(() => window.__dev.session().debug.puzzle('market')?.state() ?? null);
  await S(() => window.__dev.bench.teleport(674.6, -799.5, 0.2, 0.2, 0.14));
  await page.waitForTimeout(700);
  for (let i = 0; i < 6; i++) await S(() => window.__dev.hold(['KeyW'], 300));
  if (await S(() => window.__dev.learn.progress.data.market.greeted))
    logs.push('[meridiantest] market: Gilda said hello before Oren’s lesson');
  const p = await toCounter('Ask Gilda');
  if (!p?.includes('Ask Gilda about the Model Market'))
    logs.push(`[meridiantest] market: early counter prompt "${p}"`);
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(1200);
  const st = await market();
  const said = await learnState();
  if (st?.open || st?.taught)
    logs.push(`[meridiantest] market: opened before the lesson ${JSON.stringify(st)}`);
  if (!said.subtitle.includes('Oren')) logs.push(`[meridiantest] market: early caption "${said.subtitle}"`);
  await shot('market-early');
  await drive('Gilda early', (x) => !x.dialogue, 20000);
  if (said.quests['Q1.A']) logs.push(`[meridiantest] market: Q1.A ${said.quests['Q1.A']} before the lesson`);
}

/**
 * Oren's practice at the Model Market (docs/specs/MODEL-MARKET.md §5, §7), with real key presses and an
 * empty purse: walk across the plaza (Gilda calls out), E at the counter (she stakes the starfish), then
 * 1 (tour) 1 (Auto) E → right-sized; 2 (explain) 4 (Powerful) → (High) E → overspent; 2 4 E (Powerful on
 * Default) → right-sized; 3 (bug) 2 (Lightweight) → → (High) E → fell short, R (Retry with a different
 * model: nothing picked, Lightweight's own model left out) 2 4 (Powerful) E → right-sized, and the practice
 * is done (Q1.6 practiced); with more starfish, 4 (files) 3 (Versatile) E → fell short, E (Retry with
 * more effort) → (High) E → right-sized; 3 (bug) 1 (Auto) E → right-sized with a Retry offered, R → the
 * Retry's notice. The fork form's typing mustn't reach it. Then Meridian is freed and streamed in again:
 * the jobs, the purse and the quest come back from the save.
 */
async function marketRun() {
  const M = (f, a) => S(f, a);
  const market = () => M(() => window.__dev.session().debug.puzzle('market')?.state() ?? null);
  // Broke on the story's path: Gilda stakes you for Oren's practice.
  await M(() => {
    const l = window.__dev.learn;
    const n = l.getState().starfishPurse;
    if (n) l.spendStarfish(n);
  });
  // From the fountain side of the plaza, walk toward the stall (north), until Gilda says hello.
  await M(() => window.__dev.bench.teleport(674.6, -799.5, 0.2, 0.2, 0.14));
  await page.waitForTimeout(700);
  for (let i = 0; i < 10 && !(await M(() => window.__dev.learn.progress.data.market.greeted)); i++)
    await M(() => window.__dev.hold(['KeyW'], 300));
  const greeted = await learnState();
  if (greeted.quests['Q1.A'] !== 'start')
    logs.push(`[meridiantest] market: no hello (Q1.A ${greeted.quests['Q1.A']})`);
  if (!greeted.subtitle.includes('Model Market'))
    logs.push(`[meridiantest] market: hello caption "${greeted.subtitle}"`);
  await shot('market-hello');
  await drive('Gilda hello', (st) => !st.dialogue, 20000);
  // Up to the counter: the prompt, then E (any first key also clears the chart label).
  const p = await toCounter('Model Market');
  if (!p?.includes('Hire a model')) logs.push(`[meridiantest] market: no counter prompt (${p})`);
  await shot('market-counter');
  for (let i = 0; i < 10 && !(await market())?.open; i++) {
    await page.keyboard.press('KeyE');
    await page.waitForTimeout(500);
  }
  if (!(await market())?.open) {
    logs.push('[meridiantest] market: the work order never opened');
    return;
  }
  await page.waitForTimeout(1200);
  const opened = await market();
  if (opened.view.screen !== 'board') logs.push(`[meridiantest] market: opened on ${opened.view.screen}`);
  if (opened.purse !== 4 || !/staked you 4 starfish/.test(opened.view.notice ?? ''))
    logs.push(`[meridiantest] market: no stake (${opened.purse}, "${opened.view.notice}")`);
  if (JSON.stringify(opened.view.practice) !== '{"quick":false,"retry":false}')
    logs.push(`[meridiantest] market: practice ${JSON.stringify(opened.view.practice)}`);
  const checklist = await M(() => document.querySelector('.ci-mm-practice')?.textContent ?? '');
  if (!checklist.includes('Retry')) logs.push(`[meridiantest] market: practice checklist "${checklist}"`);
  await shot('market-board');
  const press = async (...codes) => {
    for (const c of codes) {
      await page.keyboard.press(c);
      await page.waitForTimeout(220);
    }
    await page.waitForTimeout(350);
    return market();
  };
  const expectOutcome = (st, want, label) => {
    const got = st.view.result?.feedback.outcome;
    if (got !== want) logs.push(`[meridiantest] market ${label}: ${got} (wanted ${want})`);
  };
  // The fork form over the work order: its typing (and J) stay out of the market.
  {
    const before = JSON.stringify((await market()).view.screen);
    await forkFormKeys('market', false, async () => {
      const st = await market();
      return st.open && JSON.stringify(st.view.screen) === before && st.view.job === null;
    });
  }
  // 1 · The tour with Auto: right-sized at the fair price; the stake keeps the purse at 4.
  let st = await press('Digit1');
  if (st.view.screen !== 'hire' || st.view.job !== 'tour')
    logs.push(`[meridiantest] market: 1 → ${st.view.screen} ${st.view.job}`);
  await shot('market-hire');
  st = await press('Digit1', 'KeyE');
  expectOutcome(st, 'right', 'tour + Auto');
  const live = await M(() => document.querySelector('.ci-mm-live')?.textContent ?? '');
  if (!live.startsWith('Right-sized')) logs.push(`[meridiantest] market: live region "${live}"`);
  await page.waitForTimeout(600);
  await shot('market-right');
  if (st.purse !== 4) logs.push(`[meridiantest] market: purse ${st.purse} after Auto (staked to 4)`);
  if (!st.view.practice?.quick) logs.push(`[meridiantest] market: quick look not ticked`);
  // 2 · Explain filterBooks with Powerful on High: overspent (High effort for a quick look).
  st = await press('KeyE');
  if (st.view.screen !== 'board') logs.push(`[meridiantest] market: Got it → ${st.view.screen}`);
  st = await press('Digit2', 'Digit4', 'ArrowRight');
  if (st.view.draft.category !== 'Powerful' || st.view.draft.effort !== 'high')
    logs.push(`[meridiantest] market: draft ${JSON.stringify(st.view.draft)}`);
  st = await press('KeyE');
  expectOutcome(st, 'over', 'explain + Powerful High');
  if (st.view.result?.feedback.reason !== 'quick-over-effort')
    logs.push(`[meridiantest] market: overspent for ${st.view.result?.feedback.reason}`);
  await page.waitForTimeout(600);
  await shot('market-over');
  // 2 · Again with Powerful on Default: your model on its default effort is right-sized.
  st = await press('KeyE', 'Digit2', 'Digit4', 'KeyE');
  expectOutcome(st, 'right', 'explain + Powerful Default');
  if (st.view.result?.feedback.key !== 'keep')
    logs.push(`[meridiantest] market: Powerful Default said ${st.view.result?.feedback.key}`);
  await page.waitForTimeout(600);
  await shot('market-keep');
  // 3 · The bug with Lightweight on High: fell short; R retries with a different model, which you
  // choose: the work order opens with nothing picked, and Lightweight's other models only.
  st = await press('KeyE', 'Digit3', 'Digit2', 'ArrowRight', 'ArrowRight', 'KeyE');
  expectOutcome(st, 'short', 'bug + Lightweight High');
  await page.waitForTimeout(600);
  await shot('market-short');
  const shortModel = st.view.result?.hire.model;
  st = await press('KeyR');
  if (st.view.retry?.live !== 'model' || st.view.draft.pending !== 'model' || st.view.draft.effort !== 'high')
    logs.push(
      `[meridiantest] market: Retry → ${JSON.stringify({ retry: st.view.retry, draft: st.view.draft })}`,
    );
  // The live picker has the focus (the first pick it takes), and nothing's been paid.
  const focus = await M(() => document.activeElement?.getAttribute('data-pick') ?? null);
  if (focus !== 'auto') logs.push(`[meridiantest] market: Retry's focus on ${focus}`);
  await shot('market-retry');
  st = await press('Digit2');
  if (st.view.draft.pending || st.view.draft.model === shortModel)
    logs.push(`[meridiantest] market: Retry picked ${st.view.draft.model} (fell short: ${shortModel})`);
  st = await press('Digit4', 'KeyE');
  expectOutcome(st, 'right', 'bug Retry + Powerful High');
  // Oren's practice is done: Q1.6 moves on, Gilda says so, and the checklist's gone.
  const q16 = await M(() => window.__dev.learn.progress.data.quests['Q1.6']);
  if (q16 !== 'practiced') logs.push(`[meridiantest] market: Q1.6 ${q16} after the practice`);
  if (!st.view.says?.includes('Oren')) logs.push(`[meridiantest] market: practiced line "${st.view.says}"`);
  if (st.practice) logs.push('[meridiantest] market: the practice still runs');
  await page.waitForTimeout(600);
  await shot('market-retry-right');
  // More starfish, as if found on the way: the rest of the board (Gilda's optional task).
  await M(() => window.__dev.learn.refundStarfish(16));
  // 4 · Many files with Versatile on Default: fell short; E retries with more effort (the same model,
  // the dial live with nothing chosen and Default marked as last time's), → picks High.
  st = await press('KeyE', 'Digit4', 'Digit3', 'KeyE');
  expectOutcome(st, 'short', 'files + Versatile Default');
  const versatile = st.view.result?.hire.model;
  st = await press('KeyE');
  if (st.view.draft.pending !== 'effort' || st.view.draft.model !== versatile)
    logs.push(`[meridiantest] market: Retry (effort) → ${JSON.stringify(st.view.draft)}`);
  await shot('market-retry-effort');
  st = await press('ArrowRight');
  if (st.view.draft.pending || st.view.draft.effort !== 'high')
    logs.push(`[meridiantest] market: Retry (effort) → ${JSON.stringify(st.view.draft)} after →`);
  st = await press('KeyE');
  expectOutcome(st, 'right', 'files Retry + Versatile High');
  // 3 · The bug with Auto: right-sized (Auto chooses a model), with a Retry offered to compare.
  st = await press('KeyE', 'Digit3', 'Digit1', 'KeyE');
  expectOutcome(st, 'right', 'bug + Auto');
  if (st.view.result?.feedback.retry !== 'again')
    logs.push(`[meridiantest] market: Auto on a hard job offers ${st.view.result?.feedback.retry}`);
  const retryButton = await M(() => !!document.querySelector('.ci-mm-actions [data-retry="model"]'));
  if (!retryButton) logs.push('[meridiantest] market: no Retry button after Auto on a hard job');
  await page.waitForTimeout(600);
  await shot('market-hard-auto');
  st = await press('KeyR');
  if (st.view.retry?.live !== 'model' || st.view.draft.auto)
    logs.push(`[meridiantest] market: Retry after Auto → ${JSON.stringify(st.view.draft)}`);
  st = await press('Escape');
  const doneBefore = st.done.slice().sort();
  const purseBefore = st.purse;
  if (JSON.stringify(doneBefore) !== JSON.stringify(['bug', 'explain', 'files', 'tour']))
    logs.push(`[meridiantest] market: done ${doneBefore}`);
  const qa = await M(() => window.__dev.learn.progress.data.quests['Q1.A']);
  if (qa !== 'done') logs.push(`[meridiantest] market: Q1.A ${qa} with the board cleared`);
  // Esc on the board steps away.
  st = await press('Escape');
  if (st.open) logs.push('[meridiantest] market: Esc twice left it open');
  await page.waitForTimeout(500);
  const walk = await M(() => window.__dev.state());
  if (walk.mode !== 'walk') logs.push(`[meridiantest] market: mode ${walk.mode} after closing`);
  const page1 = await M(() => window.__dev.learn.getState().pages.includes('pg1.market'));
  if (!page1) logs.push('[meridiantest] market: no Logbook page pg1.market');
  // Freed and streamed in again: the market's state comes from the save.
  await M(() => window.__dev.session().debug.unloadIsland('meridian'));
  await page.waitForFunction(() => !window.__dev.session().debug.puzzle('market'), null, { timeout: 30000 });
  await M(() => window.__dev.session().debug.loadIsland('meridian'));
  await page
    .waitForFunction(() => !!window.__dev.session().debug.puzzle('market'), null, { timeout: 90000 })
    .catch(() => logs.push('[meridiantest] market: no market after Meridian streamed in again'));
  await page.waitForTimeout(2500);
  const back = await market();
  if (
    back &&
    (JSON.stringify(back.done.slice().sort()) !== JSON.stringify(doneBefore) || back.purse !== purseBefore)
  )
    logs.push(
      `[meridiantest] market after reload: ${JSON.stringify({ done: back.done, purse: back.purse })}`,
    );
  // The stall's own shot (the notes on the cork board show which jobs are done).
  await M(() => window.__dev.session().camera.cut(window.__dev.session().debug.puzzle('market').shot()));
  await page.waitForTimeout(1500);
  await shot('market-reloaded');
  await M(() => window.__dev.session().camera.frame(null));
  // The game has its keys back: a talk prompt by Tobias's table.
  const t = await M(() =>
    window.__dev
      .session()
      .debug.cast()
      .find((n) => n.id === 'tobias'),
  );
  await M(
    (t) =>
      window.__dev.bench.teleport(
        t.x + Math.sin(t.h) * 2,
        t.z + Math.cos(t.h) * 2,
        t.h + Math.PI,
        t.h + Math.PI,
        0.15,
      ),
    t,
  );
  await page.waitForTimeout(700);
  const after = await M(() => ({
    prompt: document.querySelector('.hud-prompt.show')?.textContent ?? null,
    state: window.__dev.state(),
    busy: window.__dev.learn.busy,
  }));
  if (!after.prompt?.includes('Tobias'))
    logs.push(`[meridiantest] market: no prompt after the market ${JSON.stringify(after)}`);
}

/** Q1.6: Oren's talk, his practice at the market, then his debrief (and the Retry check). */
async function orenAndMarket() {
  await talk('oren');
  await drive('Oren', quest('Q1.6', 'market'));
  await checkOrenSetup();
  const compass = await S(() => document.querySelector('.hud-compass-label')?.textContent ?? null);
  if (!compass?.includes('Model Market')) logs.push(`[meridiantest] compass after Oren: ${compass}`);
  await marketRun();
  await talk('oren');
  await drive('Oren debrief', quest('Q1.6', 'done'));
  const quizzes = await S(() => window.__dev.learn.progress.data.quizzes);
  if (!quizzes['R1.1']?.passed) logs.push('[meridiantest] Oren’s R1.1 (Retry) wasn’t asked');
}

if (opt.from === 'market') {
  await S(() => {
    for (const id of ['Q1.1', 'Q1.2', 'Q1.3', 'Q1.4', 'Q1.5']) window.__dev.session().debug.quest(id, 'done');
    window.__dev.session().debug.quest('Q1.6', 'market');
  });
  await marketRun();
  await browser.close();
  console.log(JSON.stringify({ url, shots: shots.length, logs: logs.slice(0, 30) }, null, 1));
  process.exit(0);
}

// --from=admiral skips to the exam with Chapter 01's other steps marked done; --from=oren to Oren;
// --from=pell to Pell and his letters.
if (opt.from === 'admiral') {
  await S(() => {
    for (const id of ['Q1.1', 'Q1.2', 'Q1.3', 'Q1.4', 'Q1.5', 'Q1.6', 'Q1.7'])
      window.__dev.session().debug.quest(id, 'done');
  });
} else if (opt.from === 'oren') {
  await S(() => {
    for (const id of ['Q1.1', 'Q1.2', 'Q1.3', 'Q1.4', 'Q1.5']) window.__dev.session().debug.quest(id, 'done');
    window.__dev.session().debug.quest('Q1.6', 'start');
  });
  await orenAndMarket();
  await pellAndLetters();
  await checkPellSetup();
} else if (opt.from === 'pell') {
  await S(() => {
    for (const id of ['Q1.1', 'Q1.2', 'Q1.3', 'Q1.4', 'Q1.5', 'Q1.6'])
      window.__dev.session().debug.quest(id, 'done');
    window.__dev.session().debug.quest('Q1.7', 'start');
  });
  await pellAndLetters();
  await checkPellSetup();
} else {
  // Gilda's counter first, at the top of the stair street from the quay: before Oren's lesson she
  // sends you to him.
  await marketEarly();
  // Q1.1 Tobias → Q1.2 Mina's tour (a shot at each landmark) → Q1.3 Lyra.
  await talk('tobias');
  await drive('Tobias', quest('Q1.1', 'done'));
  await talk('mina');
  let tourShots = 0;
  let lastTour = 0;
  await drive('Mina', quest('Q1.2', 'done'), 180000, async () => {
    if (tourShots < 6 && Date.now() - lastTour > 2600) {
      lastTour = Date.now();
      await shot(`tour-${tourShots++}`);
    }
  });
  await talk('lyra_meridian');
  await drive('Lyra', quest('Q1.3', 'done'));

  // Q1.4 Anders and the Crate Yard.
  await talk('anders');
  await drive('Anders', quest('Q1.4', 'crates'));
  const yard = await S(() => window.__dev.session().debug.puzzle('P1.1').spots());
  await S((y) => window.__dev.session().debug.teleport(y.lever.x + 1.5, y.lever.z + 1.5, Math.PI), yard);
  await page.waitForTimeout(1200);
  await shot('crate-yard');
  // The trick crate (a read-only tour) refused at the tavern, with the course's reason; then Z.
  const yardCrates = await S(() => window.__dev.session().debug.puzzle('P1.1').state());
  await S(() => window.__dev.session().debug.puzzle('P1.1').push(2, 2, 'w'));
  await page.waitForTimeout(500);
  const toast = await S(() => document.querySelector('.hud-toast.show')?.textContent ?? '');
  if (!toast.includes('No files change, but it needs your repository'))
    logs.push(`[meridiantest] trick crate refusal: "${toast}"`);
  await shot('crate-yard-trick');
  await S(() => window.__dev.session().debug.puzzle('P1.1').push(2, 2, 'e'));
  await page.waitForTimeout(500);
  await S(() => window.__dev.session().debug.puzzle('P1.1').undo());
  await page.waitForTimeout(500);
  const undone = await S(() => window.__dev.session().debug.puzzle('P1.1').state());
  if (JSON.stringify(undone.at) !== JSON.stringify(yardCrates.at))
    logs.push(`[meridiantest] crate undo: ${JSON.stringify(undone.at)} vs ${JSON.stringify(yardCrates.at)}`);
  await S(() => window.__dev.session().debug.puzzle('P1.1').solve());
  await drive('crates solved', quest('Q1.4', 'done'));
  await shot('crate-yard-solved');

  // Q1.5 Rhea and the Three Helms, sailed for real.
  await talk('rhea');
  await drive('Rhea', quest('Q1.5', 'helms'));
  await S(() => window.__dev.session().debug.board());
  await page.waitForTimeout(1800);
  const aboard = await S(() => ({
    rhea: window.__dev.session().debug.rheaAboard?.() ?? null,
    compass: document.querySelector('.hud-compass-label')?.textContent ?? null,
  }));
  if (!aboard.compass?.includes('Blue Marks')) logs.push(`[meridiantest] compass at sea: ${aboard.compass}`);
  await S(() => window.__dev.session().debug.sailTo(686, -600, 0));
  await page.waitForTimeout(1500);
  const helmState = () => S(() => window.__dev.session().debug.puzzle('P1.2').state());
  const prompt = () => S(() => document.querySelector('.hud-prompt.show')?.textContent ?? null);
  const term = () => S(() => document.querySelector('.hud-term.show')?.textContent ?? null);
  const card = () =>
    S(() => ({
      title: document.querySelector('.ci-sc h2')?.textContent ?? null,
      message: document.querySelector('.ci-sc-message')?.textContent ?? '',
    }));
  const pick = (id) => page.click(`.ci-sc button[data-choice="${id}"]`);
  let p = await prompt();
  if (!p?.includes('Hear Rhea’s order')) logs.push(`[meridiantest] no helm prompt (${p})`);
  await shot('helm-interactive-prompt');
  // One wrong pick per order (its reason shows on the card), \`auto\` (Autopilot) on the reef passage
  // stops short, \`steer\` (Interactive) gets a heading at each mark, and the \`review\` (Plan) chart is
  // accepted too soon, amended, then accepted.
  const wrongFirst = { steer: 'review', review: 'auto', auto: 'steer' };
  const wrongTried = new Set();
  let approvedDraft = false;
  const phasesSeen = new Set();
  const t0 = Date.now();
  while (Date.now() - t0 < 300000) {
    const h = await helmState();
    if (h.solved) break;
    const s = await learnState();
    const key = h.run
      ? `${h.run.mode}-${h.run.phase}-${h.run.leg}${h.run.revised ? '-revised' : ''}`
      : `free-${h.done.length}`;
    if (!phasesSeen.has(key)) {
      phasesSeen.add(key);
      await page.waitForTimeout(h.run?.phase === 'review' || h.run?.phase === 'order' ? 1600 : 400);
      await shot(`helm-${key}`);
    }
    if (s.dialogue) await tap('KeyE');
    else if (!h.run) {
      // Between helms: bring her up to the next buoy (the crew does it on Wingman's third hint).
      const next = ['steer', 'review', 'auto'][h.done.length];
      p = await prompt();
      if (p?.includes('Hear Rhea’s order')) await tap('KeyE');
      else if (next) {
        logs.push(`[meridiantest] after ${h.done.join(',')}: not in reach of the ${next} buoy (${p})`);
        break;
      }
    } else if (h.choice && !h.choice.busy && h.run.phase === 'order') {
      if (!seen.has('helm-fork-form')) {
        // At sea J opens the Logbook over the card; a digit there or in the fork form isn't a pick,
        // and a digit selects the card again once both overlays close.
        seen.add('helm-fork-form');
        const tried = h.run.tried.length;
        await forkFormKeys('helm', true, async () => {
          const n = await helmState();
          return n.run?.phase === 'order' && n.run.tried.length === tried;
        });
        const wrongIndex = h.choice.options.findIndex((option) => option === wrongFirst[h.run.mode]);
        if (wrongIndex < 0) logs.push(`[meridiantest] ${h.run.mode}: no keyboard option for the wrong helm`);
        else {
          await page.keyboard.press(`Digit${wrongIndex + 1}`);
          let after = await helmState();
          const deadline = Date.now() + 5000;
          while (after.run?.tried.length !== tried + 1 && Date.now() < deadline) {
            await page.waitForTimeout(100);
            after = await helmState();
          }
          if (after.run?.tried.length !== tried + 1)
            logs.push(
              `[meridiantest] ${h.run.mode}: choice card did not accept a digit after the Logbook closed`,
            );
          else wrongTried.add(h.run.mode);
        }
        continue;
      }
      if (!wrongTried.has(h.run.mode)) {
        wrongTried.add(h.run.mode);
        await pick(wrongFirst[h.run.mode]);
      } else {
        const c = await card();
        if (h.run.tried.length && !c.message)
          logs.push(`[meridiantest] ${h.run.mode}: no reason for the wrong helm`);
        if (h.run.mode === 'review' && !c.message.includes('Chart it first'))
          logs.push(`[meridiantest] reef passage under Autopilot: "${c.message}"`);
        await shot(`helm-${h.run.mode}-wrong`);
        await pick(h.run.mode);
      }
    } else if (h.choice && !h.choice.busy && h.run.phase === 'choose')
      await pick(h.choice.options[h.run.leg % 2]);
    else if (h.choice && !h.choice.busy && h.run.phase === 'review') {
      const t = (await term()) ?? '';
      if (!t.includes('Review plan')) logs.push('[meridiantest] Plan review terminal has no review line');
      if (!h.run.revised && !approvedDraft) {
        approvedDraft = true;
        if (!t.includes('Shoal')) logs.push('[meridiantest] the plan doesn’t name the Shoal');
        await pick('accept');
      } else if (!h.run.revised) {
        await shot('helm-plan-approved-too-soon');
        await pick('amend');
      } else await pick('accept');
    }
    await page.waitForTimeout(400);
  }
  const helms = await helmState();
  if (!helms.solved) logs.push(`[meridiantest] helms not solved: ${JSON.stringify(helms)}`);
  await drive('helms done', (s) => s.mode === 'walk' && !s.dialogue, 30000);
  await shot('helms-home');
  await talk('rhea');
  await drive('Rhea debrief', quest('Q1.5', 'done'));

  // Q1.6 the lift up the bluff, then Oren.
  const lift = await S(() => {
    const s = window.__dev.session();
    const a = s.debug.liftSpots?.();
    if (a) s.debug.teleport(a.bottom.x, a.bottom.z, a.bottom.h);
    return a;
  });
  if (!lift) logs.push('[meridiantest] no lift spots');
  await page.waitForTimeout(900);
  p = await prompt();
  if (!p?.includes('Ride the lift up')) logs.push(`[meridiantest] no lift prompt (${p})`);
  await tap('KeyE');
  await page.waitForTimeout(5500);
  await shot('lift-ride');
  await page.waitForFunction(() => window.__dev.state().mode === 'walk', null, { timeout: 20000 });
  await page.waitForTimeout(800);
  const top = await S(() => window.__dev.state());
  if (top.y < 38) logs.push(`[meridiantest] lift didn't reach the bluff (y ${top.y.toFixed(1)})`);
  await shot('lift-top');
  await orenAndMarket();

  // Q1.7 Pell and the Lost Letters (and prompt history) → Q1.8 the Admiral's Exam and the lighthouse.
  await pellAndLetters();
  await checkPellSetup();
}
await talk('admiral');
let lit = false;
await drive('Admiral', quest('Q1.8', 'done'), 240000, async () => {
  const on = await S(() => window.__dev.session().debug.lighthouseLit?.() ?? false);
  if (on && !lit) {
    lit = true;
    await page.waitForTimeout(1500);
    await shot('lighthouse-lit');
  }
});
if (!lit) logs.push('[meridiantest] the lighthouse never lit');
const final = await learnState();
for (const id of ['Q1.1', 'Q1.2', 'Q1.3', 'Q1.4', 'Q1.5', 'Q1.6', 'Q1.7', 'Q1.8'])
  if (final.quests[id] !== 'done') logs.push(`[meridiantest] ${id} is ${final.quests[id]}`);
await shot('done');

await browser.close();
console.log(
  JSON.stringify(
    {
      url,
      final: { quests: final.quests, pages: final.pages, doubloons: final.doubloons },
      shots: shots.length,
      logs: logs.slice(0, 30),
    },
    null,
    1,
  ),
);
