// The kraken prototype's battle beats (devpages/kraken.html): the raiders' flagship taken under sail
// mid-fight, with your ship sailing alongside; then a hazard dodge, where the kraken's evidence
// (bubbles, a shadow, a swirl and the danger ring) comes before a slam and a sweep, your helmsman
// turns away at the lookout's call, and both strike just clear of your hull.
const ready = (page) => page.waitForFunction(() => window.__kraken?.ready, null, { timeout: 240_000 });
const until = (page, s) =>
  page.waitForFunction((u) => window.__kraken.stats().time >= u, s, { timeout: 90_000 });

export default {
  id: 'kraken-battle',
  order: 91,
  code: 'Prototype',
  title: 'The Kraken in Battle',
  island: 'Open sea · dev page',
  who: 'the flagship taken mid-fight, then a hazard dodge',
  subtitle: 'Read the evidence (bubbles, a shadow, a swirl) and turn away before the tentacle strikes.',
  chapter: 'Prototype for review · not in the game yet',
  titleFrame: 16,

  async open(page, { base, tier }) {
    await page.goto(`${base}/devpages/kraken.html?shot&wait&scenario=fight&tier=${tier}`, {
      waitUntil: 'load',
    });
    await ready(page);
    await page.waitForTimeout(1500);
  },

  async setup(page) {
    await page.evaluate(() => {
      window.__kraken.unlockAudio();
      window.__kraken.restart('fight');
      window.__kraken.pause();
    });
    await page.waitForTimeout(1200);
  },

  async play(page, api) {
    await page.evaluate(() => window.__kraken.play());
    api.mark('flagship fight');
    await until(page, 28.5);
    api.mark('hazard dodge');
    await page.evaluate(() => window.__kraken.restart('dodge'));
    await until(page, 24);
    const s = await page.evaluate(() => window.__kraken.stats());
    api.log(
      `last strike ${JSON.stringify(s.strike)}; hitches ${JSON.stringify(await page.evaluate(() => window.__kraken.hitches()))}`,
    );
  },
};
