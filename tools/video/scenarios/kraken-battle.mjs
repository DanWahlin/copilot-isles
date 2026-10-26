// The kraken prototype's battle beats (devpages/kraken.html): the raiders' flagship taken under sail
// mid-fight, seen from your ship; a hazard dodge, where the kraken's evidence (bubbles, a shadow, a
// swirl and the danger ring) comes before a slow wind-up and a fast slam, then a sweep, your helmsman
// turning away at the call and both striking just clear of your hull; and a distant sighting from
// your deck (ambient sea life: no fight).
const ready = (page) => page.waitForFunction(() => window.__kraken?.ready, null, { timeout: 240_000 });
const until = (page, s) =>
  page.waitForFunction((u) => window.__kraken.stats().time >= u, s, { timeout: 120_000 });

export default {
  id: 'kraken-battle',
  order: 91,
  code: 'Prototype',
  title: 'The Kraken in Battle',
  island: 'Open sea · dev page',
  who: 'the flagship taken mid-fight, a hazard dodge, a distant sighting',
  subtitle: 'Read the evidence (bubbles, a shadow, a swirl) and turn away before the tentacle strikes.',
  chapter: 'Prototype for review · not in the game yet',
  titleFrame: 22,

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
    await until(page, 41);
    api.mark('hazard dodge');
    await page.evaluate(() => window.__kraken.restart('dodge'));
    await until(page, 25.5);
    const s = await page.evaluate(() => window.__kraken.stats());
    api.log(`last strike ${JSON.stringify(s.strike)}`);
    api.mark('distant sighting');
    await page.evaluate(() => {
      const K = window.__kraken;
      K.restart('sightings');
      K.deckLook(Math.PI / 2, 0.02);
      K.sight('group', 260);
    });
    await page.waitForFunction(() => window.__kraken.stats().sighting, null, { timeout: 10_000 });
    await api.pause(12000);
    api.log(`hitches ${JSON.stringify(await page.evaluate(() => window.__kraken.hitches()))}`);
  },
};
