// Modal cards against the HUD: each card opened in turn (the battle's briefing, quizzes, app cards, a
// page reveal, the Seal card and the certificate, setup and fork forms, the course board, the
// reflection, the Continue card, a recap, the Logbook, the Model Market when its island is in) must
// not intersect any visible HUD panel, and must fit the screen; and in a sea battle the battle's own
// panels (the hull bar and wave banner, the voiced line, the Skip buttons, the gun rows, the helm
// hint, the bosun's question) must not overlap each other. At desktop 1280×720 and 1920×1080, touch 390×844, and with
// reduced motion.
//
//   node tools/cardtest.mjs --base=http://127.0.0.1:5301 [--views=desktop-1280,touch-390,…]
//     [--no-battle] [--shots=<dir>] [--tier=low]
//
// Exits 1 on an overlap, a card off the screen, or a console error.
import { mkdirSync } from 'node:fs';
import { collectLogs, launchChrome, parseFlags, waitForTitle } from './lib/browser.mjs';
import { passLearningPauses } from './lib/learning-cards.mjs';

const opt = parseFlags();
const base = opt.base || 'http://127.0.0.1:5301';
const tier = opt.tier || 'low';
const shots = opt.shots || null;
if (shots) mkdirSync(shots, { recursive: true });

const VIEWS = [
  { name: 'desktop-1280', viewport: { width: 1280, height: 720 } },
  { name: 'desktop-1920', viewport: { width: 1920, height: 1080 } },
  { name: 'touch-390', viewport: { width: 390, height: 844 }, touch: true },
  { name: 'reduced-1280', viewport: { width: 1280, height: 720 }, reduced: true },
].filter((v) => !opt.views || String(opt.views).split(',').includes(v.name));

/** The island HUD's panels and the battle's own: none may sit under a card. */
const HUD = [
  '.ci-tracker',
  '.ci-purse',
  '.hud-compass',
  '.hud-sail',
  '.hud-help',
  '.hud-prompt',
  '.hud-toast',
  '.hud-subtitle',
  '.bh-top',
  '.bh-guns',
  '.bh-skip',
  '.bh-skip-event',
  '.bh-captions',
  '.bh-hint',
  '.hud-chart',
];
/** The battle's panels during a fight: none may overlap another. */
const BATTLE_PANELS = [
  '.bh-card.show:not(.banner)',
  '.bh-top',
  '.bh-guns',
  '.bh-skip',
  '.bh-captions',
  '.bh-hint',
  '.hud-subtitle',
  '.ci-purse',
];

/** Chapter 00's quests, done before the battle (it's on the Seal of Anchorage's passage). */
const CH0 = ['Q0.2', 'Q0.3', 'Q0.4', 'Q0.5', 'Q0.6', 'Q0.7', 'Q0.8', 'Q0.9', 'Q0.10', 'Q0.11'];

/** Each card: how to open it and close it (the learn store, `window.__flow.learn`). */
const CARDS = [
  ['quiz', (l) => void l.ask('H0.1'), (l) => l.closeQuiz()],
  ['page reveal', (l) => void l.grantPage('pg.install'), (l) => l.closeReveal()],
  [
    'seal banner',
    (l) => void l.showBanner('Seal of Anchorage', 'The Seal is yours.'),
    (l) => l.closeBanner(),
  ],
  ['course board', (l) => l.openCourseBoard('00-setup'), (l) => l.closeCourseBoard()],
  ['fork form', (l) => void l.askFork('logbook'), (l) => l.skipFork()],
  ['setup form', (l) => void l.askSetup('os', 'logbook'), (l) => l.skipSetup()],
  ['app card', (l) => void l.askAppTask('A0.1', 'logbook'), (l) => l.appTaskLater()],
  ['reflection', (l) => void l.askReflection('00-setup'), (l) => l.chooseReflection(null)],
  ['seal card', (l) => l.openBadge('seal', 'Seal of Anchorage'), (l) => l.closeBadge()],
  ['certificate', (l) => l.openBadge('course'), (l) => l.closeBadge()],
  ['continue card', (l) => void l.showResume(l.resumeSummary()), (l) => l.closeResume()],
  ['recap', (l) => void l.runRecap(['H0.1']), (l) => l.closeQuiz()],
  ['logbook', (l) => l.openLogbook(), (l) => l.closeLogbook()],
];

const fails = [];
const logs = [];
const browser = await launchChrome({ autoplay: true });

/** Every visible element's box for `selectors` (the element, its parents and its opacity shown). */
const boxes = (page, selectors) =>
  page.evaluate((sel) => {
    const out = [];
    for (const s of sel)
      for (const el of document.querySelectorAll(s)) {
        let op = 1;
        let shown = true;
        for (let e = el; e && e !== document.documentElement; e = e.parentElement) {
          const cs = getComputedStyle(e);
          if (cs.display === 'none' || cs.visibility === 'hidden') shown = false;
          op *= Number(cs.opacity);
        }
        const r = el.getBoundingClientRect();
        if (!shown || op < 0.05 || r.width < 2 || r.height < 2) continue;
        out.push({ sel: s, x: r.left, y: r.top, w: r.width, h: r.height });
      }
    return out;
  }, selectors);

const overlap = (a, b) =>
  Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) *
  Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));

