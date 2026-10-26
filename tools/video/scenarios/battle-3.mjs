// Sea battle 3, "Trust the Evidence" (the passage from Thousand-Bough Isle to Keelhaven): Chapters 00-02
// done off camera, the chart to Thousand-Bough, aboard and out toward Keelhaven until the lookout calls
// sails, then the three waves fought with the real controls (the first question answered wrong), the win
// card, and the night passing at sea into Keelhaven's morning.
import { ashore, questsDone } from '../game.mjs';
import { battleScenario } from './battle-1.mjs';

const QUESTS = [
  ...['Q0.2', 'Q0.3', 'Q0.4', 'Q0.5', 'Q0.6', 'Q0.7', 'Q0.8', 'Q0.9', 'Q0.10', 'Q0.11'],
  ...['Q1.1', 'Q1.2', 'Q1.3', 'Q1.4', 'Q1.5', 'Q1.6', 'Q1.7', 'Q1.8', 'Q1.A'],
  ...['Q2.1', 'Q2.2', 'Q2.3', 'Q2.4', 'Q2.5', 'Q2.6', 'Q2.7', 'Q2.8', 'Q2.9', 'Q2.A'],
];

/** The passage's two moorings (`ISLANDS`). */
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
    // The win card's hold, then the night at sea (its dawn veil) into Keelhaven's morning.
    const veil = await api.waitFor(() => !!document.querySelector('.hud-dawn.show'), null, 30_000);
    if (!veil) api.log('no next morning after the win');
    api.mark('next morning');
    await api.waitFor(() => !document.querySelector('.hud-dawn.show'), null, 15_000);
    await api.pause(4000);
  },
});
