// P2.2 The Spire twist (Fen, Thousand-Bough): straight after Channel Routing's third round (played
// off camera), two crews' previews collide on the Spire. The wrong fix first, then the right one
// (a second port), and Fen's close with the parallel-sessions and ports cards.
import { skipTalk } from '../lib.mjs';
import { questsDone, tb, thousandBoughAshore } from '../game.mjs';

export default {
  id: 'spire',
  order: 6,
  code: 'P2.2',
  title: 'The Spire Twist',
  island: 'Thousand-Bough Isle',
  who: 'with Fen at the Spire',
  subtitle:
    'Worktrees keep files apart, not ports. Two previews on the same port collide, so the second one needs its own port.',
  chapter: 'Course Chapter 02 · Where a session runs · Two previews collided',
  flags: ['thousandbough'],

  async setup(page, api) {
    await thousandBoughAshore(page, api);
    await questsDone(api, ['Q2.1', 'Q2.2', 'Q2.3', 'Q2.4']);
    const spot = await api.approachSpot('fen', { back: 0.01 });
    await api.walkTo(spot.x, spot.z, { tol: 0.6 });
    await api.press('KeyE');
    // The three rounds, routed through the board's own hooks with the talk between skipped.
    for (let round = 1; round <= 3; round++) {
      for (let k = 0; k < 400; k++) {
        const ready = await api.S(
          (r) =>
            document.querySelector('.ci-cr-eyebrow')?.textContent?.includes(`Round ${r}`) &&
            !document.querySelector('.ci-cr-go')?.disabled,
          round,
        );
        if (ready) break;
        if (await api.S(() => window.__dev.state().dialogue)) await api.S(() => window.__dev.tap('KeyE'));
        await api.pause(250);
      }
      for (let g = 0; g < 40; g++) {
        const w = await tb(api, 'routing.wrong');
        if (!w) break;
        await tb(api, 'routing.turn', w[0], w[1], 1);
        await api.pause(60);
      }
      // Round 3: every channel's dug; each crew goes where its order fits.
      if (round === 3) {
        const best = await tb(api, 'routing.best');
        for (const [i, crew] of ['feature', 'bugfix', 'docs'].entries())
          await tb(api, 'routing.pick', crew, best[i]);
      }
      if (round < 3) {
        await tb(api, 'routing.run');
        await api.pause(1500);
      }
    }
    // Round 3's crews are placed; the run (and everything after) is filmed.
    await skipTalk(page, 3000);
  },

  async play(page, api) {
    await api.pause(1200);
    await api.press('KeyF');
    await api.waitFor(() => !!document.querySelector('.ci-cr-twist'), null, 90_000);
    await api.waitFor(() => !document.querySelector('.ci-cr-choices button')?.disabled, null, 60_000);
    // Read the question and the choices, then the wrong fix first.
    await api.pause(5000);
    await api.press('Digit1');
    await api.pause(1200);
    await api.waitFor(() => !document.querySelector('.ci-cr-choices button')?.disabled, null, 60_000);
    await api.pause(1800);
    await api.click('.ci-cr-choices button[data-choice="port5174"]');
    await api.pause(1500);
    await api.converse({
      until: (s) => s.quests['Q2.5'] === 'done' && !s.dialogue && !s.reveal && !s.banner,
      timeout: 150_000,
    });
    await api.pause(2500);
  },
};
