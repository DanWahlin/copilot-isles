#!/usr/bin/env node
// End-to-end Chapter 01 run at Port Meridian, in the course's order: Tobias, Mina's tour, Lyra, Anders
// and the Crate Yard (P1.1, solved by its hook), Rhea and the Three Helms (P1.2, sailed for real: each
// buoy's helm, Interactive's marks, Plan's approval, Autopilot home to the berth), the lift up the
// bluff to Oren, Pell, and the Admiral's Exam that lights the lighthouse. Screenshots at each beat.
// Oren asks which model the player kept and which computer they're on (Your setup): `--setup=skip`
// skips both forms; by default the run enters them and checks the shortcut, quiz and Logbook use them.
// node tools/meridiantest.mjs [--base=http://localhost:5301] [--webgl] [--out=/tmp/shots/meridian]
//                             [--from=admiral|oren] [--setup=enter|skip]
import { collectLogs, launchChrome, parseFlags } from './lib/browser.mjs';
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
async function drive(label, done, ms = 150000, every = null) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const s = await learnState();
    if (done(s)) return s;
    if (every) await every(s);
    if (s.subtitle) subtitles.add(s.subtitle);
    if (s.subtitle.includes('prompt box: press') && !seen.has('subtitle-shortcut')) {
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

/** Oren's model and computer questions (Your setup), then where the answers show. */
async function checkOrenSetup() {
  const setup = await S(() => window.__dev.learn.getState().setup);
  const detected = await S(() => window.__dev.learn.getState().osDetected);
  const os = setup.os ?? detected;
  const keys = os === 'mac' ? 'Cmd+R' : 'Ctrl+R';
  const other = os === 'mac' ? 'Ctrl+R' : 'Cmd+R';
  const line = [...subtitles].find((t) => t.includes('prompt box: press'));
  if (!line?.includes(keys) || line.includes(other))
    logs.push(`[meridiantest] Oren's shortcut line should say ${keys}: ${JSON.stringify(line)}`);
  if (plan.os !== 'skip' && setup.os !== plan.os) logs.push(`[meridiantest] computer not saved: ${setup.os}`);
  if (plan.os === 'skip' && setup.os !== null) logs.push(`[meridiantest] a skipped computer was saved`);
  const prompts = await logbookPage(page, 'pg1.prompts', shot);
  if (!prompts.includes(keys) || prompts.includes(`Press ${other}`))
    logs.push(`[meridiantest] pg1.prompts doesn't use ${keys}`);
  const quizzes = await S(() => window.__dev.learn.progress.data.quizzes);
  if (!quizzes['N1.5']?.passed) logs.push('[meridiantest] the prompt history quiz N1.5 wasn’t asked');
  const tryPage = await logbookPage(page, 'pg1.try-controls', shot);
  if (plan.model === 'skip') {
    if (setup.model !== null) logs.push('[meridiantest] a skipped model was saved');
    if (quizzes['N1.3'] || quizzes['N1.4']) logs.push('[meridiantest] a model quiz was asked after Skip');
    if (tryPage.includes('Your model')) logs.push('[meridiantest] pg1.try-controls notes a skipped model');
  } else {
    const quiz = plan.model.pick === 'auto' ? 'N1.3' : 'N1.4';
    if (!quizzes[quiz]?.passed) logs.push(`[meridiantest] the model quiz ${quiz} wasn’t asked`);
    if (plan.model.name && !tryPage.includes(plan.model.name))
      logs.push(`[meridiantest] pg1.try-controls doesn't note ${plan.model.name}`);
  }
  // The Logbook's Your setup card, where each can be changed.
  await S(() => window.__dev.learn.openLogbook('quests'));
  await page.waitForTimeout(500);
  await shot('logbook-your-setup');
  await S(() => window.__dev.learn.closeLogbook());
  await page.waitForTimeout(200);
}

// --from=admiral skips to the exam with Chapter 01's other steps marked done; --from=oren to Oren.
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
  await talk('oren');
  await drive('Oren', quest('Q1.6', 'done'));
  await checkOrenSetup();
  await talk('pell');
  await drive('Pell', quest('Q1.7', 'done'));
} else {
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
  if (!aboard.compass?.includes('Interactive')) logs.push(`[meridiantest] compass at sea: ${aboard.compass}`);
  await S(() => window.__dev.session().debug.sailTo(686, -600, 0));
  await page.waitForTimeout(1500);
  const helmState = () => S(() => window.__dev.session().debug.puzzle('P1.2').state());
  const prompt = () => S(() => document.querySelector('.hud-prompt.show')?.textContent ?? null);
  const term = () => S(() => document.querySelector('.hud-term.show')?.textContent ?? null);
  let p = await prompt();
  if (!p?.includes('Take the Interactive helm')) logs.push(`[meridiantest] no helm prompt (${p})`);
  await shot('helm-interactive-prompt');
  const phasesSeen = new Set();
  const t0 = Date.now();
  while (Date.now() - t0 < 300000) {
    const h = await helmState();
    if (h.solved) break;
    const s = await learnState();
    const key = h.run ? `${h.run.mode}-${h.run.phase}-${h.run.leg}` : `free-${h.done.length}`;
    if (!phasesSeen.has(key)) {
      phasesSeen.add(key);
      await page.waitForTimeout(h.run?.phase === 'review' ? 1600 : 400);
      await shot(`helm-${key}`);
    }
    if (s.dialogue) await tap('KeyE');
    else if (!h.run) {
      // Between helms: bring her up to the next buoy (the crew does it on Wingman's third hint).
      const next = ['interactive', 'plan', 'autopilot'][h.done.length];
      p = await prompt();
      if (p?.includes('Take the')) await tap('KeyE');
      else if (next) {
        logs.push(`[meridiantest] after ${h.done.join(',')}: not in reach of the ${next} buoy (${p})`);
        break;
      }
    } else if (h.run.phase === 'hold' || h.run.phase === 'review') {
      if (h.run.phase === 'review' && !(await term())?.includes('approve'))
        logs.push('[meridiantest] Plan review terminal has no approval line');
      await tap('KeyE');
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
  await talk('oren');
  await drive('Oren', quest('Q1.6', 'done'));
  await checkOrenSetup();

  // Q1.7 Pell → Q1.8 the Admiral's Exam and the lighthouse.
  await talk('pell');
  await drive('Pell', quest('Q1.7', 'done'));
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
