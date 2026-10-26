// The kraken prototype (devpages/kraken.html), for review: a raider at rest; the kraken's evidence
// (bubbles and a great shadow), curled tips breaking the surface beside her, arms rising slowly round
// her one or two at a time, one arcing high over her deck and hanging there, every arm gripping her
// (two arc in late for the final pull), the squeeze, the tear in two, the halves dragged under in a
// burst of foam, the arms curling back under, and (the optional finale) its head and eyes surfacing
// behind the wreck before it sinks. Each beat is marked.
const ready = (page) => page.waitForFunction(() => window.__kraken?.ready, null, { timeout: 240_000 });

export default {
  id: 'kraken-scene',
  order: 90,
  code: 'Prototype',
  title: 'The Kraken',
  island: 'Open sea · dev page',
  who: 'a raider at rest',
  subtitle:
    'Slow and heavy: it tells, rises round her, grips, squeezes, tears her in two and goes back under.',
  chapter: 'Prototype for review · not in the game yet',
  titleFrame: 20,

  async open(page, { base, tier }) {
    await page.goto(`${base}/devpages/kraken.html?shot&wait&scenario=wreck&tier=${tier}`, {
      waitUntil: 'load',
    });
    await ready(page);
    await page.waitForTimeout(1500);
  },

  async setup(page) {
    await page.evaluate(() => {
      window.__kraken.unlockAudio();
      window.__kraken.restart('wreck');
      window.__kraken.pause();
    });
    await page.waitForTimeout(1200);
  },

  async play(page, api) {
    await page.evaluate(() => window.__kraken.play());
    let last = '';
    // Each phase as it starts, to the end of the finale.
    for (;;) {
      const s = await page.evaluate(() => window.__kraken.stats());
      if (s.phase !== last) {
        last = s.phase;
        api.mark(s.phase);
      }
      if (s.time > 48 || (s.time > 30 && s.phase === 'none')) break;
      await api.pause(200);
    }
    api.log(`hitches ${JSON.stringify(await page.evaluate(() => window.__kraken.hitches()))}`);
  },
};
