#!/usr/bin/env node
// Plays the menus the way a player does, with real clicks and keys only (no __flow commands; the
// debug state is read just to check the result). Covers mute (title, HUD, and N), settings changes that
// survive a reload, the captain creator's naming, pause-menu screens, quit, Continue, and resume after
// a reload. node tools/usertest.mjs [--webgl] [--base=http://localhost:5301] [--out=/tmp/shots/user]
import { collectLogs, launchChrome, parseFlags, waitForTitle } from './lib/browser.mjs';

const opt = parseFlags();
const base = opt.base || 'http://localhost:5301';
const out = opt.out || '/tmp/shots/user';
const tag = opt.webgl ? 'gl' : 'gpu';
const url = `${base}/?debug${opt.webgl ? '&webgl' : ''}`;

const browser = await launchChrome({ autoplay: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const logs = collectLogs(page);
const results = [];

const ui = () => page.evaluate(() => window.__flow.getState());
const screenIs = (screen, timeout = 90_000) =>
  page.waitForFunction((s) => window.__flow.getState().screen === s, screen, { timeout });
const button = (name) => page.getByRole('button', { name, exact: false });
const shot = (name) => page.screenshot({ path: `${out}-${tag}-${name}.png` });
const check = (name, ok, detail = '') => {
  results.push({ name, ok: !!ok, ...(detail ? { detail } : {}) });
  if (!ok) logs.push(`[usertest] ${name} failed${detail ? ` (${detail})` : ''}`);
};
/** Runs a step so one broken screen is reported without hiding the rest of the run. */
const step = async (name, fn) => {
  try {
    await fn();
  } catch (e) {
    check(name, false, String(e.message ?? e).split('\n')[0]);
  }
};

// A fresh profile: no save, default settings.
await page.goto(url, { waitUntil: 'load' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'load' });
await waitForTitle(page);
await page.waitForTimeout(1200);
await shot('title');

await step('title menu', async () => {
  const labels = await page.$$eval('.ci-menu-list button', (els) => els.map((e) => e.textContent.trim()));
  const want = ['New Voyage', 'Chart', 'Settings', 'Controls', 'Credits'];
  check(
    'title menu',
    want.every((w) => labels.some((l) => l.startsWith(w))) && !labels.some((l) => l.startsWith('Continue')),
    labels.join(' | '),
  );
});

await step('title mute', async () => {
  const sound = page.locator('.ci-title-sound');
  await sound.click();
  const muted = (await ui()).settings.muted && (await sound.getAttribute('aria-pressed')) === 'true';
  await sound.click();
  check('title mute button', muted && !(await ui()).settings.muted);
  await page.keyboard.press('KeyN');
  const byKey = (await ui()).settings.muted;
  await page.keyboard.press('KeyN');
  check('N mutes and unmutes', byKey && !(await ui()).settings.muted);
});

await step('controls and credits', async () => {
  await button('Controls').click();
  await screenIs('controls', 5000);
  await shot('controls');
  await page.keyboard.press('Escape');
  await screenIs('title', 5000);
  await button('Credits').click();
  await screenIs('credits', 5000);
  await shot('credits');
  await page.keyboard.press('Escape');
  await screenIs('title', 5000);
  check('controls and credits open and close', true);
});

await step('settings persist', async () => {
  await button('Settings').click();
  await screenIs('settings', 5000);
  const before = (await ui()).settings;
  await page.getByLabel('Reduced motion').check();
  await page.getByLabel('Subtitle size').selectOption({ index: 2 });
  const music = page.getByLabel('Music');
  await music.focus();
  for (let i = 0; i < 20; i++) await page.keyboard.press('ArrowLeft');
  await shot('settings-changed');
  const after = (await ui()).settings;
  check(
    'settings change',
    after.reducedMotion && after.music < before.music - 0.1 && after.subtitleSize !== before.subtitleSize,
    `music ${before.music} → ${after.music}, size ${before.subtitleSize} → ${after.subtitleSize}`,
  );
  await page.keyboard.press('Escape');
  await screenIs('title', 5000);
  await page.reload({ waitUntil: 'load' });
  await waitForTitle(page);
  const kept = (await ui()).settings;
  check(
    'settings survive a reload',
    kept.reducedMotion === true &&
      Math.abs(kept.music - after.music) < 1e-6 &&
      kept.subtitleSize === after.subtitleSize,
  );
});

await step('captain creator', async () => {
  await button('New Voyage').click();
  await screenIs('captain', 5000);
  const cardTitles = () => page.$$eval('.ci-captain-card > span', (els) => els.map((e) => e.textContent));
  const plain = await cardTitles();
  check(
    'both cards read "Captain"',
    plain.length === 2 && plain.every((t) => t === 'Captain'),
    plain.join(', '),
  );
  await page.getByRole('radio', { name: /long-haired/ }).click();
  const woman = await page.getByRole('radio', { name: /long-haired/ }).getAttribute('aria-checked');
  await page.getByPlaceholder('What should the crew call you?').fill('Morgan');
  const named = await cardTitles();
  check(
    'naming updates both cards',
    woman === 'true' && named.every((t) => t === 'Captain Morgan'),
    named.join(', '),
  );
  await page.getByRole('radio', { name: /bearded/ }).click();
  await shot('captain-named');
  const t0 = Date.now();
  await button('Set sail').click();
  await screenIs('playing');
  results.push({ name: 'voyage load', ok: true, ms: Date.now() - t0 });
  await page.waitForTimeout(2500);
  const s = await ui();
  check(
    'voyage starts as the chosen captain',
    s.captain === 'man' && s.learn.captainName === 'Morgan',
    `${s.captain} · ${s.learn.captainName}`,
  );
  await shot('playing');
});

await step('arrival', async () => {
  // A first landfall: with Reduced motion on (set above) there's no flight, just the island's title
  // card over a letterboxed view, then play.
  const a = await page.evaluate(() => ({
    phase: window.__flow.session.debug.arrival()?.phase,
    card: document.querySelector('.hud-card')?.textContent ?? '',
  }));
  await shot('arrival-card');
  check(
    'arrival shows the island card (no flight with reduced motion)',
    a.phase === 'card' || a.phase === 'done',
    a.phase,
  );
  await page.waitForFunction(() => window.__flow.session.debug.arrival()?.phase === 'done', null, {
    timeout: 10_000,
  });
  check('the card names Anchorage Cay', a.card.includes('Anchorage Cay'), a.card.slice(0, 60));
});

await step('HUD mute', async () => {
  const sound = page.locator('.ci-sound-btn.in-purse');
  await sound.click();
  const muted = (await ui()).settings.muted;
  await sound.click();
  check('HUD mute button', muted && !(await ui()).settings.muted);
});

await step('Wingman welcome', async () => {
  // A fresh voyage: Wingman flies up in front of the captain to introduce himself.
  await page.waitForFunction(() => window.__flow.session.debug.wingman()?.phase === 'hover', null, {
    timeout: 15_000,
  });
  await shot('wingman-welcome');
  check('Wingman flies up to welcome you', true);
  // Listen for a moment, as a player would, before walking off.
  await page.waitForTimeout(1700);
});

await step('walk', async () => {
  // The main entry has no __dev page hooks; the flow's live session carries the same debug state.
  const where = () => page.evaluate(() => window.__flow.session.debug.state());
  const p0 = await where();
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(1600);
  await page.keyboard.up('KeyW');
  await page.waitForTimeout(400);
  const p1 = await where();
  const moved = Math.hypot(p1.x - p0.x, p1.z - p0.z);
  check('W walks the captain', moved > 1.5, `${moved.toFixed(2)} m`);
  const bird = await page.evaluate(() => window.__flow.session.debug.wingman()?.phase);
  check('walking sends Wingman back to the shoulder', bird === 'landing' || bird === 'perched', bird);
});

await step('pause menu', async () => {
  await page.keyboard.press('Escape');
  await screenIs('paused', 5000);
  const eyebrow = await page.locator('.ci-pause').textContent();
  check('pause shows the captain name', eyebrow.includes('Captain Morgan'));
  await shot('paused');
  await button('Chart').click();
  await screenIs('chart', 5000);
  await page.waitForTimeout(700);
  await shot('chart');
  await page.keyboard.press('Escape');
  await screenIs('paused', 5000);
  await button('Controls').click();
  await screenIs('controls', 5000);
  await page.keyboard.press('Escape');
  await screenIs('paused', 5000);
  await button('Logbook').click();
  await page.locator('.ci-logbook').waitFor({ timeout: 5000 });
  await shot('logbook');
  await page.getByRole('button', { name: 'Close (J or Esc)' }).click();
  await page.locator('.ci-logbook').waitFor({ state: 'detached', timeout: 5000 });
  // The game ignores menu keys for a beat after an overlay closes; no player is faster than this.
  await page.waitForTimeout(600);
  check('pause menu screens open and close', true);
});

await step('resume', async () => {
  if ((await ui()).screen !== 'playing') {
    await page.keyboard.press('Escape');
    await screenIs('paused', 5000);
    await button('Resume').click();
  }
  await screenIs('playing', 5000);
  check('resume', true);
});

await step('quit and continue', async () => {
  await page.keyboard.press('Escape');
  await screenIs('paused', 5000);
  await button('Quit to title').click();
  await screenIs('title', 15_000);
  await page.waitForTimeout(1200);
  await shot('title-save');
  const cont = button('Continue');
  check('title offers Continue', (await cont.count()) === 1);
  await cont.click();
  await screenIs('playing');
  await page.waitForTimeout(1500);
  const s = await ui();
  check('Continue restores the captain', s.captain === 'man' && s.learn.captainName === 'Morgan');
});

await step('continue after reload', async () => {
  await page.reload({ waitUntil: 'load' });
  await waitForTitle(page);
  await button('Continue').click();
  await screenIs('playing');
  await page.waitForTimeout(1500);
  const s = await ui();
  check('the save survives a reload', s.captain === 'man' && s.learn.captainName === 'Morgan');
  await shot('continued');
});

await step('travel to Port Meridian', async () => {
  // The chart's archipelago: Port Meridian is open (dev), so its card offers travel there. The
  // first landfall shows the island's card (reduced motion is still on), then play resumes.
  await page.keyboard.press('KeyM');
  await screenIs('chart', 5000);
  await page
    .getByRole('button', { name: /Port Meridian/ })
    .first()
    .click();
  const go = page.getByRole('button', { name: 'Travel to Port Meridian' });
  check('the chart offers travel to Port Meridian', (await go.count()) === 1);
  await go.click();
  await screenIs('playing', 10_000);
  await page.waitForFunction(() => window.__flow.session.island === 'meridian', null, { timeout: 10_000 });
  await page.waitForTimeout(900);
  const card = await page.evaluate(() => document.querySelector('.hud-card.show')?.textContent ?? '');
  await shot('meridian-card');
  check('Port Meridian’s arrival card shows', card.includes('Port Meridian'), card.slice(0, 60));
  await page.waitForFunction(() => window.__flow.session.debug.arrival()?.phase === 'done', null, {
    timeout: 10_000,
  });
  const s = await page.evaluate(() => ({
    st: window.__flow.session.debug.state(),
    tracker: document.querySelector('.ci-tracker-eyebrow')?.textContent ?? null,
    seen: JSON.parse(localStorage.getItem('copilot-isles.progress.v1') ?? '{}').arrivals ?? [],
  }));
  check(
    'ashore on Meridian’s quay with its task list',
    s.st.mode === 'walk' && s.st.y > 2 && s.st.y < 3.5 && !!s.tracker?.startsWith('Port Meridian'),
    `${s.st.x}, ${s.st.y}, ${s.st.z} · ${s.tracker}`,
  );
  check('Meridian’s arrival is saved as seen', s.seen.includes('meridian'), s.seen.join(','));
  await shot('meridian-ashore');
});

await step('continue on Port Meridian', async () => {
  await page.keyboard.press('Escape');
  await screenIs('paused', 5000);
  await button('Quit to title').click();
  await screenIs('title', 15_000);
  const where = await page.evaluate(() => window.__flow.getState().save?.location ?? null);
  check('the title’s Continue card says Port Meridian', where === 'Port Meridian', where);
  await button('Continue').click();
  await screenIs('playing', 90_000);
  await page.waitForTimeout(1500);
  const s = await page.evaluate(() => ({
    island: window.__flow.session.island,
    st: window.__flow.session.debug.state(),
    arrival: window.__flow.session.debug.arrival()?.phase ?? null,
  }));
  check(
    'Continue wakes on Port Meridian, standing on the quay, with no second flyover',
    s.island === 'meridian' && s.st.y > 2 && s.st.y < 3.5 && s.arrival === null,
    `${s.island} · ${s.st.x}, ${s.st.y}, ${s.st.z} · ${s.arrival}`,
  );
  await shot('meridian-continued');
});

await browser.close();
const failed = results.filter((r) => r.ok === false).length;
console.log(
  JSON.stringify({ url, passed: results.length - failed, failed, results, logs: logs.slice(0, 25) }, null, 1),
);
