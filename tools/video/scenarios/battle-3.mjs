// Sea battle 3, "Trust the Evidence" (the passage from Thousand-Bough Isle to Keelhaven): Chapters 00-02
// done off camera, the chart to Thousand-Bough, aboard and out toward Keelhaven until the lookout calls
// sails, then the three waves fought with the real controls (the first question answered wrong). After
// wave 1 the kraken: the evidence on the sea, the raiders' flagship sailing straight over it, seized.
// Wave 2 with the kraken still there: its tells, your helmsman steering clear (a dodge), a tell on a
// raider's course (a lure: she's taken), and one you hold your course over (a hit). Wave 3 short, the
// kraken going back down, the win card, and the night passing at sea into Keelhaven's morning. About
// three minutes (long stretches trimmed).
import { ashore, questsDone } from '../game.mjs';
import { battleScenario } from './battle-1.mjs';

const QUESTS = [
  ...['Q0.2', 'Q0.3', 'Q0.4', 'Q0.5', 'Q0.6', 'Q0.7', 'Q0.8', 'Q0.9', 'Q0.10', 'Q0.11'],
  ...['Q1.1', 'Q1.2', 'Q1.3', 'Q1.4', 'Q1.5', 'Q1.6', 'Q1.7', 'Q1.8', 'Q1.A'],
  ...['Q2.1', 'Q2.2', 'Q2.3', 'Q2.4', 'Q2.5', 'Q2.6', 'Q2.7', 'Q2.8', 'Q2.9', 'Q2.A'],
];

/** The passage's two moorings (`ISLANDS`). */
/** Battle 3's kraken, as the debug API has it. */
const kraken = (api, js) =>
  api.S((code) => {
    const k = window.__dev.session().debug.battleRun()?.kraken;
    return k ? new Function('k', `return ${code}`)(k) : null;
  }, js);

/** Waits (up to `ms`) for the kraken's log to pass `pred`. */
async function krakenUntil(api, pred, ms) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const l = await kraken(api, '({ ...k.log, stage: k.stage, wrap: k.encounter.phase() })');
    if (l && pred(l)) return l;
    await api.pause(250);
  }
  return null;
}

/** Wave 2's beats: a lure from 8 s (until a raider is taken), your own course held over a tell at 20 s. */
const forced = { lure: -1e9, onYou: 0, helm: 0, marks: new Set() };

const ends = (api) =>
  api.S(async () => {
    const { ISLANDS } = await import('/src/game/islands.ts');
    return { from: ISLANDS['thousand-bough'].mooring, to: ISLANDS.keelhaven.mooring };
  });

export default battleScenario({
  id: 'battle3',
  order: 9,
  code: 'Sea battle 3',
  title: 'Trust the Evidence',
  island: 'Thousand-Bough Isle → Keelhaven',
  subtitle:
    'Three waves of raiders at dusk. Fire when the evidence agrees, answer the bosun between waves, and sail on into the next morning.',
  chapter: 'Questions from Course Chapter 02 · Sessions, Worktrees & Context',
  labelsSeen: false,
  reading: 3200,
  answered: 3500,
  lullCut: { head: 2500, tail: 1000 },
  // Waves 1 and 3 short; wave 2 (the kraken's) long enough to see it work.
  fightCut: (wave) => (wave === 1 ? { head: 32_000, tail: 5_000 } : { head: 8_000, tail: 3_000 }),
  hurry: (wave, ms) => wave !== 1 || ms > 38_000,
  async duringFight(api, wave, ms) {
    if (wave !== 1) return false;
    const l = await kraken(api, '({ ...k.log })');
    if (!l) return false;
    for (const [key, ok] of [
      ['kraken tell', l.tells > 0],
      ['dodge', l.dodged > 0],
      ['lure', l.taken > 0],
      ['hit', l.playerHits > 0],
    ])
      if (ok && !forced.marks.has(key)) {
        forced.marks.add(key);
        api.mark(key);
      }
    // A tell on a raider's course every 9 s from 8 s until one is led over it.
    if (l.taken === 0 && ms > 8_000 && ms - forced.lure > 9_000 && (await kraken(api, 'k.debugTell("lure")')))
      forced.lure = ms;
    if (!forced.onYou && ms > 20_000 && l.playerHits === 0) {
      // Take the helm (a helm key) and hold her course over a tell on it (its arms may all be up:
      // try again each poll for a while).
      if (!forced.helm) {
        await api.hold('KeyW', 200);
        forced.helm = ms;
      }
      if (await kraken(api, 'k.debugTell("onYou")')) forced.onYou = Date.now();
      else if (ms - forced.helm > 15_000) forced.onYou = Date.now();
    }
    return (forced.helm > 0 && !forced.onYou) || (forced.onYou > 0 && Date.now() - forced.onYou < 8_000);
  },
  async afterReward(page, api, wave) {
    if (wave !== 0) return;
    // The kraken's beat, played whole (about 17 s): the cut to the evidence, the flagship close and
    // sailing over it, seized, torn in two and under, and the battle carries on.
    const l = await krakenUntil(api, (k) => k.stage === 'evidence', 10_000);
    if (!l) return api.log('no kraken beat after wave 1');
    api.mark('evidence');
    await krakenUntil(api, (k) => k.stage === 'approach', 10_000);
    api.mark('flagship');
    await krakenUntil(api, (k) => k.wrap === 'grip' || k.wrap === 'squeeze', 20_000);
    api.mark('seized');
    await krakenUntil(api, (k) => k.wrap === 'break', 10_000);
    api.mark('break');
    await krakenUntil(api, (k) => k.stage === 'stay', 20_000);
    api.mark('it stays');
  },
  async board(page, api) {
    await questsDone(api, QUESTS);
    await ashore(page, api, 'thousand-bough', 'tamsin');
    await api.S(() => window.__dev.session().debug.board());
    await page.waitForFunction(() => window.__dev.state().mode === 'sail', null, { timeout: 20_000 });
    await page.waitForFunction(() => !!window.__dev.session().debug.battleRun(), null, { timeout: 60_000 });
    // Out past the harbour, a third of the way across, bow toward Keelhaven.
    const { from, to } = await ends(api);
    const h = Math.atan2(to.x - from.x, to.z - from.z);
    await api.S(
      ([x, z, h]) => window.__dev.session().debug.sailTo(x, z, h),
      [from.x + (to.x - from.x) * 0.3, from.z + (to.z - from.z) * 0.3, h],
    );
    await api.pause(3000);
  },
  toward: async (api) => (await ends(api)).to,
  async afterWin(page, api) {
    forced.lure = -1e9;
    forced.onYou = 0;
    forced.helm = 0;
    forced.marks.clear();
    // The win card's hold, then the night at sea (its dawn veil) into Keelhaven's morning.
    const veil = await api.waitFor(() => !!document.querySelector('.hud-dawn.show'), null, 30_000);
    if (!veil) api.log('no next morning after the win');
    api.mark('next morning');
    await api.waitFor(() => !document.querySelector('.hud-dawn.show'), null, 15_000);
    await api.pause(4000);
  },
});
