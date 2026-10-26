// The Model Market (Gilda's stall on Port Meridian's plaza, docs/specs/MODEL-MARKET.md), as Oren's
// practice (Q1.6 at market): walk across the plaza from the fountain as Gilda calls out, open the work
// order at her counter, then three jobs with the keys: a repo tour with Copilot Fusion (right-sized, at the fair
// price), filterBooks with a Powerful model on High (overspent: High effort is more than a quick look
// needs), and a difficult bug with a Lightweight model (fell short), retried with a different model:
// the work order opens with nothing chosen, and you pick Powerful (right-sized, and Oren's practice is
// done). Ends back at the board.
import { meridianAshore, questsDone } from '../game.mjs';

const market = (api) => api.S(() => window.__dev.session().debug.puzzle('market')?.state() ?? null);

/** Waits for Gilda's line on a result to finish, then reads the work order for a moment. */
async function settle(api, ms = 3800) {
  await api.pause(600);
  for (let i = 0; i < 40 && (await api.learn()).dialogue; i++) await api.pause(250);
  await api.pause(ms);
}

export default {
  id: 'model-market',
  order: 4.8,
  code: 'Market',
  title: 'The Model Market',
  island: 'Port Meridian',
  who: 'with Gilda on the plaza',
  subtitle:
    'Hire a model that fits the job: Copilot Fusion at Standard or your model on its default effort for a quick look; for hard work, a higher Fusion level or a model suited to complex coding.',
  chapter: 'Course Chapter 01 · Models and Reasoning Effort · Try Again with a Different Model',
  flags: ['meridian'],

  async setup(page, api) {
    await meridianAshore(page, api);
    // Oren has taught models and effort and sent you down to practise.
    await questsDone(api, ['Q1.1', 'Q1.2', 'Q1.3', 'Q1.4', 'Q1.5']);
    await api.S(() => window.__dev.session().debug.quest('Q1.6', 'market'));
    // Starfish to spend, as if a few had been picked up on the way.
    await api.S(() => window.__dev.learn.refundStarfish(9));
    this.stand = await api.S(() => window.__dev.session().debug.puzzle('market').stand());
    // On the plaza by the fountain, south of the stall (the stair street's strip is left clear: its
    // walk surface runs under the plaza paving there).
    await api.teleport(674.6, -799.5, 0.2);
    await api.look(0.35, 0.16);
    await api.pause(1500);
  },

  async play(page, api) {
    await api.pause(800);
    // Up to the stall; Gilda calls out on the way.
    await api.walkTo(this.stand.x, this.stand.z, { tol: 0.45 });
    await api.face(
      this.stand.x + Math.sin(this.stand.heading) * 3,
      this.stand.z + Math.cos(this.stand.heading) * 3,
    );
    for (let i = 0; i < 30 && (await api.learn()).dialogue; i++) await api.pause(300);
    await api.pause(600);
    // Any key clears the chart label; then E at the counter.
    for (let i = 0; i < 4 && !(await market(api))?.open; i++) {
      await api.interact('Model Market', { timeout: 4000 });
      await api.pause(900);
    }
    api.mark('the board');
    await api.pause(4200);

    api.mark('a repo tour with Copilot Fusion');
    await api.press('Digit1');
    await api.pause(2600);
    await api.press('Digit1');
    await api.pause(1600);
    await api.press('KeyE');
    await settle(api);

    api.mark('filterBooks with a Powerful model on High');
    await api.press('KeyE');
    await api.pause(1200);
    await api.press('Digit2');
    await api.pause(1600);
    await api.press('Digit4');
    await api.pause(1200);
    await api.press('ArrowRight');
    await api.pause(1400);
    await api.press('KeyE');
    await settle(api);

    api.mark('a difficult bug with a Lightweight model');
    await api.press('KeyE');
    await api.pause(1200);
    await api.press('Digit3');
    await api.pause(1800);
    await api.press('Digit2');
    await api.pause(1400);
    await api.press('KeyE');
    await settle(api);

    api.mark('Retry: choose a different model');
    await api.press('KeyR');
    await api.pause(3000);
    await api.press('Digit4');
    await api.pause(1800);
    await api.press('KeyE');
    await settle(api, 4200);
    await api.press('KeyE');
    await api.pause(2500);
    const s = await market(api);
    if (s && s.done.length < 2) api.log(`market: only ${s.done.join(', ')} done`);
  },
};
