// P2.3 The Flag Hoist (Ines, Thousand-Bough): Ines's brief on the four flags, then four orders
// answered with the number keys. The first flag hoisted is the wrong one, so it drops back with
// her reason; then all four go up. Stops as her check (M2.2) opens.
import { questsDone, tb, thousandBoughAshore } from '../game.mjs';

export default {
  id: 'hoist',
  order: 7,
  code: 'P2.3',
  title: 'The Flag Hoist',
  island: 'Thousand-Bough Isle',
  who: 'with Ines on the Signal Deck',
  subtitle:
    'Four flags for the prompt box: @ brings files, # brings issues, / runs commands, & points at another session. Less is more.',
  chapter: 'Course Chapter 02 · Context syntax',
  flags: ['thousandbough'],

  async setup(page, api) {
    await thousandBoughAshore(page, api);
    await questsDone(api, ['Q2.1', 'Q2.2', 'Q2.3', 'Q2.4', 'Q2.5']);
    this.spot = await api.approachSpot('ines', { back: 3 });
    await api.look(this.spot.heading + 0.3, 0.2);
    await api.pause(1500);
  },

  async play(page, api) {
    await api.pause(800);
    await api.talkTo(this.spot);
    let wrong = false;
    let hoisted = 0;
    const t0 = Date.now();
    while (Date.now() - t0 < 240_000) {
      const s = await api.learn();
      if (s.quiz) break;
      const open = await api.S(() => !!document.querySelector('.ci-fh-flags'));
      if (!open) {
        await api.pause(250);
        continue;
      }
      const h = await tb(api, 'hoist');
      if (h.busy || !h.open) {
        await api.pause(250);
        continue;
      }
      // Read Ines's order, then pick a flag.
      await api.pause(2600);
      if (!wrong) {
        wrong = true;
        await api.press('Digit2');
        await api.pause(1500);
        continue;
      }
      await api.press(['Digit1', 'Digit2', 'Digit3', 'Digit4'][h.index]);
      hoisted++;
      await api.pause(1200);
    }
    if (hoisted < 4) api.log(`only ${hoisted} flags hoisted`);
    await api.pause(1200);
  },
};
