// The opening, as a new player sees it: the real title screen in a clean profile (no save, no `?auto`
// start), the seagull flying in while the mouse drags the ship round (that first gesture starts the
// music), a look at the Chart (two islands pointed at in turn), New Voyage and a name typed at a human pace, Set sail, Juno's welcome
// in the captain's cabin, the chest opened, the living chart and the dive, and the fly-in to
// Anchorage Cay until the captain stands on the island. Everything on camera is real mouse and
// keyboard input. Juno's lines and the arrival's phases are marked, so an edit (tools/video/reel.mjs)
// can trim them.

/** Each new cabin caption (its text and when it showed), recorded in the page for the marks. */
function watchCaptions() {
  window.__capLog = [];
  let last = '';
  const read = () => {
    const el = document.querySelector('.ci-opening-caption.show .ci-opening-caption-line');
    const text = el?.textContent?.trim() ?? '';
    if (text !== last) {
      last = text;
      window.__capLog.push({ t: performance.timeOrigin + performance.now(), text });
    }
    requestAnimationFrame(read);
  };
  read();
}

/** Moves the mouse in small steps over `ms` (a person's drag, not a jump). */
async function glide(page, from, to, ms, { steps } = {}) {
  const n = steps ?? Math.max(8, Math.round(ms / 25));
  for (let i = 1; i <= n; i++) {
    const k = i / n;
    const e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
    await page.mouse.move(from.x + (to.x - from.x) * e, from.y + (to.y - from.y) * e);
    await page.waitForTimeout(ms / n);
  }
}

/** Glides to an element's centre and clicks it. */
async function clickEl(page, selector, from, ms = 700) {
  const box = await page.locator(selector).first().boundingBox();
  if (!box) throw new Error(`no ${selector}`);
  const to = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await glide(page, from, to, ms);
  await page.waitForTimeout(180);
  await page.mouse.down();
  await page.waitForTimeout(90);
  await page.mouse.up();
  return to;
}

export default {
  id: 'opening',
  order: 0,
  code: 'Opening',
  title: 'A New Voyage',
  island: 'Title screen → Anchorage Cay',
  who: 'with Juno in the captain’s cabin',
  subtitle:
    'From the title screen to your first steps ashore: name your captain, open the chest, and fly in to Anchorage Cay.',
  chapter: 'Course Chapter 00 · Setup',
  titleFrame: 3,
  cursor: true,

  async open(page, { base, tier }) {
    // A fresh browser context has no save and default settings: the title a new player sees.
    await page.goto(`${base}/?tier=${tier}`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__flow?.getState().screen === 'title', null, {
      timeout: 180_000,
    });
    await page.waitForFunction(() => !document.getElementById('loading'), null, { timeout: 30_000 });
    await page.evaluate(watchCaptions);
    // The pointer rests off the menu until the clip starts.
    await page.mouse.move(1, 1);
  },

  async play(page, api) {
    const W = await page.evaluate(() => innerWidth);
    const H = await page.evaluate(() => innerHeight);
    const at = (fx, fy) => ({ x: W * fx, y: H * fy });
    api.mark('title');
    await api.pause(150);

    // Drag the ship round a little: the first press anywhere starts the title's music and sea, so it
    // starts at once (no silent title).
    let p = at(0.62, 0.62);
    await glide(page, at(0.8, 0.85), p, 300);
    await page.mouse.down();
    api.mark('drag');
    await glide(page, p, at(0.44, 0.6), 1500);
    await glide(page, at(0.44, 0.6), at(0.54, 0.64), 900);
    await page.mouse.up();
    p = at(0.54, 0.64);
    // The gull lands on the wordmark.
    await api.pause(2600);

    // The Chart, from the title menu, for a few seconds.
    api.mark('chart');
    p = await clickEl(page, '.ci-menu-list button:has-text("Chart")', p, 800);
    await page.waitForFunction(() => window.__flow.getState().screen === 'chart', null, { timeout: 5000 });
    // Point at two islands in turn, so the detail panel changes: Anchorage Cay, then Thousand-Bough.
    for (const name of ['Anchorage Cay', 'Thousand-Bough']) {
      const box = await page.locator(`.ci-arch-island[aria-label*="${name}"]`).first().boundingBox();
      if (!box) throw new Error(`no ${name} on the Chart`);
      const to = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
      await glide(page, p, to, 750);
      p = to;
      api.mark(`chart ${name}`);
      await api.pause(1500);
    }
    p = await clickEl(page, '.ci-back', p, 700);
    await page.waitForFunction(() => window.__flow.getState().screen === 'title', null, { timeout: 5000 });
    api.mark('chart closed');
    await api.pause(600);

    // New Voyage, the captain's name typed at a human pace, Set sail.
    p = await clickEl(page, '.ci-menu-list button:has-text("New Voyage")', p, 700);
    await page.waitForFunction(() => window.__flow.getState().screen === 'captain', null, {
      timeout: 5000,
    });
    api.mark('captain');
    await api.pause(600);
    p = await clickEl(page, 'input[placeholder="What should the crew call you?"]', p, 700);
    await api.pause(400);
    // The cards add "Captain" themselves, so the name is just "Dan" (they read "Captain Dan").
    await page.keyboard.type('Dan', { delay: 170 });
    api.mark('named');
    await api.pause(1100);
    p = await clickEl(page, '.ci-panel-actions .ci-primary', p, 800);
    api.mark('set sail');
    await glide(page, p, at(0.97, 0.97), 500);

    // The cabin: Juno's welcome plays on its own; the chest waits for you.
    const lockShown = await api.waitFor(
      () => !!document.querySelector('.ci-opening-lock.show'),
      null,
      120_000,
    );
    if (!lockShown) throw new Error('the chest never waited to be opened');
    api.mark('chest waiting');
    // Let Juno's chest line finish before you open it.
    await api.waitFor(() => !document.querySelector('.ci-opening-caption.show'), null, 12_000);
    await api.pause(900);
    await clickEl(page, '.ci-opening-lock.show', at(0.97, 0.97), 900);
    api.mark('chest opened');
    await glide(page, at(0.5, 0.5), at(0.98, 0.98), 400);

    // The chart, the dive, and the fly-in: watch until the captain's on the island.
    let phase = null;
    const t0 = Date.now();
    while (Date.now() - t0 < 180_000) {
      const s = await page.evaluate(() => ({
        screen: window.__flow.getState().screen,
        phase: window.__flow.session?.debug.arrival()?.phase ?? null,
      }));
      const key = `${s.screen}/${s.phase}`;
      if (key !== phase) {
        api.mark(`arrival ${key}`);
        phase = key;
      }
      if (s.screen === 'playing' && s.phase === 'done') break;
      await api.pause(100);
    }
    api.mark('ashore');
    await api.pause(4000);

    // The caption log becomes marks (same epoch clock as the frames).
    const caps = await page.evaluate(() => window.__capLog ?? []);
    let n = 0;
    for (const c of caps) {
      if (!c.text) continue;
      n += 1;
      api.rec?.marks.push({ t: c.t, label: `juno ${n}: ${c.text}` });
    }
    api.rec?.marks.sort((a, b) => a.t - b.t);
  },
};
