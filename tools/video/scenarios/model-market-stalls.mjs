// The Model Market at every stall (docs/specs/MODEL-MARKET.md §2): Desmond's booth on Anchorage Cay's
// quay, a difficult bug hired with a Lightweight model (fell short), Retry with a different model (the
// work order opens with nothing chosen, and you pick Powerful yourself: right-sized), then, after a cut,
// Lani's booth on Thousand-Bough's landing with the same purse and the same job done on its board.
import { skipTalk } from '../lib.mjs';
import { ashore, labelsShown } from '../game.mjs';

const stall = (api, id) => api.S((id) => window.__dev.session().debug.puzzle(id)?.state() ?? null, id);
const ANCHORAGE = 'market@anchorage';
const THOUSAND_BOUGH = 'market@thousand-bough';

/** Waits for the keeper's line (if any) to finish, then reads the work order for a moment. */
async function settle(api, ms = 3200) {
  await api.pause(600);
  for (let i = 0; i < 40 && (await api.learn()).dialogue; i++) await api.pause(250);
  await api.pause(ms);
}

/** From a few steps out, walks up to a stall's counter and opens its work order with E. */
async function walkUp(api, id, label) {
  const stand = await api.S((id) => window.__dev.session().debug.puzzle(id).stand(), id);
  await api.walkTo(stand.x, stand.z, { tol: 0.45 });
  await api.face(stand.x + Math.sin(stand.heading) * 3, stand.z + Math.cos(stand.heading) * 3);
  for (let i = 0; i < 30 && (await api.learn()).dialogue; i++) await api.pause(300);
  await api.pause(500);
  for (let i = 0; i < 4 && !(await stall(api, id))?.open; i++) {
    await api.interact(label, { timeout: 4000 });
    await api.pause(900);
  }
}

/** Back to Anchorage by the chart, past its welcome (its cast is the world's, always there). */
async function home(page, api) {
  const q = await api.S(() => window.__dev.session().islandQuay('anchorage'));
  await api.S((q) => window.__dev.session().travel(q.x, q.z, q.heading), q);
  await page.waitForFunction(() => window.__dev.session().island === 'anchorage', null, { timeout: 90_000 });
  await page.waitForFunction(() => !!window.__dev.session().debug.puzzle('market@anchorage'), null, {
    timeout: 60_000,
  });
  await api.pause(1500);
  await api.S(() => window.__dev.session().debug.skipArrival());
  await api.pause(1500);
  await skipTalk(page, 40_000);
}

/**
 * In front of a stall, facing it, past its keeper's hello range (they call out as you come up), on its
 * deck or quay (Lani's has 10 m of deck in front of it).
 */
async function approach(api, id, back = 8) {
  const s = await api.S((id) => window.__dev.session().debug.puzzle(id).stand(), id);
  const out = s.heading + Math.PI;
  await api.teleport(s.x + Math.sin(out) * back, s.z + Math.cos(out) * back, s.heading);
  await api.look(s.heading, 0.12);
}

export default {
  id: 'model-market-stalls',
  order: 4.9,
  code: 'Market',
  title: 'A Model Market stall on every island',
  island: 'Anchorage Cay and Thousand-Bough Isle',
  who: 'with Desmond on the quay and Lani on the landing',
  subtitle:
    'A hard job falls short, and you Retry it by choosing a different model yourself. Your starfish and your jobs go with you to every stall.',
  chapter: 'Course Chapter 01 · Models and Reasoning Effort · Try Again with a Different Model',
  flags: ['meridian', 'thousandbough'],

  async setup(page, api) {
    await labelsShown(api);
    // Starfish to spend, as if a few had been picked up on the way.
    await api.S(() => window.__dev.learn.refundStarfish(9));
    // Thousand-Bough streamed and warmed once off camera, so the cut there doesn't wait on it.
    await ashore(page, api, 'thousand-bough', 'tamsin');
    await approach(api, THOUSAND_BOUGH);
    await api.pause(2500);
    await home(page, api);
    await approach(api, ANCHORAGE);
    await api.pause(2500);
  },

  async play(page, api) {
    await api.pause(800);
    api.mark('Desmond’s stall on the quay');
    await walkUp(api, ANCHORAGE, 'Model Market');
    await api.pause(3500);

    api.mark('a difficult bug with a Lightweight model');
    await api.press('Digit3');
    await api.pause(1800);
    await api.press('Digit2');
    await api.pause(1400);
    await api.press('KeyE');
    await settle(api);

    api.mark('Retry: choose a different model');
    await api.press('KeyR');
    await api.pause(3600);
    await api.press('Digit4');
    await api.pause(2200);
    await api.press('KeyE');
    await settle(api, 4200);
    const anchorage = await stall(api, ANCHORAGE);
    await api.press('KeyE');
    await api.pause(1500);
    // Desmond's goodbye plays out before the cut.
    await api.press('Escape');
    await settle(api, 1200);

    await api.cut(async () => {
      await ashore(page, api, 'thousand-bough', 'tamsin');
      await approach(api, THOUSAND_BOUGH);
      // The arrival's cards and toasts have gone by the time the take comes back.
      await api.pause(7000);
    });
    api.mark('Lani’s stall on Bough Landing: the same purse, the same jobs');
    await walkUp(api, THOUSAND_BOUGH, 'Model Market');
    await api.pause(5500);
    const tb = await stall(api, THOUSAND_BOUGH);
    if (!anchorage || !tb || tb.purse !== anchorage.purse || !tb.done.includes('bug'))
      api.log(`market: Anchorage ${JSON.stringify(anchorage?.purse)} → Thousand-Bough ${JSON.stringify(tb)}`);
    await api.press('Escape');
    await api.pause(2500);
  },
};