/** The open card (a modal dialog) against the HUD and the screen's edges. */
async function checkCard(page, view, name, cardSel = '[aria-modal="true"]') {
  await page.waitForTimeout(view.reduced ? 400 : 900);
  const cards = await boxes(page, [cardSel]);
  if (cards.length === 0) {
    fails.push(`${view.name}: ${name}: no card opened`);
    return;
  }
  const card = cards[cards.length - 1];
  const vp = view.viewport;
  if (card.x < -1 || card.y < -1 || card.x + card.w > vp.width + 1 || card.y + card.h > vp.height + 1)
    fails.push(
      `${view.name}: ${name}: off the screen (${Math.round(card.x)},${Math.round(card.y)} ${Math.round(card.w)}×${Math.round(card.h)})`,
    );
  for (const h of await boxes(page, HUD))
    if (overlap(card, h) > 4) fails.push(`${view.name}: ${name}: overlaps ${h.sel}`);
  if (shots)
    await page.screenshot({
      path: `${shots}/${view.name}-${name.replace(/\W+/g, '-')}.jpg`,
      quality: 80,
      type: 'jpeg',
    });
}

/** The battle's own panels against each other (and the screen). */
async function checkBattlePanels(page, view, when) {
  const list = await boxes(page, BATTLE_PANELS);
  for (let i = 0; i < list.length; i++)
    for (let j = i + 1; j < list.length; j++)
      if (list[i].sel !== list[j].sel && overlap(list[i], list[j]) > 4)
        fails.push(`${view.name}: battle ${when}: ${list[i].sel} overlaps ${list[j].sel}`);
  if (shots)
    await page.screenshot({ path: `${shots}/${view.name}-battle-${when}.jpg`, quality: 80, type: 'jpeg' });
}

const S = (page, js) => page.evaluate(`(() => { const s = window.__flow.debugSession; return ${js}; })()`);

async function sailOut(page) {
  await S(page, 's.debug.board()');
  await page.waitForFunction(() => window.__flow.debugSession.debug.state().mode === 'sail', null, {
    timeout: 20_000,
  });
  await page.waitForTimeout(1500);
  await S(page, 's.debug.sailTo(215, -360, 2.2)');
  const t0 = Date.now();
  await page.keyboard.down('KeyW');
  while (Date.now() - t0 < 90_000 && !(await S(page, '!!s.debug.battleRun()?.started')))
    await page.waitForTimeout(250);
  await page.keyboard.up('KeyW');
  return S(page, '!!s.debug.battleRun()?.started');
}

for (const view of VIEWS) {
  const context = await browser.newContext({
    viewport: view.viewport,
    hasTouch: !!view.touch,
    isMobile: !!view.touch,
    reducedMotion: view.reduced ? 'reduce' : 'no-preference',
  });
  const page = await context.newPage();
  collectLogs(page, { types: ['error'], logs });
  await page.goto(`${base}/?debug&tier=${tier}`, { waitUntil: 'load' });
  await page.evaluate(() => localStorage.clear());
  await waitForTitle(page, 120_000);
  await page.evaluate(() => window.__flow.chooseCaptain());
  await page.waitForTimeout(600);
  await page.evaluate(() => window.__flow.newVoyage('woman'));
  const playing = () =>
    page.waitForFunction(() => window.__flow.getState().screen === 'playing', null, { timeout: 180_000 });
  await playing();
  await page.waitForTimeout(1500);
  await S(page, 's.debug.skipArrival()');
  await page.waitForFunction(() => window.__flow.debugSession.debug.state().mode === 'walk', null, {
    timeout: 30_000,
  });
  await page.evaluate((q) => {
    for (const id of q) window.__flow.debugSession.debug.quest(id, 'done');
  }, CH0);
  await passLearningPauses(page);
  await page.waitForTimeout(1500);
  for (const [name, open, close] of CARDS) {
    await page.evaluate(`(${open.toString()})(window.__flow.learn)`);
    await checkCard(page, view, name);
    await page.evaluate(`(${close.toString()})(window.__flow.learn)`);
    await page.waitForTimeout(400);
  }
  if (!opt['no-battle']) {
    if (!(await sailOut(page))) fails.push(`${view.name}: no battle started`);
    else {
      await page
        .waitForSelector('.bh-brief', { timeout: 10_000 })
        .catch(() => fails.push(`${view.name}: no briefing`));
      await checkCard(page, view, 'battle briefing');
      await page.keyboard.press('Enter');
      // The fight: the wave banner, the lookout's calls, the gun rows, the helm hint.
      // A voiced line over the wave's banner (battle 3's crew speak through the fight): a two-line one.
      await page.evaluate(() => {
        const s = document.querySelector('.hud-subtitle');
        if (!s) return;
        s.innerHTML =
          '<span class="hud-speaker">Wingman</span><span>A line long enough to wrap onto a second row, as the crew\'s do in a battle.</span>';
        s.classList.add('show', 'is-text');
      });
      for (const at of [3000, 9000]) {
        await page.waitForTimeout(at === 3000 ? 3000 : 6000);
        await checkBattlePanels(page, view, `fight-${at / 1000}s`);
      }
      await page.evaluate(() => document.querySelector('.hud-subtitle')?.classList.remove('show'));
      // The wave beaten: the bosun's question (a card of the battle's own).
      await S(page, 's.debug.battleRun().battle.debugStrikeAll()');
      const asked = await page
        .waitForFunction(
          () => document.querySelector('.bh')?.getAttribute('data-phase') === 'question',
          null,
          {
            timeout: 40_000,
          },
        )
        .then(() => true)
        .catch(() => false);
      if (!asked) fails.push(`${view.name}: no bosun's question`);
      else {
        await checkCard(page, view, "bosun's question", '.bh-card.show');
        await checkBattlePanels(page, view, 'question');
      }
    }
  }
  await context.close();
}

await browser.close();
const errors = logs.filter((l) => !/favicon/.test(l));
console.log(JSON.stringify({ views: VIEWS.map((v) => v.name), fails, errors: errors.slice(0, 10) }, null, 1));
process.exit(fails.length || errors.length ? 1 : 0);
