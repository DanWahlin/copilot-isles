// The kraken prototype (devpages/kraken.html), for review: a raider at rest, the kraken's tell
// (bubbles and a shadow), its rise beside her, three arms round her hull and foremast, the squeeze,
// the break, the pieces pulled apart and sinking, and the kraken going back under; then a distant
// sighting from your deck (ambient: a group of tentacles far off).
const ready = (page) => page.waitForFunction(() => window.__kraken?.ready, null, { timeout: 240_000 });
const phase = (page) => page.evaluate(() => window.__kraken.stats());

export default {
  id: 'kraken-scene',
  order: 90,
  code: 'Prototype',
  title: 'The Kraken',
  island: 'Open sea · dev page',
  who: 'a raider, and a sighting far off',
  subtitle:
    'The kraken tells, rises, wraps a raider, breaks her apart and goes back under. Then a distant sighting.',
  chapter: 'Prototype for review · not in the game yet',
  titleFrame: 14,

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
    api.mark('tell');
    // The whole scene, to the kraken's last arm going under.
    for (const [name, until] of [
      ['rise', 6.5],
      ['reach', 9.5],
      ['coil', 12.5],
      ['squeeze', 16.2],
      ['break', 19.5],
      ['apart', 22],
      ['sink', 26],
      ['retreat', 31.5],
    ]) {
      await page.waitForFunction((u) => window.__kraken.stats().time >= u, until, { timeout: 60_000 });
      api.mark(name);
    }
    await page.waitForFunction(() => window.__kraken.stats().time >= 34, null, { timeout: 30_000 });
    api.mark('distant sighting');
    await page.evaluate(() => {
      const K = window.__kraken;
      K.restart('sightings');
      K.deckLook(Math.PI / 2, 0.02);
      K.sight('group', 380);
    });
    await page.waitForFunction(() => window.__kraken.stats().sighting, null, { timeout: 10_000 });
    await api.pause(9000);
    const s = await phase(page);
    api.log(
      `sighting ${JSON.stringify(s.sighting?.kind)}; hitches ${JSON.stringify(await page.evaluate(() => window.__kraken.hitches()))}`,
    );
  },
};
